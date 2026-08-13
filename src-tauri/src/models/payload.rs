use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeAssetMetadata {
    #[serde(default)]
    pub uuid: String,
    #[serde(default)]
    pub relative_path: String,
    #[serde(default)]
    pub resolved_path: String,
    #[serde(default)]
    pub mime_type: String,
    #[serde(default)]
    pub size: u64,
    #[serde(default)]
    pub is_external: bool,
    #[serde(default)]
    pub is_deleted: bool,
    #[serde(default)]
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AssetManifest {
    #[serde(default = "default_manifest_version")]
    pub version: String,
    #[serde(default)]
    pub assets: HashMap<String, RuntimeAssetMetadata>,
}

fn default_manifest_version() -> String {
    "1".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MissingAssetInfo {
    pub alias: String,
    pub expected_relative_path: String,
    #[serde(default)]
    pub referenced_lines: Vec<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PackageWarning {
    pub code: String,
    pub filename: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub enum TargetType {
    Archive,
    Folder,
    Unbound,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageStatePayload {
    pub uuid: String,
    pub temp_dir_path: String,
    pub target_type: TargetType,
    pub target_path: Option<String>,
    pub is_loaded: bool,
    pub is_dirty: bool,
    pub raw_content: String,
    pub last_saved_content: String,
    pub manifest: AssetManifest,
    pub missing_assets: Vec<MissingAssetInfo>,
    pub warnings: Vec<PackageWarning>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceClosePayload {
    pub uuid: String,
    pub lock_released: bool,
    pub master_handles_closed: bool,
    pub closed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LockPayload {
    pub pid: u32,
    pub status: String,
    #[serde(default)]
    pub last_released_at: Option<String>,
}
