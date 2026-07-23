use std::io::Read;

use flate2::read::ZlibDecoder;

use crate::{Error, Result};

pub(crate) fn decompress_block(
    block: &[u8],
    expected_size: u64,
    maximum_size: u64,
) -> Result<Vec<u8>> {
    if block.len() < 8 {
        return Err(Error::InvalidFormat(
            "compressed block is shorter than 8 bytes".into(),
        ));
    }

    let method = u32::from_le_bytes(block[..4].try_into().unwrap());
    let expected_checksum = u32::from_be_bytes(block[4..8].try_into().unwrap());
    let payload = &block[8..];

    if expected_size > maximum_size {
        return Err(Error::LimitExceeded(format!(
            "declared decompressed block size {expected_size} exceeds limit {maximum_size}"
        )));
    }
    let output_size = usize::try_from(expected_size)
        .map_err(|_| Error::LimitExceeded("block is too large for this platform".into()))?;

    let output = match method {
        0 => {
            if payload.len() != output_size {
                return Err(Error::InvalidFormat(format!(
                    "uncompressed block size mismatch: expected {expected_size}, got {}",
                    payload.len()
                )));
            }
            let mut output = Vec::new();
            output.try_reserve_exact(output_size).map_err(|error| {
                Error::LimitExceeded(format!("cannot allocate decompressed block: {error}"))
            })?;
            output.extend_from_slice(payload);
            output
        }
        1 => {
            let mut output = Vec::new();
            output.try_reserve_exact(output_size).map_err(|error| {
                Error::LimitExceeded(format!("cannot allocate decompressed block: {error}"))
            })?;
            output.resize(output_size, 0);
            lzo1x::decompress(payload, &mut output).map_err(|error| {
                Error::InvalidFormat(format!("LZO decompression failed: {error:?}"))
            })?;
            output
        }
        2 => {
            let decoder = ZlibDecoder::new(payload);
            let mut output = Vec::new();
            output.try_reserve_exact(output_size).map_err(|error| {
                Error::LimitExceeded(format!("cannot allocate decompressed block: {error}"))
            })?;
            decoder
                .take(expected_size.saturating_add(1))
                .read_to_end(&mut output)?;
            output
        }
        other => {
            return Err(Error::Unsupported(format!(
                "compression/encryption descriptor 0x{other:08x}"
            )));
        }
    };

    if output.len() as u64 != expected_size {
        return Err(Error::InvalidFormat(format!(
            "decompressed block size mismatch: expected {expected_size}, got {}",
            output.len()
        )));
    }

    let actual_checksum = adler2::adler32_slice(&output);
    if actual_checksum != expected_checksum {
        return Err(Error::InvalidFormat(format!(
            "block checksum mismatch: expected 0x{expected_checksum:08x}, got 0x{actual_checksum:08x}"
        )));
    }

    Ok(output)
}

#[cfg(test)]
mod tests {
    use std::io::Write;

    use flate2::{Compression, write::ZlibEncoder};

    use super::decompress_block;

    fn zlib_block(payload: &[u8]) -> Vec<u8> {
        let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
        encoder.write_all(payload).unwrap();
        let compressed = encoder.finish().unwrap();
        let mut block = Vec::from(2_u32.to_le_bytes());
        block.extend_from_slice(&adler2::adler32_slice(payload).to_be_bytes());
        block.extend_from_slice(&compressed);
        block
    }

    #[test]
    fn rejects_declared_size_above_limit_before_allocating() {
        let block = zlib_block(b"small");
        assert!(decompress_block(&block, 1024, 16).is_err());
    }

    #[test]
    fn bounds_zlib_output_to_declared_size() {
        let block = zlib_block(&vec![b'x'; 1024]);
        assert!(decompress_block(&block, 8, 1024).is_err());
    }
}
