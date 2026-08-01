import { contextBridge, ipcRenderer } from 'electron'

window.addEventListener(
  'pointerdown',
  () => {
    ipcRenderer.send('dictionary-view:pointer-down')
  },
  { capture: true }
)

contextBridge.exposeInMainWorld(
  'dictolEntry',
  Object.freeze({
    lookupWord: (word: string): void => ipcRenderer.send('dictionary-view:lookup-word', word),
    copyText: (text: string): void => ipcRenderer.send('dictionary-view:copy-text', text)
  })
)
