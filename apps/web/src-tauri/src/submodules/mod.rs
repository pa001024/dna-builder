//! Tauri 应用侧子模块：脚本运行时已提取到 `dob-script-runtime` crate，
//! 此处对运行时模块做重导出，保持 `crate::submodules::win` 等既有路径可用。
//! 新代码应直接依赖 `dob_script_runtime`，不要再向本目录添加运行时逻辑。
#![allow(unused_imports)]
//! 兼容垫片：部分重导出暂无应用侧引用，保留供渐进迁移。

// —— 重导出：脚本运行时（真实实现位于 crates/dob-script-runtime） ——
pub use dob_script_runtime::async_tokio;
pub use dob_script_runtime::capture;
pub use dob_script_runtime::color;
pub use dob_script_runtime::color_match;
pub use dob_script_runtime::d3d11;
pub use dob_script_runtime::dll_call;
pub use dob_script_runtime::fx;
pub use dob_script_runtime::input;
pub use dob_script_runtime::jsdnn;
pub use dob_script_runtime::jsmat;
pub use dob_script_runtime::jstimer;
pub use dob_script_runtime::logger;
pub use dob_script_runtime::mono_depth;
pub use dob_script_runtime::ocr;
pub use dob_script_runtime::predict_rotation;
pub use dob_script_runtime::route;
pub use dob_script_runtime::script;
pub use dob_script_runtime::script_builtin;
pub use dob_script_runtime::script_console;
pub use dob_script_runtime::script_mcp;
pub use dob_script_runtime::script_module;
pub use dob_script_runtime::script_vision;
pub use dob_script_runtime::setvol;
pub use dob_script_runtime::tpl;
pub use dob_script_runtime::tpl_match;
// `submodules::util` 历史上指向截图/捕获工具（capture），
// 保留别名，兼容既有 `submodules::util::capture_window` 引用。
pub use dob_script_runtime::capture as util;
pub use dob_script_runtime::win;

// —— 应用侧独有模块（窗口/托盘/同步/打包工具，与脚本运行时无关） ——
pub mod afk_bridge;
pub mod afk_protocol;
pub mod float_window;
pub mod hotkey;
pub mod lan_sync;
pub mod repak_tools;
pub mod taskbar;
