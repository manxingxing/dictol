import { createHashRouter } from 'react-router-dom'

import { AppLayout } from '@/layouts/AppLayout'
import { DictionariesPage } from '@/pages/DictionariesPage'
import { HistoryPage } from '@/pages/HistoryPage'
import { SearchPage } from '@/pages/SearchPage'
import { SettingsPage } from '@/pages/SettingsPage'

export const router = createHashRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <SearchPage /> },
      { path: 'search', element: <SearchPage /> },
      { path: 'dictionaries', element: <DictionariesPage /> },
      { path: 'history', element: <HistoryPage /> },
      { path: 'settings', element: <SettingsPage /> }
    ]
  }
])
