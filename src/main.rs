#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod browser;
mod routes;
mod state;
mod totp;

use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tokio::net::TcpStream;
use tokio::sync::broadcast;
use crate::browser::launch_best_browser;
use crate::routes::canteen::spawn_canteen_auto_updater;
use crate::routes::create_router;
use crate::state::AppState;

const DEFAULT_PORT: u16 = 48250;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().collect();
    let is_silent = args.iter().any(|a| a == "--silent");
    let is_updated = args.iter().any(|a| a == "--updated");

    let exe_path = std::env::current_exe().unwrap_or_else(|_| PathBuf::from("."));
    let base_dir = exe_path.parent().unwrap_or_else(|| Path::new(".")).to_path_buf();

    // 1. Check if an instance is already running on port 48250
    if is_port_in_use(DEFAULT_PORT).await {
        if check_ping_healthy(DEFAULT_PORT).await {
            if !is_silent && !is_updated {
                launch_best_browser(&format!("http://127.0.0.1:{}/index.html", DEFAULT_PORT));
            }
            return Ok(());
        }
    }

    // 2. Bind with fallback ports 48250..48255
    let mut bound_listener = None;
    let mut active_port = DEFAULT_PORT;

    for port in DEFAULT_PORT..=(DEFAULT_PORT + 5) {
        let addr = SocketAddr::from(([127, 0, 0, 1], port));
        if let Ok(listener) = tokio::net::TcpListener::bind(addr).await {
            bound_listener = Some(listener);
            active_port = port;
            break;
        }
    }

    let listener = match bound_listener {
        Some(l) => l,
        None => {
            eprintln!("Fehler: Kein freier Port zwischen 48250 und 48255 gefunden.");
            return Ok(());
        }
    };

    // 3. Setup state & router
    let (shutdown_tx, _) = broadcast::channel::<()>(1);
    let app_state = AppState::new(base_dir.clone(), active_port, shutdown_tx.clone());
    app_state.log_untis(&format!("=== PROGRAM START (Rust Edition) v{} on port {} ===", app_state.get_local_version(), active_port));

    let app = create_router(app_state.clone());

    // 4. Background tasks
    spawn_canteen_auto_updater(app_state.clone());

    // 5. Launch browser
    let launch_url = format!("http://127.0.0.1:{}/index.html", active_port);
    if !is_silent && !is_updated {
        app_state.log_untis(&format!("Launching browser with URL: {}", launch_url));
        launch_best_browser(&launch_url);
    } else {
        app_state.log_untis("Skipping browser launch (--silent or --updated)");
    }

    // 6. Run server with graceful shutdown
    let mut rx = shutdown_tx.subscribe();
    let state_clone = app_state.clone();
    axum::serve(listener, app)
        .with_graceful_shutdown(async move {
            tokio::select! {
                _ = rx.recv() => {
                    state_clone.log_untis("Graceful shutdown received. Exiting.");
                }
                _ = tokio::signal::ctrl_c() => {
                    state_clone.log_untis("Ctrl+C received. Exiting.");
                }
            }
        })
        .await?;

    Ok(())
}

async fn is_port_in_use(port: u16) -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    tokio::time::timeout(Duration::from_millis(300), TcpStream::connect(addr))
        .await
        .map(|res| res.is_ok())
        .unwrap_or(false)
}

async fn check_ping_healthy(port: u16) -> bool {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(800))
        .build()
        .unwrap_or_default();

    let ping_url = format!("http://127.0.0.1:{}/api/ping", port);
    if let Ok(resp) = client.get(&ping_url).send().await {
        return resp.status().is_success();
    }
    false
}
