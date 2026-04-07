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

/// 按字符串表达式合并当前窗口样式。
///
/// 语法示例：
/// - `+WS_CAPTION`
/// - `-WS_THICKFRAME`
/// - `+WS_EX_LAYERED`
///
/// 其中 `+` 表示按位或，`-` 表示按位清除。
#[cfg(target_os = "windows")]
pub(crate) fn apply_window_style_expression(
    hwnd: HWND,
    expression: &str,
) -> std::result::Result<(i32, i32), String> {
    let expression = expression.trim();
    if expression.is_empty() {
        return Err("窗口样式表达式不能为空".to_string());
    }

    let mut style = unsafe { GetWindowLongW(hwnd, GWL_STYLE) };
    let mut ex_style = unsafe { GetWindowLongW(hwnd, GWL_EXSTYLE) };
    let mut index = 0;
    let bytes = expression.as_bytes();

    while index < bytes.len() {
        while index < bytes.len()
            && matches!(bytes[index], b' ' | b'\t' | b'\r' | b'\n' | b',' | b'|')
        {
            index += 1;
        }
        if index >= bytes.len() {
            break;
        }

        let op = match bytes[index] {
            b'+' => {
                index += 1;
                true
            }
            b'-' => {
                index += 1;
                false
            }
            _ => true,
        };

        while index < bytes.len()
            && matches!(bytes[index], b' ' | b'\t' | b'\r' | b'\n' | b',' | b'|')
        {
            index += 1;
        }

        let start = index;
        while index < bytes.len()
            && !matches!(
                bytes[index],
                b'+' | b'-' | b' ' | b'\t' | b'\r' | b'\n' | b',' | b'|'
            )
        {
            index += 1;
        }

        let name = expression[start..index].trim();
        if name.is_empty() {
            return Err(format!("窗口样式表达式格式无效: {expression}"));
        }

        let (target, mask) = resolve_window_style_mask(name)?;
        if target == 0 {
            if op {
                style |= mask;
            } else {
                style &= !mask;
            }
        } else if op {
            ex_style |= mask;
        } else {
            ex_style &= !mask;
        }
    }

    Ok((style, ex_style))
}

