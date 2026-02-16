use std::sync::{Arc, LazyLock, Mutex};
use std::thread;
use std::time::Duration;
use windows::Win32::Foundation::{
    COLORREF, ERROR_CLASS_ALREADY_EXISTS, GetLastError, HWND, LPARAM, LRESULT, RECT, WPARAM,
};
use windows::Win32::Graphics::Gdi::{
    BLACKNESS, BeginPaint, CreateSolidBrush, DeleteObject, EndPaint, FillRect, GetDC, HBRUSH, HDC,
    PAINTSTRUCT, PatBlt, ReleaseDC,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, HWND_TOPMOST, RegisterClassExW, SW_HIDE, SW_SHOW, SWP_NOACTIVATE,
    SWP_NOOWNERZORDER, SetWindowPos, ShowWindow, WNDCLASSEXW, WS_EX_LAYERED, WS_EX_TOOLWINDOW,
    WS_EX_TRANSPARENT, WS_POPUP,
};
use windows::Win32::UI::WindowsAndMessaging::{
    DefWindowProcW, HCURSOR, HICON, IsWindow, WM_DESTROY, WM_PAINT, WNDCLASS_STYLES,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GWLP_USERDATA, GetWindowLongPtrW, SetWindowLongPtrW,
};
use windows::core::{HSTRING, PCWSTR};

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

use std::sync::atomic::{AtomicBool, Ordering};

use crate::submodules::win::win_get_client_pos;

/// 覆盖层管理器结构体，包含覆盖层实例和上一次的标志位
struct OverlayManager {
    overlay: Option<RectOverlay>,
    last_flag: Option<Arc<std::sync::atomic::AtomicBool>>,
}

/// 全局覆盖层管理器实例
static OVERLAY_MANAGER: LazyLock<Arc<Mutex<OverlayManager>>> = LazyLock::new(|| {
    Arc::new(Mutex::new(OverlayManager {
        overlay: None,
        last_flag: None,
    }))
});

/// 绘制边框函数
/// 使用独立的透明窗口来绘制边框
pub fn draw_border(hwnd: HWND, x: i32, y: i32, width: i32, height: i32, c: Option<u32>) {
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

    // 获取或创建覆盖层实例
    if let Ok(mut manager_guard) = OVERLAY_MANAGER.lock() {
        // 设置上一次的标志位为 true，让之前的隐藏线程退出
        if let Some(last_flag) = manager_guard.last_flag.take() {
            last_flag.store(true, Ordering::SeqCst);
        }

        let overlay = manager_guard
            .overlay
            .get_or_insert_with(|| RectOverlay::new());

        // 显示边框
        overlay.show(abs_x, abs_y, width, height, color);

        // 创建独立的标志位
        let flag = Arc::new(AtomicBool::new(false));
        // 保存当前标志位供下次使用
        manager_guard.last_flag = Some(flag.clone());

        // 2秒后隐藏
        thread::spawn(move || {
            // 等待2秒
            thread::sleep(Duration::from_millis(2000));

            // 检查标志位，如果为 true 则退出
            if flag.load(Ordering::SeqCst) {
                return;
            }

            // 仅在锁内做状态校验与句柄读取，避免持锁调用 ShowWindow 导致跨线程互锁。
            let hwnd_to_hide = if let Ok(manager_guard) = OVERLAY_MANAGER.lock() {
                // 再次确认当前线程对应的是最新一次 draw_border 的隐藏任务，避免旧任务误隐藏新边框。
                let is_current_task = manager_guard
                    .last_flag
                    .as_ref()
                    .is_some_and(|current_flag| Arc::ptr_eq(current_flag, &flag));
                if !is_current_task {
                    None
                } else {
                    manager_guard.overlay.as_ref().and_then(|overlay| overlay.hwnd)
                }
            } else {
                None
            };

            if let Some(target_hwnd) = hwnd_to_hide {
                unsafe {
                    let _ = ShowWindow(target_hwnd, SW_HIDE);
                }
            }
        });
    }
}
