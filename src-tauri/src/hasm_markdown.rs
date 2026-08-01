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
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn log_test(test_name: &str, detail: &str) {
        init_logger();
        trace!("[TEST] {} | {}", test_name, detail);
    }

    fn log_step(test_name: &str, step: &str, detail: &str) {
        init_logger();
        trace!("[STEP] {} | {} | {}", test_name, step, detail);
    }

    struct TestWorkspace {
        base_path: PathBuf,
    }

    impl TestWorkspace {
        fn new(prefix: &str) -> Self {
            let unique_dir = format!(
                "{}-{}",
                prefix,
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            );
            let base_path = std::env::temp_dir().join(unique_dir);
            Self { base_path }
        }
    }

    impl Drop for TestWorkspace {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.base_path);
        }
    }

    /// # Test Function : create_new_hasmmd_creates_package_scaffold
    /// ## Test Procedure
    /// * Step 1 : Create a unique temporary base path.
    /// * Step 2 : Call create_new_hasmmd to generate a new package scaffold.
    /// * Step 3 : Validate package folder, main.md, and assets folder existence.
    /// * Step 4 : Validate main.md includes the default starter text.
    /// * Step 5 : Delete all created files.
    /// ## Expected behavior
    /// * Step 1 : A unique and isolated temporary path is prepared.
    /// * Step 2 : A new package is created with a UUID-based folder.
    /// * Step 3 : The scaffold files and folders are created at the correct path.
    /// * Step 4 : The default markdown starter content is written to main.md.
    /// * Step 5 : Temporary files are removed successfully.
    #[test]
    fn create_new_hasmmd_creates_package_scaffold() {
        let test_name = "create_new_hasmmd_creates_package_scaffold";
        let unique_dir = format!(
            "hasmmd-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        let base_path = std::env::temp_dir().join(unique_dir);
        log_test(test_name, &format!("base_path={}", base_path.display()));

        log_step(test_name, "Step 2", "Call create_new_hasmmd");
        let package = HASMMarkdown::create_new_hasmmd(base_path.clone());
        let main_md = package.package_local_path.join(MDNAME);
        let assets_dir = package.package_local_path.join("assets");
        log_step(
            test_name,
            "Step 3",
            &format!(
                "package_local_path={}, main_md={}, assets_dir={}",
                package.package_local_path.display(),
                main_md.display(),
                assets_dir.display()
            ),
        );

        assert!(
            package.package_local_path.exists(),
            "[ERROR] {} | Step 3 failed: package path does not exist: {}",
            test_name,
            package.package_local_path.display()
        );
        assert!(
            main_md.exists(),
            "[ERROR] {} | Step 3 failed: main.md does not exist: {}",
            test_name,
            main_md.display()
        );
        assert!(
            assets_dir.exists(),
            "[ERROR] {} | Step 3 failed: assets directory does not exist: {}",
            test_name,
            assets_dir.display()
        );

        log_step(test_name, "Step 4", "Read and validate starter markdown text");
        let initial_text = fs::read_to_string(&main_md).unwrap_or_else(|e| {
            panic!(
                "[ERROR] {} | Step 4 failed: cannot read {}: {}",
                test_name,
                main_md.display(),
                e
            )
        });
        assert!(
            initial_text.contains("Start editing here"),
            "[ERROR] {} | Step 4 failed: starter text missing in {}",
            test_name,
            main_md.display()
        );

        log_step(test_name, "Step 5", &format!("Cleanup path={}", base_path.display()));
        fs::remove_dir_all(&base_path).unwrap_or_else(|e| {
            panic!(
                "[ERROR] {} | Step 5 failed: cleanup failed for {}: {}",
                test_name,
                base_path.display(),
                e
            )
        });
    }

    /// # Test Function : save_local_package_persists_markdown_to_main_md_in_package_path
    /// ## Test Procedure
    /// * Step 1 : Create an isolated test workspace and new package.
    /// * Step 2 : Prepare markdown text and call save_local_package.
    /// * Step 3 : Build the expected main.md path from package_local_path.
    /// * Step 4 : Read saved file content and compare with input text.
    /// * Step 5 : Delete all created files.
    /// ## Expected behavior
    /// * Step 1 : A valid package exists in the temporary workspace.
    /// * Step 2 : save_local_package completes without error.
    /// * Step 3 : main.md exists at package_local_path/main.md.
    /// * Step 4 : Saved content exactly matches provided markdown text.
    /// * Step 5 : Temporary files are removed successfully.
    #[test]
    fn save_local_package_persists_markdown_to_main_md_in_package_path() {
        let test_name = "save_local_package_persists_markdown_to_main_md_in_package_path";
        // Step 1. Create isolated temp workspace and new package
        let workspace = TestWorkspace::new("hasmmd-save-test");
        log_test(test_name, &format!("base_path={}", workspace.base_path.display()));
        log_step(test_name, "Step 1", "Create new package scaffold");
        let mut package = HASMMarkdown::create_new_hasmmd(workspace.base_path.clone());

        // Step 2. Save markdown input through target function
        let markdown_input = "# Saved content\n\nThis sentence must be persisted exactly.".to_string();
        log_step(
            test_name,
            "Step 2",
            &format!("Save markdown length={} chars", markdown_input.len()),
        );
        package.save_local_package(markdown_input.clone()).unwrap_or_else(|e| {
            panic!(
                "[ERROR] {} | Step 2 failed: save_local_package returned error: {}",
                test_name, e
            )
        });

        // Step 3. Validate save path and saved content
        let saved_path = package.package_local_path.join(MDNAME);
        log_step(
            test_name,
            "Step 3",
            &format!("saved_path={}", saved_path.display()),
        );
        assert_eq!(
            saved_path,
            package.package_local_path.join("main.md"),
            "[ERROR] {} | Step 3 failed: saved path mismatch",
            test_name
        );
        assert!(
            saved_path.exists(),
            "[ERROR] {} | Step 3 failed: saved file does not exist: {}",
            test_name,
            saved_path.display()
        );

        log_step(test_name, "Step 4", "Read saved main.md and compare full content");
        let saved_content = fs::read_to_string(&saved_path).unwrap_or_else(|e| {
            panic!(
                "[ERROR] {} | Step 4 failed: cannot read {}: {}",
                test_name,
                saved_path.display(),
                e
            )
        });
        assert_eq!(
            saved_content,
            markdown_input,
            "[ERROR] {} | Step 4 failed: saved content mismatch",
            test_name
        );

        // Step 4. Cleanup is automatic via TestWorkspace Drop implementation
        log_step(
            test_name,
            "Step 5",
            &format!("Cleanup by Drop for base_path={}", workspace.base_path.display()),
        );
    }

    /// # Test Function : save_hasmmd_creates_portable_archive_from_local_package
    /// ## Test Procedure
    /// * Step 1 : Create an isolated test workspace and new package.
    /// * Step 2 : Save known markdown content into local main.md.
    /// * Step 3 : Call save_hasmmd with a target .hasmmd path.
    /// * Step 4 : Open generated archive and read main.md entry.
    /// * Step 5 : Compare extracted content with original input.
    /// ## Expected behavior
    /// * Step 1 : Package workspace is created correctly.
    /// * Step 2 : Local package content is updated as expected.
    /// * Step 3 : A .hasmmd archive file is created and state path is updated.
    /// * Step 4 : main.md is present in the archive.
    /// * Step 5 : Archived markdown matches the input text exactly.
    #[test]
    fn save_hasmmd_creates_portable_archive_from_local_package() {
        let test_name = "save_hasmmd_creates_portable_archive_from_local_package";
        // Step 1. Create isolated temp workspace and package
        let workspace = TestWorkspace::new("hasmmd-archive-save-test");
        log_test(test_name, &format!("base_path={}", workspace.base_path.display()));
        log_step(test_name, "Step 1", "Create new package scaffold");
        let mut package = HASMMarkdown::create_new_hasmmd(workspace.base_path.clone());

        // Step 2. Save markdown so archive contains known content
        let markdown_input = "# Archive Save Test\n\nThis content must be zipped.".to_string();
        log_step(
            test_name,
            "Step 2",
            &format!("Save markdown length={} chars", markdown_input.len()),
        );
        package.save_local_package(markdown_input.clone()).unwrap_or_else(|e| {
            panic!(
                "[ERROR] {} | Step 2 failed: save_local_package returned error: {}",
                test_name, e
            )
        });

        // Step 3. Save as .hasmmd file
        let archive_path = workspace.base_path.join("exported.hasmmd");
        log_step(
            test_name,
            "Step 3",
            &format!("archive_path={}", archive_path.display()),
        );
        package.save_hasmmd(archive_path.clone()).unwrap_or_else(|e| {
            panic!(
                "[ERROR] {} | Step 3 failed: save_hasmmd returned error: {}",
                test_name, e
            )
        });

        // Step 4. Validate archive path and package state update
        log_step(test_name, "Step 4", "Validate archive file existence and model path update");
        assert!(
            archive_path.exists(),
            "[ERROR] {} | Step 4 failed: archive not found at {}",
            test_name,
            archive_path.display()
        );
        assert_eq!(
            package.hasmmd_local_path,
            archive_path,
            "[ERROR] {} | Step 4 failed: hasmmd_local_path not updated correctly",
            test_name
        );

        // Step 5. Validate archive contains main.md with expected content
        log_step(
            test_name,
            "Step 5",
            &format!("Open archive and verify {} entry", MDNAME),
        );
        let file = File::open(&package.hasmmd_local_path).unwrap_or_else(|e| {
            panic!(
                "[ERROR] {} | Step 5 failed: cannot open archive {}: {}",
                test_name,
                package.hasmmd_local_path.display(),
                e
            )
        });
        let mut archive = ZipArchive::new(file).unwrap_or_else(|e| {
            panic!(
                "[ERROR] {} | Step 5 failed: invalid zip archive {}: {}",
                test_name,
                package.hasmmd_local_path.display(),
                e
            )
        });
        let mut main_md = archive.by_name(MDNAME).unwrap_or_else(|e| {
            panic!(
                "[ERROR] {} | Step 5 failed: missing {} in archive: {}",
                test_name, MDNAME, e
            )
        });
        let mut extracted_markdown = String::new();
        main_md.read_to_string(&mut extracted_markdown).unwrap_or_else(|e| {
            panic!(
                "[ERROR] {} | Step 5 failed: cannot read {} from archive: {}",
                test_name, MDNAME, e
            )
        });
        assert_eq!(
            extracted_markdown,
            markdown_input,
            "[ERROR] {} | Step 5 failed: archived markdown mismatch",
            test_name
        );
    }

    /// # Test Function : open_hasmmd_extracts_archive_and_returns_saved_markdown
    /// ## Test Procedure
    /// * Step 1 : Create source package, save markdown, and export to .hasmmd.
    /// * Step 2 : Call open_hasmmd with a separate temporal base path.
    /// * Step 3 : Verify returned package paths and returned markdown string.
    /// * Step 4 : Verify extracted main.md exists in opened package path.
    /// * Step 5 : Compare extracted file content with original markdown input.
    /// ## Expected behavior
    /// * Step 1 : Source archive is created successfully.
    /// * Step 2 : Archive is extracted into a new UUID workspace.
    /// * Step 3 : Returned hasmmd path and markdown are correct.
    /// * Step 4 : Extracted main.md exists at the expected path.
    /// * Step 5 : Extracted markdown content matches the original input.
    #[test]
    fn open_hasmmd_extracts_archive_and_returns_saved_markdown() {
        let test_name = "open_hasmmd_extracts_archive_and_returns_saved_markdown";
        // Step 1. Create source package and archive
        let source_workspace = TestWorkspace::new("hasmmd-open-source-test");
        log_test(
            test_name,
            &format!("source_base_path={}", source_workspace.base_path.display()),
        );
        log_step(test_name, "Step 1", "Create source package and archive with known markdown");
        let mut source_package = HASMMarkdown::create_new_hasmmd(source_workspace.base_path.clone());
        let markdown_input = "# Open Test\n\nThis content must be restored from archive.".to_string();
        source_package.save_local_package(markdown_input.clone()).unwrap_or_else(|e| {
            panic!(
                "[ERROR] {} | Step 1 failed: save_local_package returned error: {}",
                test_name, e
            )
        });

        let archive_path = source_workspace.base_path.join("for-open-test.hasmmd");
        source_package.save_hasmmd(archive_path.clone()).unwrap_or_else(|e| {
            panic!(
                "[ERROR] {} | Step 1 failed: save_hasmmd returned error: {}",
                test_name, e
            )
        });
        assert!(
            archive_path.exists(),
            "[ERROR] {} | Step 1 failed: source archive not found at {}",
            test_name,
            archive_path.display()
        );

        // Step 2. Open archive into another temporal workspace
        let open_workspace = TestWorkspace::new("hasmmd-open-target-test");
        log_step(
            test_name,
            "Step 2",
            &format!(
                "open_base_path={}, archive_path={}",
                open_workspace.base_path.display(),
                archive_path.display()
            ),
        );
        let (opened_package, opened_markdown) =
            HASMMarkdown::open_hasmmd(open_workspace.base_path.clone(), archive_path.clone())
                .unwrap_or_else(|e| {
                    panic!(
                        "[ERROR] {} | Step 2 failed: open_hasmmd returned error: {}",
                        test_name, e
                    )
                });

        // Step 3. Validate returned package paths and restored markdown
        log_step(
            test_name,
            "Step 3",
            &format!(
                "opened_package_path={}, returned_hasmmd_path={}",
                opened_package.package_local_path.display(),
                opened_package.hasmmd_local_path.display()
            ),
        );
        assert_eq!(
            opened_package.hasmmd_local_path,
            archive_path,
            "[ERROR] {} | Step 3 failed: returned hasmmd path mismatch",
            test_name
        );
        assert!(
            opened_package.package_local_path.exists(),
            "[ERROR] {} | Step 3 failed: extracted package path missing: {}",
            test_name,
            opened_package.package_local_path.display()
        );
        assert_eq!(
            opened_markdown,
            markdown_input,
            "[ERROR] {} | Step 3 failed: returned markdown mismatch",
            test_name
        );

        let extracted_main_md = opened_package.package_local_path.join(MDNAME);
        log_step(
            test_name,
            "Step 4",
            &format!("extracted_main_md={}", extracted_main_md.display()),
        );
        assert!(
            extracted_main_md.exists(),
            "[ERROR] {} | Step 4 failed: extracted main.md missing at {}",
            test_name,
            extracted_main_md.display()
        );

        log_step(test_name, "Step 5", "Read extracted main.md and compare markdown text");
        let extracted_text = fs::read_to_string(&extracted_main_md).unwrap_or_else(|e| {
            panic!(
                "[ERROR] {} | Step 5 failed: cannot read {}: {}",
                test_name,
                extracted_main_md.display(),
                e
            )
        });
        assert_eq!(
            extracted_text,
            markdown_input,
            "[ERROR] {} | Step 5 failed: extracted markdown mismatch",
            test_name
        );
    }
}
