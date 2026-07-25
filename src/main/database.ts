import BetterSqlite3, { type Database as SqliteDatabase } from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { app } from 'electron'
import { join } from 'node:path'

import * as schema from './db/schema'

export type DictolDatabase = BetterSQLite3Database<typeof schema>

let client: SqliteDatabase | undefined
let orm: DictolDatabase | undefined
let initializationPromise: Promise<SqliteDatabase> | undefined

export function getDatabasePath(): string {
  return join(app.getPath('userData'), 'dictol.sqlite')
}

/** Opens a connection and applies the settings required by every main/worker connection. */
export function openDatabaseConnection(databasePath: string): SqliteDatabase {
  const connection = new BetterSqlite3(databasePath)
  connection.pragma('journal_mode = WAL')
  connection.pragma('synchronous = NORMAL')
  connection.pragma('busy_timeout = 5000')
  connection.pragma('foreign_keys = ON')
  connection.pragma('temp_store = MEMORY')
  return connection
}

export function initializeDatabase(): Promise<SqliteDatabase> {
  if (client && orm) return Promise.resolve(client)
  if (initializationPromise) return initializationPromise

  initializationPromise = Promise.resolve().then(() => {
    const connection = openDatabaseConnection(getDatabasePath())
    try {
      createSchema(connection)
      client = connection
      orm = drizzle(connection, { schema })
      return connection
    } catch (error) {
      connection.close()
      throw error
    }
  })

  return initializationPromise.finally(() => {
    initializationPromise = undefined
  })
}

function createSchema(connection: SqliteDatabase): void {
  connection.exec(`
    create table if not exists app_metadata (
      key text primary key,
      value text not null
    );

    create table if not exists dictionary (
      id integer primary key autoincrement,
      name text not null,
      description text,
      record_count integer,
      dict_path text,
      custom_css text not null default '',
      sort_order integer not null default 0,
      status text not null default 'importing'
        check (status in ('pending', 'importing', 'ready', 'error')),
      created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    create table if not exists dictionary_file (
      id integer primary key autoincrement,
      dictionary_id integer not null references dictionary(id) on delete cascade,
      file_name text not null,
      file_path text not null unique,
      file_type text not null check (file_type in ('mdx', 'mdd')),
      file_size integer,
      checksum text,
      format_version text,
      is_encrypted integer not null default 0,
      created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    create index if not exists dictionary_file_dictionary_id_idx
      on dictionary_file(dictionary_id);
    create index if not exists dictionary_file_type_idx on dictionary_file(file_type);

    create table if not exists dictionary_entry (
      id integer primary key autoincrement,
      dictionary_id integer not null references dictionary(id) on delete cascade,
      dictionary_file_id integer not null references dictionary_file(id) on delete cascade,
      word text not null,
      normalized_word text not null,
      record_start_offset integer not null,
      record_end_offset integer not null,
      key_block_idx integer not null
    );

    create index if not exists dictionary_entry_dictionary_id_idx
      on dictionary_entry(dictionary_id);
    create index if not exists dictionary_entry_file_id_idx
      on dictionary_entry(dictionary_file_id);
    create index if not exists dictionary_entry_normalized_word_idx
      on dictionary_entry(normalized_word);

  `)
  migrateDictionaryCustomization(connection)
  migrateDictionaryOrder(connection)
  migrateQueryHistory(connection)
}

function migrateDictionaryCustomization(connection: SqliteDatabase): void {
  const columns = connection.prepare("pragma table_info('dictionary')").all() as Array<{
    name: string
  }>
  if (!columns.some((column) => column.name === 'custom_css')) {
    connection.exec("alter table dictionary add column custom_css text not null default ''")
  }
}

function migrateDictionaryOrder(connection: SqliteDatabase): void {
  const columns = connection.prepare("pragma table_info('dictionary')").all() as Array<{
    name: string
  }>
  if (!columns.some((column) => column.name === 'sort_order')) {
    connection.exec(`
      alter table dictionary add column sort_order integer not null default 0;
      update dictionary
      set sort_order = (
        select count(*)
        from dictionary as other
        where other.created_at > dictionary.created_at
           or (other.created_at = dictionary.created_at and other.id > dictionary.id)
      );
    `)
  }

  connection.exec(`
    create index if not exists dictionary_sort_order_idx on dictionary(sort_order);
    create index if not exists dictionary_status_idx on dictionary(status);
  `)
}

function migrateQueryHistory(connection: SqliteDatabase): void {
  const columns = connection.prepare("pragma table_info('query_history')").all() as Array<{
    name: string
  }>
  if (columns.length > 0 && !columns.some((column) => column.name === 'last_queried_at')) {
    const storesEntryId = columns.some((column) => column.name === 'dictionary_entry_id')
    connection.transaction(() => {
      connection.exec(`
        create table query_history_next (
          id integer primary key autoincrement,
          term text not null,
          normalized_term text not null unique,
          query_count integer not null default 1,
          last_queried_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
      `)
      if (storesEntryId) {
        connection.exec(`
          insert or ignore into query_history_next
            (term, normalized_term, query_count, last_queried_at)
          select de.word, lower(de.word), 1, max(h.queried_at)
          from query_history h
          inner join dictionary_entry de on de.id = h.dictionary_entry_id
          group by lower(de.word);
        `)
      } else {
        connection.exec(`
          insert or ignore into query_history_next
            (term, normalized_term, query_count, last_queried_at)
          select term, normalized_term, 1, queried_at
          from query_history;
        `)
      }
      connection.exec(`
          drop table query_history;
          alter table query_history_next rename to query_history;
        `)
    })()
  }

  connection.exec(`
    create table if not exists query_history (
      id integer primary key autoincrement,
      term text not null,
      normalized_term text not null unique,
      query_count integer not null default 1,
      last_queried_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    create index if not exists query_history_last_queried_at_idx
      on query_history(last_queried_at);
  `)
}

export async function getDatabase(): Promise<DictolDatabase> {
  await initializeDatabase()
  return orm as DictolDatabase
}

export async function closeDatabase(): Promise<void> {
  if (initializationPromise) await initializationPromise.catch(() => undefined)
  if (!client) return

  const connection = client
  client = undefined
  orm = undefined
  connection.close()
}
