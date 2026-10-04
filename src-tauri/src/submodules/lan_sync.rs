//! 局域网设备发现与一键登录同步服务。
//!
//! 开启后在本机监听两个端口：
//! - HTTPS（默认 28182）：供手机 App 调用的配对 / 状态 / 双向同步接口，
//!   使用自签 CA + 叶子证书组成的证书链（首次开启时生成并持久化到应用数据目录，
//!   手机端通过 `/api/cert` 获取同一份 CA 做证书固定）；
//! - UDP（默认 28183）：应答手机 App 的局域网广播探测。
//!
//! 账号数据本体（DOB 社区账号、DNA 游戏账号）由前端通过
//! `update_lan_sync_snapshot` 注入，Rust 侧只做转发与暂存，不做任何解析。

use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use axum_server::tls_rustls::RustlsConfig;
use rcgen::{
    BasicConstraints, CertificateParams, DnType, ExtendedKeyUsagePurpose, IsCa, KeyPair,
    KeyUsagePurpose, SanType,
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::net::{IpAddr, UdpSocket};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU16, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};
use tokio::net::UdpSocket as TokioUdpSocket;
use tokio::sync::{oneshot, watch};
use tokio::task::JoinHandle;

/// 发现协议固定前缀：UDP 广播载荷与应答都必须携带该字段
const DISCOVERY_PROTOCOL: &str = "dna-builder-lan";
/// 同步协议版本，双方不一致时拒绝服务
const PROTOCOL_VERSION: u32 = 1;

// ============================================================================
// 自签证书
// ============================================================================

/// 应用数据目录下的证书子目录名
const CERT_DIR: &str = "lan-sync";
/// 自签 CA 证书（PEM）
const CA_CERT_FILE: &str = "ca.pem";
/// 自签 CA 私钥（PEM）
const CA_KEY_FILE: &str = "ca.key.pem";
/// 服务器证书链（叶子 + CA，PEM）
const SERVER_CHAIN_FILE: &str = "server-chain.pem";
/// 服务器私钥（PEM）
const SERVER_KEY_FILE: &str = "server.key.pem";
/// CA 证书主题（手机端据此识别并固定信任）
const CA_COMMON_NAME: &str = "DNA Builder LAN Sync CA";
/// 等待桌面端用户弹窗确认配对的超时时间
const PAIR_CONFIRM_TIMEOUT: Duration = Duration::from_secs(60);

// ============================================================================
// 数据结构
// ============================================================================

/// 已配对设备记录：token 是后续所有接口的鉴权凭据
/// IPC 字段名以 camelCase 为准（与前端 TS 接口一致）；前端回传的历史设备不含时间戳，缺省补 0
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairedDevice {
    pub device_id: String,
    pub device_name: String,
    pub token: String,
    /// 配对时间（Unix 毫秒）
    #[serde(default)]
    pub paired_at: u64,
    /// 最近一次通过鉴权请求的时间（Unix 毫秒）
    #[serde(default)]
    pub last_seen_at: u64,
}

/// 手机 App 配对请求
/// 线上字段名以 camelCase 为准（与 spec 一致），snake_case 作为别名兼容
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PairRequest {
    /// 手机端自己生成的稳定设备 id
    #[serde(alias = "device_id")]
    device_id: String,
    /// 手机端展示名（如机型名）
    #[serde(alias = "device_name")]
    device_name: String,
}

/// 同步请求体：`push` 为手机端推给桌面的账号数据，缺省表示只拉取
#[derive(Debug, Deserialize)]
struct SyncRequest {
    #[serde(default)]
    push: Option<SyncPush>,
}

/// 手机端推送的账号数据，字段全部是宽松的 `Value`，由前端负责解析与合并
#[derive(Debug, Deserialize)]
struct SyncPush {
    #[serde(default)]
    dob: Option<Value>,
    #[serde(rename = "dnaUsers", alias = "dna_users", default)]
    dna_users: Option<Vec<Value>>,
}

/// 待用户弹窗确认的配对请求：requestId -> 应答通道（true = 允许）
type PairConfirmSender = oneshot::Sender<bool>;

