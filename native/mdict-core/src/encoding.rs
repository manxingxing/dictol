use encoding_rs::Encoding;

use crate::{Error, Result};

pub(crate) fn decode(bytes: &[u8], encoding: &str) -> String {
    match normalize_label(encoding).as_str() {
        "UTF-8" => String::from_utf8_lossy(bytes).into_owned(),
        "UTF-16LE" => {
            let units = bytes
                .chunks_exact(2)
                .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
                .collect::<Vec<_>>();
            String::from_utf16_lossy(&units)
        }
        label => Encoding::for_label(label.as_bytes())
            .map(|decoder| decoder.decode_without_bom_handling(bytes).0.into_owned())
            .unwrap_or_else(|| String::from_utf8_lossy(bytes).into_owned()),
    }
}

pub(crate) fn decode_strict(bytes: &[u8], encoding: &str) -> Result<String> {
    match normalize_label(encoding).as_str() {
        "UTF-8" => String::from_utf8(bytes.to_vec())
            .map_err(|error| Error::InvalidFormat(format!("invalid UTF-8 key text: {error}"))),
        "UTF-16LE" => {
            if !bytes.len().is_multiple_of(2) {
                return Err(Error::InvalidFormat(
                    "UTF-16LE key text has an odd byte length".into(),
                ));
            }
            let units = bytes
                .chunks_exact(2)
                .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
                .collect::<Vec<_>>();
            String::from_utf16(&units).map_err(|error| {
                Error::InvalidFormat(format!("invalid UTF-16LE key text: {error}"))
            })
        }
        label => Encoding::for_label(label.as_bytes())
            .and_then(|decoder| decoder.decode_without_bom_handling_and_without_replacement(bytes))
            .map(|text| text.into_owned())
            .ok_or_else(|| {
                Error::InvalidFormat(format!(
                    "key text is invalid for declared encoding {encoding:?}"
                ))
            }),
    }
}

pub(crate) fn validate_label(label: &str) -> Result<String> {
    let normalized = normalize_label(label);
    if matches!(normalized.as_str(), "UTF-8" | "UTF-16LE")
        || Encoding::for_label(normalized.as_bytes()).is_some()
    {
        Ok(normalized)
    } else {
        Err(Error::Unsupported(format!("dictionary encoding {label:?}")))
    }
}

pub(crate) fn normalize_label(label: &str) -> String {
    match label.trim().to_ascii_uppercase().as_str() {
        "" | "UTF-16" | "UTF16" | "UTF-16LE" => "UTF-16LE".to_string(),
        "UTF8" | "UTF-8" => "UTF-8".to_string(),
        "GBK" | "GB2312" | "GB18030" => "GB18030".to_string(),
        other => other.to_string(),
    }
}

pub(crate) fn terminator_width(encoding: &str) -> usize {
    usize::from(normalize_label(encoding) == "UTF-16LE") + 1
}

#[cfg(test)]
mod tests {
    use super::{decode_strict, validate_label};

    #[test]
    fn rejects_unknown_encoding_labels() {
        assert!(validate_label("made-up-encoding").is_err());
    }

    #[test]
    fn rejects_invalid_key_text() {
        assert!(decode_strict(&[0xff], "UTF-8").is_err());
        assert!(decode_strict(&[0x61], "UTF-16LE").is_err());
    }
}
