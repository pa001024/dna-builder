//! 系统与平台命令：系统信息、系统字体枚举、文档目录、开机启动与应用退出。

#[tauri::command]
pub async fn app_close(app_handle: tauri::AppHandle) {
    // let Some(window) = app_handle.get_webview_window("main") else {
    //     return app_handle.exit(0);
    // };
    #[cfg(target_os = "windows")]
    {
        use tauri_plugin_window_state::{AppHandleExt, StateFlags};
        app_handle.save_window_state(StateFlags::all()).ok(); // don't really care if it saves it
    }
    // if let Err(_) = window.close() {
    return app_handle.exit(0);
    // }
}

#[tauri::command]
pub fn get_os_version() -> String {
    use sysinfo::System;
    let mut sys = System::new_all();
    sys.refresh_all();
    if let Some(version) = sysinfo::System::os_version() {
        version
    } else {
        "".to_string()
    }
}

/// 获取文档目录路径
#[tauri::command]
pub fn get_documents_dir() -> String {
    #[cfg(target_os = "windows")]
    {
        use widestring::U16CStr;
        use windows::Win32::System::Com::CoTaskMemFree;
        use windows::Win32::UI::Shell::FOLDERID_Documents;
        use windows::Win32::UI::Shell::KNOWN_FOLDER_FLAG;
        use windows::Win32::UI::Shell::SHGetKnownFolderPath;

        unsafe {
            let result = SHGetKnownFolderPath(&FOLDERID_Documents, KNOWN_FOLDER_FLAG(0), None);

            match result {
                Ok(path_ptr) => {
                    let ptr = path_ptr.as_ptr();
                    if ptr.is_null() {
                        return "C:/Users/Public/Documents".to_string();
                    }

                    let u16cstr = U16CStr::from_ptr_str(ptr);
                    let result = u16cstr.to_string_lossy().to_string();

                    CoTaskMemFree(Some(ptr as *const _));
                    result
                }
                Err(_) => "C:/Users/Public/Documents".to_string(),
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        use std::env;
        use std::path::Path;
        if let Some(home) = env::var("HOME").ok() {
            let docs_dir = format!("{}/Documents", home);
            if Path::new(&docs_dir).exists() {
                return docs_dir;
            }
        }
        "/tmp".to_string()
    }
}

/// 常见字体样式后缀（小写）。注册表中每个样式变体会单独登记，
/// 枚举时过滤掉这些条目，只保留基础字体族名。
const FONT_STYLE_SUFFIXES: &[&str] = &[
    "bold",
    "italic",
    "bold italic",
    "oblique",
    "light",
    "semi light",
    "semilight",
    "medium",
    "thin",
    "black",
    "heavy",
    "regular",
    "semibold",
    "semi bold",
    "demibold",
    "demi bold",
    "extrabold",
    "extra bold",
    "extralight",
    "extra light",
    "bolditalic",
];

/// 判断字体名是否以常见样式后缀结尾（用于过滤样式变体条目）。
fn is_font_style_variant(name: &str) -> bool {
    let lower = name.to_lowercase();
    FONT_STYLE_SUFFIXES
        .iter()
        .any(|suffix| lower.ends_with(suffix))
}

/// 从注册表字体值名解析可直接用于 CSS font-family 的字体族名列表。
///
/// 注册表值名形如 `Microsoft YaHei & 微软雅黑 (TrueType)`：
/// 1. 去掉末尾括号中的文件类型描述；
/// 2. 按 `&` 拆分中英双名，逐个返回。
fn parse_font_family_names(registry_value_name: &str) -> Vec<String> {
    // 去掉末尾的 "(TrueType)" 等类型描述
    let base = match registry_value_name.trim_end().strip_suffix(')') {
        Some(inner) => match inner.rfind('(') {
            Some(pos) => inner[..pos].trim(),
            None => inner.trim(),
        },
        None => registry_value_name.trim(),
    };
    if base.is_empty() {
        return Vec::new();
    }

    base.split('&')
        .map(|part| part.trim())
        .filter(|name| !name.is_empty() && !is_font_style_variant(name))
        .map(|name| name.to_string())
        .collect()
}

/// 枚举系统已安装字体（读取注册表中的字体登记项）。
///
/// 同时读取 HKLM（全机安装）与 HKCU（Windows 10 1809+ 支持的按用户安装），
/// 返回去重排序后的字体族名，可直接用于前端 CSS font-family。
#[tauri::command]
pub fn list_system_fonts() -> Result<Vec<String>, String> {
    #[cfg(target_os = "windows")]
    {
        use winreg::{RegKey, enums::*};

        let mut names: Vec<String> = Vec::new();
        for hive in [HKEY_LOCAL_MACHINE, HKEY_CURRENT_USER] {
            let key_path = "Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts";
            let Ok(fonts_key) = RegKey::predef(hive).open_subkey(key_path) else {
                continue;
            };
            for value_name in fonts_key.enum_values().flatten().map(|(name, _)| name) {
                names.extend(parse_font_family_names(&value_name));
            }
        }

        names.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));
        names.dedup_by(|a, b| a.eq_ignore_ascii_case(b));
        Ok(names)
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(Vec::new())
    }
}

/// 获取当前开机启动状态。
#[tauri::command]
pub fn is_launch_at_startup_enabled(app_handle: tauri::AppHandle) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        use tauri_plugin_autostart::ManagerExt;
        app_handle
            .autolaunch()
            .is_enabled()
            .map_err(|error| format!("读取开机启动状态失败: {error}"))
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = app_handle;
        Err("当前平台暂不支持开机启动设置".to_string())
    }
}

/// 更新开机启动状态。
#[tauri::command]
pub fn set_launch_at_startup_enabled(
    app_handle: tauri::AppHandle,
    enabled: bool,
) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        use tauri_plugin_autostart::ManagerExt;
        let manager = app_handle.autolaunch();
        if enabled {
            manager
                .enable()
                .map_err(|error| format!("启用开机启动失败: {error}"))?;
        } else {
            manager
                .disable()
                .map_err(|error| format!("关闭开机启动失败: {error}"))?;
        }
        manager
            .is_enabled()
            .map_err(|error| format!("校验开机启动状态失败: {error}"))
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (app_handle, enabled);
        Err("当前平台暂不支持开机启动设置".to_string())
    }
}
