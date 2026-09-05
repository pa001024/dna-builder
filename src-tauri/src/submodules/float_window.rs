use std::sync::{Arc, LazyLock, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use windows::Win32::Foundation::{
    COLORREF, ERROR_CLASS_ALREADY_EXISTS, GetLastError, HWND, LPARAM, LRESULT, RECT, WPARAM,
};
use windows::Win32::Graphics::Gdi::{
    ANTIALIASED_QUALITY, BLACKNESS, CLIP_DEFAULT_PRECIS, CreateFontW, CreateSolidBrush,
    DEFAULT_CHARSET, DT_CALCRECT, DT_CENTER, DT_SINGLELINE, DT_VCENTER, DeleteObject, DrawTextW,
    Ellipse, FF_DONTCARE, FW_BOLD, GetDC, GetStockObject, NULL_PEN, OUT_DEFAULT_PRECIS, PatBlt,
    Pie, ReleaseDC, SelectObject, SetBkMode, SetTextColor, TRANSPARENT,
};
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, PROCESSENTRY32W, Process32FirstW, Process32NextW, TH32CS_SNAPPROCESS,
};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DestroyWindow, GetForegroundWindow, GetWindowThreadProcessId,
    HCURSOR, HICON, HWND_TOPMOST, LWA_COLORKEY, RegisterClassExW, SW_HIDE, SWP_NOACTIVATE,
    SWP_NOOWNERZORDER, SWP_SHOWWINDOW, SetLayeredWindowAttributes, SetWindowPos, ShowWindowAsync,
    WNDCLASS_STYLES, WNDCLASSEXW, WS_EX_LAYERED, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
    WS_EX_TRANSPARENT, WS_POPUP,
};
use windows::core::PCWSTR;

// ---------------------------------------------------------------------------
// 通用 Win32 游戏浮窗(E 技能 CD 倒计时)。
//
// 参考 better-genshin-impact 的 SkillCdTrigger + MaskWindow 思路,在 Rust 后端用原生
// Win32 分层窗口 + GDI 实现一个"通用浮窗":
// - 窗口属性与 fx.rs 覆盖层一致:WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW |
//   WS_EX_NOACTIVATE + 置顶,配合 LWA_COLORKEY 把纯黑当透明,做到点击穿透、不抢焦点;
// - 浮窗内容是"计时器列表":每行 = 圆环 + 剩余秒数 + 右侧标签(E),冷却归零后按配置整行隐藏;
// - set() 启动/更新:可配置触发键(默认 E)与完整 CD 秒数,后台工作线程轮询按键
//   (上升沿 + 防抖),技能就绪时按 E 从完整 CD 开始倒计时并实时渲染;
// - trigger() 是通用入口,前端/脚本可推送任意 (id, label, 秒数) 计时器;
// - 可选"仅游戏窗口前台触发"(进程名白名单),避免输入时全局误触发。
//
// 说明:仓库的 Windows FFI 统一走 windows crate(即 Win32/WinAPI 的现代 Rust 封装,
// 与 fx.rs/win.rs 一致),不引入旧版 winapi crate;全部窗口句柄只归浮窗工作线程。
// ---------------------------------------------------------------------------

/// 浮窗窗口类名。
static OVERLAY_CLASS_WIDE: LazyLock<Vec<u16>> =
    LazyLock::new(|| wide_with_nul("DnaSkillCdFloatWindow"));
/// 被视为"游戏窗口"的进程白名单(仅前台进程命中时才允许按键触发)。
const GAME_PROCESS_NAMES: &[&str] = &["EM-Win64-Shipping.exe", "EM.exe"];
/// 工作线程渲染/按键轮询间隔。
const TICK_INTERVAL: Duration = Duration::from_millis(33);
/// 按键触发最小间隔(防抖,防止按住/连发反复重设)。
const KEY_DEBOUNCE: Duration = Duration::from_millis(200);

