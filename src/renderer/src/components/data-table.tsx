import type { ReactNode } from 'react'
import { type RowData, type Table as ReactTable, flexRender } from '@tanstack/react-table'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { LoaderCircle } from 'lucide-react'

export interface DataTableProps<TData extends RowData> {
  table: ReactTable<TData>
  /** Number of visible columns (used for colSpan on empty/loading rows). */
  columnsCount: number
  /** Optional per-column className (applied to both <th> and <td>). */
  columnClassName?: (columnId: string) => string | undefined
  /** --- state callbacks --- */
  isLoading?: boolean
  isError?: boolean
  loadingMessage?: string
  errorMessage?: string
  /** ReactNode shown when data is loaded but empty. */
  emptyMessage?: ReactNode
}

/**
 * A reusable data-table built on shadcn/ui `<Table />` and TanStack React Table.
 *
 * Usage:
 * ```tsx
 * const table = useReactTable({ columns, data, ... })
 * return <DataTable table={table} columnsCount={columns.length} />
 * ```
 */
export function DataTable<TData extends RowData>({
  table,
  columnClassName,
  isLoading,
  isError,
  loadingMessage,
  errorMessage,
  emptyMessage,
}: DataTableProps<TData>): React.JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {isLoading ? (
        <DataTableSkeleton message={loadingMessage} />
      ) : isError ? (
        <DataTableError message={errorMessage} />
      ) : table.getRowModel().rows.length === 0 ? (
        <DataTableEmpty>{emptyMessage}</DataTableEmpty>
      ) : (
        <Table
          className="table-fixed"
          containerClassName="min-h-0 flex-1 overflow-auto"
        >
          <TableHeader className="sticky top-0 z-10 bg-card">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow className="hover:bg-transparent" key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    className={columnClassName?.(header.column.id)}
                    key={header.id}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                data-state={row.getIsSelected() ? 'selected' : undefined}
                key={row.id}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    className={columnClassName?.(cell.column.id)}
                    key={cell.id}
                  >
                    {flexRender(
                      cell.column.columnDef.cell,
                      cell.getContext()
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Internal sub-components
// ---------------------------------------------------------------------------

function DataTableSkeleton({ message }: { message?: string }): React.JSX.Element {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <LoaderCircle className="mr-2 size-4 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        {message ?? '加载中…'}
      </p>
    </div>
  )
}

function DataTableError({ message }: { message?: string }): React.JSX.Element {
  return (
    <p className="p-6 text-sm text-destructive">
      {message ?? '加载失败。'}
    </p>
  )
}

function DataTableEmpty({ children }: { children?: ReactNode }): React.JSX.Element {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
      {children ?? (
        <p className="text-sm text-muted-foreground">暂无数据</p>
      )}
    </div>
  )
}
