use crate::db::DbState;
use crate::radio::{
	band_for_frequency, load_settings, map_mode, HamlibProvider, RadioManagerState, RadioProvider,
	RadioSettings, RadioSnapshot,
};
use serde::Serialize;
use tauri::State;

#[tauri::command]
pub fn get_radio_settings(db: State<DbState>) -> Result<RadioSettings, String> {
	let conn = db.0.lock().map_err(|e| e.to_string())?;
	Ok(load_settings(&conn))
}

#[tauri::command]
pub fn set_radio_settings(
	db: State<DbState>,
	manager: State<RadioManagerState>,
	settings: RadioSettings,
) -> Result<(), String> {
	let conn = db.0.lock().map_err(|e| e.to_string())?;
	conn.execute(
		"INSERT OR REPLACE INTO app_state (key, value) VALUES ('radio_enabled', ?1)",
		[if settings.enabled { "1" } else { "0" }],
	)
	.map_err(|e| e.to_string())?;
	conn.execute(
		"INSERT OR REPLACE INTO app_state (key, value) VALUES ('radio_host', ?1)",
		[&settings.host],
	)
	.map_err(|e| e.to_string())?;
	conn.execute(
		"INSERT OR REPLACE INTO app_state (key, value) VALUES ('radio_port', ?1)",
		[settings.port.to_string()],
	)
	.map_err(|e| e.to_string())?;
	drop(conn);

	manager.update_settings(settings);
	Ok(())
}

#[tauri::command]
pub fn get_radio_snapshot(manager: State<RadioManagerState>) -> RadioSnapshot {
	manager.snapshot()
}

#[derive(Debug, Clone, Serialize)]
pub struct RadioTestResult {
	pub frequency_hz: Option<u64>,
	pub band: Option<String>,
	pub mode: Option<String>,
}

#[tauri::command]
pub async fn test_radio_connection(host: String, port: u16) -> Result<RadioTestResult, String> {
	let mut provider = HamlibProvider::new(host, port);
	provider.connect().await?;
	let reading = provider.poll().await;
	provider.disconnect();
	let reading = reading?;

	Ok(RadioTestResult {
		frequency_hz: reading.frequency_hz,
		band: reading.frequency_hz.and_then(band_for_frequency),
		mode: reading.mode_raw.as_deref().and_then(map_mode),
	})
}