/// 浮窗可视化配置(由前端设置页下发,字段名与 serde camelCase 对齐)。
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FloatWindowConfig {
    /// 浮窗左上角屏幕坐标 X(物理像素)。
    pub x: i32,
    /// 浮窗左上角屏幕坐标 Y(物理像素)。
    pub y: i32,
    /// 整体缩放系数(0.5 ~ 3.0)。
    pub scale: f64,
    /// CD 归零(就绪)后隐藏该项;true 则浮窗只在倒计时期间出现。
    pub hide_when_ready: bool,
    /// 触发键虚拟键码(VK),0 表示不启用按键触发(仅保留通用 trigger 入口)。
    pub trigger_key: u32,
    /// 触发键对应技能的完整冷却秒数。
    pub trigger_cd_seconds: f64,
    /// 是否仅允许"游戏窗口在前台"时按键触发。
    pub game_only_trigger: bool,
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

impl Default for FloatWindowConfig {
    /// 默认配置:E 键、8 秒完整 CD、深色圆盘 + 琥珀进度 + 绿色就绪。
    fn default() -> Self {
        Self {
            x: 1480,
            y: 560,
            scale: 1.0,
            hide_when_ready: false,
            trigger_key: 0x45, // VK_E
            trigger_cd_seconds: 8.0,
            game_only_trigger: true,
            ring_color: 0x3f4a5c,
            progress_color: 0xf59e0b,
            ready_color: 0x22c55e,
            text_color: 0xf8fafc,
            label_color: 0x9aa4b2,
            disc_color: 0x161b22,
        }
    }
}

/// 浮窗内单个计时器(通用:可同时放 E/Q/换人/道具等任意条目)。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FloatyTimer {
    /// 计时器唯一标识,如 "e";相同 id 再次触发视为重设。
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

/// 返回给前端的浮窗状态快照。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FloatWindowState {
    /// 后端浮窗是否处于启用状态。
    pub enabled: bool,
    /// 浮窗当前是否可见(有至少一行需要绘制)。
    pub visible: bool,
    /// 生效的左上角坐标与缩放。
    pub x: i32,
    pub y: i32,
    pub scale: f64,
    pub hide_when_ready: bool,
    pub trigger_key: u32,
    pub trigger_cd_seconds: f64,
    pub game_only_trigger: bool,
    /// 当前全部计时器快照(含就绪项)。
    pub timers: Vec<FloatyTimer>,
}

/// 浮窗运行时内核;窗口句柄与绘制只允许在浮窗工作线程内进行。
struct FloatyCore {
    enabled: bool,
    /// 窗口当前是否可见(由渲染循环维护)。
    visible: bool,
    config: FloatWindowConfig,
    /// 浮窗窗口句柄;None 表示尚未创建。
    window: Option<HWND>,
    /// 计时器列表(保持插入顺序,自上而下绘制)。
    timers: Vec<FloatyTimer>,
    /// 上一帧时间戳(用于精确扣减 CD)。
    last_tick: Instant,
    /// 上一次按键按下状态(上升沿检测)。
    key_down: bool,
    /// 上一次触发时刻(防抖)。
    last_trigger_at: Instant,
    /// 游戏进程 PID 缓存(仅 game_only_trigger 时使用)。
    game_pids: Vec<u32>,
    /// 游戏 PID 缓存刷新时间。
    game_pids_checked_at: Instant,
}

impl FloatyCore {
    /// 创建内核,enabled 默认开启。
    fn new(config: FloatWindowConfig) -> Self {
        Self {
            enabled: true,
            visible: false,
            config,
            window: None,
            timers: Vec::new(),
            last_tick: Instant::now(),
            key_down: false,
            last_trigger_at: Instant::now() - KEY_DEBOUNCE,
            game_pids: Vec::new(),
            game_pids_checked_at: Instant::now() - Duration::from_secs(1),
        }
    }

    /// 销毁浮窗窗口(必须由创建它的工作线程调用)。
    fn destroy_window(&mut self) {
        if let Some(hwnd) = self.window.take() {
            unsafe {
                let _ = DestroyWindow(hwnd);
            }
        }
        self.visible = false;
    }

