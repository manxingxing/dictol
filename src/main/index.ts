import { app, shell, type BrowserWindow } from 'electron'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { join } from 'node:path'

import { getAppRunTime } from './app-runtime'
import { registerIPCHandlers } from './controller/ipc-register'
import { MainWindowShortcutRouter } from './main-window-shortcut-router'
import { registerResourceProtocol, registerResourceScheme } from './resource-protocol'

const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
  // Do not initialize the database, tray, global shortcuts, or native selection
  // hook in a secondary process. The primary process receives `second-instance`.
  app.quit()
} else {
  registerResourceScheme()
  startPrimaryInstance()
}

function startPrimaryInstance(): void {
  const runtime = getAppRunTime()
  let runtimeDisposed = false
  let pendingWindowActivation = false

  process.on('unhandledRejection', (reason: unknown) => {
    console.error('Unhandled promise rejection in Electron main process', reason)
  })

  const showAndFocusMainWindow = (): void => {
    if (!runtime.isInitialized) {
      pendingWindowActivation = true
      return
    }

    pendingWindowActivation = false
    runtime.activateMainWindow()
  }

  app.on('second-instance', showAndFocusMainWindow)

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
        runtime.setMainWindowInitializer((mainWindow) => configureMainWindow(runtime, mainWindow))
        configureMainWindow(runtime, requireMainWindow(runtime))
        runtime.trayManager.setMainWindowFactory(() => runtime.getOrCreateMainWindow())
        if (pendingWindowActivation) showAndFocusMainWindow()
      } catch (error: unknown) {
        console.error('Failed to initialize application', error)
        disposeRuntime()
        app.quit()
        return
      }

      app.on('activate', (_event, hasVisibleWindows) => {
        if (!hasVisibleWindows) showAndFocusMainWindow()
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

  function disposeRuntime(): void {
    if (runtimeDisposed) return
    runtimeDisposed = true
    runtime.dispose()
  }
}

function configureMainWindow(
  runtime: ReturnType<typeof getAppRunTime>,
  mainWindow: BrowserWindow
): void {
  const dictionaryView = runtime.windowManager.dictionaryView
  if (!dictionaryView) throw new Error('DictionaryView 尚未初始化')

  runtime.mainWindowShortcutRouter?.dispose()
  const shortcutRouter = new MainWindowShortcutRouter(runtime.windowManager, mainWindow)
  runtime.mainWindowShortcutRouter = shortcutRouter
  shortcutRouter.register(mainWindow.webContents, 'main')
  shortcutRouter.register(dictionaryView.webContents, 'dictionary')
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

function requireMainWindow(runtime: ReturnType<typeof getAppRunTime>): BrowserWindow {
  const mainWindow = runtime.mainWindow
  if (!mainWindow || mainWindow.isDestroyed()) throw new Error('主窗口尚未初始化')
  return mainWindow
}
