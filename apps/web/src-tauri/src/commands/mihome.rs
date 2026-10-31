//! 米家联动（MiHome）：内嵌云协议，扫码登录 + 手动场景列表/执行。
//!
//! 协议实现是 vendored 的 `mihome-api`
//! 这里只做 Tauri 命令薄封装，不依赖外部服务进程。
//!
//! 并发模型：`mihome-api` 是阻塞 HTTP（移植 Python `requests` 设计），
//! 所有调用都在 `spawn_blocking` 里跑，绝不在 async 上下文里构造/持有
//! `MiHomeService`（否则退出时报 "Cannot drop a runtime..."，见 mijia-rs 教训）。
//! 每次调用新建一次服务实例，登录态以落盘文件为准，不做进程内长持。

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

/// 登录态文件：`<app_data>/mihome/auth.json`
fn auth_file(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法定位应用数据目录: {e}"))?;
    let dir = data_dir.join("mihome");
    std::fs::create_dir_all(&dir).map_err(|e| format!("无法创建米家数据目录: {e}"))?;
    let path = dir.join("auth.json");
    if !path.exists() {
        let legacy = data_dir.join("mijia").join("auth.json");
        if legacy.exists() {
            let _ = std::fs::copy(&legacy, &path);
        }
    }
    Ok(path)
}

/// 登录状态。
#[derive(Serialize)]
pub struct MiHomeStatus {
    pub logged_in: bool,
}

/// 二维码登录的待扫数据：前端拿 `login_url` 自行渲染二维码。
#[derive(Serialize)]
pub struct QrBegin {
    /// 本地 token 仍有效，无需扫码。
    pub already: bool,
    pub login_url: String,
    /// 长轮询地址，原样回传给 `mihome_qr_wait`。
    pub lp: String,
}

/// `mihome_qr_wait` 的回传参数（`qr_img` 用不上，只传两个串）。
#[derive(Deserialize)]
pub struct QrPayload {
    pub login_url: String,
    pub lp: String,
}

/// 读取登录状态（token 有效会自动刷新）。
#[tauri::command]
pub async fn mihome_status(app: AppHandle) -> Result<MiHomeStatus, String> {
    let auth = auth_file(&app)?;
    tokio::task::spawn_blocking(move || {
        let mut svc =
            mihome_api::MiHomeService::new(Some(auth.as_path())).map_err(|e| e.message)?;
        Ok(MiHomeStatus {
            logged_in: svc.login_status(),
        })
    })
    .await
    .map_err(|_| "米家后台任务失败".to_string())?
}

/// 开始扫码登录：token 有效直接返回 `already`，否则返回待扫的 `login_url`。
#[tauri::command]
pub async fn mihome_qr_begin(app: AppHandle) -> Result<QrBegin, String> {
    let auth = auth_file(&app)?;
    tokio::task::spawn_blocking(move || {
        let mut svc =
            mihome_api::MiHomeService::new(Some(auth.as_path())).map_err(|e| e.message)?;
        match svc.qr_login_begin().map_err(|e| e.message)? {
            None => Ok(QrBegin {
                already: true,
                login_url: String::new(),
                lp: String::new(),
            }),
            Some(data) => Ok(QrBegin {
                already: false,
                login_url: data.login_url,
                lp: data.lp,
            }),
        }
    })
    .await
    .map_err(|_| "米家后台任务失败".to_string())?
}

/// 等待扫码结果（最长阻塞约 2 分钟，超时/失败直接报错，前端提示重试）。
#[tauri::command]
pub async fn mihome_qr_wait(app: AppHandle, payload: QrPayload) -> Result<(), String> {
    let auth = auth_file(&app)?;
    tokio::task::spawn_blocking(move || {
        let mut svc =
            mihome_api::MiHomeService::new(Some(auth.as_path())).map_err(|e| e.message)?;
        let data = mihome_api::client::QrLoginData {
            refreshed: false,
            login_url: payload.login_url,
            qr_img: String::new(),
            lp: payload.lp,
        };
        svc.qr_login_wait(&data).map_err(|e| e.message)?;
        Ok(())
    })
    .await
    .map_err(|_| "米家后台任务失败".to_string())?
}

/// 退出登录：删掉本地登录态文件。
#[tauri::command]
pub async fn mihome_logout(app: AppHandle) -> Result<(), String> {
    let auth = auth_file(&app)?;
    match std::fs::remove_file(&auth) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("退出登录失败: {e}")),
    }
}

/// 手动场景列表（米家 APP → 智能 → 手动控制）。
#[tauri::command]
pub async fn mihome_scenes(app: AppHandle) -> Result<Vec<mihome_api::SceneInfo>, String> {
    let auth = auth_file(&app)?;
    tokio::task::spawn_blocking(move || {
        let mut svc =
            mihome_api::MiHomeService::new(Some(auth.as_path())).map_err(|e| e.message)?;
        svc.scene_list(None).map_err(|e| e.message)
    })
    .await
    .map_err(|_| "米家后台任务失败".to_string())?
}

/// 执行一个手动场景。
#[tauri::command]
pub async fn mihome_run_scene(
    app: AppHandle,
    scene_id: String,
    home_id: String,
) -> Result<(), String> {
    let auth = auth_file(&app)?;
    tokio::task::spawn_blocking(move || {
        let mut svc =
            mihome_api::MiHomeService::new(Some(auth.as_path())).map_err(|e| e.message)?;
        svc.run_scene(&mihome_api::SceneInfo {
            scene_id,
            name: String::new(),
            home_id,
            home_name: String::new(),
        })
        .map_err(|e| e.message)
    })
    .await
    .map_err(|_| "米家后台任务失败".to_string())?
}
