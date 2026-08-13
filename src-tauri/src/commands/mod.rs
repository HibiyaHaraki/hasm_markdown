pub mod editor;
pub mod asset;
pub mod save;
pub mod workspace;

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppThemeConfig {
	pub theme_mode: String,
	pub accent_color: String,
	pub warning_color: String,
}

pub fn theme_config_for(theme: &str) -> Result<AppThemeConfig, String> {
	let (accent_color, warning_color) = match theme {
		"Light" => ("#17324d", "#ef4444"),
		"Dark" => ("#0a1561", "#ef4444"),
		"High-Contrast" => ("#000000", "#ff0000"),
		_ => return Err("Unsupported theme mode".to_string()),
	};
	Ok(AppThemeConfig {
		theme_mode: theme.to_string(),
		accent_color: accent_color.to_string(),
		warning_color: warning_color.to_string(),
	})
}

#[tauri::command]
pub fn update_app_theme_config(app: tauri::AppHandle, theme: String) -> Result<(), String> {
	use std::fs;
	use tauri::Manager;

	let config = theme_config_for(&theme)?;
	let config_dir = app.path().app_config_dir().map_err(|error| error.to_string())?;
	fs::create_dir_all(&config_dir).map_err(|error| error.to_string())?;
	let config_path = config_dir.join("AppConfig.json");
	let content = serde_json::to_vec_pretty(&config).map_err(|error| error.to_string())?;
	let temporary_path = config_path.with_extension("json.tmp");
	fs::write(&temporary_path, content).map_err(|error| error.to_string())?;
	fs::rename(temporary_path, config_path).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_app_theme_config(app: tauri::AppHandle) -> Result<String, String> {
	use std::fs;
	use tauri::Manager;

	let config_path = app.path().app_config_dir().map_err(|error| error.to_string())?.join("AppConfig.json");
	if !config_path.is_file() {
		return Ok("Dark".to_string());
	}
	let content = fs::read_to_string(config_path).map_err(|error| error.to_string())?;
	let config: AppThemeConfig = serde_json::from_str(&content).map_err(|error| error.to_string())?;
	Ok(config.theme_mode)
}

#[cfg(test)]
mod tests {
	use super::theme_config_for;

	#[test]
	fn theme_config_accepts_all_standard_modes() {
		for theme in ["Light", "Dark", "High-Contrast"] {
			let config = theme_config_for(theme).expect("standard theme should be accepted");
			assert_eq!(config.theme_mode, theme);
		}
	}

	#[test]
	fn theme_config_rejects_unknown_modes() {
		assert!(theme_config_for("Solarized").is_err());
	}

	#[test]
	fn high_contrast_config_serializes_accessibility_colors() {
		let config = theme_config_for("High-Contrast").expect("high contrast should be accepted");
		let json = serde_json::to_value(config).expect("theme config should serialize");
		assert_eq!(json["themeMode"], "High-Contrast");
		assert_eq!(json["warningColor"], "#ff0000");
	}
}
