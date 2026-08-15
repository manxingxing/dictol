import { useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { History, LoaderCircle, Search, Trash2 } from 'lucide-react'
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'

import { useAppStore } from '@/stores/app-store'
import {
  useClearQueryHistory,
  useQueryHistory,
  type QueryHistoryItem
} from '@/hooks/use-query-history'
import { formatTime } from '@/lib/utils'

function getColumnClassName(columnId: string, header: boolean): string | undefined {
  switch (columnId) {
    case 'term':
      return header ? undefined : 'max-w-0'
    case 'queryCount':
      return 'w-24 text-right'
    case 'lastQueriedAt':
      return 'w-26'
    case 'actions':
      return 'w-20 text-right'
    default:
      return undefined
  }
}

export const HistoryPage = (): React.JSX.Element => {
  const navigate = useNavigate()
  const setSearchQuery = useAppStore((state) => state.setSearchQuery)

  const { data: history = [], isLoading, isError } = useQueryHistory()
  const clearHistory = useClearQueryHistory()

  const searchHistoryTerm = useCallback(
    async (term: string): Promise<void> => {
      setSearchQuery(term)
      await navigate(`/search/${encodeURIComponent(term)}`)
    },
    [navigate, setSearchQuery]
  )

  const columns = useMemo<ColumnDef<QueryHistoryItem>[]>(
    () => [
      {
        accessorKey: 'term',
        header: '词条',
        cell: ({ getValue }): React.JSX.Element => (
          <span className="block truncate font-medium">{getValue<string>()}</span>
        )
      },
      {
        accessorKey: 'queryCount',
        header: '查询次数',
        cell: ({ getValue }): React.JSX.Element => (
          <span className="tabular-nums">{getValue<number>().toLocaleString('zh-CN')}</span>
        )
      },
      {
        accessorKey: 'lastQueriedAt',
        header: '最后查询',
        cell: ({ getValue }): React.JSX.Element => {
          const lastQueriedAt = getValue<string>()
          return (
            <time dateTime={lastQueriedAt} className="text-muted-foreground">
              {formatTime(lastQueriedAt)}
            </time>
          )
        }
      },
      {
        id: 'actions',
        header: '操作',
        cell: ({ row }): React.JSX.Element => (
          <Button
            aria-label={`查询 ${row.original.term}`}
            onClick={() => {
              void searchHistoryTerm(row.original.term).catch((error: unknown) => {
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
        )
      }
    ],
    [searchHistoryTerm]
  )

  // TanStack Table returns mutable APIs that React Compiler intentionally does not memoize.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: history,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => String(row.id)
  })

  return (
    <section className="mx-auto flex md:h-full min-h-0 w-full max-w-3xl flex-col p-6 sm:p-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-sm font-medium text-primary">查询历史</p>
          <h1 className="text-xl font-semibold tracking-tight">最近查询</h1>
        </div>
        {history.length > 0 && (
          <Button
            className="hover:bg-destructive/10 hover:text-destructive"
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
            <Table className="table-fixed" containerClassName="min-h-0 flex-1 overflow-auto">
              <TableHeader className="sticky top-0 z-10 bg-card">
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow className="hover:bg-transparent" key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead
                        className={getColumnClassName(header.column.id, true)}
                        key={header.id}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        className={getColumnClassName(cell.column.id, false)}
                        key={cell.id}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {clearHistory.isError && (
            <p className="mt-3 text-xs text-destructive">清空查询历史失败。</p>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
