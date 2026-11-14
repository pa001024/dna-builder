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
pub struct TrimItem {
    /// 目标进程 ID
    pub pid: u32,
    /// 目标进程名（快照中的真实名，而非调用方传入的名字）
    pub name: String,
    /// 是否修剪成功
    pub ok: bool,
    /// 失败原因（成功时省略）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
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
pub struct TrimReport {
    pub status: TrimStatus,
    pub targets: Vec<TrimItem>,
}

impl TrimReport {
    /// 仅非 Windows 构建使用
    #[cfg_attr(target_os = "windows", allow(dead_code))]
    fn unsupported() -> Self {
        Self {
            status: TrimStatus::Unsupported,
            targets: Vec::new(),
        }
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
            win_impl::trim(process_names, include_self.unwrap_or(false))
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
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, PROCESSENTRY32W, Process32FirstW, Process32NextW,
        TH32CS_SNAPPROCESS,
    };
    use windows::Win32::System::ProcessStatus::EmptyWorkingSet;
    use windows::Win32::System::Threading::{
        GetCurrentProcess, OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_SET_QUOTA,
    };

    /// 待修剪的进程条目
    struct Target {
        pid: u32,
        name: String,
    }

    /// 按名单收集全部同名进程（分身/多开副本会同时命中），再按需追加自身进程。
    pub fn trim(
        process_names: Option<Vec<String>>,
        include_self: bool,
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
            });
        }

        let items = targets
            .into_iter()
            .map(|target| trim_one(target.pid, &target.name))
            .collect();
        Ok(TrimReport {
            status: TrimStatus::Ok,
            targets: items,
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

    /// 修剪单个进程的工作集；自身进程直接用伪句柄，避免额外的权限/句柄开销。
    fn trim_one(pid: u32, name: &str) -> TrimItem {
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
                error: None,
            },
            Err(error) => TrimItem {
                pid,
                name: name.to_string(),
                ok: false,
                error: Some(describe(&error)),
            },
        }
    }
}
