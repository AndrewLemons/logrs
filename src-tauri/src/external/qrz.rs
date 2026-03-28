use crate::models::CallsignInfo;
use serde::Deserialize;
use std::sync::Mutex;

/// QRZ XML API session key cache.
/// The session key is valid until QRZ expires it (typically ~24h).
static SESSION_KEY: Mutex<Option<String>> = Mutex::new(None);

// ── XML response types ─────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename = "QRZDatabase")]
struct QrzDatabase {
    #[serde(rename = "Session")]
    session: Option<QrzSession>,
    #[serde(rename = "Callsign")]
    callsign: Option<QrzCallsign>,
}

#[derive(Debug, Deserialize)]
struct QrzSession {
    #[serde(rename = "Key")]
    key: Option<String>,
    #[serde(rename = "Error")]
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct QrzCallsign {
    pub call: Option<String>,
    pub fname: Option<String>,
    pub name: Option<String>,
    pub grid: Option<String>,
    pub addr2: Option<String>,  // city
    pub state: Option<String>,
    pub country: Option<String>,
    pub cqzone: Option<String>,
    pub ituzone: Option<String>,
    pub county: Option<String>,
}

// ── Internal helpers ───────────────────────────────────────────────

fn parse_xml(body: &str) -> Option<QrzDatabase> {
    quick_xml::de::from_str(body).ok()
}

/// Obtain a fresh session key from QRZ using username/password.
async fn login(username: &str, password: &str) -> Result<String, String> {
    let url = format!(
        "https://xmldata.qrz.com/xml/current/?username={}&password={}&agent=logrs-0.1",
        urlencoding::encode(username),
        urlencoding::encode(password),
    );
    let resp = reqwest::get(&url)
        .await
        .map_err(|e| format!("QRZ login request failed: {}", e))?;
    let body = resp
        .text()
        .await
        .map_err(|e| format!("QRZ login response read error: {}", e))?;

    let db = parse_xml(&body).ok_or_else(|| "Failed to parse QRZ login response".to_string())?;
    let session = db.session.ok_or("No session in QRZ response")?;

    if let Some(err) = session.error {
        return Err(format!("QRZ login error: {}", err));
    }

    session
        .key
        .filter(|k| !k.is_empty())
        .ok_or_else(|| "No session key in QRZ response".to_string())
}

/// Get a cached session key or login to obtain a new one.
async fn get_session_key(username: &str, password: &str) -> Result<String, String> {
    // Check cache first
    {
        let guard = SESSION_KEY.lock().unwrap();
        if let Some(ref key) = *guard {
            return Ok(key.clone());
        }
    }

    // Login for a new key
    let key = login(username, password).await?;
    {
        let mut guard = SESSION_KEY.lock().unwrap();
        *guard = Some(key.clone());
    }
    Ok(key)
}

/// Clear the cached session key (e.g. on auth failure or credential change).
pub fn clear_session() {
    let mut guard = SESSION_KEY.lock().unwrap();
    *guard = None;
}

// ── Public API ─────────────────────────────────────────────────────

/// Look up a callsign via QRZ XML API.
/// Returns None if the callsign is not found.
/// Returns Err if credentials are invalid or there's a network error.
pub async fn lookup(
    callsign: &str,
    username: &str,
    password: &str,
) -> Result<Option<CallsignInfo>, String> {
    let key = get_session_key(username, password).await?;

    let url = format!(
        "https://xmldata.qrz.com/xml/current/?s={}&callsign={}",
        urlencoding::encode(&key),
        urlencoding::encode(callsign),
    );
    let resp = reqwest::get(&url)
        .await
        .map_err(|e| format!("QRZ lookup request failed: {}", e))?;
    let body = resp
        .text()
        .await
        .map_err(|e| format!("QRZ lookup response read error: {}", e))?;

    let db = parse_xml(&body).ok_or_else(|| "Failed to parse QRZ response".to_string())?;

    // Check for session expiry — if so, re-login and retry once
    if let Some(ref session) = db.session {
        if let Some(ref err) = session.error {
            if err.contains("Session Timeout") || err.contains("Invalid session key") {
                clear_session();
                let new_key = get_session_key(username, password).await?;
                let retry_url = format!(
                    "https://xmldata.qrz.com/xml/current/?s={}&callsign={}",
                    urlencoding::encode(&new_key),
                    urlencoding::encode(callsign),
                );
                let retry_resp = reqwest::get(&retry_url)
                    .await
                    .map_err(|e| format!("QRZ retry request failed: {}", e))?;
                let retry_body = retry_resp
                    .text()
                    .await
                    .map_err(|e| format!("QRZ retry response read error: {}", e))?;
                let retry_db = parse_xml(&retry_body)
                    .ok_or_else(|| "Failed to parse QRZ retry response".to_string())?;
                return Ok(map_callsign(retry_db.callsign));
            }
            // "Not found" is not an error — just no result
            if err.contains("not found") || err.contains("Not found") {
                return Ok(None);
            }
        }
    }

    Ok(map_callsign(db.callsign))
}

fn map_callsign(cs: Option<QrzCallsign>) -> Option<CallsignInfo> {
    let cs = cs?;
    let call = cs.call.unwrap_or_default();
    if call.is_empty() {
        return None;
    }

    let fname = cs.fname.unwrap_or_default();
    let lname = cs.name.unwrap_or_default();
    let full_name = match (fname.is_empty(), lname.is_empty()) {
        (true, _) => lname,
        (_, true) => fname,
        _ => format!("{} {}", fname, lname),
    };

    Some(CallsignInfo {
        callsign: call,
        name: full_name,
        grid: cs.grid.unwrap_or_default(),
        city: cs.addr2.unwrap_or_default(),
        state: cs.state.unwrap_or_default(),
        country: cs.country.unwrap_or_default(),
        cq_zone: cs.cqzone.unwrap_or_default(),
        itu_zone: cs.ituzone.unwrap_or_default(),
        county: cs.county.unwrap_or_default(),
    })
}

/// Test QRZ credentials by attempting login.
/// Returns Ok(()) on success, Err(message) on failure.
pub async fn test_credentials(username: &str, password: &str) -> Result<(), String> {
    clear_session();
    let _key = login(username, password).await?;
    Ok(())
}
