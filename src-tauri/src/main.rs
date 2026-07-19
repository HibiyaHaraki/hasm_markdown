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
    hasm_markdown_lib::run()
}
