import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const COMPACT_MODE_WIDTH_THRESHOLD = 760
const appPreferencesStorageKey = 'dictol:app-preferences'

interface AppState {
  compactModeEnabled: boolean
  toggleCompactMode: () => void
  setCompactMode: (compactMode: boolean) => void
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  windowBelowCompactThreshold: boolean
  setWindowBelowCompactThreshold: (belowThreshold: boolean) => void
}

export const selectCompactMode = (state: AppState): boolean =>
  state.compactModeEnabled || state.windowBelowCompactThreshold

export const selectSidebarCollapsed = (state: AppState): boolean =>
  state.sidebarCollapsed || selectCompactMode(state)

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      compactModeEnabled: false,
      toggleCompactMode: () => set((state) => ({ compactModeEnabled: !state.compactModeEnabled })),
      setCompactMode: (compactModeEnabled) => set({ compactModeEnabled }),
      sidebarCollapsed: false,
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      windowBelowCompactThreshold:
        typeof window !== 'undefined' && window.innerWidth < COMPACT_MODE_WIDTH_THRESHOLD,
      setWindowBelowCompactThreshold: (windowBelowCompactThreshold) =>
        set({ windowBelowCompactThreshold })
    }),
    {
      name: appPreferencesStorageKey,
      partialize: (state) => ({
        compactModeEnabled: state.compactModeEnabled,
        sidebarCollapsed: state.sidebarCollapsed
      })
    }
  )
)
