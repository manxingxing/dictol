use std::borrow::Cow;
use std::io::Read;

use flate2::read::ZlibDecoder;
use nom::Parser;
use nom::bytes::complete::take;
use nom::combinator::map;
use nom::multi::count;
use nom::number::complete::{be_u16, be_u32, be_u64, le_u32};
use ripemd::{Digest, Ripemd128};

use crate::codec::Compression;
use crate::codec::fast_decrypt;
use crate::encoding::{decode_strict, unit_width};
use crate::format::comparison_key;
use crate::format::{checked_add, enforce_limit};
use crate::model::{
    ByteRange, Header, KeyBlockId, KeyBlockInfo, KeySectionInfo, Limits, RecordBlockId,
    RecordBlockInfo, RecordSectionInfo,
};
use crate::source::MappedSource;
use crate::{Error, Result};

/// MDict v2 文件中完成查找和读取所需的全部区段布局。
#[derive(Debug)]
pub(crate) struct Layout {
    /// key section 的总览和物理区间。
    pub(crate) key_section_info: KeySectionInfo,
    /// 各 key block 的词条范围、物理位置和解压大小。
    pub(crate) key_blocks_index: Vec<KeyBlockInfo>,
    /// record section 的总览和物理区间。
    pub(crate) record_section_info: RecordSectionInfo,
    /// 各 record block 的物理位置和解压后逻辑区间。
    pub(crate) record_blocks_index: Vec<RecordBlockInfo>,
}

/// v2 key section 固定长度头部中的字段。
#[derive(Debug, Clone, Copy)]
struct KeyHeader {
    /// key block 数量。
    block_count: u64,
    /// 全部 key block 中的词条总数。
    entry_count: u64,
    /// key block info 解压后的字节数。
    index_decompressed_size: u64,
    /// key block info 在文件中占用的压缩字节数。
    index_compressed_size: u64,
    /// 所有 key block 压缩数据的总字节数。
    blocks_compressed_size: u64,
    /// 前 40 字节头部数据的 Adler-32 校验和。
    checksum: u32,
}

/// 解析并校验 44 字节的 v2 key section 头部。
///
/// 验证 checksum 并对各计数/尺寸字段施加资源上限约束。
fn parse_key_header(source: &MappedSource, start: u64, limits: Limits) -> Result<(KeyHeader, u64)> {
    let key_header_end = checked_add(start, 44, "v2 key header")?;
    let key_header_bytes = source.slice(start, key_header_end)?;
    let (_, key_header) = parse_key_header_raw(key_header_bytes)
        .map_err(|_| Error::invalid(start, "invalid v2 key section header"))?;

    let actual_checksum = adler2::adler32_slice(&key_header_bytes[..40]);
    if actual_checksum != key_header.checksum {
        return Err(Error::invalid(
            start + 40,
            format!(
                "key header checksum mismatch: expected 0x{:08x}, got 0x{actual_checksum:08x}",
                key_header.checksum
            ),
        ));
    }
    enforce_limit(
        "key block count",
        key_header.block_count,
        limits.maximum_block_count,
    )?;
    enforce_limit(
        "key index compressed size",
        key_header.index_compressed_size,
        limits.maximum_index_compressed_size,
    )?;
    enforce_limit(
        "key index decompressed size",
        key_header.index_decompressed_size,
        limits.maximum_index_decompressed_size,
    )?;
    Ok((key_header, key_header_end))
}

/// 纯解析 44 字节 key section 头部的字段值，不做校验。
fn parse_key_header_raw(input: &[u8]) -> nom::IResult<&[u8], KeyHeader> {
    map(
        (be_u64, be_u64, be_u64, be_u64, be_u64, be_u32),
        |(
            block_count,
            entry_count,
            index_decompressed_size,
            index_compressed_size,
            blocks_compressed_size,
            checksum,
        )| KeyHeader {
            block_count,
            entry_count,
            index_decompressed_size,
            index_compressed_size,
            blocks_compressed_size,
            checksum,
        },
    )
    .parse(input)
}

