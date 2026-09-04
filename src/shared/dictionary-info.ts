export type DictionaryInfo = {
  title: string
  description: string
  dictionaryFileNames: string[]
  entryCount: string
  version: string
  engineVersion: number
  requiredVersion: number | null
  format: string
  encoding: string
  encrypted: number
  keyCaseSensitive: boolean
  stripKey: boolean
}
