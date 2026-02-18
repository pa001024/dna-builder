use crate::submodules::script::{normalize_script_path, run_script_file};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, LazyLock, Mutex, RwLock};
use std::time::Duration;
use tauri::Emitter;

#[cfg(target_os = "windows")]
use windows::Win32::Foundation::{CloseHandle, LPARAM, LRESULT, WPARAM};
#[cfg(target_os = "windows")]
use windows::Win32::UI::Input::KeyboardAndMouse::{
    VK_ADD, VK_APPS, VK_BACK, VK_CAPITAL, VK_CLEAR, VK_CONTROL, VK_DECIMAL, VK_DELETE, VK_DIVIDE, VK_DOWN, VK_END, VK_ESCAPE, VK_F1,
    VK_F10, VK_F11, VK_F12, VK_F13, VK_F14, VK_F15, VK_F16, VK_F17, VK_F18, VK_F19, VK_F2, VK_F20, VK_F21, VK_F22, VK_F23, VK_F24,
    VK_F3, VK_F4, VK_F5, VK_F6, VK_F7, VK_F8, VK_F9, VK_HOME, VK_INSERT, VK_LBUTTON, VK_LCONTROL, VK_LEFT, VK_LMENU, VK_LSHIFT, VK_LWIN,
    VK_MBUTTON, VK_MENU, VK_MULTIPLY, VK_NEXT, VK_NUMLOCK, VK_NUMPAD0, VK_NUMPAD1, VK_NUMPAD2, VK_NUMPAD3, VK_NUMPAD4, VK_NUMPAD5,
    VK_NUMPAD6, VK_NUMPAD7, VK_NUMPAD8, VK_NUMPAD9, VK_PAUSE, VK_PRIOR, VK_RBUTTON, VK_RCONTROL, VK_RETURN, VK_RIGHT, VK_RMENU, VK_RSHIFT,
    VK_RWIN, VK_SCROLL, VK_SEPARATOR, VK_SHIFT, VK_SNAPSHOT, VK_SPACE, VK_SUBTRACT, VK_TAB, VK_UP, VK_XBUTTON1, VK_XBUTTON2,
};
#[cfg(target_os = "windows")]
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
};
#[cfg(target_os = "windows")]
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, GetMessageW, HC_ACTION, KBDLLHOOKSTRUCT, MSLLHOOKSTRUCT, MSG, SetWindowsHookExW, TranslateMessage,
    UnhookWindowsHookEx, WH_KEYBOARD_LL, WH_MOUSE_LL, WM_KEYDOWN, WM_KEYUP, WM_LBUTTONDOWN, WM_LBUTTONUP, WM_MBUTTONDOWN, WM_MBUTTONUP,
    WM_RBUTTONDOWN, WM_RBUTTONUP, WM_SYSKEYDOWN, WM_SYSKEYUP, WM_XBUTTONDOWN, WM_XBUTTONUP, XBUTTON1, GetClassNameW, GetForegroundWindow,
    GetWindowTextW, GetWindowThreadProcessId,
};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptHotkeyBinding {
    pub script_path: String,
    pub hotkey: String,
    #[serde(default)]
    pub hot_if_win_active: String,
    #[serde(default)]
    pub hold_to_loop: bool,
}

#[derive(Clone, Debug)]
struct ParsedHotkey {
    ctrl: bool,
    alt: bool,
    shift: bool,
    win: bool,
    allow_extra_modifiers: bool,
    key_vk: u32,
    combo_prefix_vk: Option<u32>,
    trigger_on_key_up: bool,
}

#[derive(Clone, Debug)]
struct ParsedHotkeyTerm {
    ctrl: bool,
    alt: bool,
    shift: bool,
    win: bool,
    allow_extra_modifiers: bool,
    key_vk: u32,
    trigger_on_key_up: bool,
}

#[derive(Clone, Debug, Default)]
struct HotIfWinActiveCriteria {
    title: Option<String>,
    class_name: Option<String>,
    exe_name: Option<String>,
    pid: Option<u32>,
    hwnd_id: Option<u64>,
}

#[derive(Clone, Debug)]
struct RuntimeHotkeyBinding {
    script_path: String,
    hotkey: String,
    hot_if_win_active: Option<String>,
    hot_if_win_active_criteria: Option<HotIfWinActiveCriteria>,
    hold_to_loop: bool,
    parsed: ParsedHotkey,
}

struct HotkeyState {
    app_handle: Mutex<Option<tauri::AppHandle>>,
    bindings: RwLock<HashMap<String, RuntimeHotkeyBinding>>,
    pressed_keys: Mutex<HashSet<u32>>,
    hold_loop_flags: Mutex<HashMap<String, Arc<AtomicBool>>>,
    hook_started: AtomicBool,
}

static HOTKEY_STATE: LazyLock<Arc<HotkeyState>> = LazyLock::new(|| {
    Arc::new(HotkeyState {
        app_handle: Mutex::new(None),
        bindings: RwLock::new(HashMap::new()),
        pressed_keys: Mutex::new(HashSet::new()),
        hold_loop_flags: Mutex::new(HashMap::new()),
        hook_started: AtomicBool::new(false),
    })
});

fn _hotkey_state() -> &'static Arc<HotkeyState> {
    &HOTKEY_STATE
}

