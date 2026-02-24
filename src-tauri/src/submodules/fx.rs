use std::sync::{Arc, LazyLock, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use windows::Win32::Foundation::{
    COLORREF, ERROR_CLASS_ALREADY_EXISTS, GetLastError, HWND, LPARAM, LRESULT, RECT, WPARAM,
};
use windows::Win32::Graphics::Gdi::{
    BLACKNESS, BeginPaint, CreateSolidBrush, DeleteObject, EndPaint, FillRect, GetDC, HBRUSH, HDC,
    PAINTSTRUCT, PatBlt, ReleaseDC,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, HWND_TOPMOST, RegisterClassExW, SW_HIDE, SW_SHOW, SWP_HIDEWINDOW, SWP_NOACTIVATE,
    SWP_NOMOVE, SWP_NOSIZE, SWP_NOOWNERZORDER, SetWindowPos, ShowWindow, ShowWindowAsync, WNDCLASSEXW,
    WS_EX_LAYERED, WS_EX_TOOLWINDOW, WS_EX_TRANSPARENT, WS_POPUP,
};
use windows::Win32::UI::WindowsAndMessaging::{
    DefWindowProcW, HCURSOR, HICON, IsWindow, WM_DESTROY, WM_PAINT, WNDCLASS_STYLES,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GWLP_USERDATA, GetWindowLongPtrW, SetWindowLongPtrW,
};
use windows::core::{HSTRING, PCWSTR};

/// drawBorder 默认显示时长（毫秒）。
const DEFAULT_BORDER_TIMEOUT_MS: u64 = 2_000;

/// 矩形覆盖层结构体，用于绘制边框
struct RectOverlay {
    hwnd: Option<HWND>,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
    color: u32,
}

// 不安全地实现Send trait，因为我们知道HWND可以在线程间安全传递
unsafe impl Send for RectOverlay {}

// 不安全地实现Sync trait
unsafe impl Sync for RectOverlay {}

impl RectOverlay {
    /// 创建新的矩形覆盖层
    fn new() -> Self {
        Self {
            hwnd: None,
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            color: 0xFF000000,
        }
    }

    /// 初始化覆盖层窗口
    fn init(&mut self) -> bool {
        if self.hwnd.is_some() {
            return true;
        }

        unsafe {
            // 窗口类名
            let class_name = HSTRING::from("RectOverlayClass");

            // 注册窗口类
            let wnd_class = WNDCLASSEXW {
                cbSize: std::mem::size_of::<WNDCLASSEXW>() as u32,
                style: WNDCLASS_STYLES(0),
                lpfnWndProc: Some(Self::window_proc),
                cbClsExtra: 0,
                cbWndExtra: std::mem::size_of::<*mut Self>() as i32, // 为用户数据预留空间
                hInstance: windows::Win32::System::LibraryLoader::GetModuleHandleW(None)
                    .unwrap_or_default()
                    .into(),
                hIcon: HICON(std::ptr::null_mut()),
                hCursor: HCURSOR(std::ptr::null_mut()),
                hbrBackground: HBRUSH(std::ptr::null_mut()),
                lpszMenuName: PCWSTR(std::ptr::null()),
                lpszClassName: PCWSTR(class_name.as_ptr()),
                hIconSm: HICON(std::ptr::null_mut()),
            };

            // 注册窗口类
            let atom = RegisterClassExW(&wnd_class);
            if atom == 0 {
                // 窗口类已注册时允许继续创建窗口，避免脚本二次运行后无法显示。
                let last_error = GetLastError();
                if last_error != ERROR_CLASS_ALREADY_EXISTS {
                    return false;
                }
            }

            // 创建窗口
            let hwnd = CreateWindowExW(
                WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW,
                PCWSTR(class_name.as_ptr()),
                PCWSTR(std::ptr::null()),
                WS_POPUP,
                0,
                0,
                100,
                100,
                None,
                None,
                Some(
                    windows::Win32::System::LibraryLoader::GetModuleHandleW(None)
                        .unwrap_or_default()
                        .into(),
                ),
                None,
            );

            match hwnd {
                Ok(hwnd) => {
                    self.hwnd = Some(hwnd);

                    // 存储指向实例的指针到窗口用户数据
                    let self_ptr = self as *mut Self;
                    SetWindowLongPtrW(hwnd, GWLP_USERDATA, self_ptr as isize);

                    // 设置分层窗口属性，使窗口透明
                    // 导入 SetLayeredWindowAttributes 函数
                    use windows::Win32::UI::WindowsAndMessaging::LAYERED_WINDOW_ATTRIBUTES_FLAGS;
                    use windows::Win32::UI::WindowsAndMessaging::SetLayeredWindowAttributes;

                    // 设置透明度为255（不透明），但背景透明
                    let _ = SetLayeredWindowAttributes(
                        hwnd,
                        COLORREF(0),
                        255,
                        LAYERED_WINDOW_ATTRIBUTES_FLAGS(0x00000001), // LWA_COLORKEY
                    );

                    true
                }
                Err(_) => false,
            }
        }
    }

    /// 显示覆盖层并绘制边框
    fn show(&mut self, x: i32, y: i32, width: i32, height: i32, color: u32) -> bool {
        if width <= 0 || height <= 0 {
            return false;
        }

        // 保存绘制参数
        self.x = x;
        self.y = y;
        self.width = width;
        self.height = height;
        self.color = color;

        // 句柄失效时重建，避免脚本结束后再次运行时出现空白不显示。
        if let Some(hwnd) = self.hwnd {
            unsafe {
                if !IsWindow(Some(hwnd)).as_bool() {
                    self.hwnd = None;
                }
            }
        }

        // 初始化窗口
        if !self.init() {
            return false;
        }

        // 显示窗口并设置位置
        if let Some(hwnd) = self.hwnd {
            unsafe {
                // 设置窗口位置和大小
                let _ = SetWindowPos(
                    hwnd,
                    Some(HWND_TOPMOST), // 使用正确的 HWND_TOPMOST 常量
                    x,
                    y,
                    width,
                    height,
                    SWP_NOACTIVATE | SWP_NOOWNERZORDER,
                );

                // 显示窗口
                let _ = ShowWindow(hwnd, SW_SHOW);

                // 直接绘制边框
                self.draw_border();
            }
        } else {
            return false;
        }

        true
    }

    /// 绘制边框
    fn draw_border(&self) {
        if let Some(hwnd) = self.hwnd {
            unsafe {
                // 主动绘制时使用 GetDC，避免 BeginPaint/EndPaint 与消息流程错配。
                let hdc = GetDC(Some(hwnd));
                if hdc.0 == std::ptr::null_mut() {
                    return;
                }
                self.draw_border_to_hdc(hdc);
                let _ = ReleaseDC(Some(hwnd), hdc);
            }
        }
    }

    /// 在指定设备上下文绘制边框。
    fn draw_border_to_hdc(&self, hdc: HDC) {
        unsafe {
            // 每次重绘前先将整个窗口刷成黑色（与 LWA_COLORKEY 一致为透明），避免旧边框残留叠加。
            let _ = PatBlt(hdc, 0, 0, self.width, self.height, BLACKNESS);

            // 转换颜色格式：RGB -> BGR (Windows GDI 使用 BGR 格式)
            let r = (self.color >> 16) & 0xFF;
            let g = (self.color >> 8) & 0xFF;
            let b = self.color & 0xFF;
            let bgr_color = (b << 16) | (g << 8) | r;

            // 使用实心画刷填充四条边，确保四边视觉等宽。
            let brush = CreateSolidBrush(COLORREF(bgr_color));
            if brush.0 == std::ptr::null_mut() {
                return;
            }

            let thickness = 1.max(1).min(self.width.min(self.height));
            let top_rect = RECT {
                left: 0,
                top: 0,
                right: self.width,
                bottom: thickness,
            };
            let bottom_rect = RECT {
                left: 0,
                top: (self.height - thickness).max(0),
                right: self.width,
                bottom: self.height,
            };
            let left_rect = RECT {
                left: 0,
                top: 0,
                right: thickness,
                bottom: self.height,
            };
            let right_rect = RECT {
                left: (self.width - thickness).max(0),
                top: 0,
                right: self.width,
                bottom: self.height,
            };
            let _ = FillRect(hdc, &top_rect, brush);
            let _ = FillRect(hdc, &bottom_rect, brush);
            let _ = FillRect(hdc, &left_rect, brush);
            let _ = FillRect(hdc, &right_rect, brush);

            // 清理资源
            let _ = DeleteObject(brush.into());
        }
    }

    /// 窗口过程
    unsafe extern "system" fn window_proc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        match msg {
            WM_PAINT => {
                // 使用标准 BeginPaint/EndPaint 流程处理重绘消息。
                let mut ps = PAINTSTRUCT::default();
                let hdc = unsafe { BeginPaint(hwnd, &mut ps) };
                let self_ptr = unsafe { GetWindowLongPtrW(hwnd, GWLP_USERDATA) } as *mut Self;
                if !self_ptr.is_null() {
                    let this = unsafe { &*self_ptr };
                    this.draw_border_to_hdc(hdc);
                }
                let _ = unsafe { EndPaint(hwnd, &ps) };
                LRESULT(0)
            }
            WM_DESTROY => {
                // 处理销毁消息
                unsafe { DefWindowProcW(hwnd, msg, wparam, lparam) }
            }
            _ => {
                // 其他消息
                unsafe { DefWindowProcW(hwnd, msg, wparam, lparam) }
            }
        }
    }
}

