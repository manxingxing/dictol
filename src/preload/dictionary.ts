import { contextBridge, ipcRenderer } from 'electron'

window.addEventListener(
  'keydown',
  (event) => {
    const usesPlatformModifier =
      process.platform === 'darwin' ? event.metaKey && !event.ctrlKey : event.ctrlKey
    if (
      !usesPlatformModifier ||
      event.altKey ||
      event.shiftKey ||
      event.key.toLowerCase() !== 'f'
    ) {
      return
    }

    event.preventDefault()
    event.stopImmediatePropagation()
    ipcRenderer.send('app:focus-search')
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
