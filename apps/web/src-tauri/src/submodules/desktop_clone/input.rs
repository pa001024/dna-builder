//! 交互层：游戏鼠标捕获（低级鼠标钩子 / 光标裁剪 / 回中 / Alt 释放）与系统热键投送。
//!
//! 钩子回调只做 Win32 操作，绝不触碰 COM；宿主控件只在 `rdp_host` 的主线程里调用。
//! 所有捕获状态在窗口失焦、最小化、断开、切换模式、关闭会话与应用退出时统一释放。

use std::sync::atomic::{AtomicBool, AtomicI32, AtomicIsize, Ordering};
use std::time::Duration;

use tauri::{AppHandle, Manager};
use windows::Win32::Foundation::{HINSTANCE, LPARAM, LRESULT, POINT, RECT, WPARAM};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_EXTENDEDKEY,
    KEYEVENTF_KEYUP, KEYEVENTF_SCANCODE, SendInput, VIRTUAL_KEY, VK_D, VK_ESCAPE, VK_LCONTROL,
    VK_LSHIFT, VK_LWIN, VK_MENU, VK_TAB,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, ClipCursor, GetCursorPos, HHOOK, SetCursorPos, SetWindowsHookExW, ShowCursor,
    UnhookWindowsHookEx, WH_MOUSE_LL,
};
use windows::core::PCWSTR;

use super::settings::{KeyboardHook, MouseMode};
use super::{CloneManager, CloneState, WINDOW_LABEL};

/// 光标与视口边缘的安全距离：进入该范围就回中。
const EDGE_MARGIN: i32 = 4;
/// 焦点交接后等待控件取得键盘焦点的时间。
const FOCUS_SETTLE: Duration = Duration::from_millis(60);
/// `SendRemoteAction(AppSwitch)` 的动作编号。
const REMOTE_ACTION_APP_SWITCH: i32 = 1;

static ACTIVE: AtomicBool = AtomicBool::new(false);
static CLIPPED: AtomicBool = AtomicBool::new(false);
static CURSOR_HIDDEN: AtomicBool = AtomicBool::new(false);
static FOCUSED: AtomicBool = AtomicBool::new(false);
static HOOK: AtomicIsize = AtomicIsize::new(0);
static CLIP_LEFT: AtomicI32 = AtomicI32::new(0);
static CLIP_TOP: AtomicI32 = AtomicI32::new(0);
static CLIP_RIGHT: AtomicI32 = AtomicI32::new(0);
static CLIP_BOTTOM: AtomicI32 = AtomicI32::new(0);

// ---------------------------------------------------------------- key sequences

/// 一次按键动作（虚拟键 + 扫描码 + 按下/抬起）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct KeyStroke {
    pub vk: u16,
    pub scan: u16,
    pub down: bool,
    pub extended: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum KeyAction {
    SwitchWindow,
    ShowDesktop,
    TaskManager,
}

impl KeyAction {
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "switch-window" => Some(Self::SwitchWindow),
            "show-desktop" => Some(Self::ShowDesktop),
            "task-manager" => Some(Self::TaskManager),
            _ => None,
        }
    }
}

/// 组合键序列：修饰键先按下、后抬起。
pub fn key_sequence(action: KeyAction) -> Vec<KeyStroke> {
    const SCAN_LWIN: u16 = 0x5B;
    const SCAN_TAB: u16 = 0x0F;
    const SCAN_D: u16 = 0x20;
    const SCAN_CONTROL: u16 = 0x1D;
    const SCAN_SHIFT: u16 = 0x2A;
    const SCAN_ESCAPE: u16 = 0x01;

    let win = |down: bool| KeyStroke {
        vk: VK_LWIN.0,
        scan: SCAN_LWIN,
        down,
        extended: true,
    };
    let simple = |vk: u16, scan: u16, down: bool| KeyStroke {
        vk,
        scan,
        down,
        extended: false,
    };

    match action {
        KeyAction::SwitchWindow => vec![
            win(true),
            simple(VK_TAB.0, SCAN_TAB, true),
            simple(VK_TAB.0, SCAN_TAB, false),
            win(false),
        ],
        KeyAction::ShowDesktop => vec![
            win(true),
            simple(VK_D.0, SCAN_D, true),
            simple(VK_D.0, SCAN_D, false),
            win(false),
        ],
        KeyAction::TaskManager => vec![
            simple(VK_LCONTROL.0, SCAN_CONTROL, true),
            simple(VK_LSHIFT.0, SCAN_SHIFT, true),
            simple(VK_ESCAPE.0, SCAN_ESCAPE, true),
            simple(VK_ESCAPE.0, SCAN_ESCAPE, false),
            simple(VK_LSHIFT.0, SCAN_SHIFT, false),
            simple(VK_LCONTROL.0, SCAN_CONTROL, false),
        ],
    }
}

