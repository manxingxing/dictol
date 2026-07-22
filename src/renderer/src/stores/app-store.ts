import { create } from 'zustand'

interface AppState {
  sidebarCollapsed: boolean
  debugPanelOpen: boolean
  toggleSidebar: () => void
  toggleDebugPanel: () => void
}

export const useAppStore = create<AppState>((set) => ({
  sidebarCollapsed: false,
  debugPanelOpen: false,
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  toggleDebugPanel: () => set((state) => ({ debugPanelOpen: !state.debugPanelOpen }))
}))
