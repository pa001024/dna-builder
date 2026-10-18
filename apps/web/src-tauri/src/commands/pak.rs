//! UE .pak 包命令：枚举/列出/导出 pak 内容、目录打包与 Lua 字节码反编译，
//! 进度统一通过事件推送前端（百分比去重，避免小文件场景 IPC 拥塞）。

use std::path::Path;
use std::sync::Mutex;

use tauri::Emitter;

use crate::submodules::repak_tools;

/// 递归枚举目录中的所有 `.pak` 文件。
#[tauri::command]
pub async fn enumerate_pak_files(
    root_path: String,
    aes_key: Option<String>,
) -> Result<Vec<String>, String> {
    repak_tools::enumerate_pak_files(Path::new(&root_path), aes_key.as_deref())
}

/// 列出多个 pak 文件内的文件列表。
#[tauri::command]
pub async fn list_pak_files(
    pak_paths: Vec<String>,
    aes_key: Option<String>,
) -> Result<Vec<repak_tools::PakFileListResult>, String> {
    repak_tools::list_pak_files(&pak_paths, aes_key.as_deref())
}

/// 导出指定 pak 内的文件，并将 Lua 字节码反编译后直接落盘为 `.lua`。
#[tauri::command]
pub async fn export_pak_files(
    app: tauri::AppHandle,
    pak_files: std::collections::BTreeMap<String, Vec<String>>,
    aes_key: Option<String>,
    target_path: String,
) -> Result<Vec<repak_tools::PakExportResult>, String> {
    let total: usize = pak_files.values().map(Vec::len).sum();
    let target_path_for_progress = target_path.clone();
    let mut last_percent = 0;
    let _ = app.emit(
        "pak_export_progress",
        serde_json::json!({
            "current": 0,
            "total": total,
            "targetPath": target_path_for_progress,
        }),
    );
    repak_tools::export_pak_files(
        &pak_files,
        aes_key.as_deref(),
        Path::new(&target_path),
        |current| {
            let percent = if total > 0 {
                current.saturating_mul(100).saturating_add(total / 2) / total
            } else {
                0
            };
            // 百分比未变化时不重复发送事件，避免大量小文件造成 IPC 拥塞。
            if percent == last_percent && current < total {
                return;
            }
            last_percent = percent;
            let _ = app.emit(
                "pak_export_progress",
                serde_json::json!({
                    "current": current,
                    "total": total,
                    "targetPath": target_path_for_progress,
                }),
            );
        },
    )
}

/// 将目录打包为 pak 文件（递归打包所有子目录文件）。
#[tauri::command]
pub async fn pack_pak_folder(
    app: tauri::AppHandle,
    source_dir: String,
    aes_key: Option<String>,
    output_path: String,
) -> Result<repak_tools::PakPackResult, String> {
    let total = repak_tools::count_packable_files(Path::new(&source_dir))?;
    let output_for_progress = output_path.clone();
    let _ = app.emit(
        "pak_pack_progress",
        serde_json::json!({
            "current": 0,
            "total": total,
            "outputPath": output_for_progress,
        }),
    );
    let mut last_percent = 0;
    repak_tools::pack_directory(
        Path::new(&source_dir),
        aes_key.as_deref(),
        Path::new(&output_path),
        |current| {
            let percent = if total > 0 {
                current.saturating_mul(100) / total
            } else {
                0
            };
            // 百分比未变化时不重复发送事件，避免大量小文件导致 IPC 拥堵
            if percent == last_percent && current < total {
                return;
            }
            last_percent = percent;
            let _ = app.emit(
                "pak_pack_progress",
                serde_json::json!({
                    "current": current,
                    "total": total,
                    "outputPath": output_for_progress,
                }),
            );
        },
    )
}

/// 使用 unluac 反编译 Lua 字节码文件。
#[tauri::command]
pub async fn decompile_lua_bytecode_files(
    app: tauri::AppHandle,
    input_files: Vec<String>,
    source_root: String,
    unluac_path: String,
    output_dir: String,
) -> Result<repak_tools::LuaDecompileBatchResult, String> {
    let total = input_files.len();
    let output_dir_for_progress = output_dir.clone();
    let _ = app.emit(
        "lua_decompile_progress",
        serde_json::json!({
            "current": 0,
            "total": total,
            "outputDir": output_dir_for_progress,
        }),
    );
    let last_percent = Mutex::new(0);
    repak_tools::decompile_lua_bytecode_files(
        &input_files,
        Path::new(&source_root),
        Path::new(&unluac_path),
        Path::new(&output_dir),
        move |current| {
            let percent = if total > 0 {
                current.saturating_mul(100) / total
            } else {
                0
            };
            let mut guard = last_percent
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            // 百分比未变化时不重复发送事件，避免大量小文件造成 IPC 拥塞。
            if *guard == percent && current < total {
                return;
            }
            *guard = percent;
            let _ = app.emit(
                "lua_decompile_progress",
                serde_json::json!({
                    "current": current,
                    "total": total,
                    "outputDir": output_dir_for_progress,
                }),
            );
        },
    )
}
