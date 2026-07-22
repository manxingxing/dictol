import {
  Group,
  Panel,
  Separator,
  type GroupProps,
  type PanelProps,
  type SeparatorProps
} from 'react-resizable-panels'

function ResizablePanelGroup({ className, ...props }: GroupProps): React.JSX.Element {
  return <Group className={className} {...props} />
}

function ResizablePanel(props: PanelProps): React.JSX.Element {
  return <Panel {...props} />
}

function ResizableHandle({ className, ...props }: SeparatorProps): React.JSX.Element {
  return (
    <Separator
      className={`group relative flex w-px items-center justify-center bg-border transition-colors hover:bg-primary ${className ?? ''}`}
      {...props}
    >
      <div className="z-10 h-8 w-1 rounded-full bg-border transition-colors group-hover:bg-primary" />
    </Separator>
  )
}

export { ResizableHandle, ResizablePanel, ResizablePanelGroup }
