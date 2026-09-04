import { app } from 'electron'
import { Mdx } from '@dictol/mdict-native'
import { randomUUID } from 'node:crypto'
import { copyFile, rename, rm, unlink } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { Worker } from 'node:worker_threads'

import type { DictionaryImportSourceFile } from '../shared/dictionary-import'
import type { DictionaryInfo } from '../shared/dictionary-info'
import type { BuiltInLexiconEntry } from './built-in-lexicon-service'
import type { DictolDatabase } from './db/drizzle'
import { getDatabasePath } from './db/paths'
import { DictionaryEntryRepository } from './db/repository/dictionary-entry-repository'
import { DictionaryFileRepository } from './db/repository/dictionary-file-repository'
import { DictionaryRepository } from './db/repository/dictionary-repository'
import { QueryHistoryRepository } from './db/repository/query-history-repository'
import {
  OnlineDictionaryRepository,
  type OnlineDictionaryInput
} from './db/repository/online-dictionary-repository'
import {
  WordbookRepository,
  type WordbookImportItem,
  type WordbookWordWithWordbook
} from './db/repository/wordbook-repository'

export type DictionaryStatus = 'pending' | 'importing' | 'ready' | 'error'

const WINDOWS_RENAME_RETRY_LIMIT = 10
const WINDOWS_RENAME_RETRY_DELAY_MS = 25

export type DictionarySummary = {
  id: string
  name: string
  description: string | null
  customCss: string
  recordCount: string | null
  status: DictionaryStatus
  createdAt: string
  updatedAt: string
}

export type ReadyDictionary = {
  id: string
  name: string
  description: string | null
  recordCount: string | null
  status: 'ready'
  createdAt: string
  updatedAt: string
}

export type ImportedDictionary = {
  id: string
  name: string
  status: 'importing'
  directory: string
  files: Array<{
    id: string
    name: string
    type: 'mdx' | 'mdd'
  }>
}

export type DictionaryMatch = {
  entryId: string
  dictionaryId: string
  dictionaryName: string
}

export type DictionaryEntryGroup = {
  word: string
  normalizedWord: string
  dictionaries: DictionaryMatch[]
}

export type DictionarySearchResult = {
  word: string
  normalizedWord: string
  dictionaryCount: number
}

export type DictionaryEntryContent = {
  id: string
  dictionaryId: string
  dictionaryName: string
  word: string
  html: string
  customCss: string
}

export type DictionaryEntryRecord = Omit<DictionaryEntryContent, 'html'> & {
  filePath: string
  recordStartOffset: number
  recordEndOffset: number
}

export type QueryHistoryItem = {
  id: string
  term: string
  queryCount: number
  lastQueriedAt: string
}

export type WordbookSummary = {
  id: string
  name: string
  isDefault: boolean
  wordCount: number
  createdAt: string
  updatedAt: string
}

export type WordbookWordItem = {
  id: string
  wordbookId: string
  wordbookName: string
  word: string
  star: number
  dictionaryWord: string | null
  phonetic: string | null
  definition: string | null
  translation: string | null
  ecdictVersion: string | null
  createdAt: string
  updatedAt: string
}

export type OnlineDictionaryConfig = {
  id: string
  name: string
  faviconUrl: string
  urlTemplate: string
}

export type WordbookWordsPaginated = {
  items: WordbookWordItem[]
  total: number
}

export type WordbookExportRequest =
  | { scope: 'all' }
  | { scope: 'wordbook'; wordbookId: string }
  | { scope: 'selected'; wordIds: string[] }

export type WordbookExportStatus = {
  state: 'idle' | 'exporting' | 'completed' | 'error'
  destinationPath: string | null
  error: string | null
}

export type WordbookImportResult = {
  imported: number
  matched: number
  unmatched: number
  wordbookId: string
  wordbookName: string
}

const MAX_WORDBOOK_IMPORT_WORDS = 5_000

