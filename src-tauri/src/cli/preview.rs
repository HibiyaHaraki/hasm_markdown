use crate::models::payload::AssetManifest;
use crate::services::path_resolver::replace_asset_links;
use std::fs;
use std::path::Path;
use log::debug;

pub fn execute(path: &Path) -> Result<(), String> {
    // SEQ-MD-01 / CLI preview: Folder Type only; never launch the GUI.
    eprintln!("[SEQ-MD-01][CLI-PREVIEW] start target={}", path.display());
    if !path.exists() {
        eprintln!("[SEQ-MD-01][CLI-PREVIEW][ERROR] Target folder directory does not exist: {}", path.display());
        return Err("Target folder directory does not exist".to_string());
    }
    if !path.is_dir() {
        eprintln!("[SEQ-MD-01][CLI-PREVIEW][ERROR] Folder Type required, target is not a directory: {}", path.display());
        return Err("Preview subcommand supports Folder Type workspace directories only".to_string());
    }
    let markdown = fs::read_to_string(path.join("main.md")).map_err(|_| "Failed to read workspace metadata from target folder".to_string())?;
    let raw = fs::read_to_string(path.join("assets.json")).map_err(|_| "Failed to read workspace metadata from target folder".to_string())?;
    let mut manifest: AssetManifest = serde_json::from_str(&raw).map_err(|_| "Failed to parse assets.json".to_string())?;
    let mut links = std::collections::HashMap::new();
    for (alias, asset) in manifest.assets.iter_mut() {
        if asset.relative_path.is_empty() && !asset.uuid.is_empty() { asset.relative_path = format!("assets/{}", asset.uuid); }
        let resolved = path.join(&asset.relative_path).to_string_lossy().into_owned();
        links.insert(alias.clone(), resolved);
    }
    debug!("[SEQ-MD-01][CLI-PREVIEW] resolved {} asset aliases", links.len());
    println!("{}", replace_asset_links(&markdown, &links));
    eprintln!("[SEQ-MD-01][CLI-PREVIEW] finish target={} exit_code=0", path.display());
    Ok(())
}
