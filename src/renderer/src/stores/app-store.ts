import { create } from 'zustand'

interface AppState {
  sidebarCollapsed: boolean
  searchQuery: string
  searchFocusRequest: number
  requestSearchFocus: () => void
  toggleSidebar: () => void
  setSearchQuery: (query: string) => void
}

export const useAppStore = create<AppState>((set) => ({
  sidebarCollapsed: false,
  searchQuery: '',
  searchFocusRequest: 0,
  requestSearchFocus: () => set((state) => ({ searchFocusRequest: state.searchFocusRequest + 1 })),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setSearchQuery: (searchQuery) => set({ searchQuery })
}))
