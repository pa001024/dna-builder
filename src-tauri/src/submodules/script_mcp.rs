use crate::submodules::script::{
    exec_script_with_tauri_console, get_script_runtime_info, normalize_script_path,
    run_script_file, stop_script, stop_script_by_path,
};
use base64::{Engine as _, engine::general_purpose};
use mcp_server::{
    ScriptConsoleEntry, ScriptExecResult, ScriptHelpRequest, ScriptHelpResponse, ScriptMcpBackend,
    ScriptMcpServerConfig, ScriptMcpServerHandle, ScriptOperationResult, ScriptRuntimeSnapshot,
    ScriptStatusEntry, start_script_mcp_server,
};
use regex::Regex;
use serde::Serialize;
use std::collections::{HashMap, VecDeque};
use std::fs;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU16, Ordering};
use std::sync::{Arc, LazyLock, Mutex};
use tauri::{Emitter, Manager};

const SCRIPT_MCP_DEFAULT_PORT: u16 = 28080;
const SCRIPT_MCP_MAX_CONSOLE_LOGS: usize = 500;

static SCRIPT_MCP_SERVER_HANDLE: LazyLock<Mutex<Option<ScriptMcpServerHandle>>> =
    LazyLock::new(|| Mutex::new(None));
static SCRIPT_MCP_LAST_ERROR: LazyLock<Mutex<Option<String>>> = LazyLock::new(|| Mutex::new(None));
static SCRIPT_MCP_SERVER_ENABLED: AtomicBool = AtomicBool::new(false);
static SCRIPT_MCP_SERVER_PORT: AtomicU16 = AtomicU16::new(SCRIPT_MCP_DEFAULT_PORT);
static SCRIPT_CONSOLE_BUFFER: LazyLock<Mutex<VecDeque<ScriptConsoleEntry>>> =
    LazyLock::new(|| Mutex::new(VecDeque::new()));
static SCRIPT_STATUS_BUFFER: LazyLock<Mutex<HashMap<String, ScriptStatusEntry>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static SCRIPT_HELP_REQUEST_COUNTER: AtomicU16 = AtomicU16::new(1);
static SCRIPT_HELP_PENDING: LazyLock<
    Mutex<HashMap<String, std::sync::mpsc::Sender<ScriptHelpResponse>>>,
> = LazyLock::new(|| Mutex::new(HashMap::new()));

/// 前端展示的协助请求事件。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptHelpRequestEvent {
    pub request_id: String,
    pub title: String,
    pub message: Option<String>,
    pub image: String,
    pub selection_mode: String,
}

/// 构造协助请求 ID，便于前后端配对。
fn next_script_help_request_id() -> String {
    let seq = SCRIPT_HELP_REQUEST_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("script-help-{seq}")
}

/// 将帮助选择模式转换为前端字符串。
fn selection_mode_to_string(mode: &mcp_server::ScriptHelpSelectionMode) -> String {
    match mode {
        mcp_server::ScriptHelpSelectionMode::Point => "point".to_string(),
        mcp_server::ScriptHelpSelectionMode::Region => "region".to_string(),
    }
}

/// 根据文件扩展名推断图片 MIME 类型。
fn image_mime_type_from_path(path: &std::path::Path) -> &'static str {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .as_deref()
    {
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("webp") => "image/webp",
        Some("bmp") => "image/bmp",
        Some("gif") => "image/gif",
        _ => "image/png",
    }
}

/// 读取本地图片文件并转换为前端可直接显示的 data URL。
fn image_data_url_from_path(image_path: &str) -> Result<String, String> {
    let path = PathBuf::from(image_path.trim());
    if !path.exists() {
        return Err(format!("图片文件不存在: {}", path.display()));
    }
    let bytes = fs::read(&path).map_err(|error| format!("读取图片文件失败: {error}"))?;
    let mime_type = image_mime_type_from_path(&path);
    let data = general_purpose::STANDARD.encode(bytes);
    Ok(format!("data:{mime_type};base64,{data}"))
}

/// 脚本 MCP 服务当前状态。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptMcpServerState {
    pub enabled: bool,
    pub running: bool,
    pub port: u16,
    pub address: String,
    pub last_error: Option<String>,
}

