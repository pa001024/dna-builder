use std::collections::HashMap;
use std::sync::{Arc, LazyLock, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use raw_window_handle::{HasWindowHandle, RawWindowHandle};
use serde::{Deserialize, Serialize};
use windows::Win32::Foundation::{COLORREF, CloseHandle, HWND, LPARAM, POINT, RECT, SIZE};
use windows::Win32::Graphics::Gdi::{
    AC_SRC_ALPHA, AC_SRC_OVER, ANTIALIASED_QUALITY, BI_RGB, BITMAPINFO, BITMAPINFOHEADER,
    BLENDFUNCTION, CLIP_DEFAULT_PRECIS, ClientToScreen, CreateCompatibleDC, CreateDIBSection,
    CreateFontW, CreateSolidBrush, DEFAULT_CHARSET, DIB_RGB_COLORS, DT_CALCRECT, DT_CENTER,
    DT_SINGLELINE, DT_VCENTER, DeleteDC, DeleteObject, DrawTextW, Ellipse, FF_DONTCARE, FW_BOLD,
    GetDC, GetStockObject, HBITMAP, HBRUSH, HDC, HFONT, HGDIOBJ, NULL_PEN, OUT_DEFAULT_PRECIS, Pie,
    ReleaseDC, SelectObject, SetBkMode, SetTextColor, TRANSPARENT,
};
use windows::Win32::Media::{timeBeginPeriod, timeEndPeriod};
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, PROCESSENTRY32W, Process32FirstW, Process32NextW, TH32CS_SNAPPROCESS,
};
use windows::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GWL_EXSTYLE, GetClientRect, GetForegroundWindow, GetSystemMetrics,
    GetWindowLongPtrW, GetWindowThreadProcessId, IsWindow, IsWindowVisible, SM_CXSCREEN,
    SM_CYSCREEN, SetWindowLongPtrW, ULW_ALPHA, UpdateLayeredWindow, WS_EX_LAYERED,
    WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_EX_TRANSPARENT,
};
use windows::core::{BOOL, PCWSTR};

use crate::submodules::hotkey::reclaim_script_hotkey_raw_input;

use winit::application::ApplicationHandler;
use winit::dpi::LogicalSize;
use winit::event::WindowEvent;
use winit::event_loop::{ActiveEventLoop, ControlFlow, EventLoop, EventLoopProxy};
use winit::platform::windows::{EventLoopBuilderExtWindows, WindowAttributesExtWindows};
use winit::window::{Window, WindowId, WindowLevel};

// ---------------------------------------------------------------------------
// 通用 Win32 游戏浮窗(技能 CD 倒计时)。
//
// 1. 坐标:相对游戏窗口客户区的百分比。
//    运行时定位游戏窗口(进程白名单,默认 EM-Win64-Shipping.exe / EM.exe)的客户区,
//    再按 anchorXPercent / anchorYPercent(浮窗左上角)换算成屏幕物理像素。游戏窗口移动、
//    分辨率或窗口尺寸变化时浮窗自动跟随;同时钳制在客户区内,避免锚点 100% 时飘出屏幕。
//
// 2. 触发键:任意多条按键绑定。
//    config.keys 是 KeyBinding 列表(虚拟键码 + 标签 + 完整 CD + 是否启用),后台逐键轮询
//    上升沿(带防抖),每条绑定对应浮窗里的一行,互不干扰;改设置即时生效且不打断进行中的倒计时。
//
// 3. 绘制:超采样 + 逐像素 alpha 分层窗口,分三步:
//      a. 在 SUPERSAMPLE 倍尺寸的离屏 DIB 上画两遍完全相同的几何:
//         颜色层(颜色按各自不透明度预乘)与覆盖度层(不透明度写为灰度);
//      b. 盒式降采样成 32bpp 预乘 ARGB:alpha = 覆盖度均值,颜色 = 颜色均值(已预乘),
//         天然得到抗锯齿边缘,圆盘也可以做半透明;
//      c. UpdateLayeredWindow 一次性提交位置/尺寸/像素,双缓冲无闪烁,位置改动实时生效。
//    所有 GDI 资源(字体/画刷/离屏位图)跨帧复用,内容与位置都没变时跳过重绘。
//
// 4. 窗口:浮窗线程跑一个 winit EventLoop(窗口创建/持有/显隐与 WM_* 派发都归它)。
//    - 显隐走 Window::set_visible:winit 对同线程调用内联执行,内部是同步
//      ShowWindow(SW_SHOWNOACTIVATE / SW_HIDE),既不抢焦点也不会丢请求;
//    - 帧节拍用 ControlFlow::WaitUntil(+ EventLoopProxy 唤醒)。
//    - Tauri(tao)已占用主线程,所以用 EventLoopBuilderExtWindows::any_thread(true)
//      在浮窗线程上建循环;另加 with_dpi_aware(false),进程 DPI 感知由 Tauri 决定,
//      浮窗不该去动这个全局设置(绘制本来就全程走物理像素)。
//    - **EventLoop 每进程只能创建一次**(重复调用直接报 RecreationAttempt),所以循环与窗口
//      在首次启用时建好后常驻,停用只是隐藏窗口并把节拍降到 IDLE_TICK_INTERVAL。
//    - winit 管的是"窗口生命周期与消息",**像素仍然是 UpdateLayeredWindow 提交的**:
//      winit 在 Windows 上的 transparent 走的是 DwmEnableBlurBehindWindow 模糊穿透,拿不到
//      逐像素 alpha,所以浮窗的 WS_EX_LAYERED 由 set_cursor_hittest(false) 打开
//      (winit 的 WindowFlags::IGNORE_CURSOR_EVENT 会同时置上 WS_EX_TRANSPARENT),
//      WS_EX_NOACTIVATE / WS_EX_TOOLWINDOW 则自己补(见 apply_overlay_ex_style)。
//    - EventLoop 创建时 winit 会把鼠标/键盘 Raw Input 注册到自己的消息窗口,键盘要重新注册
//      回脚本热键的监听窗口(见 reclaim_script_hotkey_raw_input)。
//
// 说明:仓库的 Windows FFI 统一走 windows crate,不引入旧版 winapi;
// winit Window 与 HWND 都只归浮窗线程所有,跨线程只通过 Mutex + EventLoopProxy 交互。
// ---------------------------------------------------------------------------

/// 默认被视为"游戏窗口"的进程白名单(仅前台进程命中时才允许按键触发、以及用于定位客户区)。
const DEFAULT_GAME_PROCESS_NAMES: &[&str] = &["EM-Win64-Shipping.exe", "EM.exe"];
/// 工作线程渲染/按键轮询间隔(约 60fps;配合 timeBeginPeriod(1) 让 sleep 精度足够)。
const TICK_INTERVAL: Duration = Duration::from_millis(16);
/// 按键触发最小间隔(防抖,防止按住/连发反复重设)。
const KEY_DEBOUNCE: Duration = Duration::from_millis(200);
/// 进程/窗口/客户区缓存的刷新间隔。
const GAME_PROBE_TTL: Duration = Duration::from_millis(1000);
/// 超采样倍率:几何与文字按该倍率放大绘制后再盒式降采样,得到抗锯齿边缘。
const SUPERSAMPLE: i32 = 3;
/// 浮窗缩放系数范围。
const MIN_SCALE: f64 = 0.5;
const MAX_SCALE: f64 = 3.0;

/// 单个按键绑定(由前端设置页下发,字段名与 serde camelCase 对齐)。
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FloatWindowKeyBinding {
    /// 稳定标识(前端生成);相同 id 复用同一个计时器,避免改设置后倒计时被重置。
    pub id: String,
    /// 显示标签;留空时按虚拟键码推导(如 0x45 -> "E")。
    #[serde(default)]
    pub label: String,
    /// 触发键虚拟键码(VK)。
    pub vk: u32,
    /// 该按键的完整冷却秒数。
    pub cd_seconds: f64,
    /// 是否参与触发与绘制。
    #[serde(default = "default_true")]
    pub enabled: bool,
}

/// 浮窗可视化配置(由前端设置页下发)。
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FloatWindowConfig {
    /// 浮窗左上角相对游戏窗口客户区宽度的百分比(0 ~ 100)。
    pub anchor_x_percent: f64,
    /// 浮窗左上角相对游戏窗口客户区高度的百分比(0 ~ 100)。
    pub anchor_y_percent: f64,
    /// 整体缩放系数(0.5 ~ 3.0)。
    pub scale: f64,
    /// CD 归零(就绪)后隐藏该项;true 则浮窗只在倒计时期间出现。
    pub hide_when_ready: bool,
    /// 未检测到游戏窗口时隐藏浮窗(避免游戏没开时把圆环画在桌面上)。
    #[serde(default = "default_true")]
    pub hide_when_game_missing: bool,
    /// 是否仅允许"游戏窗口在前台"时按键触发。
    pub game_only_trigger: bool,
    /// 视为游戏窗口的进程名白名单;为空时使用内置默认(EM-Win64-Shipping.exe / EM.exe)。
    #[serde(default)]
    pub process_names: Vec<String>,
    /// 圆盘衬底不透明度(0 ~ 1);0 表示只保留圆环与文字。
    #[serde(default = "default_disc_alpha")]
    pub disc_alpha: f64,
    /// 按键绑定列表(自上而下渲染)。
    #[serde(default)]
    pub keys: Vec<FloatWindowKeyBinding>,
    /// 圆环轨道底色(0xRRGGBB)。
    pub ring_color: u32,
    /// 冷却中圆环进度颜色。
    pub progress_color: u32,
    /// 就绪时圆环/标签颜色。
    pub ready_color: u32,
    /// 剩余秒数数字颜色。
    pub text_color: u32,
    /// 冷却中标签文字颜色。
    pub label_color: u32,
    /// 圆盘底色(数字衬底)。
    pub disc_color: u32,
}

/// serde 默认值:true。
fn default_true() -> bool {
    true
}

/// serde 默认值:圆盘不透明度 0.78。
fn default_disc_alpha() -> f64 {
    0.78
}

impl Default for FloatWindowConfig {
    /// 默认配置:近右下角、E 键 8 秒 CD、深色半透明圆盘 + 琥珀进度 + 绿色就绪。
    fn default() -> Self {
        Self {
            anchor_x_percent: 77.0,
            anchor_y_percent: 52.0,
            scale: 1.0,
            hide_when_ready: false,
            hide_when_game_missing: true,
            game_only_trigger: true,
            process_names: Vec::new(),
            disc_alpha: 0.78,
            keys: vec![FloatWindowKeyBinding {
                id: "key-69".to_string(),
                label: "E".to_string(),
                vk: 0x45, // VK_E
                cd_seconds: 8.0,
                enabled: true,
            }],
            ring_color: 0x3f4a5c,
            progress_color: 0xf59e0b,
            ready_color: 0x22c55e,
            text_color: 0xf8fafc,
            label_color: 0x9aa4b2,
            disc_color: 0x161b22,
        }
    }
}

/// 浮窗内单个计时器(与一条按键绑定一一对应)。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FloatyTimer {
    /// 计时器唯一标识(等于绑定的 id);相同 id 再次触发视为重设。
    pub id: String,
    /// 显示标签,如 "E"。
    pub label: String,
    /// 完整冷却秒数。
    pub total: f64,
    /// 剩余冷却秒数。
    pub remaining: f64,
}

impl FloatyTimer {
    /// 是否已就绪(冷却归零)。
    fn is_ready(&self) -> bool {
        self.remaining <= 0.0
    }
}

