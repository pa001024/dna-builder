//! Windows 会话层：TermService、child sessions、凭据预检、会话枚举与孤儿清理。
//!
//! 本模块只做非 COM 的 WTS/Win32 调用，可在任意线程执行；密码只在 `precheck_credentials`
//! 内短暂出现，不落日志、不进 Debug。

use std::ffi::c_void;
use std::time::{Duration, Instant};

use windows::Win32::Foundation::CloseHandle;
use windows::Win32::Foundation::HANDLE;
use windows::Win32::Security::{LOGON32_LOGON_NETWORK, LOGON32_PROVIDER_DEFAULT, LogonUserW};
use windows::Win32::System::RemoteDesktop::{
    WTS_SESSION_INFOW, WTSEnumerateSessionsW, WTSGetChildSessionId, WTSIsChildSessionsEnabled,
    WTSLogoffSession,
};
use windows::Win32::System::Services::{
    CloseServiceHandle, OpenSCManagerW, OpenServiceW, QueryServiceStatusEx, SC_MANAGER_CONNECT,
    SC_STATUS_PROCESS_INFO, SERVICE_QUERY_STATUS, SERVICE_RUNNING, SERVICE_START,
    SERVICE_STATUS_PROCESS, StartServiceW,
};
use windows::Win32::System::SystemInformation::{ComputerNameNetBIOS, GetComputerNameExW};
use windows::Win32::System::WindowsProgramming::GetUserNameW;
use windows::core::{PCWSTR, PWSTR};

/// 名称查询缓冲长度（NetBIOS 名与用户名上限远小于此）。
const NAME_BUFFER: usize = 256;

/// TermService 启动后的最长等待时间。
const SERVICE_START_TIMEOUT: Duration = Duration::from_secs(10);
const SERVICE_POLL_INTERVAL: Duration = Duration::from_millis(250);

/// 解析后的登录身份。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Identity {
    pub user: String,
    pub domain: String,
}

/// 凭据预检失败信息（不含密码）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CredentialFailure {
    pub code: u32,
    pub message: String,
}

impl std::fmt::Display for CredentialFailure {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}（错误码 {}）", self.message, self.code)
    }
}

/// 把 Win32 登录错误码翻译成用户可读文案。
pub fn credential_failure_message(code: u32) -> String {
    match code {
        1326 => "账号或密码错误".to_string(),
        1327 => "账户限制导致无法登录（可能是空密码或登录时段限制）".to_string(),
        1330 => "密码已过期".to_string(),
        1331 => "账户已被禁用".to_string(),
        1385 => "账户没有通过远程登录的权限".to_string(),
        1907 => "首次登录必须先修改密码".to_string(),
        _ => format!("登录验证失败（Win32 错误码 {code}）"),
    }
}

/// 本机 NetBIOS 名：读系统 API，不信任可能被改写的环境变量。
fn machine_name() -> String {
    let mut buffer = [0u16; NAME_BUFFER];
    let mut size = buffer.len() as u32;
    let result = unsafe {
        GetComputerNameExW(
            ComputerNameNetBIOS,
            Some(PWSTR(buffer.as_mut_ptr())),
            &mut size,
        )
    };
    if result.is_err() || size == 0 {
        return String::new();
    }
    String::from_utf16_lossy(&buffer[..size as usize])
}

/// 当前登录用户名：读系统 API，不信任 `USERNAME` 环境变量。
fn current_user_name() -> String {
    let mut buffer = [0u16; NAME_BUFFER];
    let mut size = buffer.len() as u32;
    let result = unsafe { GetUserNameW(Some(PWSTR(buffer.as_mut_ptr())), &mut size) };
    if result.is_err() || size == 0 {
        return String::new();
    }
    // GetUserNameW 的 size 含结尾 NUL
    let length = (size as usize).saturating_sub(1);
    String::from_utf16_lossy(&buffer[..length])
}

/// 解析用户输入：`DOMAIN\user`、`.\user`、`user@domain`、纯用户名。
///
/// 空输入返回 `None`，表示让 RDP 控件使用当前登录身份（自动登录）。
pub fn parse_identity(raw: &str, machine: &str) -> Option<Identity> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    if let Some((domain, user)) = trimmed.split_once('\\') {
        let domain = if domain.is_empty() || domain == "." {
            machine.to_string()
        } else {
            domain.to_string()
        };
        return Some(Identity {
            user: user.trim().to_string(),
            domain,
        });
    }
    if trimmed.contains('@') {
        return Some(Identity {
            user: trimmed.to_string(),
            domain: String::new(),
        });
    }
    Some(Identity {
        user: trimmed.to_string(),
        domain: machine.to_string(),
    })
}

