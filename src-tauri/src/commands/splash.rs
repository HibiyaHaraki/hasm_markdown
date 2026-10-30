//! # splash.rs
//! ## Purpose
//! SEQ-MD-01 / Phase 0 splash screen handoff.
//! ## Description
//! The `splashscreen` window (hasm_logo splash bundle) is shown while the hidden
//! `main` window loads. The splash closes once the frontend reports readiness and
//! at least `MIN_SPLASH_DURATION` has elapsed; a timeout guarantees the main
//! window is shown even if the frontend never reports readiness.

use crate::logger::init_logger;
use log::{debug, error, info, warn};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, Runtime};

pub const SPLASH_WINDOW_LABEL: &str = "splashscreen";
pub const MAIN_WINDOW_LABEL: &str = "main";
pub const MIN_SPLASH_DURATION: Duration = Duration::from_secs(5);
pub const SPLASH_READY_TIMEOUT: Duration = Duration::from_secs(30);

pub struct SplashState {
    started_at: Instant,
    finished: AtomicBool,
}

impl SplashState {
    pub fn new() -> Self {
        Self { started_at: Instant::now(), finished: AtomicBool::new(false) }
    }

    pub fn remaining_min_display(&self) -> Duration {
        MIN_SPLASH_DURATION.saturating_sub(self.started_at.elapsed())
    }

    /// Returns true only for the first caller, so the handoff runs once.
    fn claim_finish(&self) -> bool {
        !self.finished.swap(true, Ordering::SeqCst)
    }
}

impl Default for SplashState {
    fn default() -> Self {
        Self::new()
    }
}

fn finish_splash<R: Runtime>(app: &AppHandle<R>, timed_out: bool) -> Result<(), String> {
    let state = app.state::<SplashState>();
    if !state.claim_finish() {
        debug!("[SEQ-MD-01][SPLASH] handoff already completed");
        return Ok(());
    }
    let elapsed = state.started_at.elapsed();
    if timed_out {
        warn!("[SEQ-MD-01][SPLASH] frontend readiness timeout after {:?}; showing main window", elapsed);
    } else {
        info!("[SEQ-MD-01][SPLASH] closing splash after {:?}", elapsed);
    }

    // Show main before closing the splash so the app never has zero visible windows.
    let main = app
        .get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| "Main window is not available".to_string())?;
    main.show().map_err(|e| format!("Failed to show main window: {e}"))?;
    if let Err(e) = main.set_focus() {
        warn!("[SEQ-MD-01][SPLASH] failed to focus main window: {e}");
    }
    match app.get_webview_window(SPLASH_WINDOW_LABEL) {
        Some(splash) => {
            if let Err(e) = splash.close() {
                warn!("[SEQ-MD-01][SPLASH] failed to close splash window: {e}");
            }
        }
        None => warn!("[SEQ-MD-01][SPLASH] splash window not found"),
    }
    Ok(())
}

/// Finishes the splash on a background thread after `delay`, keeping the UI thread free.
pub fn schedule_finish<R: Runtime>(app: AppHandle<R>, delay: Duration, timed_out: bool) {
    std::thread::spawn(move || {
        std::thread::sleep(delay);
        if let Err(e) = finish_splash(&app, timed_out) {
            error!("[SEQ-MD-01][SPLASH][ERROR] {e}");
        }
    });
}

#[tauri::command]
pub fn close_splashscreen(app: AppHandle, state: tauri::State<'_, SplashState>) -> Result<(), String> {
    init_logger();
    let remaining = state.remaining_min_display();
    info!("[SEQ-MD-01][SPLASH] frontend ready; closing splash in {:?}", remaining);
    schedule_finish(app, remaining, false);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn remaining_display_never_exceeds_minimum() {
        let state = SplashState::new();
        assert!(state.remaining_min_display() <= MIN_SPLASH_DURATION);
    }

    #[test]
    fn remaining_display_is_zero_after_minimum() {
        let state = SplashState {
            started_at: Instant::now() - MIN_SPLASH_DURATION - Duration::from_millis(1),
            finished: AtomicBool::new(false),
        };
        assert_eq!(state.remaining_min_display(), Duration::ZERO);
    }

    #[test]
    fn handoff_is_claimed_once() {
        let state = SplashState::new();
        assert!(state.claim_finish());
        assert!(!state.claim_finish());
    }
}
