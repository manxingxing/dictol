use crate::source::SourceSpan;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(crate) struct KeyBlockId(pub(crate) u32);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(crate) struct RecordBlockId(pub(crate) u32);

#[derive(Debug, Clone)]
pub(crate) enum BlockEnvelope {
    V2(crate::Version),
    V3,
}

#[derive(Debug, Clone)]
pub(crate) struct KeyBlock {
    pub(crate) id: KeyBlockId,
    pub(crate) entry_count: u64,
    pub(crate) first_key: String,
    pub(crate) last_key: String,
    pub(crate) comparison_first_key: String,
    pub(crate) comparison_last_key: String,
    pub(crate) source: SourceSpan,
    pub(crate) decoded_size: usize,
    pub(crate) envelope: BlockEnvelope,
}

#[derive(Debug, Clone)]
pub(crate) struct RecordBlock {
    pub(crate) id: RecordBlockId,
    pub(crate) source: SourceSpan,
    pub(crate) logical_start: u64,
    pub(crate) logical_end: u64,
    pub(crate) envelope: BlockEnvelope,
}

impl RecordBlock {
    /// 返回该 Record Block 解压后的预期字节数。
    pub(crate) fn decoded_size(&self) -> usize {
        usize::try_from(self.logical_end - self.logical_start)
            .expect("validated decoded record block size")
    }
}

#[derive(Debug)]
pub(crate) struct KeyDirectory {
    pub(crate) blocks: Vec<KeyBlock>,
    pub(crate) binary_searchable: bool,
    pub(crate) offset_width: usize,
}

#[derive(Debug)]
pub(crate) struct RecordDirectory {
    pub(crate) blocks: Vec<RecordBlock>,
    pub(crate) total_decoded_size: u64,
}

impl RecordDirectory {
    /// 通过二分查找定位包含逻辑 offset 的 Record Block。
    pub(crate) fn block_for_offset(&self, offset: u64, allow_end: bool) -> Option<usize> {
        if allow_end && offset == self.total_decoded_size {
            return self.blocks.len().checked_sub(1);
        }
        let index = self
            .blocks
            .partition_point(|block| block.logical_start <= offset)
            .saturating_sub(1);
        self.blocks
            .get(index)
            .filter(|block| offset < block.logical_end)
            .map(|_| index)
    }
}

#[cfg(test)]
mod tests {
    use crate::Version;
    use crate::format::directory::{BlockEnvelope, RecordBlock, RecordBlockId, RecordDirectory};
    use crate::source::SourceSpan;

    /// 创建仅用于逻辑 offset 定位测试的 Record Block。
    fn block(id: u32, logical_start: u64, logical_end: u64) -> RecordBlock {
        RecordBlock {
            id: RecordBlockId(id),
            source: SourceSpan { start: 0, end: 8 },
            logical_start,
            logical_end,
            envelope: BlockEnvelope::V2(Version::V2),
        }
    }

    #[test]
    /// 验证 block 起点、内部、边界和总终点的二分定位语义。
    fn locates_record_offsets_at_boundaries() {
        let directory = RecordDirectory {
            blocks: vec![block(0, 0, 3), block(1, 3, 7)],
            total_decoded_size: 7,
        };
        assert_eq!(directory.block_for_offset(0, false), Some(0));
        assert_eq!(directory.block_for_offset(2, false), Some(0));
        assert_eq!(directory.block_for_offset(3, false), Some(1));
        assert_eq!(directory.block_for_offset(6, false), Some(1));
        assert_eq!(directory.block_for_offset(7, false), None);
        assert_eq!(directory.block_for_offset(7, true), Some(1));
    }
}
