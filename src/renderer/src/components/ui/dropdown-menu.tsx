import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import { Check, ChevronRight } from 'lucide-react'
import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

function DropdownMenu(props: ComponentProps<typeof DropdownMenuPrimitive.Root>): React.JSX.Element {
  return <DropdownMenuPrimitive.Root {...props} />
}

function DropdownMenuTrigger(
  props: ComponentProps<typeof DropdownMenuPrimitive.Trigger>
): React.JSX.Element {
  return <DropdownMenuPrimitive.Trigger {...props} />
}

function DropdownMenuPortal(
  props: ComponentProps<typeof DropdownMenuPrimitive.Portal>
): React.JSX.Element {
  return <DropdownMenuPrimitive.Portal {...props} />
}

function DropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Content>): React.JSX.Element {
  return (
    <DropdownMenuPortal>
      <DropdownMenuPrimitive.Content
        className={cn(
          'z-50 min-w-36 overflow-hidden rounded-lg border border-border bg-card p-1 text-foreground shadow-md',
          className
        )}
        sideOffset={sideOffset}
        {...props}
      />
    </DropdownMenuPortal>
  )
}

function DropdownMenuItem({
  className,
  inset,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Item> & { inset?: boolean }): React.JSX.Element {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        'relative flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none transition-colors focus:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        inset && 'pl-8',
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Separator>): React.JSX.Element {
  return (
    <DropdownMenuPrimitive.Separator
      className={cn('-mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  )
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Label> & { inset?: boolean }): React.JSX.Element {
  return (
    <DropdownMenuPrimitive.Label
      className={cn(
        'px-2 py-1.5 text-xs font-medium text-muted-foreground',
        inset && 'pl-8',
        className
      )}
      {...props}
    />
  )
}

export {
  Check as DropdownMenuCheckIcon,
  ChevronRight as DropdownMenuSubIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
}
