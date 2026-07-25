import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'

export const readyDictionariesQueryKey = ['dictionaries', 'ready'] as const
export const dictionariesQueryKey = ['dictionaries', 'all'] as const

type DictionarySummary = Awaited<ReturnType<Window['dictol']['dictionaries']['list']>>[number]
type ReadyDictionary = Awaited<ReturnType<Window['dictol']['dictionaries']['listReady']>>[number]
type ImportedDictionary = Awaited<ReturnType<Window['dictol']['dictionaries']['import']>>
type ReorderDictionariesContext = { previousDictionaries?: DictionarySummary[] }

export function useDictionaries(): UseQueryResult<DictionarySummary[], Error> {
  return useQuery({
    queryKey: dictionariesQueryKey,
    queryFn: () => window.dictol.dictionaries.list(),
    refetchInterval: 2_000
  })
}

export function useReadyDictionaries(): UseQueryResult<ReadyDictionary[], Error> {
  return useQuery({
    queryKey: readyDictionariesQueryKey,
    queryFn: () => window.dictol.dictionaries.listReady(),
    staleTime: 30_000
  })
}

export function useImportDictionary(): UseMutationResult<ImportedDictionary | null, Error, void> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => window.dictol.dictionaries.import(),
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: dictionariesQueryKey }),
        queryClient.invalidateQueries({ queryKey: readyDictionariesQueryKey })
      ])
    }
  })
}

export function useDeleteDictionary(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (dictionaryId) => window.dictol.dictionaries.delete(dictionaryId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dictionaries'] }),
        queryClient.invalidateQueries({ queryKey: ['dictionary-entries'] })
      ])
    }
  })
}

export function useReorderDictionaries(): UseMutationResult<
  void,
  Error,
  string[],
  ReorderDictionariesContext
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (dictionaryIds) => window.dictol.dictionaries.reorder(dictionaryIds),
    onMutate: async (dictionaryIds) => {
      await queryClient.cancelQueries({ queryKey: dictionariesQueryKey })
      const previousDictionaries =
        queryClient.getQueryData<DictionarySummary[]>(dictionariesQueryKey)
      if (previousDictionaries) {
        const byId = new Map(previousDictionaries.map((dictionary) => [dictionary.id, dictionary]))
        queryClient.setQueryData(
          dictionariesQueryKey,
          dictionaryIds.map((id) => byId.get(id)).filter((item) => item !== undefined)
        )
      }
      return { previousDictionaries }
    },
    onError: (_error, _dictionaryIds, context) => {
      if (context?.previousDictionaries) {
        queryClient.setQueryData(dictionariesQueryKey, context.previousDictionaries)
      }
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dictionaries'] }),
        queryClient.invalidateQueries({ queryKey: ['dictionary-entries'] })
      ])
    }
  })
}

export function useUpdateDictionaryName(): UseMutationResult<
  void,
  Error,
  { dictionaryId: string; name: string }
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ dictionaryId, name }) =>
      window.dictol.dictionaries.updateName(dictionaryId, name),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dictionaries'] }),
        queryClient.invalidateQueries({ queryKey: ['dictionary-entries'] })
      ])
    }
  })
}

export function useUpdateDictionaryCustomCss(): UseMutationResult<
  void,
  Error,
  { dictionaryId: string; customCss: string }
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ dictionaryId, customCss }) =>
      window.dictol.dictionaries.updateCustomCss(dictionaryId, customCss),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: dictionariesQueryKey })
    }
  })
}
