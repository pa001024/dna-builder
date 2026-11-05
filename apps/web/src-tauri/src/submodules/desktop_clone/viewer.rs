//! 克隆窗口：Tauri 窗口生命周期、原生宿主子窗口定位、覆盖层可见性与关闭拦截。
//!
//! WebView2 的不透明 DirectComposition 表面不遵守兄弟 HWND 的 z-order（airspace），
//! 因此连接且没有网页弹层时把 `WRY_WEBVIEW` 收成标题栏条，让原生 RDP 宿主占据其余区域；
//! 其余状态把 WebView2 展开整窗并隐藏宿主。

use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicIsize, AtomicU32, Ordering};
use std::time::Duration;

use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, WindowEvent,
};
use windows::Win32::Foundation::{HWND, POINT, RECT};
use windows::Win32::Graphics::Gdi::ClientToScreen;
use windows::Win32::UI::WindowsAndMessaging::{
    GW_CHILD, GW_HWNDNEXT, GWL_STYLE, GetClassNameW, GetClientRect, GetWindow, GetWindowLongPtrW,
    IsWindow, SWP_NOACTIVATE, SWP_NOZORDER, SetWindowLongPtrW, SetWindowPos, WS_CLIPCHILDREN,
    WS_CLIPSIBLINGS,
};

use super::settings::{
    self, ASPECT_HEIGHT, ASPECT_WIDTH, CloneGeometry, CloneOptions, MIN_WINDOW_HEIGHT,
    MIN_WINDOW_WIDTH, SmallWindowMode,
};
use super::{CloneManager, CloneState, WINDOW_LABEL};

/// 位置/尺寸变更后的落盘防抖时长。
const GEOMETRY_SAVE_DELAY: Duration = Duration::from_millis(300);
/// wry 的 WebView2 子窗口类名。
const WEBVIEW_CLASS: &str = "WRY_WEBVIEW";
/// wry 可能在父窗口 `WM_SIZE` 之后再次把 WebView2 拉满：延迟一拍复核。
const LAYOUT_SETTLE_DELAY: Duration = Duration::from_millis(60);
/// 找不到 WebView2 子窗口时的重试间隔与次数上限。
const WEBVIEW_FIND_RETRY_DELAY: Duration = Duration::from_millis(50);
const MAX_WEBVIEW_FIND_RETRIES: u32 = 20;

/// 几何防抖状态：只允许一个延迟任务在跑，新事件只更新代次。
struct GeometryDebounce {
    generation: u64,
    running: bool,
}

static GEOMETRY_SAVE: Mutex<GeometryDebounce> = Mutex::new(GeometryDebounce {
    generation: 0,
    running: false,
});
/// 程序化改尺寸时记录期望值：下一次 Resized 命中它就不再套用 16:9 校正。
static EXPECTED_SIZE: Mutex<Option<(f64, f64)>> = Mutex::new(None);

/// 缓存的 `WRY_WEBVIEW` 句柄（isize 便于跨线程缓存；使用前用 `IsWindow` 校验）。
static WEBVIEW_HWND: AtomicIsize = AtomicIsize::new(0);
/// 延迟重排任务是否已在队列里（避免拖动缩放时堆积）。
static LAYOUT_PENDING: AtomicBool = AtomicBool::new(false);
/// 连续找不到 `WRY_WEBVIEW` 的次数（找到后归零）。
static WEBVIEW_FIND_RETRY: AtomicU32 = AtomicU32::new(0);

/// 最近一次布局摘要（诊断用）。
#[derive(Clone)]
struct LayoutReport {
    stripped: bool,
    webview_found: bool,
    webview: WebviewRect,
    host: HostRect,
    host_visible: bool,
    result: String,
    settled: bool,
    /// 延迟复核时发现 WebView2 尺寸与期望不符（wry 拉满）并已纠正。
    corrected: bool,
}

static LAYOUT_REPORT: Mutex<Option<LayoutReport>> = Mutex::new(None);

/// 原生宿主子窗口矩形（物理像素，相对 Tauri 窗口客户区）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct HostRect {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

/// WebView2 子窗口矩形（物理像素，相对 Tauri 窗口客户区）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WebviewRect {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

/// 一次布局的完整结果：WebView2 矩形、宿主矩形与宿主可见性。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CloneLayout {
    /// WebView2 是否收成标题栏条（等价于宿主应当可见）。
    pub stripped: bool,
    pub webview: WebviewRect,
    pub host: HostRect,
    pub host_visible: bool,
}

