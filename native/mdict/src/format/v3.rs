use std::path::Path;

use quick_xml::Reader;
use quick_xml::events::Event;
use zeroize::Zeroizing;

use crate::block;
use crate::block::crypto::v3_uuid_key;
use crate::comparison::KeyComparison;
use crate::encoding::decode_strict;
use crate::format::cursor::BinaryCursor;
use crate::format::directory::{
    BlockEnvelope, KeyBlock, KeyBlockId, KeyDirectory, RecordBlock, RecordBlockId, RecordDirectory,
};
use crate::format::{Header, OpenedFormat, checked_add, limit};
use crate::model::{EncryptionSummary, Metadata};
use crate::options::OpenOptions;
use crate::source::{MappedSource, SourceSpan};
use crate::{Error, Result};

const UNIT_HEADER_SIZE: u64 = 24;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
enum UnitType {
    Content = 1,
    ContentIndex = 2,
    Key = 3,
    KeyIndex = 4,
}

#[derive(Debug)]
struct Unit {
    block_count: u32,
    data: SourceSpan,
    info: Vec<u8>,
    end: u64,
}

/// 把 v3 的四个 Unit 解析为与 v1/v2 共用的私有 Key/Record 目录。
pub(crate) fn parse(
    source: &MappedSource,
    path: &Path,
    mut header: Header,
    body_start: u64,
    options: &OpenOptions,
) -> Result<OpenedFormat> {
    let crypto_key = Zeroizing::new(v3_uuid_key(&header.uuid)?.to_vec());
    let mut comparison_warnings = Vec::new();
    let comparison = KeyComparison::from_header(&header, &mut comparison_warnings)?;
    header.warnings.extend(comparison_warnings);

    let content = parse_unit(
        source,
        path,
        body_start,
        UnitType::Content,
        crypto_key.as_slice(),
        options,
    )?;
    let content_info = parse_xml_attributes(&content.info, path, "RecordData")?;
    let record_count = required_u64(&content_info, path, "recordCount", "RecordData")?;

    let content_index = parse_unit(
        source,
        path,
        content.end,
        UnitType::ContentIndex,
        crypto_key.as_slice(),
        options,
    )?;
    let content_index_info = parse_xml_attributes(&content_index.info, path, "RecordIndex")?;
    let indexed_record_block_count =
        required_u64(&content_index_info, path, "recordCount", "RecordIndex")?;
    if indexed_record_block_count != u64::from(content.block_count) {
        return Err(Error::invalid(
            path,
            content.end,
            format!(
                "Content Unit contains {} blocks, RecordIndex describes {indexed_record_block_count}",
                content.block_count
            ),
        ));
    }
    let record_blocks = parse_record_index(
        source,
        path,
        &content,
        &content_index,
        crypto_key.as_slice(),
        options,
    )?;
    let total_record_size = record_blocks
        .last()
        .map(|block| block.logical_end)
        .unwrap_or(0);

    let key_data = parse_unit(
        source,
        path,
        content_index.end,
        UnitType::Key,
        crypto_key.as_slice(),
        options,
    )?;
    let key_data_info = parse_xml_attributes(&key_data.info, path, "KeyData")?;
    let key_count = required_u64(&key_data_info, path, "keyCount", "KeyData")?;

    let key_index = parse_unit(
        source,
        path,
        key_data.end,
        UnitType::KeyIndex,
        crypto_key.as_slice(),
        options,
    )?;
    let key_index_info = parse_xml_attributes(&key_index.info, path, "KeyBlockIndex")?;
    let key_block_count = required_u64(&key_index_info, path, "blockCount", "KeyBlockIndex")?;
    limit(
        "key block count",
        key_block_count,
        options.limits.maximum_block_count,
    )?;
    let key_blocks = parse_key_index(
        source,
        path,
        &header,
        &comparison,
        &key_data,
        &key_index,
        key_block_count,
        crypto_key.as_slice(),
        options,
    )?;
    let described_key_count: u64 = key_blocks.iter().map(|block| block.entry_count).sum();
    if key_count != described_key_count || key_count != record_count {
        return Err(Error::invalid(
            path,
            key_data.end,
            format!(
                "v3 count mismatch: KeyData={key_count}, KeyBlockIndex={described_key_count}, RecordData={record_count}"
            ),
        ));
    }

    let binary_searchable = key_blocks_are_monotonic(&key_blocks, &comparison);
    let encrypted = header.encrypted != 0
        || units_contain_encryption(source, [&content, &content_index, &key_data, &key_index]);
    let metadata = Metadata {
        kind: header.kind,
        version: header.version,
        engine_version: header.engine_version.clone(),
        encoding: header.encoding.clone(),
        title: header.title.clone(),
        description: header.description.clone(),
        format: header.format.clone(),
        encryption: EncryptionSummary {
            encrypted,
            credentials_required: false,
            description: if encrypted {
                "v3 UUID-derived block encryption".into()
            } else {
                "not encrypted".into()
            },
        },
        entry_count: key_count,
        key_block_count: key_blocks.len() as u64,
        record_block_count: record_blocks.len() as u64,
        attributes: header.attributes.clone(),
        warnings: header.warnings.clone(),
        raw_header: header.raw_xml.clone(),
    };
    Ok(OpenedFormat {
        metadata,
        header,
        key_directory: KeyDirectory {
            blocks: key_blocks,
            binary_searchable,
            offset_width: 8,
        },
        record_directory: RecordDirectory {
            blocks: record_blocks,
            total_decoded_size: total_record_size,
        },
        comparison,
        crypto_key,
    })
}

