import { PGlite } from '@electric-sql/pglite'
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite'
import { app } from 'electron'
import { join } from 'node:path'

import * as schema from './db/schema'

let database: PGlite | undefined
let orm: PgliteDatabase<typeof schema> | undefined

/**
 * Open the application database under Electron's per-user data directory.
 * The database is created lazily after app.whenReady(), when app.getPath is available.
 */
export async function initializeDatabase(): Promise<PGlite> {
  if (database) return database

  database = new PGlite(join(app.getPath('userData'), 'database'))
  await database.waitReady
  orm = drizzle({ client: database, schema })

  await database.sql`
    create table if not exists app_metadata (
      key text primary key,
      value text not null
    )
  `

  await database.sql`
    create table if not exists dictionary (
      id bigint generated always as identity primary key,
      name text not null,
      description text,
      status text not null default 'importing'
        check (status in ('pending', 'importing', 'ready', 'error')),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `

  await database.sql`
    alter table dictionary
      add column if not exists status text not null default 'importing'
        check (status in ('pending', 'importing', 'ready', 'error'))
  `

  await database.sql`
    create table if not exists dictionary_file (
      id bigint generated always as identity primary key,
      dictionary_id bigint not null references dictionary(id) on delete cascade,
      file_name text not null,
      file_path text not null unique,
      file_type text not null check (file_type in ('mdx', 'mdd')),
      file_size bigint,
      checksum text,
      format_version text,
      is_encrypted boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `

  await database.sql`
    create index if not exists dictionary_file_dictionary_id_idx
      on dictionary_file(dictionary_id)
  `

  await database.sql`
    create index if not exists dictionary_file_type_idx
      on dictionary_file(file_type)
  `

  return database
}

export async function getDatabase(): Promise<PgliteDatabase<typeof schema>> {
  await initializeDatabase()
  return orm as PgliteDatabase<typeof schema>
}

export async function closeDatabase(): Promise<void> {
  if (!database) return

  await database.close()
  database = undefined
  orm = undefined
}