/// 解密使用 MDict v2 “加密方式 2”保护的 key block info 数据块。
///
/// 数据块前 8 字节保持原样；其中校验和字节与固定盐共同生成 RIPEMD-128 密钥，
/// 其余载荷再通过 MDict 的快速解密算法还原。
/// offset 参数仅用于生成错误消息
fn decrypt_key_blocks_info(block: &[u8], offset: u64) -> Result<Vec<u8>> {
    if block.len() < 8 {
        return Err(Error::invalid(offset, "encrypted key index is truncated"));
    }

    // 密钥材料由包头中的校验和和 MDict 规定的固定盐拼接而成。
    let mut key_source = [0_u8; 8];
    key_source[..4].copy_from_slice(&block[4..8]);
    key_source[4..].copy_from_slice(&[0x95, 0x36, 0x00, 0x00]);
    let key = Ripemd128::digest(key_source);

    let mut output = Vec::with_capacity(block.len());
    output.extend_from_slice(&block[..8]);
    output.extend_from_slice(&fast_decrypt(&block[8..], &key));
    Ok(output)
}

/// 解析解压后的 key block info，生成每个 key block 的描述信息。
///
/// key_blocks_start： key blocks区在文件中的原始位置(压缩后)
///
/// key block info 只保存每块的大小；本函数从 `key_blocks_start` 开始累加这些大小，
/// 直接生成每个 block 在源文件中的绝对物理区间。
fn parse_key_blocks_index(
    data: &[u8],
    block_count: u64,
    header: &Header,
    source_offset: u64,
    key_blocks_start: u64,
    limits: Limits,
) -> Result<Vec<KeyBlockInfo>> {
    let width = unit_width(&header.encoding);
    let capacity = usize::try_from(block_count)
        .map_err(|_| Error::LimitExceeded("key block count exceeds this platform".into()))?;
    let mut blocks = Vec::with_capacity(capacity);
    let mut input = data;
    let mut curr_block_start = key_blocks_start;

    // 每条描述均包含词条数、首尾 key，以及对应 key block 的压缩/解压大小。
    for index in 0..block_count {
        let before = input.len();
        let (rest, entry_count) = be_u64::<_, nom::error::Error<_>>(input)
            .map_err(|_| Error::invalid(source_offset, "truncated key block entry count"))?;
        let (rest, first_bytes) = key_index_word(rest, width)
            .map_err(|_| Error::invalid(source_offset, "invalid first key in key index"))?;
        let (rest, last_bytes) = key_index_word(rest, width)
            .map_err(|_| Error::invalid(source_offset, "invalid last key in key index"))?;
        let (rest, compressed_size) = be_u64::<_, nom::error::Error<_>>(rest)
            .map_err(|_| Error::invalid(source_offset, "truncated key block compressed size"))?;
        let (rest, decompressed_size) = be_u64::<_, nom::error::Error<_>>(rest)
            .map_err(|_| Error::invalid(source_offset, "truncated key block decompressed size"))?;
        let consumed = before - rest.len();
        let logical_offset = source_offset + (data.len() - input.len()) as u64;
        enforce_limit(
            "first key size",
            first_bytes.len() as u64,
            limits.maximum_key_size,
        )?;
        enforce_limit(
            "last key size",
            last_bytes.len() as u64,
            limits.maximum_key_size,
        )?;
        enforce_limit(
            "key block compressed size",
            compressed_size,
            limits.maximum_block_compressed_size,
        )?;
        enforce_limit(
            "key block decompressed size",
            decompressed_size,
            limits.maximum_block_decompressed_size,
        )?;
        let first_key = decode_strict(first_bytes, &header.encoding, logical_offset)?;
        let last_key = decode_strict(last_bytes, &header.encoding, logical_offset)?;
        let current_block_end = checked_add(curr_block_start, compressed_size, "key block")?;
        blocks.push(KeyBlockInfo {
            id: KeyBlockId(index as u32),
            entry_count,
            comparison_first_key: comparison_key(header, &first_key),
            comparison_last_key: comparison_key(header, &last_key),
            first_key,
            last_key,
            compressed_size,
            source: ByteRange::new(curr_block_start, current_block_end),
            decompressed_size,
        });
        // 下个block的开始
        curr_block_start = current_block_end;
        input = rest;
        debug_assert_eq!(data.len() - input.len(), consumed + (data.len() - before));
    }

    if !input.is_empty() {
        return Err(Error::invalid(
            source_offset + (data.len() - input.len()) as u64,
            format!("key index contains {} trailing bytes", input.len()),
        ));
    }
    Ok(blocks)
}

