use crate::submodules::async_tokio::TokioJobExecutor;
use crate::submodules::jsmat::JsMat;
use crate::submodules::jstimer::JsTimer;
use crate::submodules::logger::TauriLogger;
use crate::submodules::script_builtin::register_builtin_functions;
use boa_engine::context::ContextBuilder;
use boa_engine::job::JobExecutor;
use boa_engine::{Script, Source};
use boa_runtime::extensions::ConsoleExtension;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, LazyLock};

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
            app_handle: Arc::new(app_handle),
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

        register_builtin_functions(context).map_err(|e| format!("注册内置函数失败: {:?}", e))?;
        SCRIPT_STOPED.store(false, Ordering::Release);
        let source = Source::from_filepath(Path::new(&script_path))
            .map_err(|e| format!("无法读取文件 {:?}: {}", script_path, e))?;
        let script =
            Script::parse(source, None, context).map_err(|e| format!("解析脚本失败: {:?}", e))?;
        match script.evaluate(context) {
            Ok(_) => {
                // 使用同步版本的 run_jobs
                job_executor
                    .run_jobs(context)
                    .map_err(|e| format!("运行任务失败: {:?}", e))?;
            }
            Err(e) => {
                eprintln!("JavaScript 执行错误: {:?}", e);
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
