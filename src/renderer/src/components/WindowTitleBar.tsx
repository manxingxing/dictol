import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, PanelLeft, PanelLeftClose, Terminal } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useAppStore } from '@/stores/app-store'

export function WindowTitleBar(): React.JSX.Element {
  const navigate = useNavigate()
  const { key: locationKey } = useLocation()
  const currentIndex = typeof window.history.state?.idx === 'number' ? window.history.state.idx : 0
  const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed)
  const toggleSidebar = useAppStore((state) => state.toggleSidebar)
  const debugPanelOpen = useAppStore((state) => state.debugPanelOpen)
  const toggleDebugPanel = useAppStore((state) => state.toggleDebugPanel)

  return (
    <header className="drag-region flex h-14 shrink-0 items-center border-b border-border bg-sidebar">
      <div
        className={`window-titlebar-content flex h-full items-center px-4 ${
          window.dictol.platform === 'darwin' ? 'pl-24' : ''
        }`}
      >
        <div className="no-drag flex items-center gap-1" data-route={locationKey}>
          <Button
            aria-label={sidebarCollapsed ? '展开侧栏' : '收起侧栏'}
            onClick={toggleSidebar}
            size="icon"
            title={sidebarCollapsed ? '展开侧栏' : '收起侧栏'}
            variant="ghost"
          >
            {sidebarCollapsed ? <PanelLeftClose /> : <PanelLeft />}
          </Button>
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
          {import.meta.env.DEV && (
            <Button
              aria-label={debugPanelOpen ? '隐藏数据库调试面板' : '显示数据库调试面板'}
              aria-pressed={debugPanelOpen}
              className={debugPanelOpen ? 'bg-muted text-[var(--primary)]' : ''}
              onClick={toggleDebugPanel}
              size="icon"
              title={debugPanelOpen ? '隐藏数据库调试面板' : '显示数据库调试面板'}
              variant="ghost"
            >
              <Terminal />
            </Button>
          )}
        </div>
      </div>
    </header>
  )
}
