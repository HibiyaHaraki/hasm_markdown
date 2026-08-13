use serde::Serialize;
use crate::models::payload::{MissingAssetInfo, PackageWarning};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliVerifyResult {
    pub status: String,
    pub target_path: String,
    pub missing_assets: Vec<MissingAssetInfo>,
    pub warnings: Vec<PackageWarning>,
}
