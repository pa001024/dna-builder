//! 运行环境诊断：系统 / CPU / 内存 / 显卡 / 显示器 / WebView2 版本，以及 WebView2 运行时自动安装。
//!
//! 只读取注册表、DXGI 与系统 API 的原始信息，不创建 D3D 设备，供设置页「诊断工具」展示与一键复制。

use serde::Serialize;

/// WebView2 Evergreen 引导安装器（微软官方 fwlink，按设备架构自动选择运行时）
const WEBVIEW2_BOOTSTRAPPER_URL: &str = "https://go.microsoft.com/fwlink/p/?LinkId=2124703";

/// 引导安装器体积上限：正常约 2 MB，超过即视为异常响应
const MAX_BOOTSTRAPPER_BYTES: u64 = 32 * 1024 * 1024;

/// 安装器最长等待时间，超时后结束子进程并提示手动安装
#[cfg(target_os = "windows")]
const BOOTSTRAPPER_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(15 * 60);

/// 防止并发安装：安装器会占用固定临时文件并可能弹出 UAC
#[cfg(target_os = "windows")]
static INSTALLING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// 显卡适配器信息（来自 DXGI）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuInfo {
    pub name: String,
    pub vendor_id: u32,
    pub device_id: u32,
    /// 专用显存（字节），核显通常为 0
    pub dedicated_video_memory: u64,
    /// 共享系统内存（字节）
    pub shared_system_memory: u64,
    /// 用户态驱动版本，形如 `32.0.15.6094`
    pub driver_version: Option<String>,
    /// 是否为软件渲染适配器（如 Microsoft Basic Render Driver）
    pub software: bool,
}

/// 显示器信息（来自 EnumDisplayDevicesW / EnumDisplaySettingsW）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DisplayInfo {
    /// 输出该显示器的显卡名称
    pub adapter_name: String,
    pub width: u32,
    pub height: u32,
    pub refresh_rate_hz: Option<u32>,
    pub bits_per_pixel: Option<u32>,
    pub primary: bool,
}

/// 完整诊断信息快照。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsInfo {
    pub app_version: String,
    /// 运行平台标识（`windows` / `macos` / `linux`）
    pub platform: String,
    pub os_name: String,
    pub os_version: String,
    pub os_build: String,
    /// 系统原生架构（`x86_64` / `arm64` / `x86`）
    pub os_arch: String,
    /// 当前进程架构
    pub process_arch: String,
    pub locale: Option<String>,
    pub elevated: bool,
    pub cpu_brand: String,
    pub cpu_vendor: String,
    pub cpu_physical_cores: usize,
    pub cpu_logical_cores: usize,
    /// 当前主频（MHz，sysinfo 在 Windows 上取 PROCESSOR_POWER_INFORMATION.CurrentMhz）
    pub cpu_frequency_mhz: u64,
    pub total_memory: u64,
    pub available_memory: u64,
    pub gpus: Vec<GpuInfo>,
    /// DXGI 枚举失败原因；失败时 `gpus` 为空，不能据此判断「无硬件显卡」
    pub gpus_error: Option<String>,
    pub displays: Vec<DisplayInfo>,
    pub webview2_version: Option<String>,
    pub webview2_error: Option<String>,
}

/// 收集当前运行环境的诊断信息。
#[tauri::command]
pub async fn get_diagnostics(app: tauri::AppHandle) -> Result<DiagnosticsInfo, String> {
    let app_version = app.package_info().version.to_string();
    tauri::async_runtime::spawn_blocking(move || collect(&app_version))
        .await
        .map_err(|error| format!("诊断线程异常: {error}"))
}

