use crate::db::DbState;
use crate::external::{pota, sota};
use crate::models::{PotaPark, SotaSummit, SyncStatus};
use rusqlite::Connection;
use serde::Serialize;
use std::sync::{Arc, Mutex};
use std::sync::atomic::Ordering;
use tauri::{Emitter, State};

#[derive(Clone, Serialize)]
struct SyncProgress {
    sync_type: String,
    current: usize,
    total: usize,
    label: String,
}

#[derive(Clone, Serialize)]
pub struct PotaSpotResult {
    pub reference: String,
    pub park_name: String,
    pub frequency: String,
    pub mode: String,
    pub spot_time: String,
    pub grid: String,
}

// ─── Core sync functions (callable from commands and background task) ─────────

pub async fn run_pota_sync(
    db: Arc<Mutex<Connection>>,
    app: tauri::AppHandle,
) -> Result<u64, String> {
    let locations = pota::fetch_locations().await?;
    let total = locations.len();

    {
        let conn = db.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM pota_parks", [])
            .map_err(|e| e.to_string())?;
    }

    let mut park_count = 0u64;

    for (i, location) in locations.iter().enumerate() {
        let _ = app.emit(
            "sync-progress",
            SyncProgress {
                sync_type: "pota".to_string(),
                current: i + 1,
                total,
                label: format!("{} ({})", location.name, location.prefix),
            },
        );

        let parks = match pota::fetch_parks(&location.prefix).await {
            Ok(p) => p,
            Err(_) => continue,
        };

        if parks.is_empty() {
            continue;
        }

        let conn = db.lock().map_err(|e| e.to_string())?;
        for park in &parks {
            let reference = park.reference.as_deref().unwrap_or("");
            if reference.is_empty() {
                continue;
            }
            conn.execute(
                "INSERT OR REPLACE INTO pota_parks \
                 (reference, name, latitude, longitude, grid, location_desc) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                rusqlite::params![
                    reference,
                    park.name.as_deref().unwrap_or(""),
                    park.latitude.unwrap_or(0.0),
                    park.longitude.unwrap_or(0.0),
                    park.grid.as_deref().unwrap_or(""),
                    park.location_desc.as_deref().unwrap_or(""),
                ],
            )
            .map_err(|e| e.to_string())?;
        }
        park_count += parks.len() as u64;
    }

    {
        let conn = db.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR REPLACE INTO app_state (key, value) \
             VALUES ('pota_last_synced', datetime('now'))",
            [],
        )
        .map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR REPLACE INTO app_state (key, value) VALUES ('pota_park_count', ?1)",
            [park_count.to_string()],
        )
        .map_err(|e| e.to_string())?;
    }

    let _ = app.emit(
        "sync-progress",
        SyncProgress {
            sync_type: "pota".to_string(),
            current: total,
            total,
            label: "Complete".to_string(),
        },
    );

    Ok(park_count)
}

