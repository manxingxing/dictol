# @dictol/mdict-native

Node-API bindings for the new `dictol-mdict` parser in `native/mdict`. The binding is intended for the Electron main process; renderer access remains behind the existing Node IPC layer.

```js
const { Mdd, MddList, Mdx } = require('./index.js')

const dictionary = Mdx.open('/path/to/dictionary.mdx')
console.log(dictionary.metadata)

const entry = await dictionary.findKey('abandon')
// { keyText, recordStart, recordEnd }

const text = await dictionary.lookupText('abandon')
// '<html>…' (follows @@@LINK= redirects)

// 词典可把同一个 key 拆成多个连续 record，例如主词条和附图。
const entries = await dictionary.findKeys('abandon')
const texts = await dictionary.lookupAllText('abandon')
const suggestions = await dictionary.prefix('aban')

const textFromRange = await dictionary.readRecordText(entry.recordStart, entry.recordEnd, true)

const scanner = dictionary.keys()
while (true) {
  const batch = await scanner.nextBatch(2048)
  // Insert batch.entries into SQLite here.
  if (batch.done) break
}

// 也可以按单条记录异步遍历；不会一次性载入全部 key。
for await (const key of dictionary.keys()) {
  console.log(key.keyText)
}

const bytes = await dictionary.readRecord(entry.recordStart, entry.recordEnd)

const resourceFile = Mdd.open('/path/to/dictionary.mdd')
const resources = MddList.open(['/path/to/dictionary.mdd', '/path/to/dictionary.1.mdd'])
const resourceEntry = await resources.findKey('\\media\\icon.png')
const resourceBytes = resourceEntry
  ? await resources.readRecord(
      resourceEntry.volume,
      resourceEntry.recordStart,
      resourceEntry.recordEnd
    )
  : null
```

`Mdx` handles text definitions, `Mdd` handles one physical resource file, and `MddList` handles an explicitly ordered resource-file list. All three expose `keys()` and `entries()` batch scanners. `Mdx.findKey()` / `lookupText()` return the first match; `findKeys()` / `lookupAllText()` retain every exact match in MDX order. `Mdd.lookup()` and `MddList.lookup()` return binary resources. Only an `MddList` key location includes `volume`, because its offsets are relative to one file in the list.

All lookup and record reads run off the JavaScript thread. `recordStart` and `recordEnd` are JavaScript `bigint` values. Calling `nextBatch` concurrently on the same scanner is rejected; consume each batch before requesting the next one.

手动测试可以运行：

```bash
node native/mdict-node/examples/manual-test.mjs \\
  Dictionaries/oaldpe/oaldpe.mdx abandon \\
  Dictionaries/oaldpe/oaldpe.mdd \\
  Dictionaries/oaldpe/oaldpe.1.mdd
```
