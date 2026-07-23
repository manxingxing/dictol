use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use crate::compression::decompress_block;
use crate::crypto::decrypt_key_index;
use crate::encoding::{decode, decode_strict, terminator_width};
use crate::header::{self, FileKind, Header};
use crate::{Error, Result};

#[derive(Debug, Clone)]
pub struct KeySection {
    pub block_count: u64,
    pub entry_count: u64,
    pub index_decompressed_size: u64,
    pub index_compressed_size: u64,
    pub blocks_compressed_size: u64,
    pub blocks_start_offset: u64,
}

#[derive(Debug, Clone)]
pub struct KeyBlock {
    pub index: u32,
    pub first_key: String,
    pub last_key: String,
    comparison_first_key: String,
    comparison_last_key: String,
    pub file_offset: u64,
    pub compressed_size: u64,
    pub decompressed_size: u64,
    pub entry_count: u64,
}

#[derive(Debug, Clone)]
pub struct RecordSection {
    pub block_count: u64,
    pub entry_count: u64,
    pub index_size: u64,
    pub blocks_compressed_size: u64,
    pub blocks_start_offset: u64,
    pub total_decompressed_size: u64,
}

#[derive(Debug, Clone)]
pub struct RecordBlock {
    pub index: u32,
    pub file_offset: u64,
    pub compressed_size: u64,
    pub decompressed_size: u64,
    pub decompressed_start: u64,
}

