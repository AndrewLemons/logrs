use super::band::band_for_frequency;
use super::hamlib::{map_mode, HamlibProvider};
use super::provider::RadioProvider;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::sync::watch;

const POLL_INTERVAL: Duration = Duration::from_secs(1);
const RETRY_INTERVAL: Duration = Duration::from_secs(5);

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RadioSettings {
	pub enabled: bool,
	pub host: String,
	pub port: u16,
}

impl Default for RadioSettings {
	fn default() -> Self {
		Self {
			enabled: false,
			host: "127.0.0.1".to_string(),
			port: 4532,
		}
	}
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RadioStatus {
	Disabled,
	Connecting,
	Connected,
	Disconnected,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct RadioSnapshot {
	pub status: RadioStatus,
	pub frequency_hz: Option<u64>,
	pub band: Option<String>,
	pub mode: Option<String>,
}

impl Default for RadioSnapshot {
	fn default() -> Self {
		Self {
			status: RadioStatus::Disabled,
			frequency_hz: None,
			band: None,
			mode: None,
		}
	}
}

/// Owns the live connection to the configured radio provider and exposes
/// the latest snapshot to Tauri commands. The actual polling runs on a
/// background task spawned by `spawn`; this struct is just the shared,
/// thread-safe handle to that task's state.
pub struct RadioManagerState {
	settings_tx: watch::Sender<RadioSettings>,
	snapshot: Arc<Mutex<RadioSnapshot>>,
}

pub fn load_settings(conn: &rusqlite::Connection) -> RadioSettings {
	let get = |key: &str| -> String {
		conn.query_row(
			"SELECT value FROM app_state WHERE key = ?1",
			[key],
			|row| row.get(0),
		)
		.unwrap_or_default()
	};
	let defaults = RadioSettings::default();
	let host = get("radio_host");
	RadioSettings {
		enabled: get("radio_enabled") == "1",
		host: if host.is_empty() { defaults.host } else { host },
		port: get("radio_port").parse().unwrap_or(defaults.port),
	}
}

impl RadioManagerState {
	pub fn snapshot(&self) -> RadioSnapshot {
		self.snapshot.lock().unwrap().clone()
	}

	pub fn update_settings(&self, settings: RadioSettings) {
		// Reset to a clean "disabled"/"connecting" snapshot immediately so the
		// UI doesn't show stale readings from the previous configuration while
		// the background task reconnects.
		let mut snap = self.snapshot.lock().unwrap();
		snap.status = if settings.enabled {
			RadioStatus::Connecting
		} else {
			RadioStatus::Disabled
		};
		snap.frequency_hz = None;
		snap.band = None;
		snap.mode = None;
		drop(snap);
		let _ = self.settings_tx.send(settings);
	}
}

fn apply_reading(snapshot: &mut RadioSnapshot, frequency_hz: Option<u64>, mode_raw: Option<String>) {
	snapshot.status = RadioStatus::Connected;
	snapshot.frequency_hz = frequency_hz;
	snapshot.band = frequency_hz.and_then(band_for_frequency);
	snapshot.mode = mode_raw.as_deref().and_then(map_mode);
}

pub fn spawn(app: AppHandle, initial: RadioSettings) -> RadioManagerState {
	let (tx, mut rx) = watch::channel(initial.clone());
	let snapshot = Arc::new(Mutex::new(RadioSnapshot {
		status: if initial.enabled {
			RadioStatus::Connecting
		} else {
			RadioStatus::Disabled
		},
		..Default::default()
	}));
	let snapshot_bg = snapshot.clone();

	tauri::async_runtime::spawn(async move {
		let mut settings = rx.borrow().clone();
		let mut provider: Option<HamlibProvider> = None;

		loop {
			if !settings.enabled {
				provider = None;
				set_status(&snapshot_bg, &app, RadioStatus::Disabled);
				if rx.changed().await.is_err() {
					break;
				}
				settings = rx.borrow().clone();
				continue;
			}

			if provider.is_none() {
				set_status(&snapshot_bg, &app, RadioStatus::Connecting);
				let mut p = HamlibProvider::new(settings.host.clone(), settings.port);
				match p.connect().await {
					Ok(()) => provider = Some(p),
					Err(_) => {
						set_status(&snapshot_bg, &app, RadioStatus::Disconnected);
						tokio::select! {
							_ = tokio::time::sleep(RETRY_INTERVAL) => {}
							changed = rx.changed() => {
								if changed.is_err() {
									break;
								}
								settings = rx.borrow().clone();
							}
						}
						continue;
					}
				}
			}

			tokio::select! {
				_ = tokio::time::sleep(POLL_INTERVAL) => {
					let Some(p) = provider.as_mut() else { continue };
					match p.poll().await {
						Ok(reading) => {
							let mut snap = snapshot_bg.lock().unwrap();
							let before = snap.clone();
							apply_reading(&mut snap, reading.frequency_hz, reading.mode_raw);
							let changed = *snap != before;
							let out = snap.clone();
							drop(snap);
							if changed {
								let _ = app.emit("radio-update", out);
							}
						}
						Err(_) => {
							provider = None;
							set_status(&snapshot_bg, &app, RadioStatus::Disconnected);
						}
					}
				}
				changed = rx.changed() => {
					if changed.is_err() {
						break;
					}
					let new_settings = rx.borrow().clone();
					if new_settings.enabled != settings.enabled
						|| new_settings.host != settings.host
						|| new_settings.port != settings.port
					{
						if let Some(p) = provider.as_mut() {
							p.disconnect();
						}
						provider = None;
					}
					settings = new_settings;
				}
			}
		}
	});

	RadioManagerState {
		settings_tx: tx,
		snapshot,
	}
}

fn set_status(snapshot: &Arc<Mutex<RadioSnapshot>>, app: &AppHandle, status: RadioStatus) {
	let mut snap = snapshot.lock().unwrap();
	if snap.status == status {
		return;
	}
	snap.status = status;
	if snap.status != RadioStatus::Connected {
		snap.frequency_hz = None;
		snap.band = None;
		snap.mode = None;
	}
	let out = snap.clone();
	drop(snap);
	let _ = app.emit("radio-update", out);
}
