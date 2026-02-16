use crate::submodules::async_tokio::TokioJobExecutor;
use crate::submodules::jsmat::JsMat;
use crate::submodules::jstimer::JsTimer;
use crate::submodules::logger::TauriLogger;
use crate::submodules::script_builtin::{register_builtin_functions, set_script_event_app_handle};
use boa_engine::builtins::error::Error as BoaErrorObject;
use boa_engine::context::ContextBuilder;
use boa_engine::job::JobExecutor;
use boa_engine::{JsError, Script, Source};
use boa_runtime::extensions::ConsoleExtension;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, LazyLock};
use tauri::Emitter;

/// 统一处理脚本执行错误日志输出与前端事件推送
///
/// # 参数
/// - `app_handle`: Tauri 应用句柄
/// - `error_message`: 需要输出的错误消息
///
/// # 返回
/// 返回原始错误消息，便于直接用于 `Err(...)`
fn emit_script_error(app_handle: &tauri::AppHandle, error_message: String) -> String {
    eprintln!("{}", error_message);
    let _ = app_handle.emit(
        "script-console",
        serde_json::json!({
            "level": "error",
            "message": error_message.clone(),
        }),
    );
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

/// 运行脚本并将控制台输出发送到 Tauri 事件系统
///
/// # 参数
/// - `script_path`: 脚本文件路径
/// - `app_handle`: Tauri 应用句柄，用于发送事件
///
/// # 返回
/// 返回执行结果，如果成功则返回 Ok(())，否则返回错误信息
pub async fn run_script_with_tauri_console(
    script_path: String,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
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
            .register_global_class::<JsTimer>()
            .map_err(|e| format!("注册 JsTimer 失败: {:?}", e))?;

        // 创建自定义的 Tauri Logger
        let tauri_logger = TauriLogger {
            app_handle: logger_app_handle,
        };

        // 使用自定义的 Console Extension
        boa_runtime::register(
            (
                ConsoleExtension(tauri_logger),
                boa_runtime::extensions::TimeoutExtension,
            ),
            None,
            context,
        )
        .map_err(|e| format!("注册 Console Extension 失败: {:?}", e))?;

        // 设置脚本内置函数的事件发送器，供 setStatus 等函数推送到前端。
        set_script_event_app_handle(app_handle.clone());
        register_builtin_functions(context).map_err(|e| format!("注册内置函数失败: {:?}", e))?;
        SCRIPT_STOPED.store(false, Ordering::Release);
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
                    return Err(emit_script_error(&app_handle, error_message));
                }

                // 使用同步版本的 run_jobs
                if let Err(e) = job_executor.run_jobs(context) {
                    let error_message = format_js_error_message(context, "运行任务失败", &e);
                    return Err(emit_script_error(&app_handle, error_message));
                }
            }
            Err(e) => {
                // 解析或运行时异常时，写入终端并同步推送到前端脚本控制台
                let error_message = format_js_error_message(context, "JavaScript 执行错误", &e);
                return Err(emit_script_error(&app_handle, error_message));
            }
        }
        Ok::<(), String>(())
    })
    .await
    .map_err(|e| format!("任务执行失败: {}", e))?
}

pub static SCRIPT_STOPED: LazyLock<Arc<AtomicBool>> =
    LazyLock::new(|| Arc::new(AtomicBool::new(false)));
pub fn stop_script() -> Result<(), String> {
    SCRIPT_STOPED.store(true, Ordering::Release);
    Ok(())
}
