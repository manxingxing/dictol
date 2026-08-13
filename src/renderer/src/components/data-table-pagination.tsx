import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface DataTablePaginationProps {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
}

export function DataTablePagination({
  page,
  pageSize,
  total,
  onPageChange
}: DataTablePaginationProps): React.JSX.Element {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="flex items-center justify-between px-2 py-1">
      <p className="text-sm text-muted-foreground">
        共 {total} 条
      </p>
      <div className="flex items-center gap-1">
        <Button
          disabled={page <= 1}
          onClick={() => onPageChange(1)}
          size="icon"
          variant="outline"
        >
          <span className="sr-only">第一页</span>
          <ChevronsLeft className="size-4" />
        </Button>
        <Button
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          size="icon"
          variant="outline"
        >
          <span className="sr-only">上一页</span>
          <ChevronLeft className="size-4" />
        </Button>
        <span className="flex items-center px-2 text-sm tabular-nums">
          {page} / {totalPages}
        </span>
        <Button
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          size="icon"
          variant="outline"
        >
          <span className="sr-only">下一页</span>
          <ChevronRight className="size-4" />
        </Button>
        <Button
          disabled={page >= totalPages}
          onClick={() => onPageChange(totalPages)}
          size="icon"
          variant="outline"
        >
          <span className="sr-only">最后一页</span>
          <ChevronsRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}
