import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { rename, rm } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { Worker } from 'node:worker_threads'

import type { DictolDatabase } from './db/drizzle'
import { getDatabasePath } from './db/paths'
import { DictionaryEntryRepository } from './db/repository/dictionary-entry-repository'
import { DictionaryFileRepository } from './db/repository/dictionary-file-repository'
import { DictionaryRepository } from './db/repository/dictionary-repository'
import { QueryHistoryRepository } from './db/repository/query-history-repository'

export type DictionaryStatus = 'pending' | 'importing' | 'ready' | 'error'

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
  status: 'ready'
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

export type FirstReadyDictionaryEntryLookup = {
  hasReadyDictionary: boolean
  entry: DictionaryEntryRecord | null
}

export type QueryHistoryItem = {
  id: string
  term: string
  queryCount: number
  lastQueriedAt: string
}

export class DBService {
  private readonly dictionaryRepo: DictionaryRepository
  private readonly entryRepo: DictionaryEntryRepository
  private readonly fileRepo: DictionaryFileRepository
  private readonly queryHistoryRepo: QueryHistoryRepository

  constructor(db: DictolDatabase) {
    this.dictionaryRepo = new DictionaryRepository(db)
    this.entryRepo = new DictionaryEntryRepository(db)
    this.fileRepo = new DictionaryFileRepository(db)
    this.queryHistoryRepo = new QueryHistoryRepository(db)
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
        await rename(dictionaryDirectory, stagedDirectory)
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
          await rename(stagedDirectory, dictionaryDirectory)
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

  async importDictionaryFromFile(mdxPath: string): Promise<ImportedDictionary> {
    const workerPath =
      process.env.DICTOL_IMPORT_WORKER_PATH ?? join(__dirname, 'dictionary-import-worker.js')
    const worker = new Worker(workerPath, {
      workerData: {
        databasePath: getDatabasePath(),
        mdxPath,
        userDataPath: app.getPath('userData'),
        targetDirectoryName: randomUUID()
      }
    })

    return new Promise<ImportedDictionary>((resolvePromise, rejectPromise) => {
      let settled = false
      worker.once(
        'message',
        (message: { ok: boolean; value?: ImportedDictionary; error?: string }) => {
          settled = true
          if (message.ok && message.value) resolvePromise(message.value)
          else rejectPromise(new Error(message.error || '词典导入失败'))
        }
      )
      worker.once('error', (error) => {
        settled = true
        rejectPromise(error)
      })
      worker.once('exit', (code) => {
        if (!settled && code !== 0) rejectPromise(new Error(`词典导入 Worker 异常退出（${code}）`))
        else if (!settled) rejectPromise(new Error('词典导入 Worker 未返回结果'))
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

  async lookupFirstReadyDictionaryEntry(term: string): Promise<FirstReadyDictionaryEntryLookup> {
    const normalizedTerm = term.trim().toLowerCase()
    if (!normalizedTerm) return { hasReadyDictionary: false, entry: null }

    const result = await this.entryRepo.findFirstReadyEntryContent(normalizedTerm)
    const row = result.entry
    return {
      hasReadyDictionary: result.hasReadyDictionary,
      entry: row
        ? {
            id: String(row.id),
            dictionaryId: String(row.dictionaryId),
            dictionaryName: row.dictionaryName,
            word: row.word,
            customCss: row.customCss,
            filePath: row.filePath,
            recordStartOffset: row.recordStartOffset,
            recordEndOffset: row.recordEndOffset
          }
        : null
    }
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