/// 读取一个 Unit Header、数据区和尾部 Data Info Storage Block。
fn parse_unit(
    source: &MappedSource,
    path: &Path,
    start: u64,
    expected_type: UnitType,
    crypto_key: &[u8],
    options: &OpenOptions,
) -> Result<Unit> {
    let header_end = checked_add(path, start, UNIT_HEADER_SIZE, "v3 unit header")?;
    let header_span = source.span(start, header_end, "v3 unit header")?;
    let mut cursor = BinaryCursor::new(source.slice(header_span), start, path);
    let unit_type = match cursor.u8("v3 unit type")? {
        1 => UnitType::Content,
        2 => UnitType::ContentIndex,
        3 => UnitType::Key,
        4 => UnitType::KeyIndex,
        value => {
            return Err(Error::invalid(
                path,
                start,
                format!("unknown v3 Unit Type {value}"),
            ));
        }
    };
    if unit_type != expected_type {
        return Err(Error::invalid(
            path,
            start,
            format!("expected {:?} Unit, found {:?}", expected_type, unit_type),
        ));
    }
    cursor.skip(3, "v3 unit reserved bytes")?;
    let declared_remainder = cursor.be_u64("v3 unit total length")?;
    let block_count = cursor.be_u32("v3 unit block count")?;
    limit(
        "v3 unit block count",
        u64::from(block_count),
        options.limits.maximum_block_count,
    )?;
    let data_length = cursor.be_u64("v3 unit data length")?;
    let data_end = checked_add(path, header_end, data_length, "v3 unit data")?;
    let data = source.span(header_end, data_end, "v3 unit data")?;
    let (info_span, info_decoded_size, end) =
        storage_span(source, path, data_end, "v3 unit data info")?;
    limit(
        "decoded v3 unit info size",
        info_decoded_size as u64,
        options.limits.maximum_index_decompressed_size,
    )?;
    let info = block::decode(
        &BlockEnvelope::V3,
        source.slice(info_span),
        info_decoded_size,
        crypto_key,
        path,
        data_end,
        options.limits,
    )?
    .to_vec();
    let actual_remainder = end.saturating_sub(start + 12);
    if declared_remainder != 0 && declared_remainder != actual_remainder {
        return Err(Error::invalid(
            path,
            start + 4,
            format!(
                "v3 unit length declares {declared_remainder}, actual remainder is {actual_remainder}"
            ),
        ));
    }
    Ok(Unit {
        block_count,
        data,
        info,
        end,
    })
}