use crate::submodules::win::win_get_client_pos;

/// 覆盖层管理器结构体，包含覆盖层实例和隐藏任务序号。
struct OverlayManager {
    overlay: Option<RectOverlay>,
    hide_deadline_at: Option<Instant>,
    hide_worker_running: bool,
}

/// 全局覆盖层管理器实例
static OVERLAY_MANAGER: LazyLock<Arc<Mutex<OverlayManager>>> = LazyLock::new(|| {
    Arc::new(Mutex::new(OverlayManager {
        overlay: None,
        hide_deadline_at: None,
        hide_worker_running: false,
    }))
});

/// 隐藏边框窗口（跨线程调用时优先使用异步隐藏）。
fn hide_overlay_window(target_hwnd: HWND) {
    unsafe {
        if !IsWindow(Some(target_hwnd)).as_bool() {
            return;
        }
        let _ = ShowWindowAsync(target_hwnd, SW_HIDE);
        let _ = SetWindowPos(
            target_hwnd,
            None,
            0,
            0,
            0,
            0,
            SWP_HIDEWINDOW | SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOOWNERZORDER,
        );
    }
}

/// 确保边框隐藏后台线程只启动一次，避免高频 drawBorder 导致线程爆炸。
fn ensure_overlay_hide_worker_running() {
    let should_spawn = if let Ok(mut manager_guard) = OVERLAY_MANAGER.lock() {
        if manager_guard.hide_worker_running {
            false
        } else {
            manager_guard.hide_worker_running = true;
            true
        }
    } else {
        false
    };
    if !should_spawn {
        return;
    }

    thread::spawn(move || {
        loop {
            let mut hwnd_to_hide: Option<HWND> = None;
            let mut should_exit = false;

            if let Ok(mut manager_guard) = OVERLAY_MANAGER.lock() {
                match manager_guard.hide_deadline_at {
                    Some(deadline) => {
                        if Instant::now() >= deadline {
                            manager_guard.hide_deadline_at = None;
                            hwnd_to_hide = manager_guard.overlay.as_ref().and_then(|overlay| overlay.hwnd);
                        }
                    }
                    None => {
                        manager_guard.hide_worker_running = false;
                        should_exit = true;
                    }
                }
            }

            if let Some(target_hwnd) = hwnd_to_hide {
                hide_overlay_window(target_hwnd);
            }
            if should_exit {
                break;
            }

            thread::sleep(Duration::from_millis(30));
        }
    });
}

