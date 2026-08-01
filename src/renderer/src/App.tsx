import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'

import { useQueryHistoryChangeListener } from '@/hooks/use-query-history'
import { router } from '@/routes/router'

const queryClient = new QueryClient()

function AppContent(): React.JSX.Element {
  useQueryHistoryChangeListener()
  return <RouterProvider router={router} />
}

function App(): React.JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  )
}

export default App