/// 读取 Storage Block 的两个长度字段并建立完整物理范围。
fn storage_span(
    source: &MappedSource,
    path: &Path,
    start: u64,
    context: &str,
) -> Result<(SourceSpan, usize, u64)> {
    let prefix_end = checked_add(path, start, 8, context)?;
    let prefix = source.span(start, prefix_end, context)?;
    let bytes = source.slice(prefix);
    let decoded_size = u32::from_be_bytes(bytes[..4].try_into().unwrap()) as usize;
    let encoded_size = u64::from(u32::from_be_bytes(bytes[4..8].try_into().unwrap()));
    if encoded_size < 8 {
        return Err(Error::invalid(
            path,
            start + 4,
            format!("{context} encoded size is smaller than its envelope"),
        ));
    }
    let end = checked_add(path, prefix_end, encoded_size, context)?;
    Ok((source.span(start, end, context)?, decoded_size, end))
}

/// 解码 Content Block Index Storage Block 并构造 RecordDirectory。
fn parse_record_index(
    source: &MappedSource,
    path: &Path,
    content: &Unit,
    index: &Unit,
    crypto_key: &[u8],
    options: &OpenOptions,
) -> Result<Vec<RecordBlock>> {
    let (index_block, decoded_size, index_end) = storage_span(
        source,
        path,
        index.data.start as u64,
        "v3 record block index",
    )?;
    if index_end != index.data.end as u64 {
        return Err(Error::invalid(
            path,
            index_end,
            "v3 RecordIndex data section must contain exactly one Storage Block",
        ));
    }
    limit(
        "decoded record index size",
        decoded_size as u64,
        options.limits.maximum_index_decompressed_size,
    )?;
    let decoded = block::decode(
        &BlockEnvelope::V3,
        source.slice(index_block),
        decoded_size,
        crypto_key,
        path,
        index.data.start as u64,
        options.limits,
    )?;
    let mut cursor = BinaryCursor::new(&decoded, index.data.start as u64, path);
    let mut physical_start = content.data.start as u64;
    let mut logical_start = 0_u64;
    let mut blocks = Vec::with_capacity(content.block_count as usize);
    for id in 0..content.block_count {
        let encoded_size = cursor.be_u64("v3 record block encoded size")?;
        let decoded_size = cursor.be_u64("v3 record block decoded size")?;
        limit(
            "decoded record block size",
            decoded_size,
            options.limits.maximum_block_decompressed_size,
        )?;
        let physical_end = checked_add(path, physical_start, encoded_size, "v3 record block")?;
        let logical_end =
            checked_add(path, logical_start, decoded_size, "v3 record address space")?;
        blocks.push(RecordBlock {
            id: RecordBlockId(id),
            source: source.span(physical_start, physical_end, "v3 record block")?,
            logical_start,
            logical_end,
            envelope: BlockEnvelope::V3,
        });
        physical_start = physical_end;
        logical_start = logical_end;
    }
    if !cursor.is_empty() {
        return Err(Error::invalid(
            path,
            cursor.offset(),
            format!("v3 RecordIndex has {} trailing bytes", cursor.remaining()),
        ));
    }
    if physical_start != content.data.end as u64 {
        return Err(Error::invalid(
            path,
            content.data.start as u64,
            "v3 RecordIndex block lengths do not cover the Content Unit",
        ));
    }
    Ok(blocks)
}

