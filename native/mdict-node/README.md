# @dictol/mdict-native

Node-API bindings for `dictol-mdict`. The binding is intended for the Electron main process; renderer access remains behind the existing Node IPC layer.

```js
const { MdictDictionary } = require('./index.js')

const dictionary = MdictDictionary.open('/path/to/dictionary.mdx')
console.log(dictionary.metadata)

const entry = await dictionary.lookupKeyBlockByWord('abandon')
// { keyText, keyBlock, recordStart, recordEnd, firstRecordBlock }

const result = await dictionary.lookup('abandon')
// { keyText: 'abandon', definition: '<html>…' }

const scanner = dictionary.createScanner()
while (true) {
  const batch = await scanner.nextBatch(2048)
  // Insert batch.entries into SQLite here.
  if (batch.done) break
}

const bytes = await dictionary.readRecord(recordStart, recordEnd)
```

`lookupKeyBlockByWord()` works for both MDX entries and MDD resource paths. `lookup()` matches js-mdict's MDX result shape and returns `{ keyText, definition: null }` when no entry exists. For MDD, locate the entry and pass its bigint offsets to `readRecord()` so binary data remains a `Buffer`.

All lookup and record reads run off the JavaScript thread. `recordStart` and `recordEnd` are JavaScript `bigint` values. Calling `nextBatch` concurrently on the same scanner is rejected; consume each batch before requesting the next one.
