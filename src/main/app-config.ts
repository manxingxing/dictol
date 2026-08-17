import { app } from 'electron'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { DEFAULT_TTS_VOICE } from '../shared/tts'

export type AppConfig = {
  featureFlags: {
    lookupWordOnShortcut: boolean
    lookupWordOnSelection: boolean
  }
  shortcuts: {
    lookupWordOnShortcut: string
  }
  selection: {
    excludedPrograms: string[]
  }
  tts: {
    edgeVoice: string
  }
  aiLookup: {
    enabled: boolean
    provider: 'openai-compatible'
    baseUrl: string
    model: string
    sidebarSystemPrompt: string
    selectionToolbarSystemPrompt: string
  }
}

const DEFAULT_AI_SIDEBAR_SYSTEM_PROMPT = `你是一个专业、简洁的词典助手。请结合当前查词内容回答用户问题，并在后续对话中保持上下文。
解释词语时，优先给出核心释义、词性、常见搭配和自然例句。用户继续追问时，直接回应其问题，不要重复完整词条。不要编造不确定的信息。`

const DEFAULT_AI_SELECTION_TOOLBAR_SYSTEM_PROMPT = `你是一个专业、简洁的语言解释助手。请直接解释用户选中的文字，并根据内容判断适合的任务：单词释义、短语解释、整句翻译或段落说明。
结果应当独立完整、便于快速阅读，不要提出后续问题，也不要使用聊天式开场。

不要编造不确定的信息。`

const DEFAULT_CONFIG: AppConfig = {
  featureFlags: {
    lookupWordOnShortcut: true,
    lookupWordOnSelection: false
  },
  shortcuts: {
    lookupWordOnShortcut: 'Alt+D'
  },
  selection: {
    excludedPrograms: []
  },
  tts: {
    edgeVoice: DEFAULT_TTS_VOICE
  },
  aiLookup: {
    enabled: false,
    provider: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    model: '',
    sidebarSystemPrompt: DEFAULT_AI_SIDEBAR_SYSTEM_PROMPT,
    selectionToolbarSystemPrompt: DEFAULT_AI_SELECTION_TOOLBAR_SYSTEM_PROMPT
  }
}

export class AppConfigStore {
  constructor(private readonly configPath = join(app.getPath('userData'), 'config.json')) {}

  load(): AppConfig {
    try {
      const value = JSON.parse(readFileSync(this.configPath, 'utf8')) as unknown
      return parseConfig(value)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.save(DEFAULT_CONFIG)
      } else {
        console.warn('Failed to load app config; using defaults', error)
      }
      return cloneConfig(DEFAULT_CONFIG)
    }
  }

  save(config: AppConfig): void {
    const normalized = parseConfig(config)
    const temporaryPath = `${this.configPath}.tmp`
    mkdirSync(dirname(this.configPath), { recursive: true })
    writeFileSync(temporaryPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8')
    renameSync(temporaryPath, this.configPath)
  }

  addExcludedProgram(programName: string): AppConfig {
    const normalizedProgram = normalizeProgramName(programName)
    if (!normalizedProgram) throw new Error('无效的程序名称')

    const config = this.load()
    if (
      config.selection.excludedPrograms.some(
        (program) => program.toLocaleLowerCase() === normalizedProgram.toLocaleLowerCase()
      )
    ) {
      return config
    }

    const nextConfig: AppConfig = {
      ...cloneConfig(config),
      selection: {
        excludedPrograms: [...config.selection.excludedPrograms, normalizedProgram]
      }
    }
    this.save(nextConfig)
    return nextConfig
  }

  removeExcludedProgram(programName: string): AppConfig {
    const normalizedProgram = normalizeProgramName(programName)
    if (!normalizedProgram) throw new Error('无效的程序名称')

    const config = this.load()
    const excludedPrograms = config.selection.excludedPrograms.filter(
      (program) => program.toLocaleLowerCase() !== normalizedProgram.toLocaleLowerCase()
    )
    const nextConfig: AppConfig = {
      ...cloneConfig(config),
      selection: { excludedPrograms }
    }
    this.save(nextConfig)
    return nextConfig
  }
}

