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
