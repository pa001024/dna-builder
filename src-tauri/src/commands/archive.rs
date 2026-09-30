//! 压缩包处理：zip/7z 签名识别、解压与游戏资源解压命令。

use std::{
    fs::{self, File},
    io::{self, Read},
    path::Path,
};

use tauri::Emitter;
use zip::ZipArchive;

/// 判断文件名是否属于允许的扩展名列表（不区分大小写）。
/// `allowed` 为 None 时表示不过滤，全部放行。
pub(crate) fn is_allowed_ext(name: &str, allowed: Option<&[&str]>) -> bool {
    match allowed {
        None => true,
        Some(list) => {
            let lower = name.to_lowercase();
            list.iter().any(|ext| {
                lower
                    .rsplit_once('.')
                    .is_some_and(|(_, actual)| actual == *ext)
            })
        }
    }
}

pub(crate) fn is_zip_file(path: &Path) -> io::Result<bool> {
    let meta = fs::metadata(path)?;
    if meta.is_dir() {
        return Ok(false);
    }
    let mut file = File::open(path)?;
    let mut signature = [0u8; 6];
    let read = file.read(&mut signature)?;

    // 检查是否是ZIP文件 (PK)
    if read >= 2 && signature[0] == b'P' && signature[1] == b'K' {
        return Ok(true);
    }

    // 检查是否是7z文件 (7z)
    if read >= 6 && &signature[..6] == &[0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C] {
        return Ok(true);
    }

    Ok(false)
}

