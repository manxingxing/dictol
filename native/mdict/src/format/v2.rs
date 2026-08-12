use std::fs;
use std::path::Path;

use zeroize::Zeroizing;

use crate::block;
use crate::block::crypto::{decode_hex, fast_decrypt, ripemd128, salsa8};
use crate::comparison::KeyComparison;
use crate::encoding::decode_strict;
use crate::format::cursor::BinaryCursor;
use crate::format::directory::{
    BlockEnvelope, KeyBlock, KeyBlockId, KeyDirectory, RecordBlock, RecordBlockId, RecordDirectory,
};
use crate::format::{Header, OpenedFormat, checked_add, limit};
use crate::model::{EncryptionSummary, Metadata, Version};
use crate::options::OpenOptions;
use crate::source::MappedSource;
use crate::{Error, Result};

struct KeyParameters {
    block_count: u64,
    entry_count: u64,
    index_decoded_size: u64,
    index_encoded_size: u64,
    blocks_encoded_size: u64,
}

/// 把 v1/v2 section 布局解析为统一的私有 Key/Record 目录。
pub(crate) fn parse(
    source: &MappedSource,
    path: &Path,
    mut header: Header,
    body_start: u64,
    options: &OpenOptions,
) -> Result<OpenedFormat> {
    let crypto_key = Zeroizing::new(resolve_crypto_key(path, &header, options)?);
    let mut comparison_warnings = Vec::new();
    let comparison = KeyComparison::from_header(&header, &mut comparison_warnings)?;
    header.warnings.extend(comparison_warnings);

    let (parameters, key_index_start) =
        parse_key_parameters(source, &header, body_start, options, crypto_key.as_slice())?;
    limit(
        "key block count",
        parameters.block_count,
        options.limits.maximum_block_count,
    )?;
    limit(
        "decoded key index size",
        parameters.index_decoded_size,
        options.limits.maximum_index_decompressed_size,
    )?;

    let key_index_end = checked_add(
        path,
        key_index_start,
        parameters.index_encoded_size,
        "key block index",
    )?;
    let key_index_span = source.span(key_index_start, key_index_end, "key block index")?;
    let raw_index = source.slice(key_index_span);
    let decrypted_index;
    let raw_index = if header.version == Version::V2 && header.encrypted & 2 != 0 {
        if raw_index.len() < 8 {
            return Err(Error::invalid(
                path,
                key_index_start,
                "encrypted key index is truncated",
            ));
        }
        let mut key_source = [0_u8; 8];
        key_source[..4].copy_from_slice(&raw_index[4..8]);
        key_source[4..].copy_from_slice(&[0x95, 0x36, 0, 0]);
        let key = ripemd128(&key_source);
        decrypted_index = [
            raw_index[..8].to_vec(),
            fast_decrypt(&raw_index[8..], &key)?,
        ]
        .concat();
        decrypted_index.as_slice()
    } else {
        raw_index
    };
    let decoded_index = if header.version == Version::V1 {
        if raw_index.len() != usize::try_from(parameters.index_decoded_size).unwrap_or(usize::MAX) {
            return Err(Error::invalid(
                path,
                key_index_start,
                "v1 key index size does not match its declared size",
            ));
        }
        raw_index.to_vec()
    } else {
        block::decode(
            &BlockEnvelope::V2(header.version),
            raw_index,
            usize::try_from(parameters.index_decoded_size).map_err(|_| Error::LimitExceeded {
                name: "decoded key index size",
                actual: parameters.index_decoded_size,
                maximum: usize::MAX as u64,
            })?,
            crypto_key.as_slice(),
            path,
            key_index_start,
            options.limits,
        )?
        .to_vec()
    };

    let key_blocks_start = key_index_end;
    let key_blocks = parse_key_index(
        source,
        path,
        &header,
        &comparison,
        &decoded_index,
        key_index_start,
        key_blocks_start,
        parameters.block_count,
        options,
    )?;
    let key_blocks_end = checked_add(
        path,
        key_blocks_start,
        parameters.blocks_encoded_size,
        "key block data",
    )?;
    source.span(key_blocks_start, key_blocks_end, "key block data")?;
    let indexed_key_end = key_blocks
        .last()
        .map(|block| block.source.end as u64)
        .unwrap_or(key_blocks_start);
    if indexed_key_end != key_blocks_end {
        return Err(Error::invalid(
            path,
            key_blocks_start,
            format!("key block sizes end at {indexed_key_end}, section ends at {key_blocks_end}"),
        ));
    }

    let (record_blocks, record_entry_count, total_record_size) =
        parse_record_section(source, path, &header, key_blocks_end, options)?;
    if record_entry_count != parameters.entry_count {
        return Err(Error::invalid(
            path,
            key_blocks_end,
            format!(
                "key section declares {} entries, record section declares {record_entry_count}",
                parameters.entry_count
            ),
        ));
    }
    let indexed_entries: u64 = key_blocks.iter().map(|block| block.entry_count).sum();
    if indexed_entries != parameters.entry_count {
        return Err(Error::invalid(
            path,
            key_index_start,
            format!(
                "key index describes {indexed_entries} entries, expected {}",
                parameters.entry_count
            ),
        ));
    }

    let binary_searchable = key_blocks_are_monotonic(&key_blocks, &comparison);
    let metadata = Metadata {
        kind: header.kind,
        version: header.version,
        engine_version: header.engine_version.clone(),
        encoding: header.encoding.clone(),
        title: header.title.clone(),
        description: header.description.clone(),
        format: header.format.clone(),
        encryption: EncryptionSummary {
            encrypted: header.encrypted != 0,
            credentials_required: header.encrypted & 1 != 0,
            description: encryption_description(header.encrypted),
        },
        entry_count: parameters.entry_count,
        key_block_count: key_blocks.len() as u64,
        record_block_count: record_blocks.len() as u64,
        attributes: header.attributes.clone(),
        warnings: header.warnings.clone(),
        raw_header: header.raw_xml.clone(),
    };
    let offset_width = if header.version == Version::V1 { 4 } else { 8 };
    Ok(OpenedFormat {
        metadata,
        header,
        key_directory: KeyDirectory {
            blocks: key_blocks,
            binary_searchable,
            offset_width,
        },
        record_directory: RecordDirectory {
            blocks: record_blocks,
            total_decoded_size: total_record_size,
        },
        comparison,
        crypto_key,
    })
}

