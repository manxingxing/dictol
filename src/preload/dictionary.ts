import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld(
  'dictolEntry',
  Object.freeze({
    lookupWord: (word: string): void => ipcRenderer.send('dictionary-view:lookup-word', word)
  })
)