#[allow(clippy::too_many_arguments)]
/// 解码 Key Block Index Storage Block 并构造 KeyDirectory 的 block 描述。
fn parse_key_index(
    source: &MappedSource,
    path: &Path,
    header: &Header,
    comparison: &KeyComparison,
    key_data: &Unit,
    index: &Unit,
    block_count: u64,
    crypto_key: &[u8],
    options: &OpenOptions,
) -> Result<Vec<KeyBlock>> {
    let (index_block, decoded_size, index_end) =
        storage_span(source, path, index.data.start as u64, "v3 key block index")?;
    if index_end != index.data.end as u64 {
        return Err(Error::invalid(
            path,
            index_end,
            "v3 KeyBlockIndex data section must contain exactly one Storage Block",
        ));
    }
    limit(
        "decoded key index size",
        decoded_size as u64,
        options.limits.maximum_index_decompressed_size,
    )?;
    let decoded = block::decode(
        &BlockEnvelope::V3,
        source.slice(index_block),
        decoded_size,
        crypto_key,
        path,
        index.data.start as u64,
        options.limits,
    )?;
    let mut cursor = BinaryCursor::new(&decoded, index.data.start as u64, path);
    let mut physical_start = key_data.data.start as u64;
    let mut blocks = Vec::with_capacity(usize::try_from(block_count).unwrap_or(0));
    for id in 0..block_count {
        let entry_count = u64::from(cursor.be_u32("v3 key block entry count")?);
        let first_key = read_boundary_key(&mut cursor, header)?;
        let last_key = read_boundary_key(&mut cursor, header)?;
        let encoded_size = u64::from(cursor.be_u32("v3 key block encoded size")?);
        let decoded_size_u64 = u64::from(cursor.be_u32("v3 key block decoded size")?);
        limit(
            "decoded key block size",
            decoded_size_u64,
            options.limits.maximum_block_decompressed_size,
        )?;
        let physical_end = checked_add(path, physical_start, encoded_size, "v3 key block")?;
        blocks.push(KeyBlock {
            id: KeyBlockId(u32::try_from(id).map_err(|_| Error::LimitExceeded {
                name: "key block count",
                actual: id,
                maximum: u64::from(u32::MAX),
            })?),
            entry_count,
            comparison_first_key: comparison.normalize(&first_key),
            comparison_last_key: comparison.normalize(&last_key),
            first_key,
            last_key,
            source: source.span(physical_start, physical_end, "v3 key block")?,
            decoded_size: usize::try_from(decoded_size_u64).map_err(|_| Error::LimitExceeded {
                name: "decoded key block size",
                actual: decoded_size_u64,
                maximum: usize::MAX as u64,
            })?,
            envelope: BlockEnvelope::V3,
        });
        physical_start = physical_end;
    }
    if !cursor.is_empty() {
        return Err(Error::invalid(
            path,
            cursor.offset(),
            format!("v3 KeyBlockIndex has {} trailing bytes", cursor.remaining()),
        ));
    }
    if physical_start != key_data.data.end as u64 {
        return Err(Error::invalid(
            path,
            key_data.data.start as u64,
            "v3 KeyBlockIndex block lengths do not cover the Key Unit",
        ));
    }
    Ok(blocks)
}

/// 读取 v3 Key Block descriptor 中带 u16 长度和零终止符的 key。
fn read_boundary_key(cursor: &mut BinaryCursor<'_>, header: &Header) -> Result<String> {
    let width = header.unit_width;
    let units = usize::from(cursor.be_u16("v3 key boundary length")?);
    let byte_length = units
        .checked_mul(width)
        .ok_or_else(|| Error::invalid(cursor.path(), cursor.offset(), "v3 key length overflows"))?;
    let offset = cursor.offset();
    let bytes = cursor.take(byte_length, "v3 key boundary")?;
    let terminator = cursor.take(width, "v3 key boundary terminator")?;
    if terminator.iter().any(|byte| *byte != 0) {
        return Err(Error::invalid(
            cursor.path(),
            cursor.offset() - width as u64,
            "non-zero v3 key boundary terminator",
        ));
    }
    decode_strict(bytes, &header.encoding, offset)
}

