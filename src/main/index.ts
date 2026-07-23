import { app, shell, BrowserWindow, dialog, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { closeDatabase, initializeDatabase } from './database'
import {
  getDictionaryEntryContent,
  importDictionaryFromFile,
  listReadyDictionaries,
  searchDictionaryEntries
} from './dictionary-service'
import { registerResourceProtocol, registerResourceScheme } from './resource-protocol'

registerResourceScheme()

ipcMain.handle('dictionaries:list-ready', () => listReadyDictionaries())
ipcMain.handle('dictionaries:import', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'MDX 词典', extensions: ['mdx'] }]
  })

  if (result.canceled || result.filePaths.length === 0) return null
  return importDictionaryFromFile(result.filePaths[0])
})
ipcMain.handle('dictionary-entries:search', (_, prefix: string, limit?: number) =>
  searchDictionaryEntries(prefix, limit)
)
ipcMain.handle('dictionary-entries:get', (_, entryId: string) => getDictionaryEntryContent(entryId))

if (is.dev) {
  ipcMain.handle('debug:pglite-query', async (_, query: string, params?: unknown[]) => {
    const database = await initializeDatabase()
    return database.query(query, params)
  })

  ipcMain.handle(
    'debug:pglite-exec',
    async (_, query: string, options?: { rowMode?: 'array' | 'object' }) => {
      const database = await initializeDatabase()
      return database.exec(query, options)
    }
  )
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    minWidth: 720,
    minHeight: 520,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    ...(process.platform === 'darwin'
      ? { trafficLightPosition: { x: 16, y: 18 } }
      : {
          titleBarOverlay: {
            color: '#f7f7f5',
            symbolColor: '#534f48',
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

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
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

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  void closeDatabase()
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
