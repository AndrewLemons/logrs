use crate::db::DbState;
use crate::models::{CreateTemplate, Template};
use tauri::State;

fn row_to_template(row: &rusqlite::Row) -> rusqlite::Result<Template> {
	Ok(Template {
		id: row.get(0)?,
		name: row.get(1)?,
		json_definition: row.get(2)?,
		is_builtin: row.get::<_, i32>(3)? != 0,
	})
}

#[tauri::command]
pub fn get_templates(db: State<DbState>) -> Result<Vec<Template>, String> {
	let conn = db.0.lock().map_err(|e| e.to_string())?;
	let mut stmt = conn
		.prepare("SELECT id, name, json_definition, is_builtin FROM templates ORDER BY id")
		.map_err(|e| e.to_string())?;
	let templates = stmt
		.query_map([], row_to_template)
		.map_err(|e| e.to_string())?
		.collect::<Result<Vec<_>, _>>()
		.map_err(|e| e.to_string())?;
	Ok(templates)
}

#[tauri::command]
pub fn get_template(db: State<DbState>, id: i64) -> Result<Template, String> {
	let conn = db.0.lock().map_err(|e| e.to_string())?;
	conn.query_row(
		"SELECT id, name, json_definition, is_builtin FROM templates WHERE id = ?1",
		[id],
		row_to_template,
	)
	.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_template(db: State<DbState>, template: CreateTemplate) -> Result<Template, String> {
	let conn = db.0.lock().map_err(|e| e.to_string())?;
	// Validate JSON
	let _: serde_json::Value = serde_json::from_str(&template.json_definition)
		.map_err(|e| format!("Invalid template definition: {}", e))?;
	conn.execute(
		"INSERT INTO templates (name, json_definition, is_builtin) VALUES (?1, ?2, 0)",
		rusqlite::params![template.name, template.json_definition],
	)
	.map_err(|e| e.to_string())?;
	let id = conn.last_insert_rowid();
	conn.query_row(
		"SELECT id, name, json_definition, is_builtin FROM templates WHERE id = ?1",
		[id],
		row_to_template,
	)
	.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_template(db: State<DbState>, template: Template) -> Result<(), String> {
	let conn = db.0.lock().map_err(|e| e.to_string())?;
	let _: serde_json::Value = serde_json::from_str(&template.json_definition)
		.map_err(|e| format!("Invalid template definition: {}", e))?;
	conn.execute(
		"UPDATE templates SET name = ?1, json_definition = ?2 WHERE id = ?3",
		rusqlite::params![template.name, template.json_definition, template.id],
	)
	.map_err(|e| e.to_string())?;
	Ok(())
}

#[tauri::command]
pub fn delete_template(db: State<DbState>, id: i64) -> Result<(), String> {
	let conn = db.0.lock().map_err(|e| e.to_string())?;
	// Prevent deleting built-in templates
	let is_builtin: bool = conn
		.query_row(
			"SELECT is_builtin FROM templates WHERE id = ?1",
			[id],
			|row| row.get::<_, i32>(0).map(|v| v != 0),
		)
		.map_err(|e| e.to_string())?;
	if is_builtin {
		return Err("Cannot delete built-in templates".to_string());
	}
	// Prevent deleting templates in use by logbooks
	let in_use: i64 = conn
		.query_row(
			"SELECT COUNT(*) FROM logbooks WHERE template_id = ?1",
			[id],
			|row| row.get(0),
		)
		.map_err(|e| e.to_string())?;
	if in_use > 0 {
		return Err("Template is in use by one or more logbooks".to_string());
	}
	conn.execute("DELETE FROM templates WHERE id = ?1", [id])
		.map_err(|e| e.to_string())?;
	Ok(())
}
