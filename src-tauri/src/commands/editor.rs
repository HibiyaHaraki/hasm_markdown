use crate::domain::package;
use crate::models::payload::PackageStatePayload;
use crate::AppState;
use crate::logger::init_logger;
use log::debug;

#[tauri::command]
pub fn save_local_markdown_buffer(state: tauri::State<'_, AppState>, uuid: String, content: String) -> Result<PackageStatePayload, String> {
    // SEQ-MD-01 leaves the editor with a committed local buffer for later autosave phases.
    init_logger();
    debug!("[SEQ-MD-01][IPC] save_local_markdown_buffer uuid={} bytes={}", uuid, content.len());
    let mut active = state.workspace.lock().map_err(|_| "Failed to lock workspace state")?;
    let session = active.as_mut().ok_or_else(|| "No active workspace".to_string())?;
    if session.payload.uuid != uuid { return Err("Workspace UUID does not match active session".to_string()); }
    package::write_markdown(session, &content).map_err(|error| error.to_string())?;
    session.payload.raw_content = content.clone();
    session.payload.last_saved_content = content;
    session.payload.is_dirty = false;
    Ok(session.payload.clone())
}
