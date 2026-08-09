import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, X } from 'lucide-react'

type FindResult = {
  requestId: number
  matches: number
  activeMatchOrdinal: number
  finalUpdate: boolean
}

declare global {
  interface Window {
    dictolFindBar: {
      findInPage: (text: string) => void
      findNext: (text: string, forward: boolean) => void
      clearFind: () => void
      stopFind: () => void
      onFindResult: (callback: (result: FindResult) => void) => () => void
    }
  }
}

export function FindBarApp(): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [countText, setCountText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Focus input on mount
  useEffect(() => {
    const el = inputRef.current
    if (el) {
      el.focus()
      el.select()
    }
  }, [])

  // Subscribe to find results
  useEffect(() => {
    return window.dictolFindBar.onFindResult((result) => {
      if (result.finalUpdate) {
        if (result.matches > 0) {
          setCountText(`${result.activeMatchOrdinal}/${result.matches}`)
        } else {
          setCountText(result.matches === 0 ? '0/0' : '')
        }
      }
    })
  }, [])

  const doFind = useCallback((text: string) => {
    if (!text) {
      window.dictolFindBar.clearFind()
      setCountText('')
    } else {
      window.dictolFindBar.findInPage(text)
    }
  }, [])

  const doFindNext = useCallback(
    (forward: boolean) => {
      const text = query.trim()
      if (!text) return
      window.dictolFindBar.findNext(text, forward)
    },
    [query]
  )

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value
      setQuery(value)
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => doFind(value.trim()), 120)
    },
    [doFind]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        clearTimeout(timerRef.current)
        doFindNext(!e.shiftKey)
      }
      if (e.key === 'Escape') {
        window.dictolFindBar.stopFind()
        window.close()
      }
    },
    [query, doFind, doFindNext]
  )

  return (
    <div className="find-bar-shell">
      <input
        ref={inputRef}
        type="text"
        value={query}
        placeholder="在页面中查找…"
        onChange={handleInput}
        onKeyDown={handleKeyDown}
      />
      <span className="count">{countText}</span>
      <button
        type="button"
        title="上一个 (Shift+Enter)"
        onPointerDown={(e) => {
          e.preventDefault()
          doFindNext(false)
        }}
      >
        <ChevronUp size={14} strokeWidth={2} />
      </button>
      <button
        type="button"
        title="下一个 (Enter)"
        onPointerDown={(e) => {
          e.preventDefault()
          doFindNext(true)
        }}
      >
        <ChevronDown size={14} strokeWidth={2} />
      </button>
      <button
        type="button"
        title="关闭 (Escape)"
        onPointerDown={(e) => {
          e.preventDefault()
          window.dictolFindBar.stopFind()
          window.close()
        }}
      >
        <X size={14} strokeWidth={2} />
      </button>
    </div>
  )
}
