use axum::extract::State;
use axum::response::{IntoResponse, Json, Response};
use serde_json::json;
use std::fs::{self, OpenOptions};
use std::io::Write;
use crate::browser::launch_best_browser;
use crate::state::AppState;

pub async fn send_feedback_handler(
    State(state): State<AppState>,
    body: String,
) -> Response {
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
    let entry = format!("\r\n[{}]\r\n{}\r\n----------------------------------\r\n", now, body);

    let log_path = state.base_dir.join("Feedback_Archiv.txt");
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(log_path) {
        let _ = f.write_all(entry.as_bytes());
    }

    // Async forward to formsubmit.co
    let client = state.http_client.clone();
    let body_clone = body.clone();
    tokio::spawn(async move {
        let _ = client.post("https://formsubmit.co/ajax/lauju1909@gmail.com")
            .header("Content-Type", "application/json")
            .header("User-Agent", "StundenplanLWL-Feedback/Rust")
            .body(body_clone)
            .send()
            .await;
    });

    Json(json!({
        "status": "success",
        "message": "Feedback erfolgreich gespeichert und übertragen."
    })).into_response()
}

pub async fn feedback_archive_handler(
    State(state): State<AppState>,
) -> Response {
    let log_path = state.base_dir.join("Feedback_Archiv.txt");
    let content = fs::read_to_string(log_path).unwrap_or_default();
    Json(json!({
        "content": content
    })).into_response()
}

pub async fn feedback_archive_clear_handler(
    State(state): State<AppState>,
) -> Response {
    let log_path = state.base_dir.join("Feedback_Archiv.txt");
    let _ = fs::write(log_path, "");
    Json(json!({
        "status": "cleared"
    })).into_response()
}

pub async fn open_feedback_zentrale_handler(
    State(state): State<AppState>,
) -> Response {
    let exe_path = state.base_dir.join("Feedback_Zentrale.exe");
    if exe_path.is_file() {
        let _ = std::process::Command::new(exe_path).spawn();
    } else {
        let html_path = state.base_dir.join("Feedback_Inbox.html");
        if html_path.is_file() {
            let file_url = format!("file:///{}", html_path.to_string_lossy().replace('\\', "/"));
            launch_best_browser(&file_url);
        }
    }
    Json(json!({"status": "launched"})).into_response()
}