/// 在子会话内执行系统热键：优先控件 `SendKeys`，再回退 `SendRemoteAction` / `SendInput`。
///
/// 返回实际使用的通道，便于前端与诊断报告标注。
pub fn send_keys(app: &AppHandle, action: &str) -> Result<String, String> {
    let action = KeyAction::parse(action).ok_or_else(|| format!("未知的按键动作: {action}"))?;
    let strokes = key_sequence(action);
    // 控件 SendKeys 与本机 SendInput 回退都使用扫描码，避免两条路径单位不一致
    let keys: Vec<(u16, bool)> = strokes
        .iter()
        .map(|stroke| (stroke.scan, stroke.down))
        .collect();

    let control_error = match super::rdp_host::send_keys(app, &keys) {
        Ok(()) => return Ok("control".to_string()),
        Err(error) => error,
    };

    if action == KeyAction::SwitchWindow
        && super::rdp_host::send_remote_action(app, REMOTE_ACTION_APP_SWITCH).is_ok()
    {
        return Ok("remote-action".to_string());
    }

    // SendInput 走本机键盘队列：先尽力把热键路由切到子会话，再交出焦点
    let hook_applied = match super::rdp_host::set_keyboard_hook_mode(app, true) {
        Ok(()) => true,
        Err(error) => {
            eprintln!("[desktop-clone] 回退 SendInput 前设置热键路由失败: {error}");
            false
        }
    };
    super::rdp_host::focus_host(app)?;
    std::thread::sleep(FOCUS_SETTLE);
    // SendInput 会注入到当前前台窗口：焦点没能交给宿主时不能假装成功
    if !super::rdp_host::is_host_focused(app)? {
        return Err(format!(
            "子会话未能取得键盘焦点，已取消本机按键注入（控件通道不可用：{control_error}）"
        ));
    }
    send_input(&strokes)?;
    // 控件侧的热键路由确已改成「子会话」时同步持久化并推送，避免界面仍显示「本机」
    if hook_applied {
        super::note_keyboard_hook(app, KeyboardHook::Remote);
    }
    let routing = if hook_applied {
        "已把热键路由切到子会话"
    } else {
        "热键路由切换失败，仅注入本机按键"
    };
    Ok(format!(
        "send-input（{routing}；控件通道不可用：{control_error}）"
    ))
}

/// 通过 `SendInput` 注入扫描码序列；需要宿主已取得键盘焦点。
pub fn send_input(strokes: &[KeyStroke]) -> Result<(), String> {
    let inputs: Vec<INPUT> = strokes
        .iter()
        .map(|stroke| {
            let mut flags = KEYEVENTF_SCANCODE;
            if stroke.extended {
                flags |= KEYEVENTF_EXTENDEDKEY;
            }
            if !stroke.down {
                flags |= KEYEVENTF_KEYUP;
            }
            INPUT {
                r#type: INPUT_KEYBOARD,
                Anonymous: INPUT_0 {
                    ki: KEYBDINPUT {
                        wVk: VIRTUAL_KEY(0),
                        wScan: stroke.scan,
                        dwFlags: flags,
                        time: 0,
                        dwExtraInfo: 0,
                    },
                },
            }
        })
        .collect();
    let sent = unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) };
    if sent as usize != inputs.len() {
        return Err(format!("SendInput 仅注入 {sent}/{} 个事件", inputs.len()));
    }
    Ok(())
}

// ---------------------------------------------------------------- capture state

/// 根据状态、选项与窗口焦点决定是否进入游戏鼠标捕获（可跨线程调用）。
pub fn sync(app: &AppHandle) {
    let manager = app.state::<CloneManager>();
    let status = manager.snapshot();
    let want = status.options.mouse_mode == MouseMode::Game
        && status.state == CloneState::Connected
        && !status.overlay_visible
        && FOCUSED.load(Ordering::SeqCst);

    let handle = app.clone();
    let _ = super::on_main_sync(app, move || {
        let minimized = handle
            .get_webview_window(WINDOW_LABEL)
            .and_then(|window| window.is_minimized().ok())
            .unwrap_or(false);
        apply_capture(&handle, want && !minimized);
    });
}

/// 窗口焦点变化入口（由 `viewer` 的窗口事件调用）。
pub fn set_window_focused(app: &AppHandle, focused: bool) {
    FOCUSED.store(focused, Ordering::SeqCst);
    sync(app);
}