pub(crate) fn extract_zip_into(
    archive_path: &Path,
    target_dir: &Path,
    output: &mut Vec<(String, u64)>,
    app_handle: Option<&tauri::AppHandle>,
    allowed_extensions: Option<&[&str]>,
) -> io::Result<()> {
    let file = File::open(archive_path)?;

    // 检查文件签名以确定文件类型
    let mut signature = [0u8; 6];
    let mut file_clone = file.try_clone()?;
    let read = file_clone.read(&mut signature)?;

    // 重置文件指针
    drop(file_clone);
    let file = File::open(archive_path)?;

    // 处理ZIP文件
    if read >= 2 && signature[0] == b'P' && signature[1] == b'K' {
        let mut archive = ZipArchive::new(file)
            .map_err(|err| io::Error::new(io::ErrorKind::Other, err.to_string()))?;
        let total_files = archive.len();

        // 计算总大小
        let mut total_size = 0;
        for i in 0..total_files {
            if let Ok(entry) = archive.by_index(i) {
                if !entry.is_dir() && is_allowed_ext(entry.name(), allowed_extensions) {
                    total_size += entry.size();
                }
            }
        }

        // 发送开始解压的进度
        if let Some(app) = app_handle {
            let _ = app.emit(
                "extract_progress",
                serde_json::json!({
                    "current_file_count": 0,
                    "current_size": 0,
                    "total_files": total_files,
                    "total_size": total_size,
                    "current_file": "",
                }),
            );
        }

        // 重置归档以便重新读取
        let file = File::open(archive_path)?;
        let mut archive = ZipArchive::new(file)
            .map_err(|err| io::Error::new(io::ErrorKind::Other, err.to_string()))?;

        let mut current_file_index = 0;
        let mut current_size = 0;

        for (_i, entry_index) in (0..total_files).enumerate() {
            let mut entry = archive
                .by_index(entry_index)
                .map_err(|err| io::Error::new(io::ErrorKind::Other, err.to_string()))?;
            if entry.is_dir() {
                continue;
            }

            // 按扩展名过滤：MOD 导入只保留 pak 类归档文件，跳过 mod.json 等无关文件
            if !is_allowed_ext(entry.name(), allowed_extensions) {
                continue;
            }

            // 增加当前文件索引和大小
            current_file_index += 1;
            current_size += entry.size();

            let relative = entry.mangled_name();
            let out_path = target_dir.join(relative);
            if let Some(parent) = out_path.parent() {
                fs::create_dir_all(parent)?;
            }
            let mut extracted = File::create(&out_path)?;
            io::copy(&mut entry, &mut extracted)?;
            output.push((out_path.to_string_lossy().to_string(), entry.size()));

            // 发送进度更新
            if let Some(app) = app_handle {
                let _ = app.emit(
                    "extract_progress",
                    serde_json::json!({
                        "current_file_count": current_file_index,
                        "current_size": current_size,
                        "total_files": total_files,
                        "total_size": total_size,
                        "current_file": entry.name(),
                    }),
                );
            }
        }

        // 发送解压完成的进度
        if let Some(app) = app_handle {
            let _ = app.emit(
                "extract_progress",
                serde_json::json!({
                    "current_file_count": current_file_index,
                    "current_size": current_size,
                    "total_files": current_file_index,
                    "total_size": total_size,
                    "current_file": "",
                }),
            );
        }
    }
    // 处理7z文件
    else if read >= 6 && &signature[..6] == &[0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C] {
        // 导入 sevenz_rust2 的必要类型
        use sevenz_rust2::{ArchiveEntry, Error};
        use std::io::Read;
        use std::path::PathBuf;

        // 第一次调用：只计算文件数量和大小，不写入文件
        let mut total_files = 0;
        let mut total_size = 0;

        match sevenz_rust2::decompress_file_with_extract_fn(
            archive_path,
            target_dir,
            |entry: &ArchiveEntry, _reader: &mut dyn Read, _path: &PathBuf| {
                // 只统计文件，跳过目录；按扩展名过滤无关文件
                if !entry.is_directory() && is_allowed_ext(entry.name(), allowed_extensions) {
                    total_files += 1;
                    total_size += entry.size();
                }
                Ok(true) // 继续处理下一个条目，但不写入文件
            },
        ) {
            Err(err) => {
                return Err(io::Error::new(io::ErrorKind::Other, format!("{:?}", err)));
            }
            _ => {}
        }

        // 发送开始解压的进度（使用实际计算的文件数量和大小）
        if let Some(app) = app_handle {
            let _ = app.emit(
                "extract_progress",
                serde_json::json!({
                    "current_file_count": 0,
                    "current_size": 0,
                    "total_files": total_files,
                    "total_size": total_size,
                    "current_file": "",
                }),
            );
        }

        // 第二次调用：实际解压文件并更新进度
        let mut current_file_index = 0;
        let mut current_size = 0;
        let app_handle_clone = app_handle.clone();

        match sevenz_rust2::decompress_file_with_extract_fn(
            archive_path,
            target_dir,
            move |entry: &ArchiveEntry, reader: &mut dyn Read, path: &PathBuf| {
                // 跳过目录
                if entry.is_directory() {
                    return Ok(true);
                }

                // 按扩展名过滤：MOD 导入只保留 pak 类归档文件，跳过 mod.json 等无关文件
                if !is_allowed_ext(entry.name(), allowed_extensions) {
                    return Ok(true);
                }

                // 增加当前文件索引
                current_file_index += 1;
                // 更新当前处理的大小
                current_size += entry.size();

                // 发送解压进度
                if let Some(app) = &app_handle_clone {
                    let _ = app.emit(
                        "extract_progress",
                        serde_json::json!({
                            "current_file_count": current_file_index,
                            "current_size": current_size,
                            "total_files": total_files,
                            "total_size": total_size,
                            "current_file": entry.name(),
                        }),
                    );
                }

                // 处理目录和文件
                if entry.is_directory() {
                    // 创建目录
                    if !path.exists() {
                        if let Err(e) = std::fs::create_dir_all(path) {
                            return Err(Error::from(std::io::Error::new(
                                std::io::ErrorKind::Other,
                                e,
                            )));
                        }
                    }
                } else {
                    // 确保父目录存在
                    if let Some(parent) = path.parent() {
                        if !parent.exists() {
                            if let Err(e) = std::fs::create_dir_all(parent) {
                                return Err(Error::from(std::io::Error::new(
                                    std::io::ErrorKind::Other,
                                    e,
                                )));
                            }
                        }
                    }

                    // 创建文件并写入内容
                    use std::io::BufWriter;
                    let file = match std::fs::File::create(path) {
                        Ok(f) => f,
                        Err(e) => {
                            return Err(Error::from(std::io::Error::new(
                                std::io::ErrorKind::Other,
                                e,
                            )));
                        }
                    };

                    if entry.size() > 0 {
                        let mut writer = BufWriter::new(file);
                        if let Err(e) = std::io::copy(reader, &mut writer) {
                            return Err(Error::from(std::io::Error::new(
                                std::io::ErrorKind::Other,
                                e,
                            )));
                        }

                        // 设置文件时间戳
                        use std::fs::FileTimes;
                        #[cfg(target_os = "macos")]
                        use std::os::macos::fs::FileTimesExt;
                        #[cfg(windows)]
                        use std::os::windows::fs::FileTimesExt;

                        let file = writer.get_mut();
                        let file_times = FileTimes::new()
                            .set_accessed(entry.access_date().into())
                            .set_modified(entry.last_modified_date().into());

                        #[cfg(any(windows, target_os = "macos"))]
                        let file_times = file_times.set_created(entry.creation_date().into());

                        let _ = file.set_times(file_times);
                    }
                }

                // 添加到输出列表
                if let Ok(metadata) = std::fs::metadata(path) {
                    let path_str = path.to_string_lossy().to_string();
                    output.push((path_str, metadata.len()));
                }

                Ok(true)
            },
        ) {
            Ok(_) => {
                // 发送解压完成的进度
                if let Some(app) = app_handle {
                    let _ = app.emit(
                        "extract_progress",
                        serde_json::json!({
                            "current_file_count": current_file_index,
                            "current_size": current_size,
                            "total_files": current_file_index,
                            "total_size": total_size,
                            "current_file": "",
                        }),
                    );
                }
            }
            Err(err) => {
                return Err(io::Error::new(io::ErrorKind::Other, format!("{:?}", err)));
            }
        }
    } else {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Unsupported archive format",
        ));
    }

    Ok(())
}