/// 解析 AHK 风格热键（支持 `^ ! + #` 与基础按键名）。
fn _parse_ahk_hotkey(raw: &str) -> Result<ParsedHotkey, String> {
    let text = raw.trim();
    if text.is_empty() {
        return Err("热键不能为空".to_string());
    }

    if let Some((prefix_text, suffix_text)) = _split_custom_combo_hotkey(text)? {
        let prefix_term = _parse_ahk_hotkey_term(prefix_text, false)?;
        let suffix_term = _parse_ahk_hotkey_term(suffix_text, true)?;

        return Ok(ParsedHotkey {
            ctrl: prefix_term.ctrl || suffix_term.ctrl,
            alt: prefix_term.alt || suffix_term.alt,
            shift: prefix_term.shift || suffix_term.shift,
            win: prefix_term.win || suffix_term.win,
            allow_extra_modifiers: prefix_term.allow_extra_modifiers || suffix_term.allow_extra_modifiers,
            key_vk: suffix_term.key_vk,
            combo_prefix_vk: Some(prefix_term.key_vk),
            trigger_on_key_up: suffix_term.trigger_on_key_up,
        });
    }

    let term = _parse_ahk_hotkey_term(text, true)?;

    Ok(ParsedHotkey {
        ctrl: term.ctrl,
        alt: term.alt,
        shift: term.shift,
        win: term.win,
        allow_extra_modifiers: term.allow_extra_modifiers,
        key_vk: term.key_vk,
        combo_prefix_vk: None,
        trigger_on_key_up: term.trigger_on_key_up,
    })
}

/// 解析单段 AHK 热键文本（支持前缀修饰符和 `Up`）。
fn _parse_ahk_hotkey_term(raw: &str, allow_key_up: bool) -> Result<ParsedHotkeyTerm, String> {
    let text = raw.trim();
    if text.is_empty() {
        return Err("热键不能为空".to_string());
    }

    let mut ctrl = false;
    let mut alt = false;
    let mut shift = false;
    let mut win = false;
    let mut allow_extra_modifiers = false;
    let mut index = 0usize;
    let bytes = text.as_bytes();

    while index < bytes.len() {
        let ch = bytes[index] as char;
        match ch {
            '^' => ctrl = true,
            '!' => alt = true,
            '+' => shift = true,
            '#' => win = true,
            '*' => allow_extra_modifiers = true,
            '~' | '$' => {}
            '<' | '>' => {
                // AHK 支持左右修饰符精确限定；当前实现先按通用修饰符处理。
            }
            _ => break,
        }
        index += 1;
    }

    let mut key_token = text[index..].trim().to_string();
    if key_token.is_empty() {
        return Err("热键缺少主键".to_string());
    }

    let mut trigger_on_key_up = false;
    if allow_key_up {
        if let Some(stripped) = key_token
            .to_ascii_lowercase()
            .strip_suffix(" up")
            .map(|_| key_token[..key_token.len() - 3].trim().to_string())
        {
            key_token = stripped;
            trigger_on_key_up = true;
        }
    }
    if key_token.is_empty() {
        return Err("热键缺少主键".to_string());
    }

    let key_vk = _parse_key_token_to_vk(&key_token)?;
    Ok(ParsedHotkeyTerm {
        ctrl,
        alt,
        shift,
        win,
        allow_extra_modifiers,
        key_vk,
        trigger_on_key_up,
    })
}

/// 解析 `A & B` 自定义组合键写法。
fn _split_custom_combo_hotkey(raw: &str) -> Result<Option<(&str, &str)>, String> {
    let mut parts = raw.split('&');
    let Some(prefix_part) = parts.next() else {
        return Ok(None);
    };
    let Some(suffix_part) = parts.next() else {
        return Ok(None);
    };
    if parts.next().is_some() {
        return Err("暂不支持多重 `&` 组合（例如 `a & b & c`）".to_string());
    }

    let prefix = prefix_part.trim();
    let suffix = suffix_part.trim();
    if prefix.is_empty() || suffix.is_empty() {
        return Err("`&` 组合热键格式无效，请使用类似 `CapsLock & c` 的写法".to_string());
    }
    Ok(Some((prefix, suffix)))
}

