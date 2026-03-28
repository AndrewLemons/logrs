use crate::db::DbState;
use crate::models::{CreateProfile, Profile};
use tauri::State;

#[tauri::command]
pub fn get_profiles(db: State<DbState>) -> Result<Vec<Profile>, String> {
	let conn = db.0.lock().map_err(|e| e.to_string())?;
	let mut stmt = conn
		.prepare(
			"SELECT id, callsign, name, grid, default_power, default_band, default_mode,
                    default_park, default_summit, station_description, created_at
             FROM profiles ORDER BY callsign",
		)
		.map_err(|e| e.to_string())?;
	let profiles = stmt
		.query_map([], |row| {
			Ok(Profile {
				id: row.get(0)?,
				callsign: row.get(1)?,
				name: row.get(2)?,
				grid: row.get(3)?,
				default_power: row.get(4)?,
				default_band: row.get(5)?,
				default_mode: row.get(6)?,
				default_park: row.get(7)?,
				default_summit: row.get(8)?,
				station_description: row.get(9)?,
				created_at: row.get(10)?,
			})
		})
		.map_err(|e| e.to_string())?
		.collect::<Result<Vec<_>, _>>()
		.map_err(|e| e.to_string())?;
	Ok(profiles)
}

#[tauri::command]
pub fn create_profile(db: State<DbState>, profile: CreateProfile) -> Result<Profile, String> {
	let conn = db.0.lock().map_err(|e| e.to_string())?;
	conn.execute(
		"INSERT INTO profiles (callsign, name, grid, default_power, default_band, default_mode,
                               default_park, default_summit, station_description)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
		rusqlite::params![
			profile.callsign,
			profile.name,
			profile.grid,
			profile.default_power,
			profile.default_band,
			profile.default_mode,
			profile.default_park,
			profile.default_summit,
			profile.station_description,
		],
	)
	.map_err(|e| e.to_string())?;
	let id = conn.last_insert_rowid();
	let mut stmt = conn
		.prepare(
			"SELECT id, callsign, name, grid, default_power, default_band, default_mode,
                    default_park, default_summit, station_description, created_at
             FROM profiles WHERE id = ?1",
		)
		.map_err(|e| e.to_string())?;
	stmt.query_row([id], |row| {
		Ok(Profile {
			id: row.get(0)?,
			callsign: row.get(1)?,
			name: row.get(2)?,
			grid: row.get(3)?,
			default_power: row.get(4)?,
			default_band: row.get(5)?,
			default_mode: row.get(6)?,
			default_park: row.get(7)?,
			default_summit: row.get(8)?,
			station_description: row.get(9)?,
			created_at: row.get(10)?,
		})
	})
	.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_profile(db: State<DbState>, profile: Profile) -> Result<(), String> {
	let conn = db.0.lock().map_err(|e| e.to_string())?;
	conn.execute(
		"UPDATE profiles SET callsign=?1, name=?2, grid=?3, default_power=?4, default_band=?5,
                default_mode=?6, default_park=?7, default_summit=?8, station_description=?9
         WHERE id=?10",
		rusqlite::params![
			profile.callsign,
			profile.name,
			profile.grid,
			profile.default_power,
			profile.default_band,
			profile.default_mode,
			profile.default_park,
			profile.default_summit,
			profile.station_description,
			profile.id,
		],
	)
	.map_err(|e| e.to_string())?;
	Ok(())
}

#[tauri::command]
pub fn delete_profile(db: State<DbState>, id: i64) -> Result<(), String> {
	let conn = db.0.lock().map_err(|e| e.to_string())?;
	conn.execute("DELETE FROM profiles WHERE id=?1", [id])
		.map_err(|e| e.to_string())?;
	Ok(())
}

#[tauri::command]
pub fn get_active_profile(db: State<DbState>) -> Result<Option<Profile>, String> {
	let conn = db.0.lock().map_err(|e| e.to_string())?;
	let id_str: String = conn
		.query_row(
			"SELECT value FROM app_state WHERE key='active_profile_id'",
			[],
			|row| row.get(0),
		)
		.unwrap_or_default();
	if id_str.is_empty() {
		return Ok(None);
	}
	let id: i64 = id_str
		.parse()
		.map_err(|_| "Invalid profile ID".to_string())?;
	let mut stmt = conn
		.prepare(
			"SELECT id, callsign, name, grid, default_power, default_band, default_mode,
                    default_park, default_summit, station_description, created_at
             FROM profiles WHERE id = ?1",
		)
		.map_err(|e| e.to_string())?;
	let profile = stmt
		.query_row([id], |row| {
			Ok(Profile {
				id: row.get(0)?,
				callsign: row.get(1)?,
				name: row.get(2)?,
				grid: row.get(3)?,
				default_power: row.get(4)?,
				default_band: row.get(5)?,
				default_mode: row.get(6)?,
				default_park: row.get(7)?,
				default_summit: row.get(8)?,
				station_description: row.get(9)?,
				created_at: row.get(10)?,
			})
		})
		.ok();
	Ok(profile)
}

#[tauri::command]
pub fn set_active_profile(db: State<DbState>, id: i64) -> Result<(), String> {
	let conn = db.0.lock().map_err(|e| e.to_string())?;
	conn.execute(
		"INSERT OR REPLACE INTO app_state (key, value) VALUES ('active_profile_id', ?1)",
		[id.to_string()],
	)
	.map_err(|e| e.to_string())?;
	Ok(())
}
