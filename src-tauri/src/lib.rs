//! # lib.rs
//! Hibiya Haraki (July, 2026)
//! ## Purpose
//! Library script for HASM Markdown Tauri App 
//! ## Description
//! 

// Modules
mod hasm_markdown;
#[path = "hasm_logger/src/tauri/logger.rs"]
mod logger;
pub mod cli;
mod commands;
mod domain;
mod models;
mod services;

// Crates
use crate::logger::init_logger;
use hasm_markdown::HASMMarkdown;
use log::{debug, error, info, trace, warn};
use std::path::PathBuf;
use std::sync::Mutex;

pub(crate) struct AppState {
    pub(crate) app: Mutex<HASMMarkdown>,
    pub(crate) workspace: Mutex<Option<domain::package::WorkspaceSession>>,
    pub(crate) launch_path: Mutex<Option<String>>,
}

#[tauri::command]
fn get_launch_target(state: tauri::State<'_, AppState>) -> Result<Option<String>, String> {
    // SEQ-MD-01 / Phase 1: the GUI reads the CLI target and chooses archive or folder mode.
    state.launch_path.lock().map(|path| path.clone()).map_err(|_| "Failed to lock launch state".to_string())
}

#[tauri::command]
fn save_local_package(
    state: tauri::State<'_, AppState>,
    markdown: String,
) -> Result<HASMMarkdown, String> {
    // Step 0. Init logger
    init_logger();

    let mut app_state = state.app.lock().map_err(|_| "Failed to lock AppState")?;

    // Step 2. Save latest markdown to local package
    //debug!("Content: {}",markdown);
    app_state
        .save_local_package(markdown)
        .map_err(|e| e.to_string())?;

    Ok(app_state.clone())
}

#[tauri::command]
fn save_hasmmd(
    state: tauri::State<'_, AppState>,
    target_hasmmd_path: String,
) -> Result<HASMMarkdown, String> {
    // Step 0. Init logger
    init_logger();

    // Step 1. Get Input Path
    let path = PathBuf::from(target_hasmmd_path.clone());
    info!("Save Target : {}", target_hasmmd_path.clone());
    let mut app_state = state.app.lock().map_err(|_| "Failed to lock AppState")?;

    // Step 2. Save .hasmmd file
    app_state.save_hasmmd(path).map_err(|e| e.to_string())?;

    Ok(app_state.clone())
}

/*
#[tauri::command]
fn check_hasmmd(
    state: tauri::State<'_, AppState>,
) -> Result<HASMMarkdown, String> {
    let mut app_state = state.app.lock().map_err(|_| "Failed to lock AppState")?;
    
    let checked = app_state.clone().check_hasm_markdown();
    *app_state = checked.clone();
    
    Ok(checked)
}
*/

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    run_with_launch_path(None);
}

pub fn run_with_launch_path(launch_path: Option<String>) {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            app: Mutex::new(HASMMarkdown::new()),
            workspace: Mutex::new(None),
            launch_path: Mutex::new(launch_path),
        })
        .invoke_handler(tauri::generate_handler![
            save_local_package,
            save_hasmmd,
            commands::workspace::open_archive_workspace,
            commands::workspace::open_folder_workspace,
            commands::workspace::create_new_package,
            commands::workspace::close_and_cleanup_workspace,
            commands::editor::save_local_markdown_buffer,
            commands::asset::register_and_bind_single_asset_path,
            commands::asset::read_asset_data,
            commands::asset::soft_delete_asset_mapping,
            commands::save::execute_package_save_or_export,
            commands::update_app_theme_config,
            commands::get_app_theme_config,
            get_launch_target
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}