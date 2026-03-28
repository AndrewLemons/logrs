use crate::db::DbState;
use crate::models::{CreateQso, Qso, QsoFilter, QsoPage};
use tauri::State;

fn row_to_qso(row: &rusqlite::Row) -> rusqlite::Result<Qso> {
	Ok(Qso {
		id: row.get(0)?,
		logbook_id: row.get(1)?,
		datetime: row.get(2)?,
		data_json: row.get(3)?,
	})
}

#[tauri::command]
pub fn create_qso(db: State<DbState>, qso: CreateQso) -> Result<Qso, String> {
	let conn = db.0.lock().map_err(|e| e.to_string())?;
	let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

	// Validate and normalize: uppercase the callsign within data_json
	let mut data: serde_json::Value =
		serde_json::from_str(&qso.data_json).map_err(|e| format!("Invalid QSO data: {}", e))?;
	if let Some(cs) = data.get("callsign").and_then(|v| v.as_str()) {
		data["callsign"] = serde_json::Value::String(cs.to_uppercase());
	}
	let data_str = serde_json::to_string(&data).map_err(|e| e.to_string())?;

	conn.execute(
		"INSERT INTO qsos (logbook_id, datetime, data_json) VALUES (?1, ?2, ?3)",
		rusqlite::params![qso.logbook_id, now, data_str],
	)
	.map_err(|e| e.to_string())?;

	let id = conn.last_insert_rowid();
	conn.query_row(
		"SELECT id, logbook_id, datetime, data_json FROM qsos WHERE id = ?1",
		[id],
		row_to_qso,
	)
	.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_qsos(db: State<DbState>, filter: QsoFilter) -> Result<QsoPage, String> {
	let conn = db.0.lock().map_err(|e| e.to_string())?;
	let page = filter.page.unwrap_or(1).max(1);
	let per_page = filter.per_page.unwrap_or(100).min(1000);
	let offset = (page - 1) * per_page;

	let mut where_clauses = vec!["logbook_id = ?1".to_string()];
	let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(filter.logbook_id)];
	let mut param_idx = 2;

	if let Some(ref search) = filter.search {
		if !search.is_empty() {
			where_clauses.push(format!("data_json LIKE ?{}", param_idx));
			params.push(Box::new(format!("%{}%", search)));
			param_idx += 1;
		}
	}
	if let Some(ref band) = filter.band {
		if !band.is_empty() {
			where_clauses.push(format!(
				"json_extract(data_json, '$.band') = ?{}",
				param_idx
			));
			params.push(Box::new(band.clone()));
			param_idx += 1;
		}
	}
	if let Some(ref mode) = filter.mode {
		if !mode.is_empty() {
			where_clauses.push(format!(
				"json_extract(data_json, '$.mode') = ?{}",
				param_idx
			));
			params.push(Box::new(mode.clone()));
			param_idx += 1;
		}
	}
	if let Some(ref date_from) = filter.date_from {
		if !date_from.is_empty() {
			where_clauses.push(format!("datetime >= ?{}", param_idx));
			params.push(Box::new(date_from.clone()));
			param_idx += 1;
		}
	}
	if let Some(ref date_to) = filter.date_to {
		if !date_to.is_empty() {
			where_clauses.push(format!("datetime <= ?{}", param_idx));
			params.push(Box::new(date_to.clone()));
			#[allow(unused_assignments)]
			{
				param_idx += 1;
			}
		}
	}

	let where_sql = where_clauses.join(" AND ");

	let sort_expr = match filter.sort_by.as_deref() {
		Some("datetime") | None => "datetime".to_string(),
		Some(field) => {
			// Sanitize field name to prevent injection
			if field.chars().all(|c| c.is_alphanumeric() || c == '_') {
				format!("json_extract(data_json, '$.{}')", field)
			} else {
				"datetime".to_string()
			}
		}
	};
	let sort_dir = match filter.sort_dir.as_deref() {
		Some("asc") | Some("ASC") => "ASC",
		_ => "DESC",
	};

	let count_sql = format!("SELECT COUNT(*) FROM qsos WHERE {}", where_sql);
	let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
	let total: i64 = conn
		.query_row(&count_sql, param_refs.as_slice(), |row| row.get(0))
		.map_err(|e| e.to_string())?;

	let query_sql = format!(
        "SELECT id, logbook_id, datetime, data_json FROM qsos WHERE {} ORDER BY {} {} LIMIT {} OFFSET {}",
        where_sql, sort_expr, sort_dir, per_page, offset
    );
	let param_refs2: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
	let mut stmt = conn.prepare(&query_sql).map_err(|e| e.to_string())?;
	let qsos = stmt
		.query_map(param_refs2.as_slice(), row_to_qso)
		.map_err(|e| e.to_string())?
		.collect::<Result<Vec<_>, _>>()
		.map_err(|e| e.to_string())?;

	Ok(QsoPage {
		qsos,
		total,
		page,
		per_page,
	})
}