/// 解析单个窗口样式常量名，返回 0 表示 `style`，1 表示 `exStyle`。
#[cfg(target_os = "windows")]
fn resolve_window_style_mask(name: &str) -> std::result::Result<(i32, i32), String> {
    if let Some(mask) = match name {
        "WS_EX_ACCEPTFILES" => Some(WS_EX_ACCEPTFILES.0 as i32),
        "WS_EX_APPWINDOW" => Some(WS_EX_APPWINDOW.0 as i32),
        "WS_EX_CLIENTEDGE" => Some(WS_EX_CLIENTEDGE.0 as i32),
        "WS_EX_COMPOSITED" => Some(WS_EX_COMPOSITED.0 as i32),
        "WS_EX_CONTEXTHELP" => Some(WS_EX_CONTEXTHELP.0 as i32),
        "WS_EX_CONTROLPARENT" => Some(WS_EX_CONTROLPARENT.0 as i32),
        "WS_EX_DLGMODALFRAME" => Some(WS_EX_DLGMODALFRAME.0 as i32),
        "WS_EX_LAYERED" => Some(WS_EX_LAYERED.0 as i32),
        "WS_EX_LAYOUTRTL" => Some(WS_EX_LAYOUTRTL.0 as i32),
        "WS_EX_LEFT" => Some(WS_EX_LEFT.0 as i32),
        "WS_EX_LEFTSCROLLBAR" => Some(WS_EX_LEFTSCROLLBAR.0 as i32),
        "WS_EX_LTRREADING" => Some(WS_EX_LTRREADING.0 as i32),
        "WS_EX_MDICHILD" => Some(WS_EX_MDICHILD.0 as i32),
        "WS_EX_NOACTIVATE" => Some(WS_EX_NOACTIVATE.0 as i32),
        "WS_EX_NOINHERITLAYOUT" => Some(WS_EX_NOINHERITLAYOUT.0 as i32),
        "WS_EX_NOPARENTNOTIFY" => Some(WS_EX_NOPARENTNOTIFY.0 as i32),
        "WS_EX_NOREDIRECTIONBITMAP" => Some(WS_EX_NOREDIRECTIONBITMAP.0 as i32),
        "WS_EX_OVERLAPPEDWINDOW" => Some(WS_EX_OVERLAPPEDWINDOW.0 as i32),
        "WS_EX_PALETTEWINDOW" => Some(WS_EX_PALETTEWINDOW.0 as i32),
        "WS_EX_RIGHT" => Some(WS_EX_RIGHT.0 as i32),
        "WS_EX_RIGHTSCROLLBAR" => Some(WS_EX_RIGHTSCROLLBAR.0 as i32),
        "WS_EX_RTLREADING" => Some(WS_EX_RTLREADING.0 as i32),
        "WS_EX_STATICEDGE" => Some(WS_EX_STATICEDGE.0 as i32),
        "WS_EX_TOOLWINDOW" => Some(WS_EX_TOOLWINDOW.0 as i32),
        "WS_EX_TOPMOST" => Some(WS_EX_TOPMOST.0 as i32),
        "WS_EX_TRANSPARENT" => Some(WS_EX_TRANSPARENT.0 as i32),
        "WS_EX_WINDOWEDGE" => Some(WS_EX_WINDOWEDGE.0 as i32),
        _ => None,
    } {
        return Ok((1, mask));
    }

    match name {
        "WS_ACTIVECAPTION" => Ok((0, WS_ACTIVECAPTION.0 as i32)),
        "WS_BORDER" => Ok((0, WS_BORDER.0 as i32)),
        "WS_CAPTION" => Ok((0, WS_CAPTION.0 as i32)),
        "WS_CHILD" => Ok((0, WS_CHILD.0 as i32)),
        "WS_CHILDWINDOW" => Ok((0, WS_CHILDWINDOW.0 as i32)),
        "WS_CLIPCHILDREN" => Ok((0, WS_CLIPCHILDREN.0 as i32)),
        "WS_CLIPSIBLINGS" => Ok((0, WS_CLIPSIBLINGS.0 as i32)),
        "WS_DISABLED" => Ok((0, WS_DISABLED.0 as i32)),
        "WS_DLGFRAME" => Ok((0, WS_DLGFRAME.0 as i32)),
        "WS_GROUP" => Ok((0, WS_GROUP.0 as i32)),
        "WS_HSCROLL" => Ok((0, WS_HSCROLL.0 as i32)),
        "WS_ICONIC" => Ok((0, WS_ICONIC.0 as i32)),
        "WS_MAXIMIZE" => Ok((0, WS_MAXIMIZE.0 as i32)),
        "WS_MAXIMIZEBOX" => Ok((0, WS_MAXIMIZEBOX.0 as i32)),
        "WS_MINIMIZE" => Ok((0, WS_MINIMIZE.0 as i32)),
        "WS_MINIMIZEBOX" => Ok((0, WS_MINIMIZEBOX.0 as i32)),
        "WS_OVERLAPPED" => Ok((0, WS_OVERLAPPED.0 as i32)),
        "WS_OVERLAPPEDWINDOW" => Ok((0, WS_OVERLAPPEDWINDOW.0 as i32)),
        "WS_POPUP" => Ok((0, WS_POPUP.0 as i32)),
        "WS_POPUPWINDOW" => Ok((0, WS_POPUPWINDOW.0 as i32)),
        "WS_SIZEBOX" => Ok((0, WS_SIZEBOX.0 as i32)),
        "WS_SYSMENU" => Ok((0, WS_SYSMENU.0 as i32)),
        "WS_TABSTOP" => Ok((0, WS_TABSTOP.0 as i32)),
        "WS_THICKFRAME" => Ok((0, WS_THICKFRAME.0 as i32)),
        "WS_TILED" => Ok((0, WS_TILED.0 as i32)),
        "WS_TILEDWINDOW" => Ok((0, WS_TILEDWINDOW.0 as i32)),
        "WS_VISIBLE" => Ok((0, WS_VISIBLE.0 as i32)),
        "WS_VSCROLL" => Ok((0, WS_VSCROLL.0 as i32)),
        _ => Err(format!("未知窗口样式常量: {name}")),
    }
}

/// 修改窗口样式，直接写入完整样式位掩码。
#[cfg(target_os = "windows")]
pub(crate) fn set_window_style(
    hwnd: HWND,
    style: i32,
    ex_style: Option<i32>,
) -> std::result::Result<(), String> {
    unsafe {
        use windows::Win32::Graphics::Gdi::UpdateWindow;

        let _ = SetWindowLongPtrW(hwnd, GWL_STYLE, style as isize);
        if let Some(ex_style) = ex_style {
            let _ = SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex_style as isize);
        }
        SetWindowPos(
            hwnd,
            None,
            0,
            0,
            0,
            0,
            SWP_NOMOVE
                | SWP_NOSIZE
                | SWP_NOACTIVATE
                | SWP_NOOWNERZORDER
                | SWP_NOZORDER
                | SWP_FRAMECHANGED,
        )
        .map_err(|error| format!("刷新窗口样式失败: {error}"))?;
        let _ = UpdateWindow(hwnd);
    }

    Ok(())
}

/// 非 Windows 平台下的窗口样式修改兜底实现。
#[cfg(not(target_os = "windows"))]
pub(crate) fn set_window_style(
    _hwnd: HWND,
    _style: i32,
    _ex_style: Option<i32>,
) -> std::result::Result<(), String> {
    Err("当前平台不支持修改窗口样式".to_string())
}

/// 非 Windows 平台下的窗口样式表达式合并兜底实现。
#[cfg(not(target_os = "windows"))]
pub(crate) fn apply_window_style_expression(
    _hwnd: HWND,
    _expression: &str,
) -> std::result::Result<(i32, i32), String> {
    Err("当前平台不支持解析窗口样式表达式".to_string())
}
