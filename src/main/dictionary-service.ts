import { asc, eq } from 'drizzle-orm'
import { app } from 'electron'
import { readdir, stat, cp, mkdir } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'

import { getDatabase } from './database'
import { dictionary, dictionaryFile } from './db/schema'

export type ReadyDictionary = {
  id: string
  name: string
  description: string | null
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

async function copyFile(sourcePath: string, targetPath: string): Promise<void> {
  await cp(sourcePath, targetPath)
}

export async function importDictionaryFromFile(mdxPath: string): Promise<ImportedDictionary> {
  const sourceDirectory = dirname(mdxPath)
  const selectedName = basename(mdxPath)
  const sourceEntries = await readdir(sourceDirectory, { withFileTypes: true })
  const sourceFiles = sourceEntries
    .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === '.mdd')
    .map((entry) => join(sourceDirectory, entry.name))
  const filesToMove = [mdxPath, ...sourceFiles]
  const targetDirectory = join(app.getPath('userData'), 'dictionaries', randomUUID())
  const database = await getDatabase()

  await mkdir(targetDirectory, { recursive: true })
  const [createdDictionary] = await database
    .insert(dictionary)
    .values({ name: basename(selectedName, extname(selectedName)), status: 'importing' })
    .returning()

  if (!createdDictionary) throw new Error('创建词典记录失败')

  try {
    const movedFiles: ImportedDictionary['files'] = []
    for (const sourcePath of filesToMove) {
      const fileName = basename(sourcePath)
      const targetPath = join(targetDirectory, fileName)
      await copyFile(sourcePath, targetPath)
      const fileStats = await stat(targetPath)
      const fileType = extname(fileName).toLowerCase() === '.mdx' ? 'mdx' : 'mdd'
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
      movedFiles.push({ id: String(createdFile.id), name: fileName, type: fileType })
    }

    const [readyDictionary] = await database
      .update(dictionary)
      .set({ status: 'ready', updatedAt: new Date().toISOString() })
      .where(eq(dictionary.id, createdDictionary.id))
      .returning()

    if (!readyDictionary) throw new Error('更新词典状态失败')

    return {
      id: String(readyDictionary.id),
      name: readyDictionary.name,
      status: 'ready',
      directory: targetDirectory,
      files: movedFiles
    }
  } catch (error) {
    await database
      .update(dictionary)
      .set({ status: 'error', updatedAt: new Date().toISOString() })
      .where(eq(dictionary.id, createdDictionary.id))
    throw error
  }
}
