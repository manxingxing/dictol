use std::io;

/// 打开或读取 MDict 文件时可能产生的错误。
#[derive(Debug, thiserror::Error)]
pub enum Error {
    /// 文件打开、内存映射或流式解压过程中产生的 I/O 错误。
    #[error("I/O error: {0}")]
    Io(#[from] io::Error),

    /// 文件内容不符合 MDict 格式，并记录最接近问题位置的物理字节偏移。
    #[error("invalid MDict data at byte {offset}: {message}")]
    InvalidFormat {
        /// 问题数据在源文件中的字节偏移。
        offset: u64,
        /// 对格式错误的具体说明。
        message: String,
    },

    /// 文件启用了当前实现尚不支持的版本或格式特性。
    #[error("unsupported MDict feature: {0}")]
    Unsupported(String),

    /// 文件声明的规模超过调用方配置的资源上限。
    #[error("MDict resource limit exceeded: {0}")]
    LimitExceeded(String),
}

impl Error {
    /// 构造带源文件偏移的格式错误。
    pub(crate) fn invalid(offset: u64, message: impl Into<String>) -> Self {
        Self::InvalidFormat {
            offset,
            message: message.into(),
        }
    }
}

/// 本 crate 内公共操作统一使用的结果类型。
pub type Result<T> = std::result::Result<T, Error>;