/// 共享运行时状态：全局单例，命令层与 HTTP 层共同访问
pub struct LanSyncShared {
    running: AtomicBool,
    https_port: AtomicU16,
    udp_port: AtomicU16,
    /// 本机标识（每次应用启动生成一次，手机端用于去重广播）
    device_id: OnceLock<String>,
    device_name: OnceLock<String>,
    /// 已配对设备：token -> 记录
    devices: Mutex<HashMap<String, PairedDevice>>,
    /// 等待用户弹窗确认的配对请求
    pending_pairs: Mutex<HashMap<String, PairConfirmSender>>,
    /// 自签 CA 证书 PEM（手机端通过 /api/cert 获取，做证书固定）
    ca_pem: Mutex<String>,
    /// CA 证书指纹（PEM 字节的 SHA-256 hex，UDP 通告与 /api/info 一并下发）
    ca_fingerprint: Mutex<String>,
    /// 前端注入的账号快照，直接作为 /sync 的响应体
    snapshot: Mutex<Value>,
    /// 快照修订号：前端每次更新快照后自增，/sync 用它等待导入完成
    revision: AtomicU64,
    revision_tx: watch::Sender<u64>,
    revision_rx: watch::Receiver<u64>,
    app: Mutex<Option<AppHandle>>,
    tasks: Mutex<Vec<JoinHandle<()>>>,
}

static LAN_SYNC: OnceLock<Arc<LanSyncShared>> = OnceLock::new();

/**
 * 获取全局共享状态（懒初始化）。
 */
fn shared() -> Arc<LanSyncShared> {
    LAN_SYNC
        .get_or_init(|| {
            let (revision_tx, revision_rx) = watch::channel(0u64);
            Arc::new(LanSyncShared {
                running: AtomicBool::new(false),
                https_port: AtomicU16::new(0),
                udp_port: AtomicU16::new(0),
                device_id: OnceLock::new(),
                device_name: OnceLock::new(),
                devices: Mutex::new(HashMap::new()),
                pending_pairs: Mutex::new(HashMap::new()),
                ca_pem: Mutex::new(String::new()),
                ca_fingerprint: Mutex::new(String::new()),
                snapshot: Mutex::new(Value::Null),
                revision: AtomicU64::new(0),
                revision_tx,
                revision_rx,
                app: Mutex::new(None),
                tasks: Mutex::new(Vec::new()),
            })
        })
        .clone()
}

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 读取当前 Unix 毫秒时间戳。
 */
fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/**
 * 生成本机稳定标识（应用会话内不变）。
 */
fn ensure_device_id() -> String {
    shared()
        .device_id
        .get_or_init(|| uuid::Uuid::new_v4().to_string())
        .clone()
}

/**
 * 探测本机名：优先取系统环境变量，取不到时用固定兜底名。
 */
fn detect_device_name() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "DNA Builder".to_string())
}

/**
 * 通过 UDP connect 探测本机主网卡局域网 IP（仅用于界面展示与证书 SAN，
 * 手机端实际地址以 UDP 发现应答为准）。
 */
fn detect_local_address() -> Option<String> {
    detect_local_ip().map(|ip| ip.to_string())
}

/**
 * 探测本机主网卡局域网 IP。
 */
fn detect_local_ip() -> Option<IpAddr> {
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    Some(socket.local_addr().ok()?.ip())
}

/**
 * 计算 CA 证书 PEM 字节的 SHA-256 指纹（hex）。
 * 手机端比对 UDP 通告中的指纹与实际下载到的证书是否一致。
 */
fn ca_fingerprint(ca_pem: &str) -> String {
    let digest = Sha256::digest(ca_pem.as_bytes());
    digest.iter().map(|b| format!("{b:02x}")).collect()
}

/**
 * 生成自签 CA 与服务器叶子证书（证书链），返回四段 PEM：
 * (CA 证书, 服务器证书, CA 私钥, 服务器私钥)。
 *
 * CA 长期复用（手机端固定信任的对象），叶子证书固定 SAN 覆盖
 * `dna-builder.local`、127.0.0.1 与当前主网卡 IP。
 * @exception rcgen 生成失败时返回中文错误信息
 */