/// 解析 key block info 中一个带长度、按编码宽度存储且以零结尾的 key。
fn key_index_word(input: &[u8], width: usize) -> nom::IResult<&[u8], &[u8]> {
    let (input, units) = be_u16(input)?;
    let byte_length = usize::from(units).checked_mul(width).ok_or_else(|| {
        nom::Err::Failure(nom::error::Error::new(
            input,
            nom::error::ErrorKind::TooLarge,
        ))
    })?;
    let (input, word) = take(byte_length).parse(input)?;
    let (input, terminator) = take(width).parse(input)?;
    if terminator.iter().any(|byte| *byte != 0) {
        return Err(nom::Err::Failure(nom::error::Error::new(
            terminator,
            nom::error::ErrorKind::Verify,
        )));
    }
    Ok((input, word))
}

/// 解析 v2 数据块的 8 字节包头，返回载荷、压缩方式和期望校验和。
fn parse_v2_envelope(input: &[u8]) -> nom::IResult<&[u8], (Compression, u32)> {
    let (payload, (method, checksum)) = (le_u32, be_u32).parse(input)?;
    let compression = match method {
        0 => Compression::None,
        1 => Compression::Lzo,
        2 => Compression::Zlib,
        _ => {
            return Err(nom::Err::Failure(nom::error::Error::new(
                input,
                nom::error::ErrorKind::Tag,
            )));
        }
    };
    Ok((payload, (compression, checksum)))
}

/// 解码一个 MDict v2 数据块。
///
/// 未压缩的数据直接借用内存映射中的字节；LZO 和 zlib 数据则返回新分配的缓冲区。
/// 函数同时检查声明大小、解压后大小和 Adler-32 校验和。
/// source_offset仅用来生成错误消息
pub(crate) fn decode_v2_block<'a>(
    block: &'a [u8],
    source_offset: u64,
    expected_size: u64,
    maximum_size: u64,
) -> Result<Cow<'a, [u8]>> {
    // 在分配解压缓冲区之前先执行资源限制，避免恶意声明导致超大内存分配。
    if expected_size > maximum_size {
        return Err(Error::LimitExceeded(format!(
            "declared block size {expected_size} exceeds {maximum_size}"
        )));
    }
    let output_size = usize::try_from(expected_size)
        .map_err(|_| Error::LimitExceeded("block is too large for this platform".into()))?;
    let (payload, (compression, expected_checksum)) = parse_v2_envelope(block)
        .map_err(|_| Error::invalid(source_offset, "invalid v2 block envelope"))?;

    // 根据包头选择解码器；None 分支保持零拷贝。
    let output = match compression {
        Compression::None => {
            if payload.len() != output_size {
                return Err(Error::invalid(
                    source_offset,
                    format!(
                        "uncompressed block has {} bytes; expected {output_size}",
                        payload.len()
                    ),
                ));
            }
            Cow::Borrowed(payload)
        }
        Compression::Lzo => {
            let mut output = vec![0_u8; output_size];
            lzo1x::decompress(payload, &mut output).map_err(|error| {
                Error::invalid(
                    source_offset,
                    format!("LZO decompression failed: {error:?}"),
                )
            })?;
            Cow::Owned(output)
        }
        Compression::Zlib => {
            let decoder = ZlibDecoder::new(payload);
            let mut output = Vec::new();
            output.try_reserve_exact(output_size).map_err(|error| {
                Error::LimitExceeded(format!("cannot allocate decompressed block: {error}"))
            })?;
            decoder
                .take(expected_size.saturating_add(1))
                .read_to_end(&mut output)?;
            Cow::Owned(output)
        }
    };

    // 解码器成功并不代表数据完整，还必须核对长度和块级校验和。
    if output.len() != output_size {
        return Err(Error::invalid(
            source_offset,
            format!(
                "decompressed block has {} bytes; expected {output_size}",
                output.len()
            ),
        ));
    }
    let checksum = adler2::adler32_slice(&output);
    if checksum != expected_checksum {
        return Err(Error::invalid(
            source_offset,
            format!(
                "block checksum mismatch: expected 0x{expected_checksum:08x}, got 0x{checksum:08x}"
            ),
        ));
    }
    Ok(output)
}