/// 将按键文本解析为虚拟键码。
fn _parse_key_token_to_vk(token: &str) -> Result<u32, String> {
    let normalized = token.trim().to_uppercase();
    if normalized.is_empty() {
        return Err("按键不能为空".to_string());
    }

    if normalized.len() == 1 {
        let ch = normalized.chars().next().unwrap_or_default();
        if ch.is_ascii_alphabetic() || ch.is_ascii_digit() {
            return Ok(ch as u32);
        }
    }

    if let Some(number_text) = normalized.strip_prefix('F') {
        if let Ok(num) = number_text.parse::<u32>() {
            return match num {
                1 => Ok(VK_F1.0 as u32),
                2 => Ok(VK_F2.0 as u32),
                3 => Ok(VK_F3.0 as u32),
                4 => Ok(VK_F4.0 as u32),
                5 => Ok(VK_F5.0 as u32),
                6 => Ok(VK_F6.0 as u32),
                7 => Ok(VK_F7.0 as u32),
                8 => Ok(VK_F8.0 as u32),
                9 => Ok(VK_F9.0 as u32),
                10 => Ok(VK_F10.0 as u32),
                11 => Ok(VK_F11.0 as u32),
                12 => Ok(VK_F12.0 as u32),
                13 => Ok(VK_F13.0 as u32),
                14 => Ok(VK_F14.0 as u32),
                15 => Ok(VK_F15.0 as u32),
                16 => Ok(VK_F16.0 as u32),
                17 => Ok(VK_F17.0 as u32),
                18 => Ok(VK_F18.0 as u32),
                19 => Ok(VK_F19.0 as u32),
                20 => Ok(VK_F20.0 as u32),
                21 => Ok(VK_F21.0 as u32),
                22 => Ok(VK_F22.0 as u32),
                23 => Ok(VK_F23.0 as u32),
                24 => Ok(VK_F24.0 as u32),
                _ => Err(format!("不支持的功能键: {token}")),
            };
        }
    }

    if let Some(vk_text) = normalized.strip_prefix("VK") {
        if vk_text.is_empty() {
            return Err(format!("无效的 VK 按键写法: {token}"));
        }
        if let Ok(vk_hex) = u32::from_str_radix(vk_text, 16) {
            return Ok(vk_hex);
        }
        if let Ok(vk_dec) = vk_text.parse::<u32>() {
            return Ok(vk_dec);
        }
        return Err(format!("无效的 VK 按键写法: {token}"));
    }

    if normalized.starts_with("SC") {
        return Err(format!("暂不支持 SC 扫描码写法: {token}，请改用键名或 VK 写法"));
    }

    match normalized.as_str() {
        "CTRL" | "CONTROL" => Ok(VK_CONTROL.0 as u32),
        "LCTRL" | "LCONTROL" => Ok(VK_LCONTROL.0 as u32),
        "RCTRL" | "RCONTROL" => Ok(VK_RCONTROL.0 as u32),
        "ALT" => Ok(VK_MENU.0 as u32),
        "LALT" => Ok(VK_LMENU.0 as u32),
        "RALT" => Ok(VK_RMENU.0 as u32),
        "SHIFT" => Ok(VK_SHIFT.0 as u32),
        "LSHIFT" => Ok(VK_LSHIFT.0 as u32),
        "RSHIFT" => Ok(VK_RSHIFT.0 as u32),
        "WIN" | "LWIN" => Ok(VK_LWIN.0 as u32),
        "RWIN" => Ok(VK_RWIN.0 as u32),
        "APPSKEY" | "APPS" => Ok(VK_APPS.0 as u32),
        "TAB" => Ok(VK_TAB.0 as u32),
        "ENTER" | "RETURN" => Ok(VK_RETURN.0 as u32),
        "ESC" | "ESCAPE" => Ok(VK_ESCAPE.0 as u32),
        "PAUSE" | "BREAK" => Ok(VK_PAUSE.0 as u32),
        "PRINTSCREEN" | "PRTSC" | "PRTSCN" => Ok(VK_SNAPSHOT.0 as u32),
        "SPACE" => Ok(VK_SPACE.0 as u32),
        "LEFT" => Ok(VK_LEFT.0 as u32),
        "RIGHT" => Ok(VK_RIGHT.0 as u32),
        "UP" => Ok(VK_UP.0 as u32),
        "DOWN" => Ok(VK_DOWN.0 as u32),
        "HOME" => Ok(VK_HOME.0 as u32),
        "END" => Ok(VK_END.0 as u32),
        "PGUP" | "PRIOR" => Ok(VK_PRIOR.0 as u32),
        "PGDN" | "NEXT" => Ok(VK_NEXT.0 as u32),
        "INS" | "INSERT" => Ok(VK_INSERT.0 as u32),
        "DEL" | "DELETE" => Ok(VK_DELETE.0 as u32),
        "BACKSPACE" | "BS" => Ok(VK_BACK.0 as u32),
        "CAPSLOCK" => Ok(VK_CAPITAL.0 as u32),
        "NUMLOCK" => Ok(VK_NUMLOCK.0 as u32),
        "SCROLLLOCK" => Ok(VK_SCROLL.0 as u32),
        "NUMPAD0" | "NUMPADINS" => Ok(VK_NUMPAD0.0 as u32),
        "NUMPAD1" | "NUMPADEND" => Ok(VK_NUMPAD1.0 as u32),
        "NUMPAD2" | "NUMPADDOWN" => Ok(VK_NUMPAD2.0 as u32),
        "NUMPAD3" | "NUMPADPGDN" => Ok(VK_NUMPAD3.0 as u32),
        "NUMPAD4" | "NUMPADLEFT" => Ok(VK_NUMPAD4.0 as u32),
        "NUMPAD5" | "NUMPADCLEAR" => Ok(VK_NUMPAD5.0 as u32),
        "NUMPAD6" | "NUMPADRIGHT" => Ok(VK_NUMPAD6.0 as u32),
        "NUMPAD7" | "NUMPADHOME" => Ok(VK_NUMPAD7.0 as u32),
        "NUMPAD8" | "NUMPADUP" => Ok(VK_NUMPAD8.0 as u32),
        "NUMPAD9" | "NUMPADPGUP" => Ok(VK_NUMPAD9.0 as u32),
        "NUMPADDOT" | "NUMPADDEL" => Ok(VK_DECIMAL.0 as u32),
        "NUMPADADD" => Ok(VK_ADD.0 as u32),
        "NUMPADSUB" => Ok(VK_SUBTRACT.0 as u32),
        "NUMPADMULT" => Ok(VK_MULTIPLY.0 as u32),
        "NUMPADDIV" => Ok(VK_DIVIDE.0 as u32),
        "NUMPADENTER" => Ok(VK_RETURN.0 as u32),
        "NUMPADSEP" => Ok(VK_SEPARATOR.0 as u32),
        "CLEAR" => Ok(VK_CLEAR.0 as u32),
        "LBUTTON" => Ok(VK_LBUTTON.0 as u32),
        "RBUTTON" => Ok(VK_RBUTTON.0 as u32),
        "MBUTTON" => Ok(VK_MBUTTON.0 as u32),
        "XBUTTON1" => Ok(VK_XBUTTON1.0 as u32),
        "XBUTTON2" => Ok(VK_XBUTTON2.0 as u32),
        _ => Err(format!("不支持的按键写法: {token}")),
    }
}

