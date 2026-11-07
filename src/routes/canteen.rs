use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde::Deserialize;
use std::fs;
use std::time::{Duration, Instant};
use crate::state::AppState;

const CANTEEN_SEED: &[u8] = include_bytes!("../../canteen_seed.json");

#[derive(Deserialize, Default)]
pub struct CanteenParams {
    pub force: Option<String>,
    pub t: Option<String>,
}

pub async fn canteen_handler(
    State(state): State<AppState>,
    Query(params): Query<CanteenParams>,
) -> Response {
    let force = params.force.is_some() || params.t.is_some();
    let json = get_or_update_canteen(&state, force).await;

    (
        StatusCode::OK,
        [("content-type", "application/json; charset=utf-8")],
        json,
    ).into_response()
}

pub async fn get_or_update_canteen(state: &AppState, force: bool) -> String {
    {
        let cache = state.canteen.read().await;
        if !force {
            if let Some(ref data) = cache.data {
                if let Some(last) = cache.last_fetch {
                    if last.elapsed() < Duration::from_secs(2 * 3600) {
                        return data.clone();
                    }
                }
            }
        }
    }

    // Try GitHub repo sync first
    let github_url = "https://raw.githubusercontent.com/Lauju1909/BarrierefreiesWebUntis/main/canteen_seed.json";
    if let Ok(resp) = state.http_client.get(github_url).send().await {
        if let Ok(text) = resp.text().await {
            if text.contains("\"weeks\"") {
                let mut cache = state.canteen.write().await;
                cache.data = Some(text.clone());
                cache.last_fetch = Some(Instant::now());
                state.log_untis("Canteen updated successfully via GitHub repository feed.");
                return text;
            }
        }
    }

    // Fallback: local file on disk
    let disk_path = state.base_dir.join("canteen_seed.json");
    if disk_path.is_file() {
        if let Ok(content) = fs::read_to_string(&disk_path) {
            let mut cache = state.canteen.write().await;
            cache.data = Some(content.clone());
            cache.last_fetch = Some(Instant::now());
            return content;
        }
    }

    // Fallback: embedded seed
    let seed_str = String::from_utf8_lossy(CANTEEN_SEED).to_string();
    let mut cache = state.canteen.write().await;
    cache.data = Some(seed_str.clone());
    cache.last_fetch = Some(Instant::now());
    seed_str
}

pub fn spawn_canteen_auto_updater(state: AppState) {
    tokio::spawn(async move {
        // Wait 3 seconds after startup
        tokio::time::sleep(Duration::from_secs(3)).await;
        let mut interval = tokio::time::interval(Duration::from_secs(4 * 3600));
        loop {
            interval.tick().await;
            state.log_untis("Automatischer Hintergrund-Crawl für Speisepläne wird ausgeführt...");
            let _ = get_or_update_canteen(&state, true).await;
        }
    });
}
