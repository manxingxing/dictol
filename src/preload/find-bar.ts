import { contextBridge, ipcRenderer } from 'electron'

type FindResult = {
  requestId: number
  matches: number
  activeMatchOrdinal: number
  finalUpdate: boolean
}

let activationRequested = false

ipcRenderer.on('find-bar:activate', (): void => {
  activationRequested = true
})

contextBridge.exposeInMainWorld(
  'dictolFindBar',
  Object.freeze({
    findInPage: (text: string): void => ipcRenderer.send('find-bar:find-in-page', text),

    findNext: (text: string, forward: boolean): void =>
      ipcRenderer.send('find-bar:find-next', text, forward),

    clearFind: (): void => ipcRenderer.send('find-bar:clear-find'),

    stopFind: (): void => ipcRenderer.send('find-bar:stop-find'),

    onActivate: (callback: () => void): (() => void) => {
      const listener = (): void => {
        activationRequested = false
        callback()
      }
      ipcRenderer.on('find-bar:activate', listener)
      if (activationRequested) listener()
      return () => ipcRenderer.removeListener('find-bar:activate', listener)
    },

    onFindResult: (callback: (result: FindResult) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, result: FindResult): void =>
        callback(result)
      ipcRenderer.on('find-bar:find-result', listener)
      return () => ipcRenderer.removeListener('find-bar:find-result', listener)
    }
  })
)
