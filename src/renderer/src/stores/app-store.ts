import { create } from 'zustand'

interface AppState {
  sidebarCollapsed: boolean
  debugPanelOpen: boolean
  searchQuery: string
  toggleSidebar: () => void
  toggleDebugPanel: () => void
  setSearchQuery: (query: string) => void
}

export const useAppStore = create<AppState>((set) => ({
  sidebarCollapsed: false,
  debugPanelOpen: false,
  searchQuery: '',
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  toggleDebugPanel: () => set((state) => ({ debugPanelOpen: !state.debugPanelOpen })),
  setSearchQuery: (searchQuery) => set({ searchQuery })
}))