fn generate_certs(primary_ip: Option<IpAddr>) -> Result<(String, String, String, String), String> {
    // 自签 CA：长期身份，手机端信任锚
    let ca_key = KeyPair::generate().map_err(|error| format!("生成 CA 密钥失败: {error}"))?;
    let mut ca_params = CertificateParams::new(Vec::<String>::new())
        .map_err(|error| format!("生成 CA 参数失败: {error}"))?;
    ca_params
        .distinguished_name
        .push(DnType::CommonName, CA_COMMON_NAME);
    ca_params.is_ca = IsCa::Ca(BasicConstraints::Unconstrained);
    ca_params.key_usages = vec![KeyUsagePurpose::KeyCertSign, KeyUsagePurpose::CrlSign];
    ca_params.not_before = rcgen::date_time_ymd(2025, 1, 1);
    ca_params.not_after = rcgen::date_time_ymd(2035, 1, 1);
    let ca_cert = ca_params
        .self_signed(&ca_key)
        .map_err(|error| format!("自签 CA 失败: {error}"))?;

    // 服务器叶子证书：由 CA 签发，SAN 覆盖本机地址
    let server_key = KeyPair::generate().map_err(|error| format!("生成服务器密钥失败: {error}"))?;
    let mut server_params = CertificateParams::new(vec!["dna-builder-lan".to_string()])
        .map_err(|error| format!("生成服务器证书参数失败: {error}"))?;
    server_params
        .distinguished_name
        .push(DnType::CommonName, "dna-builder-lan");
    server_params.key_usages = vec![
        KeyUsagePurpose::DigitalSignature,
        KeyUsagePurpose::KeyEncipherment,
    ];
    server_params.extended_key_usages = vec![ExtendedKeyUsagePurpose::ServerAuth];
    let mut sans = vec![SanType::IpAddress(IpAddr::from([127u8, 0, 0, 1]))];
    if let Some(ip) = primary_ip {
        sans.push(SanType::IpAddress(ip));
    }
    server_params.subject_alt_names = sans;
    server_params.not_before = rcgen::date_time_ymd(2025, 1, 1);
    server_params.not_after = rcgen::date_time_ymd(2035, 1, 1);
    let server_cert = server_params
        .signed_by(&server_key, &ca_cert, &ca_key)
        .map_err(|error| format!("签发服务器证书失败: {error}"))?;

    Ok((
        ca_cert.pem(),
        server_cert.pem(),
        ca_key.serialize_pem(),
        server_key.serialize_pem(),
    ))
}

/// 加载结果：证书链与私钥文件路径 + 展示用的 CA 证书与指纹
struct LanSyncCerts {
    chain_path: PathBuf,
    key_path: PathBuf,
    ca_pem: String,
    ca_fingerprint: String,
}

/**
 * 加载或首次生成自签证书链并持久化到应用数据目录。
 *
 * 四个文件齐全时直接复用（保证手机端固定信任的 CA 不变），否则整体重新生成。
 * @param app_data_dir 应用数据目录（tauri app_data_dir）
 * @returns 证书链与私钥路径及 CA 指纹
 * @exception 文件读写或证书生成失败时返回中文错误信息
 */
