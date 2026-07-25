export function createEntryDocument(html: string, dictionaryId: string, customCss = ''): string {
  const baseUrl = `dictol-resource://dictionary/${dictionaryId}/`
  const onlineResourceOrigins = [
    'https://www.ldoceonline.com',
    'https://www.oxfordlearnersdictionaries.com',
    'https://oxford-x-file.oss-cn-hangzhou.aliyuncs.com'
  ].join(' ')
  const contentSecurityPolicy = [
    'upgrade-insecure-requests',
    "default-src 'none'",
    "style-src 'unsafe-inline' dictol-resource:",
    `img-src data: blob: dictol-resource: ${onlineResourceOrigins}`,
    `media-src blob: dictol-resource: http://www.ldoceonline.com ${onlineResourceOrigins}`,
    "script-src 'unsafe-inline' 'unsafe-eval' dictol-entry: dictol-resource:",
    'font-src data: dictol-resource:',
    `connect-src dictol-resource: ${onlineResourceOrigins} wss://speech.platform.bing.com`,
    'base-uri dictol-resource:'
  ].join('; ')
  const rewritten = html
    .replace(/\bhttp:\/\/www\.ldoceonline\.com(?=[/"'\s<>])/gi, 'https://www.ldoceonline.com')
    .replace(
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
  const withCustomStyle = customStyle
    ? withHead.replace(/<\/head>/i, `${customStyle}</head>`)
    : withHead
  const lookupBridge = '<script src="dictol-entry://app/entry-bridge.js"></script>'
  return /<\/body>/i.test(withCustomStyle)
    ? withCustomStyle.replace(/<\/body>/i, `${lookupBridge}</body>`)
    : `${withCustomStyle}${lookupBridge}`
}

function escapeStyleContent(value: string): string {
  return value.replace(/<\/style/gi, '<\\/style')
}
