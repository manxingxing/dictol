mod cursor;
pub(crate) mod directory;
mod header;
mod v2;
mod v3;

use std::path::Path;

use zeroize::Zeroizing;

use crate::Result;
use crate::comparison::KeyComparison;
use crate::format::directory::{KeyDirectory, RecordDirectory};
use crate::model::Metadata;
use crate::options::OpenOptions;
use crate::source::MappedSource;

pub(crate) use header::{Header, decode_entities_lenient};

pub(crate) struct OpenedFormat {
    pub(crate) metadata: Metadata,
    pub(crate) header: Header,
    pub(crate) key_directory: KeyDirectory,
    pub(crate) record_directory: RecordDirectory,
    pub(crate) comparison: KeyComparison,
    pub(crate) crypto_key: Zeroizing<Vec<u8>>,
}

/// 解析 Header，并把剩余磁盘结构分派给 v2（兼容 v1）或 v3 parser。
pub(crate) fn open(
    source: &MappedSource,
    path: &Path,
    options: &OpenOptions,
) -> Result<OpenedFormat> {
    let (header, body_start) = header::parse(source, options.limits)?;
    match header.version {
        crate::Version::V1 | crate::Version::V2 => {
            v2::parse(source, path, header, body_start, options)
        }
        crate::Version::V3 => v3::parse(source, path, header, body_start, options),
    }
}

/// 安全计算物理或逻辑范围的结束位置。
pub(crate) fn checked_add(path: &Path, offset: u64, size: u64, context: &str) -> Result<u64> {
    offset.checked_add(size).ok_or_else(|| {
        crate::Error::invalid(path, offset, format!("{context} range overflows u64"))
    })
}

/// 检查可能触发大规模分配的声明值是否超过配置上限。
pub(crate) fn limit(name: &'static str, actual: u64, maximum: u64) -> Result<()> {
    if actual > maximum {
        Err(crate::Error::LimitExceeded {
            name,
            actual,
            maximum,
        })
    } else {
        Ok(())
    }
}