    /// 同步/创建"触发键默认计时器"(如 E),保证设置页改动后立即可用。
    fn sync_default_key_timer(&mut self) {
        let key = self.config.trigger_key;
        if key == 0 || self.config.trigger_cd_seconds <= 0.0 {
            return;
        }
        let label = label_from_vk(key);
        if label.is_empty() {
            return;
        }
        let id = format!("key_{key}");
        if let Some(timer) = self.timers.iter_mut().find(|t| t.id == id) {
            // 已就绪时同步新的完整 CD;倒计时中途改配置不打断计时。
            if timer.is_ready() {
                timer.total = self.config.trigger_cd_seconds;
            }
        } else {
            self.timers.push(FloatyTimer {
                id,
                label,
                total: self.config.trigger_cd_seconds,
                remaining: 0.0, // 初始就绪,等待按键
            });
        }
    }

    /// 帧推进:先按真实时间扣减全部计时器,再处理按键触发。
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
        self.maybe_trigger_by_key();
    }

    /// 检测触发键上升沿:就绪时按 E 开始完整 CD 倒计时;冷却中按 E 不打断。
    fn maybe_trigger_by_key(&mut self) {
        let key = self.config.trigger_key;
        if key == 0 || self.config.trigger_cd_seconds <= 0.0 {
            self.key_down = false;
            return;
        }
        if self.config.game_only_trigger && !self.is_game_foreground() {
            self.key_down = false;
            return;
        }
        let raw = unsafe { GetAsyncKeyState(key as i32) };
        let pressed = (raw as i16) < 0; // i16 最高位为 1 表示按键处于按下状态
        if pressed && !self.key_down && self.last_trigger_at.elapsed() >= KEY_DEBOUNCE {
            let id = format!("key_{key}");
            let label = label_from_vk(key);
            if let Some(timer) = self.timers.iter_mut().find(|t| t.id == id) {
                // 技能就绪才允许施放;避免一次按 E 被重复判定为两次施放。
                if timer.is_ready() {
                    timer.total = self.config.trigger_cd_seconds;
                    timer.remaining = self.config.trigger_cd_seconds;
                    self.last_trigger_at = Instant::now();
                }
            } else if !label.is_empty() {
                self.timers.push(FloatyTimer {
                    id,
                    label,
                    total: self.config.trigger_cd_seconds,
                    remaining: self.config.trigger_cd_seconds,
                });
                self.last_trigger_at = Instant::now();
            }
        }
        self.key_down = pressed;
    }

    /// 前台窗口是否属于白名单内的游戏进程(进程列表每 1 秒刷新一次)。
    fn is_game_foreground(&mut self) -> bool {
        if self.game_pids_checked_at.elapsed() >= Duration::from_secs(1) {
            self.game_pids = collect_game_pids();
            self.game_pids_checked_at = Instant::now();
        }
        let foreground = unsafe { GetForegroundWindow() };
        if foreground.0.is_null() {
            return false;
        }
        let mut pid = 0u32;
        unsafe {
            GetWindowThreadProcessId(foreground, Some(&mut pid));
        }
        pid != 0 && self.game_pids.contains(&pid)
    }
}

// HWND 在 windows crate 中默认非 Send。FloatyCore 持有的窗口句柄只会在工作线程内
// 创建/销毁/绘制,且所有访问都受 Mutex 保护;其余字段(配置/计时器)均线程安全,
// 因此这里手动标记 Send,与 fx.rs 中 RectOverlay 的处理方式一致。
unsafe impl Send for FloatyCore {}

