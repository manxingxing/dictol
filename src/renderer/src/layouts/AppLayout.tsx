import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Outlet, useNavigate } from 'react-router-dom'

import { WindowTitleBar } from '@/components/WindowTitleBar'
import { Sidebar } from '@/components/Sidebar'
import { Button } from '@/components/ui/button'
import { useWindowWidthThreshold } from '@/hooks/use-window-width-threshold'
import { useQueryStore } from '@/stores/query-store'

export function AppLayout(): React.JSX.Element {
  const navigate = useNavigate()
  const setSearchQuery = useQueryStore((state) => state.setSearchQuery)
  const [captureNotice, setCaptureNotice] = useState<string | null>(null)

  useWindowWidthThreshold()

  useEffect(() => {
    return window.dictol.wordCapture.onEvent((event) => {
      if (event.type === 'lookup') {
        setCaptureNotice(null)
        setSearchQuery(event.text)
        void navigate(`/search/${encodeURIComponent(event.text)}`)
        return
      }
      if (event.type === 'permission-required') {
        setCaptureNotice('需要开启辅助功能权限，才能读取其他软件中选中的文字。')
        void navigate('/settings')
        return
      }
      setCaptureNotice(
        event.type === 'empty' ? '没有检测到选中的文字，请先选择一个单词。' : event.message
      )
    })
  }, [navigate, setSearchQuery])

  useEffect(() => {
    if (!captureNotice) return
    const timer = window.setTimeout(() => setCaptureNotice(null), 5000)
    return () => window.clearTimeout(timer)
  }, [captureNotice])

  return (
    <div className="relative flex h-screen min-h-0 flex-col bg-background text-foreground">
      <WindowTitleBar />

      {captureNotice && (
        <div
          className="absolute right-4 top-16 z-50 flex max-w-sm items-center gap-3 rounded-lg border border-border bg-background px-4 py-3 text-sm shadow-lg"
          role="status"
        >
          <span>{captureNotice}</span>
          <Button
            aria-label="关闭提示"
            className="size-7 shrink-0"
            onClick={() => setCaptureNotice(null)}
            size="icon"
            variant="ghost"
          >
            <X className="size-4" />
          </Button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
        <Sidebar />

        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