/// 下载并静默安装最新 WebView2 运行时，返回安装后检测到的版本。
#[tauri::command]
pub async fn install_webview2() -> Result<Option<String>, String> {
    #[cfg(target_os = "windows")]
    {
        use std::sync::atomic::Ordering;

        if INSTALLING.swap(true, Ordering::SeqCst) {
            return Err("WebView2 运行时正在安装中，请稍候".to_string());
        }
        let result = install_webview2_inner().await;
        INSTALLING.store(false, Ordering::SeqCst);
        result
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("当前平台不支持自动安装 WebView2".to_string())
    }
}

#[cfg(target_os = "windows")]
async fn install_webview2_inner() -> Result<Option<String>, String> {
    let installer = download_bootstrapper().await?;
    let installer_path = installer.path().to_path_buf();
    let installed = tauri::async_runtime::spawn_blocking(move || {
        verify_authenticode(&installer_path)?;
        run_bootstrapper(&installer_path)
    })
    .await;
    // 无论安装线程是否正常结束，都由 TempInstaller 清理安装器与临时目录
    drop(installer);
    installed.map_err(|error| format!("安装线程异常: {error}"))??;
    Ok(tauri::webview_version().ok())
}

/// 临时安装器文件，离开作用域时删除文件及所在的独占临时目录。
#[cfg(target_os = "windows")]
struct TempInstaller {
    path: std::path::PathBuf,
}

#[cfg(target_os = "windows")]
impl TempInstaller {
    fn path(&self) -> &std::path::Path {
        &self.path
    }
}

#[cfg(target_os = "windows")]
impl Drop for TempInstaller {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.path);
        if let Some(dir) = self.path.parent() {
            let _ = std::fs::remove_dir_all(dir);
        }
    }
}

/// 汇总系统信息。sysinfo 只刷新内存与主频，避免枚举进程带来的额外开销。
fn collect(app_version: &str) -> DiagnosticsInfo {
    use sysinfo::{CpuRefreshKind, MemoryRefreshKind, RefreshKind, System};

    let system = System::new_with_specifics(
        RefreshKind::nothing()
            .with_memory(MemoryRefreshKind::nothing().with_ram())
            .with_cpu(CpuRefreshKind::nothing().with_frequency()),
    );
    let cpu = system.cpus().first();
    let (webview2_version, webview2_error) = match tauri::webview_version() {
        Ok(version) => (Some(version), None),
        Err(error) => (None, Some(error.to_string())),
    };
    let (gpus, gpus_error) = match collect_gpus() {
        Ok(gpus) => (gpus, None),
        Err(error) => (Vec::new(), Some(error)),
    };

    DiagnosticsInfo {
        app_version: app_version.to_string(),
        platform: std::env::consts::OS.to_string(),
        os_name: System::long_os_version().unwrap_or_default(),
        os_version: System::os_version().unwrap_or_default(),
        os_build: System::kernel_version().unwrap_or_default(),
        os_arch: native_arch(),
        process_arch: normalize_arch(std::env::consts::ARCH),
        locale: current_locale(),
        elevated: is_elevated(),
        cpu_brand: cpu.map(|cpu| cpu.brand().to_string()).unwrap_or_default(),
        cpu_vendor: cpu.map(|cpu| cpu.vendor_id().to_string()).unwrap_or_default(),
        cpu_physical_cores: System::physical_core_count().unwrap_or(0),
        cpu_logical_cores: system.cpus().len(),
        cpu_frequency_mhz: cpu.map(|cpu| cpu.frequency()).unwrap_or(0),
        total_memory: system.total_memory(),
        available_memory: system.available_memory(),
        gpus,
        gpus_error,
        displays: collect_displays(),
        webview2_version,
        webview2_error,
    }
}

/// 统一架构拼写：Rust 的 `aarch64` 与 Windows API 的 `arm64` 对齐。
fn normalize_arch(arch: &str) -> String {
    match arch {
        "aarch64" => "arm64".to_string(),
        other => other.to_string(),
    }
}

/// 截断到首个 NUL 的宽字符串转 UTF-8。
#[cfg(target_os = "windows")]
fn from_wide_lossy(value: &[u16]) -> String {
    let len = value.iter().position(|item| *item == 0).unwrap_or(value.len());
    String::from_utf16_lossy(&value[..len])
}

