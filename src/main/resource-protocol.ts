import { MdictDictionary } from '@dictol/mdict-native'
import { asc, eq } from 'drizzle-orm'
import { app, protocol } from 'electron'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, extname, join, resolve, sep } from 'node:path'

import { getDatabase } from './database'
import { dictionary, dictionaryFile } from './db/schema'
import { getDictionaryEntryContent } from './dictionary-service'
import { createEntryDocument } from './entry-document'
import { getMdictDictionary } from './mdict-runtime'

const RESOURCE_SCHEME = 'dictol-resource'
const ENTRY_SCHEME = 'dictol-entry'
const ENTRY_BRIDGE_URL = `${ENTRY_SCHEME}://app/entry-bridge.js`
const dictionaryFiles = new Map<number, Promise<DictionaryResourceFiles | null>>()
let registered = false
let entryBridgeSource: Promise<Buffer> | undefined

type DictionaryResourceFiles = {
  directory: string
  mdds: MdictDictionary[]
}

export type LoadedDictionaryResource = {
  bytes: Buffer
  mimeType: string
  source: 'cache' | 'local' | 'mdd'
}

export function registerResourceScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: RESOURCE_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true
      }
    },
    {
      scheme: ENTRY_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true
      }
    }
  ])
}

export function registerResourceProtocol(): void {
  if (registered) return
  registered = true
  protocol.handle(RESOURCE_SCHEME, handleResourceRequest)
  protocol.handle(ENTRY_SCHEME, handleEntryRequest)
}

export function invalidateDictionaryResources(dictionaryId: number): void {
  dictionaryFiles.delete(dictionaryId)
}

async function handleEntryRequest(request: Request): Promise<Response> {
  try {
    if (request.url === ENTRY_BRIDGE_URL) {
      return response(await loadEntryBridgeSource(), 'text/javascript; charset=utf-8')
    }

    const url = new URL(request.url)
    const dictionaryId = /^dictionary-(\d+)$/.exec(url.hostname)?.[1]
    const entryId = decodeURIComponent(url.pathname).replace(/^\/+/, '')
    if (!dictionaryId || !entryId) {
      return response('Invalid entry URL', 'text/plain; charset=utf-8', 400)
    }

    const entry = await getDictionaryEntryContent(entryId)
    if (!entry) return response('Entry not found', 'text/plain; charset=utf-8', 404)
    if (entry.dictionaryId !== dictionaryId) {
      return response('Dictionary mismatch', 'text/plain; charset=utf-8', 404)
    }
    return response(
      createEntryDocument(entry.html, entry.dictionaryId, entry.customCss),
      'text/html; charset=utf-8'
    )
  } catch (error) {
    console.error('Failed to load dictionary entry', error)
    return response('Failed to load entry', 'text/plain; charset=utf-8', 500)
  }
}

async function loadEntryBridgeSource(): Promise<Buffer> {
  entryBridgeSource ??= readFirstAvailableFile([
    join(app.getAppPath(), 'resources', 'entry-bridge.js'),
    join(app.getAppPath(), '..', 'resources', 'entry-bridge.js')
  ])
  try {
    return await entryBridgeSource
  } catch (error) {
    entryBridgeSource = undefined
    throw error
  }
}

