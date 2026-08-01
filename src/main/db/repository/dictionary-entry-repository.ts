import { and, asc, count, eq, exists, gte, inArray, lt, sql } from 'drizzle-orm'
import { DictolDatabase } from '../drizzle'
import { dictionary, dictionaryEntry, dictionaryFile } from '../schema'
import type { NewDictionaryEntry } from '../schema'

export type { DictionaryEntry } from '../schema'

/** search 方法的返回结构 */
export type EntrySearchResult = {
  normalizedWord: string
  word: string
  dictionaryCount: number
}

/** lookup 方法的返回结构 */
export type EntryLookupMatch = {
  entryId: string
  dictionaryId: string
  dictionaryName: string
}

export type EntryLookupGroup = {
  normalizedWord: string
  word: string
  dictionaries: EntryLookupMatch[]
}

/** lookupByNormalizedWords 返回的单行 */
export type EntryLookupRow = {
  normalizedWord: string
  entryId: number
  dictionaryId: number
  dictionaryName: string
}

/** findEntryContent 返回的条目内容 */
export type EntryContent = {
  id: number
  word: string
  dictionaryId: number
  dictionaryName: string
  customCss: string
  filePath: string
  keyBlockIdx: number
  recordStartOffset: number
  recordEndOffset: number
}

export type FirstReadyEntryLookup = {
  hasReadyDictionary: boolean
  entry: EntryContent | null
}

export class DictionaryEntryRepository {
  private db: DictolDatabase

  constructor(db: DictolDatabase) {
    this.db = db
  }

  /** 使用一条批量 INSERT 写入一批词条。 */
  async insertBatch(entries: NewDictionaryEntry[]): Promise<void> {
    if (entries.length === 0) return
    await this.db.insert(dictionaryEntry).values(entries)
  }

  /** 前缀搜索词条：在 ready 词典中查 normalizedWord 前缀匹配，排除含 @/#/_ 的条目 */
  async searchByPrefix(prefix: string, limit = 50): Promise<EntrySearchResult[]> {
    const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100)
    const upperBound = `${prefix}\u{10ffff}`
    const belongsToReadyDictionary = this.db
      .select({ id: dictionary.id })
      .from(dictionary)
      .where(and(eq(dictionary.id, dictionaryEntry.dictionaryId), eq(dictionary.status, 'ready')))

    const rows = await this.db
      .select({
        normalizedWord: dictionaryEntry.normalizedWord,
        word: sql<string>`min(${dictionaryEntry.word})`.as('word'),
        dictionaryCount: sql<number>`count(distinct ${dictionaryEntry.dictionaryId})`.as(
          'dictionaryCount'
        )
      })
      .from(dictionaryEntry)
      .where(
        and(
          exists(belongsToReadyDictionary),
          gte(dictionaryEntry.normalizedWord, prefix),
          lt(dictionaryEntry.normalizedWord, upperBound),
          sql`instr(${dictionaryEntry.word}, '@') = 0`,
          sql`instr(${dictionaryEntry.word}, '#') = 0`,
          sql`instr(${dictionaryEntry.word}, '_') = 0`
        )
      )
      .groupBy(dictionaryEntry.normalizedWord)
      .orderBy(asc(dictionaryEntry.normalizedWord))
      .limit(safeLimit)

