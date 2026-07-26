import { useLocation, useNavigate } from 'react-router-dom'
import { AppWindow, ArrowLeft, ArrowRight, PanelLeft, PanelLeftClose, PanelsTopLeft } from 'lucide-react'

import { CompactTitleBarSearch } from '@/components/CompactTitleBarSearch'
import { Button } from '@/components/ui/button'
import { selectCompactMode, useAppStore } from '@/stores/app-store'

export function WindowTitleBar(): React.JSX.Element {
  const navigate = useNavigate()
  const location = useLocation()
  const currentIndex = typeof window.history.state?.idx === 'number' ? window.history.state.idx : 0

  const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed)
  const toggleSidebar = useAppStore((state) => state.toggleSidebar)
  const compactModeEnabled = useAppStore((state) => state.compactModeEnabled)
  const toggleCompactMode = useAppStore((state) => state.toggleCompactMode)
  const displayInCompactMode = useAppStore(selectCompactMode)
  const windowBelowCompactThreshold = useAppStore((state) => state.windowBelowCompactThreshold)
  const compactModeButtonLabel = compactModeEnabled ? '关闭紧凑模式' : '始终使用紧凑模式'


  return (
    <header className="drag-region flex h-14 shrink-0 items-center border-b border-border bg-sidebar">
      <div
        className={`window-titlebar-content flex h-full min-w-0 items-center gap-2 px-4 ${
          window.dictol.platform === 'darwin' ? 'pl-24' : ''
        }`}
      >
        <div className="no-drag flex shrink-0 items-center gap-1" data-route={location.key}>
          {!displayInCompactMode && (
            <Button
              aria-label={sidebarCollapsed ? '展开侧栏' : '收起侧栏'}
              onClick={toggleSidebar}
              size="icon"
              title={sidebarCollapsed ? '展开侧栏' : '收起侧栏'}
              variant="ghost"
            >
              {sidebarCollapsed ? <PanelLeftClose /> : <PanelLeft />}
            </Button>
          )}
          <Button
            aria-label="后退"
            disabled={currentIndex <= 0}
            onClick={() => navigate(-1)}
            size="icon"
            title="后退"
            variant="ghost"
          >
            <ArrowLeft />
          </Button>
          <Button
            aria-label="前进"
            onClick={() => navigate(1)}
            size="icon"
            title="前进"
            variant="ghost"
          >
            <ArrowRight />
          </Button>
        </div>

        <div className="flex min-w-0 flex-1 justify-center px-1">
          {displayInCompactMode && <CompactTitleBarSearch />}
        </div>

        <div className="no-drag flex shrink-0 items-center">
          {!windowBelowCompactThreshold && (
            <Button
              aria-label={compactModeButtonLabel}
              aria-pressed={compactModeEnabled}
              onClick={toggleCompactMode}
              size="icon"
              title={compactModeButtonLabel}
              variant="ghost"
            >
              {compactModeEnabled ? <PanelsTopLeft /> : <AppWindow />}
            </Button>
          )}
        </div>
        {windowBelowCompactThreshold && <div className="h-full w-14 shrink-0" aria-hidden="true" />}
      </div>
    </header>
  )
}
