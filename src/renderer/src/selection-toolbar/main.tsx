import '@/assets/main.css'
import './selection-toolbar.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { SelectionToolbarApp } from './SelectionToolbarApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SelectionToolbarApp />
  </StrictMode>
)
