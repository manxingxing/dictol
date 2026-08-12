use std::path::{Path, PathBuf};

use crate::{Error, Result};

/// Checked reader used only while turning untrusted bytes into descriptors.
pub(crate) struct BinaryCursor<'a> {
    bytes: &'a [u8],
    position: usize,
    base: u64,
    path: PathBuf,
}

impl<'a> BinaryCursor<'a> {
    /// 在给定物理基址上创建一个边界检查游标。
    pub(crate) fn new(bytes: &'a [u8], base: u64, path: &Path) -> Self {
        Self {
            bytes,
            position: 0,
            base,
            path: path.to_path_buf(),
        }
    }

    /// 返回游标对应的文件绝对偏移。
    pub(crate) fn offset(&self) -> u64 {
        self.base + self.position as u64
    }

    /// 返回当前游标所属的源文件路径，供解析错误保留真实上下文。
    pub(crate) fn path(&self) -> &Path {
        &self.path
    }

    /// 返回尚未消费的字节数。
    pub(crate) fn remaining(&self) -> usize {
        self.bytes.len() - self.position
    }

    /// 判断输入是否已经恰好消费完毕。
    pub(crate) fn is_empty(&self) -> bool {
        self.position == self.bytes.len()
    }

    /// 读取固定长度字节，并在此解析边界集中检查越界。
    pub(crate) fn take(&mut self, length: usize, context: &str) -> Result<&'a [u8]> {
        let end = self.position.checked_add(length).ok_or_else(|| {
            Error::invalid(
                &self.path,
                self.offset(),
                format!("{context} length overflows"),
            )
        })?;
        if end > self.bytes.len() {
            return Err(Error::invalid(
                &self.path,
                self.offset(),
                format!("truncated {context}"),
            ));
        }
        let output = &self.bytes[self.position..end];
        self.position = end;
        Ok(output)
    }

    /// 跳过固定长度字节。
    pub(crate) fn skip(&mut self, length: usize, context: &str) -> Result<()> {
        self.take(length, context).map(|_| ())
    }

    /// 读取一个无符号字节。
    pub(crate) fn u8(&mut self, context: &str) -> Result<u8> {
        Ok(self.take(1, context)?[0])
    }

    /// 读取一个大端 `u16`。
    pub(crate) fn be_u16(&mut self, context: &str) -> Result<u16> {
        Ok(u16::from_be_bytes(
            self.take(2, context)?.try_into().unwrap(),
        ))
    }

    /// 读取一个大端 `u32`。
    pub(crate) fn be_u32(&mut self, context: &str) -> Result<u32> {
        Ok(u32::from_be_bytes(
            self.take(4, context)?.try_into().unwrap(),
        ))
    }

    /// 读取一个小端 `u32`。
    pub(crate) fn le_u32(&mut self, context: &str) -> Result<u32> {
        Ok(u32::from_le_bytes(
            self.take(4, context)?.try_into().unwrap(),
        ))
    }

    /// 读取一个大端 `u64`。
    pub(crate) fn be_u64(&mut self, context: &str) -> Result<u64> {
        Ok(u64::from_be_bytes(
            self.take(8, context)?.try_into().unwrap(),
        ))
    }
}
