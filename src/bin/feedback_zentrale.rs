#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::Path;
use std::process::Command;

const FEEDBACK_INBOX: &[u8] = include_bytes!("../../Feedback_Inbox.html");

fn main() {
    let exe_path = std::env::current_exe().unwrap_or_else(|_| ".".into());
    let base_dir = exe_path.parent().unwrap_or_else(|| Path::new("."));
    let html_path = base_dir.join("Feedback_Inbox.html");

    if !html_path.is_file() {
        let _ = fs::write(&html_path, FEEDBACK_INBOX);
    }

    let profile_dir = base_dir.join("Profile_Feedback");
    let file_url = format!("file:///{}", html_path.to_string_lossy().replace('\\', "/"));

    #[cfg(target_os = "windows")]
    {
        let program_files = std::env::var("ProgramFiles").unwrap_or_else(|_| "C:\\Program Files".into());
        let program_files_x86 = std::env::var("ProgramFiles(x86)").unwrap_or_else(|_| "C:\\Program Files (x86)".into());
        let local_app_data = std::env::var("LOCALAPPDATA").unwrap_or_default();

        let candidates = [
            format!("{}\\Google\\Chrome\\Application\\chrome.exe", program_files),
            format!("{}\\Google\\Chrome\\Application\\chrome.exe", program_files_x86),
            format!("{}\\Google\\Chrome\\Application\\chrome.exe", local_app_data),
            format!("{}\\Microsoft\\Edge\\Application\\msedge.exe", program_files),
            format!("{}\\Microsoft\\Edge\\Application\\msedge.exe", program_files_x86),
        ];

        for path in &candidates {
            if Path::new(path).exists() {
                if Command::new(path)
                    .args([
                        &format!("--app={}", file_url),
                        &format!("--user-data-dir={}", profile_dir.to_string_lossy()),
                        "--window-size=980,780",
                    ])
                    .spawn()
                    .is_ok()
                {
                    return;
                }
            }
        }
    }

    let _ = open::that(&file_url);
}
