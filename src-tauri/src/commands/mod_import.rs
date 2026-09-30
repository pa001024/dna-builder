//! MOD 导入与启停：拖放/路径导入、pak 禁用态改名（.pak ↔ .kap）与图片导入。

use std::{
    fs::{self, File},
    io::Read,
    path::PathBuf,
};

use serde::Deserialize;

use super::archive::{copy_regular_file, extract_zip_into, is_zip_file};

/// 通过 HTML5 拖放传入的 MOD 文件内容。
#[derive(Debug, Clone, Deserialize)]
pub struct ModImportFile {
    name: String,
    data: Vec<u8>,
}

/// MOD 导入时允许保留的归档类扩展名（不区分大小写）。
/// 其余文件（mod.json 清单、说明文档、预览图等）一律跳过，避免污染游戏 MOD 目录。
const MOD_ARCHIVE_EXTENSIONS: &[&str] = &["pak", "paks", "utoc", "ucas"];

/// 将 MOD 文件名转换为「禁用态」扩展名（.pak→.kap、.paks→.kaps）。
/// UE 引擎只会挂载 .pak/.utoc 等后缀的文件，改成 .kap 后放在 Paks 目录内也不会被游戏加载。
/// 非 pak 类文件名原样返回。
fn to_disabled_file_name(name: &str) -> String {
    let lower = name.to_lowercase();
    if lower.ends_with(".pak") {
        format!("{}.kap", &name[..name.len() - 4])
    } else if lower.ends_with(".paks") {
        format!("{}.kaps", &name[..name.len() - 5])
    } else {
        name.to_string()
    }
}

/// 将「禁用态」文件名还原为「启用态」（.kap→.pak、.kaps→.paks），其余原样返回。
fn to_enabled_file_name(name: &str) -> String {
    let lower = name.to_lowercase();
    if lower.ends_with(".kap") {
        format!("{}.pak", &name[..name.len() - 4])
    } else if lower.ends_with(".kaps") {
        format!("{}.paks", &name[..name.len() - 5])
    } else {
        name.to_string()
    }
}

#[tauri::command]
pub fn import_mod(gamebase: String, paths: Vec<String>) -> String {
    let base_path = PathBuf::from(gamebase);
    if let Err(err) = fs::create_dir_all(&base_path) {
        eprintln!("Failed to prepare gamebase dir: {err}");
        return "[]".to_string();
    }

    let mut output: Vec<(String, u64)> = Vec::new();
    for raw in paths {
        let src = PathBuf::from(&raw);
        if !src.exists() {
            eprintln!("Path not found: {raw}");
            continue;
        }
        match is_zip_file(&src) {
            Ok(true) => {
                if let Err(err) = extract_zip_into(
                    &src,
                    &base_path,
                    &mut output,
                    None,
                    Some(MOD_ARCHIVE_EXTENSIONS),
                ) {
                    eprintln!("Failed to extract {:?}: {err}", src);
                }
            }
            Ok(false) => {
                if let Err(err) =
                    copy_regular_file(&src, &base_path, &mut output, Some(MOD_ARCHIVE_EXTENSIONS))
                {
                    eprintln!("Failed to copy {:?}: {err}", src);
                }
            }
            Err(err) => eprintln!("Failed to inspect {:?}: {err}", src),
        }
    }

    // 导入的 MOD 默认为禁用态：把 pak 类文件就地改为游戏不加载的 .kap 后缀，
    // 返回给前端的路径同步使用改后的实际文件名（启用时再还原为 .pak）。
    for entry in output.iter_mut() {
        let path = PathBuf::from(&entry.0);
        let Some(file_name) = path
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
        else {
            continue;
        };
        let disabled_name = to_disabled_file_name(&file_name);
        if disabled_name == file_name {
            continue;
        }
        let dest = path.with_file_name(&disabled_name);
        if let Err(err) = fs::rename(&path, &dest) {
            eprintln!("Failed to disable imported mod file {:?}: {err}", path);
            continue;
        }
        entry.0 = dest.to_string_lossy().to_string();
    }

    serde_json::to_string(&output).unwrap_or_else(|_| "[]".to_string())
}