/// v2 record section 固定长度头部中的字段。
#[derive(Debug, Clone, Copy)]
struct RecordHeader {
    /// record block 数量。
    block_count: u64,
    /// 与 key section 对应的词条总数。
    entry_count: u64,
    /// record block 索引表的字节数。
    index_size: u64,
    /// 所有 record block 压缩数据的总字节数。
    blocks_compressed_size: u64,
}

/// 解析 32 字节的 v2 record section 头部。
fn parse_record_header_raw(input: &[u8]) -> nom::IResult<&[u8], RecordHeader> {
    map(
        (be_u64, be_u64, be_u64, be_u64),
        |(block_count, entry_count, index_size, blocks_compressed_size)| RecordHeader {
            block_count,
            entry_count,
            index_size,
            blocks_compressed_size,
        },
    )
    .parse(input)
}

/// 解析并校验 32 字节的 v2 record section 头部。
///
/// 验证 record block 数量与索引尺寸是否合法。
fn parse_record_header(
    source: &MappedSource,
    record_header_start: u64,
    limits: Limits,
) -> Result<(RecordHeader, u64)> {
    let record_header_end = checked_add(record_header_start, 32, "record header")?;
    let bytes = source.slice(record_header_start, record_header_end)?;
    let (_, record_header) = parse_record_header_raw(bytes)
        .map_err(|_| Error::invalid(record_header_start, "invalid v2 record section header"))?;

    enforce_limit(
        "record block count",
        record_header.block_count,
        limits.maximum_block_count,
    )?;

    let expected_record_index_size = record_header
        .block_count
        .checked_mul(16)
        .ok_or_else(|| Error::invalid(record_header_start, "record index size overflows"))?;
    if record_header.index_size != expected_record_index_size {
        return Err(Error::invalid(
            record_header_start + 16,
            format!(
                "record index has {} bytes; expected {expected_record_index_size}",
                record_header.index_size
            ),
        ));
    }
    enforce_limit(
        "record index size",
        record_header.index_size,
        limits.maximum_index_compressed_size,
    )?;

    Ok((record_header, record_header_end))
}

/// 解析 record block 索引中的一个 16 字节大小对。
fn size_pair(input: &[u8]) -> nom::IResult<&[u8], (u64, u64)> {
    (be_u64, be_u64).parse(input)
}

