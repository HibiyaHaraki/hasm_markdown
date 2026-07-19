/// # logger.rs
/// Hibiya Haraki (July, 2026)
/// ## Purpose
/// Define logger

// Modules

// Crates
use log::{debug, error, info, trace, warn};
use std::sync::Once;

// Constants
pub static LOGLEVEL: &str = "debug";
pub static LOGGER_INIT: Once = Once::new();

pub fn init_logger() {
    LOGGER_INIT.call_once(|| {
        let _ = env_logger::Builder::from_env(env_logger::Env::default().default_filter_or(LOGLEVEL))
            .target(env_logger::Target::Stdout)
            .format_module_path(true)
            .format_target(false)
            .try_init();
    });
}