/// 将 HTML5 拖放的文件内容临时写入磁盘，再复用现有 MOD 导入流程。
#[tauri::command]
pub fn import_mod_files(gamebase: String, files: Vec<ModImportFile>) -> Result<String, String> {
    if files.is_empty() {
        return Ok("[]".to_string());
    }

    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|error| format!("获取临时目录时间失败: {error}"))?
        .as_nanos();
    let temp_dir = std::env::temp_dir().join(format!(
        "dna-builder-mod-import-{}-{stamp}",
        std::process::id()
    ));
    fs::create_dir_all(&temp_dir).map_err(|error| format!("创建 MOD 临时目录失败: {error}"))?;

    let result = (|| {
        let mut paths = Vec::with_capacity(files.len());
        for (index, file) in files.iter().enumerate() {
            let source_name = file.name.rsplit(['\\', '/']).next().unwrap_or("drop-file");
            let safe_name: String = source_name
                .chars()
                .map(|character| {
                    if matches!(
                        character,
                        '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*'
                    ) {
                        '_'
                    } else {
                        character
                    }
                })
                .collect();
            let file_name = if safe_name.is_empty() {
                format!("drop-file-{index}")
            } else {
                safe_name
            };
            // 每个文件放进独立子目录，既避免同名冲突，又不会像「0000-名字」前缀那样
            // 污染最终导入的文件名（导入流程按 basename 复制进 MOD 目录）。
            let path = temp_dir.join(format!("{index}")).join(&file_name);
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent)
                    .map_err(|error| format!("创建 MOD 临时目录失败: {error}"))?;
            }
            fs::write(&path, &file.data)
                .map_err(|error| format!("写入 MOD 临时文件失败: {error}"))?;
            paths.push(path.to_string_lossy().to_string());
        }
        Ok(import_mod(gamebase, paths))
    })();

    if let Err(error) = fs::remove_dir_all(&temp_dir) {
        eprintln!("删除 MOD 临时目录失败: {error}");
    }
    result
}

/// 在游戏 MOD 目录内就地启用或禁用 MOD 文件。
/// 禁用（mode = "disable"）：把 .pak 改名为 .kap —— UE 只挂载 .pak 后缀，
/// 改名后即使文件仍留在 Paks 目录内也不会被游戏加载；
/// 启用（mode = "enable"）：把 .kap 还原为 .pak。
/// 每个文件名都会尝试两种扩展名形态，因此对已经是目标形态的文件重复调用是幂等的，
/// 记录与实际文件形态不一致时（外挂导入改名、重新导入回落到禁用态等）也能修正回来。
/// 部分文件缺失会被跳过并记录日志，避免历史脏数据导致整个操作失败；
/// 但一条记录的文件全都找不到时说明记录已与磁盘脱节，此时返回错误给前端提示，而不是「假启用」。
#[tauri::command]
pub fn enable_mod(basedir: String, files: Vec<String>, mode: String) -> String {
    let base_path = PathBuf::from(&basedir);
    if let Err(err) = fs::create_dir_all(&base_path) {
        eprintln!("Failed to prepare moddir: {err}");
        return format!("Failed to prepare moddir: {err}");
    }
    let disable_mode = mode != "enable";
    let total = files.len();
    let mut missing: Vec<String> = Vec::new();
    for file in files {
        // 源文件候选：先试「另一种形态」的扩展名，再试原名对应的两种形态，最后兜底调用方传入的原名
        let mut src_candidates: Vec<String> = Vec::new();
        let candidates = if disable_mode {
            [to_enabled_file_name(&file), to_disabled_file_name(&file)]
        } else {
            [to_disabled_file_name(&file), to_enabled_file_name(&file)]
        };
        for candidate in candidates {
            if !src_candidates.contains(&candidate) {
                src_candidates.push(candidate);
            }
        }
        if !src_candidates.contains(&file) {
            src_candidates.push(file.clone());
        }
        let mut handled = false;
        for candidate in src_candidates {
            let src = base_path.join(&candidate);
            if !src.exists() {
                continue;
            }
            let dst_name = if disable_mode {
                to_disabled_file_name(&candidate)
            } else {
                to_enabled_file_name(&candidate)
            };
            // 名字已是目标形态（如非 pak 类文件），无需改名，视为成功
            if candidate == dst_name {
                handled = true;
                break;
            }
            let dst = base_path.join(&dst_name);
            if let Err(err) = fs::rename(&src, &dst) {
                eprintln!("Failed to rename {:?} -> {:?}: {err}", src, dst);
                return format!("Failed to rename {:?} -> {:?}: {err}", src, dst);
            }
            handled = true;
            break;
        }
        if !handled {
            eprintln!("Skip missing mod file: {file}");
            missing.push(file);
        }
    }
    if total > 0 && missing.len() == total {
        return format!("MOD 文件不存在：{}", missing.join("、"));
    }
    "".to_string()
}

