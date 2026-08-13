import { and, asc, desc, eq, inArray, like, sql } from 'drizzle-orm'

import type { BuiltInLexiconEntry } from '../../built-in-lexicon-service'
import type { DictolDatabase } from '../drizzle'
import {
  wordbook,
  wordbookWord,
  type NewWordbookWord,
  type Wordbook,
  type WordbookWord
} from '../schema'

export type WordbookWithWordCount = Wordbook & {
  wordCount: number
}

export type WordbookWordWithWordbook = WordbookWord & {
  wordbookName: string
  isDefault: boolean
}

export type WordbookImportItem = {
  word: string
  lexiconEntry: BuiltInLexiconEntry | null
}

const WORD_IMPORT_BATCH_SIZE = 500

const wordbookWordFields = {
  id: wordbookWord.id,
  wordbookId: wordbookWord.wordbookId,
  word: wordbookWord.word,
  normalizedWord: wordbookWord.normalizedWord,
  star: wordbookWord.star,
  dictionaryWord: wordbookWord.dictionaryWord,
  phonetic: wordbookWord.phonetic,
  definition: wordbookWord.definition,
  translation: wordbookWord.translation,
  ecdictVersion: wordbookWord.ecdictVersion,
  createdAt: wordbookWord.createdAt,
  updatedAt: wordbookWord.updatedAt,
  wordbookName: wordbook.name,
  isDefault: wordbook.isDefault
}

export class WordbookRepository {
  constructor(private readonly db: DictolDatabase) {}

  async listAll(): Promise<WordbookWithWordCount[]> {
    const rows = await this.db
      .select({
        id: wordbook.id,
        name: wordbook.name,
        isDefault: wordbook.isDefault,
        createdAt: wordbook.createdAt,
        updatedAt: wordbook.updatedAt,
        wordCount: sql<number>`count(${wordbookWord.id})`
      })
      .from(wordbook)
      .leftJoin(wordbookWord, eq(wordbookWord.wordbookId, wordbook.id))
      .groupBy(wordbook.id)
      .orderBy(desc(wordbook.isDefault), asc(wordbook.id))

    return rows
  }

  async create(name: string): Promise<Wordbook> {
    const [created] = await this.db.insert(wordbook).values({ name }).returning()
    if (!created) throw new Error('创建生词本失败')
    return created
  }

  async findById(id: number): Promise<Wordbook | undefined> {
    return (await this.db.select().from(wordbook).where(eq(wordbook.id, id)).limit(1))[0]
  }

  async findDefault(): Promise<Wordbook | undefined> {
    return (await this.db.select().from(wordbook).where(eq(wordbook.isDefault, true)).limit(1))[0]
  }

  async listWords(wordbookId?: number): Promise<WordbookWordWithWordbook[]> {
    const query = this.db
      .select(wordbookWordFields)
      .from(wordbookWord)
      .innerJoin(wordbook, eq(wordbookWord.wordbookId, wordbook.id))
      .orderBy(desc(wordbookWord.createdAt))

    const rows = wordbookId
      ? await query.where(eq(wordbookWord.wordbookId, wordbookId))
      : await query

    return rows
  }

  async listWordsByIds(ids: number[]): Promise<WordbookWordWithWordbook[]> {
    if (ids.length === 0) return []
    const rows = await this.db
      .select(wordbookWordFields)
      .from(wordbookWord)
      .innerJoin(wordbook, eq(wordbookWord.wordbookId, wordbook.id))
      .where(inArray(wordbookWord.id, ids))

    return rows.sort((left, right) => ids.indexOf(left.id) - ids.indexOf(right.id))
  }

