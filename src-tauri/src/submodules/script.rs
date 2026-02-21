use crate::submodules::async_tokio::TokioJobExecutor;
use crate::submodules::jsdnn::JsDnnNet;
use crate::submodules::jsmat::JsMat;
use crate::submodules::jstimer::JsTimer;
#[cfg(feature = "dob-script-cli")]
use crate::submodules::logger::StdioLogger;
use crate::submodules::logger::TauriLogger;
use crate::submodules::script_console::Console;
use crate::submodules::script_builtin::{
    register_builtin_functions, set_current_script_path, set_script_event_app_handle,
};
#[cfg(feature = "dob-script-cli")]
use crate::submodules::script_builtin::set_script_cli_config;
use boa_engine::builtins::error::Error as BoaErrorObject;
use boa_engine::context::ContextBuilder;
use boa_engine::job::JobExecutor;
use boa_engine::{JsError, Script, Source};
use std::cell::RefCell;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, LazyLock, Mutex};
use tauri::Emitter;

thread_local! {
    /// 当前执行线程绑定的停止快照（用于并行脚本精确停止）。
    static CURRENT_SCRIPT_STOP_SNAPSHOT: RefCell<Option<ScriptStopSnapshot>> = const { RefCell::new(None) };
}

/// 脚本“主动停止”中断标记。
///
/// 说明：
/// - 由高频内置函数在检测到停止请求时抛出；
/// - 运行入口识别该标记后按“正常停止”处理，而非脚本错误。
pub const SCRIPT_STOP_INTERRUPT_MESSAGE: &str = "__SCRIPT_STOP_REQUESTED__";

#[derive(Clone)]
struct ScriptStopSnapshot {
    global_generation: u64,
    path_generation: u64,
    script_path: String,
}

/// 统一处理脚本执行错误日志输出与前端事件推送
///
/// # 参数
/// - `app_handle`: Tauri 应用句柄
/// - `scope`: 事件作用域（脚本完整路径）
/// - `error_message`: 需要输出的错误消息
///
/// # 返回
/// 返回原始错误消息，便于直接用于 `Err(...)`
fn emit_script_error(app_handle: &tauri::AppHandle, scope: &str, error_message: String) -> String {
    eprintln!("{}", error_message);
    let _ = app_handle.emit(
        "script-console",
        serde_json::json!({
            "scope": scope,
            "level": "error",
            "message": error_message.clone(),
        }),
    );
    error_message
}

/// 统一处理 CLI 模式下的脚本执行错误输出。
///
/// # 参数
/// - `scope`: 事件作用域（脚本完整路径）
/// - `error_message`: 需要输出的错误消息
///
/// # 返回
/// 返回原始错误消息，便于直接用于 `Err(...)`
#[cfg(feature = "dob-script-cli")]
fn emit_script_error_cli(scope: &str, error_message: String) -> String {
    eprintln!("[{scope}] {error_message}");
    error_message
}

/// 将 Boa 的 `JsError` 转换为可读错误文本
///
/// # 参数
/// - `context`: JavaScript 上下文，用于将错误对象转换为字符串
/// - `prefix`: 错误前缀（如阶段名）
/// - `error`: Boa 执行错误
///
/// # 返回
/// 返回拼接后的可读错误信息
fn format_js_error_message(
    context: &mut boa_engine::Context,
    prefix: &str,
    error: &JsError,
) -> String {
    let opaque = error.to_opaque(context);
    let detail = opaque
        .to_string(context)
        .map(|s| s.to_std_string_escaped())
        .unwrap_or_else(|_| format!("{:?}", opaque));
    format!("{}: {}", prefix, detail)
}

/// 脚本运行状态守卫，确保运行状态在任意退出路径都能复位。
struct ScriptRunningGuard {
    script_path: String,
    app_handle: tauri::AppHandle,
}

