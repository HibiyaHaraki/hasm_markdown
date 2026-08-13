use crate::domain::package::{self, WorkspaceSession};
use crate::models::payload::PackageStatePayload;
use crate::AppState;
use std::path::PathBuf;
use tauri::Manager;
use crate::logger::init_logger;
use log::{error, info};

#[tauri::command]
pub fn open_archive_workspace(state: tauri::State<'_, AppState>, app: tauri::AppHandle, archive_path: String) -> Result<PackageStatePayload, String> {
    // SEQ-MD-01 / Phase 4: commit only after lock, handles, metadata, and path resolution succeed.
    init_logger();
    info!("[SEQ-MD-01][IPC] open_archive_workspace target={archive_path}");
    let base_path = app.path().app_local_data_dir().map_err(|error| error.to_string())?;
    let session = package::open_archive(&base_path, &PathBuf::from(&archive_path)).map_err(|error| { error!("[SEQ-MD-01][IPC][ERROR] archive mount failed error={error}"); error.to_string() })?;
    replace_session(state, session)
}

#[tauri::command]
pub fn open_folder_workspace(state: tauri::State<'_, AppState>, app: tauri::AppHandle, folder_path: String) -> Result<PackageStatePayload, String> {
    init_logger();
    info!("[SEQ-MD-01][IPC] open_folder_workspace target={folder_path}");
    let base_path = app.path().app_local_data_dir().map_err(|error| error.to_string())?;
    let session = package::open_folder(&base_path, &PathBuf::from(folder_path)).map_err(|error| error.to_string())?;
    replace_session(state, session)
}

#[tauri::command]
pub fn create_new_package(state: tauri::State<'_, AppState>, app: tauri::AppHandle) -> Result<PackageStatePayload, String> {
    init_logger();
    info!("[SEQ-MD-01][IPC] create_new_package");
    let base_path = app.path().app_local_data_dir().map_err(|error| error.to_string())?;
    let session = package::create_new(&base_path).map_err(|error| error.to_string())?;
    replace_session(state, session)
}

#[tauri::command]
pub fn close_and_cleanup_workspace(state: tauri::State<'_, AppState>, uuid: String) -> Result<(), String> {
    let mut active = state.workspace.lock().map_err(|_| "Failed to lock workspace state")?;
    if active.as_ref().map(|session| session.payload.uuid.as_str()) != Some(uuid.as_str()) {
        return Ok(());
    }
    if let Some(session) = active.take() {
        session.close().map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn replace_session(state: tauri::State<'_, AppState>, session: WorkspaceSession) -> Result<PackageStatePayload, String> {
    let mut active = state.workspace.lock().map_err(|_| "Failed to lock workspace state")?;
    if let Some(previous) = active.take() { let _ = previous.close(); }
    let payload = session.payload.clone();
    *active = Some(session);
    info!("[SEQ-MD-01][STATE] active workspace committed uuid={}", payload.uuid);
    Ok(payload)
}
