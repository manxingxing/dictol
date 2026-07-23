import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { useAppStore } from '@/stores/app-store'

export function SearchResultPage(): React.JSX.Element {
  const { entryId } = useParams()
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const [failedEntryId, setFailedEntryId] = useState<string | null>(null)
  const setSearchQuery = useAppStore((state) => state.setSearchQuery)

  useEffect(() => {
    return window.dictol.dictionaryView.onLookupWord((value) => {
      const word = value.trim()
      if (!word) return
      setSearchQuery(word)
      void window.dictol.entries.search(word, 1).then((results) => {
        const first = results[0]
        if (first) void navigate(`/search/${first.id}`)
      })
    })
  }, [navigate, setSearchQuery])

  useEffect(() => {
    if (!entryId) {
      window.dictol.dictionaryView.hide()
      return
    }
    let active = true
    void window.dictol.dictionaryView.show(entryId).catch(() => {
      if (active) setFailedEntryId(entryId)
    })
    return () => {
      active = false
      window.dictol.dictionaryView.hide()
    }
  }, [entryId])

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container || !entryId) return

    const updateBounds = (): void => {
      const bounds = container.getBoundingClientRect()
      window.dictol.dictionaryView.setBounds({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height
      })
    }
    const observer = new ResizeObserver(updateBounds)
    observer.observe(container)
    window.addEventListener('resize', updateBounds)
    updateBounds()
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateBounds)
    }
  }, [entryId])

  if (!entryId) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        选择一个词条查看详情
      </div>
    )
  }

  if (failedEntryId === entryId) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-destructive">
        无法读取这个词条
      </div>
    )
  }

  return <div ref={containerRef} className="h-full w-full bg-white" aria-label="词条内容" />
}