impl ScriptRunningGuard {
    /// 进入运行态并返回守卫实例。
    fn enter(script_path: String, app_handle: tauri::AppHandle) -> Self {
        let stop_generation = SCRIPT_STOP_GENERATION.load(Ordering::Acquire);
        let path_generation = SCRIPT_STOP_PATH_GENERATIONS
            .lock()
            .ok()
            .and_then(|guard| guard.get(&script_path).copied())
            .unwrap_or(0);
        CURRENT_SCRIPT_STOP_SNAPSHOT.with(|storage| {
            *storage.borrow_mut() = Some(ScriptStopSnapshot {
                global_generation: stop_generation,
                path_generation,
                script_path: script_path.clone(),
            });
        });

        SCRIPT_RUNNING.store(true, Ordering::Release);
        if let Ok(mut guard) = SCRIPT_RUNNING_PATH_COUNTS.lock() {
            let counter = guard.entry(script_path.clone()).or_insert(0);
            *counter += 1;
        }
        emit_script_runtime_updated(&app_handle);
        Self {
            script_path,
            app_handle,
        }
    }
}

impl Drop for ScriptRunningGuard {
    fn drop(&mut self) {
        if let Ok(mut guard) = SCRIPT_RUNNING_PATH_COUNTS.lock() {
            if let Some(counter) = guard.get_mut(&self.script_path) {
                if *counter > 1 {
                    *counter -= 1;
                } else {
                    guard.remove(&self.script_path);
                }
            }
            SCRIPT_RUNNING.store(!guard.is_empty(), Ordering::Release);
        }
        CURRENT_SCRIPT_STOP_SNAPSHOT.with(|storage| {
            *storage.borrow_mut() = None;
        });
        emit_script_runtime_updated(&self.app_handle);
    }
}

/// 向前端广播最新脚本运行信息。
fn emit_script_runtime_updated(app_handle: &tauri::AppHandle) {
    let (running, script_paths, running_count) = get_script_runtime_info();
    let _ = app_handle.emit(
        "script-runtime-updated",
        serde_json::json!({
            "running": running,
            "scriptPaths": script_paths,
            "runningCount": running_count,
        }),
    );
}

/// 规范化并校验脚本路径。
///
/// 说明：
/// - 返回绝对规范路径，避免并行运行时依赖全局工作目录；
/// - 仅接受存在且为文件的路径。
pub fn normalize_script_path(script_path: String) -> Result<String, String> {
    let path = PathBuf::from(script_path.clone());
    if !path.exists() {
        return Err(format!("脚本文件不存在：{}", script_path));
    }
    if !path.is_file() {
        return Err(format!("脚本路径不是文件：{}", script_path));
    }
    let canonical = path
        .canonicalize()
        .map_err(|e| format!("规范化脚本路径失败：{}，错误信息：{:?}", script_path, e))?;
    Ok(canonical.to_string_lossy().to_string())
}

