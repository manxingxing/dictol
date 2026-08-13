import type { ComponentProps } from 'react'

import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type InputGroupAddonProps = ComponentProps<'div'> & {
  align?: 'inline-start' | 'inline-end'
}

function InputGroup({ className, ...props }: ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot="input-group"
      className={cn(
        'group/input-group relative flex w-full items-center rounded-lg border border-input bg-background shadow-xs outline-none transition-[color,box-shadow] focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30 aria-invalid:border-destructive aria-invalid:ring-destructive/20',
        className
      )}
      {...props}
    />
  )
}

function InputGroupInput({ className, ...props }: ComponentProps<'input'>): React.JSX.Element {
  return (
    <Input
      data-slot="input-group-control"
      className={cn(
        'h-10 flex-1 rounded-[inherit] border-0 bg-transparent shadow-none focus-visible:border-transparent focus-visible:ring-0',
        className
      )}
      {...props}
    />
  )
}

function InputGroupAddon({
  className,
  align = 'inline-start',
  ...props
}: InputGroupAddonProps): React.JSX.Element {
  return (
    <div
      data-align={align}
      data-slot="input-group-addon"
      className={cn(
        'absolute inset-y-0 z-10 flex items-center justify-center text-muted-foreground',
        align === 'inline-start' ? 'left-0 pl-3' : 'right-0 pr-3',
        className
      )}
      {...props}
    />
  )
}

export { InputGroup, InputGroupAddon, InputGroupInput }
