use crate::db::DbState;
use crate::models::{CreateLogbook, Logbook};
use tauri::State;

#[tauri::command]
pub fn get_logbooks(db: State<DbState>) -> Result<Vec<Logbook>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, name, profile_id, template_id, created_at, metadata_json
             FROM logbooks ORDER BY created_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let logbooks = stmt
        .query_map([], |row| {
            Ok(Logbook {
                id: row.get(0)?,
                name: row.get(1)?,
                profile_id: row.get(2)?,
                template_id: row.get(3)?,
                created_at: row.get(4)?,
                metadata_json: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(logbooks)
}

#[tauri::command]
pub fn create_logbook(db: State<DbState>, logbook: CreateLogbook) -> Result<Logbook, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO logbooks (name, profile_id, template_id, metadata_json)
         VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![
            logbook.name,
            logbook.profile_id,
            logbook.template_id,
            logbook.metadata_json,
        ],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    conn.query_row(
        "SELECT id, name, profile_id, template_id, created_at, metadata_json
         FROM logbooks WHERE id = ?1",
        [id],
        |row| {
            Ok(Logbook {
                id: row.get(0)?,
                name: row.get(1)?,
                profile_id: row.get(2)?,
                template_id: row.get(3)?,
                created_at: row.get(4)?,
                metadata_json: row.get(5)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_logbook(db: State<DbState>, logbook: Logbook) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE logbooks SET name=?1, profile_id=?2, template_id=?3, metadata_json=?4
         WHERE id=?5",
        rusqlite::params![
            logbook.name,
            logbook.profile_id,
            logbook.template_id,
            logbook.metadata_json,
            logbook.id,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_logbook(db: State<DbState>, id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM logbooks WHERE id=?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_active_logbook(db: State<DbState>) -> Result<Option<Logbook>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let id_str: String = conn
        .query_row(
            "SELECT value FROM app_state WHERE key='active_logbook_id'",
            [],
            |row| row.get(0),
        )
        .unwrap_or_default();
    if id_str.is_empty() {
        return Ok(None);
    }
    let id: i64 = id_str.parse().map_err(|_| "Invalid logbook ID".to_string())?;
    let logbook = conn
        .query_row(
            "SELECT id, name, profile_id, template_id, created_at, metadata_json
             FROM logbooks WHERE id = ?1",
            [id],
            |row| {
                Ok(Logbook {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    profile_id: row.get(2)?,
                    template_id: row.get(3)?,
                    created_at: row.get(4)?,
                    metadata_json: row.get(5)?,
                })
            },
        )
        .ok();
    Ok(logbook)
}

#[tauri::command]
pub fn set_active_logbook(db: State<DbState>, id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO app_state (key, value) VALUES ('active_logbook_id', ?1)",
        [id.to_string()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