fn insert_sota_batch(
    conn: &rusqlite::Connection,
    batch: &[(String, String, String, String, i32, i32, f64, f64, i32, i32, String, String)],
) -> Result<(), String> {
    for row in batch {
        conn.execute(
            "INSERT OR REPLACE INTO sota_summits \
             (summit_code, association_name, region_name, summit_name, \
              alt_m, alt_ft, longitude, latitude, points, bonus_points, \
              valid_from, valid_to) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            rusqlite::params![
                row.0, row.1, row.2, row.3, row.4, row.5,
                row.6, row.7, row.8, row.9, row.10, row.11,
            ],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub async fn run_sota_sync(
    db: Arc<Mutex<Connection>>,
    app: tauri::AppHandle,
) -> Result<u64, String> {
    let _ = app.emit(
        "sync-progress",
        SyncProgress {
            sync_type: "sota".to_string(),
            current: 0,
            total: 1,
            label: "Downloading summits list\u{2026}".to_string(),
        },
    );

    let csv_text = sota::fetch_summits_csv().await?;

    let _ = app.emit(
        "sync-progress",
        SyncProgress {
            sync_type: "sota".to_string(),
            current: 0,
            total: 1,
            label: "Parsing CSV\u{2026}".to_string(),
        },
    );

    let csv_body = csv_text
        .lines()
        .skip(1)
        .collect::<Vec<&str>>()
        .join("\n");

    let mut rdr = csv::ReaderBuilder::new()
        .has_headers(true)
        .flexible(true)
        .from_reader(csv_body.as_bytes());

    {
        let conn = db.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM sota_summits", [])
            .map_err(|e| e.to_string())?;
    }

    let mut summit_count = 0u64;
    let mut batch: Vec<(
        String, String, String, String, i32, i32, f64, f64, i32, i32, String, String,
    )> = Vec::new();

    for result in rdr.records() {
        let record = match result {
            Ok(r) => r,
            Err(_) => continue,
        };

        if record.len() < 14 {
            continue;
        }

        let summit_code = record.get(0).unwrap_or("").to_string();
        if summit_code.is_empty() {
            continue;
        }

        batch.push((
            summit_code,
            record.get(1).unwrap_or("").to_string(),
            record.get(2).unwrap_or("").to_string(),
            record.get(3).unwrap_or("").to_string(),
            record.get(4).unwrap_or("0").parse::<i32>().unwrap_or(0),
            record.get(5).unwrap_or("0").parse::<i32>().unwrap_or(0),
            record.get(8).unwrap_or("0").parse::<f64>().unwrap_or(0.0),
            record.get(9).unwrap_or("0").parse::<f64>().unwrap_or(0.0),
            record.get(10).unwrap_or("0").parse::<i32>().unwrap_or(0),
            record.get(11).unwrap_or("0").parse::<i32>().unwrap_or(0),
            record.get(12).unwrap_or("").to_string(),
            record.get(13).unwrap_or("").to_string(),
        ));

        if batch.len() >= 1000 {
            let conn = db.lock().map_err(|e| e.to_string())?;
            insert_sota_batch(&conn, &batch)?;
            summit_count += batch.len() as u64;
            batch.clear();
        }
    }

    if !batch.is_empty() {
        let conn = db.lock().map_err(|e| e.to_string())?;
        insert_sota_batch(&conn, &batch)?;
        summit_count += batch.len() as u64;
    }

    {
        let conn = db.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR REPLACE INTO app_state (key, value) \
             VALUES ('sota_last_synced', datetime('now'))",
            [],
        )
        .map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR REPLACE INTO app_state (key, value) VALUES ('sota_summit_count', ?1)",
            [summit_count.to_string()],
        )
        .map_err(|e| e.to_string())?;
    }

    let _ = app.emit(
        "sync-progress",
        SyncProgress {
            sync_type: "sota".to_string(),
            current: 1,
            total: 1,
            label: "Complete".to_string(),
        },
    );

    Ok(summit_count)
}

/// Returns true if the given sync key is missing or older than `max_age_days`.
pub fn is_sync_stale(db: &Arc<Mutex<Connection>>, key: &str, max_age_days: i64) -> bool {
    let conn = match db.lock() {
        Ok(c) => c,
        Err(_) => return true,
    };
    let last: Option<String> = conn
        .query_row(
            "SELECT value FROM app_state WHERE key = ?1",
            [key],
            |row| row.get(0),
        )
        .ok()
        .filter(|v: &String| !v.is_empty());

    match last {
        None => true,
        Some(s) => chrono::NaiveDateTime::parse_from_str(&s, "%Y-%m-%d %H:%M:%S")
            .map(|dt| {
                let age = chrono::Utc::now().naive_utc() - dt;
                age.num_days() >= max_age_days
            })
            .unwrap_or(true),
    }
}

// ─── Tauri commands ───────────────────────────────────────────────────────────

#[tauri::command]
pub async fn sync_pota_data(
    db: State<'_, DbState>,
    sync_lock: State<'_, crate::SyncLock>,
    app: tauri::AppHandle,
) -> Result<u64, String> {
    if sync_lock.0.swap(true, Ordering::SeqCst) {
        return Err("Sync already in progress".into());
    }
    let result = run_pota_sync(db.0.clone(), app).await;
    sync_lock.0.store(false, Ordering::SeqCst);
    result
}

#[tauri::command]
pub async fn sync_sota_data(
    db: State<'_, DbState>,
    sync_lock: State<'_, crate::SyncLock>,
    app: tauri::AppHandle,
) -> Result<u64, String> {
    if sync_lock.0.swap(true, Ordering::SeqCst) {
        return Err("Sync already in progress".into());
    }
    let result = run_sota_sync(db.0.clone(), app).await;
    sync_lock.0.store(false, Ordering::SeqCst);
    result
}

