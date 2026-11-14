use axum::body::Bytes;
use axum::extract::{Query, State};
use axum::http::{HeaderMap, HeaderValue, Method, StatusCode};
use axum::response::{IntoResponse, Json, Response};
use regex::Regex;
use serde::Deserialize;
use serde_json::json;
use crate::state::AppState;
use crate::totp::generate_totp;

#[derive(Deserialize)]
pub struct OtpParams {
    pub secret: Option<String>,
}

pub async fn otp_handler(
    Query(params): Query<OtpParams>,
) -> Response {
    let secret = params.secret.unwrap_or_default();
    let ts = chrono::Utc::now().timestamp_millis();
    let otp = generate_totp(&secret, ts);
    Json(json!({
        "otp": otp,
        "otpStr": format!("{:06}", otp),
        "clientTime": ts
    })).into_response()
}

#[derive(Deserialize, Default)]
pub struct MobileAuthBody {
    pub username: Option<String>,
    pub user: Option<String>,
    pub password: Option<String>,
    pub school: Option<String>,
    pub server: Option<String>,
}

pub async fn mobile_auth_handler(
    State(state): State<AppState>,
    Json(body): Json<MobileAuthBody>,
) -> Response {
    let user = body.username.or(body.user).unwrap_or_default();
    let pass = body.password.unwrap_or_default();
    let school = body.school.unwrap_or_else(|| "lwl-bk-soest".into());
    let server = body.server.unwrap_or_else(|| "lwl-bk-soest.webuntis.com".into());

    if user.is_empty() || pass.is_empty() {
        return Json(json!({"error": "Missing credentials"})).into_response();
    }

    state.log_untis(&format!("Starting Untis Mobile Auth for user={}, school={}", user, school));

    let mut untis_guard = state.untis.write().await;
    untis_guard.user = user.clone();
    untis_guard.school = school.clone();
    untis_guard.server = server.clone();

    // Step 1: getAppSharedSecret
    let sec_url = format!(
        "https://{}/WebUntis/jsonrpc_intern.do?school={}&m=getAppSharedSecret&a=false&s={}&v=a6.7.0",
        server, school, server
    );
    let sec_body = json!({
        "id": "untis-mobile-android-6.7.0",
        "jsonrpc": "2.0",
        "method": "getAppSharedSecret",
        "params": [{
            "password": pass,
            "userName": user
        }]
    });

    if let Ok(resp) = state.http_client.post(&sec_url).json(&sec_body).send().await {
        if let Ok(resp_json) = resp.json::<serde_json::Value>().await {
            if let Some(res_str) = resp_json.get("result").and_then(|v| v.as_str()) {
                untis_guard.secret = res_str.to_string();
                state.log_untis(&format!(
                    "App Shared Secret obtained: {}***",
                    &untis_guard.secret.chars().take(4).collect::<String>()
                ));
            }
        }
    }

    // Step 2: getAuthToken with TOTP
    if !untis_guard.secret.is_empty() {
        let now_ms = chrono::Utc::now().timestamp_millis();
        let otp = generate_totp(&untis_guard.secret, now_ms);
        let tok_url = format!(
            "https://{}/WebUntis/jsonrpc_intern.do?school={}&m=getAuthToken&a=false&s={}&v=a6.7.0",
            server, school, server
        );
        let tok_body = json!({
            "id": "untis-mobile-android-6.7.0",
            "jsonrpc": "2.0",
            "method": "getAuthToken",
            "params": [{
                "auth": {
                    "clientTime": now_ms,
                    "otp": otp,
                    "user": user
                }
            }]
        });

        if let Ok(resp) = state.http_client.post(&tok_url).json(&tok_body).send().await {
            if let Ok(tok_json) = resp.json::<serde_json::Value>().await {
                if let Some(token) = extract_jwt_from_auth_response(&tok_json) {
                    untis_guard.jwt = token;
                }
            }
        }
    }

    // Step 3: Fallback /api/mobile/v2/{school}/authentication if no JWT yet
    if untis_guard.jwt.is_empty() {
        let auth_url = format!("https://{}/WebUntis/api/mobile/v2/{}/authentication", server, school);
        let auth_body = json!({
            "username": user,
            "password": pass
        });

        if let Ok(resp) = state.http_client.post(&auth_url).json(&auth_body).send().await {
            if let Ok(res_json) = resp.json::<serde_json::Value>().await {
                if let Some(token) = res_json.get("jwt").and_then(|v| v.as_str()) {
                    untis_guard.jwt = token.to_string();
                }
            }
        }
    }

    // Step 4: Extract person_id from JWT payload if present
    if !untis_guard.jwt.is_empty() {
        if let Some(pid) = extract_person_id_from_jwt(&untis_guard.jwt) {
            untis_guard.person_id = pid;
        }
    }

    let success = !untis_guard.jwt.is_empty() || !untis_guard.secret.is_empty();
    Json(json!({
        "success": success,
        "appSharedSecret": untis_guard.secret,
        "jwtToken": untis_guard.jwt,
        "personId": untis_guard.person_id
    })).into_response()
}

