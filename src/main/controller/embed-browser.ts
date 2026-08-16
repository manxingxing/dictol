import {
  ipcMain,
  shell,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type Rectangle
} from 'electron'

import type { WebContentsViewManager } from '../web-contents-view-manager'
import { BaseController } from './base-controller'

export class EmbedBrowserController extends BaseController {
  private configuredViewId: number | undefined
  private loadVersion = 0

  override mount(): void {
    ipcMain.handle('embed-browser:load', this.load)
    ipcMain.on('embed-browser:set-bounds', this.setBounds)
    ipcMain.on('embed-browser:hide', this.hide)
  }

  load = async (event: IpcMainInvokeEvent, value: unknown): Promise<void> => {
    if (!this.acceptsHostSender(event.sender.id)) return
    const url = validateUrl(value)
    const version = ++this.loadVersion
    const view = this.getView()
    this.configureView(view)
    view.show()
    const searchPopover = this.runtime.windowManager.searchPopoverView
    if (searchPopover?.isVisible) searchPopover.bringToFront()
    try {
      await view.loadURL(url)
    } catch (error) {
      if (version !== this.loadVersion || isNavigationAborted(error)) return
      throw error
    }
  }

  setBounds = (event: IpcMainEvent, bounds: Rectangle): void => {
    if (!this.acceptsHostSender(event.sender.id) || !isRectangle(bounds)) return
    this.getView().setBounds(bounds)
  }

  hide = (event: IpcMainEvent): void => {
    if (!this.acceptsHostSender(event.sender.id)) return
    this.loadVersion += 1
    this.runtime.windowManager.embedBrowserView?.hide()
  }

  private getView(): WebContentsViewManager {
    const view = this.runtime.windowManager.createEmbedBrowserView()
    this.runtime.adBlockService.attach(view.webContents.session)
    return view
  }

  private configureView(view: WebContentsViewManager): void {
    if (this.configuredViewId === view.webContents.id) return
    this.configuredViewId = view.webContents.id
    view.webContents.setWindowOpenHandler(({ url }) => {
      if (isHttpUrl(url)) {
        void shell.openExternal(url).catch((error: unknown) => {
          console.error('Failed to open external online dictionary URL', { url, error })
        })
      }
      return { action: 'deny' }
    })
    const notifyUrl = (): void => {
      const url = view.getURL()
      if (url) view.sendToMainWindow('embed-browser:url-changed', url)
    }
    const notifyLoadingState = (isLoading: boolean): void => {
      view.sendToMainWindow('embed-browser:loading-changed', isLoading)
    }
    view.webContents.on('did-navigate', notifyUrl)
    view.webContents.on('did-navigate-in-page', notifyUrl)
    view.webContents.on('did-start-loading', () => notifyLoadingState(true))
    view.webContents.on('did-stop-loading', () => notifyLoadingState(false))
  }

  private acceptsHostSender(senderId: number): boolean {
    const mainWindow = this.runtime.mainWindow
    return Boolean(
      mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents.id === senderId
    )
  }
}

function validateUrl(value: unknown): string {
  if (typeof value !== 'string' || !isHttpUrl(value)) {
    throw new Error('在线词典地址必须是 HTTP 或 HTTPS URL')
  }
  return value
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function isNavigationAborted(error: unknown): boolean {
  if (error instanceof Error && error.message.includes('ERR_ABORTED')) return true
  if (!error || typeof error !== 'object') return false
  const navigationError = error as { code?: unknown; errno?: unknown }
  return navigationError.code === 'ERR_ABORTED' || navigationError.errno === -3
}

function isRectangle(value: unknown): value is Rectangle {
  if (!value || typeof value !== 'object') return false
  const rectangle = value as Partial<Rectangle>
  return [rectangle.x, rectangle.y, rectangle.width, rectangle.height].every(
    (part) => typeof part === 'number' && Number.isFinite(part)
  )
}
