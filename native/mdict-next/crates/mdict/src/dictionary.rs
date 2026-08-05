use std::borrow::Cow;
use std::path::Path;

use crate::codec::decode_v2_block;
use crate::encoding::decode_lossy;
use crate::format::v2::comparison_key;
use crate::format::{self, Layout};
use crate::model::{
    FileKind, Header, KeyBlockInfo, KeyEntity, KeySectionInfo, OpenOptions, RecordBlockId,
    RecordBlockInfo, RecordEntry, RecordSectionInfo,
};
use crate::scanner::{KeyBatchIter, KeyIter, KeyScanner, RecordEntryIter, RecordEntryScanner};
use crate::source::MappedSource;
use crate::{Error, Result};

/// 已打开的 MDX/MDD 字典。
///
/// 实例只保存文件内存映射、头部和轻量级 block 描述表；key block 与 record block
/// 均在查询或遍历需要时才解压，因此不会把整部字典常驻内存。
#[derive(Debug)]
pub struct Mdict {
    /// 字典文件的只读内存映射。
    source: MappedSource,
    /// 根据扩展名识别的 MDX/MDD 文件类型。
    kind: FileKind,
    /// 格式无关的字典头部信息。
    header: Header,
    /// 当前格式版本对应的磁盘布局。
    layout: Layout,
    /// Key Block 的比较边界是否满足二分查找所需的单调性。
    ///
    /// 正常 MDict 文件应当满足该条件；不满足时仍保留线性候选扫描，
    /// 避免把非标准文件交给二分查找而漏掉 block。
    key_blocks_binary_searchable: bool,
    /// 打开文件时固定下来的资源限制等选项。
    options: OpenOptions,
}

