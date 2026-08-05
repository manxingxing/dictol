use encoding_rs::{Encoding, UTF_8, UTF_16LE};

use crate::{Error, Result};

/// 验证并规范化编码标签。
///
/// 将输入的 `label` 规范化为库内部使用的标准标签（例如 "UTF-8"、"UTF-16LE"），
/// 并检查是否为受支持的编码。成功时返回规范化后的标签，失败时返回 `Error::Unsupported`。
pub(crate) fn validate_label(label: &str) -> Result<String> {
    let normalized = normalize_label(label);
    if encoding_for_label(&normalized).is_some() {
        Ok(normalized)
    } else {
        Err(Error::Unsupported(format!("dictionary encoding {label:?}")))
    }
}

/// 使用声明的编码严格解码字节为字符串。
///
/// 严格解码不允许替换或回退；如果字节不是有效的指定编码，将返回 `Error::invalid`，
/// `offset` 用于构造错误的上下文（偏移位置）。
pub(crate) fn decode_strict(bytes: &[u8], encoding: &str, offset: u64) -> Result<String> {
    let normalized = normalize_label(encoding);
    encoding_for_label(&normalized)
        .and_then(|decoder| decoder.decode_without_bom_handling_and_without_replacement(bytes))
        .map(|text| text.into_owned())
        .ok_or_else(|| {
            Error::invalid(
                offset,
                format!("key is invalid for declared encoding {encoding:?}"),
            )
        })
}

/// 使用声明的编码以可容错的方式解码字节为字符串（lossy）。
///
/// 对于无法识别或无法解码的字节，使用替代字符或 UTF-8 的 lossy 转换，确保总是返回字符串。
pub(crate) fn decode_lossy(bytes: &[u8], encoding: &str) -> String {
    let normalized = normalize_label(encoding);
    encoding_for_label(&normalized)
        .map(|decoder| decoder.decode_without_bom_handling(bytes).0.into_owned())
        .unwrap_or_else(|| String::from_utf8_lossy(bytes).into_owned())
}

/// 规范化编码标签为内部约定的名称。
///
/// 输入会被去除空白并转为大写，然后映射常见别名到标准标签，例如将 "utf8" 或 "utf-8" 规范为 "UTF-8"。
pub(crate) fn normalize_label(label: &str) -> String {
    match label.trim().to_ascii_uppercase().as_str() {
        "" | "UTF-16" | "UTF16" | "UTF-16LE" => "UTF-16LE".to_string(),
        "UTF8" | "UTF-8" => "UTF-8".to_string(),
        "GBK" | "GB2312" | "GB18030" => "GB18030".to_string(),
        other => other.to_string(),
    }
}

/// 返回给定编码的单位宽度（字节数）。
///
/// 对于 UTF-16LE 返回 2（每个码元 2 字节），否则返回 1（单字节编码）。
pub(crate) fn unit_width(encoding: &str) -> usize {
    if normalize_label(encoding) == "UTF-16LE" {
        2
    } else {
        1
    }
}

/// 根据规范化标签查找对应的 `Encoding` 对象。
///
/// 支持显式的 `UTF-8` 和 `UTF-16LE` 快捷路径，否则使用 `encoding_rs::Encoding::for_label` 进行查找。
fn encoding_for_label(label: &str) -> Option<&'static Encoding> {
    match label {
        "UTF-8" => Some(UTF_8),
        "UTF-16LE" => Some(UTF_16LE),
        other => Encoding::for_label(other.as_bytes()),
    }
}