export class DBService {
  private readonly dictionaryRepo: DictionaryRepository
  private readonly entryRepo: DictionaryEntryRepository
  private readonly fileRepo: DictionaryFileRepository
  private readonly queryHistoryRepo: QueryHistoryRepository
  private readonly wordbookRepo: WordbookRepository
  private readonly onlineDictionaryRepo: OnlineDictionaryRepository
  private wordbookExportStatus: WordbookExportStatus = {
    state: 'idle',
    destinationPath: null,
    error: null
  }
  private readonly wordbookExportListeners = new Set<(status: WordbookExportStatus) => void>()

  constructor(
    db: DictolDatabase,
    private readonly lexicon: { lookup(word: string): BuiltInLexiconEntry | null } | undefined
  ) {
    this.dictionaryRepo = new DictionaryRepository(db)
    this.entryRepo = new DictionaryEntryRepository(db)
    this.fileRepo = new DictionaryFileRepository(db)
    this.queryHistoryRepo = new QueryHistoryRepository(db)
    this.wordbookRepo = new WordbookRepository(db)
    this.onlineDictionaryRepo = new OnlineDictionaryRepository(db)
  }

  async listWordbooks(): Promise<WordbookSummary[]> {
    const rows = await this.wordbookRepo.listAll()
    return rows.map((row) => ({
      id: String(row.id),
      name: row.name,
      isDefault: row.isDefault,
      wordCount: row.wordCount,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    }))
  }

  async createWordbook(name: string): Promise<WordbookSummary> {
    if (typeof name !== 'string') throw new Error('无效的生词本名称')
    const normalizedName = name.trim()
    if (!normalizedName) throw new Error('生词本名称不能为空')
    if (normalizedName.length > 100) throw new Error('生词本名称不能超过 100 个字符')

    const created = await this.wordbookRepo.create(normalizedName)
    return {
      id: String(created.id),
      name: created.name,
      isDefault: created.isDefault,
      wordCount: 0,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt
    }
  }

  async listWordbookWordsPaginated(
    wordbookId?: string,
    page = 1,
    pageSize = 25
  ): Promise<WordbookWordsPaginated> {
    const numericWordbookId =
      wordbookId === undefined ? undefined : this.parseWordbookId(wordbookId)
    const { items, total } = await this.wordbookRepo.listWordsPaginated(
      numericWordbookId,
      page,
      pageSize
    )
    return {
      items: items.map(toWordbookWordItem),
      total
    }
  }

  async filterWordbookWords(
    keyword: string,
    wordbookId?: string,
    page = 1,
    pageSize = 25
  ): Promise<WordbookWordsPaginated> {
    if (typeof keyword !== 'string') throw new Error('无效的关键词')
    const trimmed = keyword.trim()
    if (!trimmed) throw new Error('关键词不能为空')

    const numericWordbookId =
      wordbookId === undefined ? undefined : this.parseWordbookId(wordbookId)

    const { items, total } = await this.wordbookRepo.filterWords(
      trimmed,
      numericWordbookId,
      page,
      pageSize
    )
    return {
      items: items.map(toWordbookWordItem),
      total
    }
  }

  async deleteWordbook(wordbookId: string): Promise<void> {
    const numericId = this.parseWordbookId(wordbookId)
    const book = await this.wordbookRepo.findById(numericId)
    if (!book) throw new Error('生词本不存在')
    if (book.isDefault) throw new Error('默认生词本不能删除')
    await this.wordbookRepo.deleteById(numericId)
  }

  async renameWordbook(wordbookId: string, name: string): Promise<void> {
    const numericId = this.parseWordbookId(wordbookId)
    await this.wordbookRepo.rename(numericId, name)
  }

