import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import { useEffect } from 'react'

export const wordbooksQueryKey = ['wordbooks'] as const
export const wordbookWordsQueryKey = (wordbookId?: string, page = 1, pageSize = 25) =>
  ['wordbooks', 'words', wordbookId ?? 'all', { page, pageSize }] as const
export const wordbookFilterQueryKey = (
  keyword: string,
  wordbookId?: string,
  page = 1,
  pageSize = 25
) => ['wordbooks', 'filter', wordbookId ?? 'all', keyword, page, pageSize] as const
export const wordbookExportStatusQueryKey = ['wordbooks', 'export-status'] as const
export const wordbookStarredQueryKey = (word: string) => ['wordbooks', 'starred', word] as const

export type WordbookSummary = Awaited<ReturnType<Window['dictol']['wordbooks']['list']>>[number]
export type WordbookWordItem = Awaited<
  ReturnType<Window['dictol']['wordbooks']['listWords']>
>['items'][number]
export type WordbookWordsPaginated = Awaited<ReturnType<Window['dictol']['wordbooks']['listWords']>>
export type WordbookExportRequest = Parameters<Window['dictol']['wordbooks']['export']>[0]
export type WordbookExportStatus = Awaited<
  ReturnType<Window['dictol']['wordbooks']['getExportStatus']>
>
export type WordbookImportResult = Awaited<ReturnType<Window['dictol']['wordbooks']['importWords']>>

type StarUpdateContext = {
  snapshots: Array<[QueryKey, WordbookWordsPaginated | undefined]>
}

export function useWordbooks(): UseQueryResult<WordbookSummary[], Error> {
  return useQuery({
    queryKey: wordbooksQueryKey,
    queryFn: () => window.dictol.wordbooks.list()
  })
}

export function useWordbookWords(
  wordbookId?: string,
  page = 1,
  pageSize = 25,
  enabled = true
): UseQueryResult<WordbookWordsPaginated, Error> {
  return useQuery({
    queryKey: wordbookWordsQueryKey(wordbookId, page, pageSize),
    queryFn: () => window.dictol.wordbooks.listWords(wordbookId, page, pageSize),
    placeholderData: keepPreviousData,
    enabled
  })
}

export function useFilterWords(
  keyword: string,
  wordbookId?: string,
  page = 1,
  pageSize = 25
): UseQueryResult<WordbookWordsPaginated, Error> {
  return useQuery({
    queryKey: wordbookFilterQueryKey(keyword, wordbookId, page, pageSize),
    queryFn: () => window.dictol.wordbooks.filterWords(keyword, wordbookId, page, pageSize),
    placeholderData: keepPreviousData,
    enabled: keyword.trim().length > 0
  })
}

export function useCreateWordbook(): UseMutationResult<WordbookSummary, Error, string> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name) => window.dictol.wordbooks.create(name),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: wordbooksQueryKey })
    }
  })
}

export function useAddWordToDefaultWordbook(): UseMutationResult<
  WordbookWordItem,
  Error,
  { word: string; star?: number }
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ word, star }) => window.dictol.wordbooks.addWord(word, star),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: wordbooksQueryKey }),
        queryClient.invalidateQueries({ queryKey: ['wordbooks', 'words'] })
      ])
    }
  })
}

export function useImportWordbookWords(): UseMutationResult<
  WordbookImportResult,
  Error,
  { text: string; wordbookId?: string }
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ text, wordbookId }) => window.dictol.wordbooks.importWords(text, wordbookId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: wordbooksQueryKey }),
        queryClient.invalidateQueries({ queryKey: ['wordbooks', 'words'] })
      ])
    }
  })
}

export function useMoveWordbookWords(): UseMutationResult<
  void,
  Error,
  { wordIds: string[]; destinationWordbookId: string }
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ wordIds, destinationWordbookId }) =>
      window.dictol.wordbooks.moveWords(wordIds, destinationWordbookId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: wordbooksQueryKey }),
        queryClient.invalidateQueries({ queryKey: ['wordbooks', 'words'] })
      ])
    }
  })
}

