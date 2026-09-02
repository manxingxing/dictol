import { ENTRY_BRIDGE_URL, ENTRY_GLOBAL_STYLE_URL } from './entry-assets'

// 如果是完整的html，就注入 css, js
// 如果不是完整的 html(没有 head，body)， 则把内容包裹在 html 之中，再嵌入 css, js
export function createEntryDocument(html: string, _dictionaryId: string, customCss = ''): string {
  const contentSecurityPolicy = [
    "default-src 'none'",
    "style-src 'unsafe-inline' data: blob: dictol-entry: file: http: https:",
    'img-src data: blob: dictol-entry: file: http: https:',
    'media-src data: blob: dictol-entry: sound: audio: file: http: https:',
    "script-src 'unsafe-inline' 'unsafe-eval' data: blob: dictol-entry: file: http: https:",
    'font-src data: blob: dictol-entry: file: http: https:',
    'connect-src blob: dictol-entry: sound: audio: file: http: https: ws: wss:',
    "base-uri 'none'",
    "object-src 'none'"
  ].join('; ')
  const appearance = `<meta name="color-scheme" content="light dark">`
  const headContent = `${appearance}<meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy}">`
  const withHead = /<head(?:\s[^>]*)?>/i.test(html)
    ? html.replace(/<head(?:\s[^>]*)?>/i, (head) => `${head}${headContent}`)
    : `<head>${headContent}</head>${html}`
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
