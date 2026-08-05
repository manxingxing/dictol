use crate::{Error, Result};

/// 返回尚未实现 v3 解析器的明确错误。
///
/// v3 拥有独立的数据块包头、密钥派生和校验规则，未来应在本模块完整实现，
/// 而不是在 v2 解析器内部不断增加版本分支。
pub(crate) fn unsupported<T>() -> Result<T> {
    Err(Error::Unsupported(
        "MDict v3 is reserved for the dedicated format::v3 implementation".into(),
    ))
}