/// 会话单例:Some 表示后端已启动且工作线程存活。
static SESSION: LazyLock<Mutex<Option<Arc<Mutex<FloatyCore>>>>> =
    LazyLock::new(|| Mutex::new(None));

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
/// 已运行时调用只更新配置/同步默认计时器;未运行时创建内核并启动后台工作线程。
/// 返回最新状态快照。
pub fn set(config: FloatWindowConfig) -> Result<FloatWindowState, String> {
    let mut config = config;
    config.scale = config.scale.clamp(0.5, 3.0);
    config.x = config.x.clamp(-100_000, 100_000);
    config.y = config.y.clamp(-100_000, 100_000);
    mask_colors(&mut config);

    let existing = SESSION.lock().unwrap().clone();
    let core_arc = match existing {
        Some(arc) => arc,
        None => {
            let arc = Arc::new(Mutex::new(FloatyCore::new(config.clone())));
            *SESSION.lock().unwrap() = Some(arc.clone());
            let worker_arc = arc.clone();
            thread::Builder::new()
                .name("float-window-overlay".to_string())
                .spawn(move || overlay_worker(worker_arc))
                .map_err(|error| format!("启动浮窗工作线程失败: {error}"))?;
            arc
        }
    };

    {
        let mut core = core_arc.lock().unwrap();
        core.config = config;
        core.enabled = true;
        core.sync_default_key_timer();
    }
    Ok(snapshot_of(&core_arc))
}

/// 停止浮窗(隐藏并销毁窗口、清空计时器);后台线程在下一拍内完成清理。
pub fn disable() {
    if let Some(arc) = SESSION.lock().unwrap().clone() {
        let mut core = arc.lock().unwrap();
        core.enabled = false;
        core.timers.clear();
        core.visible = false;
    }
}

/// 通用入口:推送/重设一个计时器(需后端已启用,如 E/Q 技能、道具 CD 等)。
pub fn trigger(id: &str, label: &str, total_seconds: f64) -> Result<FloatWindowState, String> {
    let arc = SESSION
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| "浮窗尚未启用,请先在设置页开启".to_string())?;
    let total = total_seconds.max(0.1);
    {
        let mut core = arc.lock().unwrap();
        if !core.enabled {
            return Err("浮窗已停用".to_string());
        }
        if let Some(timer) = core.timers.iter_mut().find(|t| t.id == id) {
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
        }
    }
    Ok(snapshot_of(&arc))
}

/// 查询当前浮窗状态(未启用时返回一个"停用"的空快照)。
pub fn state() -> FloatWindowState {
    match SESSION.lock().unwrap().clone() {
        Some(arc) => snapshot_of(&arc),
        None => FloatWindowState {
            enabled: false,
            visible: false,
            x: 0,
            y: 0,
            scale: 1.0,
            hide_when_ready: false,
            trigger_key: 0,
            trigger_cd_seconds: 0.0,
            game_only_trigger: true,
            timers: Vec::new(),
        },
    }
}

// ---------------------------------------------------------------------------
// 内部实现
// ---------------------------------------------------------------------------

/// 将字符串转为带 null 结尾的 UTF-16 缓冲。
fn wide_with_nul(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(std::iter::once(0)).collect()
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

/// 虚拟键码 -> 显示标签(A-Z);未知键返回空。
fn label_from_vk(vk: u32) -> String {
    if (0x41..=0x5A).contains(&vk) {
        char::from_u32(vk)
            .map(|c| c.to_string())
            .unwrap_or_default()
    } else if vk == 0x45 {
        "E".to_string()
    } else {
        String::new()
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
    FloatWindowState {
        enabled: core.enabled,
        visible: core.enabled && core.visible,
        x: core.config.x,
        y: core.config.y,
        scale: core.config.scale,
        hide_when_ready: core.config.hide_when_ready,
        trigger_key: core.config.trigger_key,
        trigger_cd_seconds: core.config.trigger_cd_seconds,
        game_only_trigger: core.config.game_only_trigger,
        timers: core.timers.clone(),
    }
}

/// 枚举进程快照,收集白名单内进程的全部 PID(忽略大小写)。
fn collect_game_pids() -> Vec<u32> {
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
                if GAME_PROCESS_NAMES
                    .iter()
                    .any(|candidate| name.eq_ignore_ascii_case(candidate))
                {
                    result.push(entry.th32ProcessID);
                }
                if !Process32NextW(snapshot, &mut entry).is_ok() {
                    break;
                }
            }
        }
    }
    result
}

