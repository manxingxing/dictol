import { createDictionaryResourceBaseUrl } from './dictionary-resource-url'
import { ENTRY_BRIDGE_URL, ENTRY_GLOBAL_STYLE_URL } from './entry-assets'

// 如果是完整的html，就注入 css, js
// 如果不是完整的 html(没有 head，body)， 则把内容包裹在 html 之中，再嵌入 css, js
export function createEntryDocument(html: string, dictionaryId: string, customCss = ''): string {
  const baseUrl = createDictionaryResourceBaseUrl(dictionaryId)
  const contentSecurityPolicy = [
    "default-src 'none'",
    "style-src 'unsafe-inline' dictol-entry: dictol-resource: http: https:",
    'img-src data: blob: dictol-resource: http: https:',
    'media-src blob: dictol-resource: http: https:',
    "script-src 'unsafe-inline' 'unsafe-eval' dictol-entry: dictol-resource: http: https:",
    'font-src data: dictol-resource: http: https:',
    'connect-src dictol-resource: http: https: ws: wss:',
    'base-uri dictol-resource:'
  ].join('; ')
  const rewritten = html.replace(
    /\b(?:sound|audio|file):\/\/\/?([^"'\s<>]+)/gi,
    (_, resourcePath: string) => `${baseUrl}${resourcePath.replace(/^\/+/, '')}`
  )
  const appearance = `<meta name="color-scheme" content="light dark">`
  const headContent = `<base href="${baseUrl}">${appearance}<meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy}">`
  const withHead = /<head(?:\s[^>]*)?>/i.test(rewritten)
    ? rewritten.replace(/<head(?:\s[^>]*)?>/i, (head) => `${head}${headContent}`)
    : `<head>${headContent}</head>${rewritten}`
  const customStyle = customCss
    ? `<style id="dictol-custom-style">${escapeStyleContent(customCss)}</style>`
    : ''
  const globalStyle = `<link id="dictol-entry-style" rel="stylesheet" href="${ENTRY_GLOBAL_STYLE_URL}">`
  const withGlobalStyle = withHead.replace(/<\/head>/i, `${globalStyle}</head>`)
  const lookupBridge = `<script src="${ENTRY_BRIDGE_URL}"></script>`
  const bodyTail = `${customStyle}${lookupBridge}`
  return /<\/body>/i.test(withGlobalStyle)
    ? withGlobalStyle.replace(/<\/body>/i, `${bodyTail}</body>`)
    : `${withGlobalStyle}${bodyTail}`
}

function escapeStyleContent(value: string): string {
  return value.replace(/<\/style/gi, '<\\/style')
}
