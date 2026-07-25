import { useEffect, useRef, useState } from 'react'
import { Clock3, Search, X } from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import useDebounce from 'react-use/lib/useDebounce'

import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { useReadyDictionaries } from '@/hooks/use-dictionaries'
import { useDictionarySearch } from '@/hooks/use-dictionary-entries'
import { useQueryHistory } from '@/hooks/use-query-history'
import { notifyDictionaryLayoutChanged } from '@/lib/dictionary-layout'
import { useAppStore } from '@/stores/app-store'
import { ScrollArea } from '@/components/ui/scroll-area'

export function SearchPage(): React.JSX.Element {
  const navigate = useNavigate()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const { data: dictionaries = [], isLoading, isError } = useReadyDictionaries()
  const { data: history = [] } = useQueryHistory()
  const query = useAppStore((state) => state.searchQuery)
  const setQuery = useAppStore((state) => state.setSearchQuery)
  const searchFocusRequest = useAppStore((state) => state.searchFocusRequest)
  const [debouncedQuery, setDebouncedQuery] = useState(query.trim())
  useDebounce(() => setDebouncedQuery(query.trim()), 120, [query])
  const { data: results = [], isFetching } = useDictionarySearch(debouncedQuery)

  useEffect(() => {
    if (searchFocusRequest > 0) searchInputRef.current?.focus({ preventScroll: true })
  }, [dictionaries.length, isLoading, searchFocusRequest])

  const openFirstResult = async (): Promise<void> => {
    const normalizedQuery = query.trim()
    if (!normalizedQuery) return
    const first =
      debouncedQuery.toLowerCase() === normalizedQuery.toLowerCase() && !isFetching
        ? results[0]
        : undefined
    const currentFirst =
      first ?? (await window.dictol.entries.search(normalizedQuery, 1).then((items) => items[0]))
    if (currentFirst) {
      await navigate(`/search/${encodeURIComponent(currentFirst.word)}`)
    }
  }

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
    return (
      <section className="mx-auto flex max-w-3xl flex-col px-8 py-16">
        <p className="mb-2 text-sm font-medium text-primary">开始使用 Dictol</p>
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>还没有导入词典</CardTitle>
            <CardDescription>
              <NavLink to="/dictionaries">
                <Button className="mt-3 tracking-tight">导入词典</Button>
              </NavLink>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                导入 MDX 文件及其配套 MDD 资源。词典完成索引后，即可开始查询词条。
              </p>
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    )
  }

  const recentTerms = history.slice(0, 50)
  const hasQuery = query.trim().length > 0

  return (
    <section className="flex h-[calc(100vh-3.5rem)] min-h-0 flex-col">
      <ResizablePanelGroup
        className="min-h-0 w-full flex-1 border-y border-border"
        onLayoutChange={notifyDictionaryLayoutChanged}
        onLayoutChanged={notifyDictionaryLayoutChanged}
        orientation="horizontal"
      >
        <ResizablePanel
          defaultSize={240}
          minSize={200}
          maxSize={400}
          style={{ overflow: 'hidden' }}
        >
          <div className="flex h-full min-h-0 flex-col bg-sidebar/40">
            <div className="border-b border-border p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  aria-label="搜索单词"
                  autoFocus
                  className="px-9"
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void openFirstResult().catch((error: unknown) => {
                        console.error('Failed to open the first dictionary result', error)
                      })
                    }
                  }}
                  placeholder="搜索单词…"
                  value={query}
                />
                {query.length > 0 && (
                  <Button
                    aria-label="清空搜索"
                    className="absolute right-1.5 top-1/2 size-7 -translate-y-1/2 rounded-md text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setQuery('')
                      searchInputRef.current?.focus()
                    }}
                    size="icon"
                    title="清空搜索"
                    type="button"
                    variant="ghost"
                  >
                    <X />
                  </Button>
                )}
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2">
              {!hasQuery ? (
                recentTerms.length === 0 ? (
                  <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                    输入单词开始查询
                  </p>
                ) : (
                  <>
                    <div className="flex shrink-0 items-center gap-2 px-3 pb-2 pt-1 text-xs font-medium text-muted-foreground">
                      <Clock3 className="size-3.5" />
                      最近查询
                    </div>
                    <ScrollArea className="min-h-0 flex-1">
                      <ul className="space-y-1">
                        {recentTerms.map((item) => (
                          <li key={item.id}>
                            <NavLink
                              className="block"
                              onClick={() => setQuery(item.term)}
                              to={`/search/${encodeURIComponent(item.term)}`}
                            >
                              {({ isActive }) => (
                                <Button
                                  className={`h-auto w-full justify-start px-3 py-2.5 text-left ${
                                    isActive
                                      ? 'bg-primary/12 font-medium text-primary ring-1 ring-inset ring-primary/20'
                                      : 'text-foreground'
                                  }`}
                                  variant="ghost"
                                >
                                  <span className="min-w-0 truncate">{item.term}</span>
                                </Button>
                              )}
                            </NavLink>
                          </li>
                        ))}
                      </ul>
                    </ScrollArea>
                  </>
                )
              ) : results.length === 0 && !isFetching ? (
                <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                  没有找到匹配的词条
                </p>
              ) : (
                <ScrollArea className="min-h-0 flex-1">
                  <ul className="space-y-1">
                    {results.map((result) => (
                      <li key={result.normalizedWord}>
                        <NavLink
                          className="block"
                          to={`/search/${encodeURIComponent(result.word)}`}
                        >
                          {({ isActive }) => (
                            <Button
                              className={`h-auto w-full justify-start px-3 py-2.5 text-left ${
                                isActive
                                  ? 'bg-primary/12 font-medium text-primary ring-1 ring-inset ring-primary/20'
                                  : 'text-foreground'
                              }`}
                              variant="ghost"
                            >
                              <span className="flex min-w-0 flex-col items-start gap-0.5">
                                <span className="truncate">{result.word}</span>
                                <span className="truncate text-xs font-normal text-muted-foreground">
                                  {result.dictionaryCount} 部词典
                                </span>
                              </span>
                            </Button>
                          )}
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              )}
            </div>
          </div>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel minSize={100}>
          <Outlet />
        </ResizablePanel>
      </ResizablePanelGroup>
    </section>
  )
}
