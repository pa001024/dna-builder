use windows::Win32::{
    Foundation::{HWND, LPARAM, POINT, WPARAM},
    Graphics::Gdi::{ClientToScreen, ScreenToClient},
    System::Threading::{AttachThreadInput, GetCurrentThreadId},
    UI::{Input::KeyboardAndMouse::*, WindowsAndMessaging::*},
};

/// 鼠标按键类型。
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MouseButtonKind {
    Left,
    Right,
    Middle,
    X1,
    X2,
}

/// 将扩展按键类型转换为 Win32 XBUTTON 常量。
fn xbutton_flag(button: MouseButtonKind) -> u16 {
    match button {
        MouseButtonKind::X1 => XBUTTON1,
        MouseButtonKind::X2 => XBUTTON2,
        _ => 0,
    }
}
#[allow(unused)]
pub fn key_to_vkey(key: &str) -> u16 {
    match key.to_lowercase().as_str() {
        "a" => 0x41,
        "b" => 0x42,
        "c" => 0x43,
        "d" => 0x44,
        "e" => 0x45,
        "f" => 0x46,
        "g" => 0x47,
        "h" => 0x48,
        "i" => 0x49,
        "j" => 0x4A,
        "k" => 0x4B,
        "l" => 0x4C,
        "m" => 0x4D,
        "n" => 0x4E,
        "o" => 0x4F,
        "p" => 0x50,
        "q" => 0x51,
        "r" => 0x52,
        "s" => 0x53,
        "t" => 0x54,
        "u" => 0x55,
        "v" => 0x56,
        "w" => 0x57,
        "x" => 0x58,
        "y" => 0x59,
        "z" => 0x5A,
        "0" => 0x30,
        "1" => 0x31,
        "2" => 0x32,
        "3" => 0x33,
        "4" => 0x34,
        "5" => 0x35,
        "6" => 0x36,
        "7" => 0x37,
        "8" => 0x38,
        "9" => 0x39,
        "space" => 0x20,
        "enter" => 0x0D,
        "backspace" => 0x08,
        "esc" => 0x1B,
        "escape" => 0x1B,
        "left" => 0x25,
        "up" => 0x26,
        "right" => 0x27,
        "down" => 0x28,
        "shift" => 0xA0,
        "lshift" => 0xA0,
        "rshift" => 0xA1,
        "ctrl" => 0xA2,
        "lctrl" => 0xA2,
        "rctrl" => 0xA3,
        "alt" => 0xA4,
        "lalt" => 0xA4,
        "ralt" => 0xA5,
        "tab" => 0x09,
        "capslock" => 0x14,
        "numlock" => 0x90,
        "scrolllock" => 0x91,
        "printscreen" => 0x2C,
        "insert" => 0x2D,
        "del" => 0x2E,
        "delete" => 0x2E,
        "home" => 0x24,
        "end" => 0x23,
        "pageup" => 0x21,
        "pagedown" => 0x22,
        "f1" => 0x70,
        "f2" => 0x71,
        "f3" => 0x72,
        "f4" => 0x73,
        "f5" => 0x74,
        "f6" => 0x75,
        "f7" => 0x76,
        "f8" => 0x77,
        "f9" => 0x78,
        "f10" => 0x79,
        "f11" => 0x7A,
        "f12" => 0x7B,
        "lwin" => 0x5B,
        "rwin" => 0x5C,
        "apps" => 0x5D,
        "media_next_track" => 0xB0,
        "media_prev_track" => 0xB1,
        "media_play_pause" => 0xB3,
        "media_stop" => 0xB2,
        "volume_mute" => 0xAD,
        "volume_down" => 0xAE,
        "volume_up" => 0xAF,
        "media_select" => 0xB5,
        "browser_back" => 0xA6,
        "browser_forward" => 0xA7,
        "browser_refresh" => 0xA8,
        "browser_stop" => 0xA9,
        "browser_search" => 0xAA,
        "browser_favorites" => 0xAB,
        "browser_home" => 0xAC,
        "launch_mail" => 0xB4,
        "launch_media_select" => 0xB6,
        "launch_app1" => 0xB7,
        "launch_app2" => 0xB8,
        _ => 0,
    }
}