/// 规范化脚本作用域，统一路径分隔符与大小写。
fn normalize_scope(scope: Option<&str>) -> Option<String> {
    let normalized = String::from(scope.unwrap_or_default())
        .trim()
        .replace("/", "\\")
        .to_lowercase();
    if normalized.is_empty() {
        None
    } else {
        Some(normalized)
    }
}

/// 根据作用域和标题生成状态缓存键。
fn build_status_key(scope: Option<&str>, title: &str) -> String {
    format!(
        "{}::{}",
        normalize_scope(scope).unwrap_or_default(),
        title.trim()
    )
}

/// 解析 MCP 对外暴露的默认监听地址。
fn default_bind_addr() -> SocketAddr {
    SocketAddr::from((
        [127, 0, 0, 1],
        SCRIPT_MCP_SERVER_PORT.load(Ordering::Acquire),
    ))
}

/// 解析脚本输入路径，允许传入绝对路径或脚本文件名。
fn resolve_script_path_input(
    app_handle: &tauri::AppHandle,
    script_path: String,
) -> Result<String, String> {
    let input = script_path.trim();
    if input.is_empty() {
        return Err("script_path 不能为空".to_string());
    }

    let direct_path = PathBuf::from(input);
    if direct_path.exists() {
        return normalize_script_path(input.to_string());
    }

    let mut documents_dir = app_handle
        .path()
        .document_dir()
        .map_err(|error| format!("获取文档目录失败: {error}"))?;
    documents_dir.push("dob-scripts");
    documents_dir.push(if input.ends_with(".js") {
        input.to_string()
    } else {
        format!("{input}.js")
    });

    normalize_script_path(documents_dir.to_string_lossy().to_string())
}

