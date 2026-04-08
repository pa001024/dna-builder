use std::{
    collections::BTreeMap,
    fs::{self, File},
    io::BufReader,
    path::{Component, Path, PathBuf},
    process::Command,
    sync::{
        Arc, Mutex,
        atomic::{AtomicUsize, Ordering},
    },
    thread,
};

use aes::Aes256;
use aes::cipher::KeyInit;
use base64::{Engine as _, engine::general_purpose};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PakFileListResult {
    pub pak_path: String,
    pub files: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PakExportResult {
    pub pak_path: String,
    pub exported_files: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LuaDecompileResult {
    pub input_file: String,
    pub output_file: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LuaDecompileBatchResult {
    pub succeeded_files: Vec<LuaDecompileResult>,
    pub failed_files: Vec<String>,
}

/// 递归枚举目录下的所有 `.pak` 文件，并过滤掉无法被 `repak` 打开的无效包。
pub fn enumerate_pak_files(root_path: &Path, aes_key: Option<&str>) -> Result<Vec<String>, String> {
    if !root_path.exists() {
        return Err(format!("路径不存在: {}", root_path.display()));
    }
    if !root_path.is_dir() {
        return Err(format!("不是目录: {}", root_path.display()));
    }

    let key = parse_aes_key(aes_key)?;
    let mut pak_files = Vec::new();
    collect_pak_files(root_path, key.as_ref(), &mut pak_files)?;
    pak_files.sort();
    Ok(pak_files)
}

/// 列出多个 pak 文件内的文件列表。
pub fn list_pak_files(
    pak_paths: &[String],
    aes_key: Option<&str>,
) -> Result<Vec<PakFileListResult>, String> {
    let key = parse_aes_key(aes_key)?;
    let mut results = Vec::with_capacity(pak_paths.len());

    for pak_path in pak_paths {
        let pak = open_pak(Path::new(pak_path), key.as_ref())?;
        let mount_point = PathBuf::from(pak.mount_point());
        results.push(PakFileListResult {
            pak_path: pak_path.clone(),
            files: pak
                .files()
                .into_iter()
                .map(|file_name| normalize_display_path(&mount_point.join(file_name)))
                .collect(),
        });
    }

    Ok(results)
}

/// 导出指定 pak 的指定文件，并按原始字节落盘。
pub fn export_pak_files(
    pak_files: &BTreeMap<String, Vec<String>>,
    aes_key: Option<&str>,
    target_path: &Path,
) -> Result<Vec<PakExportResult>, String> {
    let key = parse_aes_key(aes_key)?;
    let mut results = Vec::with_capacity(pak_files.len());

    if !target_path.exists() {
        fs::create_dir_all(target_path)
            .map_err(|error| format!("创建目标目录失败: {}: {}", target_path.display(), error))?;
    }

    for (pak_path, files) in pak_files {
        let pak_path_ref = Path::new(pak_path);
        let pak = open_pak(pak_path_ref, key.as_ref())?;
        let mount_point = normalize_path(Path::new(pak.mount_point()));
        let mut exported_files = Vec::with_capacity(files.len());
        let mut reader = BufReader::new(File::open(pak_path_ref).map_err(|error| {
            format!("打开 pak 文件失败: {}: {}", pak_path_ref.display(), error)
        })?);
        for file_name in files {
            let relative_file_name = strip_mount_point(file_name, &mount_point)?;
            let data = pak.get(&relative_file_name, &mut reader).map_err(|error| {
                format!(
                    "读取 pak 内文件失败: {} -> {}: {}",
                    pak_path_ref.display(),
                    file_name,
                    error
                )
            })?;

            let out_path = target_path.join(safe_relative_path(&normalize_display_path(
                Path::new(file_name),
            )));
            if let Some(parent) = out_path.parent() {
                fs::create_dir_all(parent).map_err(|error| {
                    format!("创建输出目录失败: {}: {}", parent.display(), error)
                })?;
            }

            fs::write(&out_path, &data)
                .map_err(|error| format!("写入输出文件失败: {}: {}", out_path.display(), error))?;

            exported_files.push(out_path.to_string_lossy().to_string());
        }

        results.push(PakExportResult {
            pak_path: pak_path.clone(),
            exported_files,
        });
    }

    Ok(results)
}

/// 使用 unluac 将 Lua 字节码反编译到指定目录。
pub fn decompile_lua_bytecode_files(
    input_files: &[String],
    source_root: &Path,
    unluac_path: &Path,
    output_dir: &Path,
) -> Result<LuaDecompileBatchResult, String> {
    if !unluac_path.exists() {
        return Err(format!("unluac 文件不存在: {}", unluac_path.display()));
    }

    if !output_dir.exists() {
        fs::create_dir_all(output_dir).map_err(|error| {
            format!(
                "创建反编译输出目录失败: {}: {}",
                output_dir.display(),
                error
            )
        })?;
    }

    let worker_count =
        thread::available_parallelism().map_or(1, |count| count.get().saturating_sub(1).max(1));
    let next_index = Arc::new(AtomicUsize::new(0));
    let results = Arc::new(Mutex::new(vec![None; input_files.len()]));
    let failed_files = Arc::new(Mutex::new(Vec::<String>::new()));

    thread::scope(|scope| {
        for _ in 0..worker_count {
            let next_index = Arc::clone(&next_index);
            let results = Arc::clone(&results);
            let failed_files = Arc::clone(&failed_files);

            scope.spawn(move || {
                loop {
                    let index = next_index.fetch_add(1, Ordering::Relaxed);
                    if index >= input_files.len() {
                        break;
                    }

                    let input_file = &input_files[index];
                    let input_path = Path::new(input_file);
                    let relative_path = input_path
                        .strip_prefix(source_root)
                        .map(Path::to_path_buf)
                        .unwrap_or_else(|_| {
                            safe_relative_path(&normalize_display_path(input_path))
                        });
                    let output_path = output_dir.join(relative_path).with_extension("lua");

                    if let Some(parent) = output_path.parent() {
                        if let Err(error) = fs::create_dir_all(parent) {
                            if let Ok(mut guard) = failed_files.lock() {
                                guard.push(format!(
                                    "创建反编译输出子目录失败: {}: {}",
                                    parent.display(),
                                    error
                                ));
                            }
                            continue;
                        }
                    }

                    let status = match Command::new("java")
                        .arg("-jar")
                        .arg(unluac_path)
                        .arg("--rawstring")
                        .arg("--output")
                        .arg(&output_path)
                        .arg(input_path)
                        .status()
                    {
                        Ok(status) => status,
                        Err(error) => {
                            if let Ok(mut guard) = failed_files.lock() {
                                guard.push(format!("启动 unluac 失败: {}", error));
                            }
                            continue;
                        }
                    };

                    if !status.success() {
                        if let Ok(mut guard) = failed_files.lock() {
                            guard.push(format!(
                                "unluac 执行失败: {} -> {}",
                                input_path.display(),
                                output_path.display()
                            ));
                        }
                        continue;
                    }

                    if let Ok(mut guard) = results.lock() {
                        guard[index] = Some(LuaDecompileResult {
                            input_file: input_path.to_string_lossy().to_string(),
                            output_file: output_path.to_string_lossy().to_string(),
                        });
                    } else {
                        continue;
                    }
                }
            });
        }
    });

    let results = Arc::try_unwrap(results)
        .map_err(|_| "反编译结果尚未完成收集".to_string())?
        .into_inner()
        .map_err(|error| format!("读取反编译结果失败: {}", error))?;
    let failed_files = Arc::try_unwrap(failed_files)
        .map_err(|_| "反编译失败列表尚未完成收集".to_string())?
        .into_inner()
        .map_err(|error| format!("读取反编译失败列表失败: {}", error))?;

    let succeeded_files = results
        .into_iter()
        .enumerate()
        .map(|(index, item)| item.ok_or_else(|| format!("反编译结果缺失: {}", input_files[index])))
        .collect::<Result<Vec<_>, _>>()?;

    Ok(LuaDecompileBatchResult {
        succeeded_files,
        failed_files,
    })
}

fn collect_pak_files(
    dir: &Path,
    key: Option<&Aes256>,
    output: &mut Vec<String>,
) -> Result<(), String> {
    let entries =
        fs::read_dir(dir).map_err(|error| format!("读取目录失败: {}: {}", dir.display(), error))?;

    for entry in entries {
        let entry =
            entry.map_err(|error| format!("读取目录项失败: {}: {}", dir.display(), error))?;
        let path = entry.path();
        if path.is_dir() {
            collect_pak_files(&path, key, output)?;
            continue;
        }

        if path
            .extension()
            .and_then(|ext| ext.to_str())
            .is_some_and(|ext| ext.eq_ignore_ascii_case("pak"))
        {
            if open_pak(&path, key).is_ok() {
                output.push(path.to_string_lossy().to_string());
            }
        }
    }

    Ok(())
}

fn open_pak(path: &Path, key: Option<&Aes256>) -> Result<repak::PakReader, String> {
    if !path.exists() {
        return Err(format!("pak 文件不存在: {}", path.display()));
    }

    let mut builder = repak::PakBuilder::new();
    if let Some(key) = key {
        builder = builder.key(key.clone());
    }

    let mut reader = BufReader::new(
        File::open(path)
            .map_err(|error| format!("打开 pak 文件失败: {}: {}", path.display(), error))?,
    );
    builder
        .reader(&mut reader)
        .map_err(|error| format!("读取 pak 文件失败: {}: {}", path.display(), error))
}

fn parse_aes_key(aes_key: Option<&str>) -> Result<Option<Aes256>, String> {
    let Some(aes_key) = aes_key.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };

    decode_aes_key(aes_key)
        .map(Some)
        .map_err(|error| format!("AES key 无效: {}", error))
}

fn decode_aes_key(value: &str) -> Result<Aes256, String> {
    let try_key =
        |bytes: Vec<u8>| Aes256::new_from_slice(&bytes).map_err(|error| error.to_string());

    if let Some(hex_bytes) = decode_hex(value.strip_prefix("0x").unwrap_or(value)) {
        if let Ok(key) = try_key(hex_bytes) {
            return Ok(key);
        }
    }

    let base64_bytes = general_purpose::STANDARD_NO_PAD
        .decode(value.trim_end_matches('='))
        .or_else(|_| general_purpose::STANDARD.decode(value))
        .map_err(|error| error.to_string())?;
    try_key(base64_bytes)
}

fn decode_hex(value: &str) -> Option<Vec<u8>> {
    if value.len() % 2 != 0 {
        return None;
    }

    let mut bytes = Vec::with_capacity(value.len() / 2);
    let mut chars = value.chars();
    while let (Some(high), Some(low)) = (chars.next(), chars.next()) {
        let high = high.to_digit(16)?;
        let low = low.to_digit(16)?;
        bytes.push(((high << 4) | low) as u8);
    }

    Some(bytes)
}

fn safe_relative_path(path: &str) -> PathBuf {
    let mut output = PathBuf::new();
    for component in Path::new(path).components() {
        if let Component::Normal(part) = component {
            output.push(part);
        }
    }
    output
}

fn strip_mount_point(path: &str, mount_point: &Path) -> Result<String, String> {
    let normalized_path = normalize_display_path(Path::new(path));
    let normalized_mount = normalize_display_path(mount_point);

    if normalized_mount.is_empty() {
        return Ok(normalized_path);
    }

    let mount_prefix = if normalized_mount.ends_with('/') {
        normalized_mount.clone()
    } else {
        format!("{normalized_mount}/")
    };

    match normalized_path.strip_prefix(&mount_prefix) {
        Some(relative) => Ok(relative.to_string()),
        None => Err(format!(
            "文件路径不属于当前 pak 挂载目录: {} (mount point: {})",
            normalized_path, normalized_mount
        )),
    }
}

fn normalize_path(path: &Path) -> PathBuf {
    let normalized = normalize_display_path(path);
    PathBuf::from(normalized)
}

fn normalize_display_path(path: &Path) -> String {
    let mut prefix = String::new();
    let mut parts: Vec<String> = Vec::new();

    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                parts.pop();
            }
            Component::Normal(part) => parts.push(part.to_string_lossy().to_string()),
            Component::RootDir => {
                if prefix.is_empty() {
                    prefix.push('/');
                } else if !prefix.ends_with('/') {
                    prefix.push('/');
                }
            }
            Component::Prefix(part) => {
                prefix = part.as_os_str().to_string_lossy().to_string();
            }
        }
    }

    if parts.is_empty() {
        return prefix.replace('\\', "/");
    }

    if !prefix.is_empty() && !prefix.ends_with('/') {
        prefix.push('/');
    }
    prefix.push_str(&parts.join("/"));
    prefix.replace('\\', "/")
}