/// 标题栏以下区域内最大的 16:9 矩形（居中），保证画面不被非等比拉伸。
pub fn host_rect(client_width: i32, client_height: i32, chrome_physical: i32) -> HostRect {
    let chrome = chrome_physical.max(0);
    let available_width = client_width.max(0);
    let available_height = (client_height - chrome).max(0);
    let (width, height) = aspect_fit(available_width, available_height);
    HostRect {
        x: (available_width - width) / 2,
        y: chrome + (available_height - height) / 2,
        width,
        height,
    }
}

/// 在给定区域内取最大的 16:9 整数矩形：先由高度推宽度，再由宽度回推高度。
fn aspect_fit(available_width: i32, available_height: i32) -> (i32, i32) {
    if available_width <= 0 || available_height <= 0 {
        return (0, 0);
    }
    let width_from_height = (available_height as f64 * ASPECT_WIDTH / ASPECT_HEIGHT).round() as i32;
    let width = available_width.min(width_from_height).max(1);
    let height = (width as f64 * ASPECT_HEIGHT / ASPECT_WIDTH)
        .round()
        .max(1.0) as i32;
    (width, height.min(available_height))
}

/// WebView2 子窗口矩形：条状模式只占标题栏，其余占满客户区。
pub fn webview_rect(
    client_width: i32,
    client_height: i32,
    chrome_physical: i32,
    stripped: bool,
) -> WebviewRect {
    let width = client_width.max(0);
    let height = client_height.max(0);
    if !stripped {
        return WebviewRect {
            x: 0,
            y: 0,
            width,
            height,
        };
    }
    WebviewRect {
        x: 0,
        y: 0,
        width,
        height: chrome_physical.clamp(0, height),
    }
}

/// 几何/状态矩阵：连接且无弹层时 WebView2 条状 + 宿主可见，其余状态下 WebView2 整窗 + 宿主隐藏。
pub fn clone_layout(
    state: CloneState,
    overlay_visible: bool,
    client_width: i32,
    client_height: i32,
    chrome_physical: i32,
) -> CloneLayout {
    let stripped = super::host_should_be_visible(state, overlay_visible);
    CloneLayout {
        stripped,
        webview: webview_rect(client_width, client_height, chrome_physical, stripped),
        host: host_rect(client_width, client_height, chrome_physical),
        host_visible: stripped,
    }
}

/// 克隆窗口父 HWND（主线程调用）。
pub fn parent_hwnd(app: &AppHandle) -> Result<HWND, String> {
    let window = app
        .get_webview_window(WINDOW_LABEL)
        .ok_or_else(|| "克隆窗口未创建".to_string())?;
    let hwnd = window
        .hwnd()
        .map_err(|error| format!("获取克隆窗口句柄失败: {error}"))?;
    Ok(HWND(hwnd.0))
}

/// 按当前客户区、DPI 与标题栏逻辑高度计算宿主矩形（主线程调用）。
pub fn compute_host_rect(app: &AppHandle, chrome_height: f64) -> Result<HostRect, String> {
    let window = app
        .get_webview_window(WINDOW_LABEL)
        .ok_or_else(|| "克隆窗口未创建".to_string())?;
    let hwnd = parent_hwnd(app)?;
    let scale = window.scale_factor().unwrap_or(1.0);
    let mut client = RECT::default();
    unsafe { GetClientRect(hwnd, &mut client) }
        .map_err(|error| format!("读取克隆窗口客户区失败: {error}"))?;
    let chrome_physical = (chrome_height * scale).round() as i32;
    Ok(host_rect(client.right, client.bottom, chrome_physical))
}

// ---------------------------------------------------------------- WebView2 child

fn window_class(hwnd: HWND) -> String {
    let mut buffer = [0u16; 64];
    let length = unsafe { GetClassNameW(hwnd, &mut buffer) };
    if length <= 0 {
        String::new()
    } else {
        String::from_utf16_lossy(&buffer[..length as usize])
    }
}

/// 缓存并返回 `WRY_WEBVIEW` 子窗口；缓存失效时按类名遍历直接子窗口重新查找。
fn find_webview_hwnd(parent: HWND) -> Option<HWND> {
    let cached = HWND(WEBVIEW_HWND.load(Ordering::SeqCst) as *mut core::ffi::c_void);
    if !cached.0.is_null() && unsafe { IsWindow(Some(cached)) }.as_bool() {
        return Some(cached);
    }
    WEBVIEW_HWND.store(0, Ordering::SeqCst);

    let mut child = unsafe { GetWindow(parent, GW_CHILD) }.ok()?;
    while !child.0.is_null() {
        if window_class(child) == WEBVIEW_CLASS {
            WEBVIEW_HWND.store(child.0 as isize, Ordering::SeqCst);
            return Some(child);
        }
        child = match unsafe { GetWindow(child, GW_HWNDNEXT) } {
            Ok(next) => next,
            Err(_) => break,
        };
    }
    None
}

