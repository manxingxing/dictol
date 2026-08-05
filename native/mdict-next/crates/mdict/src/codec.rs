/// MDict v2 数据块支持的压缩方式。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Compression {
    /// 数据块未压缩，载荷可直接借用内存映射中的字节。
    None,
    /// 数据块使用 LZO1X 压缩。
    Lzo,
    /// 数据块使用 zlib 压缩。
    Zlib,
}

/// 执行 MDict 使用的逐字节快速解密变换。
///
/// 每个字节依赖前一个密文字节、当前位置和循环使用的密钥字节。
pub(crate) fn fast_decrypt(input: &[u8], key: &[u8]) -> Vec<u8> {
    let mut previous = 0x36_u8;
    input
        .iter()
        .enumerate()
        .map(|(index, encrypted)| {
            let decrypted =
                encrypted.rotate_left(4) ^ previous ^ index as u8 ^ key[index % key.len()];
            previous = *encrypted;
            decrypted
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::fast_decrypt;

    #[test]
    /// 使用已知向量验证快速解密的位旋转和链式异或顺序。
    fn decrypts_known_vector() {
        assert_eq!(
            fast_decrypt(&[0xab, 0xcd, 0xef], &[0x01, 0x02, 0x03]),
            [0x8d, 0x74, 0x32]
        );
    }
}