#[tauri::command]
pub fn get_is_syncing(sync_lock: State<'_, crate::SyncLock>) -> bool {
    sync_lock.0.load(Ordering::SeqCst)
}

#[tauri::command]
pub fn get_pota_parks(db: State<DbState>, query: String) -> Result<Vec<PotaPark>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let query_pattern = format!("%{}%", query.to_uppercase());

    let mut stmt = conn
        .prepare(
            "SELECT reference, name, latitude, longitude, grid, location_desc \
             FROM pota_parks \
             WHERE UPPER(reference) LIKE ?1 OR UPPER(name) LIKE ?1 \
             LIMIT 20",
        )
        .map_err(|e| e.to_string())?;

    let results = stmt
        .query_map([&query_pattern], |row| {
            Ok(PotaPark {
                reference: row.get(0)?,
                name: row.get(1)?,
                latitude: row.get(2)?,
                longitude: row.get(3)?,
                grid: row.get(4)?,
                location_desc: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(results)
}

#[tauri::command]
pub fn get_sota_summits(db: State<DbState>, query: String) -> Result<Vec<SotaSummit>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let query_pattern = format!("%{}%", query.to_uppercase());

    let mut stmt = conn
        .prepare(
            "SELECT summit_code, association_name, region_name, summit_name, \
                    alt_m, alt_ft, longitude, latitude, points, bonus_points, \
                    valid_from, valid_to \
             FROM sota_summits \
             WHERE UPPER(summit_code) LIKE ?1 OR UPPER(summit_name) LIKE ?1 \
             LIMIT 20",
        )
        .map_err(|e| e.to_string())?;

    let results = stmt
        .query_map([&query_pattern], |row| {
            Ok(SotaSummit {
                summit_code: row.get(0)?,
                association_name: row.get(1)?,
                region_name: row.get(2)?,
                summit_name: row.get(3)?,
                alt_m: row.get(4)?,
                alt_ft: row.get(5)?,
                longitude: row.get(6)?,
                latitude: row.get(7)?,
                points: row.get(8)?,
                bonus_points: row.get(9)?,
                valid_from: row.get(10)?,
                valid_to: row.get(11)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(results)
}

#[tauri::command]
pub fn get_sync_status(db: State<DbState>) -> Result<SyncStatus, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let get_state = |key: &str| -> Option<String> {
        conn.query_row(
            "SELECT value FROM app_state WHERE key = ?1",
            [key],
            |row| row.get::<_, String>(0),
        )
        .ok()
        .filter(|v| !v.is_empty())
    };

    let pota_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM pota_parks", [], |row| row.get(0))
        .unwrap_or(0);

    let sota_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM sota_summits", [], |row| row.get(0))
        .unwrap_or(0);

    Ok(SyncStatus {
        pota_last_synced: get_state("pota_last_synced"),
        pota_count,
        sota_last_synced: get_state("sota_last_synced"),
        sota_count,
    })
}

/// Normalize a callsign by stripping portable suffixes like /P, /A, -A, /M etc.
fn normalize_callsign(callsign: &str) -> String {
    let upper = callsign.trim().to_uppercase();
    // Strip suffixes like /P, /A, -A, /QRP, etc.
    let base = upper
        .split(|c| c == '/' || c == '-')
        .next()
        .unwrap_or(&upper);
    base.to_string()
}

#[tauri::command]
pub async fn lookup_pota_activator(callsign: String) -> Result<Option<PotaSpotResult>, String> {
    let spots = pota::fetch_spots().await?;
    let target = normalize_callsign(&callsign);

    // Find the most recent spot for this callsign (list is already sorted by recency)
    let found = spots.iter().find(|s| {
        if let Some(ref activator) = s.activator {
            normalize_callsign(activator) == target
        } else {
            false
        }
    });

    match found {
        Some(spot) => Ok(Some(PotaSpotResult {
            reference: spot.reference.clone().unwrap_or_default(),
            park_name: spot.name.clone().unwrap_or_default(),
            frequency: spot.frequency.clone().unwrap_or_default(),
            mode: spot.mode.clone().unwrap_or_default(),
            spot_time: spot.spot_time.clone().unwrap_or_default(),
            grid: spot.grid6.clone().or_else(|| spot.grid4.clone()).unwrap_or_default(),
        })),
        None => Ok(None),
    }
}

