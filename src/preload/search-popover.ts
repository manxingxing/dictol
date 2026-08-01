import { contextBridge, ipcRenderer } from 'electron'

type SearchPopoverItem = {
  word: string
  description: string
  recent: boolean
}

type SearchPopoverPayload = {
  query: string
  items: SearchPopoverItem[]
  selectedIndex: number
  status?: 'loading' | 'empty'
}

type SearchPopoverSubscriber = (payload: SearchPopoverPayload) => void

let latestPayload: SearchPopoverPayload | undefined
let focusRequested = false
const subscribers = new Set<SearchPopoverSubscriber>()

ipcRenderer.on('search-popover:update', (_event, payload: SearchPopoverPayload): void => {
  latestPayload = payload
  subscribers.forEach((subscriber) => subscriber(payload))
})

ipcRenderer.on('search-popover:focus-input', (): void => {
  focusRequested = true
})

const api = Object.freeze({
  onUpdate: (callback: SearchPopoverSubscriber): (() => void) => {
    subscribers.add(callback)
    if (latestPayload) callback(latestPayload)
    return () => subscribers.delete(callback)
  },
  onFocus: (callback: () => void): (() => void) => {
    const listener = (): void => {
      focusRequested = false
      callback()
    }
    ipcRenderer.on('search-popover:focus-input', listener)
    if (focusRequested) listener()
    return () => ipcRenderer.removeListener('search-popover:focus-input', listener)
  },
  changeQuery: (query: string): void => ipcRenderer.send('search-popover:query-change', query),
  select: (word: string): void => ipcRenderer.send('search-popover:select', word),
  submit: (query: string): void => ipcRenderer.send('search-popover:submit', query),
  dismiss: (): void => ipcRenderer.send('search-popover:dismiss')
})

contextBridge.exposeInMainWorld('dictolSearchPopover', api)