/// 系统原生架构：32 位进程运行在 64 位系统时也能报告真实架构。
#[cfg(target_os = "windows")]
fn native_arch() -> String {
    use windows::Win32::System::SystemInformation::{GetNativeSystemInfo, SYSTEM_INFO};

    let mut info = SYSTEM_INFO::default();
    unsafe { GetNativeSystemInfo(&mut info) };
    // PROCESSOR_ARCHITECTURE_INTEL = 0 / AMD64 = 9 / ARM64 = 12
    match unsafe { info.Anonymous.Anonymous.wProcessorArchitecture }.0 {
        9 => "x86_64".to_string(),
        12 => "arm64".to_string(),
        0 => "x86".to_string(),
        _ => normalize_arch(std::env::consts::ARCH),
    }
}

#[cfg(not(target_os = "windows"))]
fn native_arch() -> String {
    normalize_arch(std::env::consts::ARCH)
}

/// 枚举 DXGI 适配器；软件渲染适配器一并返回（由前端判断是否存在硬件显卡）。
#[cfg(target_os = "windows")]
fn collect_gpus() -> Result<Vec<GpuInfo>, String> {
    use windows::Win32::Graphics::Dxgi::{
        CreateDXGIFactory1, DXGI_ADAPTER_FLAG_SOFTWARE, IDXGIFactory1,
    };

    let mut gpus = Vec::new();
    unsafe {
        let factory = CreateDXGIFactory1::<IDXGIFactory1>()
            .map_err(|error| format!("DXGI 初始化失败: {error}"))?;
        let mut index = 0u32;
        while let Ok(adapter) = factory.EnumAdapters1(index) {
            index += 1;
            let Ok(desc) = adapter.GetDesc1() else {
                continue;
            };
            gpus.push(GpuInfo {
                name: from_wide_lossy(&desc.Description),
                vendor_id: desc.VendorId,
                device_id: desc.DeviceId,
                dedicated_video_memory: desc.DedicatedVideoMemory as u64,
                shared_system_memory: desc.SharedSystemMemory as u64,
                driver_version: driver_version(&adapter),
                software: desc.Flags & DXGI_ADAPTER_FLAG_SOFTWARE.0 as u32 != 0,
            });
        }
    }
    Ok(gpus)
}

#[cfg(not(target_os = "windows"))]
fn collect_gpus() -> Result<Vec<GpuInfo>, String> {
    Ok(Vec::new())
}

/// 用户态驱动版本：LARGE_INTEGER 的高到低四段各取 16 位（WDDM 2.3 起各 API 共享同一版本号）。
#[cfg(target_os = "windows")]
fn driver_version(adapter: &windows::Win32::Graphics::Dxgi::IDXGIAdapter1) -> Option<String> {
    use windows::Win32::Graphics::Dxgi::IDXGIDevice;

    let iid = <IDXGIDevice as windows_core::Interface>::IID;
    let version = unsafe { adapter.CheckInterfaceSupport(&iid) }.ok()?;
    // 基本显示适配器 / 软件渲染没有用户态驱动，返回全 0
    if version == 0 {
        return None;
    }
    Some(format!(
        "{}.{}.{}.{}",
        (version >> 48) & 0xFFFF,
        (version >> 32) & 0xFFFF,
        (version >> 16) & 0xFFFF,
        version & 0xFFFF
    ))
}

