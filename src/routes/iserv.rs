use axum::body::Bytes;
use axum::extract::{Path, State};
use axum::http::HeaderMap;
use axum::response::{IntoResponse, Json as AxumJson, Response};
use regex::Regex;
use serde::Deserialize;
use serde_json::json;
use crate::state::AppState;

#[derive(Deserialize, Default)]
pub struct IServLoginBody {
    pub server: Option<String>,
    pub username: Option<String>,
    pub password: Option<String>,
}

pub async fn iserv_handler(
    State(state): State<AppState>,
    Path(subpath): Path<String>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let subpath = subpath.trim_matches('/');

    // Check credentials from headers if provided
    let srv_hdr = headers.get("x-iserv-server").and_then(|v| v.to_str().ok());
    let user_hdr = headers.get("x-iserv-user").and_then(|v| v.to_str().ok());
    let pass_hdr = headers.get("x-iserv-pass").and_then(|v| v.to_str().ok());

    {
        let mut iserv_guard = state.iserv.write().await;
        if let Some(s) = srv_hdr {
            iserv_guard.host = s.trim().replace("https://", "").replace("http://", "").trim_end_matches('/').into();
        }
        if let Some(u) = user_hdr {
            iserv_guard.user = u.trim().into();
        }
        if let Some(p) = pass_hdr {
            iserv_guard.pass = p.trim().into();
        }
    }

    let parsed_body: Option<IServLoginBody> = serde_json::from_slice(&body).ok();

    match subpath {
        "login" => handle_login(state, parsed_body).await,
        "status" => handle_status(state).await,
        "emails" => handle_emails(state).await,
        "calendar" => handle_calendar(state).await,
        "exercises" | "tasks" => handle_exercises(state).await,
        _ => AxumJson(json!({"success": false, "error": "Unbekannter IServ-Endpunkt"})).into_response(),
    }
}

async fn handle_status(state: AppState) -> Response {
    let iserv_guard = state.iserv.read().await;
    AxumJson(json!({
        "success": true,
        "loggedIn": iserv_guard.logged_in,
        "server": iserv_guard.host,
        "user": iserv_guard.user
    })).into_response()
}

async fn ensure_login(state: &AppState, srv: &str, user: &str, pass: &str) -> Result<(), String> {
    if srv.is_empty() || user.is_empty() || pass.is_empty() {
        return Err("Server, Benutzername und Passwort sind erforderlich.".into());
    }

    let host = srv.trim().replace("https://", "").replace("http://", "").trim_end_matches('/').to_string();
    let login_url = format!("https://{}/iserv/auth/login", host);

    // Initial GET for CSRF / session cookies
    let _ = state.http_client.get(&login_url).send().await;

    // POST credentials
    let params = [("_username", user), ("_password", pass)];
    let resp = state.http_client.post(&login_url)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Verbindungsfehler: {}", e))?;

    let resp_text = resp.text().await.unwrap_or_default();
    if resp_text.contains("Anmeldung fehlgeschlagen") || resp_text.contains("Ungültige Anmeldedaten") {
        let mut iserv_guard = state.iserv.write().await;
        iserv_guard.logged_in = false;
        return Err("Anmeldung fehlgeschlagen! Bitte überprüfe Server, Benutzername und Passwort.".into());
    }

    // Follow /iserv/
    let home_url = format!("https://{}/iserv/", host);
    let _ = state.http_client.get(&home_url).send().await;

    let mut iserv_guard = state.iserv.write().await;
    iserv_guard.host = host;
    iserv_guard.user = user.to_string();
    iserv_guard.pass = pass.to_string();
    iserv_guard.logged_in = true;

    Ok(())
}

async fn handle_login(state: AppState, body: Option<IServLoginBody>) -> Response {
    let iserv_guard = state.iserv.read().await;
    let mut srv = iserv_guard.host.clone();
    let mut user = iserv_guard.user.clone();
    let mut pass = iserv_guard.pass.clone();
    drop(iserv_guard);

    if let Some(b) = body {
        if let Some(s) = b.server.as_deref() { srv = s.into(); }
        if let Some(u) = b.username.as_deref() { user = u.into(); }
        if let Some(p) = b.password.as_deref() { pass = p.into(); }
    }

    match ensure_login(&state, &srv, &user, &pass).await {
        Ok(_) => {
            let iserv_guard = state.iserv.read().await;
            AxumJson(json!({
                "success": true,
                "message": "Erfolgreich mit IServ verbunden",
                "server": iserv_guard.host,
                "user": iserv_guard.user
            })).into_response()
        }
        Err(err) => {
            AxumJson(json!({
                "success": false,
                "error": err
            })).into_response()
        }
    }
}

