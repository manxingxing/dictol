use std::cmp::Ordering;
use std::sync::Arc;

use crate::encoding::decode_strict;
use crate::mdict::Mdict;
use crate::model::{Entry, Key};
use crate::record::SequentialRecordCursor;
use crate::{Error, Result};

#[derive(Debug)]
struct PendingKey {
    text: String,
    record_start: u64,
    block_index: usize,
}

/// Stateful key-block scanner shared by public iterators, queries and bindings.
#[derive(Debug)]
pub struct KeyScanner {
    next_block: usize,
    current_block_index: usize,
    decoded: Arc<[u8]>,
    cursor: usize,
    remaining: u64,
    pending: Option<PendingKey>,
    finished: bool,
    cache_blocks: bool,
    output_end_block: Option<usize>,
}

impl KeyScanner {
    /// 创建从第一个 Key Block 开始的顺序扫描器。
    pub fn new() -> Self {
        Self::sequential(0)
    }

    /// 按批量读取 key，便于 Node-API 等跨语言调用方降低通信次数。
    pub fn next_batch(&mut self, dictionary: &Mdict, limit: usize) -> Result<Vec<Key>> {
        if limit == 0 {
            return Err(Error::invalid(
                dictionary.path(),
                0,
                "key scanner batch size must be greater than zero",
            ));
        }
        let mut keys = Vec::with_capacity(limit);
        while keys.len() < limit {
            let Some(key) = self.next_key(dictionary)? else {
                break;
            };
            keys.push(key);
        }
        Ok(keys)
    }

    /// 返回扫描器是否已经遍历完可见的 Key Block。
    pub fn is_finished(&self) -> bool {
        self.finished
    }

    /// 从指定 Key Block 建立不污染随机 LRU 的顺序扫描状态。
    pub(crate) fn sequential(first_block: usize) -> Self {
        Self::with_config(first_block, false, None)
    }

    /// 在指定 block 范围内建立使用随机查询 LRU 的扫描状态。
    pub(crate) fn random_range(first_block: usize, end_block: usize) -> Self {
        Self::with_config(first_block, true, Some(end_block))
    }

    /// 创建带明确缓存策略和可选输出 block 上界的内部扫描状态。
    fn with_config(
        first_block: usize,
        cache_blocks: bool,
        output_end_block: Option<usize>,
    ) -> Self {
        let finished = output_end_block.is_some_and(|end| first_block >= end);
        Self {
            next_block: first_block,
            current_block_index: first_block,
            decoded: Arc::from([]),
            cursor: 0,
            remaining: 0,
            pending: None,
            finished,
            cache_blocks,
            output_end_block,
        }
    }

    /// 返回下一条带完整 record 范围的 key。
    pub(crate) fn next_key(&mut self, dictionary: &Mdict) -> Result<Option<Key>> {
        if self.finished {
            return Ok(None);
        }
        if self.pending.is_none() {
            self.pending = self.read_raw(dictionary)?;
            if self.pending.is_none() {
                self.finished = true;
                return Ok(None);
            }
        }
        if self
            .pending
            .as_ref()
            .zip(self.output_end_block)
            .is_some_and(|(pending, end)| pending.block_index >= end)
        {
            self.pending = None;
            self.finished = true;
            return Ok(None);
        }
        let next = self.read_raw(dictionary)?;
        let current = self.pending.take().expect("pending key initialized");
        let record_end = next
            .as_ref()
            .map(|item| item.record_start)
            .unwrap_or(dictionary.record_directory.total_decoded_size);
        self.pending = next;
        if self.pending.is_none() {
            self.finished = true;
        }
        if record_end < current.record_start {
            return Err(Error::invalid(
                dictionary.path(),
                current.record_start,
                "record offsets are not monotonic",
            ));
        }
        Ok(Some(Key {
            text: current.text,
            record_start: current.record_start,
            record_end,
        }))
    }

    /// 读取尚未通过 lookahead 确定 record_end 的原始 key。
    fn read_raw(&mut self, dictionary: &Mdict) -> Result<Option<PendingKey>> {
        loop {
            if self.remaining != 0 {
                let item = self.parse_one(dictionary)?;
                self.remaining -= 1;
                if self.remaining == 0 && self.cursor != self.decoded.len() {
                    return Err(Error::invalid(
                        dictionary.path(),
                        dictionary.key_blocks()[self.current_block_index]
                            .source
                            .start as u64,
                        format!(
                            "key block has {} trailing bytes",
                            self.decoded.len() - self.cursor
                        ),
                    ));
                }
                return Ok(Some(item));
            }
            if self.next_block >= dictionary.key_blocks().len() {
                return Ok(None);
            }
            self.current_block_index = self.next_block;
            let descriptor = &dictionary.key_blocks()[self.next_block];
            self.remaining = descriptor.entry_count;
            self.decoded = dictionary.decode_key_block(self.next_block, self.cache_blocks)?;
            self.cursor = 0;
            self.next_block += 1;
            if self.remaining != 0 && self.decoded.is_empty() {
                return Err(Error::invalid(
                    dictionary.path(),
                    descriptor.source.start as u64,
                    "non-empty key block decoded to no bytes",
                ));
            }
        }
    }