/// 解析版本相关的 Key Section 参数区并返回索引起点。
fn parse_key_parameters(
    source: &MappedSource,
    header: &Header,
    start: u64,
    _options: &OpenOptions,
    crypto_key: &[u8],
) -> Result<(KeyParameters, u64)> {
    let path = source.path();
    match header.version {
        Version::V1 => {
            let end = checked_add(path, start, 16, "v1 key parameters")?;
            let span = source.span(start, end, "v1 key parameters")?;
            let mut cursor = BinaryCursor::new(source.slice(span), start, path);
            let block_count = u64::from(cursor.be_u32("key block count")?);
            let entry_count = u64::from(cursor.be_u32("entry count")?);
            let index_size = u64::from(cursor.be_u32("key index size")?);
            let blocks_encoded_size = u64::from(cursor.be_u32("key blocks size")?);
            Ok((
                KeyParameters {
                    block_count,
                    entry_count,
                    index_decoded_size: index_size,
                    index_encoded_size: index_size,
                    blocks_encoded_size,
                },
                end,
            ))
        }
        Version::V2 => {
            let parameters_end = checked_add(path, start, 40, "v2 key parameters")?;
            let span = source.span(start, parameters_end, "v2 key parameters")?;
            let encrypted = source.slice(span);
            let decrypted;
            let bytes = if header.encrypted & 1 != 0 {
                if crypto_key.is_empty() {
                    return Err(Error::CredentialRequired {
                        register_by: header.register_by.clone(),
                    });
                }
                decrypted = salsa8(encrypted, crypto_key)?;
                decrypted.as_slice()
            } else {
                encrypted
            };
            let checksum_end = checked_add(path, parameters_end, 4, "v2 key parameters checksum")?;
            let checksum_span =
                source.span(parameters_end, checksum_end, "v2 key parameters checksum")?;
            let expected = u32::from_be_bytes(source.slice(checksum_span).try_into().unwrap());
            let actual = adler2::adler32_slice(bytes);
            if actual != expected {
                return Err(Error::Checksum {
                    offset: parameters_end,
                    expected,
                    actual,
                });
            }
            let mut cursor = BinaryCursor::new(bytes, start, path);
            Ok((
                KeyParameters {
                    block_count: cursor.be_u64("key block count")?,
                    entry_count: cursor.be_u64("entry count")?,
                    index_decoded_size: cursor.be_u64("decoded key index size")?,
                    index_encoded_size: cursor.be_u64("encoded key index size")?,
                    blocks_encoded_size: cursor.be_u64("key blocks size")?,
                },
                checksum_end,
            ))
        }
        Version::V3 => unreachable!(),
    }
}