#[allow(unused)]
pub fn key_down(key: u16) {
    unsafe {
        keybd_event(
            key as u8,
            0,
            windows::Win32::UI::Input::KeyboardAndMouse::KEYBD_EVENT_FLAGS(0),
            0,
        )
    }
}

#[allow(unused)]
pub fn key_up(key: u16) {
    unsafe { keybd_event(key as u8, 0, KEYEVENTF_KEYUP, 0) }
}

#[allow(unused)]
pub fn key_press(key: &str, duration: u32) {
    let vkey = key_to_vkey(key);
    if vkey == 0 {
        panic!("无效的按键: {}", key);
    }
    key_down(vkey);
    if duration > 0 {
        sleep(duration);
    }
    key_up(vkey);
}

/// 组合键
#[allow(unused)]
pub fn combo_key_press(keys: &[&str], duration: u32) {
    let ve = keys
        .iter()
        .map(|key| key_to_vkey(key))
        .filter(|key| *key != 0)
        .collect::<Vec<u16>>();
    let vkeys = ve.as_slice();
    for &vkey in vkeys {
        key_down(vkey);
    }
    if duration > 0 {
        sleep(duration);
    }
    for &vkey in vkeys.iter().rev() {
        key_up(vkey);
    }
}

/// 鼠标移动 (绝对坐标)
pub fn mouse_move_to(x: i32, y: i32) {
    unsafe {
        // 移动鼠标
        mouse_event(
            MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE,
            (x << 16) / GetSystemMetrics(SM_CXSCREEN),
            (y << 16) / GetSystemMetrics(SM_CYSCREEN),
            0,
            0,
        )
    };
}

/// 缓动函数 - easeOutQuart
fn ease_out_quart(t: f64) -> f64 {
    1. - (1. - t).powi(4)
}

/// 鼠标移动 (绝对坐标，带缓动，异步）
pub async fn mouse_move_to_eased(
    start_x: i32,
    start_y: i32,
    end_x: i32,
    end_y: i32,
    duration_ms: u32,
) {
    if duration_ms == 0 {
        mouse_move_to(end_x, end_y);
        return;
    }

    // 根据时间动态计算 steps（每秒60次）
    let steps = ((duration_ms as f64) * 60.0 / 1000.0).max(1.0) as i32;

    let dx = end_x as f64 - start_x as f64;
    let dy = end_y as f64 - start_y as f64;

    let start_time = tokio::time::Instant::now();
    let target_duration = tokio::time::Duration::from_millis(duration_ms as u64);

    for i in 0..=steps {
        let t = i as f64 / steps as f64;
        let eased_t = ease_out_quart(t);
        let current_x = start_x as f64 + dx * eased_t;
        let current_y = start_y as f64 + dy * eased_t;
        mouse_move_to(current_x as i32, current_y as i32);

        let target_time = start_time + target_duration * (i + 1) as u32 / steps as u32;
        tokio::time::sleep_until(target_time).await;
    }
}

/// 鼠标移动 (相对坐标)
#[allow(unused)]
pub fn mouse_move(dx: i32, dy: i32) {
    unsafe { mouse_event(MOUSEEVENTF_MOVE, dx, dy, 0, 0) };
}

pub fn mouse_down() {
    unsafe { mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0) }
}

pub fn mouse_up() {
    unsafe { mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0) }
}

pub fn mouse_middle_down() {
    unsafe { mouse_event(MOUSEEVENTF_MIDDLEDOWN, 0, 0, 0, 0) }
}
pub fn mouse_middle_up() {
    unsafe { mouse_event(MOUSEEVENTF_MIDDLEUP, 0, 0, 0, 0) }
}

pub fn mouse_right_down() {
    unsafe { mouse_event(MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, 0) }
}
pub fn mouse_right_up() {
    unsafe { mouse_event(MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0) }
}

/// 按指定鼠标键执行按下。
pub fn mouse_down_by_button(button: MouseButtonKind) {
    match button {
        MouseButtonKind::Left => mouse_down(),
        MouseButtonKind::Right => mouse_right_down(),
        MouseButtonKind::Middle => mouse_middle_down(),
        MouseButtonKind::X1 | MouseButtonKind::X2 => unsafe {
            mouse_event(MOUSEEVENTF_XDOWN, 0, 0, xbutton_flag(button) as i32, 0)
        },
    }
}

