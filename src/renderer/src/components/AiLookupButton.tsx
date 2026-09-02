import { Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/app-store'
import { useCallback, useEffect } from 'react'

interface AiLookupButtonProps {
  term: string
}

export function AiLookupButton({ term }: AiLookupButtonProps): React.JSX.Element {
  const aiSearchTerm = useAppStore((state) => state.aiSearchTerm)
  const setAiSearchTerm = useAppStore((state) => state.setAiSearchTerm)
  const rightSidebarOpen = useAppStore((state) => state.rightSidebarOpen)
  const setRightSidebarOpen = useAppStore((state) => state.setRightSidebarOpen)
  const rightSidebarType = useAppStore((state) => state.rightSidebarType)
  const setRightSidebarType = useAppStore((state) => state.setRightSidebarType)

  const isAiSearchActive = Boolean(
    rightSidebarOpen && rightSidebarType === 'ai-search' && term && term === aiSearchTerm
  )

  const lookupTermInAISideBar = useCallback(
    (term): void => {
      setAiSearchTerm(term)
      setRightSidebarType('ai-search')
      setRightSidebarOpen(true)
    },
    [setAiSearchTerm, setRightSidebarOpen, setRightSidebarType]
  )

  // 响应词典解释区的 "AI 解释" 请求
  useEffect(() => {
    return window.dictol.dictionaryView.onExplainWithAi((value) => {
      const text = value.trim()
      if (!text) return
      lookupTermInAISideBar(text)
    })
  }, [lookupTermInAISideBar])

  return (
    <Button
      aria-label="AI 查词"
      aria-pressed={isAiSearchActive}
      className={cn(
        'search-action-button size-7 shrink-0 rounded-lg',
        isAiSearchActive && 'search-action-button-active'
      )}
      onClick={() => lookupTermInAISideBar(term)}
      size="icon"
      title="使用 AI 查词"
      type="button"
      variant="ghost"
    >
      <Sparkles />
    </Button>
  )
}
