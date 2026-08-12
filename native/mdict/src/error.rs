use std::io;
use std::path::PathBuf;

/// Link-resolution errors exposed by [`crate::Mdx`].
#[derive(Debug, thiserror::Error)]
pub enum LinkError {
    /// LINK 指向的 key 不存在。
    #[error("link target {target:?} was not found")]
    Missing {
        /// 未能找到的目标 key。
        target: String,
    },
    /// LINK 链再次访问了已经解析过的 key。
    #[error("cyclic @@@LINK= chain at {target:?}")]
    Cycle {
        /// 检测到循环的目标 key。
        target: String,
    },
    /// LINK 链超过固定的安全深度。
    #[error("@@@LINK= chain exceeded {maximum} redirects")]
    TooDeep {
        /// 允许跟随的最大重定向次数。
        maximum: usize,
    },
}

/// Errors produced while opening or reading an MDict file.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    /// 打开或读取指定路径时发生 I/O 错误。
    #[error("I/O error for {path}: {source}")]
    Io {
        /// 发生错误的文件路径。
        path: PathBuf,
        /// 底层标准库 I/O 错误。
        #[source]
        source: io::Error,
    },
    /// 文件字节不符合当前版本要求的结构。
    #[error("invalid MDict data in {path} at byte {offset}: {context}")]
    InvalidFormat {
        /// 格式错误所属的文件路径。
        path: PathBuf,
        /// 尽可能精确的物理文件 offset。
        offset: u64,
        /// 说明失败解析步骤的上下文。
        context: String,
    },
    /// 文件使用了本版本尚未实现的格式能力。
    #[error("unsupported MDict feature: {feature}")]
    Unsupported {
        /// 未支持能力或编号的说明。
        feature: String,
    },
    /// 加密文件要求调用方补充注册凭据。
    #[error("dictionary registration credentials are required{register_by}", register_by = register_by.as_ref().map(|value| format!(" ({value})")).unwrap_or_default())]
    CredentialRequired {
        /// Header 声明的注册标识类型。
        register_by: Option<String>,
    },
    /// 密钥解析或加解密操作失败。
    #[error("MDict cryptography failed at byte {offset}: {context}")]
    Crypto {
        /// 相关数据的物理 offset。
        offset: u64,
        /// 加密失败的具体上下文。
        context: String,
    },
    /// block payload 无法按声明算法解压。
    #[error("{method} decompression failed at byte {offset}: {context}")]
    Compression {
        /// 压缩 payload 的物理 offset。
        offset: u64,
        /// 声明的压缩算法名称。
        method: String,
        /// 解压器返回的具体错误说明。
        context: String,
    },
    /// 数据与文件保存的 checksum 不一致。
    #[error("checksum mismatch at byte {offset}: expected 0x{expected:08x}, got 0x{actual:08x}")]
    Checksum {
        /// checksum 字段或相关数据的物理 offset。
        offset: u64,
        /// 文件中保存的 checksum。
        expected: u32,
        /// 从实际数据计算得到的 checksum。
        actual: u32,
    },
    /// Header 或 key 无法按声明编码严格解码。
    #[error("invalid {encoding} text at byte {offset}")]
    Encoding {
        /// 非法文本的物理 offset。
        offset: u64,
        /// 失败的字符编码名称。
        encoding: String,
    },
    /// 文件声明的大小或数量超过调用方资源上限。
    #[error("MDict resource limit {name} exceeded: {actual} > {maximum}")]
    LimitExceeded {
        /// 被限制资源的稳定名称。
        name: &'static str,
        /// 文件实际声明或请求的值。
        actual: u64,
        /// 当前配置允许的最大值。
        maximum: u64,
    },
    /// MDX LINK 解析错误。
    #[error(transparent)]
    Link(#[from] LinkError),
}

impl Error {
    /// 将指定路径上的 I/O 错误包装为库错误。
    pub(crate) fn io(path: impl Into<PathBuf>, source: io::Error) -> Self {
        Self::Io {
            path: path.into(),
            source,
        }
    }

    /// 构造带文件路径、物理偏移和上下文的格式错误。
    pub(crate) fn invalid(
        path: impl Into<PathBuf>,
        offset: u64,
        context: impl Into<String>,
    ) -> Self {
        Self::InvalidFormat {
            path: path.into(),
            offset,
            context: context.into(),
        }
    }

    /// 构造尚未支持的格式能力错误。
    pub(crate) fn unsupported(feature: impl Into<String>) -> Self {
        Self::Unsupported {
            feature: feature.into(),
        }
    }
}

/// 本 crate 所有可能失败操作使用的结果类型。
pub type Result<T> = std::result::Result<T, Error>;
