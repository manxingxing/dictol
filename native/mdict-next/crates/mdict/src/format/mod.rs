mod header;
pub(crate) mod v2;
pub(crate) mod v3;

use std::borrow::Cow;

use crate::model::{FileKind, Header, Limits, MdictVersion};
use crate::source::MappedSource;
use crate::{Error, Result};

#[derive(Debug)]
/// 已识别版本对应的内部磁盘布局。
pub(crate) enum Layout {
    /// MDict v2 的 key/record 区段布局。
    V2(v2::Layout),
}

impl Layout {
    /// 取得 v2 布局；当前只有成功解析的 v2 文件能够构造 `Layout`。
    pub(crate) fn v2(&self) -> &v2::Layout {
        match self {
            Self::V2(layout) => layout,
        }
    }
}

/// 格式识别完成后交给字典运行时使用的头部和布局。
pub(crate) struct OpenedFormat {
    /// 与具体格式版本无关的公共头部模型。
    pub(crate) header: Header,
    /// 按版本解析出的物理区段布局。
    pub(crate) layout: Layout,
}

/// 解析文件头并将剩余内容分派给对应版本的格式解析器。
pub(crate) fn open(source: &MappedSource, kind: FileKind, limits: Limits) -> Result<OpenedFormat> {
    let (header, key_section_offset) = header::parse(source.as_slice(), kind, limits)?;
    // 版本差异在此处分流，避免把 v3 的包头、校验和等规则混入 v2 代码。
    let layout = match header.version {
        MdictVersion::V2 => Layout::V2(v2::parse(source, &header, key_section_offset, limits)?),
        MdictVersion::V3 => return v3::unsupported(),
    };
    Ok(OpenedFormat { header, layout })
}

/// 按 Header 的查找规则把原始 key 转换为 block 定位所用的比较 key。
///
/// `StripKey` 会移除 MDict 约定的标点，非大小写敏感字典还会统一为小写。
/// 该值只用于查找范围比较，不会替换最终返回给调用方的原始 key。
pub(crate) fn comparison_key(header: &Header, key: &str) -> String {
    let stripped: Cow<'_, str> = if header.strip_key {
        Cow::Owned(
            key.chars()
                .filter(|character| {
                    !matches!(
                        character,
                        '(' | ')'
                            | '.'
                            | ','
                            | '-'
                            | '&'
                            | '、'
                            | ' '
                            | '\''
                            | '/'
                            | '\\'
                            | '@'
                            | '_'
                            | '$'
                            | '!'
                    )
                })
                .collect(),
        )
    } else {
        Cow::Borrowed(key)
    };
    if header.key_case_sensitive {
        stripped.into_owned()
    } else {
        stripped.to_lowercase()
    }
}

/// 计算 `offset + size`，并把整数溢出转换成带上下文的格式错误。
pub(crate) fn checked_add(offset: u64, size: u64, context: &str) -> Result<u64> {
    offset
        .checked_add(size)
        .ok_or_else(|| Error::invalid(offset, format!("{context} range overflows")))
}

/// 确认文件声明值未超过调用方配置的资源上限。
pub(crate) fn enforce_limit(label: &str, actual: u64, maximum: u64) -> Result<()> {
    if actual > maximum {
        Err(Error::LimitExceeded(format!(
            "{label} {actual} exceeds configured maximum {maximum}"
        )))
    } else {
        Ok(())
    }
}
