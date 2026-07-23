# dictol-mdict

Low-memory, read-only MDict v2 parser for Dictol.

Opening a file parses and retains only the header, key-block descriptors, and record-block descriptors. It does not retain keyword strings or record data.

```rust
use dictol_mdict::MdictFile;

let dictionary = MdictFile::open("dictionary.mdx")?;

for batch in dictionary.entry_batches(5_000) {
    for entry in batch? {
        println!("{}: {}..{}", entry.key_text, entry.location.start, entry.location.end);
    }
}
```

The iterator decompresses one key block at a time. `read_record` reads and decompresses only the record block or blocks intersecting the supplied logical record range.

Uploaded files are parsed with bounded decompression, fallible allocation, strict key decoding, per-block entry-count validation, and record-region bounds checks. `MdictFile::open_with_limits` accepts a customized `MdictLimits`; `MdictFile::open` uses conservative desktop defaults.

Current compatibility target:

- MDict v2;
- MDX and MDD;
- UTF-8 and UTF-16LE keys;
- uncompressed, LZO, and zlib blocks;
- encrypted key index (`Encrypted=2`);
- the OALDPE and LDOCE5 files under `Dictionaries/`.
