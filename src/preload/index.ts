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

type DictionarySummary = Omit<ReadyDictionary, 'status'> & {
  status: 'pending' | 'importing' | 'ready' | 'error'
  customCss: string
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

type DictionaryMatch = {
  entryId: string
  dictionaryId: string
  dictionaryName: string
}

type DictionaryEntryGroup = {
  word: string
  normalizedWord: string
  dictionaries: DictionaryMatch[]
}

type DictionarySearchResult = {
  word: string
  normalizedWord: string
  dictionaryCount: number
}

type DictionaryEntryContent = {
  id: string
  dictionaryId: string
  dictionaryName: string
  word: string
  html: string
  customCss: string
}

type QueryHistoryItem = {
  id: string
  term: string
  queryCount: number
  lastQueriedAt: string
}

type WordCaptureStatus = {
  supported: boolean
  trusted: boolean
  registered: boolean
  shortcut: string
}

type WordCaptureEvent =
  | { type: 'lookup'; text: string }
  | { type: 'permission-required' }
  | { type: 'empty' }
  | { type: 'error'; message: string }

type WordCaptureShortcutResult = {
  ok: boolean
  status: WordCaptureStatus
  error?: string
}

const api = Object.freeze({
  platform: process.platform,
  dictionaries: Object.freeze({
    list: (): Promise<DictionarySummary[]> => ipcRenderer.invoke('dictionaries:list'),
    listReady: (): Promise<ReadyDictionary[]> => ipcRenderer.invoke('dictionaries:list-ready'),
    import: (): Promise<ImportedDictionary | null> => ipcRenderer.invoke('dictionaries:import'),
    delete: (dictionaryId: string): Promise<void> =>
      ipcRenderer.invoke('dictionaries:delete', dictionaryId),
    reorder: (dictionaryIds: string[]): Promise<void> =>
      ipcRenderer.invoke('dictionaries:reorder', dictionaryIds),
    updateName: (dictionaryId: string, name: string): Promise<void> =>
      ipcRenderer.invoke('dictionaries:update-name', dictionaryId, name),
    updateCustomCss: (dictionaryId: string, customCss: string): Promise<void> =>
      ipcRenderer.invoke('dictionaries:update-custom-css', dictionaryId, customCss)
  }),
  entries: Object.freeze({
    search: (prefix: string, limit?: number): Promise<DictionarySearchResult[]> =>
      ipcRenderer.invoke('dictionary-entries:search', prefix, limit),
    lookup: (term: string): Promise<DictionaryEntryGroup | null> =>
      ipcRenderer.invoke('dictionary-entries:lookup', term),
    get: (entryId: string): Promise<DictionaryEntryContent | null> =>
      ipcRenderer.invoke('dictionary-entries:get', entryId)
  }),
  history: Object.freeze({
    list: (): Promise<QueryHistoryItem[]> => ipcRenderer.invoke('query-history:list'),
    record: (term: string): Promise<void> => ipcRenderer.invoke('query-history:record', term),
    clear: (): Promise<void> => ipcRenderer.invoke('query-history:clear')
  }),
  app: Object.freeze({
    onFocusSearch: (callback: () => void): (() => void) => {
      const listener = (): void => callback()
      ipcRenderer.on('app:focus-search', listener)
      return () => ipcRenderer.removeListener('app:focus-search', listener)
    }
  }),
  wordCapture: Object.freeze({
    getStatus: (): Promise<WordCaptureStatus | null> => ipcRenderer.invoke('word-capture:status'),
    requestAccess: (): Promise<WordCaptureStatus | null> =>
      ipcRenderer.invoke('word-capture:request-access'),
    setShortcut: (shortcut: string): Promise<WordCaptureShortcutResult | null> =>
      ipcRenderer.invoke('word-capture:set-shortcut', shortcut),
    onEvent: (callback: (event: WordCaptureEvent) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, captureEvent: WordCaptureEvent): void =>
        callback(captureEvent)
      ipcRenderer.on('word-capture:event', listener)
      return () => ipcRenderer.removeListener('word-capture:event', listener)
    }
  }),
  dictionaryView: Object.freeze({
    show: (entryId: string): Promise<void> => ipcRenderer.invoke('dictionary-view:show', entryId),
    hide: (): void => ipcRenderer.send('dictionary-view:hide'),
    setBounds: (bounds: { x: number; y: number; width: number; height: number }): void =>
      ipcRenderer.send('dictionary-view:set-bounds', bounds),
    onRequestBounds: (callback: () => void): (() => void) => {
      const listener = (): void => callback()
      ipcRenderer.on('dictionary-view:request-bounds', listener)
      return () => ipcRenderer.removeListener('dictionary-view:request-bounds', listener)
    },
    onLookupWord: (callback: (word: string) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, word: string): void => callback(word)
      ipcRenderer.on('dictionary-view:lookup-word', listener)
      return () => ipcRenderer.removeListener('dictionary-view:lookup-word', listener)
    }
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