/// 窗口销毁/重建后丢弃缓存。
pub fn reset_webview_cache() {
    WEBVIEW_HWND.store(0, Ordering::SeqCst);
    WEBVIEW_FIND_RETRY.store(0, Ordering::SeqCst);
}

/// 给子窗口补 `WS_CLIPSIBLINGS`，避免与同级窗口互相覆盖重绘。
fn ensure_child_style(hwnd: HWND) {
    unsafe {
        let style = GetWindowLongPtrW(hwnd, GWL_STYLE);
        let clipped = WS_CLIPSIBLINGS.0 as isize;
        if style & clipped == 0 {
            SetWindowLongPtrW(hwnd, GWL_STYLE, style | clipped);
        }
    }
}

/// 顶层窗口补 `WS_CLIPCHILDREN`：tao 在 show/置顶时会重设 `GWL_STYLE`，必须在这些动作之后重新补齐。
fn ensure_top_level_style_hwnd(hwnd: HWND) {
    unsafe {
        let style = GetWindowLongPtrW(hwnd, GWL_STYLE);
        let clipped = WS_CLIPCHILDREN.0 as isize;
        if style & clipped == 0 {
            SetWindowLongPtrW(hwnd, GWL_STYLE, style | clipped);
        }
    }
}

fn apply_webview_rect(hwnd: HWND, rect: WebviewRect) -> String {
    ensure_child_style(hwnd);
    match unsafe {
        SetWindowPos(
            hwnd,
            None,
            rect.x,
            rect.y,
            rect.width,
            rect.height,
            SWP_NOZORDER | SWP_NOACTIVATE,
        )
    } {
        Ok(()) => "OK".to_string(),
        Err(error) => format!("失败: {error}"),
    }
}

fn store_layout_report(report: LayoutReport) {
    *LAYOUT_REPORT
        .lock()
        .unwrap_or_else(|error| error.into_inner()) = Some(report);
}

/// 延迟一拍重新应用（wry 可能在父窗口 `WM_SIZE` 之后再把 WebView2 拉满 / 子窗口尚未创建）。
fn schedule_layout(app: &AppHandle, delay: Duration, settled: bool) {
    if LAYOUT_PENDING.swap(true, Ordering::SeqCst) {
        return;
    }
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(delay);
        let main_handle = handle.clone();
        let _ = handle.run_on_main_thread(move || {
            LAYOUT_PENDING.store(false, Ordering::SeqCst);
            apply_layout_on_main(&main_handle, settled);
        });
    });
}

/// 在主线程应用布局：WebView2 条状/整窗 + 宿主矩形与可见性 + 顶层样式。
///
/// `settled` 为假表示这一次是事件触发的首次应用，应用后再排一次延迟复核。
fn apply_layout_on_main(app: &AppHandle, settled: bool) {
    let Some(window) = app.get_webview_window(WINDOW_LABEL) else {
        reset_webview_cache();
        return;
    };
    if window.is_minimized().unwrap_or(false) {
        return;
    }
    let Ok(parent) = parent_hwnd(app) else {
        return;
    };
    let mut client = RECT::default();
    if unsafe { GetClientRect(parent, &mut client) }.is_err() {
        return;
    }
    // 只取快照后立即释放 managed state：后面的 ShowWindow 可能同步触发控件事件再取一次
    let (state, overlay_visible, chrome_height) = {
        let manager = app.state::<CloneManager>();
        (
            manager.state(),
            manager.overlay_visible(),
            manager.chrome_height(),
        )
    };
    let scale = window.scale_factor().unwrap_or(1.0);
    let chrome_physical = (chrome_height * scale).round() as i32;
    let layout = clone_layout(
        state,
        overlay_visible,
        client.right,
        client.bottom,
        chrome_physical,
    );

    // 展开 WebView2 前先隐藏宿主；收起 WebView2 后再显示宿主，避免重叠帧
    if !layout.host_visible {
        let _ = super::rdp_host::apply_layout(app, layout.host, false);
    }
    let mut report = LayoutReport {
        stripped: layout.stripped,
        webview_found: false,
        webview: layout.webview,
        host: layout.host,
        host_visible: layout.host_visible,
        result: "未找到 WRY_WEBVIEW".to_string(),
        settled,
        corrected: false,
    };
    if let Some(webview) = find_webview_hwnd(parent) {
        report.webview_found = true;
        // 延迟复核：记录 wry 是否又把 WebView2 拉满（诊断可见）
        if settled {
            let mut current = RECT::default();
            report.corrected = unsafe { GetClientRect(webview, &mut current) }.is_ok()
                && (current.right != layout.webview.width
                    || current.bottom != layout.webview.height);
        }
        report.result = apply_webview_rect(webview, layout.webview);
        WEBVIEW_FIND_RETRY.store(0, Ordering::SeqCst);
    } else if WEBVIEW_FIND_RETRY.fetch_add(1, Ordering::SeqCst) < MAX_WEBVIEW_FIND_RETRIES {
        // 子窗口可能尚未由 wry 创建：短延迟重试（有上限，避免永久轮询）
        schedule_layout(app, WEBVIEW_FIND_RETRY_DELAY, true);
    }
    if layout.host_visible {
        let _ = super::rdp_host::apply_layout(app, layout.host, true);
    }
    ensure_top_level_style_hwnd(parent);
    store_layout_report(report);

    // 非复核轮：再排一次延迟复核，纠正 wry 在 Resized 之后重新拉满的 WebView2
    if !settled {
        schedule_layout(app, LAYOUT_SETTLE_DELAY, true);
    }
}