    /// 从当前已解压 Key Block 解析一个 offset 与零结尾 key。
    fn parse_one(&mut self, dictionary: &Mdict) -> Result<PendingKey> {
        let descriptor = &dictionary.key_blocks()[self.current_block_index];
        let offset_width = dictionary.key_directory.offset_width;
        let offset_end = self.cursor.checked_add(offset_width).ok_or_else(|| {
            Error::invalid(
                dictionary.path(),
                descriptor.source.start as u64,
                "key offset overflows",
            )
        })?;
        if offset_end > self.decoded.len() {
            return Err(Error::invalid(
                dictionary.path(),
                descriptor.source.start as u64,
                "key block ends inside a record offset",
            ));
        }
        let record_start = if offset_width == 4 {
            u64::from(u32::from_be_bytes(
                self.decoded[self.cursor..offset_end].try_into().unwrap(),
            ))
        } else {
            u64::from_be_bytes(self.decoded[self.cursor..offset_end].try_into().unwrap())
        };
        self.cursor = offset_end;
        let width = dictionary.header.unit_width;
        let key_end = find_terminator(&self.decoded, self.cursor, width).ok_or_else(|| {
            Error::invalid(
                dictionary.path(),
                descriptor.source.start as u64,
                "unterminated key in key block",
            )
        })?;
        let text = decode_strict(
            &self.decoded[self.cursor..key_end],
            &dictionary.header.encoding,
            descriptor.source.start as u64,
        )?;
        self.cursor = key_end + width;
        Ok(PendingKey {
            text,
            record_start,
            block_index: self.current_block_index,
        })
    }
}

impl Default for KeyScanner {
    /// 创建从第一个 Key Block 开始的默认顺序扫描器。
    fn default() -> Self {
        Self::new()
    }
}

/// 按编码单元宽度查找 key 的零终止符。
fn find_terminator(bytes: &[u8], start: usize, width: usize) -> Option<usize> {
    if width == 1 {
        bytes[start..]
            .iter()
            .position(|byte| *byte == 0)
            .map(|position| start + position)
    } else {
        let mut position = start;
        while position + 1 < bytes.len() {
            if bytes[position] == 0 && bytes[position + 1] == 0 {
                return Some(position);
            }
            position += 2;
        }
        None
    }
}

/// Iterator over keys in physical dictionary order.
pub struct Keys<'a> {
    pub(crate) dictionary: &'a Mdict,
    pub(crate) scanner: KeyScanner,
    pub(crate) finished: bool,
}

impl Iterator for Keys<'_> {
    type Item = Result<Key>;

    /// 推进 KeyScanner 并将错误保留在迭代器项目中。
    fn next(&mut self) -> Option<Self::Item> {
        if self.finished {
            return None;
        }
        match self.scanner.next_key(self.dictionary) {
            Ok(Some(key)) => Some(Ok(key)),
            Ok(None) => {
                self.finished = true;
                None
            }
            Err(error) => {
                self.finished = true;
                Some(Err(error))
            }
        }
    }
}

/// Streaming prefix result iterator.
pub struct Prefix<'a> {
    dictionary: &'a Mdict,
    scanner: KeyScanner,
    prefix: String,
    finished: bool,
}

impl<'a> Prefix<'a> {
    /// 创建前缀迭代器，并记录是否可以在首次“大于”时提前停止。
    pub(crate) fn new(dictionary: &'a Mdict, scanner: KeyScanner, prefix: String) -> Self {
        Self {
            dictionary,
            scanner,
            prefix,
            finished: false,
        }
    }
}

impl Iterator for Prefix<'_> {
    type Item = Result<Key>;

    /// 跳过较小 key、产出匹配项，并在单调目录中及时结束。
    fn next(&mut self) -> Option<Self::Item> {
        if self.finished {
            return None;
        }
        loop {
            let candidate = match self.scanner.next_key(self.dictionary) {
                Ok(Some(candidate)) => candidate,
                Ok(None) => {
                    self.finished = true;
                    return None;
                }
                Err(error) => {
                    self.finished = true;
                    return Some(Err(error));
                }
            };
            match self
                .dictionary
                .comparison
                .prefix_compare(&candidate.text, &self.prefix)
            {
                Ordering::Less => continue,
                Ordering::Equal => return Some(Ok(candidate)),
                Ordering::Greater => continue,
            }
        }
    }
}

/// Iterator over keys and raw records in physical dictionary order.
pub struct Entries<'a> {
    dictionary: &'a Mdict,
    keys: KeyScanner,
    records: SequentialRecordCursor,
    finished: bool,
}

impl<'a> Entries<'a> {
    /// 组合 KeyScanner 与不接入 LRU 的顺序 Record 游标。
    pub(crate) fn new(dictionary: &'a Mdict) -> Self {
        Self {
            dictionary,
            keys: KeyScanner::sequential(0),
            records: SequentialRecordCursor::default(),
            finished: false,
        }
    }
}

impl Iterator for Entries<'_> {
    type Item = Result<Entry>;

    /// 读取下一条 key，并由顺序游标取得其完整原始 record。
    fn next(&mut self) -> Option<Self::Item> {
        if self.finished {
            return None;
        }
        let key = match self.keys.next_key(self.dictionary) {
            Ok(Some(key)) => key,
            Ok(None) => {
                self.finished = true;
                return None;
            }
            Err(error) => {
                self.finished = true;
                return Some(Err(error));
            }
        };
        match self
            .records
            .read(self.dictionary, key.record_start, key.record_end)
        {
            Ok(data) => Some(Ok(Entry {
                key: key.text,
                data,
            })),
            Err(error) => {
                self.finished = true;
                Some(Err(error))
            }
        }
    }
}
