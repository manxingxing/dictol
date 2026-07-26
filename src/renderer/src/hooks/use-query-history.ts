import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'

export const queryHistoryQueryKey = ['query-history'] as const

export type QueryHistoryItem = Awaited<ReturnType<Window['dictol']['history']['list']>>[number]

export function useQueryHistory(): UseQueryResult<QueryHistoryItem[], Error> {
  return useQuery({
    queryKey: queryHistoryQueryKey,
    queryFn: () => window.dictol.history.list()
  })
}

export function useRecordQueryHistory(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (term) => window.dictol.history.record(term),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryHistoryQueryKey })
    }
  })
}

export function useClearQueryHistory(): UseMutationResult<void, Error, void> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => window.dictol.history.clear(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryHistoryQueryKey })
    }
  })
}
