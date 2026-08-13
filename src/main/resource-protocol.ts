import { MddList } from '@dictol/mdict-native'
import { app, protocol } from 'electron'
import { readFile } from 'node:fs/promises'
import { dirname, extname, join, resolve, sep } from 'node:path'

import { getAppRunTime, type AppRuntime } from './app-runtime'
import type { DBService } from './db-service'
import { DICTIONARY_RESOURCE_SCHEME, parseDictionaryResourceUrl } from './dictionary-resource-url'
import { readDictionaryEntryText } from './dictionary-entry-content'
import { createEntryDocument } from './entry-document'
import { ENTRY_BRIDGE_URL, ENTRY_GLOBAL_STYLE_URL, ENTRY_SCHEME } from './entry-assets'

const MAX_PREPARED_ENTRY_DOCUMENTS = 32
const STATIC_RESOURCE_CACHE_CONTROL = 'public, max-age=31536000, immutable'
const dictionaryFiles = new Map<number, Promise<DictionaryResourceFiles | null>>()
const suspendedDictionaryResources = new Set<number>()
const preparedEntryDocuments = new Map<string, string>()
let registered = false
const entryAssetSources = new Map<string, Promise<Buffer>>()

const ENTRY_ASSETS = new Map([
  [ENTRY_BRIDGE_URL, { fileName: 'entry-bridge.js', mimeType: 'text/javascript; charset=utf-8' }],
  [
    ENTRY_GLOBAL_STYLE_URL,
    { fileName: 'dictionary-entry.css', mimeType: 'text/css; charset=utf-8' }
  ]
])

type DictionaryResourceFiles = {
  directory: string
  mddList: MddList | null
}

export type LoadedDictionaryResource = {
  bytes: Buffer
  mimeType: string
  source: 'cache' | 'local' | 'mdd'
}

export function registerResourceScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: DICTIONARY_RESOURCE_SCHEME,
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

export function registerResourceProtocol(runtime = getAppRunTime()): void {
  if (registered) return
  registered = true
  protocol.handle(DICTIONARY_RESOURCE_SCHEME, (request) => handleResourceRequest(runtime, request))
  protocol.handle(ENTRY_SCHEME, (request) => handleEntryRequest(runtime, request))
}

export function invalidateDictionaryResources(dictionaryId: number): void {
  dictionaryFiles.delete(dictionaryId)
  const prefix = `${dictionaryId}/`
  for (const key of preparedEntryDocuments.keys()) {
    if (key.startsWith(prefix)) preparedEntryDocuments.delete(key)
  }
}

/** Stop new resource loads and wait for the current file-discovery promise to settle. */
export async function suspendDictionaryResources(dictionaryId: number): Promise<() => void> {
  suspendedDictionaryResources.add(dictionaryId)
  const pending = dictionaryFiles.get(dictionaryId)
  invalidateDictionaryResources(dictionaryId)
  if (pending) await pending.catch(() => undefined)
  return () => suspendedDictionaryResources.delete(dictionaryId)
}

export function prepareEntryDocument(
  dictionaryId: string,
  entryId: string,
  document: string
): void {
  const key = entryDocumentKey(dictionaryId, entryId)
  preparedEntryDocuments.delete(key)
  preparedEntryDocuments.set(key, document)

  while (preparedEntryDocuments.size > MAX_PREPARED_ENTRY_DOCUMENTS) {
    const oldestKey = preparedEntryDocuments.keys().next().value
    if (oldestKey === undefined) break
    preparedEntryDocuments.delete(oldestKey)
  }
}

export function hasPreparedEntryDocument(dictionaryId: string, entryId: string): boolean {
  return preparedEntryDocuments.has(entryDocumentKey(dictionaryId, entryId))
}

