use std::collections::BTreeMap;

/// MDict 文件使用的磁盘格式版本。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MdictVersion {
    /// MDict 2.x 格式。
    V2,
    /// MDict 3.x 格式；当前仅识别版本，尚未实现数据区解析。
    V3,
}

/// 打开的 MDict 文件类型。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FileKind {
    /// 保存词条文本的 MDX 文件。
    Mdx,
    /// 保存图片、音频等二进制资源的 MDD 文件。
    Mdd,
}

/// 左闭右开的字节范围 `[start, end)`。
///
/// 根据所在模型的不同，它可以表示原始文件中的物理范围，也可以表示
/// Record Block 解压后逻辑数据流中的范围。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ByteRange {
    /// 范围起始位置，包含该位置。
    pub start: u64,
    /// 范围结束位置，不包含该位置。
    pub end: u64,
}

impl ByteRange {
    /// 创建一个左闭右开的字节范围。
    pub fn new(start: u64, end: u64) -> Self {
        Self { start, end }
    }

    /// 返回范围长度；当 `end < start` 时返回零。
    pub fn len(self) -> u64 {
        self.end.saturating_sub(self.start)
    }

    /// 判断范围是否为空。
    pub fn is_empty(self) -> bool {
        self.start == self.end
    }
}

/// 从 MDict Header XML 中解析得到的字典元数据。
#[derive(Debug, Clone)]
pub struct Header {
    /// 根据生成引擎版本识别出的 MDict 磁盘格式版本。
    pub version: MdictVersion,
    /// Header 的 `GeneratedByEngineVersion` 属性。
    pub engine_version: f32,
    /// Header 的 `RequiredEngineVersion` 属性；未声明时为 `None`。
    pub required_version: Option<f32>,
    /// 规范化后的 key 和 record 文本编码名称。
    pub encoding: String,
    /// Header 的 `Encrypted` 位标志。
    pub encrypted: u8,
    /// 字典标题。
    pub title: String,
    /// 字典描述文本。
    pub description: String,
    /// Header 的 `Format` 属性。
    pub format: String,
    /// key 查询是否区分大小写。
    pub key_case_sensitive: bool,
    /// 比较 key 时是否移除 MDict 约定的标点和空白字符。
    pub strip_key: bool,
    /// Header 根元素上解析到的全部属性。
    pub attributes: BTreeMap<String, String>,
    /// Header 中可恢复问题的警告，例如未知或损坏的 XML entity。
    pub warnings: Vec<String>,
    /// 解码后的原始 Header XML。
    pub raw_xml: String,
}

/// Key Block 在当前字典的 Key Block 描述表中的顺序编号。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct KeyBlockId(
    /// 从零开始的 Key Block 下标。
    pub u32,
);

/// 一个 Key Block 的块级元数据。
///
/// 该结构不保存 block 中的全部 key。需要读取具体 key 时，解析器会根据
/// `source` 取得并解压对应的 Key Block。
#[derive(Debug, Clone)]
pub struct KeyBlockInfo {
    /// 当前 Key Block 的顺序编号。
    pub id: KeyBlockId,
    /// Key Block Info 中声明的 entry 数量，允许包含重复 key。
    pub entry_count: u64,
    /// Key Block 中第一条 key，已按 Header 声明的编码严格解码。
    pub first_key: String,
    /// Key Block 中最后一条 key，已按 Header 声明的编码严格解码。
    pub last_key: String,
    /// Key Block Info 中声明的压缩数据字节数。
    ///
    /// 包含 v2 block envelope 和压缩 payload，且与 `source.len()` 相等。
    pub compressed_size: u64,
    /// 压缩 Key Block 在原始 MDX/MDD 文件中的绝对物理范围。
    ///
    /// 该范围包含 v2 block envelope 和压缩 payload。
    pub source: ByteRange,
    /// Key Block payload 解压后的预期字节数。
    pub decompressed_size: u64,
    /// `first_key` 按 `StripKey` 和大小写规则规范化后的内部比较值。
    pub(crate) comparison_first_key: String,
    /// `last_key` 按 `StripKey` 和大小写规则规范化后的内部比较值。
    pub(crate) comparison_last_key: String,
}

/// Record Block 在当前字典的 Record Block 描述表中的顺序编号。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct RecordBlockId(
    /// 从零开始的 Record Block 下标。
    pub u32,
);

