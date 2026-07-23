import { and, asc, eq, gte, lt } from 'drizzle-orm'
import { app } from 'electron'
import { readdir, stat, cp, mkdir } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'

import { getDatabase } from './database'
import { dictionary, dictionaryEntry, dictionaryFile } from './db/schema'
import { decodeMdxRecord, getMdictDictionary } from './mdict-runtime'

export type ReadyDictionary = {
  id: string
  name: string
  description: string | null
  recordCount: string | null
  status: 'ready'
  createdAt: string
  updatedAt: string
}

export async function listReadyDictionaries(): Promise<ReadyDictionary[]> {
  const database = await getDatabase()
  const rows = await database
    .select()
    .from(dictionary)
    .where(eq(dictionary.status, 'ready'))
    .orderBy(asc(dictionary.name), asc(dictionary.id))

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

export type DictionarySearchResult = {
  id: string
  dictionaryId: string
  dictionaryName: string
  word: string
}

export type DictionaryEntryContent = {
  id: string
  dictionaryId: string
  dictionaryName: string
  word: string
  html: string
}

async function copyFile(sourcePath: string, targetPath: string): Promise<void> {
  await cp(sourcePath, targetPath)
}

export async function importDictionaryFromFile(mdxPath: string): Promise<ImportedDictionary> {
  const sourceDirectory = dirname(mdxPath)
  const selectedName = basename(mdxPath)
  const sourceEntries = await readdir(sourceDirectory, { withFileTypes: true })
  const companionExtensions = new Set(['.mdd', '.css', '.js', '.png'])
  const sourceFiles = sourceEntries
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name !== selectedName &&
        companionExtensions.has(extname(entry.name).toLowerCase())
    )
    .map((entry) => join(sourceDirectory, entry.name))
  const filesToCopy = [mdxPath, ...sourceFiles]
  const targetDirectory = join(app.getPath('userData'), 'dictionaries', randomUUID())
  const database = await getDatabase()

  await mkdir(targetDirectory, { recursive: true })
  const [createdDictionary] = await database
    .insert(dictionary)
    .values({
      name: basename(selectedName, extname(selectedName)),
      dictPath: targetDirectory,
      status: 'importing'
    })
    .returning()

  if (!createdDictionary) throw new Error('创建词典记录失败')

  try {
    const copiedFiles: ImportedDictionary['files'] = []
    let mdxFileId: number | undefined
    let mdxTargetPath: string | undefined
    for (const sourcePath of filesToCopy) {
      const fileName = basename(sourcePath)
      const targetPath = join(targetDirectory, fileName)
      await copyFile(sourcePath, targetPath)
      const fileStats = await stat(targetPath)
      const extension = extname(fileName).toLowerCase()
      const fileType = extension === '.mdx' ? 'mdx' : extension === '.mdd' ? 'mdd' : undefined
      if (fileType) {
        const [createdFile] = await database
          .insert(dictionaryFile)
          .values({
            dictionaryId: createdDictionary.id,
            fileName,
            filePath: targetPath,
            fileType,
            fileSize: fileStats.size
          })
          .returning()

        if (!createdFile) throw new Error(`创建词典文件记录失败：${fileName}`)
        copiedFiles.push({ id: String(createdFile.id), name: fileName, type: fileType })
        if (fileType === 'mdx') {
          mdxFileId = createdFile.id
          mdxTargetPath = targetPath
        }
      }
    }

    if (mdxFileId === undefined || mdxTargetPath === undefined) {
      throw new Error('未找到 MDX 文件')
    }

    const mdx = getMdictDictionary(mdxTargetPath)
    const metadata = mdx.metadata
    const scanner = mdx.createScanner()
    await database
      .update(dictionaryFile)
      .set({
        formatVersion: String(metadata.engineVersion),
        isEncrypted: metadata.encrypted !== 0,
        updatedAt: new Date().toISOString()
      })
      .where(eq(dictionaryFile.id, mdxFileId))

    let importedEntries = 0n
    let batchNumber = 0
    while (true) {
      const batch = await scanner.nextBatch(5_000)
      batchNumber += 1
      if (batch.entries.length > 0) {
        try {
          await database.insert(dictionaryEntry).values(
            batch.entries.map((entry) => ({
              dictionaryId: createdDictionary.id,
              dictionaryFileId: mdxFileId,
              word: entry.keyText,
              normalizedWord: entry.keyText.toLowerCase(),
              recordStartOffset: entry.recordStart,
              recordEndOffset: entry.recordEnd,
              keyBlockIdx: entry.keyBlock
            }))
          )
        } catch (error) {
          const firstWord = batch.entries[0]?.keyText ?? ''
          const lastWord = batch.entries.at(-1)?.keyText ?? ''
          throw new Error(
            `第 ${batchNumber} 批词条写入失败（已成功 ${importedEntries} 条，本批 ${batch.entries.length} 条，范围 ${JSON.stringify(firstWord)}–${JSON.stringify(lastWord)}）`,
            { cause: error }
          )
        }
        importedEntries += BigInt(batch.entries.length)
      }
      if (batch.done) break
    }

    if (importedEntries !== metadata.entryCount) {
      throw new Error(
        `词条数量不一致：Header 声明 ${metadata.entryCount}，实际导入 ${importedEntries}`
      )
    }

    const [readyDictionary] = await database
      .update(dictionary)
      .set({
        name: metadata.title || createdDictionary.name,
        description: metadata.description || null,
        recordCount: metadata.entryCount,
        status: 'ready',
        updatedAt: new Date().toISOString()
      })
      .where(eq(dictionary.id, createdDictionary.id))
      .returning()

    if (!readyDictionary) throw new Error('更新词典状态失败')

    return {
      id: String(readyDictionary.id),
      name: readyDictionary.name,
      status: 'ready',
      directory: targetDirectory,
      files: copiedFiles
    }
  } catch (error) {
    await database
      .update(dictionary)
      .set({ status: 'error', updatedAt: new Date().toISOString() })
      .where(eq(dictionary.id, createdDictionary.id))
    throw error
  }
}

