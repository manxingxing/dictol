import { MddList, Mdx } from '@dictol/mdict-native'
import { setTimeout as delay } from 'node:timers/promises'
import { resolve, sep } from 'node:path'

const CLOSE_RETRY_DELAY_MS = 20
const CLOSE_RETRY_LIMIT = 100

export class MDFileCache {
  private readonly mdxDictionaries = new Map<string, Mdx>()
  private readonly mddLists = new Map<string, MddList>()
  private readonly blockedDirectories = new Set<string>()

  // fetchMdx: 如果存在就返回，如果不存在就生成
  fetchMdx(filePath: string): Mdx {
    this.assertFileCanOpen(filePath)
    const existing = this.mdxDictionaries.get(filePath)
    if (existing) return existing

    const dictionary = Mdx.open(filePath)
    this.mdxDictionaries.set(filePath, dictionary)
    return dictionary
  }

  // fetchMddList: 使用调用方提供的文件路径顺序创建资源集合。
  fetchMddList(filePaths: string[]): MddList {
    if (filePaths.length === 0) throw new Error('至少需要一个 MDD 文件路径')
    filePaths.forEach((filePath) => this.assertFileCanOpen(filePath))
    const cacheKey = filePaths.join('\0')
    const existing = this.mddLists.get(cacheKey)
    if (existing) return existing

    const dictionary = MddList.open(filePaths)
    this.mddLists.set(cacheKey, dictionary)
    return dictionary
  }

  // 从cache里删除
  remove(filePath: string): void {
    this.mdxDictionaries.delete(filePath)
    for (const [key] of this.mddLists) {
      if (key.split('\0').includes(filePath)) this.mddLists.delete(key)
    }
  }

  invalidateMdictDirectory(directory: string): void {
    const root = resolve(directory)
    for (const filePath of this.mdxDictionaries.keys()) {
      const resolvedPath = resolve(filePath)
      // 删除一个文件或者删除文件夹下的所有mdict文件
      if (resolvedPath === root || resolvedPath.startsWith(`${root}${sep}`)) {
        this.mdxDictionaries.delete(filePath)
      }
    }
    for (const [key] of this.mddLists) {
      if (
        key.split('\0').some((filePath) => {
          const resolvedPath = resolve(filePath)
          return resolvedPath === root || resolvedPath.startsWith(`${root}${sep}`)
        })
      ) {
        this.mddLists.delete(key)
      }
    }
  }

  /**
   * Prevent new opens and deterministically release every native mmap in a dictionary directory.
   * `close()` can briefly report busy while an already-started N-API task is finishing.
   */
  async closeMdictDirectory(directory: string): Promise<void> {
    const root = resolve(directory)
    this.blockedDirectories.add(root)
    const mdxEntries = [...this.mdxDictionaries.entries()].filter(([filePath]) =>
      isPathWithin(resolve(filePath), root)
    )
    const mddEntries = [...this.mddLists.entries()].filter(([key]) =>
      key.split('\0').some((filePath) => isPathWithin(resolve(filePath), root))
    )

    try {
      for (let attempt = 0; attempt <= CLOSE_RETRY_LIMIT; attempt += 1) {
        const allClosed =
          mdxEntries.every(([, dictionary]) => dictionary.close()) &&
          mddEntries.every(([, dictionary]) => dictionary.close())
        if (allClosed) return
        if (attempt < CLOSE_RETRY_LIMIT) await delay(CLOSE_RETRY_DELAY_MS)
      }
      throw new Error('词典文件仍有读取任务未结束，无法安全关闭')
    } finally {
      for (const [filePath] of mdxEntries) this.mdxDictionaries.delete(filePath)
      for (const [key] of mddEntries) this.mddLists.delete(key)
    }
  }

  allowMdictDirectory(directory: string): void {
    this.blockedDirectories.delete(resolve(directory))
  }

  // 删除所有缓存的实例
  dispose(): void {
    for (const dictionary of this.mdxDictionaries.values()) dictionary.close()
    for (const dictionary of this.mddLists.values()) dictionary.close()
    this.mdxDictionaries.clear()
    this.mddLists.clear()
    this.blockedDirectories.clear()
  }

  private assertFileCanOpen(filePath: string): void {
    const resolvedPath = resolve(filePath)
    if ([...this.blockedDirectories].some((root) => isPathWithin(resolvedPath, root))) {
      throw new Error(`词典正在关闭，无法重新打开文件：${filePath}`)
    }
  }
}

function isPathWithin(filePath: string, root: string): boolean {
  const comparableFilePath = process.platform === 'win32' ? filePath.toLowerCase() : filePath
  const comparableRoot = process.platform === 'win32' ? root.toLowerCase() : root
  return (
    comparableFilePath === comparableRoot ||
    comparableFilePath.startsWith(`${comparableRoot}${sep}`)
  )
}
