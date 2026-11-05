//! 桌面分身命令：状态、能力、准备、连接/断开/关闭、窗口与选项。
//!
//! 命令只做参数转换与错误映射，编排在 `submodules::desktop_clone` 内完成。
//! 重活（注册表/SCM/WTS/COM/磁盘）一律投递到阻塞线程池，不占用 IPC 线程。
//! 自定义命令不能按 capabilities 隔离调用方窗口，因此这里显式校验 `label`。

use tauri::{AppHandle, WebviewWindow};

use crate::submodules::desktop_clone::{self, CloneCapability, CloneOptions, CloneStatus};

/// 允许调用桌面分身命令的窗口。`cloudgame` 等加载远端内容的窗口必须被拒绝。
const ALLOWED_CALLERS: [&str; 2] = ["main", "desktop-clone"];

fn ensure_caller(window: &WebviewWindow) -> Result<(), String> {
    let label = window.label();
    if ALLOWED_CALLERS.contains(&label) {
        Ok(())
    } else {
        Err(format!("窗口 {label} 无权调用桌面分身命令"))
    }
}

async fn run_blocking<T, F>(task: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|error| format!("后台任务执行失败: {error}"))?
}

/// 当前状态（含能力、会话 ID、错误与选项）。
#[tauri::command]
pub fn desktop_clone_status(caller: WebviewWindow, app: AppHandle) -> Result<CloneStatus, String> {
    ensure_caller(&caller)?;
    Ok(desktop_clone::status(&app))
}

/// 重新检测系统能力。
#[tauri::command]
pub async fn desktop_clone_capability(
    caller: WebviewWindow,
    app: AppHandle,
) -> Result<CloneCapability, String> {
    ensure_caller(&caller)?;
    let handle = app.clone();
    run_blocking(move || Ok(desktop_clone::refresh_capability(&handle))).await
}

/// 启动 TermService 并启用 child sessions。
#[tauri::command]
pub async fn desktop_clone_prepare(
    caller: WebviewWindow,
    app: AppHandle,
) -> Result<CloneCapability, String> {
    ensure_caller(&caller)?;
    let handle = app.clone();
    run_blocking(move || desktop_clone::prepare(&handle)).await
}

/// 打开（或聚焦）克隆窗口，不连接。
#[tauri::command]
pub async fn desktop_clone_open(caller: WebviewWindow, app: AppHandle) -> Result<(), String> {
    ensure_caller(&caller)?;
    let handle = app.clone();
    run_blocking(move || desktop_clone::open(&handle)).await
}

/// 连接子会话；空账号表示使用当前登录身份。
#[tauri::command]
pub async fn desktop_clone_connect(
    caller: WebviewWindow,
    app: AppHandle,
    username: String,
    password: String,
) -> Result<(), String> {
    ensure_caller(&caller)?;
    let handle = app.clone();
    run_blocking(move || {
        let mut password = password;
        let result = desktop_clone::connect(&handle, &username, &password);
        // 命令参数的副本同样必须覆写
        desktop_clone::zeroize_string(&mut password);
        result
    })
    .await
}

/// 断开控件连接，保留子会话。
#[tauri::command]
pub async fn desktop_clone_disconnect(caller: WebviewWindow, app: AppHandle) -> Result<(), String> {
    ensure_caller(&caller)?;
    let handle = app.clone();
    run_blocking(move || desktop_clone::disconnect(&handle)).await
}

/// 重建控件并重新连接。
#[tauri::command]
pub async fn desktop_clone_reconnect(caller: WebviewWindow, app: AppHandle) -> Result<(), String> {
    ensure_caller(&caller)?;
    let handle = app.clone();
    run_blocking(move || desktop_clone::reconnect(&handle)).await
}

/// 关闭会话：断开并按需注销子会话。
#[tauri::command]
pub async fn desktop_clone_close_session(
    caller: WebviewWindow,
    app: AppHandle,
    logoff: bool,
) -> Result<(), String> {
    ensure_caller(&caller)?;
    let handle = app.clone();
    run_blocking(move || desktop_clone::close_session(&handle, logoff)).await
}

/// 隐藏窗口，保留会话。
#[tauri::command]
pub async fn desktop_clone_hide(caller: WebviewWindow, app: AppHandle) -> Result<(), String> {
    ensure_caller(&caller)?;
    let handle = app.clone();
    run_blocking(move || desktop_clone::hide(&handle)).await
}

/// 读取选项。
#[tauri::command]
pub fn desktop_clone_get_options(
    caller: WebviewWindow,
    app: AppHandle,
) -> Result<CloneOptions, String> {
    ensure_caller(&caller)?;
    Ok(desktop_clone::status(&app).options)
}

/// 应用并持久化选项。
#[tauri::command]
pub async fn desktop_clone_set_options(
    caller: WebviewWindow,
    app: AppHandle,
    options: CloneOptions,
) -> Result<CloneOptions, String> {
    ensure_caller(&caller)?;
    let handle = app.clone();
    run_blocking(move || desktop_clone::apply_options(&handle, options)).await
}

/// 弹层打开/关闭时隐藏或恢复原生子窗口。
#[tauri::command]
pub async fn desktop_clone_set_overlay_visible(
    caller: WebviewWindow,
    app: AppHandle,
    visible: bool,
) -> Result<(), String> {
    ensure_caller(&caller)?;
    let handle = app.clone();
    run_blocking(move || {
        desktop_clone::viewer::set_overlay_visible(&handle, visible);
        Ok(())
    })
    .await
}

/// 上报前端标题栏逻辑高度，用于原生子窗口定位。
#[tauri::command]
pub async fn desktop_clone_set_chrome_height(
    caller: WebviewWindow,
    app: AppHandle,
    height: f64,
) -> Result<(), String> {
    ensure_caller(&caller)?;
    let handle = app.clone();
    run_blocking(move || {
        desktop_clone::viewer::set_chrome_height(&handle, height);
        Ok(())
    })
    .await
}

/// 多行诊断报告。
#[tauri::command]
pub async fn desktop_clone_diagnose(
    caller: WebviewWindow,
    app: AppHandle,
) -> Result<String, String> {
    ensure_caller(&caller)?;
    let handle = app.clone();
    run_blocking(move || Ok(desktop_clone::diagnose(&handle))).await
}

/// 在子会话内执行系统热键（`switch-window` / `show-desktop` / `task-manager`）。
#[tauri::command]
pub async fn desktop_clone_send_keys(
    caller: WebviewWindow,
    app: AppHandle,
    action: String,
) -> Result<String, String> {
    ensure_caller(&caller)?;
    let handle = app.clone();
    run_blocking(move || desktop_clone::send_keys(&handle, &action)).await
}

/// 在子会话内启动控制中心配置的程序。
#[tauri::command]
pub async fn desktop_clone_launch_program(
    caller: WebviewWindow,
    app: AppHandle,
    id: String,
) -> Result<String, String> {
    ensure_caller(&caller)?;
    let handle = app.clone();
    run_blocking(move || desktop_clone::launch_program(&handle, &id)).await
}
