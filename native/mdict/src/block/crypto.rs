use ripemd::{Digest, Ripemd128};
use xxhash_rust::xxh64::xxh64;

use crate::{Error, Result};

/// 计算 MDict 使用的 RIPEMD-128 摘要。
pub(crate) fn ripemd128(data: &[u8]) -> [u8; 16] {
    Ripemd128::digest(data).into()
}

/// 执行 MDict 的 nibble-swap 链式 XOR 解密。
pub(crate) fn fast_decrypt(input: &[u8], key: &[u8]) -> Result<Vec<u8>> {
    if key.is_empty() {
        return Err(Error::Crypto {
            offset: 0,
            context: "empty simple-encryption key".into(),
        });
    }
    let mut previous = 0x36_u8;
    Ok(input
        .iter()
        .enumerate()
        .map(|(index, encrypted)| {
            let decrypted =
                encrypted.rotate_left(4) ^ previous ^ index as u8 ^ key[index % key.len()];
            previous = *encrypted;
            decrypted
        })
        .collect())
}

/// 使用零 nonce 的 128-bit Salsa20/8 密钥流变换数据。
pub(crate) fn salsa8(input: &[u8], key: &[u8]) -> Result<Vec<u8>> {
    if key.len() < 16 {
        return Err(Error::Crypto {
            offset: 0,
            context: format!("Salsa20/8 requires a 16-byte key, got {}", key.len()),
        });
    }
    let mut state = [0_u32; 16];
    let constants = b"expand 16-byte k";
    state[0] = little(&constants[0..4]);
    state[5] = little(&constants[4..8]);
    state[10] = little(&constants[8..12]);
    state[15] = little(&constants[12..16]);
    state[1] = little(&key[0..4]);
    state[2] = little(&key[4..8]);
    state[3] = little(&key[8..12]);
    state[4] = little(&key[12..16]);
    state[11] = state[1];
    state[12] = state[2];
    state[13] = state[3];
    state[14] = state[4];
    // nonce and counter are both zero.
    let mut output = Vec::with_capacity(input.len());
    for chunk in input.chunks(64) {
        let key_stream = salsa8_block(&state);
        output.extend(chunk.iter().zip(key_stream).map(|(byte, key)| byte ^ key));
        state[8] = state[8].wrapping_add(1);
        if state[8] == 0 {
            state[9] = state[9].wrapping_add(1);
        }
    }
    Ok(output)
}

/// 为当前 Salsa20/8 状态生成一个 64 字节密钥流 block。
fn salsa8_block(input: &[u32; 16]) -> [u8; 64] {
    let mut x = *input;
    for _ in 0..4 {
        quarter_round(&mut x, 0, 4, 8, 12);
        quarter_round(&mut x, 5, 9, 13, 1);
        quarter_round(&mut x, 10, 14, 2, 6);
        quarter_round(&mut x, 15, 3, 7, 11);
        quarter_round(&mut x, 0, 1, 2, 3);
        quarter_round(&mut x, 5, 6, 7, 4);
        quarter_round(&mut x, 10, 11, 8, 9);
        quarter_round(&mut x, 15, 12, 13, 14);
    }
    let mut bytes = [0_u8; 64];
    for (index, value) in x
        .iter()
        .zip(input)
        .map(|(x, original)| x.wrapping_add(*original))
        .enumerate()
    {
        bytes[index * 4..index * 4 + 4].copy_from_slice(&value.to_le_bytes());
    }
    bytes
}

/// 执行 Salsa 的一次 quarter round。
fn quarter_round(state: &mut [u32; 16], a: usize, b: usize, c: usize, d: usize) {
    state[b] ^= state[a].wrapping_add(state[d]).rotate_left(7);
    state[c] ^= state[b].wrapping_add(state[a]).rotate_left(9);
    state[d] ^= state[c].wrapping_add(state[b]).rotate_left(13);
    state[a] ^= state[d].wrapping_add(state[c]).rotate_left(18);
}

/// 从四字节切片读取小端 `u32`。
fn little(bytes: &[u8]) -> u32 {
    u32::from_le_bytes(bytes[..4].try_into().unwrap())
}

/// 解码 Header 或 `.key` 文件中的十六进制注册码。
pub(crate) fn decode_hex(input: &str) -> Result<Vec<u8>> {
    if input.len() % 2 != 0 {
        return Err(Error::Crypto {
            offset: 0,
            context: "registration code has odd hex length".into(),
        });
    }
    input
        .as_bytes()
        .chunks_exact(2)
        .map(|pair| {
            let digits = std::str::from_utf8(pair).expect("ASCII pair");
            u8::from_str_radix(digits, 16).map_err(|error| Error::Crypto {
                offset: 0,
                context: format!("invalid registration code hex: {error}"),
            })
        })
        .collect()
}

/// 按 raymanzhang/mdx 的大端拼接规则从 v3 UUID 派生 16 字节密钥。
pub(crate) fn v3_uuid_key(uuid: &str) -> Result<[u8; 16]> {
    let bytes = uuid.as_bytes();
    if bytes.is_empty() {
        return Err(Error::Crypto {
            offset: 4,
            context: "v3 UUID is empty".into(),
        });
    }
    let middle = bytes.len().div_ceil(2);
    let mut key = [0_u8; 16];
    key[..8].copy_from_slice(&xxh64(&bytes[..middle], 0).to_be_bytes());
    key[8..].copy_from_slice(&xxh64(&bytes[middle..], 0).to_be_bytes());
    Ok(key)
}

#[cfg(test)]
mod tests {
    use super::{fast_decrypt, salsa8, v3_uuid_key};

    #[test]
    /// 验证 simple decrypt 与固定参考向量一致。
    fn fast_decrypt_vector() {
        assert_eq!(
            fast_decrypt(&[0xab, 0xcd, 0xef], &[1, 2, 3]).unwrap(),
            [0x8d, 0x74, 0x32]
        );
    }

    #[test]
    /// 验证 Salsa20/8 流加密重复应用可以还原原文。
    fn salsa8_is_symmetric() {
        let key = [7_u8; 16];
        let encrypted = salsa8(b"registration key", &key).unwrap();
        assert_eq!(salsa8(&encrypted, &key).unwrap(), b"registration key");
    }

    #[test]
    /// 验证 v3 UUID 派生始终按两个大端 XXH64 组成 16 字节 key。
    fn derives_v3_uuid_key() {
        let key = v3_uuid_key("be335fe3-139b-4b28-8d48-a264d8fe7585").unwrap();
        assert_eq!(key.len(), 16);
        assert_ne!(&key[..8], &key[8..]);
    }
}