/// 解析临时脚本作用域。
fn resolve_exec_script_scope(scope: Option<String>) -> Option<String> {
    scope
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

/// 判断缓存项是否应命中当前作用域过滤。
fn scope_matches(entry_scope: Option<&str>, filter_scope: Option<&str>) -> bool {
    match (normalize_scope(entry_scope), normalize_scope(filter_scope)) {
        (_, None) => true,
        (Some(entry), Some(filter)) => entry == filter,
        (None, Some(_)) => false,
    }
}

/// 解析并编译可选正则过滤条件。
fn compile_optional_regex(regex: Option<String>) -> Result<Option<Regex>, String> {
    let Some(regex) = regex.map(|value| value.trim().to_string()) else {
        return Ok(None);
    };
    if regex.is_empty() {
        return Ok(None);
    }
    Regex::new(&regex)
        .map(Some)
        .map_err(|error| format!("regex 无效: {error}"))
}

/// Tauri 运行时对 MCP 后端 trait 的适配器。
#[derive(Clone)]
struct TauriScriptMcpBackend {
    app_handle: tauri::AppHandle,
}

#[async_trait::async_trait]
impl ScriptMcpBackend for TauriScriptMcpBackend {
    /// 启动指定脚本，并立即返回已接受结果。
    async fn run_script(
        &self,
        script_path: String,
        yield_ms: Option<u64>,
    ) -> Result<ScriptOperationResult, String> {
        let resolved_path = resolve_script_path_input(&self.app_handle, script_path)?;
        let app_handle = self.app_handle.clone();
        let runner_path = resolved_path.clone();
        tauri::async_runtime::spawn(async move {
            let _ = run_script_file(runner_path, app_handle).await;
        });
        if let Some(yield_ms) = yield_ms.filter(|value| *value > 0) {
            let deadline = std::time::Instant::now() + std::time::Duration::from_millis(yield_ms);
            let poll_interval = std::time::Duration::from_millis(50);
            loop {
                let (_, script_paths, _) = get_script_runtime_info();
                let still_running = script_paths.iter().any(|path| {
                    normalize_scope(Some(path.as_str()))
                        == normalize_scope(Some(resolved_path.as_str()))
                });
                if !still_running || std::time::Instant::now() >= deadline {
                    break;
                }
                tokio::time::sleep(poll_interval).await;
            }
        }
        Ok(ScriptOperationResult {
            success: true,
            message: format!("脚本启动请求已发送: {resolved_path}"),
        })
    }

    /// 执行一段不落文件的临时脚本，并等待执行完成。
    async fn exec_script(
        &self,
        script: String,
        scope: Option<String>,
        timeout_ms: Option<u64>,
    ) -> Result<ScriptExecResult, String> {
        let script = script.trim().to_string();
        if script.is_empty() {
            return Err("script 不能为空".to_string());
        }
        let scope = resolve_exec_script_scope(scope);
        let exec_future =
            exec_script_with_tauri_console(script, scope.clone(), self.app_handle.clone());
        let run_result = if let Some(timeout_ms) = timeout_ms.filter(|value| *value > 0) {
            tokio::time::timeout(std::time::Duration::from_millis(timeout_ms), exec_future)
                .await
                .map_err(|_| format!("exec_script 执行超时: {timeout_ms}ms"))??
        } else {
            exec_future.await?
        };
        Ok(ScriptExecResult {
            result: run_result.result,
            console: run_result.console,
        })
    }

    /// 停止脚本或全部运行实例。
    async fn stop_script(
        &self,
        script_path: Option<String>,
    ) -> Result<ScriptOperationResult, String> {
        if let Some(script_path) = script_path {
            let resolved_path = resolve_script_path_input(&self.app_handle, script_path)?;
            stop_script_by_path(resolved_path.clone())?;
            return Ok(ScriptOperationResult {
                success: true,
                message: format!("脚本停止请求已发送: {resolved_path}"),
            });
        }

        stop_script()?;
        Ok(ScriptOperationResult {
            success: true,
            message: "全部脚本停止请求已发送".to_string(),
        })
    }

    /// 获取当前脚本运行快照。
    async fn get_runtime_info(&self) -> Result<ScriptRuntimeSnapshot, String> {
        let (running, script_paths, running_count) = get_script_runtime_info();
        Ok(ScriptRuntimeSnapshot {
            running,
            script_paths,
            running_count,
        })
    }

    /// 读取状态缓存。
    async fn read_status(
        &self,
        script_path: Option<String>,
        regex: Option<String>,
    ) -> Result<Vec<ScriptStatusEntry>, String> {
        let filter_scope = if let Some(script_path) = script_path {
            Some(resolve_script_path_input(&self.app_handle, script_path)?)
        } else {
            None
        };
        let filter_regex = compile_optional_regex(regex)?;
        let statuses = SCRIPT_STATUS_BUFFER
            .lock()
            .map_err(|_| "读取脚本状态缓存失败".to_string())?
            .values()
            .filter(|entry| scope_matches(entry.scope.as_deref(), filter_scope.as_deref()))
            .filter(|entry| {
                filter_regex.as_ref().is_none_or(|regex| {
                    regex.is_match(entry.title.as_str())
                        || entry
                            .text
                            .as_deref()
                            .is_some_and(|text| regex.is_match(text))
                })
            })
            .cloned()
            .map(|mut entry| {
                if filter_scope.is_some() {
                    entry.scope = None;
                }
                entry
            })
            .collect::<Vec<_>>();
        Ok(statuses)
    }

    /// 读取控制台缓存。
    async fn read_console(
        &self,
        script_path: Option<String>,
        limit: usize,
        regex: Option<String>,
    ) -> Result<Vec<ScriptConsoleEntry>, String> {
        let filter_scope = if let Some(script_path) = script_path {
            Some(resolve_script_path_input(&self.app_handle, script_path)?)
        } else {
            None
        };
        let filter_regex = compile_optional_regex(regex)?;
        let limit = limit.max(1).min(SCRIPT_MCP_MAX_CONSOLE_LOGS);
        let buffer = SCRIPT_CONSOLE_BUFFER
            .lock()
            .map_err(|_| "读取脚本控制台缓存失败".to_string())?;
        let logs = buffer
            .iter()
            .rev()
            .filter(|entry| scope_matches(entry.scope.as_deref(), filter_scope.as_deref()))
            .filter(|entry| {
                filter_regex.as_ref().is_none_or(|regex| {
                    regex.is_match(entry.level.as_str()) || regex.is_match(entry.message.as_str())
                })
            })
            .take(limit)
            .cloned()
            .map(|mut entry| {
                if filter_scope.is_some() {
                    entry.scope = None;
                }
                entry
            })
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect::<Vec<_>>();
        Ok(logs)
    }

    /// 清理状态与控制台缓存。
    async fn clear_status_console(
        &self,
        script_path: Option<String>,
    ) -> Result<ScriptOperationResult, String> {
        let filter_scope = if let Some(script_path) = script_path {
            Some(resolve_script_path_input(&self.app_handle, script_path)?)
        } else {
            None
        };

        let cleared_status_count = {
            let mut buffer = SCRIPT_STATUS_BUFFER
                .lock()
                .map_err(|_| "清理脚本状态缓存失败".to_string())?;
            if let Some(filter_scope) = filter_scope.as_deref() {
                let before = buffer.len();
                buffer
                    .retain(|_, entry| !scope_matches(entry.scope.as_deref(), Some(filter_scope)));
                before.saturating_sub(buffer.len())
            } else {
                let count = buffer.len();
                buffer.clear();
                count
            }
        };

        let cleared_console_count = {
            let mut buffer = SCRIPT_CONSOLE_BUFFER
                .lock()
                .map_err(|_| "清理脚本控制台缓存失败".to_string())?;
            if let Some(filter_scope) = filter_scope.as_deref() {
                let before = buffer.len();
                buffer.retain(|entry| !scope_matches(entry.scope.as_deref(), Some(filter_scope)));
                before.saturating_sub(buffer.len())
            } else {
                let count = buffer.len();
                buffer.clear();
                count
            }
        };

        let message = if let Some(filter_scope) = filter_scope {
            format!(
                "已清空脚本缓存: scope={filter_scope}, status={cleared_status_count}, console={cleared_console_count}"
            )
        } else {
            format!(
                "已清空全部脚本缓存: status={cleared_status_count}, console={cleared_console_count}"
            )
        };

        Ok(ScriptOperationResult {
            success: true,
            message,
        })
    }

    /// 清理状态缓存。
    async fn clear_status(
        &self,
        script_path: Option<String>,
        title: Option<String>,
    ) -> Result<ScriptOperationResult, String> {
        let filter_scope = if let Some(script_path) = script_path {
            Some(resolve_script_path_input(&self.app_handle, script_path)?)
        } else {
            None
        };
        let normalized_title = title
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());

        let cleared_count = {
            let mut buffer = SCRIPT_STATUS_BUFFER
                .lock()
                .map_err(|_| "清理脚本状态缓存失败".to_string())?;
            let before = buffer.len();
            buffer.retain(|_, entry| {
                let scope_hit = match filter_scope.as_deref() {
                    Some(filter_scope) => scope_matches(entry.scope.as_deref(), Some(filter_scope)),
                    None => true,
                };
                let title_hit = match normalized_title.as_deref() {
                    Some(title) => entry.title == title,
                    None => true,
                };
                !(scope_hit && title_hit)
            });
            before.saturating_sub(buffer.len())
        };

        Ok(ScriptOperationResult {
            success: true,
            message: format!("已清空状态缓存 {cleared_count} 条"),
        })
    }

    /// 清理控制台缓存。
    async fn clear_console(
        &self,
        script_path: Option<String>,
        include_global: Option<bool>,
    ) -> Result<ScriptOperationResult, String> {
        let filter_scope = if let Some(script_path) = script_path {
            Some(resolve_script_path_input(&self.app_handle, script_path)?)
        } else {
            None
        };
        let include_global = include_global.unwrap_or(true);

        let cleared_count = {
            let mut buffer = SCRIPT_CONSOLE_BUFFER
                .lock()
                .map_err(|_| "清理脚本控制台缓存失败".to_string())?;
            if filter_scope.is_none() {
                let count = buffer.len();
                buffer.clear();
                count
            } else {
                let before = buffer.len();
                buffer.retain(|entry| {
                    let filter_scope = filter_scope.as_deref().expect("filter_scope checked above");
                    let scope_match = scope_matches(entry.scope.as_deref(), Some(filter_scope));
                    let global_match =
                        include_global && normalize_scope(entry.scope.as_deref()).is_none();
                    !(scope_match || global_match)
                });
                before.saturating_sub(buffer.len())
            }
        };

        Ok(ScriptOperationResult {
            success: true,
            message: format!("已清空控制台缓存 {cleared_count} 条"),
        })
    }

    /// 请求前端协助标注点位或区域，并等待回传。
    async fn request_help(&self, request: ScriptHelpRequest) -> Result<ScriptHelpResponse, String> {
        let title = request.title.trim().to_string();
        if title.is_empty() {
            return Err("title 不能为空".to_string());
        }

        let resolved_image = if let Some(status_title) = request
            .status_title
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            let filter_scope = if let Some(script_path) = request.script_path {
                Some(resolve_script_path_input(&self.app_handle, script_path)?)
            } else {
                None
            };
            let statuses = SCRIPT_STATUS_BUFFER
                .lock()
                .map_err(|_| "读取脚本状态缓存失败".to_string())?;
            let matched = statuses
                .values()
                .find(|entry| {
                    entry.title == status_title
                        && scope_matches(entry.scope.as_deref(), filter_scope.as_deref())
                })
                .cloned()
                .ok_or_else(|| format!("未找到状态图片: title={status_title}"))?;
            matched
                .images
                .iter()
                .find(|value| !value.trim().is_empty())
                .cloned()
                .or_else(|| matched.image.filter(|value| !value.trim().is_empty()))
                .ok_or_else(|| format!("状态项缺少图片: title={status_title}"))?
        } else if let Some(image_path) = request
            .image_path
            .as_ref()
            .filter(|value| !value.trim().is_empty())
        {
            image_data_url_from_path(image_path)?
        } else {
            return Err(
                "request_help 必须提供 script_path + status_title，或提供 image_path".to_string(),
            );
        };

        let request_id = next_script_help_request_id();
        let (tx, rx) = std::sync::mpsc::channel::<ScriptHelpResponse>();
        {
            let mut pending = SCRIPT_HELP_PENDING
                .lock()
                .map_err(|_| "写入协助请求映射失败".to_string())?;
            pending.insert(request_id.clone(), tx);
        }

        let emit_result = self.app_handle.emit(
            "script-help-request",
            ScriptHelpRequestEvent {
                request_id: request_id.clone(),
                title,
                message: request.message.filter(|value| !value.trim().is_empty()),
                image: resolved_image,
                selection_mode: selection_mode_to_string(&request.selection_mode),
            },
        );

        if let Err(error) = emit_result {
            let mut pending = SCRIPT_HELP_PENDING
                .lock()
                .map_err(|_| "回滚协助请求映射失败".to_string())?;
            pending.remove(&request_id);
            return Err(format!("发送前端协助请求失败: {error}"));
        }

        let response = rx.recv_timeout(std::time::Duration::from_secs(1800));
        let mut pending = SCRIPT_HELP_PENDING
            .lock()
            .map_err(|_| "清理协助请求映射失败".to_string())?;
        pending.remove(&request_id);

        response.map_err(|error| format!("等待前端协助结果失败: {error}"))
    }
}

