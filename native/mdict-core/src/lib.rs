mod compression;
mod crypto;
mod encoding;
mod error;
mod file;
mod header;

pub use error::{Error, Result};
pub use file::{
    Entry, EntryBatchIter, EntryCursor, EntryIter, KeyBlock, KeySection, LookupResult, MdictFile,
    MdictLimits, RecordBlock, RecordLocation, RecordSection,
};
pub use header::{FileKind, Header};
