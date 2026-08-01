import { existsSync } from 'node:fs'
import { join } from 'node:path'

export function resolvePreloadPath(fileName: string): string {
  return resolveOutputFile('preload', fileName)
}

export function resolveRendererPath(fileName: string): string {
  return resolveOutputFile('renderer', fileName)
}

function resolveOutputFile(directory: 'preload' | 'renderer', fileName: string): string {
  const candidates = [
    join(__dirname, '..', directory, fileName),
    join(__dirname, '..', '..', directory, fileName)
  ]
  return candidates.find(existsSync) ?? candidates[0]
}
