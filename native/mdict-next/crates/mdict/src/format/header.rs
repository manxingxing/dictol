use std::collections::BTreeMap;

use encoding_rs::UTF_16LE;
use nom::Parser;
use nom::bytes::complete::take;
use nom::number::complete::{be_u32, le_u32};
use quick_xml::Reader;
use quick_xml::escape::unescape;
use quick_xml::events::Event;

use crate::encoding::validate_label;
use crate::model::{FileKind, Header, Limits, MdictVersion};
use crate::{Error, Result};

/// 解析文件开头的“XML 字节长度 + XML 数据 + 校验和”物理结构。
fn parse_header_bytes(input: &[u8]) -> nom::IResult<&[u8], (&[u8], u32)> {
    let (input, byte_length) = be_u32(input)?;
    let (input, xml) = take(byte_length).parse(input)?;
    let (input, checksum) = le_u32(input)?;
    Ok((input, (xml, checksum)))
}

/// 解析并校验 MDict 通用文件头。
///
/// 此阶段确定格式版本、文本编码、加密标志及查找行为；v2/v3 的区段解析
/// 会在文件头完成后再由上层分派。返回 Header 及紧随其后的 key section 起始偏移。
pub(crate) fn parse(input: &[u8], kind: FileKind, limits: Limits) -> Result<(Header, u64)> {
    // 先按物理布局取出原始 UTF-16LE XML，并限制大小、验证 Adler-32 校验和。
    let (_, (xml_bytes, expected_checksum)) =
        parse_header_bytes(input).map_err(|_| Error::invalid(0, "truncated header section"))?;
    let header_size = xml_bytes.len() as u64;
    if header_size > limits.maximum_header_size {
        return Err(Error::LimitExceeded(format!(
            "header size {header_size} exceeds {}",
            limits.maximum_header_size
        )));
    }
    let checksum = adler2::adler32_slice(xml_bytes);
    if checksum != expected_checksum {
        return Err(Error::invalid(
            4,
            format!(
                "header checksum mismatch: expected 0x{expected_checksum:08x}, got 0x{checksum:08x}"
            ),
        ));
    }
    if xml_bytes.len() % 2 != 0 {
        return Err(Error::invalid(4, "UTF-16LE header has an odd byte length"));
    }

    // MDict 头部固定使用 UTF-16LE，与词条正文在 Encoding 属性中声明的编码无关。
    let raw_xml = UTF_16LE
        .decode_without_bom_handling_and_without_replacement(xml_bytes)
        .ok_or_else(|| Error::invalid(4, "invalid UTF-16LE header"))?
        .trim_end_matches('\0')
        .to_owned();
    let (attributes, warnings) = parse_attributes(&raw_xml)?;

    // 将松散的 XML 字符串属性收敛为带类型的公共模型，并在这里划定版本边界。
    let engine_version = parse_float(&attributes, "GeneratedByEngineVersion")?.unwrap_or(2.0);
    let version = if (2.0..3.0).contains(&engine_version) {
        MdictVersion::V2
    } else if (3.0..4.0).contains(&engine_version) {
        MdictVersion::V3
    } else {
        return Err(Error::Unsupported(format!(
            "MDict engine version {engine_version}"
        )));
    };
    let encrypted = parse_encrypted(&attributes)?;
    let raw_encoding = attributes.get("Encoding").map(String::as_str).unwrap_or("");
    let encoding = match (kind, raw_encoding.is_empty()) {
        (FileKind::Mdd, true) => "UTF-16LE".to_string(),
        (FileKind::Mdx, true) => "UTF-8".to_string(),
        _ => validate_label(raw_encoding)?,
    };

    Ok((
        Header {
            version,
            engine_version,
            required_version: parse_float(&attributes, "RequiredEngineVersion")?,
            encoding,
            encrypted,
            title: attribute(&attributes, "Title"),
            description: attribute(&attributes, "Description"),
            format: attribute(&attributes, "Format"),
            key_case_sensitive: yes(&attributes, "KeyCaseSensitive"),
            strip_key: yes(&attributes, "StripKey") || yes(&attributes, "Stripkey"),
            attributes,
            warnings,
            raw_xml,
        },
        4 + header_size + 4,
    ))
}

