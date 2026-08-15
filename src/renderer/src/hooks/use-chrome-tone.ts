import { useEffect, useLayoutEffect } from 'react'

import { APP_PREFERENCES_STORAGE_KEY, useAppStore } from '@/stores/app-store'

export function useChromeTone(): void {
  const chromeTone = useAppStore((state) => state.chromeTone)

  useLayoutEffect(() => {
    document.documentElement.dataset.chromeTone = chromeTone
  }, [chromeTone])

  useEffect(() => {
    const handleStorage = (event: StorageEvent): void => {
      if (event.key !== APP_PREFERENCES_STORAGE_KEY) return
      void useAppStore.persist.rehydrate()
    }

    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])
}