/// 浮窗工作线程:按帧推进 CD、检测按键、渲染并维护窗口生命周期。
fn overlay_worker(core_arc: Arc<Mutex<FloatyCore>>) {
    loop {
        let disabled_now = {
            let mut core = core_arc.lock().unwrap();
            if !core.enabled {
                core.destroy_window();
                true
            } else {
                core.tick();
                render_overlay(&mut core);
                false
            }
        };
        if !disabled_now {
            thread::sleep(TICK_INTERVAL);
            continue;
        }
        // 退出前留一个小窗口:如果刚好被快速重新启用,则继续渲染而不是销毁。
        thread::sleep(Duration::from_millis(60));
        let still_disabled = {
            let core = core_arc.lock().unwrap();
            !core.enabled
        };
        if !still_disabled {
            continue;
        }
        // 兜底销毁窗口,并清空会话,避免残留 Arc。
        {
            let mut core = core_arc.lock().unwrap();
            core.destroy_window();
            core.enabled = false;
        }
        let mut session = SESSION.lock().unwrap();
        if let Some(existing) = session.as_ref() {
            if Arc::ptr_eq(existing, &core_arc) {
                *session = None;
            }
        }
        break;
    }
}

/// 布局 + 绘制一帧。
fn render_overlay(core: &mut FloatyCore) {
    // 收集可见行:倒计时中,或"未开启就绪隐藏"的就绪行。
    let visible_indexes: Vec<usize> = core
        .timers
        .iter()
        .enumerate()
        .filter(|(_, timer)| !timer.is_ready() || !core.config.hide_when_ready)
        .map(|(index, _)| index)
        .collect();
    if visible_indexes.is_empty() {
        if let Some(hwnd) = core.window {
            core.visible = false;
            unsafe {
                let _ = ShowWindowAsync(hwnd, SW_HIDE);
            }
        }
        return;
    }

    // 确保窗口存在。
    if core.window.is_none() {
        if let Some(hwnd) = create_overlay_window() {
            core.window = Some(hwnd);
        } else {
            return;
        }
    }
    let hwnd = core.window.expect("overlay window exists");

    // 计算几何常量(全部按缩放系数换算)。
    let scale = core.config.scale.max(0.5);
    let disc_r = 24.0 * scale; // 圆盘半径
    let ring_w = (5.0 * scale).clamp(2.0, 24.0); // 环带宽度
    let disc_d = (disc_r * 2.0).round() as i32;
    let gap = (9.0 * scale).round() as i32; // 圆盘与标签间距
    let pad = (5.0 * scale).round() as i32;
    let row_gap = (8.0 * scale).round() as i32;
    let digit_px = ((17.0 * scale).round() as i32).clamp(9, 64);
    let label_px = ((15.0 * scale).round() as i32).clamp(9, 64);

    unsafe {
        let hdc = GetDC(Some(hwnd));
        if hdc.0.is_null() {
            return;
        }

        let digit_font = create_bold_font(digit_px);
        let label_font = create_bold_font(label_px);

        // 测量每行标签宽度 -> 决定窗口宽度。
        let mut label_widths: Vec<i32> = Vec::with_capacity(visible_indexes.len());
        let mut max_width = 0i32;
        for &index in &visible_indexes {
            let width = measure_text(hdc, label_font, &core.timers[index].label);
            label_widths.push(width);
            max_width = max_width.max(width);
        }

        let rows = visible_indexes.len() as i32;
        let win_w = (pad * 2 + disc_d + gap + max_width).max(disc_d + pad * 2);
        let win_h = pad * 2 + rows * disc_d + (rows.saturating_sub(1)) * row_gap;

        // 复位窗口:位置来自配置,尺寸来自测量(置顶 + 显示)。
        let _ = SetWindowPos(
            hwnd,
            Some(HWND_TOPMOST),
            core.config.x,
            core.config.y,
            win_w,
            win_h,
            SWP_SHOWWINDOW | SWP_NOACTIVATE | SWP_NOOWNERZORDER,
        );
        core.visible = true;

        // 清空整窗为黑色(色键 -> 透明)。
        let _ = PatBlt(hdc, 0, 0, win_w, win_h, BLACKNESS);

        let row_height = disc_d;
        for (row, &index) in visible_indexes.iter().enumerate() {
            let top = pad + row as i32 * (disc_d + row_gap);
            let cy = top as f64 + disc_r;
            let cx = pad as f64 + disc_r;
            let timer = &core.timers[index];
            draw_timer_row(
                hdc,
                cx,
                cy,
                disc_r,
                ring_w,
                digit_font,
                label_font,
                timer,
                &core.config,
                top,
                pad + disc_d + gap,
                label_widths[row],
                row_height,
                label_px,
            );
        }

        if !digit_font.0.is_null() {
            let _ = DeleteObject(digit_font.into());
        }
        if !label_font.0.is_null() {
            let _ = DeleteObject(label_font.into());
        }
        let _ = ReleaseDC(Some(hwnd), hdc);
    }
}

