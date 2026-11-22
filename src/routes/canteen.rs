use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use chrono::{Datelike, Duration as ChronoDuration, Local, NaiveDate};
use regex::Regex;
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::io::{Cursor, Read};
use std::time::{Duration, Instant};
use zip::ZipArchive;
use crate::state::AppState;

const CANTEEN_SEED: &[u8] = include_bytes!("../../canteen_seed.json");

const CANTEEN_SOURCES: &[(&str, &str)] = &[
    (
        "LWL-Von-Vincke-Schule Soest",
        "https://www.lwl-von-vincke-schule.de/de/aktuelles/speiseplane/",
    ),
    (
        "LWL-Berufsbildungswerk Soest",
        "https://www.lwl-bbw-soest.de/de/speiseplane/",
    ),
];

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
    )
        .into_response()
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

    // Load baseline from disk or embedded seed
    let disk_path = state.base_dir.join("canteen_seed.json");
    let mut base_json: Value = fs::read_to_string(&disk_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .or_else(|| serde_json::from_slice(CANTEEN_SEED).ok())
        .unwrap_or_else(|| json!({ "source": "LWL-Von-Vincke-Schule Soest & BBW Soest", "weeks": [] }));

    // 1. Try live crawl directly from official LWL school website (.xlsx files)
    let mut live_updated = false;
    if let Some((source_name, source_url, crawled_weeks)) = crawl_live_lwl_canteen(state).await {
        if !crawled_weeks.is_empty() {
            merge_weeks_into_value(&mut base_json, crawled_weeks);
            base_json["source"] = Value::String(source_name);
            base_json["sourceUrl"] = Value::String(source_url);
            base_json["lastUpdated"] = Value::String(Local::now().format("%d.%m.%Y, %H:%M Uhr").to_string());
            live_updated = true;
            state.log_untis("Canteen updated live from official LWL XLSX plans.");
        }
    }

    // 2. Also try GitHub repository feed (merge any weeks we might not have)
    let ts = chrono::Utc::now().timestamp_millis();
    let github_url = format!(
        "https://raw.githubusercontent.com/Lauju1909/BarrierefreiesWebUntis/main/canteen_seed.json?t={}",
        ts
    );
    if let Ok(resp) = state.http_client.get(&github_url).send().await {
        if resp.status().is_success() {
            if let Ok(text) = resp.text().await {
                if let Ok(gh_val) = serde_json::from_str::<Value>(&text) {
                    if let Some(gh_weeks) = gh_val.get("weeks").and_then(|w| w.as_array()) {
                        if !live_updated {
                            merge_weeks_into_value(&mut base_json, gh_weeks.clone());
                            if let Some(lu) = gh_val.get("lastUpdated").and_then(|v| v.as_str()) {
                                base_json["lastUpdated"] = Value::String(lu.to_string());
                            }
                            state.log_untis("Canteen updated via GitHub repository feed.");
                        } else {
                            // Keep older historical weeks from GitHub without overwriting live weeks
                            merge_missing_weeks_into_value(&mut base_json, gh_weeks.clone());
                        }
                    }
                }
            }
        }
    }

    // Update isCurrent flag based on current ISO week
    let cur_kw = Local::now().date_naive().iso_week().week() as i64;
    if let Some(weeks) = base_json.get_mut("weeks").and_then(|w| w.as_array_mut()) {
        weeks.sort_by_key(|w| w.get("kw").and_then(|v| v.as_i64()).unwrap_or(0));
        for wk in weeks.iter_mut() {
            let kw = wk.get("kw").and_then(|v| v.as_i64()).unwrap_or(0);
            wk["isCurrent"] = Value::Bool(kw == cur_kw);
        }
    }

    let final_str = serde_json::to_string_pretty(&base_json)
        .unwrap_or_else(|_| String::from_utf8_lossy(CANTEEN_SEED).to_string());

    if live_updated {
        let _ = fs::write(&disk_path, &final_str);
    }

    let mut cache = state.canteen.write().await;
    cache.data = Some(final_str.clone());
    cache.last_fetch = Some(Instant::now());
    final_str
}

