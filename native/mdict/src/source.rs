use std::fs::File;
use std::path::{Path, PathBuf};

use memmap2::Mmap;

use crate::{Error, Result};

/// A physical source range validated once when a descriptor is constructed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct SourceSpan {
    pub(crate) start: usize,
    pub(crate) end: usize,
}

/// Read-only memory mapping of one physical MDX/MDD file.
#[derive(Debug)]
pub(crate) struct MappedSource {
    path: PathBuf,
    map: Mmap,
}

impl MappedSource {
    /// 打开文件并建立只读内存映射。
    pub(crate) fn open(path: &Path) -> Result<Self> {
        let file = File::open(path).map_err(|error| Error::io(path, error))?;
        // SAFETY: this library creates a read-only mapping and never mutates the file.
        // Callers must not truncate or replace an opened dictionary in place.
        let map = unsafe { Mmap::map(&file) }.map_err(|error| Error::io(path, error))?;
        Ok(Self {
            path: path.to_path_buf(),
            map,
        })
    }

    /// 返回映射对应的原始文件路径。
    pub(crate) fn path(&self) -> &Path {
        &self.path
    }

    /// 返回完整文件的只读字节切片。
    pub(crate) fn bytes(&self) -> &[u8] {
        &self.map
    }

    /// 验证一个文件物理范围并转换为内部 `SourceSpan`。
    pub(crate) fn span(&self, start: u64, end: u64, context: &str) -> Result<SourceSpan> {
        let start_usize = usize::try_from(start).map_err(|_| {
            Error::invalid(
                &self.path,
                start,
                format!("{context} offset exceeds platform"),
            )
        })?;
        let end_usize = usize::try_from(end).map_err(|_| {
            Error::invalid(
                &self.path,
                end,
                format!("{context} offset exceeds platform"),
            )
        })?;
        if end_usize < start_usize || end_usize > self.map.len() {
            return Err(Error::invalid(
                &self.path,
                start,
                format!(
                    "{context} range {start}..{end} exceeds file size {}",
                    self.map.len()
                ),
            ));
        }
        Ok(SourceSpan {
            start: start_usize,
            end: end_usize,
        })
    }

    /// 读取已经验证的物理范围，不再重复执行边界检查。
    #[inline]
    pub(crate) fn slice(&self, span: SourceSpan) -> &[u8] {
        debug_assert!(span.start <= span.end && span.end <= self.map.len());
        &self.map[span.start..span.end]
    }
}