/// 返回给前端的浮窗状态快照(含游戏客户区与解析后的位置,供设置页预览/拖拽)。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FloatWindowState {
    /// 后端浮窗是否处于启用状态。
    pub enabled: bool,
    /// 浮窗当前是否可见(有至少一行需要绘制且游戏窗口在)。
    pub visible: bool,
    /// 生效的锚点百分比。
    pub anchor_x_percent: f64,
    pub anchor_y_percent: f64,
    /// 解析后的浮窗左上角屏幕坐标(物理像素)。
    pub resolved_x: i32,
    pub resolved_y: i32,
    /// 浮窗最终像素尺寸(未渲染过时为 0)。
    pub window_width: i32,
    pub window_height: i32,
    pub scale: f64,
    pub hide_when_ready: bool,
    pub hide_when_game_missing: bool,
    pub game_only_trigger: bool,
    /// 是否已定位到游戏窗口。
    pub game_found: bool,
    /// 游戏窗口客户区(屏幕坐标物理像素);未找到时为全屏尺寸兜底。
    pub client_left: i32,
    pub client_top: i32,
    pub client_width: i32,
    pub client_height: i32,
    /// 生效的进程白名单。
    pub process_names: Vec<String>,
    /// 生效的按键绑定。
    pub keys: Vec<FloatWindowKeyBinding>,
    /// 当前全部计时器快照(含就绪项)。
    pub timers: Vec<FloatyTimer>,
}

// ---------------------------------------------------------------------------
// 游戏窗口探测(进程白名单 -> 客户区矩形)
// ---------------------------------------------------------------------------

/// 游戏窗口客户区(屏幕坐标,物理像素)。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct ClientRect {
    left: i32,
    top: i32,
    width: i32,
    height: i32,
}

/// 枚举顶层窗口时的搜索上下文。
struct GameWindowSearch {
    pids: Vec<u32>,
    found: Option<HWND>,
    best_area: i64,
}

/// EnumWindows 回调:挑选客户区面积最大的游戏窗口(游戏常伴生若干隐藏小窗口)。
unsafe extern "system" fn enum_game_window_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let search = unsafe { &mut *(lparam.0 as *mut GameWindowSearch) };
    if !unsafe { IsWindowVisible(hwnd) }.as_bool() {
        return BOOL(1);
    }
    let mut pid = 0u32;
    unsafe {
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
    }
    if pid == 0 || !search.pids.contains(&pid) {
        return BOOL(1);
    }
    if let Some(rect) = client_rect_of(hwnd) {
        let area = rect.width as i64 * rect.height as i64;
        if area > search.best_area {
            search.best_area = area;
            search.found = Some(hwnd);
        }
    }
    BOOL(1)
}

/// 读取窗口客户区(宽高 + 屏幕原点),窗口不可用时返回 None。
fn client_rect_of(hwnd: HWND) -> Option<ClientRect> {
    unsafe {
        let mut rect = RECT::default();
        if GetClientRect(hwnd, &mut rect).is_err() {
            return None;
        }
        let width = rect.right - rect.left;
        let height = rect.bottom - rect.top;
        if width <= 0 || height <= 0 {
            return None;
        }
        let mut origin = POINT { x: 0, y: 0 };
        if !ClientToScreen(hwnd, &mut origin).as_bool() {
            return None;
        }
        Some(ClientRect {
            left: origin.x,
            top: origin.y,
            width,
            height,
        })
    }
}

/// 枚举进程快照,收集白名单内进程的全部 PID(忽略大小写)。
fn collect_game_pids(process_names: &[String]) -> Vec<u32> {
    let mut result = Vec::new();
    unsafe {
        let snapshot = match CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) {
            Ok(snapshot) => snapshot,
            Err(_) => return result,
        };
        let mut entry = PROCESSENTRY32W::default();
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        if Process32FirstW(snapshot, &mut entry).is_ok() {
            loop {
                let name = String::from_utf16_lossy(&entry.szExeFile);
                let name = name.trim_matches('\0');
                if process_names
                    .iter()
                    .any(|candidate| name.eq_ignore_ascii_case(candidate))
                {
                    result.push(entry.th32ProcessID);
                }
                if Process32NextW(snapshot, &mut entry).is_err() {
                    break;
                }
            }
        }
        // 快照必须显式关闭:`GameTracker::sync` 每秒调用本函数一次,漏掉就是每秒泄漏一个内核句柄。
        let _ = CloseHandle(snapshot);
    }
    result
}

/// 在给定 PID 集合里寻找客户区最大的可见顶层窗口。
fn find_game_window(pids: &[u32]) -> Option<HWND> {
    if pids.is_empty() {
        return None;
    }
    let mut search = GameWindowSearch {
        pids: pids.to_vec(),
        found: None,
        best_area: 0,
    };
    unsafe {
        let _ = EnumWindows(
            Some(enum_game_window_proc),
            LPARAM(&mut search as *mut GameWindowSearch as isize),
        );
    }
    search.found
}

/// 主显示器尺寸兜底(未检测到游戏窗口时使用)。
fn primary_screen_rect() -> ClientRect {
    unsafe {
        ClientRect {
            left: 0,
            top: 0,
            width: GetSystemMetrics(SM_CXSCREEN).max(1),
            height: GetSystemMetrics(SM_CYSCREEN).max(1),
        }
    }
}

/// 游戏窗口探测缓存:进程列表 / 窗口句柄 / 客户区,按 TTL 刷新,避免每帧枚举进程。
struct GameTracker {
    /// 上次刷新时间。
    synced_at: Option<Instant>,
    /// 上次刷新使用的进程白名单(变化时立即重探)。
    process_names: Vec<String>,
    /// 游戏进程 PID 列表。
    pids: Vec<u32>,
    /// 游戏主窗口句柄。
    window: Option<HWND>,
    /// 游戏窗口客户区(屏幕坐标)。
    client: Option<ClientRect>,
}

impl GameTracker {
    /// 创建空缓存。
    fn new() -> Self {
        Self {
            synced_at: None,
            process_names: Vec::new(),
            pids: Vec::new(),
            window: None,
            client: None,
        }
    }

    /// 按 TTL 刷新缓存;白名单变化时立即刷新。
    fn sync(&mut self, process_names: &[String]) {
        let stale = self
            .synced_at
            .map(|at| at.elapsed() >= GAME_PROBE_TTL)
            .unwrap_or(true);
        if !stale && self.process_names == process_names {
            return;
        }
        self.synced_at = Some(Instant::now());
        self.process_names = process_names.to_vec();
        self.pids = collect_game_pids(process_names);
        // 已有句柄仍然有效且仍属于游戏进程时继续复用,避免在两个候选窗口之间反复跳。
        self.window = match self.window {
            Some(hwnd) if is_alive_game_window(hwnd, &self.pids) => Some(hwnd),
            _ => find_game_window(&self.pids),
        };
        self.client = self.window.and_then(client_rect_of);
    }

    /// 前台窗口是否属于游戏进程。
    fn is_game_foreground(&self) -> bool {
        let foreground = unsafe { GetForegroundWindow() };
        if foreground.0.is_null() {
            return false;
        }
        let mut pid = 0u32;
        unsafe {
            GetWindowThreadProcessId(foreground, Some(&mut pid));
        }
        pid != 0 && self.pids.contains(&pid)
    }
}

