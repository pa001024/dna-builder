//! 内存清理命令：按进程名修剪工作集（仅 Windows 生效）。
//!
//! 只做工作集修剪：把目标进程暂时不用的物理内存页交还系统，不释放虚拟内存，
//! 也不触碰备用/已修改页等系统级缓存。逐个目标独立执行，单个失败不影响其余目标。

use serde::Serialize;

/// 缺省清理目标：启动器与游戏本体（不同安装方式只会命中其一）。
#[cfg(target_os = "windows")]
const DEFAULT_PROCESS_NAMES: &[&str] = &["EM-Win64-Shipping.exe", "EM.exe"];

/// 单个目标的清理结果。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrimItem {
    /// 目标进程 ID
    pub pid: u32,
    /// 目标进程名（快照中的真实名，而非调用方传入的名字）
    pub name: String,
    /// 是否修剪成功（仅查询时恒为 true，表示成功读到占用）
    pub ok: bool,
    /// 当前工作集占用字节数（读取失败时省略）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub working_set_bytes: Option<u64>,
    /// 失败原因（成功时省略）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// 内部标记：本次失败是否因权限不足（不序列化给前端，聚合到 report.needs_elevation）
    #[serde(skip)]
    pub needs_elevation: bool,
}

/// 整体执行状态。
#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TrimStatus {
    /// 至少命中一个目标并已逐个尝试
    Ok,
    /// 未找到任何目标进程，未执行任何操作
    NotRunning,
    /// 当前平台不支持（仅非 Windows 构建会返回）
    #[cfg_attr(target_os = "windows", allow(dead_code))]
    Unsupported,
}

/// 一次清理的完整结果。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrimReport {
    pub status: TrimStatus,
    pub targets: Vec<TrimItem>,
    /// 是否因权限不足而失败（任一目标 OpenProcess/修剪被拒时置位），前端据此提示以管理员重启
    #[serde(default)]
    pub needs_elevation: bool,
}

impl TrimReport {
    /// 仅非 Windows 构建使用
    #[cfg_attr(target_os = "windows", allow(dead_code))]
    fn unsupported() -> Self {
        Self {
            status: TrimStatus::Unsupported,
            targets: Vec::new(),
            needs_elevation: false,
        }
    }
}

/// 返回当前平台是否支持内存清理（仅 Windows 构建为 true）。
///
/// 前端不能用 UA 判平台（桌面端为兼容验证码登录会改 UA），改由后端按编译目标报告。
#[tauri::command]
pub fn mem_clean_supported() -> bool {
    cfg!(target_os = "windows")
}

/// 查询目标进程当前工作集占用，不修剪。
///
/// `process_names` 缺省时使用游戏进程白名单；`include_self` 为 true 时同时包含当前应用自身。
/// 用于前端展示占用与阈值判断，无修改副作用。
#[tauri::command]
pub async fn query_working_set(
    process_names: Option<Vec<String>>,
    include_self: Option<bool>,
) -> Result<TrimReport, String> {
    #[cfg(target_os = "windows")]
    {
        tokio::task::spawn_blocking(move || {
            win_impl::run(process_names, include_self.unwrap_or(false), false)
        })
        .await
        .map_err(|error| format!("内存占用查询失败: {error}"))?
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (process_names, include_self);
        Ok(TrimReport::unsupported())
    }
}

/// 修剪目标进程的工作集。
///
/// `process_names` 缺省时使用游戏进程白名单；传入空数组则只处理 `include_self` 指定的自身进程。
/// `include_self` 为 true 时同时修剪当前应用自身。
/// 单个目标的失败记在 `targets` 里；进程枚举本身失败时返回 `Err`，避免误报 `not_running`。
#[tauri::command]
pub async fn trim_game_working_set(
    process_names: Option<Vec<String>>,
    include_self: Option<bool>,
) -> Result<TrimReport, String> {
    #[cfg(target_os = "windows")]
    {
        // 枚举与逐进程修剪都是阻塞调用，整体移到阻塞线程池，避免卡住主线程事件循环。
        tokio::task::spawn_blocking(move || {
            win_impl::run(process_names, include_self.unwrap_or(false), true)
        })
        .await
        .map_err(|error| format!("内存清理任务执行失败: {error}"))?
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (process_names, include_self);
        Ok(TrimReport::unsupported())
    }
}

