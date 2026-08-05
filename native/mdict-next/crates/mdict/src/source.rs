use std::fs::File;
use std::path::{Path, PathBuf};

use memmap2::Mmap;

use crate::{Error, Result};

/// MDX 或 MDD 文件的只读内存映射。
///
/// 该结构保存原始路径和映射句柄，并通过边界检查后的切片接口提供只读访问。
#[derive(Debug)]
pub(crate) struct MappedSource {
    /// 创建映射时使用的文件路径。
    path: PathBuf,
    /// 覆盖整个文件的只读内存映射。
    map: Mmap,
}

impl MappedSource {
    /// 打开 `path` 指向的文件并创建只读内存映射。
    pub(crate) fn open(path: &Path) -> Result<Self> {
        let file = File::open(path)?;
        // SAFETY：映射为只读，本库不会修改字典文件。调用方在映射存活期间不得并发截断
        // 或替换已打开的文件，否则操作系统映射的有效性无法由 Rust 类型系统保证。
        let map = unsafe { Mmap::map(&file)? };
        Ok(Self {
            path: path.to_path_buf(),
            map,
        })
    }

    /// 返回创建映射时使用的原始文件路径。
    pub(crate) fn path(&self) -> &Path {
        &self.path
    }

    /// 返回映射文件的字节长度。
    pub(crate) fn len(&self) -> u64 {
        self.map.len() as u64
    }

    /// 以只读字节切片返回整个映射文件。
    pub(crate) fn as_slice(&self) -> &[u8] {
        &self.map
    }

    /// 返回 `[start, end)` 对应的字节切片，并验证区间顺序、文件边界和平台地址宽度。
    pub(crate) fn slice(&self, start: u64, end: u64) -> Result<&[u8]> {
        if end < start || end > self.len() {
            return Err(Error::invalid(
                start,
                format!(
                    "source range {}..{} exceeds mapped file size {}",
                    start,
                    end,
                    self.len()
                ),
            ));
        }
        let start_index = usize::try_from(start)
            .map_err(|_| Error::invalid(start, "source offset exceeds this platform"))?;
        let end_index = usize::try_from(end)
            .map_err(|_| Error::invalid(end, "source offset exceeds this platform"))?;
        Ok(&self.map[start_index..end_index])
    }
}
