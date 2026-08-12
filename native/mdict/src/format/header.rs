use std::collections::BTreeMap;

use encoding_rs::{UTF_8, UTF_16LE};
use quick_xml::Reader;
use quick_xml::escape::unescape;
use quick_xml::events::Event;

use crate::encoding::{unit_width, validate_label};
use crate::format::cursor::BinaryCursor;
use crate::format::limit;
use crate::model::{FileKind, Version, Warning};
use crate::options::Limits;
use crate::source::MappedSource;
use crate::{Error, Result};

#[derive(Debug, Clone)]
pub(crate) struct Header {
    pub(crate) kind: FileKind,
    pub(crate) version: Version,
    pub(crate) engine_version: String,
    pub(crate) encoding: String,
    /// Key 字符串零终止符及长度字段使用的编码单元宽度。
    pub(crate) unit_width: usize,
    pub(crate) encrypted: u8,
    pub(crate) key_case_sensitive: bool,
    pub(crate) strip_key: bool,
    pub(crate) sorting_locale: String,
    pub(crate) uuid: String,
    pub(crate) register_by: Option<String>,
    pub(crate) reg_code: Option<String>,
    pub(crate) title: String,
    pub(crate) description: String,
    pub(crate) format: String,
    pub(crate) style_sheet: String,
    pub(crate) attributes: BTreeMap<String, String>,
    pub(crate) warnings: Vec<Warning>,
    pub(crate) raw_xml: String,
}

/// 读取、校验并解析 MDict 通用 Header。
pub(crate) fn parse(source: &MappedSource, limits: Limits) -> Result<(Header, u64)> {
    let mut cursor = BinaryCursor::new(source.bytes(), 0, source.path());
    let length = u64::from(cursor.be_u32("header length")?);
    limit("header size", length, limits.maximum_header_size)?;
    let length_usize = usize::try_from(length).map_err(|_| Error::LimitExceeded {
        name: "header size",
        actual: length,
        maximum: usize::MAX as u64,
    })?;
    let raw = cursor.take(length_usize, "header XML")?;
    let expected = cursor.le_u32("header checksum")?;
    let actual = adler2::adler32_slice(raw);
    if actual != expected {
        return Err(Error::Checksum {
            offset: 4 + length,
            expected,
            actual,
        });
    }

    let decoded = if raw.len() >= 2 && raw[0] == b'<' && raw[1] == 0 {
        UTF_16LE
            .decode_without_bom_handling_and_without_replacement(raw)
            .map(|value| value.into_owned())
    } else {
        UTF_8
            .decode_without_bom_handling_and_without_replacement(raw)
            .map(|value| value.into_owned())
    }
    .ok_or_else(|| Error::Encoding {
        offset: 4,
        encoding: "header UTF-8/UTF-16LE".into(),
    })?;
    let raw_xml = decoded.trim_end_matches('\0').to_owned();
    let (root, attributes, mut warnings) = parse_attributes(&raw_xml, source)?;

    let engine_version = attributes
        .get("RequiredEngineVersion")
        .or_else(|| attributes.get("GeneratedByEngineVersion"))
        .cloned()
        .unwrap_or_else(|| "2.0".into());
    let number = engine_version.parse::<f32>().map_err(|error| {
        Error::invalid(
            source.path(),
            4,
            format!("invalid engine version {engine_version:?}: {error}"),
        )
    })?;
    let version = if (1.0..2.0).contains(&number) {
        Version::V1
    } else if (2.0..3.0).contains(&number) {
        Version::V2
    } else if (3.0..4.0).contains(&number) {
        Version::V3
    } else {
        return Err(Error::unsupported(format!("MDict engine version {number}")));
    };

    let content_type = value(&attributes, "ContentType");
    let kind = if root.eq_ignore_ascii_case("Library_Data")
        || content_type.eq_ignore_ascii_case("Binary")
    {
        FileKind::Mdd
    } else {
        FileKind::Mdx
    };
    let raw_encoding = value(&attributes, "Encoding");
    let default_encoding = match (version, kind) {
        (Version::V3, _) | (_, FileKind::Mdx) => "UTF-8",
        (_, FileKind::Mdd) => "UTF-16LE",
    };
    let encoding = validate_label(if raw_encoding.is_empty() {
        default_encoding
    } else {
        &raw_encoding
    })?;
    let unit_width = unit_width(&encoding);
    let encrypted = value(&attributes, "Encrypted");
    let encrypted = if encrypted.is_empty() || encrypted.eq_ignore_ascii_case("no") {
        0
    } else if encrypted.eq_ignore_ascii_case("yes") {
        1
    } else {
        encrypted.parse::<u8>().map_err(|error| {
            Error::invalid(
                source.path(),
                4,
                format!("invalid Encrypted={encrypted:?}: {error}"),
            )
        })?
    };
    let v2_mdd = version != Version::V3 && kind == FileKind::Mdd;
    let key_case_sensitive = bool_value(&attributes, "KeyCaseSensitive", v2_mdd);
    let strip_key = bool_value(
        &attributes,
        if attributes.contains_key("StripKey") {
            "StripKey"
        } else {
            "Stripkey"
        },
        !v2_mdd,
    );
    if version == Version::V3 && value(&attributes, "UUID").is_empty() {
        warnings.push(Warning {
            message: "v3 Header has an empty UUID".into(),
        });
    }

    Ok((
        Header {
            kind,
            version,
            engine_version,
            encoding,
            unit_width,
            encrypted,
            key_case_sensitive,
            strip_key,
            sorting_locale: value(&attributes, "DefaultSortingLocale"),
            uuid: value(&attributes, "UUID"),
            register_by: non_empty(value(&attributes, "RegisterBy")),
            reg_code: non_empty(value(&attributes, "RegCode")),
            title: value(&attributes, "Title"),
            description: value(&attributes, "Description"),
            format: if version == Version::V3 {
                content_type
            } else {
                value(&attributes, "Format")
            },
            style_sheet: value(&attributes, "StyleSheet"),
            attributes,
            warnings,
            raw_xml,
        },
        cursor.offset(),
    ))
}

