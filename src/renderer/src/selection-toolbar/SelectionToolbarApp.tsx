import { useCallback, useEffect, useRef, useState } from 'react'
import { BookOpen, Copy, MoreHorizontal, Search, Sparkles } from 'lucide-react'

import appIcon from '@/assets/icon_32x32.png'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

type SelectionToolbarPayload = {
  word: string
  programName: string
  canExclude: boolean
  aiEnabled: boolean
}

declare global {
  interface Window {
    dictolSelectionToolbar: {
      onUpdate: (callback: (payload: SelectionToolbarPayload) => void) => () => void
      lookupInMain: () => void
      explain: () => void
      aiExplain: () => void
      copy: () => void
      google: () => void
      openMenu: () => void
      activity: () => void
    }
  }
}

const initialPayload: SelectionToolbarPayload = {
  word: '',
  programName: '',
  canExclude: false,
  aiEnabled: false
}

export function SelectionToolbarApp(): React.JSX.Element {
  const [payload, setPayload] = useState(initialPayload)
  const lastActivityAt = useRef(Number.NEGATIVE_INFINITY)

  const notifyActivity = useCallback((): void => {
    const now = performance.now()
    if (now - lastActivityAt.current < 500) return
    lastActivityAt.current = now
    window.dictolSelectionToolbar.activity()
  }, [])

  useEffect(() => window.dictolSelectionToolbar.onUpdate(setPayload), [])

  return (
    <div
      className="selection-toolbar-shell"
      onPointerDown={notifyActivity}
      onPointerMove={notifyActivity}
    >
      <div className="selection-menu">
        <Button
          aria-label="在 Dictol 中查询"
          className="selection-action selection-action-logo"
          onClick={() => window.dictolSelectionToolbar.lookupInMain()}
          size="icon"
          title={payload.word ? `在 Dictol 中查询“${payload.word}”` : '在 Dictol 中查询'}
          type="button"
          variant="ghost"
        >
          <img alt="" src={appIcon} />
        </Button>
        <Separator className="selection-action-separator" orientation="vertical" />
        <Button
          className="selection-action selection-action-primary"
          onClick={() => window.dictolSelectionToolbar.explain()}
          size="sm"
          title={payload.word ? `解释“${payload.word}”` : '解释'}
          type="button"
          variant="ghost"
        >
          <BookOpen />
          查词
        </Button>
        {payload.aiEnabled && (
          <Button
            className="selection-action selection-action-primary"
            onClick={() => window.dictolSelectionToolbar.aiExplain()}
            size="sm"
            title={payload.word ? `使用 AI 解释“${payload.word}”` : 'AI 解释'}
            type="button"
            variant="ghost"
          >
            <Sparkles />
            AI 解释
          </Button>
        )}
        <Button
          className="selection-action"
          onClick={() => window.dictolSelectionToolbar.copy()}
          size="sm"
          title={payload.word ? `复制“${payload.word}”` : '复制'}
          type="button"
          variant="ghost"
        >
          <Copy />
          复制
        </Button>
        <Button
          className="selection-action"
          onClick={() => window.dictolSelectionToolbar.google()}
          size="sm"
          title={payload.word ? `使用 Google 搜索“${payload.word}”` : 'Google 搜索'}
          type="button"
          variant="ghost"
        >
          <Search />
          Google
        </Button>
        <Separator className="selection-action-separator" orientation="vertical" />
        <Button
          aria-label="更多划词操作"
          className="selection-action selection-action-more"
          disabled={!payload.canExclude}
          onClick={() => window.dictolSelectionToolbar.openMenu()}
          size="icon"
          title="更多划词操作"
          type="button"
          variant="ghost"
        >
          <MoreHorizontal />
        </Button>
      </div>
    </div>
  )
}