/// 运行脚本并将控制台输出发送到 Tauri 事件系统
///
/// # 参数
/// - `script_path`: 脚本文件路径
/// - `app_handle`: Tauri 应用句柄，用于发送事件
///
/// # 返回
/// 返回执行结果字符串，如果成功则返回 Ok(String)，否则返回错误信息
pub async fn run_script_with_tauri_console(
    script_path: String,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    // 使用 spawn_blocking 在阻塞线程中执行脚本，避免 Context 的 Send 约束问题
    tokio::task::spawn_blocking(move || {
        let job_executor = std::rc::Rc::new(TokioJobExecutor::new());
        let logger_app_handle = Arc::new(app_handle.clone());
        let context = &mut ContextBuilder::new()
            .job_executor(job_executor.clone())
            .build()
            .unwrap();

        context
            .register_global_class::<JsMat>()
            .map_err(|e| format!("注册 JsMat 失败: {:?}", e))?;
        context
            .register_global_class::<JsDnnNet>()
            .map_err(|e| format!("注册 JsDnnNet 失败: {:?}", e))?;
        context
            .register_global_class::<JsTimer>()
            .map_err(|e| format!("注册 JsTimer 失败: {:?}", e))?;

        // 创建自定义的 Tauri Logger
        let tauri_logger = TauriLogger {
            app_handle: logger_app_handle,
        };

        // 注册 timeout 扩展，并挂载自定义 console 实现。
        boa_runtime::register((boa_runtime::extensions::TimeoutExtension,), None, context)
            .map_err(|e| format!("注册 Timeout Extension 失败: {:?}", e))?;
        Console::register_with_logger(tauri_logger, context)
            .map_err(|e| format!("注册自定义 Console 失败: {:?}", e))?;

        // 设置脚本内置函数的事件发送器，供 setStatus 等函数推送到前端。
        set_script_event_app_handle(app_handle.clone());
        set_current_script_path(script_path.clone());
        register_builtin_functions(context).map_err(|e| format!("注册内置函数失败: {:?}", e))?;
        let _running_guard = ScriptRunningGuard::enter(script_path.clone(), app_handle.clone());
        let source = Source::from_filepath(Path::new(&script_path))
            .map_err(|e| format!("无法读取文件 {:?}: {}", script_path, e))?;
        let script =
            Script::parse(source, None, context).map_err(|e| format!("解析脚本失败: {:?}", e))?;
        match script.evaluate(context) {
            Ok(result) => {
                // 某些脚本会“返回 Error 对象”而不是直接 throw，
                // 这类场景也视为异常退出，避免前端误判为执行成功。
                if result
                    .as_object()
                    .is_some_and(|obj| obj.downcast_ref::<BoaErrorObject>().is_some())
                {
                    let error_detail = result
                        .to_string(context)
                        .map(|s| s.to_std_string_escaped())
                        .unwrap_or_else(|_| format!("{:?}", result));
                    let error_message = format!("JavaScript 返回 Error 对象: {}", error_detail);
                    return Err(emit_script_error(&app_handle, script_path.as_str(), error_message));
                }

                // 使用同步版本的 run_jobs
                if let Err(e) = job_executor.run_jobs(context) {
                    let error_message = format_js_error_message(context, "运行任务失败", &e);
                    return Err(emit_script_error(&app_handle, script_path.as_str(), error_message));
                }

                // 将脚本返回值转成字符串传回前端，供调度器流控做 case/default 匹配。
                let result_text = if result.is_undefined() || result.is_null() {
                    String::new()
                } else {
                    result
                        .to_string(context)
                        .map(|s| s.to_std_string_escaped())
                        .unwrap_or_else(|_| format!("{:?}", result))
                };
                Ok::<String, String>(result_text)
            }
            Err(e) => {
                // 识别“主动停止”中断并按正常停止返回，避免前端误报脚本错误。
                let opaque = e.to_opaque(context);
                let detail = opaque
                    .to_string(context)
                    .map(|s| s.to_std_string_escaped())
                    .unwrap_or_else(|_| format!("{:?}", opaque));
                if detail.contains(SCRIPT_STOP_INTERRUPT_MESSAGE) {
                    return Ok(String::new());
                }

                // 解析或运行时异常时，写入终端并同步推送到前端脚本控制台
                let error_message = format_js_error_message(context, "JavaScript 执行错误", &e);
                Err(emit_script_error(&app_handle, script_path.as_str(), error_message))
            }
        }
    })
    .await
    .map_err(|e| format!("任务执行失败: {}", e))?
}

