import { BrowserWindow, nativeTheme, shell, WebContentsView, type Rectangle } from 'electron'
import { join } from 'node:path'

import { getDictionaryEntryDictionaryId } from './dictionary-service'

export class DictionaryViewManager {
  readonly view: WebContentsView
  private loadVersion = 0
  private finalResizeTimer: NodeJS.Timeout | undefined
  private readonly handleWindowResize = (): void => {
    this.requestBoundsFromHost()
    if (this.finalResizeTimer) clearTimeout(this.finalResizeTimer)
    this.finalResizeTimer = setTimeout(() => this.requestBoundsFromHost(), 50)
  }
  private readonly handleThemeUpdate = (): void => {
    this.updateBackgroundColor()
  }

  constructor(
    private readonly window: BrowserWindow,
    preloadPath = join(__dirname, '../preload/dictionary.js')
  ) {
    this.view = new WebContentsView({
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true
      }
    })
    this.updateBackgroundColor()
    this.view.setVisible(false)
    window.contentView.addChildView(this.view)
    window.on('resize', this.handleWindowResize)
    window.on('resized', this.handleWindowResize)
    nativeTheme.on('updated', this.handleThemeUpdate)

    this.view.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https://') || url.startsWith('http://')) {
        void shell.openExternal(url).catch((error: unknown) => {
          console.error('Failed to open dictionary external URL', { url, error })
        })
      }
      return { action: 'deny' }
    })
    this.view.webContents.on('will-navigate', (event) => {
      if (event.url.startsWith('dictol-entry://')) return
      event.preventDefault()
      if (event.url.startsWith('entry://')) this.sendLookup(decodeEntryTarget(event.url))
    })
  }

  async show(entryId: string): Promise<boolean> {
    const version = ++this.loadVersion
    const dictionaryId = await getDictionaryEntryDictionaryId(entryId)
    if (version !== this.loadVersion) return false
    if (!dictionaryId) {
      this.view.setVisible(false)
      throw new Error('词条不存在')
    }

    this.view.setVisible(true)
    try {
      await this.view.webContents.loadURL(
        `dictol-entry://dictionary-${dictionaryId}/${encodeURIComponent(entryId)}`
      )
      return version === this.loadVersion
    } catch (error) {
      if (version === this.loadVersion) this.view.setVisible(false)
      throw error
    }
  }

  hide(): void {
    this.loadVersion += 1
    this.view.setVisible(false)
  }

  setBounds(bounds: Rectangle): void {
    this.view.setBounds({
      x: Math.max(0, Math.round(bounds.x)),
      y: Math.max(0, Math.round(bounds.y)),
      width: Math.max(0, Math.round(bounds.width)),
      height: Math.max(0, Math.round(bounds.height))
    })
  }

  acceptsSender(senderId: number): boolean {
    return senderId === this.view.webContents.id
  }

  acceptsHostSender(senderId: number): boolean {
    return senderId === this.window.webContents.id
  }

  sendLookup(word: string): void {
    const normalizedWord = word.trim()
    if (!normalizedWord || normalizedWord.length > 200 || this.window.isDestroyed()) return
    this.window.webContents.send('dictionary-view:lookup-word', normalizedWord)
  }

  requestSearchFocus(): void {
    if (!this.window.isDestroyed() && !this.window.webContents.isDestroyed()) {
      this.window.webContents.focus()
      this.window.webContents.send('app:focus-search')
    }
  }

  reloadDictionary(dictionaryId: string): void {
    if (
      !this.view.webContents.isDestroyed() &&
      this.view.webContents.getURL().startsWith(`dictol-entry://dictionary-${dictionaryId}/`)
    ) {
      this.view.webContents.reload()
    }
  }

  destroy(): void {
    this.loadVersion += 1
    this.window.off('resize', this.handleWindowResize)
    this.window.off('resized', this.handleWindowResize)
    nativeTheme.off('updated', this.handleThemeUpdate)
    if (this.finalResizeTimer) clearTimeout(this.finalResizeTimer)
    if (!this.window.isDestroyed()) this.window.contentView.removeChildView(this.view)
    if (!this.view.webContents.isDestroyed()) this.view.webContents.close()
  }

  private requestBoundsFromHost(): void {
    if (!this.window.isDestroyed() && !this.window.webContents.isDestroyed()) {
      this.window.webContents.send('dictionary-view:request-bounds')
    }
  }

  private updateBackgroundColor(): void {
    this.view.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#171a18' : '#ffffff')
  }
}

function decodeEntryTarget(url: string): string {
  const target = url.replace(/^entry:\/\/\/?/i, '').split('#', 1)[0]
  try {
    return decodeURIComponent(target)
  } catch {
    return target
  }
}