#[allow(clippy::too_many_arguments)]
/// 解析解压后的 Key Block Index，并累计每块的文件物理范围。
fn parse_key_index(
    source: &MappedSource,
    path: &Path,
    header: &Header,
    comparison: &KeyComparison,
    index: &[u8],
    index_offset: u64,
    blocks_start: u64,
    block_count: u64,
    options: &OpenOptions,
) -> Result<Vec<KeyBlock>> {
    let capacity = usize::try_from(block_count).map_err(|_| Error::LimitExceeded {
        name: "key block count",
        actual: block_count,
        maximum: usize::MAX as u64,
    })?;
    let mut cursor = BinaryCursor::new(index, index_offset, path);
    let mut blocks = Vec::with_capacity(capacity);
    let mut physical_start = blocks_start;
    for id in 0..block_count {
        let entry_count = read_uint(&mut cursor, header.version, "key block entry count")?;
        let first_key = read_boundary_key(&mut cursor, header)?;
        let last_key = read_boundary_key(&mut cursor, header)?;
        let encoded_size = read_uint(&mut cursor, header.version, "key block encoded size")?;
        let decoded_size = read_uint(&mut cursor, header.version, "key block decoded size")?;
        limit(
            "decoded key block size",
            decoded_size,
            options.limits.maximum_block_decompressed_size,
        )?;
        let physical_end = checked_add(path, physical_start, encoded_size, "key block")?;
        let source_span = source.span(physical_start, physical_end, "key block")?;
        let decoded_size = usize::try_from(decoded_size).map_err(|_| Error::LimitExceeded {
            name: "decoded key block size",
            actual: decoded_size,
            maximum: usize::MAX as u64,
        })?;
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
            source: source_span,
            decoded_size,
            envelope: BlockEnvelope::V2(header.version),
        });
        physical_start = physical_end;
    }
    if !cursor.is_empty() {
        return Err(Error::invalid(
            path,
            cursor.offset(),
            format!("key block index has {} trailing bytes", cursor.remaining()),
        ));
    }
    Ok(blocks)
}

/// 读取 Key Block Index 中一个版本相关的首尾边界 key。
fn read_boundary_key(cursor: &mut BinaryCursor<'_>, header: &Header) -> Result<String> {
    let units = match header.version {
        Version::V1 => usize::from(cursor.u8("key boundary length")?),
        Version::V2 => usize::from(cursor.be_u16("key boundary length")?),
        Version::V3 => unreachable!(),
    };
    let width = header.unit_width;
    let byte_length = units.checked_mul(width).ok_or_else(|| {
        Error::invalid(
            cursor.path(),
            cursor.offset(),
            "key boundary length overflows",
        )
    })?;
    let offset = cursor.offset();
    let bytes = cursor.take(byte_length, "key boundary")?;
    if header.version == Version::V2 {
        let terminator = cursor.take(width, "key boundary terminator")?;
        if terminator.iter().any(|byte| *byte != 0) {
            return Err(Error::invalid(
                cursor.path(),
                cursor.offset() - width as u64,
                "non-zero key boundary terminator",
            ));
        }
    }
    decode_strict(bytes, &header.encoding, offset)
}

