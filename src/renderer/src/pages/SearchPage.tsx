import { useCallback, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import useKey from 'react-use/lib/useKey'

import { useReadyDictionaries } from '@/hooks/use-dictionaries'
import { EmptyDictionaryState } from './EmptyDictionaryState'
import { SearchLayout } from '@/components/SearchLayout'
import { useAppStore } from '@/stores/app-store'

function isFindInPageShortcut(event: KeyboardEvent): boolean {
  const usesPlatformModifier =
    window.dictol.platform === 'darwin' ? event.metaKey && !event.ctrlKey : event.ctrlKey
  return usesPlatformModifier && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'f'
}

export function SearchPage(): React.JSX.Element {
  const { data: dictionaries = [], isLoading, isError } = useReadyDictionaries()
  const setLastQueryPath = useAppStore((state) => state.setLastQueryPath)

  const location = useLocation()

  const toggleFindBar = useCallback((event: KeyboardEvent): void => {
    event.preventDefault()
    event.stopImmediatePropagation()
    window.dictol.dictionaryView.toggleFindBar()
  }, [])
  useKey(
    isFindInPageShortcut,
    toggleFindBar,
    {
      event: 'keydown',
      options: { capture: true }
    },
    [toggleFindBar]
  )

  useEffect(() => {
    return () => {
      const currentLocation = `${location.pathname}${location.search}${location.hash}`
      setLastQueryPath(currentLocation)
    }
  }, [setLastQueryPath, location])

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        正在加载词典…
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-destructive">
        加载词典失败，请稍后重试。
      </div>
    )
  }

  if (dictionaries.length === 0) {
    return <EmptyDictionaryState />
  }

  return <SearchLayout />
}