  async addWordToDefaultWordbook(word: string, star = 0): Promise<WordbookWordItem> {
    if (typeof word !== 'string') throw new Error('无效的单词')
    const normalizedWord = word.trim().toLocaleLowerCase()
    if (!normalizedWord) throw new Error('单词不能为空')
    if (normalizedWord.length > 300) throw new Error('单词不能超过 300 个字符')
    if (!Number.isInteger(star) || star < 0 || star > 5) throw new Error('星级必须在 0 到 5 之间')

    const saved = await this.wordbookRepo.star(word, star, this.lexicon?.lookup(word) ?? null)
    const defaultWordbook = await this.wordbookRepo.findDefault()
    if (!defaultWordbook) throw new Error('默认生词本不存在')
    return toWordbookWordItem({ ...saved, wordbookName: defaultWordbook.name, isDefault: true })
  }

  async importWordbookWords(text: string, wordbookId?: string): Promise<WordbookImportResult> {
    const words = parseWordbookImportText(text)
    if (words.length === 0) throw new Error('请至少输入一个单词')
    if (words.length > MAX_WORDBOOK_IMPORT_WORDS) {
      throw new Error(`一次最多导入 ${MAX_WORDBOOK_IMPORT_WORDS} 个单词`)
    }

    const targetWordbook = wordbookId
      ? await this.wordbookRepo.findById(this.parseWordbookId(wordbookId))
      : await this.wordbookRepo.findDefault()
    if (!targetWordbook) throw new Error(wordbookId ? '生词本不存在' : '默认生词本不存在')

    const items: WordbookImportItem[] = words.map((word) => ({
      word,
      lexiconEntry: this.lexicon?.lookup(word) ?? null
    }))
    await this.wordbookRepo.importWords(targetWordbook.id, items)

    const matched = items.filter((item) => item.lexiconEntry !== null).length
    return {
      imported: items.length,
      matched,
      unmatched: items.length - matched,
      wordbookId: String(targetWordbook.id),
      wordbookName: targetWordbook.name
    }
  }

  async toggleStarWord(word: string): Promise<void> {
    if (typeof word !== 'string') throw new Error('无效的单词')
    const normalizedWord = word.trim().toLocaleLowerCase()
    if (!normalizedWord) throw new Error('单词不能为空')
    if (normalizedWord.length > 300) throw new Error('单词不能超过 300 个字符')
    if (await this.wordbookRepo.isStarred(word)) {
      await this.wordbookRepo.unStar(word)
      return
    }
    await this.wordbookRepo.star(word, 3, this.lexicon?.lookup(word) ?? null)
  }

  async unStarWord(word: string): Promise<void> {
    if (typeof word !== 'string') throw new Error('无效的单词')
    const normalizedWord = word.trim().toLocaleLowerCase()
    if (!normalizedWord) throw new Error('单词不能为空')
    await this.wordbookRepo.unStar(word)
  }

  async isWordStarred(word: string): Promise<boolean> {
    if (typeof word !== 'string') throw new Error('无效的单词')
    const normalizedWord = word.trim().toLocaleLowerCase()
    if (!normalizedWord) return false
    return await this.wordbookRepo.isStarred(word)
  }

  async updateWordStar(word: string, star: number): Promise<void> {
    if (typeof word !== 'string') throw new Error('无效的单词')
    const normalizedWord = word.trim().toLocaleLowerCase()
    if (!normalizedWord) throw new Error('单词不能为空')
    if (normalizedWord.length > 300) throw new Error('单词不能超过 300 个字符')
    if (typeof star !== 'number' || !Number.isInteger(star) || star < 0 || star > 5)
      throw new Error('星级必须是 0 到 5 的整数')
    await this.wordbookRepo.updateStar(word, star)
  }

  async moveWordbookWords(wordIds: string[], destinationWordbookId: string): Promise<void> {
    if (!Array.isArray(wordIds) || wordIds.length === 0) throw new Error('请选择至少一个单词')
    const numericWordIds = wordIds.map((id) => this.parseWordbookWordId(id))
    if (new Set(numericWordIds).size !== numericWordIds.length)
      throw new Error('单词列表包含重复项')

    const targetId = this.parseWordbookId(destinationWordbookId)
    if (!(await this.wordbookRepo.findById(targetId))) throw new Error('目标生词本不存在')
    await this.wordbookRepo.moveWords(numericWordIds, targetId)
  }