#[tauri::command]
pub fn import_pic(path: String) -> Result<String, String> {
    // 导入图片 转换为dataurl
    let mut file = File::open(&path).map_err(|e| format!("无法打开文件: {}", e))?;
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer)
        .map_err(|e| format!("读取文件失败: {}", e))?;

    // 截取文件扩展名
    let ext = path
        .split(".")
        .last()
        .ok_or_else(|| "无效的文件路径".to_string())?;

    let data_url = format!(
        "data:image/{};base64,{}",
        ext,
        base64::Engine::encode(&base64::engine::general_purpose::STANDARD, buffer)
    );
    Ok(data_url)
}

/// 将拖放的图片字节转换为预览图 Data URL。
#[tauri::command]
pub fn import_pic_data(data: Vec<u8>, mime: String) -> Result<String, String> {
    let mime = match mime.to_ascii_lowercase().as_str() {
        "image/bmp" => "image/bmp",
        "image/gif" => "image/gif",
        "image/jpeg" | "image/jpg" => "image/jpeg",
        "image/png" => "image/png",
        "image/tiff" => "image/tiff",
        "image/webp" => "image/webp",
        "image/x-icon" | "image/vnd.microsoft.icon" => "image/x-icon",
        _ => return Err("不支持的图片格式".to_string()),
    };

    Ok(format!(
        "data:{mime};base64,{}",
        base64::Engine::encode(&base64::engine::general_purpose::STANDARD, data)
    ))
}

#[cfg(test)]
mod mod_file_tests {
    use super::{enable_mod, import_mod};
    use std::fs;
    use std::io::Write;
    use std::path::{Path, PathBuf};
    use zip::write::FileOptions;

    /// 建立隔离的临时目录（按用例名区分，重复运行前先清空）。
    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("dna-mod-test-{name}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("创建测试目录失败");
        dir
    }

    /// 目录路径的字符串形式（命令参数用）。
    fn basedir(dir: &Path) -> String {
        dir.to_string_lossy().to_string()
    }

