use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Profile {
    pub id: i64,
    pub callsign: String,
    pub name: String,
    pub grid: String,
    pub default_power: String,
    pub default_band: String,
    pub default_mode: String,
    pub default_park: String,
    pub default_summit: String,
    pub station_description: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateProfile {
    pub callsign: String,
    pub name: String,
    pub grid: String,
    pub default_power: String,
    pub default_band: String,
    pub default_mode: String,
    pub default_park: String,
    pub default_summit: String,
    pub station_description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Logbook {
    pub id: i64,
    pub name: String,
    pub profile_id: i64,
    pub template_id: i64,
    pub created_at: String,
    pub metadata_json: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateLogbook {
    pub name: String,
    pub profile_id: i64,
    pub template_id: i64,
    pub metadata_json: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Qso {
    pub id: i64,
    pub logbook_id: i64,
    pub datetime: String,
    pub data_json: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateQso {
    pub logbook_id: i64,
    pub data_json: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Template {
    pub id: i64,
    pub name: String,
    pub json_definition: String,
    pub is_builtin: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateTemplate {
    pub name: String,
    pub json_definition: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QsoFilter {
    pub logbook_id: i64,
    pub search: Option<String>,
    pub band: Option<String>,
    pub mode: Option<String>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    pub sort_by: Option<String>,
    pub sort_dir: Option<String>,
    pub page: Option<i64>,
    pub per_page: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CallsignInfo {
    pub callsign: String,
    pub name: String,
    pub grid: String,
    pub city: String,
    pub state: String,
    pub country: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PotaPark {
    pub reference: String,
    pub name: String,
    pub latitude: f64,
    pub longitude: f64,
    pub grid: String,
    pub location_desc: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SotaSummit {
    pub summit_code: String,
    pub association_name: String,
    pub region_name: String,
    pub summit_name: String,
    pub alt_m: i32,
    pub alt_ft: i32,
    pub longitude: f64,
    pub latitude: f64,
    pub points: i32,
    pub bonus_points: i32,
    pub valid_from: String,
    pub valid_to: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncStatus {
    pub pota_last_synced: Option<String>,
    pub pota_count: i64,
    pub sota_last_synced: Option<String>,
    pub sota_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QsoPage {
    pub qsos: Vec<Qso>,
    pub total: i64,
    pub page: i64,
    pub per_page: i64,
}
