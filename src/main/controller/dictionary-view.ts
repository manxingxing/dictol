import {
  clipboard,
  ipcMain,
  shell,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type Rectangle
} from 'electron'

import type { WebContentsViewManager } from '../web-contents-view-manager'
import { BaseController } from './base-controller'

export class DictionaryViewController extends BaseController {
  private loadVersion = 0
  private configuredViewId: number | undefined
  private desiredEntryId: string | undefined
  private loadedEntryId: string | undefined
  private pendingEntryId: string | undefined
  private pendingLoad: Promise<boolean> | undefined

  override mount(): void {
    void this.view
    ipcMain.handle('dictionary-view:show', this.show)
    ipcMain.on('dictionary-view:hide', this.hide)
    ipcMain.on('dictionary-view:set-bounds', this.setBounds)
    ipcMain.on('dictionary-view:lookup-word', this.lookupWord)
    ipcMain.on('dictionary-view:copy-text', this.copyText)
    ipcMain.on('dictionary-view:pointer-down', this.pointerDown)
  }

  show = async (event: IpcMainInvokeEvent, entryId: string): Promise<void> => {
    if (!this.acceptsHostSender(event.sender.id) || typeof entryId !== 'string') return
    await this.showEntry(entryId)
  }

  hide = (event: IpcMainEvent): void => {
    if (!this.acceptsHostSender(event.sender.id)) return
    this.hideView()
  }

  setBounds = (event: IpcMainEvent, bounds: Rectangle): void => {
    if (!this.acceptsHostSender(event.sender.id) || !isRectangle(bounds)) return
    this.view.setBounds(bounds)
  }

  lookupWord = (event: IpcMainEvent, word: string): void => {
    if (!this.acceptsViewSender(event.sender.id) || typeof word !== 'string') return
    this.sendLookup(word)
  }

  copyText = (event: IpcMainEvent, text: string): void => {
    if (
      !this.acceptsViewSender(event.sender.id) ||
      typeof text !== 'string' ||
      !text ||
      text.length > 100_000
    ) {
      return
    }
    clipboard.writeText(text)
  }

  pointerDown = (event: IpcMainEvent): void => {
    if (!this.acceptsViewSender(event.sender.id)) return
    const popover = this.runtime.windowManager.searchPopoverView
    if (!popover) return
    popover.hide()
    popover.sendToMainWindow('search-popover:dismissed')
  }

  private async showEntry(entryId: string): Promise<boolean> {
    this.desiredEntryId = entryId
    if (this.loadedEntryId === entryId) {
      this.view.show()
      return true
    }
    if (this.pendingEntryId === entryId && this.pendingLoad) {
      this.view.show()
      return this.pendingLoad
    }

    const version = ++this.loadVersion
    const load = this.loadEntry(entryId, version)
    this.pendingEntryId = entryId
    this.pendingLoad = load

    const clearPendingLoad = (): void => {
      if (this.pendingLoad !== load) return
      this.pendingEntryId = undefined
      this.pendingLoad = undefined
    }
    void load.then(clearPendingLoad, clearPendingLoad)
    return load
  }

  private hideView(): void {
    this.desiredEntryId = undefined
    this.view.hide()
  }

  private async loadEntry(entryId: string, version: number): Promise<boolean> {
    const dictionaryId = await this.db.getDictionaryEntryDictionaryId(entryId)
    if (version !== this.loadVersion || this.desiredEntryId !== entryId) return false
    if (!dictionaryId) {
      this.view.hide()
      throw new Error('词条不存在')
    }

    this.view.show()
    try {
      await this.view.loadURL(
        `dictol-entry://dictionary-${dictionaryId}/${encodeURIComponent(entryId)}`
      )
      if (version !== this.loadVersion) return false
      this.loadedEntryId = entryId
      const shouldRemainVisible = this.desiredEntryId === entryId
      if (shouldRemainVisible) this.view.show()
      else this.view.hide()
      return shouldRemainVisible
    } catch (error) {
      if (
        version !== this.loadVersion ||
        this.desiredEntryId !== entryId ||
        isNavigationAborted(error)
      ) {
        return false
      }
      this.view.hide()
      throw error
    }
  }

  private configureView(view: WebContentsViewManager): void {
    view.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https://') || url.startsWith('http://')) {
        void shell.openExternal(url).catch((error: unknown) => {
          console.error('Failed to open dictionary external URL', { url, error })
        })
      }
      return { action: 'deny' }
    })
    view.webContents.on('will-navigate', (event) => {
      if (event.url.startsWith('dictol-entry://')) return
      event.preventDefault()
      if (event.url.startsWith('entry://')) this.sendLookup(decodeEntryTarget(event.url))
    })
  }

  private sendLookup(word: string): void {
    const normalizedWord = word.trim()
    if (!normalizedWord || normalizedWord.length > 200) return
    this.view.sendToMainWindow('dictionary-view:lookup-word', normalizedWord)
  }

  private acceptsViewSender(senderId: number): boolean {
    return this.view.acceptsSender(senderId)
  }

  private acceptsHostSender(senderId: number): boolean {
    return this.view.acceptsHostSender(senderId)
  }

  private get view(): WebContentsViewManager {
    const view = this.runtime.windowManager.dictionaryView
    if (!view || view.isDestroyed) {
      throw new Error('DictionaryView 尚未初始化')
    }
    if (this.configuredViewId !== view.webContents.id) {
      this.loadVersion += 1
      this.desiredEntryId = undefined
      this.loadedEntryId = undefined
      this.pendingEntryId = undefined
      this.pendingLoad = undefined
      this.configureView(view)
      this.configuredViewId = view.webContents.id
    }
    return view
  }
}

function isRectangle(value: unknown): value is Rectangle {
  if (typeof value !== 'object' || value === null) return false
  const rectangle = value as Partial<Rectangle>
  return [rectangle.x, rectangle.y, rectangle.width, rectangle.height].every(
    (part) => typeof part === 'number' && Number.isFinite(part) && part >= 0
  )
}

function decodeEntryTarget(url: string): string {
  const target = url.replace(/^entry:\/\/\/?/i, '').split('#', 1)[0]
  try {
    return decodeURIComponent(target)
  } catch {
    return target
  }
}

function isNavigationAborted(error: unknown): boolean {
  if (error instanceof Error && error.message.includes('ERR_ABORTED')) return true
  if (typeof error !== 'object' || error === null) return false
  const navigationError = error as { code?: unknown; errno?: unknown }
  return navigationError.code === 'ERR_ABORTED' || navigationError.errno === -3
}
