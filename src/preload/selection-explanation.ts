import { contextBridge, ipcRenderer } from 'electron'

export type SelectionExplanationPayload = {
  requestId: number
  word: string
  dictionaryName?: string
  state: 'loading' | 'empty' | 'content' | 'error'
  message?: string
}

type Subscriber = (payload: SelectionExplanationPayload) => void

let latestPayload: SelectionExplanationPayload | undefined
const subscribers = new Set<Subscriber>()

ipcRenderer.on('selection-explanation:update', (_event, payload: SelectionExplanationPayload) => {
  latestPayload = payload
  subscribers.forEach((subscriber) => subscriber(payload))
})

contextBridge.exposeInMainWorld(
  'dictolSelectionExplanation',
  Object.freeze({
    onUpdate: (callback: Subscriber): (() => void) => {
      subscribers.add(callback)
      if (latestPayload) callback(latestPayload)
      return () => subscribers.delete(callback)
    },
    loadingReady: (requestId: number): void =>
      ipcRenderer.send('selection-explanation:loading-ready', requestId),
    close: (): void => ipcRenderer.send('selection-explanation:close'),
    openInMain: (): void => ipcRenderer.send('selection-explanation:open-in-main')
  })
)
