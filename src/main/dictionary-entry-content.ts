import type { AppRuntime } from './app-runtime'
import type { DictionaryEntryRecord } from './db-service'

const ENTRY_SEPARATOR = '<hr class="dictol-entry-separator" />'

/**
 * 读取一个展示词条包含的全部 MDX record，并按其逻辑地址顺序拼接 HTML。
 *
 * 同一个 key 可能在 MDX 中出现多次，后续 record 通常承载图片或补充内容。
 */
export async function readDictionaryEntryText(
  runtime: AppRuntime,
  records: readonly DictionaryEntryRecord[]
): Promise<string> {
  const texts = await Promise.all(
    records.map((record) => {
      const mdx = runtime.mdFileCache.fetchMdx(record.filePath)
      return mdx.readRecordText(
        BigInt(record.recordStartOffset),
        BigInt(record.recordEndOffset),
        true
      )
    })
  )
  return mergeDictionaryEntryTexts(texts)
}

/** 按首次出现顺序移除完全相同的 HTML，再用词条分隔线拼接。 */
export function mergeDictionaryEntryTexts(texts: readonly string[]): string {
  return [...new Set(texts)].join(ENTRY_SEPARATOR)
}
