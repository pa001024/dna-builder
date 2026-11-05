//! 桌面分身能力检测：系统版本/家庭版判定、提权、TermService、child sessions、ATL/mstscax。

use serde::{Deserialize, Serialize};

use super::session;

const CURRENT_VERSION_KEY: &str = r"SOFTWARE\Microsoft\Windows NT\CurrentVersion";
const TERMINAL_SERVER_KEY: &str = r"SYSTEM\CurrentControlSet\Control\Terminal Server";
const CONTROL_CLSID: &str = "{8B918B82-7985-4C24-89DF-C33AD2BBFBCD}";

/// 克隆能力快照（`desktop_clone_status` / `desktop_clone_capability` 的载荷）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloneCapability {
    pub supported: bool,
    pub reason: Option<String>,
    pub edition_id: String,
    pub product_name: String,
    pub build: u32,
    pub display_version: String,
    pub elevated: bool,
    pub child_sessions_enabled: bool,
    pub term_service_running: bool,
    pub remote_desktop_denied: bool,
    pub active_child_session_id: Option<u32>,
    #[serde(rename = "activeXAvailable")]
    pub activex_available: bool,
    pub atl_available: bool,
}

impl CloneCapability {
    #[allow(dead_code)]
    fn unavailable(reason: impl Into<String>) -> Self {
        Self {
            supported: false,
            reason: Some(reason.into()),
            edition_id: String::new(),
            product_name: String::new(),
            build: 0,
            display_version: String::new(),
            elevated: false,
            child_sessions_enabled: false,
            term_service_running: false,
            remote_desktop_denied: false,
            active_child_session_id: None,
            activex_available: false,
            atl_available: false,
        }
    }
}

/// 家庭版（EditionID 以 `Core` 开头）不支持 child session 路径。
pub fn is_unsupported_edition(edition_id: &str) -> bool {
    edition_id.trim().to_ascii_lowercase().starts_with("core")
}

/// 解析构建号字符串，非法时返回 0。
pub fn parse_build(raw: &str) -> u32 {
    raw.trim().parse::<u32>().unwrap_or(0)
}

#[cfg(target_os = "windows")]
fn read_string(key_path: &str, name: &str) -> Option<String> {
    use winreg::RegKey;
    use winreg::enums::{HKEY_LOCAL_MACHINE, KEY_READ};

    RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey_with_flags(key_path, KEY_READ)
        .ok()?
        .get_value::<String, _>(name)
        .ok()
}

#[cfg(target_os = "windows")]
fn read_u32(key_path: &str, name: &str) -> Option<u32> {
    use winreg::RegKey;
    use winreg::enums::{HKEY_LOCAL_MACHINE, KEY_READ};

    RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey_with_flags(key_path, KEY_READ)
        .ok()?
        .get_value::<u32, _>(name)
        .ok()
}

#[cfg(target_os = "windows")]
fn is_elevated() -> bool {
    use std::mem::size_of;
    use windows::Win32::Foundation::{CloseHandle, HANDLE};
    use windows::Win32::Security::{
        GetTokenInformation, TOKEN_ELEVATION, TOKEN_QUERY, TokenElevation,
    };
    use windows::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};

    unsafe {
        let mut token = HANDLE::default();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token).is_err() {
            return false;
        }
        let mut elevation = TOKEN_ELEVATION::default();
        let mut returned = 0u32;
        let ok = GetTokenInformation(
            token,
            TokenElevation,
            Some(&mut elevation as *mut TOKEN_ELEVATION as *mut core::ffi::c_void),
            size_of::<TOKEN_ELEVATION>() as u32,
            &mut returned,
        )
        .is_ok();
        let _ = CloseHandle(token);
        ok && elevation.TokenIsElevated != 0
    }
}

/// 真实 System32 目录：由系统 API 给出，可执行目录/环境变量无法改写。
#[cfg(target_os = "windows")]
pub(crate) fn system_directory() -> std::path::PathBuf {
    use windows::Win32::System::SystemInformation::{GetSystemDirectoryW, GetWindowsDirectoryW};

    let mut buffer = [0u16; 512];
    let length = unsafe { GetSystemDirectoryW(Some(&mut buffer)) } as usize;
    if length > 0 && length < buffer.len() {
        return std::path::PathBuf::from(String::from_utf16_lossy(&buffer[..length]));
    }
    // 退一步用 Windows 目录拼 System32，仍然来自注册表之外的系统 API
    let length = unsafe { GetWindowsDirectoryW(Some(&mut buffer)) } as usize;
    if length > 0 && length < buffer.len() {
        return std::path::PathBuf::from(String::from_utf16_lossy(&buffer[..length]))
            .join("System32");
    }
    std::path::PathBuf::from(r"C:\Windows\System32")
}

#[cfg(target_os = "windows")]
pub(crate) fn system32_path(file: &str) -> std::path::PathBuf {
    system_directory().join(file)
}

/// 从系统目录加载 DLL，依赖项只搜索 System32，避免当前目录/环境变量劫持。
#[cfg(target_os = "windows")]
pub(crate) fn load_system_library(
    file: &str,
) -> Result<windows::Win32::Foundation::HMODULE, String> {
    use std::os::windows::ffi::OsStrExt;

    use windows::Win32::System::LibraryLoader::{
        LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR, LOAD_LIBRARY_SEARCH_SYSTEM32, LoadLibraryExW,
    };

    let path = system32_path(file);
    let path_w: Vec<u16> = path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let flags = LOAD_LIBRARY_SEARCH_SYSTEM32 | LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR;
    unsafe { LoadLibraryExW(windows::core::PCWSTR(path_w.as_ptr()), None, flags) }
        .map_err(|error| format!("加载 {} 失败: {error}", path.display()))
}