  async star(
    word: string,
    star = 0,
    lexiconEntry: BuiltInLexiconEntry | null = null
  ): Promise<WordbookWord> {
    const trimmed = word.trim()
    const normalizedWord = trimmed.toLocaleLowerCase()
    const defaultWordbook = await this.findDefault()
    if (!defaultWordbook) throw new Error('默认生词本不存在')

    const now = new Date().toISOString()
    const lexiconValues = lexiconEntry
      ? {
          dictionaryWord: lexiconEntry.word,
          phonetic: lexiconEntry.phonetic,
          definition: lexiconEntry.definition,
          translation: lexiconEntry.translation,
          ecdictVersion: lexiconEntry.version
        }
      : {}
    const [saved] = await this.db
      .insert(wordbookWord)
      .values({
        wordbookId: defaultWordbook.id,
        word: trimmed,
        normalizedWord,
        star,
        createdAt: now,
        updatedAt: now,
        ...lexiconValues
      })
      .onConflictDoUpdate({
        target: wordbookWord.normalizedWord,
        set: {
          star: star,
          word: trimmed,
          updatedAt: now,
          ...lexiconValues
        }
      })
      .returning()

    if (!saved) throw new Error('添加单词失败')
    return saved
  }

  async importWords(wordbookId: number, items: WordbookImportItem[]): Promise<void> {
    if (items.length === 0) return

    const now = new Date().toISOString()
    const matchedRows: NewWordbookWord[] = []
    const unmatchedRows: NewWordbookWord[] = []

    for (const { word, lexiconEntry } of items) {
      const trimmed = word.trim()
      const row: NewWordbookWord = {
        wordbookId,
        word: trimmed,
        normalizedWord: trimmed.toLocaleLowerCase(),
        star: 3,
        createdAt: now,
        updatedAt: now,
        ...(lexiconEntry
          ? {
              dictionaryWord: lexiconEntry.word,
              phonetic: lexiconEntry.phonetic,
              definition: lexiconEntry.definition,
              translation: lexiconEntry.translation,
              ecdictVersion: lexiconEntry.version
            }
          : {})
      }

      if (lexiconEntry) matchedRows.push(row)
      else unmatchedRows.push(row)
    }

    if (matchedRows.length > 0) {
      for (const rows of splitIntoBatches(matchedRows, WORD_IMPORT_BATCH_SIZE)) {
        await this.db
          .insert(wordbookWord)
          .values(rows)
          .onConflictDoUpdate({
            target: wordbookWord.normalizedWord,
            set: {
              wordbookId,
              word: sql`excluded.word`,
              dictionaryWord: sql`excluded.dictionary_word`,
              phonetic: sql`excluded.phonetic`,
              definition: sql`excluded.definition`,
              translation: sql`excluded.translation`,
              ecdictVersion: sql`excluded.ecdict_version`,
              updatedAt: now
            }
          })
      }
    }

    if (unmatchedRows.length > 0) {
      for (const rows of splitIntoBatches(unmatchedRows, WORD_IMPORT_BATCH_SIZE)) {
        await this.db
          .insert(wordbookWord)
          .values(rows)
          .onConflictDoUpdate({
            target: wordbookWord.normalizedWord,
            set: {
              wordbookId,
              word: sql`excluded.word`,
              updatedAt: now
            }
          })
      }
    }
  }

  async moveWords(ids: number[], destinationWordbookId: number): Promise<void> {
    if (ids.length === 0) return
    await this.db
      .update(wordbookWord)
      .set({ wordbookId: destinationWordbookId, updatedAt: new Date().toISOString() })
      .where(inArray(wordbookWord.id, ids))
  }

  async isStarred(word: string): Promise<boolean> {
    const normalizedWord = word.trim().toLocaleLowerCase()
    const [row] = await this.db
      .select({ id: wordbookWord.id })
      .from(wordbookWord)
      .where(eq(wordbookWord.normalizedWord, normalizedWord))
      .limit(1)
    return row !== undefined
  }

  async unStar(word: string): Promise<void> {
    const normalizedWord = word.trim().toLocaleLowerCase()
    await this.db.delete(wordbookWord).where(eq(wordbookWord.normalizedWord, normalizedWord))
  }

