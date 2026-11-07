use axum::extract::State;
use axum::http::header::{CACHE_CONTROL, CONTENT_TYPE, EXPIRES, PRAGMA};
use axum::http::{HeaderMap, StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use std::fs;
use crate::state::AppState;

const INDEX_HTML: &[u8] = include_bytes!("../../index.html");
const STYLE_CSS: &[u8] = include_bytes!("../../style.css");
const APP_JS: &[u8] = include_bytes!("../../app.js");
const CANTEEN_SEED: &[u8] = include_bytes!("../../canteen_seed.json");
const VERSION_JSON: &[u8] = include_bytes!("../../version.json");
const FEEDBACK_INBOX: &[u8] = include_bytes!("../../Feedback_Inbox.html");

pub async fn static_file_handler(
    State(state): State<AppState>,
    uri: Uri,
) -> Response {
    let raw_path = uri.path();
    let mut clean_path = raw_path.trim_start_matches('/');
    if clean_path.is_empty() {
        clean_path = "index.html";
    }

    // Determine MIME type
    let content_type = match clean_path {
        p if p.ends_with(".css") => "text/css; charset=utf-8",
        p if p.ends_with(".js") => "application/javascript; charset=utf-8",
        p if p.ends_with(".json") => "application/json; charset=utf-8",
        p if p.ends_with(".html") || p.ends_with(".htm") => "text/html; charset=utf-8",
        p if p.ends_with(".png") => "image/png",
        p if p.ends_with(".svg") => "image/svg+xml",
        p if p.ends_with(".ico") => "image/x-icon",
        _ => "text/html; charset=utf-8",
    };

    // 1. Check disk file first (useful for rapid UI development & live edits)
    let disk_file = state.base_dir.join(clean_path);
    if disk_file.is_file() {
        if let Ok(bytes) = fs::read(&disk_file) {
            return build_response(StatusCode::OK, content_type, bytes);
        }
    }

    // 2. Fallback to embedded bytes
    let embedded_bytes = match clean_path {
        "index.html" => Some(INDEX_HTML),
        "style.css" => Some(STYLE_CSS),
        "app.js" => Some(APP_JS),
        "canteen_seed.json" => Some(CANTEEN_SEED),
        "version.json" => Some(VERSION_JSON),
        "Feedback_Inbox.html" => Some(FEEDBACK_INBOX),
        _ => None,
    };

    if let Some(bytes) = embedded_bytes {
        build_response(StatusCode::OK, content_type, bytes.to_vec())
    } else {
        build_response(
            StatusCode::NOT_FOUND,
            "text/plain; charset=utf-8",
            b"404 Not Found".to_vec(),
        )
    }
}

fn build_response(status: StatusCode, content_type: &'static str, body: Vec<u8>) -> Response {
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, content_type.parse().unwrap());
    headers.insert(CACHE_CONTROL, "no-cache, no-store, must-revalidate".parse().unwrap());
    headers.insert(PRAGMA, "no-cache".parse().unwrap());
    headers.insert(EXPIRES, "0".parse().unwrap());
    (status, headers, body).into_response()
}
