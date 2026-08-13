import { useEffect, useRef } from 'react'
import { Outlet } from 'react-router-dom'
import { usePanelCallbackRef } from 'react-resizable-panels'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'

import {
  RIGHT_SIDEBAR_DEFAULT_SIZE,
  RIGHT_SIDEBAR_MAX_SIZE,
  selectCompactMode,
  useAppStore
} from '@/stores/app-store'
import { SearchPanel } from '@/components/SearchPanel'
import { RightSidebar } from '@/components/RightSidebar'

const getRightSidebarPanelSize = (size: number | string | undefined): string =>
  size === undefined ? RIGHT_SIDEBAR_DEFAULT_SIZE : typeof size === 'number' ? `${size}%` : size

export const SearchLayout = (): React.JSX.Element => {
  const displayInCompactMode = useAppStore(selectCompactMode)
  const rightSidebarOpen = useAppStore((state) => state.rightSidebarOpen)
  const searchPanelSize = useAppStore((state) => state.searchPanelSize)
  const setSearchPanelSize = useAppStore((state) => state.setSearchPanelSize)
  const rightSidebarSize = useAppStore((state) => state.rightSidebarSize)
  const setRightSidebarSize = useAppStore((state) => state.setRightSidebarSize)
  const setRightSidebarMaximized = useAppStore((state) => state.setRightSidebarMaximized)
  const rightSidebarResizeRequest = useAppStore((state) => state.rightSidebarResizeRequest)
  const [rightSidebarPanel, setRightSidebarPanel] = usePanelCallbackRef()
  const handledRightSidebarResizeRequest = useRef(rightSidebarResizeRequest)
  const rightSidebarPanelSize = getRightSidebarPanelSize(rightSidebarSize)

  useEffect(() => {
    if (
      !rightSidebarOpen ||
      rightSidebarResizeRequest === handledRightSidebarResizeRequest.current
    ) {
      return
    }
    if (!rightSidebarPanel) return

    rightSidebarPanel.resize(rightSidebarPanelSize)
    handledRightSidebarResizeRequest.current = rightSidebarResizeRequest
  }, [rightSidebarOpen, rightSidebarPanel, rightSidebarPanelSize, rightSidebarResizeRequest])

  return (
    <section className="flex h-full min-h-0 flex-col">
      <ResizablePanelGroup
        className="min-h-0 w-full flex-1 border-border"
        onLayoutChanged={(layout, { isUserInteraction }) => {
          if (!isUserInteraction) return
          const nextSearchPanelSize = layout['search-panel']
          const nextRightSidebarSize = layout['right-sidebar']
          if (nextSearchPanelSize !== undefined) setSearchPanelSize(nextSearchPanelSize)
          if (nextRightSidebarSize !== undefined) setRightSidebarSize(nextRightSidebarSize)
        }}
        orientation="horizontal"
      >
        {!displayInCompactMode && (
          <>
            <ResizablePanel
              id="search-panel"
              key="search-panel"
              aria-hidden={displayInCompactMode}
              defaultSize={searchPanelSize === undefined ? '20' : `${searchPanelSize}%`}
              minSize={180}
              maxSize={300}
            >
              <SearchPanel />
            </ResizablePanel>
            <ResizableHandle key="search-panel-handle" />
          </>
        )}
        <ResizablePanel id="search-results" minSize={100}>
          <Outlet />
        </ResizablePanel>
        {rightSidebarOpen && (
          <>
            <ResizableHandle key={'right-panel-handle'} />
            <ResizablePanel
              id="right-sidebar"
              key="right-panel"
              defaultSize={rightSidebarPanelSize}
              maxSize={RIGHT_SIDEBAR_MAX_SIZE}
              minSize={220}
              onResize={(size) => {
                const isMaximized = size.asPercentage >= Number(RIGHT_SIDEBAR_MAX_SIZE) - 0.5
                setRightSidebarMaximized(isMaximized)
              }}
              panelRef={setRightSidebarPanel}
            >
              <RightSidebar />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </section>
  )
}
