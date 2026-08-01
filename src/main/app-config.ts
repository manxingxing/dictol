import { app } from 'electron'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

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
}

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
  }

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
    }
  }
}

function cloneConfig(config: AppConfig): AppConfig {
  return {
    featureFlags: { ...config.featureFlags },
    shortcuts: { ...config.shortcuts },
    selection: {
      excludedPrograms: [...config.selection.excludedPrograms]
    }
  }
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
