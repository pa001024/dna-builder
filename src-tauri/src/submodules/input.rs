use windows::Win32::{
    Foundation::{HWND, LPARAM, WPARAM},
    UI::{Input::KeyboardAndMouse::*, WindowsAndMessaging::*},
};
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

pub fn sleep(ms: u32) {
    std::thread::sleep(std::time::Duration::from_millis(ms as u64));
}

/// 通过Windows消息发送键盘按下事件到指定窗口
#[allow(unused)]
pub fn post_key_down(hwnd: HWND, key: u16) {
    unsafe {
        let _ = PostMessageW(Some(hwnd), WM_KEYDOWN, WPARAM(key as _), LPARAM(0));
    }
}

/// 通过Windows消息发送键盘释放事件到指定窗口
#[allow(unused)]
pub fn post_key_up(hwnd: HWND, key: u16) {
    unsafe {
        let _ = PostMessageW(Some(hwnd), WM_KEYUP, WPARAM(key as _), LPARAM(0));
    }
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
    unsafe {
        let _ = PostMessageW(
            Some(hwnd),
            WM_MOUSEMOVE,
            WPARAM(0),
            LPARAM(((y as isize) << 16) | (x as isize & 0xFFFF)),
        );
    }
}

/// 通过Windows消息发送鼠标左键按下事件到指定窗口
#[allow(unused)]
pub fn post_mouse_down(hwnd: HWND, x: i32, y: i32) {
    unsafe {
        let _ = PostMessageW(
            Some(hwnd),
            WM_LBUTTONDOWN,
            WPARAM(1),
            LPARAM(((y as isize) << 16) | (x as isize & 0xFFFF)),
        );
    }
}

/// 通过Windows消息发送鼠标左键释放事件到指定窗口
#[allow(unused)]
pub fn post_mouse_up(hwnd: HWND, x: i32, y: i32) {
    unsafe {
        let _ = PostMessageW(
            Some(hwnd),
            WM_LBUTTONUP,
            WPARAM(0),
            LPARAM(((y as isize) << 16) | (x as isize & 0xFFFF)),
        );
    }
}

/// 通过Windows消息发送鼠标点击事件到指定窗口
#[allow(unused)]
pub fn post_click(hwnd: HWND, x: i32, y: i32, count: u32) {
    for _ in 0..count {
        post_mouse_down(hwnd, x, y);
        sleep(1);
        post_mouse_up(hwnd, x, y);
    }
}
pub fn post_mouse_right_down(hwnd: HWND, x: i32, y: i32) {
    unsafe {
        let _ = PostMessageW(
            Some(hwnd),
            WM_RBUTTONDOWN,
            WPARAM(1),
            LPARAM(((y as isize) << 16) | (x as isize & 0xFFFF)),
        );
    }
}
pub fn post_mouse_right_up(hwnd: HWND, x: i32, y: i32) {
    unsafe {
        let _ = PostMessageW(
            Some(hwnd),
            WM_RBUTTONUP,
            WPARAM(0),
            LPARAM(((y as isize) << 16) | (x as isize & 0xFFFF)),
        );
    }
}
pub fn post_mouse_middle_down(hwnd: HWND, x: i32, y: i32) {
    unsafe {
        let _ = PostMessageW(
            Some(hwnd),
            WM_MBUTTONDOWN,
            WPARAM(1),
            LPARAM(((y as isize) << 16) | (x as isize & 0xFFFF)),
        );
    }
}
#[allow(unused)]
pub fn post_mouse_middle_up(hwnd: HWND, x: i32, y: i32) {
    unsafe {
        let _ = PostMessageW(
            Some(hwnd),
            WM_MBUTTONUP,
            WPARAM(0),
            LPARAM(((y as isize) << 16) | (x as isize & 0xFFFF)),
        );
    }
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
    post_mouse_right_down(hwnd, x, y);
    sleep(1);
    post_mouse_right_up(hwnd, x, y);
}
#[allow(unused)]
pub fn post_middle_click(hwnd: HWND, x: i32, y: i32) {
    post_mouse_middle_down(hwnd, x, y);
    sleep(1);
    post_mouse_middle_up(hwnd, x, y);
}
