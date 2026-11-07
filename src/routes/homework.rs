use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::json;
use std::fs;
use crate::state::AppState;

pub async fn get_homework_handler(
    State(state): State<AppState>,
) -> Response {
    let hw_file = state.base_dir.join("custom_homework.json");
    let content = if hw_file.is_file() {
        fs::read_to_string(hw_file).unwrap_or_else(|_| r#"{"classes":{},"users":{}}"#.into())
    } else {
        r#"{"classes":{},"users":{}}"#.to_string()
    };

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
    let hw_file = state.base_dir.join("custom_homework.json");
    let _ = fs::write(&hw_file, &body);

    #[cfg(target_os = "windows")]
    if let Ok(userprofile) = std::env::var("USERPROFILE") {
        let doc_file = std::path::Path::new(&userprofile).join("Documents").join("custom_homework.json");
        let _ = fs::write(doc_file, &body);
    }

    // Background sync to Gist
    let state_clone = state.clone();
    let body_clone = body.clone();
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
