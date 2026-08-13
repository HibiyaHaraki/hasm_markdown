use std::fmt::{Display, Formatter};

#[derive(Debug)]
pub enum PackageError {
    Io(String),
    InvalidArchive(String),
    InvalidManifest(String),
    MissingMetadata(String),
    WorkspaceLocked(u32),
    InvalidTarget(String),
}

impl Display for PackageError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(message) => write!(formatter, "{message}"),
            Self::InvalidArchive(message) => write!(formatter, "{message}"),
            Self::InvalidManifest(message) => write!(formatter, "{message}"),
            Self::MissingMetadata(message) => write!(formatter, "{message}"),
            Self::WorkspaceLocked(pid) => write!(formatter, "Workspace is locked by process {pid}"),
            Self::InvalidTarget(message) => write!(formatter, "{message}"),
        }
    }
}

impl std::error::Error for PackageError {}

impl From<std::io::Error> for PackageError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error.to_string())
    }
}

impl From<serde_json::Error> for PackageError {
    fn from(error: serde_json::Error) -> Self {
        Self::InvalidManifest(error.to_string())
    }
}

impl From<zip::result::ZipError> for PackageError {
    fn from(error: zip::result::ZipError) -> Self {
        Self::InvalidArchive(error.to_string())
    }
}