pub fn extract_jwt_from_auth_response(tok_json: &serde_json::Value) -> Option<String> {
    tok_json
        .get("result")
        .and_then(|r| r.get("token"))
        .and_then(|v| v.as_str())
        .or_else(|| tok_json.get("token").and_then(|v| v.as_str()))
        .or_else(|| tok_json.get("jwt").and_then(|v| v.as_str()))
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
}

pub fn extract_person_id_from_jwt(jwt: &str) -> Option<i64> {
    let parts: Vec<&str> = jwt.split('.').collect();
    if parts.len() < 2 {
        return None;
    }
    let mut payload = parts[1].replace('-', "+").replace('_', "/");
    let pad = 4 - (payload.len() % 4);
    if pad < 4 {
        payload.push_str(&"=".repeat(pad));
    }
    let decoded = base64_decode(&payload).ok()?;
    let claims = serde_json::from_slice::<serde_json::Value>(&decoded).ok()?;
    claims.get("person_id").and_then(|v| v.as_i64())
}

pub fn base64_encode(input: &[u8]) -> String {
    const B64_CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((input.len() + 2) / 3 * 4);
    for chunk in input.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let triple = (b0 << 16) | (b1 << 8) | b2;

        out.push(B64_CHARS[((triple >> 18) & 0x3F) as usize] as char);
        out.push(B64_CHARS[((triple >> 12) & 0x3F) as usize] as char);
        if chunk.len() > 1 {
            out.push(B64_CHARS[((triple >> 6) & 0x3F) as usize] as char);
        } else {
            out.push('=');
        }
        if chunk.len() > 2 {
            out.push(B64_CHARS[(triple & 0x3F) as usize] as char);
        } else {
            out.push('=');
        }
    }
    out
}

pub fn base64_decode(input: &str) -> Result<Vec<u8>, ()> {
    const B64_CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let input = input.trim_end_matches('=');
    let mut out = Vec::new();
    let mut buf = 0u32;
    let mut bits = 0;
    for &b in input.as_bytes() {
        let val = match B64_CHARS.iter().position(|&x| x == b) {
            Some(idx) => idx as u32,
            None => continue,
        };
        buf = (buf << 6) | val;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8);
            buf &= (1 << bits) - 1;
        }
    }
    Ok(out)
}

#[derive(Deserialize, Default)]
pub struct SchoolSearchParams {
    pub query: Option<String>,
    pub q: Option<String>,
}

pub async fn school_search_handler(
    State(state): State<AppState>,
    Query(params): Query<SchoolSearchParams>,
) -> Response {
    let q = params.query.or(params.q).unwrap_or_default().trim().to_string();
    if q.len() < 2 {
        return Json(json!({"result": {"schools": []}})).into_response();
    }

    let search_body = json!({
        "id": "1",
        "jsonrpc": "2.0",
        "method": "searchSchool",
        "params": [{
            "search": q
        }]
    });

    match state.http_client
        .post("https://mobile.webuntis.com/ms/schoolquery2")
        .json(&search_body)
        .send()
        .await
    {
        Ok(resp) => {
            if let Ok(bytes) = resp.bytes().await {
                (
                    StatusCode::OK,
                    [("content-type", "application/json; charset=utf-8")],
                    bytes,
                ).into_response()
            } else {
                Json(json!({"error": true, "result": {"schools": []}})).into_response()
            }
        }
        Err(err) => {
            state.log_untis(&format!("School search error: {}", err));
            Json(json!({
                "error": true,
                "message": err.to_string(),
                "result": {"schools": []}
            })).into_response()
        }
    }
}

