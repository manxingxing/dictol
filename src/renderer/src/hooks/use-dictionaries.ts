import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'

export const readyDictionariesQueryKey = ['dictionaries', 'ready'] as const

type ReadyDictionary = Awaited<ReturnType<Window['dictol']['dictionaries']['listReady']>>[number]
type ImportedDictionary = Awaited<ReturnType<Window['dictol']['dictionaries']['import']>>

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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: readyDictionariesQueryKey })
  })
}
