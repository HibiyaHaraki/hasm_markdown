//! # main.rs
//! Hibiya Haraki (July, 2026)
//! ## Purpose
//! Main script for HASM Markdown Tauri App 
//! ## Description
//! 

// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Main
fn main() {
    // SEQ-MD-01 / CLI dispatcher: verify and preview exit before Tauri GUI startup.
    let command = match hasm_markdown_lib::cli::args::parse(std::env::args()) {
        Ok(Some(command)) => command,
        Ok(None) => return,
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(1);
        }
    };

    let launch_path = match hasm_markdown_lib::cli::execute(command) {
        Ok(path) => path.map(|value| value.to_string_lossy().into_owned()),
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(1);
        }
    };

    hasm_markdown_lib::run_with_launch_path(launch_path)
}
