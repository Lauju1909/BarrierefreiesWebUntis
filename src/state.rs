use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::{broadcast, RwLock};

pub const EMBEDDED_VERSION_JSON: &str = include_str!("../version.json");

#[derive(Default)]
pub struct UntisAuthState {
    pub user: String,
    pub secret: String,
    pub jwt: String,
    pub school: String,
    pub server: String,
    pub person_id: i64,
}

#[derive(Default)]
pub struct IServAuthState {
    pub host: String,
    pub user: String,
    pub pass: String,
    pub logged_in: bool,
}

#[derive(Default)]
pub struct CanteenCache {
    pub data: Option<String>,
    pub last_fetch: Option<Instant>,
}

#[derive(Clone)]
#[allow(dead_code)]
pub struct AppState {
    pub base_dir: PathBuf,
    pub active_port: u16,
    pub http_client: reqwest::Client,
    pub cookie_jar: Arc<reqwest::cookie::Jar>,
    pub untis: Arc<RwLock<UntisAuthState>>,
    pub iserv: Arc<RwLock<IServAuthState>>,
    pub canteen: Arc<RwLock<CanteenCache>>,
    pub shutdown_tx: broadcast::Sender<()>,
}

pub fn extract_version_from_json(content: &str) -> Option<String> {
    if let Ok(val) = serde_json::from_str::<serde_json::Value>(content) {
        if let Some(v) = val.get("version").and_then(|v| v.as_str()) {
            let trimmed = v.trim().trim_start_matches('v').trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }
    let re = regex::Regex::new(r#""version"\s*:\s*"v?([^"]+)""#).ok()?;
    let caps = re.captures(content)?;
    Some(caps[1].trim().to_string())
}

pub fn is_newer_version(remote: &str, local: &str) -> bool {
    let parse_parts = |s: &str| -> Vec<u64> {
        s.trim()
            .trim_start_matches('v')
            .split('.')
            .map(|p| p.parse::<u64>().unwrap_or(0))
            .collect()
    };
    let r = parse_parts(remote);
    let l = parse_parts(local);
    let max_len = r.len().max(l.len());
    for i in 0..max_len {
        let rv = *r.get(i).unwrap_or(&0);
        let lv = *l.get(i).unwrap_or(&0);
        if rv > lv {
            return true;
        }
        if rv < lv {
            return false;
        }
    }
    false
}

impl AppState {
    pub fn new(base_dir: PathBuf, active_port: u16, shutdown_tx: broadcast::Sender<()>) -> Self {
        let cookie_jar = Arc::new(reqwest::cookie::Jar::default());
        let http_client = reqwest::Client::builder()
            .cookie_provider(cookie_jar.clone())
            .timeout(std::time::Duration::from_secs(20))
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) BarrierefreiesWebUntis/Rust")
            .build()
            .unwrap_or_default();

        let untis = UntisAuthState {
            school: "lwl-bk-soest".into(),
            server: "lwl-bk-soest.webuntis.com".into(),
            ..Default::default()
        };

        Self {
            base_dir,
            active_port,
            http_client,
            cookie_jar,
            untis: Arc::new(RwLock::new(untis)),
            iserv: Arc::new(RwLock::new(IServAuthState::default())),
            canteen: Arc::new(RwLock::new(CanteenCache::default())),
            shutdown_tx,
        }
    }

    pub fn log_untis(&self, msg: &str) {
        let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f");
        let line = format!("[{}] {}\r\n", now, msg);

        let mut paths = vec![self.base_dir.join("webuntis_debug.log")];
        if let Some(user_dirs) = dirs_sys_fallback() {
            paths.push(user_dirs.join("webuntis_debug.log"));
        }

        for p in paths {
            if let Some(parent) = p.parent() {
                if !parent.exists() {
                    let _ = fs::create_dir_all(parent);
                }
            }
            if let Ok(meta) = fs::metadata(&p) {
                if meta.len() > 10 * 1024 * 1024 {
                    let _ = fs::remove_file(&p);
                }
            }
            if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&p) {
                let _ = file.write_all(line.as_bytes());
            }
        }
    }

    pub fn get_local_version(&self) -> String {
        let embedded_ver = extract_version_from_json(EMBEDDED_VERSION_JSON)
            .unwrap_or_else(|| "1.9.39".to_string());

        let v_path = self.base_dir.join("version.json");
        if let Ok(content) = fs::read_to_string(&v_path) {
            if let Some(disk_ver) = extract_version_from_json(&content) {
                if is_newer_version(&disk_ver, &embedded_ver) {
                    return disk_ver;
                }
            }
        }
        embedded_ver
    }
}

pub fn dirs_sys_fallback() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        if let Ok(userprofile) = std::env::var("USERPROFILE") {
            let docs = Path::new(&userprofile).join("Documents");
            if docs.exists() {
                return Some(docs);
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_version_from_json() {
        assert_eq!(
            extract_version_from_json(r#"{"version": "1.9.39", "build": 42}"#),
            Some("1.9.39".to_string())
        );
        assert_eq!(
            extract_version_from_json(r#"{"version": "v2.0.1"}"#),
            Some("2.0.1".to_string())
        );
    }

    #[test]
    fn test_is_newer_version() {
        assert!(is_newer_version("1.9.40", "1.9.39"));
        assert!(is_newer_version("v2.0.0", "1.9.99"));
        assert!(!is_newer_version("1.9.39", "1.9.39"));
        assert!(!is_newer_version("1.9.38", "1.9.39"));
    }
}
