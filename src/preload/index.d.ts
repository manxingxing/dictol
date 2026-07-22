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
      debug: {
        pgliteQuery: (query: string, params?: unknown[]) => Promise<unknown>
        pgliteExec: (query: string, options?: { rowMode?: 'array' | 'object' }) => Promise<unknown>
      }
    }
  }
}

export {}
