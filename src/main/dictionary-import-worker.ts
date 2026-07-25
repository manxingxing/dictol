import { MdictDictionary, type DictionaryEntry } from '@dictol/mdict-native'
import { constants } from 'node:fs'
import { copyFile, mkdir, readdir, stat } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { parentPort, workerData } from 'node:worker_threads'

import { openDatabaseConnection } from './database'

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
  const database = openDatabaseConnection(data.databasePath)
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
    const dictionaryInsert = database
      .prepare(
        `insert into dictionary (name, dict_path, status, sort_order)
         select ?, ?, 'importing', coalesce(max(sort_order), -1) + 1
         from dictionary`
      )
      .run(basename(selectedName, extname(selectedName)), targetDirectory)
    dictionaryId = toSafeNumber(dictionaryInsert.lastInsertRowid, 'dictionary id')

    const copiedFiles: ImportedDictionary['files'] = []
    const insertFile = database.prepare(
      `insert into dictionary_file
        (dictionary_id, file_name, file_path, file_type, file_size)
       values (?, ?, ?, ?, ?)`
    )
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

      const fileInsert = insertFile.run(
        dictionaryId,
        fileName,
        targetPath,
        fileType,
        fileStats.size
      )
      const fileId = toSafeNumber(fileInsert.lastInsertRowid, 'dictionary file id')
      copiedFiles.push({ id: String(fileId), name: fileName, type: fileType })
      if (fileType === 'mdx') {
        mdxFileId = fileId
        mdxTargetPath = targetPath
      }
    }

    if (mdxFileId === undefined || mdxTargetPath === undefined) throw new Error('未找到 MDX 文件')

    const mdx = MdictDictionary.open(mdxTargetPath)
    const metadata = mdx.metadata
    const scanner = mdx.createScanner()
    database
      .prepare(
        `update dictionary_file
         set format_version = ?, is_encrypted = ?, updated_at = ?
         where id = ?`
      )
      .run(
        String(metadata.engineVersion),
        metadata.encrypted !== 0 ? 1 : 0,
        new Date().toISOString(),
        mdxFileId
      )

    const insertEntry = database.prepare(
      `insert into dictionary_entry
        (dictionary_id, dictionary_file_id, word, normalized_word,
         record_start_offset, record_end_offset, key_block_idx)
       values (?, ?, ?, ?, ?, ?, ?)`
    )
    const insertBatch = database.transaction((entries: DictionaryEntry[]) => {
      for (const entry of entries) {
        insertEntry.run(
          dictionaryId,
          mdxFileId,
          entry.keyText,
          entry.keyText.toLowerCase(),
          toSafeNumber(entry.recordStart, 'record start offset'),
          toSafeNumber(entry.recordEnd, 'record end offset'),
          entry.keyBlock
        )
      }
    })

    let importedEntries = 0n
    let batchNumber = 0
    while (true) {
      const batch = await scanner.nextBatch(IMPORT_BATCH_SIZE)
      batchNumber += 1
      if (batch.entries.length > 0) {
        try {
          insertBatch(batch.entries)
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
    database
      .prepare(
        `update dictionary
         set name = ?, description = ?, record_count = ?, status = 'ready', updated_at = ?
         where id = ?`
      )
      .run(
        readyName,
        metadata.description || null,
        toSafeNumber(metadata.entryCount, 'record count'),
        new Date().toISOString(),
        dictionaryId
      )

    return {
      id: String(dictionaryId),
      name: readyName,
      status: 'ready',
      directory: targetDirectory,
      files: copiedFiles
    }
  } catch (error) {
    if (dictionaryId !== undefined) {
      try {
        database
          .prepare("update dictionary set status = 'error', updated_at = ? where id = ?")
          .run(new Date().toISOString(), dictionaryId)
      } catch (statusError) {
        console.error('Failed to mark dictionary import as errored', statusError)
      }
    }
    throw error
  } finally {
    database.close()
  }
}

function toSafeNumber(value: number | bigint, field: string): number {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`${field} 超出 SQLite/JavaScript 安全整数范围：${value}`)
  }
  return number
}
