import { useEffect } from 'react'

export function useSearchShortCut(handleShortcut: () => boolean): void {
  useEffect(() => {
    const stopListeningForNativeShortcut = window.dictol.app.onFocusSearch(handleShortcut)
    return () => {
      stopListeningForNativeShortcut()
    }
  }, [handleShortcut])
}