/// 读取 Header XML 根节点名称、属性和可恢复警告。
fn parse_attributes(
    xml: &str,
    source: &MappedSource,
) -> Result<(String, BTreeMap<String, String>, Vec<Warning>)> {
    let mut reader = Reader::from_str(xml);
    let mut attributes = BTreeMap::new();
    let mut warnings = Vec::new();
    loop {
        match reader.read_event() {
            Ok(Event::Start(element)) | Ok(Event::Empty(element)) => {
                let root = String::from_utf8_lossy(element.name().as_ref()).into_owned();
                for attribute in element.attributes() {
                    let attribute = attribute.map_err(|error| {
                        Error::invalid(
                            source.path(),
                            4,
                            format!("invalid Header attribute: {error}"),
                        )
                    })?;
                    let key = std::str::from_utf8(attribute.key.as_ref()).map_err(|error| {
                        Error::invalid(
                            source.path(),
                            4,
                            format!("invalid Header attribute name: {error}"),
                        )
                    })?;
                    let raw =
                        reader
                            .decoder()
                            .decode(attribute.value.as_ref())
                            .map_err(|error| {
                                Error::invalid(
                                    source.path(),
                                    4,
                                    format!("invalid Header attribute {key}: {error}"),
                                )
                            })?;
                    let (decoded, preserved) = decode_entities_lenient(&raw);
                    if preserved {
                        warnings.push(Warning {
                            message: format!("Header attribute {key:?} contains an unknown entity"),
                        });
                    }
                    attributes.insert(key.to_owned(), decoded);
                }
                return Ok((root, attributes, warnings));
            }
            Ok(Event::Eof) => {
                return Err(Error::invalid(
                    source.path(),
                    4,
                    "Header XML has no root element",
                ));
            }
            Ok(_) => {}
            Err(error) => {
                return Err(Error::invalid(
                    source.path(),
                    4,
                    format!("invalid Header XML: {error}"),
                ));
            }
        }
    }
}

/// 尽可能解码实体，无法识别的实体保持原样并返回警告标志。
pub(crate) fn decode_entities_lenient(value: &str) -> (String, bool) {
    let mut decoded = String::with_capacity(value.len());
    let mut remaining = value;
    let mut preserved = false;
    while let Some(start) = remaining.find('&') {
        decoded.push_str(&remaining[..start]);
        let candidate = &remaining[start..];
        match candidate.find(';') {
            Some(end) => {
                let entity = &candidate[..=end];
                match unescape(entity) {
                    Ok(value) => decoded.push_str(&value),
                    Err(_) => {
                        decoded.push_str(entity);
                        preserved = true;
                    }
                }
                remaining = &candidate[end + 1..];
            }
            None => {
                decoded.push_str(candidate);
                remaining = "";
                preserved = true;
            }
        }
    }
    decoded.push_str(remaining);
    (decoded, preserved)
}

/// 读取字符串属性，不存在时返回空字符串。
fn value(attributes: &BTreeMap<String, String>, key: &str) -> String {
    attributes.get(key).cloned().unwrap_or_default()
}

/// 读取 MDict 的 Yes/No 或 1/0 布尔属性。
fn bool_value(attributes: &BTreeMap<String, String>, key: &str, default: bool) -> bool {
    match attributes.get(key).map(|value| value.as_str()) {
        Some(value) if value.eq_ignore_ascii_case("yes") || value == "1" => true,
        Some(value) if value.eq_ignore_ascii_case("no") || value == "0" => false,
        _ => default,
    }
}

/// 将空字符串转换为 `None`。
fn non_empty(value: String) -> Option<String> {
    (!value.is_empty()).then_some(value)
}
