import '@/assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { SelectionExplanationApp } from './SelectionExplanationApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SelectionExplanationApp />
  </StrictMode>
)
