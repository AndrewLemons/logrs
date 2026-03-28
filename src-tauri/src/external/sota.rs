pub async fn fetch_summits_csv() -> Result<String, String> {
    let resp = reqwest::get("https://storage.sota.org.uk/summitslist.csv")
        .await
        .map_err(|e| format!("Failed to fetch SOTA summits: {}", e))?;
    resp.text()
        .await
        .map_err(|e| format!("Failed to read SOTA response: {}", e))
}
