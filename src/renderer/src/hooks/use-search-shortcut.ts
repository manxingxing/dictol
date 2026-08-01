import { useEffect } from 'react'

export function useSearchShortCut(handleShortcut: () => boolean): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      const usesPlatformModifier =
        window.dictol.platform === 'darwin' ? event.metaKey && !event.ctrlKey : event.ctrlKey
      if (
        !usesPlatformModifier ||
        event.altKey ||
        event.shiftKey ||
        event.key.toLowerCase() !== 'f'
      ) {
        return
      }

      if (!handleShortcut()) return

      event.preventDefault()
      event.stopImmediatePropagation()
    }

    const stopListeningForNativeShortcut = window.dictol.app.onFocusSearch(handleShortcut)
    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => {
      stopListeningForNativeShortcut()
      window.removeEventListener('keydown', handleKeyDown, { capture: true })
    }
  }, [handleShortcut])
}