/// 请求重排（可跨线程；总是投递到主线程，避免在控件事件回调里重入宿主）。
pub fn request_layout(app: &AppHandle) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || apply_layout_on_main(&handle, false));
}

/// 置顶/显示等操作会重设窗口样式：重新补齐顶层 `WS_CLIPCHILDREN` 并重排。
pub fn refresh_window_layout(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
        apply_top_level_style(&window);
    }
    request_layout(app);
}

/// 最近一次 WebView2/宿主布局摘要（诊断用）。
pub fn diagnostics() -> String {
    let report = LAYOUT_REPORT
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .clone();
    let Some(report) = report else {
        return "WebView2: 尚未布局".to_string();
    };
    let webview_hwnd = WEBVIEW_HWND.load(Ordering::SeqCst);
    let ratio = if report.host.height > 0 {
        report.host.width as f64 / report.host.height as f64
    } else {
        0.0
    };
    format!(
        "WebView2: {}；WRY HWND: {}；矩形: {}x{}@({}, {})；SetWindowPos: {}；宿主: {}x{}@({}, {})；视口比例: {:.3}:1；宿主可见: {}；{}",
        if report.stripped {
            "条状（标题栏）"
        } else {
            "整窗"
        },
        if report.webview_found {
            format!("0x{webview_hwnd:X}")
        } else {
            "未找到".to_string()
        },
        report.webview.width,
        report.webview.height,
        report.webview.x,
        report.webview.y,
        report.result,
        report.host.width,
        report.host.height,
        report.host.x,
        report.host.y,
        ratio,
        report.host_visible,
        match (report.settled, report.corrected) {
            (false, _) => "首次应用",
            (true, false) => "延迟复核",
            (true, true) => "延迟复核（已纠正 wry 拉满）",
        }
    )
}

// ---------------------------------------------------------------- window

/// 打开（或聚焦）克隆窗口。
///
/// `generation` 为连接代次：投递超时/取消后晚到的闭包直接放弃，不会再重建窗口。
pub fn open_window(
    app: &AppHandle,
    options: &CloneOptions,
    geometry: Option<&CloneGeometry>,
    generation: u64,
) -> Result<(), String> {
    let handle = app.clone();
    let options = options.clone();
    let geometry = geometry.copied();
    super::on_main_sync(app, move || {
        if !super::is_current_generation(generation) {
            return Err("连接请求已被取消".to_string());
        }
        open_window_on_main(&handle, &options, geometry)
    })?
}

