export const DICTIONARY_RESOURCE_SCHEME = 'dictol-resource'

export type DictionaryResourceLocation = {
  dictionaryId: number
  resourcePath: string
}

export function createDictionaryResourceBaseUrl(dictionaryId: string | number): string {
  return `${DICTIONARY_RESOURCE_SCHEME}://dictionary-${dictionaryId}/`
}

export function parseDictionaryResourceUrl(value: string): DictionaryResourceLocation | null {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }

  const dictionaryIdMatch = /^dictionary-(\d+)$/.exec(url.hostname)
  if (url.protocol !== `${DICTIONARY_RESOURCE_SCHEME}:` || !dictionaryIdMatch) return null

  let pathname: string
  try {
    pathname = decodeURIComponent(url.pathname)
  } catch {
    return null
  }

  const dictionaryId = Number(dictionaryIdMatch[1])
  const resourcePath = pathname.split('/').filter(Boolean).join('/')
  if (!Number.isSafeInteger(dictionaryId) || dictionaryId <= 0 || !resourcePath) return null
  return { dictionaryId, resourcePath }
}
