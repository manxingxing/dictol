import { FormEvent, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ArrowRight, Globe2, Link, Unlink, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RightSidebarSizeToggle } from '@/components/RightSidebarSizeToggle'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/app-store'

export function EmbedBrowser(): React.JSX.Element {
  const { term } = useParams<{ term?: string }>()
  const url = useAppStore((state) => state.embedBrowserUrl)
  const searchTerm = useAppStore((state) => state.embedBrowserSearchTerm)
  const setEmbedBrowserUrl = useAppStore((state) => state.setEmbedBrowserUrl)
  const setEmbedBrowserSearchTerm = useAppStore((state) => state.setEmbedBrowserSearchTerm)
  const setRightSidebarOpen = useAppStore((state) => state.setRightSidebarOpen)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const [address, setAddress] = useState(url)
  const [error, setError] = useState<string | null>(null)
  const [followSearch, setFollowSearch] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const normalizedTerm = term?.trim() ?? ''
  const followedTermRef = useRef(normalizedTerm)
  const hasUrl = url.length > 0

  useEffect(() => window.dictol.embedBrowser.onUrlChanged(setAddress), [])

  useEffect(() => window.dictol.embedBrowser.onLoadingChanged(setIsLoading), [])

  useEffect(() => {
    if (!url) return
    // The address field mirrors the URL selected by the parent route.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAddress(url)
    setIsLoading(true)
    void window.dictol.embedBrowser.load(url).catch((loadError: unknown) => {
      console.error('Failed to load embedded online dictionary', { url, loadError })
      setIsLoading(false)
    })
  }, [url])

  useEffect(() => {
    if (!followSearch) return
    if (normalizedTerm === followedTermRef.current) return

    followedTermRef.current = normalizedTerm
    if (!normalizedTerm) return

    const previousTerm = searchTerm.trim()
    if (!previousTerm) return
    if (normalizedTerm === previousTerm) return

    const nextUrl = replaceSearchTerm(url, previousTerm, normalizedTerm)
    if (nextUrl === url) return

    setEmbedBrowserUrl(nextUrl)
    setEmbedBrowserSearchTerm(normalizedTerm)
  }, [followSearch, normalizedTerm, searchTerm, setEmbedBrowserSearchTerm, setEmbedBrowserUrl, url])

  useLayoutEffect(() => {
    const container = contentRef.current
    if (!container || !hasUrl) return

    let animationFrame = 0
    const updateBounds = (): void => {
      const bounds = container.getBoundingClientRect()
      window.dictol.embedBrowser.setBounds({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height
      })
    }
    const scheduleBoundsUpdate = (): void => {
      if (animationFrame) return
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0
        updateBounds()
      })
    }
    const observer = new ResizeObserver(scheduleBoundsUpdate)
    observer.observe(container)
    scheduleBoundsUpdate()
    return () => {
      observer.disconnect()
      if (animationFrame) window.cancelAnimationFrame(animationFrame)
      window.dictol.embedBrowser.hide()
    }
  }, [hasUrl])

  const submitAddress = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const nextUrl = address.trim()
    if (!isHttpUrl(nextUrl)) {
      setError('请输入以 http:// 或 https:// 开头的网址')
      return
    }
    setError(null)
    setAddress(nextUrl)
    setEmbedBrowserUrl(nextUrl)
    setEmbedBrowserSearchTerm(normalizedTerm)
    if (nextUrl === url) {
      setIsLoading(true)
      void window.dictol.embedBrowser.load(nextUrl).catch((loadError: unknown) => {
        console.error('Failed to navigate embedded online dictionary', { nextUrl, loadError })
        setIsLoading(false)
        setError('网页加载失败，请检查网址后重试')
      })
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--surface-secondary)]">
      <div className="flex h-12 shrink-0 items-center border-b border-border px-4">
        <Globe2 className="mr-2 size-4 text-primary" />
        <h2 className="min-w-0 flex-1 text-sm font-medium">在线词典</h2>
        <Button
          aria-label={followSearch ? '关闭跟随查询' : '跟随查询'}
          aria-pressed={followSearch}
          className={cn(
            'mr-1 size-7 shrink-0',
            followSearch && 'bg-primary/10 text-primary hover:bg-primary/15'
          )}
          onClick={() => {
            if (!followSearch) followedTermRef.current = normalizedTerm
            setFollowSearch((value) => !value)
          }}
          size="icon"
          title={followSearch ? '关闭跟随查询' : '跟随查询'}
          type="button"
          variant="ghost"
        >
          {followSearch ? <Link /> : <Unlink />}
        </Button>
        <RightSidebarSizeToggle />
        <Button
          aria-label="关闭辅助面板"
          className="size-7 shrink-0"
          onClick={() => setRightSidebarOpen(false)}
          size="icon"
          title="关闭辅助面板"
          type="button"
          variant="ghost"
        >
          <X />
        </Button>
      </div>
      {url ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <form
            className="relative flex shrink-0 items-center gap-2 border-b border-border p-2"
            onSubmit={submitAddress}
          >
            <Globe2 className="ml-1 size-4 shrink-0 text-muted-foreground" />
            <Input
              aria-label="在线词典网址"
              className="h-8 min-w-0 flex-1 rounded-md px-2 text-xs"
              onChange={(event) => setAddress(event.target.value)}
              value={address}
            />
            <Button
              aria-label="打开网址"
              className="size-8 shrink-0"
              size="icon"
              title="打开网址"
              type="submit"
              variant="ghost"
            >
              <ArrowRight className="size-3.5" />
            </Button>
            {isLoading && (
              <div
                aria-label="网页正在加载"
                className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden"
                role="progressbar"
              >
                <div className="native-view-loading-indicator h-full bg-primary" />
              </div>
            )}
          </form>
          {error && <p className="shrink-0 px-3 py-1 text-xs text-destructive">{error}</p>}
          <div aria-label="在线词典内容" className="min-h-0 flex-1" ref={contentRef} />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center text-sm leading-6 text-muted-foreground">
          选择一个在线词典后，可以在这里打开
        </div>
      )}
    </div>
  )
}

function replaceSearchTerm(url: string, previousTerm: string, nextTerm: string): string {
  const encodedPreviousTerm = encodeURIComponent(previousTerm)
  const encodedNextTerm = encodeURIComponent(nextTerm)
  if (url.includes(encodedPreviousTerm)) {
    return url.split(encodedPreviousTerm).join(encodedNextTerm)
  }
  if (url.includes(previousTerm)) {
    return url.split(previousTerm).join(nextTerm)
  }
  return url
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