impl RecordBlock {
    pub fn decompressed_end(&self) -> u64 {
        self.decompressed_start + self.decompressed_size
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RecordLocation {
    pub start: u64,
    pub end: u64,
    pub first_record_block: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Entry {
    pub key_text: String,
    pub key_block: u32,
    pub location: RecordLocation,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LookupResult {
    pub entry: Entry,
    pub record: Vec<u8>,
}

#[derive(Debug, Clone, Copy)]
pub struct MdictLimits {
    pub maximum_header_size: u64,
    pub maximum_index_compressed_size: u64,
    pub maximum_index_decompressed_size: u64,
    pub maximum_block_compressed_size: u64,
    pub maximum_block_decompressed_size: u64,
    pub maximum_key_text_size: u64,
    pub maximum_record_size: u64,
    pub maximum_block_count: u64,
}

impl Default for MdictLimits {
    fn default() -> Self {
        Self {
            maximum_header_size: 16 * 1024 * 1024,
            maximum_index_compressed_size: 128 * 1024 * 1024,
            maximum_index_decompressed_size: 256 * 1024 * 1024,
            maximum_block_compressed_size: 256 * 1024 * 1024,
            maximum_block_decompressed_size: 256 * 1024 * 1024,
            maximum_key_text_size: 1024 * 1024,
            maximum_record_size: 256 * 1024 * 1024,
            maximum_block_count: 1_000_000,
        }
    }
}

#[derive(Debug)]
struct Source {
    file: Mutex<File>,
    len: u64,
}

impl Source {
    fn open(path: &Path) -> Result<Self> {
        let file = File::open(path)?;
        let len = file.metadata()?.len();
        Ok(Self {
            file: Mutex::new(file),
            len,
        })
    }

    fn read(&self, offset: u64, size: u64) -> Result<Vec<u8>> {
        let end = offset.checked_add(size).ok_or_else(|| {
            Error::InvalidFormat(format!("file range overflows: {offset}+{size}"))
        })?;
        if end > self.len {
            return Err(Error::InvalidFormat(format!(
                "file range {offset}..{end} exceeds file size {}",
                self.len
            )));
        }

        let size = usize::try_from(size).map_err(|_| {
            Error::LimitExceeded("requested range is too large for this platform".into())
        })?;
        let mut bytes = Vec::new();
        bytes.try_reserve_exact(size).map_err(|error| {
            Error::LimitExceeded(format!("cannot allocate {size}-byte file buffer: {error}"))
        })?;
        bytes.resize(size, 0);
        let mut file = self
            .file
            .lock()
            .map_err(|_| Error::InvalidFormat("dictionary file lock is poisoned".into()))?;
        file.seek(SeekFrom::Start(offset))?;
        file.read_exact(&mut bytes)?;
        Ok(bytes)
    }
}

#[derive(Debug)]
pub struct MdictFile {
    path: PathBuf,
    source: Source,
    kind: FileKind,
    header: Header,
    key_section: KeySection,
    key_blocks: Vec<KeyBlock>,
    record_section: RecordSection,
    record_blocks: Vec<RecordBlock>,
    limits: MdictLimits,
}

impl MdictFile {
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        Self::open_with_limits(path, MdictLimits::default())
    }

    pub fn open_with_limits(path: impl AsRef<Path>, limits: MdictLimits) -> Result<Self> {
        let path = path.as_ref().to_path_buf();
        let kind = match path.extension().and_then(|extension| extension.to_str()) {
            Some(extension) if extension.eq_ignore_ascii_case("mdx") => FileKind::Mdx,
            Some(extension) if extension.eq_ignore_ascii_case("mdd") => FileKind::Mdd,
            _ => return Err(Error::Unsupported("expected an .mdx or .mdd file".into())),
        };
        let source = Source::open(&path)?;

        let header_length_bytes = source.read(0, 4)?;
        let header_length = u32::from_be_bytes(header_length_bytes.try_into().unwrap()) as u64;
        enforce_limit("header size", header_length, limits.maximum_header_size)?;
        let header_bytes = source.read(4, header_length)?;
        let checksum_offset = 4 + header_length;
        let checksum_bytes = source.read(checksum_offset, 4)?.try_into().unwrap();
        let header = header::parse(&header_bytes, checksum_bytes, kind)?;

        let key_header_offset = checksum_offset + 4;
        let key_header_bytes = source.read(key_header_offset, 44)?;
        let key_header_values = parse_five_u64(&key_header_bytes[..40]);
        let key_header_checksum = u32::from_be_bytes(key_header_bytes[40..44].try_into().unwrap());
        let actual_key_header_checksum = adler2::adler32_slice(&key_header_bytes[..40]);
        if key_header_checksum != actual_key_header_checksum {
            return Err(Error::InvalidFormat(format!(
                "key header checksum mismatch: expected 0x{key_header_checksum:08x}, got 0x{actual_key_header_checksum:08x}"
            )));
        }

        let [
            key_block_count,
            entry_count,
            key_index_decompressed_size,
            key_index_compressed_size,
            key_blocks_compressed_size,
        ] = key_header_values;
        enforce_limit(
            "key index compressed size",
            key_index_compressed_size,
            limits.maximum_index_compressed_size,
        )?;
        enforce_limit(
            "key index decompressed size",
            key_index_decompressed_size,
            limits.maximum_index_decompressed_size,
        )?;
        enforce_limit(
            "key block count",
            key_block_count,
            limits.maximum_block_count,
        )?;
        let key_index_offset = key_header_offset + 44;
        let mut key_index_block = source.read(key_index_offset, key_index_compressed_size)?;
        if header.encrypted & 2 != 0 {
            key_index_block = decrypt_key_index(&key_index_block)
                .ok_or_else(|| Error::InvalidFormat("encrypted key index is truncated".into()))?;
        }
        let key_index = decompress_block(
            &key_index_block,
            key_index_decompressed_size,
            limits.maximum_index_decompressed_size,
        )?;
        let mut key_blocks = parse_key_blocks(&key_index, key_block_count, &header.encoding)?;
        for block in &mut key_blocks {
            block.comparison_first_key = comparison_key(&header, &block.first_key);
            block.comparison_last_key = comparison_key(&header, &block.last_key);
        }
        let key_blocks_start_offset = key_index_offset + key_index_compressed_size;
        let mut next_key_block_offset = key_blocks_start_offset;
        for block in &mut key_blocks {
            enforce_limit(
                "key block compressed size",
                block.compressed_size,
                limits.maximum_block_compressed_size,
            )?;
            enforce_limit(
                "key block decompressed size",
                block.decompressed_size,
                limits.maximum_block_decompressed_size,
            )?;
            block.file_offset = next_key_block_offset;
            next_key_block_offset = next_key_block_offset
                .checked_add(block.compressed_size)
                .ok_or_else(|| Error::InvalidFormat("key block offset overflow".into()))?;
        }
        if next_key_block_offset - key_blocks_start_offset != key_blocks_compressed_size {
            return Err(Error::InvalidFormat(
                "key block compressed sizes do not match key header".into(),
            ));
        }
        let indexed_entry_count = key_blocks.iter().try_fold(0_u64, |total, block| {
            total
                .checked_add(block.entry_count)
                .ok_or_else(|| Error::InvalidFormat("key entry count overflow".into()))
        })?;
        if indexed_entry_count != entry_count {
            return Err(Error::InvalidFormat(format!(
                "key index describes {indexed_entry_count} entries, header declares {entry_count}"
            )));
        }

        let record_header_offset = next_key_block_offset;
        let record_header_bytes = source.read(record_header_offset, 32)?;
        let [
            record_block_count,
            record_entry_count,
            record_index_size,
            record_blocks_compressed_size,
        ] = parse_four_u64(&record_header_bytes);
        enforce_limit(
            "record block count",
            record_block_count,
            limits.maximum_block_count,
        )?;
        enforce_limit(
            "record index size",
            record_index_size,
            limits.maximum_index_compressed_size,
        )?;
        if record_entry_count != entry_count {
            return Err(Error::InvalidFormat(format!(
                "record header declares {record_entry_count} entries, key header declares {entry_count}"
            )));
        }
        let expected_record_index_size = record_block_count
            .checked_mul(16)
            .ok_or_else(|| Error::InvalidFormat("record index size overflow".into()))?;
        if record_index_size != expected_record_index_size {
            return Err(Error::InvalidFormat(format!(
                "record index size is {record_index_size}, expected {expected_record_index_size}"
            )));
        }

        let record_index_offset = record_header_offset + 32;
        let record_index_bytes = source.read(record_index_offset, record_index_size)?;
        let record_blocks_start_offset = record_index_offset + record_index_size;
        let record_blocks = parse_record_blocks(&record_index_bytes, record_blocks_start_offset)?;
        for block in &record_blocks {
            enforce_limit(
                "record block compressed size",
                block.compressed_size,
                limits.maximum_block_compressed_size,
            )?;
            enforce_limit(
                "record block decompressed size",
                block.decompressed_size,
                limits.maximum_block_decompressed_size,
            )?;
        }
        let indexed_compressed_size = record_blocks
            .iter()
            .map(|block| block.compressed_size)
            .sum::<u64>();
        if indexed_compressed_size != record_blocks_compressed_size {
            return Err(Error::InvalidFormat(format!(
                "record blocks total {indexed_compressed_size} bytes, header declares {record_blocks_compressed_size}"
            )));
        }
        let record_blocks_end = record_blocks_start_offset
            .checked_add(record_blocks_compressed_size)
            .ok_or_else(|| Error::InvalidFormat("record data end offset overflow".into()))?;
        if record_blocks_end > source.len {
            return Err(Error::InvalidFormat(format!(
                "record data ends at {record_blocks_end}, beyond file size {}",
                source.len
            )));
        }
        let total_decompressed_size = record_blocks
            .last()
            .map(RecordBlock::decompressed_end)
            .unwrap_or(0);

        Ok(Self {
            path,
            source,
            kind,
            header,
            key_section: KeySection {
                block_count: key_block_count,
                entry_count,
                index_decompressed_size: key_index_decompressed_size,
                index_compressed_size: key_index_compressed_size,
                blocks_compressed_size: key_blocks_compressed_size,
                blocks_start_offset: key_blocks_start_offset,
            },
            key_blocks,
            record_section: RecordSection {
                block_count: record_block_count,
                entry_count: record_entry_count,
                index_size: record_index_size,
                blocks_compressed_size: record_blocks_compressed_size,
                blocks_start_offset: record_blocks_start_offset,
                total_decompressed_size,
            },
            record_blocks,
            limits,
        })
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn kind(&self) -> FileKind {
        self.kind
    }

    pub fn header(&self) -> &Header {
        &self.header
    }

    pub fn key_section(&self) -> &KeySection {
        &self.key_section
    }

    pub fn key_blocks(&self) -> &[KeyBlock] {
        &self.key_blocks
    }

    pub fn record_section(&self) -> &RecordSection {
        &self.record_section
    }

    pub fn record_blocks(&self) -> &[RecordBlock] {
        &self.record_blocks
    }

    pub fn limits(&self) -> MdictLimits {
        self.limits
    }

    pub fn entries(&self) -> EntryIter<'_> {
        EntryIter::new(self)
    }

    pub fn entry_cursor(&self) -> EntryCursor {
        EntryCursor::new()
    }

    pub fn entry_batches(&self, batch_size: usize) -> EntryBatchIter<'_> {
        EntryBatchIter {
            entries: self.entries(),
            batch_size: batch_size.max(1),
        }
    }

    pub fn lookup_key_block_by_word(&self, word: &str) -> Result<Option<Entry>> {
        let comparison_word = comparison_key(&self.header, word);
        for (block_index, block) in self.key_blocks.iter().enumerate() {
            if comparison_word < block.comparison_first_key
                || comparison_word > block.comparison_last_key
            {
                continue;
            }

            let mut cursor = EntryCursor::starting_at_block(block_index);
            for _ in 0..block.entry_count {
                let entry = cursor.next_entry(self)?.ok_or_else(|| {
                    Error::InvalidFormat(format!(
                        "key block {block_index} ended before its declared entries"
                    ))
                })?;
                if comparison_key(&self.header, &entry.key_text) == comparison_word {
                    return Ok(Some(entry));
                }
            }
        }
        Ok(None)
    }

    pub fn lookup(&self, word: &str) -> Result<Option<LookupResult>> {
        let Some(entry) = self.lookup_key_block_by_word(word)? else {
            return Ok(None);
        };
        let record = self.read_record(&entry.location)?;
        Ok(Some(LookupResult { entry, record }))
    }

    pub fn read_record(&self, location: &RecordLocation) -> Result<Vec<u8>> {
        if location.end < location.start
            || location.end > self.record_section.total_decompressed_size
        {
            return Err(Error::InvalidFormat(format!(
                "invalid record range {}..{} (total decompressed size {})",
                location.start, location.end, self.record_section.total_decompressed_size
            )));
        }

        let record_size = location.end - location.start;
        enforce_limit("record size", record_size, self.limits.maximum_record_size)?;
        let record_size = usize::try_from(record_size)
            .map_err(|_| Error::LimitExceeded("record is too large for this platform".into()))?;
        let mut output = Vec::new();
        output.try_reserve_exact(record_size).map_err(|error| {
            Error::LimitExceeded(format!("cannot allocate record buffer: {error}"))
        })?;
        let mut logical_offset = location.start;
        while logical_offset < location.end {
            let block_index = self.record_block_for_offset(logical_offset)?;
            let block = &self.record_blocks[block_index];
            let compressed = self.source.read(block.file_offset, block.compressed_size)?;
            let decompressed = decompress_block(
                &compressed,
                block.decompressed_size,
                self.limits.maximum_block_decompressed_size,
            )?;
            let local_start = (logical_offset - block.decompressed_start) as usize;
            let logical_end = location.end.min(block.decompressed_end());
            let local_end = (logical_end - block.decompressed_start) as usize;
            output.extend_from_slice(&decompressed[local_start..local_end]);
            logical_offset = logical_end;
        }
        Ok(output)
    }

    pub fn decode_record(&self, bytes: &[u8]) -> String {
        decode(bytes, &self.header.encoding)
    }

    fn read_key_block(&self, block_index: usize) -> Result<Vec<u8>> {
        let block = self.key_blocks.get(block_index).ok_or_else(|| {
            Error::InvalidFormat(format!("key block index {block_index} is out of range"))
        })?;
        let compressed = self.source.read(block.file_offset, block.compressed_size)?;
        decompress_block(
            &compressed,
            block.decompressed_size,
            self.limits.maximum_block_decompressed_size,
        )
    }

    fn record_block_for_offset(&self, offset: u64) -> Result<usize> {
        let index = self
            .record_blocks
            .partition_point(|block| block.decompressed_start <= offset)
            .saturating_sub(1);
        self.record_blocks
            .get(index)
            .filter(|block| offset < block.decompressed_end())
            .map(|_| index)
            .ok_or_else(|| {
                Error::InvalidFormat(format!(
                    "record offset {offset} is outside all record blocks"
                ))
            })
    }
}

#[derive(Debug)]
struct PendingEntry {
    key_text: String,
    key_block: u32,
    record_start: u64,
}

pub struct EntryCursor {
    next_block: usize,
    current_block: Vec<u8>,
    current_block_index: u32,
    cursor: usize,
    current_block_entries_remaining: u64,
    pending: Option<PendingEntry>,
    finished: bool,
}

impl Default for EntryCursor {
    fn default() -> Self {
        Self::new()
    }
}

impl EntryCursor {
    pub fn new() -> Self {
        Self {
            next_block: 0,
            current_block: Vec::new(),
            current_block_index: 0,
            cursor: 0,
            current_block_entries_remaining: 0,
            pending: None,
            finished: false,
        }
    }

    fn starting_at_block(block_index: usize) -> Self {
        Self {
            next_block: block_index,
            ..Self::new()
        }
    }

    pub fn next_entry(&mut self, dictionary: &MdictFile) -> Result<Option<Entry>> {
        if self.finished {
            return Ok(None);
        }

        let result = self.next_entry_inner(dictionary);
        if result.is_err() {
            self.finished = true;
        }
        result
    }

    pub fn next_batch(&mut self, dictionary: &MdictFile, batch_size: usize) -> Result<Vec<Entry>> {
        let batch_size = batch_size.max(1);
        let mut batch = Vec::with_capacity(batch_size);
        while batch.len() < batch_size {
            match self.next_entry(dictionary)? {
                Some(entry) => batch.push(entry),
                None => break,
            }
        }
        Ok(batch)
    }

    pub fn is_finished(&self) -> bool {
        self.finished
    }

    fn next_entry_inner(&mut self, dictionary: &MdictFile) -> Result<Option<Entry>> {
        if self.pending.is_none() {
            match self.read_next_raw(dictionary)? {
                Some(entry) => self.pending = Some(entry),
                None => {
                    self.finished = true;
                    return Ok(None);
                }
            }
        }

        let next = self.read_next_raw(dictionary)?;
        let current = self.pending.take().unwrap();
        let record_end = next
            .as_ref()
            .map(|entry| entry.record_start)
            .unwrap_or(dictionary.record_section.total_decompressed_size);
        self.pending = next;
        if self.pending.is_none() {
            self.finished = true;
        }

        if record_end < current.record_start {
            return Err(Error::InvalidFormat(format!(
                "record offsets are not monotonic: {} follows {}",
                record_end, current.record_start
            )));
        }
        if record_end > dictionary.record_section.total_decompressed_size {
            return Err(Error::InvalidFormat(format!(
                "record end {record_end} exceeds total decompressed size {}",
                dictionary.record_section.total_decompressed_size
            )));
        }
        let first_record_block = dictionary.record_block_for_offset(current.record_start)? as u32;

        Ok(Some(Entry {
            key_text: current.key_text,
            key_block: current.key_block,
            location: RecordLocation {
                start: current.record_start,
                end: record_end,
                first_record_block,
            },
        }))
    }

    fn read_next_raw(&mut self, dictionary: &MdictFile) -> Result<Option<PendingEntry>> {
        loop {
            if self.current_block_entries_remaining > 0 {
                let entry = self.parse_entry(dictionary)?;
                self.current_block_entries_remaining -= 1;
                if self.current_block_entries_remaining == 0
                    && self.cursor != self.current_block.len()
                {
                    return Err(Error::InvalidFormat(format!(
                        "key block {} has {} trailing bytes after its declared entries",
                        self.current_block_index,
                        self.current_block.len() - self.cursor
                    )));
                }
                return Ok(Some(entry));
            }
            if self.cursor != self.current_block.len() {
                return Err(Error::InvalidFormat(format!(
                    "key block {} was not consumed exactly",
                    self.current_block_index
                )));
            }
            if self.next_block >= dictionary.key_blocks.len() {
                return Ok(None);
            }

            self.current_block_index = self.next_block as u32;
            self.current_block_entries_remaining =
                dictionary.key_blocks[self.next_block].entry_count;
            self.current_block = dictionary.read_key_block(self.next_block)?;
            self.next_block += 1;
            self.cursor = 0;
            if self.current_block.is_empty() && self.current_block_entries_remaining > 0 {
                return Err(Error::InvalidFormat(format!(
                    "key block {} decompressed to an empty buffer",
                    self.current_block_index
                )));
            }
        }
    }

    fn parse_entry(&mut self, dictionary: &MdictFile) -> Result<PendingEntry> {
        if self.current_block.len() - self.cursor < 8 {
            return Err(Error::InvalidFormat(format!(
                "key block {} ends inside a record offset",
                self.current_block_index
            )));
        }
        let record_start = u64::from_be_bytes(
            self.current_block[self.cursor..self.cursor + 8]
                .try_into()
                .unwrap(),
        );
        self.cursor += 8;

        let key_start = self.cursor;
        let width = terminator_width(&dictionary.header.encoding);
        let key_end = if width == 2 {
            let mut end = key_start;
            while end + 1 < self.current_block.len() && self.current_block[end..end + 2] != [0, 0] {
                end += 2;
            }
            if end + 1 >= self.current_block.len() {
                return Err(Error::InvalidFormat(format!(
                    "key block {} contains an unterminated UTF-16LE key",
                    self.current_block_index
                )));
            }
            end
        } else {
            self.current_block[key_start..]
                .iter()
                .position(|byte| *byte == 0)
                .map(|relative| key_start + relative)
                .ok_or_else(|| {
                    Error::InvalidFormat(format!(
                        "key block {} contains an unterminated key",
                        self.current_block_index
                    ))
                })?
        };
        enforce_limit(
            "key text byte length",
            (key_end - key_start) as u64,
            dictionary.limits.maximum_key_text_size,
        )?;
        let key_text = decode_strict(
            &self.current_block[key_start..key_end],
            &dictionary.header.encoding,
        )?;
        self.cursor = key_end + width;

        Ok(PendingEntry {
            key_text,
            key_block: self.current_block_index,
            record_start,
        })
    }
}

pub struct EntryIter<'a> {
    dictionary: &'a MdictFile,
    cursor: EntryCursor,
}

impl<'a> EntryIter<'a> {
    fn new(dictionary: &'a MdictFile) -> Self {
        Self {
            dictionary,
            cursor: EntryCursor::new(),
        }
    }
}

impl Iterator for EntryIter<'_> {
    type Item = Result<Entry>;