#[cfg(target_os = "windows")]
mod win_impl {
    use super::{DEFAULT_PROCESS_NAMES, TrimItem, TrimReport, TrimStatus};
    use windows::Win32::Foundation::{CloseHandle, ERROR_ACCESS_DENIED};
    use windows::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, PROCESSENTRY32W, Process32FirstW, Process32NextW,
        TH32CS_SNAPPROCESS,
    };
    use windows::Win32::System::ProcessStatus::{
        EmptyWorkingSet, GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS,
    };
    use windows::Win32::System::Threading::{
        GetCurrentProcess, OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_SET_QUOTA,
    };

    /// 待修剪的进程条目
    struct Target {
        pid: u32,
        name: String,
    }

    /// 按名单收集全部同名进程（分身/多开副本会同时命中），再按需追加自身进程。
    /// `do_trim` 为 false 时只读工作集占用不修剪。
    pub fn run(
        process_names: Option<Vec<String>>,
        include_self: bool,
        do_trim: bool,
    ) -> Result<TrimReport, String> {
        let names: Vec<String> = match process_names {
            Some(list) => list
                .into_iter()
                .map(|name| name.trim().to_string())
                .filter(|name| !name.is_empty())
                .collect(),
            None => DEFAULT_PROCESS_NAMES
                .iter()
                .map(|name| name.to_string())
                .collect(),
        };

        let mut targets = collect_targets(&names)?;
        if include_self {
            let pid = std::process::id();
            if !targets.iter().any(|target| target.pid == pid) {
                targets.push(Target {
                    pid,
                    name: current_process_name(),
                });
            }
        }

        if targets.is_empty() {
            return Ok(TrimReport {
                status: TrimStatus::NotRunning,
                targets: Vec::new(),
                needs_elevation: false,
            });
        }

        let items: Vec<TrimItem> = targets
            .into_iter()
            .map(|target| handle_one(target.pid, &target.name, do_trim))
            .collect();
        let needs_elevation = items.iter().any(|item| item.needs_elevation);
        Ok(TrimReport {
            status: TrimStatus::Ok,
            targets: items,
            needs_elevation,
        })
    }

    /// 枚举快照中与名单同名（不区分大小写）的所有进程。
    ///
    /// 快照创建与遍历失败都返回 `Err`；`Process32FirstW` 失败表示快照为空，按成功空结果处理；
    /// `Process32NextW` 失败仅在 `ERROR_NO_MORE_FILES` 时视为正常结束，其余错误上报。
    fn collect_targets(names: &[String]) -> Result<Vec<Target>, String> {
        let mut targets = Vec::new();
        if names.is_empty() {
            return Ok(targets);
        }

        let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) }
            .map_err(|error| format!("枚举进程失败: {}", describe(&error)))?;

        let result = (|| -> Result<(), String> {
            let mut entry = PROCESSENTRY32W::default();
            entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
            if unsafe { Process32FirstW(snapshot, &mut entry) }.is_err() {
                return Ok(());
            }
            loop {
                // szExeFile 是定长数组，只解码首个 NUL 之前的部分，避免残留字节污染进程名。
                let len = entry
                    .szExeFile
                    .iter()
                    .position(|&unit| unit == 0)
                    .unwrap_or(entry.szExeFile.len());
                let name = String::from_utf16_lossy(&entry.szExeFile[..len]);
                if !name.is_empty()
                    && names
                        .iter()
                        .any(|candidate| name.eq_ignore_ascii_case(candidate))
                {
                    targets.push(Target {
                        pid: entry.th32ProcessID,
                        name,
                    });
                }
                match unsafe { Process32NextW(snapshot, &mut entry) } {
                    Ok(()) => {}
                    Err(error) if is_enumeration_end(&error) => break,
                    Err(error) => return Err(format!("枚举进程失败: {}", describe(&error))),
                }
            }
            Ok(())
        })();

        // 快照是内核句柄，成功与失败路径都必须显式关闭。
        let _ = unsafe { CloseHandle(snapshot) };
        result.map(|()| targets)
    }

    /// 遍历结束的判定：Tool Help 以 `ERROR_NO_MORE_FILES` 表示已无更多进程。
    fn is_enumeration_end(error: &windows::core::Error) -> bool {
        error.code() == windows::Win32::Foundation::ERROR_NO_MORE_FILES.to_hresult()
    }

    /// 取用户可读的 Win32 错误描述（缺失时回退到带错误码的 Display）。
    fn describe(error: &windows::core::Error) -> String {
        let message = error.message();
        if message.is_empty() {
            format!("{error}")
        } else {
            message
        }
    }

    /// 取当前可执行文件名（自身进程条目展示用）。
    fn current_process_name() -> String {
        std::env::current_exe()
            .ok()
            .and_then(|path| {
                path.file_name()
                    .map(|name| name.to_string_lossy().to_string())
            })
            .unwrap_or_else(|| "dna-builder.exe".to_string())
    }

    /// 读单个进程的工作集占用（字节）；自身进程用伪句柄。
    fn working_set_bytes(pid: u32) -> Result<u64, windows::core::Error> {
        let mut counters = PROCESS_MEMORY_COUNTERS::default();
        if pid == std::process::id() {
            unsafe {
                GetProcessMemoryInfo(
                    GetCurrentProcess(),
                    &mut counters,
                    std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32,
                )
            }?;
            return Ok(counters.WorkingSetSize as u64);
        }
        let handle = unsafe { OpenProcess(PROCESS_QUERY_INFORMATION, false, pid) }?;
        let result = unsafe {
            GetProcessMemoryInfo(
                handle,
                &mut counters,
                std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32,
            )
        };
        let _ = unsafe { CloseHandle(handle) };
        result.map(|()| counters.WorkingSetSize as u64)
    }

    /// 处理单个目标：先读工作集占用，`do_trim` 为 true 时再修剪。
    /// 自身进程直接用伪句柄，避免额外的权限/句柄开销。
    fn handle_one(pid: u32, name: &str, do_trim: bool) -> TrimItem {
        let bytes = working_set_bytes(pid).ok();
        if !do_trim {
            return TrimItem {
                pid,
                name: name.to_string(),
                ok: bytes.is_some(),
                working_set_bytes: bytes,
                error: if bytes.is_some() {
                    None
                } else {
                    Some("读取内存占用失败".to_string())
                },
                needs_elevation: false,
            };
        }

        let result = if pid == std::process::id() {
            unsafe { EmptyWorkingSet(GetCurrentProcess()) }
        } else {
            match unsafe { OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_SET_QUOTA, false, pid) }
            {
                Ok(handle) => {
                    let result = unsafe { EmptyWorkingSet(handle) };
                    let _ = unsafe { CloseHandle(handle) };
                    result
                }
                Err(error) => Err(error),
            }
        };

        match result {
            Ok(()) => TrimItem {
                pid,
                name: name.to_string(),
                ok: true,
                working_set_bytes: bytes,
                error: None,
                needs_elevation: false,
            },
            Err(error) => {
                let denied =
                    error.code() == windows::core::HRESULT::from_win32(ERROR_ACCESS_DENIED.0);
                TrimItem {
                    pid,
                    name: name.to_string(),
                    ok: false,
                    working_set_bytes: bytes,
                    error: Some(describe(&error)),
                    needs_elevation: denied,
                }
            }
        }
    }
}
