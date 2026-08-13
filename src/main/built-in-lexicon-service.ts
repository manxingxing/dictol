import BetterSqlite3, { type Database, type Statement } from 'better-sqlite3'
import { app } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export type BuiltInLexiconEntry = {
  word: string
  phonetic: string | null
  definition: string | null
  translation: string | null
  partOfSpeech: string | null
  exchange: string | null
  tags: string | null
  collins: number | null
  oxford: boolean | null
  bnc: number | null
  frq: number | null
  version: string
}

type EntryRow = Omit<BuiltInLexiconEntry, 'version' | 'oxford'> & {
  oxford: number | null
}

/**
 * Read-only access to the ECDICT SQLite asset bundled with the application.
 * This is deliberately main-process only: it enriches a wordbook record while
 * it is created and is not a user-facing dictionary query API.
 */
export class BuiltInLexiconService {
  private readonly database: Database
  private readonly findExact: Statement<[string], EntryRow | undefined>
  private readonly findRelated: Statement<[string], EntryRow | undefined>
  private readonly version: string

  constructor(databasePath = getBuiltInLexiconPath()) {
    if (!existsSync(databasePath)) {
      throw new Error(`内置 ECDICT 资源不存在：${databasePath}`)
    }

    this.database = new BetterSqlite3(databasePath, { readonly: true, fileMustExist: true })
    this.database.pragma('query_only = ON')
    this.findExact = this.database.prepare(`
      SELECT word, phonetic, definition, translation, pos AS partOfSpeech, exchange, tags,
             collins, oxford, bnc, frq
      FROM ecdict_entry
      WHERE normalized_word = ?
      LIMIT 1
    `)
    this.findRelated = this.database.prepare(`
      SELECT entry.word, entry.phonetic, entry.definition, entry.translation,
             entry.pos AS partOfSpeech, entry.exchange, entry.tags, entry.collins,
             entry.oxford, entry.bnc, entry.frq
      FROM ecdict_form AS form
      INNER JOIN ecdict_entry AS entry ON entry.id = form.entry_id
      WHERE form.normalized_form = ?
      ORDER BY CASE form.origin WHEN 'exchange' THEN 0 ELSE 1 END, entry.id
      LIMIT 1
    `)
    const metadata = this.database
      .prepare("SELECT value FROM ecdict_meta WHERE key = 'version' LIMIT 1")
      .get() as { value: string } | undefined
    this.version = metadata?.value ?? 'unknown'
  }

  lookup(word: string): BuiltInLexiconEntry | null {
    const normalizedWord = normalizeWord(word)
    if (!normalizedWord) return null

    // Prefer an explicit ECDICT form/lemma mapping over a surface-form entry.
    // For example, `running` can have its own row, but the wordbook should
    // retain the canonical `run` entry while preserving `running` as the
    // user's saved word.
    const row = this.findRelated.get(normalizedWord) ?? this.findExact.get(normalizedWord)
    return row ? toEntry(row, this.version) : null
  }

  dispose(): void {
    this.database.close()
  }
}

export function getBuiltInLexiconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'ecdict', 'ecdict.sqlite')
    : join(app.getAppPath(), 'resources', 'ecdict', 'ecdict.sqlite')
}

function normalizeWord(value: string): string {
  return value.trim().toLowerCase()
}

function toEntry(row: EntryRow, version: string): BuiltInLexiconEntry {
  return {
    ...row,
    oxford: row.oxford === null ? null : row.oxford !== 0,
    version
  }
}
