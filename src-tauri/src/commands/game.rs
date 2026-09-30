//! 游戏相关命令：进程等待与启动、安装目录探测、管理员权限、桌面快捷方式与差分补丁。

use std::{
    fs,
    path::{Path, PathBuf},
    time::Duration,
};

/// 内嵌的 hpatchz 可执行文件（应用 hdiff 差分包用）。
const HPATCHZ_BYTES: &[u8] = include_bytes!("../../resources/hpatchz.exe");

const GAME_PROCESS: &str = "EM-Win64-Shipping.exe";

#[tauri::command]
pub fn get_game_install() -> String {
    #[cfg(target_os = "windows")]
    {
        use winreg::{RegKey, enums::*};
        // 读取注册表
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let key = "Software\\Hero Games\\Duet Night Abyss";
        let sk = hkcu.open_subkey(key);
        if let Ok(sk) = sk {
            for file in sk
                .enum_keys()
                .map(|x| x.unwrap())
                .filter(|x| x.ends_with("EMLauncher.exe"))
            {
                // 截取文件夹路径
                let parts: Vec<&str> = file.split("\\").collect();
                let dir = &parts[..parts.len() - 1].join("\\");
                let game_dir = dir.to_string() + "\\DNA Game\\EM.exe";
                if Path::new(&game_dir).exists() {
                    return game_dir;
                }
            }
        }
    }
    return "".to_string();
}

#[tauri::command]
pub async fn is_game_running(is_run: bool) -> String {
    #[cfg(target_os = "windows")]
    {
        use crate::util::get_process_exe_path;

        let mut elapsed = Duration::from_secs(0);
        let timeout = Duration::from_secs(60 * 60); // 1h
        let interval = Duration::from_millis(500); // 500ms

        while elapsed <= timeout {
            let now_is_run = crate::submodules::win::get_pid_by_name(GAME_PROCESS).unwrap_or(0) > 0;
            if now_is_run != is_run {
                break;
            }
            tokio::time::sleep(interval).await;
            elapsed += interval;
        }

        if !is_run {
            if let Ok(Some(path)) = get_process_exe_path(GAME_PROCESS) {
                return path;
            }
        }
    }
    "".to_string()
}

#[tauri::command]
pub async fn launch_exe(path: String, params: String) -> bool {
    #[cfg(target_os = "windows")]
    {
        use crate::util::shell_execute_runas;
        let pid = shell_execute_runas(path.as_str(), Some(params.as_str()), None);
        if let Err(err) = pid {
            println!("Failed to launch game: {:?}", err);
            return false;
        }
    }
    true
}
#[tauri::command]
pub async fn launch_normal(path: String, params: String) -> bool {
    #[cfg(target_os = "windows")]
    {
        use crate::util::shell_execute;
        let pid = shell_execute(path.as_str(), Some(params.as_str()), None);
        if let Err(err) = pid {
            println!("Failed to launch game: {:?}", err);
            return false;
        }
    }
    true
}

/// 以管理员权限重新启动当前程序
#[tauri::command]
pub async fn run_as_admin(app_handle: tauri::AppHandle) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        use crate::util::shell_execute_runas;
        use std::env;

        // 获取当前可执行文件路径
        let exe_path = env::current_exe().map_err(|e| format!("获取可执行文件路径失败: {}", e))?;

        // 使用 shell_execute 以管理员权限启动
        let exe_path_str = exe_path.to_string_lossy().to_string();
        let result = shell_execute_runas(&exe_path_str, None, None);

        match result {
            Ok(_) => {
                // 启动成功后退出当前进程
                let _ = app_handle.exit(0);
                Ok(true)
            }
            Err(e) => Err(format!("以管理员权限启动失败: {:?}", e)),
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(false)
    }
}

