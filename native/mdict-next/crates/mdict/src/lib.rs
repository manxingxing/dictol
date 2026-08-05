//! 基于内存映射的低内存占用 MDict 读取库。
//!
//! 公共数据模型与具体文件版本解耦。v2、v3 的磁盘布局分别放在内部模块中，
//! 因此后续增加 v3 支持时无需改变词条和记录数据的公共接口。

mod codec;
mod dictionary;
mod encoding;
mod error;
mod format;
mod model;
mod scanner;
mod source;

pub use dictionary::Mdict;
pub use error::{Error, Result};
pub use model::{
    ByteRange, FileKind, Header, KeyBlockId, KeyBlockInfo, KeyEntity, KeySectionInfo, Limits,
    MdictVersion, OpenOptions, RecordBlockId, RecordBlockInfo, RecordEntry, RecordSectionInfo,
};
pub use scanner::{KeyBatchIter, KeyIter, KeyScanner, RecordEntryIter, RecordEntryScanner};
