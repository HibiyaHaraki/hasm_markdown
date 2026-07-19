/// # hasm_markdown.rs
/// Hibiya Haraki (July, 2026)
/// ## Purpose
/// Define Structure of HASM Markdown

// Modules

// Crates
use crate::logger::{init_logger, LOGLEVEL};
use log::{debug, error, info, trace, warn};
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{ BufWriter, Read, Write };
use std::path::{ PathBuf };
use uuid::Uuid;
use walkdir::WalkDir;
use zip::write::SimpleFileOptions;
use zip::{ ZipWriter, ZipArchive };

// Constants
pub static MDNAME: &str = "main.md";

/// ## Structure Definition : HASMMarkdown
/// HASM Markdown aims to gather all information included the markdown file in one zip file. This zip file package contents is called "HASM Markdown Package"
/// The structure HASMMarkdown owns the information of the "HASM Markdown Package".
/// 
/// ### Field Variables
/// * UUID : Imported .hasmmd file (HASM Markdown Package) is stored in App directory and managed by specific UUID. This field stores the specific UUID of the HASM Markdown package.
/// * Package Local Path : Imported .hasmmd (HASM Markdown Package) is stored in App directory. Package Local Path stores the path on local App directory.
/// * HASMMD Local Path : If the HASM Markdown Package is zipped and saved as .hasmmd file, this field stores the path to the zipped file.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HASMMarkdown {
    pub uuid                : Uuid,
    pub package_local_path  : PathBuf,
    pub hasmmd_local_path   : PathBuf
}

/// ### Methods
impl HASMMarkdown {

    /// #### new
    /// Create new instance of HASMMarkdown structure
    /// ##### Inputs
    /// none
    /// ##### Outputs
    /// * HASM Markdown Structure (self)
    
    pub fn new() -> Self {
        // Step 0. Init logger
        init_logger();

        // Step 1. Create UUID
        let new_uuid = Uuid::new_v4();

        // Step 2. Create new instance
        let hasmmd = Self {
            uuid                : new_uuid,
            package_local_path  : PathBuf::new(),
            hasmmd_local_path   : PathBuf::new()
        };
        debug!("Create HASMMarkdown instance (UUID: {})", new_uuid);

        // Step 3. Return
        hasmmd
    }

    /// #### with_exist_asset_package
    /*
    pub fn with_exist_asset_package(mut self, package_asset_url: String) -> Self {
        if let Some(path) = url_to_local_path(&package_asset_url) {
            self.package_local_path = path;
        }
        self.package_asset_url = package_asset_url;
        self
    }
    */

    /// #### with_exist_local_package
    /*
    pub fn with_exist_local_package(mut self, package_local_path: PathBuf) -> Self {
        self.package_asset_url = local_path_to_url(&package_local_path);
        self.package_local_path = package_local_path;
        self
    }
    */

    /// #### with_exist_hasmmd
    /// Builder method to set the path of the `.hasmmd` compressed package file.
    /// ##### Inputs
    /// * HASMMD Local Path : Path to local.hasmmd file
    /// ##### Outputs
    /// * HASM Markdown Structure (self)
    /*
    pub fn with_exist_hasmmd(mut self, hasmmd_local_path: PathBuf) -> Self {
        self.hasmmd_local_path = hasmmd_local_path;
        self
    }
    */

