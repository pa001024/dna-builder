use crate::submodules::script::{normalize_script_path, run_script_file};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, LazyLock, Mutex, RwLock};
use std::time::Duration;
use tauri::Emitter;

#[cfg(target_os = "windows")]
use windows::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
#[cfg(target_os = "windows")]
use windows::Win32::UI::Input::KeyboardAndMouse::{
    VK_BACK, VK_CAPITAL, VK_CONTROL, VK_DELETE, VK_DOWN, VK_END, VK_ESCAPE, VK_F1, VK_F10, VK_F11, VK_F12, VK_F13, VK_F14, VK_F15,
    VK_F16, VK_F17, VK_F18, VK_F19, VK_F2, VK_F20, VK_F21, VK_F22, VK_F23, VK_F24, VK_F3, VK_F4, VK_F5, VK_F6, VK_F7, VK_F8, VK_F9,
    VK_HOME, VK_INSERT, VK_LCONTROL, VK_LEFT, VK_LMENU, VK_LSHIFT, VK_LWIN, VK_MENU, VK_NEXT, VK_PRIOR, VK_RCONTROL, VK_RETURN, VK_RIGHT,
    VK_RMENU, VK_RSHIFT, VK_RWIN, VK_SHIFT, VK_SPACE, VK_TAB, VK_UP,
};
#[cfg(target_os = "windows")]
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, GetMessageW, HC_ACTION, KBDLLHOOKSTRUCT, MSG, SetWindowsHookExW, TranslateMessage,
    UnhookWindowsHookEx, WH_KEYBOARD_LL, WM_KEYDOWN, WM_KEYUP, WM_SYSKEYDOWN, WM_SYSKEYUP,
};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptHotkeyBinding {
    pub script_path: String,
    pub hotkey: String,
}

#[derive(Clone, Debug)]
struct ParsedHotkey {
    ctrl: bool,
    alt: bool,
    shift: bool,
    win: bool,
    allow_extra_modifiers: bool,
    key_vk: u32,
}

#[derive(Clone, Debug)]
struct RuntimeHotkeyBinding {
    script_path: String,
    hotkey: String,
    parsed: ParsedHotkey,
}

struct HotkeyState {
    app_handle: Mutex<Option<tauri::AppHandle>>,
    bindings: RwLock<HashMap<String, RuntimeHotkeyBinding>>,
    pressed_keys: Mutex<HashSet<u32>>,
    hook_started: AtomicBool,
}

static HOTKEY_STATE: LazyLock<Arc<HotkeyState>> = LazyLock::new(|| {
    Arc::new(HotkeyState {
        app_handle: Mutex::new(None),
        bindings: RwLock::new(HashMap::new()),
        pressed_keys: Mutex::new(HashSet::new()),
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

    let key_token = text[index..].trim();
    if key_token.is_empty() {
        return Err("热键缺少主键".to_string());
    }
    let key_vk = _parse_key_token_to_vk(key_token)?;

    Ok(ParsedHotkey {
        ctrl,
        alt,
        shift,
        win,
        allow_extra_modifiers,
        key_vk,
    })
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

    match normalized.as_str() {
        "TAB" => Ok(VK_TAB.0 as u32),
        "ENTER" | "RETURN" => Ok(VK_RETURN.0 as u32),
        "ESC" | "ESCAPE" => Ok(VK_ESCAPE.0 as u32),
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
        _ => Err(format!("不支持的按键写法: {token}")),
    }
}

fn _set_app_handle(app_handle: tauri::AppHandle) {
    if let Ok(mut guard) = _hotkey_state().app_handle.lock() {
        *guard = Some(app_handle);
    }
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

fn _is_modifier_vk(vk: u32) -> bool {
    vk == VK_CONTROL.0 as u32
        || vk == VK_LCONTROL.0 as u32
        || vk == VK_RCONTROL.0 as u32
        || vk == VK_MENU.0 as u32
        || vk == VK_LMENU.0 as u32
        || vk == VK_RMENU.0 as u32
        || vk == VK_SHIFT.0 as u32
        || vk == VK_LSHIFT.0 as u32
        || vk == VK_RSHIFT.0 as u32
        || vk == VK_LWIN.0 as u32
        || vk == VK_RWIN.0 as u32
}

fn _binding_matches(parsed: &ParsedHotkey, vk: u32, pressed: &HashSet<u32>) -> bool {
    if parsed.key_vk != vk {
        return false;
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

fn _trigger_hotkey_scripts(vk: u32, pressed: &HashSet<u32>) {
    if _is_modifier_vk(vk) {
        return;
    }

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
        .filter(|binding| _binding_matches(&binding.parsed, vk, pressed))
        .collect::<Vec<_>>();

    for binding in matched {
        let runner_app_handle = app_handle.clone();
        let script_path = binding.script_path.clone();
        let hotkey_text = binding.hotkey.clone();
        tauri::async_runtime::spawn(async move {
            let _ = runner_app_handle.emit(
                "script-console",
                serde_json::json!({
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
unsafe extern "system" fn _low_level_keyboard_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code == HC_ACTION as i32 {
        let event = unsafe { *(lparam.0 as *const KBDLLHOOKSTRUCT) };
        let vk = event.vkCode;
        let message = wparam.0 as u32;
        let is_key_down = message == WM_KEYDOWN || message == WM_SYSKEYDOWN;
        let is_key_up = message == WM_KEYUP || message == WM_SYSKEYUP;

        if is_key_down || is_key_up {
            if let Ok(mut pressed_keys) = _hotkey_state().pressed_keys.lock() {
                if is_key_down {
                    let inserted = pressed_keys.insert(vk);
                    if inserted {
                        _trigger_hotkey_scripts(vk, &pressed_keys);
                    }
                } else {
                    pressed_keys.remove(&vk);
                }
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
            let hook = match SetWindowsHookExW(WH_KEYBOARD_LL, Some(_low_level_keyboard_proc), None, 0) {
                Ok(hook) => hook,
                Err(error) => {
                    let _ = ready_tx.send(Err(format!("安装低级键盘钩子失败: {error}")));
                    return;
                }
            };
            if hook.is_invalid() {
                let _ = ready_tx.send(Err("安装低级键盘钩子失败: 返回无效句柄".to_string()));
                return;
            }
            let _ = ready_tx.send(Ok(()));

            let mut msg = MSG::default();
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                let _ = TranslateMessage(&msg);
                let _ = DispatchMessageW(&msg);
            }
            let _ = UnhookWindowsHookEx(hook);
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
        next_map.insert(
            normalized_script_path.clone(),
            RuntimeHotkeyBinding {
                script_path: normalized_script_path,
                hotkey,
                parsed,
            },
        );
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
            })
            .collect();
    }
    Vec::new()
}
