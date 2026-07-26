import { Clock3 } from 'lucide-react'
import { NavLink } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useQueryHistory } from '@/hooks/use-query-history'
import { useQueryStore } from '@/stores/query-store'

export function SearchHistory(): React.JSX.Element {
  const setSearchQuery = useQueryStore((state) => state.setSearchQuery)
  const { data: history = [] } = useQueryHistory()
  const recentTerms = history.slice(0, 50)

  if (recentTerms.length === 0) {
    return <p className="px-3 py-8 text-center text-sm text-muted-foreground">输入单词开始查询</p>
  }

  return (
    <>
      <div className="flex shrink-0 items-center gap-2 px-3 pb-2 pt-1 text-xs font-medium text-muted-foreground">
        <Clock3 className="size-3.5" />
        最近查询
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <ul className="space-y-1">
          {recentTerms.map((item) => (
            <li key={item.id}>
              <NavLink
                className="block"
                onClick={() => setSearchQuery(item.term)}
                to={`/search/${encodeURIComponent(item.term)}`}
              >
                {({ isActive }) => (
                  <Button
                    className={`h-auto w-full justify-start px-3 py-2.5 text-left ${
                      isActive
                        ? 'bg-primary/12 font-medium text-primary ring-1 ring-inset ring-primary/20'
                        : 'text-foreground'
                    }`}
                    variant="ghost"
                  >
                    <span className="min-w-0 truncate">{item.term}</span>
                  </Button>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </ScrollArea>
    </>
  )
}
