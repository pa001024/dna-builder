//! 云游戏受控窗口：独立 WebView 窗口的创建、状态广播、桥接事件与导航控制。

use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use url::Url;

const CLOUDGAME_WINDOW_LABEL: &str = "cloudgame";
const CLOUDGAME_DEFAULT_URL: &str = "https://dna.yingxiong.com/cloudgame/";
const CLOUDGAME_BRIDGE_EVENT: &str = "cloudgame://bridge";
const CLOUDGAME_PAGE_LOAD_EVENT: &str = "cloudgame://page-load";
const CLOUDGAME_WINDOW_EVENT: &str = "cloudgame://window-state";

/// 云游戏受控窗口的可选配置。
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudGameWindowOptions {
    url: Option<String>,
    title: Option<String>,
    width: Option<f64>,
    height: Option<f64>,
    min_width: Option<f64>,
    min_height: Option<f64>,
    x: Option<f64>,
    y: Option<f64>,
    visible: Option<bool>,
    focus: Option<bool>,
    decorations: Option<bool>,
    resizable: Option<bool>,
    always_on_top: Option<bool>,
    skip_taskbar: Option<bool>,
    incognito: Option<bool>,
    #[allow(unused)]
    open_devtools: Option<bool>,
    user_agent: Option<String>,
    proxy_url: Option<String>,
}

/// 云游戏受控窗口的当前状态。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudGameWindowState {
    label: String,
    url: String,
    title: String,
    visible: bool,
    focused: bool,
}

/// 云游戏页面加载事件负载。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CloudGamePageLoadPayload {
    label: String,
    url: String,
    event: String,
}

/// 云游戏桥接事件负载。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudGameBridgeEventPayload {
    event_type: String,
    payload: Option<serde_json::Value>,
}

/// 构建注入到云游戏页面中的后台控制桥。
fn build_cloudgame_init_script() -> String {
    include_str!("../cloudgame_init.js").to_string()
}

/// 将页面加载事件转换成稳定的字符串值。
fn cloudgame_page_load_event_name(event: tauri::webview::PageLoadEvent) -> &'static str {
    match event {
        tauri::webview::PageLoadEvent::Started => "started",
        tauri::webview::PageLoadEvent::Finished => "finished",
    }
}

/// 读取云游戏窗口当前状态。
fn cloudgame_window_state(window: &WebviewWindow) -> Result<CloudGameWindowState, String> {
    let url = window
        .url()
        .map_err(|error| format!("读取云游戏窗口 URL 失败: {error}"))?;
    let title = window
        .title()
        .map_err(|error| format!("读取云游戏窗口标题失败: {error}"))?;
    let visible = window
        .is_visible()
        .map_err(|error| format!("读取云游戏窗口可见状态失败: {error}"))?;
    let focused = window
        .is_focused()
        .map_err(|error| format!("读取云游戏窗口焦点状态失败: {error}"))?;

    Ok(CloudGameWindowState {
        label: CLOUDGAME_WINDOW_LABEL.to_string(),
        url: url.to_string(),
        title,
        visible,
        focused,
    })
}

/// 向前端广播云游戏窗口状态。
fn emit_cloudgame_window_state(
    app_handle: &tauri::AppHandle,
    window: &WebviewWindow,
) -> Result<CloudGameWindowState, String> {
    let state = cloudgame_window_state(window)?;
    app_handle
        .emit(CLOUDGAME_WINDOW_EVENT, &state)
        .map_err(|error| format!("发送云游戏窗口状态失败: {error}"))?;
    Ok(state)
}

/// 向前端广播云游戏页面加载事件。
fn emit_cloudgame_page_load(
    app_handle: &tauri::AppHandle,
    url: &Url,
    event: tauri::webview::PageLoadEvent,
) -> Result<(), String> {
    let payload = CloudGamePageLoadPayload {
        label: CLOUDGAME_WINDOW_LABEL.to_string(),
        url: url.to_string(),
        event: cloudgame_page_load_event_name(event).to_string(),
    };
    app_handle
        .emit(CLOUDGAME_PAGE_LOAD_EVENT, &payload)
        .map_err(|error| format!("发送云游戏页面加载事件失败: {error}"))
}

/// 接收远程云游戏页桥接事件并转发到主窗口。
#[tauri::command]
pub fn dispatch_cloudgame_bridge_event(
    app_handle: tauri::AppHandle,
    payload: CloudGameBridgeEventPayload,
) -> Result<(), String> {
    app_handle
        .emit(
            CLOUDGAME_BRIDGE_EVENT,
            &serde_json::json!({
                "type": payload.event_type,
                "payload": payload.payload,
            }),
        )
        .map_err(|error| format!("转发云游戏桥接事件失败: {error}"))
}

