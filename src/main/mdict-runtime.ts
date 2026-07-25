import { MdictDictionary } from '@dictol/mdict-native'
import { resolve, sep } from 'node:path'

const dictionaries = new Map<string, MdictDictionary>()

export function getMdictDictionary(filePath: string): MdictDictionary {
  const existing = dictionaries.get(filePath)
  if (existing) return existing

  const dictionary = MdictDictionary.open(filePath)
  dictionaries.set(filePath, dictionary)
  return dictionary
}

export function invalidateMdictDirectory(directory: string): void {
  const root = resolve(directory)
  for (const filePath of dictionaries.keys()) {
    const resolvedPath = resolve(filePath)
    if (resolvedPath === root || resolvedPath.startsWith(`${root}${sep}`)) {
      dictionaries.delete(filePath)
    }
  }
}

export function decodeMdxRecord(bytes: Buffer, encoding: string): string {
  const normalizedEncoding = encoding.toLowerCase().replaceAll('_', '-')
  const decoder = new TextDecoder(
    normalizedEncoding === 'utf-16' ? 'utf-16le' : normalizedEncoding,
    { fatal: false }
  )
  return decoder.decode(bytes).replace(/\0+$/, '')
}
