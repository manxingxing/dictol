import { BrowserWindow } from 'electron'

/**
 * Shared native-window behavior for the two cross-application selection surfaces.
 *
 * These windows are deliberately independent from the main window: presenting one
 * must not restore, show, or focus the main application window.
 */
export function applySelectionWindowBehavior(window: BrowserWindow): void {
  window.setAlwaysOnTop(true, 'screen-saver')
}

/**
 * Show a selection surface without activating Dictol or focusing its main window.
 *
 * `type: 'panel'` and `showInactive()` provide the normal non-main-window path.
 * The short-lived toolbar additionally opts into Cherry Studio's focus guard,
 * because its first button click must not activate Dictol.
 */
export function showSelectionWindowInactive(
  window: BrowserWindow,
  options: { preventActivationOnClick?: boolean } = {}
): void {
  if (window.isDestroyed()) return

  if (process.platform === 'darwin') {
    if (options.preventActivationOnClick) {
      // `showInactive()` only prevents activation while showing. A subsequent
      // first click can still activate the application, making the main window
      // jump forward. Temporarily making the toolbar non-focusable preserves
      // that click for its renderer without letting macOS activate Dictol.
      // This mirrors Cherry Studio's SelectionToolbar path.
      window.setFocusable(false)
    }
    window.showInactive()
    // macOS can lower a panel's level after hide/show. Reassert it after showing,
    // as a localized alternative to monkey-patching BrowserWindow.showInactive().
    window.setAlwaysOnTop(true, 'screen-saver')
    if (options.preventActivationOnClick) window.setFocusable(true)
    return
  }

  window.showInactive()
}

/**
 * Hide a floating selection window without allowing macOS to promote Dictol's
 * main window as the replacement frontmost window.
 *
 * The native focus guard is intentionally limited to the hide transition and
 * only changes other visible Dictol windows. This is Cherry Studio's
 * `macRestoreFocusOnHide` quirk, expressed explicitly rather than by
 * monkey-patching every BrowserWindow.hide call.
 */
export function hideSelectionWindow(window: BrowserWindow | undefined): void {
  if (!window || window.isDestroyed()) return

  if (process.platform !== 'darwin') {
    window.hide()
    return
  }

  const focusableWindows = BrowserWindow.getAllWindows().filter(
    (candidate) =>
      candidate !== window &&
      !candidate.isDestroyed() &&
      candidate.isVisible() &&
      candidate.isFocusable()
  )
  focusableWindows.forEach((candidate) => candidate.setFocusable(false))
  window.hide()

  setTimeout(() => {
    focusableWindows.forEach((candidate) => {
      if (!candidate.isDestroyed()) candidate.setFocusable(true)
    })
  }, 50)
}
