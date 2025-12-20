use std::mem::size_of;
use windows_sys::Win32::{Foundation::*, System::Diagnostics::ToolHelp::*};

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
