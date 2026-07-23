use ripemd::{Digest, Ripemd128};

pub(crate) fn decrypt_key_index(block: &[u8]) -> Option<Vec<u8>> {
    if block.len() < 8 {
        return None;
    }

    let mut key_source = [0_u8; 8];
    key_source[..4].copy_from_slice(&block[4..8]);
    key_source[4..].copy_from_slice(&[0x95, 0x36, 0x00, 0x00]);

    let mut hasher = Ripemd128::new();
    hasher.update(key_source);
    let key = hasher.finalize();

    let mut output = Vec::with_capacity(block.len());
    output.extend_from_slice(&block[..8]);
    output.extend_from_slice(&fast_decrypt(&block[8..], &key));
    Some(output)
}

fn fast_decrypt(input: &[u8], key: &[u8]) -> Vec<u8> {
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
    fn fast_decrypt_matches_known_vector() {
        assert_eq!(
            fast_decrypt(&[0xab, 0xcd, 0xef], &[0x01, 0x02, 0x03]),
            [0x8d, 0x74, 0x32]
        );
    }
}
