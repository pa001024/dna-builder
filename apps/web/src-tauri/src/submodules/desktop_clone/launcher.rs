//! 控制中心投送：通过 Task Scheduler 注册临时任务并用 `RunEx(TASK_RUN_USE_SESSION_ID)`
//! 把用户配置的程序启动到子会话里（普通 / 管理员两种 RunLevel）。
//!
//! Task Scheduler 是本地 RPC 服务，能跨会话启动进程；COM 在专用 MTA 线程里使用，
//! 不占用主线程，也不与控件 COM 共享线程。

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use base64::Engine;
use windows::Win32::Foundation::{VARIANT_FALSE, VARIANT_TRUE};
use windows::Win32::Storage::FileSystem::GetDriveTypeW;
use windows::Win32::System::Com::{
    CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED, CoCreateInstance, CoInitializeEx, CoUninitialize,
};
use windows::Win32::System::TaskScheduler::{
    IExecAction, ITaskFolder, ITaskService, TASK_ACTION_EXEC, TASK_CREATE_OR_UPDATE,
    TASK_ENUM_HIDDEN, TASK_INSTANCES_IGNORE_NEW, TASK_LOGON_INTERACTIVE_TOKEN,
    TASK_RUN_USE_SESSION_ID, TASK_RUNLEVEL_LUA,
};
use windows::Win32::System::Variant::VARIANT;
use windows::Win32::System::WindowsProgramming::DRIVE_REMOTE;
use windows::core::{BSTR, GUID, Interface, PCWSTR};

use super::settings::CloneProgram;

const CLSID_TASK_SCHEDULER: GUID = GUID::from_u128(0x0f87369f_a4e5_4cfc_bd3e_73e6154572dd);
const TASK_PREFIX: &str = "dna-builder-desktop-clone";
const LAUNCH_TIMEOUT: Duration = Duration::from_secs(20);
/// 提权投送通过子会话内的 PowerShell 触发 UAC，而不是静默 HIGHEST。
const POWERSHELL_RELATIVE: &str = r"WindowsPowerShell\v1.0\powershell.exe";

static TASK_COUNTER: AtomicU64 = AtomicU64::new(1);
static TASKS: Mutex<Vec<String>> = Mutex::new(Vec::new());
static LAST_RESULT: Mutex<Option<String>> = Mutex::new(None);

/// 临时任务名：前缀 + 归属会话 + 进程号 + 序号，避免与其他用户/实例的任务冲突。
pub fn task_name(owner_session: u32, process_id: u32, sequence: u64) -> String {
    format!("{TASK_PREFIX}-{owner_session}-{process_id}-{sequence}")
}

/// 本进程残留任务的匹配前缀（只清理自己所在会话里创建的任务）。
fn task_prefix_for(owner_session: u32) -> String {
    format!("{TASK_PREFIX}-{owner_session}-")
}

fn is_network_text(text: &str) -> bool {
    text.starts_with(r"\\") || text.starts_with("//")
}

