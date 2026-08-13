import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'

export const onlineDictionariesQueryKey = ['online-dictionaries'] as const

type OnlineDictionary = Awaited<ReturnType<Window['dictol']['onlineDictionaries']['list']>>[number]
type OnlineDictionaryInput = Parameters<Window['dictol']['onlineDictionaries']['add']>[0]
type ReorderContext = { previous?: OnlineDictionary[] }

export function useOnlineDictionaries(): UseQueryResult<OnlineDictionary[], Error> {
  return useQuery({
    queryKey: onlineDictionariesQueryKey,
    queryFn: () => window.dictol.onlineDictionaries.list(),
    staleTime: 30_000
  })
}

export function useAddOnlineDictionary(): UseMutationResult<
  OnlineDictionary,
  Error,
  OnlineDictionaryInput
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input) => window.dictol.onlineDictionaries.add(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: onlineDictionariesQueryKey })
    }
  })
}

export function useRemoveOnlineDictionary(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id) => window.dictol.onlineDictionaries.remove(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: onlineDictionariesQueryKey })
    }
  })
}

export function useReorderOnlineDictionaries(): UseMutationResult<
  void,
  Error,
  string[],
  ReorderContext
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (ids) => window.dictol.onlineDictionaries.reorder(ids),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: onlineDictionariesQueryKey })
      const previous = queryClient.getQueryData<OnlineDictionary[]>(onlineDictionariesQueryKey)
      if (previous) {
        const byId = new Map(previous.map((dictionary) => [dictionary.id, dictionary]))
        queryClient.setQueryData(
          onlineDictionariesQueryKey,
          ids
            .map((id) => byId.get(id))
            .filter((item): item is OnlineDictionary => item !== undefined)
        )
      }
      return { previous }
    },
    onError: (_error, _ids, context) => {
      if (context?.previous) {
        queryClient.setQueryData(onlineDictionariesQueryKey, context.previous)
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: onlineDictionariesQueryKey })
    }
  })
}
