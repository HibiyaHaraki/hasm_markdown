use crate::domain::lock;
use crate::domain::manifest;
use crate::models::error::PackageError;
use crate::models::payload::{AssetManifest, MissingAssetInfo, PackageStatePayload, PackageWarning, TargetType};
use crate::services::zip_engine;
use std::collections::HashSet;
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use uuid::Uuid;
use crate::logger::init_logger;
use log::{debug, error, info, warn};

#[derive(Debug)]
pub struct WorkspaceSession {
    pub payload: PackageStatePayload,
    pub lock_path: PathBuf,
    handles: Vec<File>,
}

impl WorkspaceSession {
    pub fn close(self) -> Result<(), PackageError> {
        drop(self.handles);
        lock::release(&self.lock_path)
    }
}

pub fn open_archive(base_path: &Path, archive_path: &Path) -> Result<WorkspaceSession, PackageError> {
    // SEQ-MD-01 / Mode A: read only main.md and assets.json; keep archive media in place.
    init_logger();
    info!("[SEQ-MD-01][IMPORT][ARCHIVE] start target={}", archive_path.display());
    if !archive_path.is_file() {
        error!("[SEQ-MD-01][IMPORT][ARCHIVE][ERROR] target missing={}", archive_path.display());
        return Err(PackageError::Io("NotFound".to_string()));
    }
    let uuid = Uuid::new_v4().to_string();
    let temp_dir = base_path.join(&uuid);
    fs::create_dir_all(&temp_dir)?;
    let (markdown, raw_manifest) = match zip_engine::read_metadata(archive_path) {
        Ok(metadata) => metadata,
        Err(error) => { let _ = fs::remove_dir_all(&temp_dir); return Err(error); }
    };
    let result = finish_mount(temp_dir.clone(), uuid, TargetType::Archive, Some(archive_path), markdown, raw_manifest, Some(archive_path));
    if result.is_err() { let _ = fs::remove_dir_all(temp_dir); }
    if result.is_ok() { info!("[SEQ-MD-01][IMPORT][ARCHIVE] metadata mounted target={}", archive_path.display()); }
    result
}

pub fn open_folder(base_path: &Path, folder_path: &Path) -> Result<WorkspaceSession, PackageError> {
    // SEQ-MD-01 / Mode B: mount metadata without copying the external assets directory.
    init_logger();
    info!("[SEQ-MD-01][IMPORT][FOLDER] start target={}", folder_path.display());
    if !folder_path.is_dir() {
        return Err(PackageError::InvalidTarget(format!("Workspace folder does not exist: {}", folder_path.display())));
    }
    let markdown_path = folder_path.join("main.md");
    let manifest_path = folder_path.join("assets.json");
    let markdown = fs::read_to_string(&markdown_path).map_err(|_| PackageError::MissingMetadata("Missing main.md".to_string()))?;
    let raw_manifest = fs::read_to_string(&manifest_path).map_err(|_| PackageError::MissingMetadata("Missing assets.json".to_string()))?;
    let uuid = Uuid::new_v4().to_string();
    let temp_dir = base_path.join(&uuid);
    fs::create_dir_all(&temp_dir)?;
    let result = finish_mount(temp_dir.clone(), uuid, TargetType::Folder, Some(folder_path), markdown, raw_manifest, None);
    if result.is_err() { let _ = fs::remove_dir_all(temp_dir); }
    result
}