/// 规范化后的路径仍是 UNC、或盘符映射到网络共享，都视为网络路径。
///
/// `canonicalize` 在 Windows 上返回 `\\?\C:\...` 扩展路径，必须先剥掉前缀再判断，
/// 否则所有本地程序都会被误认为 UNC。
fn is_network_path(path: &Path) -> bool {
    let text = path.to_string_lossy();
    let text = text.strip_prefix(r"\\?\").unwrap_or(&text);
    if text.starts_with(r"UNC\") || is_network_text(text) {
        return true;
    }
    let has_drive_letter = text.as_bytes().get(1).is_some_and(|byte| *byte == b':');
    if !has_drive_letter {
        return false;
    }
    let root: Vec<u16> = format!("{}\\", &text[..2])
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();
    unsafe { GetDriveTypeW(PCWSTR(root.as_ptr())) == DRIVE_REMOTE }
}

/// 去掉 `canonicalize` 加上的 `\\?\` 前缀（Task Scheduler 对扩展长度路径支持不一致）。
fn display_path(path: &Path) -> PathBuf {
    let text = path.to_string_lossy();
    match text.strip_prefix(r"\\?\") {
        Some(trimmed) => PathBuf::from(trimmed),
        None => path.to_path_buf(),
    }
}

/// 校验程序配置：绝对路径、存在、`.exe`，且规范化后不是网络位置。
///
/// 直接拒绝原始 UNC 还不够：映射盘与 reparse point 可以绕过，因此先
/// `canonicalize` 解析真实路径，再按驱动器类型判断。
pub fn validate_program(program: &CloneProgram) -> Result<PathBuf, String> {
    let raw = program.path.trim();
    if raw.is_empty() {
        return Err(format!("程序「{}」未配置路径", program.name));
    }
    let path = Path::new(raw);
    if !path.is_absolute() {
        return Err(format!("程序路径必须是绝对路径：{raw}"));
    }
    // 拒绝 UNC / 网络路径：管理员投送时可能执行远端共享上的程序
    if is_network_text(raw) {
        return Err(format!("不允许投送网络路径程序：{raw}"));
    }
    let canonical = std::fs::canonicalize(path)
        .map_err(|error| format!("无法解析程序路径（{}）：{error}", path.display()))?;
    if is_network_path(&canonical) {
        return Err(format!("不允许投送网络路径程序：{raw}"));
    }
    if !canonical.is_file() {
        return Err(format!("程序不存在：{}", path.display()));
    }
    let is_executable = canonical
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("exe"));
    if !is_executable {
        return Err(format!("只支持 .exe 程序：{}", path.display()));
    }
    Ok(display_path(&canonical))
}

/// 转义 PowerShell 单引号字符串。
fn escape_single_quotes(text: &str) -> String {
    text.replace('\'', "''")
}

