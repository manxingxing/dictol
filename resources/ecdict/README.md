# ECDICT bundled lexicon

`ecdict.sqlite` is a generated, read-only application asset. It is intentionally
not part of the user-managed MDX/MDD dictionary system.

Build it from a pinned ECDICT checkout:

```sh
npm run ecdict:build -- \
  --csv /path/to/ECDICT/ecdict.csv \
  --lemma /path/to/ECDICT/lemma.en.txt \
  --output resources/ecdict/ecdict.sqlite \
  --profile balanced \
  --source-ref <upstream-commit>
```

The generated SQLite file stores the ECDICT entry data and reverse word-form
indexes from both `exchange` and `lemma.en.txt`. The accompanying MIT license
must ship with the resource.

`balanced` is the default. It keeps Oxford core words, exam-tagged words, and
entries with a contemporary-frequency rank up to 50,000. Use `--profile full`
only when the substantially larger complete ECDICT database is explicitly needed.