  getWordbookExportStatus(): WordbookExportStatus {
    return this.wordbookExportStatus
  }

  onWordbookExportStatus(listener: (status: WordbookExportStatus) => void): () => void {
    this.wordbookExportListeners.add(listener)
    return () => this.wordbookExportListeners.delete(listener)
  }

  async startWordbookExport(
    request: WordbookExportRequest,
    destinationDirectory: string
  ): Promise<void> {
    if (this.wordbookExportStatus.state === 'exporting') throw new Error('正在导出生词本')
    const workerRequest = await this.validateWordbookExportRequest(request)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const temporaryPath = join(app.getPath('temp'), `dictol-wordbooks-${randomUUID()}.xlsx`)
    const destinationPath = join(destinationDirectory, `Dictol-生词本-${timestamp}.xlsx`)

    this.setWordbookExportStatus({ state: 'exporting', destinationPath: null, error: null })
    void this.runWordbookExport(workerRequest, temporaryPath, destinationPath)
  }

  async listDictionaries(): Promise<DictionarySummary[]> {
    const rows = await this.dictionaryRepo.listAll()

    return rows.map((row) => ({
      id: String(row.id),
      name: row.name,
      description: row.description,
      customCss: row.customCss,
      recordCount: row.recordCount?.toString() ?? null,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    }))
  }

  async listOnlineDictionaries(): Promise<OnlineDictionaryConfig[]> {
    const rows = await this.onlineDictionaryRepo.listAll()
    return rows.map((row) => ({
      id: String(row.id),
      name: row.name,
      faviconUrl: row.faviconUrl,
      urlTemplate: row.urlTemplate
    }))
  }

  async getDictionaryInfoSource(
    dictionaryId: string
  ): Promise<{ mdxPath: string; dictionaryFileNames: string[] }> {
    const numericDictionaryId = this.parseDictionaryId(dictionaryId)
    const dictionaryFiles = await this.listDictionaryResourceFiles(numericDictionaryId)
    const mdxFile = dictionaryFiles.find((file) => file.fileType == 'mdx')

    if (!mdxFile) throw new Error('词典 MDX 文件不存在')

    return {
      mdxPath: mdxFile.filePath,
      dictionaryFileNames: dictionaryFiles.map((file) => file.fileName)
    }
  }

  async addOnlineDictionary(input: OnlineDictionaryInput): Promise<OnlineDictionaryConfig> {
    const created = await this.onlineDictionaryRepo.create(input)
    return {
      id: String(created.id),
      name: created.name,
      faviconUrl: created.faviconUrl,
      urlTemplate: created.urlTemplate
    }
  }

  async deleteOnlineDictionary(id: string): Promise<void> {
    const numericId = this.parseOnlineDictionaryId(id)
    await this.onlineDictionaryRepo.deleteById(numericId)
  }

  async reorderOnlineDictionaries(ids: string[]): Promise<void> {
    if (!Array.isArray(ids)) throw new Error('无效的在线词典顺序')

    const requestedIds = ids.map(Number)
    if (
      requestedIds.some((id) => !Number.isSafeInteger(id) || id <= 0) ||
      new Set(requestedIds).size !== requestedIds.length
    ) {
      throw new Error('在线词典顺序包含无效或重复的 ID')
    }

    const currentIds = await this.onlineDictionaryRepo.listIds()
    const currentSet = new Set(currentIds)
    if (requestedIds.some((id) => !currentSet.has(id))) throw new Error('在线词典不存在')

    const requestedSet = new Set(requestedIds)
    const completeOrder = [...requestedIds, ...currentIds.filter((id) => !requestedSet.has(id))]
    await this.onlineDictionaryRepo.reorder(completeOrder)
  }

