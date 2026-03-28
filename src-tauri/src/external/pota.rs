use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct PotaLocation {
    pub prefix: String,
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct PotaParkRaw {
    pub reference: Option<String>,
    pub name: Option<String>,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    pub grid: Option<String>,
    #[serde(alias = "locationDesc")]
    pub location_desc: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PotaSpot {
    pub activator: Option<String>,
    pub reference: Option<String>,
    pub name: Option<String>,
    pub frequency: Option<String>,
    pub mode: Option<String>,
    #[serde(alias = "spotTime")]
    pub spot_time: Option<String>,
    pub grid4: Option<String>,
    pub grid6: Option<String>,
}

pub async fn fetch_locations() -> Result<Vec<PotaLocation>, String> {
    let resp = reqwest::get("https://api.pota.app/programs/locations")
        .await
        .map_err(|e| format!("Failed to fetch POTA locations: {}", e))?;
    resp.json::<Vec<PotaLocation>>()
        .await
        .map_err(|e| format!("Failed to parse POTA locations: {}", e))
}

pub async fn fetch_parks(prefix: &str) -> Result<Vec<PotaParkRaw>, String> {
    let url = format!("https://api.pota.app/program/parks/{}", prefix);
    let resp = reqwest::get(&url)
        .await
        .map_err(|e| format!("Failed to fetch parks for {}: {}", prefix, e))?;
    resp.json::<Vec<PotaParkRaw>>()
        .await
        .map_err(|e| format!("Failed to parse parks for {}: {}", prefix, e))
}

pub async fn fetch_spots() -> Result<Vec<PotaSpot>, String> {
    let resp = reqwest::get("https://api.pota.app/v1/spots")
        .await
        .map_err(|e| format!("Failed to fetch POTA spots: {}", e))?;
    resp.json::<Vec<PotaSpot>>()
        .await
        .map_err(|e| format!("Failed to parse POTA spots: {}", e))
}
