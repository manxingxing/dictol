import { Maximize2, Minimize2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useAppStore } from '@/stores/app-store'

export function RightSidebarSizeToggle(): React.JSX.Element {
  const isMaximized = useAppStore((state) => state.rightSidebarMaximized)
  const toggleRightSidebarSize = useAppStore((state) => state.toggleRightSidebarSize)
  const label = isMaximized ? '恢复默认侧边栏宽度' : '最大化侧边栏'

  return (
    <Button
      aria-label={label}
      aria-pressed={isMaximized}
      className="mr-1 size-7 shrink-0"
      onClick={toggleRightSidebarSize}
      size="icon"
      title={label}
      type="button"
      variant="ghost"
    >
      {isMaximized ? <Minimize2 /> : <Maximize2 />}
    </Button>
  )
}
