//! 脚本引擎命令包装：运行/停止脚本、运行状态查询与热键、输入录制、MCP 服务的命令入口。

use serde::Serialize;

/// CLI 入口：执行指定脚本文件。
///
/// # 参数
/// - `script_path`: 脚本路径（可相对或绝对）
/// - `script_config`: 可选脚本配置（用于 CLI 模式 readConfig）
/// - `script_config_file_path`: 可选配置文件路径（用于 CLI 模式 setConfig 写回）
///
/// # 返回
/// 返回脚本执行结果字符串；失败时返回错误信息
#[cfg(feature = "dob-script-cli")]
pub async fn run_script_cli(
    script_path: String,
    script_config: Option<serde_json::Value>,
    script_config_file_path: Option<String>,
) -> Result<String, String> {
    use crate::submodules::script::run_script_file_cli;
    run_script_file_cli(script_path, script_config, script_config_file_path).await
}

#[tauri::command]
pub async fn run_script(script_path: String, app_handle: tauri::AppHandle) -> Result<String, String> {
    use crate::submodules::script::run_script_file;
    match run_script_file(script_path, app_handle).await {
        Ok(result) => Ok(result),
        Err(e) => Err(format!("脚本执行失败: {}", e)),
    }
}

#[tauri::command]
pub async fn exec_script(
    script: String,
    scope: Option<String>,
    timeout_ms: Option<u64>,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    use crate::submodules::script::exec_script_with_tauri_console;
    let result = exec_script_with_tauri_console(script, scope, app_handle)
        .await
        .map_err(|e| format!("临时脚本执行失败: {}", e))?;
    let _ = timeout_ms;
    Ok(result.result)
}

/// 响应脚本 readConfig 请求，将前端当前值回传给脚本运行时。
#[tauri::command]
pub fn resolve_script_config_request(
    request_id: String,
    value: serde_json::Value,
) -> Result<String, String> {
    use crate::submodules::script_builtin::resolve_script_config_request;
    resolve_script_config_request(request_id, value)?;
    Ok("配置请求已响应".to_string())
}

/// 响应脚本 MCP requestHelp 请求，将前端标注结果回传给 MCP 工具调用方。
#[tauri::command]
pub fn resolve_script_help_request(
    request_id: String,
    response: mcp_server::ScriptHelpResponse,
) -> Result<String, String> {
    use crate::submodules::script_mcp::resolve_script_help_request;
    resolve_script_help_request(request_id, response)?;
    Ok("协助请求已响应".to_string())
}

#[tauri::command]
pub fn stop_script() -> Result<String, String> {
    use crate::submodules::script::stop_script;
    match stop_script() {
        Ok(_) => Ok("脚本已停止".to_string()),
        Err(e) => Err(format!("停止脚本失败: {:?}", e)),
    }
}

/// 停止指定脚本路径对应的运行实例。
#[tauri::command]
pub fn stop_script_by_path(script_path: String) -> Result<String, String> {
    use crate::submodules::script::stop_script_by_path;
    match stop_script_by_path(script_path) {
        Ok(_) => Ok("脚本停止请求已发送".to_string()),
        Err(e) => Err(format!("停止脚本失败: {:?}", e)),
    }
}

/// 获取当前脚本运行状态，供前端刷新后恢复停止能力。
#[tauri::command]
pub fn get_script_running_state() -> Result<bool, String> {
    use crate::submodules::script::is_script_running;
    Ok(is_script_running())
}

/// 脚本运行信息。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptRuntimeInfo {
    /// 是否存在运行中的脚本
    running: bool,
    /// 正在运行的脚本路径列表（去重）
    script_paths: Vec<String>,
    /// 运行实例总数（同一路径并行会累计）
    running_count: usize,
}

/// 获取当前脚本运行信息（运行状态 + 正在执行脚本列表）。
#[tauri::command]
pub fn get_script_runtime_info() -> Result<ScriptRuntimeInfo, String> {
    use crate::submodules::script::get_script_runtime_info;
    let (running, script_paths, running_count) = get_script_runtime_info();
    Ok(ScriptRuntimeInfo {
        running,
        script_paths,
        running_count,
    })
}

