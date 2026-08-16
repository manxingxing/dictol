/* eslint-disable @typescript-eslint/explicit-function-return-type */

import BetterSqlite3 from 'better-sqlite3'
import { createReadStream } from 'node:fs'
import { mkdir, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'

const REQUIRED_COLUMNS = [
  'word',
  'phonetic',
  'definition',
  'translation',
  'pos',
  'collins',
  'oxford',
  'tag',
  'bnc',
  'frq',
  'exchange'
]

const PROFILES = {
  full: {
    include: () => true,
    description: 'all ECDICT entries'
  },
  balanced: {
    include: ({ oxford, tags, frq }) =>
      oxford === 1 || tags !== null || ((frq ?? 0) > 0 && frq <= 50_000),
    description: 'Oxford, exam-tagged, or top-50k contemporary-frequency entries'
  }
}

const options = parseOptions(process.argv.slice(2))
await buildEcdict(options)

async function buildEcdict({ csvPath, lemmaPath, outputPath, sourceRef, profile }) {
  await assertFile(csvPath, 'ECDICT CSV')
  await assertFile(lemmaPath, 'ECDICT lemma 数据')
  await mkdir(dirname(outputPath), { recursive: true })
  await rm(outputPath, { force: true })

  const database = new BetterSqlite3(outputPath)
  try {
    database.pragma('journal_mode = OFF')
    database.pragma('synchronous = OFF')
    database.exec(`
      CREATE TABLE ecdict_meta (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
      CREATE TABLE ecdict_entry (
        id INTEGER PRIMARY KEY,
        word TEXT NOT NULL,
        normalized_word TEXT NOT NULL UNIQUE,
        phonetic TEXT,
        definition TEXT,
        translation TEXT,
        pos TEXT,
        collins INTEGER,
        oxford INTEGER,
        tags TEXT,
        bnc INTEGER,
        frq INTEGER,
        exchange TEXT
      );
      CREATE TABLE ecdict_form (
        normalized_form TEXT NOT NULL,
        entry_id INTEGER NOT NULL REFERENCES ecdict_entry(id),
        origin TEXT NOT NULL CHECK(origin IN ('exchange', 'lemma')),
        PRIMARY KEY(normalized_form, entry_id)
      ) WITHOUT ROWID;
    `)

    const entryCount = await importEntries(database, csvPath, PROFILES[profile])
    const exchangeCount = await importExchangeForms(database, csvPath)
    const lemmaCount = await importLemmaForms(database, lemmaPath)
    database.prepare('INSERT INTO ecdict_meta (key, value) VALUES (?, ?)').run('version', sourceRef)
    database
      .prepare('INSERT INTO ecdict_meta (key, value) VALUES (?, ?)')
      .run('source_csv', basename(csvPath))
    database
      .prepare('INSERT INTO ecdict_meta (key, value) VALUES (?, ?)')
      .run('entry_count', String(entryCount))
    database.prepare('INSERT INTO ecdict_meta (key, value) VALUES (?, ?)').run('profile', profile)
    database.exec('ANALYZE; VACUUM;')

    const manifest = {
      name: 'ECDICT',
      version: sourceRef,
      profile,
      profileDescription: PROFILES[profile].description,
      source: 'https://github.com/skywind3000/ECDICT',
      entryCount,
      exchangeFormCount: exchangeCount,
      lemmaFormCount: lemmaCount
    }
    await writeFile(
      join(dirname(outputPath), 'manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`
    )
    console.log(
      `Built ${outputPath}: ${entryCount} entries, ${exchangeCount} exchange forms, ${lemmaCount} lemma forms`
    )
  } finally {
    database.close()
  }
}

async function importEntries(database, csvPath, profile) {
  const insert = database.prepare(`
    INSERT OR IGNORE INTO ecdict_entry (
      word, normalized_word, phonetic, definition, translation, pos,
      collins, oxford, tags, bnc, frq, exchange
    ) VALUES (
      @word, @normalizedWord, @phonetic, @definition, @translation, @pos,
      @collins, @oxford, @tags, @bnc, @frq, @exchange
    )
  `)
  let columns
  let transaction = database.transaction((records) => {
    for (const record of records) {
      const value = Object.fromEntries(
        columns.map((column, index) => [column, record[index] ?? ''])
      )
      const word = value.word?.trim()
      if (!word) continue
      const entry = {
        word,
        normalizedWord: normalize(word),
        phonetic: nullable(value.phonetic),
        definition: nullable(value.definition),
        translation: nullable(value.translation),
        pos: nullable(value.pos),
        collins: integerOrNull(value.collins),
        oxford: integerOrNull(value.oxford),
        tags: nullable(value.tag),
        bnc: integerOrNull(value.bnc),
        frq: integerOrNull(value.frq),
        exchange: nullable(value.exchange)
      }
      if (profile.include(entry)) insert.run(entry)
    }
  })
  let batch = []
  for await (const line of createInterface({
    input: createReadStream(csvPath, 'utf8'),
    crlfDelay: Infinity
  })) {
    if (!line) continue
    const record = parseCsvLine(line)
    if (!columns) {
      columns = record.map((column) => column.trim())
      assertHeader(columns)
      continue
    }
    batch.push(record)
    if (batch.length >= 5_000) {
      transaction(batch)
      batch = []
    }
  }
  if (!columns) throw new Error('ECDICT CSV 缺少表头')
  if (batch.length > 0) transaction(batch)
  return database.prepare('SELECT count(*) AS count FROM ecdict_entry').get().count
}

async function importExchangeForms(database, csvPath) {
  const findEntryId = database.prepare(
    'SELECT id FROM ecdict_entry WHERE normalized_word = ? LIMIT 1'
  )
  const insert = database.prepare(
    "INSERT OR IGNORE INTO ecdict_form (normalized_form, entry_id, origin) VALUES (?, ?, 'exchange')"
  )
  let count = 0
  let columns
  let batch = []
  const transaction = database.transaction((records) => {
    for (const record of records) {
      const value = Object.fromEntries(
        columns.map((column, index) => [column, record[index] ?? ''])
      )
      const word = value.word?.trim()
      const exchange = value.exchange?.trim()
      if (!word || !exchange) continue
      for (const [kind, form] of parseExchange(exchange)) {
        const normalizedForm = normalize(form)
        if (!normalizedForm) continue
        const targetWord = kind === '0' ? normalizedForm : normalize(word)
        const target = findEntryId.get(targetWord)
        if (!target) continue
        const result = insert.run(normalizedFormFor(kind === '0' ? word : form), target.id)
        count += result.changes
      }
    }
  })
  for await (const line of createInterface({
    input: createReadStream(csvPath, 'utf8'),
    crlfDelay: Infinity
  })) {
    if (!line) continue
    const record = parseCsvLine(line)
    if (!columns) {
      columns = record.map((column) => column.trim())
      assertHeader(columns)
      continue
    }
    batch.push(record)
    if (batch.length >= 5_000) {
      transaction(batch)
      batch = []
    }
  }
  if (batch.length > 0) transaction(batch)
  return count
}

async function importLemmaForms(database, lemmaPath) {
  const findEntryId = database.prepare(
    'SELECT id FROM ecdict_entry WHERE normalized_word = ? LIMIT 1'
  )
  const insert = database.prepare(
    "INSERT OR IGNORE INTO ecdict_form (normalized_form, entry_id, origin) VALUES (?, ?, 'lemma')"
  )
  let count = 0
  let batch = []
  const flush = database.transaction((records) => {
    for (const [form, lemma] of records) {
      const target = findEntryId.get(normalize(lemma))
      if (!target) continue
      count += insert.run(normalize(form), target.id).changes
    }
  })
  for await (const line of createInterface({
    input: createReadStream(lemmaPath, 'utf8'),
    crlfDelay: Infinity
  })) {
    batch.push(...parseLemmaLine(line))
    if (batch.length >= 5_000) {
      flush(batch)
      batch = []
    }
  }
  if (batch.length > 0) flush(batch)
  return count
}

function parseOptions(args) {
  const values = new Map()
  for (let index = 0; index < args.length; index += 2) values.set(args[index], args[index + 1])
  const csvPath = values.get('--csv')
  const lemmaPath = values.get('--lemma')
  const outputPath = values.get('--output')
  const profile = values.get('--profile') ?? 'balanced'
  if (!csvPath || !lemmaPath || !outputPath) {
    throw new Error(
      'Usage: node scripts/build-ecdict.mjs --csv <ecdict.csv> --lemma <lemma.en.txt> --output <ecdict.sqlite> [--profile balanced|full] [--source-ref <ref>]'
    )
  }
  if (!(profile in PROFILES)) throw new Error(`未知 ECDICT 配置：${profile}`)
  return {
    csvPath: resolve(csvPath),
    lemmaPath: resolve(lemmaPath),
    outputPath: resolve(outputPath),
    sourceRef: values.get('--source-ref') ?? 'ECDICT',
    profile
  }
}

async function assertFile(path, name) {
  const details = await stat(path).catch(() => undefined)
  if (!details?.isFile()) throw new Error(`${name}不存在：${path}`)
}

function assertHeader(columns) {
  for (const column of REQUIRED_COLUMNS) {
    if (!columns.includes(column)) throw new Error(`ECDICT CSV 缺少列：${column}`)
  }
}

function parseCsvLine(line) {
  const fields = []
  let field = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (quoted && character === '"' && line[index + 1] === '"') {
      field += '"'
      index += 1
    } else if (character === '"') {
      quoted = !quoted
    } else if (character === ',' && !quoted) {
      fields.push(field)
      field = ''
    } else {
      field += character
    }
  }
  if (quoted) throw new Error('ECDICT CSV 含有未闭合的引号字段')
  fields.push(field)
  return fields
}

function parseExchange(value) {
  return value
    .split('/')
    .map((part) => {
      const divider = part.indexOf(':')
      return divider > 0 ? [part.slice(0, divider), part.slice(divider + 1)] : []
    })
    .filter((part) => part.length === 2)
}

function parseLemmaLine(line) {
  const divider = line.indexOf('->')
  if (divider === -1) return []

  const lemmaWithFrequency = line.slice(0, divider).trim()
  const lemma = lemmaWithFrequency.split('/', 1)[0]?.trim()
  if (!lemma) return []

  return line
    .slice(divider + 2)
    .split(',')
    .map((form) => form.trim())
    .filter(Boolean)
    .map((form) => [form, lemma])
}

function normalize(value) {
  return value.trim().toLowerCase()
}

function normalizedFormFor(value) {
  return normalize(value)
}

function nullable(value) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function integerOrNull(value) {
  const parsed = Number.parseInt(value, 10)
  return Number.isSafeInteger(parsed) ? parsed : null
}
