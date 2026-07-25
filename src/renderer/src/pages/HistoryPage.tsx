import { History, LoaderCircle, Search, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useClearQueryHistory, useQueryHistory } from '@/hooks/use-query-history'
import { useAppStore } from '@/stores/app-store'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'

export function HistoryPage(): React.JSX.Element {
  const navigate = useNavigate()
  const setSearchQuery = useAppStore((state) => state.setSearchQuery)
  const { data: history = [], isLoading, isError } = useQueryHistory()
  const clearHistory = useClearQueryHistory()

  const searchHistoryTerm = async (term: string): Promise<void> => {
    setSearchQuery(term)
    await navigate(`/search/${encodeURIComponent(term)}`)
  }

  return (
    <section className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col px-8 py-16">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-sm font-medium text-primary">查询历史</p>
          <h1 className="text-3xl font-semibold tracking-tight">最近查询</h1>
        </div>
        {history.length > 0 && (
          <Button
            disabled={clearHistory.isPending}
            onClick={() => {
              if (window.confirm('确定清空全部查询历史吗？')) clearHistory.mutate()
            }}
            type="button"
            variant="ghost"
          >
            {clearHistory.isPending ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
            清空历史
          </Button>
        )}
      </div>

      <Card className="mt-8 flex min-h-0 flex-1 flex-col overflow-hidden">
        <CardHeader className="shrink-0">
          <CardTitle>最近访问的词条</CardTitle>
          <CardDescription>最多保留 200 条记录，重复查询会更新到列表顶部。</CardDescription>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col">
          <ScrollArea className="min-h-0 flex-1">
            {isLoading && <p className="text-sm text-muted-foreground">正在加载…</p>}
            {isError && <p className="text-sm text-destructive">加载查询历史失败。</p>}
            {!isLoading && !isError && history.length === 0 && (
              <div className="py-8 text-center">
                <History className="mx-auto mb-3 size-6 text-muted-foreground" />
                <p className="text-sm font-medium">暂无查询记录</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  查询单词后，最近访问的词条会显示在这里。
                </p>
              </div>
            )}
            {!isLoading && !isError && history.length > 0 && (
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>词条</TableHead>
                    <TableHead className="w-28 text-right">查询次数</TableHead>
                    <TableHead className="w-36">最后查询</TableHead>
                    <TableHead className="w-20 text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="max-w-0 font-medium">
                        <span className="block truncate">{item.term}</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {item.queryCount.toLocaleString('zh-CN')}
                      </TableCell>
                      <TableCell>
                        <time dateTime={item.lastQueriedAt} className="text-muted-foreground">
                          {formatQueryTime(item.lastQueriedAt)}
                        </time>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          aria-label={`查询 ${item.term}`}
                          onClick={() => {
                            void searchHistoryTerm(item.term).catch((error: unknown) => {
                              console.error('Failed to open query history entry', error)
                            })
                          }}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          <Search />
                          查询
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {clearHistory.isError && (
              <p className="mt-3 text-xs text-destructive">清空查询历史失败。</p>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </section>
  )
}

function formatQueryTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const today = new Date()
  const sameDay = date.toDateString() === today.toDateString()
  return new Intl.DateTimeFormat('zh-CN', {
    ...(sameDay ? {} : { month: 'numeric', day: 'numeric' }),
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}
