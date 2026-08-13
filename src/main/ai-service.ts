import type {
  AiTranslationLanguage,
  AiChatMessage,
  AiLookupPublicConfig,
  AiSaveConfigRequest,
  AiStreamEvent
} from '../shared/ai-ipc'
import { AppConfigStore } from './app-config'
import { AiCredentialStore } from './ai-credentials'

const MAX_MESSAGES = 100
const MAX_MESSAGE_LENGTH = 20_000
const REQUEST_TIMEOUT_MS = 120_000

export type AiStreamHandler = (event: AiStreamEvent) => void
export type AiPromptTarget = 'sidebar' | 'selection-toolbar' | 'translation'

export class AiLookupService {
  private readonly credentials: AiCredentialStore
  private readonly requests = new Map<string, AbortController>()

  constructor(private readonly appConfig: AppConfigStore) {
    this.credentials = new AiCredentialStore()
  }

  getPublicConfig(): AiLookupPublicConfig {
    const config = this.appConfig.load().aiLookup
    return {
      ...config,
      hasApiKey: Boolean(this.credentials.getApiKey())
    }
  }

  saveConfig(input: AiSaveConfigRequest): ReturnType<AiLookupService['getPublicConfig']> {
    const baseUrl = normalizeBaseUrl(input.baseUrl)
    const model = normalizeText(input.model, 200)
    const sidebarSystemPrompt = normalizeText(input.sidebarSystemPrompt, 4_000)
    const selectionToolbarSystemPrompt = normalizeText(input.selectionToolbarSystemPrompt, 4_000)
    if (!baseUrl) throw new Error('请填写服务地址。')

    const current = this.appConfig.load()
    try {
      this.appConfig.save({
        ...current,
        aiLookup: {
          enabled: input.enabled,
          provider: 'openai-compatible',
          baseUrl,
          model,
          sidebarSystemPrompt,
          selectionToolbarSystemPrompt
        }
      })
      if (input.apiKey?.trim()) this.credentials.saveApiKey(input.apiKey)
    } catch (error) {
      this.appConfig.save(current)
      throw error
    }
    return this.getPublicConfig()
  }

  async *stream(
    requestId: string,
    messages: AiChatMessage[],
    promptTarget: AiPromptTarget,
    translation?: {
      sourceLanguage: AiTranslationLanguage
      targetLanguage: AiTranslationLanguage
    },
    onEvent?: AiStreamHandler
  ): AsyncGenerator<AiStreamEvent, void> {
    const controller = new AbortController()
    this.cancel(requestId)
    this.requests.set(requestId, controller)
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    const send = (event: AiStreamEvent): void => onEvent?.(event)

    try {
      const config = this.appConfig.load().aiLookup
      if (!config.enabled) throw new Error('AI 查词尚未开启。')
      if (!config.model) throw new Error('请先在设置中配置模型名称。')
      const systemPrompt = getSystemPrompt(config, promptTarget, translation)
      if (!systemPrompt) {
        throw new Error(
          promptTarget === 'sidebar'
            ? '请先在设置中配置 AI 查词侧边栏 Prompt。'
            : '请先在设置中配置划词工具栏 Prompt。'
        )
      }
      const apiKey = this.credentials.getApiKey()
      const bodyMessages = validateMessages(messages)
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
        },
        body: JSON.stringify({
          model: config.model,
          stream: true,
          messages: [{ role: 'system', content: systemPrompt }, ...bodyMessages]
        }),
        signal: controller.signal
      })

      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new Error(formatProviderError(response.status, text))
      }
      if (!response.body) throw new Error('服务没有返回可读取的响应。')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let completed = false
      try {
        while (true) {
          const { done, value } = await reader.read()
          buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })
          const lines = buffer.split(/\r?\n/)
          buffer = lines.pop() ?? ''
          for (const line of lines) {
            const event = parseStreamLine(line)
            if (!event) continue
            completed = event.type === 'done'
            send(event)
            yield event
          }
          if (done) {
            const finalEvent = parseStreamLine(buffer)
            if (finalEvent) {
              completed = finalEvent.type === 'done'
              send(finalEvent)
              yield finalEvent
            }
            break
          }
        }
        if (!completed) {
          const event: AiStreamEvent = { type: 'done' }
          send(event)
          yield event
        }
      } finally {
        reader.releaseLock()
      }
    } catch (error) {
      if (controller.signal.aborted) return
      const event: AiStreamEvent = {
        type: 'error',
        message: error instanceof Error ? error.message : 'AI 请求失败。'
      }
      send(event)
      yield event
    } finally {
      clearTimeout(timeout)
      if (this.requests.get(requestId) === controller) this.requests.delete(requestId)
    }
  }

  start(
    requestId: string,
    messages: AiChatMessage[],
    promptTarget: AiPromptTarget,
    onEvent: AiStreamHandler,
    translation?: {
      sourceLanguage: AiTranslationLanguage
      targetLanguage: AiTranslationLanguage
    }
  ): void {
    void this.consume(requestId, messages, promptTarget, translation, onEvent)
  }

  cancel(requestId: string): void {
    this.requests.get(requestId)?.abort()
    this.requests.delete(requestId)
  }

  dispose(): void {
    for (const controller of this.requests.values()) controller.abort()
    this.requests.clear()
  }

  private async consume(
    requestId: string,
    messages: AiChatMessage[],
    promptTarget: AiPromptTarget,
    translation:
      | {
          sourceLanguage: AiTranslationLanguage
          targetLanguage: AiTranslationLanguage
        }
      | undefined,
    onEvent: AiStreamHandler
  ): Promise<void> {
    for await (const event of this.stream(
      requestId,
      messages,
      promptTarget,
      translation,
      onEvent
    )) {
      // The stream handler owns IPC delivery; consuming keeps the generator alive.
      void event
    }
  }
}