fn _set_app_handle(app_handle: tauri::AppHandle) {
    if let Ok(mut guard) = _hotkey_state().app_handle.lock() {
        *guard = Some(app_handle);
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum HotIfToken {
    Id,
    Pid,
    Exe,
    Class,
    Group,
}

/// 将 `WinActive("...")` 的 WinTitle 字符串解析为可匹配条件。
fn _parse_hot_if_win_active_criteria(raw: &str) -> Result<Option<HotIfWinActiveCriteria>, String> {
    let text = raw.trim();
    if text.is_empty() {
        return Ok(None);
    }

    let mut criteria = HotIfWinActiveCriteria::default();
    let lowered = text.to_ascii_lowercase();

    let mut first_token_pos: Option<usize> = None;
    let mut cursor = 0usize;
    while let Some((token_pos, token, value_start)) = _find_next_hot_if_token(&lowered, cursor) {
        if first_token_pos.is_none() {
            first_token_pos = Some(token_pos);
        }
        let next_token_pos = _find_next_hot_if_token(&lowered, value_start)
            .map(|(pos, _, _)| pos)
            .unwrap_or(text.len());
        let value = text[value_start..next_token_pos].trim();

        match token {
            HotIfToken::Id => {
                if value.is_empty() {
                    return Err("`ahk_id` 缺少值".to_string());
                }
                criteria.hwnd_id = Some(_parse_hot_if_u64(value).map_err(|e| format!("`ahk_id` 无效：{e}"))?);
            }
            HotIfToken::Pid => {
                if value.is_empty() {
                    return Err("`ahk_pid` 缺少值".to_string());
                }
                let pid64 = _parse_hot_if_u64(value).map_err(|e| format!("`ahk_pid` 无效：{e}"))?;
                let pid = u32::try_from(pid64).map_err(|_| "`ahk_pid` 超出范围".to_string())?;
                criteria.pid = Some(pid);
            }
            HotIfToken::Exe => {
                if value.is_empty() {
                    return Err("`ahk_exe` 缺少值".to_string());
                }
                criteria.exe_name = Some(value.to_string());
            }
            HotIfToken::Class => {
                if value.is_empty() {
                    return Err("`ahk_class` 缺少值".to_string());
                }
                criteria.class_name = Some(value.to_string());
            }
            HotIfToken::Group => {
                return Err("暂不支持 `ahk_group` 条件".to_string());
            }
        }

        cursor = next_token_pos;
    }

    if let Some(pos) = first_token_pos {
        let title_part = text[..pos].trim_end();
        if !title_part.trim().is_empty() {
            criteria.title = Some(title_part.trim().to_string());
        }
    } else {
        // AHK 语义：未使用 ahk_ 前缀时，WinTitle 按窗口标题匹配。
        criteria.title = Some(text.to_string());
    }

    Ok(Some(criteria))
}

/// 在 WinTitle 字符串中查找下一个 `ahk_` 特殊 token。
fn _find_next_hot_if_token(lowered: &str, from: usize) -> Option<(usize, HotIfToken, usize)> {
    let bytes = lowered.as_bytes();
    let mut index = from;
    while index + 4 <= bytes.len() {
        if &bytes[index..index + 4] != b"ahk_" {
            index += 1;
            continue;
        }
        if index > 0 && !bytes[index - 1].is_ascii_whitespace() {
            index += 1;
            continue;
        }

        let remain = &lowered[index + 4..];
        if remain.starts_with("id") {
            return Some((index, HotIfToken::Id, index + 6));
        }
        if remain.starts_with("pid") {
            return Some((index, HotIfToken::Pid, index + 7));
        }
        if remain.starts_with("exe") {
            return Some((index, HotIfToken::Exe, index + 7));
        }
        if remain.starts_with("class") {
            return Some((index, HotIfToken::Class, index + 9));
        }
        if remain.starts_with("group") {
            return Some((index, HotIfToken::Group, index + 9));
        }
        index += 1;
    }
    None
}

/// 解析 `ahk_pid` / `ahk_id` 数值（支持十进制和 `0x` 十六进制）。
fn _parse_hot_if_u64(text: &str) -> Result<u64, String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Err("值不能为空".to_string());
    }
    if let Some(hex) = trimmed
        .strip_prefix("0x")
        .or_else(|| trimmed.strip_prefix("0X"))
    {
        return u64::from_str_radix(hex, 16).map_err(|e| e.to_string());
    }
    trimmed.parse::<u64>().map_err(|e| e.to_string())
}

#[cfg(target_os = "windows")]
#[derive(Clone, Debug)]
struct ForegroundWindowInfo {
    hwnd_id: u64,
    pid: u32,
    title: String,
    class_name: String,
    exe_name: String,
}

#[cfg(target_os = "windows")]
/// 读取当前前台窗口所属进程名（仅文件名，如 `notepad.exe`）。
fn _get_foreground_window_info() -> Option<ForegroundWindowInfo> {
    let hwnd = unsafe { GetForegroundWindow() };
    if hwnd.0.is_null() {
        return None;
    }
    let hwnd_id = hwnd.0 as usize as u64;

    let mut pid = 0u32;
    unsafe {
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
    }
    if pid == 0 {
        return None;
    }
    let exe_name = _get_process_name_by_pid(pid)?;

    let mut title_buf = [0u16; 1024];
    let title_len = unsafe { GetWindowTextW(hwnd, &mut title_buf) };
    let title = String::from_utf16_lossy(&title_buf[..usize::try_from(title_len).unwrap_or(0)]);

    let mut class_buf = [0u16; 256];
    let class_len = unsafe { GetClassNameW(hwnd, &mut class_buf) };
    let class_name = String::from_utf16_lossy(&class_buf[..usize::try_from(class_len).unwrap_or(0)]);

    Some(ForegroundWindowInfo {
        hwnd_id,
        pid,
        title,
        class_name,
        exe_name,
    })
}

