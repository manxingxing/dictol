import { MddList, Mdx } from '@dictol/mdict-native'
import { resolve, sep } from 'node:path'

export class MDFileCache {
  private readonly mdxDictionaries = new Map<string, Mdx>()
  private readonly mddLists = new Map<string, MddList>()

  // fetchMdx: 如果存在就返回，如果不存在就生成
  fetchMdx(filePath: string): Mdx {
    const existing = this.mdxDictionaries.get(filePath)
    if (existing) return existing

    const dictionary = Mdx.open(filePath)
    this.mdxDictionaries.set(filePath, dictionary)
    return dictionary
  }

  // fetchMddList: 使用调用方提供的文件路径顺序创建资源集合。
  fetchMddList(filePaths: string[]): MddList {
    if (filePaths.length === 0) throw new Error('至少需要一个 MDD 文件路径')
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

  // 删除所有缓存的实例
  dispose(): void {
    this.mdxDictionaries.clear()
    this.mddLists.clear()
  }
}
