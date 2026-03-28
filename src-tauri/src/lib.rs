mod commands;
mod db;
mod external;
mod models;

use commands::reference::{is_sync_stale, run_pota_sync, run_sota_sync};
use db::DbState;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use tauri::{Emitter, Manager};

pub struct SyncLock(pub Arc<AtomicBool>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let app_data = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");
            let db_path = app_data.join("logrs.db");
            let conn = db::init_db(&db_path).expect("failed to initialize database");

            // Wrap in Arc so it can be shared with the background task.
            let db_arc = Arc::new(Mutex::new(conn));
            let db_bg = db_arc.clone();
            app.manage(DbState(db_arc));

            // Sync lock — shared between commands and background task.
            let sync_lock = Arc::new(AtomicBool::new(false));
            let sync_lock_bg = sync_lock.clone();
            app.manage(SyncLock(sync_lock));

            // Background sync task.
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                // Short delay to let the UI finish initializing.
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;

                // Startup check.
                trigger_background_sync_if_stale(&db_bg, &app_handle, &sync_lock_bg).await;

                // Periodic check every 12 hours.
                loop {
                    tokio::time::sleep(std::time::Duration::from_secs(12 * 3600)).await;
                    trigger_background_sync_if_stale(&db_bg, &app_handle, &sync_lock_bg).await;
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Profiles
            commands::profiles::get_profiles,
            commands::profiles::create_profile,
            commands::profiles::update_profile,
            commands::profiles::delete_profile,
            commands::profiles::get_active_profile,
            commands::profiles::set_active_profile,
            // Logbooks
            commands::logbooks::get_logbooks,
            commands::logbooks::create_logbook,
            commands::logbooks::update_logbook,
            commands::logbooks::delete_logbook,
            commands::logbooks::get_active_logbook,
            commands::logbooks::set_active_logbook,
            // QSOs
            commands::qsos::create_qso,
            commands::qsos::get_qsos,
            commands::qsos::update_qso,
            commands::qsos::delete_qsos,
            commands::qsos::check_duplicate,
            // Templates
            commands::templates::get_templates,
            commands::templates::get_template,
            commands::templates::create_template,
            commands::templates::update_template,
            commands::templates::delete_template,
            // Lookup
            commands::lookup::lookup_callsign,
            // Export/Import
            commands::export::export_adif,
            commands::export::import_adif,
            // Reference data
            commands::reference::sync_pota_data,
            commands::reference::sync_sota_data,
            commands::reference::get_pota_parks,
            commands::reference::get_sota_summits,
            commands::reference::get_sync_status,
            commands::reference::get_is_syncing,
            commands::reference::lookup_pota_activator,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

async fn trigger_background_sync_if_stale(
    db: &Arc<Mutex<rusqlite::Connection>>,
    app: &tauri::AppHandle,
    lock: &Arc<AtomicBool>,
) {
    let pota_stale = is_sync_stale(db, "pota_last_synced", 7);
    let sota_stale = is_sync_stale(db, "sota_last_synced", 7);

    if !pota_stale && !sota_stale {
        return;
    }

    // Try to acquire lock; bail if another sync is already running.
    if lock.swap(true, Ordering::SeqCst) {
        return;
    }

    let _ = app.emit("background-sync-started", ());

    if pota_stale {
        if let Err(e) = run_pota_sync(db.clone(), app.clone()).await {
            eprintln!("Background POTA sync error: {}", e);
        }
    }

    if sota_stale {
        if let Err(e) = run_sota_sync(db.clone(), app.clone()).await {
            eprintln!("Background SOTA sync error: {}", e);
        }
    }

    lock.store(false, Ordering::SeqCst);
    let _ = app.emit("background-sync-completed", ());
}