/// 按指定鼠标键执行抬起。
pub fn mouse_up_by_button(button: MouseButtonKind) {
    match button {
        MouseButtonKind::Left => mouse_up(),
        MouseButtonKind::Right => mouse_right_up(),
        MouseButtonKind::Middle => mouse_middle_up(),
        MouseButtonKind::X1 | MouseButtonKind::X2 => unsafe {
            mouse_event(MOUSEEVENTF_XUP, 0, 0, xbutton_flag(button) as i32, 0)
        },
    }
}

/// 按指定鼠标键点击（可指定按下时长）。
pub fn mouse_click_by_button(button: MouseButtonKind, duration: u32) {
    mouse_down_by_button(button);
    sleep(duration);
    mouse_up_by_button(button);
}

/// 移动到坐标后按指定鼠标键点击。
pub fn mouse_click_to_by_button(x: i32, y: i32, button: MouseButtonKind) {
    mouse_move_to(x, y);
    mouse_down_by_button(button);
    sleep(1);
    mouse_up_by_button(button);
}

/// 左键单击
#[allow(unused)]
pub fn click_to(x: i32, y: i32) {
    mouse_move_to(x, y);
    mouse_down();
    sleep(1);
    mouse_up();
}

#[allow(unused)]
pub fn click(duration: u32) {
    mouse_down();
    sleep(duration);
    mouse_up();
}
#[allow(unused)]
pub fn right_click_to(x: i32, y: i32) {
    mouse_move_to(x, y);
    mouse_right_down();
    sleep(1);
    mouse_right_up();
}
#[allow(unused)]
pub fn right_click() {
    mouse_right_down();
    sleep(1);
    mouse_right_up();
}
#[allow(unused)]
pub fn middle_click_to(x: i32, y: i32) {
    mouse_move_to(x, y);
    mouse_middle_down();
    sleep(1);
    mouse_middle_up();
}
#[allow(unused)]
pub fn middle_click() {
    mouse_middle_down();
    sleep(1);
    mouse_middle_up();
}
#[allow(unused)]
pub fn wheel(delta: i32) {
    unsafe { mouse_event(MOUSEEVENTF_WHEEL, 0, 0, delta as i32, 0) }
    sleep(1);
}

/// 将客户端坐标打包为鼠标消息 `lParam`。
///
/// Windows 要求坐标按 16 位有符号数写入低/高位，这里显式按 `i16` 截断，
/// 以避免直接位运算时的符号扩展影响。
fn make_mouse_lparam(x: i32, y: i32) -> LPARAM {
    let x_word = x as i16 as u16 as isize;
    let y_word = y as i16 as u16 as isize;
    LPARAM((y_word << 16) | x_word)
}

/// 根据父窗口与客户端坐标解析实际接收鼠标消息的目标窗口。
///
/// 优先尝试命中坐标所在的子窗口（类似 AHK ControlClick 的 control 语义），
/// 命中后会把坐标从父窗口坐标系转换到子窗口坐标系；失败时回退到原窗口。
fn resolve_mouse_target_window(hwnd: HWND, x: i32, y: i32) -> (HWND, i32, i32) {
    let mut point = POINT { x, y };
    unsafe {
        let child = ChildWindowFromPointEx(
            hwnd,
            point,
            CWP_SKIPDISABLED | CWP_SKIPINVISIBLE | CWP_SKIPTRANSPARENT,
        );
        if !child.is_invalid() && child != hwnd {
            let _ = ClientToScreen(hwnd, &mut point);
            let _ = ScreenToClient(child, &mut point);
            return (child, point.x, point.y);
        }
    }
    (hwnd, x, y)
}

/// 判断虚拟键是否属于扩展键（用于构造键盘消息 lParam 的扩展位）。
fn is_extended_vkey(vkey: u16) -> bool {
    matches!(
        vkey,
        0xA5 // VK_RMENU
            | 0xA3 // VK_RCONTROL
            | 0x2D // VK_INSERT
            | 0x2E // VK_DELETE
            | 0x24 // VK_HOME
            | 0x23 // VK_END
            | 0x21 // VK_PRIOR
            | 0x22 // VK_NEXT
            | 0x25 // VK_LEFT
            | 0x27 // VK_RIGHT
            | 0x26 // VK_UP
            | 0x28 // VK_DOWN
            | 0x6F // VK_DIVIDE
            | 0x90 // VK_NUMLOCK
            | 0x2C // VK_SNAPSHOT
    )
}

