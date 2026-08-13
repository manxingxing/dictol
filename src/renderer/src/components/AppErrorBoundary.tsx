import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RotateCcw } from 'lucide-react'

import { Button } from '@/components/ui/button'

interface AppErrorBoundaryProps {
  children: ReactNode
}

interface AppErrorBoundaryState {
  hasError: boolean
}

export function AppErrorFallback(): React.JSX.Element {
  return (
    <main className="flex h-screen items-center justify-center bg-background p-6 text-foreground">
      <section className="flex max-w-sm flex-col items-center text-center">
        <h1 className="text-lg font-semibold">应用遇到了问题</h1>
        <p className="mt-2 text-sm text-muted-foreground">请重新加载应用后再试。</p>
        <Button className="mt-5" onClick={() => window.location.reload()} type="button">
          <RotateCcw />
          重新加载
        </Button>
      </section>
    </main>
  )
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Renderer application error', error, errorInfo)
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return <AppErrorFallback />
    }

    return this.props.children
  }
}
