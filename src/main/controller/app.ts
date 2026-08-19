import { app, ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron'

import { BaseController } from './base-controller'

export class AppController extends BaseController {
  override mount(): void {
    // Keep app metadata behind the same sender boundary as the other renderer APIs.
    ipcMain.handle('app:get-version', this.getVersion)
  }

  getVersion = (event: IpcMainInvokeEvent): string | null => {
    if (!this.acceptsSender(event.sender)) return null
    return app.getVersion()
  }

  private acceptsSender(sender: WebContents): boolean {
    const window = this.runtime.mainWindow
    return Boolean(window && !window.isDestroyed() && window.webContents.id === sender.id)
  }
}
