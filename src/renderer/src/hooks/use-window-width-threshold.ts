import { useEffect, useRef } from 'react'

import { COMPACT_MODE_WIDTH_THRESHOLD, useAppStore } from '@/stores/app-store'

export function useWindowWidthThreshold(): void {
  const setWindowBelowCompactThreshold = useAppStore((state) => state.setWindowBelowCompactThreshold)

  const widthRef = useRef<number>(window.innerWidth)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const syncWindowWidth = (): void => {
      const origWindowWidth = widthRef.current
      const currentWindowWidth = window.innerWidth
      widthRef.current = currentWindowWidth

      const currentBelow = currentWindowWidth < COMPACT_MODE_WIDTH_THRESHOLD
      const origBelow = origWindowWidth < COMPACT_MODE_WIDTH_THRESHOLD

      if (currentBelow !== origBelow) {
        setWindowBelowCompactThreshold(currentBelow)
      }
    }

    const scheduleSyncWindowWidth = (): void => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current)
      }
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null
        syncWindowWidth()
      })
    }

    syncWindowWidth()
    window.addEventListener('resize', scheduleSyncWindowWidth)

    return () => {
      window.removeEventListener('resize', scheduleSyncWindowWidth)
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current)
      }
    }
  }, [setWindowBelowCompactThreshold])
}