/// 运行脚本并将控制台输出写入当前进程标准输出/标准错误（CLI 模式）。
///
/// # 参数
/// - `script_path`: 脚本文件路径（建议为规范化绝对路径）
/// - `script_config`: 可选脚本配置（用于 readConfig）
/// - `script_config_file_path`: 可选配置文件路径（用于 setConfig 回写文件）
///
/// # 返回
/// 返回执行结果字符串，如果成功则返回 Ok(String)，否则返回错误信息
#[cfg(feature = "dob-script-cli")]
pub async fn run_script_with_stdio_console(
    script_path: String,
    script_config: Option<serde_json::Value>,
    script_config_file_path: Option<String>,
) -> Result<String, String> {
    // 使用 spawn_blocking 在阻塞线程中执行脚本，避免 Context 的 Send 约束问题
    tokio::task::spawn_blocking(move || {
        let job_executor = std::rc::Rc::new(TokioJobExecutor::new());
        let context = &mut ContextBuilder::new()
            .job_executor(job_executor.clone())
            .build()
            .unwrap();

        context
            .register_global_class::<JsMat>()
            .map_err(|e| format!("注册 JsMat 失败: {:?}", e))?;
        context
            .register_global_class::<JsDnnNet>()
            .map_err(|e| format!("注册 JsDnnNet 失败: {:?}", e))?;
        context
            .register_global_class::<JsTimer>()
            .map_err(|e| format!("注册 JsTimer 失败: {:?}", e))?;

        // 注册 timeout 扩展，并挂载终端 console 实现。
        boa_runtime::register((boa_runtime::extensions::TimeoutExtension,), None, context)
            .map_err(|e| format!("注册 Timeout Extension 失败: {:?}", e))?;
        Console::register_with_logger(StdioLogger, context)
            .map_err(|e| format!("注册终端 Console 失败: {:?}", e))?;

        // CLI 模式下不绑定 Tauri 事件发送器，但保持脚本路径上下文可用。
        set_script_cli_config(script_config, script_config_file_path)
            .map_err(|e| format!("设置 CLI 脚本配置失败: {e}"))?;
        set_current_script_path(script_path.clone());
        register_builtin_functions(context).map_err(|e| format!("注册内置函数失败: {:?}", e))?;
        let source = Source::from_filepath(Path::new(&script_path))
            .map_err(|e| format!("无法读取文件 {:?}: {}", script_path, e))?;
        let script =
            Script::parse(source, None, context).map_err(|e| format!("解析脚本失败: {:?}", e))?;
        match script.evaluate(context) {
            Ok(result) => {
                // 某些脚本会“返回 Error 对象”而不是直接 throw，
                // 这类场景也视为异常退出，避免 CLI 误判为执行成功。
                if result
                    .as_object()
                    .is_some_and(|obj| obj.downcast_ref::<BoaErrorObject>().is_some())
                {
                    let error_detail = result
                        .to_string(context)
                        .map(|s| s.to_std_string_escaped())
                        .unwrap_or_else(|_| format!("{:?}", result));
                    let error_message = format!("JavaScript 返回 Error 对象: {}", error_detail);
                    return Err(emit_script_error_cli(script_path.as_str(), error_message));
                }

                // 使用同步版本的 run_jobs
                if let Err(e) = job_executor.run_jobs(context) {
                    let error_message = format_js_error_message(context, "运行任务失败", &e);
                    return Err(emit_script_error_cli(script_path.as_str(), error_message));
                }

                // 将脚本返回值转成字符串供 CLI 主程序按需输出。
                let result_text = if result.is_undefined() || result.is_null() {
                    String::new()
                } else {
                    result
                        .to_string(context)
                        .map(|s| s.to_std_string_escaped())
                        .unwrap_or_else(|_| format!("{:?}", result))
                };
                Ok::<String, String>(result_text)
            }
            Err(e) => {
                // 识别“主动停止”中断并按正常停止返回。
                let opaque = e.to_opaque(context);
                let detail = opaque
                    .to_string(context)
                    .map(|s| s.to_std_string_escaped())
                    .unwrap_or_else(|_| format!("{:?}", opaque));
                if detail.contains(SCRIPT_STOP_INTERRUPT_MESSAGE) {
                    return Ok(String::new());
                }

                // 解析或运行时异常时，输出到标准错误。
                let error_message = format_js_error_message(context, "JavaScript 执行错误", &e);
                Err(emit_script_error_cli(script_path.as_str(), error_message))
            }
        }
    })
    .await
    .map_err(|e| format!("任务执行失败: {}", e))?
}

