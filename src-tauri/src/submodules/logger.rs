use boa_engine::{Context, JsResult};
use boa_gc::{Finalize, Trace};
use crate::submodules::script_builtin::get_current_script_path;
use crate::submodules::script_console::{ConsoleState, Logger};
use std::sync::Arc;
use tauri::Emitter;

/// 自定义的 Tauri Logger，将控制台输出发送到 Tauri 事件系统
#[derive(Debug, Trace, Finalize)]
pub struct TauriLogger {
    #[unsafe_ignore_trace]
    pub app_handle: Arc<tauri::AppHandle>,
}

/// 终端 Logger：将 console 输出映射到标准输出/标准错误。
#[cfg(feature = "dob-script-cli")]
#[derive(Debug, Trace, Finalize)]
pub struct StdioLogger;

impl Logger for TauriLogger {
    /// 发送控制台输出到 Tauri 事件系统
    fn log(&self, msg: String, _state: &ConsoleState, _context: &mut Context) -> JsResult<()> {
        let scope = get_current_script_path();
        let _ = self.app_handle.emit(
            "script-console",
            serde_json::json!({
                "scope": scope,
                "level": "log",
                "message": msg,
            }),
        );
        Ok(())
    }

    fn info(&self, msg: String, _state: &ConsoleState, _context: &mut Context) -> JsResult<()> {
        let scope = get_current_script_path();
        let _ = self.app_handle.emit(
            "script-console",
            serde_json::json!({
                "scope": scope,
                "level": "info",
                "message": msg,
            }),
        );
        Ok(())
    }

    fn warn(&self, msg: String, _state: &ConsoleState, _context: &mut Context) -> JsResult<()> {
        let scope = get_current_script_path();
        let _ = self.app_handle.emit(
            "script-console",
            serde_json::json!({
                "scope": scope,
                "level": "warn",
                "message": msg,
            }),
        );
        Ok(())
    }

    fn error(&self, msg: String, _state: &ConsoleState, _context: &mut Context) -> JsResult<()> {
        let scope = get_current_script_path();
        let _ = self.app_handle.emit(
            "script-console",
            serde_json::json!({
                "scope": scope,
                "level": "error",
                "message": msg,
            }),
        );
        Ok(())
    }

    fn debug(&self, msg: String, _state: &ConsoleState, _context: &mut Context) -> JsResult<()> {
        let scope = get_current_script_path();
        let _ = self.app_handle.emit(
            "script-console",
            serde_json::json!({
                "scope": scope,
                "level": "debug",
                "message": msg,
            }),
        );
        Ok(())
    }
}

#[cfg(feature = "dob-script-cli")]
impl Logger for StdioLogger {
    /// 普通日志输出到 stdout。
    fn log(&self, msg: String, _state: &ConsoleState, _context: &mut Context) -> JsResult<()> {
        println!("{msg}");
        Ok(())
    }

    /// info 日志输出到 stdout。
    fn info(&self, msg: String, _state: &ConsoleState, _context: &mut Context) -> JsResult<()> {
        println!("{msg}");
        Ok(())
    }

    /// warn 日志输出到 stderr。
    fn warn(&self, msg: String, _state: &ConsoleState, _context: &mut Context) -> JsResult<()> {
        eprintln!("{msg}");
        Ok(())
    }

    /// error 日志输出到 stderr。
    fn error(&self, msg: String, _state: &ConsoleState, _context: &mut Context) -> JsResult<()> {
        eprintln!("{msg}");
        Ok(())
    }

    /// debug 日志输出到 stdout。
    fn debug(&self, msg: String, _state: &ConsoleState, _context: &mut Context) -> JsResult<()> {
        println!("{msg}");
        Ok(())
    }
}
