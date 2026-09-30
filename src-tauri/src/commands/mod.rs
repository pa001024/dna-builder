//! Tauri 命令层：按领域拆分的 `#[tauri::command]` 实现，lib.rs 只保留组装与注册。

pub mod archive;
pub mod cloudgame;
pub mod download;
pub mod fs;
pub mod game;
pub mod mod_import;
pub mod net;
pub mod pak;
pub mod script_cmds;
pub mod system;
pub mod websocket;
pub mod window;
