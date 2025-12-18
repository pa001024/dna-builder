use std::{mem::size_of, ptr};
use windows_sys::Win32::{
    Foundation::*,
    System::{
        Diagnostics::ToolHelp::*,
        Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, QueryFullProcessImageNameW},
    },
    UI::{Shell::*, WindowsAndMessaging::*},
};

#[derive(thiserror::Error, Debug)]
pub enum Win32Error {
    #[error("sys error:`{0}`")]
    Sys(#[from] windows_core::Error),
    #[error("io error:`{0}`")]
    Io(#[from] std::io::Error),
    #[error("custom error:`{0}`")]
    Custom(String),
}
fn cwstr(p_text: *const u16) -> String {
    unsafe {
        let len = (0..).take_while(|&i| *p_text.offset(i) != 0).count();
        let slice = std::slice::from_raw_parts(p_text, len);
        let text = String::from_utf16_lossy(slice);
        text
    }
}

pub fn str_to_pcwstr(s: &str) -> *mut u16 {
    widestring::U16CString::from_str(s).unwrap().into_raw()
}
pub(crate) fn get_process_by_name(name: &str) -> Result<u32, Win32Error> {
    unsafe {
        let mut processes: Vec<PROCESSENTRY32W> = Vec::new();
        let snapshot_handle = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);

        if snapshot_handle == INVALID_HANDLE_VALUE {
            return Err(Win32Error::Custom("INVALID_HANDLE_VALUE".to_string()));
        }
        let mut process_entry = std::mem::zeroed::<PROCESSENTRY32W>();
        process_entry.dwSize = size_of::<PROCESSENTRY32W>() as u32;
        let rst = Process32FirstW(snapshot_handle, &mut process_entry);
        if rst == FALSE {
            CloseHandle(snapshot_handle);
            return Err(Win32Error::Sys(windows_core::Error::from_thread()));
        }

        processes.push(process_entry);

        while Process32NextW(snapshot_handle, &mut process_entry) == TRUE {
            processes.push(process_entry);
        }

        CloseHandle(snapshot_handle);

        for process in processes {
            let sz_exe_file = cwstr(&process.szExeFile as *const u16);
            if sz_exe_file == name {
                return Ok(process.th32ProcessID);
            }
        }
    }
    return Ok(0);
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
        pc.lpVerb = str_to_pcwstr("runas");
        pc.lpFile = file;
        pc.lpDirectory = directory;
        pc.lpParameters = parameters;
        pc.nShow = SW_SHOWNORMAL;
        pc.fMask = SEE_MASK_FLAG_NO_UI | SEE_MASK_NOCLOSEPROCESS;
        ShellExecuteExW(&mut pc);
        // let _ = CloseHandle(pc.hProcess);
        // loop {
        // println!("ShellExecuteW: {}", pc.hProcess);
        //     sleep(Duration::from_millis(500));
        //     if pc.hProcess.0 != 0 {
        //         break;
        //     }
        // }
        Ok(pc)
    }
}

pub(crate) fn get_process_exe_path(name: &str) -> Result<Option<String>, Win32Error> {
    let pid = get_process_by_name(name)?;
    if pid == 0 {
        return Ok(None);
    }
    unsafe {
        let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
        if process.is_null() {
            return Err(Win32Error::Sys(windows_core::Error::from_thread()));
        }
        let mut buffer = vec![0u16; 32768];
        let mut len = buffer.len() as u32;
        let ok = QueryFullProcessImageNameW(process, 0, buffer.as_mut_ptr(), &mut len);
        CloseHandle(process);
        if ok == 0 {
            return Err(Win32Error::Sys(windows_core::Error::from_thread()));
        }
        buffer.truncate(len as usize);
        Ok(Some(String::from_utf16_lossy(&buffer)))
    }
}