    /// 目录内的文件名（排序后便于断言）。
    fn file_names(dir: &Path) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(dir)
            .expect("读取目录失败")
            .flatten()
            .map(|entry| entry.file_name().to_string_lossy().to_string())
            .collect();
        names.sort();
        names
    }

    /// 打包一个含指定条目的 zip，模拟上传/下载得到的 MOD 压缩包。
    fn write_zip(path: &Path, entries: &[(&str, &[u8])]) {
        let file = fs::File::create(path).expect("创建 zip 失败");
        let mut writer = zip::ZipWriter::new(file);
        let options = FileOptions::default().compression_method(zip::CompressionMethod::Stored);
        for (name, data) in entries {
            writer
                .start_file(*name, options)
                .expect("写入 zip 条目失败");
            writer.write_all(data).expect("写入 zip 内容失败");
        }
        writer.finish().expect("完成 zip 失败");
    }

    /// 下载得到的压缩包应被解压进游戏 MOD 目录，并就地改成游戏不加载的 .kap 禁用态。
    #[test]
    fn import_extracts_zip_into_mod_dir_as_disabled() {
        let work = temp_dir("import");
        let zip_path = work.join("EveToAida_P.zip");
        write_zip(
            &zip_path,
            &[("EveToAida_P.pak", b"pak-bytes"), ("mod.json", b"{}")],
        );
        let mod_dir = work.join("~mods");
        fs::create_dir_all(&mod_dir).unwrap();

        let output = import_mod(
            basedir(&mod_dir),
            vec![zip_path.to_string_lossy().to_string()],
        );

        assert!(
            output.contains("EveToAida_P.kap"),
            "导入结果应报告禁用态文件名: {output}"
        );
        // 压缩包内的 pak 落到 MOD 目录并处于禁用态，mod.json 等非 pak 文件不导入
        assert_eq!(file_names(&mod_dir), vec!["EveToAida_P.kap"]);
    }

    /// 启用把 .kap 还原为 .pak，且对已经处于启用态的文件重复调用是幂等的。
    #[test]
    fn enable_restores_pak_and_is_idempotent() {
        let mod_dir = temp_dir("enable");
        fs::write(mod_dir.join("A_P.kap"), b"x").unwrap();

        assert_eq!(
            enable_mod(
                basedir(&mod_dir),
                vec!["A_P.kap".to_string()],
                "enable".to_string()
            ),
            ""
        );
        assert_eq!(file_names(&mod_dir), vec!["A_P.pak"]);

        // 记录仍是 .kap 而磁盘已是 .pak（例如外部改过名）：再启用一次不能报错，也不能改坏状态
        assert_eq!(
            enable_mod(
                basedir(&mod_dir),
                vec!["A_P.kap".to_string()],
                "enable".to_string()
            ),
            ""
        );
        assert_eq!(file_names(&mod_dir), vec!["A_P.pak"]);
    }

    /// 禁用同样兼容两种形态：磁盘上仍是 .kap 时视为已经禁用成功。
    #[test]
    fn disable_handles_both_extensions() {
        let mod_dir = temp_dir("disable");
        fs::write(mod_dir.join("A_P.pak"), b"x").unwrap();
        assert_eq!(
            enable_mod(
                basedir(&mod_dir),
                vec!["A_P.kap".to_string()],
                "disable".to_string()
            ),
            ""
        );
        assert_eq!(file_names(&mod_dir), vec!["A_P.kap"]);

        // 已经处于禁用态：重复禁用应成功且不改名
        assert_eq!(
            enable_mod(
                basedir(&mod_dir),
                vec!["A_P.kap".to_string()],
                "disable".to_string()
            ),
            ""
        );
        assert_eq!(file_names(&mod_dir), vec!["A_P.kap"]);
    }

    /// 一条记录的文件全都找不到时返回错误，避免前端把「什么都没做」当成启用成功。
    #[test]
    fn enable_fails_when_every_file_is_missing() {
        let mod_dir = temp_dir("missing");

        let error = enable_mod(
            basedir(&mod_dir),
            vec!["Ghost_P.kap".to_string()],
            "enable".to_string(),
        );

        assert!(
            error.contains("MOD 文件不存在") && error.contains("Ghost_P.kap"),
            "应返回文件缺失错误: {error}"
        );
    }

    /// 只有部分文件缺失时保持宽容：已存在的文件正常处理，不整体失败。
    #[test]
    fn enable_tolerates_partially_missing_files() {
        let mod_dir = temp_dir("partial");
        fs::write(mod_dir.join("A_P.kap"), b"x").unwrap();

        let error = enable_mod(
            basedir(&mod_dir),
            vec!["A_P.kap".to_string(), "Missing_P.kap".to_string()],
            "enable".to_string(),
        );

        assert_eq!(error, "");
        assert_eq!(file_names(&mod_dir), vec!["A_P.pak"]);
    }
}
