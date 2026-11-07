use axum::body::Bytes;
use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Json, Response};
use serde::Deserialize;
use serde_json::json;
use std::fs;
use crate::state::AppState;

pub async fn ping_handler() -> Response {
    Json(json!({"status": "ok"})).into_response()
}

pub async fn client_log_handler(
    State(state): State<AppState>,
    body: String,
) -> Response {
    state.log_untis(&format!("[CLIENT-JS] {}", body));
    Json(json!({"logged": true})).into_response()
}

#[derive(Deserialize, Default)]
pub struct NotifyParams {
    pub title: Option<String>,
    pub msg: Option<String>,
    pub message: Option<String>,
}

pub async fn notify_handler(
    State(state): State<AppState>,
    Query(params): Query<NotifyParams>,
    body: Bytes,
) -> Response {
    let mut title = params.title.unwrap_or_else(|| "Barrierefreies WebUntis".into());
    let mut msg = params.msg.or(params.message).unwrap_or_default();

    if !body.is_empty() {
        if let Ok(val) = serde_json::from_slice::<serde_json::Value>(&body) {
            if let Some(t) = val.get("title").and_then(|v| v.as_str()) {
                title = t.to_string();
            }
            if let Some(m) = val.get("message").or_else(|| val.get("msg")).and_then(|v| v.as_str()) {
                msg = m.to_string();
            }
        }
    }

    state.log_untis(&format!("API /api/notify: title='{}', msg='{}'", title, msg));

    Json(json!({"success": true})).into_response()
}

pub async fn window_closing_handler(
    State(state): State<AppState>,
) -> Response {
    state.log_untis("API /api/window_closing received (standby mode, server keeps running)");
    Json(json!({"status": "ok"})).into_response()
}

#[derive(Deserialize, Default)]
pub struct ShutdownParams {
    pub confirmed: Option<String>,
}

pub async fn shutdown_handler(
    State(state): State<AppState>,
    Query(params): Query<ShutdownParams>,
) -> Response {
    if params.confirmed.as_deref() == Some("true") {
        state.log_untis("API /api/shutdown?confirmed=true received, exiting gracefully");
        let tx = state.shutdown_tx.clone();
        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(300)).await;
            let _ = tx.send(());
        });
        Json(json!({"status": "shutting_down"})).into_response()
    } else {
        Json(json!({"status": "ignored"})).into_response()
    }
}

pub async fn version_handler(
    State(state): State<AppState>,
) -> Response {
    let v_path = state.base_dir.join("version.json");
    if let Ok(content) = fs::read_to_string(&v_path) {
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
            return Json(val).into_response();
        }
    }
    let ver = state.get_local_version();
    Json(json!({
        "version": ver,
        "name": "Barrierefreies WebUntis"
    })).into_response()
}

pub async fn update_check_handler(
    State(state): State<AppState>,
) -> Response {
    let cur_ver = state.get_local_version();
    Json(json!({
        "updated": false,
        "currentVersion": cur_ver
    })).into_response()
}

#[derive(Deserialize)]
pub struct OpenUrlParams {
    pub url: String,
}

pub async fn open_url_handler(
    State(state): State<AppState>,
    Query(params): Query<OpenUrlParams>,
) -> Response {
    let url = params.url;
    if url.starts_with("http://") || url.starts_with("https://") {
        state.log_untis(&format!("Opening external URL: {}", url));
        let _ = open::that(&url);
    }
    Json(json!({"status": "opened"})).into_response()
}

pub async fn debug_log_handler(
    State(state): State<AppState>,
) -> Response {
    let p1 = state.base_dir.join("webuntis_debug.log");
    let content = fs::read_to_string(p1).unwrap_or_else(|_| "Kein Log vorhanden.".into());
    (
        StatusCode::OK,
        [("content-type", "text/plain; charset=utf-8")],
        content,
    ).into_response()
}