    /// #### read_hasmmd_data
    /// Reads the `data.json` metadata from the current `package_local_path` to populate the struct's UUID and name.
    /// ##### Inputs
    /// none
    /// ##### Outputs
    /// * HASM Markdown Structure (self)
    /*
    pub fn read_hasmmd_data(mut self) -> Self {
        let data_path = self.package_local_path.join("data.json");
        if let Ok(file) = File::open(data_path) {
            if let Ok(data) = serde_json::from_reader::<_, HASMMarkdownData>(file) {
                self.uuid = data.uuid;
            }
        }
        self
    }
    */

    
    /// #### open_hasmmd
    /// Opens a HASM Markdown package from a zipped file, extracts it, and initializes the HASMMarkdown struct.
    ///
    /// # Inputs
    /// * `hasmmd_file_path` - The local `PathBuf` to the `.hasmmd` zipped package file.
    /// * `app_local_base_path` - The base directory where the package contents should be extracted. A subdirectory named after the package's UUID will be created here.
    ///
    /// # Outputs
    /// * A `HASMMarkdown` struct representing the opened package. If any error occurs during opening or extraction, a default-initialized `HASMMarkdown` struct is returned, and errors are logged.
    pub fn open_hasmmd(
        base_path: PathBuf,
        hasmmd_file_path: PathBuf
    ) -> Result<(Self, String), String> {
        // Step 0. Init logger
        init_logger();
        debug!("[START] open_hasmmd");
        
        // Step 1. Define new HASM instance
        debug!("Step 1: [START] Define new HASM instance");
        let mut hasmmd = Self::new();
        hasmmd.hasmmd_local_path = hasmmd_file_path.clone();
        hasmmd.uuid = Uuid::new_v4();
        hasmmd.package_local_path = base_path.join(hasmmd.uuid.to_string());
        debug!("Step 1: [DONE] Define new HASM instance (UUID: {})",hasmmd.uuid.clone());

        // Step 2. Create a local package
        debug!("Step 2: [START] Create a local package");
        if let Err(e) = fs::create_dir_all(hasmmd.package_local_path.clone()) {
            error!("Failed to create temporary extraction directory {}: {}", hasmmd.package_local_path.display(), e);
            return Err("Stop opening hasmmd due to error".to_string());
        }
        debug!("Step 2: [DONE] Created a local package ({})", hasmmd.package_local_path.display());

        // Step 3. Unzip the local package
        debug!("Step 3: [START] Unzip the local package");
        if let Ok(file) = File::open(&hasmmd_file_path) {
                if let Ok(mut archive) = ZipArchive::new(file) {
                if let Err(e) = archive.extract(&hasmmd.package_local_path) {
                    error!("Failed to extract zip archive to {}: {}", hasmmd.package_local_path.display(), e);
                    // Clean up the partially extracted directory
                    let _ = fs::remove_dir_all(&hasmmd.package_local_path);
                    return Err("Stop opening hasmmd due to error".to_string());
                }
                } else {
                error!("Failed to create zip archive from file: {}", hasmmd_file_path.display());
                // Clean up the temporary extraction directory
                let _ = fs::remove_dir_all(&hasmmd.package_local_path);
                return Err("Stop opening hasmmd due to error".to_string());
            }
        } else {
            error!("Failed to open zipped package file: {}", hasmmd_file_path.display());
            // Clean up the temporary extraction directory
            let _ = fs::remove_dir_all(&hasmmd.package_local_path);
            return Err("Stop opening hasmmd due to error".to_string());
        }
        debug!("Step 3: [DONE] Unzip the local package");

        // Step 4. Read Markdown
        debug!("Step 4: [START] Read Markdown");
        let mut markdown = String::new();
        let content_path = hasmmd.package_local_path.join(MDNAME);
        if let Ok(mut file) = File::open(&content_path) {
            let _ = file.read_to_string(&mut markdown);
        } else {
            error!("Failed to open content.md: {}", content_path.display());
            return Err("Stop opening hasmmd due to error".to_string());
        }
        debug!("Step 4: [DONE] Read Markdown");

        // 5. Return hasmmd and content.md string
        Ok((hasmmd, markdown))
    }

    /// #### save_local_package
    /// Saves the package content and metadata to the local directory
    /// 
    /// ##### Inputs
    /// * content - Latest Markdown Content
    /// ##### Outputs
    /// none
    pub fn save_local_package(
        &mut self,
        markdown: String,
    ) -> Result<(), String> {
        // Step 0. Init logger
        init_logger();
        debug!("[START] save_local_package");

        // Step 1. Check the local package existance
        debug!("Step 1: [START] Check the local package existance ({})",self.package_local_path.display());
        if !self.package_local_path.exists() {
            debug!("Local Package does not exist. (UUID: {})", self.uuid);
            return Err(format!(
                "Local Package does not exist. (UUID: {})",
                self.uuid
            ));
        }
        debug!("Step 1: [DONE] Confirm the local package existance ({})",self.package_local_path.display());

        // Step 2. Save the content on local package
        debug!("Step 2: [START] Save the content on local package");
        let target_path = self.package_local_path.join(MDNAME);
        let mut file = File::create(&target_path).map_err(|e| {
            format!(
                "Failed to create markdown file {}: {}",
                target_path.display(),
                e
            )
        })?;
        file.write_all(markdown.as_bytes()).map_err(|e| {
            format!(
                "Failed to write markdown content to {}: {}",
                target_path.display(),
                e
            )
        })?;
        file.flush().map_err(|e| {
            format!(
                "Failed to flush markdown content to {}: {}",
                target_path.display(),
                e
            )
        })?;
        debug!("Step 2: [DONE] Save the content on local package");

        debug!("[DONE] save_local_package - Latest Content is saved on local package (UUID: {})",self.uuid);
        Ok(())
    }