fn open_window_on_main(
    app: &AppHandle,
    options: &CloneOptions,
    geometry: Option<CloneGeometry>,
) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window.set_always_on_top(options.always_on_top);
        refresh_window_layout(app);
        return Ok(());
    }

    let geometry = geometry.unwrap_or_default();
    let builder = WebviewWindowBuilder::new(
        app,
        WINDOW_LABEL,
        WebviewUrl::App("index.html#/desktop-clone".into()),
    )
    .title("桌面分身")
    .inner_size(geometry.width, geometry.height)
    .min_inner_size(MIN_WINDOW_WIDTH, MIN_WINDOW_HEIGHT)
    .position(geometry.x, geometry.y)
    .decorations(false)
    .transparent(false)
    // letterbox 黑边由窗口底色填充，避免露出未定义背景
    .background_color(tauri::window::Color(0, 0, 0, 255))
    .resizable(true)
    .visible(false)
    .focused(true)
    .skip_taskbar(false)
    .always_on_top(options.always_on_top);

    let window = builder
        .build()
        .map_err(|error| format!("创建克隆窗口失败: {error}"))?;
    apply_top_level_style(&window);
    ensure_on_screen(&window);
    install_window_events(app, &window);
    window
        .show()
        .map_err(|error| format!("显示克隆窗口失败: {error}"))?;
    let _ = window.set_focus();
    // tao 在 show 时重设 GWL_STYLE，必须在其后再补一次
    refresh_window_layout(app);
    Ok(())
}

/// 保存的几何可能落在已移除的显示器上：与所有显示器都不相交时居中到主显示器。
fn ensure_on_screen(window: &WebviewWindow) {
    let (Ok(position), Ok(size)) = (window.outer_position(), window.outer_size()) else {
        return;
    };
    let monitors = window.available_monitors().unwrap_or_default();
    let visible = monitors.iter().any(|monitor| {
        let origin = monitor.position();
        let extent = monitor.size();
        position.x < origin.x + extent.width as i32
            && position.x + size.width as i32 > origin.x
            && position.y < origin.y + extent.height as i32
            && position.y + size.height as i32 > origin.y
    });
    if !monitors.is_empty() && !visible {
        let _ = window.center();
    }
}

/// 给顶层窗口加 `WS_CLIPCHILDREN`，避免 WebView 重绘时覆盖宿主子窗口。
fn apply_top_level_style(window: &WebviewWindow) {
    let Ok(hwnd) = window.hwnd() else {
        return;
    };
    ensure_top_level_style_hwnd(HWND(hwnd.0));
}

fn install_window_events(app: &AppHandle, window: &WebviewWindow) {
    let handle = app.clone();
    window.on_window_event(move |event| match event {
        WindowEvent::Resized(_) | WindowEvent::ScaleFactorChanged { .. } => {
            reposition_host(&handle);
            apply_aspect_lock(&handle);
            schedule_geometry_save(&handle);
            super::input::sync(&handle);
        }
        WindowEvent::Moved(_) => {
            schedule_geometry_save(&handle);
            super::input::sync(&handle);
        }
        WindowEvent::Focused(focused) => {
            super::input::set_window_focused(&handle, *focused);
        }
        WindowEvent::CloseRequested { api, .. } => {
            super::input::set_window_focused(&handle, false);
            if super::intercept_close(&handle) {
                api.prevent_close();
            }
        }
        WindowEvent::Destroyed => {
            super::input::release(&handle);
            reset_webview_cache();
            super::handle_window_destroyed(&handle);
        }
        _ => {}
    });
}

/// 手动 resize 时把高度校正到「视口 16:9 + 标题栏」；程序化改尺寸后的首个事件不校正。
fn apply_aspect_lock(app: &AppHandle) {
    let manager = app.state::<CloneManager>();
    if !manager.options().aspect_lock {
        return;
    }
    let Some(window) = app.get_webview_window(WINDOW_LABEL) else {
        return;
    };
    if window.is_maximized().unwrap_or(false) || window.is_minimized().unwrap_or(false) {
        return;
    }
    let scale = window.scale_factor().unwrap_or(1.0).max(0.1);
    let Ok(size) = window.inner_size() else {
        return;
    };
    let width = size.width as f64 / scale;
    let height = size.height as f64 / scale;
    let chrome = manager.chrome_height();

    let expected = EXPECTED_SIZE
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .take();
    if let Some((expected_width, expected_height)) = expected {
        if (width - expected_width).abs() <= 2.0 && (height - expected_height).abs() <= 2.0 {
            return;
        }
    }

    if !settings::needs_window_aspect_correction(width, height, chrome, MIN_WINDOW_HEIGHT) {
        return;
    }
    let target = settings::window_aspect_height(width, chrome, MIN_WINDOW_HEIGHT);
    *EXPECTED_SIZE
        .lock()
        .unwrap_or_else(|error| error.into_inner()) = Some((width, target));
    let _ = window.set_size(LogicalSize::new(width, target));
}

