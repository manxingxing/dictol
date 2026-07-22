import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  PanelLeftClose,
  PanelLeft,
  History,
  Library,
  Search,
  Settings
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const navigation = [
  { label: '查词', path: '/search', icon: Search },
  { label: '词典库', path: '/dictionaries', icon: Library },
  { label: '查询历史', path: '/history', icon: History }
]

interface WindowTitleBarProps {
  collapsed: boolean
  onToggleCollapsed: () => void
}

function WindowTitleBar({ collapsed, onToggleCollapsed }: WindowTitleBarProps): React.JSX.Element {
  const navigate = useNavigate()
  const { key: locationKey } = useLocation()
  const currentIndex = typeof window.history.state?.idx === 'number' ? window.history.state.idx : 0

  return (
    <header className="drag-region flex h-14 shrink-0 items-center border-b border-border bg-sidebar">
      <div
        className={`window-titlebar-content flex h-full items-center px-4 ${
          window.dictol.platform === 'darwin' ? 'pl-24' : ''
        }`}
      >
        <div className="no-drag flex items-center gap-1" data-route={locationKey}>
          <Button
            aria-label={collapsed ? '展开侧栏' : '收起侧栏'}
            onClick={onToggleCollapsed}
            size="icon"
            title={collapsed ? '展开侧栏' : '收起侧栏'}
            variant="ghost"
          >
            {collapsed ? <PanelLeftClose /> : <PanelLeft />}
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
        </div>
      </div>
    </header>
  )
}

export function AppLayout(): React.JSX.Element {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <WindowTitleBar
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((value) => !value)}
      />
      <div className="flex min-h-0 flex-1">
        <aside
          className={`relative flex shrink-0 flex-col border-r border-border bg-sidebar pb-4 pt-4 transition-[width] duration-200 ${
            collapsed ? 'w-[4.5rem] px-2' : 'w-56 px-3'
          }`}
        >
          <div className="relative mb-7 h-9 px-2">
            <div
              className={`absolute top-0 flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm transition-[left,transform] duration-200 ${
                collapsed ? 'left-1/2 -translate-x-1/2' : 'left-0 translate-x-0'
              }`}
            >
              <BookOpen className="size-5" />
            </div>
            <div
              className={`absolute left-11 top-0 overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-200 ${
                collapsed ? 'pointer-events-none max-w-0 opacity-0' : 'max-w-40 opacity-100'
              }`}
            >
              <div className="text-base font-semibold tracking-tight">Dictol</div>
              <div className="text-[11px] text-muted-foreground">桌面词典</div>
            </div>
          </div>

          <nav className="space-y-1" aria-label="主导航">
            {navigation.map(({ label, path, icon: Icon }) => (
              <NavLink key={path} to={path} className="block">
                {({ isActive }) => (
                  <Button
                    aria-label={label}
                    className={`w-full ${collapsed ? 'justify-center px-0' : 'justify-start'} ${
                      isActive
                        ? 'bg-primary/12 font-medium text-primary ring-1 ring-inset ring-primary/20'
                        : 'text-muted-foreground'
                    }`}
                    title={collapsed ? label : undefined}
                    variant="ghost"
                  >
                    <Icon />
                    {!collapsed && label}
                  </Button>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="mt-auto">
            <NavLink to="/settings" className="block">
              {({ isActive }) => (
                <Button
                  aria-label="设置"
                  className={`w-full ${collapsed ? 'justify-center px-0' : 'justify-start'} ${
                    isActive
                      ? 'bg-primary/12 font-medium text-primary ring-1 ring-inset ring-primary/20'
                      : 'text-muted-foreground'
                  }`}
                  title={collapsed ? '设置' : undefined}
                  variant="ghost"
                >
                  <Settings />
                  {!collapsed && '设置'}
                </Button>
              )}
            </NavLink>
            {!collapsed && (
              <p className="mt-3 px-3 text-[10px] text-muted-foreground">
                {window.dictol.platform} · Electron
              </p>
            )}
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="flex h-16 items-center border-b border-border px-8">
            <div className="relative w-full max-w-2xl">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="搜索单词…" aria-label="搜索单词" />
            </div>
          </header>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
