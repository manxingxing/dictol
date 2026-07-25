import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useDictionaryLookup } from '@/hooks/use-dictionary-entries'
import { useRecordQueryHistory } from '@/hooks/use-query-history'
import { dictionaryLayoutChangedEvent } from '@/lib/dictionary-layout'
import { useAppStore } from '@/stores/app-store'

export function SearchResultPage(): React.JSX.Element {
  const { term } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [contentContainer, setContentContainer] = useState<HTMLDivElement | null>(null)
  const contentContainerRef = useCallback((node: HTMLDivElement | null): void => {
    setContentContainer(node)
  }, [])
  const initializedSearchQuery = useRef(false)
  const recordedPathname = useRef<string | null>(null)
  const [failedEntryId, setFailedEntryId] = useState<string | null>(null)
  const searchQuery = useAppStore((state) => state.searchQuery)
  const setSearchQuery = useAppStore((state) => state.setSearchQuery)
  const normalizedTerm = term?.trim()
  const { data: group, isLoading, isError } = useDictionaryLookup(normalizedTerm)
  const { mutateAsync: recordQueryHistory } = useRecordQueryHistory()
  const requestedDictionaryId = searchParams.get('dictionary')
  const activeDictionary =
    group?.dictionaries.find((item) => item.dictionaryId === requestedDictionaryId) ??
    group?.dictionaries[0]
  const activeEntryId = activeDictionary?.entryId

  useEffect(() => {
    if (initializedSearchQuery.current) return
    initializedSearchQuery.current = true
    if (normalizedTerm && !searchQuery.trim()) setSearchQuery(normalizedTerm)
  }, [normalizedTerm, searchQuery, setSearchQuery])

  useEffect(() => {
    if (!group || recordedPathname.current === location.pathname) return
    recordedPathname.current = location.pathname
    void recordQueryHistory(group.word).catch((error: unknown) => {
      console.error('Failed to record query history', error)
    })
  }, [group, location.pathname, recordQueryHistory])

  useEffect(() => {
    if (!activeDictionary || requestedDictionaryId === activeDictionary.dictionaryId) return
    const nextSearchParams = new URLSearchParams(searchParams)
    nextSearchParams.set('dictionary', activeDictionary.dictionaryId)
    setSearchParams(nextSearchParams, { replace: true })
  }, [activeDictionary, requestedDictionaryId, searchParams, setSearchParams])

  useEffect(() => {
    return window.dictol.dictionaryView.onLookupWord((value) => {
      const word = value.trim()
      if (!word) return
      setSearchQuery(word)
      const nextSearchParams = new URLSearchParams()
      if (activeDictionary) nextSearchParams.set('dictionary', activeDictionary.dictionaryId)
      const queryString = nextSearchParams.toString()
      void navigate(`/search/${encodeURIComponent(word)}${queryString ? `?${queryString}` : ''}`)
    })
  }, [activeDictionary, navigate, setSearchQuery])

  useEffect(() => {
    if (!activeEntryId) {
      window.dictol.dictionaryView.hide()
      return
    }
    let active = true
    void window.dictol.dictionaryView.show(activeEntryId).catch(() => {
      if (active) setFailedEntryId(activeEntryId)
    })
    return () => {
      active = false
      window.dictol.dictionaryView.hide()
    }
  }, [activeEntryId])

  useLayoutEffect(() => {
    const container = contentContainer
    if (!container || !activeEntryId) return

    let animationFrame = 0

    const updateBounds = (): void => {
      const bounds = container.getBoundingClientRect()
      window.dictol.dictionaryView.setBounds({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height
      })
    }
    const scheduleBoundsUpdate = (): void => {
      if (animationFrame) return
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0
        updateBounds()
      })
    }
    const observer = new ResizeObserver(scheduleBoundsUpdate)
    observer.observe(container)
    if (container.parentElement) observer.observe(container.parentElement)
    window.addEventListener('resize', scheduleBoundsUpdate)
    window.addEventListener(dictionaryLayoutChangedEvent, scheduleBoundsUpdate)
    const stopListeningForBoundsRequests =
      window.dictol.dictionaryView.onRequestBounds(scheduleBoundsUpdate)
    scheduleBoundsUpdate()
    return () => {
      observer.disconnect()
      if (animationFrame) window.cancelAnimationFrame(animationFrame)
      stopListeningForBoundsRequests()
      window.removeEventListener('resize', scheduleBoundsUpdate)
      window.removeEventListener(dictionaryLayoutChangedEvent, scheduleBoundsUpdate)
    }
  }, [activeEntryId, contentContainer])

  if (!normalizedTerm) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        选择一个词条查看详情
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        正在查询多个词典…
      </div>
    )
  }

  if (isError || !group || group.dictionaries.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-destructive">
        没有找到这个词条
      </div>
    )
  }

  return (
    <Tabs
      className="h-full min-h-0 gap-0 bg-background"
      onValueChange={(dictionaryId) => {
        const nextSearchParams = new URLSearchParams(searchParams)
        nextSearchParams.set('dictionary', dictionaryId)
        setSearchParams(nextSearchParams)
      }}
      value={activeDictionary?.dictionaryId}
    >
      <div className="flex h-12 shrink-0 items-center overflow-x-auto border-b border-border bg-background px-3">
        <TabsList className="h-full shrink-0 rounded-none bg-transparent p-0">
          {group.dictionaries.map((item) => (
            <TabsTrigger
              className="relative h-full flex-none rounded-none border-0 bg-transparent px-4 shadow-none after:pointer-events-none after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:scale-x-0 after:rounded-full after:bg-primary after:transition-transform hover:text-foreground data-[state=active]:border-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:after:scale-x-100"
              key={item.dictionaryId}
              value={item.dictionaryId}
            >
              {item.dictionaryName}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      <div className="min-h-0 flex-1">
        {group.dictionaries.map((item) => (
          <TabsContent
            className="m-0 h-full min-h-0 data-[state=inactive]:hidden"
            forceMount
            key={item.dictionaryId}
            value={item.dictionaryId}
          >
            {failedEntryId === item.entryId ? (
              <div className="flex h-full items-center justify-center text-sm text-destructive">
                无法读取这个词典中的词条
              </div>
            ) : (
              <div
                ref={item.entryId === activeEntryId ? contentContainerRef : undefined}
                className="h-full w-full bg-background"
                aria-label={`${item.dictionaryName} 词条内容`}
              />
            )}
          </TabsContent>
        ))}
      </div>
    </Tabs>
  )
}
