import { useCallback, useEffect, type RefObject } from 'react'
import { isVisible } from '@/lib/utils'

export function useSearchFocusShortcut(inputRef: RefObject<HTMLInputElement | null>): void {
  const focusSearch = useCallback((): boolean => {
    const input = inputRef.current
    if (!input || !isVisible(input)) return false

    input.focus({ preventScroll: true })
    return true
  }, [inputRef])

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

      if (!focusSearch()) return

      event.preventDefault()
      event.stopImmediatePropagation()
    }

    const stopListeningForNativeFocus = window.dictol.app.onFocusSearch(focusSearch)
    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => {
      stopListeningForNativeFocus()
      window.removeEventListener('keydown', handleKeyDown, { capture: true })
    }
  }, [focusSearch])
}
