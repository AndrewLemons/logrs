use crate::models::CallsignInfo;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct HamDbResponse {
    hamdb: HamDbWrapper,
}

#[derive(Debug, Deserialize)]
struct HamDbWrapper {
    callsign: Option<HamDbCallsign>,
}

#[derive(Debug, Deserialize)]
struct HamDbCallsign {
    call: Option<String>,
    fname: Option<String>,
    name: Option<String>,
    grid: Option<String>,
    addr1: Option<String>,
    addr2: Option<String>,
    state: Option<String>,
    country: Option<String>,
}

pub async fn lookup(callsign: &str) -> Option<CallsignInfo> {
    let url = format!("https://api.hamdb.org/v1/{}/json/logrs", callsign);
    let resp = reqwest::get(&url).await.ok()?;
    let data: HamDbResponse = resp.json().await.ok()?;
    let cs = data.hamdb.callsign?;

    // HamDB returns "NOT_FOUND" in the call field when not found
    let call = cs.call.unwrap_or_default();
    if call.is_empty() || call == "NOT_FOUND" {
        return None;
    }

    let fname = cs.fname.unwrap_or_default();
    let lname = cs.name.unwrap_or_default();
    let full_name = if fname.is_empty() {
        lname
    } else if lname.is_empty() {
        fname
    } else {
        format!("{} {}", fname, lname)
    };

    Some(CallsignInfo {
        callsign: call,
        name: full_name,
        grid: cs.grid.unwrap_or_default(),
        city: cs.addr2.unwrap_or_default(),
        state: cs.state.unwrap_or_default(),
        country: cs.country.unwrap_or_default(),
        cq_zone: String::new(),
        itu_zone: String::new(),
        county: String::new(),
    })
}
