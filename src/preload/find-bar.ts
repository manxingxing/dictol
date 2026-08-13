import { contextBridge, ipcRenderer } from 'electron'

type FindResult = {
  requestId: number
  matches: number
  activeMatchOrdinal: number
  finalUpdate: boolean
}

contextBridge.exposeInMainWorld(
  'dictolFindBar',
  Object.freeze({
    findInPage: (text: string): void => ipcRenderer.send('find-bar:find-in-page', text),

    findNext: (text: string, forward: boolean): void =>
      ipcRenderer.send('find-bar:find-next', text, forward),

    clearFind: (): void => ipcRenderer.send('find-bar:clear-find'),

    stopFind: (): void => ipcRenderer.send('find-bar:stop-find'),

    onFindResult: (callback: (result: FindResult) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, result: FindResult): void =>
        callback(result)
      ipcRenderer.on('find-bar:find-result', listener)
      return () => ipcRenderer.removeListener('find-bar:find-result', listener)
    }
  })
)
