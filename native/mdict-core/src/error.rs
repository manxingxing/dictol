use std::io;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("I/O error: {0}")]
    Io(#[from] io::Error),

    #[error("invalid MDict file: {0}")]
    InvalidFormat(String),

    #[error("unsupported MDict feature: {0}")]
    Unsupported(String),

    #[error("MDict resource limit exceeded: {0}")]
    LimitExceeded(String),
}

pub type Result<T> = std::result::Result<T, Error>;
