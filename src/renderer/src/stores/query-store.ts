import { create } from 'zustand'

import type { DictionarySearchResult } from '@/hooks/use-dictionary-entries'

interface QueryStore {
  searchQuery: string
  setSearchQuery: (query: string) => void
  searchCandidate: DictionarySearchResult[]
  setSearchCandidate: (candidates: DictionarySearchResult[]) => void
}

export const useQueryStore = create<QueryStore>()(
  (set) => ({
    searchQuery: '',
    setSearchQuery: (searchQuery) => set({ searchQuery }),
    searchCandidate: [],
    setSearchCandidate: (candidates) => set({ searchCandidate: candidates })
  })
);
