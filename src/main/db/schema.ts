import { relations, sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

const isoNow = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`

export const dictionary = sqliteTable(
  'dictionary',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    description: text('description'),
    recordCount: integer('record_count'),
    dictPath: text('dict_path'),
    customCss: text('custom_css').notNull().default(''),
    sortOrder: integer('sort_order').notNull().default(0),
    status: text('status', { enum: ['pending', 'importing', 'ready', 'error'] })
      .notNull()
      .default('importing'),
    createdAt: text('created_at').notNull().default(isoNow),
    updatedAt: text('updated_at').notNull().default(isoNow)
  },
  (table) => [
    index('dictionary_sort_order_idx').on(table.sortOrder),
    index('dictionary_status_idx').on(table.status),
    check(
      'dictionary_status_check',
      sql`${table.status} in ('pending', 'importing', 'ready', 'error')`
    )
  ]
)

export const dictionaryFile = sqliteTable(
  'dictionary_file',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    dictionaryId: integer('dictionary_id')
      .notNull()
      .references(() => dictionary.id, { onDelete: 'cascade' }),
    fileName: text('file_name').notNull(),
    filePath: text('file_path').notNull().unique(),
    fileType: text('file_type', { enum: ['mdx', 'mdd'] }).notNull(),
    fileSize: integer('file_size'),
    checksum: text('checksum'),
    formatVersion: text('format_version'),
    isEncrypted: integer('is_encrypted', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull().default(isoNow),
    updatedAt: text('updated_at').notNull().default(isoNow)
  },
  (table) => [
    index('dictionary_file_dictionary_id_idx').on(table.dictionaryId),
    index('dictionary_file_type_idx').on(table.fileType),
    check('dictionary_file_type_check', sql`${table.fileType} in ('mdx', 'mdd')`)
  ]
)

export const dictionaryEntry = sqliteTable(
  'dictionary_entry',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    dictionaryId: integer('dictionary_id')
      .notNull()
      .references(() => dictionary.id, { onDelete: 'cascade' }),
    dictionaryFileId: integer('dictionary_file_id')
      .notNull()
      .references(() => dictionaryFile.id, { onDelete: 'cascade' }),
    word: text('word').notNull(),
    normalizedWord: text('normalized_word').notNull(),
    recordStartOffset: integer('record_start_offset').notNull(),
    recordEndOffset: integer('record_end_offset').notNull(),
    keyBlockIdx: integer('key_block_idx').notNull()
  },
  (table) => [
    index('dictionary_entry_dictionary_id_idx').on(table.dictionaryId),
    index('dictionary_entry_file_id_idx').on(table.dictionaryFileId),
    index('dictionary_entry_normalized_word_idx').on(table.normalizedWord)
  ]
)

export const queryHistory = sqliteTable(
  'query_history',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    term: text('term').notNull(),
    normalizedTerm: text('normalized_term').notNull().unique(),
    queryCount: integer('query_count').notNull().default(1),
    lastQueriedAt: text('last_queried_at').notNull().default(isoNow)
  },
  (table) => [index('query_history_last_queried_at_idx').on(table.lastQueriedAt)]
)

export const dictionaryRelations = relations(dictionary, ({ many }) => ({
  files: many(dictionaryFile)
}))

export const dictionaryFileRelations = relations(dictionaryFile, ({ one }) => ({
  dictionary: one(dictionary, {
    fields: [dictionaryFile.dictionaryId],
    references: [dictionary.id]
  })
}))

export const dictionaryEntryRelations = relations(dictionaryEntry, ({ one }) => ({
  dictionary: one(dictionary, {
    fields: [dictionaryEntry.dictionaryId],
    references: [dictionary.id]
  }),
  file: one(dictionaryFile, {
    fields: [dictionaryEntry.dictionaryFileId],
    references: [dictionaryFile.id]
  })
}))

export type Dictionary = typeof dictionary.$inferSelect
export type NewDictionary = typeof dictionary.$inferInsert
export type DictionaryFile = typeof dictionaryFile.$inferSelect
export type NewDictionaryFile = typeof dictionaryFile.$inferInsert
export type DictionaryEntry = typeof dictionaryEntry.$inferSelect
export type NewDictionaryEntry = typeof dictionaryEntry.$inferInsert
export type QueryHistory = typeof queryHistory.$inferSelect
