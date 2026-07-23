import type { PGliteInterface } from '@electric-sql/pglite'
import { Repl } from '@electric-sql/pglite-repl'
import '@/assets/pglite-repl.css'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/app-store'

const debugPGlite = {
  waitReady: Promise.resolve(),
  query: (query: string, params?: unknown[]) => window.dictol.debug.pgliteQuery(query, params),
  exec: (query: string, options?: { rowMode?: 'array' | 'object' }) =>
    window.dictol.debug.pgliteExec(query, options)
} as unknown as PGliteInterface

export function PGliteDebugPanel(): React.JSX.Element {
  const showDebugPanel = useAppStore((state) => state.debugPanelOpen)

  return (
    <section
      className={cn(
        'shrink-0 border-l border-border bg-background [--PGliteRepl-background-color:var(--background)] [--PGliteRepl-border:1px_solid_var(--border)] [--PGliteRepl-border-color:var(--border)] [--PGliteRepl-foreground-color:var(--foreground)]}',
        showDebugPanel ? 'w-100' : 'hidden'
      )}
    >
      <div className="flex h-8 items-center border-b border-border px-3 text-xs font-medium text-muted-foreground">
        PGlite Debug REPL
      </div>
      <div className="h-[calc(100%-2rem)] overflow-hidden">
        <Repl disableUpdateSchema={false} pg={debugPGlite} showTime theme="auto" />
      </div>
    </section>
  )
}