  async listReadyDictionaries(): Promise<ReadyDictionary[]> {
    const rows = await this.dictionaryRepo.listReady()

    return rows.map((row) => ({
      id: String(row.id),
      name: row.name,
      description: row.description,
      recordCount: row.recordCount?.toString() ?? null,
      status: 'ready',
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    }))
  }

  async recordQueryHistory(term: string): Promise<void> {
    const normalizedTerm = term.trim().toLowerCase()
    if (!normalizedTerm || normalizedTerm.length > 200) return

    await this.queryHistoryRepo.upsert(term.trim(), normalizedTerm)
    await this.queryHistoryRepo.trimTo(200)
  }

  async listQueryHistory(): Promise<QueryHistoryItem[]> {
    const rows = await this.queryHistoryRepo.listRecent(200)

    return rows.map((row) => ({
      id: String(row.id),
      term: row.term,
      queryCount: row.queryCount,
      lastQueriedAt: row.lastQueriedAt
    }))
  }

  async clearQueryHistory(): Promise<void> {
    await this.queryHistoryRepo.clear()
  }

  async getDictionaryEntryDictionaryId(entryId: string): Promise<string | null> {
    const numericEntryId = Number(entryId)
    if (!Number.isSafeInteger(numericEntryId) || numericEntryId <= 0) return null

    const dictionaryId = await this.entryRepo.findDictionaryIdByEntryId(numericEntryId)
    return dictionaryId === undefined ? null : String(dictionaryId)
  }

