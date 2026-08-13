use crate::domain::package::{self, WorkspaceSession};
use crate::models::payload::{AssetManifest, TargetType};
use crate::AppState;
use chrono::Utc;
use std::collections::HashSet;
use std::fs::{self, File};
use std::io::Write;
use std::path::Path;
use tauri::Emitter;
use zip::write::SimpleFileOptions;
use zip::{ZipArchive, ZipWriter};

#[derive(Debug, Default, Clone)]
pub struct AssetDeltaContext {
    pub delete_list: Vec<String>,
    pub addition_list: Vec<String>,
    pub unmodified_list: Vec<String>,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SaveProgress {
    stage: String,
    percentage: f32,
}

pub fn compute_deltas(manifest: &AssetManifest, target_entries: &HashSet<String>) -> AssetDeltaContext {
    let mut result = AssetDeltaContext::default();
    for (alias, asset) in &manifest.assets {
        if asset.is_deleted {
            result.delete_list.push(alias.clone());
        } else if target_entries.contains(&asset.relative_path) {
            result.unmodified_list.push(alias.clone());
        } else {
            result.addition_list.push(alias.clone());
        }
    }
    result
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SaveExecutionPayload {
    pub uuid: String,
    pub target_path: String,
    pub saved_at: String,
    pub raw_content: String,
    pub last_saved_content: String,
    pub is_dirty: bool,
    pub manifest: AssetManifest,
    pub missing_assets: Vec<crate::models::payload::MissingAssetInfo>,
    pub warnings: Vec<crate::models::payload::PackageWarning>,
}

#[tauri::command]
pub fn execute_package_save_or_export(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
    uuid: String,
    export_target_path: Option<String>,
) -> Result<SaveExecutionPayload, String> {
    let mut active = state.workspace.lock().map_err(|_| "Failed to lock workspace state".to_string())?;
    let session = active.as_mut().ok_or_else(|| "No active workspace".to_string())?;
    if session.payload.uuid != uuid { return Err("Workspace UUID does not match active session".to_string()); }
    let target_path = export_target_path.or_else(|| session.payload.target_path.clone()).ok_or_else(|| "Workspace has no save target".to_string())?;
    emit_progress(&app, "ComputingAssetDeltas", 10.0);

    let target_is_archive = target_path.to_ascii_lowercase().ends_with(".hasmmd");
    let target_entries = if target_is_archive && Path::new(&target_path).is_file() {
        archive_entries(Path::new(&target_path)).map_err(|error| error.to_string())?
    } else if !target_is_archive && Path::new(&target_path).is_dir() {
        folder_entries(Path::new(&target_path))
    } else {
        HashSet::new()
    };
    let deltas = compute_deltas(&session.payload.manifest, &target_entries);
    emit_progress(&app, "ExecutingAssetDeltas", 30.0);

    let normalized = normalize_active_manifest(&session.payload.manifest);
    session.release_handles();
    if target_is_archive {
        write_archive(session, Path::new(&target_path), &normalized, &deltas)?;
    } else {
        write_folder(session, Path::new(&target_path), &normalized, &deltas)?;
    }
    emit_progress(&app, "SyncingManifest", 80.0);

    let runtime_target = if target_is_archive { TargetType::Archive } else { TargetType::Folder };
    session.payload.target_type = runtime_target.clone();
    session.payload.manifest = rebind_manifest(normalized, &runtime_target, &session.payload.uuid, &target_path);
    session.payload.target_path = Some(target_path.clone());
    session.payload.last_saved_content = session.payload.raw_content.clone();
    session.payload.is_dirty = false;
    package::persist_manifest(session).map_err(|error| error.to_string())?;
    package::write_markdown(session, &session.payload.raw_content).map_err(|error| error.to_string())?;
    emit_progress(&app, "Complete", 100.0);

    Ok(SaveExecutionPayload {
        uuid: session.payload.uuid.clone(),
        target_path,
        saved_at: Utc::now().to_rfc3339(),
        raw_content: session.payload.raw_content.clone(),
        last_saved_content: session.payload.last_saved_content.clone(),
        is_dirty: false,
        manifest: session.payload.manifest.clone(),
        missing_assets: session.payload.missing_assets.clone(),
        warnings: session.payload.warnings.clone(),
    })
}

fn emit_progress(app: &tauri::AppHandle, stage: &str, percentage: f32) {
    let _ = app.emit("save_progress", SaveProgress { stage: stage.to_string(), percentage });
}

pub fn normalize_active_manifest(manifest: &AssetManifest) -> AssetManifest {
    let mut normalized = manifest.clone();
    normalized.assets.retain(|_, asset| !asset.is_deleted);
    for asset in normalized.assets.values_mut() {
        let filename = Path::new(&asset.uuid).file_name().and_then(|value| value.to_str()).unwrap_or("asset.bin");
        asset.relative_path = format!("assets/{filename}");
        asset.resolved_path.clear();
        asset.deleted_at = None;
    }
    normalized
}

fn rebind_manifest(mut manifest: AssetManifest, target_type: &TargetType, uuid: &str, target_path: &str) -> AssetManifest {
    for asset in manifest.assets.values_mut() {
        asset.resolved_path = match target_type {
            TargetType::Archive => format!("asset-stream://{uuid}/{}", asset.uuid),
            TargetType::Folder | TargetType::Unbound => Path::new(target_path).join(&asset.relative_path).to_string_lossy().into_owned(),
        };
    }
    manifest
}

fn archive_entries(path: &Path) -> Result<HashSet<String>, std::io::Error> {
    let file = File::open(path)?;
    let mut archive = ZipArchive::new(file).map_err(std::io::Error::other)?;
    let mut entries = HashSet::new();
    for index in 0..archive.len() {
        let entry = archive.by_index(index).map_err(std::io::Error::other)?;
        if entry.name().starts_with("assets/") && !entry.name().ends_with('/') { entries.insert(entry.name().to_string()); }
    }
    Ok(entries)
}

fn folder_entries(path: &Path) -> HashSet<String> {
    fs::read_dir(path.join("assets")).ok().into_iter().flatten().filter_map(|entry| entry.ok()).filter_map(|entry| entry.file_name().to_str().map(|name| format!("assets/{name}"))).collect()
}

fn write_archive(session: &WorkspaceSession, target: &Path, manifest: &AssetManifest, deltas: &AssetDeltaContext) -> Result<(), String> {
    if let Some(parent) = target.parent() { fs::create_dir_all(parent).map_err(|error| error.to_string())?; }
    let temporary = Path::new(&session.payload.temp_dir_path).join("output.tmp.zip");
    let output = File::create(&temporary).map_err(|error| error.to_string())?;
    let mut writer = ZipWriter::new(output);
    let options = SimpleFileOptions::default();
    writer.start_file("main.md", options).map_err(|error| error.to_string())?;
    writer.write_all(session.payload.raw_content.as_bytes()).map_err(|error| error.to_string())?;
    writer.start_file("assets.json", options).map_err(|error| error.to_string())?;
    writer.write_all(serde_json::to_string_pretty(manifest).map_err(|error| error.to_string())?.as_bytes()).map_err(|error| error.to_string())?;

    let old_archive = if target.is_file() { Some(ZipArchive::new(File::open(target).map_err(|error| error.to_string())?).map_err(|error| error.to_string())?) } else { None };
    let mut old_archive = old_archive;
    for alias in &deltas.unmodified_list {
        let asset = &session.payload.manifest.assets[alias];
        if let Some(archive) = old_archive.as_mut() {
            if let Ok(mut entry) = archive.by_name(&asset.relative_path) {
                writer.start_file(&asset.relative_path, options).map_err(|error| error.to_string())?;
                std::io::copy(&mut entry, &mut writer).map_err(|error| error.to_string())?;
            }
        }
    }
    for alias in &deltas.addition_list {
        let asset = &session.payload.manifest.assets[alias];
        let source = Path::new(&asset.resolved_path);
        let mut input = File::open(source).map_err(|error| error.to_string())?;
        writer.start_file(&asset.relative_path, options).map_err(|error| error.to_string())?;
        std::io::copy(&mut input, &mut writer).map_err(|error| error.to_string())?;
    }
    writer.finish().map_err(|error| error.to_string())?;
    drop(old_archive);
    fs::rename(&temporary, target).map_err(|error| error.to_string())?;
    let _ = deltas.delete_list.len();
    Ok(())
}

fn write_folder(session: &WorkspaceSession, target: &Path, manifest: &AssetManifest, deltas: &AssetDeltaContext) -> Result<(), String> {
    fs::create_dir_all(target.join("assets")).map_err(|error| error.to_string())?;
    fs::write(target.join("main.md"), &session.payload.raw_content).map_err(|error| error.to_string())?;
    fs::write(target.join("assets.json"), serde_json::to_string_pretty(manifest).map_err(|error| error.to_string())?).map_err(|error| error.to_string())?;
    for alias in &deltas.delete_list {
        if let Some(asset) = session.payload.manifest.assets.get(alias) { let _ = fs::remove_file(target.join(&asset.relative_path)); }
    }
    for alias in &deltas.addition_list {
        let asset = &session.payload.manifest.assets[alias];
        let destination = target.join(&asset.relative_path);
        if let Some(parent) = destination.parent() { fs::create_dir_all(parent).map_err(|error| error.to_string())?; }
        fs::copy(&asset.resolved_path, destination).map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{compute_deltas, normalize_active_manifest};
    use crate::models::payload::{AssetManifest, RuntimeAssetMetadata};
    use std::collections::HashSet;

    #[test]
    fn computes_deleted_added_and_unmodified_assets() {
        let manifest = AssetManifest { version: "1".to_string(), assets: [
            ("deleted".to_string(), RuntimeAssetMetadata { uuid: "deleted.png".to_string(), is_deleted: true, ..Default::default() }),
            ("added".to_string(), RuntimeAssetMetadata { uuid: "added.png".to_string(), relative_path: "assets/added.png".to_string(), ..Default::default() }),
            ("same".to_string(), RuntimeAssetMetadata { uuid: "same.png".to_string(), relative_path: "assets/same.png".to_string(), ..Default::default() }),
        ].into_iter().collect() };
        let target_entries: HashSet<String> = ["assets/same.png".to_string()].into_iter().collect();
        let deltas = compute_deltas(&manifest, &target_entries);
        assert_eq!(deltas.delete_list, vec!["deleted"]);
        assert_eq!(deltas.addition_list, vec!["added"]);
        assert_eq!(deltas.unmodified_list, vec!["same"]);
    }

    #[test]
    fn normalizes_and_purges_deleted_metadata() {
        let manifest = AssetManifest { version: "1".to_string(), assets: [
            ("deleted".to_string(), RuntimeAssetMetadata { uuid: "deleted.png".to_string(), is_deleted: true, ..Default::default() }),
            ("active".to_string(), RuntimeAssetMetadata { uuid: "active.png".to_string(), resolved_path: "C:/external/active.png".to_string(), ..Default::default() }),
        ].into_iter().collect() };
        let normalized = normalize_active_manifest(&manifest);
        assert!(!normalized.assets.contains_key("deleted"));
        assert_eq!(normalized.assets["active"].relative_path, "assets/active.png");
        assert!(normalized.assets["active"].resolved_path.is_empty());
    }
}