/// 一个 Record Block 的物理范围和解压后逻辑范围。
#[derive(Debug, Clone)]
pub struct RecordBlockInfo {
    /// 当前 Record Block 的顺序编号。
    pub id: RecordBlockId,
    /// 压缩 Record Block 在原始 MDX/MDD 文件中的绝对物理范围。
    pub source: ByteRange,
    /// 该 block 在全局解压后 record 数据流中的逻辑范围。
    pub decompressed: ByteRange,
}

/// Key Section 的汇总信息和物理布局。
#[derive(Debug, Clone)]
pub struct KeySectionInfo {
    /// Key Block 总数。
    pub block_count: u64,
    /// 全部 Key Block 声明的 entry 总数。
    pub entry_count: u64,
    /// Key Block Info 压缩块在原始文件中的物理范围。
    pub index_source: ByteRange,
    /// 全部压缩 Key Block 在原始文件中的连续物理范围。
    pub blocks_source: ByteRange,
    /// Key Block Info 解压后的预期字节数。
    pub index_decompressed_size: u64,
}

/// Record Section 的汇总信息和物理布局。
#[derive(Debug, Clone)]
pub struct RecordSectionInfo {
    /// Record Block 总数。
    pub block_count: u64,
    /// Record Section Header 声明的 entry 总数。
    pub entry_count: u64,
    /// Record Block Info 数组在原始文件中的物理范围。
    pub index_source: ByteRange,
    /// 全部压缩 Record Block 在原始文件中的连续物理范围。
    pub blocks_source: ByteRange,
    /// 所有 Record Block 解压后依次拼接得到的逻辑数据流总字节数。
    pub total_decompressed_size: u64,
}

/// 词典索引中的轻量级词条实体。
///
/// 该模型只包含建立外部索引所需的 key 和 record 逻辑范围，
/// 不提前计算或保存 `first_record_block`。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KeyEntity {
    /// 按 Header 编码解码后的原始 key。
    pub key: String,
    /// record 在解压后连续逻辑地址空间中的起始偏移。
    pub record_start: u64,
    /// record 在解压后连续逻辑地址空间中的结束偏移（右开）。
    pub record_end: u64,
}

/// 同时包含 key 和 record 内容的词条记录。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RecordEntry {
    /// 按 Header 编码解码后的原始 key。
    pub key: String,
    /// 对应 record 的原始解压字节。
    pub record: Vec<u8>,
}

/// 打开和读取不受信任 MDict 文件时使用的资源上限。
///
/// 除 `maximum_block_count` 外，其余字段的单位均为字节。
#[derive(Debug, Clone, Copy)]
pub struct Limits {
    /// Header XML 允许的最大原始字节数。
    pub maximum_header_size: u64,
    /// 压缩索引区域允许的最大字节数。
    pub maximum_index_compressed_size: u64,
    /// 索引区域解压后允许的最大字节数。
    pub maximum_index_decompressed_size: u64,
    /// 单个压缩 Key/Record Block 允许的最大字节数。
    pub maximum_block_compressed_size: u64,
    /// 单个 Key/Record Block 解压后允许的最大字节数。
    pub maximum_block_decompressed_size: u64,
    /// 单个 key 编码字节序列允许的最大字节数。
    pub maximum_key_size: u64,
    /// 单个 record 逻辑范围允许的最大字节数。
    pub maximum_record_size: u64,
    /// 单个 Key Section 或 Record Section 允许的最大 block 数量。
    pub maximum_block_count: u64,
}

impl Default for Limits {
    fn default() -> Self {
        Self {
            maximum_header_size: 16 * 1024 * 1024,
            maximum_index_compressed_size: 128 * 1024 * 1024,
            maximum_index_decompressed_size: 256 * 1024 * 1024,
            maximum_block_compressed_size: 256 * 1024 * 1024,
            maximum_block_decompressed_size: 256 * 1024 * 1024,
            maximum_key_size: 1024 * 1024,
            maximum_record_size: 256 * 1024 * 1024,
            maximum_block_count: 1_000_000,
        }
    }
}

/// 打开 MDict 文件时使用的配置。
#[derive(Debug, Clone, Copy, Default)]
pub struct OpenOptions {
    /// 文件解析和 record 读取使用的资源限制。
    pub limits: Limits,
}
