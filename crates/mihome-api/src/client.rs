use std::collections::HashMap;
use std::path::Path;
use std::time::{Duration, Instant};

use rand::Rng;
use reqwest::blocking::{Client, Response};
use reqwest::header::{HeaderMap, HeaderValue};
use serde_json::{json, Value};
use tracing::{debug, info};

use crate::auth::AuthStore;
use crate::crypto::{decrypt, gen_nonce, generate_enc_params, signed_nonce};
use crate::error::MiHomeError;
use crate::spec::{get_device_info, SpecInfo};

const API_BASE: &str = "https://api.mijia.tech/app";
const LOGIN_URL: &str = "https://account.xiaomi.com/longPolling/loginUrl";
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const TOTAL_TIMEOUT: Duration = Duration::from_secs(30);
const QR_POLL_TIMEOUT: Duration = Duration::from_secs(120);
const AVAILABLE_CACHE_SECS: u64 = 60;

/// QR-login bundle from [`MiHomeClient::qr_login_data`].
#[derive(Debug, Clone)]
pub struct QrLoginData {
    /// Local token refreshed fine; no QR needed.
    pub refreshed: bool,
    pub login_url: String,
    pub qr_img: String,
    pub lp: String,
}

fn str_of(v: &Value, key: &str) -> String {
    v.get(key)
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string()
}

fn rand_alnum(len: usize, upper_hex: bool) -> String {
    let mut rng = rand::rng();
    let alphabet: &[u8] = if upper_hex {
        b"0123456789ABCDEF"
    } else {
        b"0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_-"
    };
    (0..len)
        .map(|_| alphabet[rng.random_range(0..alphabet.len())] as char)
        .collect()
}

fn rand_hex_lower(len: usize) -> String {
    let mut rng = rand::rng();
    (0..len)
        .map(|_| format!("{:x}", rng.random_range(0..16u8)))
        .collect::<String>()
}

fn detect_locale() -> String {
    for key in ["LC_ALL", "LC_MESSAGES", "LANG"] {
        if let Ok(v) = std::env::var(key) {
            let base = v.split('.').next().unwrap_or("");
            if base.contains('_') {
                return base.to_string();
            }
        }
    }
    "zh_CN".to_string()
}

fn tz_info() -> (String, String) {
    let offset_secs = chrono::Local::now().offset().local_minus_utc();
    let sign = if offset_secs < 0 { "-" } else { "+" };
    let abs = offset_secs.abs();
    let zone = format!("GMT{sign}{:02}:{:02}", abs / 3600, (abs % 3600) / 60);
    // `iana-time-zone` intentionally not pulled in; best-effort id that the
    // server only uses for display. Falls back to a fixed id on common offsets.
    let id = match offset_secs {
        28800 => "Asia/Shanghai",
        0 => "UTC",
        _ => "UTC",
    };
    (id.to_string(), zone)
}

pub struct MiHomeClient {
    auth: AuthStore,
    http: Client,
    locale: String,
    service_login_url: String,
    available_cache: Option<(bool, Instant)>,
}

impl MiHomeClient {
    pub fn new(auth_path: Option<&Path>) -> Result<Self, MiHomeError> {
        let auth = AuthStore::open(auth_path)?;
        let locale = detect_locale();
        let service_login_url = format!(
            "https://account.xiaomi.com/pass/serviceLogin?_json=true&sid=mijia&_locale={locale}"
        );
        let http = Client::builder()
            .timeout(TOTAL_TIMEOUT)
            .connect_timeout(CONNECT_TIMEOUT)
            .build()?;
        Ok(Self {
            auth,
            http,
            locale,
            service_login_url,
            available_cache: None,
        })
    }

    pub fn auth_path(&self) -> &Path {
        &self.auth.path
    }

    pub fn cache_dir(&self) -> &Path {
        self.auth.path.parent().unwrap_or(Path::new("."))
    }

    pub fn user_agent(&mut self) -> String {
        if let Some(ua) = self.auth.get_str("ua") {
            return ua;
        }
        let country = self.locale.split('_').nth(1).unwrap_or("CN").to_string();
        let id1 = rand_alnum(40, true);
        let id2 = rand_alnum(32, true);
        let id3 = rand_alnum(32, true);
        let id4 = rand_alnum(40, true);
        let pass_o = self.pass_o();
        let ua = format!(
            "Android-15-11.0.701-Xiaomi-23046RP50C-OS2.0.212.0.VMYCNXM-{id1}-{country}-{id3}-{id2}-SmartHome-MI_APP_STORE-{id1}|{id4}|{pass_o}-64"
        );
        self.auth.set("ua", Value::String(ua.clone()));
        ua
    }

