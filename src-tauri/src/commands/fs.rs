//! 文件与目录操作命令：读写、移动/重命名、删除（回收站）、哈希、枚举与变更监听。

use std::{
    fs::{self, File},
    io::{self, Read, Write},
    path::Path,
    sync::{Arc, Mutex},
    time::Duration,
};

use hotwatch::{Event, EventKind, Hotwatch};
use lazy_static::lazy_static;
use md5::Context;

use tauri::Emitter;

lazy_static! {
    /// 全局文件监听器（脚本编辑联动），懒创建。
    static ref HOTWATCH: Arc<Mutex<Option<Hotwatch>>> = Arc::new(Mutex::new(None));
}

/// 导出二进制文件到指定路径
#[tauri::command]
pub async fn export_binary_file(file_path: String, binary_content: Vec<u8>) -> Result<String, String> {
    // 创建文件路径
    let path = Path::new(&file_path);

    // 确保父目录存在
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create parent directory: {}", e))?;
        }
    }

    // 写入二进制内容到文件
    let mut file = File::create(path).map_err(|e| format!("Failed to create file: {}", e))?;
    file.write_all(&binary_content)
        .map_err(|e| format!("Failed to write binary content: {}", e))?;

    Ok(format!(
        "Successfully exported binary file to {}",
        file_path
    ))
}

/// 读取文本文件内容
#[tauri::command]
pub async fn read_text_file(file_path: String) -> Result<String, String> {
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err(format!("文件不存在: {}", file_path));
    }

    let content = fs::read_to_string(path).map_err(|e| format!("读取文件失败: {}", e))?;
    Ok(content)
}

/// 写入文本文件内容
#[tauri::command]
pub async fn write_text_file(file_path: String, content: String) -> Result<String, String> {
    let path = Path::new(&file_path);

    // 确保父目录存在
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create parent directory: {}", e))?;
        }
    }

    fs::write(path, content).map_err(|e| format!("写入文件失败: {}", e))?;
    Ok(format!("文件已保存: {}", file_path))
}

/// 移动/重命名文件（跨盘时回退为复制后删除源文件）。
#[tauri::command]
pub async fn move_file(source_path: String, target_path: String) -> Result<(), String> {
    let source = Path::new(&source_path);
    let target = Path::new(&target_path);
    if !source.exists() {
        return Err(format!("源文件不存在: {}", source.display()));
    }
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|error| format!("创建目标目录失败: {}", error))?;
    }
    // 同盘直接改名；跨盘 rename 失败时回退为复制 + 删除
    match fs::rename(source, target) {
        Ok(()) => Ok(()),
        Err(_) => {
            fs::copy(source, target).map_err(|error| format!("复制文件失败: {}", error))?;
            fs::remove_file(source).map_err(|error| format!("清理临时文件失败: {}", error))?;
            Ok(())
        }
    }
}

/// 获取文件大小
#[tauri::command]
pub async fn get_file_size(file_path: String) -> Result<u64, String> {
    let path = Path::new(&file_path);
    if !path.exists() {
        return Ok(0);
    }

    let metadata = fs::metadata(path).map_err(|e| format!("Failed to get file metadata: {}", e))?;
    if !metadata.is_file() {
        return Ok(0);
    }

    Ok(metadata.len())
}

/// 获取文件的 MD5 哈希值
#[tauri::command]
pub async fn get_file_hash(file_path: String) -> Result<String, String> {
    let path = Path::new(&file_path);
    if !path.exists() {
        return Ok(String::new());
    }

    let file = File::open(path).map_err(|e| format!("Failed to open file: {}", e))?;
    let mut reader = io::BufReader::new(file);
    let mut context = Context::new();
    let mut buffer = [0u8; 8192];

    loop {
        let read_size = reader
            .read(&mut buffer)
            .map_err(|e| format!("Failed to read file: {}", e))?;
        if read_size == 0 {
            break;
        }
        context.consume(&buffer[..read_size]);
    }

    Ok(format!("{:x}", context.finalize()))
}

/// 清理临时目录
#[tauri::command]
pub async fn cleanup_temp_dir(temp_dir: String) -> Result<String, String> {
    let path = Path::new(&temp_dir);
    if !path.exists() {
        return Ok(format!("临时目录不存在: {}", temp_dir));
    }

    // 遍历目录，只删除文件，保留目录结构
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries {
            if let Ok(entry) = entry {
                let entry_path = entry.path();
                if entry_path.is_file() {
                    if let Err(e) = fs::remove_file(&entry_path) {
                        eprintln!("Failed to remove file {}: {}", entry_path.display(), e);
                    }
                }
            }
        }
    }

    Ok(format!("临时目录清理完成: {}", temp_dir))
}

/// 列出指定目录下的所有文件
#[tauri::command]
pub async fn list_files(dir_path: String) -> Result<Vec<String>, String> {
    let path = Path::new(&dir_path);
    if !path.exists() {
        return Ok(vec![]);
    }

    let mut files = vec![];
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let entry_path = entry.path();
            if entry_path.is_file() {
                if let Some(file_name) = entry_path.file_name() {
                    if let Some(name_str) = file_name.to_str() {
                        files.push(name_str.to_string());
                    }
                }
            }
        }
    }

    Ok(files)
}

