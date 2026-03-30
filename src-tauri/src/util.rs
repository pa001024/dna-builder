#![cfg(windows)]
use std::ptr;

use windows::Win32::{
    Foundation::*,
    Security::{GetTokenInformation, TOKEN_ELEVATION, TOKEN_QUERY, TokenElevation},
    System::Threading::{
        GetCurrentProcess, OpenProcess, OpenProcessToken, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION, QueryFullProcessImageNameW,
    },
    UI::{Shell::*, WindowsAndMessaging::*},
};

use crate::submodules::win::get_pid_by_name;

#[derive(thiserror::Error, Debug)]
pub enum Win32Error {
    #[error("sys error:`{0}`")]
    Sys(#[from] windows_core::Error),
    #[error("io error:`{0}`")]
    Io(#[from] std::io::Error),
    // #[error("custom error:`{0}`")]
    // Custom(String),
}

pub fn str_to_pcwstr(s: &str) -> *mut u16 {
    widestring::U16CString::from_str(s).unwrap().into_raw()
}

pub(crate) fn shell_execute_runas(
    lp_file: &str,
    lp_parameters: Option<&str>,
    lp_directory: Option<&str>,
) -> Result<SHELLEXECUTEINFOW, Win32Error> {
    unsafe {
        let file = str_to_pcwstr(lp_file);
        let parameters = lp_parameters.map_or(ptr::null(), |p| str_to_pcwstr(p));
        let directory = lp_directory.map_or(ptr::null(), |d| str_to_pcwstr(d));
        let mut pc: SHELLEXECUTEINFOW = std::mem::zeroed();
        pc.cbSize = std::mem::size_of::<SHELLEXECUTEINFOW>() as u32;
        pc.lpVerb = windows_core::PCWSTR(str_to_pcwstr("runas"));
        pc.lpFile = windows_core::PCWSTR(file);
        pc.lpDirectory = windows_core::PCWSTR(directory);
        pc.lpParameters = windows_core::PCWSTR(parameters);
        pc.nShow = SW_SHOWNORMAL.0;
        pc.fMask = SEE_MASK_FLAG_NO_UI | SEE_MASK_NOCLOSEPROCESS;
        ShellExecuteExW(&mut pc).map_err(|e| Win32Error::Sys(e))?;
        Ok(pc)
    }
}
pub(crate) fn shell_execute(
    lp_file: &str,
    lp_parameters: Option<&str>,
    lp_directory: Option<&str>,
) -> Result<SHELLEXECUTEINFOW, Win32Error> {
    unsafe {
        let file = str_to_pcwstr(lp_file);
        let parameters = lp_parameters.map_or(ptr::null(), |p| str_to_pcwstr(p));
        let directory = lp_directory.map_or(ptr::null(), |d| str_to_pcwstr(d));
        let mut pc: SHELLEXECUTEINFOW = std::mem::zeroed();
        pc.cbSize = std::mem::size_of::<SHELLEXECUTEINFOW>() as u32;
        pc.lpVerb = windows_core::PCWSTR(ptr::null());
        pc.lpFile = windows_core::PCWSTR(file);
        pc.lpDirectory = windows_core::PCWSTR(directory);
        pc.lpParameters = windows_core::PCWSTR(parameters);
        pc.nShow = SW_SHOWNORMAL.0;
        pc.fMask = SEE_MASK_FLAG_NO_UI | SEE_MASK_NOCLOSEPROCESS;
        ShellExecuteExW(&mut pc).map_err(|e| Win32Error::Sys(e))?;
        Ok(pc)
    }
}

pub(crate) fn get_process_exe_path(name: &str) -> Result<Option<String>, Win32Error> {
    let pid = get_pid_by_name(name).unwrap_or(0);
    if pid == 0 {
        return Ok(None);
    }
    unsafe {
        let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE.into(), pid)
            .map_err(|e| Win32Error::Sys(e))?;
        let mut buffer = vec![0u16; 32768];
        let mut len = buffer.len() as u32;
        let ok = QueryFullProcessImageNameW(
            process,
            PROCESS_NAME_WIN32,
            windows_core::PWSTR(buffer.as_mut_ptr()),
            &mut len,
        )
        .map_err(|e| Win32Error::Sys(e));
        let _ = CloseHandle(process);
        if ok.is_err() {
            return Err(Win32Error::Sys(windows_core::Error::from_thread()));
        }
        buffer.truncate(len as usize);
        Ok(Some(String::from_utf16_lossy(&buffer)))
    }
}

/// 检查当前进程是否以管理员权限运行
pub(crate) fn is_elevated() -> Result<bool, Win32Error> {
    unsafe {
        let mut token_handle: HANDLE = INVALID_HANDLE_VALUE;
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token_handle).is_err() {
            return Err(Win32Error::Sys(windows_core::Error::from_thread()));
        }

        let mut elevation = TOKEN_ELEVATION { TokenIsElevated: 0 };
        let mut return_length = 0u32;
        let result = GetTokenInformation(
            token_handle,
            TokenElevation,
            Some(&mut elevation as *mut _ as *mut _),
            std::mem::size_of::<TOKEN_ELEVATION>() as u32,
            &mut return_length,
        );

        let _ = CloseHandle(token_handle);

        if result.is_err() {
            return Err(Win32Error::Sys(windows_core::Error::from_thread()));
        }

        Ok(elevation.TokenIsElevated != 0)
    }
}
