use std::path::Path;

use crate::block::checksum;
use crate::block::compression::{self, Compression};
use crate::{Error, Result};

/// 解码一个包含长度前缀的 v3 Storage Block。
pub(crate) fn decode(
    block: &[u8],
    expected_size: usize,
    crypto_key: &[u8],
    path: &Path,
    offset: u64,
) -> Result<Vec<u8>> {
    if block.len() < 16 {
        return Err(Error::invalid(path, offset, "truncated v3 storage block"));
    }
    let original_size = u32::from_be_bytes(block[0..4].try_into().unwrap()) as usize;
    let encoded_size = u32::from_be_bytes(block[4..8].try_into().unwrap()) as usize;
    if original_size != expected_size {
        return Err(Error::invalid(
            path,
            offset,
            format!(
                "v3 block declares {original_size} decoded bytes, index expects {expected_size}"
            ),
        ));
    }
    if encoded_size < 8 || encoded_size.checked_add(8) != Some(block.len()) {
        return Err(Error::invalid(
            path,
            offset + 4,
            format!(
                "v3 encoded block size {encoded_size} does not match {} bytes",
                block.len() - 8
            ),
        ));
    }
    let flags = block[8];
    let encrypted_prefix_size = usize::from(block[9]);
    let expected_checksum = u32::from_be_bytes(block[12..16].try_into().unwrap());
    let method = Compression::from_id(flags & 0x0f, offset + 8)?;
    let encryption = flags >> 4;
    let mut payload = block[16..].to_vec();
    if encrypted_prefix_size > payload.len() {
        return Err(Error::invalid(
            path,
            offset + 9,
            "v3 encrypted prefix exceeds payload",
        ));
    }
    if encryption != 0 {
        let prefix = match encryption {
            1 => crate::block::crypto::fast_decrypt(&payload[..encrypted_prefix_size], crypto_key)?,
            2 => crate::block::crypto::salsa8(&payload[..encrypted_prefix_size], crypto_key)?,
            _ => {
                return Err(Error::unsupported(format!(
                    "v3 encryption method {encryption} at byte {}",
                    offset + 8
                )));
            }
        };
        payload[..encrypted_prefix_size].copy_from_slice(&prefix);
        checksum::verify(&payload, expected_checksum, offset + 12)?;
    }
    let output = compression::decompress(method, &payload, expected_size, offset + 16)?;
    if encryption == 0 {
        checksum::verify(&output, expected_checksum, offset + 12)?;
    }
    Ok(output)
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use crate::Error;
    use crate::block::crypto::salsa8;

    use super::decode;

    #[test]
    /// 验证 v3 simple encryption 只处理指定前缀并校验解密后的压缩数据。
    fn decodes_simple_encrypted_prefix() {
        let data = b"encrypted v3 storage block";
        let key = [3_u8; 16];
        let block = encrypted_block(data, &key, 1);
        assert_eq!(
            decode(&block, data.len(), &key, Path::new("fixture.zdb"), 0,).unwrap(),
            data
        );
    }

    #[test]
    /// 验证 v3 Salsa20/8 加密编号会走压缩态 checksum 路径。
    fn decodes_salsa_encrypted_prefix() {
        let data = b"salsa encrypted v3 storage block";
        let key = [7_u8; 16];
        let block = encrypted_block(data, &key, 2);
        assert_eq!(
            decode(&block, data.len(), &key, Path::new("fixture.zdb"), 24).unwrap(),
            data
        );
    }

    #[test]
    /// 验证加密块会在解压前拒绝压缩态 checksum 损坏。
    fn rejects_encrypted_payload_checksum_mismatch() {
        let data = b"checksum fixture";
        let key = [11_u8; 16];
        let mut block = encrypted_block(data, &key, 1);
        block[12] ^= 0x80;
        assert!(matches!(
            decode(&block, data.len(), &key, Path::new("fixture.zdb"), 0),
            Err(Error::Checksum { .. })
        ));
    }

    /// 构造使用指定 v3 加密方法的 zlib Storage Block。
    fn encrypted_block(data: &[u8], key: &[u8], encryption: u8) -> Vec<u8> {
        use std::io::Write;

        let mut encoder =
            flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::default());
        encoder.write_all(data).unwrap();
        let mut payload = encoder.finish().unwrap();
        let checksum = adler2::adler32_slice(&payload);
        let prefix_size = payload.len().min(32);
        let encrypted = match encryption {
            1 => fast_encrypt(&payload[..prefix_size], key),
            2 => salsa8(&payload[..prefix_size], key).unwrap(),
            _ => unreachable!(),
        };
        payload[..prefix_size].copy_from_slice(&encrypted);

        let mut block = Vec::new();
        block.extend_from_slice(&(data.len() as u32).to_be_bytes());
        block.extend_from_slice(&((payload.len() + 8) as u32).to_be_bytes());
        block.push((encryption << 4) | 2);
        block.push(prefix_size as u8);
        block.extend_from_slice(&0_u16.to_be_bytes());
        block.extend_from_slice(&checksum.to_be_bytes());
        block.extend_from_slice(&payload);
        block
    }

    /// 执行 MDict simple encryption 的正向变换，供解密测试生成 fixture。
    fn fast_encrypt(input: &[u8], key: &[u8]) -> Vec<u8> {
        let mut previous = 0x36_u8;
        input
            .iter()
            .enumerate()
            .map(|(index, byte)| {
                let mixed = byte ^ key[index % key.len()] ^ index as u8 ^ previous;
                let encrypted = mixed.rotate_left(4);
                previous = encrypted;
                encrypted
            })
            .collect()
    }
}