/// 立即隐藏 drawBorder 覆盖层。
///
/// 设计说明：
/// 1. 先清理隐藏截止时间，停止当前显示；
/// 2. 再执行窗口隐藏，确保脚本终止后边框可立即消失。
pub fn hide_border_immediately() {
    let hwnd_to_hide = if let Ok(mut manager_guard) = OVERLAY_MANAGER.lock() {
        manager_guard.hide_deadline_at = None;
        manager_guard.overlay.as_ref().and_then(|overlay| overlay.hwnd)
    } else {
        None
    };

    if let Some(target_hwnd) = hwnd_to_hide {
        hide_overlay_window(target_hwnd);
    }
}

/// 绘制边框函数
/// 使用独立的透明窗口来绘制边框
pub fn draw_border(
    hwnd: HWND,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
    c: Option<u32>,
    timeout_ms: Option<u64>,
) {
    // 检查窗口是否有效
    if hwnd.0 == std::ptr::null_mut() {
        return;
    }

    // 处理颜色参数
    let color = c.unwrap_or(0xFF0000);

    // 获取客户端区域位置并换算为屏幕坐标。
    let (client_x, client_y, _client_width, _client_height) =
        win_get_client_pos(hwnd).unwrap_or_default();
    let abs_x = client_x + x;
    let abs_y = client_y + y;

    // 检查参数有效性
    if width <= 0 || height <= 0 {
        return;
    }

    // 归一化显示时长。非正值按 0 处理，表示尽快隐藏。
    let hide_delay_ms = timeout_ms.unwrap_or(DEFAULT_BORDER_TIMEOUT_MS);

    // 获取或创建覆盖层实例
    let mut should_ensure_worker = false;
    if let Ok(mut manager_guard) = OVERLAY_MANAGER.lock() {
        let overlay = manager_guard
            .overlay
            .get_or_insert_with(|| RectOverlay::new());

        // 显示边框
        overlay.show(abs_x, abs_y, width, height, color);

        manager_guard.hide_deadline_at = Some(Instant::now() + Duration::from_millis(hide_delay_ms));
        should_ensure_worker = true;
    }
    if should_ensure_worker {
        ensure_overlay_hide_worker_running();
    }
}