/// 生成在子会话内触发 UAC 的 PowerShell 脚本（`-EncodedCommand` 形式）。
fn elevated_arguments(path: &Path, arguments: &str) -> String {
    let mut script = format!(
        "Start-Process -FilePath '{}'",
        escape_single_quotes(&path.display().to_string())
    );
    if !arguments.trim().is_empty() {
        script.push_str(&format!(
            " -ArgumentList '{}'",
            escape_single_quotes(arguments.trim())
        ));
    }
    script.push_str(" -Verb RunAs");
    let bytes: Vec<u8> = script
        .encode_utf16()
        .flat_map(|unit| unit.to_le_bytes())
        .collect();
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

fn powershell_path() -> Result<PathBuf, String> {
    let path = super::capability::system32_path(POWERSHELL_RELATIVE);
    if path.is_file() {
        Ok(path)
    } else {
        Err("系统缺少 PowerShell，无法在子会话内发起提权确认".to_string())
    }
}

/// 在指定子会话内启动程序；返回任务名。
pub fn launch(program: &CloneProgram, session_id: u32) -> Result<String, String> {
    let path = validate_program(program)?;
    if session_id == 0 {
        return Err("子会话尚未就绪，无法投送程序".to_string());
    }
    let owner_session = super::session::current_session_id();
    let name = task_name(
        owner_session,
        std::process::id(),
        TASK_COUNTER.fetch_add(1, Ordering::SeqCst),
    );
    let arguments = program.args.trim().to_string();
    let working_directory = path
        .parent()
        .map(|directory| directory.display().to_string())
        .unwrap_or_default();
    let elevated = program.elevated;
    // 提权条目绝不使用 TASK_RUNLEVEL_HIGHEST：那等于让配置文件里的任意 exe 静默提权。
    // 改为 LUA 任务启动 PowerShell，由 `-Verb RunAs` 在子会话内弹出 UAC。
    let (action_path, action_arguments) = if elevated {
        (powershell_path()?, elevated_arguments(&path, &arguments))
    } else {
        (path, arguments)
    };
    let task = name.clone();

    let result = with_com(move || {
        register_and_run(
            &task,
            &action_path,
            &action_arguments,
            &working_directory,
            session_id,
        )
    });

    match &result {
        Ok(task) => {
            TASKS
                .lock()
                .unwrap_or_else(|error| error.into_inner())
                .push(task.clone());
            record(format!(
                "{task} → 会话 {session_id}（{}）",
                if elevated {
                    "管理员：子会话内需确认 UAC"
                } else {
                    "普通"
                }
            ));
        }
        Err(error) => record(format!("失败: {error}")),
    }
    result
}

/// 清理崩溃/异常退出后残留的临时任务（启动时调用）。
///
/// 只清理本进程所在 WTS 会话里创建的任务，避免误删其他用户会话的实例。
pub fn cleanup_stale_tasks() {
    let owner_session = super::session::current_session_id();
    if let Err(error) = with_com(move || cleanup_stale_tasks_inner(owner_session)) {
        eprintln!("[desktop-clone] 清理残留投送任务失败: {error}");
    }
}

fn cleanup_stale_tasks_inner(owner_session: u32) -> Result<(), String> {
    let prefix = task_prefix_for(owner_session);
    let service = connect_service()?;
    let folder = root_folder(&service)?;
    let tasks = unsafe { folder.GetTasks(TASK_ENUM_HIDDEN.0) }
        .map_err(|error| format!("枚举任务失败: {error}"))?;
    let count = unsafe { tasks.Count() }.map_err(|error| format!("统计任务失败: {error}"))?;
    for index in 1..=count {
        let Ok(task) = (unsafe { tasks.get_Item(&VARIANT::from(index)) }) else {
            continue;
        };
        let Ok(name) = (unsafe { task.Name() }) else {
            continue;
        };
        let name = name.to_string();
        if name.starts_with(&prefix) {
            unsafe {
                let _ = folder.DeleteTask(&BSTR::from(name.as_str()), 0);
            }
        }
    }
    Ok(())
}

/// 删除本进程注册过的全部临时任务（关闭会话 / 退出时调用）。
pub fn cleanup_all() {
    let names: Vec<String> = {
        let mut guard = TASKS.lock().unwrap_or_else(|error| error.into_inner());
        std::mem::take(&mut *guard)
    };
    if names.is_empty() {
        return;
    }
    let _ = with_com(move || {
        delete_tasks(&names);
        Ok(())
    });
}

/// 最近一次投送结果（诊断用，不含程序参数以外的敏感内容）。
pub fn diagnostics() -> String {
    let last = LAST_RESULT
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .clone()
        .unwrap_or_else(|| "无".to_string());
    let pending = TASKS
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .len();
    format!("程序投送: 最近 {last}；临时任务 {pending} 个")
}

fn record(message: String) {
    eprintln!("[desktop-clone] 投送 {message}");
    *LAST_RESULT
        .lock()
        .unwrap_or_else(|error| error.into_inner()) = Some(message);
}

// ---------------------------------------------------------------- COM plumbing

/// 在专用 MTA 线程执行 COM 调用；`CoInitializeEx` 后必须配对 `CoUninitialize`。
fn with_com<T, F>(task: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    let (sender, receiver) = std::sync::mpsc::channel();
    std::thread::Builder::new()
        .name("desktop-clone-launcher".to_string())
        .spawn(move || {
            let result = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
            let output = if result.is_ok() {
                task()
            } else {
                Err(format!(
                    "CoInitializeEx 失败（HRESULT 0x{:08X}）",
                    result.0 as u32
                ))
            };
            if result.is_ok() {
                unsafe { CoUninitialize() };
            }
            let _ = sender.send(output);
        })
        .map_err(|error| format!("启动投送线程失败: {error}"))?;
    receiver
        .recv_timeout(LAUNCH_TIMEOUT)
        .map_err(|_| "投送程序超时".to_string())?
}

fn connect_service() -> Result<ITaskService, String> {
    unsafe {
        let service: ITaskService =
            CoCreateInstance(&CLSID_TASK_SCHEDULER, None, CLSCTX_INPROC_SERVER)
                .map_err(|error| format!("连接 Task Scheduler 失败: {error}"))?;
        service
            .Connect(
                &VARIANT::default(),
                &VARIANT::default(),
                &VARIANT::default(),
                &VARIANT::default(),
            )
            .map_err(|error| format!("Task Scheduler 登录失败: {error}"))?;
        Ok(service)
    }
}

fn root_folder(service: &ITaskService) -> Result<ITaskFolder, String> {
    unsafe { service.GetFolder(&BSTR::from("\\")) }
        .map_err(|error| format!("打开任务根目录失败: {error}"))
}

fn register_and_run(
    name: &str,
    path: &Path,
    arguments: &str,
    working_directory: &str,
    session_id: u32,
) -> Result<String, String> {
    let service = connect_service()?;
    let folder = root_folder(&service)?;
    let task_name = BSTR::from(name);
    unsafe {
        let _ = folder.DeleteTask(&task_name, 0);
    }

    let definition =
        unsafe { service.NewTask(0) }.map_err(|error| format!("创建任务定义失败: {error}"))?;

    let principal =
        unsafe { definition.Principal() }.map_err(|error| format!("读取任务身份失败: {error}"))?;
    unsafe {
        principal
            .SetLogonType(TASK_LOGON_INTERACTIVE_TOKEN)
            .map_err(|error| format!("设置登录类型失败: {error}"))?;
        // 一律 LUA：提权由子会话内的 PowerShell 发起 UAC，绝不静默 HIGHEST
        principal
            .SetRunLevel(TASK_RUNLEVEL_LUA)
            .map_err(|error| format!("设置运行级别失败: {error}"))?;
    }

    let settings =
        unsafe { definition.Settings() }.map_err(|error| format!("读取任务设置失败: {error}"))?;
    unsafe {
        settings
            .SetDisallowStartIfOnBatteries(VARIANT_FALSE)
            .map_err(|error| format!("设置电源策略失败: {error}"))?;
        settings
            .SetStopIfGoingOnBatteries(VARIANT_FALSE)
            .map_err(|error| format!("设置电源策略失败: {error}"))?;
        // PT0S = 不限制执行时长
        settings
            .SetExecutionTimeLimit(&BSTR::from("PT0S"))
            .map_err(|error| format!("设置执行时限失败: {error}"))?;
        settings
            .SetMultipleInstances(TASK_INSTANCES_IGNORE_NEW)
            .map_err(|error| format!("设置多实例策略失败: {error}"))?;
        settings
            .SetEnabled(VARIANT_TRUE)
            .map_err(|error| format!("启用任务失败: {error}"))?;
    }

    let actions =
        unsafe { definition.Actions() }.map_err(|error| format!("读取任务动作失败: {error}"))?;
    let action: IExecAction = unsafe { actions.Create(TASK_ACTION_EXEC) }
        .map_err(|error| format!("创建任务动作失败: {error}"))?
        .cast()
        .map_err(|error| format!("任务动作类型不符: {error}"))?;
    unsafe {
        action
            .SetPath(&BSTR::from(path.display().to_string()))
            .map_err(|error| format!("设置程序路径失败: {error}"))?;
        if !arguments.is_empty() {
            action
                .SetArguments(&BSTR::from(arguments))
                .map_err(|error| format!("设置程序参数失败: {error}"))?;
        }
        if !working_directory.is_empty() {
            action
                .SetWorkingDirectory(&BSTR::from(working_directory))
                .map_err(|error| format!("设置工作目录失败: {error}"))?;
        }
    }

    let registered = unsafe {
        folder.RegisterTaskDefinition(
            &task_name,
            &definition,
            TASK_CREATE_OR_UPDATE.0,
            &VARIANT::default(),
            &VARIANT::default(),
            TASK_LOGON_INTERACTIVE_TOKEN,
            &VARIANT::default(),
        )
    };
    let registered = match registered {
        Ok(task) => task,
        Err(error) => {
            unsafe {
                let _ = folder.DeleteTask(&task_name, 0);
            }
            return Err(format!("注册任务失败: {error}"));
        }
    };

    let run = unsafe {
        registered.RunEx(
            &VARIANT::default(),
            TASK_RUN_USE_SESSION_ID.0,
            session_id as i32,
            &BSTR::new(),
        )
    };
    if let Err(error) = run {
        unsafe {
            let _ = folder.DeleteTask(&task_name, 0);
        }
        return Err(format!(
            "在会话 {session_id} 启动程序失败: {error}（任务已回滚）"
        ));
    }
    Ok(name.to_string())
}

fn delete_tasks(names: &[String]) {
    let Ok(service) = connect_service() else {
        return;
    };
    let Ok(folder) = root_folder(&service) else {
        return;
    };
    for name in names {
        unsafe {
            let _ = folder.DeleteTask(&BSTR::from(name.as_str()), 0);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn program(path: &str) -> CloneProgram {
        CloneProgram {
            id: "p".into(),
            name: "程序".into(),
            path: path.into(),
            args: String::new(),
            elevated: false,
        }
    }

    #[test]
    fn task_names_are_unique_and_namespaced() {
        assert_eq!(task_name(3, 42, 1), "dna-builder-desktop-clone-3-42-1");
        assert_ne!(task_name(3, 42, 1), task_name(3, 42, 2));
        assert_ne!(task_name(3, 42, 1), task_name(3, 43, 1));
        assert_ne!(task_name(3, 42, 1), task_name(4, 42, 1));
    }

    #[test]
    fn stale_cleanup_is_scoped_to_the_current_session() {
        let prefix = task_prefix_for(3);
        assert!(task_name(3, 42, 1).starts_with(&prefix));
        assert!(!task_name(4, 42, 1).starts_with(&prefix));
    }

    #[test]
    fn elevated_arguments_wrap_the_program_and_trigger_uac() {
        let encoded = elevated_arguments(Path::new(r"C:\Tools\app.exe"), "-x 'y'");
        let script = String::from_utf16(
            &base64::engine::general_purpose::STANDARD
                .decode(encoded)
                .unwrap()
                .chunks(2)
                .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
                .collect::<Vec<u16>>(),
        )
        .unwrap();
        assert!(script.contains(r"Start-Process -FilePath 'C:\Tools\app.exe'"));
        assert!(script.contains(r"-ArgumentList '-x ''y'''"));
        assert!(script.ends_with("-Verb RunAs"));
    }

    #[test]
    fn validation_rejects_missing_and_relative_paths() {
        assert!(validate_program(&program("")).is_err());
        assert!(validate_program(&program("notepad.exe")).is_err());
        assert!(validate_program(&program(r"C:\definitely-missing\dna-clone.exe")).is_err());
    }

    #[test]
    fn validation_rejects_network_paths() {
        assert!(validate_program(&program(r"\\server\share\tool.exe")).is_err());
        assert!(validate_program(&program("//server/share/tool.exe")).is_err());
    }

    #[test]
    fn extended_local_paths_are_not_network_paths() {
        // canonicalize 返回的扩展前缀不能被当成 UNC
        assert!(!is_network_path(Path::new(
            r"\\?\C:\Windows\System32\notepad.exe"
        )));
        assert!(is_network_path(Path::new(r"\\?\UNC\server\share\tool.exe")));
        assert!(is_network_path(Path::new(r"\\server\share\tool.exe")));
    }

    #[test]
    fn validation_accepts_existing_exe() {
        let exe = std::env::var("SystemRoot").unwrap_or_else(|_| r"C:\Windows".to_string());
        let notepad = format!(r"{exe}\System32\notepad.exe");
        let path = validate_program(&program(&notepad)).unwrap();
        assert!(path.ends_with("notepad.exe"));
    }

    #[test]
    fn validation_rejects_non_exe() {
        let root = std::env::var("SystemRoot").unwrap_or_else(|_| r"C:\Windows".to_string());
        let ini = format!(r"{root}\System32\drivers\etc\hosts");
        // 某些系统上 hosts 不存在；只断言“不是 exe 时被拒绝”这一条路径
        let result = validate_program(&program(&ini));
        assert!(result.is_err());
    }
}