async fn handle_emails(state: AppState) -> Response {
    let (logged_in, host, user, pass) = {
        let g = state.iserv.read().await;
        (g.logged_in, g.host.clone(), g.user.clone(), g.pass.clone())
    };

    if !logged_in {
        if let Err(e) = ensure_login(&state, &host, &user, &pass).await {
            return AxumJson(json!({"success": false, "error": e})).into_response();
        }
    }

    let url = format!(
        "https://{}/iserv/mail/api/message/list?path=INBOX&length=50&start=0&order%5Bcolumn%5D=date&order%5Bdir%5D=desc",
        host
    );

    match state.http_client.get(&url)
        .header("X-Requested-With", "XMLHttpRequest")
        .header("Referer", format!("https://{}/iserv/mail", host))
        .send()
        .await
    {
        Ok(resp) => {
            let content = resp.text().await.unwrap_or_default();
            let trimmed = content.trim();

            if trimmed.starts_with('{') || trimmed.starts_with('[') {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(trimmed) {
                    return AxumJson(json!({"success": true, "data": val})).into_response();
                }
            }

            let re = Regex::new(r#"(?i)<script[^>]*id=["']php-data["'][^>]*>([\s\S]*?)</script>"#).unwrap();
            if let Some(caps) = re.captures(&content) {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(caps[1].trim()) {
                    return AxumJson(json!({"success": true, "data": val})).into_response();
                }
            }

            AxumJson(json!({"success": true, "data": {"data": []}})).into_response()
        }
        Err(e) => AxumJson(json!({"success": false, "error": e.to_string()})).into_response(),
    }
}

async fn handle_calendar(state: AppState) -> Response {
    let (logged_in, host, user, pass) = {
        let g = state.iserv.read().await;
        (g.logged_in, g.host.clone(), g.user.clone(), g.pass.clone())
    };

    if !logged_in {
        if let Err(e) = ensure_login(&state, &host, &user, &pass).await {
            return AxumJson(json!({"success": false, "error": e})).into_response();
        }
    }

    let url_upcoming = format!("https://{}/iserv/calendar/api/upcoming", host);
    let mut upcoming_val = json!([]);
    if let Ok(resp) = state.http_client.get(&url_upcoming).send().await {
        if let Ok(val) = resp.json::<serde_json::Value>().await {
            upcoming_val = val;
        }
    }

    let now = chrono::Local::now();
    let start_date = (now - chrono::Duration::days(30)).format("%Y-%m-%d").to_string();
    let end_date = (now + chrono::Duration::days(120)).format("%Y-%m-%d").to_string();
    let url_multi = format!(
        "https://{}/iserv/calendar/feed/calendar-multi?start={}&end={}",
        host, start_date, end_date
    );

    let mut events_val = json!([]);
    if let Ok(resp) = state.http_client.get(&url_multi).send().await {
        if let Ok(val) = resp.json::<serde_json::Value>().await {
            events_val = val;
        }
    }

    AxumJson(json!({
        "success": true,
        "upcoming": upcoming_val,
        "events": events_val
    })).into_response()
}

async fn handle_exercises(state: AppState) -> Response {
    let (logged_in, host, user, pass) = {
        let g = state.iserv.read().await;
        (g.logged_in, g.host.clone(), g.user.clone(), g.pass.clone())
    };

    if !logged_in {
        if let Err(e) = ensure_login(&state, &host, &user, &pass).await {
            return AxumJson(json!({"success": false, "error": e})).into_response();
        }
    }

    let url = format!("https://{}/iserv/exercise", host);
    match state.http_client.get(&url).send().await {
        Ok(resp) => {
            let html = resp.text().await.unwrap_or_default();
            let re_php = Regex::new(r#"(?i)<script[^>]*id=["']php-data["'][^>]*>([\s\S]*?)</script>"#).unwrap();
            if let Some(caps) = re_php.captures(&html) {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(caps[1].trim()) {
                    return AxumJson(json!({"success": true, "data": val})).into_response();
                }
            }

            // Fallback table parse
            let re_row = Regex::new(r#"(?i)<tr[^>]*>([\s\S]*?)</tr>"#).unwrap();
            let re_col = Regex::new(r#"(?i)<td[^>]*>([\s\S]*?)</td>"#).unwrap();
            let re_link = Regex::new(r#"href=["']([^"']+)["']"#).unwrap();
            let re_strip = Regex::new(r#"<[^>]+>"#).unwrap();

            let mut list = Vec::new();
            let mut count = 0;
            for row in re_row.captures_iter(&html) {
                let r_text = &row[1];
                if r_text.contains("<th") {
                    continue;
                }
                let cols: Vec<String> = re_col.captures_iter(r_text)
                    .map(|c| re_strip.replace_all(&c[1], " ").trim().to_string())
                    .collect();

                if cols.len() >= 3 {
                    count += 1;
                    let link = re_link.captures(r_text).map(|l| l[1].to_string()).unwrap_or_default();
                    list.push(json!({
                        "id": format!("ex-{}", count),
                        "title": cols.get(0).unwrap_or(&"".into()),
                        "subject": cols.get(1).unwrap_or(&"".into()),
                        "start": cols.get(2).unwrap_or(&"".into()),
                        "end": cols.get(3).unwrap_or(&"".into()),
                        "status": cols.get(4).unwrap_or(&"".into()),
                        "link": link
                    }));
                }
            }

            AxumJson(json!({
                "success": true,
                "exercises": list
            })).into_response()
        }
        Err(e) => AxumJson(json!({"success": false, "error": e.to_string()})).into_response(),
    }
}
