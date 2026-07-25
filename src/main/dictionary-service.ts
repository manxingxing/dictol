import { and, asc, eq } from 'drizzle-orm'
import { app } from 'electron'
import { rename, rm } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Worker } from 'node:worker_threads'

import { getDatabase, getDatabasePath, initializeDatabase } from './database'
import { dictionary, dictionaryEntry, dictionaryFile } from './db/schema'
import { decodeMdxRecord, getMdictDictionary, invalidateMdictDirectory } from './mdict-runtime'

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
  const database = await getDatabase()
  const rows = await database
    .select()
    .from(dictionary)
    .orderBy(asc(dictionary.sortOrder), asc(dictionary.id))

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
  const database = await getDatabase()
  const rows = await database
    .select()
    .from(dictionary)
    .where(eq(dictionary.status, 'ready'))
    .orderBy(asc(dictionary.sortOrder), asc(dictionary.id))

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

  const client = await initializeDatabase()
  const updateHistory = client.transaction(() => {
    const latest = client
      .prepare('select max(last_queried_at) as value from query_history')
      .get() as { value: string | null }
    const latestTime = latest.value ? Date.parse(latest.value) : Number.NaN
    const lastQueriedAt = new Date(
      Number.isNaN(latestTime) ? Date.now() : Math.max(Date.now(), latestTime + 1)
    ).toISOString()
    client
      .prepare(
        `insert into query_history (term, normalized_term, query_count, last_queried_at)
         values (?, ?, 1, ?)
         on conflict(normalized_term) do update set
           term = excluded.term,
           query_count = query_history.query_count + 1,
           last_queried_at = excluded.last_queried_at`
      )
      .run(term.trim(), normalizedTerm, lastQueriedAt)
    client
      .prepare(
        `delete from query_history
         where id not in (
           select id from query_history order by last_queried_at desc, id desc limit 200
         )`
      )
      .run()
  })
  updateHistory()
}

export async function listQueryHistory(): Promise<QueryHistoryItem[]> {
  const client = await initializeDatabase()
  const rows = client
    .prepare(
      `select
         h.id,
         h.term,
         h.query_count as queryCount,
         h.last_queried_at as lastQueriedAt
       from query_history h
       order by h.last_queried_at desc, h.id desc
       limit 200`
    )
    .all() as Array<{
    id: number
    term: string
    queryCount: number
    lastQueriedAt: string
  }>

  return rows.map((row) => ({
    id: String(row.id),
    term: row.term,
    queryCount: row.queryCount,
    lastQueriedAt: row.lastQueriedAt
  }))
}

export async function clearQueryHistory(): Promise<void> {
  const client = await initializeDatabase()
  client.prepare('delete from query_history').run()
}

export async function getDictionaryEntryDictionaryId(entryId: string): Promise<string | null> {
  const numericEntryId = Number(entryId)
  if (!Number.isSafeInteger(numericEntryId) || numericEntryId <= 0) return null

  const database = await getDatabase()
  const [row] = await database
    .select({ dictionaryId: dictionaryEntry.dictionaryId })
    .from(dictionaryEntry)
    .innerJoin(dictionary, eq(dictionary.id, dictionaryEntry.dictionaryId))
    .where(and(eq(dictionaryEntry.id, numericEntryId), eq(dictionary.status, 'ready')))
    .limit(1)
  return row ? String(row.dictionaryId) : null
}

export async function deleteDictionary(dictionaryId: string): Promise<void> {
  const numericId = Number(dictionaryId)
  if (!Number.isSafeInteger(numericId) || numericId <= 0) throw new Error('无效的词典 ID')

  const database = await getDatabase()
  const [row] = await database
    .select({ id: dictionary.id, dictPath: dictionary.dictPath, status: dictionary.status })
    .from(dictionary)
    .where(eq(dictionary.id, numericId))
    .limit(1)

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
    await database.delete(dictionary).where(eq(dictionary.id, numericId))
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

  const database = await getDatabase()
  const updated = await database
    .update(dictionary)
    .set({ name: normalizedName, updatedAt: new Date().toISOString() })
    .where(eq(dictionary.id, numericId))
    .returning({ id: dictionary.id })
  if (updated.length === 0) throw new Error('词典不存在')
}