pub async fn webuntis_proxy_handler(
    State(state): State<AppState>,
    method: Method,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let untis_guard = state.untis.read().await;

    let school_hdr = headers.get("x-school").and_then(|v| v.to_str().ok());
    let server_hdr = headers.get("x-server").and_then(|v| v.to_str().ok());
    let session_id = headers.get("x-jsessionid").and_then(|v| v.to_str().ok());
    let custom_ep = headers.get("x-endpoint").and_then(|v| v.to_str().ok());
    let untis_secret = headers.get("x-untis-secret").and_then(|v| v.to_str().ok()).unwrap_or(&untis_guard.secret);
    let untis_user = headers.get("x-untis-user").and_then(|v| v.to_str().ok()).unwrap_or(&untis_guard.user);

    let srv = server_hdr
        .filter(|s| !s.is_empty())
        .unwrap_or(if !untis_guard.server.is_empty() { &untis_guard.server } else { "lwl-bk-soest.webuntis.com" })
        .to_string();
    let sch = school_hdr
        .filter(|s| !s.is_empty())
        .unwrap_or(if !untis_guard.school.is_empty() { &untis_guard.school } else { "lwl-bk-soest" })
        .to_string();

    let mut body_vec = body.to_vec();
    let mut final_ep = custom_ep.unwrap_or("").to_string();

    // Auto-detect mobile JSON-RPC methods in body
    if final_ep.is_empty() && !body_vec.is_empty() {
        if let Ok(body_str) = std::str::from_utf8(&body_vec) {
            let re = Regex::new(r#""method"\s*:\s*"(getHomeWork2017|getExams2017|getPeriodData2017|getUserData2017|getTimetable2017|getStudentAbsences2017|getOfficeHours2017|getMessagesOfDay2017)""#).unwrap();
            if let Some(m) = re.captures(body_str) {
                final_ep = format!("/jsonrpc_intern.do?m={}", &m[1]);
            }
        }
    }

    // Auto OTP injection if secret & user available
    if !untis_secret.is_empty() && !untis_user.is_empty() && !body_vec.is_empty() {
        if let Ok(body_str) = std::str::from_utf8(&body_vec) {
            let now_ms = chrono::Utc::now().timestamp_millis();
            let otp = generate_totp(untis_secret, now_ms);
            let auth_snippet = format!(
                r#""auth":{{"clientTime":{},"otp":{},"user":"{}"}}"#,
                now_ms, otp, untis_user
            );

            let re_params = Regex::new(r#"("params"\s*:\s*\[\s*\{)"#).unwrap();
            if body_str.contains("\"method\"") && !body_str.contains("\"auth\"") {
                if re_params.is_match(body_str) {
                    let replaced = re_params.replace(body_str, format!("$1{},", auth_snippet));
                    body_vec = replaced.into_owned().into_bytes();
                }
            } else if body_str.contains("\"auth\"") && body_str.contains("\"otp\"") {
                let re_otp = Regex::new(r#""otp"\s*:\s*\d+"#).unwrap();
                let re_ts = Regex::new(r#""clientTime"\s*:\s*\d+"#).unwrap();
                let replaced = re_otp.replace(body_str, format!("\"otp\":{}", otp));
                let replaced2 = re_ts.replace(&replaced, format!("\"clientTime\":{}", now_ms));
                body_vec = replaced2.into_owned().into_bytes();
            }
        }
    }

    let target_url = if !final_ep.is_empty() {
        let mut ep = if final_ep.starts_with('/') { final_ep } else { format!("/{}", final_ep) };
        if ep.to_lowercase().starts_with("/webuntis/") {
            ep = ep[9..].to_string();
        }
        if !ep.contains("school=") {
            let sep = if ep.contains('?') { '&' } else { '?' };
            ep = format!("{}{}school={}", ep, sep, sch);
        }
        if ep.contains("jsonrpc_intern.do") {
            if !ep.contains("v=") { ep.push_str("&v=a6.7.0"); }
            if !ep.contains("a=") { ep.push_str("&a=false"); }
            if !ep.contains("s=") { ep.push_str(&format!("&s={}", srv)); }
        }
        format!("https://{}/WebUntis{}", srv, ep)
    } else if let Some(sid) = session_id.filter(|s| !s.is_empty()) {
        format!("https://{}/WebUntis/jsonrpc.do;jsessionid={}?school={}", srv, sid, sch)
    } else {
        format!("https://{}/WebUntis/jsonrpc.do?school={}", srv, sch)
    };

    drop(untis_guard);

    if let Ok(req_str) = std::str::from_utf8(&body_vec) {
        let re_pw = Regex::new(r#""password"\s*:\s*"[^"]*""#).unwrap();
        let safe_req = re_pw.replace_all(req_str, r#""password":"***""#);
        let snippet: String = safe_req.chars().take(500).collect();
        state.log_untis(&format!("REQ [{}] {} | Body: {}", method, target_url, snippet));
    }

    let mut req_builder = state.http_client.request(method, &target_url)
        .header("User-Agent", "WebUntis/Mobile (Android; de)")
        .header("Accept", "application/json, text/plain, */*")
        .header("Content-Type", "application/json; charset=utf-8");

    let tenant_id = headers.get("tenant-id").and_then(|v| v.to_str().ok()).unwrap_or("5238400");
    req_builder = req_builder.header("tenant-id", tenant_id);

    let sy_id = headers.get("x-webuntis-api-school-year-id").and_then(|v| v.to_str().ok()).unwrap_or("18");
    req_builder = req_builder.header("x-webuntis-api-school-year-id", sy_id);

    if let Some(auth) = headers.get("authorization").and_then(|v| v.to_str().ok()).filter(|a| !a.is_empty()) {
        req_builder = req_builder.header("Authorization", auth);
    } else {
        let untis_guard = state.untis.read().await;
        if !untis_guard.jwt.is_empty() {
            req_builder = req_builder.header("Authorization", format!("Bearer {}", untis_guard.jwt));
        }
    }

    let school_b64 = base64_encode(sch.as_bytes());
    let mut cookie_header = format!("Tenant-Id={}; schoolname=_{}", tenant_id, school_b64);
    if let Some(sid) = session_id.filter(|s| !s.is_empty()) {
        cookie_header.push_str(&format!("; JSESSIONID={}", sid));
    }
    req_builder = req_builder.header("Cookie", cookie_header);

    if !body_vec.is_empty() {
        req_builder = req_builder.body(body_vec);
    }

    match req_builder.send().await {
        Ok(resp) => {
            let status = resp.status();
            let mut out_headers = HeaderMap::new();
            if let Some(ct) = resp.headers().get("content-type") {
                out_headers.insert("content-type", ct.clone());
            } else {
                out_headers.insert("content-type", "application/json; charset=utf-8".parse().unwrap());
            }

            let mut all_cookies = Vec::new();
            for cookie_val in resp.headers().get_all("set-cookie") {
                out_headers.append("set-cookie", cookie_val.clone());
                if let Ok(c_str) = cookie_val.to_str() {
                    all_cookies.push(c_str.to_string());
                }
            }
            if !all_cookies.is_empty() {
                if let Ok(joined) = HeaderValue::from_str(&all_cookies.join("; ")) {
                    out_headers.insert("x-set-cookie", joined);
                }
            }

            let resp_bytes = resp.bytes().await.unwrap_or_default();
            if let Ok(resp_str) = std::str::from_utf8(&resp_bytes) {
                let snippet: String = resp_str.chars().take(600).collect();
                state.log_untis(&format!("RESP [{}] {} | Body: {}", status.as_u16(), target_url, snippet));
            }
            (status, out_headers, resp_bytes).into_response()
        }
        Err(err) => {
            state.log_untis(&format!("WebUntis Proxy Error: {}", err));
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                [("content-type", "application/json; charset=utf-8")],
                Json(json!({
                    "jsonrpc": "2.0",
                    "id": "err",
                    "error": {
                        "message": err.to_string(),
                        "code": -1
                    }
                })),
            ).into_response()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_base64_encode_decode() {
        assert_eq!(base64_encode(b"lwl-bk-soest"), "bHdsLWJrLXNvZXN0");
        let decoded = base64_decode("bHdsLWJrLXNvZXN0").unwrap();
        assert_eq!(decoded, b"lwl-bk-soest");
    }

    #[test]
    fn test_extract_jwt_from_auth_response() {
        let rpc_resp = json!({
            "jsonrpc": "2.0",
            "id": "untis-mobile-android-6.7.0",
            "result": {
                "token": "eyJhbGciOiJSUzI1NiJ9.eyJwZXJzb25faWQiOjQ3MDd9.sig"
            }
        });
        assert_eq!(
            extract_jwt_from_auth_response(&rpc_resp),
            Some("eyJhbGciOiJSUzI1NiJ9.eyJwZXJzb25faWQiOjQ3MDd9.sig".to_string())
        );
        assert_eq!(
            extract_person_id_from_jwt("eyJhbGciOiJSUzI1NiJ9.eyJwZXJzb25faWQiOjQ3MDd9.sig"),
            Some(4707)
        );
    }
}
