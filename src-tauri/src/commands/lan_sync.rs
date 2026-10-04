//! 局域网设备发现与一键登录同步的 Tauri 命令层。
//!
//! 具体服务实现见 [`crate::submodules::lan_sync`]。

use crate::submodules::lan_sync::{
    LanSyncStatus, PairedDevice, get_lan_sync_status, remove_lan_sync_device, resolve_pair_request,
    start_lan_sync, stop_lan_sync, update_lan_sync_snapshot,
};
use serde_json::Value;
use tauri::AppHandle;

/**
 * 启动局域网同步服务。
 *
 * @param pairedDevices 前端持久化的历史配对设备（deviceId/deviceName/token）
 * @returns 启动后的运行状态
 */
#[tauri::command]
pub async fn lan_sync_start(
    app: AppHandle,
    paired_devices: Option<Vec<PairedDevice>>,
) -> Result<LanSyncStatus, String> {
    start_lan_sync(app, 0, 0, paired_devices.unwrap_or_default()).await
}

/**
 * 停止局域网同步服务。
 */
#[tauri::command]
pub async fn lan_sync_stop() -> Result<(), String> {
    stop_lan_sync().await
}

/**
 * 读取局域网同步服务运行状态。
 */
#[tauri::command]
pub fn lan_sync_status() -> Result<LanSyncStatus, String> {
    Ok(get_lan_sync_status())
}

/**
 * 前端注入最新的账号快照（DOB + DNA 账号），供手机端拉取。
 *
 * @param snapshot 快照对象，结构由前端定义
 */
#[tauri::command]
pub fn lan_sync_update_snapshot(snapshot: Value) -> Result<(), String> {
    update_lan_sync_snapshot(snapshot)
}

/**
 * 删除已配对设备（吊销其 token）。
 *
 * @param token 设备 token
 */
#[tauri::command]
pub fn lan_sync_remove_device(token: String) -> Result<LanSyncStatus, String> {
    remove_lan_sync_device(&token)?;
    Ok(get_lan_sync_status())
}

/**
 * 处理用户对配对请求的弹窗决定。
 *
 * @param requestId 配对请求 id（来自 lan-sync-pair-request 事件）
 * @param approved 是否允许配对
 */
#[tauri::command]
pub async fn lan_sync_resolve_pair(request_id: String, approved: bool) -> Result<(), String> {
    resolve_pair_request(&request_id, approved)
}
