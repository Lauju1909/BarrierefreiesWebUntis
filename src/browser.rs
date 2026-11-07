use std::path::Path;
use std::process::Command;

/// Launches Chrome or Edge in standalone app-window mode (`--app=...`).
/// Falls back to the system default browser if neither is installed.
pub fn launch_best_browser(url: &str) {
    #[cfg(target_os = "windows")]
    {
        let program_files = std::env::var("ProgramFiles").unwrap_or_else(|_| "C:\\Program Files".into());
        let program_files_x86 = std::env::var("ProgramFiles(x86)").unwrap_or_else(|_| "C:\\Program Files (x86)".into());
        let local_app_data = std::env::var("LOCALAPPDATA").unwrap_or_default();

        let chrome_candidates = [
            format!("{}\\Google\\Chrome\\Application\\chrome.exe", program_files),
            format!("{}\\Google\\Chrome\\Application\\chrome.exe", program_files_x86),
            format!("{}\\Google\\Chrome\\Application\\chrome.exe", local_app_data),
        ];

        for path in &chrome_candidates {
            if Path::new(path).exists() {
                if Command::new(path)
                    .arg(format!("--app={}", url))
                    .spawn()
                    .is_ok()
                {
                    return;
                }
            }
        }

        let edge_candidates = [
            format!("{}\\Microsoft\\Edge\\Application\\msedge.exe", program_files),
            format!("{}\\Microsoft\\Edge\\Application\\msedge.exe", program_files_x86),
        ];

        for path in &edge_candidates {
            if Path::new(path).exists() {
                if Command::new(path)
                    .arg(format!("--app={}", url))
                    .spawn()
                    .is_ok()
                {
                    return;
                }
            }
        }
    }

    // Default browser fallback
    let _ = open::that(url);
}
