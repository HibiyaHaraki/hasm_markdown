use crate::models::error::PackageError;
use std::fs::File;
use std::io::Read;
use std::path::Path;
use zip::ZipArchive;

pub fn read_metadata(archive_path: &Path) -> Result<(String, String), PackageError> {
    let file = File::open(archive_path)?;
    let mut archive = ZipArchive::new(file)?;
    let markdown = read_entry(&mut archive, "main.md")?;
    let manifest = read_entry(&mut archive, "assets.json")?;
    Ok((markdown, manifest))
}

pub fn contains_entry(archive_path: &Path, relative_path: &str) -> Result<bool, PackageError> {
    let file = File::open(archive_path)?;
    let mut archive = ZipArchive::new(file)?;
    let found = archive.by_name(relative_path).is_ok();
    Ok(found)
}

pub fn list_asset_entries(archive_path: &Path) -> Result<Vec<String>, PackageError> {
    let file = File::open(archive_path)?;
    let mut archive = ZipArchive::new(file)?;
    let mut entries = Vec::new();
    for index in 0..archive.len() {
        let entry = archive.by_index(index)?;
        let name = entry.name().to_string();
        if name.starts_with("assets/") && !name.ends_with('/') {
            entries.push(name);
        }
    }
    Ok(entries)
}

pub fn read_entry_bytes(archive_path: &Path, name: &str) -> Result<Vec<u8>, PackageError> {
    let file = File::open(archive_path)?;
    let mut archive = ZipArchive::new(file)?;
    let mut entry = archive.by_name(name).map_err(|_| PackageError::MissingMetadata(format!("Missing {name}")))?;
    let mut content = Vec::new();
    entry.read_to_end(&mut content)?;
    Ok(content)
}

fn read_entry(archive: &mut ZipArchive<File>, name: &str) -> Result<String, PackageError> {
    let mut entry = archive.by_name(name).map_err(|_| PackageError::MissingMetadata(format!("Missing {name}")))?;
    let mut content = String::new();
    entry.read_to_string(&mut content)?;
    Ok(content)
}
