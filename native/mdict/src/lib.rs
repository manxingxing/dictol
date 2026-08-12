//! A memory-mapped reader for MDict v1, v2 and v3 dictionaries.
//!
//! [`Mdict`] exposes the common binary key/record model. [`Mdx`] adds text,
//! link and StyleSheet semantics. [`Mdd`] represents one physical resource
//! dictionary, while [`MddList`] searches an explicitly ordered file list.

#![doc = include_str!("../README.md")]
#![warn(missing_docs)]

mod block;
mod cache;
mod comparison;
mod encoding;
mod error;
mod format;
mod mdd;
mod mdict;
mod mdx;
mod model;
mod options;
mod record;
mod scanner;
mod source;

pub use error::{Error, LinkError, Result};
pub use mdd::{
    Mdd, MddList, MddListEntries, MddListEntryScanner, MddListKeyScanner, MddListKeys,
    MddListPrefix,
};
pub use mdict::Mdict;
pub use mdx::Mdx;
pub use model::{EncryptionSummary, Entry, FileKind, Key, MddKey, Metadata, Version, Warning};
pub use options::{CacheOptions, Credentials, Limits, OpenOptions};
pub use scanner::{Entries, KeyScanner, Keys, Prefix};
