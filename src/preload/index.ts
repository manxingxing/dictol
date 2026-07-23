import { contextBridge, ipcRenderer } from 'electron'

type ReadyDictionary = {
  id: string
  name: string
  description: string | null
  recordCount: string | null
  status: 'ready'
  createdAt: string
  updatedAt: string
}

type ImportedDictionary = {
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

type DictionarySearchResult = {
  id: string
  dictionaryId: string
  dictionaryName: string
  word: string
}

type DictionaryEntryContent = DictionarySearchResult & {
  html: string
}

const api = Object.freeze({
  platform: process.platform,
  dictionaries: Object.freeze({
    listReady: (): Promise<ReadyDictionary[]> => ipcRenderer.invoke('dictionaries:list-ready'),
    import: (): Promise<ImportedDictionary | null> => ipcRenderer.invoke('dictionaries:import')
  }),
  entries: Object.freeze({
    search: (prefix: string, limit?: number): Promise<DictionarySearchResult[]> =>
      ipcRenderer.invoke('dictionary-entries:search', prefix, limit),
    get: (entryId: string): Promise<DictionaryEntryContent | null> =>
      ipcRenderer.invoke('dictionary-entries:get', entryId)
  }),
  debug: Object.freeze({
    pgliteQuery: (query: string, params?: unknown[]) =>
      ipcRenderer.invoke('debug:pglite-query', query, params),
    pgliteExec: (query: string, options?: { rowMode?: 'array' | 'object' }) =>
      ipcRenderer.invoke('debug:pglite-exec', query, options)
  })
})

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
try {
  contextBridge.exposeInMainWorld('dictol', api)
} catch (error) {
  console.error(error)
}