    fn next(&mut self) -> Option<Self::Item> {
        match self.cursor.next_entry(self.dictionary) {
            Ok(Some(entry)) => Some(Ok(entry)),
            Ok(None) => None,
            Err(error) => Some(Err(error)),
        }
    }
}

pub struct EntryBatchIter<'a> {
    entries: EntryIter<'a>,
    batch_size: usize,
}

impl Iterator for EntryBatchIter<'_> {
    type Item = Result<Vec<Entry>>;

    fn next(&mut self) -> Option<Self::Item> {
        let mut batch = Vec::with_capacity(self.batch_size);
        while batch.len() < self.batch_size {
            match self.entries.next() {
                Some(Ok(entry)) => batch.push(entry),
                Some(Err(error)) => return Some(Err(error)),
                None => break,
            }
        }
        (!batch.is_empty()).then_some(Ok(batch))
    }
}

fn parse_key_blocks(bytes: &[u8], block_count: u64, encoding: &str) -> Result<Vec<KeyBlock>> {
    let mut cursor = 0_usize;
    let width = terminator_width(encoding);
    let block_capacity = usize::try_from(block_count).map_err(|_| {
        Error::LimitExceeded("key block count is too large for this platform".into())
    })?;
    let mut blocks = Vec::new();
    blocks.try_reserve_exact(block_capacity).map_err(|error| {
        Error::LimitExceeded(format!("cannot allocate key block index: {error}"))
    })?;

    for index in 0..block_count {
        let entry_count = read_u64(bytes, &mut cursor, "key block entry count")?;
        let first_key = read_key_index_word(bytes, &mut cursor, width, encoding, "first")?;
        let last_key = read_key_index_word(bytes, &mut cursor, width, encoding, "last")?;
        let compressed_size = read_u64(bytes, &mut cursor, "key block compressed size")?;
        let decompressed_size = read_u64(bytes, &mut cursor, "key block decompressed size")?;
        blocks.push(KeyBlock {
            index: index as u32,
            first_key,
            last_key,
            comparison_first_key: String::new(),
            comparison_last_key: String::new(),
            file_offset: 0,
            compressed_size,
            decompressed_size,
            entry_count,
        });
    }

    if cursor != bytes.len() {
        return Err(Error::InvalidFormat(format!(
            "key index has {} unparsed bytes",
            bytes.len() - cursor
        )));
    }
    Ok(blocks)
}