/// 响应前端协助标注结果。
pub fn resolve_script_help_request(
    request_id: String,
    response: ScriptHelpResponse,
) -> Result<(), String> {
    let sender = {
        let pending = SCRIPT_HELP_PENDING
            .lock()
            .map_err(|_| "读取协助请求映射失败".to_string())?;
        pending.get(&request_id).cloned()
    };

    if let Some(tx) = sender {
        tx.send(response)
            .map_err(|error| format!("发送协助请求回传值失败: {error}"))?;
    }

    Ok(())
}

/// 记录一条脚本控制台日志，供 MCP 查询读取。
pub fn record_script_console(scope: Option<String>, level: String, message: String) {
    if !should_record_script_mcp_cache() {
        return;
    }
    if let Ok(mut buffer) = SCRIPT_CONSOLE_BUFFER.lock() {
        buffer.push_back(ScriptConsoleEntry {
            scope: normalize_scope(scope.as_deref()),
            level,
            message,
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|duration| duration.as_millis() as u64)
                .unwrap_or(0),
        });
        while buffer.len() > SCRIPT_MCP_MAX_CONSOLE_LOGS {
            let _ = buffer.pop_front();
        }
    }
}

/// 记录一条脚本状态事件，供 MCP 查询读取。
pub fn record_script_status(
    scope: Option<String>,
    action: String,
    title: String,
    text: Option<String>,
    image: Option<String>,
    images: Option<Vec<String>>,
    timestamp: u64,
) {
    if !should_record_script_mcp_cache() {
        return;
    }
    let normalized_title = title.trim().to_string();
    if normalized_title.is_empty() {
        return;
    }

    let key = build_status_key(scope.as_deref(), &normalized_title);
    if let Ok(mut buffer) = SCRIPT_STATUS_BUFFER.lock() {
        if action == "remove" {
            buffer.remove(&key);
            return;
        }

        let normalized_images = images.unwrap_or_default();
        buffer.insert(
            key,
            ScriptStatusEntry {
                scope: normalize_scope(scope.as_deref()),
                title: normalized_title,
                text,
                image,
                images: normalized_images,
                timestamp,
            },
        );
    }
}

