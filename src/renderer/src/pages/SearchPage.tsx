import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { useReadyDictionaries } from '@/hooks/use-dictionaries'

const previewResults = [
  { word: 'abandon', phonetic: '/əˈbændən/' },
  { word: 'ability', phonetic: '/əˈbɪləti/' },
  { word: 'able', phonetic: '/ˈeɪbl/' },
  { word: 'about', phonetic: '/əˈbaʊt/' }
]

export function SearchPage(): React.JSX.Element {
  const { data: dictionaries = [], isLoading, isError } = useReadyDictionaries()
  const [query, setQuery] = useState('')

  const results = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return previewResults
    return previewResults.filter((result) => result.word.startsWith(normalizedQuery))
  }, [query])

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

  return (
    <section className="flex h-[calc(100vh-3.5rem)] min-h-0 flex-col">
      <ResizablePanelGroup
        className="min-h-0 w-full flex-1 border-y border-border"
        orientation="horizontal"
      >
        <ResizablePanel defaultSize={240} minSize={200} maxSize={400}>
          <div className="flex h-full min-h-0 flex-col bg-sidebar/40">
            <div className="border-b border-border p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="搜索单词"
                  className="pl-9"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索单词…"
                  value={query}
                />
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {results.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                  没有找到匹配的词条
                </p>
              ) : (
                <ul className="space-y-1">
                  {results.map((result) => (
                    <li key={result.word}>
                      <NavLink to={`/search/${result.word}`} className="block">
                        {({ isActive }) => (
                          <Button
                            className={`h-auto w-full justify-start px-3 py-2.5 text-left ${
                              isActive
                                ? 'bg-primary/12 font-medium text-primary ring-1 ring-inset ring-primary/20'
                                : 'text-foreground'
                            }`}
                            variant="ghost"
                          >
                            <span className="flex flex-col items-start gap-0.5">
                              <span>{result.word}</span>
                              <span className="text-xs font-normal text-muted-foreground">
                                {result.phonetic}
                              </span>
                            </span>
                          </Button>
                        )}
                      </NavLink>
                    </li>
                  ))}
                </ul>
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