fn comparison_key(header: &Header, key: &str) -> String {
    let stripped = if header.strip_key {
        key.chars()
            .filter(|character| {
                !matches!(
                    character,
                    '(' | ')'
                        | '.'
                        | ','
                        | '-'
                        | '&'
                        | '、'
                        | ' '
                        | '\''
                        | '/'
                        | '\\'
                        | '@'
                        | '_'
                        | '$'
                        | '!'
                )
            })
            .collect::<String>()
    } else {
        key.to_string()
    };
    if header.key_case_sensitive {
        stripped
    } else {
        stripped.to_lowercase()
    }
}

fn read_key_index_word(
    bytes: &[u8],
    cursor: &mut usize,
    width: usize,
    encoding: &str,
    label: &str,
) -> Result<String> {
    let length = read_u16(bytes, cursor, &format!("{label} key length"))? as usize;
    let byte_length = length
        .checked_mul(width)
        .ok_or_else(|| Error::InvalidFormat("key index word length overflow".into()))?;
    let word_end = cursor
        .checked_add(byte_length)
        .ok_or_else(|| Error::InvalidFormat("key index cursor overflow".into()))?;
    let end = word_end
        .checked_add(width)
        .ok_or_else(|| Error::InvalidFormat("key index cursor overflow".into()))?;
    if end > bytes.len() {
        return Err(Error::InvalidFormat(format!(
            "{label} key exceeds key index buffer"
        )));
    }
    if bytes[word_end..end].iter().any(|byte| *byte != 0) {
        return Err(Error::InvalidFormat(format!(
            "{label} key in key index has a non-zero terminator"
        )));
    }
    let word = decode_strict(&bytes[*cursor..word_end], encoding)?;
    *cursor = end;
    Ok(word)
}