#[tauri::command]
pub fn update_qso(db: State<DbState>, qso: Qso) -> Result<(), String> {
	let conn = db.0.lock().map_err(|e| e.to_string())?;
	let _: serde_json::Value =
		serde_json::from_str(&qso.data_json).map_err(|e| format!("Invalid QSO data: {}", e))?;
	conn.execute(
		"UPDATE qsos SET data_json = ?1 WHERE id = ?2",
		rusqlite::params![qso.data_json, qso.id],
	)
	.map_err(|e| e.to_string())?;
	Ok(())
}

#[tauri::command]
pub fn delete_qsos(db: State<DbState>, ids: Vec<i64>) -> Result<(), String> {
	let conn = db.0.lock().map_err(|e| e.to_string())?;
	let placeholders: Vec<String> = ids
		.iter()
		.enumerate()
		.map(|(i, _)| format!("?{}", i + 1))
		.collect();
	let sql = format!("DELETE FROM qsos WHERE id IN ({})", placeholders.join(","));
	let param_refs: Vec<Box<dyn rusqlite::types::ToSql>> = ids
		.into_iter()
		.map(|id| Box::new(id) as Box<dyn rusqlite::types::ToSql>)
		.collect();
	let refs: Vec<&dyn rusqlite::types::ToSql> = param_refs.iter().map(|p| p.as_ref()).collect();
	conn.execute(&sql, refs.as_slice())
		.map_err(|e| e.to_string())?;
	Ok(())
}

#[tauri::command]
pub fn check_duplicate(
	db: State<DbState>,
	logbook_id: i64,
	callsign: String,
	band: String,
) -> Result<bool, String> {
	let conn = db.0.lock().map_err(|e| e.to_string())?;
	let count: i64 = conn
		.query_row(
			"SELECT COUNT(*) FROM qsos
             WHERE logbook_id=?1
             AND json_extract(data_json, '$.callsign')=?2
             AND json_extract(data_json, '$.band')=?3
             AND datetime >= datetime('now', '-30 minutes')",
			rusqlite::params![logbook_id, callsign.to_uppercase(), band],
			|row| row.get(0),
		)
		.map_err(|e| e.to_string())?;
	Ok(count > 0)
}

#[tauri::command]
pub fn get_all_qso_data(db: State<DbState>, logbook_id: i64) -> Result<Vec<String>, String> {
	let conn = db.0.lock().map_err(|e| e.to_string())?;
	let mut stmt = conn
		.prepare("SELECT data_json FROM qsos WHERE logbook_id = ?1 ORDER BY datetime DESC")
		.map_err(|e| e.to_string())?;
	let data = stmt
		.query_map([logbook_id], |row| row.get::<_, String>(0))
		.map_err(|e| e.to_string())?
		.collect::<Result<Vec<_>, _>>()
		.map_err(|e| e.to_string())?;
	Ok(data)
}
