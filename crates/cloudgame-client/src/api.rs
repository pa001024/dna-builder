//! sdk-api.yingxiong.com 业务接口（签名 body）与 usdk.yingxiong.com/hu AES 信封接口。

use std::collections::BTreeMap;

use anyhow::{bail, Context, Result};
use base64::Engine;
use serde_json::{json, Map, Value};

use crate::config;
use crate::sign;

fn value_to_field(v: &Value) -> Option<String> {
    match v {
        Value::Null => None,
        Value::Bool(b) => Some(b.to_string()),
        Value::Number(n) => Some(n.to_string()),
        Value::String(s) => {
            if s.trim().is_empty() {
                None
            } else {
                Some(s.clone())
            }
        }
        other => Some(other.to_string()),
    }
}

/// 对应 hN：body = data ∪ channelParams + deviceNum + sign（sign 计算剔除 market 与空值）。
fn signed_body(mut data: Map<String, Value>, device_num: &str) -> Map<String, Value> {
    if let Value::Object(cfg) = config::channel_params() {
        for (k, v) in cfg {
            data.entry(k).or_insert(v);
        }
    }
    data.insert("deviceNum".into(), device_num.into());

    let mut sign_fields: BTreeMap<String, String> = BTreeMap::new();
    for (k, v) in &data {
        if k == "market" {
            continue;
        }
        if let Some(s) = value_to_field(v) {
            sign_fields.insert(k.clone(), s);
        }
    }
    let sign = sign::sdk_sign(&sign_fields, config::APP_KEY);
    data.insert("sign".into(), sign.into());
    data
}

#[derive(Clone)]
pub struct SdkApi {
    http: reqwest::Client,
    device_num: String,
}

impl SdkApi {
    pub fn new(device_num: String) -> Self {
        Self {
            http: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(10))
                .build()
                .expect("reqwest"),
            device_num,
        }
    }

    /// 调 sdk-api，data 会被 merge channelParams/deviceNum/sign 后 urlencoded POST。
    pub async fn post(&self, path: &str, data: Map<String, Value>) -> Result<Value> {
        let body = signed_body(data, &self.device_num);
        let resp = self
            .http
            .post(format!("{}{}", config::SDK_API_BASE, path))
            .form(&body)
            .send()
            .await
            .with_context(|| format!("sdk-api {path} send"))?;
        let text = resp.text().await?;
        let v: Value = serde_json::from_str(&text)
            .with_context(|| format!("sdk-api {path} bad json: {text}"))?;
        Ok(v)
    }

    pub async fn cloudgame_init(&self) -> Result<Value> {
        self.post("/sdkcom/c1/cloudgame/init.lg", Map::new()).await
    }

    pub async fn user_info(&self, ctoken: &str) -> Result<Value> {
        let mut m = Map::new();
        m.insert("access_token".into(), ctoken.into());
        self.post("/sdkcom/c1/cloudgame/user/info.lg", m).await
    }

    /// play.lg。sdkMsg 原样回传（可能是 JSON 字符串或对象）。
    pub async fn play(&self, req: &PlayRequest) -> Result<Value> {
        let biz_data = serde_json::json!({
            "btype": "",
            "os": "WINDOWS",
            "osVer": "",
            "clientVer": config::SDK_CLIENT_VER,
            "osCategory": "H5",
            "isOneLine": 1,
            "extSDK": "{\"certHash\":true}",
            "ping": req.ping,
        });
        let mut m = Map::new();
        m.insert("userId".into(), req.user_id.clone().into());
        m.insert("node".into(), req.node.clone().into());
        m.insert("resolution".into(), req.resolution.clone().into());
        m.insert("bitRate".into(), config::BIT_RATE.into());
        m.insert("fps".into(), config::FPS.into());
        m.insert("codecType".into(), config::CODEC_TYPE_H264.into());
        m.insert("version".into(), "v1.0".into());
        m.insert("cmdLine".into(), "".into());
        m.insert("env".into(), 0.into());
        m.insert("bizData".into(), biz_data.to_string().into());
        m.insert("access_token".into(), req.ctoken.clone().into());
        m.insert("queueType".into(), req.queue_type.into());
        self.post("/sdkcom/c1/cloudgame/user/play.lg", m).await
    }

    /// autoLogin：phoneToken → code → getToken → access_token。
    pub async fn auto_login(&self, phone: &str, phone_token: &str) -> Result<AuthResult> {
        let mut m = config::common_data().as_object().unwrap().clone();
        m.insert("token".into(), phone_token.into());
        m.insert("phone".into(), phone.into());
        m.insert("client_id".into(), config::APP_KEY.into());
        let r = self.post("/sdkcom/c1/auth/phone/autoLogin.lg", m).await?;
        if r.get("codes").and_then(Value::as_i64) != Some(0) {
            bail!("autoLogin failed: {r}");
        }
        let code = r
            .get("code")
            .and_then(Value::as_str)
            .context("autoLogin: no code")?
            .to_string();
        self.get_token(&code).await
    }

    pub async fn get_token(&self, code: &str) -> Result<AuthResult> {
        let mut m = config::common_data().as_object().unwrap().clone();
        m.insert("code".into(), code.into());
        m.insert("client_id".into(), config::APP_KEY.into());
        m.insert("client_secret".into(), config::APP_SECRET.into());
        let r = self.post("/sdkcom/auth/getToken.lg", m).await?;
        if r.get("codes").and_then(Value::as_i64) != Some(0) {
            bail!("getToken failed: {r}");
        }
        let access_token = r
            .get("access_token")
            .or_else(|| r.pointer("/data/access_token"))
            .and_then(Value::as_str)
            .context("getToken: no access_token")?
            .to_string();
        Ok(AuthResult { access_token })
    }
}

