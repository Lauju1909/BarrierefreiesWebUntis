use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::json;
use std::fs;
use crate::state::{dirs_sys_fallback, AppState};

pub async fn get_homework_handler(
    State(state): State<AppState>,
) -> Response {
    let hw_file = state.base_dir.join("custom_homework.json");
    let mut content = String::new();

    if hw_file.is_file() {
        content = fs::read_to_string(&hw_file).unwrap_or_default();
    }
    if content.trim().is_empty() {
        if let Some(docs) = dirs_sys_fallback() {
            let doc_file = docs.join("custom_homework.json");
            if doc_file.is_file() {
                content = fs::read_to_string(&doc_file).unwrap_or_default();
            }
        }
    }
    if content.trim().is_empty() || serde_json::from_str::<serde_json::Value>(&content).is_err() {
        content = r#"{"classes":{},"users":{}}"#.to_string();
    }

    (
        StatusCode::OK,
        [("content-type", "application/json; charset=utf-8")],
        content,
    ).into_response()
}

pub async fn post_homework_handler(
    State(state): State<AppState>,
    body: String,
) -> Response {
    let trimmed = body.trim();
    if trimmed.is_empty() || serde_json::from_str::<serde_json::Value>(trimmed).is_err() {
        return (
            StatusCode::BAD_REQUEST,
            [("content-type", "application/json; charset=utf-8")],
            json!({"saved": false, "error": "Ungültiges JSON-Format"}).to_string(),
        ).into_response();
    }

    let hw_file = state.base_dir.join("custom_homework.json");
    let _ = fs::write(&hw_file, trimmed);

    if let Some(docs) = dirs_sys_fallback() {
        let doc_file = docs.join("custom_homework.json");
        let _ = fs::write(doc_file, trimmed);
    }

    // Background sync to Gist
    let state_clone = state.clone();
    let body_clone = trimmed.to_string();
    tokio::spawn(async move {
        let gist_id = "e66b5c70ca5ea38585985e43f2976fe8";
        let token_file = state_clone.base_dir.join("cloud_token.txt");
        let mut token = if token_file.is_file() {
            fs::read_to_string(token_file).unwrap_or_default().trim().to_string()
        } else {
            String::new()
        };

        if token.is_empty() {
            if let Ok(out) = std::process::Command::new("gh").args(["auth", "token"]).output() {
                if out.status.success() {
                    token = String::from_utf8_lossy(&out.stdout).trim().to_string();
                }
            }
        }

        if !token.is_empty() {
            let patch_body = json!({
                "files": {
                    "cloud_sync.json": {
                        "content": body_clone
                    }
                }
            });

            let url = format!("https://api.github.com/gists/{}", gist_id);
            let _ = state_clone.http_client.patch(&url)
                .header("User-Agent", "BarrierefreiesWebUntis-CloudSync")
                .header("Authorization", format!("Bearer {}", token))
                .json(&patch_body)
                .send()
                .await;
        }
    });

    (
        StatusCode::OK,
        [("content-type", "application/json; charset=utf-8")],
        json!({"saved": true, "cloud": true}).to_string(),
    ).into_response()
}
