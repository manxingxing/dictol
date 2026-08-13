import type { Components } from 'react-markdown'
import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'

import 'katex/dist/katex.min.css'

import { cn } from '@/lib/utils'

type AiRichTextProps = {
  content: string
  className?: string
}

const components: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  h1: ({ children }) => <h1 className="mb-2 text-base font-semibold">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-2 text-sm font-semibold">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-1.5 text-sm font-semibold">{children}</h3>,
  ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-left text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="border-b border-border">{children}</thead>,
  tr: ({ children }) => <tr className="border-b border-border last:border-b-0">{children}</tr>,
  th: ({ children }) => <th className="px-2 py-1.5 font-semibold">{children}</th>,
  td: ({ children }) => <td className="px-2 py-1.5 align-top">{children}</td>,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-border pl-3 text-muted-foreground">
      {children}
    </blockquote>
  ),
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-lg bg-muted/70 p-3 text-xs leading-5">
      {children}
    </pre>
  ),
  code: ({ children, className }) => (
    <code className={className ?? 'rounded bg-muted px-1 py-0.5 text-[0.9em]'}>{children}</code>
  ),
  a: ({ children, href }) => {
    const safeHref = typeof href === 'string' && /^https?:\/\//i.test(href) ? href : undefined
    return safeHref ? (
      <a
        className="text-primary underline underline-offset-2"
        href={safeHref}
        rel="noreferrer"
        target="_blank"
      >
        {children}
      </a>
    ) : (
      <span>{children}</span>
    )
  },
  hr: () => <hr className="my-3 border-border" />
}

function normalizeLatexMathDelimiters(content: string): string {
  return content
    .replace(/\\\[([\s\S]*?)\\\]/g, (_match, expression: string) => {
      return `\n\n$$\n${expression.trim()}\n$$\n\n`
    })
    .replace(/\\\(([\s\S]*?)\\\)/g, (_match, expression: string) => {
      return `$${expression.trim()}$`
    })
}

export function AiRichText({ content, className }: AiRichTextProps): React.JSX.Element {
  const normalizedContent = normalizeLatexMathDelimiters(content)

  return (
    <div
      className={cn(
        'min-w-0 [&_.katex-display]:my-3 [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden',
        className
      )}
    >
      <ReactMarkdown
        components={components}
        rehypePlugins={[rehypeRaw, rehypeSanitize, rehypeKatex]}
        remarkPlugins={[remarkGfm, remarkMath]}
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  )
}