    /// #### save_hasmmd
    /// Compresses the directory into a `.hasmmd` zip file.
    ///
    /// ##### Inputs
    /// * `target_zip_path` - The destination path for the generated `.hasmmd` file.
    /// ##### Outouts
    /// none
    pub fn save_hasmmd(
        &mut self,
        target_hasmmd_path: PathBuf,
    ) -> Result<(), String> {
        // Step 0. Init logger
        init_logger();
        debug!("[START] save_hasmmd");

        // Step 1. Check existance
        debug!("Step 1: [START] Check local package existance ({})",self.package_local_path.display());
        if !self.package_local_path.exists() {
            error!("Package directory does not exist: {}",self.package_local_path.display());
            return Err(format!(
                "Package directory does not exist: {}",
                self.package_local_path.display()
            ));
        }
        debug!("Step 1: [DONE] Confirm local package existance ({})",self.package_local_path.display());

        // Step 2. Create target .hasmmd file
        debug!("Step 2: [START] Create target file ({})",target_hasmmd_path.display());
        let file = File::create(&target_hasmmd_path).map_err(|e| {
            format!(
                "Failed to create archive {}: {}",
                target_hasmmd_path.display(),
                e
            )
        })?;
        debug!("Step 2: [DONE] Created save target file ({})",target_hasmmd_path.display());

        // Step 3. Zipping the local file
        debug!("Step 3: [START] Zpping the local files");
        let mut zip = ZipWriter::new(file);
        let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        debug!("Step 3: [DONE] Zipping the local files");

        // Step 4. Walkthrough the target directory and zipping
        debug!("Step 4: [START] Walkthrough the target directiry");
        let walkdir = WalkDir::new(&self.package_local_path);
        for entry in walkdir.into_iter().filter_map(|e| e.ok()) {
            let path = entry.path();
            let name = path
                .strip_prefix(&self.package_local_path)
                .map_err(|e| format!("Failed to resolve archive entry path: {}", e))?;

            if path.is_file() {
                if zip.start_file(name.to_string_lossy(), options).is_ok() {
                    if let Ok(mut f) = File::open(path) {
                        // Efficiently copy the file stream into the zip writer
                        let _ = std::io::copy(&mut f, &mut zip);
                    }
                }
            } else if !name.as_os_str().is_empty() {
                let _ = zip.add_directory(name.to_string_lossy(), options);
            }
        }
        debug!("Step 4: [DONE] Walkthrough the target directiry");

        // Step 5. Check if zipping is completed or not 
        debug!("Step 5: [START] Check Zipping Status");
        zip.finish().map_err(|e| {
            format!(
                "Failed to finalize archive {}: {}",
                target_hasmmd_path.display(),
                e
            )
        })?;
        debug!("Step 5: [DONE] Check Zipping Status");

        // Step 6. Update HASM Markdown Model
        debug!("Step 6: [START] Update HASM Morkdown Model");
        self.hasmmd_local_path = target_hasmmd_path;
        debug!("Step 6: [DONE] Set hasmmd_local_path as {}",self.hasmmd_local_path.display());
        
        debug!("[DONE] save_hasmmd - Compete saving .hasmmd file ({})",self.hasmmd_local_path.display());
        
        Ok(())
    }

    /// #### create_new_hasmmd
    /// Creates a new HASM Markdown package scaffold at the specified base path, generating a unique folder, `main.md`, `assets/`.
    /// ##### Inputs
    /// * base path : Local application path for storing editing file
    /// ##### Outputs
    /// * HASM Markdown Structure (self)
    pub fn create_new_hasmmd(base_path: PathBuf) -> Self {
        // Step 0. Init logger
        init_logger();
        debug!("[START] create_new_hasmmd - Creating new HASM package at {}", base_path.display());

        // Step 1. Define necessary files
        debug!("Step 1: [START] Define necessary files");
        let mut hasmmd;
        let mut package_path;
        debug!("Step 1: [DONE] Define necessary files");

        // Step 2. Create HASM Markdown Structure instance which have unique UUID
        debug!("Step 2: [START] Create HASM Markdown Structure instance which have unique UUID");
        loop {
            trace!("Create new UUID");
            hasmmd = Self::new();
            package_path = base_path.join(hasmmd.uuid.to_string());
            if !package_path.exists() {
                trace!("Define UUID for new package ({})", package_path.display());
                break;
            }
        }
        debug!("Step 2: [DONE] Define UUID for new package ({})", package_path.display());
        
        // Step 3. Create base and package folder.
        debug!("Step 3: [START] Create base and package folder");
        fs::create_dir_all(&base_path).unwrap();
        fs::create_dir(&package_path).unwrap();
        debug!("Step 3: [DONE] Create base and package folder ({})",package_path.display());
        
        // Step 4. Generate main.md and assets folder
        debug!("Step 4: [START] Generate main.md and assets folder");
        let initial_content = "# New HASM Markdown\n\nStart editing here.\n";
        let mut main_md = File::create(package_path.join(MDNAME)).unwrap();
        let _ = main_md.write_all(initial_content.as_bytes());
        fs::create_dir(package_path.join("assets")).unwrap();
        debug!("Step 4: [DONE] Generate main.md and assets folder");

        // Step 5. Store the local editing directory path into the structure
        debug!("Step 5: [START] Store the local editing directory path into the structure");
        hasmmd.package_local_path = package_path;
        debug!("Step 5: [DONE] Store the local editing directory path into the structure");

        // Return HASMMarkdown Structure
        debug!("[DONE] create_new_hasmmd - Creating new HASM package at {}", base_path.display());
        hasmmd
    }

