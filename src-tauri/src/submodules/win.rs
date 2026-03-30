use windows::{
    Win32::{
        Foundation::*, Graphics::Gdi::ClientToScreen, System::Diagnostics::ToolHelp::*,
        UI::WindowsAndMessaging::*,
    },
    core::*,
};

/// 根据窗口标题查找窗口句柄
pub(crate) fn find_window(title: &str) -> Option<HWND> {
    let title_wide: Vec<u16> = title.encode_utf16().chain(std::iter::once(0)).collect();
    match unsafe { FindWindowW(PCWSTR::null(), PCWSTR(title_wide.as_ptr())) } {
        Ok(hwnd) => {
            if hwnd.0.is_null() {
                None
            } else {
                Some(hwnd)
            }
        }
        Err(_) => None,
    }
}

pub(crate) fn win_get_client_pos(hwnd: HWND) -> Option<(i32, i32, i32, i32)> {
    let mut rect = RECT::default();
    if unsafe { GetClientRect(hwnd, &mut rect) }.is_ok() {
        let mut point = POINT::default();
        unsafe {
            let _ = ClientToScreen(hwnd, &mut point);
        };
        Some((point.x, point.y, rect.right, rect.bottom))
    } else {
        None
    }
}

pub(crate) fn get_window_by_process_name(process_name: &str) -> Option<HWND> {
    // 1. 获取 PID
    match get_pid_by_name(process_name) {
        Some(pid) => {
            // println!("找到进程 '{}'，PID: {}", process_name, pid);

            // 2. 获取 HWND
            return get_hwnd_by_pid(pid);
        }
        _ => return None,
    }
}

/// 根据进程名查找 PID (不区分大小写)
pub(crate) fn get_pid_by_name(process_name: &str) -> Option<u32> {
    // 创建进程快照
    let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0).ok() }?;

    let mut entry = PROCESSENTRY32W::default();
    entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;

    if unsafe { Process32FirstW(snapshot, &mut entry).is_ok() } {
        loop {
            // 将 WCHAR 数组转换为 Rust String
            // szExeFile 是一个以 null 结尾的 [u16] 数组
            let current_name = String::from_utf16_lossy(&entry.szExeFile);
            let current_name = current_name.trim_matches('\0');

            if current_name.eq_ignore_ascii_case(process_name) {
                let _ = unsafe { CloseHandle(snapshot) };
                return Some(entry.th32ProcessID);
            }

            if !unsafe { Process32NextW(snapshot, &mut entry).is_ok() } {
                break;
            }
        }
    }

    let _ = unsafe { CloseHandle(snapshot) };
    None
}
// 定义一个结构体用于在回调中传递数据
struct EnumData {
    target_pid: u32,
    hwnd: HWND,
}
/// 根据 PID 查找主窗口句柄
fn get_hwnd_by_pid(target_pid: u32) -> Option<HWND> {
    let mut data = EnumData {
        target_pid,
        hwnd: HWND(std::ptr::null_mut()), // 初始化为空句柄
    };

    // 枚举所有顶层窗口
    // EnumWindows 需要一个回调函数，我们传入 data 的指针
    let _ = unsafe {
        EnumWindows(
            Some(enum_windows_callback),
            LPARAM(&mut data as *mut _ as isize),
        )
    };

    if data.hwnd.0 != std::ptr::null_mut() {
        Some(data.hwnd)
    } else {
        None
    }
}

/// EnumWindows 的回调函数
unsafe extern "system" fn enum_windows_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let data = unsafe { &mut *(lparam.0 as *mut EnumData) };

    let mut window_pid = 0;
    // 获取该窗口所属的进程 ID
    unsafe { GetWindowThreadProcessId(hwnd, Some(&mut window_pid)) };

    if window_pid == data.target_pid {
        if unsafe { IsWindowVisible(hwnd).as_bool() } {
            data.hwnd = hwnd;
            return BOOL(0);
        }
    }

    BOOL(1) // 返回 TRUE 继续枚举
}

/// 移动窗口并设置大小
pub(crate) fn move_window(hwnd: HWND, x: i32, y: i32, w: Option<i32>, h: Option<i32>) -> bool {
    unsafe {
        let (width, height) = match (w, h) {
            (Some(w), Some(h)) => (w, h),
            _ => {
                let mut rect = RECT::default();
                if GetWindowRect(hwnd, &mut rect).is_ok() {
                    (rect.right - rect.left, rect.bottom - rect.top)
                } else {
                    return false;
                }
            }
        };

        SetWindowPos(
            hwnd,
            None,
            x,
            y,
            width,
            height,
            SWP_NOZORDER | SWP_NOACTIVATE,
        )
        .is_ok()
    }
}
