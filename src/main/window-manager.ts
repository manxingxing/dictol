import { BrowserWindow, nativeTheme, systemPreferences } from 'electron'

import icon from '../../resources/icon.png?asset'
import { resolvePreloadPath } from './output-path'
import { applySelectionWindowBehavior, hideSelectionWindow } from './selection-window-behavior'
import { WebContentsViewManager } from './web-contents-view-manager'

export class WindowManager {
  mainWindow: BrowserWindow | undefined
  dictionaryView: WebContentsViewManager | undefined
  searchPopoverView: WebContentsViewManager | undefined
  selectionToolbarWindow: BrowserWindow | undefined
  selectionExplanationWindow: BrowserWindow | undefined
  selectionExplanationView: WebContentsViewManager | undefined
  private activeSpaceSubscriptionId: number | undefined
  private observingNativeAppearance = false

  createMainWindow(): BrowserWindow {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) return this.mainWindow

    this.dictionaryView?.dispose()
    this.searchPopoverView?.dispose()
    this.dictionaryView = undefined
    this.searchPopoverView = undefined

    const darkMode = nativeTheme.shouldUseDarkColors
    // Create the browser window.
    const mainWindow = new BrowserWindow({
      width: 900,
      height: 670,
      minWidth: 520,
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
        preload: resolvePreloadPath('index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })

    if (!this.observingNativeAppearance) {
      nativeTheme.on('updated', this.updateNativeAppearance)
      this.observingNativeAppearance = true
    }
    this.mainWindow = mainWindow
    mainWindow.on('closed', () => {
      if (this.mainWindow === mainWindow) this.mainWindow = undefined
    })
    return mainWindow
  }

  createDictionaryView(): WebContentsViewManager {
    if (this.dictionaryView && !this.dictionaryView.isDestroyed) {
      return this.dictionaryView
    }

    const mainWindow = this.requireMainWindow()
    const dictionaryView = new WebContentsViewManager(mainWindow, {
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#171a18' : '#ffffff',
      view: {
        webPreferences: {
          preload: resolvePreloadPath('dictionary.js'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webSecurity: true
        }
      }
    })

    this.dictionaryView = dictionaryView
    return dictionaryView
  }

  createSearchPopoverView(): WebContentsViewManager {
    if (this.searchPopoverView && !this.searchPopoverView.isDestroyed) {
      return this.searchPopoverView
    }

    const mainWindow = this.requireMainWindow()
    const searchPopoverView = new WebContentsViewManager(mainWindow, {
      backgroundColor: '#00000000',
      view: {
        webPreferences: {
          preload: resolvePreloadPath('search-popover.js'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webSecurity: true
        }
      }
    })

    this.searchPopoverView = searchPopoverView
    return searchPopoverView
  }

  createSelectionToolbarWindow(): BrowserWindow {
    if (this.selectionToolbarWindow && !this.selectionToolbarWindow.isDestroyed()) {
      return this.selectionToolbarWindow
    }

    const window = new BrowserWindow({
      width: 310,
      height: 44,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      focusable: true,
      ...(process.platform === 'darwin'
        ? { type: 'panel' as const, hiddenInMissionControl: true }
        : {}),
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: true,
      webPreferences: {
        preload: resolvePreloadPath('selection-toolbar.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })
    applySelectionWindowBehavior(window)
    this.ensureActiveSpaceSubscription()
    window.on('closed', () => {
      if (this.selectionToolbarWindow === window) this.selectionToolbarWindow = undefined
    })
    this.selectionToolbarWindow = window
    return window
  }

  createSelectionExplanationWindow(): BrowserWindow {
    if (this.selectionExplanationWindow && !this.selectionExplanationWindow.isDestroyed()) {
      return this.selectionExplanationWindow
    }

    const darkMode = nativeTheme.shouldUseDarkColors
    const window = new BrowserWindow({
      width: 520,
      height: 600,
      minWidth: 360,
      minHeight: 300,
      show: false,
      frame: false,
      backgroundColor: darkMode ? '#171a18' : '#faf9f7',
      resizable: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      ...(process.platform === 'darwin'
        ? { type: 'panel' as const, hiddenInMissionControl: true }
        : {}),
      skipTaskbar: true,
      alwaysOnTop: true,
      webPreferences: {
        preload: resolvePreloadPath('selection-explanation.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })
    applySelectionWindowBehavior(window)
    this.ensureActiveSpaceSubscription()

    const view = new WebContentsViewManager(window, {
      backgroundColor: darkMode ? '#171a18' : '#ffffff',
      view: {
        webPreferences: {
          preload: resolvePreloadPath('selection-entry.js'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webSecurity: true
        }
      }
    })
    const updateViewBounds = (): void => {
      const [width, height] = window.getContentSize()
      view.setBounds({
        x: 1,
        y: 44,
        width: Math.max(0, width - 2),
        height: Math.max(0, height - 45)
      })
    }
    window.on('resize', updateViewBounds)
    window.on('closed', () => {
      view.dispose()
      if (this.selectionExplanationView === view) this.selectionExplanationView = undefined
      if (this.selectionExplanationWindow === window) this.selectionExplanationWindow = undefined
    })
    updateViewBounds()

    this.selectionExplanationWindow = window
    this.selectionExplanationView = view
    return window
  }

  dispose(): void {
    if (this.observingNativeAppearance) {
      nativeTheme.off('updated', this.updateNativeAppearance)
      this.observingNativeAppearance = false
    }
    if (this.activeSpaceSubscriptionId !== undefined) {
      systemPreferences.unsubscribeWorkspaceNotification(this.activeSpaceSubscriptionId)
      this.activeSpaceSubscriptionId = undefined
    }
    this.dictionaryView?.dispose()
    this.searchPopoverView?.dispose()
    this.selectionExplanationView?.dispose()
    if (this.selectionToolbarWindow && !this.selectionToolbarWindow.isDestroyed()) {
      this.selectionToolbarWindow.destroy()
    }
    if (this.selectionExplanationWindow && !this.selectionExplanationWindow.isDestroyed()) {
      this.selectionExplanationWindow.destroy()
    }

    this.dictionaryView = undefined
    this.searchPopoverView = undefined
    this.selectionToolbarWindow = undefined
    this.selectionExplanationWindow = undefined
    this.selectionExplanationView = undefined
    this.mainWindow = undefined
  }

  private requireMainWindow(): BrowserWindow {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      throw new Error('创建 WebContentsView 前必须先创建主窗口')
    }

    return this.mainWindow
  }

  private ensureActiveSpaceSubscription(): void {
    if (process.platform !== 'darwin' || this.activeSpaceSubscriptionId !== undefined) return

    this.activeSpaceSubscriptionId = systemPreferences.subscribeWorkspaceNotification(
      'NSWorkspaceActiveSpaceDidChangeNotification',
      () => {
        hideSelectionWindow(this.selectionToolbarWindow)
        hideSelectionWindow(this.selectionExplanationWindow)
      }
    )
  }

  private readonly updateNativeAppearance = (): void => {
    const useDarkColors = nativeTheme.shouldUseDarkColors
    const window = this.mainWindow
    if (!window || window.isDestroyed()) return
    window.setBackgroundColor(useDarkColors ? '#171a18' : '#faf9f7')

    if (this.dictionaryView && !this.dictionaryView.isDestroyed) {
      this.dictionaryView.setBackgroundColor(useDarkColors ? '#171a18' : '#ffffff')
    }

    const explanationWindow = this.selectionExplanationWindow
    if (explanationWindow && !explanationWindow.isDestroyed()) {
      explanationWindow.setBackgroundColor(useDarkColors ? '#171a18' : '#faf9f7')
    }
    if (this.selectionExplanationView && !this.selectionExplanationView.isDestroyed) {
      this.selectionExplanationView.setBackgroundColor(useDarkColors ? '#171a18' : '#ffffff')
    }

    if (process.platform !== 'darwin') {
      window.setTitleBarOverlay({
        color: useDarkColors ? '#151815' : '#f7f7f5',
        symbolColor: useDarkColors ? '#dddeda' : '#534f48',
        height: 56
      })
    }
  }
}