function parseConfig(value: unknown): AppConfig {
  if (typeof value !== 'object' || value === null) return cloneConfig(DEFAULT_CONFIG)
  const candidate = value as {
    featureFlags?: {
      lookupWordOnShortcut?: unknown
      lookupWordOnSelection?: unknown
    }
    shortcuts?: { lookupWordOnShortcut?: unknown }
    selection?: { excludedPrograms?: unknown }
    tts?: { edgeVoice?: unknown }
    aiLookup?: {
      enabled?: unknown
      provider?: unknown
      baseUrl?: unknown
      model?: unknown
      sidebarSystemPrompt?: unknown
      selectionToolbarSystemPrompt?: unknown
    }
  }

  const sidebarSystemPrompt = normalizeConfigString(
    candidate.aiLookup?.sidebarSystemPrompt,
    DEFAULT_CONFIG.aiLookup.sidebarSystemPrompt,
    4_000
  )
  const selectionToolbarSystemPrompt = normalizeConfigString(
    candidate.aiLookup?.selectionToolbarSystemPrompt,
    DEFAULT_CONFIG.aiLookup.selectionToolbarSystemPrompt,
    4_000
  )

  return {
    featureFlags: {
      lookupWordOnShortcut:
        typeof candidate.featureFlags?.lookupWordOnShortcut === 'boolean'
          ? candidate.featureFlags.lookupWordOnShortcut
          : DEFAULT_CONFIG.featureFlags.lookupWordOnShortcut,
      lookupWordOnSelection:
        typeof candidate.featureFlags?.lookupWordOnSelection === 'boolean'
          ? candidate.featureFlags.lookupWordOnSelection
          : DEFAULT_CONFIG.featureFlags.lookupWordOnSelection
    },
    shortcuts: {
      lookupWordOnShortcut:
        typeof candidate.shortcuts?.lookupWordOnShortcut === 'string' &&
        candidate.shortcuts.lookupWordOnShortcut.trim()
          ? candidate.shortcuts.lookupWordOnShortcut.trim()
          : DEFAULT_CONFIG.shortcuts.lookupWordOnShortcut
    },
    selection: {
      excludedPrograms: normalizeExcludedPrograms(candidate.selection?.excludedPrograms)
    },
    tts: {
      edgeVoice: normalizeConfigString(candidate.tts?.edgeVoice, DEFAULT_CONFIG.tts.edgeVoice, 200)
    },
    aiLookup: {
      enabled:
        typeof candidate.aiLookup?.enabled === 'boolean'
          ? candidate.aiLookup.enabled
          : DEFAULT_CONFIG.aiLookup.enabled,
      provider: 'openai-compatible',
      baseUrl: normalizeConfigString(
        candidate.aiLookup?.baseUrl,
        DEFAULT_CONFIG.aiLookup.baseUrl,
        500
      ),
      model: normalizeConfigString(candidate.aiLookup?.model, DEFAULT_CONFIG.aiLookup.model, 200),
      sidebarSystemPrompt,
      selectionToolbarSystemPrompt
    }
  }
}

function cloneConfig(config: AppConfig): AppConfig {
  return {
    featureFlags: { ...config.featureFlags },
    shortcuts: { ...config.shortcuts },
    selection: {
      excludedPrograms: [...config.selection.excludedPrograms]
    },
    tts: {
      ...config.tts
    },
    aiLookup: {
      ...config.aiLookup
    }
  }
}

function normalizeConfigString(value: unknown, fallback: string, maxLength: number): string {
  if (typeof value !== 'string') return fallback
  const normalized = value.trim()
  return normalized && normalized.length <= maxLength ? normalized : fallback
}

function normalizeExcludedPrograms(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  const seen = new Set<string>()
  const programs: string[] = []
  for (const valueItem of value) {
    const program = normalizeProgramName(valueItem)
    if (!program) continue
    const key = program.toLocaleLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    programs.push(program)
    if (programs.length >= 200) break
  }
  return programs
}

function normalizeProgramName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const program = value.trim()
  return program && program.length <= 200 ? program : null
}
