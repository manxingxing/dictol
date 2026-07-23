import { createHashRouter, Navigate } from 'react-router-dom'

import { AppLayout } from '@/layouts/AppLayout'
import { DictionariesPage } from '@/pages/DictionariesPage'
import { HistoryPage } from '@/pages/HistoryPage'
import { SearchPage } from '@/pages/SearchPage'
import { SearchResultPage } from '@/pages/SearchResultPage'
import { SettingsPage } from '@/pages/SettingsPage'

export const router = createHashRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/search" replace /> },
      {
        path: 'search',
        element: <SearchPage />,
        children: [
          { index: true, element: <SearchResultPage /> },
          { path: ':entryId', element: <SearchResultPage /> }
        ]
      },
      { path: 'dictionaries', element: <DictionariesPage /> },
      { path: 'history', element: <HistoryPage /> },
      { path: 'settings', element: <SettingsPage /> }
    ]
  }
])