export async function updateDictionaryCustomCss(
  dictionaryId: string,
  customCss: string
): Promise<void> {
  const numericId = parseDictionaryId(dictionaryId)
  if (typeof customCss !== 'string') throw new Error('无效的自定义 CSS')
  if (customCss.length > 200_000) throw new Error('自定义 CSS 不能超过 200,000 个字符')

  const database = await getDatabase()
  const updated = await database
    .update(dictionary)
    .set({ customCss, updatedAt: new Date().toISOString() })
    .where(eq(dictionary.id, numericId))
    .returning({ id: dictionary.id })
  if (updated.length === 0) throw new Error('词典不存在')
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

  const client = await initializeDatabase()
  const currentRows = client
    .prepare('select id from dictionary order by sort_order, id')
    .all() as Array<{ id: number }>
  const currentIds = currentRows.map((row) => row.id)
  const currentSet = new Set(currentIds)
  if (requestedIds.some((id) => !currentSet.has(id))) throw new Error('词典不存在')

  const requestedSet = new Set(requestedIds)
  const completeOrder = [...requestedIds, ...currentIds.filter((id) => !requestedSet.has(id))]
  const updateOrder = client.prepare(
    `update dictionary
     set sort_order = ?, updated_at = ?
     where id = ?`
  )
  const applyOrder = client.transaction(() => {
    const updatedAt = new Date().toISOString()
    completeOrder.forEach((id, index) => updateOrder.run(index, updatedAt, id))
  })
  applyOrder()
}

export async function importDictionaryFromFile(mdxPath: string): Promise<ImportedDictionary> {
  await initializeDatabase()
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

  const client = await initializeDatabase()
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100)
  return client
    .prepare(
      `select
         de.normalized_word as normalizedWord,
         min(de.word) as word,
         count(distinct de.dictionary_id) as dictionaryCount
       from dictionary_entry de indexed by dictionary_entry_normalized_word_idx
       inner join dictionary d on d.id = de.dictionary_id
       where d.status = 'ready'
         and de.normalized_word >= ?
         and de.normalized_word < ?
         and instr(de.word, '@') = 0
         and instr(de.word, '#') = 0
         and instr(de.word, '_') = 0
       group by de.normalized_word
       order by de.normalized_word
       limit ?`
    )
    .all(normalizedPrefix, `${normalizedPrefix}\u{10ffff}`, safeLimit) as DictionarySearchResult[]
}

export async function lookupDictionaryEntryGroup(
  term: string
): Promise<DictionaryEntryGroup | null> {
  const normalizedTerm = term.trim().toLowerCase()
  if (!normalizedTerm) return null

  const client = await initializeDatabase()
  const matchedTerm = client
    .prepare(
      `select de.normalized_word as normalizedWord, min(de.word) as word
       from dictionary_entry de
       inner join dictionary d on d.id = de.dictionary_id
       where d.status = 'ready' and de.normalized_word = ?
       group by de.normalized_word`
    )
    .get(normalizedTerm) as { normalizedWord: string; word: string } | undefined
  if (!matchedTerm) return null
  return (await loadDictionaryEntryGroups(client, [matchedTerm]))[0] ?? null
}

async function loadDictionaryEntryGroups(
  client: Awaited<ReturnType<typeof initializeDatabase>>,
  terms: Array<{ normalizedWord: string; word: string }>
): Promise<DictionaryEntryGroup[]> {
  if (terms.length === 0) return []
  const placeholders = terms.map(() => '?').join(', ')
  const matches = client
    .prepare(
      `select
         de.normalized_word as normalizedWord,
         min(de.id) as entryId,
         d.id as dictionaryId,
         d.name as dictionaryName
       from dictionary_entry de
       inner join dictionary d on d.id = de.dictionary_id
       where d.status = 'ready' and de.normalized_word in (${placeholders})
       group by de.normalized_word, d.id, d.name
       order by de.normalized_word, d.sort_order, d.id`
    )
    .all(...terms.map((term) => term.normalizedWord)) as Array<{
    normalizedWord: string
    entryId: number
    dictionaryId: number
    dictionaryName: string
  }>
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

  const database = await getDatabase()
  const [row] = await database
    .select({
      id: dictionaryEntry.id,
      dictionaryId: dictionaryEntry.dictionaryId,
      dictionaryName: dictionary.name,
      word: dictionaryEntry.word,
      filePath: dictionaryFile.filePath,
      recordStartOffset: dictionaryEntry.recordStartOffset,
      recordEndOffset: dictionaryEntry.recordEndOffset,
      customCss: dictionary.customCss
    })
    .from(dictionaryEntry)
    .innerJoin(dictionary, eq(dictionary.id, dictionaryEntry.dictionaryId))
    .innerJoin(dictionaryFile, eq(dictionaryFile.id, dictionaryEntry.dictionaryFileId))
    .where(
      and(
        eq(dictionaryEntry.id, numericEntryId),
        eq(dictionary.status, 'ready'),
        eq(dictionaryFile.fileType, 'mdx')
      )
    )
    .limit(1)

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