  async deleteDictionary(dictionaryId: string): Promise<void> {
    const numericId = Number(dictionaryId)
    if (!Number.isSafeInteger(numericId) || numericId <= 0) throw new Error('无效的词典 ID')

    const row = await this.dictionaryRepo.findById(numericId)
    if (!row) throw new Error('词典不存在')
    if (row.status === 'importing') throw new Error('词典正在导入，暂时无法删除')

    const dictionariesRoot = resolve(app.getPath('userData'), 'dictionaries')
    const dictionaryDirectory = row.dictPath ? resolve(row.dictPath) : null
    if (dictionaryDirectory && dirname(dictionaryDirectory) !== dictionariesRoot) {
      throw new Error('词典目录不在允许删除的位置')
    }

    const stagedDirectory = dictionaryDirectory
      ? join(dictionariesRoot, `.deleting-${basename(dictionaryDirectory)}-${randomUUID()}`)
      : null
    let directoryWasStaged = false

    if (dictionaryDirectory && stagedDirectory) {
      try {
        await renameDictionaryDirectory(dictionaryDirectory, stagedDirectory)
        directoryWasStaged = true
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    }

    try {
      await this.dictionaryRepo.deleteById(numericId)
    } catch (error) {
      if (directoryWasStaged && dictionaryDirectory && stagedDirectory) {
        try {
          await renameDictionaryDirectory(stagedDirectory, dictionaryDirectory)
        } catch (restoreError) {
          console.error('Failed to restore dictionary directory after database deletion failed', {
            dictionaryId,
            restoreError
          })
        }
      }
      throw error
    }

    if (directoryWasStaged && stagedDirectory) {
      await rm(stagedDirectory, { recursive: true, force: true })
    }
  }

  async getDictionaryPath(dictionaryId: string): Promise<string | null> {
    const row = await this.dictionaryRepo.findById(this.parseDictionaryId(dictionaryId))
    return row?.dictPath ?? null
  }

  async updateDictionaryName(dictionaryId: string, name: string): Promise<void> {
    const numericId = this.parseDictionaryId(dictionaryId)
    if (typeof name !== 'string') throw new Error('无效的词典名称')
    const normalizedName = name.trim()
    if (!normalizedName) throw new Error('词典名称不能为空')
    if (normalizedName.length > 100) throw new Error('词典名称不能超过 100 个字符')

    if (!(await this.dictionaryRepo.updateName(numericId, normalizedName))) {
      throw new Error('词典不存在')
    }
  }

  async updateDictionaryCustomCss(dictionaryId: string, customCss: string): Promise<void> {
    const numericId = this.parseDictionaryId(dictionaryId)
    if (typeof customCss !== 'string') throw new Error('无效的自定义 CSS')
    if (customCss.length > 200_000) throw new Error('自定义 CSS 不能超过 200,000 个字符')

    if (!(await this.dictionaryRepo.updateCustomCss(numericId, customCss))) {
      throw new Error('词典不存在')
    }
  }

  async reorderDictionaries(dictionaryIds: string[]): Promise<void> {
    if (!Array.isArray(dictionaryIds)) throw new Error('无效的词典顺序')

    const requestedIds = dictionaryIds.map(Number)
    if (
      requestedIds.some((id) => !Number.isSafeInteger(id) || id <= 0) ||
      new Set(requestedIds).size !== requestedIds.length
    ) {
      throw new Error('词典顺序包含无效或重复的 ID')
    }

    const currentIds = await this.dictionaryRepo.listIds()
    const currentSet = new Set(currentIds)
    if (requestedIds.some((id) => !currentSet.has(id))) throw new Error('词典不存在')

    const requestedSet = new Set(requestedIds)
    const completeOrder = [...requestedIds, ...currentIds.filter((id) => !requestedSet.has(id))]
    await this.dictionaryRepo.reorder(completeOrder)
  }

  async importDictionaryFromFile(
    mdxPath: string,
    sourceFiles: DictionaryImportSourceFile[]
  ): Promise<ImportedDictionary> {
    const workerPath =
      process.env.DICTOL_IMPORT_WORKER_PATH ?? join(__dirname, 'dictionary-import-worker.js')
    const worker = new Worker(workerPath, {
      workerData: {
        databasePath: getDatabasePath(),
        mdxPath,
        sourceFiles,
        userDataPath: app.getPath('userData'),
        targetDirectoryName: randomUUID()
      }
    })

    return new Promise<ImportedDictionary>((resolvePromise, rejectPromise) => {
      let created = false
      const failBeforeCreation = (error: Error): void => {
        if (created) {
          console.error('Dictionary import failed after creation', error)
          return
        }
        rejectPromise(error)
      }

      worker.on(
        'message',
        (
          message: { type: 'created'; value: ImportedDictionary } | { type: 'error'; error: string }
        ) => {
          if (message.type === 'created') {
            created = true
            resolvePromise(message.value)
            return
          }
          failBeforeCreation(new Error(message.error || '词典导入失败'))
        }
      )
      worker.once('error', (error) => failBeforeCreation(error))
      worker.once('exit', (code) => {
        if (!created && code !== 0) {
          failBeforeCreation(new Error(`词典导入 Worker 异常退出（${code}）`))
        } else if (!created) {
          failBeforeCreation(new Error('词典导入 Worker 未创建词典记录'))
        } else if (code !== 0) {
          console.error(`Dictionary import Worker exited unexpectedly (${code})`)
        }
      })
    })
  }

  async searchDictionaryEntries(prefix: string, limit = 50): Promise<DictionarySearchResult[]> {
    const normalizedPrefix = prefix.trim().toLowerCase()
    if (!normalizedPrefix) return []

    const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100)
    return this.entryRepo.searchByPrefix(normalizedPrefix, safeLimit)
  }

  async lookupDictionaryEntryGroup(term: string): Promise<DictionaryEntryGroup | null> {
    const normalizedTerm = term.trim().toLowerCase()
    if (!normalizedTerm) return null

    const matchedTerm = await this.entryRepo.findByNormalizedWord(normalizedTerm)
    if (!matchedTerm) return null
    return (await this.loadDictionaryEntryGroups([matchedTerm]))[0] ?? null
  }

