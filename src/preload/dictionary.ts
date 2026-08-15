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
    canExplainWithAi: (): Promise<boolean> =>
      ipcRenderer.invoke('dictionary-view:can-explain-with-ai'),
    explainWithAi: (text: string): void =>
      ipcRenderer.send('dictionary-view:explain-with-ai', text),
    copyText: (text: string): void => ipcRenderer.send('dictionary-view:copy-text', text),
    onAiExplanationAvailabilityChanged: (callback: (enabled: boolean) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, enabled: boolean): void =>
        callback(enabled)
      ipcRenderer.on('dictionary-view:ai-explanation-availability-changed', listener)
      return () =>
        ipcRenderer.removeListener('dictionary-view:ai-explanation-availability-changed', listener)
    }
  })
)