/// 统一获取云游戏窗口句柄，避免各命令重复判空。
fn with_cloudgame_window<T, F>(app_handle: &tauri::AppHandle, f: F) -> Result<Option<T>, String>
where
    F: FnOnce(WebviewWindow) -> Result<T, String>,
{
    match app_handle.get_webview_window(CLOUDGAME_WINDOW_LABEL) {
        Some(window) => f(window).map(Some),
        None => Ok(None),
    }
}

/// 创建或复用云游戏受控窗口。
#[tauri::command]
pub async fn open_cloudgame_window(
    app_handle: tauri::AppHandle,
    options: Option<CloudGameWindowOptions>,
) -> Result<CloudGameWindowState, String> {
    let options = options.unwrap_or_default();
    let target_url = options
        .url
        .clone()
        .unwrap_or_else(|| CLOUDGAME_DEFAULT_URL.to_string());
    let parsed_url =
        Url::parse(&target_url).map_err(|error| format!("云游戏 URL 无效: {error}"))?;

    if let Some(window) = app_handle.get_webview_window(CLOUDGAME_WINDOW_LABEL) {
        let current_url = window
            .url()
            .map(|value| value.to_string())
            .unwrap_or_default();
        if current_url != parsed_url.as_str() {
            window
                .navigate(parsed_url)
                .map_err(|error| format!("导航云游戏窗口失败: {error}"))?;
        }
        if let Some(title) = options.title.as_deref() {
            window
                .set_title(title)
                .map_err(|error| format!("更新云游戏窗口标题失败: {error}"))?;
        }
        match options.visible {
            Some(false) => window
                .hide()
                .map_err(|error| format!("隐藏云游戏窗口失败: {error}"))?,
            Some(true) | None => window
                .show()
                .map_err(|error| format!("显示云游戏窗口失败: {error}"))?,
        }
        if options.focus.unwrap_or(true) {
            window
                .set_focus()
                .map_err(|error| format!("聚焦云游戏窗口失败: {error}"))?;
        }
        #[cfg(debug_assertions)]
        if options.open_devtools.unwrap_or(false) {
            window.open_devtools();
        }
        return emit_cloudgame_window_state(&app_handle, &window);
    }

    let page_load_handle = app_handle.clone();
    let title_event_handle = app_handle.clone();
    let mut builder = WebviewWindowBuilder::new(
        &app_handle,
        CLOUDGAME_WINDOW_LABEL,
        WebviewUrl::External(parsed_url),
    )
    .title(options.title.as_deref().unwrap_or("Cloudgame"))
    .position(options.x.unwrap_or(40.0), options.y.unwrap_or(40.0))
    .inner_size(
        options.width.unwrap_or(1600.0),
        options.height.unwrap_or(900.0),
    )
    .min_inner_size(
        options.min_width.unwrap_or(480.0),
        options.min_height.unwrap_or(320.0),
    )
    .visible(options.visible.unwrap_or(true))
    .focused(options.focus.unwrap_or(true))
    .decorations(options.decorations.unwrap_or(true))
    .resizable(options.resizable.unwrap_or(true))
    .always_on_top(options.always_on_top.unwrap_or(false))
    .skip_taskbar(options.skip_taskbar.unwrap_or(false))
    .incognito(options.incognito.unwrap_or(false))
    .initialization_script(build_cloudgame_init_script())
    .on_page_load(move |window, payload| {
        let _ = emit_cloudgame_page_load(&page_load_handle, payload.url(), payload.event());
        let _ = emit_cloudgame_window_state(&page_load_handle, &window);
    })
    .on_document_title_changed(move |window, title| {
        let _ = title_event_handle.emit(
            CLOUDGAME_BRIDGE_EVENT,
            serde_json::json!({
                "type": "title-change",
                "payload": {
                    "title": title,
                    "href": window.url().map(|value| value.to_string()).unwrap_or_default(),
                }
            }),
        );
        let _ = emit_cloudgame_window_state(&title_event_handle, &window);
    });

    if let Some(user_agent) = options.user_agent.as_deref() {
        builder = builder.user_agent(user_agent);
    }
    if let Some(proxy_url) = options.proxy_url.as_deref() {
        let proxy = Url::parse(proxy_url).map_err(|error| format!("代理 URL 无效: {error}"))?;
        builder = builder.proxy_url(proxy);
    }

    let window = builder
        .build()
        .map_err(|error| format!("创建云游戏窗口失败: {error}"))?;

    let close_event_handle = app_handle.clone();
    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Destroyed) {
            let empty_state: Option<CloudGameWindowState> = None;
            let _ = close_event_handle.emit(CLOUDGAME_WINDOW_EVENT, &empty_state);
        }
    });

    #[cfg(debug_assertions)]
    if options.open_devtools.unwrap_or(false) {
        window.open_devtools();
    }

    emit_cloudgame_window_state(&app_handle, &window)
}