    pub fn device_id(&mut self) -> String {
        if let Some(id) = self.auth.get_str("deviceId") {
            return id;
        }
        let id = rand_alnum(16, false);
        self.auth.set("deviceId", Value::String(id.clone()));
        id
    }

    fn pass_o(&mut self) -> String {
        if let Some(p) = self.auth.get_str("pass_o") {
            return p;
        }
        let p = rand_hex_lower(16);
        self.auth.set("pass_o", Value::String(p.clone()));
        p
    }

    fn session_headers(&mut self) -> HeaderMap {
        let ua = self.user_agent();
        let device_id = self.device_id();
        let c_user = self.auth.get_str("cUserId").unwrap_or_default();
        let token = self.auth.get_str("serviceToken").unwrap_or_default();
        let country = self.locale.split('_').nth(1).unwrap_or("CN").to_string();
        let (tz_id, tz) = tz_info();
        let cookie = format!(
            "cUserId={c_user};yetAnotherServiceToken={token};serviceToken={token};\
             timezone_id={tz_id};timezone={tz};is_daylight=0;dst_offset=0;\
             channel=MI_APP_STORE;countryCode={country};PassportDeviceId={device_id};locale={}",
            self.locale
        );
        let mut h = HeaderMap::new();
        h.insert(
            "User-Agent",
            HeaderValue::from_str(&ua).unwrap_or(HeaderValue::from_static("mijia-api")),
        );
        h.insert("accept-encoding", HeaderValue::from_static("identity"));
        h.insert(
            "Content-Type",
            HeaderValue::from_static("application/x-www-form-urlencoded"),
        );
        h.insert("miot-accept-encoding", HeaderValue::from_static("GZIP"));
        h.insert(
            "miot-encrypt-algorithm",
            HeaderValue::from_static("ENCRYPT-RC4"),
        );
        h.insert(
            "x-xiaomi-protocal-flag-cli",
            HeaderValue::from_static("PROTOCAL-HTTP2"),
        );
        if let Ok(v) = HeaderValue::from_str(&cookie) {
            h.insert("Cookie", v);
        }
        h
    }

    // ---------- availability ----------

    pub fn available(&mut self) -> bool {
        if !self
            .auth
            .contains_all(&["ua", "ssecurity", "userId", "cUserId", "serviceToken"])
        {
            return false;
        }
        if let Some((cached, at)) = self.available_cache {
            if at.elapsed().as_secs() < AVAILABLE_CACHE_SECS {
                debug!("使用缓存的available结果: {cached}");
                return cached;
            }
        }
        let ok = self.check_new_msg(None, false).is_ok();
        if ok {
            self.available_cache = Some((true, Instant::now()));
            true
        } else {
            self.available_cache = None;
            false
        }
    }

    // ---------- response helpers ----------

    fn parse_service_ret(&self, status: u16, text: &str) -> Result<Value, MiHomeError> {
        let body = text.strip_prefix("&&&START&&&").unwrap_or(text);
        serde_json::from_str(body).map_err(|_| {
            // Deliberately no body snippet: login payloads can carry
            // secrets (ssecurity). Status + length is enough to triage
            // (e.g. gzip bytes here mean a broken Accept-Encoding setup).
            MiHomeError::login(
                -1,
                format!(
                    "登录响应解析失败(HTTP {status}，正文 {} 字节非 JSON)",
                    text.len()
                ),
            )
        })
    }

    fn handle_ret(&self, resp: Response, verify_code: bool) -> Result<Value, MiHomeError> {
        let status = resp.status().as_u16();
        if !resp.status().is_success() {
            return Err(MiHomeError::login(status as i64, "HTTP 错误"));
        }
        let text = resp.text().map_err(MiHomeError::Http)?;
        let data = self.parse_service_ret(status, &text)?;
        if verify_code && data.get("code").and_then(|v| v.as_i64()).unwrap_or(-1) != 0 {
            let code = data.get("code").and_then(|v| v.as_i64()).unwrap_or(-1);
            let desc = str_of(&data, "desc");
            let msg = if desc.is_empty() {
                "未知错误".to_string()
            } else {
                desc
            };
            return Err(MiHomeError::login(code, msg));
        }
        Ok(data)
    }

