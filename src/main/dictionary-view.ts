import { BrowserWindow, shell, WebContentsView, type Rectangle } from 'electron'
import { join } from 'node:path'

import { getDictionaryEntryDictionaryId } from './dictionary-service'

export class DictionaryViewManager {
  readonly view: WebContentsView
  private loadVersion = 0

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
    this.view.setBackgroundColor('#ffffff')
    this.view.setVisible(false)
    window.contentView.addChildView(this.view)

    this.view.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https://') || url.startsWith('http://')) void shell.openExternal(url)
      return { action: 'deny' }
    })
    this.view.webContents.on('will-navigate', (event) => {
      if (event.url.startsWith('dictol-entry://')) return
      event.preventDefault()
      if (event.url.startsWith('entry://')) this.sendLookup(decodeEntryTarget(event.url))
    })
  }

  async show(entryId: string): Promise<void> {
    const version = ++this.loadVersion
    const dictionaryId = await getDictionaryEntryDictionaryId(entryId)
    if (version !== this.loadVersion) return
    if (!dictionaryId) {
      this.view.setVisible(false)
      throw new Error('词条不存在')
    }

    this.view.setVisible(true)
    try {
      await this.view.webContents.loadURL(
        `dictol-entry://dictionary-${dictionaryId}/${encodeURIComponent(entryId)}`
      )
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
    const contentBounds = this.window.getContentBounds()
    const x = clamp(Math.round(bounds.x), 0, contentBounds.width)
    const y = clamp(Math.round(bounds.y), 0, contentBounds.height)
    const width = clamp(Math.round(bounds.width), 0, contentBounds.width - x)
    const height = clamp(Math.round(bounds.height), 0, contentBounds.height - y)
    this.view.setBounds({ x, y, width, height })
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

  destroy(): void {
    this.loadVersion += 1
    if (!this.window.isDestroyed()) this.window.contentView.removeChildView(this.view)
    if (!this.view.webContents.isDestroyed()) this.view.webContents.close()
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

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}