function getSystemPrompt(
  config: ReturnType<AppConfigStore['load']>['aiLookup'],
  promptTarget: AiPromptTarget,
  translation?: {
    sourceLanguage: AiTranslationLanguage
    targetLanguage: AiTranslationLanguage
  }
): string {
  if (promptTarget === 'translation') {
    if (!translation) return ''
    return `你是一个专业、准确、自然的翻译助手。请将用户提供的内容从${translation.sourceLanguage}翻译成${translation.targetLanguage}。
当前翻译方向：源语言=${translation.sourceLanguage}；目标语言=${translation.targetLanguage}。
保留原文的语气、格式和段落结构；专有名词、数字和 Markdown 标记应准确处理。除非用户明确要求解释，否则只输出翻译结果，不要添加前言、注释或语言标签。`
  }

  return promptTarget === 'sidebar'
    ? config.sidebarSystemPrompt
    : config.selectionToolbarSystemPrompt
}

function validateMessages(messages: AiChatMessage[]): AiChatMessage[] {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    throw new Error('AI 消息数量无效。')
  }
  let totalLength = 0
  return messages.map((message) => {
    if (
      !message ||
      (message.role !== 'user' && message.role !== 'assistant') ||
      typeof message.content !== 'string'
    ) {
      throw new Error('AI 消息格式无效。')
    }
    const content = message.content.trim()
    if (!content || content.length > MAX_MESSAGE_LENGTH) throw new Error('AI 消息内容无效。')
    totalLength += content.length
    if (totalLength > 200_000) throw new Error('AI 对话内容过长。')
    return { role: message.role, content }
  })
}

function normalizeBaseUrl(value: string): string {
  if (typeof value !== 'string') return ''
  const normalized = value.trim().replace(/\/+$/, '')
  if (!/^https?:\/\/[^\s]+$/i.test(normalized)) return ''
  return normalized
}

function normalizeText(value: string, maxLength: number): string {
  if (typeof value !== 'string') return ''
  const normalized = value.trim()
  return normalized.length <= maxLength ? normalized : ''
}

function parseStreamLine(line: string): AiStreamEvent | undefined {
  if (!line.startsWith('data:')) return undefined
  const data = line.slice(5).trim()
  if (!data) return undefined
  if (data === '[DONE]') return { type: 'done' }
  try {
    const value = JSON.parse(data) as {
      choices?: Array<{ delta?: { content?: unknown }; finish_reason?: unknown }>
      error?: { message?: unknown }
    }
    if (typeof value.error?.message === 'string')
      return { type: 'error', message: value.error.message }
    const content = value.choices?.[0]?.delta?.content
    if (typeof content === 'string' && content) return { type: 'delta', text: content }
    if (value.choices?.[0]?.finish_reason) return { type: 'done' }
  } catch {
    return undefined
  }
  return undefined
}

function formatProviderError(status: number, response: string): string {
  try {
    const parsed = JSON.parse(response) as { error?: { message?: unknown } }
    if (typeof parsed.error?.message === 'string') return parsed.error.message
  } catch {
    // Use the HTTP status below when the provider returned non-JSON text.
  }
  return `AI 服务请求失败（${status}）。`
}
