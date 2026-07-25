import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app, BrowserWindow, globalShortcut, systemPreferences, type WebContents } from 'electron'

const DEFAULT_SHORTCUT = 'Alt+Space'
const MAX_SELECTION_LENGTH = 200
const MODIFIERS = new Set(['Command', 'CommandOrControl', 'Control', 'Alt', 'Option', 'Shift'])
const SPECIAL_KEYS = new Set([
  'Space',
  'Tab',
  'Enter',
  'Backspace',
  'Delete',
  'Insert',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'Up',
  'Down',
  'Left',
  'Right'
])

type SelectionNative = {
  captureSelectedText: () => Promise<string | null>
}

type WordCaptureSettings = {
  shortcut: string
}

export type WordCaptureStatus = {
  supported: boolean
  trusted: boolean
  registered: boolean
  shortcut: string
}

export type WordCaptureShortcutResult = {
  ok: boolean
  status: WordCaptureStatus
  error?: string
}

export type WordCaptureEvent =
  | { type: 'lookup'; text: string }
  | { type: 'permission-required' }
  | { type: 'empty' }
  | { type: 'error'; message: string }

export class WordCaptureController {
  private window: BrowserWindow | undefined
  private shortcut = DEFAULT_SHORTCUT
  private registered = false
  private capturing = false
  private nativeBinding: SelectionNative | undefined
  private readonly handleShortcut = (): void => {
    void this.capture().catch((error: unknown) => {
      console.error('Failed to capture selected word', error)
      this.showAndSend({ type: 'error', message: '取词失败，请稍后重试。' })
    })
  }

  start(window: BrowserWindow): void {
    this.window = window
    if (!this.isSupported()) return

    this.shortcut = this.loadShortcut()
    this.registered = this.registerShortcut(this.shortcut)
  }

  stop(): void {
    if (this.registered) globalShortcut.unregister(this.shortcut)
    this.registered = false
    this.window = undefined
  }

  getStatus(): WordCaptureStatus {
    return {
      supported: this.isSupported(),
      trusted: this.isTrusted(),
      registered: this.registered,
      shortcut: this.shortcut
    }
  }

  requestAccess(): WordCaptureStatus {
    if (this.isSupported()) systemPreferences.isTrustedAccessibilityClient(true)
    return this.getStatus()
  }

  setShortcut(shortcut: string): WordCaptureShortcutResult {
    const normalized = normalizeShortcut(shortcut)
    if (!normalized) {
      return {
        ok: false,
        status: this.getStatus(),
        error: '快捷键必须包含 Command、Control 或 Option，并以一个按键结束。'
      }
    }
    if (!this.isSupported()) {
      return { ok: false, status: this.getStatus(), error: '当前平台暂不支持快捷键取词。' }
    }
    if (normalized === this.shortcut && this.registered) {
      return { ok: true, status: this.getStatus() }
    }

    const previousShortcut = this.shortcut
    const previousRegistered = this.registered
    if (!this.registerShortcut(normalized)) {
      return {
        ok: false,
        status: this.getStatus(),
        error: '这个快捷键已被系统或其他应用占用，请换一个组合。'
      }
    }

    try {
      this.saveShortcut(normalized)
    } catch (error) {
      globalShortcut.unregister(normalized)
      this.registered = previousRegistered
      console.error('Failed to save word capture shortcut', error)
      return { ok: false, status: this.getStatus(), error: '无法保存快捷键设置。' }
    }

    if (previousRegistered && normalized !== previousShortcut) {
      globalShortcut.unregister(previousShortcut)
    }
    this.shortcut = normalized
    this.registered = true
    return { ok: true, status: this.getStatus() }
  }

  acceptsSender(sender: WebContents): boolean {
    return this.window?.webContents.id === sender.id
  }

  private async capture(): Promise<void> {
    if (this.capturing) return
    if (!this.isTrusted()) {
      this.showAndSend({ type: 'permission-required' })
      return
    }

    this.capturing = true
    try {
      const text = (await this.getNativeBinding().captureSelectedText())?.trim()
      if (!text) {
        this.showAndSend({ type: 'empty' })
        return
      }
      if (text.length > MAX_SELECTION_LENGTH) {
        this.showAndSend({
          type: 'error',
          message: `选中的文本过长，请选择不超过 ${MAX_SELECTION_LENGTH} 个字符。`
        })
        return
      }
      this.showAndSend({ type: 'lookup', text })
    } finally {
      this.capturing = false
    }
  }

  private showAndSend(event: WordCaptureEvent): void {
    const window = this.window
    if (!window || window.isDestroyed()) return
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
    window.webContents.send('word-capture:event', event)
  }

  private registerShortcut(shortcut: string): boolean {
    try {
      return globalShortcut.register(shortcut, this.handleShortcut)
    } catch (error) {
      console.error('Failed to register word capture shortcut', { shortcut, error })
      return false
    }
  }

  private isSupported(): boolean {
    return process.platform === 'darwin'
  }

  private isTrusted(): boolean {
    return this.isSupported() && systemPreferences.isTrustedAccessibilityClient(false)
  }

  private getNativeBinding(): SelectionNative {
    if (!this.nativeBinding) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      this.nativeBinding = require('@dictol/selection-native') as SelectionNative
    }
    return this.nativeBinding
  }

  private loadShortcut(): string {
    try {
      const settings = JSON.parse(readFileSync(this.settingsPath(), 'utf8')) as WordCaptureSettings
      return normalizeShortcut(settings.shortcut) ?? DEFAULT_SHORTCUT
    } catch {
      return DEFAULT_SHORTCUT
    }
  }

  private saveShortcut(shortcut: string): void {
    const path = this.settingsPath()
    const temporaryPath = `${path}.tmp`
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(temporaryPath, `${JSON.stringify({ shortcut }, null, 2)}\n`, 'utf8')
    renameSync(temporaryPath, path)
  }

  private settingsPath(): string {
    return join(app.getPath('userData'), 'word-capture.json')
  }
}

function normalizeShortcut(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 64) return null
  const parts = value.split('+').map((part) => part.trim())
  if (parts.length < 2 || parts.some((part) => !part)) return null

  const key = parts.at(-1)
  const modifiers = parts.slice(0, -1)
  if (!key || modifiers.some((modifier) => !MODIFIERS.has(modifier))) return null
  if (
    !modifiers.some((modifier) =>
      ['Command', 'CommandOrControl', 'Control', 'Alt', 'Option'].includes(modifier)
    )
  ) {
    return null
  }
  if (new Set(modifiers).size !== modifiers.length || MODIFIERS.has(key)) return null

  const validKey =
    /^[A-Z0-9]$/.test(key) || /^F(?:[1-9]|1\d|2[0-4])$/.test(key) || SPECIAL_KEYS.has(key)
  return validKey ? [...modifiers, key].join('+') : null
}