async function readFirstAvailableFile(paths: string[]): Promise<Buffer> {
  for (const path of paths) {
    try {
      return await readFile(path)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  throw new Error(`Entry bridge script not found in: ${paths.join(', ')}`)
}

async function handleResourceRequest(request: Request): Promise<Response> {
  try {
    const parsed = parseDictionaryResourceUrl(request.url)
    if (!parsed) return response('Invalid resource URL', 'text/plain; charset=utf-8', 400)

    const resource = await loadDictionaryResource(parsed.dictionaryId, parsed.resourcePath)
    return resource
      ? response(resource.bytes, resource.mimeType)
      : response('Resource not found', 'text/plain; charset=utf-8', 404)
  } catch (error) {
    console.error('Failed to load dictionary resource', error)
    return response('Failed to load resource', 'text/plain; charset=utf-8', 500)
  }
}

export function parseDictionaryResourceUrl(
  value: string
): { dictionaryId: number; resourcePath: string } | null {
  const url = new URL(value)
  if (url.protocol !== `${RESOURCE_SCHEME}:` || url.hostname !== 'dictionary') return null

  const pathSegments = decodeURIComponent(url.pathname).split('/').filter(Boolean)
  const dictionaryId = Number(pathSegments.shift())
  const resourcePath = pathSegments.join('/')
  if (!Number.isSafeInteger(dictionaryId) || dictionaryId <= 0 || !resourcePath) return null
  return { dictionaryId, resourcePath }
}

export async function loadDictionaryResource(
  dictionaryId: number,
  resourcePath: string
): Promise<LoadedDictionaryResource | null> {
  const mimeType = getMimeType(resourcePath)
  const cached = await readCachedResource(dictionaryId, resourcePath, mimeType)
  if (cached) return { bytes: cached, mimeType, source: 'cache' }

  const files = await getDictionaryResourceFiles(dictionaryId)
  if (!files) return null

  const local = await readLocalCompanion(files.directory, resourcePath)
  if (local) return { bytes: local, mimeType, source: 'local' }

  const extracted = await readMddResource(files.mdds, resourcePath)
  if (!extracted) return null

  try {
    await cacheResource(dictionaryId, resourcePath, mimeType, extracted)
  } catch (error) {
    console.warn('Failed to cache dictionary resource', error)
  }
  return { bytes: extracted, mimeType, source: 'mdd' }
}

async function getDictionaryResourceFiles(
  dictionaryId: number
): Promise<DictionaryResourceFiles | null> {
  let pending = dictionaryFiles.get(dictionaryId)
  if (!pending) {
    pending = loadDictionaryResourceFiles(dictionaryId)
    dictionaryFiles.set(dictionaryId, pending)
  }
  return pending
}

async function loadDictionaryResourceFiles(
  dictionaryId: number
): Promise<DictionaryResourceFiles | null> {
  const database = await getDatabase()
  const rows = await database
    .select({
      dictPath: dictionary.dictPath,
      fileName: dictionaryFile.fileName,
      filePath: dictionaryFile.filePath,
      fileType: dictionaryFile.fileType
    })
    .from(dictionaryFile)
    .innerJoin(dictionary, eq(dictionary.id, dictionaryFile.dictionaryId))
    .where(eq(dictionaryFile.dictionaryId, dictionaryId))
    .orderBy(asc(dictionaryFile.fileName), asc(dictionaryFile.id))

  const firstFile = rows[0]
  if (!firstFile) return null
  return {
    directory: firstFile.dictPath ?? dirname(firstFile.filePath),
    mdds: rows
      .filter((row) => row.fileType === 'mdd')
      .sort((left, right) => mddOrder(left.fileName) - mddOrder(right.fileName))
      .map((row) => getMdictDictionary(row.filePath))
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

async function readMddResource(
  mdds: MdictDictionary[],
  resourcePath: string
): Promise<Buffer | null> {
  const pathWithBackslashes = resourcePath.replaceAll('/', '\\')
  const candidates = Array.from(
    new Set([
      pathWithBackslashes.startsWith('\\') ? pathWithBackslashes : `\\${pathWithBackslashes}`,
      pathWithBackslashes,
      resourcePath.startsWith('/') ? resourcePath : `/${resourcePath}`
    ])
  )

  for (const candidate of candidates) {
    const entries = await Promise.all(
      mdds.map((dictionary) => dictionary.lookupKeyBlockByWord(candidate))
    )
    const index = entries.findIndex((entry) => entry !== null)
    const entry = entries[index]
    if (index >= 0 && entry) {
      return mdds[index].readRecord(entry.recordStart, entry.recordEnd)
    }
  }
  return null
}

async function readCachedResource(
  dictionaryId: number,
  resourcePath: string,
  mimeType: string
): Promise<Buffer | null> {
  const cachePath = getCachePath(dictionaryId, resourcePath, mimeType)
  if (!cachePath) return null
  try {
    return await readFile(cachePath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

async function cacheResource(
  dictionaryId: number,
  resourcePath: string,
  mimeType: string,
  bytes: Buffer
): Promise<void> {
  const cachePath = getCachePath(dictionaryId, resourcePath, mimeType)
  if (!cachePath) return
  await mkdir(dirname(cachePath), { recursive: true })
  await writeFile(cachePath, bytes)
}

function getCachePath(dictionaryId: number, resourcePath: string, mimeType: string): string | null {
  const category = mimeType.startsWith('image/')
    ? 'images'
    : mimeType.startsWith('audio/')
      ? 'audio'
      : null
  if (!category) return null

  const digest = createHash('sha256').update(`${dictionaryId}\0${resourcePath}`).digest('hex')
  const extension = extname(resourcePath)
    .toLowerCase()
    .replace(/[^.a-z0-9]/g, '')
  return join(
    app.getPath('userData'),
    'resource-cache',
    String(dictionaryId),
    category,
    `${digest}${extension}`
  )
}

function response(body: Buffer | string, contentType: string, status = 200): Response {
  return new Response(typeof body === 'string' ? body : new Uint8Array(body), {
    status,
    headers: {
      'content-type': contentType,
      'access-control-allow-origin': '*',
      'cache-control': 'no-cache'
    }
  })
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
    default:
      return 'application/octet-stream'
  }
}