fn load_or_create_certs(app_data_dir: PathBuf) -> Result<LanSyncCerts, String> {
    let dir = app_data_dir.join(CERT_DIR);
    std::fs::create_dir_all(&dir).map_err(|error| format!("创建证书目录失败: {error}"))?;
    let ca_path = dir.join(CA_CERT_FILE);
    let ca_key_path = dir.join(CA_KEY_FILE);
    let chain_path = dir.join(SERVER_CHAIN_FILE);
    let key_path = dir.join(SERVER_KEY_FILE);

    let ca_pem = if ca_path.exists()
        && ca_key_path.exists()
        && chain_path.exists()
        && key_path.exists()
    {
        // 复用既有证书：CA 指纹保持稳定，手机端无需重新固定
        std::fs::read_to_string(&ca_path).map_err(|error| format!("读取 CA 证书失败: {error}"))?
    } else {
        let (ca_pem, server_pem, ca_key_pem, server_key_pem) = generate_certs(detect_local_ip())?;
        std::fs::write(&ca_path, &ca_pem).map_err(|error| format!("写入 CA 证书失败: {error}"))?;
        std::fs::write(&ca_key_path, &ca_key_pem)
            .map_err(|error| format!("写入 CA 私钥失败: {error}"))?;
        // 证书链 = 叶子在前 + CA 在后，axum-server 按此顺序下发
        std::fs::write(&chain_path, format!("{server_pem}\n{ca_pem}"))
            .map_err(|error| format!("写入服务器证书链失败: {error}"))?;
        std::fs::write(&key_path, &server_key_pem)
            .map_err(|error| format!("写入服务器私钥失败: {error}"))?;
        ca_pem
    };
    let fingerprint = ca_fingerprint(&ca_pem);
    Ok(LanSyncCerts {
        chain_path,
        key_path,
        ca_pem,
        ca_fingerprint: fingerprint,
    })
}

/**
 * 从请求头提取 Bearer token。
 */
fn extract_bearer(headers: &HeaderMap) -> Option<String> {
    let value = headers
        .get(axum::http::header::AUTHORIZATION)?
        .to_str()
        .ok()?;
    value.strip_prefix("Bearer ").map(|s| s.trim().to_string())
}

/**
 * 统一构造 JSON 错误响应。
 */
fn error_response(status: StatusCode, code: &str, message: &str) -> Response {
    (
        status,
        Json(json!({ "ok": false, "code": code, "message": message })),
    )
        .into_response()
}

/**
 * 校验 Bearer token 是否属于已配对设备，通过时返回 token 供后续使用。
 */
fn authorize(state: &Arc<LanSyncShared>, headers: &HeaderMap) -> Result<String, Response> {
    if !state.running.load(Ordering::Acquire) {
        return Err(error_response(
            StatusCode::FORBIDDEN,
            "SYNC_DISABLED",
            "局域网同步未开启",
        ));
    }
    let token = match extract_bearer(headers) {
        Some(t) if !t.is_empty() => t,
        _ => {
            return Err(error_response(
                StatusCode::UNAUTHORIZED,
                "UNAUTHORIZED",
                "缺少鉴权 token",
            ));
        }
    };
    let known = state
        .devices
        .lock()
        .map(|devices| devices.contains_key(&token))
        .unwrap_or(false);
    if !known {
        return Err(error_response(
            StatusCode::UNAUTHORIZED,
            "BAD_TOKEN",
            "设备未配对",
        ));
    }
    Ok(token)
}

/**
 * 更新设备最近活跃时间。
 */
fn touch_device(state: &Arc<LanSyncShared>, token: &str) {
    if let Ok(mut devices) = state.devices.lock() {
        if let Some(device) = devices.get_mut(token) {
            device.last_seen_at = now_ms();
        }
    }
}

/**
 * 读取当前快照（加锁失败时返回 Null 兜底）。
 */
fn current_snapshot(state: &Arc<LanSyncShared>) -> Value {
    state
        .snapshot
        .lock()
        .ok()
        .map(|g| g.clone())
        .unwrap_or(Value::Null)
}

// ============================================================================
// HTTP 处理器
// ============================================================================

/**
 * 无鉴权信息接口：手机 App 在配对前确认目标机器、协议版本与 CA 指纹。
 */
async fn handle_info(State(state): State<Arc<LanSyncShared>>) -> Response {
    (
        StatusCode::OK,
        Json(json!({
            "ok": true,
            "protocol": DISCOVERY_PROTOCOL,
            "protocolVersion": PROTOCOL_VERSION,
            "deviceId": ensure_device_id(),
            "deviceName": state.device_name.get().cloned().unwrap_or_default(),
            "caFingerprint": state.ca_fingerprint.lock().ok().map(|g| g.clone()).unwrap_or_default(),
        })),
    )
        .into_response()
}

