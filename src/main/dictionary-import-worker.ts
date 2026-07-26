import { MdictDictionary } from '@dictol/mdict-native'
import { constants } from 'node:fs'
import { copyFile, mkdir, readdir, stat } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { parentPort, workerData } from 'node:worker_threads'

import { openDrizzleDB } from './db/drizzle'
import { DictionaryEntryRepository } from './db/repository/dictionary-entry-repository'
import { DictionaryFileRepository } from './db/repository/dictionary-file-repository'
import { DictionaryRepository } from './db/repository/dictionary-repository'

const IMPORT_BATCH_SIZE = 2_000

type ImportWorkerData = {
  databasePath: string
  mdxPath: string
  userDataPath: string
  targetDirectoryName: string
}

type ImportedDictionary = {
  id: string
  name: string
  status: 'ready'
  directory: string
  files: Array<{ id: string; name: string; type: 'mdx' | 'mdd' }>
}

const input = workerData as ImportWorkerData

void importDictionary(input)
  .then((value) => parentPort?.postMessage({ ok: true, value }))
  .catch((error: unknown) => {
    parentPort?.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    })
  })
  .finally(() => parentPort?.close())

async function importDictionary(data: ImportWorkerData): Promise<ImportedDictionary> {
  const { db: connection, orm } = openDrizzleDB(data.databasePath)
  const dictionaryRepo = new DictionaryRepository(orm)
  const dictionaryFileRepo = new DictionaryFileRepository(orm)
  const dictionaryEntryRepo = new DictionaryEntryRepository(orm)
  const sourceDirectory = dirname(data.mdxPath)
  const selectedName = basename(data.mdxPath)
  const targetDirectory = join(data.userDataPath, 'dictionaries', data.targetDirectoryName)
  let dictionaryId: number | undefined

  try {
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

    await mkdir(targetDirectory, { recursive: true })
    dictionaryId = await dictionaryRepo.createImporting(
      basename(selectedName, extname(selectedName)),
      targetDirectory
    )

    const copiedFiles: ImportedDictionary['files'] = []
    let mdxFileId: number | undefined
    let mdxTargetPath: string | undefined

    for (const sourcePath of [data.mdxPath, ...sourceFiles]) {
      const fileName = basename(sourcePath)
      const targetPath = join(targetDirectory, fileName)
      await copyFile(sourcePath, targetPath, constants.COPYFILE_FICLONE)
      const fileStats = await stat(targetPath)
      const extension = extname(fileName).toLowerCase()
      const fileType = extension === '.mdx' ? 'mdx' : extension === '.mdd' ? 'mdd' : undefined
      if (!fileType) continue

      const fileId = await dictionaryFileRepo.create({
        dictionaryId,
        fileName,
        filePath: targetPath,
        fileType,
        fileSize: fileStats.size
      })
      copiedFiles.push({ id: String(fileId), name: fileName, type: fileType })
      if (fileType === 'mdx') {
        mdxFileId = fileId
        mdxTargetPath = targetPath
      }
    }

    if (dictionaryId === undefined || mdxFileId === undefined || mdxTargetPath === undefined) {
      throw new Error('未找到 MDX 文件')
    }
    const importedDictionaryId = dictionaryId

    const mdx = MdictDictionary.open(mdxTargetPath)
    const metadata = mdx.metadata
    const scanner = mdx.createScanner()
    await dictionaryFileRepo.updateFormatMetadata(mdxFileId, {
      formatVersion: String(metadata.engineVersion),
      isEncrypted: metadata.encrypted !== 0
    })

    let importedEntries = 0n
    let batchNumber = 0
    while (true) {
      const batch = await scanner.nextBatch(IMPORT_BATCH_SIZE)
      batchNumber += 1
      if (batch.entries.length > 0) {
        try {
          await dictionaryEntryRepo.insertBatch(
            batch.entries.map((entry) => ({
              dictionaryId: importedDictionaryId,
              dictionaryFileId: mdxFileId,
              word: entry.keyText,
              normalizedWord: entry.keyText.toLowerCase(),
              recordStartOffset: toSafeNumber(entry.recordStart, 'record start offset'),
              recordEndOffset: toSafeNumber(entry.recordEnd, 'record end offset'),
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

    const readyName = metadata.title || basename(selectedName, extname(selectedName))
    await dictionaryRepo.markReady(importedDictionaryId, {
      name: readyName,
      description: metadata.description || null,
      recordCount: toSafeNumber(metadata.entryCount, 'record count')
    })

    return {
      id: String(importedDictionaryId),
      name: readyName,
      status: 'ready',
      directory: targetDirectory,
      files: copiedFiles
    }
  } catch (error) {
    if (dictionaryId !== undefined) {
      try {
        await dictionaryRepo.markError(dictionaryId)
      } catch (statusError) {
        console.error('Failed to mark dictionary import as errored', statusError)
      }
    }
    throw error
  } finally {
    connection.close()
  }
}

function toSafeNumber(value: number | bigint, field: string): number {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`${field} 超出 SQLite/JavaScript 安全整数范围：${value}`)
  }
  return number
}