/// 枚举接到桌面上的显示输出及其当前模式（分辨率 / 刷新率 / 色深）。
#[cfg(target_os = "windows")]
fn collect_displays() -> Vec<DisplayInfo> {
    use windows::core::PCWSTR;
    use windows::Win32::Graphics::Gdi::{
        EnumDisplayDevicesW, EnumDisplaySettingsW, DEVMODEW, DISPLAY_DEVICE_ATTACHED_TO_DESKTOP,
        DISPLAY_DEVICE_PRIMARY_DEVICE, DISPLAY_DEVICEW, ENUM_CURRENT_SETTINGS,
    };

    let mut displays = Vec::new();
    unsafe {
        let mut index = 0u32;
        loop {
            let mut device = DISPLAY_DEVICEW {
                cb: std::mem::size_of::<DISPLAY_DEVICEW>() as u32,
                ..Default::default()
            };
            if !EnumDisplayDevicesW(PCWSTR::null(), index, &mut device, 0).as_bool() {
                break;
            }
            index += 1;
            if device.StateFlags.0 & DISPLAY_DEVICE_ATTACHED_TO_DESKTOP.0 == 0 {
                continue;
            }

            let mut mode = DEVMODEW {
                dmSize: std::mem::size_of::<DEVMODEW>() as u16,
                ..Default::default()
            };
            let readable = EnumDisplaySettingsW(
                PCWSTR::from_raw(device.DeviceName.as_ptr()),
                ENUM_CURRENT_SETTINGS,
                &mut mode,
            )
            .as_bool();
            displays.push(DisplayInfo {
                adapter_name: from_wide_lossy(&device.DeviceString),
                width: if readable { mode.dmPelsWidth } else { 0 },
                height: if readable { mode.dmPelsHeight } else { 0 },
                // 0 / 1 表示「硬件默认」，不是真实刷新率
                refresh_rate_hz: (readable && mode.dmDisplayFrequency > 1).then_some(mode.dmDisplayFrequency),
                bits_per_pixel: (readable && mode.dmBitsPerPel > 0).then_some(mode.dmBitsPerPel),
                primary: device.StateFlags.0 & DISPLAY_DEVICE_PRIMARY_DEVICE.0 != 0,
            });
        }
    }
    displays
}

#[cfg(not(target_os = "windows"))]
fn collect_displays() -> Vec<DisplayInfo> {
    Vec::new()
}

/// 系统语言（`Control Panel\International` 的 LocaleName，如 zh-CN）。
#[cfg(target_os = "windows")]
fn current_locale() -> Option<String> {
    use winreg::{RegKey, enums::HKEY_CURRENT_USER};

    RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey("Control Panel\\International")
        .ok()?
        .get_value::<String, _>("LocaleName")
        .ok()
}

#[cfg(not(target_os = "windows"))]
fn current_locale() -> Option<String> {
    None
}

#[cfg(target_os = "windows")]
fn is_elevated() -> bool {
    crate::util::is_elevated().unwrap_or(false)
}

#[cfg(not(target_os = "windows"))]
fn is_elevated() -> bool {
    false
}

/// 下载微软官方 Evergreen 引导安装器到独占临时目录（写入用 create_new，避免被预置文件替换）。
#[cfg(target_os = "windows")]
async fn download_bootstrapper() -> Result<TempInstaller, String> {
    use std::time::{Duration, SystemTime, UNIX_EPOCH};
    use tokio::io::AsyncWriteExt;

    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_nanos())
        .unwrap_or(0);
    let dir = std::env::temp_dir().join(format!("dna-builder-webview2-{}-{stamp}", std::process::id()));
    std::fs::create_dir_all(&dir).map_err(|error| format!("创建临时目录失败: {error}"))?;
    let installer = TempInstaller {
        path: dir.join("MicrosoftEdgeWebview2Setup.exe"),
    };

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|error| format!("创建下载客户端失败: {error}"))?;
    let mut response = client
        .get(WEBVIEW2_BOOTSTRAPPER_URL)
        .send()
        .await
        .map_err(|error| format!("下载安装器失败: {error}"))?;
    if !response.status().is_success() {
        return Err(format!("下载安装器失败: HTTP {}", response.status()));
    }
    if response.content_length().is_some_and(|length| length > MAX_BOOTSTRAPPER_BYTES) {
        return Err("安装器体积异常，已取消安装".to_string());
    }

    let mut file = tokio::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(installer.path())
        .await
        .map_err(|error| format!("写入安装器失败: {error}"))?;
    let mut written = 0u64;
    while let Some(chunk) = response.chunk().await.map_err(|error| format!("读取安装器失败: {error}"))? {
        written += chunk.len() as u64;
        if written > MAX_BOOTSTRAPPER_BYTES {
            return Err("安装器体积异常，已取消安装".to_string());
        }
        file.write_all(&chunk)
            .await
            .map_err(|error| format!("写入安装器失败: {error}"))?;
    }
    file.flush().await.map_err(|error| format!("写入安装器失败: {error}"))?;
    Ok(installer)
}

