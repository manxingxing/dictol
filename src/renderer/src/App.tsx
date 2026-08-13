import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'

import { useQueryHistoryChangeListener } from '@/hooks/use-query-history'
import { router } from '@/routes/router'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { Toaster } from './components/ui/sonner'

const queryClient = new QueryClient()

function AppContent(): React.JSX.Element {
  useQueryHistoryChangeListener()
  return <RouterProvider router={router} />
}

function App(): React.JSX.Element {
  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <Toaster position="top-center" />
        <AppContent />
      </QueryClientProvider>
    </AppErrorBoundary>
  )
}

export default App