/// 构造键盘消息 `lParam`（包含扫描码、扩展位、按下/抬起状态）。
fn make_key_lparam(vkey: u16, is_key_up: bool) -> LPARAM {
    let scan_code = unsafe { MapVirtualKeyW(vkey as u32, MAPVK_VK_TO_VSC_EX) } as u32;
    let mut lparam = 1u32 | ((scan_code & 0xFF) << 16);
    if is_extended_vkey(vkey) {
        lparam |= 1 << 24;
    }
    if is_key_up {
        lparam |= 1 << 30;
        lparam |= 1 << 31;
    }
    LPARAM(lparam as isize)
}

/// 解析更可靠的键盘消息目标窗口。
///
/// 对于后台窗口，直接发给顶层窗口常常会被忽略；这里优先取目标线程当前焦点窗口，
/// 无法获取时再回退到传入窗口句柄。
fn resolve_keyboard_target_window(hwnd: HWND) -> HWND {
    let thread_id = unsafe { GetWindowThreadProcessId(hwnd, None) };
    if thread_id != 0 {
        let mut info = GUITHREADINFO {
            cbSize: std::mem::size_of::<GUITHREADINFO>() as u32,
            ..Default::default()
        };
        unsafe {
            if GetGUIThreadInfo(thread_id, &mut info).is_ok() && !info.hwndFocus.is_invalid() {
                return info.hwndFocus;
            }
        }
    }
    hwnd
}

/// 发送 PostMessage 前临时对齐输入线程并设置目标活动窗口。
///
/// 参考 AutoHotkey ControlClick 默认行为：
/// 1. 尝试 `AttachThreadInput` 到目标窗口线程；
/// 2. 调用 `SetActiveWindow` 提升后台消息处理可靠性；
/// 3. 发送 `PostMessage` 后再解除线程附加。
fn post_message_with_attach(target_hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) {
    if target_hwnd.is_invalid() {
        return;
    }

    let active_hwnd = unsafe {
        let root = GetAncestor(target_hwnd, GA_ROOT);
        if root.is_invalid() { target_hwnd } else { root }
    };

    let current_thread = unsafe { GetCurrentThreadId() };
    let target_thread = unsafe { GetWindowThreadProcessId(active_hwnd, None) };
    let mut attached = false;

    unsafe {
        if target_thread != 0
            && target_thread != current_thread
            && !IsHungAppWindow(active_hwnd).as_bool()
        {
            attached = AttachThreadInput(current_thread, target_thread, true).as_bool();
        }

        let _ = SetActiveWindow(active_hwnd);
        let _ = PostMessageW(Some(target_hwnd), msg, wparam, lparam);

        if attached {
            let _ = AttachThreadInput(current_thread, target_thread, false);
        }
    }
}

/// 通过Windows消息发送鼠标滚轮事件到指定窗口。
///
/// 参数说明：
/// - `x`、`y`：窗口坐标系中的目标位置；
/// - `delta`：滚轮增量（常用 `120` / `-120`）。
#[allow(unused)]
pub fn post_wheel(hwnd: HWND, x: i32, y: i32, delta: i32) {
    let (target_hwnd, target_x, target_y) = resolve_mouse_target_window(hwnd, x, y);
    let mut screen_pt = POINT {
        x: target_x,
        y: target_y,
    };
    unsafe {
        let _ = ClientToScreen(target_hwnd, &mut screen_pt);
    }

    // WM_MOUSEWHEEL: HIWORD(wParam)=delta, LOWORD(wParam)=按键状态(此处为0)
    let wheel_delta_word = ((delta as i16 as u16) as usize) << 16;
    let wparam = WPARAM(wheel_delta_word);
    let lparam = make_mouse_lparam(screen_pt.x, screen_pt.y);
    post_message_with_attach(target_hwnd, WM_MOUSEWHEEL, wparam, lparam);
}

