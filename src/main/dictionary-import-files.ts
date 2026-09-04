import { readdir, stat } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'

import type {
  DictionaryImportPreview,
  DictionaryImportRequest,
  DictionaryImportSourceFile
} from '../shared/dictionary-import'

const DICTIONARY_ICON_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif']
const DICTIONARY_IMAGE_EXTENSIONS = new Set(DICTIONARY_ICON_EXTENSIONS)
const COMPANION_EXTENSIONS = new Set([
  '.css',
  '.gif',
  '.jpeg',
  '.jpg',
  '.js',
  '.mdd',
  '.png',
  '.ttf',
  '.webp',
  '.woff2'
])

export type DictionaryCompanionFile = {
  sourcePath: string
  relativePath: string
}

export async function collectDictionaryCompanionFiles(
  sourceDirectory: string
): Promise<DictionaryCompanionFile[]> {
  return collectFilesWithExtensions(sourceDirectory, COMPANION_EXTENSIONS)
}

async function collectFilesWithExtensions(
  sourceDirectory: string,
  extensions: ReadonlySet<string>
): Promise<DictionaryCompanionFile[]> {
  const files: DictionaryCompanionFile[] = []

  const visit = async (directory: string, relativeDirectory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name))

    for (const entry of entries) {
      const sourcePath = join(directory, entry.name)
      const relativePath = join(relativeDirectory, entry.name)

      if (entry.isDirectory()) {
        await visit(sourcePath, relativePath)
        continue
      }
      if (!entry.isFile() || !extensions.has(extname(entry.name).toLowerCase())) {
        continue
      }

      files.push({ sourcePath, relativePath })
    }
  }

  await visit(sourceDirectory, '')
  return files
}

export async function createDictionaryImportPreview(
  mdxPath: string
): Promise<DictionaryImportPreview> {
  const sourceFiles = await collectDictionaryImportFiles(mdxPath)

  return {
    mdxPath,
    files: await Promise.all(
      sourceFiles.map(async (file) => ({
        ...file,
        fileSize: (await stat(file.sourcePath)).size
      }))
    )
  }
}

export async function resolveDictionaryImportSelection(
  request: DictionaryImportRequest
): Promise<DictionaryImportSourceFile[]> {
  const availableFiles = await collectDictionaryImportFiles(request.mdxPath)
  const selectedPaths = new Set(request.selectedRelativePaths)
  if (selectedPaths.size !== request.selectedRelativePaths.length) {
    throw new Error('导入文件列表包含重复路径')
  }

  const mdxRelativePath = basename(request.mdxPath)
  if (!selectedPaths.has(mdxRelativePath)) throw new Error('MDX 主文件不能取消选择')

  const availableByPath = new Map(availableFiles.map((file) => [file.relativePath, file]))
  const requiredPaths = availableFiles
    .filter((file) => file.required)
    .map((file) => file.relativePath)
  if (requiredPaths.some((relativePath) => !selectedPaths.has(relativePath))) {
    throw new Error('MDX 主文件和同名图标不能取消选择')
  }
  const selectedFiles = request.selectedRelativePaths.map((relativePath) => {
    const file = availableByPath.get(relativePath)
    if (!file) throw new Error(`导入文件已不存在或不再符合导入规则：${relativePath}`)
    return { sourcePath: file.sourcePath, relativePath: file.relativePath }
  })

  return selectedFiles
}

async function collectDictionaryImportFiles(
  mdxPath: string
): Promise<Array<DictionaryImportSourceFile & { required: boolean }>> {
  const mdxName = basename(mdxPath)
  const companionFiles = await collectDictionaryCompanionFiles(dirname(mdxPath))
  const mdxBaseName = basename(mdxPath, extname(mdxPath)).toLowerCase()
  const iconRelativePath = companionFiles
    .filter(
      (file) =>
        dirname(file.sourcePath) === dirname(mdxPath) &&
        basename(file.sourcePath, extname(file.sourcePath)).toLowerCase() === mdxBaseName &&
        DICTIONARY_IMAGE_EXTENSIONS.has(extname(file.sourcePath).toLowerCase())
    )
    .sort(
      (left, right) =>
        DICTIONARY_ICON_EXTENSIONS.indexOf(extname(left.sourcePath).toLowerCase()) -
        DICTIONARY_ICON_EXTENSIONS.indexOf(extname(right.sourcePath).toLowerCase())
    )[0]?.relativePath

  return [
    { sourcePath: mdxPath, relativePath: mdxName, required: true },
    ...companionFiles.map((file) => ({
      ...file,
      required: file.relativePath === iconRelativePath
    }))
  ]
}
