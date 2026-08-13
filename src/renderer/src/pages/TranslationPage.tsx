import { useEffect, useRef, useState } from 'react'
import { ArrowLeftRight, Info, Languages, LoaderCircle } from 'lucide-react'

import { AiRichText } from '@/components/AiRichText'
import { Button } from '@/components/ui/button'
import { useAiLookupConfig } from '@/hooks/use-ai-lookup'
import { cn } from '@/lib/utils'
import { AI_TRANSLATION_LANGUAGES, type AiTranslationLanguage } from '../../../shared/ai-ipc'

type TranslationStatus = 'idle' | 'running' | 'ready' | 'error'
type AiLookupEvent = Parameters<Parameters<typeof window.dictol.aiLookup.onEvent>[0]>[0]

const INITIAL_SOURCE_LANGUAGE: AiTranslationLanguage = '中文'
const INITIAL_TARGET_LANGUAGE: AiTranslationLanguage = 'English'

export function TranslationPage(): React.JSX.Element {
  const aiConfig = useAiLookupConfig()
  const [sourceLanguage, setSourceLanguage] =
    useState<AiTranslationLanguage>(INITIAL_SOURCE_LANGUAGE)
  const [targetLanguage, setTargetLanguage] =
    useState<AiTranslationLanguage>(INITIAL_TARGET_LANGUAGE)
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [status, setStatus] = useState<TranslationStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const requestRef = useRef<string | null>(null)
  const requestVersionRef = useRef(0)
  const unsubscribeRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    return () => {
      requestVersionRef.current += 1
      if (requestRef.current) window.dictol.aiLookup.cancel(requestRef.current)
      unsubscribeRef.current?.()
    }
  }, [])

  const isRunning = status === 'running'
  const canTranslate = input.trim().length > 0 && !isRunning

  const translate = async (): Promise<void> => {
    const content = input.trim()
    if (!content || isRunning) return
    if (sourceLanguage === targetLanguage) {
      setError('源语言和目标语言不能相同。')
      setStatus('error')
      return
    }

    const requestVersion = requestVersionRef.current + 1
    requestVersionRef.current = requestVersion
    requestRef.current = null
    unsubscribeRef.current?.()
    unsubscribeRef.current = null
    setOutput('')
    setError(null)
    setStatus('running')

    let requestId: string | null = null
    let settled = false
    const pendingEvents: AiLookupEvent[] = []

    const finish = (nextStatus: Exclude<TranslationStatus, 'idle' | 'running'>): void => {
      if (requestVersion !== requestVersionRef.current || settled) return
      settled = true
      requestRef.current = null
      unsubscribeRef.current?.()
      unsubscribeRef.current = null
      setStatus(nextStatus)
    }

    const handleEvent = (event: AiLookupEvent): void => {
      if (requestVersion !== requestVersionRef.current) return
      if (!requestId) {
        pendingEvents.push(event)
        return
      }
      if (event.requestId !== requestId || settled) return
      if (event.type === 'delta' && event.text) {
        setOutput((current) => current + event.text)
      } else if (event.type === 'done') {
        finish('ready')
      } else {
        setError(event.message ?? 'AI 翻译失败。')
        finish('error')
      }
    }

    const unsubscribe = window.dictol.aiLookup.onEvent(handleEvent)
    unsubscribeRef.current = unsubscribe

    try {
      requestId = await window.dictol.aiLookup.startChat({
        messages: [{ role: 'user', content }],
        promptTarget: 'translation',
        translation: { sourceLanguage, targetLanguage }
      })
      if (requestVersion !== requestVersionRef.current) return
      if (!requestId) throw new Error('AI 请求无法启动。')
      requestRef.current = requestId
      pendingEvents.splice(0).forEach(handleEvent)
    } catch (requestError) {
      if (requestVersion !== requestVersionRef.current) return
      setError(requestError instanceof Error ? requestError.message : 'AI 翻译失败。')
      finish('error')
    }
  }

  if (aiConfig.isLoading) {
    return (
      <main className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
        正在检查 AI 设置…
      </main>
    )
  }

  if (!aiConfig.data?.enabled) {
    return (
      <main className="mx-auto flex h-full w-full max-w-2xl flex-col items-center justify-center p-8 text-center">
        <Languages className="mb-4 size-8 text-muted-foreground" />
        <h1 className="text-lg font-semibold">AI 翻译不可用</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          请先在设置中开启 AI 查词，并完成模型配置。
        </p>
      </main>
    )
  }

  return (
    <section className="mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col px-8 py-10">
      <div className="shrink-0">
        <p className="mb-2 text-sm font-medium text-primary">AI 翻译</p>
        <h1 className="text-3xl font-semibold tracking-tight">翻译文本</h1>
      </div>

      <div className="mt-8 grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="flex min-h-[22rem] min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
          <div className="shrink-0 border-b border-border px-5 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <LanguageSelect
                  disabled={isRunning}
                  label="源语言"
                  onChange={setSourceLanguage}
                  value={sourceLanguage}
                />
              </div>
              <Button
                aria-label="互换源语言和目标语言"
                className="self-center sm:mb-0.5 sm:self-end sm:shrink-0"
                disabled={isRunning}
                onClick={() => {
                  setSourceLanguage(targetLanguage)
                  setTargetLanguage(sourceLanguage)
                }}
                size="icon"
                title="互换源语言和目标语言"
                type="button"
                variant="outline"
              >
                <ArrowLeftRight />
              </Button>
              <div className="min-w-0 flex-1">
                <LanguageSelect
                  disabled={isRunning}
                  label="目标语言"
                  onChange={setTargetLanguage}
                  value={targetLanguage}
                />
              </div>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col p-5">
            <label className="mb-2 text-sm font-medium" htmlFor="translation-input">
              输入
            </label>
            <textarea
              aria-label="待翻译文本"
              className="min-h-0 flex-1 resize-none rounded-lg border border-input bg-background px-3 py-3 text-sm leading-6 outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isRunning}
              id="translation-input"
              onChange={(event) => setInput(event.target.value)}
              placeholder="输入要翻译的文本…"
              value={input}
            />
            {error && status === 'error' && (
              <p className="mt-3 text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <div className="mt-4 flex justify-end">
              <Button disabled={!canTranslate} onClick={() => void translate()} type="button">
                {isRunning ? <LoaderCircle className="animate-spin" /> : <Languages />}
                {isRunning ? '翻译中…' : '翻译'}
              </Button>
            </div>
          </div>
        </section>

        <section className="flex min-h-[22rem] min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-sm font-medium">翻译结果</h2>
            {isRunning && <span className="text-xs text-muted-foreground">正在生成…</span>}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 text-sm leading-6">
            {output ? (
              <AiRichText content={output} />
            ) : isRunning ? (
              <p className="text-muted-foreground">正在等待翻译结果…</p>
            ) : status === 'error' && error ? (
              <p className="text-sm text-destructive">翻译失败，请检查设置后重试。</p>
            ) : (
              <div className="flex h-full min-h-32 items-center justify-center text-center text-sm text-muted-foreground">
                <p>翻译结果会显示在这里</p>
              </div>
            )}
          </div>
          {status === 'ready' && output && (
            <p className="flex shrink-0 items-center gap-1 border-t border-border px-5 py-3 text-xs text-muted-foreground">
              <Info aria-hidden="true" className="size-3.5 shrink-0" />
              内容由 AI 生成，请注意甄别
            </p>
          )}
        </section>
      </div>
    </section>
  )
}

type LanguageSelectProps = {
  disabled: boolean
  label: string
  onChange: (value: AiTranslationLanguage) => void
  value: AiTranslationLanguage
}

function LanguageSelect({
  disabled,
  label,
  onChange,
  value
}: LanguageSelectProps): React.JSX.Element {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="font-medium">{label}</span>
      <select
        className={cn(
          'h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30',
          disabled && 'cursor-not-allowed opacity-60'
        )}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as AiTranslationLanguage)}
        value={value}
      >
        {AI_TRANSLATION_LANGUAGES.map((language) => (
          <option key={language} value={language}>
            {language}
          </option>
        ))}
      </select>
    </label>
  )
}