/// 强制释放全部捕获（关闭会话 / 应用退出 / 窗口销毁）；不改变窗口焦点状态，
/// 以便重连后窗口仍然聚焦时游戏鼠标能自动恢复。
pub fn release(app: &AppHandle) {
    let _ = super::on_main_sync(app, move || deactivate());
}

fn apply_capture(app: &AppHandle, want: bool) {
    if !want {
        deactivate();
        return;
    }
    let Some((left, top, right, bottom)) = super::viewer::host_screen_rect(app) else {
        deactivate();
        return;
    };
    CLIP_LEFT.store(left, Ordering::SeqCst);
    CLIP_TOP.store(top, Ordering::SeqCst);
    CLIP_RIGHT.store(right, Ordering::SeqCst);
    CLIP_BOTTOM.store(bottom, Ordering::SeqCst);

    if HOOK.load(Ordering::SeqCst) == 0 && !install_hook() {
        return;
    }
    ACTIVE.store(true, Ordering::SeqCst);
    force_clip();
    ensure_cursor_hidden();
    center_cursor();
}

/// 按当前视口重新裁剪（窗口移动/缩放后必须重设）。
fn force_clip() {
    let Some(rect) = clip_rect() else {
        return;
    };
    if unsafe { ClipCursor(Some(&rect as *const RECT)) }.is_ok() {
        CLIPPED.store(true, Ordering::SeqCst);
    }
}

fn deactivate() {
    ACTIVE.store(false, Ordering::SeqCst);
    if CLIPPED.swap(false, Ordering::SeqCst) {
        unsafe {
            let _ = ClipCursor(None);
        }
    }
    if CURSOR_HIDDEN.swap(false, Ordering::SeqCst) {
        show_cursor();
    }
    if let Some(hook) = take_hook() {
        unsafe {
            let _ = UnhookWindowsHookEx(hook);
        }
    }
}

fn install_hook() -> bool {
    unsafe {
        let module = GetModuleHandleW(PCWSTR::null())
            .ok()
            .map(|module| HINSTANCE(module.0));
        match SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_hook_proc), module, 0) {
            Ok(hook) => {
                HOOK.store(hook.0 as isize, Ordering::SeqCst);
                true
            }
            Err(error) => {
                eprintln!("[desktop-clone] 安装鼠标钩子失败: {error}");
                false
            }
        }
    }
}

fn take_hook() -> Option<HHOOK> {
    let raw = HOOK.swap(0, Ordering::SeqCst);
    (raw != 0).then(|| HHOOK(raw as *mut core::ffi::c_void))
}

fn clip_rect() -> Option<RECT> {
    let (left, top) = (
        CLIP_LEFT.load(Ordering::SeqCst),
        CLIP_TOP.load(Ordering::SeqCst),
    );
    let (right, bottom) = (
        CLIP_RIGHT.load(Ordering::SeqCst),
        CLIP_BOTTOM.load(Ordering::SeqCst),
    );
    (right > left && bottom > top).then_some(RECT {
        left,
        top,
        right,
        bottom,
    })
}

fn ensure_clip() {
    if CLIPPED.load(Ordering::SeqCst) {
        return;
    }
    let Some(rect) = clip_rect() else {
        return;
    };
    if unsafe { ClipCursor(Some(&rect as *const RECT)) }.is_ok() {
        CLIPPED.store(true, Ordering::SeqCst);
    }
}

fn ensure_cursor_hidden() {
    if CURSOR_HIDDEN.load(Ordering::SeqCst) {
        return;
    }
    hide_cursor();
    CURSOR_HIDDEN.store(true, Ordering::SeqCst);
}

/// `ShowCursor` 是计数式开关：循环到实际隐藏，避免计数漂移。
fn hide_cursor() {
    let mut count = unsafe { ShowCursor(false) };
    while count >= 0 {
        count = unsafe { ShowCursor(false) };
    }
}

fn show_cursor() {
    let mut count = unsafe { ShowCursor(true) };
    while count < 0 {
        count = unsafe { ShowCursor(true) };
    }
}

fn center_cursor() {
    let Some(rect) = clip_rect() else {
        return;
    };
    let x = (rect.left + rect.right) / 2;
    let y = (rect.top + rect.bottom) / 2;
    let _ = unsafe { SetCursorPos(x, y) };
}

fn recenter_if_near_edge() {
    let Some(rect) = clip_rect() else {
        return;
    };
    let mut point = POINT::default();
    if unsafe { GetCursorPos(&mut point) }.is_err() {
        return;
    }
    let near_edge = point.x < rect.left + EDGE_MARGIN
        || point.x > rect.right - EDGE_MARGIN
        || point.y < rect.top + EDGE_MARGIN
        || point.y > rect.bottom - EDGE_MARGIN;
    if near_edge {
        center_cursor();
    }
}