    /*
    /// #### check_hasm_markdown
    /// Performs a series of integrity checks to ensure the package structure,UUIDs, and paths are consistent across the system.
    /// 
    /// ##### Outputs 
    /// * Error Status Mapping (self.status indices)
    ///     * `0`: Package directory does not exist on disk.
    ///     * `1`: Internal path mismatch between asset URL and local path.
    ///     * `2`: `data.json` missing from the local package.
    ///     * `3`: UUID in `data.json` does not match the struct UUID.
    ///     * `4`: Target `.hasmmd` file does not exist.
    pub fn check_hasm_markdown(mut self) -> Self {
        // Check Criteria 1 : If Package exist on package_local_path
        if !self.package_local_path.exists() {
            self.status[0] = true;
            log(
                "ERROR", 
                &format!("{} does not exist", self.package_local_path.to_string_lossy())
            );
        }

        // Check Criteria 2 : If package_local_path and package_asset_url specify same location
        if self.package_asset_url   != local_path_to_url(&self.package_local_path) {
            self.status[1] = true; 
            log(
                "ERROR", 
                &format!(
                    "Editor path mismatch (Asset: '{}' , Local: '{}' )", 
                    self.package_asset_url,
                    self.package_local_path.to_string_lossy()
                )
            );
        }

        // Check Criteria 3 : If local uuid file exist
        if !self.package_local_path.join("data.json").exists() { 
            self.status[2] = true;
            log(
                "ERROR",
                &format!("{} does not exist", self.package_local_path.join("data.json").to_string_lossy())
            );
        } else {
            // Check Criteria 4 : If uuid is matched
            let file = File::open(self.package_local_path.join("data.json")).unwrap();
            let local_data: HASMMarkdownData = serde_json::from_reader(file).unwrap();
            if local_data.uuid.to_string() != self.uuid.to_string() {
                self.status[3] = true;
                log(
                    "ERROR", 
                    &format!(
                        "UUID does not match (Editor: '{}' , Local: '{}' )", 
                        self.uuid.to_string(),
                        local_data.uuid.to_string()
                    )
                );
            }
        }

        // Check Criteria 5 : If hasmmd_local_path exist
        if !self.hasmmd_local_path.exists() { 
            self.status[4] = true;
            log("ERROR", &format!("{} does not exist", self.hasmmd_local_path.to_string_lossy()));
        }

        // Report Result
        if !self.status.contains(&true) {
            log(
                "INFO", 
                &format!("No issue found on {}",self.hasmmd_name)
            );
        }
        self

    }
    */
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn create_new_hasmmd_creates_package_scaffold() {
        let unique_dir = format!(
            "hasmmd-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        let base_path = std::env::temp_dir().join(unique_dir);

        let package = HASMMarkdown::create_new_hasmmd(base_path.clone());
        let main_md = package.package_local_path.join(MDNAME);
        let assets_dir = package.package_local_path.join("assets");

        assert!(package.package_local_path.exists());
        assert!(main_md.exists());
        assert!(assets_dir.exists());
        assert!(fs::read_to_string(main_md).unwrap().contains("Start editing here"));

        let _ = fs::remove_dir_all(base_path);
    }

    #[test]
    fn save_local_package_writes_markdown_to_main_md() {
        let unique_dir = format!(
            "hasmmd-save-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        let base_path = std::env::temp_dir().join(unique_dir);

        let mut package = HASMMarkdown::create_new_hasmmd(base_path.clone());
        package
            .save_local_package("# Saved content".to_string())
            .unwrap();

        let saved_path = package.package_local_path.join(MDNAME);
        assert!(saved_path.exists());
        assert!(fs::read_to_string(saved_path).unwrap().contains("# Saved content"));

        let _ = fs::remove_dir_all(base_path);
    }
}