/// 运行脚本（对外入口）：先做路径规范化，再执行脚本。
pub async fn run_script_file(script_path: String, app_handle: tauri::AppHandle) -> Result<String, String> {
    let normalized_path = normalize_script_path(script_path)?;
    run_script_with_tauri_console(normalized_path, app_handle).await
}

/// CLI 对外入口：先做路径规范化，再执行脚本。
#[cfg(feature = "dob-script-cli")]
pub async fn run_script_file_cli(
    script_path: String,
    script_config: Option<serde_json::Value>,
    script_config_file_path: Option<String>,
) -> Result<String, String> {
    let normalized_path = normalize_script_path(script_path)?;
    run_script_with_stdio_console(normalized_path, script_config, script_config_file_path).await
}

pub static SCRIPT_RUNNING: LazyLock<Arc<AtomicBool>> =
    LazyLock::new(|| Arc::new(AtomicBool::new(false)));
pub static SCRIPT_RUNNING_PATH_COUNTS: LazyLock<Arc<Mutex<HashMap<String, usize>>>> =
    LazyLock::new(|| Arc::new(Mutex::new(HashMap::new())));
pub static SCRIPT_STOP_GENERATION: AtomicU64 = AtomicU64::new(0);
pub static SCRIPT_STOP_PATH_GENERATIONS: LazyLock<Arc<Mutex<HashMap<String, u64>>>> =
    LazyLock::new(|| Arc::new(Mutex::new(HashMap::new())));

/// 读取当前是否存在正在执行的脚本。
pub fn is_script_running() -> bool {
    SCRIPT_RUNNING.load(Ordering::Acquire)
}

/// 获取脚本运行信息（运行状态 + 正在执行的脚本路径列表 + 总运行实例数）。
pub fn get_script_runtime_info() -> (bool, Vec<String>, usize) {
    let running = SCRIPT_RUNNING.load(Ordering::Acquire);
    if !running {
        return (false, Vec::new(), 0);
    }

    let mut script_paths: Vec<String> = Vec::new();
    let mut running_count = 0usize;
    if let Ok(guard) = SCRIPT_RUNNING_PATH_COUNTS.lock() {
        for (path, count) in guard.iter() {
            if *count == 0 {
                continue;
            }
            running_count += *count;
            script_paths.push(path.clone());
        }
        script_paths.sort();
    }

    if script_paths.is_empty() {
        (false, Vec::new(), 0)
    } else {
        (true, script_paths, running_count)
    }
}

/// 判断当前脚本线程是否已收到停止请求。
pub fn should_stop_current_script() -> bool {
    let snapshot = CURRENT_SCRIPT_STOP_SNAPSHOT.with(|storage| storage.borrow().clone());
    let Some(snapshot) = snapshot else {
        return false;
    };

    let global_generation = SCRIPT_STOP_GENERATION.load(Ordering::Acquire);
    if global_generation != snapshot.global_generation {
        return true;
    }

    let path_generation = SCRIPT_STOP_PATH_GENERATIONS
        .lock()
        .ok()
        .and_then(|guard| guard.get(&snapshot.script_path).copied())
        .unwrap_or(0);
    path_generation != snapshot.path_generation
}

/// 请求停止当前批次运行中的脚本（并行脚本会一并停止）。
pub fn stop_script() -> Result<(), String> {
    SCRIPT_STOP_GENERATION.fetch_add(1, Ordering::AcqRel);
    Ok(())
}

/// 停止指定脚本路径对应的运行实例（同路径并行实例会一并停止）。
pub fn stop_script_by_path(script_path: String) -> Result<(), String> {
    let normalized_path = normalize_script_path(script_path)?;
    let mut guard = SCRIPT_STOP_PATH_GENERATIONS
        .lock()
        .map_err(|e| format!("获取脚本停止映射锁失败: {e:?}"))?;
    let entry = guard.entry(normalized_path).or_insert(0);
    *entry += 1;
    Ok(())
}