async function handleEntryRequest(runtime: AppRuntime, request: Request): Promise<Response> {
  try {
    const entryAsset = ENTRY_ASSETS.get(request.url)
    if (entryAsset) {
      return response(
        await loadEntryAssetSource(entryAsset.fileName),
        entryAsset.mimeType,
        200,
        'no-cache'
      )
    }

    const url = new URL(request.url)
    const dictionaryId = /^dictionary-(\d+)$/.exec(url.hostname)?.[1]
    const entryId = decodeURIComponent(url.pathname).replace(/^\/+/, '')
    if (!dictionaryId || !entryId) {
      return response('Invalid entry URL', 'text/plain; charset=utf-8', 400)
    }

    const preparedDocument = getPreparedEntryDocument(dictionaryId, entryId)
    if (preparedDocument !== undefined) {
      return response(preparedDocument, 'text/html; charset=utf-8')
    }

    const records = await requireDBService(runtime).getDictionaryEntryRecords(entryId)
    const record = records[0]
    if (!record) return response('Entry not found', 'text/plain; charset=utf-8', 404)
    if (record.dictionaryId !== dictionaryId) {
      return response('Dictionary mismatch', 'text/plain; charset=utf-8', 404)
    }
    const html = await readDictionaryEntryText(runtime, records)
    return response(
      createEntryDocument(html, record.dictionaryId, record.customCss),
      'text/html; charset=utf-8'
    )
  } catch (error) {
    console.error('Failed to load dictionary entry', error)
    return response('Failed to load entry', 'text/plain; charset=utf-8', 500)
  }
}

async function loadEntryAssetSource(fileName: string): Promise<Buffer> {
  let source = entryAssetSources.get(fileName)
  if (!source) {
    source = readFirstAvailableFile([
      join(app.getAppPath(), 'resources', fileName),
      join(app.getAppPath(), '..', 'resources', fileName)
    ])
    entryAssetSources.set(fileName, source)
  }
  try {
    return await source
  } catch (error) {
    entryAssetSources.delete(fileName)
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
  throw new Error(`Entry asset not found in: ${paths.join(', ')}`)
}

async function handleResourceRequest(runtime: AppRuntime, request: Request): Promise<Response> {
  try {
    const parsed = parseDictionaryResourceUrl(request.url)
    if (!parsed) return response('Invalid resource URL', 'text/plain; charset=utf-8', 400)

    const resource = await loadDictionaryResource(parsed.dictionaryId, parsed.resourcePath, runtime)
    return resource
      ? response(resource.bytes, resource.mimeType, 200, STATIC_RESOURCE_CACHE_CONTROL)
      : response('Resource not found', 'text/plain; charset=utf-8', 404)
  } catch (error) {
    console.error('Failed to load dictionary resource', error)
    return response('Failed to load resource', 'text/plain; charset=utf-8', 500)
  }
}

export { parseDictionaryResourceUrl }

export async function loadDictionaryResource(
  dictionaryId: number,
  resourcePath: string,
  runtime = getAppRunTime()
): Promise<LoadedDictionaryResource | null> {
  if (suspendedDictionaryResources.has(dictionaryId)) return null
  const mimeType = getMimeType(resourcePath)
  const cached = await runtime.resourceCache.read(dictionaryId, resourcePath, mimeType)
  if (cached) return { bytes: cached, mimeType, source: 'cache' }

  const files = await getDictionaryResourceFiles(runtime, dictionaryId)
  if (!files) return null

  const local = await readLocalCompanion(files.directory, resourcePath)
  if (local) return { bytes: local, mimeType, source: 'local' }

  const extracted = files.mddList ? await readMddResource(files.mddList, resourcePath) : null
  if (!extracted) return null

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

function entryDocumentKey(dictionaryId: string, entryId: string): string {
  return `${dictionaryId}/${entryId}`
}

function getPreparedEntryDocument(dictionaryId: string, entryId: string): string | undefined {
  const key = entryDocumentKey(dictionaryId, entryId)
  const document = preparedEntryDocuments.get(key)
  if (document === undefined) return undefined

  preparedEntryDocuments.delete(key)
  preparedEntryDocuments.set(key, document)
  return document
}

function response(
  body: Buffer | string,
  contentType: string,
  status = 200,
  cacheControl = 'no-store'
): Response {
  return new Response(typeof body === 'string' ? body : new Uint8Array(body), {
    status,
    headers: {
      'content-type': contentType,
      'access-control-allow-origin': '*',
      'cache-control': cacheControl
    }
  })
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
    default:
      return 'application/octet-stream'
  }
}