  async toggleStar(word: string): Promise<void> {
    const starred = await this.isStarred(word)
    if (starred) {
      await this.unStar(word)
    } else {
      await this.star(word, 3)
    }
  }

  async deleteById(id: number): Promise<void> {
    // cascade-deletes linked words via FK onDelete
    await this.db.delete(wordbook).where(eq(wordbook.id, id))
  }

  async rename(id: number, name: string): Promise<Wordbook> {
    const normalizedName = name.trim()
    if (!normalizedName) throw new Error('生词本名称不能为空')
    if (normalizedName.length > 100) throw new Error('生词本名称不能超过 100 个字符')

    const [updated] = await this.db
      .update(wordbook)
      .set({ name: normalizedName, updatedAt: new Date().toISOString() })
      .where(eq(wordbook.id, id))
      .returning()
    if (!updated) throw new Error('生词本不存在')
    return updated
  }

  async listWordsPaginated(
    wordbookId?: number,
    page = 1,
    pageSize = 25
  ): Promise<{ items: WordbookWordWithWordbook[]; total: number }> {
    const safePage = Math.max(1, Math.trunc(page))
    const safeSize = Math.min(100, Math.max(1, Math.trunc(pageSize)))
    const offset = (safePage - 1) * safeSize

    const base = this.db
      .select(wordbookWordFields)
      .from(wordbookWord)
      .innerJoin(wordbook, eq(wordbookWord.wordbookId, wordbook.id))

    const target = wordbookId ? base.where(eq(wordbookWord.wordbookId, wordbookId)) : base

    const countQuery = this.db
      .select({ count: sql<number>`count(*)` })
      .from(wordbookWord)
      .innerJoin(wordbook, eq(wordbookWord.wordbookId, wordbook.id))

    const [countRow] = wordbookId
      ? await countQuery.where(eq(wordbookWord.wordbookId, wordbookId))
      : await countQuery

    const items = await target.orderBy(desc(wordbookWord.createdAt)).limit(safeSize).offset(offset)

    return { items, total: countRow?.count ?? 0 }
  }

  async filterWords(
    keyword: string,
    wordbookId?: number,
    page = 1,
    pageSize = 25
  ): Promise<{ items: WordbookWordWithWordbook[]; total: number }> {
    const safePage = Math.max(1, Math.trunc(page))
    const safeSize = Math.min(100, Math.max(1, Math.trunc(pageSize)))
    const offset = (safePage - 1) * safeSize
    const pattern = `%${keyword}%`

    const conditions = [like(wordbookWord.word, pattern)]
    if (wordbookId !== undefined) {
      conditions.push(eq(wordbookWord.wordbookId, wordbookId))
    }
    const whereClause = and(...conditions)

    const [countRow] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(wordbookWord)
      .innerJoin(wordbook, eq(wordbookWord.wordbookId, wordbook.id))
      .where(whereClause)

    const items = await this.db
      .select(wordbookWordFields)
      .from(wordbookWord)
      .innerJoin(wordbook, eq(wordbookWord.wordbookId, wordbook.id))
      .where(whereClause)
      .orderBy(desc(wordbookWord.createdAt))
      .limit(safeSize)
      .offset(offset)

    return { items, total: countRow?.count ?? 0 }
  }

  async updateStar(word: string, star: number): Promise<void> {
    if (star < 0 || star > 5) throw new Error('星级必须在 0 到 5 之间')
    const normalizedWord = word.trim().toLocaleLowerCase()
    await this.db
      .update(wordbookWord)
      .set({ star, updatedAt: new Date().toISOString() })
      .where(eq(wordbookWord.normalizedWord, normalizedWord))
  }
}

function* splitIntoBatches<T>(items: T[], size: number): Generator<T[]> {
  for (let index = 0; index < items.length; index += size) {
    yield items.slice(index, index + size)
  }
}