export function useWordbookExportStatus(): UseQueryResult<WordbookExportStatus, Error> {
  const queryClient = useQueryClient()

  useEffect(() => {
    return window.dictol.wordbooks.onExportStatus((status) => {
      queryClient.setQueryData(wordbookExportStatusQueryKey, status)
    })
  }, [queryClient])

  return useQuery({
    queryKey: wordbookExportStatusQueryKey,
    queryFn: () => window.dictol.wordbooks.getExportStatus()
  })
}

export function useExportWordbooks(): UseMutationResult<
  { started: boolean },
  Error,
  { request: WordbookExportRequest; directoryPath: string }
> {
  return useMutation({
    mutationFn: ({ request, directoryPath }) =>
      window.dictol.wordbooks.export(request, directoryPath)
  })
}

export function useToggleStar(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (word) => window.dictol.wordbooks.toggleStar(word),
    onSuccess: async (_data, word) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: wordbooksQueryKey }),
        queryClient.invalidateQueries({ queryKey: ['wordbooks', 'words'] }),
        queryClient.invalidateQueries({ queryKey: wordbookStarredQueryKey(word) })
      ])
    }
  })
}

export function useUnStarWord(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (word) => window.dictol.wordbooks.unStarWord(word),
    onSuccess: async (_data, word) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: wordbooksQueryKey }),
        queryClient.invalidateQueries({ queryKey: ['wordbooks', 'words'] }),
        queryClient.invalidateQueries({ queryKey: wordbookStarredQueryKey(word) })
      ])
    }
  })
}

export function useIsStarred(word: string | undefined): UseQueryResult<boolean, Error> {
  return useQuery({
    queryKey: wordbookStarredQueryKey(word ?? ''),
    queryFn: () => window.dictol.wordbooks.isStarred(word!),
    enabled: !!word
  })
}

export function useUpdateStar(): UseMutationResult<void, Error, { word: string; star: number }> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ word, star }) => window.dictol.wordbooks.updateStar(word, star),
    onMutate: async ({ word, star }): Promise<StarUpdateContext> => {
      const queryKeys = [['wordbooks', 'words'] as const, ['wordbooks', 'filter'] as const]
      await Promise.all(queryKeys.map((queryKey) => queryClient.cancelQueries({ queryKey })))

      const snapshots = queryKeys.flatMap((queryKey) =>
        queryClient.getQueriesData<WordbookWordsPaginated>({ queryKey })
      )
      for (const queryKey of queryKeys) {
        queryClient.setQueriesData<WordbookWordsPaginated>({ queryKey }, (current) =>
          current
            ? {
                ...current,
                items: current.items.map((item) => (item.word === word ? { ...item, star } : item))
              }
            : current
        )
      }
      return { snapshots }
    },
    onError: (_error, _variables, context) => {
      for (const [queryKey, data] of context?.snapshots ?? []) {
        queryClient.setQueryData(queryKey, data)
      }
    }
  })
}

export function useDeleteWordbook(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (wordbookId) => window.dictol.wordbooks.deleteWordbook(wordbookId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: wordbooksQueryKey }),
        queryClient.invalidateQueries({ queryKey: ['wordbooks', 'words'] })
      ])
    }
  })
}

export function useRenameWordbook(): UseMutationResult<
  void,
  Error,
  { wordbookId: string; name: string }
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ wordbookId, name }) => window.dictol.wordbooks.renameWordbook(wordbookId, name),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: wordbooksQueryKey })
    }
  })
}

export function useDeleteWords(): UseMutationResult<void, Error, string[]> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (words: string[]) =>
      Promise.all(words.map((word) => window.dictol.wordbooks.unStarWord(word))).then(
        () => undefined
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: wordbooksQueryKey }),
        queryClient.invalidateQueries({ queryKey: ['wordbooks', 'words'] })
      ])
    }
  })
}