pub(crate) fn copy_regular_file(
    file_path: &Path,
    target_dir: &Path,
    output: &mut Vec<(String, u64)>,
    allowed_extensions: Option<&[&str]>,
) -> io::Result<()> {
    if !file_path.is_file() {
        return Ok(());
    }
    let Some(file_name) = file_path.file_name() else {
        return Ok(());
    };
    // 按扩展名过滤：MOD 导入只保留 pak 类归档文件，跳过 mod.json 等无关文件
    if !is_allowed_ext(&file_name.to_string_lossy(), allowed_extensions) {
        return Ok(());
    }
    let dest = target_dir.join(file_name);
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::copy(file_path, &dest)?;
    let size = fs::metadata(&dest)?.len();
    output.push((dest.to_string_lossy().to_string(), size));
    Ok(())
}

/// 解压缩游戏资源文件
#[tauri::command]
pub async fn extract_game_assets(
    app_handle: tauri::AppHandle,
    zip_path: String,
    target_dir: String,
) -> Result<String, String> {
    // 获取当前工作目录
    let current_dir =
        std::env::current_dir().map_err(|e| format!("Failed to get current directory: {}", e))?;

    // 创建文件路径
    let zip_file_path = current_dir.join(&zip_path);
    let target_directory = current_dir.join(&target_dir);

    // 确保目标目录存在
    if !target_directory.exists() {
        fs::create_dir_all(&target_directory)
            .map_err(|e| format!("Failed to create target directory: {}", e))?;
    }

    // 检查是否是ZIP文件
    if !is_zip_file(&zip_file_path).map_err(|e| format!("Failed to check if file is zip: {}", e))? {
        return Err("Provided file is not a ZIP archive".to_string());
    }

    // 解压缩文件
    let mut extracted_files = Vec::new();
    if let Err(err) = extract_zip_into(
        &zip_file_path,
        &target_directory,
        &mut extracted_files,
        Some(&app_handle),
        None,
    ) {
        return Err(format!("Failed to extract zip file: {}", err));
    }

    Ok(format!(
        "Successfully extracted {} files to {}",
        extracted_files.len(),
        target_directory.to_string_lossy()
    ))
}
