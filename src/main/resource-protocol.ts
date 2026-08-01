import { MdictDictionary } from '@dictol/mdict-native'
import { app, protocol } from 'electron'
import { readFile } from 'node:fs/promises'
import { dirname, extname, join, resolve, sep } from 'node:path'

import { getAppRunTime, type AppRuntime } from './app-runtime'
import type { DBService } from './db-service'
import { createEntryDocument } from './entry-document'
import { decodeMdxRecord } from './mdict-runtime'

const RESOURCE_SCHEME = 'dictol-resource'
const ENTRY_SCHEME = 'dictol-entry'
const ENTRY_BRIDGE_URL = `${ENTRY_SCHEME}://app/entry-bridge.js`
const MAX_PREPARED_ENTRY_DOCUMENTS = 32
const STATIC_RESOURCE_CACHE_CONTROL = 'public, max-age=31536000, immutable'
const dictionaryFiles = new Map<number, Promise<DictionaryResourceFiles | null>>()
const preparedEntryDocuments = new Map<string, string>()
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

export function registerResourceProtocol(runtime = getAppRunTime()): void {
  if (registered) return
  registered = true
  protocol.handle(RESOURCE_SCHEME, (request) => handleResourceRequest(runtime, request))
  protocol.handle(ENTRY_SCHEME, (request) => handleEntryRequest(runtime, request))
}

export function invalidateDictionaryResources(dictionaryId: number): void {
  dictionaryFiles.delete(dictionaryId)
  const prefix = `${dictionaryId}/`
  for (const key of preparedEntryDocuments.keys()) {
    if (key.startsWith(prefix)) preparedEntryDocuments.delete(key)
  }
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
    if (request.url === ENTRY_BRIDGE_URL) {
      return response(
        await loadEntryBridgeSource(),
        'text/javascript; charset=utf-8',
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

    const record = await requireDBService(runtime).getDictionaryEntryRecord(entryId)
    if (!record) return response('Entry not found', 'text/plain; charset=utf-8', 404)
    if (record.dictionaryId !== dictionaryId) {
      return response('Dictionary mismatch', 'text/plain; charset=utf-8', 404)
    }
    const mdx = runtime.mdFileCache.fetch(record.filePath)
    const bytes = await mdx.readRecord(
      BigInt(record.recordStartOffset),
      BigInt(record.recordEndOffset)
    )
    return response(
      createEntryDocument(
        decodeMdxRecord(bytes, mdx.metadata.encoding),
        record.dictionaryId,
        record.customCss
      ),
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
  resourcePath: string,
  runtime = getAppRunTime()
): Promise<LoadedDictionaryResource | null> {
  const mimeType = getMimeType(resourcePath)
  const cached = await runtime.resourceCache.read(dictionaryId, resourcePath, mimeType)
  if (cached) return { bytes: cached, mimeType, source: 'cache' }

  const files = await getDictionaryResourceFiles(runtime, dictionaryId)
  if (!files) return null

  const local = await readLocalCompanion(files.directory, resourcePath)
  if (local) return { bytes: local, mimeType, source: 'local' }

  const extracted = await readMddResource(files.mdds, resourcePath)
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
  return {
    directory: firstFile.dictPath ?? dirname(firstFile.filePath),
    mdds: rows
      .filter((row) => row.fileType === 'mdd')
      .sort((left, right) => mddOrder(left.fileName) - mddOrder(right.fileName))
      .map((row) => runtime.mdFileCache.fetch(row.filePath))
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
