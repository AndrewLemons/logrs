use crate::db::DbState;
use crate::external::{hamdb, qrz};
use crate::models::CallsignInfo;
use tauri::State;

/// Get QRZ credentials from app_state, returns (username, password).
fn get_qrz_credentials(db: &State<DbState>) -> Option<(String, String)> {
    let conn = db.0.lock().ok()?;
    let username: String = conn
        .query_row(
            "SELECT value FROM app_state WHERE key = 'qrz_username'",
            [],
            |row| row.get(0),
        )
        .unwrap_or_default();
    let password: String = conn
        .query_row(
            "SELECT value FROM app_state WHERE key = 'qrz_password'",
            [],
            |row| row.get(0),
        )
        .unwrap_or_default();

    if username.is_empty() || password.is_empty() {
        None
    } else {
        Some((username, password))
    }
}

#[tauri::command]
pub async fn lookup_callsign(
    db: State<'_, DbState>,
    callsign: String,
) -> Result<Option<CallsignInfo>, String> {
    let callsign = callsign.trim().to_uppercase();
    if callsign.is_empty() || callsign.len() < 3 {
        return Ok(None);
    }

    let qrz_creds = get_qrz_credentials(&db);

    // Run QRZ (if configured) and HamDB concurrently then merge.
    // QRZ provides richer contest data (CQ/ITU zones) but often omits the grid
    // square, so HamDB is always queried and used to fill any missing fields.
    let (qrz_result, hamdb_result) = if let Some((username, password)) = qrz_creds {
        let qrz_fut = qrz::lookup(&callsign, &username, &password);
        let hamdb_fut = hamdb::lookup(&callsign);
        let (q, h) = tokio::join!(qrz_fut, hamdb_fut);
        (q.unwrap_or(None), h)
    } else {
        (None, hamdb::lookup(&callsign).await)
    };

    // Merge: start with QRZ data (higher quality for most fields), then fill
    // any empty fields from HamDB.
    let merged = match (qrz_result, hamdb_result) {
        (None, None) => return Ok(None),
        (Some(info), None) => info,
        (None, Some(info)) => info,
        (Some(qrz), Some(hamdb)) => CallsignInfo {
            callsign: qrz.callsign,
            // Prefer QRZ name if present, else HamDB
            name: if !qrz.name.is_empty() { qrz.name } else { hamdb.name },
            // HamDB grid is usually more reliable — prefer it; fall back to QRZ
            grid: if !hamdb.grid.is_empty() { hamdb.grid } else { qrz.grid },
            city: if !qrz.city.is_empty() { qrz.city } else { hamdb.city },
            state: if !qrz.state.is_empty() { qrz.state } else { hamdb.state },
            country: if !qrz.country.is_empty() { qrz.country } else { hamdb.country },
            // QRZ-only fields
            cq_zone: qrz.cq_zone,
            itu_zone: qrz.itu_zone,
            county: qrz.county,
        },
    };

    Ok(Some(merged))
}

#[tauri::command]
pub async fn set_qrz_credentials(
    db: State<'_, DbState>,
    username: String,
    password: String,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO app_state (key, value) VALUES ('qrz_username', ?1)",
        [&username],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO app_state (key, value) VALUES ('qrz_password', ?1)",
        [&password],
    )
    .map_err(|e| e.to_string())?;
    // Clear cached session so new credentials are used
    qrz::clear_session();
    Ok(())
}

#[tauri::command]
pub fn get_qrz_credentials_cmd(db: State<DbState>) -> Result<(String, String), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let username: String = conn
        .query_row(
            "SELECT value FROM app_state WHERE key = 'qrz_username'",
            [],
            |row| row.get(0),
        )
        .unwrap_or_default();
    let password: String = conn
        .query_row(
            "SELECT value FROM app_state WHERE key = 'qrz_password'",
            [],
            |row| row.get(0),
        )
        .unwrap_or_default();
    Ok((username, password))
}

#[tauri::command]
pub async fn test_qrz_credentials(
    _db: State<'_, DbState>,
    username: String,
    password: String,
) -> Result<(), String> {
    // Test the provided credentials without saving them
    qrz::test_credentials(&username, &password).await
}
