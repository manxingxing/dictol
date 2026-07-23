use std::collections::BTreeMap;

use quick_xml::Reader;
use quick_xml::escape::unescape;
use quick_xml::events::Event;

use crate::encoding::validate_label;
use crate::{Error, Result};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FileKind {
    Mdx,
    Mdd,
}

#[derive(Debug, Clone)]
pub struct Header {
    pub engine_version: f32,
    pub required_version: Option<f32>,
    pub encoding: String,
    pub encrypted: u8,
    pub title: String,
    pub description: String,
    pub format: String,
    pub key_case_sensitive: bool,
    pub strip_key: bool,
    pub attributes: BTreeMap<String, String>,
    pub warnings: Vec<String>,
    pub raw_xml: String,
}

pub(crate) fn parse(bytes: &[u8], checksum_bytes: [u8; 4], kind: FileKind) -> Result<Header> {
    let expected_checksum = u32::from_le_bytes(checksum_bytes);
    let actual_checksum = adler2::adler32_slice(bytes);
    if expected_checksum != actual_checksum {
        return Err(Error::InvalidFormat(format!(
            "header checksum mismatch: expected 0x{expected_checksum:08x}, got 0x{actual_checksum:08x}"
        )));
    }

    if !bytes.len().is_multiple_of(2) {
        return Err(Error::InvalidFormat(
            "UTF-16LE header has an odd byte length".into(),
        ));
    }
    let units = bytes
        .chunks_exact(2)
        .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
        .collect::<Vec<_>>();
    let raw_xml = String::from_utf16(&units)
        .map_err(|error| Error::InvalidFormat(format!("invalid UTF-16LE header: {error}")))?
        .trim_end_matches('\0')
        .to_string();
    let (attributes, warnings) = parse_attributes(&raw_xml)?;

    let engine_version = parse_float(&attributes, "GeneratedByEngineVersion")?.unwrap_or(1.0);
    if !(2.0..3.0).contains(&engine_version) {
        return Err(Error::Unsupported(format!(
            "engine version {engine_version}; this parser currently targets v2"
        )));
    }

    let encrypted = match attributes
        .get("Encrypted")
        .map(String::as_str)
        .unwrap_or("0")
    {
        value if value.eq_ignore_ascii_case("no") => 0,
        value if value.eq_ignore_ascii_case("yes") => 1,
        value => value.parse::<u8>().map_err(|error| {
            Error::InvalidFormat(format!("invalid Encrypted value {value:?}: {error}"))
        })?,
    };

    if encrypted & 1 != 0 {
        return Err(Error::Unsupported(
            "encrypted key-block header (Encrypted bit 1)".into(),
        ));
    }

    let raw_encoding = attributes.get("Encoding").map(String::as_str).unwrap_or("");
    let encoding = match (kind, raw_encoding.is_empty()) {
        (FileKind::Mdd, true) => "UTF-16LE".to_string(),
        (FileKind::Mdx, true) => "UTF-8".to_string(),
        _ => validate_label(raw_encoding)?,
    };

    Ok(Header {
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
    })
}

fn parse_float(attributes: &BTreeMap<String, String>, key: &str) -> Result<Option<f32>> {
    attributes
        .get(key)
        .map(|value| {
            value.parse().map_err(|error| {
                Error::InvalidFormat(format!("invalid {key} value {value:?}: {error}"))
            })
        })
        .transpose()
}

fn attribute(attributes: &BTreeMap<String, String>, key: &str) -> String {
    attributes.get(key).cloned().unwrap_or_default()
}

fn yes(attributes: &BTreeMap<String, String>, key: &str) -> bool {
    attributes
        .get(key)
        .is_some_and(|value| value.eq_ignore_ascii_case("yes"))
}

