import { useCallback, useLayoutEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Layout, LayoutChangedMeta, usePanelRef } from 'react-resizable-panels'

import { selectCompactMode, useAppStore } from '@/stores/app-store'
import { SearchPanel } from '@/components/SearchPanel'
import { cn } from '@/lib/utils'

export const SearchLayout = (): React.JSX.Element => {
  const displayInCompactMode = useAppStore(selectCompactMode)
  const setCompactMode = useAppStore((state) => state.setCompactMode)
  const windowBelowCompactThreshold = useAppStore((state) => state.windowBelowCompactThreshold)

  const searchPanelRef = usePanelRef()

  // compact mode下自动折叠搜索面板
  useLayoutEffect(() => {
    if (displayInCompactMode) searchPanelRef.current?.collapse()
    else searchPanelRef.current?.expand()
  }, [displayInCompactMode, searchPanelRef])

  // 手动折叠面板时，自动切换到 compact mode
  const toggleCompactModeOnCollapse = useCallback(
    (_layout: Layout, meta: LayoutChangedMeta) => {
      if (meta.isUserInteraction) {
        if (searchPanelRef.current?.isCollapsed()) {
          setCompactMode(true)
        } else {
          setCompactMode(false)
        }
      }
    },
    [searchPanelRef, setCompactMode]
  )

  return (
    <section className="flex h-full min-h-0 flex-col">
      <ResizablePanelGroup
        className="min-h-0 w-full flex-1 border-y border-border"
        orientation="horizontal"
        onLayoutChanged={toggleCompactModeOnCollapse}
        disabled={windowBelowCompactThreshold}
      >
        <ResizablePanel
          aria-hidden={displayInCompactMode}
          className={cn('overflow-hidden', displayInCompactMode && 'hidden')}
          collapsible
          collapsedSize={0}
          defaultSize={240}
          minSize={200}
          maxSize={400}
          panelRef={searchPanelRef}
        >
          <SearchPanel />
        </ResizablePanel>
        <ResizableHandle
          disabled={windowBelowCompactThreshold}
          className={windowBelowCompactThreshold ? 'hidden' : undefined}
        />
        <ResizablePanel minSize={100}>
          <Outlet />
        </ResizablePanel>
      </ResizablePanelGroup>
    </section>
  )
}
