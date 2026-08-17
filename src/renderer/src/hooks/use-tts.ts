import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'

type TtsConfig = Awaited<ReturnType<typeof window.dictol.tts.getConfig>>
type TtsSaveConfigRequest = Parameters<typeof window.dictol.tts.saveConfig>[0]

export const ttsConfigQueryKey = ['tts', 'config'] as const

export function useTtsConfig(): UseQueryResult<TtsConfig> {
  return useQuery({
    queryKey: ttsConfigQueryKey,
    queryFn: () => window.dictol.tts.getConfig()
  })
}

export function useSaveTtsConfig(): UseMutationResult<TtsConfig, Error, TtsSaveConfigRequest> {
  const queryClient = useQueryClient()
  return useMutation<TtsConfig, Error, TtsSaveConfigRequest>({
    mutationFn: (request) => window.dictol.tts.saveConfig(request),
    onSuccess: (config) => {
      if (config) queryClient.setQueryData(ttsConfigQueryKey, config)
    }
  })
}