/// 按当前状态/弹层/尺寸重排 WebView2 与宿主。
///
/// 同步执行（可能从命令线程投递）：前端 `set_overlay_visible` await 返回时布局已经生效。
pub fn reposition_host(app: &AppHandle) {
    let handle = app.clone();
    let _ = super::on_main_sync(app, move || apply_layout_on_main(&handle, false));
}

/// 更新标题栏逻辑高度并立即重排宿主。
pub fn set_chrome_height(app: &AppHandle, height: f64) {
    let manager = app.state::<CloneManager>();
    manager.set_chrome_height(height.clamp(0.0, 200.0));
    reposition_host(app);
}

/// 网页弹层打开时展开 WebView2 并隐藏原生子窗口；关闭后恢复条状。
pub fn set_overlay_visible(app: &AppHandle, visible: bool) {
    let manager = app.state::<CloneManager>();
    manager.set_overlay_visible(visible);
    // 前端在 await 本命令之后才显示弹层：布局必须同步完成
    reposition_host(app);
    super::input::sync(app);
}

/// 几何落盘防抖：只为最后一次变更启动一个延迟任务，避免每次 Resized 都起线程。
fn schedule_geometry_save(app: &AppHandle) {
    let mut state = GEOMETRY_SAVE
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    state.generation = state.generation.wrapping_add(1);
    let mut generation = state.generation;
    if state.running {
        return;
    }
    state.running = true;
    drop(state);

    let handle = app.clone();
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(GEOMETRY_SAVE_DELAY);
            let mut state = GEOMETRY_SAVE
                .lock()
                .unwrap_or_else(|error| error.into_inner());
            if state.generation == generation {
                state.running = false;
                drop(state);
                save_geometry(&handle);
                return;
            }
            // 期间又有新变更：继续等下一轮，只处理最新几何
            generation = state.generation;
        }
    });
}

fn save_geometry(app: &AppHandle) {
    let Some(window) = app.get_webview_window(WINDOW_LABEL) else {
        return;
    };
    if window.is_minimized().unwrap_or(false) || window.is_maximized().unwrap_or(false) {
        return;
    }
    let Ok(position) = window.outer_position() else {
        return;
    };
    let Ok(size) = window.inner_size() else {
        return;
    };
    let scale = window.scale_factor().unwrap_or(1.0).max(0.1);
    let geometry = CloneGeometry {
        x: position.x as f64 / scale,
        y: position.y as f64 / scale,
        width: size.width as f64 / scale,
        height: size.height as f64 / scale,
    };
    let manager = app.state::<CloneManager>();
    let mode = manager.options().small_window;
    manager.update_settings(|settings| settings.geometry.set(mode, geometry));
    super::persist_settings(app);
}

/// 读取窗口当前几何（逻辑像素）；最小化时返回 `None`。
fn current_geometry(window: &WebviewWindow) -> Option<CloneGeometry> {
    if window.is_minimized().unwrap_or(false) {
        return None;
    }
    let position = window.outer_position().ok()?;
    let size = window.inner_size().ok()?;
    let scale = window.scale_factor().unwrap_or(1.0).max(0.1);
    Some(CloneGeometry {
        x: position.x as f64 / scale,
        y: position.y as f64 / scale,
        width: size.width as f64 / scale,
        height: size.height as f64 / scale,
    })
}

/// 切换小窗预设：先记忆当前模式的几何，再恢复目标模式几何或套用预设尺寸。
pub fn apply_small_window(
    app: &AppHandle,
    from: SmallWindowMode,
    to: SmallWindowMode,
) -> Result<(), String> {
    if from == to {
        return Ok(());
    }
    let manager = app.state::<CloneManager>();
    let Some(window) = app.get_webview_window(WINDOW_LABEL) else {
        return Ok(());
    };

    if let Some(geometry) = current_geometry(&window) {
        manager.update_settings(|settings| settings.geometry.set(from, geometry));
    }

    let target = {
        let settings = manager.settings_copy();
        match settings.geometry.get(to) {
            Some(geometry) => geometry,
            None => {
                let base = current_geometry(&window)
                    .or_else(|| settings.geometry.get(from))
                    .unwrap_or(settings.geometry.normal);
                match to.preset_size() {
                    Some((width, height)) => CloneGeometry {
                        width,
                        height,
                        ..base
                    },
                    None => base,
                }
            }
        }
    };

    *EXPECTED_SIZE
        .lock()
        .unwrap_or_else(|error| error.into_inner()) = Some((target.width, target.height));
    window
        .set_size(LogicalSize::new(target.width, target.height))
        .map_err(|error| format!("设置小窗尺寸失败: {error}"))?;
    window
        .set_position(LogicalPosition::new(target.x, target.y))
        .map_err(|error| format!("设置小窗位置失败: {error}"))?;

    manager.update_settings(|settings| settings.geometry.set(to, target));
    super::persist_settings(app);
    reposition_host(app);
    super::input::sync(app);
    Ok(())
}

