use std::path::Path;

use crate::block::checksum;
use crate::block::compression::{self, Compression};
use crate::block::crypto::{fast_decrypt, ripemd128};
use crate::{Error, Result, Version};

/// 解码一个 v2 storage block；v1 的 block envelope 也由此兼容。
pub(crate) fn decode(
    block: &[u8],
    expected_size: usize,
    crypto_key: &[u8],
    version: Version,
    path: &Path,
    offset: u64,
) -> Result<Vec<u8>> {
    if block.len() < 8 {
        return Err(Error::invalid(path, offset, "truncated v2 block envelope"));
    }
    let flags = block[0];
    let encrypted_prefix_size = usize::from(block[1]);
    if block[2] != 0 || block[3] != 0 {
        return Err(Error::invalid(
            path,
            offset,
            format!("invalid v2 block flags {:02x?}", &block[..4]),
        ));
    }
    let method = Compression::from_id(flags & 0x0f, offset)?;
    let encryption = flags >> 4;
    let expected_checksum = u32::from_be_bytes(block[4..8].try_into().unwrap());
    let payload = &block[8..];
    let mut decrypted;
    let payload = if encryption == 0 {
        payload
    } else {
        if encrypted_prefix_size > payload.len() {
            return Err(Error::invalid(
                path,
                offset + 1,
                "v2 encrypted prefix exceeds payload",
            ));
        }
        let key = if crypto_key.is_empty() {
            ripemd128(&block[4..8]).to_vec()
        } else if version == Version::V2 {
            ripemd128(&ripemd128(crypto_key)).to_vec()
        } else {
            crypto_key.to_vec()
        };
        decrypted = payload.to_vec();
        let prefix = match encryption {
            1 => fast_decrypt(&payload[..encrypted_prefix_size], &key)?,
            2 => crate::block::crypto::salsa8(&payload[..encrypted_prefix_size], &key)?,
            _ => {
                return Err(Error::unsupported(format!(
                    "v2 block encryption method {encryption} at byte {offset}"
                )));
            }
        };
        decrypted[..encrypted_prefix_size].copy_from_slice(&prefix);
        checksum::verify(&decrypted, expected_checksum, offset + 4)?;
        decrypted.as_slice()
    };
    let output = compression::decompress(method, payload, expected_size, offset)?;
    if encryption == 0 {
        checksum::verify(&output, expected_checksum, offset + 4)?;
    }
    Ok(output)
}

#[cfg(test)]
mod tests {
    use std::io::Write;
    use std::path::Path;

    use crate::Version;
    use crate::block::crypto::{ripemd128, salsa8};

    use super::decode;

    #[test]
    /// 验证 v2 注册密钥派生、Salsa20/8 前缀解密和压缩态 checksum 顺序。
    fn decodes_registered_v2_block() {
        let data = b"registered v2 block";
        let mut encoder =
            flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::default());
        encoder.write_all(data).unwrap();
        let mut payload = encoder.finish().unwrap();
        let crypto_key = [9_u8; 16];
        let block_key = ripemd128(&ripemd128(&crypto_key));
        let prefix_size = payload.len().min(32);
        let encrypted = salsa8(&payload[..prefix_size], &block_key).unwrap();
        payload[..prefix_size].copy_from_slice(&encrypted);

        let mut block = vec![0x22, prefix_size as u8, 0, 0];
        let mut plain_encoder =
            flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::default());
        plain_encoder.write_all(data).unwrap();
        let plain_payload = plain_encoder.finish().unwrap();
        block.extend_from_slice(&adler2::adler32_slice(&plain_payload).to_be_bytes());
        block.extend_from_slice(&payload);
        assert_eq!(
            decode(
                &block,
                data.len(),
                &crypto_key,
                Version::V2,
                Path::new("fixture.mdx"),
                0,
            )
            .unwrap(),
            data
        );
    }
}