/// 解析界面上输入的账号；空字符串表示自动登录。
pub fn resolve_identity(raw: &str) -> Option<Identity> {
    parse_identity(raw, &machine_name())
}

/// 当前登录身份（空账号但填写了密码时使用，避免密码被静默丢弃）。
pub fn current_identity() -> Identity {
    Identity {
        user: current_user_name(),
        domain: machine_name(),
    }
}

/// 默认账号提示（凭据框占位）。
pub fn default_username_hint() -> String {
    let machine = machine_name();
    let user = current_user_name();
    if machine.is_empty() || user.is_empty() {
        user
    } else {
        format!("{machine}\\{user}")
    }
}

/// 用 NETWORK 登录验证账号密码，只用于连接前给出明确错误。
pub fn precheck_credentials(identity: &Identity, password: &str) -> Result<(), CredentialFailure> {
    let user = wide(&identity.user);
    let domain = wide(&identity.domain);
    let secret = SecretWide::new(password);
    let domain_ptr = if identity.domain.is_empty() {
        PCWSTR::null()
    } else {
        PCWSTR(domain.as_ptr())
    };

    let mut token = HANDLE::default();
    let result = unsafe {
        LogonUserW(
            PCWSTR(user.as_ptr()),
            domain_ptr,
            PCWSTR(secret.as_ptr()),
            LOGON32_LOGON_NETWORK,
            LOGON32_PROVIDER_DEFAULT,
            &mut token,
        )
    };
    match result {
        Ok(()) => {
            let _ = unsafe { CloseHandle(token) };
            Ok(())
        }
        Err(_) => {
            let code = unsafe { windows::Win32::Foundation::GetLastError().0 };
            Err(CredentialFailure {
                code,
                message: credential_failure_message(code),
            })
        }
    }
}

fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(std::iter::once(0)).collect()
}

/// 临时 UTF-16 口令缓冲：丢弃时覆写全部码元，避免在内存中长期残留。
struct SecretWide {
    buffer: Vec<u16>,
}

impl SecretWide {
    fn new(text: &str) -> Self {
        Self {
            buffer: text.encode_utf16().chain(std::iter::once(0)).collect(),
        }
    }

    fn as_ptr(&self) -> *const u16 {
        self.buffer.as_ptr()
    }
}

impl Drop for SecretWide {
    fn drop(&mut self) {
        for unit in self.buffer.iter_mut() {
            *unit = 0;
        }
    }
}

// ---------------------------------------------------------------- services

fn service_state(service: windows::Win32::System::Services::SC_HANDLE) -> Result<u32, String> {
    let mut status = SERVICE_STATUS_PROCESS::default();
    let mut needed = 0u32;
    let buffer = unsafe {
        std::slice::from_raw_parts_mut(
            &mut status as *mut SERVICE_STATUS_PROCESS as *mut u8,
            std::mem::size_of::<SERVICE_STATUS_PROCESS>(),
        )
    };
    unsafe { QueryServiceStatusEx(service, SC_STATUS_PROCESS_INFO, Some(buffer), &mut needed) }
        .map_err(|error| format!("查询 TermService 状态失败: {error}"))?;
    Ok(status.dwCurrentState.0)
}

/// 只读查询 TermService 是否运行。
pub fn term_service_running() -> Result<bool, String> {
    unsafe {
        let scm = OpenSCManagerW(PCWSTR::null(), PCWSTR::null(), SC_MANAGER_CONNECT)
            .map_err(|error| format!("打开服务管理器失败: {error}"))?;
        let service =
            match OpenServiceW(scm, windows::core::w!("TermService"), SERVICE_QUERY_STATUS) {
                Ok(service) => service,
                Err(error) => {
                    let _ = CloseServiceHandle(scm);
                    return Err(format!("打开 TermService 失败: {error}"));
                }
            };
        let state = service_state(service);
        let _ = CloseServiceHandle(service);
        let _ = CloseServiceHandle(scm);
        Ok(state? == SERVICE_RUNNING.0)
    }
}