/**
 * 证书接口（无鉴权，证书本身是公开材料）：
 * 手机端首次配对时获取自签 CA，保存后作为后续所有 HTTPS 连接的唯一信任锚。
 */
async fn handle_cert(State(state): State<Arc<LanSyncShared>>) -> Response {
    (
        StatusCode::OK,
        Json(json!({
            "ok": true,
            "caPem": state.ca_pem.lock().ok().map(|g| g.clone()).unwrap_or_default(),
            "caFingerprint": state.ca_fingerprint.lock().ok().map(|g| g.clone()).unwrap_or_default(),
        })),
    )
        .into_response()
}

/**
 * 配对接口：向桌面端用户弹窗确认，允许后签发设备 token 并通知前端持久化。
 *
 * 请求会挂起等待用户在弹窗上的决定，最长 PAIR_CONFIRM_TIMEOUT；
 * 拒绝 / 超时分别返回 PAIR_DENIED / PAIR_TIMEOUT。
 */
async fn handle_pair(
    State(state): State<Arc<LanSyncShared>>,
    Json(req): Json<PairRequest>,
) -> Response {
    if !state.running.load(Ordering::Acquire) {
        return error_response(StatusCode::FORBIDDEN, "SYNC_DISABLED", "局域网同步未开启");
    }
    let device_id = req.device_id.trim().to_string();
    let device_name = req.device_name.trim().to_string();
    if device_id.is_empty() || device_name.is_empty() {
        return error_response(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            "deviceId/deviceName 不能为空",
        );
    }

    // 挂起等待前端弹窗决定：requestId 作为应答通道的键
    let request_id = uuid::Uuid::new_v4().to_string();
    let (tx, rx) = oneshot::channel::<bool>();
    if let Ok(mut pending) = state.pending_pairs.lock() {
        pending.insert(request_id.clone(), tx);
    }

    if let Some(app) = state.app.lock().ok().and_then(|g| g.clone()) {
        let _ = app.emit(
            "lan-sync-pair-request",
            json!({
                "requestId": request_id,
                "deviceId": device_id,
                "deviceName": device_name,
            }),
        );
    }

    let approved = match tokio::time::timeout(PAIR_CONFIRM_TIMEOUT, rx).await {
        // 用户在弹窗上做出决定
        Ok(Ok(decision)) => decision,
        // 用户超时未响应
        Err(_) => {
            if let Ok(mut pending) = state.pending_pairs.lock() {
                pending.remove(&request_id);
            }
            return error_response(
                StatusCode::FORBIDDEN,
                "PAIR_TIMEOUT",
                "桌面端未在限时内确认配对",
            );
        }
        // 前端应答通道异常（理论上仅在服务停止时发生）
        Ok(Err(_)) => {
            if let Ok(mut pending) = state.pending_pairs.lock() {
                pending.remove(&request_id);
            }
            return error_response(StatusCode::FORBIDDEN, "PAIR_DENIED", "配对已被取消");
        }
    };
    if !approved {
        return error_response(StatusCode::FORBIDDEN, "PAIR_DENIED", "用户拒绝了本次配对");
    }

    let token = uuid::Uuid::new_v4().to_string();
    let device = PairedDevice {
        device_id,
        device_name,
        token: token.clone(),
        paired_at: now_ms(),
        last_seen_at: now_ms(),
    };
    if let Ok(mut devices) = state.devices.lock() {
        // 同一物理设备重复配对时吊销旧 token
        devices.retain(|_, old| old.device_id != device.device_id);
        devices.insert(token.clone(), device.clone());
    }

    // 通知前端持久化 token，应用重启后无需再次配对
    if let Some(app) = state.app.lock().ok().and_then(|g| g.clone()) {
        let _ = app.emit(
            "lan-sync-paired",
            json!({
                "deviceId": device.device_id,
                "deviceName": device.device_name,
                "token": device.token,
                "pairedAt": device.paired_at,
            }),
        );
    }

    (
        StatusCode::OK,
        Json(json!({
            "ok": true,
            "token": token,
            "protocolVersion": PROTOCOL_VERSION,
            "deviceName": state.device_name.get().cloned().unwrap_or_default(),
        })),
    )
        .into_response()
}

