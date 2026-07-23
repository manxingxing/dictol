import { relations, sql } from 'drizzle-orm'
import { bigint, boolean, check, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const dictionary = pgTable(
  'dictionary',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    recordCount: bigint('record_count', { mode: 'bigint' }),
    dictPath: text('dict_path'),
    status: text('status', {
      enum: ['pending', 'importing', 'ready', 'error']
    })
      .notNull()
      .default('importing'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow()
  },
  (table) => [
    index('dictionary_status_idx').on(table.status),
    check(
      'dictionary_status_check',
      sql`${table.status} in ('pending', 'importing', 'ready', 'error')`
    )
  ]
)

export const dictionaryFile = pgTable(
  'dictionary_file',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    dictionaryId: bigint('dictionary_id', { mode: 'number' })
      .notNull()
      .references(() => dictionary.id, { onDelete: 'cascade' }),
    fileName: text('file_name').notNull(),
    filePath: text('file_path').notNull().unique(),
    fileType: text('file_type', { enum: ['mdx', 'mdd'] }).notNull(),
    fileSize: bigint('file_size', { mode: 'number' }),
    checksum: text('checksum'),
    formatVersion: text('format_version'),
    isEncrypted: boolean('is_encrypted').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow()
  },
  (table) => [
    index('dictionary_file_dictionary_id_idx').on(table.dictionaryId),
    check('dictionary_file_type_check', sql`${table.fileType} in ('mdx', 'mdd')`)
  ]
)

export const dictionaryEntry = pgTable(
  'dictionary_entry',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    dictionaryId: bigint('dictionary_id', { mode: 'number' })
      .notNull()
      .references(() => dictionary.id, { onDelete: 'cascade' }),
    dictionaryFileId: bigint('dictionary_file_id', { mode: 'number' })
      .notNull()
      .references(() => dictionaryFile.id, { onDelete: 'cascade' }),
    word: text('word').notNull(),
    normalizedWord: text('normalized_word').notNull(),
    recordStartOffset: bigint('record_start_offset', { mode: 'bigint' }).notNull(),
    recordEndOffset: bigint('record_end_offset', { mode: 'bigint' }).notNull(),
    keyBlockIdx: bigint('key_block_idx', { mode: 'number' }).notNull()
  },
  (table) => [
    index('dictionary_entry_dictionary_id_idx').on(table.dictionaryId),
    index('dictionary_entry_file_id_idx').on(table.dictionaryFileId),
    index('dictionary_entry_normalized_word_idx').on(table.normalizedWord)
  ]
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
