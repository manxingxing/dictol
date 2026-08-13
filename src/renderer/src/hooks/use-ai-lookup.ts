import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'

type AiLookupConfig = Awaited<ReturnType<typeof window.dictol.aiLookup.getConfig>>
type AiSaveConfigRequest = Parameters<typeof window.dictol.aiLookup.saveConfig>[0]

export const aiLookupConfigQueryKey = ['ai-lookup', 'config'] as const

export function useAiLookupConfig(): UseQueryResult<AiLookupConfig> {
  return useQuery({
    queryKey: aiLookupConfigQueryKey,
    queryFn: () => window.dictol.aiLookup.getConfig()
  })
}

export function useSaveAiLookupConfig(): UseMutationResult<
  AiLookupConfig,
  Error,
  AiSaveConfigRequest
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (request: AiSaveConfigRequest) => window.dictol.aiLookup.saveConfig(request),
    onSuccess: (config) => {
      if (config) queryClient.setQueryData(aiLookupConfigQueryKey, config)
    }
  })
}
