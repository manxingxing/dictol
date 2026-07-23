import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query'

type DictionarySearchResult = Awaited<ReturnType<Window['dictol']['entries']['search']>>[number]
type DictionaryEntryContent = Awaited<ReturnType<Window['dictol']['entries']['get']>>

export function useDictionarySearch(
  prefix: string,
  limit = 50
): UseQueryResult<DictionarySearchResult[], Error> {
  const normalizedPrefix = prefix.trim()
  return useQuery({
    queryKey: ['dictionary-entries', 'prefix', normalizedPrefix.toLowerCase(), limit],
    queryFn: () => window.dictol.entries.search(normalizedPrefix, limit),
    enabled: normalizedPrefix.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 30_000
  })
}

export function useDictionaryEntry(
  entryId: string | undefined
): UseQueryResult<DictionaryEntryContent, Error> {
  return useQuery({
    queryKey: ['dictionary-entries', 'entry', entryId],
    queryFn: () => window.dictol.entries.get(entryId!),
    enabled: Boolean(entryId),
    staleTime: 5 * 60_000
  })
}