#[cfg(target_os = "windows")]
/// 根据 PID 获取进程名（不带路径）。
fn _get_process_name_by_pid(target_pid: u32) -> Option<String> {
    let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0).ok() }?;
    let mut entry = PROCESSENTRY32W::default();
    entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;

    let mut result: Option<String> = None;
    if unsafe { Process32FirstW(snapshot, &mut entry).is_ok() } {
        loop {
            if entry.th32ProcessID == target_pid {
                let process_name = String::from_utf16_lossy(&entry.szExeFile);
                result = Some(process_name.trim_matches('\0').to_string());
                break;
            }
            if !unsafe { Process32NextW(snapshot, &mut entry).is_ok() } {
                break;
            }
        }
    }

    let _ = unsafe { CloseHandle(snapshot) };
    result
}

#[cfg(target_os = "windows")]
/// 按 AHK `WinActive(WinTitle)` 语义匹配当前前台窗口。
fn _matches_hot_if_win_active(criteria: &HotIfWinActiveCriteria) -> bool {
    let info = if let Some(info) = _get_foreground_window_info() {
        info
    } else {
        return false;
    };

    if let Some(hwnd_id) = criteria.hwnd_id {
        if info.hwnd_id != hwnd_id {
            return false;
        }
    }
    if let Some(pid) = criteria.pid {
        if info.pid != pid {
            return false;
        }
    }
    if let Some(title) = criteria.title.as_deref() {
        // 对齐 AHK 默认 SetTitleMatchMode=2（FIND_ANYWHERE）。
        if !title.is_empty() && !info.title.contains(title) {
            return false;
        }
    }
    if let Some(class_name) = criteria.class_name.as_deref() {
        // AHK 非正则模式下 ahk_class 为大小写不敏感精确匹配。
        if !info.class_name.eq_ignore_ascii_case(class_name) {
            return false;
        }
    }
    if let Some(exe_name) = criteria.exe_name.as_deref() {
        // AHK 非正则模式下 ahk_exe 为大小写不敏感精确匹配。
        if !info.exe_name.eq_ignore_ascii_case(exe_name) {
            return false;
        }
    }

    true
}

#[cfg(not(target_os = "windows"))]
fn _matches_hot_if_win_active(_criteria: &HotIfWinActiveCriteria) -> bool {
    true
}

#[cfg(target_os = "windows")]
fn _matches_hot_if_win_active_text(raw: &str) -> bool {
    let parsed = match _parse_hot_if_win_active_criteria(raw) {
        Ok(v) => v,
        Err(_) => return false,
    };
    if let Some(criteria) = parsed {
        return _matches_hot_if_win_active(&criteria);
    }
    true
}

#[cfg(not(target_os = "windows"))]
fn _matches_hot_if_win_active_text(_raw: &str) -> bool {
    true
}

fn _is_ctrl_pressed(pressed: &HashSet<u32>) -> bool {
    pressed.contains(&(VK_CONTROL.0 as u32))
        || pressed.contains(&(VK_LCONTROL.0 as u32))
        || pressed.contains(&(VK_RCONTROL.0 as u32))
}

fn _is_alt_pressed(pressed: &HashSet<u32>) -> bool {
    pressed.contains(&(VK_MENU.0 as u32))
        || pressed.contains(&(VK_LMENU.0 as u32))
        || pressed.contains(&(VK_RMENU.0 as u32))
}

fn _is_shift_pressed(pressed: &HashSet<u32>) -> bool {
    pressed.contains(&(VK_SHIFT.0 as u32))
        || pressed.contains(&(VK_LSHIFT.0 as u32))
        || pressed.contains(&(VK_RSHIFT.0 as u32))
}

fn _is_win_pressed(pressed: &HashSet<u32>) -> bool {
    pressed.contains(&(VK_LWIN.0 as u32)) || pressed.contains(&(VK_RWIN.0 as u32))
}

/// 判断一个逻辑按键（例如 `Ctrl`）是否在当前按下集合中。
fn _is_vk_pressed(target_vk: u32, pressed: &HashSet<u32>) -> bool {
    if target_vk == VK_CONTROL.0 as u32 {
        return _is_ctrl_pressed(pressed);
    }
    if target_vk == VK_MENU.0 as u32 {
        return _is_alt_pressed(pressed);
    }
    if target_vk == VK_SHIFT.0 as u32 {
        return _is_shift_pressed(pressed);
    }
    if target_vk == VK_LWIN.0 as u32 {
        return pressed.contains(&(VK_LWIN.0 as u32));
    }
    if target_vk == VK_RWIN.0 as u32 {
        return pressed.contains(&(VK_RWIN.0 as u32));
    }
    pressed.contains(&target_vk)
}

/// 判断事件按键是否与配置按键相符（兼容中性修饰键与左右修饰键）。
fn _vk_matches(target_vk: u32, event_vk: u32) -> bool {
    if target_vk == VK_CONTROL.0 as u32 {
        return event_vk == VK_CONTROL.0 as u32 || event_vk == VK_LCONTROL.0 as u32 || event_vk == VK_RCONTROL.0 as u32;
    }
    if target_vk == VK_MENU.0 as u32 {
        return event_vk == VK_MENU.0 as u32 || event_vk == VK_LMENU.0 as u32 || event_vk == VK_RMENU.0 as u32;
    }
    if target_vk == VK_SHIFT.0 as u32 {
        return event_vk == VK_SHIFT.0 as u32 || event_vk == VK_LSHIFT.0 as u32 || event_vk == VK_RSHIFT.0 as u32;
    }
    target_vk == event_vk
}