/// 判断当前是否需要记录脚本 MCP 缓存。
pub fn should_record_script_mcp_cache() -> bool {
    SCRIPT_MCP_SERVER_ENABLED.load(Ordering::Relaxed)
}

/// 获取脚本 MCP 服务当前状态。
pub fn get_script_mcp_server_state() -> ScriptMcpServerState {
    let running = SCRIPT_MCP_SERVER_ENABLED.load(Ordering::Acquire);
    let port = SCRIPT_MCP_SERVER_PORT.load(Ordering::Acquire);
    let address = SCRIPT_MCP_SERVER_HANDLE
        .lock()
        .ok()
        .and_then(|guard| {
            guard
                .as_ref()
                .map(|handle| format!("http://{}/mcp", handle.local_addr()))
        })
        .unwrap_or_else(|| format!("http://{}/mcp", default_bind_addr()));
    let last_error = SCRIPT_MCP_LAST_ERROR
        .lock()
        .ok()
        .and_then(|guard| guard.clone());

    ScriptMcpServerState {
        enabled: running,
        running,
        port,
        address,
        last_error,
    }
}

/// 清空脚本 MCP status / console 缓存。
pub async fn clear_script_mcp_cache(
    app_handle: tauri::AppHandle,
    script_path: Option<String>,
) -> Result<ScriptOperationResult, String> {
    let backend = TauriScriptMcpBackend { app_handle };
    backend.clear_status_console(script_path).await
}