    return rows
  }

  /** 精确匹配 normalizedWord */
  async findByNormalizedWord(
    normalizedWord: string
  ): Promise<Pick<EntryLookupGroup, 'normalizedWord' | 'word'> | undefined> {
    const [row] = await this.db
      .select({
        normalizedWord: dictionaryEntry.normalizedWord,
        word: sql<string>`min(${dictionaryEntry.word})`.as('word')
      })
      .from(dictionaryEntry)
      .innerJoin(dictionary, eq(dictionary.id, dictionaryEntry.dictionaryId))
      .where(
        and(eq(dictionary.status, 'ready'), eq(dictionaryEntry.normalizedWord, normalizedWord))
      )
      .groupBy(dictionaryEntry.normalizedWord)
      .limit(1)

    return row
  }

  /** 按 normalizedWord 列表批量查出各词典中的匹配 */
  async lookupByNormalizedWords(normalizedWords: string[]): Promise<EntryLookupRow[]> {
    if (normalizedWords.length === 0) return []

    return this.db
      .select({
        normalizedWord: dictionaryEntry.normalizedWord,
        entryId: sql<number>`min(${dictionaryEntry.id})`.as('entryId'),
        dictionaryId: dictionary.id,
        dictionaryName: dictionary.name
      })
      .from(dictionaryEntry)
      .innerJoin(dictionary, eq(dictionary.id, dictionaryEntry.dictionaryId))
      .where(
        and(
          eq(dictionary.status, 'ready'),
          inArray(dictionaryEntry.normalizedWord, normalizedWords)
        )
      )
      .groupBy(dictionaryEntry.normalizedWord, dictionary.id, dictionary.name)
      .orderBy(asc(dictionaryEntry.normalizedWord), asc(dictionary.sortOrder), asc(dictionary.id))
  }

  /** 根据 entryId 查询完整条目信息（含词典名、CSS、文件路径&偏移量） */
  async findEntryContent(entryId: number): Promise<EntryContent | undefined> {
    const [row] = await this.db
      .select({
        id: dictionaryEntry.id,
        word: dictionaryEntry.word,
        dictionaryId: dictionaryEntry.dictionaryId,
        dictionaryName: dictionary.name,
        customCss: dictionary.customCss,
        filePath: dictionaryFile.filePath,
        keyBlockIdx: dictionaryEntry.keyBlockIdx,
        recordStartOffset: dictionaryEntry.recordStartOffset,
        recordEndOffset: dictionaryEntry.recordEndOffset
      })
      .from(dictionaryEntry)
      .innerJoin(dictionary, eq(dictionary.id, dictionaryEntry.dictionaryId))
      .innerJoin(dictionaryFile, eq(dictionaryFile.id, dictionaryEntry.dictionaryFileId))
      .where(
        and(
          eq(dictionaryEntry.id, entryId),
          eq(dictionary.status, 'ready'),
          eq(dictionaryFile.fileType, 'mdx')
        )
      )
      .limit(1)

    return row
  }

  /**
   * 选词查询专用：用一条 SQL 区分无可用词典/无匹配，并按词典顺序返回首个匹配的完整记录。
   */
  async findFirstReadyEntryContent(normalizedWord: string): Promise<FirstReadyEntryLookup> {
    const [row] = await this.db
      .select({
        readyDictionaryId: dictionary.id,
        id: dictionaryEntry.id,
        word: dictionaryEntry.word,
        dictionaryId: dictionaryEntry.dictionaryId,
        dictionaryName: dictionary.name,
        customCss: dictionary.customCss,
        filePath: dictionaryFile.filePath,
        keyBlockIdx: dictionaryEntry.keyBlockIdx,
        recordStartOffset: dictionaryEntry.recordStartOffset,
        recordEndOffset: dictionaryEntry.recordEndOffset
      })
      .from(dictionary)
      .leftJoin(
        dictionaryEntry,
        and(
          eq(dictionaryEntry.dictionaryId, dictionary.id),
          eq(dictionaryEntry.normalizedWord, normalizedWord)
        )
      )
      .leftJoin(
        dictionaryFile,
        and(
          eq(dictionaryFile.id, dictionaryEntry.dictionaryFileId),
          eq(dictionaryFile.fileType, 'mdx')
        )
      )
      .where(eq(dictionary.status, 'ready'))
      .orderBy(
        sql`case when ${dictionaryEntry.id} is null then 1 else 0 end`,
        asc(dictionary.sortOrder),
        asc(dictionary.id),
        asc(dictionaryEntry.id)
      )
      .limit(1)

    if (!row) return { hasReadyDictionary: false, entry: null }
    if (
      row.id === null ||
      row.word === null ||
      row.dictionaryId === null ||
      row.filePath === null ||
      row.keyBlockIdx === null ||
      row.recordStartOffset === null ||
      row.recordEndOffset === null
    ) {
      return { hasReadyDictionary: true, entry: null }
    }

    return {
      hasReadyDictionary: true,
      entry: {
        id: row.id,
        word: row.word,
        dictionaryId: row.dictionaryId,
        dictionaryName: row.dictionaryName,
        customCss: row.customCss,
        filePath: row.filePath,
        keyBlockIdx: row.keyBlockIdx,
        recordStartOffset: row.recordStartOffset,
        recordEndOffset: row.recordEndOffset
      }
    }
  }

  /** 根据 entryId 查出所属词典 ID（需 ready） */
  async findDictionaryIdByEntryId(entryId: number): Promise<number | undefined> {
    const [row] = await this.db
      .select({ dictionaryId: dictionaryEntry.dictionaryId })
      .from(dictionaryEntry)
      .innerJoin(dictionary, eq(dictionary.id, dictionaryEntry.dictionaryId))
      .where(and(eq(dictionaryEntry.id, entryId), eq(dictionary.status, 'ready')))
      .limit(1)

    return row?.dictionaryId
  }

  /** 统计某个词典下的词条总数 */
  async countByDictionaryId(dictionaryId: number): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(dictionaryEntry)
      .where(eq(dictionaryEntry.dictionaryId, dictionaryId))

    return row?.total ?? 0
  }

  /** 删除某个词典下的所有词条 */
  async deleteByDictionaryId(dictionaryId: number): Promise<void> {
    await this.db.delete(dictionaryEntry).where(eq(dictionaryEntry.dictionaryId, dictionaryId))
  }
}
