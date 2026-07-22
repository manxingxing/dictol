import { contextBridge } from 'electron'

const api = Object.freeze({
  platform: process.platform
})

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
try {
  contextBridge.exposeInMainWorld('dictol', api)
} catch (error) {
  console.error(error)
}