pub fn create_new(base_path: &Path) -> Result<WorkspaceSession, PackageError> {
    // SEQ-MD-01 / Mode C: scaffold only the local metadata and empty assets directory.
    init_logger();
    info!("[SEQ-MD-01][IMPORT][NEW] scaffold base={}", base_path.display());
    let uuid = Uuid::new_v4().to_string();
    let temp_dir = base_path.join(&uuid);
    fs::create_dir_all(temp_dir.join("assets"))?;
    finish_mount(temp_dir, uuid, TargetType::Unbound, None, "# New HASM Markdown\n\nStart editing here.\n".to_string(), r#"{"version":"1","assets":{}}"#.to_string(), None)
}

fn finish_mount(
    temp_dir: PathBuf,
    uuid: String,
    target_type: TargetType,
    target_path: Option<&Path>,
    markdown: String,
    raw_manifest: String,
    archive_path: Option<&Path>,
) -> Result<WorkspaceSession, PackageError> {
    fs::write(temp_dir.join("main.md"), &markdown)?;
    fs::write(temp_dir.join("assets.json"), &raw_manifest)?;
    fs::create_dir_all(temp_dir.join("assets"))?;
    let lock_path = temp_dir.join(".lock");
    lock::acquire(&lock_path)?;

    let archive_uuid = matches!(target_type, TargetType::Archive).then_some(uuid.as_str());
    let target_root = target_path.unwrap_or(&temp_dir);
    let manifest = manifest::parse_and_resolve(&raw_manifest, target_root, archive_uuid)?;
    debug!("[SEQ-MD-01][PATH-RESOLUTION] resolved manifest assets={} archive={}", manifest.assets.len(), archive_uuid.is_some());
    let (missing_assets, warnings) = inspect_assets(&manifest, target_root, archive_path)?;
    if !missing_assets.is_empty() { warn!("[SEQ-MD-01][VALIDATION] missing_assets={}", missing_assets.len()); }

    let mut handles = Vec::new();
    handles.push(OpenOptions::new().read(true).write(true).open(temp_dir.join("main.md"))?);
    handles.push(OpenOptions::new().read(true).write(true).open(temp_dir.join("assets.json"))?);
    if let Some(path) = archive_path { handles.push(File::open(path)?); }

    Ok(WorkspaceSession {
        payload: PackageStatePayload {
            uuid,
            temp_dir_path: temp_dir.to_string_lossy().into_owned(),
            target_type,
            target_path: target_path.map(|path| path.to_string_lossy().into_owned()),
            is_loaded: true,
            is_dirty: false,
            raw_content: markdown.clone(),
            last_saved_content: markdown,
            manifest,
            missing_assets,
            warnings,
        },
        lock_path,
        handles,
    })
}

fn inspect_assets(
    manifest: &AssetManifest,
    root: &Path,
    archive_path: Option<&Path>,
) -> Result<(Vec<MissingAssetInfo>, Vec<PackageWarning>), PackageError> {
    let archive_entries = if let Some(path) = archive_path { Some(zip_engine::list_asset_entries(path)?.into_iter().collect::<HashSet<_>>()) } else { None };
    let mut missing = Vec::new();
    for (alias, asset) in &manifest.assets {
        let exists = if let Some(entries) = &archive_entries { entries.contains(&asset.relative_path) } else { root.join(&asset.relative_path).is_file() };
        if !exists && !asset.is_deleted {
            missing.push(MissingAssetInfo { alias: alias.clone(), expected_relative_path: asset.relative_path.clone(), referenced_lines: Vec::new() });
        }
    }
    let warnings = Vec::new();
    Ok((missing, warnings))
}

pub fn write_markdown(session: &WorkspaceSession, markdown: &str) -> Result<(), PackageError> {
    let path = Path::new(&session.payload.temp_dir_path).join("main.md");
    let temporary_path = path.with_extension("md.tmp");
    let mut file = File::create(&temporary_path)?;
    file.write_all(markdown.as_bytes())?;
    file.flush()?;
    file.sync_all()?;
    fs::rename(temporary_path, path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{open_archive, write_markdown, WorkspaceSession};
    use crate::models::payload::{AssetManifest, PackageStatePayload, TargetType};
    use std::fs::File;
    use std::io::Write;
    use zip::write::SimpleFileOptions;
    use zip::ZipWriter;
    #[test]
    fn open_archive_reports_not_found_without_creating_temp_workspace() {
        let base = std::env::temp_dir().join(format!("hasm-seq-md-01-{}", std::process::id()));
        let missing = base.join("missing.hasmmd");
        let result = open_archive(&base, &missing);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().to_string(), "NotFound");
        assert!(!base.join("missing.hasmmd").exists());
        let _ = std::fs::remove_dir_all(base);
    }

    #[test]
    fn archive_import_extracts_metadata_only_and_resolves_stream_paths() {
        let base = std::env::temp_dir().join(format!("hasm-seq-md-01-selective-{}", std::process::id()));
        let archive_path = base.join("selective.hasmmd");
        std::fs::create_dir_all(&base).unwrap();
        let file = File::create(&archive_path).unwrap();
        let mut archive = ZipWriter::new(file);
        let options = SimpleFileOptions::default();
        archive.start_file("main.md", options).unwrap();
        archive.write_all(b"# Selective\n").unwrap();
        archive.start_file("assets.json", options).unwrap();
        archive.write_all(br#"{"version":"1","assets":{"hero":{"uuid":"hero.png","relativePath":"assets/hero.png"},"second":{"uuid":"second.png","relativePath":"assets/second.png"}}}"#).unwrap();
        archive.start_file("assets/hero.png", options).unwrap();
        archive.write_all(b"heavy-media").unwrap();
        archive.start_file("assets/second.png", options).unwrap();
        archive.write_all(b"second-media").unwrap();
        archive.finish().unwrap();

        let session = open_archive(&base, &archive_path).unwrap();
        let temp_dir = std::path::PathBuf::from(&session.payload.temp_dir_path);
        assert!(temp_dir.join("main.md").is_file());
        assert!(temp_dir.join("assets.json").is_file());
        assert!(!temp_dir.join("assets/hero.png").exists());
        assert_eq!(session.payload.manifest.assets["hero"].resolved_path, format!("asset-stream://{}/hero.png", session.payload.uuid));
        assert_eq!(session.payload.manifest.assets.len(), 2);
        session.close().unwrap();
        let _ = std::fs::remove_dir_all(base);
    }

    #[test]
    fn local_autosave_atomically_replaces_utf8_markdown() {
        let base = std::env::temp_dir().join(format!("hasm-seq-md-02-atomic-{}", std::process::id()));
        std::fs::create_dir_all(&base).unwrap();
        let markdown_path = base.join("main.md");
        std::fs::write(&markdown_path, "old").unwrap();
        let session = WorkspaceSession {
            payload: PackageStatePayload {
                uuid: "test".to_string(),
                temp_dir_path: base.to_string_lossy().into_owned(),
                target_type: TargetType::Unbound,
                target_path: None,
                is_loaded: true,
                is_dirty: true,
                raw_content: "old".to_string(),
                last_saved_content: "old".to_string(),
                manifest: AssetManifest::default(),
                missing_assets: Vec::new(),
                warnings: Vec::new(),
            },
            lock_path: base.join(".lock"),
            handles: Vec::new(),
        };

        write_markdown(&session, "日本語\nasset:second").unwrap();

        assert_eq!(std::fs::read_to_string(&markdown_path).unwrap(), "日本語\nasset:second");
        assert!(!base.join("main.md.tmp").exists());
        let _ = std::fs::remove_dir_all(base);
    }

    #[test]
    fn local_autosave_preserves_existing_markdown_when_temp_write_fails() {
        let base = std::env::temp_dir().join(format!("hasm-seq-md-02-failure-{}", std::process::id()));
        std::fs::create_dir_all(&base).unwrap();
        let markdown_path = base.join("main.md");
        std::fs::write(&markdown_path, "keep me").unwrap();
        std::fs::create_dir(base.join("main.md.tmp")).unwrap();
        let session = WorkspaceSession {
            payload: PackageStatePayload {
                uuid: "test".to_string(),
                temp_dir_path: base.to_string_lossy().into_owned(),
                target_type: TargetType::Unbound,
                target_path: None,
                is_loaded: true,
                is_dirty: true,
                raw_content: "keep me".to_string(),
                last_saved_content: "keep me".to_string(),
                manifest: AssetManifest::default(),
                missing_assets: Vec::new(),
                warnings: Vec::new(),
            },
            lock_path: base.join(".lock"),
            handles: Vec::new(),
        };

        assert!(write_markdown(&session, "new content").is_err());
        assert_eq!(std::fs::read_to_string(&markdown_path).unwrap(), "keep me");
        let _ = std::fs::remove_dir_all(base);
    }

    #[test]
    fn folder_mount_keeps_assets_external_and_resolves_absolute_paths() {
        let base = std::env::temp_dir().join(format!("hasm-seq-md-01-folder-{}", std::process::id()));
        let folder = base.join("workspace");
        std::fs::create_dir_all(folder.join("assets")).unwrap();
        std::fs::write(folder.join("main.md"), "# Folder\n\n![note](asset:note)\n").unwrap();
        std::fs::write(folder.join("assets.json"), br#"{"version":"1","assets":{"note":{"uuid":"note.txt","relativePath":"assets/note.txt"}}}"#).unwrap();
        std::fs::write(folder.join("assets/note.txt"), "external asset\n").unwrap();

        let session = super::open_folder(&base, &folder).unwrap();
        let resolved = &session.payload.manifest.assets["note"].resolved_path;
        assert!(resolved.ends_with("assets/note.txt"));
        assert!(std::path::Path::new(resolved).is_absolute());
        assert!(!std::path::Path::new(&session.payload.temp_dir_path).join("assets/note.txt").exists());
        session.close().unwrap();
        let _ = std::fs::remove_dir_all(base);
    }
}