/// 宿主可视区域在屏幕坐标下的矩形（主线程调用），与布局使用同一 letterbox 结果。
pub fn host_screen_rect(app: &AppHandle) -> Option<(i32, i32, i32, i32)> {
    let window = app.get_webview_window(WINDOW_LABEL)?;
    let manager = app.state::<CloneManager>();
    let hwnd = HWND(window.hwnd().ok()?.0);
    let scale = window.scale_factor().ok()?;
    let chrome = (manager.chrome_height() * scale).round() as i32;
    unsafe {
        let mut client = RECT::default();
        GetClientRect(hwnd, &mut client).ok()?;
        let rect = host_rect(client.right, client.bottom, chrome);
        if rect.width <= 0 || rect.height <= 0 {
            return None;
        }
        let mut origin = POINT { x: 0, y: 0 };
        if !ClientToScreen(hwnd, &mut origin).as_bool() {
            return None;
        }
        Some((
            origin.x + rect.x,
            origin.y + rect.y,
            origin.x + rect.x + rect.width,
            origin.y + rect.y + rect.height,
        ))
    }
}

/// 聚焦既有窗口（托盘入口复用）。
pub fn focus_window(app: &AppHandle) -> bool {
    let Some(window) = app.get_webview_window(WINDOW_LABEL) else {
        return false;
    };
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
    refresh_window_layout(app);
    true
}

/// 窗口是否处于需要拦截关闭的状态。
///
/// `Disconnected`/`Error`/`Idle` 也可能还有存活的 child session（`close_session(false)`、
/// 注销失败、或取消连接留下的追踪标记），此时关窗仍须确认，避免静默留下孤儿会话。
pub fn requires_close_confirmation(state: CloneState, has_session: bool) -> bool {
    match state {
        CloneState::Preparing
        | CloneState::Connecting
        | CloneState::Connected
        | CloneState::AwaitingCredentials
        | CloneState::Disconnected => true,
        CloneState::Error | CloneState::Idle => has_session,
        CloneState::Closing | CloneState::Unsupported => false,
    }
}