export async function searchDictionaryEntries(
  prefix: string,
  limit = 50
): Promise<DictionarySearchResult[]> {
  const normalizedPrefix = prefix.trim().toLowerCase()
  if (!normalizedPrefix) return []

  const database = await getDatabase()
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100)
  const rows = await database
    .select({
      id: dictionaryEntry.id,
      dictionaryId: dictionaryEntry.dictionaryId,
      dictionaryName: dictionary.name,
      word: dictionaryEntry.word
    })
    .from(dictionaryEntry)
    .innerJoin(dictionary, eq(dictionary.id, dictionaryEntry.dictionaryId))
    .where(
      and(
        eq(dictionary.status, 'ready'),
        gte(dictionaryEntry.normalizedWord, normalizedPrefix),
        lt(dictionaryEntry.normalizedWord, `${normalizedPrefix}\u{10ffff}`)
      )
    )
    .orderBy(
      asc(dictionaryEntry.normalizedWord),
      asc(dictionaryEntry.word),
      asc(dictionaryEntry.dictionaryId),
      asc(dictionaryEntry.id)
    )
    .limit(safeLimit)

  return rows.map((row) => ({
    id: String(row.id),
    dictionaryId: String(row.dictionaryId),
    dictionaryName: row.dictionaryName,
    word: row.word
  }))
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
      recordEndOffset: dictionaryEntry.recordEndOffset
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
  const html = await readResolvedMdxRecord(
    mdx,
    row.recordStartOffset,
    row.recordEndOffset,
    new Set([row.word.toLowerCase()])
  )
  return {
    id: String(row.id),
    dictionaryId: String(row.dictionaryId),
    dictionaryName: row.dictionaryName,
    word: row.word,
    html
  }
}

async function readResolvedMdxRecord(
  mdx: ReturnType<typeof getMdictDictionary>,
  start: bigint,
  end: bigint,
  visited: Set<string>,
  depth = 0
): Promise<string> {
  const bytes = await mdx.readRecord(start, end)
  const html = decodeMdxRecord(bytes, mdx.metadata.encoding)
  const target = /^@@@LINK=(.+)$/i.exec(html.trim())?.[1]?.trim()
  if (!target || depth >= 8) return html

  const normalizedTarget = target.toLowerCase()
  if (visited.has(normalizedTarget)) return html
  visited.add(normalizedTarget)

  const targetEntry = await mdx.lookupKeyBlockByWord(target)
  if (!targetEntry) return html
  return readResolvedMdxRecord(
    mdx,
    targetEntry.recordStart,
    targetEntry.recordEnd,
    visited,
    depth + 1
  )
}
