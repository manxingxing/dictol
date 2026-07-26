import { app } from 'electron'
import { join } from 'node:path'
import BetterSqlite3, { type Database as SqliteDatabase } from 'better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'

import * as schema from './schema'

export type DictolDatabase = BetterSQLite3Database<typeof schema>

export function getDatabasePath(): string {
  return join(app.getPath('userData'), 'dictol.sqlite')
}

export function getMigrationsPath(): string {
  return process.env.DICTOL_MIGRATIONS_PATH ?? join(app.getAppPath(), 'drizzle')
}

export function createDBConnection(databasePath: string): SqliteDatabase {
  const connection = new BetterSqlite3(databasePath)
  connection.pragma('journal_mode = WAL')
  connection.pragma('synchronous = NORMAL')
  connection.pragma('busy_timeout = 5000')
  connection.pragma('foreign_keys = ON')
  connection.pragma('temp_store = MEMORY')
  return connection
}

export type DictolDB = {
  db: SqliteDatabase
  orm: DictolDatabase
}

export function initDrizzleDB(database?: SqliteDatabase): DictolDB {
  const connection: SqliteDatabase = database ?? createDBConnection(getDatabasePath())

  try {
    const orm = drizzle(connection, { schema })
    migrate(orm, { migrationsFolder: getMigrationsPath() })
    return { db: connection, orm }
  } catch (error) {
    connection.close()
    throw error
  }
}

/** Opens an independent Drizzle connection without running migrations. */
export function openDrizzleDB(databasePath: string): DictolDB {
  const connection = createDBConnection(databasePath)
  return { db: connection, orm: drizzle(connection, { schema }) }
}

let db: SqliteDatabase | undefined
let orm: DictolDatabase | undefined

export function getDB(): SqliteDatabase {
  if (db) return db

  const { db: database, orm: drizzleObj } = initDrizzleDB()
  db = database
  orm = drizzleObj

  return db
}

export function getOrm(): DictolDatabase {
  if (orm) return orm

  const { db: database, orm: drizzleObj } = initDrizzleDB()
  db = database
  orm = drizzleObj

  return orm
}

export function closeDB(): void {
  if (!db) return
  db.close()
  db = undefined
  orm = undefined
}