/// 确保 TermService 处于运行状态（仅启动，不改启动类型）。
pub fn ensure_term_service() -> Result<(), String> {
    // 内层闭包统一返回，外层保证 SCM/Service 句柄在所有路径上都被关闭
    let state = unsafe {
        let scm = OpenSCManagerW(PCWSTR::null(), PCWSTR::null(), SC_MANAGER_CONNECT)
            .map_err(|error| format!("打开服务管理器失败: {error}"))?;
        let service = match OpenServiceW(
            scm,
            windows::core::w!("TermService"),
            SERVICE_QUERY_STATUS | SERVICE_START,
        ) {
            Ok(service) => service,
            Err(error) => {
                let _ = CloseServiceHandle(scm);
                return Err(format!("打开 TermService 失败: {error}"));
            }
        };

        let result = (|| -> Result<u32, String> {
            let mut state = service_state(service)?;
            if state != SERVICE_RUNNING.0 {
                if let Err(error) = StartServiceW(service, None) {
                    let code = windows::Win32::Foundation::GetLastError().0;
                    // 1056 = 服务已在运行，视为成功
                    if code != 1056 {
                        return Err(format!("启动 TermService 失败: {error}（错误码 {code}）"));
                    }
                }
                let deadline = Instant::now() + SERVICE_START_TIMEOUT;
                while Instant::now() < deadline {
                    std::thread::sleep(SERVICE_POLL_INTERVAL);
                    state = service_state(service)?;
                    if state == SERVICE_RUNNING.0 {
                        break;
                    }
                }
            }
            Ok(state)
        })();

        let _ = CloseServiceHandle(service);
        let _ = CloseServiceHandle(scm);
        result?
    };

    if state == SERVICE_RUNNING.0 {
        Ok(())
    } else {
        Err(format!(
            "TermService 未能在限定时间内进入运行状态（当前状态 {state}）"
        ))
    }
}

// ---------------------------------------------------------------- child sessions

/// child sessions 是否已启用。
pub fn child_sessions_enabled() -> bool {
    let mut enabled = windows::core::BOOL(0);
    let _ = unsafe { WTSIsChildSessionsEnabled(&mut enabled) };
    enabled.as_bool()
}

/// 启用 child sessions（系统级开关，成功后保留启用状态）。
pub fn ensure_child_sessions() -> Result<(), String> {
    use windows::Win32::System::RemoteDesktop::WTSEnableChildSessions;

    if child_sessions_enabled() {
        return Ok(());
    }
    let ok = unsafe { WTSEnableChildSessions(true) };
    let code = unsafe { windows::Win32::Foundation::GetLastError().0 };
    if child_sessions_enabled() {
        return Ok(());
    }
    Err(format!(
        "启用子会话失败（WTSEnableChildSessions={}，错误码 {code}），请确认应用以管理员身份运行",
        ok.as_bool()
    ))
}

/// 当前进程所在的 WTS 会话 ID（0 表示查询失败）；用于给投送任务名/清理范围加会话隔离。
pub fn current_session_id() -> u32 {
    let mut session_id = 0u32;
    let ok = unsafe {
        windows::Win32::System::RemoteDesktop::ProcessIdToSessionId(
            std::process::id(),
            &mut session_id,
        )
    };
    if ok.is_ok() { session_id } else { 0 }
}

/// 当前系统的 child session ID；没有时返回 `None`。
pub fn active_child_session_id() -> Option<u32> {
    let mut session_id = 0u32;
    let ok = unsafe { WTSGetChildSessionId(&mut session_id) };
    (ok.as_bool() && session_id != 0).then_some(session_id)
}

/// 会话枚举条目（诊断用）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionEntry {
    pub id: u32,
    pub station: String,
    pub state: i32,
}

/// 枚举所有 WTS 会话；监听会话（65536/65537）由调用方按 ID 过滤。
pub fn enumerate_sessions() -> Vec<SessionEntry> {
    let mut pointer: *mut WTS_SESSION_INFOW = std::ptr::null_mut();
    let mut count = 0u32;
    let mut entries = Vec::new();
    unsafe {
        if WTSEnumerateSessionsW(None, 0, 1, &mut pointer, &mut count).is_ok() {
            for index in 0..count as usize {
                let entry = &*pointer.add(index);
                entries.push(SessionEntry {
                    id: entry.SessionId,
                    station: entry.pWinStationName.to_string().unwrap_or_default(),
                    state: entry.State.0,
                });
            }
            windows::Win32::System::RemoteDesktop::WTSFreeMemory(pointer as *mut c_void);
        }
    }
    entries
}

