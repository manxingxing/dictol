use crate::{Error, Result};

/// 验证一段数据的 Adler-32 校验和。
pub(crate) fn verify(data: &[u8], expected: u32, offset: u64) -> Result<()> {
    let actual = adler2::adler32_slice(data);
    if actual == expected {
        Ok(())
    } else {
        Err(Error::Checksum {
            offset,
            expected,
            actual,
        })
    }
}

#[cfg(test)]
mod tests {
    use crate::Error;

    use super::verify;

    #[test]
    /// 验证 checksum 错误会保留调用方给出的物理偏移。
    fn reports_checksum_mismatch_with_offset() {
        let error = verify(b"checksum", 0, 42).unwrap_err();
        assert!(matches!(error, Error::Checksum { offset: 42, .. }));
    }
}
