use crate::db::DbState;
use crate::models::Qso;
use tauri::State;

const FIELD_TO_ADIF: &[(&str, &str)] = &[
	("callsign", "CALL"),
	("rst_sent", "RST_SENT"),
	("rst_recv", "RST_RCVD"),
	("band", "BAND"),
	("mode", "MODE"),
	("frequency", "FREQ"),
	("power", "TX_PWR"),
	("my_grid", "MY_GRIDSQUARE"),
	("their_grid", "GRIDSQUARE"),
	("my_park", "MY_POTA_REF"),
	("their_park", "POTA_REF"),
	("my_summit", "MY_SOTA_REF"),
	("their_summit", "SOTA_REF"),
	("name", "NAME"),
	("notes", "COMMENT"),
];

const ADIF_TO_FIELD: &[(&str, &str)] = &[
	("CALL", "callsign"),
	("RST_SENT", "rst_sent"),
	("RST_RCVD", "rst_recv"),
	("BAND", "band"),
	("MODE", "mode"),
	("FREQ", "frequency"),
	("TX_PWR", "power"),
	("MY_GRIDSQUARE", "my_grid"),
	("GRIDSQUARE", "their_grid"),
	("MY_POTA_REF", "my_park"),
	("POTA_REF", "their_park"),
	("MY_SOTA_REF", "my_summit"),
	("SOTA_REF", "their_summit"),
	("NAME", "name"),
	("COMMENT", "notes"),
];

fn adif_field(tag: &str, value: &str) -> String {
	if value.is_empty() {
		return String::new();
	}
	format!("<{}:{}>{}", tag, value.len(), value)
}

fn qso_to_adif(qso: &Qso) -> String {
	let data: serde_json::Value = serde_json::from_str(&qso.data_json)
		.unwrap_or(serde_json::Value::Object(Default::default()));
	let mut record = String::new();

	// Date/time from qso.datetime
	let date = qso.datetime.get(..10).unwrap_or("").replace('-', "");
	let time = qso.datetime.get(11..19).unwrap_or("").replace(':', "");
	record.push_str(&adif_field("QSO_DATE", &date));
	record.push_str(&adif_field("TIME_ON", &time));

	// Map fields from data_json
	for (field_id, adif_tag) in FIELD_TO_ADIF {
		let value = data.get(*field_id).and_then(|v| v.as_str()).unwrap_or("");
		record.push_str(&adif_field(adif_tag, value));
	}

	record.push_str("<EOR>\n");
	record
}

#[tauri::command]
pub fn export_adif(db: State<DbState>, logbook_id: i64, path: String) -> Result<u64, String> {
	let conn = db.0.lock().map_err(|e| e.to_string())?;
	let mut stmt = conn
		.prepare(
			"SELECT id, logbook_id, datetime, data_json
             FROM qsos WHERE logbook_id=?1 ORDER BY datetime ASC",
		)
		.map_err(|e| e.to_string())?;
	let qsos: Vec<Qso> = stmt
		.query_map([logbook_id], |row| {
			Ok(Qso {
				id: row.get(0)?,
				logbook_id: row.get(1)?,
				datetime: row.get(2)?,
				data_json: row.get(3)?,
			})
		})
		.map_err(|e| e.to_string())?
		.collect::<Result<Vec<_>, _>>()
		.map_err(|e| e.to_string())?;

	let mut adif = String::new();
	adif.push_str("LogRS ADIF Export\n");
	adif.push_str(&adif_field("ADIF_VER", "3.1.4"));
	adif.push_str(&adif_field("PROGRAMID", "LogRS"));
	adif.push_str(&adif_field("PROGRAMVERSION", "0.1.0"));
	adif.push_str("\n<EOH>\n\n");

	let count = qsos.len() as u64;
	for qso in &qsos {
		adif.push_str(&qso_to_adif(qso));
	}

	std::fs::write(&path, adif).map_err(|e| e.to_string())?;
	Ok(count)
}

#[tauri::command]
pub fn import_adif(db: State<DbState>, logbook_id: i64, path: String) -> Result<u64, String> {
	let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
	let conn = db.0.lock().map_err(|e| e.to_string())?;

	// Find end of header
	let body = if let Some(pos) = content.to_uppercase().find("<EOH>") {
		&content[pos + 5..]
	} else {
		&content
	};

	let mut count: u64 = 0;
	let records: Vec<&str> = body.split("<EOR>").collect();
	let records_alt: Vec<&str> = body.split("<eor>").collect();
	let records = if records.len() > records_alt.len() {
		records
	} else {
		records_alt
	};

	for record in records {
		let record = record.trim();
		if record.is_empty() {
			continue;
		}

		let adif_fields = parse_adif_record(record);
		let callsign = adif_fields.get("CALL").cloned().unwrap_or_default();
		if callsign.is_empty() {
			continue;
		}

		// Build datetime
		let date = adif_fields.get("QSO_DATE").cloned().unwrap_or_default();
		let time = adif_fields.get("TIME_ON").cloned().unwrap_or_default();
		let datetime = if date.len() >= 8 {
			let d = format!("{}-{}-{}", &date[..4], &date[4..6], &date[6..8]);
			if time.len() >= 6 {
				format!("{} {}:{}:{}", d, &time[..2], &time[2..4], &time[4..6])
			} else if time.len() >= 4 {
				format!("{} {}:{}:00", d, &time[..2], &time[2..4])
			} else {
				format!("{} 00:00:00", d)
			}
		} else {
			chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string()
		};

		// Build data_json from ADIF fields mapped to internal field IDs
		let mut data = serde_json::Map::new();
		for (adif_tag, field_id) in ADIF_TO_FIELD {
			if let Some(value) = adif_fields.get(*adif_tag) {
				if !value.is_empty() {
					data.insert(
						field_id.to_string(),
						serde_json::Value::String(value.clone()),
					);
				}
			}
		}
		// Ensure defaults for RST fields
		data.entry("rst_sent".to_string())
			.or_insert_with(|| serde_json::Value::String("59".to_string()));
		data.entry("rst_recv".to_string())
			.or_insert_with(|| serde_json::Value::String("59".to_string()));

		let data_json =
			serde_json::to_string(&serde_json::Value::Object(data)).map_err(|e| e.to_string())?;

		conn.execute(
			"INSERT INTO qsos (logbook_id, datetime, data_json) VALUES (?1, ?2, ?3)",
			rusqlite::params![logbook_id, datetime, data_json],
		)
		.map_err(|e| e.to_string())?;
		count += 1;
	}

	Ok(count)
}

fn parse_adif_record(record: &str) -> std::collections::HashMap<String, String> {
	let mut fields = std::collections::HashMap::new();
	let mut pos = 0;
	let bytes = record.as_bytes();

	while pos < bytes.len() {
		match bytes[pos..].iter().position(|&b| b == b'<') {
			Some(offset) => pos += offset + 1,
			None => break,
		}

		let tag_end = match bytes[pos..].iter().position(|&b| b == b'>') {
			Some(offset) => pos + offset,
			None => break,
		};

		let tag_content = &record[pos..tag_end];
		pos = tag_end + 1;

		let parts: Vec<&str> = tag_content.split(':').collect();
		if parts.len() < 2 {
			continue;
		}
		let tag_name = parts[0].to_uppercase();
		let len: usize = match parts[1].parse() {
			Ok(l) => l,
			Err(_) => continue,
		};

		if pos + len <= record.len() {
			let value = record[pos..pos + len].to_string();
			fields.insert(tag_name, value);
			pos += len;
		}
	}

	fields
}