/// 注销子会话。`WTSLogoffSession` 之后会话会短暂停留在拆除中状态。
pub fn logoff_child_session(session_id: u32) -> Result<(), String> {
    unsafe { WTSLogoffSession(None, session_id, false) }
        .map_err(|error| format!("注销子会话 {session_id} 失败: {error}"))
}

/// 孤儿清理判据：记录值与当前 child session 完全一致时才允许注销。
pub fn should_logoff_orphan(recorded: Option<u32>, current: Option<u32>) -> bool {
    match (recorded, current) {
        (Some(recorded), Some(current)) => recorded == current,
        _ => false,
    }
}

/// 孤儿清理结果：调用方据此决定是否清除持久化标记。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OrphanCleanup {
    /// 没有记录、或记录与当前子会话不一致（会话已消失或不属于本应用）。
    NothingToDo,
    /// 已注销记录的会话。
    LoggedOff(u32),
    /// 注销失败：会话可能仍存活，必须保留标记以便下次重试。
    Failed { session_id: u32, error: String },
}

/// 清理本应用上次残留的 child session。
///
/// 只认设置里记录的 ID，绝不碰其他来源创建的子会话。
pub fn cleanup_orphan(recorded: Option<u32>) -> OrphanCleanup {
    let current = active_child_session_id();
    if !should_logoff_orphan(recorded, current) {
        return OrphanCleanup::NothingToDo;
    }
    let Some(session_id) = recorded else {
        return OrphanCleanup::NothingToDo;
    };
    match logoff_child_session(session_id) {
        Ok(()) => OrphanCleanup::LoggedOff(session_id),
        Err(error) => OrphanCleanup::Failed { session_id, error },
    }
}

/// 启动 TermService 并启用 child sessions（幂等）。
pub fn prepare() -> Result<(), String> {
    ensure_term_service()?;
    ensure_child_sessions()
}

/// 过滤掉 TermService 启动后出现的监听会话。
pub fn is_listen_session(entry: &SessionEntry) -> bool {
    entry.id >= 65536
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_input_means_auto_logon() {
        assert_eq!(parse_identity("", "PC"), None);
        assert_eq!(parse_identity("   ", "PC"), None);
    }

    #[test]
    fn domain_user_is_split() {
        assert_eq!(
            parse_identity(r"WORK\bob", "PC"),
            Some(Identity {
                user: "bob".into(),
                domain: "WORK".into()
            })
        );
    }

    #[test]
    fn dot_domain_resolves_to_machine() {
        assert_eq!(
            parse_identity(r".\bob", "PC"),
            Some(Identity {
                user: "bob".into(),
                domain: "PC".into()
            })
        );
    }

    #[test]
    fn upn_keeps_user_and_empty_domain() {
        assert_eq!(
            parse_identity("bob@example.com", "PC"),
            Some(Identity {
                user: "bob@example.com".into(),
                domain: String::new()
            })
        );
    }

    #[test]
    fn bare_user_uses_machine_domain() {
        assert_eq!(
            parse_identity(" bob ", "PC"),
            Some(Identity {
                user: "bob".into(),
                domain: "PC".into()
            })
        );
    }

    #[test]
    fn orphan_requires_matching_ids() {
        assert!(should_logoff_orphan(Some(4), Some(4)));
        assert!(!should_logoff_orphan(Some(4), Some(5)));
        assert!(!should_logoff_orphan(Some(4), None));
        assert!(!should_logoff_orphan(None, Some(4)));
        assert!(!should_logoff_orphan(None, None));
    }

    #[test]
    fn credential_messages_are_readable() {
        assert!(credential_failure_message(1326).contains("账号或密码错误"));
        assert!(credential_failure_message(9999).contains("9999"));
    }

    #[test]
    fn listen_sessions_are_filtered() {
        assert!(is_listen_session(&SessionEntry {
            id: 65536,
            station: "x".into(),
            state: 0
        }));
        assert!(!is_listen_session(&SessionEntry {
            id: 4,
            station: "x".into(),
            state: 0
        }));
    }
}
