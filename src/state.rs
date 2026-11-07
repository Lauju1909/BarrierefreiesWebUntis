use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::{broadcast, RwLock};

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
        let v_path = self.base_dir.join("version.json");
        if let Ok(content) = fs::read_to_string(&v_path) {
            let re = regex::Regex::new(r#""version"\s*:\s*"v?([^"]+)""#).unwrap();
            if let Some(caps) = re.captures(&content) {
                return caps[1].trim().to_string();
            }
        }
        "1.9.38".to_string()
    }
}

fn dirs_sys_fallback() -> Option<PathBuf> {
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