/// 窗口是否仍然存在且属于给定 PID 集合。
fn is_alive_game_window(hwnd: HWND, pids: &[u32]) -> bool {
    unsafe {
        if !IsWindow(Some(hwnd)).as_bool() {
            return false;
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        pid != 0 && pids.contains(&pid)
    }
}

// ---------------------------------------------------------------------------
// 离屏绘制表面(超采样 + 双缓冲 + 逐像素 alpha)
// ---------------------------------------------------------------------------

/// 一次绘制图元的目标像素值。
///
/// 颜色层存"已按不透明度预乘的颜色",覆盖度层存"不透明度灰度";
/// compose 阶段直接对两层分别取均值即可得到预乘 ARGB,不需要再做除法。
#[derive(Debug, Clone, Copy)]
struct Paint {
    /// 该层要画的像素值(0xRRGGBB)。
    color: u32,
}

impl Paint {
    /// 颜色层用:按不透明度预乘颜色。
    fn for_color(color: u32, alpha: u8) -> Self {
        let a = alpha as u32;
        let r = ((color >> 16) & 0xFF) * a / 255;
        let g = ((color >> 8) & 0xFF) * a / 255;
        let b = (color & 0xFF) * a / 255;
        Self {
            color: (r << 16) | (g << 8) | b,
        }
    }

    /// 覆盖度层用:把不透明度写成灰度(降采样后即为该像素的 alpha)。
    fn for_mask(alpha: u8) -> Self {
        Self {
            color: alpha as u32 * 0x010101,
        }
    }
}

/// 一帧绘制使用的调色板(同一几何分别在颜色层/覆盖度层各画一遍)。
#[derive(Debug, Clone, Copy)]
struct Palette {
    ring: Paint,
    progress: Paint,
    ready: Paint,
    text: Paint,
    label: Paint,
    disc: Paint,
}

impl Palette {
    /// 颜色层调色板:来自配置色 + 圆盘不透明度。
    fn for_color(config: &FloatWindowConfig) -> Self {
        let disc_alpha = (config.disc_alpha.clamp(0.0, 1.0) * 255.0).round() as u8;
        Self {
            ring: Paint::for_color(config.ring_color, 255),
            progress: Paint::for_color(config.progress_color, 255),
            ready: Paint::for_color(config.ready_color, 255),
            text: Paint::for_color(config.text_color, 255),
            label: Paint::for_color(config.label_color, 255),
            disc: Paint::for_color(config.disc_color, disc_alpha),
        }
    }

    /// 覆盖度层调色板:只关心不透明度(与颜色层保持一致)。
    fn for_mask(config: &FloatWindowConfig) -> Self {
        let disc_alpha = (config.disc_alpha.clamp(0.0, 1.0) * 255.0).round() as u8;
        Self {
            ring: Paint::for_mask(255),
            progress: Paint::for_mask(255),
            ready: Paint::for_mask(255),
            text: Paint::for_mask(255),
            label: Paint::for_mask(255),
            disc: Paint::for_mask(disc_alpha),
        }
    }
}

/// 离屏绘制表面:超采样颜色层 + 覆盖度层 + 输出用预乘 ARGB 位图,GDI 资源跨帧复用。
struct OverlaySurface {
    /// 逻辑尺寸(最终提交给分层窗口的像素尺寸)。
    width: i32,
    height: i32,
    /// 超采样尺寸 = 逻辑尺寸 × SUPERSAMPLE。
    ss_width: i32,
    ss_height: i32,
    /// 颜色层 DC / 位图 / 像素指针。
    color_dc: HDC,
    color_bmp: HBITMAP,
    color_old: HGDIOBJ,
    color_bits: *mut u32,
    /// 覆盖度层 DC / 位图 / 像素指针。
    mask_dc: HDC,
    mask_bmp: HBITMAP,
    mask_old: HGDIOBJ,
    mask_bits: *mut u32,
    /// 输出层 DC / 位图 / 像素指针。
    out_dc: HDC,
    out_bmp: HBITMAP,
    out_old: HGDIOBJ,
    out_bits: *mut u32,
    /// 按像素高缓存的字体。
    fonts: HashMap<i32, HFONT>,
    /// 按 0xRRGGBB 缓存的画刷。
    brushes: HashMap<u32, HBRUSH>,
}

impl OverlaySurface {
    /// 创建空表面(所有句柄为空,首次 ensure 时才分配)。
    fn new() -> Self {
        Self {
            width: 0,
            height: 0,
            ss_width: 0,
            ss_height: 0,
            color_dc: HDC::default(),
            color_bmp: HBITMAP::default(),
            color_old: HGDIOBJ::default(),
            color_bits: std::ptr::null_mut(),
            mask_dc: HDC::default(),
            mask_bmp: HBITMAP::default(),
            mask_old: HGDIOBJ::default(),
            mask_bits: std::ptr::null_mut(),
            out_dc: HDC::default(),
            out_bmp: HBITMAP::default(),
            out_old: HGDIOBJ::default(),
            out_bits: std::ptr::null_mut(),
            fonts: HashMap::new(),
            brushes: HashMap::new(),
        }
    }

    /// 是否已分配好缓冲区。
    fn ready(&self) -> bool {
        !self.color_bmp.0.is_null() && !self.mask_bmp.0.is_null() && !self.out_bmp.0.is_null()
    }

    /// 确保缓冲区尺寸匹配;尺寸变化时重建并返回 true。
    fn ensure(&mut self, screen_dc: HDC, width: i32, height: i32) -> bool {
        let width = width.max(1);
        let height = height.max(1);
        if self.ready() && self.width == width && self.height == height {
            return false;
        }
        self.release();
        self.width = width;
        self.height = height;
        self.ss_width = width * SUPERSAMPLE;
        self.ss_height = height * SUPERSAMPLE;
        {
            let Some((color_dc, color_bmp, color_old, color_bits)) =
                create_dib(screen_dc, self.ss_width, self.ss_height)
            else {
                self.release();
                return false;
            };
            self.color_dc = color_dc;
            self.color_bmp = color_bmp;
            self.color_old = color_old;
            self.color_bits = color_bits;

            let Some((mask_dc, mask_bmp, mask_old, mask_bits)) =
                create_dib(screen_dc, self.ss_width, self.ss_height)
            else {
                self.release();
                return false;
            };
            self.mask_dc = mask_dc;
            self.mask_bmp = mask_bmp;
            self.mask_old = mask_old;
            self.mask_bits = mask_bits;

            let Some((out_dc, out_bmp, out_old, out_bits)) =
                create_dib(screen_dc, self.width, self.height)
            else {
                self.release();
                return false;
            };
            self.out_dc = out_dc;
            self.out_bmp = out_bmp;
            self.out_old = out_old;
            self.out_bits = out_bits;
        }
        true
    }

    /// 清空两层的超采样画布(置 0,即"全透明/全黑")。
    fn clear(&mut self) {
        let len = (self.ss_width as usize).saturating_mul(self.ss_height as usize);
        if self.color_bits.is_null() || self.mask_bits.is_null() {
            return;
        }
        unsafe {
            std::ptr::write_bytes(self.color_bits, 0, len);
            std::ptr::write_bytes(self.mask_bits, 0, len);
        }
    }

    /// 取(并缓存)指定像素高的粗体字体。
    fn font(&mut self, px: i32) -> HFONT {
        if let Some(font) = self.fonts.get(&px) {
            return *font;
        }
        let font = create_bold_font(px);
        self.fonts.insert(px, font);
        font
    }

    /// 取(并缓存)指定颜色画刷。
    fn brush(&mut self, color: u32) -> HBRUSH {
        let color = color & 0x00FF_FFFF;
        if let Some(brush) = self.brushes.get(&color) {
            return *brush;
        }
        let brush = unsafe { CreateSolidBrush(colorref_from_rgb(color)) };
        self.brushes.insert(color, brush);
        brush
    }

    /// 盒式降采样两层 -> 预乘 ARGB 输出位图。
    ///
    /// 对每个输出像素取 SUPERSAMPLE² 个采样点:alpha 为覆盖度均值,颜色为已预乘颜色均值,
    /// 因此边缘天然抗锯齿;两层用同一几何绘制,多个图元重叠时也是正确的加权平均。
    fn compose(&mut self) {
        let ss = SUPERSAMPLE as usize;
        let samples = (ss * ss) as u32;
        let width = self.width as usize;
        let height = self.height as usize;
        let ss_width = self.ss_width as usize;
        if self.color_bits.is_null() || self.mask_bits.is_null() || self.out_bits.is_null() {
            return;
        }
        for y in 0..height {
            for x in 0..width {
                let (mut sr, mut sg, mut sb, mut sa) = (0u32, 0u32, 0u32, 0u32);
                for j in 0..ss {
                    let row = (y * ss + j) * ss_width + x * ss;
                    unsafe {
                        let color = self.color_bits.add(row);
                        let mask = self.mask_bits.add(row);
                        for i in 0..ss {
                            let c = *color.add(i);
                            let m = *mask.add(i);
                            sr += (c >> 16) & 0xFF;
                            sg += (c >> 8) & 0xFF;
                            sb += c & 0xFF;
                            sa += m & 0xFF;
                        }
                    }
                }
                let alpha = sa / samples;
                let pixel = if alpha == 0 {
                    0
                } else {
                    // 颜色层已按 alpha 预乘,直接取均值即可(再钳制到 alpha 防溢出)
                    let r = (sr / samples).min(alpha);
                    let g = (sg / samples).min(alpha);
                    let b = (sb / samples).min(alpha);
                    (alpha << 24) | (r << 16) | (g << 8) | b
                };
                unsafe {
                    *self.out_bits.add(y * width + x) = pixel;
                }
            }
        }
    }

    /// 释放全部 GDI 资源(重复调用安全)。
    fn release(&mut self) {
        unsafe {
            if !self.color_dc.0.is_null() {
                if !self.color_old.0.is_null() {
                    let _ = SelectObject(self.color_dc, self.color_old);
                }
                let _ = DeleteDC(self.color_dc);
            }
            if !self.color_bmp.0.is_null() {
                let _ = DeleteObject(self.color_bmp.into());
            }
            if !self.mask_dc.0.is_null() {
                if !self.mask_old.0.is_null() {
                    let _ = SelectObject(self.mask_dc, self.mask_old);
                }
                let _ = DeleteDC(self.mask_dc);
            }
            if !self.mask_bmp.0.is_null() {
                let _ = DeleteObject(self.mask_bmp.into());
            }
            if !self.out_dc.0.is_null() {
                if !self.out_old.0.is_null() {
                    let _ = SelectObject(self.out_dc, self.out_old);
                }
                let _ = DeleteDC(self.out_dc);
            }
            if !self.out_bmp.0.is_null() {
                let _ = DeleteObject(self.out_bmp.into());
            }
            for (_, font) in self.fonts.drain() {
                let _ = DeleteObject(font.into());
            }
            for (_, brush) in self.brushes.drain() {
                let _ = DeleteObject(brush.into());
            }
            self.color_dc = HDC::default();
            self.color_bmp = HBITMAP::default();
            self.color_old = HGDIOBJ::default();
            self.color_bits = std::ptr::null_mut();
            self.mask_dc = HDC::default();
            self.mask_bmp = HBITMAP::default();
            self.mask_old = HGDIOBJ::default();
            self.mask_bits = std::ptr::null_mut();
            self.out_dc = HDC::default();
            self.out_bmp = HBITMAP::default();
            self.out_old = HGDIOBJ::default();
            self.out_bits = std::ptr::null_mut();
            self.width = 0;
            self.height = 0;
            self.ss_width = 0;
            self.ss_height = 0;
        }
    }
}

impl Drop for OverlaySurface {
    /// 表面销毁时释放 GDI 资源。
    fn drop(&mut self) {
        self.release();
    }
}

/// 创建尺寸为 width×height 的 32bpp 顶向下 DIB,并把位图选入新建的内存 DC。
///
/// # 返回
/// (内存 DC, 位图, 被替换的原始位图, 像素指针);失败返回 None。
fn create_dib(
    screen_dc: HDC,
    width: i32,
    height: i32,
) -> Option<(HDC, HBITMAP, HGDIOBJ, *mut u32)> {
    unsafe {
        let info = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                // 负高度 = 顶向下 DIB,像素行与屏幕方向一致
                biHeight: -height,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };
        let mut bits: *mut core::ffi::c_void = std::ptr::null_mut();
        let bitmap =
            CreateDIBSection(Some(screen_dc), &info, DIB_RGB_COLORS, &mut bits, None, 0).ok()?;
        let dc = CreateCompatibleDC(Some(screen_dc));
        if dc.0.is_null() {
            let _ = DeleteObject(bitmap.into());
            return None;
        }
        let old = SelectObject(dc, bitmap.into());
        Some((dc, bitmap, old, bits as *mut u32))
    }
}

// ---------------------------------------------------------------------------
// 浮窗运行时内核
// ---------------------------------------------------------------------------

/// 帧布局几何(全部为超采样坐标系下的像素值)。
struct FrameGeometry {
    /// 逻辑(输出)尺寸。
    width: i32,
    height: i32,
    /// 圆盘半径 / 环带宽 / 内边距 / 圆盘与标签间距 / 行间距。
    disc_r: f64,
    ring_w: f64,
    pad: i32,
    gap: i32,
    row_gap: i32,
    /// 圆盘直径。
    disc_d: i32,
    /// 每行标签宽度(超采样像素)。
    label_widths: Vec<i32>,
    /// 标签字号(超采样像素)。
    label_px: i32,
}

/// 一帧绘制需要的字体。
#[derive(Debug, Clone, Copy)]
struct FontSet {
    digit: HFONT,
    label: HFONT,
}

/// 最近一帧的实时几何(供状态快照与设置页预览)。
#[derive(Debug, Clone, Copy, Default)]
struct LiveGeometry {
    resolved_x: i32,
    resolved_y: i32,
    window_width: i32,
    window_height: i32,
    client: Option<ClientRect>,
    game_found: bool,
}

/// 帧指纹累加器:用于判断"内容与位置都没变"从而跳过重绘。
struct FrameKey(u64);

impl FrameKey {
    /// FNV-1a 初始值。
    fn new() -> Self {
        Self(0xcbf2_9ce4_8422_2325)
    }

    /// 混入一个整数。
    fn push(&mut self, value: i64) -> &mut Self {
        self.0 ^= value as u64;
        self.0 = self.0.wrapping_mul(0x0000_0100_0000_01b3);
        self
    }

    /// 混入一个浮点数(量化到 1/240 秒,避免亚毫秒抖动导致每帧都重绘)。
    fn push_f64(&mut self, value: f64) -> &mut Self {
        self.push((value * 240.0).round() as i64)
    }

    /// 混入一段文本。
    fn push_text(&mut self, text: &str) -> &mut Self {
        for byte in text.as_bytes() {
            self.0 ^= *byte as u64;
            self.0 = self.0.wrapping_mul(0x0000_0100_0000_01b3);
        }
        self
    }

    /// 取当前指纹。
    fn value(&self) -> u64 {
        self.0
    }
}

/// 浮窗运行时内核;窗口句柄与绘制只允许在浮窗工作线程内进行。
struct FloatyCore {
    enabled: bool,
    /// 窗口当前是否可见(由渲染循环维护)。
    visible: bool,
    config: FloatWindowConfig,
    /// 配置版本号;每次 set() 自增,参与帧指纹,保证改色/改缩放立即重绘。
    revision: u64,
    /// 浮窗窗口句柄(**由 winit 创建并持有**,这里只缓存一份供 GDI 提交像素);None 表示尚未创建。
    /// 窗口在首次启用时建好后一直存活(事件循环进程内不能重建),停用只是把它隐藏。
    window: Option<HWND>,
    /// 离屏绘制表面(GDI 资源跨帧复用)。
    surface: OverlaySurface,
    /// 计时器列表(保持配置顺序,自上而下绘制)。
    timers: Vec<FloatyTimer>,
    /// 通过 float_window_trigger 手动推送、且不对应任何按键绑定的计时器 id;
    /// 配置同步时只保留这些"额外条目",删除绑定不会留下孤儿计时器。
    manual_timer_ids: Vec<String>,
    /// 上一帧时间戳(用于精确扣减 CD)。
    last_tick: Instant,
    /// 各按键上一帧的按下状态(上升沿检测)。
    key_down: HashMap<u32, bool>,
    /// 各按键上一次触发时刻(防抖)。
    last_trigger_at: HashMap<u32, Instant>,
    /// 游戏窗口探测缓存。
    game: GameTracker,
    /// 最近一帧的实时几何。
    live: LiveGeometry,
    /// 最近一帧的指纹;None 表示需要强制重绘。
    last_frame_key: Option<u64>,
}

impl FloatyCore {
    /// 创建内核,enabled 默认开启。
    fn new(config: FloatWindowConfig) -> Self {
        let mut core = Self {
            enabled: true,
            visible: false,
            config,
            revision: 0,
            window: None,
            surface: OverlaySurface::new(),
            timers: Vec::new(),
            manual_timer_ids: Vec::new(),
            last_tick: Instant::now(),
            key_down: HashMap::new(),
            last_trigger_at: HashMap::new(),
            game: GameTracker::new(),
            live: LiveGeometry::default(),
            last_frame_key: None,
        };
        core.sync_timers();
        core
    }