    fn cookies_of(resp: &Response) -> HashMap<String, String> {
        let mut out = HashMap::new();
        for c in resp.cookies() {
            out.insert(c.name().to_string(), c.value().to_string());
        }
        out
    }

    // ---------- login flow ----------

    /// Returns the pending query map, or `None`
    /// when the token refreshed fine (caller then saves + treats as logged in).
    fn get_location(&mut self) -> Result<Option<HashMap<String, String>>, MiHomeError> {
        let ua = self.user_agent();
        let device_id = self.device_id();
        let pass_o = self.pass_o();
        let pass_token = self.auth.get_str("passToken").unwrap_or_default();
        let user_id = self.auth.get_str("userId").unwrap_or_default();
        let c_user_id = self.auth.get_str("cUserId").unwrap_or_default();
        let locale = self.locale.clone();
        let cookie = format!(
            "deviceId={device_id};pass_o={pass_o};passToken={pass_token};userId={user_id};cUserId={c_user_id};uLocale={locale};",
        );
        let resp = self
            .http
            .get(&self.service_login_url)
            .header("User-Agent", ua)
            .header("Connection", "keep-alive")
            // No manual Accept-Encoding: reqwest manages it and decodes gzip
            // itself (see workspace reqwest features). A manual header
            // disables that and returns raw gzip bytes.
            .header("Content-Type", "application/x-www-form-urlencoded")
            .header("Cookie", cookie)
            .send()?;
        let service_data = self.handle_ret(resp, false)?;
        let location = str_of(&service_data, "location");
        let code = service_data
            .get("code")
            .and_then(|v| v.as_i64())
            .unwrap_or(-1);
        if code == 0 {
            // `cookies()` borrows the response while `text()` consumes it,
            // so capture cookies first, then read the body.
            let ret = self.http.get(&location).send()?;
            let status_ok = ret.status().is_success();
            let jar = Self::cookies_of(&ret);
            let body = ret.text().map_err(MiHomeError::Http)?;
            if status_ok && body == "ok" {
                for (k, v) in jar {
                    self.auth.set(&k, Value::String(v));
                }
                self.auth
                    .set("ssecurity", service_data["ssecurity"].clone());
                return Ok(None);
            }
        }
        // Parse the query string of `location` into a flat map.
        let mut map = HashMap::new();
        if let Some(qs) = location.split_once('?').map(|(_, q)| q) {
            for pair in qs.split('&') {
                if let Some((k, v)) = pair.split_once('=') {
                    let dk = urlencoding_decode(k);
                    let dv = urlencoding_decode(v);
                    map.insert(dk, dv);
                }
            }
        }
        Ok(Some(map))
    }

    fn refresh_token(&mut self) -> Result<(), MiHomeError> {
        if self.available() {
            debug!("Token 有效，无需刷新");
            return Ok(());
        }
        match self.get_location()? {
            None => {
                self.auth.save()?;
                info!("刷新Token成功");
                Ok(())
            }
            Some(_) => Err(MiHomeError::login(-1, "刷新Token失败，请重新登录")),
        }
    }

    /// Returns the QR bundle.
    pub fn qr_login_data(&mut self) -> Result<QrLoginData, MiHomeError> {
        // Single location round-trip: refresh check + QR params share it.
        let location = self
            .get_location()
            .map_err(|e| MiHomeError::login(-1, format!("获取登录二维码失败: {e}")))?;
        if location.is_none() {
            self.auth.save()?;
            info!("刷新Token成功，无需登录");
            return Ok(QrLoginData {
                refreshed: true,
                login_url: String::new(),
                qr_img: String::new(),
                lp: String::new(),
            });
        }
        let ua = self.user_agent();
        // Extra QR params (mirrors upstream update()).
        let ts = AuthStore::save_time_ms();
        let mut url =
            format!("{LOGIN_URL}?theme=&bizDeviceType=&_hasLogo=false&_qrsize=240&_dc={ts}");
        // Merge location query params first (sid etc. come from get_location).
        if let Some(map) = location {
            let mut parts: Vec<String> = map.into_iter().map(|(k, v)| format!("{k}={v}")).collect();
            parts.push(format!("_dc={ts}"));
            url = format!("{LOGIN_URL}?{}", parts.join("&"));
        }
        let resp = self
            .http
            .get(&url)
            .header("User-Agent", ua)
            .header("Content-Type", "application/x-www-form-urlencoded")
            .header("Connection", "keep-alive")
            .send()
            .map_err(|e| MiHomeError::login(-1, format!("获取登录二维码失败: {e}")))?;
        let data = self
            .handle_ret(resp, true)
            .map_err(|e| MiHomeError::login(-1, format!("获取登录二维码失败: {e}")))?;
        Ok(QrLoginData {
            refreshed: false,
            login_url: str_of(&data, "loginUrl"),
            qr_img: str_of(&data, "qr"),
            lp: str_of(&data, "lp"),
        })
    }

