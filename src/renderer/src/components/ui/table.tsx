import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

function Table({ className, ...props }: ComponentProps<'table'>): React.JSX.Element {
  return (
    <div className="relative w-full overflow-x-auto" data-slot="table-container">
      <table className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  )
}

function TableHeader({ className, ...props }: ComponentProps<'thead'>): React.JSX.Element {
  return <thead className={cn('[&_tr]:border-b', className)} {...props} />
}

function TableBody({ className, ...props }: ComponentProps<'tbody'>): React.JSX.Element {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />
}

function TableFooter({ className, ...props }: ComponentProps<'tfoot'>): React.JSX.Element {
  return (
    <tfoot
      className={cn('border-t bg-muted/50 font-medium [&>tr]:last:border-b-0', className)}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: ComponentProps<'tr'>): React.JSX.Element {
  return <tr className={cn('border-b transition-colors hover:bg-muted/50', className)} {...props} />
}

function TableHead({ className, ...props }: ComponentProps<'th'>): React.JSX.Element {
  return (
    <th
      className={cn(
        'h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-muted-foreground',
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: ComponentProps<'td'>): React.JSX.Element {
  return <td className={cn('p-2 align-middle whitespace-nowrap', className)} {...props} />
}

function TableCaption({ className, ...props }: ComponentProps<'caption'>): React.JSX.Element {
  return <caption className={cn('mt-4 text-sm text-muted-foreground', className)} {...props} />
}

export { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow }
