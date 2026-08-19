import { ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron'

import { SHOW_MAIN_WINDOW_SHORTCUT } from '../app-runtime'
import type { AppConfig } from '../app-config'
import { BaseController } from './base-controller'

export type MainWindowShortcutStatus = {
  shortcut: string
  registered: boolean
}

export type MainWindowShortcutResult = {
  ok: boolean
  status: MainWindowShortcutStatus
  error?: string
}

export class KeyboardController extends BaseController {
  override mount(): void {
    ipcMain.handle('keyboard:status', this.getStatus)
    ipcMain.handle('keyboard:set-main-window-shortcut', this.setMainWindowShortcut)
  }

  getStatus = (event: IpcMainInvokeEvent): MainWindowShortcutStatus | null => {
    if (!this.acceptsSender(event.sender)) return null
    return this.createStatus()
  }

  setMainWindowShortcut = (
    event: IpcMainInvokeEvent,
    shortcut: string
  ): MainWindowShortcutResult | null => {
    if (!this.acceptsSender(event.sender)) return null
    if (typeof shortcut !== 'string' || !shortcut.trim() || shortcut.length > 64) {
      return { ok: false, status: this.createStatus(), error: '无效的快捷键。' }
    }

    const previousConfig = this.runtime.appConfig.load()
    const nextConfig: AppConfig = {
      ...previousConfig,
      shortcuts: {
        ...previousConfig.shortcuts,
        showMainWindow: shortcut.trim()
      }
    }

    try {
      this.runtime.appConfig.save(nextConfig)
      this.runtime.restartMainWindowShortcut()
      if (!this.runtime.shortcutRegister.isRegistered(SHOW_MAIN_WINDOW_SHORTCUT)) {
        throw new Error('快捷键不可用')
      }
      return { ok: true, status: this.createStatus() }
    } catch (error) {
      console.error('Failed to update main window shortcut', { shortcut, error })
      this.restoreConfig(previousConfig)
      return {
        ok: false,
        status: this.createStatus(),
        error: '这个快捷键无效或已被系统、其他应用占用。'
      }
    }
  }

  private createStatus(): MainWindowShortcutStatus {
    const config = this.runtime.appConfig.load()
    return {
      shortcut: config.shortcuts.showMainWindow,
      registered: this.runtime.shortcutRegister.isRegistered(SHOW_MAIN_WINDOW_SHORTCUT)
    }
  }

  private acceptsSender(sender: WebContents): boolean {
    const window = this.runtime.mainWindow
    return Boolean(window && !window.isDestroyed() && window.webContents.id === sender.id)
  }

  private restoreConfig(config: AppConfig): void {
    try {
      this.runtime.appConfig.save(config)
      this.runtime.restartMainWindowShortcut()
    } catch (error) {
      console.error('Failed to restore main window shortcut configuration', error)
    }
  }
}
