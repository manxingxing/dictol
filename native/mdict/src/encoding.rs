use encoding_rs::{Encoding, UTF_8, UTF_16LE};

use crate::{Error, Result};

/// 统一常见的 MDict 编码名称和别名。
pub(crate) fn normalize_label(label: &str) -> String {
    match label.trim().to_ascii_uppercase().as_str() {
        "" | "UTF-16" | "UTF16" | "UTF-16LE" => "UTF-16LE".into(),
        "UTF8" | "UTF-8" => "UTF-8".into(),
        "GBK" | "GB2312" | "GB18030" => "GB18030".into(),
        value => value.into(),
    }
}

/// 确认编码受 `encoding_rs` 支持并返回规范名称。
pub(crate) fn validate_label(label: &str) -> Result<String> {
    let normalized = normalize_label(label);
    encoding(&normalized)
        .map(|_| normalized.clone())
        .ok_or_else(|| Error::unsupported(format!("dictionary encoding {label:?}")))
}

/// 严格解码 key；非法字节序列直接返回编码错误。
pub(crate) fn decode_strict(bytes: &[u8], label: &str, offset: u64) -> Result<String> {
    let normalized = normalize_label(label);
    encoding(&normalized)
        .and_then(|codec| codec.decode_without_bom_handling_and_without_replacement(bytes))
        .map(|value| value.into_owned())
        .ok_or_else(|| Error::Encoding {
            offset,
            encoding: label.to_owned(),
        })
}

/// 容错解码 MDX record，无法解码的字节使用替代字符。
pub(crate) fn decode_lossy(bytes: &[u8], label: &str) -> String {
    let normalized = normalize_label(label);
    encoding(&normalized)
        .map(|codec| codec.decode_without_bom_handling(bytes).0.into_owned())
        .unwrap_or_else(|| String::from_utf8_lossy(bytes).into_owned())
}

/// 返回零结尾字符串的编码单元宽度。
pub(crate) fn unit_width(label: &str) -> usize {
    usize::from(normalize_label(label) == "UTF-16LE") + 1
}

/// 根据规范化标签取得 `encoding_rs` 编码器。
fn encoding(label: &str) -> Option<&'static Encoding> {
    match label {
        "UTF-8" => Some(UTF_8),
        "UTF-16LE" => Some(UTF_16LE),
        other => Encoding::for_label(other.as_bytes()),
    }
}

#[cfg(test)]
mod tests {
    use super::{decode_lossy, decode_strict, normalize_label, unit_width, validate_label};

    #[test]
    /// 验证常见 MDict 编码别名会映射到稳定公开名称。
    fn normalizes_common_encoding_aliases() {
        assert_eq!(normalize_label("utf16"), "UTF-16LE");
        assert_eq!(normalize_label("GBK"), "GB18030");
        assert_eq!(validate_label("big5").unwrap(), "BIG5");
        assert_eq!(unit_width("UTF-16LE"), 2);
        assert_eq!(unit_width("GB18030"), 1);
    }

    #[test]
    /// 验证 key 严格解码报错，而 MDX record 容错解码保留可展示文本。
    fn separates_strict_keys_from_lossy_records() {
        assert!(decode_strict(&[0xff], "UTF-8", 7).is_err());
        assert_eq!(decode_lossy(&[0xff], "UTF-8"), "�");
    }
}
