import {
  app,
  shell,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  nativeTheme,
  type Rectangle,
  type WebContents
} from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { closeDatabase, initializeDatabase } from './database'
import { DictionaryViewManager } from './dictionary-view'
import {
  deleteDictionary,
  clearQueryHistory,
  getDictionaryEntryContent,
  importDictionaryFromFile,
  listDictionaries,
  listReadyDictionaries,
  listQueryHistory,
  lookupDictionaryEntryGroup,
  recordQueryHistory,
  reorderDictionaries,
  searchDictionaryEntries,
  updateDictionaryCustomCss,
  updateDictionaryName
} from './dictionary-service'
import {
  invalidateDictionaryResources,
  registerResourceProtocol,
  registerResourceScheme
} from './resource-protocol'
import { WordCaptureController } from './word-capture'

registerResourceScheme()

let dictionaryViewManager: DictionaryViewManager | undefined
const wordCaptureController = new WordCaptureController()
let databaseCloseStarted = false
let databaseClosedForQuit = false

process.on('unhandledRejection', (reason: unknown) => {
  console.error('Unhandled promise rejection in Electron main process', reason)
})

ipcMain.handle('dictionaries:list-ready', () => listReadyDictionaries())
ipcMain.handle('dictionaries:list', () => listDictionaries())
ipcMain.handle('dictionaries:import', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'MDX 词典', extensions: ['mdx'] }]
  })

  if (result.canceled || result.filePaths.length === 0) return null
  return importDictionaryFromFile(result.filePaths[0])
})
ipcMain.handle('dictionaries:delete', async (_, dictionaryId: string) => {
  const numericId = Number(dictionaryId)
  if (Number.isSafeInteger(numericId) && numericId > 0) {
    invalidateDictionaryResources(numericId)
  }
  dictionaryViewManager?.hide()
  await deleteDictionary(dictionaryId)
})
ipcMain.handle('dictionaries:reorder', (_, dictionaryIds: string[]) =>
  reorderDictionaries(dictionaryIds)
)
ipcMain.handle('dictionaries:update-name', (_, dictionaryId: string, name: string) =>
  updateDictionaryName(dictionaryId, name)
)
ipcMain.handle(
  'dictionaries:update-custom-css',
  async (_, dictionaryId: string, customCss: string) => {
    await updateDictionaryCustomCss(dictionaryId, customCss)
    dictionaryViewManager?.reloadDictionary(dictionaryId)
  }
)
ipcMain.handle('dictionary-entries:search', (_, prefix: string, limit?: number) =>
  searchDictionaryEntries(prefix, limit)
)
ipcMain.handle('dictionary-entries:lookup', (_, term: string) => lookupDictionaryEntryGroup(term))
ipcMain.handle('dictionary-entries:get', (_, entryId: string) => getDictionaryEntryContent(entryId))
ipcMain.handle('query-history:list', () => listQueryHistory())
ipcMain.handle('query-history:clear', () => clearQueryHistory())
ipcMain.handle('query-history:record', (_, term: string) => recordQueryHistory(term))
ipcMain.handle('dictionary-view:show', async (event, entryId: string) => {
  if (!dictionaryViewManager?.acceptsHostSender(event.sender.id)) return
  await dictionaryViewManager.show(entryId)
})
ipcMain.on('dictionary-view:hide', (event) => {
  if (dictionaryViewManager?.acceptsHostSender(event.sender.id)) dictionaryViewManager.hide()
})
ipcMain.on('dictionary-view:set-bounds', (event, bounds: Rectangle) => {
  if (dictionaryViewManager?.acceptsHostSender(event.sender.id) && isRectangle(bounds)) {
    dictionaryViewManager.setBounds(bounds)
  }
})
ipcMain.on('dictionary-view:lookup-word', (event, word: string) => {
  if (dictionaryViewManager?.acceptsSender(event.sender.id) && typeof word === 'string') {
    dictionaryViewManager.sendLookup(word)
  }
})
ipcMain.on('dictionary-view:copy-text', (event, text: string) => {
  if (
    dictionaryViewManager?.acceptsSender(event.sender.id) &&
    typeof text === 'string' &&
    text.length > 0 &&
    text.length <= 100_000
  ) {
    clipboard.writeText(text)
  }
})
ipcMain.on('app:focus-search', (event) => {
  if (
    dictionaryViewManager?.acceptsSender(event.sender.id) ||
    dictionaryViewManager?.acceptsHostSender(event.sender.id)
  ) {
    dictionaryViewManager.requestSearchFocus()
  }
})
ipcMain.handle('word-capture:status', (event) => {
  if (!wordCaptureController.acceptsSender(event.sender)) return null
  return wordCaptureController.getStatus()
})
ipcMain.handle('word-capture:request-access', (event) => {
  if (!wordCaptureController.acceptsSender(event.sender)) return null
  return wordCaptureController.requestAccess()
})
ipcMain.handle('word-capture:set-shortcut', (event, shortcut: string) => {
  if (!wordCaptureController.acceptsSender(event.sender)) return null
  return wordCaptureController.setShortcut(shortcut)
})

