//! 脚本运行时：Boa JS 引擎 + 视觉/输入/系统内置函数。
//!
//! 依赖方向：`apps/web/src-tauri`（Tauri 应用）与 dob-script CLI 都依赖本 crate，
//! 本 crate 不依赖 apps 内的任何代码（仅依赖外部 crates 与 `mcp_server`）。

pub mod async_tokio;
pub mod capture;
pub mod color;
pub mod color_match;
pub mod d3d11;
pub mod dll_call;
pub mod fx;
pub mod input;
pub mod jsdnn;
pub mod jsmat;
pub mod jstimer;
pub mod logger;
pub mod mono_depth;
pub mod ocr;
pub mod predict_rotation;
pub mod route;
pub mod script;
pub mod script_builtin;
pub mod script_console;
pub mod script_mcp;
pub mod script_module;
pub mod script_vision;
pub mod setvol;
pub mod tpl;
pub mod tpl_match;
pub mod util;
pub mod win;

// CLI 入口（examples/dob-script.rs / 独立 CLI 二进制）经由库根调用脚本执行。
#[cfg(feature = "dob-script-cli")]
pub use script::run_script_file_cli;