/// 获取云游戏窗口当前状态。
#[tauri::command]
pub fn get_cloudgame_window_state(
    app_handle: tauri::AppHandle,
) -> Result<Option<CloudGameWindowState>, String> {
    with_cloudgame_window(&app_handle, |window| cloudgame_window_state(&window))
}

/// 关闭云游戏窗口。
#[tauri::command]
pub fn close_cloudgame_window(app_handle: tauri::AppHandle) -> Result<bool, String> {
    if let Some(window) = app_handle.get_webview_window(CLOUDGAME_WINDOW_LABEL) {
        window
            .close()
            .map_err(|error| format!("关闭云游戏窗口失败: {error}"))?;
        let empty_state: Option<CloudGameWindowState> = None;
        app_handle
            .emit(CLOUDGAME_WINDOW_EVENT, &empty_state)
            .map_err(|error| format!("发送云游戏窗口关闭事件失败: {error}"))?;
        Ok(true)
    } else {
        Ok(false)
    }
}

/// 显示云游戏窗口。
#[tauri::command]
pub fn show_cloudgame_window(
    app_handle: tauri::AppHandle,
) -> Result<Option<CloudGameWindowState>, String> {
    with_cloudgame_window(&app_handle, |window| {
        window
            .show()
            .map_err(|error| format!("显示云游戏窗口失败: {error}"))?;
        emit_cloudgame_window_state(&app_handle, &window)
    })
}

/// 隐藏云游戏窗口。
#[tauri::command]
pub fn hide_cloudgame_window(
    app_handle: tauri::AppHandle,
) -> Result<Option<CloudGameWindowState>, String> {
    with_cloudgame_window(&app_handle, |window| {
        window
            .hide()
            .map_err(|error| format!("隐藏云游戏窗口失败: {error}"))?;
        emit_cloudgame_window_state(&app_handle, &window)
    })
}

/// 聚焦云游戏窗口。
#[tauri::command]
pub fn focus_cloudgame_window(
    app_handle: tauri::AppHandle,
) -> Result<Option<CloudGameWindowState>, String> {
    with_cloudgame_window(&app_handle, |window| {
        window
            .show()
            .map_err(|error| format!("显示云游戏窗口失败: {error}"))?;
        window
            .set_focus()
            .map_err(|error| format!("聚焦云游戏窗口失败: {error}"))?;
        emit_cloudgame_window_state(&app_handle, &window)
    })
}

/// 重新加载云游戏页面。
#[tauri::command]
pub fn reload_cloudgame_window(
    app_handle: tauri::AppHandle,
) -> Result<Option<CloudGameWindowState>, String> {
    with_cloudgame_window(&app_handle, |window| {
        window
            .reload()
            .map_err(|error| format!("重新加载云游戏页面失败: {error}"))?;
        emit_cloudgame_window_state(&app_handle, &window)
    })
}

/// 导航云游戏窗口到新的地址。
#[tauri::command]
pub fn navigate_cloudgame_window(
    app_handle: tauri::AppHandle,
    url: String,
) -> Result<Option<CloudGameWindowState>, String> {
    let target_url = Url::parse(&url).map_err(|error| format!("导航 URL 无效: {error}"))?;
    with_cloudgame_window(&app_handle, |window| {
        window
            .navigate(target_url)
            .map_err(|error| format!("导航云游戏窗口失败: {error}"))?;
        emit_cloudgame_window_state(&app_handle, &window)
    })
}

/// 向云游戏页面派发桥接命令。
#[tauri::command]
pub fn dispatch_cloudgame_command(
    app_handle: tauri::AppHandle,
    action: String,
    payload: Option<serde_json::Value>,
) -> Result<(), String> {
    let Some(window) = app_handle.get_webview_window(CLOUDGAME_WINDOW_LABEL) else {
        return Err("云游戏窗口未打开".to_string());
    };

    let detail = serde_json::json!({
        "action": action,
        "payload": payload.unwrap_or(serde_json::Value::Null),
    });
    let detail_json =
        serde_json::to_string(&detail).map_err(|error| format!("序列化云游戏命令失败: {error}"))?;
    let script = format!(
        "window.dispatchEvent(new CustomEvent('__dna_cloudgame_control__', {{ detail: {detail_json} }}));",
    );

    window
        .eval(script)
        .map_err(|error| format!("派发云游戏命令失败: {error}"))
}

/// 直接在云游戏页面执行任意脚本，作为高阶兜底入口。
#[tauri::command]
pub fn eval_cloudgame_window(app_handle: tauri::AppHandle, script: String) -> Result<(), String> {
    let Some(window) = app_handle.get_webview_window(CLOUDGAME_WINDOW_LABEL) else {
        return Err("云游戏窗口未打开".to_string());
    };

    window
        .eval(script)
        .map_err(|error| format!("执行云游戏脚本失败: {error}"))
}