fn _binding_matches(parsed: &ParsedHotkey, vk: u32, is_key_down: bool, pressed: &HashSet<u32>) -> bool {
    if parsed.trigger_on_key_up == is_key_down {
        return false;
    }
    if !_vk_matches(parsed.key_vk, vk) {
        return false;
    }
    if let Some(combo_prefix_vk) = parsed.combo_prefix_vk {
        if !_is_vk_pressed(combo_prefix_vk, pressed) {
            return false;
        }
    }

    let ctrl = _is_ctrl_pressed(pressed);
    let alt = _is_alt_pressed(pressed);
    let shift = _is_shift_pressed(pressed);
    let win = _is_win_pressed(pressed);

    if parsed.ctrl && !ctrl {
        return false;
    }
    if parsed.alt && !alt {
        return false;
    }
    if parsed.shift && !shift {
        return false;
    }
    if parsed.win && !win {
        return false;
    }

    if !parsed.allow_extra_modifiers
        && (ctrl != parsed.ctrl || alt != parsed.alt || shift != parsed.shift || win != parsed.win)
    {
        return false;
    }

    true
}

/// 判断按住循环时热键是否仍处于“按住”状态。
fn _is_binding_held(parsed: &ParsedHotkey, pressed: &HashSet<u32>) -> bool {
    if !_is_vk_pressed(parsed.key_vk, pressed) {
        return false;
    }
    if let Some(prefix_vk) = parsed.combo_prefix_vk {
        if !_is_vk_pressed(prefix_vk, pressed) {
            return false;
        }
    }

    let ctrl = _is_ctrl_pressed(pressed);
    let alt = _is_alt_pressed(pressed);
    let shift = _is_shift_pressed(pressed);
    let win = _is_win_pressed(pressed);

    if parsed.ctrl && !ctrl {
        return false;
    }
    if parsed.alt && !alt {
        return false;
    }
    if parsed.shift && !shift {
        return false;
    }
    if parsed.win && !win {
        return false;
    }
    if !parsed.allow_extra_modifiers
        && (ctrl != parsed.ctrl || alt != parsed.alt || shift != parsed.shift || win != parsed.win)
    {
        return false;
    }
    true
}

/// 判断当前绑定的生效条件是否满足。
fn _binding_condition_matches(binding: &RuntimeHotkeyBinding) -> bool {
    if let Some(criteria) = binding.hot_if_win_active_criteria.as_ref() {
        return _matches_hot_if_win_active(criteria);
    }
    if let Some(raw) = binding.hot_if_win_active.as_deref() {
        return _matches_hot_if_win_active_text(raw);
    }
    true
}

/// 启动“按住循环”热键任务。
fn _spawn_hold_loop(binding: RuntimeHotkeyBinding, app_handle: tauri::AppHandle) {
    let loop_flag = Arc::new(AtomicBool::new(true));
    if let Ok(mut guard) = _hotkey_state().hold_loop_flags.lock() {
        if let Some(prev) = guard.insert(binding.script_path.clone(), loop_flag.clone()) {
            prev.store(false, Ordering::Release);
        }
    }

    let script_path = binding.script_path.clone();
    let hotkey_text = binding.hotkey.clone();
    tauri::async_runtime::spawn(async move {
        let _ = app_handle.emit(
            "script-console",
            serde_json::json!({
                "scope": script_path.clone(),
                "level": "info",
                "message": format!("热键按住循环开始: {} ({})", script_path, hotkey_text),
            }),
        );

        loop {
            if !loop_flag.load(Ordering::Acquire) {
                break;
            }
            let should_continue = if let Ok(pressed) = _hotkey_state().pressed_keys.lock() {
                _is_binding_held(&binding.parsed, &pressed) && _binding_condition_matches(&binding)
            } else {
                false
            };
            if !should_continue {
                break;
            }

            if let Err(error) = run_script_file(script_path.clone(), app_handle.clone()).await {
                let _ = app_handle.emit(
                    "script-console",
                    serde_json::json!({
                        "scope": script_path.clone(),
                        "level": "error",
                        "message": format!("热键按住循环执行失败: {}，错误: {}", script_path, error),
                    }),
                );
                break;
            }
        }

        if let Ok(mut guard) = _hotkey_state().hold_loop_flags.lock() {
            if let Some(current_flag) = guard.get(&script_path) {
                if Arc::ptr_eq(current_flag, &loop_flag) {
                    guard.remove(&script_path);
                }
            }
        }
        let _ = app_handle.emit(
            "script-console",
            serde_json::json!({
                "scope": script_path.clone(),
                "level": "info",
                "message": format!("热键按住循环结束: {} ({})", script_path, hotkey_text),
            }),
        );
    });
}

fn _trigger_hotkey_scripts(vk: u32, is_key_down: bool, pressed: &HashSet<u32>) {
    let bindings = {
        if let Ok(guard) = _hotkey_state().bindings.read() {
            guard.values().cloned().collect::<Vec<_>>()
        } else {
            Vec::new()
        }
    };
    if bindings.is_empty() {
        return;
    }

    let app_handle = if let Ok(guard) = _hotkey_state().app_handle.lock() {
        guard.clone()
    } else {
        None
    };
    let Some(app_handle) = app_handle else {
        return;
    };

    let matched = bindings
        .into_iter()
        .filter(|binding| _binding_matches(&binding.parsed, vk, is_key_down, pressed) && _binding_condition_matches(binding))
        .collect::<Vec<_>>();

    for binding in matched {
        if binding.hold_to_loop {
            _spawn_hold_loop(binding, app_handle.clone());
            continue;
        }

        let runner_app_handle = app_handle.clone();
        let script_path = binding.script_path.clone();
        let hotkey_text = binding.hotkey.clone();
        tauri::async_runtime::spawn(async move {
            let _ = runner_app_handle.emit(
                "script-console",
                serde_json::json!({
                    "scope": script_path.clone(),
                    "level": "info",
                    "message": format!("热键触发脚本: {} ({})", script_path, hotkey_text),
                }),
            );
            match run_script_file(script_path.clone(), runner_app_handle.clone()).await {
                Ok(_) => {}
                Err(error) => {
                    let _ = runner_app_handle.emit(
                        "script-console",
                        serde_json::json!({
                            "scope": script_path.clone(),
                            "level": "error",
                            "message": format!("热键执行失败: {}，错误: {}", script_path, error),
                        }),
                    );
                }
            }
        });
    }
}

