pub mod canteen;
pub mod feedback;
pub mod homework;
pub mod iserv;
pub mod static_files;
pub mod system;
pub mod untis;

use axum::routing::{any, get, post};
use axum::Router;
use tower_http::cors::{Any, CorsLayer};
use crate::state::AppState;

pub fn create_router(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any)
        .expose_headers(Any);

    Router::new()
        // System endpoints
        .route("/api/ping", get(system::ping_handler))
        .route("/api/client_log", post(system::client_log_handler))
        .route("/api/notify", get(system::notify_handler).post(system::notify_handler))
        .route("/api/window_closing", get(system::window_closing_handler).post(system::window_closing_handler))
        .route("/api/shutdown", get(system::shutdown_handler).post(system::shutdown_handler))
        .route("/api/version", get(system::version_handler))
        .route("/api/update/check", get(system::update_check_handler))
        .route("/api/open_url", get(system::open_url_handler))
        .route("/api/debug_log", get(system::debug_log_handler))

        // WebUntis endpoints
        .route("/api/untis/otp", get(untis::otp_handler))
        .route("/api/untis/mobile_auth", post(untis::mobile_auth_handler))
        .route("/api/school_search", get(untis::school_search_handler).post(untis::school_search_handler))
        .route("/api/webuntis", any(untis::webuntis_proxy_handler))
        .route("/api/webuntis/{*path}", any(untis::webuntis_proxy_handler))

        // IServ endpoints
        .route("/api/iserv/{*subpath}", any(iserv::iserv_handler))

        // Canteen endpoints
        .route("/api/canteen", get(canteen::canteen_handler))

        // Homework & Cloud sync endpoints
        .route("/api/cloud_sync", get(homework::get_homework_handler).post(homework::post_homework_handler))
        .route("/api/custom_homework", get(homework::get_homework_handler).post(homework::post_homework_handler))
        .route("/api/homework_sync", get(homework::get_homework_handler).post(homework::post_homework_handler))

        // Feedback endpoints
        .route("/api/send_feedback", post(feedback::send_feedback_handler))
        .route("/api/feedback_archive", get(feedback::feedback_archive_handler))
        .route("/api/feedback_archive/clear", post(feedback::feedback_archive_clear_handler))
        .route("/api/open_feedback_zentrale", get(feedback::open_feedback_zentrale_handler).post(feedback::open_feedback_zentrale_handler))

        // Static files fallback
        .fallback(static_files::static_file_handler)
        .layer(cors)
        .with_state(state)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::{to_bytes, Body};
    use axum::http::{Request, StatusCode};
    use tokio::sync::broadcast;
    use tower::ServiceExt;

    fn make_test_state() -> (AppState, std::path::PathBuf) {
        let tmp = std::env::temp_dir().join(format!("untis_test_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&tmp);
        let (tx, _) = broadcast::channel(1);
        (AppState::new(tmp.clone(), 48250, tx), tmp)
    }

    #[tokio::test]
    async fn test_ping_and_version_endpoints() {
        let (state, tmp) = make_test_state();
        let app = create_router(state);

        let resp = app
            .clone()
            .oneshot(Request::builder().uri("/api/ping").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let bytes = to_bytes(resp.into_body(), usize::MAX).await.unwrap();
        let json: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(json["status"], "ok");

        let resp_ver = app
            .oneshot(Request::builder().uri("/api/version").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(resp_ver.status(), StatusCode::OK);
        let ver_bytes = to_bytes(resp_ver.into_body(), usize::MAX).await.unwrap();
        let ver_json: serde_json::Value = serde_json::from_slice(&ver_bytes).unwrap();
        assert!(ver_json.get("version").is_some());

        let _ = std::fs::remove_dir_all(tmp);
    }

    #[tokio::test]
    async fn test_otp_and_iserv_status() {
        let (state, tmp) = make_test_state();
        let app = create_router(state);

        let resp = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/untis/otp?secret=JBSWY3DPEHPK3PXP")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let bytes = to_bytes(resp.into_body(), usize::MAX).await.unwrap();
        let json: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(json["otpStr"].as_str().unwrap().len(), 6);

        let resp_iserv = app
            .oneshot(
                Request::builder()
                    .uri("/api/iserv/status")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp_iserv.status(), StatusCode::OK);
        let iserv_bytes = to_bytes(resp_iserv.into_body(), usize::MAX).await.unwrap();
        let iserv_json: serde_json::Value = serde_json::from_slice(&iserv_bytes).unwrap();
        assert_eq!(iserv_json["success"], true);

        let _ = std::fs::remove_dir_all(tmp);
    }

    #[tokio::test]
    async fn test_homework_and_static_files() {
        let (state, tmp) = make_test_state();
        let app = create_router(state);

        // Invalid JSON rejected
        let bad_post = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/cloud_sync")
                    .body(Body::from("not json"))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(bad_post.status(), StatusCode::BAD_REQUEST);

        // Valid JSON saved
        let good_payload = r#"{"classes":{"ITG":{"1":true}},"users":{}}"#;
        let good_post = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/cloud_sync")
                    .body(Body::from(good_payload))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(good_post.status(), StatusCode::OK);

        let get_hw = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/cloud_sync")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(get_hw.status(), StatusCode::OK);
        let hw_bytes = to_bytes(get_hw.into_body(), usize::MAX).await.unwrap();
        assert_eq!(std::str::from_utf8(&hw_bytes).unwrap(), good_payload);

        // Static files: /index.html and /app.js
        let idx_resp = app
            .clone()
            .oneshot(Request::builder().uri("/index.html").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(idx_resp.status(), StatusCode::OK);

        let js_resp = app
            .clone()
            .oneshot(Request::builder().uri("/app.js").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(js_resp.status(), StatusCode::OK);

        // Path traversal blocked
        let trav_resp = app
            .oneshot(Request::builder().uri("/..%2FCargo.toml").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert!(trav_resp.status() == StatusCode::NOT_FOUND || trav_resp.status() == StatusCode::FORBIDDEN);

        let _ = std::fs::remove_dir_all(tmp);
    }
}
