export function createEntryDocument(html: string, dictionaryId: string): string {
  const baseUrl = `dictol-resource://dictionary/${dictionaryId}/`
  const oxfordOrigins = [
    'https://www.oxfordlearnersdictionaries.com',
    'https://oxford-x-file.oss-cn-hangzhou.aliyuncs.com'
  ].join(' ')
  const contentSecurityPolicy = [
    "default-src 'none'",
    "style-src 'unsafe-inline' dictol-resource:",
    `img-src data: blob: dictol-resource: ${oxfordOrigins}`,
    `media-src blob: dictol-resource: ${oxfordOrigins}`,
    "script-src 'unsafe-inline' 'unsafe-eval' dictol-resource:",
    'font-src data: dictol-resource:',
    `connect-src dictol-resource: ${oxfordOrigins} wss://speech.platform.bing.com`,
    'base-uri dictol-resource:'
  ].join('; ')
  const rewritten = html.replace(
    /\b(?:sound|audio|file):\/\/\/?([^"'\s<>]+)/gi,
    (_, resourcePath: string) => `${baseUrl}${resourcePath.replace(/^\/+/, '')}`
  )
  const headContent = `<base href="${baseUrl}"><meta name="color-scheme" content="light"><meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy}">`
  const withHead = /<head(?:\s[^>]*)?>/i.test(rewritten)
    ? rewritten.replace(/<head(?:\s[^>]*)?>/i, (head) => `${head}${headContent}`)
    : `<head>${headContent}</head>${rewritten}`
  const lookupBridge = `<script>(()=>{
    const lookup=(word)=>{const value=word?.trim();if(value&&value.length<=200){window.dictolEntry?.lookupWord(value)}};
    const localAudio=new Audio();
    document.addEventListener('dblclick',()=>{setTimeout(()=>lookup(window.getSelection()?.toString()),0)},true);
    document.addEventListener('click',(event)=>{
      const anchor=event.target instanceof Element?event.target.closest('a[href]'):null;
      const href=anchor?.getAttribute('href')?.trim();
      if(!href||!/^entry:\\/\\//i.test(href))return;
      event.preventDefault();
      event.stopPropagation();
      const target=href.replace(/^entry:\\/\\/\\/?/i,'').split('#',1)[0];
      try{lookup(decodeURIComponent(target))}catch{lookup(target)}
    },true);
    document.addEventListener('click',(event)=>{
      if(event.defaultPrevented)return;
      const anchor=event.target instanceof Element?event.target.closest('a[href]'):null;
      const href=anchor?.href;
      if(!href||!/^dictol-resource:\\/\\//i.test(href)||!/[.](?:mp3|wav|ogg|oga|spx|m4a)(?:[?#]|$)/i.test(href))return;
      event.preventDefault();
      localAudio.pause();
      localAudio.src=href;
      localAudio.play().catch((error)=>console.error('Failed to play dictionary audio',error));
    });
  })()</script>`
  return /<\/body>/i.test(withHead)
    ? withHead.replace(/<\/body>/i, `${lookupBridge}</body>`)
    : `${withHead}${lookupBridge}`
}