#[cfg(target_os = "windows")]
fn _process_hotkey_event(vk: u32, is_key_down: bool) {
    if let Ok(mut pressed_keys) = _hotkey_state().pressed_keys.lock() {
        if is_key_down {
            let inserted = pressed_keys.insert(vk);
            if inserted {
                _trigger_hotkey_scripts(vk, true, &pressed_keys);
            }
        } else {
            if pressed_keys.contains(&vk) {
                _trigger_hotkey_scripts(vk, false, &pressed_keys);
            }
            pressed_keys.remove(&vk);
        }
    }
}

#[cfg(target_os = "windows")]
unsafe extern "system" fn _low_level_keyboard_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code == HC_ACTION as i32 {
        let event = unsafe { *(lparam.0 as *const KBDLLHOOKSTRUCT) };
        let vk = event.vkCode;
        let message = wparam.0 as u32;
        let is_key_down = message == WM_KEYDOWN || message == WM_SYSKEYDOWN;
        let is_key_up = message == WM_KEYUP || message == WM_SYSKEYUP;

        if is_key_down || is_key_up {
            _process_hotkey_event(vk, is_key_down);
        }
    }

    unsafe { CallNextHookEx(None, code, wparam, lparam) }
}

#[cfg(target_os = "windows")]
unsafe extern "system" fn _low_level_mouse_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code == HC_ACTION as i32 {
        let event = unsafe { *(lparam.0 as *const MSLLHOOKSTRUCT) };
        let message = wparam.0 as u32;

        let (vk, is_key_down, is_key_up) = match message {
            WM_LBUTTONDOWN => (Some(VK_LBUTTON.0 as u32), true, false),
            WM_LBUTTONUP => (Some(VK_LBUTTON.0 as u32), false, true),
            WM_RBUTTONDOWN => (Some(VK_RBUTTON.0 as u32), true, false),
            WM_RBUTTONUP => (Some(VK_RBUTTON.0 as u32), false, true),
            WM_MBUTTONDOWN => (Some(VK_MBUTTON.0 as u32), true, false),
            WM_MBUTTONUP => (Some(VK_MBUTTON.0 as u32), false, true),
            WM_XBUTTONDOWN => {
                let xbutton = ((event.mouseData >> 16) & 0xFFFF) as u16;
                let vk = if xbutton == XBUTTON1 as u16 {
                    VK_XBUTTON1.0 as u32
                } else {
                    VK_XBUTTON2.0 as u32
                };
                (Some(vk), true, false)
            }
            WM_XBUTTONUP => {
                let xbutton = ((event.mouseData >> 16) & 0xFFFF) as u16;
                let vk = if xbutton == XBUTTON1 as u16 {
                    VK_XBUTTON1.0 as u32
                } else {
                    VK_XBUTTON2.0 as u32
                };
                (Some(vk), false, true)
            }
            _ => (None, false, false),
        };

        if let Some(vk) = vk {
            if is_key_down || is_key_up {
                _process_hotkey_event(vk, is_key_down);
            }
        }
    }

    unsafe { CallNextHookEx(None, code, wparam, lparam) }
}

#[cfg(target_os = "windows")]
fn _ensure_hook_thread_started() -> Result<(), String> {
    if _hotkey_state().hook_started.load(Ordering::Acquire) {
        return Ok(());
    }

    let (ready_tx, ready_rx) = std::sync::mpsc::channel::<Result<(), String>>();
    std::thread::Builder::new()
        .name("script-hotkey-hook".to_string())
        .spawn(move || unsafe {
            let keyboard_hook = match SetWindowsHookExW(WH_KEYBOARD_LL, Some(_low_level_keyboard_proc), None, 0) {
                Ok(hook) => hook,
                Err(error) => {
                    let _ = ready_tx.send(Err(format!("安装低级键盘钩子失败: {error}")));
                    return;
                }
            };
            if keyboard_hook.is_invalid() {
                let _ = ready_tx.send(Err("安装低级键盘钩子失败: 返回无效句柄".to_string()));
                return;
            }

            let mouse_hook = match SetWindowsHookExW(WH_MOUSE_LL, Some(_low_level_mouse_proc), None, 0) {
                Ok(hook) => hook,
                Err(error) => {
                    let _ = ready_tx.send(Err(format!("安装低级鼠标钩子失败: {error}")));
                    let _ = UnhookWindowsHookEx(keyboard_hook);
                    return;
                }
            };
            if mouse_hook.is_invalid() {
                let _ = ready_tx.send(Err("安装低级鼠标钩子失败: 返回无效句柄".to_string()));
                let _ = UnhookWindowsHookEx(keyboard_hook);
                return;
            }

            let _ = ready_tx.send(Ok(()));

            let mut msg = MSG::default();
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                let _ = TranslateMessage(&msg);
                let _ = DispatchMessageW(&msg);
            }
            let _ = UnhookWindowsHookEx(keyboard_hook);
            let _ = UnhookWindowsHookEx(mouse_hook);
        })
        .map_err(|e| format!("启动热键钩子线程失败: {e}"))?;

    match ready_rx.recv_timeout(Duration::from_secs(2)) {
        Ok(Ok(())) => {
            _hotkey_state().hook_started.store(true, Ordering::Release);
            Ok(())
        }
        Ok(Err(e)) => Err(e),
        Err(e) => Err(format!("等待热键钩子启动超时: {e}")),
    }
}

