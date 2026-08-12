mod checksum;
pub(crate) mod compression;
pub(crate) mod crypto;
mod envelope_v2;
mod envelope_v3;

use std::path::Path;
use std::sync::Arc;

use crate::format::directory::BlockEnvelope;
use crate::options::Limits;
use crate::{Error, Result};

/// 按 descriptor 指定的 envelope 解码、校验并返回共享字节块。
pub(crate) fn decode(
    envelope: &BlockEnvelope,
    bytes: &[u8],
    expected_size: usize,
    crypto_key: &[u8],
    path: &Path,
    offset: u64,
    limits: Limits,
) -> Result<Arc<[u8]>> {
    if expected_size as u64 > limits.maximum_block_decompressed_size {
        return Err(Error::LimitExceeded {
            name: "decoded block size",
            actual: expected_size as u64,
            maximum: limits.maximum_block_decompressed_size,
        });
    }
    let output = match envelope {
        BlockEnvelope::V2(version) => {
            envelope_v2::decode(bytes, expected_size, crypto_key, *version, path, offset)?
        }
        BlockEnvelope::V3 => envelope_v3::decode(bytes, expected_size, crypto_key, path, offset)?,
    };
    Ok(Arc::from(output))
}