/// 检查当前进程是否以管理员权限运行
#[tauri::command]
pub fn check_is_admin() -> bool {
    #[cfg(target_os = "windows")]
    {
        use crate::util::is_elevated;
        match is_elevated() {
            Ok(is_admin) => is_admin,
            Err(_) => false,
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}

/// 创建指向游戏主程序的桌面快捷方式（名称固定为「二重螺旋」）。
#[tauri::command]
pub fn create_desktop_shortcut(path: String) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        use widestring::{U16CStr, U16CString};
        use windows::Win32::System::Com::{
            CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, CoCreateInstance, CoInitializeEx,
            CoTaskMemFree, IPersistFile,
        };
        use windows::Win32::UI::Shell::{
            FOLDERID_Desktop, IShellLinkW, KNOWN_FOLDER_FLAG, SHGetKnownFolderPath, ShellLink,
        };
        use windows::core::{Interface, PCWSTR};

        const SHORTCUT_NAME: &str = "二重螺旋";

        let result = unsafe {
            // 初始化 COM（若线程已初始化则忽略错误）
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);

            // 获取桌面目录
            let desktop_ptr = SHGetKnownFolderPath(&FOLDERID_Desktop, KNOWN_FOLDER_FLAG(0), None)
                .map_err(|error| format!("获取桌面路径失败: {error}"))?;
            let desktop = U16CStr::from_ptr_str(desktop_ptr.as_ptr())
                .to_string_lossy()
                .to_string();
            CoTaskMemFree(Some(desktop_ptr.as_ptr() as *const _));

            let shortcut_path = format!("{desktop}\\{SHORTCUT_NAME}.lnk");
            let game_dir = path.strip_suffix("EM.exe").unwrap_or(&path);
            let target =
                U16CString::from_str(&path).map_err(|error| format!("路径编码失败: {error}"))?;
            let work_dir =
                U16CString::from_str(game_dir).map_err(|error| format!("路径编码失败: {error}"))?;
            let save_path = U16CString::from_str(&shortcut_path)
                .map_err(|error| format!("路径编码失败: {error}"))?;
            let description = U16CString::from_str(SHORTCUT_NAME)
                .map_err(|error| format!("名称编码失败: {error}"))?;

            // 创建快捷方式对象并设置目标、工作目录与描述
            let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)
                .map_err(|error| format!("创建快捷方式实例失败: {error}"))?;
            link.SetPath(PCWSTR(target.as_ptr()))
                .map_err(|error| format!("设置快捷方式目标失败: {error}"))?;
            link.SetWorkingDirectory(PCWSTR(work_dir.as_ptr()))
                .map_err(|error| format!("设置工作目录失败: {error}"))?;
            link.SetDescription(PCWSTR(description.as_ptr()))
                .map_err(|error| format!("设置描述失败: {error}"))?;

            // 保存为 .lnk 文件
            let persist: IPersistFile = link
                .cast()
                .map_err(|error| format!("转换接口失败: {error}"))?;
            persist
                .Save(PCWSTR(save_path.as_ptr()), true)
                .map_err(|error| format!("保存快捷方式失败: {error}"))?;

            format!("已创建桌面快捷方式: {shortcut_path}")
        };
        Ok(result)
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("仅支持在 Windows 上创建桌面快捷方式".to_string())
    }
}

/// 使用内嵌的 hpatchz 应用 hdiff 包。
///
/// `old_path` 为空（`None` 或空串）时按完整包处理：hdiff 内含全部新数据，hpatchz 的 oldPath 传空串。
/// 非空时按差分包处理：hpatchz 以该路径（旧文件或旧目录）为 oldPath 读取旧数据，
/// 目录差分包可传入同一个旧安装目录，`-f` 会先写临时文件再覆盖。
#[tauri::command]
pub async fn apply_game_patch(
    diff_path: String,
    target_dir: String,
    old_path: Option<String>,
) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let diff_path = PathBuf::from(&diff_path);
        if !diff_path.is_file() {
            return Err(format!("hdiff 文件不存在: {}", diff_path.display()));
        }

        let target_dir = PathBuf::from(&target_dir);
        fs::create_dir_all(&target_dir).map_err(|e| format!("创建游戏目录失败: {}", e))?;

        // 差分包的旧数据来源；空串表示完整包（hdiff 内含全部新数据）
        let old_path = old_path.unwrap_or_default();
        let old_path = old_path.trim();
        if !old_path.is_empty() && !Path::new(old_path).exists() {
            return Err(format!("差分包的旧文件/目录不存在: {}", old_path));
        }

        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| format!("生成临时文件名失败: {}", e))?
            .as_nanos();
        let executable_path = std::env::temp_dir().join(format!(
            "dna-builder-hpatchz-{}-{}.exe",
            std::process::id(),
            unique
        ));
        fs::write(&executable_path, HPATCHZ_BYTES)
            .map_err(|e| format!("释放内嵌 hpatchz 失败: {}", e))?;

        let mut command = std::process::Command::new(&executable_path);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;

            command.creation_flags(0x08000000);
        }
        let result = command
            .arg("-f")
            .arg(old_path)
            .arg(&diff_path)
            .arg(&target_dir)
            .output();
        let _ = fs::remove_file(&executable_path);
        let output = result.map_err(|e| format!("启动 hpatchz 失败: {}", e))?;
        if !output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            let detail = if stderr.is_empty() { stdout } else { stderr };
            return Err(format!(
                "hpatchz 执行失败 ({}), oldPath: {}, diffFile: {}: {}",
                output.status,
                if old_path.is_empty() {
                    "\"\""
                } else {
                    old_path
                },
                diff_path.display(),
                detail
            ));
        }

        if old_path.is_empty() {
            Ok(format!("完整包已应用到 {}", target_dir.display()))
        } else {
            Ok(format!(
                "差分包已应用到 {}（旧数据来源: {}）",
                target_dir.display(),
                old_path
            ))
        }
    })
    .await
    .map_err(|e| format!("hpatchz 任务执行失败: {}", e))?
}
