import '@/assets/main.css'
import './search-popover.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { SearchPopoverApp } from './SearchPopoverApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SearchPopoverApp />
  </StrictMode>
)
