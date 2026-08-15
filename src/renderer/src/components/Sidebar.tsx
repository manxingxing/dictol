import { NavLink } from 'react-router-dom'
import { BookMarked, History, Languages, Library, Search, Settings } from 'lucide-react'

import appIcon from '@/assets/icon_320x320.png'
import { Button } from '@/components/ui/button'
import { useAiLookupConfig } from '@/hooks/use-ai-lookup'
import { useAppStore } from '@/stores/app-store'

const navigation = [
  { label: '查词', path: '/search', icon: Search },
  { label: '历史', path: '/history', icon: History },
  { label: '生词本', path: '/wordbooks', icon: BookMarked },
]

export function Sidebar(): React.JSX.Element {
  const lastQueryPath = useAppStore((state) => state.lastQueryPath)
  const aiConfig = useAiLookupConfig()
  const items = aiConfig.data?.enabled
    ? [...navigation, { label: '翻译', path: '/translation', icon: Languages }]
    : navigation

  return (
    <aside className="flex w-[4rem] shrink-0 flex-col border-r border-border bg-sidebar px-2 pt-3.5 pb-3">
      <div className="mb-[22px] flex h-9 justify-center">
        <div className="size-9 overflow-hidden rounded-xl shadow-sm" title="Dictol">
          <img alt="" className="size-full object-cover" src={appIcon} />
        </div>
      </div>

      <nav className="space-y-2.5" aria-label="主导航">
        {items.map(({ label, path, icon: Icon }) => (
          <NavLink
            key={path}
            to={path === '/search' ? (lastQueryPath ?? path) : path}
            className="block"
          >
            {({ isActive }) => (
              <Button
                aria-label={label}
                className={`h-auto w-full flex-col gap-1 px-0 py-1.5 ${
                  isActive
                    ? 'bg-primary/8 font-medium text-primary ring-1 ring-inset ring-primary/20 hover:bg-primary/12'
                    : 'text-muted-foreground'
                }`}
                title={label}
                variant="ghost"
              >
                <Icon />
                <span className="text-[11px]">{label}</span>
              </Button>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto space-y-2.5">
        <NavLink to="/dictionaries" className="block">
          {({ isActive }) => (
            <Button
              aria-label="词典库"
              className={`h-auto w-full flex-col gap-1 px-0 py-1.5 ${
                isActive
                  ? 'bg-primary/12 font-medium text-primary ring-1 ring-inset ring-primary/20'
                  : 'text-muted-foreground'
              }`}
              title="词典库"
              variant="ghost"
            >
              <Library />
              <span className="text-[11px]">词典库</span>
            </Button>
          )}
        </NavLink>
        <NavLink to="/settings" className="block">
          {({ isActive }) => (
            <Button
              aria-label="设置"
              className={`h-auto w-full flex-col gap-1 px-0 py-1.5 ${
                isActive
                  ? 'bg-primary/12 font-medium text-primary ring-1 ring-inset ring-primary/20'
                  : 'text-muted-foreground'
              }`}
              title="设置"
              variant="ghost"
            >
              <Settings className="size-5" />
              <span className="text-[11px] leading-none">设置</span>
            </Button>
          )}
        </NavLink>
      </div>
    </aside>
  )
}
