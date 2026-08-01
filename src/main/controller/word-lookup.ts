import { systemPreferences } from 'electron'

import type { SelectionUnavailableListener } from '../selection-hook-service'
import { BaseController } from './base-controller'

export class WordLookupController extends BaseController {
  override mount(): void {
    this.runtime.selectionHookService.onSelectionUnavailable(this.handleSelectionUnavailable)
  }

  private readonly handleSelectionUnavailable: SelectionUnavailableListener = (source): void => {
    if (source !== 'shortcut') return
    const window = this.runtime.mainWindow
    if (!window || window.isDestroyed() || window.webContents.isDestroyed()) return

    const requiresPermission =
      process.platform === 'darwin' && !systemPreferences.isTrustedAccessibilityClient(false)
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
    window.webContents.send('word-capture:event', {
      type: requiresPermission ? 'permission-required' : 'empty'
    })
  }
}
