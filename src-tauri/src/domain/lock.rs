use crate::models::error::PackageError;
use crate::models::payload::LockPayload;
use chrono::Utc;
use std::fs;
use std::path::Path;
use std::process::Command;
use crate::logger::init_logger;
use log::{debug, error, info, warn};

pub fn acquire(lock_path: &Path) -> Result<(), PackageError> {
    // SEQ-MD-01 / Phase 3: validate the previous PID before writing Locked atomically.
    init_logger();
    info!("[SEQ-MD-01][LOCK] acquire path={}", lock_path.display());
    if let Ok(content) = fs::read_to_string(lock_path) {
        if let Ok(payload) = serde_json::from_str::<LockPayload>(&content) {
            let current_pid = std::process::id();
            if payload.pid != 0 && payload.pid != current_pid && process_is_running(payload.pid) {
                warn!("[SEQ-MD-01][LOCK][ERROR] workspace locked pid={} path={}", payload.pid, lock_path.display());
                return Err(PackageError::WorkspaceLocked(payload.pid));
            }
        }
    }

    let payload = LockPayload { pid: std::process::id(), status: "Locked".to_string(), last_released_at: None };
    debug!("[SEQ-MD-01][LOCK] writing Locked pid={}", payload.pid);
    write_atomic(lock_path, &payload)
}

pub fn release(lock_path: &Path) -> Result<(), PackageError> {
    // Close handles first; only then transition the retained .lock file to Unlocked.
    info!("[SEQ-MD-01][LOCK] release path={}", lock_path.display());
    let payload = LockPayload { pid: 0, status: "Unlocked".to_string(), last_released_at: Some(Utc::now().to_rfc3339()) };
    write_atomic(lock_path, &payload)
}

fn write_atomic<T: serde::Serialize>(path: &Path, value: &T) -> Result<(), PackageError> {
    let temporary_path = path.with_extension("lock.tmp");
    fs::write(&temporary_path, serde_json::to_vec_pretty(value)?)?;
    fs::rename(temporary_path, path).map_err(|error| {
        error!("[SEQ-MD-01][LOCK][ERROR] atomic lock replace failed path={} error={error}", path.display());
        PackageError::Io(error.to_string())
    })?;
    Ok(())
}

fn process_is_running(pid: u32) -> bool {
    #[cfg(target_os = "windows")]
    {
        Command::new("tasklist")
            .args(["/FI", &format!("PID eq {pid}"), "/NH"])
            .output()
            .map(|output| String::from_utf8_lossy(&output.stdout).contains(&pid.to_string()))
            .unwrap_or(false)
    }
    #[cfg(not(target_os = "windows"))]
    {
        Command::new("kill").args(["-0", &pid.to_string()]).status().map(|status| status.success()).unwrap_or(false)
    }
}

#[cfg(test)]
mod tests {
    use super::acquire;
    use crate::models::payload::LockPayload;
    use std::process::Command;

    #[test]
    fn acquire_writes_locked_payload() {
        let path = std::env::temp_dir().join(format!("hasm-seq-md-01-lock-{}.lock", std::process::id()));
        acquire(&path).expect("lock acquisition should succeed");
        let payload: LockPayload = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(payload.pid, std::process::id());
        assert_eq!(payload.status, "Locked");
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn acquire_rejects_active_process_lock() {
        let path = std::env::temp_dir().join(format!("hasm-seq-md-01-conflict-{}.lock", std::process::id()));
        let mut child = if cfg!(target_os = "windows") {
            Command::new("cmd").args(["/C", "ping", "127.0.0.1", "-n", "6"]).spawn().unwrap()
        } else {
            Command::new("sleep").arg("5").spawn().unwrap()
        };
        let payload = LockPayload { pid: child.id(), status: "Locked".to_string(), last_released_at: None };
        std::fs::write(&path, serde_json::to_vec(&payload).unwrap()).unwrap();
        let result = acquire(&path);
        assert!(matches!(result, Err(crate::models::error::PackageError::WorkspaceLocked(pid)) if pid == child.id()));
        let _ = std::fs::remove_file(path);
        let _ = child.kill();
    }
}
