import { contextBridge, ipcRenderer } from 'electron'

import type { ToastPayload } from '../shared/notification'

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
    showToast: (payload: ToastPayload): void =>
      ipcRenderer.send('notification:show-toast', payload),
    readAloud: (text: string, voice?: string): Promise<Uint8Array | null> => {
      return ipcRenderer
        .invoke('entry:read-aloud', text, voice)
        .then((audioData: Uint8Array | null) => {
          return audioData
        })
        .catch((error: unknown) => {
          console.error('[TTS][dictionary-preload] failed', error)
          throw error
        })
    },
    onAiExplanationAvailabilityChanged: (callback: (enabled: boolean) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, enabled: boolean): void =>
        callback(enabled)
      ipcRenderer.on('dictionary-view:ai-explanation-availability-changed', listener)
      return () =>
        ipcRenderer.removeListener('dictionary-view:ai-explanation-availability-changed', listener)
    }
  })
)
