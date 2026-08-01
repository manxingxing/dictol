import { useEffect, useState } from 'react'
import { ExternalLink, LoaderCircle, X } from 'lucide-react'

import { Button } from '@/components/ui/button'

type SelectionExplanationPayload = {
  requestId: number
  word: string
  dictionaryName?: string
  state: 'loading' | 'empty' | 'content' | 'error'
  message?: string
}

declare global {
  interface Window {
    dictolSelectionExplanation: {
      onUpdate: (callback: (payload: SelectionExplanationPayload) => void) => () => void
      loadingReady: (requestId: number) => void
      close: () => void
      openInMain: () => void
    }
  }
}

const initialPayload: SelectionExplanationPayload = {
  requestId: 0,
  word: '',
  state: 'loading'
}

export function SelectionExplanationApp(): React.JSX.Element {
  const [payload, setPayload] = useState(initialPayload)

  useEffect(() => window.dictolSelectionExplanation.onUpdate(setPayload), [])
  useEffect(() => {
    if (payload.state !== 'loading' || payload.requestId === 0) return
    window.dictolSelectionExplanation.loadingReady(payload.requestId)
  }, [payload.requestId, payload.state])
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') window.dictolSelectionExplanation.close()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [])

  return (
    <div className="flex h-screen flex-col overflow-hidden rounded-xl border border-border bg-background text-foreground shadow-xl">
      <header className="drag-region flex h-11 shrink-0 items-center gap-3 border-b border-border px-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{payload.word || '词典解释'}</p>
          {payload.dictionaryName && (
            <p className="truncate text-[11px] text-muted-foreground">{payload.dictionaryName}</p>
          )}
        </div>
        <Button
          aria-label="在主窗口中打开"
          className="no-drag size-7 shrink-0"
          onClick={() => window.dictolSelectionExplanation.openInMain()}
          size="icon"
          title="在主窗口中打开"
          type="button"
          variant="ghost"
        >
          <ExternalLink />
        </Button>
        <Button
          aria-label="关闭解释窗口"
          className="no-drag size-7 shrink-0"
          onClick={() => window.dictolSelectionExplanation.close()}
          size="icon"
          type="button"
          variant="ghost"
        >
          <X />
        </Button>
      </header>

      {payload.state !== 'content' && (
        <main className="flex min-h-0 flex-1 items-center justify-center p-8 text-center">
          {payload.state === 'loading' ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" />
              正在查询…
            </div>
          ) : (
            <div>
              <p className="text-sm font-medium">
                {payload.state === 'empty' ? '没有找到词条解释' : '加载词条失败'}
              </p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {payload.message ?? `第一个可用词典中没有“${payload.word}”的解释`}
              </p>
            </div>
          )}
        </main>
      )}
    </div>
  )
}