pub fn sleep(ms: u32) {
    std::thread::sleep(std::time::Duration::from_millis(ms as u64));
}

/// 通过Windows消息发送键盘按下事件到指定窗口
#[allow(unused)]
pub fn post_key_down(hwnd: HWND, key: u16) {
    let target_hwnd = resolve_keyboard_target_window(hwnd);
    let lparam = make_key_lparam(key, false);
    post_message_with_attach(target_hwnd, WM_KEYDOWN, WPARAM(key as _), lparam);
}

/// 通过Windows消息发送键盘释放事件到指定窗口
#[allow(unused)]
pub fn post_key_up(hwnd: HWND, key: u16) {
    let target_hwnd = resolve_keyboard_target_window(hwnd);
    let lparam = make_key_lparam(key, true);
    post_message_with_attach(target_hwnd, WM_KEYUP, WPARAM(key as _), lparam);
}

/// 通过Windows消息发送完整按键事件到指定窗口
#[allow(unused)]
pub fn post_key_press(hwnd: HWND, key: &str, duration: u32) {
    let vkey = key_to_vkey(key);
    if vkey == 0 {
        panic!("无效的按键: {}", key);
    }
    post_key_down(hwnd, vkey);
    if duration > 0 {
        sleep(duration);
    }
    post_key_up(hwnd, vkey);
}

/// 通过Windows消息发送鼠标移动事件到指定窗口
#[allow(unused)]
pub fn post_mouse_move(hwnd: HWND, x: i32, y: i32) {
    let (target_hwnd, target_x, target_y) = resolve_mouse_target_window(hwnd, x, y);
    post_message_with_attach(
        target_hwnd,
        WM_MOUSEMOVE,
        WPARAM(0),
        make_mouse_lparam(target_x, target_y),
    );
}

/// 通过Windows消息发送鼠标左键按下事件到指定窗口
#[allow(unused)]
pub fn post_mouse_down(hwnd: HWND, x: i32, y: i32) {
    let (target_hwnd, target_x, target_y) = resolve_mouse_target_window(hwnd, x, y);
    post_message_with_attach(
        target_hwnd,
        WM_LBUTTONDOWN,
        WPARAM(0x0001), // MK_LBUTTON
        make_mouse_lparam(target_x, target_y),
    );
}

/// 通过Windows消息发送鼠标左键释放事件到指定窗口
#[allow(unused)]
pub fn post_mouse_up(hwnd: HWND, x: i32, y: i32) {
    let (target_hwnd, target_x, target_y) = resolve_mouse_target_window(hwnd, x, y);
    post_message_with_attach(
        target_hwnd,
        WM_LBUTTONUP,
        WPARAM(0),
        make_mouse_lparam(target_x, target_y),
    );
}

/// 通过 Windows 消息发送指定鼠标键按下事件到指定窗口。
pub fn post_mouse_down_by_button(hwnd: HWND, x: i32, y: i32, button: MouseButtonKind) {
    match button {
        MouseButtonKind::Left => post_mouse_down(hwnd, x, y),
        MouseButtonKind::Right => post_mouse_right_down(hwnd, x, y),
        MouseButtonKind::Middle => post_mouse_middle_down(hwnd, x, y),
        MouseButtonKind::X1 | MouseButtonKind::X2 => {
            let (target_hwnd, target_x, target_y) = resolve_mouse_target_window(hwnd, x, y);
            let xbtn = xbutton_flag(button) as usize;
            // HIWORD(wParam)=XBUTTON1/2, LOWORD(wParam)=按键状态（此处同步设置对应 MK_XBUTTON 位）
            let mk_state = if matches!(button, MouseButtonKind::X1) {
                0x0020usize
            } else {
                0x0040usize
            };
            let wparam = WPARAM((xbtn << 16) | mk_state);
            post_message_with_attach(
                target_hwnd,
                WM_XBUTTONDOWN,
                wparam,
                make_mouse_lparam(target_x, target_y),
            );
        }
    }
}

