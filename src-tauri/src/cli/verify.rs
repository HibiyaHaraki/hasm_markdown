use crate::models::cli::CliVerifyResult;
use crate::models::payload::{MissingAssetInfo, PackageWarning};
use crate::services::zip_engine;
use std::collections::HashSet;
use std::fs;
use std::path::Path;
use log::{debug, warn};

pub fn execute(path: &Path, json: bool) -> i32 {
    // SEQ-MD-01 / CLI verify: remain headless and terminate with validation status.
    eprintln!("[SEQ-MD-01][CLI-VERIFY] start target={} json={json}", path.display());
    let result = verify(path);
    let valid = result.missing_assets.is_empty();
    debug!("[SEQ-MD-01][CLI-VERIFY] inspected target={} missing={} warnings={}", path.display(), result.missing_assets.len(), result.warnings.len());
    if !valid { warn!("[SEQ-MD-01][CLI-VERIFY] invalid target={}", path.display()); }
    if json {
        println!("{}", serde_json::to_string_pretty(&result).unwrap_or_else(|_| "{}".to_string()));
    } else if valid {
        println!("Package verification successful");
        for warning in &result.warnings { println!("Warning: {} ({})", warning.code, warning.filename); }
    } else {
        println!("Package verification failed");
        for missing in &result.missing_assets { println!("Missing asset: {} -> {}", missing.alias, missing.expected_relative_path); }
    }
    eprintln!("[SEQ-MD-01][CLI-VERIFY] finish target={} exit_code={}", path.display(), if valid { 0 } else { 1 });
    if valid { 0 } else { 1 }
}

pub fn verify(path: &Path) -> CliVerifyResult {
    let mut missing_assets = Vec::new();
    let mut warnings = Vec::new();
    if !path.exists() {
        eprintln!("[SEQ-MD-01][CLI-VERIFY][ERROR] Target path does not exist or is inaccessible: {}", path.display());
        missing_assets.push(MissingAssetInfo { alias: "workspace".to_string(), expected_relative_path: "Target path does not exist or is inaccessible".to_string(), referenced_lines: Vec::new() });
    } else if path.is_dir() {
        verify_folder(path, &mut missing_assets, &mut warnings);
    } else {
        verify_archive(path, &mut missing_assets, &mut warnings);
    }
    CliVerifyResult { status: if missing_assets.is_empty() { "Valid" } else { "Invalid" }.to_string(), target_path: path.display().to_string(), missing_assets, warnings }
}

fn verify_folder(path: &Path, missing: &mut Vec<MissingAssetInfo>, warnings: &mut Vec<PackageWarning>) {
    let markdown_path = path.join("main.md");
    let manifest_path = path.join("assets.json");
    let markdown = match fs::read_to_string(&markdown_path) { Ok(value) => value, Err(_) => { missing.push(simple_missing("main.md")); return; } };
    let raw = match fs::read_to_string(&manifest_path) { Ok(value) => value, Err(_) => { missing.push(simple_missing("assets.json")); return; } };
    let manifest: crate::models::payload::AssetManifest = match serde_json::from_str(&raw) { Ok(value) => value, Err(_) => { missing.push(simple_missing("valid assets.json")); return; } };
    let registered: HashSet<String> = manifest.assets.values().map(|asset| asset.relative_path.clone()).collect();
    for (alias, asset) in manifest.assets { if !asset.is_deleted && !path.join(&asset.relative_path).is_file() { missing.push(MissingAssetInfo { alias, expected_relative_path: asset.relative_path, referenced_lines: Vec::new() }); } }
    if let Ok(entries) = fs::read_dir(path.join("assets")) { for entry in entries.flatten() { if entry.path().is_file() { let relative = format!("assets/{}", entry.file_name().to_string_lossy()); if !registered.contains(&relative) { warnings.push(PackageWarning { code: "OrphanAssetFound".to_string(), filename: relative }); } } } }
    let _ = markdown;
}

fn verify_archive(path: &Path, missing: &mut Vec<MissingAssetInfo>, warnings: &mut Vec<PackageWarning>) {
    let (markdown, raw) = match zip_engine::read_metadata(path) { Ok(value) => value, Err(_) => { missing.push(simple_missing("main.md and assets.json")); return; } };
    let manifest: crate::models::payload::AssetManifest = match serde_json::from_str(&raw) { Ok(value) => value, Err(_) => { missing.push(simple_missing("valid assets.json")); return; } };
    let entries = match zip_engine::list_asset_entries(path) { Ok(value) => value.into_iter().collect::<HashSet<_>>(), Err(_) => HashSet::new() };
    for (alias, asset) in manifest.assets { if !asset.is_deleted && !entries.contains(&asset.relative_path) { missing.push(MissingAssetInfo { alias, expected_relative_path: asset.relative_path, referenced_lines: Vec::new() }); } }
    let _ = markdown;
    let _ = warnings;
}

fn simple_missing(path: &str) -> MissingAssetInfo { MissingAssetInfo { alias: "workspace".to_string(), expected_relative_path: path.to_string(), referenced_lines: Vec::new() } }