    /// 120s long-poll, blocking (call off-thread).
    pub fn complete_qr_login(&mut self, data: &QrLoginData) -> Result<(), MiHomeError> {
        let ua = self.user_agent();
        let poll = Client::builder()
            .timeout(QR_POLL_TIMEOUT)
            .connect_timeout(CONNECT_TIMEOUT)
            .build()?;
        let resp = poll
            .get(&data.lp)
            .header("User-Agent", ua.clone())
            .header("Content-Type", "application/x-www-form-urlencoded")
            .header("Connection", "keep-alive")
            .send()
            .map_err(|e| {
                if e.is_timeout() {
                    MiHomeError::login(-1, "超时，请重试")
                } else {
                    MiHomeError::login(-1, format!("扫码登录未完成: {e}"))
                }
            })?;
        let lp_data = self
            .handle_ret(resp, true)
            .map_err(|e| MiHomeError::login(-1, format!("扫码登录未完成: {e}")))?;
        for key in [
            "psecurity",
            "nonce",
            "ssecurity",
            "passToken",
            "userId",
            "cUserId",
        ] {
            self.auth.set(key, lp_data[key].clone());
        }
        let callback = str_of(&lp_data, "location");
        let cb = self
            .http
            .get(&callback)
            .header("User-Agent", ua)
            .send()
            .map_err(|e| MiHomeError::login(-1, format!("扫码登录未完成: {e}")))?;
        for (k, v) in Self::cookies_of(&cb) {
            self.auth.set(&k, Value::String(v));
        }
        let expire = chrono::Local::now().timestamp_millis() + 30 * 24 * 3600 * 1000;
        self.auth.set("expireTime", Value::from(expire));
        self.auth.save()?;
        info!("登录成功");
        Ok(())
    }

    // ---------- core encrypted request ----------