/// 向克隆窗口发送关闭确认事件。
pub fn emit_close_requested(app: &AppHandle) {
    let _ = app.emit_to(
        WINDOW_LABEL,
        super::EVENT_CLOSE_REQUESTED,
        serde_json::json!({}),
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn host_rect_letterboxes_wide_client_area() {
        // 现场值：客户区 1287×724、标题栏 44 → 可用 1287×680 → 1209×680 居中
        assert_eq!(
            host_rect(1287, 724, 44),
            HostRect {
                x: 39,
                y: 44,
                width: 1209,
                height: 680
            }
        );
    }

    #[test]
    fn host_rect_fills_exact_aspect_client_area() {
        // 1280×764 窗口：标题栏以下正好 1280×720，无黑边
        assert_eq!(
            host_rect(1280, 764, 44),
            HostRect {
                x: 0,
                y: 44,
                width: 1280,
                height: 720
            }
        );
    }

    #[test]
    fn host_rect_letterboxes_maximized_client_area() {
        // 最大化：可用 1920×996 → 左右各留 74px 黑边
        assert_eq!(
            host_rect(1920, 1040, 44),
            HostRect {
                x: 74,
                y: 44,
                width: 1771,
                height: 996
            }
        );
    }

    #[test]
    fn host_rect_letterboxes_tall_client_area() {
        // 可用 1000×760：宽度受限 → 1000×563，在标题栏以下居中
        let rect = host_rect(1000, 804, 44);
        assert_eq!(
            rect,
            HostRect {
                x: 0,
                y: 142,
                width: 1000,
                height: 563
            }
        );
    }

    #[test]
    fn host_rect_rounding_never_exceeds_available_area() {
        for height in 1..=1200 {
            for width in [1, 17, 500, 640, 1280, 1920, 2560] {
                let rect = host_rect(width, height, 44);
                let available_height = (height - 44).max(0);
                assert!(rect.width <= width, "{width}x{height} -> {rect:?}");
                assert!(
                    rect.height <= available_height,
                    "{width}x{height} -> {rect:?}"
                );
                assert!(rect.x >= 0 && rect.y >= 44, "{width}x{height} -> {rect:?}");
                assert_eq!(rect.x, (width - rect.width) / 2);
                if rect.width >= 100 && rect.height >= 50 {
                    let ratio = rect.width as f64 / rect.height as f64;
                    let expected = ASPECT_WIDTH / ASPECT_HEIGHT;
                    assert!(
                        (ratio - expected).abs() / expected < 0.01,
                        "{width}x{height} -> {rect:?}"
                    );
                }
            }
        }
    }

    #[test]
    fn host_rect_degenerate_areas_are_empty() {
        // 标题栏高度 ≥ 客户区高度：没有可用视口
        let rect = host_rect(800, 300, 400);
        assert_eq!((rect.width, rect.height), (0, 0));

        let rect = host_rect(0, 0, -10);
        assert_eq!(
            rect,
            HostRect {
                x: 0,
                y: 0,
                width: 0,
                height: 0
            }
        );

        // 1px 可用区域也不越界
        let rect = host_rect(1, 45, 44);
        assert!(rect.width <= 1 && rect.height <= 1);
    }

    #[test]
    fn webview_strip_matches_chrome_height() {
        let stripped = webview_rect(1280, 800, 44, true);
        assert_eq!(
            stripped,
            WebviewRect {
                x: 0,
                y: 0,
                width: 1280,
                height: 44
            }
        );
        // 标题栏比客户区还高时不超过客户区
        assert_eq!(webview_rect(800, 30, 44, true).height, 30);
        assert_eq!(webview_rect(800, 30, -4, true).height, 0);
    }

    #[test]
    fn webview_full_ignores_chrome() {
        let full = webview_rect(1280, 800, 44, false);
        assert_eq!(
            full,
            WebviewRect {
                x: 0,
                y: 0,
                width: 1280,
                height: 800
            }
        );
    }

    #[test]
    fn connected_without_overlay_strips_webview_and_shows_host() {
        let layout = clone_layout(CloneState::Connected, false, 1280, 800, 44);
        assert!(layout.stripped);
        assert!(layout.host_visible);
        assert_eq!(layout.webview.height, 44);
        // 可用 1280×756 → 1280×720，在标题栏以下居中（上下各 18px 黑边）
        assert_eq!(
            layout.host,
            HostRect {
                x: 0,
                y: 62,
                width: 1280,
                height: 720
            }
        );
        // 条状 WebView2 与宿主不重叠
        assert!(layout.webview.height <= layout.host.y);
    }

    #[test]
    fn connected_with_overlay_expands_webview_and_hides_host() {
        let layout = clone_layout(CloneState::Connected, true, 1280, 800, 44);
        assert!(!layout.stripped);
        assert!(!layout.host_visible);
        assert_eq!(layout.webview.height, 800);
    }

    #[test]
    fn layout_matrix_follows_host_visibility() {
        let states = [
            CloneState::Unsupported,
            CloneState::Idle,
            CloneState::Preparing,
            CloneState::AwaitingCredentials,
            CloneState::Connecting,
            CloneState::Connected,
            CloneState::Disconnected,
            CloneState::Error,
            CloneState::Closing,
        ];
        for state in states {
            for overlay in [false, true] {
                let layout = clone_layout(state, overlay, 1280, 800, 44);
                assert_eq!(
                    layout.stripped,
                    super::super::host_should_be_visible(state, overlay),
                    "{state:?}/{overlay}"
                );
                assert_eq!(layout.host_visible, layout.stripped);
                if layout.stripped {
                    assert_eq!(layout.webview.height, 44, "{state:?}/{overlay}");
                } else {
                    assert_eq!(layout.webview, webview_rect(1280, 800, 44, false));
                }
            }
        }
    }

    #[test]
    fn close_confirmation_covers_live_sessions() {
        for state in [
            CloneState::Preparing,
            CloneState::Connecting,
            CloneState::Connected,
            CloneState::AwaitingCredentials,
            CloneState::Disconnected,
        ] {
            assert!(requires_close_confirmation(state, false), "{state:?}");
        }
        assert!(requires_close_confirmation(CloneState::Error, true));
        // close_session(false)/注销失败留下的存活会话：Idle 关窗也要确认
        assert!(requires_close_confirmation(CloneState::Idle, true));
        for state in [
            CloneState::Idle,
            CloneState::Error,
            CloneState::Unsupported,
            CloneState::Closing,
        ] {
            assert!(!requires_close_confirmation(state, false), "{state:?}");
        }
    }
}