fn parse_attributes(xml: &str) -> Result<(BTreeMap<String, String>, Vec<String>)> {
    let mut attributes = BTreeMap::new();
    let mut warnings = Vec::new();
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    loop {
        match reader.read_event() {
            Ok(Event::Start(element)) | Ok(Event::Empty(element)) => {
                for attribute in element.attributes() {
                    let attribute = attribute.map_err(|error| {
                        Error::InvalidFormat(format!("invalid Header XML attribute: {error}"))
                    })?;
                    let key = std::str::from_utf8(attribute.key.as_ref()).map_err(|error| {
                        Error::InvalidFormat(format!("invalid Header XML attribute name: {error}"))
                    })?;
                    let value =
                        reader
                            .decoder()
                            .decode(attribute.value.as_ref())
                            .map_err(|error| {
                                Error::InvalidFormat(format!(
                                    "invalid Header XML attribute {key:?}: {error}"
                                ))
                            })?;
                    let (value, preserved_invalid_entity) = decode_entities_lenient(&value);
                    if preserved_invalid_entity {
                        warnings.push(format!(
                            "Header XML attribute {key:?} contains an unknown or malformed entity; preserved it verbatim"
                        ));
                    }
                    attributes.insert(key.to_string(), value);
                }
                return Ok((attributes, warnings));
            }
            Ok(Event::Eof) => {
                return Err(Error::InvalidFormat(
                    "Header XML does not contain a root element".into(),
                ));
            }
            Ok(_) => {}
            Err(error) => {
                return Err(Error::InvalidFormat(format!("invalid Header XML: {error}")));
            }
        }
    }
}

fn decode_entities_lenient(value: &str) -> (String, bool) {
    let mut decoded = String::with_capacity(value.len());
    let mut remaining = value;
    let mut preserved_invalid_entity = false;

    while let Some(entity_start) = remaining.find('&') {
        decoded.push_str(&remaining[..entity_start]);
        let candidate = &remaining[entity_start..];
        let next_ampersand = candidate[1..].find('&').map(|index| index + 1);
        let terminator = candidate[1..].find(';').map(|index| index + 1);

        match (terminator, next_ampersand) {
            (Some(end), Some(next)) if next < end => {
                decoded.push_str(&candidate[..next]);
                remaining = &candidate[next..];
                preserved_invalid_entity = true;
            }
            (Some(end), _) => {
                let entity = &candidate[..=end];
                match unescape(entity) {
                    Ok(value) => decoded.push_str(&value),
                    Err(_) => {
                        decoded.push_str(entity);
                        preserved_invalid_entity = true;
                    }
                }
                remaining = &candidate[end + 1..];
            }
            (None, Some(next)) => {
                decoded.push_str(&candidate[..next]);
                remaining = &candidate[next..];
                preserved_invalid_entity = true;
            }
            (None, None) => {
                decoded.push_str(candidate);
                remaining = "";
                preserved_invalid_entity = true;
            }
        }
    }

    decoded.push_str(remaining);
    (decoded, preserved_invalid_entity)
}

#[cfg(test)]
mod tests {
    use super::parse_attributes;

    #[test]
    fn parses_multiline_and_empty_attributes() {
        let (attributes, warnings) =
            parse_attributes("<Dict\nTitle=\"Example\" Encoding=\"\" Encrypted='No'>").unwrap();
        assert_eq!(attributes["Title"], "Example");
        assert_eq!(attributes["Encoding"], "");
        assert_eq!(attributes["Encrypted"], "No");
        assert!(warnings.is_empty());
    }

    #[test]
    fn decodes_xml_entities_in_attributes_once() {
        let (attributes, warnings) = parse_attributes(
            r#"<Dictionary Title="A &amp; B" Description="&lt;b title=&quot;x&quot;&gt;&#20320;&#x597D;&apos;&lt;/b&gt; &amp;lt;"/>"#,
        )
        .unwrap();

        assert_eq!(attributes["Title"], "A & B");
        assert_eq!(attributes["Description"], "<b title=\"x\">你好'</b> &lt;");
        assert!(warnings.is_empty());
    }

    #[test]
    fn decodes_html_entities_and_preserves_invalid_entities() {
        let (attributes, warnings) = parse_attributes(
            r#"<Dictionary Title="a&nbsp;b" Description="&lt;b&gt;&vendorLogo;&#x110000;&unterminated"/>"#,
        )
        .unwrap();

        assert_eq!(attributes["Title"], "a\u{a0}b");
        assert_eq!(
            attributes["Description"],
            "<b>&vendorLogo;&#x110000;&unterminated"
        );
        assert_eq!(warnings.len(), 1);
        assert!(warnings[0].contains("Description"));
    }
}
