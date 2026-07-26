import { useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { LoaderCircle, Search, X } from 'lucide-react'
import useDebounce from 'react-use/lib/useDebounce'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'

import { useDictionarySearch } from '@/hooks/use-dictionary-entries'
import { useSearchFocusShortcut } from '@/hooks/use-search-focus-shortcut'
import { useQueryStore } from '@/stores/query-store'
import { selectCompactMode, useAppStore } from '@/stores/app-store'
import { SearchHistory } from '@/components/SearchHistory'

export const SearchPanel = (): React.JSX.Element => {
  const navigate = useNavigate()
  const searchQuery = useQueryStore((state) => state.searchQuery)
  const setSearchQuery = useQueryStore((state) => state.setSearchQuery)
  const displayInCompactMode = useAppStore(selectCompactMode)

  const searchInputRef = useRef<HTMLInputElement>(null)
  // cmd+f, ctrl+f
  useSearchFocusShortcut(searchInputRef)

  const [debouncedQuery, setDebouncedQuery] = useState(searchQuery)
  useDebounce(() => setDebouncedQuery(searchQuery.trim()), 100, [searchQuery])

  const { data: results = [], isFetching } = useDictionarySearch(debouncedQuery)

  const openFirstResult = async (): Promise<void> => {
    const normalizedQuery = searchQuery.trim();
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

  const hasQuery = searchQuery.trim().length > 0

  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar/40">
      <div className="border-b border-border p-4">
        <div className="relative">
          {isFetching ? (
            <LoaderCircle className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : (
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          )}

          <Input
            ref={searchInputRef}
            aria-label="搜索单词"
            autoFocus={!displayInCompactMode}
            className="px-9"
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void openFirstResult().catch((error: unknown) => {
                  console.error('Failed to open the first dictionary result', error)
                })
              }
            }}
            placeholder="搜索单词…"
            value={searchQuery}
          />
          {searchQuery.length > 0 && (
            <Button
              aria-label="清空搜索"
              className="absolute right-1.5 top-1/2 size-7 -translate-y-1/2 rounded-md text-muted-foreground hover:text-foreground"
              onClick={() => {
                setSearchQuery('')
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
          <SearchHistory />
        ) : results.length === 0 && !isFetching ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">没有找到匹配的词条</p>
        ) : (
          <ScrollArea className="min-h-0 flex-1">
            <ul className="space-y-1">
              {results.map((result) => (
                <li key={result.normalizedWord}>
                  <NavLink className="block" to={`/search/${encodeURIComponent(result.word)}`}>
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
  )
}