    /// 生效的进程白名单(配置为空时用内置默认)。
    fn effective_process_names(&self) -> Vec<String> {
        let configured: Vec<String> = self
            .config
            .process_names
            .iter()
            .map(|name| name.trim().to_string())
            .filter(|name| !name.is_empty())
            .collect();
        if configured.is_empty() {
            DEFAULT_GAME_PROCESS_NAMES
                .iter()
                .map(|name| name.to_string())
                .collect()
        } else {
            configured
        }
    }

    /// 让计时器列表与按键绑定对齐:新增绑定补一行,删除绑定移除。
    /// 已存在的计时器保留剩余时间,避免改设置时打断进行中的倒计时。
    fn sync_timers(&mut self) {
        let mut next: Vec<FloatyTimer> =
            Vec::with_capacity(self.config.keys.len() + self.timers.len());
        for binding in &self.config.keys {
            if !binding.enabled || binding.vk == 0 || binding.cd_seconds <= 0.0 {
                continue;
            }
            let label = if binding.label.trim().is_empty() {
                label_from_vk(binding.vk)
            } else {
                binding.label.trim().to_string()
            };
            if label.is_empty() {
                continue;
            }
            let total = binding.cd_seconds.clamp(0.05, 3600.0);
            let remaining = self
                .timers
                .iter()
                .find(|timer| timer.id == binding.id)
                .map(|timer| timer.remaining.min(total))
                .unwrap_or(0.0);
            next.push(FloatyTimer {
                id: binding.id.clone(),
                label,
                total,
                remaining,
            });
        }
        // 只保留"手动推送且不对应任何绑定"的额外计时器;绑定被删除时其计时器一并消失。
        self.manual_timer_ids
            .retain(|id| !self.config.keys.iter().any(|key| key.id == *id));
        for timer in &self.timers {
            if self.manual_timer_ids.iter().any(|id| id == &timer.id) {
                next.push(timer.clone());
            }
        }
        self.manual_timer_ids
            .retain(|id| next.iter().any(|timer| timer.id == *id));
        self.timers = next;
    }

    /// 帧推进:按真实时间扣减全部计时器,刷新游戏窗口缓存,再处理按键触发。
    fn tick(&mut self) {
        let now = Instant::now();
        let dt = now
            .duration_since(self.last_tick)
            .as_secs_f64()
            .clamp(0.0, 0.2);
        self.last_tick = now;
        for timer in &mut self.timers {
            if timer.remaining > 0.0 {
                timer.remaining = (timer.remaining - dt).max(0.0);
            }
        }
        let process_names = self.effective_process_names();
        self.game.sync(&process_names);
        self.maybe_trigger_by_key();
    }

    /// 逐个绑定检测触发键上升沿:就绪时按下即从完整 CD 开始倒数;冷却中按下不打断。
    fn maybe_trigger_by_key(&mut self) {
        let bindings: Vec<(u32, String, f64)> = self
            .config
            .keys
            .iter()
            .filter(|key| key.enabled && key.vk != 0 && key.cd_seconds > 0.0)
            .map(|key| (key.vk, key.id.clone(), key.cd_seconds.clamp(0.05, 3600.0)))
            .collect();
        if bindings.is_empty() {
            self.key_down.clear();
            return;
        }
        // 仅游戏窗口前台时允许触发;其他时候把按下状态复位,避免回到游戏后立刻补触发一次。
        let allowed = !self.config.game_only_trigger || self.game.is_game_foreground();
        for (vk, id, cd) in bindings {
            if !allowed {
                self.key_down.insert(vk, false);
                continue;
            }
            let raw = unsafe { GetAsyncKeyState(vk as i32) };
            let pressed = (raw as i16) < 0; // i16 最高位为 1 表示按键处于按下状态
            let was_down = self.key_down.insert(vk, pressed).unwrap_or(false);
            if !pressed || was_down {
                continue;
            }
            if self
                .last_trigger_at
                .get(&vk)
                .map(|at| at.elapsed() < KEY_DEBOUNCE)
                .unwrap_or(false)
            {
                continue;
            }
            self.last_trigger_at.insert(vk, Instant::now());
            if let Some(timer) = self.timers.iter_mut().find(|timer| timer.id == id) {
                // 技能就绪才允许施放;避免按住/连发被判定为多次施放。
                if timer.is_ready() {
                    timer.total = cd;
                    timer.remaining = cd;
                }
            }
        }
    }

    /// 复位可见状态**记录**。
    ///
    /// 不变量:`core.visible == true` 必须等价于"winit 那边窗口确实可见"。因此只有两条路径可以
    /// 改它 —— `hide_overlay`(它先 `set_visible(false)`)与 `WindowEvent::Destroyed`
    /// (窗口已经没了)。任何其它地方(尤其 `disable()`)**不许**擅自清掉它,
    /// 否则 `hide_overlay` 的守卫判断会失效、窗口再也隐藏不掉。
    fn mark_hidden(&mut self) {
        self.visible = false;
        self.last_frame_key = None;
    }
}

// HWND/HDC/HBITMAP 在 windows crate 中默认非 Send。FloatyCore 持有的全部图形句柄只会
// 在工作线程内创建/销毁/绘制,且所有访问都受 Mutex 保护;其余字段均线程安全,
// 因此这里手动标记 Send,与 fx.rs 中 RectOverlay 的处理方式一致。
unsafe impl Send for FloatyCore {}

/// 浮窗线程向自己的事件循环投递的事件。
enum OverlayEvent {
    /// 配置/计时器有变化,尽快渲染一帧。
    Wake,
}

/// 会话句柄:内核状态(可跨线程共享) + 事件循环唤醒句柄。
///
/// `proxy` 在浮窗线程把 EventLoop 建好之后回填。`EventLoopProxy` 是 `Send + Sync` 的,
/// 让 Tauri 命令线程能立刻唤醒事件循环,把"改设置生效"的延迟从"下一拍(≤16ms)"压到立即。
struct SessionHandle {
    core: Arc<Mutex<FloatyCore>>,
    proxy: Option<EventLoopProxy<OverlayEvent>>,
}

impl SessionHandle {
    /// 唤醒事件循环。事件循环尚未就绪时静默忽略——它启动后本来就会渲染第一帧。
    fn wake(&self) {
        if let Some(proxy) = &self.proxy {
            let _ = proxy.send_event(OverlayEvent::Wake);
        }
    }
}

/// 会话单例:Some 表示后端已启动(浮窗线程正在跑事件循环)。
static SESSION: LazyLock<Mutex<Option<SessionHandle>>> = LazyLock::new(|| Mutex::new(None));

/// 取出当前会话的内核句柄。**不持有 SESSION 锁**,避免与浮窗线程互相等待。
fn session_core() -> Option<Arc<Mutex<FloatyCore>>> {
    SESSION
        .lock()
        .unwrap()
        .as_ref()
        .map(|handle| handle.core.clone())
}

/// 唤醒当前会话的事件循环(没有会话时什么都不做)。
fn wake_session() {
    if let Some(handle) = SESSION.lock().unwrap().as_ref() {
        handle.wake();
    }
}

/// 清空会话,但只清"仍然指向同一个内核"的那份,避免误清新会话。
fn release_session(core_arc: &Arc<Mutex<FloatyCore>>) {
    let mut session = SESSION.lock().unwrap();
    if let Some(handle) = session.as_ref() {
        if Arc::ptr_eq(&handle.core, core_arc) {
            *session = None;
        }
    }
}

// ---------------------------------------------------------------------------
// 通用 API(供 Tauri 命令/脚本/测试调用)
// ---------------------------------------------------------------------------

/// 返回默认配置(前端可直接覆盖个别字段;供脚本/测试复用)。
#[allow(dead_code)]
pub fn default_config() -> FloatWindowConfig {
    FloatWindowConfig::default()
}

/// 启动或更新浮窗。
///
/// 已运行时调用只更新配置并同步计时器行;未运行时创建内核并启动浮窗线程(内含 winit 事件循环)。
/// 两种情况下都会唤醒事件循环,让改动立即生效。返回最新状态快照。
pub fn set(config: FloatWindowConfig) -> Result<FloatWindowState, String> {
    let mut config = config;
    config.scale = config.scale.clamp(MIN_SCALE, MAX_SCALE);
    config.anchor_x_percent = config.anchor_x_percent.clamp(0.0, 100.0);
    config.anchor_y_percent = config.anchor_y_percent.clamp(0.0, 100.0);
    config.disc_alpha = config.disc_alpha.clamp(0.0, 1.0);
    config.keys = normalize_keys(config.keys);
    mask_colors(&mut config);

    let core_arc = match session_core() {
        Some(arc) => arc,
        None => {
            let arc = Arc::new(Mutex::new(FloatyCore::new(config.clone())));
            // 先把句柄放进 SESSION(proxy 留空,由浮窗线程回填),这样并发调用 set()
            // 不会重复起线程;线程建好事件循环后本来就会渲染第一帧,漏掉这次唤醒也无影响。
            *SESSION.lock().unwrap() = Some(SessionHandle {
                core: arc.clone(),
                proxy: None,
            });
            let worker_arc = arc.clone();
            thread::Builder::new()
                .name("float-window-overlay".to_string())
                .spawn(move || overlay_loop(worker_arc))
                .map_err(|error| format!("启动浮窗线程失败: {error}"))?;
            arc
        }
    };

    {
        let mut core = core_arc.lock().unwrap();
        core.config = config;
        core.enabled = true;
        core.revision = core.revision.wrapping_add(1);
        core.sync_timers();
    }
    wake_session();
    Ok(snapshot_of(&core_arc))
}

/// 停止浮窗(隐藏窗口并清空计时器)。
///
/// 只改状态 + 唤醒事件循环:真正的隐藏、以及随后降到慢速探测,都在浮窗线程内完成。
/// 事件循环与窗口在这一轮之后继续保留(它们都是进程级一次性资源),下次 `set()` 直接复用。
pub fn disable() {
    let Some(arc) = session_core() else {
        return;
    };
    {
        let mut core = arc.lock().unwrap();
        core.enabled = false;
        core.timers.clear();
        core.manual_timer_ids.clear();
        // 这里刻意**不**动 core.visible:visible 是与 winit 实际可见性一一对应的状态,
        // 只能由浮窗线程的 hide_overlay / 渲染成功分支去改。提前把它置 false 会让
        // hide_overlay 的守卫判断失效,窗口就再也隐藏不掉了。
    }
    wake_session();
}

/// 通用入口:推送/重设一个计时器(如 E/Q 技能、道具 CD 等)。
/// id 与某条按键绑定时会重设对应行的倒计时。
pub fn trigger(id: &str, label: &str, total_seconds: f64) -> Result<FloatWindowState, String> {
    let arc = session_core().ok_or_else(|| "浮窗尚未启用,请先在设置页开启".to_string())?;
    let total = total_seconds.max(0.05);
    {
        let mut core = arc.lock().unwrap();
        if !core.enabled {
            return Err("浮窗已停用".to_string());
        }
        if let Some(timer) = core.timers.iter_mut().find(|timer| timer.id == id) {
            timer.label = if label.is_empty() {
                timer.label.clone()
            } else {
                label.to_string()
            };
            timer.total = total;
            timer.remaining = total;
        } else {
            core.timers.push(FloatyTimer {
                id: id.to_string(),
                label: if label.is_empty() {
                    id.to_string()
                } else {
                    label.to_string()
                },
                total,
                remaining: total,
            });
            // 不对应任何绑定的条目才需要记入手动列表,避免配置同步时被清掉
            if !core.config.keys.iter().any(|key| key.id == id)
                && !core.manual_timer_ids.iter().any(|item| item == id)
            {
                core.manual_timer_ids.push(id.to_string());
            }
        }
    }
    wake_session();
    Ok(snapshot_of(&arc))
}