  async getDictionaryEntryRecord(entryId: string): Promise<DictionaryEntryRecord | null> {
    const numericEntryId = Number(entryId)
    if (!Number.isSafeInteger(numericEntryId) || numericEntryId <= 0) return null

    const row = await this.entryRepo.findEntryContent(numericEntryId)
    if (!row) return null

    return {
      id: String(row.id),
      dictionaryId: String(row.dictionaryId),
      dictionaryName: row.dictionaryName,
      word: row.word,
      customCss: row.customCss,
      filePath: row.filePath,
      recordStartOffset: row.recordStartOffset,
      recordEndOffset: row.recordEndOffset
    }
  }

  /**
   * 返回一个展示入口对应的全部同词典同规范化 key record。
   *
   * 一个 MDX 词条可能由重复 key 的多个连续 record 组成；调用方应按此顺序解码并拼接。
   */
  async getDictionaryEntryRecords(entryId: string): Promise<DictionaryEntryRecord[]> {
    const numericEntryId = Number(entryId)
    if (!Number.isSafeInteger(numericEntryId) || numericEntryId <= 0) return []

    return (await this.entryRepo.findEntryContentsForDisplay(numericEntryId)).map((row) => ({
      id: String(row.id),
      dictionaryId: String(row.dictionaryId),
      dictionaryName: row.dictionaryName,
      word: row.word,
      customCss: row.customCss,
      filePath: row.filePath,
      recordStartOffset: row.recordStartOffset,
      recordEndOffset: row.recordEndOffset
    }))
  }

  async listDictionaryResourceFiles(dictionaryId: number): Promise<
    Array<{
      fileName: string
      filePath: string
      fileType: 'mdx' | 'mdd'
      dictPath: string | null
    }>
  > {
    if (!Number.isSafeInteger(dictionaryId) || dictionaryId <= 0) return []
    return this.fileRepo.listResourceFiles(dictionaryId)
  }

  private parseDictionaryId(dictionaryId: string): number {
    const numericId = Number(dictionaryId)
    if (!Number.isSafeInteger(numericId) || numericId <= 0) throw new Error('无效的词典 ID')
    return numericId
  }

  private parseOnlineDictionaryId(id: string): number {
    const numericId = Number(id)
    if (!Number.isSafeInteger(numericId) || numericId <= 0) {
      throw new Error('无效的在线词典 ID')
    }
    return numericId
  }

  private parseWordbookId(wordbookId: string): number {
    const numericId = Number(wordbookId)
    if (!Number.isSafeInteger(numericId) || numericId <= 0) throw new Error('无效的生词本 ID')
    return numericId
  }

  private parseWordbookWordId(wordId: string): number {
    const numericId = Number(wordId)
    if (!Number.isSafeInteger(numericId) || numericId <= 0) throw new Error('无效的单词 ID')
    return numericId
  }

  private async validateWordbookExportRequest(
    request: WordbookExportRequest
  ): Promise<
    | { scope: 'all' }
    | { scope: 'wordbook'; wordbookId: number }
    | { scope: 'selected'; wordIds: number[] }
  > {
    if (request.scope === 'all') return request

    if (request.scope === 'wordbook') {
      const wordbookId = this.parseWordbookId(request.wordbookId)
      if (!(await this.wordbookRepo.findById(wordbookId))) throw new Error('生词本不存在')
      return { scope: 'wordbook', wordbookId }
    }

    if (request.scope === 'selected') {
      if (!Array.isArray(request.wordIds) || request.wordIds.length === 0) {
        throw new Error('请选择至少一个单词')
      }
      const wordIds = request.wordIds.map((id) => this.parseWordbookWordId(id))
      if (new Set(wordIds).size !== wordIds.length) throw new Error('单词列表包含重复项')
      const rows = await this.wordbookRepo.listWordsByIds(wordIds)
      if (rows.length !== wordIds.length) throw new Error('部分所选单词不存在')
      return { scope: 'selected', wordIds }
    }

    throw new Error('无效的导出范围')
  }

