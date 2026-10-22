//! 小小狩月人（AFKSupport）管道接收端的 Tauri 命令层。
//!
//! 具体实现见 [`crate::submodules::afk_bridge`]，协议见 `specs/afk-support-protocol.md`。

use crate::submodules::afk_bridge::{
    AfkBridgeStatus, get_afk_bridge_status, start_afk_bridge, stop_afk_bridge,
};
use tauri::AppHandle;

/// 启动接收端（游戏作为管道客户端连上后开始推事件）。
#[tauri::command]
pub fn afk_bridge_start(app: AppHandle) -> Result<AfkBridgeStatus, String> {
    Ok(start_afk_bridge(app))
}

/// 停止接收端并释放 `\\.\pipe\TBH_RewardPipe` 实例，让官方小小狩月人可以接管。
#[tauri::command]
pub async fn afk_bridge_stop(app: AppHandle) -> Result<AfkBridgeStatus, String> {
    Ok(stop_afk_bridge(&app).await)
}

/// 读取接收端运行状态。
#[tauri::command]
pub fn afk_bridge_status() -> Result<AfkBridgeStatus, String> {
    Ok(get_afk_bridge_status())
}