#[cfg(not(target_os = "windows"))]
fn _ensure_hook_thread_started() -> Result<(), String> {
    Err("当前平台不支持热键钩子".to_string())
}

/// 同步脚本热键绑定（后端将以此列表作为最新配置）。
pub fn sync_script_hotkey_bindings(
    app_handle: tauri::AppHandle,
    bindings: Vec<ScriptHotkeyBinding>,
) -> Result<(), String> {
    _set_app_handle(app_handle);
    if !bindings.is_empty() {
        _ensure_hook_thread_started()?;
    }

    let mut next_map: HashMap<String, RuntimeHotkeyBinding> = HashMap::new();
    for binding in bindings {
        let hotkey = binding.hotkey.trim().to_string();
        let script_path = binding.script_path.trim().to_string();
        if script_path.is_empty() || hotkey.is_empty() {
            continue;
        }
        let normalized_script_path = normalize_script_path(script_path.clone())?;
        let parsed = _parse_ahk_hotkey(&hotkey).map_err(|e| format!("热键 `{hotkey}` 无效：{e}"))?;
        if binding.hold_to_loop && parsed.trigger_on_key_up {
            return Err(format!("热键 `{hotkey}` 配置了按住循环，但 `Up` 抬起触发不支持按住循环"));
        }
        let hot_if_win_active = {
            let text = binding.hot_if_win_active.trim().to_string();
            if text.is_empty() {
                None
            } else {
                Some(text)
            }
        };
        let hot_if_win_active_criteria = if let Some(raw) = hot_if_win_active.as_deref() {
            _parse_hot_if_win_active_criteria(raw)
                .map_err(|e| format!("热键 `{hotkey}` 的 WinActive 条件无效：{e}"))?
        } else {
            None
        };
        next_map.insert(
            normalized_script_path.clone(),
            RuntimeHotkeyBinding {
                script_path: normalized_script_path,
                hotkey,
                hot_if_win_active,
                hot_if_win_active_criteria,
                hold_to_loop: binding.hold_to_loop,
                parsed,
            },
        );
    }

    if let Ok(mut guard) = _hotkey_state().hold_loop_flags.lock() {
        for flag in guard.values() {
            flag.store(false, Ordering::Release);
        }
        guard.clear();
    }

    if let Ok(mut guard) = _hotkey_state().bindings.write() {
        *guard = next_map;
    }
    if let Ok(mut pressed_keys) = _hotkey_state().pressed_keys.lock() {
        pressed_keys.clear();
    }

    Ok(())
}

/// 获取当前后端已生效的脚本热键绑定。
pub fn get_script_hotkey_bindings() -> Vec<ScriptHotkeyBinding> {
    if let Ok(guard) = _hotkey_state().bindings.read() {
        return guard
            .values()
            .map(|binding| ScriptHotkeyBinding {
                script_path: binding.script_path.clone(),
                hotkey: binding.hotkey.clone(),
                hot_if_win_active: binding.hot_if_win_active.clone().unwrap_or_default(),
                hold_to_loop: binding.hold_to_loop,
            })
            .collect();
    }
    Vec::new()
}

#[cfg(all(test, target_os = "windows"))]
mod tests {
    use super::*;

    #[test]
    fn parse_custom_combo_capslock() {
        let parsed = _parse_ahk_hotkey("CapsLock & c").expect("should parse combo hotkey");
        assert_eq!(parsed.combo_prefix_vk, Some(VK_CAPITAL.0 as u32));
        assert_eq!(parsed.key_vk, 'C' as u32);
        assert!(!parsed.trigger_on_key_up);
    }

    #[test]
    fn parse_key_up_hotkey() {
        let parsed = _parse_ahk_hotkey("^c Up").expect("should parse key-up hotkey");
        assert!(parsed.ctrl);
        assert_eq!(parsed.key_vk, 'C' as u32);
        assert!(parsed.trigger_on_key_up);
    }

    #[test]
    fn parse_numpad_hotkey() {
        let parsed = _parse_ahk_hotkey("NumpadAdd").expect("should parse numpad key");
        assert_eq!(parsed.key_vk, VK_ADD.0 as u32);
        assert!(parsed.combo_prefix_vk.is_none());
    }

    #[test]
    fn parse_mouse_hotkey() {
        let parsed = _parse_ahk_hotkey("RButton").expect("should parse mouse key");
        assert_eq!(parsed.key_vk, VK_RBUTTON.0 as u32);
    }

    #[test]
    fn parse_mouse_combo_hotkey() {
        let parsed = _parse_ahk_hotkey("RButton & XButton1").expect("should parse mouse combo");
        assert_eq!(parsed.combo_prefix_vk, Some(VK_RBUTTON.0 as u32));
        assert_eq!(parsed.key_vk, VK_XBUTTON1.0 as u32);
    }

    #[test]
    fn parse_hot_if_win_active_value() {
        let title_only = _parse_hot_if_win_active_criteria("Moonlight")
            .expect("should parse title")
            .expect("criteria should exist");
        assert_eq!(title_only.title.as_deref(), Some("Moonlight"));
        assert!(title_only.exe_name.is_none());

        let title_and_exe = _parse_hot_if_win_active_criteria("Moonlight ahk_exe EM-Win64-Shipping.exe")
            .expect("should parse title+exe")
            .expect("criteria should exist");
        assert_eq!(title_and_exe.title.as_deref(), Some("Moonlight"));
        assert_eq!(title_and_exe.exe_name.as_deref(), Some("EM-Win64-Shipping.exe"));
    }
}
