use crate::models::error::PackageError;
use crate::models::payload::{AssetManifest, RuntimeAssetMetadata};
use crate::services::path_resolver::{resolve_archive_asset_path, resolve_asset_path};
use log::info;
use std::fs;
use std::io::ErrorKind;
use std::path::Path;

pub const EMPTY_MANIFEST_JSON: &str = r#"{"version":"1","assets":{}}"#;

/// SEQ-MD-01 / Mode B: a folder without registered assets may omit `assets.json`
/// (HASM scaffolds entity folders with only `main.md` and `assets/`), so a missing
/// manifest is treated as empty. Any other read failure is still reported.
pub fn read_folder_manifest(folder_path: &Path) -> Result<String, PackageError> {
    match fs::read_to_string(folder_path.join("assets.json")) {
        Ok(raw) => Ok(raw),
        Err(error) if error.kind() == ErrorKind::NotFound => {
            info!("[SEQ-MD-01][IMPORT][FOLDER] assets.json absent; using empty manifest");
            Ok(EMPTY_MANIFEST_JSON.to_string())
        }
        Err(error) => Err(PackageError::MissingMetadata(format!("Failed to read assets.json: {error}"))),
    }
}

pub fn validate_alias(manifest: &AssetManifest, alias: &str) -> Result<(), PackageError> {
    let alias = alias.trim();
    if alias.is_empty() || alias.contains('/') || alias.contains('\\') || manifest.assets.contains_key(alias) {
        return Err(PackageError::AliasCollision("Alias or reserved name already exists in workspace history.".to_string()));
    }
    Ok(())
}

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

#[cfg(test)]
mod tests {
    use super::{read_folder_manifest, validate_alias, EMPTY_MANIFEST_JSON};
    use crate::models::payload::{AssetManifest, RuntimeAssetMetadata};

    #[test]
    fn read_folder_manifest_defaults_missing_file_and_reports_other_failures() {
        let base = std::env::temp_dir().join(format!("hasm-seq-md-01-manifest-{}", std::process::id()));
        std::fs::create_dir_all(&base).unwrap();
        assert_eq!(read_folder_manifest(&base).unwrap(), EMPTY_MANIFEST_JSON);
        std::fs::create_dir(base.join("assets.json")).unwrap();
        assert!(read_folder_manifest(&base).unwrap_err().to_string().contains("Failed to read assets.json"));
        std::fs::remove_dir(base.join("assets.json")).unwrap();
        std::fs::write(base.join("assets.json"), r#"{"version":"1","assets":{"a":{}}}"#).unwrap();
        assert!(read_folder_manifest(&base).unwrap().contains("\"a\""));
        let _ = std::fs::remove_dir_all(base);
    }

    #[test]
    fn validate_alias_reserves_soft_deleted_entries() {
        let mut manifest = AssetManifest::default();
        manifest.assets.insert("old.png".to_string(), RuntimeAssetMetadata { is_deleted: true, ..Default::default() });
        assert!(validate_alias(&manifest, "old.png").is_err());
        assert!(validate_alias(&manifest, "new.png").is_ok());
    }
}
