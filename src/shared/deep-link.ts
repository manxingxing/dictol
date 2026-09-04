export const DEEP_LINK_SCHEME = 'dictol'
export const DEEP_LINK_PROTOCOL = `${DEEP_LINK_SCHEME}:`
export const DEEP_LINK_HOST = 'search'

export type DeepLinkIntent = {
  type: 'search'
  term: string
}

export function parseDeepLink(value: unknown): DeepLinkIntent | null {
  if (typeof value !== 'string') return null

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }

  if (
    url.protocol !== DEEP_LINK_PROTOCOL ||
    url.hostname !== DEEP_LINK_HOST ||
    (url.pathname !== '' && url.pathname !== '/') ||
    url.username ||
    url.password ||
    url.port
  ) {
    return null
  }

  const terms = url.searchParams.getAll('term')
  const term = terms[0]?.trim()
  if (terms.length !== 1 || !term) return null

  return { type: 'search', term }
}

export function findDeepLink(values: readonly unknown[]): DeepLinkIntent | null {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const deepLink = parseDeepLink(values[index])
    if (deepLink) return deepLink
  }
  return null
}