/// 清空脚本 MCP status 缓存。
pub async fn clear_script_mcp_status(
    app_handle: tauri::AppHandle,
    script_path: Option<String>,
    title: Option<String>,
) -> Result<ScriptOperationResult, String> {
    let backend = TauriScriptMcpBackend { app_handle };
    backend.clear_status(script_path, title).await
}

/// 清空脚本 MCP console 缓存。
pub async fn clear_script_mcp_console(
    app_handle: tauri::AppHandle,
    script_path: Option<String>,
    include_global: Option<bool>,
) -> Result<ScriptOperationResult, String> {
    let backend = TauriScriptMcpBackend { app_handle };
    backend.clear_console(script_path, include_global).await
}

/// 启动脚本 MCP 服务。
pub async fn start_script_mcp_server_runtime(
    app_handle: tauri::AppHandle,
    port: Option<u16>,
) -> Result<ScriptMcpServerState, String> {
    if let Some(port) = port {
        if port == 0 {
            return Err("MCP 端口必须大于 0".to_string());
        }
        SCRIPT_MCP_SERVER_PORT.store(port, Ordering::Release);
    }
    if SCRIPT_MCP_SERVER_HANDLE
        .lock()
        .map_err(|_| "读取 MCP 服务句柄失败".to_string())?
        .is_some()
    {
        return Ok(get_script_mcp_server_state());
    }

    let backend = Arc::new(TauriScriptMcpBackend { app_handle });
    let handle = start_script_mcp_server(
        backend,
        ScriptMcpServerConfig {
            bind_addr: default_bind_addr(),
        },
    )
    .await?;

    if let Ok(mut last_error) = SCRIPT_MCP_LAST_ERROR.lock() {
        *last_error = None;
    }
    SCRIPT_MCP_SERVER_ENABLED.store(true, Ordering::Release);
    if let Ok(mut guard) = SCRIPT_MCP_SERVER_HANDLE.lock() {
        *guard = Some(handle);
    }
    Ok(get_script_mcp_server_state())
}

/// 停止脚本 MCP 服务。
pub async fn stop_script_mcp_server_runtime() -> Result<ScriptMcpServerState, String> {
    let handle = SCRIPT_MCP_SERVER_HANDLE
        .lock()
        .map_err(|_| "读取 MCP 服务句柄失败".to_string())?
        .take();
    if let Some(handle) = handle {
        if let Err(error) = handle.stop().await {
            if let Ok(mut last_error) = SCRIPT_MCP_LAST_ERROR.lock() {
                *last_error = Some(error.clone());
            }
            return Err(error);
        }
    }
    SCRIPT_MCP_SERVER_ENABLED.store(false, Ordering::Release);
    Ok(get_script_mcp_server_state())
}