/// atl.dll 存在且导出 `AtlAxWinInit` / `AtlAxGetControl`。
#[cfg(target_os = "windows")]
fn atl_available() -> bool {
    use windows::Win32::Foundation::FreeLibrary;
    use windows::Win32::System::LibraryLoader::GetProcAddress;
    use windows::core::s;

    let Ok(library) = load_system_library("atl.dll") else {
        return false;
    };
    unsafe {
        let init = GetProcAddress(library, s!("AtlAxWinInit")).is_some();
        let control = GetProcAddress(library, s!("AtlAxGetControl")).is_some();
        let _ = FreeLibrary(library);
        init && control
    }
}

/// mstscax.dll 存在且 CLSID 已注册。
#[cfg(target_os = "windows")]
fn activex_available() -> bool {
    use winreg::RegKey;
    use winreg::enums::{HKEY_CLASSES_ROOT, KEY_READ};

    if !system32_path("mstscax.dll").exists() {
        return false;
    }
    RegKey::predef(HKEY_CLASSES_ROOT)
        .open_subkey_with_flags(format!(r"CLSID\{CONTROL_CLSID}"), KEY_READ)
        .is_ok()
}

#[cfg(target_os = "windows")]
fn term_service_running() -> bool {
    session::term_service_running().unwrap_or(false)
}

#[cfg(target_os = "windows")]
fn remote_desktop_denied() -> bool {
    read_u32(TERMINAL_SERVER_KEY, "fDenyTSConnections").unwrap_or(1) != 0
}

/// 采集当前机器的克隆能力。
#[cfg(target_os = "windows")]
pub fn detect() -> CloneCapability {
    let edition_id = read_string(CURRENT_VERSION_KEY, "EditionID").unwrap_or_default();
    let product_name = read_string(CURRENT_VERSION_KEY, "ProductName").unwrap_or_default();
    let display_version = read_string(CURRENT_VERSION_KEY, "DisplayVersion").unwrap_or_default();
    let build = read_string(CURRENT_VERSION_KEY, "CurrentBuildNumber")
        .or_else(|| read_string(CURRENT_VERSION_KEY, "CurrentBuild"))
        .map(|raw| parse_build(&raw))
        .unwrap_or(0);

    let mut capability = CloneCapability {
        supported: true,
        reason: None,
        edition_id,
        product_name,
        build,
        display_version,
        elevated: is_elevated(),
        child_sessions_enabled: session::child_sessions_enabled(),
        term_service_running: term_service_running(),
        remote_desktop_denied: remote_desktop_denied(),
        active_child_session_id: session::active_child_session_id(),
        activex_available: activex_available(),
        atl_available: atl_available(),
    };

    let reason = if is_unsupported_edition(&capability.edition_id) {
        Some(format!(
            "当前系统版本不支持桌面分身（EditionID: {}）",
            capability.edition_id
        ))
    } else if !capability.elevated {
        Some("桌面分身需要以管理员身份运行".to_string())
    } else if !capability.atl_available {
        Some("系统缺少 ActiveX 宿主组件（atl.dll）".to_string())
    } else if !capability.activex_available {
        Some("系统缺少远程桌面控件（mstscax.dll）".to_string())
    } else if capability.build == 0 {
        Some("无法识别系统构建号".to_string())
    } else {
        None
    };

    capability.supported = reason.is_none();
    capability.reason = reason;
    capability
}

#[cfg(not(target_os = "windows"))]
pub fn detect() -> CloneCapability {
    CloneCapability::unavailable("桌面分身仅支持 Windows")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn home_editions_are_unsupported() {
        for edition in [
            "Core",
            "CoreSingleLanguage",
            "CoreCountrySpecific",
            "core",
            "CoreN",
        ] {
            assert!(is_unsupported_edition(edition), "{edition}");
        }
        for edition in ["Professional", "Enterprise", "Education", "IoTEnterprise"] {
            assert!(!is_unsupported_edition(edition), "{edition}");
        }
    }

    #[test]
    fn capability_json_matches_frontend_contract() {
        let capability = CloneCapability {
            supported: true,
            reason: None,
            edition_id: "Professional".into(),
            product_name: "Windows 10 Pro".into(),
            build: 28000,
            display_version: "26H1".into(),
            elevated: true,
            child_sessions_enabled: true,
            term_service_running: true,
            remote_desktop_denied: true,
            active_child_session_id: Some(4),
            activex_available: true,
            atl_available: true,
        };
        let json = serde_json::to_value(&capability).unwrap();
        for key in [
            "supported",
            "reason",
            "editionId",
            "productName",
            "build",
            "displayVersion",
            "elevated",
            "childSessionsEnabled",
            "termServiceRunning",
            "remoteDesktopDenied",
            "activeChildSessionId",
            "activeXAvailable",
            "atlAvailable",
        ] {
            assert!(json.get(key).is_some(), "缺少字段 {key}");
        }
    }

    #[test]
    fn build_parsing_is_tolerant() {
        assert_eq!(parse_build("28000"), 28000);
        assert_eq!(parse_build(" 22631 "), 22631);
        assert_eq!(parse_build(""), 0);
        assert_eq!(parse_build("abc"), 0);
    }
}