async fn crawl_live_lwl_canteen(state: &AppState) -> Option<(String, String, Vec<Value>)> {
    let re_link = Regex::new(
        r#"(?is)<a[^>]+href=["']([^"']*(?:filer/canonical|\.xlsx)[^"']*)["'][^>]*>(.*?)</a>"#,
    )
    .ok()?;
    let re_strip = Regex::new(r#"<[^>]+>"#).ok()?;
    let re_ws = Regex::new(r#"\s+"#).ok()?;

    for &(source_name, source_url) in CANTEEN_SOURCES {
        let resp = match state.http_client.get(source_url).send().await {
            Ok(r) if r.status().is_success() => r,
            _ => continue,
        };
        let html = match resp.text().await {
            Ok(t) => t,
            Err(_) => continue,
        };

        let mut links: Vec<(String, String)> = Vec::new();
        for caps in re_link.captures_iter(&html) {
            let href = &caps[1];
            let raw_text = re_strip.replace_all(&caps[2], " ");
            let link_text = re_ws.replace_all(&raw_text, " ").trim().to_string();
            let full_url = if href.starts_with("http://") || href.starts_with("https://") {
                href.to_string()
            } else if href.starts_with("//") {
                format!("https:{}", href)
            } else if let Ok(base) = reqwest::Url::parse(source_url) {
                base.join(href).map(|u| u.to_string()).unwrap_or_default()
            } else {
                continue;
            };
            if !full_url.is_empty() && !links.iter().any(|(u, _)| u == &full_url) {
                links.push((full_url, link_text));
            }
        }

        if links.is_empty() {
            continue;
        }

        let mut parsed_weeks = Vec::new();
        for (xlsx_url, link_text) in links {
            if let Ok(file_resp) = state.http_client.get(&xlsx_url).send().await {
                let final_url = file_resp.url().to_string();
                if let Ok(bytes) = file_resp.bytes().await {
                    if bytes.len() > 1000 && bytes.starts_with(b"PK") {
                        if let Some(wk) = parse_xlsx_bytes_to_week(&bytes, &final_url, &link_text) {
                            parsed_weeks.push(wk);
                        }
                    }
                }
            }
        }

        if !parsed_weeks.is_empty() {
            return Some((source_name.to_string(), source_url.to_string(), parsed_weeks));
        }
    }

    None
}

fn xml_unescape(s: &str) -> String {
    s.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&#10;", "\n")
        .replace("&#13;", "")
        .replace("&#xA;", "\n")
        .replace("&#xD;", "")
}

fn clean_cell_text(raw: &str) -> String {
    let re_sp = Regex::new(r"[ \t]{2,}").unwrap();
    raw.replace("\r\n", "\n")
        .replace('\r', "\n")
        .split('\n')
        .map(|l| re_sp.replace_all(l, " ").trim().to_string())
        .filter(|l| !l.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

fn get_monday_of_iso_week(year: i32, kw: u32) -> NaiveDate {
    let jan4 = NaiveDate::from_ymd_opt(year, 1, 4).unwrap();
    let weekday_offset = jan4.weekday().num_days_from_monday() as i64;
    let first_mon = jan4 - ChronoDuration::days(weekday_offset);
    first_mon + ChronoDuration::weeks((kw as i64) - 1)
}

pub fn parse_xlsx_bytes_to_week(file_bytes: &[u8], xlsx_url: &str, link_text: &str) -> Option<Value> {
    let reader = Cursor::new(file_bytes);
    let mut archive = ZipArchive::new(reader).ok()?;

    // 1. Parse sharedStrings.xml
    let mut shared_strings: Vec<String> = Vec::new();
    if let Ok(mut sst_file) = archive.by_name("xl/sharedStrings.xml") {
        let mut sst_xml = String::new();
        let _ = sst_file.read_to_string(&mut sst_xml);
        let re_si = Regex::new(r"(?s)<si\b[^>]*>(.*?)</si>").ok()?;
        let re_t = Regex::new(r"(?s)<t\b[^>]*>(.*?)</t>").ok()?;
        for si in re_si.captures_iter(&sst_xml) {
            let mut combined = String::new();
            for t in re_t.captures_iter(&si[1]) {
                combined.push_str(&xml_unescape(&t[1]));
            }
            shared_strings.push(combined);
        }
    }

    // 2. Find sheet1.xml (or first worksheet)
    let mut sheet_xml = String::new();
    let sheet_name = if archive.by_name("xl/worksheets/sheet1.xml").is_ok() {
        Some("xl/worksheets/sheet1.xml".to_string())
    } else {
        (0..archive.len())
            .filter_map(|i| archive.by_index(i).ok().map(|f| f.name().to_string()))
            .find(|n| {
                let low = n.to_lowercase();
                low.starts_with("xl/worksheets/sheet") && low.ends_with(".xml")
            })
    }?;
    archive.by_name(&sheet_name).ok()?.read_to_string(&mut sheet_xml).ok()?;

    // 3. Extract cells into BTreeMap<row_num, HashMap<col_letter, text>>
    let mut sheet_data: BTreeMap<usize, HashMap<String, String>> = BTreeMap::new();
    let re_c = Regex::new(r#"(?s)<c\b([^>]*)>(.*?)</c>"#).ok()?;
    let re_ref = Regex::new(r#"r="([A-Za-z]+)(\d+)""#).ok()?;
    let re_type = Regex::new(r#"t="([^"]+)""#).ok()?;
    let re_v = Regex::new(r"(?s)<v[^>]*>(.*?)</v>").ok()?;
    let re_t = Regex::new(r"(?s)<t[^>]*>(.*?)</t>").ok()?;

    for c_cap in re_c.captures_iter(&sheet_xml) {
        let attrs = &c_cap[1];
        let inner = &c_cap[2];
        let Some(rcap) = re_ref.captures(attrs) else {
            continue;
        };
        let col_letter = rcap[1].to_uppercase();
        let Ok(row_idx) = rcap[2].parse::<usize>() else {
            continue;
        };
        let c_type = re_type.captures(attrs).map(|m| m[1].to_string()).unwrap_or_default();

        let raw_val = if let Some(v) = re_v.captures(inner) {
            xml_unescape(&v[1])
        } else {
            re_t.captures_iter(inner)
                .map(|t| xml_unescape(&t[1]))
                .collect::<String>()
        };

        if raw_val.is_empty() {
            continue;
        }

        let resolved = if c_type == "s" {
            raw_val
                .trim()
                .parse::<usize>()
                .ok()
                .and_then(|idx| shared_strings.get(idx))
                .cloned()
                .unwrap_or(raw_val)
        } else {
            raw_val
        };

        let cleaned = clean_cell_text(&resolved);
        if !cleaned.is_empty() {
            sheet_data.entry(row_idx).or_default().insert(col_letter, cleaned);
        }
    }

    if sheet_data.is_empty() {
        return None;
    }

    let day_names = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag"];
    let mut day_menus: HashMap<&str, HashMap<&str, String>> = HashMap::new();
    for &d in &day_names {
        let mut m = HashMap::new();
        for cat in ["breakfast", "menu1", "menu2", "menu3", "extra", "dinner"] {
            m.insert(cat, String::new());
        }
        day_menus.insert(d, m);
    }

    // Layout 1 (Official LWL row-based layout)
    let mut cat_to_col: HashMap<&str, String> = HashMap::new();
    let mut cat_header_row: usize = 0;
    for (&r_idx, row_cells) in &sheet_data {
        let mut found: HashMap<&str, String> = HashMap::new();
        for (col_key, val) in row_cells {
            let low = val.to_lowercase();
            if low.contains("frühstück") {
                found.insert("breakfast", col_key.clone());
            } else if low.contains("menü 1") || low.contains("menue 1") || low.contains("vollkost") {
                found.insert("menu1", col_key.clone());
            } else if low.contains("menü 2") || low.contains("menue 2") || low.contains("muslimisch") || low.contains("ohne schwein") {
                found.insert("menu2", col_key.clone());
            } else if low.contains("menü 3") || low.contains("menue 3") || low.contains("vegetarisch") {
                found.insert("menu3", col_key.clone());
            } else if low.contains("zusatz") || low.contains("salat") || low.contains("suppe") || low.contains("extra") {
                found.insert("extra", col_key.clone());
            } else if low.contains("abend") {
                found.insert("dinner", col_key.clone());
            }
        }
        if found.contains_key("menu1") && (found.contains_key("menu2") || found.contains_key("menu3")) {
            cat_to_col = found;
            cat_header_row = r_idx;
            break;
        }
    }

    let mut used_row_layout = false;
    if !cat_to_col.is_empty() {
        for (&r_idx, row_cells) in &sheet_data {
            if r_idx <= cat_header_row {
                continue;
            }
            let mut matched_day: Option<&str> = None;
            for col_key in ["A", "B"] {
                if let Some(cell) = row_cells.get(col_key) {
                    let low = cell.to_lowercase();
                    for &d_name in &day_names {
                        if low.contains(&d_name.to_lowercase()) {
                            matched_day = Some(d_name);
                            break;
                        }
                    }
                }
                if matched_day.is_some() {
                    break;
                }
            }
            if let Some(d_name) = matched_day {
                used_row_layout = true;
                if let Some(entry) = day_menus.get_mut(d_name) {
                    for (&cat, col_key) in &cat_to_col {
                        if let Some(val) = row_cells.get(col_key) {
                            if !val.is_empty() {
                                entry.insert(cat, val.clone());
                            }
                        }
                    }
                }
            }
        }
    }

    if !used_row_layout {
        return None;
    }

    let valid_days: Vec<&str> = day_names
        .iter()
        .copied()
        .filter(|&d| {
            let m = &day_menus[d];
            !m["menu1"].is_empty() || !m["menu2"].is_empty() || !m["menu3"].is_empty()
        })
        .collect();
    if valid_days.len() < 2 {
        return None;
    }

    let today = Local::now().date_naive();
    let cur_kw = today.iso_week().week();
    let mut target_kw: u32 = 0;
    let mut target_year: i32 = today.iso_week().year();

    let mut header_text = format!("{} {}", xlsx_url, link_text);
    for (&r_idx, row_cells) in &sheet_data {
        if r_idx <= cat_header_row + 2 {
            for v in row_cells.values() {
                header_text.push(' ');
                header_text.push_str(v);
            }
        }
    }

    let re_kw = Regex::new(r"(?i)(?:KW|Kalenderwoche|Woche)[\s_\-]*(\d{1,2})\b").ok()?;
    if let Some(m) = re_kw.captures(&header_text) {
        if let Ok(parsed_kw) = m[1].parse::<u32>() {
            if (1..=53).contains(&parsed_kw) {
                target_kw = parsed_kw;
            }
        }
    }

    if target_kw == 0 {
        let re_date = Regex::new(r"\b(\d{1,2})\.(\d{1,2})\.(20\d{2}|\d{2})\b").ok()?;
        if let Some(m) = re_date.captures(&header_text) {
            if let (Ok(dd), Ok(mm), Ok(mut yy)) = (
                m[1].parse::<u32>(),
                m[2].parse::<u32>(),
                m[3].parse::<i32>(),
            ) {
                if yy < 100 {
                    yy += 2000;
                }
                if let Some(dt) = NaiveDate::from_ymd_opt(yy, mm, dd) {
                    target_kw = dt.iso_week().week();
                    target_year = dt.iso_week().year();
                }
            }
        }
    }

    if target_kw == 0 {
        target_kw = cur_kw;
    }

    let monday = get_monday_of_iso_week(target_year, target_kw);
    let last_offset = if valid_days.contains(&"Freitag") { 4 } else { 3 };
    let end_day = monday + ChronoDuration::days(last_offset);
    let is_current = target_kw == cur_kw;

    let mut days_json = Vec::new();
    for (i, &d_name) in day_names.iter().enumerate() {
        let m = &day_menus[d_name];
        if m["menu1"].is_empty()
            && m["menu2"].is_empty()
            && m["menu3"].is_empty()
            && m["breakfast"].is_empty()
            && m["dinner"].is_empty()
        {
            continue;
        }
        let cur_date = (monday + ChronoDuration::days(i as i64))
            .format("%d.%m.%Y")
            .to_string();
        days_json.push(json!({
            "day": d_name,
            "date": cur_date,
            "breakfast": m["breakfast"],
            "menu1": m["menu1"],
            "menu2": m["menu2"],
            "menu3": m["menu3"],
            "extra": m["extra"],
            "dinner": m["dinner"]
        }));
    }

    Some(json!({
        "weekId": format!("kw{}", target_kw),
        "kw": target_kw,
        "label": format!(
            "{}KW {} ({} – {})",
            if is_current { "Diese Woche: " } else { "" },
            target_kw,
            monday.format("%d.%m."),
            end_day.format("%d.%m.%Y")
        ),
        "dateRange": format!("{} bis {}", monday.format("%d.%m.%Y"), end_day.format("%d.%m.%Y")),
        "isCurrent": is_current,
        "days": days_json
    }))
}

fn merge_weeks_into_value(base: &mut Value, new_weeks: Vec<Value>) {
    if !base.get("weeks").map(|w| w.is_array()).unwrap_or(false) {
        base["weeks"] = json!([]);
    }
    let arr = base["weeks"].as_array_mut().unwrap();
    for nw in new_weeks {
        let n_kw = nw.get("kw").and_then(|v| v.as_i64()).unwrap_or(-1);
        let n_id = nw.get("weekId").and_then(|v| v.as_str()).unwrap_or("");
        if let Some(pos) = arr.iter().position(|ew| {
            (n_kw > 0 && ew.get("kw").and_then(|v| v.as_i64()) == Some(n_kw))
                || (!n_id.is_empty() && ew.get("weekId").and_then(|v| v.as_str()) == Some(n_id))
        }) {
            arr[pos] = nw;
        } else {
            arr.push(nw);
        }
    }
}

fn merge_missing_weeks_into_value(base: &mut Value, fallback_weeks: Vec<Value>) {
    if !base.get("weeks").map(|w| w.is_array()).unwrap_or(false) {
        base["weeks"] = json!([]);
    }
    let arr = base["weeks"].as_array_mut().unwrap();
    for fw in fallback_weeks {
        let f_kw = fw.get("kw").and_then(|v| v.as_i64()).unwrap_or(-1);
        let exists = arr
            .iter()
            .any(|ew| f_kw > 0 && ew.get("kw").and_then(|v| v.as_i64()) == Some(f_kw));
        if !exists {
            arr.push(fw);
        }
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_xml_unescape_and_clean() {
        let raw = "Süßkartoffel &amp; Möhren&#10;  mit   Salat  ";
        assert_eq!(clean_cell_text(&xml_unescape(raw)), "Süßkartoffel & Möhren\nmit Salat");
    }

    #[test]
    fn test_merge_weeks() {
        let mut base = json!({"weeks": [{"weekId": "kw47", "kw": 47, "days": []}]});
        let new_wks = vec![
            json!({"weekId": "kw48", "kw": 48, "days": [{"day": "Montag"}]}),
        ];
        merge_weeks_into_value(&mut base, new_wks);
        assert_eq!(base["weeks"].as_array().unwrap().len(), 2);
    }
}
