use std::io::{self, Cursor, Read, Write};

use crate::{Error, Result};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Compression {
    None,
    Lzo,
    Zlib,
    Lzma,
    Bzip2,
    Lz4,
}

impl Compression {
    /// 将格式中的压缩编号转换为受支持的算法。
    pub(crate) fn from_id(id: u8, offset: u64) -> Result<Self> {
        match id {
            0 => Ok(Self::None),
            1 => Ok(Self::Lzo),
            2 => Ok(Self::Zlib),
            3 => Ok(Self::Lzma),
            4 => Ok(Self::Bzip2),
            5 => Ok(Self::Lz4),
            _ => Err(Error::unsupported(format!(
                "compression method {id} at byte {offset}"
            ))),
        }
    }

    /// 返回用于错误消息的稳定算法名称。
    fn name(self) -> &'static str {
        match self {
            Self::None => "none",
            Self::Lzo => "LZO",
            Self::Zlib => "zlib",
            Self::Lzma => "LZMA",
            Self::Bzip2 => "bzip2",
            Self::Lz4 => "LZ4",
        }
    }
}

/// 将 payload 解压到严格等于 `expected_size` 的缓冲区。
pub(crate) fn decompress(
    method: Compression,
    payload: &[u8],
    expected_size: usize,
    offset: u64,
) -> Result<Vec<u8>> {
    let result = match method {
        Compression::None => {
            if payload.len() != expected_size {
                return Err(Error::Compression {
                    offset,
                    method: method.name().into(),
                    context: format!(
                        "uncompressed payload has {} bytes, expected {expected_size}",
                        payload.len()
                    ),
                });
            }
            payload.to_vec()
        }
        Compression::Lzo => {
            let mut output = vec![0; expected_size];
            lzo1x::decompress(payload, &mut output).map_err(|error| Error::Compression {
                offset,
                method: method.name().into(),
                context: format!("{error:?}"),
            })?;
            output
        }
        Compression::Zlib => read_limited(
            flate2::read::ZlibDecoder::new(payload),
            expected_size,
            method,
            offset,
        )?,
        Compression::Lzma => {
            let mut output = LimitedWriter::new(expected_size);
            lzma_rs::lzma_decompress(&mut Cursor::new(payload), &mut output).map_err(|error| {
                Error::Compression {
                    offset,
                    method: method.name().into(),
                    context: error.to_string(),
                }
            })?;
            output.into_inner()
        }
        Compression::Bzip2 => read_limited(
            bzip2::read::BzDecoder::new(payload),
            expected_size,
            method,
            offset,
        )?,
        Compression::Lz4 => read_limited(
            lz4::Decoder::new(payload).map_err(|error| Error::Compression {
                offset,
                method: method.name().into(),
                context: error.to_string(),
            })?,
            expected_size,
            method,
            offset,
        )?,
    };
    if result.len() != expected_size {
        return Err(Error::Compression {
            offset,
            method: method.name().into(),
            context: format!("decoded {} bytes, expected {expected_size}", result.len()),
        });
    }
    Ok(result)
}

/// 只允许解压器写入声明大小，阻止 LZMA 等 push 型解码器无界增长。
struct LimitedWriter {
    bytes: Vec<u8>,
    maximum: usize,
}

impl LimitedWriter {
    /// 创建容量受 `maximum` 限制的输出 writer。
    fn new(maximum: usize) -> Self {
        Self {
            bytes: Vec::with_capacity(maximum),
            maximum,
        }
    }

    /// 取出已经写入的解压结果。
    fn into_inner(self) -> Vec<u8> {
        self.bytes
    }
}

impl Write for LimitedWriter {
    /// 写入不超过声明大小的数据，超限时立即失败。
    fn write(&mut self, buffer: &[u8]) -> io::Result<usize> {
        if self.bytes.len().saturating_add(buffer.len()) > self.maximum {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "decoded data exceeds declared size",
            ));
        }
        self.bytes.extend_from_slice(buffer);
        Ok(buffer.len())
    }

    /// Vec writer 不需要执行额外刷新操作。
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

/// 从流式解压器中最多读取预期长度加一字节，防止无界增长。
fn read_limited(
    reader: impl Read,
    expected_size: usize,
    method: Compression,
    offset: u64,
) -> Result<Vec<u8>> {
    let mut output = Vec::with_capacity(expected_size);
    reader
        .take(expected_size as u64 + 1)
        .read_to_end(&mut output)
        .map_err(|error| Error::Compression {
            offset,
            method: method.name().into(),
            context: error.to_string(),
        })?;
    Ok(output)
}

#[cfg(test)]
mod tests {
    use std::io::{Cursor, Write};

    use super::{Compression, decompress};

    #[test]
    /// 验证所有可在 crate 内生成的 v3 压缩格式都能还原相同数据。
    fn decodes_supported_stream_formats() {
        let data = b"MDict compression fixture: alpha beta gamma";

        let mut zlib = flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::default());
        zlib.write_all(data).unwrap();
        let zlib = zlib.finish().unwrap();

        let mut lzma = Vec::new();
        lzma_rs::lzma_compress(&mut Cursor::new(data), &mut lzma).unwrap();

        let mut bzip = bzip2::write::BzEncoder::new(Vec::new(), bzip2::Compression::default());
        bzip.write_all(data).unwrap();
        let bzip = bzip.finish().unwrap();

        let mut lz4 = Vec::new();
        let mut encoder = lz4::EncoderBuilder::new().build(&mut lz4).unwrap();
        encoder.write_all(data).unwrap();
        let (_, result) = encoder.finish();
        result.unwrap();

        let lzo = lzo1x::compress(data, lzo1x::CompressLevel::default());

        for (method, payload) in [
            (Compression::None, data.as_slice()),
            (Compression::Lzo, lzo.as_slice()),
            (Compression::Zlib, zlib.as_slice()),
            (Compression::Lzma, lzma.as_slice()),
            (Compression::Bzip2, bzip.as_slice()),
            (Compression::Lz4, lz4.as_slice()),
        ] {
            assert_eq!(decompress(method, payload, data.len(), 0).unwrap(), data);
        }
    }

    #[test]
    /// 验证解压结果大于声明大小时会在分配边界立即失败。
    fn rejects_output_larger_than_declared() {
        let data = b"too large";
        let mut encoded = Vec::new();
        lzma_rs::lzma_compress(&mut Cursor::new(data), &mut encoded).unwrap();
        assert!(decompress(Compression::Lzma, &encoded, 2, 0).is_err());
    }
}