/// 从文件中读取并解析 record block 索引表。
///
/// 返回未消费的剩余字节、各 block 的 (压缩大小, 解压大小) 列表，以及索引区间的结束偏移。
fn parse_record_block_index(
    source: &MappedSource,
    record_index_start: u64,
    record_header: &RecordHeader,
) -> Result<(Vec<(u64, u64)>, u64)> {
    let record_index_end =
        checked_add(record_index_start, record_header.index_size, "record index")?;
    let record_index_bytes = source.slice(record_index_start, record_index_end)?;
    let block_count = usize::try_from(record_header.block_count)
        .map_err(|_| Error::LimitExceeded("record block count exceeds this platform".into()))?;
    let (remaining, record_blocks_sizes) = count(size_pair, block_count)
        .parse(record_index_bytes)
        .map_err(|_| Error::invalid(record_index_start, "truncated record block index"))?;
    if !remaining.is_empty() {
        return Err(Error::invalid(
            record_index_end - remaining.len() as u64,
            "record index contains trailing bytes",
        ));
    }
    Ok((record_blocks_sizes, record_index_end))
}

/// 根据 record block 大小列表构建各 block 的物理区间与逻辑区间描述。
///
/// 返回 record block 索引、压缩区间的结束位置、累计的解压总大小。
fn build_record_block_index(
    record_blocks_sizes: Vec<(u64, u64)>,
    record_blocks_start: u64,
    limits: Limits,
) -> Result<(Vec<RecordBlockInfo>, u64, u64)> {
    let mut compressed_block_start = record_blocks_start;
    let mut decompressed_block_start = 0_u64;
    let mut record_blocks_index = Vec::with_capacity(record_blocks_sizes.len());
    for (index, (compressed_size, decompressed_size)) in record_blocks_sizes.into_iter().enumerate()
    {
        enforce_limit(
            "record block compressed size",
            compressed_size,
            limits.maximum_block_compressed_size,
        )?;
        enforce_limit(
            "record block decompressed size",
            decompressed_size,
            limits.maximum_block_decompressed_size,
        )?;
        let compressed_block_end =
            checked_add(compressed_block_start, compressed_size, "record block")?;
        let decompressed_block_end = checked_add(
            decompressed_block_start,
            decompressed_size,
            "record logical block",
        )?;
        record_blocks_index.push(RecordBlockInfo {
            id: RecordBlockId(index as u32),
            source: ByteRange::new(compressed_block_start, compressed_block_end),
            decompressed: ByteRange::new(decompressed_block_start, decompressed_block_end),
        });
        compressed_block_start = compressed_block_end;
        decompressed_block_start = decompressed_block_end;
    }
    Ok((
        record_blocks_index,
        compressed_block_start,
        decompressed_block_start,
    ))
}

/// 解析完整的 key section，并返回下一个 section 的起始位置。
struct ParsedKeySection {
    info: KeySectionInfo,
    blocks: Vec<KeyBlockInfo>,
    end: u64,
}

/// 解析完整的 record section。
struct ParsedRecordSection {
    info: RecordSectionInfo,
    blocks: Vec<RecordBlockInfo>,
}