/// 解析 v3 Unit Data Info 的 UTF-8 XML 根节点属性。
fn parse_xml_attributes(
    bytes: &[u8],
    path: &Path,
    expected_root: &str,
) -> Result<Vec<(String, String)>> {
    let bytes = bytes.strip_suffix(&[0]).unwrap_or(bytes);
    let xml = std::str::from_utf8(bytes).map_err(|_| Error::Encoding {
        offset: 0,
        encoding: "UTF-8".into(),
    })?;
    let mut reader = Reader::from_str(xml);
    loop {
        match reader.read_event() {
            Ok(Event::Start(element)) | Ok(Event::Empty(element)) => {
                let root = String::from_utf8_lossy(element.name().as_ref()).into_owned();
                if !root.eq_ignore_ascii_case(expected_root) {
                    return Err(Error::invalid(
                        path,
                        0,
                        format!("expected {expected_root} data info, found {root}"),
                    ));
                }
                let mut attributes = Vec::new();
                for attribute in element.attributes() {
                    let attribute = attribute.map_err(|error| {
                        Error::invalid(
                            path,
                            0,
                            format!("invalid {expected_root} attribute: {error}"),
                        )
                    })?;
                    let key = String::from_utf8_lossy(attribute.key.as_ref()).into_owned();
                    let value = reader
                        .decoder()
                        .decode(attribute.value.as_ref())
                        .map_err(|error| {
                            Error::invalid(
                                path,
                                0,
                                format!("invalid {expected_root}.{key}: {error}"),
                            )
                        })?
                        .into_owned();
                    attributes.push((key, value));
                }
                return Ok(attributes);
            }
            Ok(Event::Eof) => {
                return Err(Error::invalid(
                    path,
                    0,
                    format!("missing {expected_root} data info"),
                ));
            }
            Ok(_) => {}
            Err(error) => {
                return Err(Error::invalid(
                    path,
                    0,
                    format!("invalid {expected_root} XML: {error}"),
                ));
            }
        }
    }
}

/// 从 XML 属性表读取大小写不敏感的必需 `u64` 属性。
fn required_u64(
    attributes: &[(String, String)],
    path: &Path,
    key: &str,
    context: &str,
) -> Result<u64> {
    let value = attributes
        .iter()
        .find(|(candidate, _)| candidate.eq_ignore_ascii_case(key))
        .map(|(_, value)| value)
        .ok_or_else(|| Error::invalid(path, 0, format!("{context} is missing {key}")))?;
    value.parse().map_err(|error| {
        Error::invalid(
            path,
            0,
            format!("invalid {context}.{key}={value:?}: {error}"),
        )
    })
}

/// 检查 v3 Unit 数据区中的任意 Storage Block 是否声明了加密。
fn units_contain_encryption<'a>(
    source: &MappedSource,
    units: impl IntoIterator<Item = &'a Unit>,
) -> bool {
    units
        .into_iter()
        .any(|unit| unit_contains_encryption(source.slice(unit.data), unit.block_count))
}

/// 按 Storage Block 自描述长度遍历 Unit 数据区并检查加密 nibble。
fn unit_contains_encryption(mut bytes: &[u8], block_count: u32) -> bool {
    for _ in 0..block_count {
        let Some(prefix) = bytes.get(..9) else {
            return false;
        };
        if prefix[8] >> 4 != 0 {
            return true;
        }
        let encoded_size = u32::from_be_bytes(prefix[4..8].try_into().unwrap()) as usize;
        let Some(total_size) = encoded_size.checked_add(8) else {
            return false;
        };
        let Some(remaining) = bytes.get(total_size..) else {
            return false;
        };
        bytes = remaining;
    }
    false
}

/// 检查 v3 block 首尾边界是否满足二分候选定位的单调要求。
fn key_blocks_are_monotonic(blocks: &[KeyBlock], comparison: &KeyComparison) -> bool {
    blocks.iter().all(|block| {
        comparison.compare_boundary(&block.comparison_first_key, &block.last_key)
            != std::cmp::Ordering::Greater
    }) && blocks.windows(2).all(|pair| {
        comparison.compare_boundary(&pair[0].comparison_first_key, &pair[1].first_key)
            != std::cmp::Ordering::Greater
            && comparison.compare_boundary(&pair[0].comparison_last_key, &pair[1].last_key)
                != std::cmp::Ordering::Greater
    })
}
