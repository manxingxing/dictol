import { app, shell, type BrowserWindow, type WebContents } from 'electron'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { join } from 'node:path'

import { getAppRunTime } from './app-runtime'
import { registerIPCHandlers } from './controller/ipc-register'
import { registerResourceProtocol, registerResourceScheme } from './resource-protocol'

registerResourceScheme()

const runtime = getAppRunTime()
let runtimeDisposed = false

process.on('unhandledRejection', (reason: unknown) => {
  console.error('Unhandled promise rejection in Electron main process', reason)
})

void app
  .whenReady()
  .then(() => {
    electronApp.setAppUserModelId('com.dictol.app')
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    try {
      runtime.initialize()
      registerResourceProtocol(runtime)
      registerIPCHandlers(runtime)
      runtime.setMainWindowInitializer(configureMainWindow)
      configureMainWindow(requireMainWindow())
      runtime.trayManager.setMainWindowFactory(() => runtime.getOrCreateMainWindow())
    } catch (error: unknown) {
      console.error('Failed to initialize application', error)
      disposeRuntime()
      app.quit()
    }

    app.on('activate', (_event, hasVisibleWindows) => {
      if (hasVisibleWindows) return
      const mainWindow = runtime.mainWindow
      if (!mainWindow || mainWindow.isDestroyed()) {
        runtime.getOrCreateMainWindow()
        return
      }
      mainWindow.show()
      mainWindow.focus()
    })

    app.on('window-all-closed', () => {
      // Registering this handler prevents Electron's default non-macOS quit,
      // keeping the app available through its tray after its last window closes.
      // The explicit tray Quit action still calls app.quit().
      return undefined
    })
  })
  .catch((error: unknown) => {
    console.error('Failed while preparing the application', error)
    disposeRuntime()
    app.quit()
  })

app.on('before-quit', () => {
  disposeRuntime()
})

function configureMainWindow(mainWindow: BrowserWindow): void {
  const dictionaryView = runtime.windowManager.dictionaryView
  if (!dictionaryView) throw new Error('DictionaryView 尚未初始化')

  registerFindShortcut(dictionaryView.webContents, mainWindow)
  const showMainWindow = (): void => {
    if (!mainWindow.isDestroyed() && !mainWindow.isVisible()) mainWindow.show()
  }
  mainWindow.once('ready-to-show', showMainWindow)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      void shell.openExternal(url).catch((error: unknown) => {
        console.error('Failed to open external URL', { url, error })
      })
    }
    return { action: 'deny' }
  })

  const loadPromise =
    is.dev && process.env['ELECTRON_RENDERER_URL']
      ? mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
      : mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  showMainWindow()
  void loadPromise.then(showMainWindow).catch((error: unknown) => {
    console.error('Failed to load renderer', error)
  })
}

function registerFindShortcut(webContents: WebContents, hostWindow: BrowserWindow): void {
  webContents.on('before-input-event', (event, input) => {
    const usesPlatformModifier =
      process.platform === 'darwin' ? input.meta && !input.control : input.control
    if (
      input.type !== 'keyDown' ||
      !usesPlatformModifier ||
      input.alt ||
      input.shift ||
      input.key.toLowerCase() !== 'f'
    ) {
      return
    }

    event.preventDefault()
    if (!hostWindow.isDestroyed() && !hostWindow.webContents.isDestroyed()) {
      hostWindow.webContents.focus()
      hostWindow.webContents.send('app:focus-search')
    }
  })
}

function requireMainWindow(): BrowserWindow {
  const mainWindow = runtime.mainWindow
  if (!mainWindow || mainWindow.isDestroyed()) throw new Error('主窗口尚未初始化')
  return mainWindow
}

function disposeRuntime(): void {
  if (runtimeDisposed) return
  runtimeDisposed = true
  runtime.dispose()
}