/// 查询当前浮窗状态(未启用时返回一个"停用"的空快照)。
pub fn state() -> FloatWindowState {
    match session_core() {
        Some(arc) => snapshot_of(&arc),
        None => {
            let fallback = primary_screen_rect();
            FloatWindowState {
                enabled: false,
                visible: false,
                anchor_x_percent: 0.0,
                anchor_y_percent: 0.0,
                resolved_x: 0,
                resolved_y: 0,
                window_width: 0,
                window_height: 0,
                scale: 1.0,
                hide_when_ready: false,
                hide_when_game_missing: true,
                game_only_trigger: true,
                game_found: false,
                client_left: fallback.left,
                client_top: fallback.top,
                client_width: fallback.width,
                client_height: fallback.height,
                process_names: Vec::new(),
                keys: Vec::new(),
                timers: Vec::new(),
            }
        }
    }
}

// ---------------------------------------------------------------------------
// 内部实现
// ---------------------------------------------------------------------------

/// 仅供测试/排障:读取浮窗窗口的句柄、扩展样式与可见性。
///
/// 窗口归浮窗线程所有,但这些查询接口本身是线程安全的(只读窗口属性),
/// 所以测试可以跨线程轮询,用来验证"窗口确实建起来了、样式确实对了、像素确实提交了"。
/// 返回 `(hwnd, ex_style, is_visible)`;浮窗未启用时返回 None。
#[cfg(test)]
fn debug_window_probe() -> Option<(isize, u32, bool)> {
    let core = session_core()?;
    let hwnd = core.lock().unwrap().window?;
    unsafe {
        let ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
        Some((hwnd.0 as isize, ex_style, IsWindowVisible(hwnd).as_bool()))
    }
}

/// 将字符串转为带 null 结尾的 UTF-16 缓冲。
fn wide_with_nul(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(std::iter::once(0)).collect()
}

/// 规整按键绑定:钳制 CD、丢弃非法键码、去重(vk 相同只保留第一条启用的绑定)。
fn normalize_keys(keys: Vec<FloatWindowKeyBinding>) -> Vec<FloatWindowKeyBinding> {
    let mut result: Vec<FloatWindowKeyBinding> = Vec::with_capacity(keys.len());
    let mut used_vk: Vec<u32> = Vec::new();
    for mut key in keys {
        if key.vk == 0 {
            continue;
        }
        key.vk &= 0xFF;
        key.cd_seconds = key.cd_seconds.clamp(0.05, 3600.0);
        if key.id.trim().is_empty() {
            key.id = format!("key-{}", key.vk);
        }
        if key.enabled {
            if used_vk.contains(&key.vk) {
                continue;
            }
            used_vk.push(key.vk);
        }
        key.label = key.label.trim().to_string();
        result.push(key);
    }
    result
}

/// 把 0xRRGGBB 规整为 24 位颜色(丢弃高位)。
fn mask_colors(config: &mut FloatWindowConfig) {
    config.ring_color &= 0x00FF_FFFF;
    config.progress_color &= 0x00FF_FFFF;
    config.ready_color &= 0x00FF_FFFF;
    config.text_color &= 0x00FF_FFFF;
    config.label_color &= 0x00FF_FFFF;
    config.disc_color &= 0x00FF_FFFF;
}

/// 把 0xRRGGBB 转成 GDI 使用的 BGR COLORREF。
fn colorref_from_rgb(color: u32) -> COLORREF {
    let rgb = color & 0x00FF_FFFF;
    COLORREF(((rgb & 0xFF) << 16) | (rgb & 0xFF00) | ((rgb >> 16) & 0xFF))
}

/// 虚拟键码 -> 默认显示标签(不区分左右修饰键);无法识别的键返回空串。
fn label_from_vk(vk: u32) -> String {
    match vk {
        0x08 => "Backspace".to_string(),
        0x09 => "Tab".to_string(),
        0x0D => "Enter".to_string(),
        0x10 => "Shift".to_string(),
        0x11 => "Ctrl".to_string(),
        0x12 => "Alt".to_string(),
        0x14 => "CapsLock".to_string(),
        0x1B => "Esc".to_string(),
        0x20 => "Space".to_string(),
        0x21 => "PgUp".to_string(),
        0x22 => "PgDn".to_string(),
        0x23 => "End".to_string(),
        0x24 => "Home".to_string(),
        0x25 => "←".to_string(),
        0x26 => "↑".to_string(),
        0x27 => "→".to_string(),
        0x28 => "↓".to_string(),
        0x2D => "Ins".to_string(),
        0x2E => "Del".to_string(),
        0x60..=0x69 => format!("Num{}", vk - 0x60),
        0x6A => "Num*".to_string(),
        0x6B => "Num+".to_string(),
        0x6D => "Num-".to_string(),
        0x6E => "Num.".to_string(),
        0x6F => "Num/".to_string(),
        0x70..=0x87 => format!("F{}", vk - 0x6F),
        0xBA => ";".to_string(),
        0xBB => "=".to_string(),
        0xBC => ",".to_string(),
        0xBD => "-".to_string(),
        0xBE => ".".to_string(),
        0xBF => "/".to_string(),
        0xC0 => "`".to_string(),
        0xDB => "[".to_string(),
        0xDC => "\\".to_string(),
        0xDD => "]".to_string(),
        0xDE => "'".to_string(),
        // 0x30..=0x39(数字) 与 0x41..=0x5A(字母) 直接用 ASCII 字符
        _ => char::from_u32(vk)
            .filter(|c| c.is_ascii_alphanumeric())
            .map(|c| c.to_string())
            .unwrap_or_default(),
    }
}

/// 剩余秒数显示文本:>=10 秒显示整数,其余一位小数;0 显示 "0"。
fn format_seconds(remaining: f64) -> String {
    if remaining <= 0.0 {
        return "0".to_string();
    }
    if remaining >= 10.0 {
        format!("{:.0}", remaining)
    } else {
        format!("{:.1}", remaining)
    }
}

/// 读取内核快照(锁定会话读取)。
fn snapshot_of(core_arc: &Arc<Mutex<FloatyCore>>) -> FloatWindowState {
    let core = core_arc.lock().unwrap();
    let fallback = primary_screen_rect();
    let client = core.live.client.unwrap_or(fallback);
    FloatWindowState {
        enabled: core.enabled,
        visible: core.enabled && core.visible,
        anchor_x_percent: core.config.anchor_x_percent,
        anchor_y_percent: core.config.anchor_y_percent,
        resolved_x: core.live.resolved_x,
        resolved_y: core.live.resolved_y,
        window_width: core.live.window_width,
        window_height: core.live.window_height,
        scale: core.config.scale,
        hide_when_ready: core.config.hide_when_ready,
        hide_when_game_missing: core.config.hide_when_game_missing,
        game_only_trigger: core.config.game_only_trigger,
        game_found: core.live.game_found,
        client_left: client.left,
        client_top: client.top,
        client_width: client.width,
        client_height: client.height,
        process_names: core.effective_process_names(),
        keys: core.config.keys.clone(),
        timers: core.timers.clone(),
    }
}

/// 浮窗窗口类名(交给 winit 注册,便于在调试工具里辨认)。
const OVERLAY_CLASS_NAME: &str = "DnaSkillCdFloatWindow";
/// 停用(隐藏)状态下的探测节拍。
///
/// 事件循环是**进程级一次性**资源,建好之后不能销毁重建(见 `overlay_loop`),所以停用不能让
/// 循环退出,只能降到慢速探测:这一拍只做"看一眼 enabled"的廉价检查,真正的"立刻恢复"
/// 由 `set()` 里 `EventLoopProxy` 发出的 Wake 事件负责。
const IDLE_TICK_INTERVAL: Duration = Duration::from_millis(200);

/// 取得 winit 窗口的 HWND。
///
/// winit 没有公开 `hwnd()`(内部那套类型不外露),所以走标准的 raw-window-handle 转换;
/// 拿到之后才交给 GDI 做离屏绘制与 `UpdateLayeredWindow` 提交。
fn hwnd_of(window: &Window) -> Option<HWND> {
    match window.window_handle().ok()?.as_raw() {
        RawWindowHandle::Win32(win32) => Some(HWND(win32.hwnd.get() as *mut core::ffi::c_void)),
        _ => None,
    }
}

/// 补齐浮窗必须的扩展样式位:逐像素 alpha + 点击穿透 + 不抢焦点 + 不进任务栏。
///
/// 其中 `WS_EX_LAYERED | WS_EX_TRANSPARENT` 由 winit 的 `set_cursor_hittest(false)` 负责维护
/// (`WindowFlags::IGNORE_CURSOR_EVENT` 会带上它们,每次重写扩展样式都会自动恢复);
/// 但 `WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW` **不在** winit 的标志位里,winit 一旦因显隐等原因
/// 重写 `GWL_EXSTYLE` 就会把它们抹掉,因此这里自己补齐,并在每次显示之后重补一次。
/// 这里只改这一位、不动其它样式,所以不会和 winit 自己的状态打架。
fn apply_overlay_ex_style(window: &Window) {
    let Some(hwnd) = hwnd_of(window) else {
        return;
    };
    unsafe {
        let current = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
        let wanted = current
            | WS_EX_LAYERED.0
            | WS_EX_TRANSPARENT.0
            | WS_EX_NOACTIVATE.0
            | WS_EX_TOOLWINDOW.0;
        if wanted != current {
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, wanted as isize);
        }
    }
}

/// 隐藏浮窗。
///
/// 显隐必须走 winit 的 `Window::set_visible`:winit 对同线程调用是内联执行的,内部用的是
/// 同步 `ShowWindow(SW_HIDE)`,不会出现"投递型请求永远不执行"的问题;而且它同时维护自己的
/// VISIBLE 标志 —— 绕过它直接调 Win32 会让 winit 的状态与实际不一致,之后
/// `set_visible(true)` 会因为"标志没变"而变成空操作(窗口再也显示不出来)。
fn hide_overlay(core: &mut FloatyCore, window: &Window) {
    if core.visible {
        window.set_visible(false);
    }
    core.mark_hidden();
}

/// 浮窗应用:一拍完成"推进 CD → 检测按键 → 渲染 → 维护窗口生命周期"。
///
/// 事件循环进程内只能创建一次,所以窗口与循环都在**首次启用**时建好后一直留着:
/// `disable()` 只是把窗口藏起来并降到慢速探测,`set()` 再把它唤醒,全程不重建任何窗口/线程。
struct OverlayApp {
    /// 与 Tauri 命令线程共享的内核状态。
    core: Arc<Mutex<FloatyCore>>,
    /// 浮窗窗口(由 winit 持有;None 表示尚未创建)。
    window: Option<Window>,
    /// 下一次渲染的时刻(由 `ControlFlow::WaitUntil` 驱动)。
    next_tick: Instant,
}

impl OverlayApp {
    /// 创建浮窗窗口并补齐样式;已创建时直接返回。
    fn ensure_window(&mut self, event_loop: &ActiveEventLoop) {
        if self.window.is_some() {
            return;
        }
        let attributes = Window::default_attributes()
            .with_title("dna-builder skill cd overlay")
            .with_class_name(OVERLAY_CLASS_NAME)
            .with_decorations(false)
            .with_resizable(false)
            // 不抢焦点:浮窗永远不该成为前台窗口。
            .with_active(false)
            // 先隐藏,等第一帧像素提交完再显示,避免闪出空白/上一帧内容。
            .with_visible(false)
            .with_skip_taskbar(true)
            .with_window_level(WindowLevel::AlwaysOnTop)
            .with_inner_size(LogicalSize::new(64.0, 64.0));
        let window = match event_loop.create_window(attributes) {
            Ok(window) => window,
            Err(error) => {
                eprintln!("创建浮窗窗口失败: {error}");
                return;
            }
        };
        // 关掉鼠标命中测试:winit 借此置上 WS_EX_TRANSPARENT | WS_EX_LAYERED。
        // 前者让浮窗完全穿透点击,后者是 UpdateLayeredWindow 逐像素 alpha 的前提。
        if let Err(error) = window.set_cursor_hittest(false) {
            eprintln!("设置浮窗点击穿透失败: {error}");
        }
        apply_overlay_ex_style(&window);
        if let Some(hwnd) = hwnd_of(&window) {
            let mut core = self.core.lock().unwrap();
            core.window = Some(hwnd);
        } else {
            eprintln!("浮窗窗口句柄获取失败,无法提交像素");
        }
        self.window = Some(window);
    }

