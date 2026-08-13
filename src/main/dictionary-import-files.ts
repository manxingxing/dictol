import { readdir, stat } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'

import type {
  DictionaryImportPreview,
  DictionaryImportRequest,
  DictionaryImportSourceFile
} from '../shared/dictionary-import'

const COMPANION_EXTENSIONS = new Set(['.mdd', '.css', '.js', '.png', '.ttf', '.woff2'])

export type DictionaryCompanionFile = {
  sourcePath: string
  relativePath: string
}

export async function collectDictionaryCompanionFiles(
  sourceDirectory: string
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
      if (!entry.isFile() || !COMPANION_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
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
  const mdxName = basename(mdxPath)
  const sourceFiles = [
    { sourcePath: mdxPath, relativePath: mdxName, required: true },
    ...(await collectDictionaryCompanionFiles(dirname(mdxPath))).map((file) => ({
      ...file,
      required: false
    }))
  ]

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
  const preview = await createDictionaryImportPreview(request.mdxPath)
  const selectedPaths = new Set(request.selectedRelativePaths)
  if (selectedPaths.size !== request.selectedRelativePaths.length) {
    throw new Error('导入文件列表包含重复路径')
  }

  const mdxRelativePath = basename(request.mdxPath)
  if (!selectedPaths.has(mdxRelativePath)) throw new Error('MDX 主文件不能取消选择')

  const availableByPath = new Map(preview.files.map((file) => [file.relativePath, file]))
  const selectedFiles = request.selectedRelativePaths.map((relativePath) => {
    const file = availableByPath.get(relativePath)
    if (!file) throw new Error(`导入文件已不存在或不再符合导入规则：${relativePath}`)
    return { sourcePath: file.sourcePath, relativePath: file.relativePath }
  })

  return selectedFiles
}