/// 通过 Windows 消息发送指定鼠标键抬起事件到指定窗口。
pub fn post_mouse_up_by_button(hwnd: HWND, x: i32, y: i32, button: MouseButtonKind) {
    match button {
        MouseButtonKind::Left => post_mouse_up(hwnd, x, y),
        MouseButtonKind::Right => post_mouse_right_up(hwnd, x, y),
        MouseButtonKind::Middle => post_mouse_middle_up(hwnd, x, y),
        MouseButtonKind::X1 | MouseButtonKind::X2 => {
            let (target_hwnd, target_x, target_y) = resolve_mouse_target_window(hwnd, x, y);
            let xbtn = xbutton_flag(button) as usize;
            let wparam = WPARAM(xbtn << 16);
            post_message_with_attach(
                target_hwnd,
                WM_XBUTTONUP,
                wparam,
                make_mouse_lparam(target_x, target_y),
            );
        }
    }
}

/// 通过 Windows 消息发送指定鼠标键点击事件到指定窗口。
pub fn post_mouse_click_by_button(hwnd: HWND, x: i32, y: i32, button: MouseButtonKind) {
    post_mouse_move(hwnd, x, y);
    post_mouse_down_by_button(hwnd, x, y, button);
    sleep(1);
    post_mouse_up_by_button(hwnd, x, y, button);
}

/// 通过Windows消息发送鼠标点击事件到指定窗口
#[allow(unused)]
pub fn post_click(hwnd: HWND, x: i32, y: i32, count: u32) {
    for _ in 0..count {
        post_mouse_move(hwnd, x, y);
        post_mouse_down(hwnd, x, y);
        sleep(1);
        post_mouse_up(hwnd, x, y);
    }
}
pub fn post_mouse_right_down(hwnd: HWND, x: i32, y: i32) {
    let (target_hwnd, target_x, target_y) = resolve_mouse_target_window(hwnd, x, y);
    post_message_with_attach(
        target_hwnd,
        WM_RBUTTONDOWN,
        WPARAM(0x0002), // MK_RBUTTON
        make_mouse_lparam(target_x, target_y),
    );
}
pub fn post_mouse_right_up(hwnd: HWND, x: i32, y: i32) {
    let (target_hwnd, target_x, target_y) = resolve_mouse_target_window(hwnd, x, y);
    post_message_with_attach(
        target_hwnd,
        WM_RBUTTONUP,
        WPARAM(0),
        make_mouse_lparam(target_x, target_y),
    );
}
pub fn post_mouse_middle_down(hwnd: HWND, x: i32, y: i32) {
    let (target_hwnd, target_x, target_y) = resolve_mouse_target_window(hwnd, x, y);
    post_message_with_attach(
        target_hwnd,
        WM_MBUTTONDOWN,
        WPARAM(0x0010), // MK_MBUTTON
        make_mouse_lparam(target_x, target_y),
    );
}
#[allow(unused)]
pub fn post_mouse_middle_up(hwnd: HWND, x: i32, y: i32) {
    let (target_hwnd, target_x, target_y) = resolve_mouse_target_window(hwnd, x, y);
    post_message_with_attach(
        target_hwnd,
        WM_MBUTTONUP,
        WPARAM(0),
        make_mouse_lparam(target_x, target_y),
    );
}
#[allow(unused)]
pub fn post_mouse_middle_click(hwnd: HWND, x: i32, y: i32) {
    post_mouse_middle_down(hwnd, x, y);
    sleep(1);
    post_mouse_middle_up(hwnd, x, y);
}

/// 通过Windows消息发送鼠标点击事件到指定窗口
#[allow(unused)]
pub fn post_mouse_click(hwnd: HWND, x: i32, y: i32) {
    post_mouse_down(hwnd, x, y);
    sleep(1);
    post_mouse_up(hwnd, x, y);
}
#[allow(unused)]
pub fn post_right_click(hwnd: HWND, x: i32, y: i32) {
    post_mouse_move(hwnd, x, y);
    post_mouse_right_down(hwnd, x, y);
    sleep(1);
    post_mouse_right_up(hwnd, x, y);
}
#[allow(unused)]
pub fn post_middle_click(hwnd: HWND, x: i32, y: i32) {
    post_mouse_move(hwnd, x, y);
    post_mouse_middle_down(hwnd, x, y);
    sleep(1);
    post_mouse_middle_up(hwnd, x, y);
}
