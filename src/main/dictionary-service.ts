import { app } from 'electron'
import { rename, rm } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Worker } from 'node:worker_threads'

import { getDatabasePath } from './db/drizzle'
import { DictionaryRepository } from './db/repository/dictionary-repository'
import { DictionaryEntryRepository } from './db/repository/dictionary-entry-repository'
import { QueryHistoryRepository } from './db/repository/query-history-repository'
import { decodeMdxRecord, getMdictDictionary, invalidateMdictDirectory } from './mdict-runtime'

// Module-level repository instances (all use the shared sync getOrm())
const dictRepo = new DictionaryRepository()
const entryRepo = new DictionaryEntryRepository()
const queryHistoryRepo = new QueryHistoryRepository()

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

export async function listDictionaries(): Promise<DictionarySummary[]> {
  const rows = await dictRepo.listAll()

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

export async function listReadyDictionaries(): Promise<ReadyDictionary[]> {
  const rows = await dictRepo.listReady()

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

export type QueryHistoryItem = {
  id: string
  term: string
  queryCount: number
  lastQueriedAt: string
}

export async function recordQueryHistory(term: string): Promise<void> {
  const normalizedTerm = term.trim().toLowerCase()
  if (!normalizedTerm || normalizedTerm.length > 200) return

  await queryHistoryRepo.upsert(term.trim(), normalizedTerm)
  await queryHistoryRepo.trimTo(200)
}

export async function listQueryHistory(): Promise<QueryHistoryItem[]> {
  const rows = await queryHistoryRepo.listRecent(200)

  return rows.map((row) => ({
    id: String(row.id),
    term: row.term,
    queryCount: row.queryCount,
    lastQueriedAt: row.lastQueriedAt
  }))
}

export async function clearQueryHistory(): Promise<void> {
  await queryHistoryRepo.clear()
}

export async function getDictionaryEntryDictionaryId(entryId: string): Promise<string | null> {
  const numericEntryId = Number(entryId)
  if (!Number.isSafeInteger(numericEntryId) || numericEntryId <= 0) return null

  const dictionaryId = await entryRepo.findDictionaryIdByEntryId(numericEntryId)
  return dictionaryId === undefined ? null : String(dictionaryId)
}

export async function deleteDictionary(dictionaryId: string): Promise<void> {
  const numericId = Number(dictionaryId)
  if (!Number.isSafeInteger(numericId) || numericId <= 0) throw new Error('无效的词典 ID')

  const row = await dictRepo.findById(numericId)

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

  if (dictionaryDirectory) invalidateMdictDirectory(dictionaryDirectory)
  if (dictionaryDirectory && stagedDirectory) {
    try {
      await rename(dictionaryDirectory, stagedDirectory)
      directoryWasStaged = true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }

  try {
    await dictRepo.deleteById(numericId)
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
  await rm(join(app.getPath('userData'), 'resource-cache', String(numericId)), {
    recursive: true,
    force: true
  })
}

export async function updateDictionaryName(dictionaryId: string, name: string): Promise<void> {
  const numericId = parseDictionaryId(dictionaryId)
  if (typeof name !== 'string') throw new Error('无效的词典名称')
  const normalizedName = name.trim()
  if (!normalizedName) throw new Error('词典名称不能为空')
  if (normalizedName.length > 100) throw new Error('词典名称不能超过 100 个字符')

  if (!(await dictRepo.updateName(numericId, normalizedName))) throw new Error('词典不存在')
}

export async function updateDictionaryCustomCss(
  dictionaryId: string,
  customCss: string
): Promise<void> {
  const numericId = parseDictionaryId(dictionaryId)
  if (typeof customCss !== 'string') throw new Error('无效的自定义 CSS')
  if (customCss.length > 200_000) throw new Error('自定义 CSS 不能超过 200,000 个字符')

  if (!(await dictRepo.updateCustomCss(numericId, customCss))) throw new Error('词典不存在')
}

function parseDictionaryId(dictionaryId: string): number {
  const numericId = Number(dictionaryId)
  if (!Number.isSafeInteger(numericId) || numericId <= 0) throw new Error('无效的词典 ID')
  return numericId
}

export async function reorderDictionaries(dictionaryIds: string[]): Promise<void> {
  if (!Array.isArray(dictionaryIds)) throw new Error('无效的词典顺序')

  const requestedIds = dictionaryIds.map(Number)
  if (
    requestedIds.some((id) => !Number.isSafeInteger(id) || id <= 0) ||
    new Set(requestedIds).size !== requestedIds.length
  ) {
    throw new Error('词典顺序包含无效或重复的 ID')
  }

  const currentIds = await dictRepo.listIds()
  const currentSet = new Set(currentIds)
  if (requestedIds.some((id) => !currentSet.has(id))) throw new Error('词典不存在')

  const requestedSet = new Set(requestedIds)
  const completeOrder = [...requestedIds, ...currentIds.filter((id) => !requestedSet.has(id))]
  await dictRepo.reorder(completeOrder)
}

export async function importDictionaryFromFile(mdxPath: string): Promise<ImportedDictionary> {
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

export async function searchDictionaryEntries(
  prefix: string,
  limit = 50
): Promise<DictionarySearchResult[]> {
  const normalizedPrefix = prefix.trim().toLowerCase()
  if (!normalizedPrefix) return []

  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100)
  return entryRepo.searchByPrefix(normalizedPrefix, safeLimit)
}

export async function lookupDictionaryEntryGroup(
  term: string
): Promise<DictionaryEntryGroup | null> {
  const normalizedTerm = term.trim().toLowerCase()
  if (!normalizedTerm) return null

  const matchedTerm = await entryRepo.findByNormalizedWord(normalizedTerm)
  if (!matchedTerm) return null
  return (await loadDictionaryEntryGroups([matchedTerm]))[0] ?? null
}

async function loadDictionaryEntryGroups(
  terms: Array<{ normalizedWord: string; word: string }>
): Promise<DictionaryEntryGroup[]> {
  if (terms.length === 0) return []
  const matches = await entryRepo.lookupByNormalizedWords(terms.map((term) => term.normalizedWord))
  const groups = new Map<string, DictionaryEntryGroup>(
    terms.map((term) => [term.normalizedWord, { ...term, dictionaries: [] as DictionaryMatch[] }])
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

export async function getDictionaryEntryContent(
  entryId: string
): Promise<DictionaryEntryContent | null> {
  const numericEntryId = Number(entryId)
  if (!Number.isSafeInteger(numericEntryId) || numericEntryId <= 0) return null

  const row = await entryRepo.findEntryContent(numericEntryId)

  if (!row) return null

  const mdx = getMdictDictionary(row.filePath)
  const bytes = await mdx.readRecord(BigInt(row.recordStartOffset), BigInt(row.recordEndOffset))
  const html = decodeMdxRecord(bytes, mdx.metadata.encoding)
  return {
    id: String(row.id),
    dictionaryId: String(row.dictionaryId),
    dictionaryName: row.dictionaryName,
    word: row.word,
    html,
    customCss: row.customCss
  }
}