/**
 * 状态接口（需鉴权）：手机 App 在同步前确认桌面端账号概况。
 */
async fn handle_status(State(state): State<Arc<LanSyncShared>>, headers: HeaderMap) -> Response {
    if let Err(resp) = authorize(&state, &headers) {
        return resp;
    }
    let snapshot = current_snapshot(&state);
    (
        StatusCode::OK,
        Json(json!({
            "ok": true,
            "protocolVersion": PROTOCOL_VERSION,
            "deviceName": state.device_name.get().cloned().unwrap_or_default(),
            "caFingerprint": state.ca_fingerprint.lock().ok().map(|g| g.clone()).unwrap_or_default(),
            "hasDob": snapshot.get("dob").map(|v| !v.is_null()).unwrap_or(false),
            "dnaCount": snapshot
                .get("dnaUsers")
                .and_then(|v| v.as_array())
                .map(|a| a.len())
                .unwrap_or(0),
        })),
    )
        .into_response()
}

/**
 * 双向同步接口（需鉴权）：
 * 收到手机端推送后转发给前端导入，并等待前端刷新快照后再返回桌面端数据，
 * 保证一次请求完成「推 + 拉」两个方向。
 */
async fn handle_sync(
    State(state): State<Arc<LanSyncShared>>,
    headers: HeaderMap,
    Json(req): Json<SyncRequest>,
) -> Response {
    let token = match authorize(&state, &headers) {
        Ok(token) => token,
        Err(resp) => return resp,
    };
    touch_device(&state, &token);

    let revision_before = state.revision.load(Ordering::Acquire);
    if let Some(push) = req.push {
        // 空推送不触发导入流程，避免无意义的等待
        let has_content = push.dob.as_ref().map(|v| !v.is_null()).unwrap_or(false)
            || push
                .dna_users
                .as_ref()
                .map(|v| !v.is_empty())
                .unwrap_or(false);
        if has_content {
            if let Some(app) = state.app.lock().ok().and_then(|g| g.clone()) {
                let _ = app.emit(
                    "lan-sync-incoming",
                    json!({
                        "dob": push.dob,
                        "dnaUsers": push.dna_users.unwrap_or_default(),
                    }),
                );
            }
            wait_revision_change(&state, revision_before, Duration::from_millis(2000)).await;
        }
    }

    (
        StatusCode::OK,
        Json(json!({ "ok": true, "pull": current_snapshot(&state) })),
    )
        .into_response()
}

/**
 * 等待快照修订号越过 `before`（前端导入完成会自增），超时后直接返回当前快照。
 */
async fn wait_revision_change(state: &Arc<LanSyncShared>, before: u64, timeout: Duration) {
    let mut rx = state.revision_rx.clone();
    if *rx.borrow() > before {
        return;
    }
    let _ = tokio::time::timeout(timeout, async {
        loop {
            if rx.changed().await.is_err() {
                return;
            }
            if *rx.borrow() > before {
                return;
            }
        }
    })
    .await;
}

// ============================================================================
// UDP 发现
// ============================================================================

/**
 * UDP 发现循环：收到合法探测包后单播应答本机通告信息。
 * 桌面端只应答不广播，无需设置 SO_BROADCAST。
 */