pub struct PlayRequest {
    pub user_id: String,
    pub node: String,
    pub resolution: String,
    pub ctoken: String,
    pub queue_type: i64,
    /// bizData.ping —— 节点测速结果 [{nodeId, result}]
    pub ping: Vec<serde_json::Value>,
}

pub struct AuthResult {
    pub access_token: String,
}

/// usdk 信封（对应 JP）。is_init 对应 /v1/sys/init.lg 的未加密分支。
fn usdk_envelope(
    body: Map<String, Value>,
    pcode: Option<&str>,
    app_key: Option<&str>,
    is_init: bool,
) -> Map<String, Value> {
    let (key, iv) = config::usdk_aes_key();
    let mut data = serde_json::json!({
        "lang": "zh-CN",
        "active": "1",
        "smd5": "1",
        "vc": "1",
        "vn": "1",
        "svc": "0.0.1",
        "svn": "0.0.1",
        "cc": "10",
        "cn": config::CSDK_VERSION,
        "plat": "4",
        "dn": "1111",
        "imei": "111",
        "imsi": "",
        "ov": "",
        "om": "",
        "pk": config::PKG,
        "channel": config::CHANNEL,
        "cid": config::CID,
    });
    let data_obj = data.as_object_mut().unwrap();
    for (k, v) in body {
        data_obj.insert(k, v);
    }
    let plain = data.to_string();
    let inner = if is_init {
        plain
    } else {
        sign::aes_encrypt_b64(plain.as_bytes(), &key, &iv)
    };
    let b64 = base64::engine::general_purpose::STANDARD.encode(inner.as_bytes());
    let swapped = sign::swap_b64(&b64);
    let ts = (std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs())
    .to_string();

    let mut env = Map::new();
    env.insert(
        "pcode".into(),
        pcode.map_or(Value::Null, |s| s.to_string().into()),
    );
    env.insert("timestamp".into(), ts.into());
    env.insert("data".into(), swapped.into());
    if !is_init {
        env.insert("_e_".into(), config::USDK_AKI.into());
    }
    let mut sign_fields: BTreeMap<String, String> = BTreeMap::new();
    for (k, v) in &env {
        if let Some(s) = value_to_field(v) {
            sign_fields.insert(k.clone(), s);
        }
    }
    // usdk 签名不做换位（ZP = 纯 md5 hex）。
    let mut joined = sign_fields
        .iter()
        .map(|(k, v)| format!("{k}={v}"))
        .collect::<Vec<_>>()
        .join("&");
    joined.push('&');
    joined.push_str(app_key.unwrap_or("null"));
    env.insert(
        "sign".into(),
        format!("{:x}", md5::compute(joined)).into(),
    );
    env
}

#[derive(Clone)]
pub struct UsdkApi {
    http: reqwest::Client,
    pub product_id: String,
    pub product_key: String,
}

impl UsdkApi {
    pub fn new(product_id: String, product_key: String) -> Self {
        Self {
            http: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(10))
                .build()
                .expect("reqwest"),
            product_id,
            product_key,
        }
    }

    async fn post(&self, path: &str, body: Map<String, Value>, is_init: bool) -> Result<Value> {
        let env = usdk_envelope(
            body,
            if self.product_id.is_empty() {
                None
            } else {
                Some(&self.product_id)
            },
            if self.product_key.is_empty() {
                None
            } else {
                Some(&self.product_key)
            },
            is_init,
        );
        let resp = self
            .http
            .post(format!("{}{}", config::USDK_API_BASE, path))
            .form(&env)
            .send()
            .await
            .with_context(|| format!("usdk {path} send"))?;
        let text = resp.text().await?;
        let (key, iv) = config::usdk_aes_key();
        sign::usdk_decode_response(&text, &key, &iv)
            .with_context(|| format!("usdk {path} decode: {text}"))
    }

    pub async fn sys_init(&self) -> Result<Value> {
        self.post("/v1/sys/init.lg", Map::new(), true).await
    }

    /// checklgn：access_token(usdk) → cToken/cUid/cName 等会话数据。
    pub async fn check_login(&self, access_token: &str) -> Result<Value> {
        let mut m = Map::new();
        m.insert("cToken".into(), access_token.into());
        self.post("/v1/login/checklgn.lg", m, false).await
    }
}
