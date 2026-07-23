import { useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { useAppStore } from '@/stores/app-store'

type LookupWordMessage = {
  type: 'dictol:lookup-word'
  word: string
}

export function SearchResultPage(): React.JSX.Element {
  const { entryId } = useParams()
  const navigate = useNavigate()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const setSearchQuery = useAppStore((state) => state.setSearchQuery)

  useEffect(() => {
    const handleMessage = (event: MessageEvent<unknown>): void => {
      if (event.source !== iframeRef.current?.contentWindow || !isLookupWordMessage(event.data)) {
        return
      }
      const word = event.data.word.trim()
      if (!word) return
      setSearchQuery(word)
      void window.dictol.entries.search(word, 1).then((results) => {
        const first = results[0]
        if (first) void navigate(`/search/${first.id}`)
      })
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [navigate, setSearchQuery])

  if (!entryId) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        选择一个词条查看详情
      </div>
    )
  }

  return (
    <iframe
      key={entryId}
      ref={iframeRef}
      className="h-full w-full border-0 bg-white"
      sandbox="allow-scripts allow-same-origin"
      src={`dictol-entry://entry/${encodeURIComponent(entryId)}`}
      title="词条内容"
    />
  )
}

function isLookupWordMessage(value: unknown): value is LookupWordMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Partial<LookupWordMessage>).type === 'dictol:lookup-word' &&
    typeof (value as Partial<LookupWordMessage>).word === 'string'
  )
}