async fn udp_discovery_loop(state: Arc<LanSyncShared>, socket: TokioUdpSocket) {
    let mut buffer = [0u8; 1024];
    loop {
        let (size, peer) = match socket.recv_from(&mut buffer).await {
            Ok(result) => result,
            Err(_) => continue,
        };
        let Ok(text) = std::str::from_utf8(&buffer[..size]) else {
            continue;
        };
        let Ok(message) = serde_json::from_str::<Value>(text) else {
            continue;
        };
        let is_probe = message.get("protocol").and_then(|v| v.as_str()) == Some(DISCOVERY_PROTOCOL)
            && message.get("type").and_then(|v| v.as_str()) == Some("discover");
        if !is_probe || !state.running.load(Ordering::Acquire) {
            continue;
        }
        let snapshot = current_snapshot(&state);
        let announce = json!({
            "protocol": DISCOVERY_PROTOCOL,
            "version": PROTOCOL_VERSION,
            "type": "announce",
            "deviceId": ensure_device_id(),
            "deviceName": state.device_name.get().cloned().unwrap_or_default(),
            "httpsPort": state.https_port.load(Ordering::Acquire),
            "caFingerprint": state.ca_fingerprint.lock().ok().map(|g| g.clone()).unwrap_or_default(),
            "hasDob": snapshot.get("dob").map(|v| !v.is_null()).unwrap_or(false),
            "dnaCount": snapshot
                .get("dnaUsers")
                .and_then(|v| v.as_array())
                .map(|a| a.len())
                .unwrap_or(0),
            "ts": now_ms(),
        });
        let _ = socket.send_to(announce.to_string().as_bytes(), peer).await;
    }
}

// ============================================================================
// 生命周期
// ============================================================================

/**
 * 运行状态快照（命令层返回值）。
 */
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LanSyncStatus {
    pub running: bool,
    pub https_port: u16,
    pub udp_port: u16,
    pub device_id: String,
    pub device_name: String,
    /// 本机局域网地址（仅主网卡，供界面展示）
    pub address: String,
    /// 自签 CA 证书指纹（SHA-256 hex），手机端固定信任的比对依据
    pub ca_fingerprint: String,
    pub devices: Vec<PairedDevice>,
}

/**
 * 汇总当前运行状态。
 */
fn build_status(state: &Arc<LanSyncShared>) -> LanSyncStatus {
    let devices = state
        .devices
        .lock()
        .map(|devices| {
            let mut list: Vec<PairedDevice> = devices.values().cloned().collect();
            list.sort_by(|a, b| b.paired_at.cmp(&a.paired_at));
            list
        })
        .unwrap_or_default();
    LanSyncStatus {
        running: state.running.load(Ordering::Acquire),
        https_port: state.https_port.load(Ordering::Acquire),
        udp_port: state.udp_port.load(Ordering::Acquire),
        device_id: ensure_device_id(),
        device_name: state
            .device_name
            .get()
            .cloned()
            .unwrap_or_else(detect_device_name),
        address: detect_local_address().unwrap_or_default(),
        ca_fingerprint: state
            .ca_fingerprint
            .lock()
            .ok()
            .map(|g| g.clone())
            .unwrap_or_default(),
        devices,
    }
}

/**
 * 启动局域网同步服务（幂等：已运行时直接返回当前状态）。
 *
 * @param app_handle 用于向前端发事件（配对成功 / 收到推送），并据此定位应用数据目录
 * @param https_port HTTPS 端口，0 表示默认 28182
 * @param udp_port UDP 发现端口，0 表示默认 28183
 * @param paired_devices 前端持久化的历史配对设备（含 token）
 * @returns 启动后的完整运行状态
 * @exception 端口绑定失败或证书生成失败时返回中文错误信息
 */
