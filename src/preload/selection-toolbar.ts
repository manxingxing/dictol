import { contextBridge, ipcRenderer } from 'electron'

export type SelectionToolbarPayload = {
  word: string
  programName: string
  canExclude: boolean
}

type Subscriber = (payload: SelectionToolbarPayload) => void

let latestPayload: SelectionToolbarPayload | undefined
const subscribers = new Set<Subscriber>()

ipcRenderer.on('selection-toolbar:update', (_event, payload: SelectionToolbarPayload) => {
  latestPayload = payload
  subscribers.forEach((subscriber) => subscriber(payload))
})

contextBridge.exposeInMainWorld(
  'dictolSelectionToolbar',
  Object.freeze({
    onUpdate: (callback: Subscriber): (() => void) => {
      subscribers.add(callback)
      if (latestPayload) callback(latestPayload)
      return () => subscribers.delete(callback)
    },
    lookupInMain: (): void => ipcRenderer.send('selection-toolbar:lookup-in-main'),
    explain: (): void => ipcRenderer.send('selection-toolbar:explain'),
    copy: (): void => ipcRenderer.send('selection-toolbar:copy'),
    google: (): void => ipcRenderer.send('selection-toolbar:google'),
    openMenu: (): void => ipcRenderer.send('selection-toolbar:open-menu'),
    dismiss: (): void => ipcRenderer.send('selection-toolbar:dismiss'),
    activity: (): void => ipcRenderer.send('selection-toolbar:activity')
  })
)
