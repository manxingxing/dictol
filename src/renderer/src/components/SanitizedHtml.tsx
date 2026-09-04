import { Fragment, useMemo, type ReactNode } from 'react'
import * as prod from 'react/jsx-runtime'
import rehypeReact from 'rehype-react'
import { unified } from 'unified'

import { cn } from '@/lib/utils'
import { sanitizeHtmlTree } from '@/lib/sanitize-html'

type SanitizedHtmlProps = {
  content: string
  className?: string
}

const production = {
  Fragment,
  jsx: prod.jsx,
  jsxs: prod.jsxs
}

const reactProcessor = unified().use(rehypeReact, production)

export function SanitizedHtml({ content, className }: SanitizedHtmlProps): React.JSX.Element {
  const renderedContent = useMemo<ReactNode>(() => {
    return reactProcessor.stringify(sanitizeHtmlTree(content)) as ReactNode
  }, [content])

  return <div className={cn('min-w-0', className)}>{renderedContent}</div>
}
