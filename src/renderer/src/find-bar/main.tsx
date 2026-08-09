import '@/assets/main.css'
import './find-bar.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { FindBarApp } from './FindBarApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FindBarApp />
  </StrictMode>
)