function createWindow(): void {
  const darkMode = nativeTheme.shouldUseDarkColors
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    minWidth: 720,
    minHeight: 520,
    show: false,
    backgroundColor: darkMode ? '#171a18' : '#faf9f7',
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    ...(process.platform === 'darwin'
      ? { trafficLightPosition: { x: 16, y: 18 } }
      : {
          titleBarOverlay: {
            color: darkMode ? '#151815' : '#f7f7f5',
            symbolColor: darkMode ? '#dddeda' : '#534f48',
            height: 56
          }
        }),
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  dictionaryViewManager = new DictionaryViewManager(mainWindow)
  const updateNativeAppearance = (): void => {
    const useDarkColors = nativeTheme.shouldUseDarkColors
    mainWindow.setBackgroundColor(useDarkColors ? '#171a18' : '#faf9f7')
    if (process.platform !== 'darwin') {
      mainWindow.setTitleBarOverlay({
        color: useDarkColors ? '#151815' : '#f7f7f5',
        symbolColor: useDarkColors ? '#dddeda' : '#534f48',
        height: 56
      })
    }
  }
  nativeTheme.on('updated', updateNativeAppearance)
  registerFindShortcut(dictionaryViewManager.view.webContents, mainWindow)
  wordCaptureController.start(mainWindow)

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.on('closed', () => {
    nativeTheme.off('updated', updateNativeAppearance)
    wordCaptureController.stop()
    if (dictionaryViewManager) {
      dictionaryViewManager.destroy()
      dictionaryViewManager = undefined
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      void shell.openExternal(url).catch((error: unknown) => {
        console.error('Failed to open external URL', { url, error })
      })
    }
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']).catch((error: unknown) => {
      console.error('Failed to load renderer development URL', error)
    })
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html')).catch((error: unknown) => {
      console.error('Failed to load renderer entry file', error)
    })
  }
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

function isRectangle(value: unknown): value is Rectangle {
  if (typeof value !== 'object' || value === null) return false
  const rectangle = value as Partial<Rectangle>
  return [rectangle.x, rectangle.y, rectangle.width, rectangle.height].every(
    (part) => typeof part === 'number' && Number.isFinite(part) && part >= 0
  )
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
void app
  .whenReady()
  .then(() => {
    // Set app user model id for windows
    electronApp.setAppUserModelId('com.dictol.app')

    // Default open or close DevTools by F12 in development
    // and ignore CommandOrControl + R in production.
    // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    void initializeDatabase()
      .then(() => {
        registerResourceProtocol()
        createWindow()
      })
      .catch((error: unknown) => {
        console.error('Failed to initialize database', error)
        app.quit()
      })

    app.on('activate', function () {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
  .catch((error: unknown) => {
    console.error('Failed while preparing the application', error)
    app.quit()
  })

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', (event) => {
  if (databaseClosedForQuit) return

  event.preventDefault()
  if (databaseCloseStarted) return
  databaseCloseStarted = true
  wordCaptureController.stop()

  void closeDatabase()
    .catch((error: unknown) => {
      console.error('Failed to close database', error)
    })
    .finally(() => {
      databaseClosedForQuit = true
      app.quit()
    })
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
