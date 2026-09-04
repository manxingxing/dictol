import rehypeParse from 'rehype-parse'
import rehypeSanitize, { type Options as RehypeSanitizeOptions } from 'rehype-sanitize'
import parseStyle from 'style-to-object'
import { unified } from 'unified'
import type { Element, Root } from 'hast'

const allowedStyleProperties = new Set([
  'font-size',
  'font-weight',
  'text-align',
  'text-indent',
  'margin',
  'padding',
  'font-family'
])

const unsafeStyleValuePattern =
  /(?:url|expression|javascript|vbscript|behavior|-moz-binding)\s*\(|@import|!important|[<>]/i

const dictionaryInfoHtmlSchema: RehypeSanitizeOptions = {
  // Dictionary metadata is text content.  It does not need the resource-bearing
  // elements that are valid in a dictionary entry document.
  tagNames: [
    'a',
    'b',
    'blockquote',
    'br',
    'code',
    'dd',
    'del',
    'div',
    'dl',
    'dt',
    'em',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'hr',
    'i',
    'ins',
    'kbd',
    'li',
    'ol',
    'p',
    'pre',
    'q',
    's',
    'samp',
    'small',
    'span',
    'strike',
    'strong',
    'sub',
    'sup',
    'table',
    'tbody',
    'td',
    'tfoot',
    'th',
    'thead',
    'tr',
    'tt',
    'ul',
    'var'
  ],
  attributes: {
    '*': ['style'],
    a: ['href']
  },
  protocols: {
    href: ['http', 'https']
  },
  strip: [
    'audio',
    'base',
    'button',
    'canvas',
    'embed',
    'form',
    'head',
    'iframe',
    'img',
    'input',
    'link',
    'math',
    'meta',
    'noscript',
    'object',
    'option',
    'picture',
    'script',
    'select',
    'source',
    'style',
    'svg',
    'template',
    'textarea',
    'title',
    'track',
    'video'
  ]
}

function sanitizeStyleAttribute(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined

  const declarations: string[] = []
  parseStyle(value, (property, declarationValue) => {
    const normalizedProperty = property.trim().toLowerCase()
    const normalizedValue = declarationValue.trim()

    if (
      !allowedStyleProperties.has(normalizedProperty) ||
      !normalizedValue ||
      unsafeStyleValuePattern.test(normalizedValue)
    ) {
      return
    }

    declarations.push(`${normalizedProperty}: ${normalizedValue}`)
  })

  return declarations.length > 0 ? declarations.join('; ') : undefined
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false

  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function normalizeExternalLinks(node: Root | Element): void {
  if (node.type === 'element' && node.properties.style !== undefined) {
    const sanitizedStyle = sanitizeStyleAttribute(node.properties.style)
    if (sanitizedStyle) node.properties.style = sanitizedStyle
    else delete node.properties.style
  }

  if (node.type === 'element' && node.tagName === 'a') {
    const href = node.properties.href

    if (isHttpUrl(href)) {
      node.properties.target = '_blank'
      node.properties.rel = ['noreferrer']
    } else {
      delete node.properties.href
    }
  }

  node.children?.forEach((child) => {
    if (child.type === 'element') normalizeExternalLinks(child)
  })
}

const sanitizedHtmlProcessor = unified()
  .use(rehypeParse, { fragment: true })
  .use(rehypeSanitize, dictionaryInfoHtmlSchema)

export function sanitizeHtmlTree(content: string): Root {
  const tree = sanitizedHtmlProcessor.parse(content)
  const sanitizedTree = sanitizedHtmlProcessor.runSync(tree) as Root
  normalizeExternalLinks(sanitizedTree)
  return sanitizedTree
}