/// 解析 `Encrypted` 属性，兼容数字值以及大小写不敏感的 yes/no。
fn parse_encrypted(attributes: &BTreeMap<String, String>) -> Result<u8> {
    match attributes
        .get("Encrypted")
        .map(String::as_str)
        .unwrap_or("0")
    {
        value if value.eq_ignore_ascii_case("no") => Ok(0),
        value if value.eq_ignore_ascii_case("yes") => Ok(1),
        value => value
            .parse::<u8>()
            .map_err(|error| Error::invalid(4, format!("invalid Encrypted={value:?}: {error}"))),
    }
}

/// 将可选 XML 属性解析为浮点数。
fn parse_float(attributes: &BTreeMap<String, String>, key: &str) -> Result<Option<f32>> {
    attributes
        .get(key)
        .map(|value| {
            value
                .parse()
                .map_err(|error| Error::invalid(4, format!("invalid {key}={value:?}: {error}")))
        })
        .transpose()
}

/// 读取字符串属性；属性不存在时返回空字符串。
fn attribute(attributes: &BTreeMap<String, String>, key: &str) -> String {
    attributes.get(key).cloned().unwrap_or_default()
}

/// 判断指定属性是否为大小写不敏感的 `yes`。
fn yes(attributes: &BTreeMap<String, String>, key: &str) -> bool {
    attributes
        .get(key)
        .is_some_and(|value| value.eq_ignore_ascii_case("yes"))
}

/// 读取 Header XML 根元素的全部属性。
///
/// 未知或损坏的实体不会让整个字典无法打开，而是保留原文并写入警告列表。
fn parse_attributes(xml: &str) -> Result<(BTreeMap<String, String>, Vec<String>)> {
    let mut attributes = BTreeMap::new();
    let mut warnings = Vec::new();
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    // Header 的有效信息全部位于第一个根元素的属性上，无需建立完整 XML 树。
    loop {
        match reader.read_event() {
            Ok(Event::Start(element)) | Ok(Event::Empty(element)) => {
                for attribute in element.attributes() {
                    let attribute = attribute.map_err(|error| {
                        Error::invalid(4, format!("invalid Header XML attribute: {error}"))
                    })?;
                    let key = std::str::from_utf8(attribute.key.as_ref()).map_err(|error| {
                        Error::invalid(4, format!("invalid Header XML attribute name: {error}"))
                    })?;
                    let value =
                        reader
                            .decoder()
                            .decode(attribute.value.as_ref())
                            .map_err(|error| {
                                Error::invalid(
                                    4,
                                    format!("invalid Header XML attribute {key:?}: {error}"),
                                )
                            })?;
                    let (value, preserved) = decode_entities_lenient(&value);
                    if preserved {
                        warnings.push(format!(
                            "Header attribute {key:?} contains an unknown or malformed entity"
                        ));
                    }
                    attributes.insert(key.to_string(), value);
                }
                return Ok((attributes, warnings));
            }
            Ok(Event::Eof) => {
                return Err(Error::invalid(4, "Header XML has no root element"));
            }
            Ok(_) => {}
            Err(error) => return Err(Error::invalid(4, format!("invalid Header XML: {error}"))),
        }
    }
}

/// 尽可能解码 XML 实体；无法识别的片段原样保留并通过布尔值报告。
fn decode_entities_lenient(value: &str) -> (String, bool) {
    let mut decoded = String::with_capacity(value.len());
    let mut remaining = value;
    let mut preserved = false;
    // 逐个处理 `&...;`，同时识别嵌套的 `&` 和缺失分号等非标准输入。
    while let Some(start) = remaining.find('&') {
        decoded.push_str(&remaining[..start]);
        let candidate = &remaining[start..];
        let next_amp = candidate[1..].find('&').map(|index| index + 1);
        let end = candidate[1..].find(';').map(|index| index + 1);
        match (end, next_amp) {
            (Some(end), Some(next)) if next < end => {
                decoded.push_str(&candidate[..next]);
                remaining = &candidate[next..];
                preserved = true;
            }
            (Some(end), _) => {
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
            (None, Some(next)) => {
                decoded.push_str(&candidate[..next]);
                remaining = &candidate[next..];
                preserved = true;
            }
            (None, None) => {
                decoded.push_str(candidate);
                remaining = "";
                preserved = true;
            }
        }
    }
    decoded.push_str(remaining);
    (decoded, preserved)
}