/// 在指定圆心绘制一行:圆盘底 -> 圆环(基环/进度/就绪) -> 数字与标签。
///
/// # 参数
/// - top: 行的顶部 Y;label_x / label_width 为右侧标签区域;
/// - 数字只画在冷却期间;就绪时仅画整环(绿色)与标签。
#[allow(clippy::too_many_arguments)]
fn draw_timer_row(
    hdc: windows::Win32::Graphics::Gdi::HDC,
    cx: f64,
    cy: f64,
    disc_r: f64,
    ring_w: f64,
    digit_font: windows::Win32::Graphics::Gdi::HFONT,
    label_font: windows::Win32::Graphics::Gdi::HFONT,
    timer: &FloatyTimer,
    config: &FloatWindowConfig,
    row_top: i32,
    label_x: i32,
    label_width: i32,
    row_height: i32,
    label_px: i32,
) {
    // 1) 圆盘底色(先铺一层,保证后续"擦除内圈"时颜色统一)。
    fill_ellipse(hdc, cx, cy, disc_r, config.disc_color);

    if timer.is_ready() {
        // 就绪:整环绿色。
        fill_ring(
            hdc,
            cx,
            cy,
            disc_r,
            ring_w,
            config.ready_color,
            config.disc_color,
        );
    } else {
        // 2) 基环(深色轨道)。
        fill_ring(
            hdc,
            cx,
            cy,
            disc_r,
            ring_w,
            config.ring_color,
            config.disc_color,
        );

        // 3) 进度环:剩余比例扇形(从 12 点方向按剩余比例扫过)。
        let f = (timer.remaining / timer.total.max(0.001)).clamp(0.0, 1.0);
        if f >= 0.9995 {
            // 刚施放(剩余约等于完整 CD):直接画整环,避免 Pie 起止同点不绘制。
            fill_ring(
                hdc,
                cx,
                cy,
                disc_r,
                ring_w,
                config.progress_color,
                config.disc_color,
            );
        } else if f > 0.004 {
            let start = std::f64::consts::FRAC_PI_2; // 12 点钟方向
            fill_pie(
                hdc,
                cx,
                cy,
                disc_r,
                start,
                start + f * std::f64::consts::TAU,
                config.progress_color,
            );
            // 4) 擦掉扇形中心,仅保留环带;同时清理扇形径向边缘。
            fill_ellipse(hdc, cx, cy, disc_r - ring_w, config.disc_color);
        }

        // 5) 中心剩余秒数。
        let inner = (disc_r - ring_w - 1.0).max(2.0);
        let rect = RECT {
            left: (cx - inner).round() as i32,
            top: (cy - inner).round() as i32,
            right: (cx + inner).round() as i32,
            bottom: (cy + inner).round() as i32,
        };
        draw_text(
            hdc,
            digit_font,
            &format_seconds(timer.remaining),
            rect,
            config.text_color,
            DT_CENTER | DT_VCENTER,
        );
    }

    // 6) 右侧标签(冷却:label_color;就绪:ready_color)。
    let label_color = if timer.is_ready() {
        config.ready_color
    } else {
        config.label_color
    };
    let label_height = label_px.max(4);
    let label_rect = RECT {
        left: label_x,
        top: row_top + ((row_height - label_height) / 2).max(0),
        right: label_x + label_width.max(4),
        bottom: row_top + row_height,
    };
    draw_text(
        hdc,
        label_font,
        &timer.label,
        label_rect,
        label_color,
        DT_VCENTER | DT_SINGLELINE,
    );
}