  private async runWordbookExport(
    request:
      | { scope: 'all' }
      | { scope: 'wordbook'; wordbookId: number }
      | { scope: 'selected'; wordIds: number[] },
    temporaryPath: string,
    destinationPath: string
  ): Promise<void> {
    try {
      const workerPath =
        process.env.DICTOL_WORDBOOK_EXPORT_WORKER_PATH ??
        join(__dirname, 'wordbook-export-worker.js')
      const worker = new Worker(workerPath, {
        workerData: { databasePath: getDatabasePath(), temporaryPath, request }
      })

      await new Promise<void>((resolve, reject) => {
        let settled = false
        worker.once('message', (message: { ok: boolean; error?: string }) => {
          settled = true
          if (message.ok) resolve()
          else reject(new Error(message.error || '导出生词本失败'))
        })
        worker.once('error', (error) => {
          settled = true
          reject(error)
        })
        worker.once('exit', (code) => {
          if (!settled && code !== 0) reject(new Error(`导出 Worker 异常退出（${code}）`))
          else if (!settled) reject(new Error('导出 Worker 未返回结果'))
        })
      })

      try {
        await rename(temporaryPath, destinationPath)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error
        await copyFile(temporaryPath, destinationPath)
        await unlink(temporaryPath)
      }
      this.setWordbookExportStatus({ state: 'completed', destinationPath, error: null })
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => undefined)
      this.setWordbookExportStatus({
        state: 'error',
        destinationPath: null,
        error: error instanceof Error ? error.message : '导出生词本失败'
      })
    }
  }

  private setWordbookExportStatus(status: WordbookExportStatus): void {
    this.wordbookExportStatus = status
    this.wordbookExportListeners.forEach((listener) => listener(status))
  }

  private async loadDictionaryEntryGroups(
    terms: Array<{ normalizedWord: string; word: string }>
  ): Promise<DictionaryEntryGroup[]> {
    if (terms.length === 0) return []
    const matches = await this.entryRepo.lookupByNormalizedWords(
      terms.map((term) => term.normalizedWord)
    )
    const groups = new Map<string, DictionaryEntryGroup>(
      terms.map((term) => [term.normalizedWord, { ...term, dictionaries: [] }])
    )
    for (const match of matches) {
      groups.get(match.normalizedWord)?.dictionaries.push({
        entryId: String(match.entryId),
        dictionaryId: String(match.dictionaryId),
        dictionaryName: match.dictionaryName
      })
    }
    return [...groups.values()].filter((group) => group.dictionaries.length > 0)
  }
}

function parseWordbookImportText(text: string): string[] {
  if (typeof text !== 'string') throw new Error('无效的导入内容')

  const words: string[] = []
  const seen = new Set<string>()
  for (const line of text.split(/\r?\n/)) {
    const word = line.trim()
    if (!word) continue
    if (word.length > 300) throw new Error(`单词不能超过 300 个字符：${word.slice(0, 20)}…`)

    const normalizedWord = word.toLocaleLowerCase()
    if (seen.has(normalizedWord)) continue
    seen.add(normalizedWord)
    words.push(word)
  }
  return words
}

async function renameDictionaryDirectory(source: string, destination: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(source, destination)
      return
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      const retryableOnWindows = code === 'EPERM' || code === 'EACCES' || code === 'EBUSY'
      if (
        process.platform !== 'win32' ||
        !retryableOnWindows ||
        attempt >= WINDOWS_RENAME_RETRY_LIMIT
      ) {
        throw error
      }
      await delay(WINDOWS_RENAME_RETRY_DELAY_MS * (attempt + 1))
    }
  }
}

function toWordbookWordItem(row: WordbookWordWithWordbook): WordbookWordItem {
  return {
    id: String(row.id),
    wordbookId: String(row.wordbookId),
    wordbookName: row.wordbookName,
    word: row.word,
    star: row.star,
    dictionaryWord: row.dictionaryWord,
    phonetic: row.phonetic,
    definition: row.definition,
    translation: row.translation,
    ecdictVersion: row.ecdictVersion,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}
