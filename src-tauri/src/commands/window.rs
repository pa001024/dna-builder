//! 窗口命令：系统材质（Blur/Acrylic/Mica）、Win32 窗口样式与技能 CD 倒计时浮窗。

use serde::Deserialize;

use crate::submodules::{float_window, win};

/// 窗口样式参数。
#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum WindowStyleArg {
    Number(i32),
    Text(String),
}

/// 应用系统窗口材质（供托盘菜单与前端命令共用）。
#[tauri::command]
pub(crate) fn apply_material(window: tauri::WebviewWindow, material: &str) -> String {
    #[cfg(target_os = "windows")]
    {
        use window_vibrancy::*;
        {
            let _ = clear_blur(&window);
            let _ = clear_acrylic(&window);
            let _ = clear_mica(&window);
            let _ = clear_tabbed(&window);
        }
        match material {
            "None" => {}
            "Blur" => {
                if apply_blur(&window, Some((0, 0, 0, 0))).is_err() {
                    return "Unsupported platform! 'apply_blur' is only supported on Windows 7, Windows 10 v1809 or newer"
                .to_string();
                }
            }
            "Acrylic" => {
                if apply_acrylic(&window, Some((0, 0, 0, 0))).is_err() {
                    return "Unsupported platform! 'apply_acrylic' is only supported on Windows 10 v1809 or newer"
                .to_string();
                }
            }
            "Mica" => {
                if apply_mica(&window, Some(false)).is_err() {
                    return "Unsupported platform! 'apply_mica' is only supported on Windows 11"
                        .to_string();
                }
            }
            "Mica_Dark" => {
                if apply_mica(&window, Some(true)).is_err() {
                    return "Unsupported platform! 'apply_mica' is only supported on Windows 11"
                        .to_string();
                }
            }
            "Mica_Tabbed" => {
                if apply_tabbed(&window, Some(false)).is_err() {
                    return "Unsupported platform! 'apply_mica' is only supported on Windows 11"
                        .to_string();
                }
            }
            "Mica_Tabbed_Dark" => {
                if apply_tabbed(&window, Some(true)).is_err() {
                    return "Unsupported platform! 'apply_mica' is only supported on Windows 11"
                        .to_string();
                }
            }
            _ => return "Unsupported material!".to_string(),
        }
    }
    "Success".to_string()
}

/// 修改指定窗口样式。
#[tauri::command]
pub fn set_window_style(
    hwnd: isize,
    style: WindowStyleArg,
    ex_style: Option<i32>,
) -> Result<(), String> {
    let hwnd = windows::Win32::Foundation::HWND(hwnd as *mut std::ffi::c_void);
    match style {
        WindowStyleArg::Number(style) => {
            win::set_window_style(hwnd, style, ex_style).map_err(|error| error.to_string())
        }
        WindowStyleArg::Text(expression) => {
            if ex_style.is_some() {
                return Err("setWindowStyle 传入字符串样式时不允许提供第三个参数".to_string());
            }
            let (style, ex_style) = win::apply_window_style_expression(hwnd, &expression)?;
            win::set_window_style(hwnd, style, Some(ex_style)).map_err(|error| error.to_string())
        }
    }
}

/// 根据进程名获取窗口句柄。
#[tauri::command]
pub fn get_window_by_process_name(process_name: String) -> Result<isize, String> {
    win::get_window_by_process_name(&process_name)
        .map(|hwnd| hwnd.0 as isize)
        .ok_or_else(|| format!("未找到进程对应窗口: {process_name}"))
}

/// 启动/更新通用倒计时浮窗(E 技能 CD 倒计时;包含按键触发等配置)。
#[tauri::command]
pub fn float_window_set(
    config: float_window::FloatWindowConfig,
) -> Result<float_window::FloatWindowState, String> {
    float_window::set(config)
}

/// 停止通用倒计时浮窗。
#[tauri::command]
pub fn float_window_disable() -> Result<String, String> {
    float_window::disable();
    Ok("倒计时浮窗已关闭".to_string())
}

/// 通用入口:推送/重设一个倒计时条目(如 Q 技能、道具 CD)。
#[tauri::command]
pub fn float_window_trigger(
    id: String,
    label: String,
    total_seconds: f64,
) -> Result<float_window::FloatWindowState, String> {
    float_window::trigger(&id, &label, total_seconds)
}

/// 查询倒计时浮窗当前状态。
#[tauri::command]
pub fn float_window_state() -> float_window::FloatWindowState {
    float_window::state()
}