/// 获取脚本页 MCP 服务当前状态。
#[tauri::command]
pub fn get_script_mcp_server_state() -> Result<crate::submodules::script_mcp::ScriptMcpServerState, String>
{
    Ok(crate::submodules::script_mcp::get_script_mcp_server_state())
}

/// 清空脚本页 MCP status / console 缓存。
#[tauri::command]
pub async fn clear_script_mcp_cache(
    script_path: Option<String>,
    app_handle: tauri::AppHandle,
) -> Result<mcp_server::ScriptOperationResult, String> {
    crate::submodules::script_mcp::clear_script_mcp_cache(app_handle, script_path).await
}

/// 清空脚本页 MCP status 缓存。
#[tauri::command]
pub async fn clear_script_mcp_status(
    script_path: Option<String>,
    title: Option<String>,
    app_handle: tauri::AppHandle,
) -> Result<mcp_server::ScriptOperationResult, String> {
    crate::submodules::script_mcp::clear_script_mcp_status(app_handle, script_path, title).await
}

/// 清空脚本页 MCP console 缓存。
#[tauri::command]
pub async fn clear_script_mcp_console(
    script_path: Option<String>,
    include_global: Option<bool>,
    app_handle: tauri::AppHandle,
) -> Result<mcp_server::ScriptOperationResult, String> {
    crate::submodules::script_mcp::clear_script_mcp_console(app_handle, script_path, include_global)
        .await
}

/// 更新脚本页 MCP 服务启停状态。
#[tauri::command]
pub async fn set_script_mcp_server_enabled(
    enabled: bool,
    port: Option<u16>,
    app_handle: tauri::AppHandle,
) -> Result<crate::submodules::script_mcp::ScriptMcpServerState, String> {
    if enabled {
        crate::submodules::script_mcp::start_script_mcp_server_runtime(app_handle, port).await
    } else {
        crate::submodules::script_mcp::stop_script_mcp_server_runtime().await
    }
}

/// 同步脚本热键绑定到后端（AHK 风格，如 ^c）。
#[tauri::command]
pub fn sync_script_hotkey_bindings(
    bindings: Vec<crate::submodules::hotkey::ScriptHotkeyBinding>,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    use crate::submodules::hotkey::sync_script_hotkey_bindings;
    sync_script_hotkey_bindings(app_handle, bindings)?;
    Ok("热键绑定已同步".to_string())
}

/// 获取后端当前生效的热键绑定。
#[tauri::command]
pub fn get_script_hotkey_bindings(
) -> Result<Vec<crate::submodules::hotkey::ScriptHotkeyBinding>, String> {
    use crate::submodules::hotkey::get_script_hotkey_bindings;
    Ok(get_script_hotkey_bindings())
}

/// 设置脚本输入录制器是否启用 F10 热键监听。
#[tauri::command]
pub fn set_script_input_recorder_hotkey_enabled(
    enabled: bool,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    use crate::submodules::hotkey::set_script_input_recorder_hotkey_enabled;
    set_script_input_recorder_hotkey_enabled(app_handle, enabled)?;
    Ok(if enabled {
        "录制热键监听已启用".to_string()
    } else {
        "录制热键监听已禁用".to_string()
    })
}

/// 获取脚本输入录制器快照。
#[tauri::command]
pub fn get_script_input_recorder_snapshot()
-> Result<crate::submodules::hotkey::ScriptInputRecorderSnapshot, String> {
    use crate::submodules::hotkey::get_script_input_recorder_snapshot;
    Ok(get_script_input_recorder_snapshot())
}

/// 清空脚本输入录制器动作列表。
#[tauri::command]
pub fn clear_script_input_recorder_actions() -> Result<String, String> {
    use crate::submodules::hotkey::clear_script_input_recorder_actions;
    clear_script_input_recorder_actions()?;
    Ok("录制动作已清空".to_string())
}
