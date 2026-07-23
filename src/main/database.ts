import { PGlite } from '@electric-sql/pglite'
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite'
import { app } from 'electron'
import { dirname, join } from 'node:path'

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
      record_count bigint,
      dict_path text,
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
    alter table dictionary
      add column if not exists dict_path text
  `

  await database.sql`
    alter table dictionary
      add column if not exists record_count bigint
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

  const dictionariesWithoutPath = await database.query<{
    id: string
    file_path: string | null
  }>(`
    select d.id::text as id, min(df.file_path) as file_path
    from dictionary d
    left join dictionary_file df on df.dictionary_id = d.id
    where d.dict_path is null
    group by d.id
  `)
  for (const row of dictionariesWithoutPath.rows) {
    if (!row.file_path) continue
    await database.query('update dictionary set dict_path = $1 where id = $2', [
      dirname(row.file_path),
      row.id
    ])
  }

  await database.sql`
    create table if not exists dictionary_entry (
      id bigint generated always as identity primary key,
      dictionary_id bigint not null references dictionary(id) on delete cascade,
      dictionary_file_id bigint not null references dictionary_file(id) on delete cascade,
      word text not null,
      normalized_word text not null,
      record_start_offset bigint not null,
      record_end_offset bigint not null,
      key_block_idx bigint not null
    )
  `

  await database.sql`
    create index if not exists dictionary_entry_dictionary_id_idx
      on dictionary_entry(dictionary_id)
  `

  await database.sql`
    create index if not exists dictionary_entry_file_id_idx
      on dictionary_entry(dictionary_file_id)
  `

  await database.sql`
    create index if not exists dictionary_entry_normalized_word_idx
      on dictionary_entry(normalized_word)
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
