import { MddList } from '@dictol/mdict-native'
import { readFile } from 'node:fs/promises'
import { dirname, extname, resolve, sep } from 'node:path'

import { getAppRunTime, type AppRuntime } from './app-runtime'
import type { DBService } from './db-service'

const dictionaryFiles = new Map<number, Promise<DictionaryResourceFiles | null>>()
const suspendedDictionaryResources = new Set<number>()

type DictionaryResourceFiles = {
  directory: string
  mddList: MddList | null
}

export type LoadedDictionaryResource = {
  bytes: Buffer
  mimeType: string
  source: 'cache' | 'local' | 'mdd'
}

export function invalidateDictionaryResources(dictionaryId: number): void {
  dictionaryFiles.delete(dictionaryId)
}

/** Stop new resource loads and wait for the current file-discovery promise to settle. */
export async function suspendDictionaryResources(dictionaryId: number): Promise<() => void> {
  suspendedDictionaryResources.add(dictionaryId)
  const pending = dictionaryFiles.get(dictionaryId)
  invalidateDictionaryResources(dictionaryId)
  if (pending) await pending.catch(() => undefined)
  return () => suspendedDictionaryResources.delete(dictionaryId)
}

export async function loadDictionaryResource(
  dictionaryId: number,
  resourcePath: string,
  runtime = getAppRunTime()
): Promise<LoadedDictionaryResource | null> {
  if (suspendedDictionaryResources.has(dictionaryId)) {
    console.debug('[DictionaryResource] lookup skipped: dictionary suspended', {
      dictionaryId,
      resourcePath
    })
    return null
  }

  const mimeType = getMimeType(resourcePath)
  console.debug('[DictionaryResource] lookup started', {
    dictionaryId,
    resourcePath,
    mimeType
  })

  const files = await getDictionaryResourceFiles(runtime, dictionaryId)
  if (!files) {
    console.debug('[DictionaryResource] lookup failed: dictionary files unavailable', {
      dictionaryId,
      resourcePath
    })
    return null
  }

  // Companion files are user-provided and must override extracted MDD data.
  // readFile is intentionally used as the existence check so a hit costs one
  // filesystem read instead of an access/stat call followed by another read.
  const local = await readLocalCompanion(files.directory, resourcePath)
  if (local) {
    console.debug('[DictionaryResource] local companion hit', {
      dictionaryId,
      resourcePath,
      byteLength: local.length
    })
    return { bytes: local, mimeType, source: 'local' }
  }

  const cached = await runtime.resourceCache.read(dictionaryId, resourcePath, mimeType)
  if (cached) {
    console.debug('[DictionaryResource] cache hit', {
      dictionaryId,
      resourcePath,
      byteLength: cached.length
    })
    return { bytes: cached, mimeType, source: 'cache' }
  }

  const extracted = files.mddList ? await readMddResource(files.mddList, resourcePath) : null
  if (!extracted) {
    console.debug('[DictionaryResource] lookup miss', {
      dictionaryId,
      resourcePath
    })
    return null
  }

  console.debug('[DictionaryResource] MDD hit', {
    dictionaryId,
    resourcePath,
    byteLength: extracted.length
  })

  try {
    await runtime.resourceCache.write(dictionaryId, resourcePath, mimeType, extracted)
  } catch (error) {
    console.warn('Failed to cache dictionary resource', error)
  }
  return { bytes: extracted, mimeType, source: 'mdd' }
}

async function getDictionaryResourceFiles(
  runtime: AppRuntime,
  dictionaryId: number
): Promise<DictionaryResourceFiles | null> {
  if (suspendedDictionaryResources.has(dictionaryId)) return null
  let pending = dictionaryFiles.get(dictionaryId)
  if (!pending) {
    pending = loadDictionaryResourceFiles(runtime, dictionaryId)
    dictionaryFiles.set(dictionaryId, pending)
  }
  return pending
}

async function loadDictionaryResourceFiles(
  runtime: AppRuntime,
  dictionaryId: number
): Promise<DictionaryResourceFiles | null> {
  const rows = await requireDBService(runtime).listDictionaryResourceFiles(dictionaryId)

  const firstFile = rows[0]
  if (!firstFile) return null
  const mddPaths = rows
    .filter((row) => row.fileType === 'mdd')
    .sort((left, right) => mddOrder(left.fileName) - mddOrder(right.fileName))
    .map((row) => row.filePath)
  return {
    directory: firstFile.dictPath ?? dirname(firstFile.filePath),
    mddList: mddPaths.length > 0 ? runtime.mdFileCache.fetchMddList(mddPaths) : null
  }
}

function mddOrder(fileName: string): number {
  const part = /\.(\d+)\.mdd$/i.exec(fileName)?.[1]
  return part === undefined ? 0 : Number(part) + 1
}

async function readLocalCompanion(directory: string, resourcePath: string): Promise<Buffer | null> {
  const root = resolve(directory)
  const target = resolve(root, ...resourcePath.split('/'))
  if (target !== root && !target.startsWith(`${root}${sep}`)) return null

  try {
    return await readFile(target)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

async function readMddResource(mdd: MddList, resourcePath: string): Promise<Buffer | null> {
  const pathWithBackslashes = resourcePath.replaceAll('/', '\\')
  const candidates = Array.from(
    new Set([
      pathWithBackslashes.startsWith('\\') ? pathWithBackslashes : `\\${pathWithBackslashes}`,
      pathWithBackslashes,
      resourcePath.startsWith('/') ? resourcePath : `/${resourcePath}`
    ])
  )

  for (const candidate of candidates) {
    const entry = await mdd.findKey(candidate)
    if (entry) {
      return mdd.readRecord(entry.volume, entry.recordStart, entry.recordEnd)
    }
  }
  return null
}

function requireDBService(runtime: AppRuntime): DBService {
  if (!runtime.dbService) throw new Error('资源协议启动前必须初始化 DBService')
  return runtime.dbService
}

function getMimeType(resourcePath: string): string {
  switch (extname(resourcePath).toLowerCase()) {
    case '.css':
      return 'text/css; charset=utf-8'
    case '.js':
      return 'text/javascript; charset=utf-8'
    case '.html':
    case '.htm':
      return 'text/html; charset=utf-8'
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.gif':
      return 'image/gif'
    case '.webp':
      return 'image/webp'
    case '.svg':
      return 'image/svg+xml'
    case '.mp3':
      return 'audio/mpeg'
    case '.wav':
      return 'audio/wav'
    case '.ogg':
    case '.oga':
      return 'audio/ogg'
    case '.spx':
      return 'audio/x-speex'
    case '.m4a':
      return 'audio/mp4'
    case '.woff':
      return 'font/woff'
    case '.woff2':
      return 'font/woff2'
    case '.ttf':
      return 'font/ttf'
    case '.otf':
      return 'font/otf'
    default:
      return 'application/octet-stream'
  }
}
