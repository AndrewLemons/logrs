use rusqlite::Connection;

const MIGRATIONS: &[&str] = &[
    // V1: Initial schema
    r#"
    CREATE TABLE IF NOT EXISTS profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        callsign TEXT NOT NULL,
        name TEXT NOT NULL DEFAULT '',
        grid TEXT NOT NULL DEFAULT '',
        default_power TEXT NOT NULL DEFAULT '',
        default_band TEXT NOT NULL DEFAULT '',
        default_mode TEXT NOT NULL DEFAULT '',
        default_park TEXT NOT NULL DEFAULT '',
        default_summit TEXT NOT NULL DEFAULT '',
        station_description TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        json_definition TEXT NOT NULL,
        is_builtin INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS logbooks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        profile_id INTEGER NOT NULL,
        template_id INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        metadata_json TEXT NOT NULL DEFAULT '{}',
        FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
        FOREIGN KEY (template_id) REFERENCES templates(id)
    );

    CREATE TABLE IF NOT EXISTS qsos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        logbook_id INTEGER NOT NULL,
        datetime TEXT NOT NULL DEFAULT (datetime('now')),
        callsign TEXT NOT NULL,
        rst_sent TEXT NOT NULL DEFAULT '59',
        rst_recv TEXT NOT NULL DEFAULT '59',
        band TEXT NOT NULL DEFAULT '',
        mode TEXT NOT NULL DEFAULT '',
        frequency TEXT NOT NULL DEFAULT '',
        power TEXT NOT NULL DEFAULT '',
        my_grid TEXT NOT NULL DEFAULT '',
        their_grid TEXT NOT NULL DEFAULT '',
        my_park TEXT NOT NULL DEFAULT '',
        their_park TEXT NOT NULL DEFAULT '',
        my_summit TEXT NOT NULL DEFAULT '',
        their_summit TEXT NOT NULL DEFAULT '',
        name TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        distance TEXT NOT NULL DEFAULT '',
        bearing TEXT NOT NULL DEFAULT '',
        FOREIGN KEY (logbook_id) REFERENCES logbooks(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_qsos_logbook ON qsos(logbook_id, datetime DESC);
    CREATE INDEX IF NOT EXISTS idx_qsos_callsign ON qsos(callsign);

    CREATE TABLE IF NOT EXISTS reference_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ref_type TEXT NOT NULL,
        data_json TEXT NOT NULL DEFAULT '[]',
        last_updated TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS app_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL DEFAULT ''
    );
    "#,
    // V1 seed: built-in templates
    r#"
    INSERT OR IGNORE INTO templates (id, name, json_definition, is_builtin) VALUES
    (1, 'General', '{
        "fields": [
            {"id": "callsign", "label": "Callsign", "type": "text", "required": true, "persistent": false},
            {"id": "rst_sent", "label": "RST Sent", "type": "text", "required": false, "persistent": false, "default": "59"},
            {"id": "rst_recv", "label": "RST Recv", "type": "text", "required": false, "persistent": false, "default": "59"},
            {"id": "band", "label": "Band", "type": "dropdown", "required": true, "persistent": true, "options": ["160m","80m","60m","40m","30m","20m","17m","15m","12m","10m","6m","2m","70cm"]},
            {"id": "mode", "label": "Mode", "type": "dropdown", "required": true, "persistent": true, "options": ["SSB","CW","FT8","FT4","FM","AM","RTTY","PSK31","JS8","DSTAR","DMR","C4FM"]},
            {"id": "frequency", "label": "Frequency", "type": "text", "required": false, "persistent": true},
            {"id": "power", "label": "Power (W)", "type": "text", "required": false, "persistent": true},
            {"id": "name", "label": "Name", "type": "text", "required": false, "persistent": false},
            {"id": "their_grid", "label": "Their Grid", "type": "text", "required": false, "persistent": false},
            {"id": "notes", "label": "Notes", "type": "text", "required": false, "persistent": false}
        ]
    }', 1),
    (2, 'POTA Activation', '{
        "fields": [
            {"id": "callsign", "label": "Callsign", "type": "text", "required": true, "persistent": false},
            {"id": "rst_sent", "label": "RST Sent", "type": "text", "required": false, "persistent": false, "default": "59"},
            {"id": "rst_recv", "label": "RST Recv", "type": "text", "required": false, "persistent": false, "default": "59"},
            {"id": "band", "label": "Band", "type": "dropdown", "required": true, "persistent": true, "options": ["160m","80m","60m","40m","30m","20m","17m","15m","12m","10m","6m","2m","70cm"]},
            {"id": "mode", "label": "Mode", "type": "dropdown", "required": true, "persistent": true, "options": ["SSB","CW","FT8","FT4","FM","AM","RTTY","PSK31","JS8","DSTAR","DMR","C4FM"]},
            {"id": "frequency", "label": "Frequency", "type": "text", "required": false, "persistent": true},
            {"id": "power", "label": "Power (W)", "type": "text", "required": false, "persistent": true},
            {"id": "my_park", "label": "My Park", "type": "lookup", "required": true, "persistent": true, "lookup": "pota"},
            {"id": "their_park", "label": "Their Park", "type": "lookup", "required": false, "persistent": false, "lookup": "pota"},
            {"id": "name", "label": "Name", "type": "text", "required": false, "persistent": false},
            {"id": "their_grid", "label": "Their Grid", "type": "text", "required": false, "persistent": false},
            {"id": "notes", "label": "Notes", "type": "text", "required": false, "persistent": false}
        ]
    }', 1),
    (3, 'SOTA Activation', '{
        "fields": [
            {"id": "callsign", "label": "Callsign", "type": "text", "required": true, "persistent": false},
            {"id": "rst_sent", "label": "RST Sent", "type": "text", "required": false, "persistent": false, "default": "59"},
            {"id": "rst_recv", "label": "RST Recv", "type": "text", "required": false, "persistent": false, "default": "59"},
            {"id": "band", "label": "Band", "type": "dropdown", "required": true, "persistent": true, "options": ["160m","80m","60m","40m","30m","20m","17m","15m","12m","10m","6m","2m","70cm"]},
            {"id": "mode", "label": "Mode", "type": "dropdown", "required": true, "persistent": true, "options": ["SSB","CW","FT8","FT4","FM","AM","RTTY","PSK31","JS8","DSTAR","DMR","C4FM"]},
            {"id": "frequency", "label": "Frequency", "type": "text", "required": false, "persistent": true},
            {"id": "power", "label": "Power (W)", "type": "text", "required": false, "persistent": true},
            {"id": "my_summit", "label": "My Summit", "type": "lookup", "required": true, "persistent": true, "lookup": "sota"},
            {"id": "their_summit", "label": "Their Summit", "type": "lookup", "required": false, "persistent": false, "lookup": "sota"},
            {"id": "name", "label": "Name", "type": "text", "required": false, "persistent": false},
            {"id": "their_grid", "label": "Their Grid", "type": "text", "required": false, "persistent": false},
            {"id": "notes", "label": "Notes", "type": "text", "required": false, "persistent": false}
        ]
    }', 1);

    INSERT OR IGNORE INTO app_state (key, value) VALUES ('theme', 'system');
    INSERT OR IGNORE INTO app_state (key, value) VALUES ('active_profile_id', '');
    INSERT OR IGNORE INTO app_state (key, value) VALUES ('active_logbook_id', '');
    "#,
    // V2: Migrate QSOs to data_json schema + update template definitions with category
    r#"
    CREATE TABLE qsos_v2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        logbook_id INTEGER NOT NULL,
        datetime TEXT NOT NULL DEFAULT (datetime('now')),
        data_json TEXT NOT NULL DEFAULT '{}',
        FOREIGN KEY (logbook_id) REFERENCES logbooks(id) ON DELETE CASCADE
    );

    INSERT INTO qsos_v2 (id, logbook_id, datetime, data_json)
    SELECT id, logbook_id, datetime,
        json_object(
            'callsign', callsign,
            'rst_sent', rst_sent,
            'rst_recv', rst_recv,
            'band', band,
            'mode', mode,
            'frequency', frequency,
            'power', power,
            'my_grid', my_grid,
            'their_grid', their_grid,
            'my_park', my_park,
            'their_park', their_park,
            'my_summit', my_summit,
            'their_summit', their_summit,
            'name', name,
            'notes', notes
        )
    FROM qsos;

    DROP TABLE qsos;
    ALTER TABLE qsos_v2 RENAME TO qsos;

    CREATE INDEX idx_qsos_logbook_v2 ON qsos(logbook_id, datetime DESC);

    UPDATE templates SET json_definition = '{
        "fields": [
            {"id": "callsign", "label": "Callsign", "type": "text", "category": "qso", "required": true, "persistent": false, "show_in_table": true},
            {"id": "rst_sent", "label": "RST Sent", "type": "text", "category": "qso", "required": false, "persistent": false, "default": "59", "show_in_table": true},
            {"id": "rst_recv", "label": "RST Recv", "type": "text", "category": "qso", "required": false, "persistent": false, "default": "59", "show_in_table": true},
            {"id": "band", "label": "Band", "type": "dropdown", "category": "station", "required": true, "persistent": true, "options": ["160m","80m","60m","40m","30m","20m","17m","15m","12m","10m","6m","2m","70cm"], "show_in_table": true},
            {"id": "mode", "label": "Mode", "type": "dropdown", "category": "station", "required": true, "persistent": true, "options": ["SSB","CW","FT8","FT4","FM","AM","RTTY","PSK31","JS8","DSTAR","DMR","C4FM"], "show_in_table": true},
            {"id": "frequency", "label": "Frequency", "type": "text", "category": "station", "required": false, "persistent": true, "show_in_table": true},
            {"id": "power", "label": "Power (W)", "type": "text", "category": "station", "required": false, "persistent": true, "show_in_table": false},
            {"id": "my_grid", "label": "My Grid", "type": "text", "category": "station", "required": false, "persistent": true, "show_in_table": false},
            {"id": "name", "label": "Name", "type": "text", "category": "qso", "required": false, "persistent": false, "show_in_table": true},
            {"id": "their_grid", "label": "Their Grid", "type": "text", "category": "qso", "required": false, "persistent": false, "show_in_table": true},
            {"id": "notes", "label": "Notes", "type": "text", "category": "qso", "required": false, "persistent": false, "show_in_table": true}
        ]
    }' WHERE id = 1;

    UPDATE templates SET json_definition = '{
        "fields": [
            {"id": "callsign", "label": "Callsign", "type": "text", "category": "qso", "required": true, "persistent": false, "show_in_table": true},
            {"id": "rst_sent", "label": "RST Sent", "type": "text", "category": "qso", "required": false, "persistent": false, "default": "59", "show_in_table": true},
            {"id": "rst_recv", "label": "RST Recv", "type": "text", "category": "qso", "required": false, "persistent": false, "default": "59", "show_in_table": true},
            {"id": "band", "label": "Band", "type": "dropdown", "category": "station", "required": true, "persistent": true, "options": ["160m","80m","60m","40m","30m","20m","17m","15m","12m","10m","6m","2m","70cm"], "show_in_table": true},
            {"id": "mode", "label": "Mode", "type": "dropdown", "category": "station", "required": true, "persistent": true, "options": ["SSB","CW","FT8","FT4","FM","AM","RTTY","PSK31","JS8","DSTAR","DMR","C4FM"], "show_in_table": true},
            {"id": "frequency", "label": "Frequency", "type": "text", "category": "station", "required": false, "persistent": true, "show_in_table": true},
            {"id": "power", "label": "Power (W)", "type": "text", "category": "station", "required": false, "persistent": true, "show_in_table": false},
            {"id": "my_grid", "label": "My Grid", "type": "text", "category": "station", "required": false, "persistent": true, "show_in_table": false},
            {"id": "my_park", "label": "My Park", "type": "lookup", "category": "station", "required": true, "persistent": true, "lookup": "pota", "show_in_table": false},
            {"id": "their_park", "label": "Their Park", "type": "lookup", "category": "qso", "required": false, "persistent": false, "lookup": "pota", "show_in_table": true},
            {"id": "name", "label": "Name", "type": "text", "category": "qso", "required": false, "persistent": false, "show_in_table": true},
            {"id": "their_grid", "label": "Their Grid", "type": "text", "category": "qso", "required": false, "persistent": false, "show_in_table": true},
            {"id": "notes", "label": "Notes", "type": "text", "category": "qso", "required": false, "persistent": false, "show_in_table": true}
        ]
    }' WHERE id = 2;

    UPDATE templates SET json_definition = '{
        "fields": [
            {"id": "callsign", "label": "Callsign", "type": "text", "category": "qso", "required": true, "persistent": false, "show_in_table": true},
            {"id": "rst_sent", "label": "RST Sent", "type": "text", "category": "qso", "required": false, "persistent": false, "default": "59", "show_in_table": true},
            {"id": "rst_recv", "label": "RST Recv", "type": "text", "category": "qso", "required": false, "persistent": false, "default": "59", "show_in_table": true},
            {"id": "band", "label": "Band", "type": "dropdown", "category": "station", "required": true, "persistent": true, "options": ["160m","80m","60m","40m","30m","20m","17m","15m","12m","10m","6m","2m","70cm"], "show_in_table": true},
            {"id": "mode", "label": "Mode", "type": "dropdown", "category": "station", "required": true, "persistent": true, "options": ["SSB","CW","FT8","FT4","FM","AM","RTTY","PSK31","JS8","DSTAR","DMR","C4FM"], "show_in_table": true},
            {"id": "frequency", "label": "Frequency", "type": "text", "category": "station", "required": false, "persistent": true, "show_in_table": true},
            {"id": "power", "label": "Power (W)", "type": "text", "category": "station", "required": false, "persistent": true, "show_in_table": false},
            {"id": "my_grid", "label": "My Grid", "type": "text", "category": "station", "required": false, "persistent": true, "show_in_table": false},
            {"id": "my_summit", "label": "My Summit", "type": "lookup", "category": "station", "required": true, "persistent": true, "lookup": "sota", "show_in_table": false},
            {"id": "their_summit", "label": "Their Summit", "type": "lookup", "category": "qso", "required": false, "persistent": false, "lookup": "sota", "show_in_table": true},
            {"id": "name", "label": "Name", "type": "text", "category": "qso", "required": false, "persistent": false, "show_in_table": true},
            {"id": "their_grid", "label": "Their Grid", "type": "text", "category": "qso", "required": false, "persistent": false, "show_in_table": true},
            {"id": "notes", "label": "Notes", "type": "text", "category": "qso", "required": false, "persistent": false, "show_in_table": true}
        ]
    }' WHERE id = 3;
    "#,
    // V3: Proper POTA/SOTA tables for offline sync
    r#"
    CREATE TABLE IF NOT EXISTS pota_parks (
        reference TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        latitude REAL,
        longitude REAL,
        grid TEXT NOT NULL DEFAULT '',
        location_desc TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS sota_summits (
        summit_code TEXT PRIMARY KEY,
        association_name TEXT NOT NULL DEFAULT '',
        region_name TEXT NOT NULL DEFAULT '',
        summit_name TEXT NOT NULL DEFAULT '',
        alt_m INTEGER NOT NULL DEFAULT 0,
        alt_ft INTEGER NOT NULL DEFAULT 0,
        longitude REAL,
        latitude REAL,
        points INTEGER NOT NULL DEFAULT 0,
        bonus_points INTEGER NOT NULL DEFAULT 0,
        valid_from TEXT NOT NULL DEFAULT '',
        valid_to TEXT NOT NULL DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS idx_pota_parks_name ON pota_parks(name);
    CREATE INDEX IF NOT EXISTS idx_pota_parks_location ON pota_parks(location_desc);
    CREATE INDEX IF NOT EXISTS idx_sota_summits_name ON sota_summits(summit_name);
    CREATE INDEX IF NOT EXISTS idx_sota_summits_association ON sota_summits(association_name);

    INSERT OR IGNORE INTO app_state (key, value) VALUES ('pota_last_synced', '');
    INSERT OR IGNORE INTO app_state (key, value) VALUES ('sota_last_synced', '');
    INSERT OR IGNORE INTO app_state (key, value) VALUES ('pota_park_count', '0');
    INSERT OR IGNORE INTO app_state (key, value) VALUES ('sota_summit_count', '0');

    -- Clean up old reference_data blobs
    DELETE FROM reference_data WHERE ref_type IN ('POTA', 'SOTA');
    "#,
];

pub fn run_migrations(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL DEFAULT 0);",
    )?;

    let current_version: i32 = conn
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_version",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    for (i, migration) in MIGRATIONS.iter().enumerate() {
        let version = (i + 1) as i32;
        if version > current_version {
            conn.execute_batch(migration)?;
            conn.execute(
                "INSERT INTO schema_version (version) VALUES (?1)",
                [version],
            )?;
        }
    }

    Ok(())
}