    /// POST an encrypted request; returns the `result` field.
    pub fn request(&mut self, uri: &str, data: Value, refresh: bool) -> Result<Value, MiHomeError> {
        debug!("请求 URI: {uri}，数据: {data}");
        if refresh {
            self.refresh_token()?;
        }
        let ssecurity = self.auth.get_str("ssecurity").unwrap_or_default();
        let url = format!("{API_BASE}{uri}");
        let payload = serde_json::to_string(&data).unwrap_or_else(|_| "{}".to_string());
        let nonce = gen_nonce();
        let signed = signed_nonce(&ssecurity, &nonce)?;
        let mut params = vec![("data".to_string(), payload)];
        let form = generate_enc_params(uri, "POST", &signed, &nonce, &mut params, &ssecurity)?;
        let headers = self.session_headers();
        let text = self
            .http
            .post(&url)
            .headers(headers)
            .form(&form_as_pairs(&form))
            .send()?
            .text()?;
        let mut ret: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
        if ret.get("code").is_none() && ret.get("result").is_none() {
            // Encrypted envelope: decrypt with (ssecurity, nonce).
            let dec = decrypt(&ssecurity, &nonce, &text)
                .map_err(|e| MiHomeError::api(-1, format!("响应解密失败: {e}")))?;
            ret = serde_json::from_str(&dec)
                .map_err(|e| MiHomeError::api(-1, format!("响应解析失败: {e}")))?;
        }
        debug!("响应数据: {ret}");
        let code = ret.get("code").and_then(|v| v.as_i64()).unwrap_or(0);
        match ret.get("result") {
            Some(result) if code == 0 => Ok(result.clone()),
            _ => {
                let msg = ret
                    .get("message")
                    .or_else(|| ret.get("desc"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("未知错误")
                    .to_string();
                Err(MiHomeError::api(code, msg))
            }
        }
    }

    // ---------- homes / devices / scenes ----------

    fn home_owner(&mut self, home_id: &str) -> Result<i64, MiHomeError> {
        let homes = self.homes_list()?;
        for h in homes.as_array().cloned().unwrap_or_default() {
            if h.get("id")
                .map(|v| v.to_string().trim_matches('"').to_string())
                .as_deref()
                == Some(home_id)
            {
                return h
                    .get("uid")
                    .and_then(|v| v.as_i64().or_else(|| v.as_str()?.parse().ok()))
                    .ok_or_else(|| {
                        MiHomeError::api(-1, format!("未找到 home_id={home_id} 的家庭信息"))
                    });
            }
        }
        Err(MiHomeError::api(
            -1,
            format!("未找到 home_id={home_id} 的家庭信息"),
        ))
    }

    pub fn homes_list(&mut self) -> Result<Value, MiHomeError> {
        let data = json!({"fg": true, "fetch_share": true, "fetch_share_dev": true,
            "fetch_cariot": true, "limit": 300, "app_ver": 7, "plat_form": 0});
        let result = self.request("/v2/homeroom/gethome_merged", data, true)?;
        Ok(result.get("homelist").cloned().unwrap_or(Value::Null))
    }

    fn devices_list_page(&mut self, home_id: &str) -> Result<Vec<Value>, MiHomeError> {
        let owner = self.home_owner(home_id)?;
        let home_int: i64 = home_id.parse().unwrap_or(0);
        let mut start_did = String::new();
        let mut devices = vec![];
        loop {
            let data = json!({
                "home_owner": owner, "home_id": home_int, "limit": 200,
                "start_did": start_did, "get_split_device": true,
                "support_smart_home": true, "get_cariot_device": true,
                "get_third_device": true
            });
            let ret = self.request("/home/home_device_list", data, true)?;
            let infos = ret
                .get("device_info")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();
            if infos.is_empty() {
                break;
            }
            for mut d in infos {
                d["home_id"] = Value::String(home_id.to_string());
                devices.push(d);
            }
            let max_did = str_of(&ret, "max_did");
            let has_more = ret
                .get("has_more")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            if !(has_more && !max_did.is_empty()) {
                break;
            }
            start_did = max_did;
        }
        Ok(devices)
    }

    pub fn devices_list(&mut self, home_id: Option<&str>) -> Result<Value, MiHomeError> {
        if let Some(hid) = home_id {
            return Ok(Value::Array(self.devices_list_page(hid)?));
        }
        let homes = self.homes_list()?;
        let mut out = vec![];
        for h in homes.as_array().cloned().unwrap_or_default() {
            let hid = h
                .get("id")
                .map(|v| v.to_string().trim_matches('"').to_string())
                .unwrap_or_default();
            out.extend(self.devices_list_page(&hid)?);
        }
        Ok(Value::Array(out))
    }

    pub fn shared_devices_list(&mut self) -> Result<Value, MiHomeError> {
        let data = json!({"ssid": "<unknown ssid>", "bssid": "02:00:00:00:00:00",
            "getVirtualModel": true, "getHuamiDevices": 1, "get_split_device": true,
            "support_smart_home": true, "get_cariot_device": true, "get_third_device": true,
            "get_phone_device": true, "get_miwear_device": true});
        let ret = self.request("/v2/home/device_list_page", data, true)?;
        let list = ret
            .get("list")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        let owned: Vec<Value> = list
            .into_iter()
            .filter(|d| d.get("owner").and_then(|v| v.as_bool()).unwrap_or(false))
            .map(|mut d| {
                d["home_id"] = Value::String("shared".to_string());
                d
            })
            .collect();
        Ok(Value::Array(owned))
    }

    fn scenes_page(&mut self, home_id: &str) -> Result<Vec<Value>, MiHomeError> {
        let owner = self.home_owner(home_id)?;
        let data =
            json!({"app_version": 12, "get_type": 2, "home_id": home_id, "owner_uid": owner});
        let ret = self.request(
            "/appgateway/miot/appsceneservice/AppSceneService/GetSimpleSceneList",
            data,
            true,
        )?;
        Ok(ret
            .get("manual_scene_info_list")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .map(|mut s| {
                s["home_id"] = Value::String(home_id.to_string());
                s
            })
            .collect())
    }

    pub fn scenes_list(&mut self, home_id: Option<&str>) -> Result<Value, MiHomeError> {
        if let Some(hid) = home_id {
            return Ok(Value::Array(self.scenes_page(hid)?));
        }
        let homes = self.homes_list()?;
        let mut out = vec![];
        for h in homes.as_array().cloned().unwrap_or_default() {
            let hid = h
                .get("id")
                .map(|v| v.to_string().trim_matches('"').to_string())
                .unwrap_or_default();
            out.extend(self.scenes_page(&hid)?);
        }
        Ok(Value::Array(out))
    }

    pub fn run_scene(&mut self, scene_id: &str, home_id: &str) -> Result<bool, MiHomeError> {
        let owner = self.home_owner(home_id)?;
        let data = json!({"scene_id": scene_id, "scene_type": 2, "phone_id": "null",
            "home_id": home_id, "owner_uid": owner});
        let ret = self.request(
            "/appgateway/miot/appsceneservice/AppSceneService/NewRunScene",
            data,
            true,
        )?;
        Ok(ret != Value::Null && ret != Value::Bool(false))
    }

    pub fn consumables(&mut self, home_id: Option<&str>) -> Result<Value, MiHomeError> {
        fn page(client: &mut MiHomeClient, hid: &str) -> Result<Vec<Value>, MiHomeError> {
            let owner = client.home_owner(hid)?;
            let hid_int: i64 = hid.parse().unwrap_or(0);
            let data = json!({"home_id": hid_int, "owner_id": owner, "filter_ignore": true});
            let ret = client.request("/v2/home/standard_consumable_items", data, true)?;
            let items = ret
                .get("items")
                .and_then(|v| v.as_array())
                .and_then(|a| a.first())
                .and_then(|i| i.get("consumes_data"))
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();
            Ok(items
                .into_iter()
                .map(|mut item| {
                    if let Some(details) = item.get("details").cloned() {
                        if let Some(arr) = details.as_array() {
                            if arr.len() == 1 {
                                item["details"] = arr[0].clone();
                            }
                        }
                    }
                    item["home_id"] = Value::String(hid.to_string());
                    item
                })
                .collect())
        }
        if let Some(hid) = home_id {
            return Ok(Value::Array(page(self, hid)?));
        }
        let homes = self.homes_list()?;
        let mut out = vec![];
        for h in homes.as_array().cloned().unwrap_or_default() {
            let hid = h
                .get("id")
                .map(|v| v.to_string().trim_matches('"').to_string())
                .unwrap_or_default();
            out.extend(page(self, &hid)?);
        }
        Ok(Value::Array(out))
    }

    // ---------- props / actions / statistics ----------

    pub fn prop_get(&mut self, params: &Value) -> Result<Value, MiHomeError> {
        self.request(
            "/miotspec/prop/get",
            json!({"params": params, "datasource": 1}),
            true,
        )
    }

    pub fn prop_get_single(&mut self, query: &Value) -> Result<Value, MiHomeError> {
        let ret = self.prop_get(&Value::Array(vec![query.clone()]))?;
        ret.as_array()
            .and_then(|a| a.first().cloned())
            .ok_or_else(|| MiHomeError::api(-1, "属性读取无返回"))
    }

    pub fn prop_set(&mut self, params: &Value) -> Result<Value, MiHomeError> {
        let mut ret = self.request("/miotspec/prop/set", json!({"params": params}), true)?;
        annotate_codes(&mut ret);
        Ok(ret)
    }

    pub fn prop_set_single(&mut self, req: &Value) -> Result<Value, MiHomeError> {
        let ret = self.prop_set(&Value::Array(vec![req.clone()]))?;
        Ok(ret
            .as_array()
            .and_then(|a| a.first().cloned())
            .unwrap_or(Value::Null))
    }

    pub fn action(&mut self, params: &Value) -> Result<Value, MiHomeError> {
        let list: Vec<Value> = match params {
            Value::Array(a) => a.clone(),
            single => vec![single.clone()],
        };
        let mut out = vec![];
        for p in list {
            let ret = self.request("/miotspec/action", json!({"params": p}), true)?;
            out.push(ret);
        }
        let mut v = Value::Array(out);
        annotate_codes(&mut v);
        if !params.is_array() {
            if let Some(first) = v.as_array().and_then(|a| a.first().cloned()) {
                return Ok(first);
            }
        }
        Ok(v)
    }

    pub fn action_single(&mut self, req: &Value) -> Result<Value, MiHomeError> {
        self.action(req)
    }

    pub fn statistics(&mut self, data: &Value) -> Result<Value, MiHomeError> {
        let list: Vec<Value> = match data {
            Value::Array(a) => a.clone(),
            single => vec![single.clone()],
        };
        let mut out = vec![];
        for p in &list {
            out.push(self.request("/v2/user/statistics", p.clone(), true)?);
        }
        if !data.is_array() {
            if let Some(first) = out.first().cloned() {
                return Ok(first);
            }
        }
        Ok(Value::Array(out))
    }

    pub fn check_new_msg(
        &mut self,
        begin_at: Option<i64>,
        refresh: bool,
    ) -> Result<Value, MiHomeError> {
        let now = chrono::Local::now().timestamp();
        self.request(
            "/v2/message/v2/check_new_msg",
            json!({"begin_at": begin_at.unwrap_or(now - 3600)}),
            refresh,
        )
    }

    // ---------- spec + icons ----------

    pub fn spec_info(&mut self, spec_type: &str) -> Result<SpecInfo, MiHomeError> {
        let dir = self.cache_dir().to_path_buf();
        get_device_info(spec_type, Some(&dir))
    }

    /// with a 302 redirect; read `Location` without following it.
    pub fn icon_url(&mut self, model: &str) -> Result<Option<String>, MiHomeError> {
        self.refresh_token()?;
        let ssecurity = self.auth.get_str("ssecurity").unwrap_or_default();
        let uri = "/v2/productconfig/get_icon";
        let payload = serde_json::to_string(&json!({"icon_name": "icon_real", "model": model}))
            .unwrap_or_default();
        let nonce = gen_nonce();
        let signed = signed_nonce(&ssecurity, &nonce)?;
        let mut params = vec![("data".to_string(), payload)];
        let form = generate_enc_params(uri, "POST", &signed, &nonce, &mut params, &ssecurity)?;
        let headers = self.session_headers();
        let no_redirect = Client::builder()
            .timeout(TOTAL_TIMEOUT)
            .connect_timeout(CONNECT_TIMEOUT)
            .redirect(reqwest::redirect::Policy::none())
            .build()?;
        let resp = no_redirect
            .post(format!("{API_BASE}{uri}"))
            .headers(headers)
            .form(&form_as_pairs(&form))
            .send()?;
        if resp.status().as_u16() != 302 {
            debug!("获取设备图标未重定向 {model}: HTTP {}", resp.status());
            return Ok(None);
        }
        Ok(resp
            .headers()
            .get("Location")
            .and_then(|v| v.to_str().ok())
            .map(str::to_string))
    }
}

fn annotate_codes(ret: &mut Value) {
    let items: &mut Vec<Value> = match ret {
        Value::Array(a) => a,
        single => {
            annotate_one(single);
            return;
        }
    };
    for item in items.iter_mut() {
        annotate_one(item);
    }
}

fn annotate_one(item: &mut Value) {
    let code = item.get("code").and_then(|v| v.as_i64()).unwrap_or(-1);
    let msg = if code == 0 || code == 1 {
        "成功"
    } else {
        crate::error::error_message(code)
    };
    item["message"] = Value::String(msg.to_string());
}

fn form_as_pairs(form: &[(String, String)]) -> Vec<(String, String)> {
    form.to_vec()
}

fn urlencoding_decode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => {
                out.push(' ');
                i += 1;
            }
            b'%' if i + 2 < bytes.len() => {
                if let Ok(hex) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                    out.push(hex as char);
                    i += 3;
                } else {
                    out.push('%');
                    i += 1;
                }
            }
            _ => {
                out.push(bytes[i] as char);
                i += 1;
            }
        }
    }
    // Percent-decoding is byte-oriented; rebuild lossily but correctly for
    // the ASCII keys upstream uses here (sid, nonce, ...).
    out
}