impl Mdict {
    /// 使用默认选项打开一个 `.mdx` 或 `.mdd` 文件。
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        Self::open_with_options(path, OpenOptions::default())
    }

    /// 使用指定选项打开字典并解析头部与 block 描述表。
    ///
    /// 此操作创建只读内存映射，但不会预先解压全部词条或记录正文。
    pub fn open_with_options(path: impl AsRef<Path>, options: OpenOptions) -> Result<Self> {
        let path = path.as_ref();
        // 扩展名决定文件语义；实际格式版本随后从 Header XML 中读取。
        let kind = match path.extension().and_then(|extension| extension.to_str()) {
            Some(extension) if extension.eq_ignore_ascii_case("mdx") => FileKind::Mdx,
            Some(extension) if extension.eq_ignore_ascii_case("mdd") => FileKind::Mdd,
            _ => return Err(Error::Unsupported("expected an .mdx or .mdd file".into())),
        };
        // 打开阶段只解析索引元数据，正文 block 仍保留在内存映射中等待按需读取。
        let source = MappedSource::open(path)?;
        let opened = format::open(&source, kind, options.limits)?;
        let key_blocks_binary_searchable = {
            let blocks = &opened.layout.v2().key_blocks;
            blocks.windows(2).all(|pair| {
                pair[0].comparison_first_key <= pair[1].comparison_first_key
                    && pair[0].comparison_last_key <= pair[1].comparison_last_key
            })
        };
        Ok(Self {
            source,
            kind,
            header: opened.header,
            layout: opened.layout,
            key_blocks_binary_searchable,
            options,
        })
    }

    /// 返回当前字典文件的原始路径。
    pub fn path(&self) -> &Path {
        self.source.path()
    }

    /// 返回内存映射覆盖的文件总字节数。
    pub fn mapped_file_size(&self) -> u64 {
        self.source.len()
    }

    /// 返回该文件是正文词典 MDX 还是资源包 MDD。
    pub fn kind(&self) -> FileKind {
        self.kind
    }

    /// 返回解析后的字典头部。
    pub fn header(&self) -> &Header {
        &self.header
    }

    /// 返回 key section 的区段总览。
    pub fn key_section(&self) -> &KeySectionInfo {
        &self.layout.v2().key_section
    }

    /// 返回所有 key block 的轻量级描述表。
    pub fn key_blocks(&self) -> &[KeyBlockInfo] {
        &self.layout.v2().key_blocks
    }

    /// 返回 record section 的区段总览。
    pub fn record_section(&self) -> &RecordSectionInfo {
        &self.layout.v2().record_section
    }

    /// 返回所有 record block 的轻量级描述表。
    pub fn record_blocks(&self) -> &[RecordBlockInfo] {
        &self.layout.v2().record_blocks
    }

    /// 创建一个只解析 key 和 record 范围的索引扫描器。
    pub fn key_scanner(&self) -> KeyScanner {
        KeyScanner::new()
    }

    /// 按字典原始顺序流式遍历 key 和 record 范围。
    pub fn keys(&self) -> KeyIter<'_> {
        KeyIter {
            dictionary: self,
            scanner: self.key_scanner(),
        }
    }

    /// 按批次流式遍历 key 和 record 范围，适合导入外部数据库。
    pub fn keys_in_batch(&self, batch_size: usize) -> KeyBatchIter<'_> {
        KeyBatchIter {
            keys: self.keys(),
            batch_size: batch_size.max(1),
        }
    }

    /// 按字典原始顺序流式读取 key 与对应的 record 内容。
    ///
    /// 该迭代器维护单调前进的 Record Block 游标，避免为每个词条重复二分查找
    /// Record Block；每次只保留当前需要的解压块。
    pub fn entries(&self) -> RecordEntryIter<'_> {
        RecordEntryIter {
            dictionary: self,
            scanner: RecordEntryScanner::new(),
        }
    }

    /// 查找 key 并返回其 `KeyEntity`，不读取对应的 record 正文。
    ///
    /// 查找先利用 key block 的首尾比较 key 排除无关数据块，再按需解压候选块。
    /// 存在规范化后同名的 key 时，优先返回大小写也匹配的词条。
    pub fn find_key(&self, key: &str) -> Result<Option<KeyEntity>> {
        let comparison = comparison_key(&self.header, key);
        let case_comparison = self.case_comparison_key(key);
        let mut normalized_match: Option<KeyEntity> = None;
        let blocks = self.key_blocks();
        // 比较边界单调时，先定位到第一个 `last_key >= comparison` 的 block。
        // StripKey 或重复 key 可能让多个相邻 block 的范围重叠，因此不能只扫描这一个 block。
        let candidate_start = if self.key_blocks_binary_searchable {
            blocks.partition_point(|block| block.comparison_last_key < comparison)
        } else {
            // 非标准文件不满足二分前提时，回退到原有的全表线性扫描。
            0
        };
        for (block_index, block) in blocks.iter().enumerate().skip(candidate_start) {
            // 在单调模式下，后续 block 的 first key 也已经超过目标，可以停止向后扫描。
            if self.key_blocks_binary_searchable && comparison < block.comparison_first_key {
                break;
            }
            if comparison < block.comparison_first_key || comparison > block.comparison_last_key {
                continue;
            }
            let mut scanner = KeyScanner::starting_at(block_index);
            // 候选块内部仍需逐条比较；完全符合大小写规则的结果立即返回。
            for _ in 0..block.entry_count {
                let entity = scanner.next_key(self)?.ok_or_else(|| {
                    Error::invalid(
                        block.source.start,
                        format!("key block {block_index} ended before its declared entries"),
                    )
                })?;
                if comparison_key(&self.header, &entity.key) == comparison {
                    if self.case_comparison_key(&entity.key) == case_comparison {
                        return Ok(Some(entity));
                    }
                    normalized_match.get_or_insert(entity);
                }
            }
        }
        Ok(normalized_match)
    }

    /// 查找所有规范化后以 `prefix` 开头的 key，并返回其 record 逻辑范围。
    ///
    /// 当 Key Block 的比较边界满足单调性时，先二分定位第一个可能包含前缀的
    /// block；非标准文件则从第一个 block 开始扫描。每个候选 block 按需解压，
    /// 逐条比较 key，返回值保留原始 key 文本。
    pub fn prefix(&self, prefix: &str) -> Result<Vec<KeyEntity>> {
        let comparison = comparison_key(&self.header, prefix);
        let blocks = self.key_blocks();
        let candidate_start = if self.key_blocks_binary_searchable {
            blocks.partition_point(|block| block.comparison_last_key < comparison)
        } else {
            0
        };
        let mut matches = Vec::new();
        for (block_index, block) in blocks.iter().enumerate().skip(candidate_start) {
            if self.key_blocks_binary_searchable && !comparison.is_empty() {
                if comparison < block.comparison_first_key {
                    break;
                }
                if comparison > block.comparison_last_key {
                    continue;
                }
            }
            let mut scanner = KeyScanner::starting_at(block_index);
            for _ in 0..block.entry_count {
                let entity = scanner.next_key(self)?.ok_or_else(|| {
                    Error::invalid(
                        block.source.start,
                        format!("key block {block_index} ended before its declared entries"),
                    )
                })?;
                if comparison_key(&self.header, &entity.key).starts_with(&comparison) {
                    matches.push(entity);
                }
            }
        }
        Ok(matches)
    }

    /// 读取并解压指定序号的 key block。
    pub(crate) fn read_key_block(&self, key_block_index: usize) -> Result<Cow<'_, [u8]>> {
        let block = self.key_blocks().get(key_block_index).ok_or_else(|| {
            Error::invalid(
                0,
                format!("key block index {key_block_index} is out of range"),
            )
        })?;
        let source = self.source.slice(block.source.start, block.source.end)?;
        decode_v2_block(
            source,
            block.source.start,
            block.decompressed_size,
            self.options.limits.maximum_block_decompressed_size,
        )
    }

    /// 在按逻辑起点排序的 record block 表中定位包含 `offset` 的数据块。
    ///
    /// `allow_end` 仅用于空区间，允许总逻辑长度这个右开边界映射到最后一块。
    pub(crate) fn record_block_for_offset(
        &self,
        offset: u64,
        allow_end: bool,
    ) -> Result<RecordBlockId> {
        if allow_end && offset == self.record_section().total_decompressed_size {
            return self
                .record_blocks()
                .last()
                .map(|block| block.id)
                .ok_or_else(|| Error::invalid(offset, "dictionary has no record blocks"));
        }
        // partition_point 找到最后一个起点不大于 offset 的候选块，查找复杂度为 O(log n)。
        let index = self
            .record_blocks()
            .partition_point(|block| block.decompressed.start <= offset)
            .saturating_sub(1);
        self.record_blocks()
            .get(index)
            .filter(|block| offset < block.decompressed.end)
            .map(|block| block.id)
            .ok_or_else(|| Error::invalid(offset, "offset is outside every record block"))
    }

    /// 读取并解压一个 record block。
    pub(crate) fn decode_record_block(&self, block: &RecordBlockInfo) -> Result<Cow<'_, [u8]>> {
        let source = self.source.slice(block.source.start, block.source.end)?;
        decode_v2_block(
            source,
            block.source.start,
            block.decompressed.len(),
            self.options.limits.maximum_block_decompressed_size,
        )
    }

    /// 根据 record 在解压后连续逻辑地址空间中的范围读取原始字节。
    ///
    /// 当词条解释横跨多个 record block 时，会逐块解压、截取并拼接所需片段。
    pub fn read_record(&self, record_start: u64, record_end: u64) -> Result<Vec<u8>> {
        if record_end < record_start || record_end > self.record_section().total_decompressed_size {
            return Err(Error::invalid(record_start, "invalid logical record range"));
        }
        let record_size = record_end - record_start;
        if record_size > self.options.limits.maximum_record_size {
            return Err(Error::LimitExceeded(format!(
                "record size {record_size} exceeds {}",
                self.options.limits.maximum_record_size
            )));
        }
        let capacity = usize::try_from(record_size)
            .map_err(|_| Error::LimitExceeded("record size exceeds this platform".into()))?;
        let mut output = Vec::new();
        output.try_reserve_exact(capacity).map_err(|error| {
            Error::LimitExceeded(format!("cannot allocate record output: {error}"))
        })?;

        // record offset 属于“全部 record block 解压并串联”后的连续逻辑地址空间。
        // 每轮定位一个覆盖当前偏移的 block，只复制与目标区间相交的部分。
        let mut logical_offset = record_start;
        while logical_offset < record_end {
            let block_index = self.record_block_for_offset(logical_offset, false)?.0 as usize;
            let block = &self.record_blocks()[block_index];
            let decoded = self.decode_record_block(block)?;
            let logical_end = record_end.min(block.decompressed.end);
            let local_start = usize::try_from(logical_offset - block.decompressed.start)
                .map_err(|_| Error::invalid(logical_offset, "local record offset is too large"))?;
            let local_end = usize::try_from(logical_end - block.decompressed.start)
                .map_err(|_| Error::invalid(logical_end, "local record offset is too large"))?;
            output.extend_from_slice(&decoded[local_start..local_end]);
            logical_offset = logical_end;
        }
        Ok(output)
    }

    /// 查找 key，并读取其完整 record 原始字节。
    pub fn lookup(&self, key: &str) -> Result<Option<RecordEntry>> {
        let Some(entity) = self.find_key(key)? else {
            return Ok(None);
        };
        let record = self.read_record(entity.record_start, entity.record_end)?;
        Ok(Some(RecordEntry {
            key: entity.key,
            record,
        }))
    }

    /// 按 Header 声明的编码容错解码 record 字节。
    ///
    /// 该方法适用于 MDX 文本正文；MDD 的资源数据通常是二进制，不应作为文本解码。
    pub fn decode_record_lossy(&self, bytes: &[u8]) -> String {
        decode_lossy(bytes, &self.header.encoding)
    }

    pub(crate) fn maximum_key_size(&self) -> u64 {
        self.options.limits.maximum_key_size
    }

    pub(crate) fn maximum_record_size(&self) -> u64 {
        self.options.limits.maximum_record_size
    }

    /// 生成仅应用大小写规则、不应用 StripKey 规则的比较值。
    fn case_comparison_key(&self, key: &str) -> String {
        if self.header.key_case_sensitive {
            key.to_string()
        } else {
            key.to_lowercase()
        }
    }
}