/// 解析 Record Section Header、Index 和所有物理/逻辑 block 范围。
fn parse_record_section(
    source: &MappedSource,
    path: &Path,
    header: &Header,
    start: u64,
    options: &OpenOptions,
) -> Result<(Vec<RecordBlock>, u64, u64)> {
    let width = match header.version {
        Version::V1 => 4_u64,
        Version::V2 => 8_u64,
        Version::V3 => unreachable!(),
    };
    let header_end = checked_add(path, start, width * 4, "record section header")?;
    let header_span = source.span(start, header_end, "record section header")?;
    let mut cursor = BinaryCursor::new(source.slice(header_span), start, path);
    let block_count = read_uint(&mut cursor, header.version, "record block count")?;
    let entry_count = read_uint(&mut cursor, header.version, "record entry count")?;
    let index_size = read_uint(&mut cursor, header.version, "record index size")?;
    let blocks_size = read_uint(&mut cursor, header.version, "record blocks size")?;
    limit(
        "record block count",
        block_count,
        options.limits.maximum_block_count,
    )?;
    let expected_index_size = block_count
        .checked_mul(width * 2)
        .ok_or_else(|| Error::invalid(path, start, "record block index size overflows"))?;
    if index_size != expected_index_size {
        return Err(Error::invalid(
            path,
            start + width * 2,
            format!("record index has {index_size} bytes, expected {expected_index_size}"),
        ));
    }
    let index_end = checked_add(path, header_end, index_size, "record block index")?;
    let index_span = source.span(header_end, index_end, "record block index")?;
    let mut index_cursor = BinaryCursor::new(source.slice(index_span), header_end, path);
    let mut pairs = Vec::with_capacity(usize::try_from(block_count).unwrap_or(0));
    for _ in 0..block_count {
        pairs.push((
            read_uint(
                &mut index_cursor,
                header.version,
                "record block encoded size",
            )?,
            read_uint(
                &mut index_cursor,
                header.version,
                "record block decoded size",
            )?,
        ));
    }
    let blocks_start = index_end;
    let blocks_end = checked_add(path, blocks_start, blocks_size, "record block data")?;
    source.span(blocks_start, blocks_end, "record block data")?;
    let mut physical_start = blocks_start;
    let mut logical_start = 0_u64;
    let mut blocks = Vec::with_capacity(pairs.len());
    for (index, (encoded_size, decoded_size)) in pairs.into_iter().enumerate() {
        limit(
            "decoded record block size",
            decoded_size,
            options.limits.maximum_block_decompressed_size,
        )?;
        let physical_end = checked_add(path, physical_start, encoded_size, "record block")?;
        let logical_end = checked_add(path, logical_start, decoded_size, "record address space")?;
        blocks.push(RecordBlock {
            id: RecordBlockId(u32::try_from(index).map_err(|_| Error::LimitExceeded {
                name: "record block count",
                actual: index as u64,
                maximum: u64::from(u32::MAX),
            })?),
            source: source.span(physical_start, physical_end, "record block")?,
            logical_start,
            logical_end,
            envelope: BlockEnvelope::V2(header.version),
        });
        physical_start = physical_end;
        logical_start = logical_end;
    }
    if physical_start != blocks_end {
        return Err(Error::invalid(
            path,
            blocks_start,
            format!("record block sizes end at {physical_start}, section ends at {blocks_end}"),
        ));
    }
    Ok((blocks, entry_count, logical_start))
}

/// 按 v2 版本读取一个 u32 或 u64 整数；v1 使用兼容分支。
fn read_uint(cursor: &mut BinaryCursor<'_>, version: Version, context: &str) -> Result<u64> {
    match version {
        Version::V1 => cursor.be_u32(context).map(u64::from),
        Version::V2 => cursor.be_u64(context),
        Version::V3 => unreachable!(),
    }
}

/// 检查 block 首尾边界是否允许安全使用二分候选定位。
fn key_blocks_are_monotonic(blocks: &[KeyBlock], comparison: &KeyComparison) -> bool {
    blocks.iter().all(|block| {
        comparison.compare_boundary(&block.comparison_first_key, &block.last_key)
            != std::cmp::Ordering::Greater
    }) && blocks.windows(2).all(|pair| {
        comparison.compare_boundary(&pair[0].comparison_last_key, &pair[1].last_key)
            != std::cmp::Ordering::Greater
            && comparison.compare_boundary(&pair[0].comparison_first_key, &pair[1].first_key)
                != std::cmp::Ordering::Greater
    })
}

/// 按显式参数、`.key`、Header 的优先级解析注册密钥。
fn resolve_crypto_key(path: &Path, header: &Header, options: &OpenOptions) -> Result<Vec<u8>> {
    if header.encrypted & 1 == 0 {
        return Ok(Vec::new());
    }
    let explicit = options.credentials.reg_code.clone();
    let key_path = options
        .credentials
        .key_file
        .clone()
        .unwrap_or_else(|| path.with_extension("key"));
    let from_file = if explicit.is_none() {
        match fs::read_to_string(&key_path) {
            Ok(value) => Some(value.trim().to_owned()),
            Err(error)
                if error.kind() == std::io::ErrorKind::NotFound
                    && options.credentials.key_file.is_none() =>
            {
                None
            }
            Err(error) => return Err(Error::io(&key_path, error)),
        }
    } else {
        None
    };
    let reg_code = explicit.or(from_file).or_else(|| header.reg_code.clone());
    let Some(reg_code) = reg_code else {
        return Err(Error::CredentialRequired {
            register_by: header.register_by.clone(),
        });
    };
    let user_id =
        options
            .credentials
            .user_id
            .as_deref()
            .ok_or_else(|| Error::CredentialRequired {
                register_by: header.register_by.clone(),
            })?;
    let encrypted_key = decode_hex(reg_code.trim())?;
    salsa8(&encrypted_key, &ripemd128(user_id.as_bytes()))
}

/// 把 v2 `Encrypted` bit flag 转换为人类可读说明。
fn encryption_description(flags: u8) -> String {
    match flags & 3 {
        0 => "not encrypted".into(),
        1 => "key section parameters encrypted".into(),
        2 => "key block index encrypted".into(),
        _ => "key section parameters and key block index encrypted".into(),
    }
}
