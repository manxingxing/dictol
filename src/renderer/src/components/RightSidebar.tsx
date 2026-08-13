import { EmbedBrowser } from '@/components/EmbedBrowser'
import { AiLookupSidebar } from '@/components/AiLookupSidebar'
import { useAppStore } from '@/stores/app-store'

export function RightSidebar(): React.JSX.Element {
  const rightSidebarType = useAppStore((state) => state.rightSidebarType)

  return (
    <aside aria-label="辅助面板" className="h-full min-h-0">
      {rightSidebarType === 'ai-search' ? <AiLookupSidebar /> : <EmbedBrowser />}
    </aside>
  )
}
