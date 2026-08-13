use std::path::{Path, PathBuf};
use crate::logger::init_logger;
use log::debug;

pub fn resolve_asset_path(root: &Path, relative_path: &str) -> PathBuf {
    init_logger();
    let resolved = root.join(relative_path);
    debug!("[SEQ-MD-01][PATH-RESOLUTION] folder relative={} resolved={}", relative_path, resolved.display());
    resolved
}

pub fn resolve_archive_asset_path(uuid: &str, asset_uuid: &str) -> String {
    let resolved = format!("asset-stream://{uuid}/{asset_uuid}");
    debug!("[SEQ-MD-01][PATH-RESOLUTION] archive asset_uuid={} resolved={}", asset_uuid, resolved);
    resolved
}

pub fn replace_asset_links(markdown: &str, assets: &std::collections::HashMap<String, String>) -> String {
    let mut output = markdown.to_string();
    for (alias, resolved_path) in assets {
        output = output.replace(&format!("asset:{alias}"), resolved_path);
    }
    output
}

#[cfg(test)]
mod tests {
    use super::resolve_asset_path;
    use std::path::Path;

    #[test]
    fn resolves_folder_relative_asset_path() {
        let resolved = resolve_asset_path(Path::new("C:/workspace"), "assets/test.png");
        assert_eq!(resolved, Path::new("C:/workspace").join("assets/test.png"));
    }
}
