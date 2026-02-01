use boa_engine::{Context, JsResult};
use boa_gc::{Finalize, Trace};
use boa_runtime::console::{ConsoleState, Logger};
use std::sync::Arc;
use tauri::Emitter;

/// 自定义的 Tauri Logger，将控制台输出发送到 Tauri 事件系统
#[derive(Debug, Trace, Finalize)]
pub struct TauriLogger {
    #[unsafe_ignore_trace]
    pub app_handle: Arc<tauri::AppHandle>,
}

impl Logger for TauriLogger {
    /// 发送控制台输出到 Tauri 事件系统
    fn log(&self, msg: String, _state: &ConsoleState, _context: &mut Context) -> JsResult<()> {
        let _ = self.app_handle.emit(
            "script-console",
            serde_json::json!({
                "level": "log",
                "message": msg,
            }),
        );
        Ok(())
    }

    fn info(&self, msg: String, _state: &ConsoleState, _context: &mut Context) -> JsResult<()> {
        let _ = self.app_handle.emit(
            "script-console",
            serde_json::json!({
                "level": "info",
                "message": msg,
            }),
        );
        Ok(())
    }

    fn warn(&self, msg: String, _state: &ConsoleState, _context: &mut Context) -> JsResult<()> {
        let _ = self.app_handle.emit(
            "script-console",
            serde_json::json!({
                "level": "warn",
                "message": msg,
            }),
        );
        Ok(())
    }

    fn error(&self, msg: String, _state: &ConsoleState, _context: &mut Context) -> JsResult<()> {
        let _ = self.app_handle.emit(
            "script-console",
            serde_json::json!({
                "level": "error",
                "message": msg,
            }),
        );
        Ok(())
    }

    fn debug(&self, msg: String, _state: &ConsoleState, _context: &mut Context) -> JsResult<()> {
        let _ = self.app_handle.emit(
            "script-console",
            serde_json::json!({
                "level": "debug",
                "message": msg,
            }),
        );
        Ok(())
    }
}
