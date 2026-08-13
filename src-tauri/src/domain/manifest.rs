use crate::models::error::PackageError;
use crate::models::payload::{AssetManifest, RuntimeAssetMetadata};
use crate::services::path_resolver::{resolve_archive_asset_path, resolve_asset_path};
use std::path::Path;

pub fn parse_and_resolve(
    raw: &str,
    target_root: &Path,
    archive_uuid: Option<&str>,
) -> Result<AssetManifest, PackageError> {
    let mut manifest: AssetManifest = serde_json::from_str(raw)?;
    for asset in manifest.assets.values_mut() {
        if asset.relative_path.is_empty() {
            asset.relative_path = if asset.uuid.is_empty() { String::new() } else { format!("assets/{}", asset.uuid) };
        }
        asset.resolved_path = match archive_uuid {
            Some(uuid) => resolve_archive_asset_path(uuid, &asset.uuid),
            None => resolve_asset_path(target_root, &asset.relative_path).to_string_lossy().into_owned(),
        };
    }
    Ok(manifest)
}

pub fn portable_json(manifest: &AssetManifest) -> Result<String, PackageError> {
    let mut portable = manifest.clone();
    for asset in portable.assets.values_mut() {
        asset.resolved_path.clear();
    }
    Ok(serde_json::to_string_pretty(&portable)?)
}

#[allow(dead_code)]
fn _default_asset() -> RuntimeAssetMetadata {
    RuntimeAssetMetadata::default()
}
