use crate::domain::{manifest, package};
use crate::models::payload::{PackageStatePayload, RuntimeAssetMetadata};
use crate::AppState;
use chrono::Utc;
use std::fs;
use std::path::Path;
use tauri::Emitter;
use uuid::Uuid;

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AssetProgress {
    stage: String,
    percentage: f32,
}

#[tauri::command]
pub fn register_and_bind_single_asset_path(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
    source_path: String,
    custom_alias: String,
) -> Result<PackageStatePayload, String> {
    let source = Path::new(&source_path);
    if !source.is_file() {
        return Err("Selected asset file does not exist.".to_string());
    }
    let extension = source.extension().and_then(|value| value.to_str()).unwrap_or("bin").to_ascii_lowercase();
    if !matches!(extension.as_str(), "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg") {
        return Err("Selected asset must be an image file.".to_string());
    }
    let _ = app.emit("asset_register_progress", AssetProgress { stage: "ValidatingAlias".to_string(), percentage: 0.0 });
    let mut active = state.workspace.lock().map_err(|_| "Failed to lock workspace state".to_string())?;
    let session = active.as_mut().ok_or_else(|| "No active workspace".to_string())?;
    manifest::validate_alias(&session.payload.manifest, &custom_alias).map_err(|error| error.to_string())?;

    let asset_uuid = Uuid::new_v4().to_string();
    let relative_path = format!("assets/{asset_uuid}.{extension}");
    let metadata = fs::metadata(source).map_err(|error| error.to_string())?;
    session.payload.manifest.assets.insert(custom_alias, RuntimeAssetMetadata {
        uuid: format!("{asset_uuid}.{extension}"),
        relative_path,
        resolved_path: source_path,
        mime_type: mime_type_for_extension(&extension),
        size: metadata.len(),
        is_external: true,
        is_deleted: false,
        deleted_at: None,
    });
    let _ = app.emit("asset_register_progress", AssetProgress { stage: "GeneratingThumbnail".to_string(), percentage: 50.0 });
    package::persist_manifest(session).map_err(|error| error.to_string())?;
    let _ = app.emit("asset_register_progress", AssetProgress { stage: "Complete".to_string(), percentage: 100.0 });
    Ok(session.payload.clone())
}

#[tauri::command]
pub fn soft_delete_asset_mapping(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
    alias: String,
) -> Result<PackageStatePayload, String> {
    let _ = app.emit("asset_delete_progress", AssetProgress { stage: "SettingDeleteFlag".to_string(), percentage: 0.0 });
    let mut active = state.workspace.lock().map_err(|_| "Failed to lock workspace state".to_string())?;
    let session = active.as_mut().ok_or_else(|| "No active workspace".to_string())?;
    let asset = session.payload.manifest.assets.get_mut(&alias).ok_or_else(|| "Asset alias does not exist.".to_string())?;
    asset.is_deleted = true;
    asset.deleted_at = Some(Utc::now().to_rfc3339());
    package::persist_manifest(session).map_err(|error| error.to_string())?;
    let (missing_assets, warnings) = package::recalculate_asset_state(session).map_err(|error| error.to_string())?;
    session.payload.missing_assets = missing_assets;
    session.payload.warnings = warnings;
    let _ = app.emit("asset_delete_progress", AssetProgress { stage: "Complete".to_string(), percentage: 100.0 });
    Ok(session.payload.clone())
}

fn mime_type_for_extension(extension: &str) -> String {
    match extension.to_ascii_lowercase().as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        _ => "application/octet-stream",
    }.to_string()
}