/// 解析并校验完整的 MDict v2 key section。
fn parse_key_section(
    source: &MappedSource,
    header: &Header,
    start: u64,
    limits: Limits,
) -> Result<ParsedKeySection> {
    let (key_header, key_header_end) = parse_key_header(source, start, limits)?;
    let key_block_index_start = key_header_end;
    let key_block_index_end = checked_add( key_block_index_start, key_header.index_compressed_size, "v2 key index")?;
    let key_block_index_bytes = source.slice(key_block_index_start, key_block_index_end)?;

    let decrypted;
    let decrypted_key_blocks_info = if header.encrypted & 2 != 0 {
        decrypted = decrypt_key_blocks_info(key_block_index_bytes, key_block_index_start)?;
        decrypted.as_slice()
    } else {
        key_block_index_bytes
    };

    let decompressed_key_blocks_index = decode_v2_block(
        decrypted_key_blocks_info,
        key_block_index_start,
        key_header.index_decompressed_size,
        limits.maximum_index_decompressed_size,
    )?;

    let key_blocks_start = key_block_index_end;
    let key_blocks_index = parse_key_blocks_index(
        &decompressed_key_blocks_index,
        key_header.block_count,
        header,
        key_block_index_start,
        key_blocks_start,
        limits,
    )?;

    let key_blocks_end = checked_add(key_blocks_start, key_header.blocks_compressed_size, "key block section")?;
    let indexed_key_blocks_end = key_blocks_index
        .last()
        .map_or(key_blocks_start, |block| block.source.end);
    if indexed_key_blocks_end != key_blocks_end {
        return Err(Error::invalid(
            key_blocks_start,
            "key block sizes do not match the key section header",
        ));
    }
    source.slice(key_blocks_start, key_blocks_end)?;

    let indexed_entries = key_blocks_index.iter().try_fold(0_u64, |total, block| {
        total
            .checked_add(block.entry_count)
            .ok_or_else(|| Error::invalid(block.source.start, "key entry count overflows"))
    })?;
    if indexed_entries != key_header.entry_count {
        return Err(Error::invalid(
            key_block_index_start,
            format!(
                "key index describes {indexed_entries} entries; header declares {}",
                key_header.entry_count
            ),
        ));
    }

    Ok(ParsedKeySection {
        info: KeySectionInfo {
            block_count: key_header.block_count,
            entry_count: key_header.entry_count,
            index_source: ByteRange::new(key_block_index_start, key_block_index_end),
            blocks_source: ByteRange::new(key_blocks_start, key_blocks_end),
            index_decompressed_size: key_header.index_decompressed_size,
        },
        blocks: key_blocks_index,
        end: key_blocks_end,
    })
}

/// 解析并校验完整的 MDict v2 record section。
fn parse_record_section(
    source: &MappedSource,
    start: u64,
    expected_entry_count: u64,
    limits: Limits,
) -> Result<ParsedRecordSection> {
    let record_header_start = start;
    let (record_header, record_header_end) = parse_record_header(source, record_header_start, limits)?;

    if record_header.entry_count != expected_entry_count {
        return Err(Error::invalid(
            record_header_start,
            "key and record section entry counts differ",
        ));
    }

    let record_index_start = record_header_end;
    let (record_blocks_sizes, record_index_end) =
        parse_record_block_index(source, record_index_start, &record_header)?;

    let record_blocks_start = record_index_end;
    let (record_blocks_index, compressed_block_end, total_decompressed_size) =
        build_record_block_index(record_blocks_sizes, record_blocks_start, limits)?;

    let record_blocks_end = checked_add(
        record_blocks_start,
        record_header.blocks_compressed_size,
        "record block section",
    )?;
    if compressed_block_end != record_blocks_end {
        return Err(Error::invalid(
            record_blocks_start,
            "record block sizes do not match the record section header",
        ));
    }
    source.slice(record_blocks_start, record_blocks_end)?;

    Ok(ParsedRecordSection {
        info: RecordSectionInfo {
            block_count: record_header.block_count,
            entry_count: record_header.entry_count,
            index_source: ByteRange::new(record_index_start, record_index_end),
            blocks_source: ByteRange::new(record_blocks_start, record_blocks_end),
            total_decompressed_size,
        },
        blocks: record_blocks_index,
    })
}

/// 从通用文件头之后开始解析完整的 MDict v2 区段布局。
///
/// 该函数只建立轻量级的 block 描述表，不会提前解压全部 key 或 record 数据。
pub(crate) fn parse(
    source: &MappedSource,
    header: &Header,
    start: u64,
    limits: Limits,
) -> Result<Layout> {
    // bit 1 表示 key section 头部加密；当前没有可靠的公开解密规则，明确拒绝。
    if header.encrypted & 1 != 0 {
        return Err(Error::Unsupported(
            "v2 encrypted key-section header (Encrypted bit 1)".into(),
        ));
    }

    let key_section = parse_key_section(source, header, start, limits)?;
    let record_section = parse_record_section(source, key_section.end, key_section.info.entry_count, limits)?;

    Ok(Layout {
        key_section_info: key_section.info,
        key_blocks_index: key_section.blocks,
        record_section_info: record_section.info,
        record_blocks_index: record_section.blocks,
    })
}