/// 填充整条圆环带(用 erase_color 擦出内缘)。
fn fill_ring(
    hdc: windows::Win32::Graphics::Gdi::HDC,
    cx: f64,
    cy: f64,
    disc_r: f64,
    ring_w: f64,
    color: u32,
    erase_color: u32,
) {
    fill_ellipse(hdc, cx, cy, disc_r, color);
    fill_ellipse(hdc, cx, cy, disc_r - ring_w, erase_color);
}

/// 圆心实心圆。
fn fill_ellipse(
    hdc: windows::Win32::Graphics::Gdi::HDC,
    cx: f64,
    cy: f64,
    radius: f64,
    color: u32,
) {
    if radius <= 0.5 {
        return;
    }
    unsafe {
        let brush = CreateSolidBrush(colorref_from_rgb(color));
        if brush.0.is_null() {
            return;
        }
        let old = SelectObject(hdc, brush.into());
        let r = radius.round() as i32;
        let x = cx.round() as i32;
        let y = cy.round() as i32;
        let _ = Ellipse(hdc, x - r, y - r, x + r, y + r);
        let _ = SelectObject(hdc, old);
        let _ = DeleteObject(brush.into());
    }
}

/// 圆心扇形填充(无描边),角度为弧度,从 start 到 end。
fn fill_pie(
    hdc: windows::Win32::Graphics::Gdi::HDC,
    cx: f64,
    cy: f64,
    radius: f64,
    start: f64,
    end: f64,
    color: u32,
) {
    if radius <= 0.5 {
        return;
    }
    unsafe {
        let brush = CreateSolidBrush(colorref_from_rgb(color));
        if brush.0.is_null() {
            return;
        }
        let null_pen = GetStockObject(NULL_PEN);
        let old_pen = SelectObject(hdc, null_pen);
        let old_brush = SelectObject(hdc, brush.into());

        let r = radius.round() as i32;
        let x = cx.round() as i32;
        let y = cy.round() as i32;
        let (sx, sy) = point_on_circle(cx, cy, radius, start);
        let (ex, ey) = point_on_circle(cx, cy, radius, end);
        let _ = Pie(hdc, x - r, y - r, x + r, y + r, sx, sy, ex, ey);

        let _ = SelectObject(hdc, old_brush);
        let _ = SelectObject(hdc, old_pen);
        let _ = DeleteObject(brush.into());
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
fn create_bold_font(px: i32) -> windows::Win32::Graphics::Gdi::HFONT {
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
fn measure_text(
    hdc: windows::Win32::Graphics::Gdi::HDC,
    font: windows::Win32::Graphics::Gdi::HFONT,
    text: &str,
) -> i32 {
    if text.is_empty() {
        return 0;
    }
    unsafe {
        let old = SelectObject(hdc, font.into());
        let mut buf: Vec<u16> = text.encode_utf16().collect();
        let mut rect = RECT {
            left: 0,
            top: 0,
            right: 10_000,
            bottom: 10_000,
        };
        let _ = DrawTextW(hdc, &mut buf, &mut rect, DT_CALCRECT | DT_SINGLELINE);
        let _ = SelectObject(hdc, old);
        rect.right
    }
}

/// 在矩形内绘制文本;format 为 DRAW_TEXT_FORMAT 位值(如 DT_CENTER | DT_VCENTER)。
fn draw_text(
    hdc: windows::Win32::Graphics::Gdi::HDC,
    font: windows::Win32::Graphics::Gdi::HFONT,
    text: &str,
    rect: RECT,
    color: u32,
    format: windows::Win32::Graphics::Gdi::DRAW_TEXT_FORMAT,
) {
    if text.is_empty() {
        return;
    }
    unsafe {
        let old = SelectObject(hdc, font.into());
        let _ = SetBkMode(hdc, TRANSPARENT);
        let _ = SetTextColor(hdc, colorref_from_rgb(color));
        let mut buf: Vec<u16> = text.encode_utf16().collect();
        let mut rc = rect;
        let _ = DrawTextW(hdc, &mut buf, &mut rc, format | DT_SINGLELINE);
        let _ = SelectObject(hdc, old);
    }
}

/// 返回浮窗窗口类名(带 null 结尾)。
fn overlay_class_name() -> PCWSTR {
    PCWSTR(OVERLAY_CLASS_WIDE.as_ptr())
}

/// 注册窗口类(类已注册则允许通过,幂等)。
fn ensure_window_class() -> bool {
    unsafe {
        let class = WNDCLASSEXW {
            cbSize: std::mem::size_of::<WNDCLASSEXW>() as u32,
            style: WNDCLASS_STYLES(0),
            lpfnWndProc: Some(overlay_window_proc),
            cbClsExtra: 0,
            cbWndExtra: 0,
            hInstance: GetModuleHandleW(None).unwrap_or_default().into(),
            hIcon: HICON(std::ptr::null_mut()),
            hCursor: HCURSOR(std::ptr::null_mut()),
            hbrBackground: Default::default(),
            lpszMenuName: PCWSTR(std::ptr::null()),
            lpszClassName: overlay_class_name(),
            hIconSm: HICON(std::ptr::null_mut()),
        };
        let atom = RegisterClassExW(&class);
        if atom == 0 {
            return GetLastError() == ERROR_CLASS_ALREADY_EXISTS;
        }
        true
    }
}

/// 窗口过程(仅兜底;本窗口绘制不依赖消息循环)。
unsafe extern "system" fn overlay_window_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    unsafe { DefWindowProcW(hwnd, msg, wparam, lparam) }
}

/// 创建分层透明浮窗(黑色作为色键),返回句柄或 None。
fn create_overlay_window() -> Option<HWND> {
    unsafe {
        if !ensure_window_class() {
            return None;
        }
        let hinstance = GetModuleHandleW(None).unwrap_or_default().into();
        let title = wide_with_nul("dna-builder skill cd overlay");
        let hwnd = CreateWindowExW(
            WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE,
            overlay_class_name(),
            PCWSTR(title.as_ptr()),
            WS_POPUP,
            0,
            0,
            64,
            64,
            None,
            None,
            Some(hinstance),
            None,
        )
        .ok()?;
        let _ = SetLayeredWindowAttributes(hwnd, COLORREF(0), 255, LWA_COLORKEY);
        Some(hwnd)
    }
}

// ---------------------------------------------------------------------------
// 手动冒烟测试(需要真实桌面,默认忽略):
//   cargo test --lib float_window::smoke -- --ignored --nocapture
// ---------------------------------------------------------------------------
#[cfg(test)]
mod smoke {
    use super::*;

    /// 打开浮窗 2 秒、推送一个 5 秒计时器再关闭,验证窗口创建/渲染/销毁无崩溃。
    #[test]
    #[ignore = "需要真实 Windows 桌面,手动运行"]
    fn demo_overlay() {
        let mut cfg = FloatWindowConfig::default();
        cfg.x = 60;
        cfg.y = 60;
        cfg.scale = 1.2;
        cfg.game_only_trigger = false;
        cfg.trigger_cd_seconds = 5.0;
        let s1 = set(cfg).expect("set overlay");
        assert!(s1.enabled);
        let s2 = trigger("q", "Q", 3.2).expect("trigger q");
        assert_eq!(s2.timers.len(), 2);
        std::thread::sleep(Duration::from_secs(6));
        disable();
        std::thread::sleep(Duration::from_millis(120));
        let after = state();
        assert!(!after.enabled);
    }
}
