#!/usr/bin/env node

import { createRequire } from 'node:module'
import { basename } from 'node:path'

const require = createRequire(import.meta.url)
const { MddList, Mdx } = require('../wrapper.js')

const [, , mdxPath, word = 'abandon', ...mddPaths] = process.argv

if (!mdxPath) {
  console.error(`用法:
  node native/mdict-node/examples/manual-test.mjs <file.mdx> [word] [file.mdd ...]

示例:
  node native/mdict-node/examples/manual-test.mjs \\
    Dictionaries/oaldpe/oaldpe.mdx abandon \\
    Dictionaries/oaldpe/oaldpe.mdd \\
    Dictionaries/oaldpe/oaldpe.1.mdd`)
  process.exit(1)
}

async function main() {
  console.log(`打开 MDX: ${mdxPath}`)
  const mdx = Mdx.open(mdxPath)
  console.log('MDX metadata:', mdx.metadata)

  const key = await mdx.findKey(word)
  if (!key) {
    console.log(`未找到 key: ${word}`)
  } else {
    console.log('找到 key:', key)
    const text = await mdx.readRecordText(key.recordStart, key.recordEnd, true)
    console.log(`词条文本（前 500 字符）:\n${text.slice(0, 500)}`)
  }

  const firstKeys = []
  for await (const item of mdx.keys()) {
    firstKeys.push(item)
    if (firstKeys.length >= 5) break
  }
  console.log('前 5 个 key:', firstKeys)

  const firstEntries = []
  for await (const item of mdx.entries()) {
    firstEntries.push({
      keyText: item.keyText,
      byteLength: item.data.length
    })
    if (firstEntries.length >= 3) break
  }
  console.log('前 3 个原始 entry:', firstEntries)

  if (mddPaths.length === 0) {
    console.log('未提供 MDD 路径，跳过资源测试。')
    return
  }

  console.log(`打开 MDD 分卷（${mddPaths.length} 个）:`)
  mddPaths.forEach((path, index) => console.log(`  [${index}] ${path}`))
  const mdd = MddList.open(mddPaths)
  console.log('MDD volumeCount:', mdd.volumeCount)

  const resourceKey = '\\media\\spx\\US_vitro.spx'
  const resource = await mdd.findKey(resourceKey)
  if (!resource) {
    console.log(`未找到示例资源: ${resourceKey}`)
    return
  }

  const bytes = await mdd.readRecord(resource.volume, resource.recordStart, resource.recordEnd)
  console.log('资源位置:', resource)
  console.log(`资源大小: ${bytes.length} bytes`)
  console.log(`资源文件名: ${basename(resourceKey)}`)
}

main().catch((error) => {
  console.error('测试失败:', error)
  process.exitCode = 1
})
