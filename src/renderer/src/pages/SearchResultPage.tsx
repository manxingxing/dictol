import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Globe2, LoaderCircle, Sparkles, Star } from 'lucide-react'
import { toast } from 'sonner'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { useDictionaryLookup } from '@/hooks/use-dictionary-entries'
import { useRecordQueryHistory } from '@/hooks/use-query-history'
import { useIsStarred, useToggleStar } from '@/hooks/use-wordbooks'
import { useAppStore } from '@/stores/app-store'
import { useAiLookupConfig } from '@/hooks/use-ai-lookup'
import { useOnlineDictionaries } from '@/hooks/use-online-dictionaries'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

export function SearchResultPage(): React.JSX.Element {
  const location = useLocation()
  const navigate = useNavigate()
  const { term } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const setSearchQuery = useAppStore((state) => state.setSearchQuery)
  const rightSidebarOpen = useAppStore((state) => state.rightSidebarOpen)
  const setRightSidebarOpen = useAppStore((state) => state.setRightSidebarOpen)
  const rightSidebarType = useAppStore((state) => state.rightSidebarType)
  const setRightSidebarType = useAppStore((state) => state.setRightSidebarType)
  const setEmbedBrowserUrl = useAppStore((state) => state.setEmbedBrowserUrl)
  const setEmbedBrowserSearchTerm = useAppStore((state) => state.setEmbedBrowserSearchTerm)
  const aiSearchTerm = useAppStore((state) => state.aiSearchTerm)
  const setAiSearchTerm = useAppStore((state) => state.setAiSearchTerm)

  const [contentContainer, setContentContainer] = useState<HTMLDivElement | null>(null)
  const [dictionaryViewLoading, setDictionaryViewLoading] = useState(false)
  const contentContainerRef = useCallback((node: HTMLDivElement | null): void => {
    setContentContainer(node)
  }, [])

  const recordedPathname = useRef<string | null>(null)
  const activeDictionaryTabRef = useRef<HTMLButtonElement | null>(null)
  const normalizedTerm = term?.trim()
  const isAiSearchActive = Boolean(
    rightSidebarOpen &&
    rightSidebarType === 'ai-search' &&
    normalizedTerm &&
    normalizedTerm === aiSearchTerm
  )
  const {
    data: group,
    isLoading,
    isFetching,
    isError,
    isPlaceholderData
  } = useDictionaryLookup(normalizedTerm)
  const { mutateAsync: recordQueryHistory } = useRecordQueryHistory()
  const toggleStar = useToggleStar()
  const isStarred = useIsStarred(group?.word)
  const aiConfig = useAiLookupConfig()
  const { data: onlineDictionaries = [] } = useOnlineDictionaries()

  const handleToggleStar = useCallback((): void => {
    if (!group) return
    toggleStar.mutate(group.word, {
      onError: (error) => {
        toast.error('操作失败', { description: error.message })
      }
    })
  }, [group, toggleStar])

  const requestedDictionaryId = searchParams.get('dictionary')
  const activeDictionary =
    group?.dictionaries.find((item) => item.dictionaryId === requestedDictionaryId) ??
    group?.dictionaries[0]
  const activeEntryId = activeDictionary?.entryId
  const hasDictionaryEntries = Boolean(group && group.dictionaries.length > 0)
  const hasSearchActions = Boolean(
    onlineDictionaries.length > 0 || hasDictionaryEntries || aiConfig.data?.enabled
  )
  const [entryFailure, setEntryFailure] = useState({
    entryId: activeEntryId,
    failed: false
  })
  if (entryFailure.entryId !== activeEntryId) {
    setEntryFailure({ entryId: activeEntryId, failed: false })
  }

  useLayoutEffect(() => {
    activeDictionaryTabRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'nearest'
    })
  }, [activeDictionary?.dictionaryId, normalizedTerm])

  useEffect(() => {
    if (!group || isPlaceholderData || recordedPathname.current === location.pathname) {
      return
    }
    recordedPathname.current = location.pathname
    void recordQueryHistory(group.word).catch((error: unknown) => {
      console.error('Failed to record query history', error)
    })
  }, [group, isPlaceholderData, location.pathname, recordQueryHistory])

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
    return window.dictol.dictionaryView.onExplainWithAi((value) => {
      const text = value.trim()
      if (!text) return
      setAiSearchTerm(text)
      setRightSidebarType('ai-search')
      setRightSidebarOpen(true)
    })
  }, [setAiSearchTerm, setRightSidebarOpen, setRightSidebarType])

  useEffect(() => window.dictol.dictionaryView.onLoadingChanged(setDictionaryViewLoading), [])

  useEffect(() => {
    if (!activeEntryId) {
      if (!isFetching) window.dictol.dictionaryView.hide()
      return
    }
    let active = true
    void window.dictol.dictionaryView.show(activeEntryId).catch(() => {
      if (active) {
        window.dictol.dictionaryView.hide()
        setEntryFailure({ entryId: activeEntryId, failed: true })
      }
    })
    return () => {
      active = false
    }
  }, [activeEntryId, isFetching])

  useEffect(() => () => window.dictol.dictionaryView.hide(), [])

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
    scheduleBoundsUpdate()
    return () => {
      observer.disconnect()
      if (animationFrame) window.cancelAnimationFrame(animationFrame)
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

  const searchActions = (
    <div
      aria-label="查询和操作"
      className="search-action-dock flex h-10 shrink-0 items-center gap-1 rounded-xl p-1.5"
    >
      {onlineDictionaries.length > 0 && (
        <div
          aria-label="在线词典"
          className="online-dictionary-collapse group/online-dictionary-collapse shrink-0"
          style={
            {
              '--online-dictionary-expanded-width': `${onlineDictionaries.length * 32}px`
            } as React.CSSProperties
          }
        >
          <div className="online-dictionary-options flex items-center gap-1">
            {onlineDictionaries.map((dictionary, index) => (
              <Button
                aria-label={`使用 ${dictionary.name} 查询 ${normalizedTerm}`}
                className="online-dictionary-icon relative size-7 rounded-full border-2 border-background bg-background p-0 transition-transform duration-150 ease-out hover:scale-115 focus-visible:scale-120"
                key={dictionary.id}
                onClick={() => {
                  const url = dictionary.urlTemplate
                    .split('%s')
                    .join(encodeURIComponent(normalizedTerm))
                  setEmbedBrowserSearchTerm(normalizedTerm)
                  setEmbedBrowserUrl(url)
                  setRightSidebarType('embed-browser')
                  setRightSidebarOpen(true)
                }}
                size="icon"
                style={{ zIndex: onlineDictionaries.length - index }}
                title={`在 ${dictionary.name} 中查询`}
                type="button"
                variant="ghost"
              >
                <img
                  alt=""
                  className="size-full rounded-full object-cover bg-white"
                  onError={(event) => {
                    event.currentTarget.style.display = 'none'
                    event.currentTarget.nextElementSibling?.classList.remove('hidden')
                  }}
                  src={dictionary.faviconUrl}
                />
                <Globe2 className="absolute hidden size-4 text-muted-foreground" />
              </Button>
            ))}
          </div>
        </div>
      )}
      {hasDictionaryEntries && (
        <Button
          aria-label="加入默认生词本"
          className="search-action-button size-7 shrink-0 rounded-lg"
          disabled={toggleStar.isPending}
          onClick={handleToggleStar}
          size="icon"
          title={isStarred.data ? '取消标星' : '加入默认生词本'}
          type="button"
          variant="ghost"
        >
          {toggleStar.isPending ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <Star className={isStarred.data ? 'fill-amber-400 text-amber-400' : ''} />
          )}
        </Button>
      )}
      {aiConfig.data?.enabled && (
        <Button
          aria-label="AI 查词"
          aria-pressed={isAiSearchActive}
          className={cn(
            'search-action-button size-7 shrink-0 rounded-lg',
            isAiSearchActive && 'search-action-button-active'
          )}
          onClick={() => {
            setAiSearchTerm(normalizedTerm)
            setRightSidebarType('ai-search')
            setRightSidebarOpen(true)
          }}
          size="icon"
          title="使用 AI 查词"
          type="button"
          variant="ghost"
        >
          <Sparkles />
        </Button>
      )}
    </div>
  )
  const isDictionaryContentLoading = isFetching || dictionaryViewLoading

  if (isError || !group || !hasDictionaryEntries) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {hasSearchActions && (
          <div className="relative flex h-14 shrink-0 items-center border-b border-border bg-[var(--dictionary-toolbar-background)] px-3">
            <div className="min-w-0 flex-1" />
            {searchActions}
            {isDictionaryContentLoading && <DictionaryViewLoadingIndicator />}
          </div>
        )}
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
          <p className="text-sm font-medium">没有找到词条解释</p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            所有词典中都没有找到 {normalizedTerm} 的解释
          </p>
        </div>
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
      <div className="relative flex h-14 shrink-0 items-center overflow-hidden border-b border-border bg-[var(--dictionary-toolbar-background)] px-3">
        <ScrollArea className="min-w-0 flex-1 after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:z-10 after:w-3 after:bg-linear-to-r after:from-transparent after:to-[var(--dictionary-toolbar-background)] after:content-['']">
          <TabsList className="h-9 shrink-0 gap-1.5 rounded-none bg-transparent p-0 pr-3">
            {group.dictionaries.map((item) => (
              <TabsTrigger
                className="dictionary-tab-trigger h-8 flex-none scroll-mx-3 rounded-full border px-3.5 transition-[background-color,border-color,color,box-shadow] duration-150 ease-out"
                key={item.dictionaryId}
                ref={
                  item.dictionaryId === activeDictionary?.dictionaryId
                    ? activeDictionaryTabRef
                    : undefined
                }
                value={item.dictionaryId}
              >
                {item.dictionaryName}
              </TabsTrigger>
            ))}
          </TabsList>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        {hasSearchActions && <>{searchActions}</>}
        {isDictionaryContentLoading && <DictionaryViewLoadingIndicator />}
      </div>
      <div className="min-h-0 flex-1" ref={contentContainerRef}>
        {group.dictionaries.map((item) => (
          <TabsContent
            className="m-0 h-full min-h-0 data-[state=inactive]:hidden"
            key={item.dictionaryId}
            value={item.dictionaryId}
          >
            {entryFailure.entryId === item.entryId && entryFailure.failed ? (
              <div className="flex h-full items-center justify-center text-sm text-destructive">
                无法读取这个词典中的词条
              </div>
            ) : (
              <div
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

function DictionaryViewLoadingIndicator(): React.JSX.Element {
  return (
    <div
      aria-label="词条内容正在加载"
      className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden"
      role="progressbar"
    >
      <div className="native-view-loading-indicator h-full bg-primary" />
    </div>
  )
}