    /// 推进一拍。
    ///
    /// # 返回值
    /// 下一次唤醒的间隔:启用时是渲染节拍,停用/窗口未就绪时是慢速探测节拍。
    fn frame(&mut self, event_loop: &ActiveEventLoop) -> Duration {
        self.ensure_window(event_loop);
        let Some(window) = self.window.as_ref() else {
            // 窗口还没建起来(创建失败),慢速重试。
            return IDLE_TICK_INTERVAL;
        };
        let mut core = self.core.lock().unwrap();
        // 推进 CD 放在停用判断之前:停用时 timers 已被清空,这一拍只是把 last_tick 刷新,
        // 避免重新启用后第一拍扣掉一大段"其实没有倒计时"的时间。
        core.tick();
        if !core.enabled {
            hide_overlay(&mut core, window);
            return IDLE_TICK_INTERVAL;
        }
        render_overlay(&mut core, window);
        TICK_INTERVAL
    }
}

impl ApplicationHandler<OverlayEvent> for OverlayApp {
    /// 事件循环就绪:winit 要求窗口在活动事件循环里创建,这里先把窗口建好。
    fn resumed(&mut self, event_loop: &ActiveEventLoop) {
        self.ensure_window(event_loop);
        self.next_tick = Instant::now();
    }

    /// 窗口事件:浮窗不接收交互,只有"被外力销毁"需要处理。
    fn window_event(&mut self, _event_loop: &ActiveEventLoop, _id: WindowId, event: WindowEvent) {
        match event {
            // 浮窗没有标题栏与系统菜单,理论上收不到;收到也不关闭(生命周期由 enabled 决定)。
            WindowEvent::CloseRequested => {}
            // 窗口被外力销毁(桌面重建 / DWM 重启等):丢掉句柄,让下一拍重建。
            WindowEvent::Destroyed => {
                self.window = None;
                let mut core = self.core.lock().unwrap();
                core.window = None;
                core.mark_hidden();
                self.next_tick = Instant::now();
            }
            _ => {}
        }
    }

    /// 配置/计时器有变化:把渲染时间直接提前,不必等下一拍(改设置"实时生效"就靠它)。
    fn user_event(&mut self, _event_loop: &ActiveEventLoop, _event: OverlayEvent) {
        self.next_tick = Instant::now();
    }

    /// 每拍推进一次,然后安排下一次唤醒时刻。
    ///
    /// 这里**不退出事件循环**:循环是进程级一次性资源,退出之后无法再建(见 `overlay_loop`)。
    /// 停用只是隐藏窗口 + 放慢节拍;真正的结束发生在进程退出时。
    fn about_to_wait(&mut self, event_loop: &ActiveEventLoop) {
        if Instant::now() >= self.next_tick {
            let interval = self.frame(event_loop);
            self.next_tick = Instant::now() + interval;
        }
        event_loop.set_control_flow(ControlFlow::WaitUntil(self.next_tick));
    }
}

/// 浮窗线程入口:在**本线程**上建一个 winit 事件循环,并一直跑到进程结束。
///
/// 1. Tauri(tao)已占用主线程,所以用 `EventLoopBuilderExtWindows::any_thread(true)` 把循环
///    建在浮窗线程上(winit 在非主线程建循环会 panic)。该线程创建的窗口绑定在本线程上,
///    而本线程常驻到进程结束。
/// 2. 关掉 winit 的 DPI 设置:进程级 DPI 感知由 Tauri 决定,浮窗全程按物理像素绘制,
///    不该去动这个全局设置。
/// 3. **`EventLoopBuilder::build()` 每个进程只能成功一次**(winit 内部用 `EVENT_LOOP_CREATED`
///    全局标记做 `swap`,重复调用返回 `EventLoopError::RecreationAttempt`,非 web 平台没有
///    重置入口)。循环建好后常驻,停用只是隐藏窗口并放慢节拍。
///
/// 线程本身也就是进程生命周期的;`SESSION` 因此在首次启用后一直保留(停用时 `enabled=false`)。
fn overlay_loop(core_arc: Arc<Mutex<FloatyCore>>) {
    let mut builder = EventLoop::<OverlayEvent>::with_user_event();
    builder.with_any_thread(true).with_dpi_aware(false);
    let event_loop = match builder.build() {
        Ok(event_loop) => event_loop,
        Err(error) => {
            eprintln!("创建浮窗事件循环失败: {error}");
            release_session(&core_arc);
            return;
        }
    };

    // winit 建 EventLoop 时会把「鼠标 + 键盘」两个 Raw Input 设备类注册到自己的消息窗口,
    // 而同一设备类在进程内只认最后一次注册的目标窗口;这里再注册一次,把键盘指向热键监听窗口。
    if let Err(error) = reclaim_script_hotkey_raw_input() {
        eprintln!("恢复脚本热键的键盘 Raw Input 注册失败: {error}");
    }

    // 回填 proxy,让 Tauri 命令线程可以立刻唤醒事件循环(而不是等下一拍)。
    // 这一步必须在 run_app 之前完成:循环一旦进入等待,就只能靠这个 proxy 被唤醒了。
    if let Some(handle) = SESSION.lock().unwrap().as_mut() {
        if Arc::ptr_eq(&handle.core, &core_arc) {
            handle.proxy = Some(event_loop.create_proxy());
        }
    }

    // 把系统计时器精度提到 1ms:`ControlFlow::WaitUntil` 底层仍是毫秒级等待,
    // 默认 ~15.6ms 的时钟精度会让 16ms 的节拍抖到 30ms 以上。
    unsafe {
        timeBeginPeriod(1);
    }
    let mut app = OverlayApp {
        core: core_arc.clone(),
        window: None,
        next_tick: Instant::now(),
    };
    // 正常情况下这里不会返回(循环常驻);只有事件循环自身出错才会走到下面。
    if let Err(error) = event_loop.run_app(&mut app) {
        eprintln!("浮窗事件循环异常结束: {error}");
    }
    unsafe {
        timeEndPeriod(1);
    }
    release_session(&core_arc);
}

/// 计算行布局几何(超采样坐标系)。
///
/// # 参数
/// - `screen_dc`: 用于测量标签宽度的 DC(内存 DC 亦可);
/// - `label_font`: 标签字体(超采样字号)。
fn measure_geometry(
    screen_dc: HDC,
    core: &FloatyCore,
    visible: &[usize],
    label_font: HFONT,
    label_px: i32,
) -> FrameGeometry {
    let ss = SUPERSAMPLE as f64;
    let scale = core.config.scale.clamp(MIN_SCALE, MAX_SCALE);
    let unit = scale * ss;
    let disc_r = 24.0 * unit;
    let ring_w = (5.0 * unit).clamp(2.0 * ss, 24.0 * ss);
    let disc_d = (disc_r * 2.0).round() as i32;
    let gap = (9.0 * unit).round() as i32;
    let pad = (5.0 * unit).round() as i32;
    let row_gap = (8.0 * unit).round() as i32;

    let mut label_widths: Vec<i32> = Vec::with_capacity(visible.len());
    let mut max_width = 0i32;
    for &index in visible {
        let width = measure_text(screen_dc, label_font, &core.timers[index].label);
        label_widths.push(width);
        max_width = max_width.max(width);
    }

    let rows = visible.len() as i32;
    let ss_width = (pad * 2 + disc_d + gap + max_width).max(disc_d + pad * 2);
    let ss_height = pad * 2 + rows * disc_d + (rows.saturating_sub(1)) * row_gap;
    // 逻辑尺寸向上取整,保证画布能完整容纳布局
    let width = ((ss_width + SUPERSAMPLE - 1) / SUPERSAMPLE).max(1);
    let height = ((ss_height + SUPERSAMPLE - 1) / SUPERSAMPLE).max(1);

    FrameGeometry {
        width,
        height,
        disc_r,
        ring_w,
        pad,
        gap,
        row_gap,
        disc_d,
        label_widths,
        label_px,
    }
}

/// 把"客户区百分比"换算为屏幕坐标,并钳制在客户区内(避免锚点贴边时飘出屏幕)。
fn resolve_position(
    client: ClientRect,
    anchor_x: f64,
    anchor_y: f64,
    window_w: i32,
    window_h: i32,
) -> (i32, i32) {
    let x = client.left + (client.width as f64 * anchor_x / 100.0).round() as i32;
    let y = client.top + (client.height as f64 * anchor_y / 100.0).round() as i32;
    let max_x = client.left + (client.width - window_w).max(0);
    let max_y = client.top + (client.height - window_h).max(0);
    (x.clamp(client.left, max_x), y.clamp(client.top, max_y))
}

/// 布局 + 绘制 + 提交一帧。
fn render_overlay(core: &mut FloatyCore, window: &Window) {
    // 收集可见行:倒计时中,或"未开启就绪隐藏"的就绪行。
    let visible_indexes: Vec<usize> = core
        .timers
        .iter()
        .enumerate()
        .filter(|(_, timer)| !timer.is_ready() || !core.config.hide_when_ready)
        .map(|(index, _)| index)
        .collect();

    let process_names = core.effective_process_names();
    core.game.sync(&process_names);
    let client = core.game.client;
    core.live.client = client;
    core.live.game_found = client.is_some();

    if visible_indexes.is_empty() || (core.config.hide_when_game_missing && client.is_none()) {
        core.live.window_width = 0;
        core.live.window_height = 0;
        // 未渲染时仍按百分比给出参考坐标,便于设置页显示
        let reference = client.unwrap_or_else(primary_screen_rect);
        let (x, y) = resolve_position(
            reference,
            core.config.anchor_x_percent,
            core.config.anchor_y_percent,
            0,
            0,
        );
        core.live.resolved_x = x;
        core.live.resolved_y = y;
        hide_overlay(core, window);
        return;
    }
    let client = client.unwrap_or_else(primary_screen_rect);

    let screen_dc = unsafe { GetDC(None) };
    if screen_dc.0.is_null() {
        return;
    }

    let ss = SUPERSAMPLE as f64;
    let scale = core.config.scale.clamp(MIN_SCALE, MAX_SCALE);
    let unit = scale * ss;
    let digit_px = ((17.0 * unit).round() as i32).clamp(9, 64 * SUPERSAMPLE);
    let label_px = ((15.0 * unit).round() as i32).clamp(9, 64 * SUPERSAMPLE);
    let digit_font = core.surface.font(digit_px);
    let label_font = core.surface.font(label_px);
    let fonts = FontSet {
        digit: digit_font,
        label: label_font,
    };

    let geometry = {
        let core_ref: &FloatyCore = core;
        measure_geometry(screen_dc, core_ref, &visible_indexes, label_font, label_px)
    };

    if !core
        .surface
        .ensure(screen_dc, geometry.width, geometry.height)
        && !core.surface.ready()
    {
        unsafe {
            let _ = ReleaseDC(None, screen_dc);
        }
        return;
    }

    let (x, y) = resolve_position(
        client,
        core.config.anchor_x_percent,
        core.config.anchor_y_percent,
        geometry.width,
        geometry.height,
    );

    // 帧指纹:位置/尺寸/配置版本/可见行内容都没变就跳过重绘(100% 静止时零开销)。
    let frame_key = {
        let mut key = FrameKey::new();
        key.push(core.revision as i64)
            .push(x as i64)
            .push(y as i64)
            .push(geometry.width as i64)
            .push(geometry.height as i64);
        for &index in &visible_indexes {
            let timer = &core.timers[index];
            key.push_text(&timer.label)
                .push(timer.is_ready() as i64)
                .push_f64(timer.remaining);
        }
        key.value()
    };
    if core.visible && core.last_frame_key == Some(frame_key) {
        unsafe {
            let _ = ReleaseDC(None, screen_dc);
        }
        return;
    }

    // 窗口由 winit 创建(`OverlayApp::ensure_window`),这里只取句柄;拿不到就下一拍再试。
    let Some(hwnd) = core.window else {
        unsafe {
            let _ = ReleaseDC(None, screen_dc);
        }
        return;
    };

    paint_frame(core, &geometry, &fonts, &visible_indexes);
    core.surface.compose();

    let dst = POINT { x, y };
    let size = SIZE {
        cx: geometry.width,
        cy: geometry.height,
    };
    let src = POINT { x: 0, y: 0 };
    let blend = BLENDFUNCTION {
        BlendOp: AC_SRC_OVER as u8,
        BlendFlags: 0,
        SourceConstantAlpha: 255,
        AlphaFormat: AC_SRC_ALPHA as u8,
    };
    unsafe {
        let updated = UpdateLayeredWindow(
            hwnd,
            None,
            Some(&dst),
            Some(&size),
            Some(core.surface.out_dc),
            Some(&src),
            COLORREF(0),
            Some(&blend),
            ULW_ALPHA,
        );
        if updated.is_ok() {
            if !core.visible {
                // 先提交像素再显示,避免显示瞬间闪出上一帧内容(层级已由
                // WindowLevel::AlwaysOnTop → WS_EX_TOPMOST 保证,不需要每次重新提顶)。
                window.set_visible(true);
                // winit 在 apply_diff 里会用它自己那套标志重写 GWL_EXSTYLE,
                // 会把不在它标志位里的 WS_EX_NOACTIVATE / WS_EX_TOOLWINDOW 抹掉,显示后补一次。
                apply_overlay_ex_style(window);
            }
            core.visible = true;
            core.last_frame_key = Some(frame_key);
            core.live.resolved_x = x;
            core.live.resolved_y = y;
            core.live.window_width = geometry.width;
            core.live.window_height = geometry.height;
        } else {
            // 提交失败就藏起来,不要留着上一帧的残影;下一帧成功后会自动重新显示。
            hide_overlay(core, window);
        }
        let _ = ReleaseDC(None, screen_dc);
    }
}