/// 校验安装器 Authenticode 签名链，防止临时目录中的文件被替换后执行。
#[cfg(target_os = "windows")]
fn verify_authenticode(path: &std::path::Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::Win32::Security::WinTrust::{
        WINTRUST_ACTION_GENERIC_VERIFY_V2, WINTRUST_DATA, WINTRUST_DATA_0, WINTRUST_FILE_INFO, WTD_CHOICE_FILE,
        WTD_REVOKE_NONE, WTD_STATEACTION_CLOSE, WTD_STATEACTION_VERIFY, WTD_UI_NONE, WinVerifyTrust,
    };

    let mut wide: Vec<u16> = path.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
    let mut file_info = WINTRUST_FILE_INFO {
        cbStruct: std::mem::size_of::<WINTRUST_FILE_INFO>() as u32,
        pcwszFilePath: windows::core::PCWSTR(wide.as_mut_ptr()),
        ..Default::default()
    };
    let mut data = WINTRUST_DATA {
        cbStruct: std::mem::size_of::<WINTRUST_DATA>() as u32,
        dwUIChoice: WTD_UI_NONE,
        fdwRevocationChecks: WTD_REVOKE_NONE,
        dwUnionChoice: WTD_CHOICE_FILE,
        Anonymous: WINTRUST_DATA_0 { pFile: &mut file_info },
        dwStateAction: WTD_STATEACTION_VERIFY,
        ..Default::default()
    };
    let mut action = WINTRUST_ACTION_GENERIC_VERIFY_V2;
    let status = unsafe {
        WinVerifyTrust(
            Default::default(),
            &mut action,
            (&mut data as *mut WINTRUST_DATA).cast(),
        )
    };
    data.dwStateAction = WTD_STATEACTION_CLOSE;
    unsafe {
        WinVerifyTrust(
            Default::default(),
            &mut action,
            (&mut data as *mut WINTRUST_DATA).cast(),
        );
    }
    if status != 0 {
        return Err(format!("安装器数字签名校验失败（0x{status:08X}），已取消安装"));
    }
    Ok(())
}

/// 静默运行引导安装器（未提权时为当前用户安装），阻塞等待完成。
#[cfg(target_os = "windows")]
fn run_bootstrapper(installer: &std::path::Path) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    use std::process::{Command, ExitStatus};
    use std::time::{Duration, Instant};

    /// 不弹出控制台窗口
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    let mut child = Command::new(installer)
        .args(["/silent", "/install"])
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|error| format!("启动安装器失败: {error}"))?;

    let deadline = Instant::now() + BOOTSTRAPPER_TIMEOUT;
    let status: ExitStatus = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(500)),
            Ok(None) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("安装超时，请前往官方下载页手动安装".to_string());
            }
            Err(error) => return Err(format!("等待安装器失败: {error}")),
        }
    };
    // 3010 = 安装成功但需要重启，1641 = 安装成功并已安排重启
    match status.code() {
        Some(0) | Some(3010) | Some(1641) => Ok(()),
        code => Err(format!("安装器返回错误码 {}", code.map_or_else(|| "未知".to_string(), |code| code.to_string()))),
    }
}