pub async fn start_lan_sync(
    app_handle: AppHandle,
    https_port: u16,
    udp_port: u16,
    paired_devices: Vec<PairedDevice>,
) -> Result<LanSyncStatus, String> {
    let state = shared();
    if state.running.load(Ordering::Acquire) {
        return Ok(build_status(&state));
    }

    let https_port = if https_port == 0 { 28182 } else { https_port };
    let udp_port = if udp_port == 0 { 28183 } else { udp_port };

    // rustls 需要进程级加密提供者；已被其他依赖安装时忽略本次安装
    let _ = rustls::crypto::ring::default_provider().install_default();
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|error| format!("获取应用数据目录失败: {error}"))?;
    let certs = load_or_create_certs(app_data_dir)?;
    let tls_config = RustlsConfig::from_pem_chain_file(&certs.chain_path, &certs.key_path)
        .await
        .map_err(|error| format!("加载 TLS 证书失败: {error}"))?;

    let socket = TokioUdpSocket::bind(("0.0.0.0", udp_port))
        .await
        .map_err(|error| format!("UDP 发现端口 {udp_port} 绑定失败: {error}"))?;

    let app = Router::new()
        .route("/api/info", get(handle_info))
        .route("/api/cert", get(handle_cert))
        .route("/api/pair", post(handle_pair))
        .route("/api/status", get(handle_status))
        .route("/api/sync", post(handle_sync))
        .with_state(state.clone());
    let bind_addr = std::net::SocketAddr::from(([0u8, 0, 0, 0], https_port));
    let https_task = tokio::spawn(async move {
        let _ = axum_server::bind_rustls(bind_addr, tls_config)
            .serve(app.into_make_service())
            .await;
    });
    let udp_task = tokio::spawn(udp_discovery_loop(state.clone(), socket));

    {
        let mut guard = state
            .app
            .lock()
            .map_err(|_| "写入 AppHandle 失败".to_string())?;
        *guard = Some(app_handle);
    }
    {
        let mut devices = state
            .devices
            .lock()
            .map_err(|_| "读取配对设备失败".to_string())?;
        devices.clear();
        for device in paired_devices {
            devices.insert(device.token.clone(), device);
        }
    }
    state.device_name.get_or_init(detect_device_name);
    ensure_device_id();
    *state
        .ca_pem
        .lock()
        .map_err(|_| "写入 CA 证书失败".to_string())? = certs.ca_pem;
    *state
        .ca_fingerprint
        .lock()
        .map_err(|_| "写入 CA 指纹失败".to_string())? = certs.ca_fingerprint;
    state.https_port.store(https_port, Ordering::Release);
    state.udp_port.store(udp_port, Ordering::Release);
    state.running.store(true, Ordering::Release);

    if let Ok(mut tasks) = state.tasks.lock() {
        tasks.clear();
        tasks.push(https_task);
        tasks.push(udp_task);
    }

    Ok(build_status(&state))
}

/**
 * 停止局域网同步服务（幂等）。
 */
pub async fn stop_lan_sync() -> Result<(), String> {
    let state = shared();
    state.running.store(false, Ordering::Release);
    if let Ok(mut tasks) = state.tasks.lock() {
        for task in tasks.drain(..) {
            task.abort();
        }
    }
    if let Ok(mut devices) = state.devices.lock() {
        devices.clear();
    }
    if let Ok(mut pending) = state.pending_pairs.lock() {
        pending.clear();
    }
    *state
        .snapshot
        .lock()
        .map_err(|_| "重置快照失败".to_string())? = Value::Null;
    Ok(())
}

/**
 * 读取运行状态。
 */
pub fn get_lan_sync_status() -> LanSyncStatus {
    build_status(&shared())
}

/**
 * 前端注入新的账号快照（同时唤醒等待中的 /sync 请求）。
 */
pub fn update_lan_sync_snapshot(snapshot: Value) -> Result<(), String> {
    let state = shared();
    *state
        .snapshot
        .lock()
        .map_err(|_| "写入快照失败".to_string())? = snapshot;
    let next = state.revision.fetch_add(1, Ordering::AcqRel) + 1;
    let _ = state.revision_tx.send(next);
    Ok(())
}

/**
 * 删除已配对设备（吊销其 token）。
 *
 * @param token 设备 token
 */
pub fn remove_lan_sync_device(token: &str) -> Result<(), String> {
    shared()
        .devices
        .lock()
        .map_err(|_| "读取配对设备失败".to_string())?
        .remove(token);
    Ok(())
}

/**
 * 处理用户对配对请求的弹窗决定（前端调用）。
 *
 * @param request_id 配对请求 id（来自 lan-sync-pair-request 事件）
 * @param approved 是否允许配对
 * @exception 请求不存在或已过期时返回中文错误信息
 */
pub fn resolve_pair_request(request_id: &str, approved: bool) -> Result<(), String> {
    if let Ok(mut pending) = shared().pending_pairs.lock() {
        if let Some(tx) = pending.remove(request_id) {
            let _ = tx.send(approved);
            return Ok(());
        }
    }
    Err("配对请求不存在或已过期".to_string())
}