/// 把一帧内容画到离屏表面的两层上(颜色层 + 覆盖度层,几何完全一致)。
fn paint_frame(
    core: &mut FloatyCore,
    geometry: &FrameGeometry,
    fonts: &FontSet,
    visible: &[usize],
) {
    core.surface.clear();
    let color_palette = Palette::for_color(&core.config);
    let mask_palette = Palette::for_mask(&core.config);
    let row_height = geometry.disc_d;
    let label_height = geometry.label_px.max(4);

    for (dc, palette) in [
        (core.surface.color_dc, color_palette),
        (core.surface.mask_dc, mask_palette),
    ] {
        for (row, &index) in visible.iter().enumerate() {
            let top = geometry.pad + row as i32 * (geometry.disc_d + geometry.row_gap);
            let cx = geometry.pad as f64 + geometry.disc_r;
            let cy = top as f64 + geometry.disc_r;
            let timer = core.timers[index].clone();
            let label_rect = RECT {
                left: geometry.pad + geometry.disc_d + geometry.gap,
                top: top + ((row_height - label_height) / 2).max(0),
                right: geometry.pad
                    + geometry.disc_d
                    + geometry.gap
                    + geometry.label_widths[row].max(4),
                bottom: top + row_height,
            };
            paint_row(
                core, dc, fonts, geometry, &palette, &timer, cx, cy, label_rect,
            );
        }
    }
}

/// 绘制一行:圆盘底 -> 圆环(基环/进度/就绪) -> 中心数字 -> 右侧标签。
///
/// # 参数
/// - `dc`: 目标层 DC(颜色层或覆盖度层);
/// - `palette`: 该层的调色板;
/// - `cx`/`cy`: 圆心(超采样坐标)。
#[allow(clippy::too_many_arguments)]
fn paint_row(
    core: &mut FloatyCore,
    dc: HDC,
    fonts: &FontSet,
    geometry: &FrameGeometry,
    palette: &Palette,
    timer: &FloatyTimer,
    cx: f64,
    cy: f64,
    label_rect: RECT,
) {
    // 1) 圆盘衬底(可半透明)。
    fill_ellipse(core, dc, cx, cy, geometry.disc_r, palette.disc);

    if timer.is_ready() {
        // 就绪:整环绿色(含标签)。
        fill_ring(
            core,
            dc,
            cx,
            cy,
            geometry.disc_r,
            geometry.ring_w,
            palette.ready,
            palette.disc,
        );
    } else {
        // 2) 基环(深色轨道)。
        fill_ring(
            core,
            dc,
            cx,
            cy,
            geometry.disc_r,
            geometry.ring_w,
            palette.ring,
            palette.disc,
        );

        // 3) 进度环:剩余比例扇形(从 12 点方向按剩余比例顺时针扫过)。
        let fraction = (timer.remaining / timer.total.max(0.001)).clamp(0.0, 1.0);
        let erase = palette.disc;
        if fraction >= 0.9995 {
            // 刚施放(剩余约等于完整 CD):直接画整环,避免 Pie 起止同点不绘制。
            fill_ring(
                core,
                dc,
                cx,
                cy,
                geometry.disc_r,
                geometry.ring_w,
                palette.progress,
                erase,
            );
        } else if fraction > 0.0035 {
            let start = std::f64::consts::FRAC_PI_2; // 12 点钟方向
            fill_pie(
                core,
                dc,
                cx,
                cy,
                geometry.disc_r,
                start,
                start + fraction * std::f64::consts::TAU,
                palette.progress,
            );
            // 4) 擦掉扇形中心,仅保留环带。
            fill_ellipse(core, dc, cx, cy, geometry.disc_r - geometry.ring_w, erase);
        }

        // 5) 中心剩余秒数。
        let inner = (geometry.disc_r - geometry.ring_w - 1.0).max(2.0);
        let rect = RECT {
            left: (cx - inner).round() as i32,
            top: (cy - inner).round() as i32,
            right: (cx + inner).round() as i32,
            bottom: (cy + inner).round() as i32,
        };
        draw_text(
            dc,
            fonts.digit,
            &format_seconds(timer.remaining),
            rect,
            palette.text,
            DT_CENTER | DT_VCENTER,
        );
    }

    // 6) 右侧标签(冷却:label_color;就绪:ready_color)。
    let label_paint = if timer.is_ready() {
        palette.ready
    } else {
        palette.label
    };
    draw_text(
        dc,
        fonts.label,
        &timer.label,
        label_rect,
        label_paint,
        DT_VCENTER,
    );
}

/// 填充整条圆环带(用 erase 擦出内缘)。
fn fill_ring(
    core: &mut FloatyCore,
    dc: HDC,
    cx: f64,
    cy: f64,
    disc_r: f64,
    ring_w: f64,
    paint: Paint,
    erase: Paint,
) {
    fill_ellipse(core, dc, cx, cy, disc_r, paint);
    fill_ellipse(core, dc, cx, cy, disc_r - ring_w, erase);
}

/// 圆心实心圆(无描边:显式选入 NULL_PEN,否则默认黑笔会在边缘压掉一行像素)。
fn fill_ellipse(core: &mut FloatyCore, dc: HDC, cx: f64, cy: f64, radius: f64, paint: Paint) {
    if radius <= 0.5 {
        return;
    }
    let brush = core.surface.brush(paint.color);
    if brush.0.is_null() {
        return;
    }
    unsafe {
        let null_pen = GetStockObject(NULL_PEN);
        let old_pen = SelectObject(dc, null_pen);
        let old_brush = SelectObject(dc, brush.into());
        let r = radius.round() as i32;
        let x = cx.round() as i32;
        let y = cy.round() as i32;
        let _ = Ellipse(dc, x - r, y - r, x + r, y + r);
        let _ = SelectObject(dc, old_brush);
        let _ = SelectObject(dc, old_pen);
    }
}

/// 圆心扇形填充(无描边),角度为弧度,从 start 扫到 end。
fn fill_pie(
    core: &mut FloatyCore,
    dc: HDC,
    cx: f64,
    cy: f64,
    radius: f64,
    start: f64,
    end: f64,
    paint: Paint,
) {
    if radius <= 0.5 {
        return;
    }
    let brush = core.surface.brush(paint.color);
    if brush.0.is_null() {
        return;
    }
    unsafe {
        let null_pen = GetStockObject(NULL_PEN);
        let old_pen = SelectObject(dc, null_pen);
        let old_brush = SelectObject(dc, brush.into());

        let r = radius.round() as i32;
        let x = cx.round() as i32;
        let y = cy.round() as i32;
        let (sx, sy) = point_on_circle(cx, cy, radius, start);
        let (ex, ey) = point_on_circle(cx, cy, radius, end);
        let _ = Pie(dc, x - r, y - r, x + r, y + r, sx, sy, ex, ey);

        let _ = SelectObject(dc, old_brush);
        let _ = SelectObject(dc, old_pen);
    }
}

/// 圆上一点的屏幕坐标(弧度;屏幕 Y 轴向下,正角度视觉上顺时针)。
fn point_on_circle(cx: f64, cy: f64, radius: f64, angle: f64) -> (i32, i32) {
    (
        (cx + radius * angle.cos()).round() as i32,
        (cy - radius * angle.sin()).round() as i32,
    )
}

/// 创建粗体字体(像素高为 px;负高度取字符高度语义)。
fn create_bold_font(px: i32) -> HFONT {
    let face = wide_with_nul("Segoe UI");
    unsafe {
        CreateFontW(
            -px,
            0,
            0,
            0,
            FW_BOLD.0 as i32,
            0,
            0,
            0,
            DEFAULT_CHARSET,
            OUT_DEFAULT_PRECIS,
            CLIP_DEFAULT_PRECIS,
            ANTIALIASED_QUALITY,
            FF_DONTCARE.0 as u32,
            PCWSTR(face.as_ptr()),
        )
    }
}

/// 用指定字体测量单行文本像素宽(DT_CALCRECT)。
fn measure_text(dc: HDC, font: HFONT, text: &str) -> i32 {
    if text.is_empty() {
        return 0;
    }
    unsafe {
        let old = SelectObject(dc, font.into());
        let mut buf: Vec<u16> = text.encode_utf16().collect();
        let mut rect = RECT {
            left: 0,
            top: 0,
            right: 10_000,
            bottom: 10_000,
        };
        let _ = DrawTextW(dc, &mut buf, &mut rect, DT_CALCRECT | DT_SINGLELINE);
        let _ = SelectObject(dc, old);
        rect.right
    }
}

/// 在矩形内绘制文本;format 为 DRAW_TEXT_FORMAT 位值(如 DT_CENTER | DT_VCENTER)。
fn draw_text(
    dc: HDC,
    font: HFONT,
    text: &str,
    rect: RECT,
    paint: Paint,
    format: windows::Win32::Graphics::Gdi::DRAW_TEXT_FORMAT,
) {
    if text.is_empty() {
        return;
    }
    unsafe {
        let old = SelectObject(dc, font.into());
        let _ = SetBkMode(dc, TRANSPARENT);
        let _ = SetTextColor(dc, colorref_from_rgb(paint.color));
        let mut buf: Vec<u16> = text.encode_utf16().collect();
        let mut rc = rect;
        let _ = DrawTextW(dc, &mut buf, &mut rc, format | DT_SINGLELINE);
        let _ = SelectObject(dc, old);
    }
}

// ---------------------------------------------------------------------------
// 单元测试:只覆盖不依赖真实桌面的纯逻辑(位置换算/绑定归一化/颜色预乘/文案)。
//   cargo test --lib float_window::tests
// ---------------------------------------------------------------------------
#[cfg(test)]
mod tests {
    use super::*;

    /// 锚点百分比换算成屏幕坐标,并保证浮窗完整落在客户区内。
    #[test]
    fn resolve_position_clamps_into_client() {
        let client = ClientRect {
            left: 100,
            top: 50,
            width: 1000,
            height: 500,
        };
        // 50% / 50% -> 客户区中心
        assert_eq!(resolve_position(client, 50.0, 50.0, 200, 100), (600, 300));
        // 贴右下角时被钳制,浮窗仍在客户区内
        assert_eq!(resolve_position(client, 100.0, 100.0, 200, 100), (900, 450));
        // 负值被钳制到左上角
        assert_eq!(resolve_position(client, -20.0, -20.0, 200, 100), (100, 50));
        // 浮窗比客户区更大时贴左上角,不出现负坐标
        assert_eq!(resolve_position(client, 60.0, 60.0, 2000, 900), (100, 50));
    }

