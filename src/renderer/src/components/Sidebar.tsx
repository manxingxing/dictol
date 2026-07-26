import { NavLink } from 'react-router-dom'
import { BookOpen, History, Library, Search, Settings } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { selectSidebarCollapsed, useAppStore } from '@/stores/app-store'

const navigation = [
  { label: '查词', path: '/search', icon: Search },
  { label: '词典库', path: '/dictionaries', icon: Library },
  { label: '查询历史', path: '/history', icon: History }
]

export function Sidebar(): React.JSX.Element {
  const collapsed = useAppStore(selectSidebarCollapsed)

  return (
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
                    ? 'bg-primary/8 font-medium text-primary ring-1 ring-inset ring-primary/20 hover:bg-primary/12'
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
      </div>
    </aside>
  )
}
