use std::sync::{Arc, LazyLock, Mutex};
use std::thread;
use std::time::Duration;
use windows::Win32::Foundation::{COLORREF, HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::Graphics::Gdi::{
    BeginPaint, CreatePen, DeleteObject, EndPaint, HBRUSH, LineTo, MoveToEx, PAINTSTRUCT, PS_SOLID,
    ReleaseDC, RestoreDC, SaveDC, SelectObject,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, HWND_TOPMOST, RegisterClassExW, SW_HIDE, SW_SHOW, SWP_NOACTIVATE,
    SWP_NOOWNERZORDER, SetWindowPos, ShowWindow, WNDCLASSEXW, WS_EX_LAYERED, WS_EX_TOOLWINDOW,
    WS_EX_TRANSPARENT, WS_POPUP,
};
use windows::Win32::UI::WindowsAndMessaging::{
    DefWindowProcW, HCURSOR, HICON, WM_DESTROY, WM_PAINT, WNDCLASS_STYLES,
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
                return false;
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

    /// 隐藏覆盖层
    fn hide(&mut self) {
        if let Some(hwnd) = self.hwnd {
            unsafe {
                let _ = ShowWindow(hwnd, SW_HIDE);
            }
        }
    }

    /// 绘制边框
    fn draw_border(&self) {
        if let Some(hwnd) = self.hwnd {
            unsafe {
                // 规范 WM_PAINT 处理：BeginPaint / EndPaint 配对调用
                let mut ps = PAINTSTRUCT::default();
                let hdc = BeginPaint(hwnd, &mut ps);
                if hdc.0 == std::ptr::null_mut() {
                    return;
                }

                // 转换颜色格式：RGB -> BGR (Windows GDI 使用 BGR 格式)
                let r = (self.color >> 16) & 0xFF;
                let g = (self.color >> 8) & 0xFF;
                let b = self.color & 0xFF;
                let bgr_color = (b << 16) | (g << 8) | r;

                // 创建画笔
                let pen = CreatePen(PS_SOLID, 2, COLORREF(bgr_color));
                if pen.0 == std::ptr::null_mut() {
                    ReleaseDC(Some(hwnd), hdc);
                    return;
                }

                // 选择画笔
                let old_pen = SelectObject(hdc, pen.into());

                // 保存当前设备上下文状态
                let _ = SaveDC(hdc);

                // 绘制矩形边框（使用四个直线绘制，避免填充）
                // 上边框
                let _ = MoveToEx(hdc, 0, 0, None);
                let _ = LineTo(hdc, self.width, 0);
                // 右边框
                let _ = MoveToEx(hdc, self.width, 0, None);
                let _ = LineTo(hdc, self.width, self.height);
                // 下边框
                let _ = MoveToEx(hdc, self.width, self.height, None);
                let _ = LineTo(hdc, 0, self.height);
                // 左边框
                let _ = MoveToEx(hdc, 0, self.height, None);
                let _ = LineTo(hdc, 0, 0);

                // 恢复设备上下文状态
                let _ = RestoreDC(hdc, -1);

                // 恢复旧画笔
                SelectObject(hdc, old_pen);

                // 清理资源
                let _ = DeleteObject(pen.into());
                ReleaseDC(Some(hwnd), hdc);
                let _ = EndPaint(hwnd, &ps);
            }
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
                // 从窗口用户数据获取实例指针

                // 从窗口用户数据获取实例指针
                let self_ptr = unsafe { GetWindowLongPtrW(hwnd, GWLP_USERDATA) } as *mut Self;
                if !self_ptr.is_null() {
                    let this = unsafe { &*self_ptr };
                    this.draw_border();
                }
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
pub fn draw_border(hwnd: HWND, x1: i32, y1: i32, x2: i32, y2: i32, c: Option<u32>) {
    // 检查窗口是否有效
    if hwnd.0 == std::ptr::null_mut() {
        return;
    }

    // 处理颜色参数
    let color = c.unwrap_or(0xFF0000);

    // 获取客户端区域位置
    let (x, y, _client_width, _client_height) = win_get_client_pos(hwnd).unwrap_or_default();

    // 计算绝对坐标
    let x = x + x1;
    let y = y + y1;
    let width = x2 - x1;
    let height = y2 - y1;

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
        overlay.show(x, y, width, height, color);

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

            // 尝试获取锁，隐藏边框
            if let Ok(mut manager_guard) = OVERLAY_MANAGER.lock() {
                // 检查是否是当前活动的标志位
                if let Some(overlay) = manager_guard.overlay.as_mut() {
                    overlay.hide();
                }
            }
        });
    }
}
