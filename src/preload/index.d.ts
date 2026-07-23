declare global {
  interface Window {
    dictol: {
      platform: NodeJS.Platform
      dictionaries: {
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
      }
      entries: {
        search: (
          prefix: string,
          limit?: number
        ) => Promise<
          {
            id: string
            dictionaryId: string
            dictionaryName: string
            word: string
          }[]
        >
        get: (entryId: string) => Promise<{
          id: string
          dictionaryId: string
          dictionaryName: string
          word: string
          html: string
        } | null>
      }
      dictionaryView: {
        show: (entryId: string) => Promise<void>
        hide: () => void
        setBounds: (bounds: { x: number; y: number; width: number; height: number }) => void
        onLookupWord: (callback: (word: string) => void) => () => void
      }
      debug: {
        pgliteQuery: (query: string, params?: unknown[]) => Promise<unknown>
        pgliteExec: (query: string, options?: { rowMode?: 'array' | 'object' }) => Promise<unknown>
      }
    }
  }
}

export {}