fn parse_record_blocks(bytes: &[u8], blocks_start: u64) -> Result<Vec<RecordBlock>> {
    let mut cursor = 0_usize;
    let mut file_offset = blocks_start;
    let mut decompressed_start = 0_u64;
    let mut blocks = Vec::new();
    blocks
        .try_reserve_exact(bytes.len() / 16)
        .map_err(|error| {
            Error::LimitExceeded(format!("cannot allocate record block index: {error}"))
        })?;

    while cursor < bytes.len() {
        let compressed_size = read_u64(bytes, &mut cursor, "record block compressed size")?;
        let decompressed_size = read_u64(bytes, &mut cursor, "record block decompressed size")?;
        blocks.push(RecordBlock {
            index: blocks.len() as u32,
            file_offset,
            compressed_size,
            decompressed_size,
            decompressed_start,
        });
        file_offset = file_offset
            .checked_add(compressed_size)
            .ok_or_else(|| Error::InvalidFormat("record block file offset overflow".into()))?;
        decompressed_start = decompressed_start
            .checked_add(decompressed_size)
            .ok_or_else(|| Error::InvalidFormat("record block logical offset overflow".into()))?;
    }
    Ok(blocks)
}

fn enforce_limit(label: &str, actual: u64, maximum: u64) -> Result<()> {
    if actual > maximum {
        Err(Error::LimitExceeded(format!(
            "{label} {actual} exceeds configured maximum {maximum}"
        )))
    } else {
        Ok(())
    }
}

fn parse_five_u64(bytes: &[u8]) -> [u64; 5] {
    std::array::from_fn(|index| {
        u64::from_be_bytes(bytes[index * 8..index * 8 + 8].try_into().unwrap())
    })
}

fn parse_four_u64(bytes: &[u8]) -> [u64; 4] {
    std::array::from_fn(|index| {
        u64::from_be_bytes(bytes[index * 8..index * 8 + 8].try_into().unwrap())
    })
}

fn read_u64(bytes: &[u8], cursor: &mut usize, label: &str) -> Result<u64> {
    let end = *cursor + 8;
    let slice = bytes
        .get(*cursor..end)
        .ok_or_else(|| Error::InvalidFormat(format!("key index ends inside {label}")))?;
    *cursor = end;
    Ok(u64::from_be_bytes(slice.try_into().unwrap()))
}

fn read_u16(bytes: &[u8], cursor: &mut usize, label: &str) -> Result<u16> {
    let end = *cursor + 2;
    let slice = bytes
        .get(*cursor..end)
        .ok_or_else(|| Error::InvalidFormat(format!("key index ends inside {label}")))?;
    *cursor = end;
    Ok(u16::from_be_bytes(slice.try_into().unwrap()))
}
