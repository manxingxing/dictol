import { MdictDictionary } from '@dictol/mdict-native'
import { resolve, sep } from 'node:path'

export class MDFileCache {
  private readonly dictionaries = new Map<string, MdictDictionary>()

  // fetch: 如果存在就返回，如果不存在就生成
  fetch(filePath: string): MdictDictionary {
    const existing = this.dictionaries.get(filePath)
    if (existing) return existing

    const dictionary = MdictDictionary.open(filePath)
    this.dictionaries.set(filePath, dictionary)
    return dictionary
  }

  // 从cache里删除
  remove(filePath: string): void {
    this.dictionaries.delete(filePath)
  }

  invalidateMdictDirectory(directory: string): void {
    const root = resolve(directory)
    for (const filePath of this.dictionaries.keys()) {
      const resolvedPath = resolve(filePath)
      // 删除一个文件或者删除文件夹下的所有mdict文件
      if (resolvedPath === root || resolvedPath.startsWith(`${root}${sep}`)) {
        this.dictionaries.delete(filePath)
      }
    }
  }

  // 删除所有缓存的实例
  dispose(): void {
    this.dictionaries.clear()
  }
}