unsafe extern "system" fn mouse_hook_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code >= 0 && ACTIVE.load(Ordering::SeqCst) {
        let alt_down = (unsafe { GetAsyncKeyState(VK_MENU.0 as i32) } as u16 & 0x8000) != 0;
        if alt_down {
            // 按住 Alt 临时放开裁剪与光标，松开后由后续鼠标事件重新捕获
            if CLIPPED.swap(false, Ordering::SeqCst) {
                unsafe {
                    let _ = ClipCursor(None);
                }
            }
            if CURSOR_HIDDEN.swap(false, Ordering::SeqCst) {
                show_cursor();
            }
        } else {
            ensure_clip();
            ensure_cursor_hidden();
            recenter_if_near_edge();
        }
    }
    // 保留消息派发：相对鼠标的实际位移仍由控件接收
    unsafe { CallNextHookEx(None, code, wparam, lparam) }
}

/// 诊断摘要（不含任何输入内容）。
pub fn diagnostics() -> String {
    format!(
        "游戏鼠标: 激活={} 裁剪={} 光标隐藏={} 钩子={}",
        ACTIVE.load(Ordering::SeqCst),
        CLIPPED.load(Ordering::SeqCst),
        CURSOR_HIDDEN.load(Ordering::SeqCst),
        HOOK.load(Ordering::SeqCst) != 0
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn names(action: KeyAction) -> Vec<(u16, bool)> {
        key_sequence(action)
            .into_iter()
            .map(|stroke| (stroke.vk, stroke.down))
            .collect()
    }

    #[test]
    fn switch_window_is_win_tab() {
        assert_eq!(
            names(KeyAction::SwitchWindow),
            vec![
                (VK_LWIN.0, true),
                (VK_TAB.0, true),
                (VK_TAB.0, false),
                (VK_LWIN.0, false)
            ]
        );
        let extended: Vec<bool> = key_sequence(KeyAction::SwitchWindow)
            .iter()
            .map(|stroke| stroke.extended)
            .collect();
        assert_eq!(extended, vec![true, false, false, true]);
    }

    #[test]
    fn show_desktop_is_win_d() {
        assert_eq!(
            names(KeyAction::ShowDesktop),
            vec![
                (VK_LWIN.0, true),
                (VK_D.0, true),
                (VK_D.0, false),
                (VK_LWIN.0, false)
            ]
        );
    }

    #[test]
    fn task_manager_chord_releases_in_reverse_order() {
        assert_eq!(
            names(KeyAction::TaskManager),
            vec![
                (VK_LCONTROL.0, true),
                (VK_LSHIFT.0, true),
                (VK_ESCAPE.0, true),
                (VK_ESCAPE.0, false),
                (VK_LSHIFT.0, false),
                (VK_LCONTROL.0, false),
            ]
        );
    }

    #[test]
    fn every_sequence_is_balanced() {
        for action in [
            KeyAction::SwitchWindow,
            KeyAction::ShowDesktop,
            KeyAction::TaskManager,
        ] {
            let strokes = key_sequence(action);
            let mut held: Vec<u16> = Vec::new();
            for stroke in &strokes {
                if stroke.down {
                    held.push(stroke.vk);
                } else {
                    assert_eq!(held.pop(), Some(stroke.vk), "{action:?}");
                }
            }
            assert!(held.is_empty(), "{action:?}");
        }
    }

    #[test]
    fn control_channel_uses_scan_codes() {
        let keys: Vec<(u16, bool)> = key_sequence(KeyAction::SwitchWindow)
            .iter()
            .map(|stroke| (stroke.scan, stroke.down))
            .collect();
        assert_eq!(
            keys,
            vec![(0x5B, true), (0x0F, true), (0x0F, false), (0x5B, false)]
        );
        // 扫描码与虚拟键不是一回事，SendKeys 必须收到前者
        assert_ne!(0x0F, VK_TAB.0);
    }

    #[test]
    fn actions_parse_from_frontend_strings() {
        assert_eq!(
            KeyAction::parse("switch-window"),
            Some(KeyAction::SwitchWindow)
        );
        assert_eq!(
            KeyAction::parse("show-desktop"),
            Some(KeyAction::ShowDesktop)
        );
        assert_eq!(
            KeyAction::parse("task-manager"),
            Some(KeyAction::TaskManager)
        );
        assert_eq!(KeyAction::parse("nope"), None);
    }
}
