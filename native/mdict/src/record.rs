use std::sync::Arc;

use crate::Result;
use crate::mdict::Mdict;

/// 使用随机查询 LRU 读取一个逻辑 record 范围。
pub(crate) fn read_random(dictionary: &Mdict, start: u64, end: u64) -> Result<Vec<u8>> {
    let capacity = dictionary.validate_record_range(start, end)?;
    let mut output = Vec::with_capacity(capacity);
    let mut offset = start;
    while offset < end {
        let block_index = dictionary.record_block_for_offset(offset, false)?;
        let descriptor = &dictionary.record_blocks()[block_index];
        let decoded = dictionary.decode_record_block(block_index, true)?;
        append_intersection(&mut output, &decoded, descriptor.logical_start, offset, end);
        offset = end.min(descriptor.logical_end);
    }
    Ok(output)
}

/// 把当前 block 与目标 record 相交的片段追加到输出。
fn append_intersection(
    output: &mut Vec<u8>,
    decoded: &[u8],
    block_start: u64,
    record_offset: u64,
    record_end: u64,
) {
    let start = usize::try_from(record_offset - block_start).expect("validated block-local start");
    let end = usize::try_from(record_end.min(block_start + decoded.len() as u64) - block_start)
        .expect("validated block-local end");
    output.extend_from_slice(&decoded[start..end]);
}

#[derive(Debug, Default)]
pub(crate) struct SequentialRecordCursor {
    index: usize,
    decoded: Arc<[u8]>,
    loaded: bool,
}

impl SequentialRecordCursor {
    /// 顺序读取 record，跨 block 时只向前推进并复用当前解压块。
    pub(crate) fn read(&mut self, dictionary: &Mdict, start: u64, end: u64) -> Result<Vec<u8>> {
        let capacity = dictionary.validate_record_range(start, end)?;
        let mut output = Vec::with_capacity(capacity);
        let mut offset = start;
        while offset < end {
            self.seek(dictionary, offset)?;
            let descriptor = &dictionary.record_blocks()[self.index];
            append_intersection(
                &mut output,
                &self.decoded,
                descriptor.logical_start,
                offset,
                end,
            );
            offset = end.min(descriptor.logical_end);
        }
        Ok(output)
    }

    /// 将游标推进或重新定位到包含 offset 的 Record Block。
    fn seek(&mut self, dictionary: &Mdict, offset: u64) -> Result<()> {
        if !self.loaded {
            self.index = dictionary.record_block_for_offset(offset, false)?;
            self.load(dictionary)?;
            return Ok(());
        }
        while self.index + 1 < dictionary.record_blocks().len()
            && offset >= dictionary.record_blocks()[self.index].logical_end
        {
            self.index += 1;
            self.load(dictionary)?;
        }
        let descriptor = &dictionary.record_blocks()[self.index];
        if offset < descriptor.logical_start || offset >= descriptor.logical_end {
            self.index = dictionary.record_block_for_offset(offset, false)?;
            self.load(dictionary)?;
        }
        Ok(())
    }

    /// 不写入随机 LRU 地解压当前 Record Block。
    fn load(&mut self, dictionary: &Mdict) -> Result<()> {
        self.decoded = dictionary.decode_record_block(self.index, false)?;
        self.loaded = true;
        Ok(())
    }
}
