use crate::external::hamdb;
use crate::models::CallsignInfo;

#[tauri::command]
pub async fn lookup_callsign(callsign: String) -> Result<Option<CallsignInfo>, String> {
    let callsign = callsign.trim().to_uppercase();
    if callsign.is_empty() || callsign.len() < 3 {
        return Ok(None);
    }
    Ok(hamdb::lookup(&callsign).await)
}
