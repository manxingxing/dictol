declare global {
  interface Window {
    dictol: {
      platform: NodeJS.Platform
      dictionaries: {
        list: () => Promise<
          {
            id: string
            name: string
            description: string | null
            customCss: string
            recordCount: string | null
            status: 'pending' | 'importing' | 'ready' | 'error'
            createdAt: string
            updatedAt: string
          }[]
        >
        listReady: () => Promise<
          {
            id: string
            name: string
            description: string | null
            recordCount: string | null
            status: 'ready'
            createdAt: string
            updatedAt: string
          }[]
        >
        import: () => Promise<{
          id: string
          name: string
          status: 'ready'
          directory: string
          files: {
            id: string
            name: string
            type: 'mdx' | 'mdd'
          }[]
        } | null>
        delete: (dictionaryId: string) => Promise<void>
        reorder: (dictionaryIds: string[]) => Promise<void>
        updateName: (dictionaryId: string, name: string) => Promise<void>
        updateCustomCss: (dictionaryId: string, customCss: string) => Promise<void>
      }
      entries: {
        search: (
          prefix: string,
          limit?: number
        ) => Promise<
          {
            word: string
            normalizedWord: string
            dictionaryCount: number
          }[]
        >
        lookup: (term: string) => Promise<{
          word: string
          normalizedWord: string
          dictionaries: {
            entryId: string
            dictionaryId: string
            dictionaryName: string
          }[]
        } | null>
        get: (entryId: string) => Promise<{
          id: string
          dictionaryId: string
          dictionaryName: string
          word: string
          html: string
          customCss: string
        } | null>
      }
      history: {
        list: () => Promise<
          {
            id: string
            term: string
            queryCount: number
            lastQueriedAt: string
          }[]
        >
        record: (term: string) => Promise<void>
        clear: () => Promise<void>
        onChanged: (callback: () => void) => () => void
      }
      app: {
        onFocusSearch: (callback: () => void) => () => void
      }
      searchPopover: {
        show: () => void
        hide: () => void
        setBounds: (bounds: { x: number; y: number; width: number; height: number }) => void
        update: (
          query: string,
          items: { word: string; description: string; recent: boolean }[],
          selectedIndex: number,
          status?: 'loading' | 'empty'
        ) => void
        onSelect: (callback: (word: string) => void) => () => void
        onQueryChange: (callback: (query: string) => void) => () => void
        onSubmit: (callback: (query: string) => void) => () => void
        onDismiss: (callback: () => void) => () => void
        onShown: (callback: () => void) => () => void
        onHidden: (callback: () => void) => () => void
      }
      wordCapture: {
        getStatus: () => Promise<{
          supported: boolean
          limitation: string | null
          trusted: boolean
          registered: boolean
          shortcut: string
          lookupWordOnSelection: boolean
          excludedPrograms: string[]
        } | null>
        requestAccess: () => Promise<{
          supported: boolean
          limitation: string | null
          trusted: boolean
          registered: boolean
          shortcut: string
          lookupWordOnSelection: boolean
          excludedPrograms: string[]
        } | null>
        setShortcut: (shortcut: string) => Promise<{
          ok: boolean
          status: {
            supported: boolean
            limitation: string | null
            trusted: boolean
            registered: boolean
            shortcut: string
            lookupWordOnSelection: boolean
            excludedPrograms: string[]
          }
          error?: string
        } | null>
        setSelectionEnabled: (enabled: boolean) => Promise<{
          ok: boolean
          status: {
            supported: boolean
            limitation: string | null
            trusted: boolean
            registered: boolean
            shortcut: string
            lookupWordOnSelection: boolean
            excludedPrograms: string[]
          }
          error?: string
        } | null>
        removeExcludedProgram: (programName: string) => Promise<{
          ok: boolean
          status: {
            supported: boolean
            limitation: string | null
            trusted: boolean
            registered: boolean
            shortcut: string
            lookupWordOnSelection: boolean
            excludedPrograms: string[]
          }
          error?: string
        } | null>
        onEvent: (
          callback: (
            event:
              | { type: 'lookup'; text: string }
              | { type: 'permission-required' }
              | { type: 'empty' }
              | { type: 'error'; message: string }
          ) => void
        ) => () => void
      }
      dictionaryView: {
        show: (entryId: string) => Promise<void>
        hide: () => void
        setBounds: (bounds: { x: number; y: number; width: number; height: number }) => void
        onLookupWord: (callback: (word: string) => void) => () => void
      }
    }
  }
}

export {}