    /// 按键绑定归一化:去重启用键、钳制 CD、补 id、丢弃非法键码。
    #[test]
    fn normalize_keys_sanitizes_input() {
        let keys = normalize_keys(vec![
            FloatWindowKeyBinding {
                id: "".to_string(),
                label: " E ".to_string(),
                vk: 0x45,
                cd_seconds: 8.0,
                enabled: true,
            },
            // 与上一条重复(启用) -> 丢弃
            FloatWindowKeyBinding {
                id: "dup".to_string(),
                label: "E2".to_string(),
                vk: 0x45,
                cd_seconds: 3.0,
                enabled: true,
            },
            // 非法键码 -> 丢弃
            FloatWindowKeyBinding {
                id: "bad".to_string(),
                label: "X".to_string(),
                vk: 0,
                cd_seconds: 5.0,
                enabled: true,
            },
            // CD 越界 -> 钳制到 0.05
            FloatWindowKeyBinding {
                id: "q".to_string(),
                label: "Q".to_string(),
                vk: 0x51,
                cd_seconds: -3.0,
                enabled: true,
            },
        ]);
        assert_eq!(keys.len(), 2);
        assert_eq!(keys[0].id, "key-69");
        assert_eq!(keys[0].label, "E");
        assert_eq!(keys[1].vk, 0x51);
        assert_eq!(keys[1].cd_seconds, 0.05);
    }

    /// 键位标签与剩余秒数文案。
    #[test]
    fn labels_and_seconds_format() {
        assert_eq!(label_from_vk(0x45), "E");
        assert_eq!(label_from_vk(0x31), "1");
        assert_eq!(label_from_vk(0x20), "Space");
        assert_eq!(label_from_vk(0x74), "F5");
        assert_eq!(label_from_vk(0x01), "");
        assert_eq!(format_seconds(0.0), "0");
        assert_eq!(format_seconds(1.234), "1.2");
        assert_eq!(format_seconds(12.4), "12");
    }

    /// 颜色按不透明度预乘,保证 compose 阶段直接取均值即为预乘结果。
    #[test]
    fn paint_premultiplies_color() {
        assert_eq!(Paint::for_color(0xffffff, 255).color, 0xffffff);
        let half = Paint::for_color(0xffffff, 128).color;
        assert_eq!(half, 0x808080);
        // 覆盖度层把不透明度写成灰度
        assert_eq!(Paint::for_mask(128).color, 0x808080);
        assert_eq!(Paint::for_mask(0).color, 0);
    }

    /// 帧指纹对同一内容稳定,对内容变化敏感。
    #[test]
    fn frame_key_tracks_content() {
        let build = |remaining: f64| {
            let mut key = FrameKey::new();
            key.push(1).push_text("E").push_f64(remaining);
            key.value()
        };
        assert_eq!(build(1.0), build(1.0));
        assert_ne!(build(1.0), build(0.9));
    }

    /// 请求的进程白名单为空时回退内置默认。
    #[test]
    fn default_process_names_fallback() {
        let mut config = FloatWindowConfig::default();
        let core = FloatyCore::new(config.clone());
        assert_eq!(
            core.effective_process_names().len(),
            DEFAULT_GAME_PROCESS_NAMES.len()
        );
        config.process_names = vec!["  ".to_string(), "custom.exe".to_string()];
        let core = FloatyCore::new(config);
        assert_eq!(
            core.effective_process_names(),
            vec!["custom.exe".to_string()]
        );
    }

    /// 计时器与按键绑定对齐:新增绑定补一行,删除绑定移除,已在倒计时的不被重置。
    #[test]
    fn sync_timers_follows_bindings() {
        let mut config = FloatWindowConfig::default();
        config.keys = vec![
            FloatWindowKeyBinding {
                id: "e".to_string(),
                label: "E".to_string(),
                vk: 0x45,
                cd_seconds: 8.0,
                enabled: true,
            },
            FloatWindowKeyBinding {
                id: "q".to_string(),
                label: "Q".to_string(),
                vk: 0x51,
                cd_seconds: 4.0,
                enabled: true,
            },
        ];
        let mut core = FloatyCore::new(config);
        assert_eq!(core.timers.len(), 2);
        // 模拟 E 正在倒计时
        core.timers[0].remaining = 5.0;
        // 追加一条绑定并再次同步(等价于设置页改配置)
        core.config.keys.push(FloatWindowKeyBinding {
            id: "r".to_string(),
            label: "R".to_string(),
            vk: 0x52,
            cd_seconds: 12.0,
            enabled: true,
        });
        core.sync_timers();
        assert_eq!(core.timers.len(), 3);
        assert_eq!(core.timers[0].remaining, 5.0);
        // 删除 Q 后对应行消失
        core.config.keys.retain(|key| key.id != "q");
        core.sync_timers();
        assert_eq!(core.timers.len(), 2);
        assert_eq!(core.timers[1].id, "r");
        // 关闭启用后同样不参与绘制
        core.config.keys[1].enabled = false;
        core.sync_timers();
        assert_eq!(core.timers.len(), 1);
    }
}

// ---------------------------------------------------------------------------
// 端到端冒烟测试(需要真实 Windows 桌面,默认忽略):
//   cargo test --lib float_window::smoke -- --ignored --nocapture
//
// 它不只"跑一遍不崩",而是跨线程把浮窗窗口查出来,逐项验证:
//   - 窗口真的建起来了、第一帧真的提交了(可见 + 尺寸非零);
//   - 扩展样式确实是 WS_EX_LAYERED(逐像素 alpha 的前提)
//     / WS_EX_TRANSPARENT(点击穿透)/ WS_EX_NOACTIVATE / WS_EX_TOOLWINDOW;
//   - disable() 之后窗口被隐藏(但窗口与会话保留,因为 winit 的 EventLoop 进程内不能重建);
//   - 反复开关多轮仍然正常,且复用同一个窗口句柄(不泄漏窗口)。
// ---------------------------------------------------------------------------
#[cfg(test)]
mod smoke {
    use super::*;

    /// 串行锁。
    ///
    /// 浮窗是**进程级单例**:整个进程只有一个 winit `EventLoop`、一份 `SESSION`。而 `cargo test`
    /// 默认多线程跑用例,两个端到端用例并行时会互相抢事件循环(表现为 `EventLoop can't be recreated`)
    /// 甚至互相覆盖 `SESSION`。这把锁把顺序强制下来。锁中毒时直接取回内层值继续用,不做额外处理。
    static SMOKE_SERIAL: Mutex<()> = Mutex::new(());

    /// 取得串行锁(容忍中毒)。
    fn serial_guard() -> std::sync::MutexGuard<'static, ()> {
        SMOKE_SERIAL
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// 轮询等待窗口出现/显示状态达到期望值。
    fn wait_for_visible(expect: bool, tries: usize) -> Option<(isize, u32, bool)> {
        let mut last = None;
        for _ in 0..tries {
            last = debug_window_probe();
            if last
                .map(|(_, _, visible)| visible == expect)
                .unwrap_or(false)
            {
                return last;
            }
            thread::sleep(Duration::from_millis(50));
        }
        last
    }

    /// 打开浮窗、推送计时器、校验窗口样式与显隐,再关闭并确认窗口被隐藏。
    #[test]
    #[ignore = "需要真实 Windows 桌面,手动运行"]
    fn demo_overlay() {
        let _serial = serial_guard();
        let mut cfg = FloatWindowConfig::default();
        cfg.anchor_x_percent = 4.0;
        cfg.anchor_y_percent = 4.0;
        cfg.scale = 1.2;
        cfg.game_only_trigger = false;
        cfg.hide_when_game_missing = false;
        cfg.keys = vec![
            FloatWindowKeyBinding {
                id: "key-69".to_string(),
                label: "E".to_string(),
                vk: 0x45,
                cd_seconds: 5.0,
                enabled: true,
            },
            FloatWindowKeyBinding {
                id: "key-81".to_string(),
                label: "Q".to_string(),
                vk: 0x51,
                cd_seconds: 3.2,
                enabled: true,
            },
        ];
        let s1 = set(cfg).expect("set overlay");
        assert!(s1.enabled);
        assert_eq!(s1.timers.len(), 2);
        let s2 = trigger("key-81", "Q", 3.2).expect("trigger q");
        assert_eq!(s2.timers.len(), 2);

        // 窗口由浮窗线程创建,这里跨线程轮询到它可见为止。
        let (hwnd, ex_style, visible) = wait_for_visible(true, 80).expect("浮窗窗口未创建");
        assert_ne!(hwnd, 0, "窗口句柄无效");
        assert!(visible, "浮窗窗口未显示");
        assert_eq!(
            ex_style & WS_EX_LAYERED.0,
            WS_EX_LAYERED.0,
            "缺少 WS_EX_LAYERED(逐像素 alpha 的前提)"
        );
        assert_eq!(
            ex_style & WS_EX_TRANSPARENT.0,
            WS_EX_TRANSPARENT.0,
            "缺少 WS_EX_TRANSPARENT(点击穿透)"
        );
        assert_eq!(
            ex_style & WS_EX_NOACTIVATE.0,
            WS_EX_NOACTIVATE.0,
            "缺少 WS_EX_NOACTIVATE"
        );
        assert_eq!(
            ex_style & WS_EX_TOOLWINDOW.0,
            WS_EX_TOOLWINDOW.0,
            "缺少 WS_EX_TOOLWINDOW"
        );
        let shown = state();
        assert!(
            shown.window_width > 0 && shown.window_height > 0,
            "UpdateLayeredWindow 未提交任何像素"
        );

        // 让它可见地跑几秒(顺带验证计时器在推进)。
        thread::sleep(Duration::from_secs(3));
        disable();
        assert!(!state().enabled, "停用后状态未更新");

        // 停用 = 隐藏窗口(enabled 立即为 false,隐藏发生在下一拍)。
        let (_, _, still_visible) =
            wait_for_visible(false, 60).expect("停用后窗口消失(句柄都没了)");
        assert!(!still_visible, "停用后浮窗仍然可见");
    }

    /// 反复开关。
    ///
    /// `EventLoop` 每进程只能创建一次。这个用例确认多轮开关都能正常显示/隐藏,
    /// 而且复用同一个窗口句柄(既没有重建、也没有泄漏窗口)。
    #[test]
    #[ignore = "需要真实 Windows 桌面,手动运行"]
    fn reopen_cycle() {
        let _serial = serial_guard();
        let mut first_hwnd = None;
        for round in 0..3 {
            let mut cfg = FloatWindowConfig::default();
            cfg.game_only_trigger = false;
            cfg.hide_when_game_missing = false;
            cfg.keys = vec![FloatWindowKeyBinding {
                id: "key-69".to_string(),
                label: "E".to_string(),
                vk: 0x45,
                cd_seconds: 30.0,
                enabled: true,
            }];
            set(cfg).unwrap_or_else(|error| panic!("第 {round} 轮 set 失败: {error}"));

            let (hwnd, ex_style, visible) =
                wait_for_visible(true, 80).unwrap_or_else(|| panic!("第 {round} 轮窗口未创建"));
            assert!(visible, "第 {round} 轮窗口未显示");
            assert_eq!(
                ex_style & WS_EX_LAYERED.0,
                WS_EX_LAYERED.0,
                "第 {round} 轮缺少 WS_EX_LAYERED"
            );
            assert_eq!(
                ex_style & WS_EX_NOACTIVATE.0,
                WS_EX_NOACTIVATE.0,
                "第 {round} 轮缺少 WS_EX_NOACTIVATE"
            );
            match first_hwnd {
                // 首轮记下句柄,之后每轮都必须是同一个(窗口复用而非重建)。
                None => first_hwnd = Some(hwnd),
                Some(expected) => assert_eq!(hwnd, expected, "第 {round} 轮换了新窗口句柄"),
            }

            disable();
            let (_, _, still_visible) =
                wait_for_visible(false, 60).unwrap_or_else(|| panic!("第 {round} 轮窗口句柄丢失"));
            assert!(!still_visible, "第 {round} 轮停用后仍然可见");
        }
    }
}