/// 列出指定目录下的所有子目录
#[tauri::command]
pub async fn list_directories(dir_path: String) -> Result<Vec<String>, String> {
    let path = Path::new(&dir_path);
    if !path.exists() {
        return Ok(vec![]);
    }

    let mut directories = vec![];
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let entry_path = entry.path();
            if entry_path.is_dir() {
                if let Some(file_name) = entry_path.file_name() {
                    if let Some(name_str) = file_name.to_str() {
                        directories.push(name_str.to_string());
                    }
                }
            }
        }
    }

    Ok(directories)
}
/// 列出指定目录下的所有 JS 文件
#[tauri::command]
pub async fn list_script_files(dir_path: String) -> Result<Vec<String>, String> {
    let path = Path::new(&dir_path);
    if !path.exists() {
        return Ok(vec![]);
    }

    let mut files = vec![];
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let entry_path = entry.path();
            if entry_path.is_file() {
                if let Some(ext) = entry_path.extension() {
                    if ext == "js" {
                        if let Some(file_name) = entry_path.file_name() {
                            if let Some(name_str) = file_name.to_str() {
                                files.push(name_str.to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(files)
}

/// 重命名文件（支持自动创建目标目录的父目录结构）
#[tauri::command]
pub async fn rename_file(old_path: String, new_path: String) -> Result<String, String> {
    let old = Path::new(&old_path);
    let new = Path::new(&new_path);

    if !old.exists() {
        return Err(format!("源文件不存在: {}", old_path));
    }

    if new.exists() {
        return Err(format!("目标文件已存在: {}", new_path));
    }

    // 自动创建目标目录的父目录结构
    if let Some(parent) = new.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| format!("创建目标目录失败: {}", e))?;
        }
    }

    fs::rename(old, new).map_err(|e| format!("重命名文件失败: {}", e))?;
    Ok(format!("文件已重命名: {} -> {}", old_path, new_path))
}

/// 删除文件。
#[tauri::command]
pub async fn delete_file(file_path: String, force: Option<bool>) -> Result<String, String> {
    let path = Path::new(&file_path);

    if force.unwrap_or(false) {
        if !path.exists() {
            return Ok(format!("文件不存在: {}", file_path));
        }
        fs::remove_file(path).map_err(|e| format!("删除文件失败: {}", e))?;
        return Ok(format!("文件已删除: {}", file_path));
    }

    if !path.exists() {
        return Err(format!("文件不存在: {}", file_path));
    }

    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::Shell::*;
        use windows::core::{BOOL, PCWSTR};

        // 将路径转换为 Windows 需要的格式（双 null 终止的宽字符串）
        let mut from = file_path.encode_utf16().collect::<Vec<u16>>();
        from.push(0); // 添加 null 终止符
        from.push(0); // 双 null 终止符

        let mut op = SHFILEOPSTRUCTW {
            hwnd: HWND::default(),
            wFunc: FO_DELETE,
            pFrom: PCWSTR::from_raw(from.as_ptr()),
            pTo: PCWSTR::null(),
            fFlags: (FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_SILENT).0 as u16,
            fAnyOperationsAborted: BOOL::from(false),
            hNameMappings: std::ptr::null_mut(),
            lpszProgressTitle: PCWSTR::null(),
        };

        unsafe {
            let result = SHFileOperationW(&mut op);
            if result != 0 {
                return Err(format!("删除文件失败: 错误代码 {}", result));
            }
        }

        Ok(format!("文件已移动到回收站: {}", file_path))
    }

    #[cfg(not(target_os = "windows"))]
    {
        fs::remove_file(path).map_err(|e| format!("删除文件失败: {}", e))?;
        Ok(format!("文件已删除: {}", file_path))
    }
}

/// 递归删除指定目录。
#[tauri::command]
pub async fn remove_dir_all(path: String) -> Result<String, String> {
    let target = Path::new(&path);
    if !target.exists() {
        return Ok(format!("目录不存在: {}", path));
    }

    fs::remove_dir_all(target).map_err(|e| format!("删除目录失败: {}", e))?;
    Ok(format!("目录已删除: {}", path))
}

#[tauri::command]
pub fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

/// 监听文件变化
#[tauri::command]
pub fn watch_file(file_path: String, app_handle: tauri::AppHandle) -> Result<String, String> {
    let mut hotwatch_guard = HOTWATCH
        .lock()
        .map_err(|e| format!("获取 hotwatch 锁失败: {:?}", e))?;

    // 如果 hotwatch 不存在，则创建
    if hotwatch_guard.is_none() {
        *hotwatch_guard = Some(
            Hotwatch::new_with_custom_delay(Duration::from_millis(500))
                .map_err(|e| format!("创建 hotwatch 失败: {:?}", e))?,
        );
    }

    let hotwatch = hotwatch_guard.as_mut().unwrap();

    // 克隆文件路径用于闭包
    let file_path_clone = file_path.clone();
    // 监听文件
    hotwatch
        .watch(&file_path, move |event: Event| {
            // 检查事件类型
            if let EventKind::Modify(_) = event.kind {
                // 文件被修改，发送事件到前端
                let _ = app_handle.emit("file-changed", &file_path_clone);
            }
        })
        .map_err(|e| format!("监听文件失败: {:?}", e))?;

    Ok(format!("开始监听文件: {}", file_path))
}

/// 取消监听文件
#[tauri::command]
pub fn unwatch_file(file_path: String) -> Result<String, String> {
    let mut hotwatch_guard = HOTWATCH
        .lock()
        .map_err(|e| format!("获取 hotwatch 锁失败: {:?}", e))?;

    if let Some(hotwatch) = hotwatch_guard.as_mut() {
        let _ = hotwatch.unwatch(&file_path);
        Ok(format!("取消监听文件: {}", file_path))
    } else {
        Err("Hotwatch 未初始化".to_string())
    }
}
