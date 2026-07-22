import { Outlet } from 'react-router-dom'

import { PGliteDebugPanel } from '@/components/PGliteDebugPanel'
import { Sidebar } from '@/components/Sidebar'
import { WindowTitleBar } from '@/components/WindowTitleBar'
import { useAppStore } from '@/stores/app-store'

export function AppLayout(): React.JSX.Element {

  return (
    <div className="flex h-screen min-h-0 flex-col bg-background text-foreground">
      <WindowTitleBar />

      <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
        <Sidebar />

        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>

      {import.meta.env.DEV && <PGliteDebugPanel />}
    </div>
  )
}
