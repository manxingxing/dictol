use std::collections::BTreeMap;

/// Semantic type of an MDict file.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FileKind {
    /// A text dictionary.
    Mdx,
    /// A binary resource dictionary.
    Mdd,
}

/// On-disk MDict generation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Version {
    /// MDict 1.x 布局。
    V1,
    /// MDict 2.x 布局。
    V2,
    /// MDict 3.x/ZDB 四 Unit 布局。
    V3,
}

/// A recoverable format issue noticed while opening a dictionary.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Warning {
    /// 可展示或记录的人类可读警告。
    pub message: String,
}

/// Human-facing summary of the file's encryption requirements.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EncryptionSummary {
    /// 文件是否声明或实际使用了加密。
    pub encrypted: bool,
    /// 打开文件是否需要调用方提供注册凭据。
    pub credentials_required: bool,
    /// 不暴露密钥内容的加密方式说明。
    pub description: String,
}

/// Stable metadata shared by all supported disk layouts.
#[derive(Clone)]
pub struct Metadata {
    /// 文件的 MDX/MDD 语义类型。
    pub kind: FileKind,
    /// 解析得到的磁盘格式版本。
    pub version: Version,
    /// Header 声明的引擎版本原文。
    pub engine_version: String,
    /// 规范化后的 key 与 MDX record 编码名称。
    pub encoding: String,
    /// Header 中的词典标题。
    pub title: String,
    /// Header 中的词典描述。
    pub description: String,
    /// Header 中的内容格式，例如 HTML。
    pub format: String,
    /// 调用方可理解的加密状态摘要。
    pub encryption: EncryptionSummary,
    /// 文件声明并由索引验证的词条总数。
    pub entry_count: u64,
    /// Key Block 数量。
    pub key_block_count: u64,
    /// Record Block 数量。
    pub record_block_count: u64,
    /// 已解码的全部 Header 属性。
    pub attributes: BTreeMap<String, String>,
    /// 打开时发现但不影响安全读取的兼容性提示。
    pub warnings: Vec<Warning>,
    /// 完整的已解码 Header XML。
    pub raw_header: String,
}

impl std::fmt::Debug for Metadata {
    /// 输出常用元数据，但不隐式打印可能包含 RegCode 的 Header 属性和原文。
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("Metadata")
            .field("kind", &self.kind)
            .field("version", &self.version)
            .field("engine_version", &self.engine_version)
            .field("encoding", &self.encoding)
            .field("title", &self.title)
            .field("description", &self.description)
            .field("format", &self.format)
            .field("encryption", &self.encryption)
            .field("entry_count", &self.entry_count)
            .field("key_block_count", &self.key_block_count)
            .field("record_block_count", &self.record_block_count)
            .field("attribute_count", &self.attributes.len())
            .field("warnings", &self.warnings)
            .finish_non_exhaustive()
    }
}

/// A key and its half-open range in the decompressed record address space.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Key {
    /// 文件中保存的原始 key 文本。
    pub text: String,
    /// record 在解压后逻辑地址空间中的起始 offset。
    pub record_start: u64,
    /// record 在解压后逻辑地址空间中的排他结束 offset。
    pub record_end: u64,
}

/// A key and its raw record bytes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Entry {
    /// 文件中保存的原始 key 文本。
    pub key: String,
    /// 未经文本解码或语义处理的 record 字节。
    pub data: Vec<u8>,
}

/// A key location in one file of an [`crate::MddList`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MddKey {
    /// 资源所在分卷的零基下标。
    pub volume: u32,
    /// 文件中保存的资源 key。
    pub text: String,
    /// 该分卷逻辑 record 地址空间中的起始 offset。
    pub record_start: u64,
    /// 该分卷逻辑 record 地址空间中的排他结束 offset。
    pub record_end: u64,
}
