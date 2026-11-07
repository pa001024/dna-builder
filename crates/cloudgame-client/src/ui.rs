//! 自绘标题栏（会话标签 + 画质下拉 + 状态区）与命中测试。
//! GDI 渲染成 BGRA 位图，由渲染线程贴到窗口顶部/面板区。

#![cfg(target_os = "windows")]

use std::sync::atomic::{AtomicBool, AtomicI32, AtomicU32, AtomicU64, AtomicUsize, Ordering};
use std::sync::mpsc::Sender;
use std::sync::{Mutex, OnceLock};

use windows::core::w;
use windows::Win32::Foundation::{COLORREF, RECT};
use windows::Win32::Graphics::Gdi::{
    CreateCompatibleDC, CreateDIBSection, CreateFontW, CreatePen, CreateSolidBrush,
    DeleteDC, DeleteObject, DrawTextW, FillRect, GetStockObject, LineTo, MoveToEx, Polygon,
    RoundRect, SelectObject, SetBkMode, SetTextColor, BITMAPINFO, BITMAPINFOHEADER, BI_RGB,
    CLIP_DEFAULT_PRECIS, ANTIALIASED_QUALITY, DEFAULT_CHARSET, DEFAULT_PITCH, DIB_RGB_COLORS,
    FW_NORMAL, HDC, HFONT, HGDIOBJ, NULL_BRUSH, NULL_PEN, OUT_DEFAULT_PRECIS, PS_SOLID,
    TRANSPARENT,
};

use crate::control;
use crate::wgc::WgcCmd;

/// 画质档位（与官方 bitRateLevelMap 一致）：(名称, 自适应下限, 固定码率)。
pub const PRESETS: [(&str, i64, i64); 3] = control::QUALITY;
pub const BAR_RGB: (u8, u8, u8) = (0x14, 0x15, 0x19);

const BAR_LOGICAL_H: f32 = 46.0;
const EDGE_LOGICAL: f32 = 6.0;
const TAB_LOGICAL_W: f32 = 150.0;
const PANEL_LOGICAL_W: f32 = 272.0;
const PANEL_HEAD_H: f32 = 40.0;
const PANEL_HEAD2_H: f32 = 36.0;
const PANEL_ROW_H: f32 = 40.0;
const PANEL_NODE_H: f32 = 34.0;
const PANEL_FOOT_H: f32 = 40.0;
/// 状态区固定槽位：实时码率 / 帧率 / 计时（数字变化不会让整条标题栏重排）
const STAT_W_LOGICAL: f32 = 54.0;
const FPS_W_LOGICAL: f32 = 44.0;
/// 计时最长 8 字符（99:59:59），留足宽度避免被裁
const TIME_W_LOGICAL: f32 = 62.0;
/// 断线提示卡片（逻辑尺寸）
const STATUS_W: f32 = 336.0;
const STATUS_H: f32 = 176.0;
const STATUS_BTN_W: f32 = 132.0;
const STATUS_BTN_H: f32 = 34.0;

/// 线路列表一行。
#[derive(Clone)]
pub struct NodeRow {
    pub id: String,
    pub name: String,
    /// 测速结果（ms），None = 尚未测速
    pub ping: Option<u32>,
}

/// 连接状态：驱动标题栏信号格与断线提示卡片。
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Conn {
    Connecting,
    Connected,
    Lost,
}

static NODES: OnceLock<Mutex<Vec<NodeRow>>> = OnceLock::new();
static NODE_ID: OnceLock<Mutex<String>> = OnceLock::new();
static NODES_REV: AtomicU32 = AtomicU32::new(0);
static CONN: AtomicU32 = AtomicU32::new(0);
static CONN_MSG: OnceLock<Mutex<String>> = OnceLock::new();

fn conn_code(c: Conn) -> u32 {
    match c {
        Conn::Connecting => 0,
        Conn::Connected => 1,
        Conn::Lost => 2,
    }
}

pub fn conn() -> Conn {
    match CONN.load(Ordering::Relaxed) {
        1 => Conn::Connected,
        2 => Conn::Lost,
        _ => Conn::Connecting,
    }
}

pub fn set_conn(c: Conn, msg: &str) {
    CONN.store(conn_code(c), Ordering::Relaxed);
    *CONN_MSG.get_or_init(|| Mutex::new(String::new())).lock().unwrap() = msg.to_string();
}

pub fn conn_msg() -> String {
    CONN_MSG.get_or_init(|| Mutex::new(String::new())).lock().unwrap().clone()
}

/// 服务端 GameRestart（游戏更新/重启）：界面切回 loading 页，等新实例首帧到达再恢复
static RESTART_LOADING: AtomicBool = AtomicBool::new(false);

pub fn set_restart_loading(on: bool) {
    RESTART_LOADING.store(on, Ordering::Relaxed);
}

pub fn restart_loading() -> bool {
    RESTART_LOADING.load(Ordering::Relaxed)
}

/// 最近一次收到 GSProxyHeartbeat（服务端心跳回包）的时间。
static LAST_GS_BEAT_MS: AtomicU64 = AtomicU64::new(0);

pub fn gs_beat_recv() {
    LAST_GS_BEAT_MS.store(base_ms(), Ordering::Relaxed);
}

/// 距上次 GSProxyHeartbeat 的毫秒数（从未收到返回 0：官方也是收到首个回包才开始计时）。
pub fn gs_beat_idle_ms() -> u64 {
    let at = LAST_GS_BEAT_MS.load(Ordering::Relaxed);
    if at == 0 { 0 } else { base_ms().saturating_sub(at) }
}

/// 线路列表（控制中心「线路」组）+ 当前选中节点。
pub fn set_nodes(nodes: Vec<NodeRow>, selected: String) {
    *NODES.get_or_init(|| Mutex::new(Vec::new())).lock().unwrap() = nodes;
    *NODE_ID.get_or_init(|| Mutex::new(String::new())).lock().unwrap() = selected;
    NODES_REV.fetch_add(1, Ordering::Relaxed);
}

pub fn nodes() -> Vec<NodeRow> {
    NODES.get_or_init(|| Mutex::new(Vec::new())).lock().unwrap().clone()
}

/// 控制中心最多显示 8 条线路（面板不能高过窗口）；选中项不在前 8 时替换末条，
/// 保证当前线路始终可见可选。
const PANEL_MAX_NODES: usize = 8;

pub fn panel_nodes() -> Vec<NodeRow> {
    let all = nodes();
    if all.len() <= PANEL_MAX_NODES {
        return all;
    }
    let sel = node_id();
    let mut out: Vec<NodeRow> = all.iter().take(PANEL_MAX_NODES).cloned().collect();
    if !sel.is_empty() && !out.iter().any(|n| n.id == sel) {
        if let Some(cur) = all.iter().find(|n| n.id == sel) {
            out.pop();
            out.push(cur.clone());
        }
    }
    out
}

pub fn node_id() -> String {
    NODE_ID.get_or_init(|| Mutex::new(String::new())).lock().unwrap().clone()
}

pub fn nodes_rev() -> u32 {
    NODES_REV.load(Ordering::Relaxed)
}

fn panel_h(scale: f32) -> i32 {
    let n = panel_nodes().len().max(1) as f32;
    scaled(
        PANEL_HEAD_H
            + PANEL_ROW_H * PRESETS.len() as f32
            + PANEL_HEAD2_H
            + PANEL_ROW_H
            + PANEL_HEAD2_H
            + PANEL_NODE_H * n
            + PANEL_FOOT_H,
        scale,
    )
}

const TF_CENTER: u32 = 0x0001;
const TF_RIGHT: u32 = 0x0002;
const TF_VCENTER: u32 = 0x0004;
const TF_SINGLELINE: u32 = 0x0020;
const TF_END_ELLIPSIS: u32 = 0x8000;

/// 命中项。面板展开时 y 可以落在视频区。
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Hit {
    None,
    Tab(usize),
    TabClose(usize),
    NewTab,
    Mute,
    Control,
    Signal,
    Fullscreen,
    Min,
    Max,
    Close,
    PanelRow(usize),
    PanelNode(usize),
    PanelBody,
    /// 断线卡片上的「重新连接」
    Reconnect,
}

impl Hit {
    pub fn tag(self) -> i32 {
        match self {
            Hit::None => -1,
            Hit::Tab(i) => 100 + i as i32,
            Hit::TabClose(i) => 200 + i as i32,
            Hit::NewTab => 1,
            Hit::Mute => 2,
            Hit::Control => 3,
            Hit::Signal => 4,
            Hit::Fullscreen => 5,
            Hit::Min => 10,
            Hit::Max => 11,
            Hit::Close => 12,
            Hit::PanelRow(i) => 300 + i as i32,
            Hit::PanelNode(i) => 500 + i as i32,
            Hit::PanelBody => 400,
            Hit::Reconnect => 600,
        }
    }
}

#[derive(Clone)]
pub struct SessionTab {
    pub id: String,
    pub name: String,
}

static SESSIONS: OnceLock<Mutex<Vec<SessionTab>>> = OnceLock::new();
static ACTIVE: OnceLock<Mutex<String>> = OnceLock::new();
static QUALITY: AtomicUsize = AtomicUsize::new(control::DEFAULT_QUALITY);
static STREAM: AtomicU64 = AtomicU64::new(0);
static HOVER: AtomicI32 = AtomicI32::new(-1);
static MAXIMIZED: AtomicI32 = AtomicI32::new(0);
static FULLSCREEN: AtomicI32 = AtomicI32::new(0);
static MUTED: AtomicBool = AtomicBool::new(false);
static CONNECT_AT: AtomicU64 = AtomicU64::new(0);
static LATENCY: AtomicU32 = AtomicU32::new(0);
/// 状态区实时统计：接收字节累计、呈现帧累计 → 每秒速率。
static RX_BYTES: AtomicU64 = AtomicU64::new(0);
static FRAMES: AtomicU64 = AtomicU64::new(0);
static NET_BPS: AtomicU64 = AtomicU64::new(0);
static FPS: AtomicU32 = AtomicU32::new(0);
static BASE: OnceLock<std::time::Instant> = OnceLock::new();
static ENGINE: OnceLock<Mutex<Sender<WgcCmd>>> = OnceLock::new();

const fn c(r: u8, g: u8, b: u8) -> COLORREF {
    COLORREF((r as u32) | ((g as u32) << 8) | ((b as u32) << 16))
}
const C_BG: COLORREF = c(BAR_RGB.0, BAR_RGB.1, BAR_RGB.2);
const C_LINE: COLORREF = c(0x26, 0x28, 0x2e);
const C_TEXT: COLORREF = c(0xeb, 0xe8, 0xe1);
const C_DIM: COLORREF = c(0x9c, 0x99, 0x92);
const C_FAINT: COLORREF = c(0x74, 0x72, 0x6d);
const C_TAB: COLORREF = c(0x23, 0x25, 0x2b);
const C_TAB_LINE: COLORREF = c(0x36, 0x3a, 0x44);
const C_HOVER: COLORREF = c(0x31, 0x34, 0x3c);
const C_ACCENT: COLORREF = c(0xe4, 0xca, 0x98);
const C_ACCENT_DIM: COLORREF = c(0x8a, 0x7a, 0x5c);
const C_CLOSE_HOVER: COLORREF = c(0xc4, 0x2b, 0x2b);
const C_PANEL: COLORREF = c(0x1b, 0x1d, 0x23);
const C_PANEL_LINE: COLORREF = c(0x33, 0x36, 0x3e);
const C_PANEL_SOFT: COLORREF = c(0x26, 0x28, 0x30);
const C_OK: COLORREF = c(0x7c, 0xc9, 0x7c);
const C_WARN: COLORREF = c(0xd8, 0xb4, 0x5a);
const C_BAD: COLORREF = c(0xd8, 0x6a, 0x5a);

pub fn init(eng: Sender<WgcCmd>) {
    let _ = ENGINE.set(Mutex::new(eng));
    let _ = BASE.set(std::time::Instant::now());
}

fn base_ms() -> u64 {
    BASE.get().map(|b| b.elapsed().as_millis() as u64).unwrap_or(0)
}

pub fn set_sessions(tabs: Vec<SessionTab>, active: String) {
    let store = SESSIONS.get_or_init(|| Mutex::new(Vec::new()));
    *store.lock().unwrap() = tabs;
    let act = ACTIVE.get_or_init(|| Mutex::new(String::new()));
    *act.lock().unwrap() = active;
}

pub fn sessions() -> Vec<SessionTab> {
    SESSIONS.get().map(|s| s.lock().unwrap().clone()).unwrap_or_default()
}

pub fn active_id() -> String {
    ACTIVE.get().map(|s| s.lock().unwrap().clone()).unwrap_or_default()
}

pub fn quality() -> usize {
    QUALITY.load(Ordering::Relaxed)
}

pub fn hover() -> i32 {
    HOVER.load(Ordering::Relaxed)
}

pub fn set_hover(id: i32) {
    HOVER.store(id, Ordering::Relaxed);
}

pub fn set_maximized(v: bool) {
    MAXIMIZED.store(v as i32, Ordering::Relaxed);
}

pub fn is_maximized() -> bool {
    MAXIMIZED.load(Ordering::Relaxed) != 0
}

pub fn set_fullscreen(v: bool) {
    FULLSCREEN.store(v as i32, Ordering::Relaxed);
}

pub fn is_fullscreen() -> bool {
    FULLSCREEN.load(Ordering::Relaxed) != 0
}

pub fn muted() -> bool {
    MUTED.load(Ordering::Relaxed)
}

pub fn toggle_mute() {
    MUTED.fetch_xor(true, Ordering::Relaxed);
}

pub fn mark_connected() {
    if CONNECT_AT.load(Ordering::Relaxed) == 0 {
        CONNECT_AT.store(base_ms().max(1), Ordering::Relaxed);
    }
    // 新连接从头计时：重连后旧连接的 GSProxyHeartbeat 时间戳不能沿用
    LAST_GS_BEAT_MS.store(0, Ordering::Relaxed);
    set_conn(Conn::Connected, "");
}

pub fn elapsed_secs() -> u64 {
    let at = CONNECT_AT.load(Ordering::Relaxed);
    if at == 0 {
        0
    } else {
        (base_ms().saturating_sub(at)) / 1000
    }
}

/// 发送 WelinkHeartBeat 时记录时间，收到「威测延时」回包时算出 RTT。
static HB_AT: AtomicU64 = AtomicU64::new(0);

pub fn heartbeat_sent() {
    HB_AT.store(base_ms(), Ordering::Relaxed);
}

pub fn heartbeat_recv() {
    let at = HB_AT.load(Ordering::Relaxed);
    if at > 0 {
        let rtt = base_ms().saturating_sub(at) as u32;
        if rtt < 10_000 {
            LATENCY.store(rtt, Ordering::Relaxed);
        }
    }
}

pub fn latency() -> u32 {
    LATENCY.load(Ordering::Relaxed)
}

/// 传输层收到字节（视频/音频/控制），用于状态区实时码率。
pub fn add_rx_bytes(n: usize) {
    RX_BYTES.fetch_add(n as u64, Ordering::Relaxed);
}

/// 成功呈现一帧（GPU 直呈 / 软呈现都计数）。
pub fn add_frame() {
    FRAMES.fetch_add(1, Ordering::Relaxed);
}

/// 事件循环每 ~500ms 调一次：累计量换成速率，指数平滑避免数字乱跳。
pub fn sample_stats() {
    static LAST: Mutex<Option<(std::time::Instant, u64, u64)>> = Mutex::new(None);
    let Ok(mut last) = LAST.lock() else { return };
    let now = std::time::Instant::now();
    let rx = RX_BYTES.load(Ordering::Relaxed);
    let fr = FRAMES.load(Ordering::Relaxed);
    let Some((at, prx, pfr)) = *last else {
        *last = Some((now, rx, fr));
        return;
    };
    let dt = now.duration_since(at).as_secs_f64();
    if dt < 0.5 {
        return;
    }
    *last = Some((now, rx, fr));
    let bps = rx.saturating_sub(prx) as f64 / dt;
    let fps = fr.saturating_sub(pfr) as f64 / dt;
    let prev_b = NET_BPS.load(Ordering::Relaxed) as f64;
    let prev_f = FPS.load(Ordering::Relaxed) as f64;
    NET_BPS.store((prev_b * 0.5 + bps * 0.5) as u64, Ordering::Relaxed);
    // 帧率掉到 0 立即归零（画面冻结时不能让平滑值继续显示 30/60）
    let new_f = if fps < 1.0 { 0.0 } else { prev_f * 0.5 + fps * 0.5 };
    FPS.store(new_f.round() as u32, Ordering::Relaxed);
}

pub fn net_bytes_per_sec() -> u64 {
    NET_BPS.load(Ordering::Relaxed)
}

pub fn fps() -> u32 {
    FPS.load(Ordering::Relaxed)
}

fn net_text(bps: u64) -> String {
    let mb = bps as f64 / (1024.0 * 1024.0);
    if mb >= 0.1 {
        format!("{mb:.1}MB/s")
    } else {
        let kb = bps as f64 / 1024.0;
        if kb >= 1.0 { format!("{kb:.0}KB/s") } else { "0KB/s".to_string() }
    }
}

fn fps_text(fps: u32) -> String {
    if fps == 0 { "FPS--".to_string() } else { format!("FPS{fps}") }
}

pub fn apply_quality(index: usize) {
    let i = index.min(PRESETS.len() - 1);
    QUALITY.store(i, Ordering::Relaxed);
    if let Some(eng) = ENGINE.get() {
        let (_, min, max) = PRESETS[i];
        if let Ok(eng) = eng.lock() {
            control::set_bitrate_range(&eng, min, max);
        }
    }
}

pub fn set_stream_size(w: u32, h: u32) {
    if w == 0 || h == 0 {
        return;
    }
    STREAM.store(((w as u64) << 32) | h as u64, Ordering::Relaxed);
}

pub fn stream_px() -> (u32, u32) {
    let v = STREAM.load(Ordering::Relaxed);
    ((v >> 32) as u32, v as u32)
}

pub fn title_height(scale: f64) -> u32 {
    (BAR_LOGICAL_H * scale as f32).round().max(28.0) as u32
}

fn bar_h(scale: f32) -> i32 {
    (BAR_LOGICAL_H * scale).round().max(28.0) as i32
}

struct TabRect {
    rect: RECT,
    close: RECT,
    name: String,
    active: bool,
}

struct BarLayout {
    icon: RECT,
    tabs: Vec<TabRect>,
    plus: RECT,
    min: RECT,
    max: RECT,
    close: RECT,
    control: RECT,
    mute: RECT,
    signal: RECT,
}

fn scaled(v: f32, s: f32) -> i32 {
    (v * s).round() as i32
}

fn compute_bar(win_w: i32, scale: f32) -> BarLayout {
    let h = bar_h(scale);
    let s = |v: f32| scaled(v, scale);
    let icon_size = s(26.0);
    let icon = RECT {
        left: s(16.0),
        top: (h - icon_size) / 2,
        right: s(16.0) + icon_size,
        bottom: (h - icon_size) / 2 + icon_size,
    };
    let btn_w = s(44.0);
    let close = RECT { left: win_w - btn_w, top: 0, right: win_w, bottom: h };
    let max = RECT { left: close.left - btn_w, top: 0, right: close.left, bottom: h };
    let min = RECT { left: max.left - btn_w, top: 0, right: max.left, bottom: h };
    let ctrl_w = s(110.0);
    let ctrl_h = s(30.0);
    let control = RECT {
        left: min.left - s(12.0) - ctrl_w,
        top: (h - ctrl_h) / 2,
        right: min.left - s(12.0),
        bottom: (h + ctrl_h) / 2,
    };
    let mute_size = s(30.0);
    let mute = RECT {
        left: control.left - s(4.0) - mute_size,
        top: (h - mute_size) / 2,
        right: control.left - s(4.0),
        bottom: (h + mute_size) / 2,
    };
    // 状态区：信号格 + 实时码率 + 帧率 + 计时，全部固定宽度槽位。
    // 不用实测文本宽——测量值会随首帧/计时变化反馈给排版，窄窗口下槽位会收缩到把文字裁掉。
    let signal_w = s(20.0)
        + s(8.0)
        + s(STAT_W_LOGICAL)
        + s(10.0)
        + s(FPS_W_LOGICAL)
        + s(10.0)
        + s(TIME_W_LOGICAL)
        + s(10.0);
    let signal = RECT { left: mute.left - s(12.0) - signal_w, top: 0, right: mute.left - s(12.0), bottom: h };

    let tabs = sessions();
    let active = active_id();
    let tab_top = s(9.0);
    let tab_h = h - s(18.0);
    let start = icon.right + s(14.0);
    let avail = signal.left - s(12.0) - (start + s(32.0));
    let n = tabs.len().max(1) as i32;
    let tab_w = s(TAB_LOGICAL_W).min((avail / n).max(s(96.0)));
    let mut rects = Vec::with_capacity(tabs.len());
    let mut x = start;
    for t in &tabs {
        let rect = RECT { left: x, top: tab_top, right: x + tab_w, bottom: tab_top + tab_h };
        let close = RECT {
            left: rect.right - s(26.0),
            top: rect.top + (tab_h - s(20.0)) / 2,
            right: rect.right - s(6.0),
            bottom: rect.top + (tab_h - s(20.0)) / 2 + s(20.0),
        };
        rects.push(TabRect { rect, close, name: t.name.clone(), active: t.id == active });
        x += tab_w + s(6.0);
    }
    let plus_size = s(28.0);
    // 窄窗口下标签占满可用宽度：「+」不越过状态区，宁可压住最后一个标签的右缘
    let plus_left = (x + s(2.0)).min(signal.left - s(12.0) - plus_size).max(start);
    let plus = RECT {
        left: plus_left,
        top: (h - plus_size) / 2,
        right: plus_left + plus_size,
        bottom: (h + plus_size) / 2,
    };
    BarLayout { icon, tabs: rects, plus, min, max, close, control, mute, signal }
}

/// 控制中心下拉面板（主窗口坐标）。
pub fn panel_rect(win_w: u32, scale: f32) -> RECT {
    let bar = compute_bar(win_w as i32, scale);
    let h = bar_h(scale);
    let w = scaled(PANEL_LOGICAL_W, scale);
    let right = bar.control.right;
    RECT {
        left: (right - w).max(scaled(8.0, scale)),
        top: h + scaled(4.0, scale),
        right,
        bottom: h + scaled(4.0, scale) + panel_h(scale),
    }
}

fn inside(rc: &RECT, x: f64, y: f64) -> bool {
    x >= rc.left as f64 && x < rc.right as f64 && y >= rc.top as f64 && y < rc.bottom as f64
}

/// 标题栏 / 面板命中测试。
pub fn hit_test(win_w: u32, win_h: u32, scale: f32, x: f64, y: f64, panel_open: bool) -> Hit {
    let bar = compute_bar(win_w as i32, scale);
    let h = bar_h(scale) as f64;
    if panel_open {
        let p = panel_rect(win_w, scale);
        if inside(&p, x, y) {
            let row_h = scaled(PANEL_ROW_H, scale) as f64;
            let header = scaled(PANEL_HEAD_H, scale) as f64;
            let rel = y - p.top as f64 - header;
            if rel >= 0.0 {
                let presets_h = row_h * PRESETS.len() as f64;
                if rel < presets_h {
                    return Hit::PanelRow((rel / row_h) as usize);
                }
                let rel2 = rel - presets_h - scaled(PANEL_HEAD2_H, scale) as f64;
                if rel2 >= 0.0 && rel2 < row_h {
                    return Hit::Fullscreen;
                }
                let node_h = scaled(PANEL_NODE_H, scale) as f64;
                let rel3 = rel2 - row_h - scaled(PANEL_HEAD2_H, scale) as f64;
                if rel3 >= 0.0 {
                    let i = (rel3 / node_h) as usize;
                    if i < panel_nodes().len() {
                        return Hit::PanelNode(i);
                    }
                }
            }
            return Hit::PanelBody;
        }
    }
    if y < 0.0 || y >= h {
        // 断线卡片浮在视频区中央：不在标题栏范围内也要命中
        return status_hit(win_w, win_h, scale, x, y);
    }
    if inside(&bar.min, x, y) {
        return Hit::Min;
    }
    if inside(&bar.max, x, y) {
        return Hit::Max;
    }
    if inside(&bar.close, x, y) {
        return Hit::Close;
    }
    if inside(&bar.control, x, y) {
        return Hit::Control;
    }
    if inside(&bar.mute, x, y) {
        return Hit::Mute;
    }
    if inside(&bar.signal, x, y) {
        return Hit::Signal;
    }
    for (i, t) in bar.tabs.iter().enumerate() {
        if inside(&t.close, x, y) {
            return Hit::TabClose(i);
        }
        if inside(&t.rect, x, y) {
            return Hit::Tab(i);
        }
    }
    if inside(&bar.plus, x, y) {
        return Hit::NewTab;
    }
    Hit::None
}

/// 断线提示卡片（窗口居中，标题栏以下的视频区）。
pub fn status_rect(win_w: u32, win_h: u32, scale: f32) -> RECT {
    let w = scaled(STATUS_W, scale);
    let h = scaled(STATUS_H, scale);
    let top = title_height(scale as f64) as i32;
    let vh = (win_h as i32 - top).max(1);
    RECT {
        left: (win_w as i32 - w) / 2,
        top: top + (vh - h) / 2,
        right: (win_w as i32 - w) / 2 + w,
        bottom: top + (vh - h) / 2 + h,
    }
}

/// 卡片底部的「重新连接」按钮。
pub fn reconnect_rect(win_w: u32, win_h: u32, scale: f32) -> RECT {
    let r = status_rect(win_w, win_h, scale);
    let bw = scaled(STATUS_BTN_W, scale);
    let bh = scaled(STATUS_BTN_H, scale);
    let cx = (r.left + r.right) / 2;
    RECT {
        left: cx - bw / 2,
        top: r.bottom - scaled(20.0, scale) - bh,
        right: cx + bw / 2,
        bottom: r.bottom - scaled(20.0, scale),
    }
}

/// 断线提示卡片：半透明黑底 + 标题 + 说明 + 「重新连接」按钮。
pub fn render_status(scale: f32) -> (Vec<u8>, u32, u32) {
    let w = scaled(STATUS_W, scale);
    let h = scaled(STATUS_H, scale);
    if w <= 0 || h <= 0 {
        return (Vec::new(), 0, 0);
    }
    let ss = scale * SS as f32;
    let (mut pixels, _) = unsafe { gdi_paint(w, h, |hdc, sw, sh| draw_status(hdc, sw, sh, ss)) };
    for p in pixels.chunks_exact_mut(4) {
        p[3] = 0xff;
    }
    (pixels, w as u32, h as u32)
}

unsafe fn draw_status(hdc: HDC, w: i32, h: i32, scale: f32) {
    let s = |v: f32| (v * scale).round() as i32;
    fill(hdc, RECT { left: 0, top: 0, right: w, bottom: h }, C_PANEL);
    fill(hdc, RECT { left: 0, top: 0, right: w, bottom: s(1.0) }, C_PANEL_LINE);
    fill(hdc, RECT { left: 0, top: h - s(1.0), right: w, bottom: h }, C_PANEL_LINE);
    fill(hdc, RECT { left: 0, top: 0, right: s(1.0), bottom: h }, C_PANEL_LINE);
    fill(hdc, RECT { left: w - s(1.0), top: 0, right: w, bottom: h }, C_PANEL_LINE);

    let f_title = font(scale, 15.0, 500);
    let f_body = font(scale, 12.0, FW_NORMAL.0 as i32);
    let f_btn = font(scale, 13.0, 500);

    // 顶部警示条
    fill(hdc, RECT { left: s(16.0), top: s(20.0), right: s(19.0), bottom: s(36.0) }, C_BAD);
    text(
        hdc,
        &RECT { left: s(28.0), top: s(14.0), right: w - s(16.0), bottom: s(42.0) },
        "连接已断开",
        TF_VCENTER | TF_SINGLELINE,
        C_TEXT,
        f_title,
    );
    let msg = {
        let m = conn_msg();
        if m.is_empty() { "网络中断或账号在别处登录".to_string() } else { m }
    };
    text(
        hdc,
        &RECT { left: s(28.0), top: s(46.0), right: w - s(16.0), bottom: s(92.0) },
        &msg,
        TF_SINGLELINE | TF_END_ELLIPSIS,
        C_DIM,
        f_body,
    );

    let btn = RECT {
        left: (w - s(STATUS_BTN_W)) / 2,
        top: h - s(20.0) - s(STATUS_BTN_H),
        right: (w + s(STATUS_BTN_W)) / 2,
        bottom: h - s(20.0),
    };
    let hot = hover() == Hit::Reconnect.tag();
    round_fill(hdc, btn, if hot { C_ACCENT } else { C_TAB }, s(7.0));
    round_frame(hdc, btn, if hot { C_ACCENT } else { C_TAB_LINE }, s(7.0));
    text(
        hdc,
        &btn,
        "重新连接",
        TF_CENTER | TF_VCENTER | TF_SINGLELINE,
        if hot { C_BG } else { C_TEXT },
        f_btn,
    );

    let _ = DeleteObject(HGDIOBJ(f_title.0));
    let _ = DeleteObject(HGDIOBJ(f_body.0));
    let _ = DeleteObject(HGDIOBJ(f_btn.0));
}

/// 断线卡片命中（全屏时没有标题栏，单独判定）。
pub fn status_hit(win_w: u32, win_h: u32, scale: f32, x: f64, y: f64) -> Hit {
    if conn() != Conn::Lost {
        return Hit::None;
    }
    let r = status_rect(win_w, win_h, scale);
    if !inside(&r, x, y) {
        return Hit::None;
    }
    let b = reconnect_rect(win_w, win_h, scale);
    if inside(&b, x, y) { Hit::Reconnect } else { Hit::PanelBody }
}

/// 窗口边缘缩放命中。位掩码：1=左 2=右 4=上 8=下。
pub fn edge_test(win_w: u32, win_h: u32, scale: f32, x: f64, y: f64) -> u8 {
    let e = (EDGE_LOGICAL * scale).round().max(2.0) as f64;
    let mut m = 0u8;
    if x < e {
        m |= 1;
    }
    if x >= win_w as f64 - e {
        m |= 2;
    }
    if y < e {
        m |= 4;
    }
    if y >= win_h as f64 - e {
        m |= 8;
    }
    m
}

/// 渲染标题栏：返回 top-down BGRA（行宽 w*4）。
pub fn render_bar(win_w: u32, scale: f32) -> Vec<u8> {
    let w = win_w as i32;
    let h = bar_h(scale);
    if w <= 0 || h <= 0 {
        return Vec::new();
    }
    let ss = scale * SS as f32;
    let (mut pixels, _) = unsafe { gdi_paint(w, h, |hdc, sw, sh| draw_bar(hdc, sw, sh, ss)) };
    let bar = compute_bar(w, scale);
    blit_game_icon(&mut pixels, w as usize, &bar.icon);
    for p in pixels.chunks_exact_mut(4) {
        p[3] = 0xff;
    }
    pixels
}

/// 渲染控制中心面板：返回 (pixels, w, h)。
pub fn render_panel(scale: f32) -> (Vec<u8>, u32, u32) {
    let w = scaled(PANEL_LOGICAL_W, scale);
    let h = panel_h(scale);
    if w <= 0 || h <= 0 {
        return (Vec::new(), 0, 0);
    }
    let ss = scale * SS as f32;
    let (mut pixels, _) = unsafe { gdi_paint(w, h, |hdc, sw, sh| draw_panel(hdc, sw, sh, ss)) };
    // GDI 不写 alpha；交换链覆盖层也不做混合，整块按不透明处理
    for p in pixels.chunks_exact_mut(4) {
        p[3] = 0xff;
    }
    (pixels, w as u32, h as u32)
}

/// 超采样倍数：矢量图形与文字按 3 倍尺寸绘制后盒式降采样，边缘无锯齿。
const SS: i32 = 3;

/// 全屏进入时顶部浮动提示（由调用方 2 秒后清除）。
pub fn render_hint(scale: f32) -> (Vec<u8>, u32, u32) {
    let w = scaled(252.0, scale);
    let h = scaled(40.0, scale);
    if w <= 0 || h <= 0 {
        return (Vec::new(), 0, 0);
    }
    let ss = scale * SS as f32;
    let (mut pixels, _) = unsafe { gdi_paint(w, h, |hdc, sw, sh| draw_hint(hdc, sw, sh, ss)) };
    for p in pixels.chunks_exact_mut(4) {
        p[3] = 0xff;
    }
    (pixels, w as u32, h as u32)
}

/// loading 页状态文案：黑色条带上的居中多行文字（GDI 不写 alpha，调用方按黑底叠加）。
pub fn render_notice(label: &str, scale: f32, max_w: f32) -> (Vec<u8>, u32, u32) {
    let w = scaled(640.0f32.min(max_w.max(1.0)), scale).max(1);
    let h = scaled(66.0, scale).max(1);
    let ss = scale * SS as f32;
    let (pixels, _) = unsafe {
        gdi_paint(w, h, |hdc, sw, sh| {
            let f = font(ss, 14.0, 400);
            text(
                hdc,
                &RECT { left: 0, top: 0, right: sw, bottom: sh },
                label,
                TF_CENTER,
                C_DIM,
                f,
            );
            let _ = DeleteObject(HGDIOBJ(f.0));
        })
    };
    (pixels, w as u32, h as u32)
}

unsafe fn draw_hint(hdc: HDC, w: i32, h: i32, scale: f32) {
    let s = |v: f32| (v * scale).round() as i32;
    fill(hdc, RECT { left: 0, top: 0, right: w, bottom: h }, C_PANEL);
    fill(hdc, RECT { left: 0, top: 0, right: w, bottom: s(1.0) }, C_PANEL_LINE);
    fill(hdc, RECT { left: 0, top: h - s(1.0), right: w, bottom: h }, C_PANEL_LINE);
    fill(hdc, RECT { left: 0, top: 0, right: s(1.0), bottom: h }, C_PANEL_LINE);
    fill(hdc, RECT { left: w - s(1.0), top: 0, right: w, bottom: h }, C_PANEL_LINE);
    let f = font(scale, 13.0, 500);
    text(
        hdc,
        &RECT { left: 0, top: 0, right: w, bottom: h },
        "按 Alt + Enter 退出全屏",
        TF_CENTER | TF_VCENTER | TF_SINGLELINE,
        C_TEXT,
        f,
    );
    let _ = DeleteObject(HGDIOBJ(f.0));
}

unsafe fn gdi_paint(w: i32, h: i32, f: impl FnOnce(HDC, i32, i32)) -> (Vec<u8>, i32) {
    let (sw, sh) = (w * SS, h * SS);
    let mut big = vec![0u8; (sw * sh * 4) as usize];
    let bmi = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: sw,
            biHeight: -sh,
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            ..Default::default()
        },
        ..Default::default()
    };
    let mut bits: *mut core::ffi::c_void = std::ptr::null_mut();
    let Ok(bmp) = CreateDIBSection(None, &bmi, DIB_RGB_COLORS, &mut bits, None, 0) else {
        return (vec![0u8; (w * h * 4) as usize], w);
    };
    if bits.is_null() {
        let _ = DeleteObject(HGDIOBJ(bmp.0));
        return (vec![0u8; (w * h * 4) as usize], w);
    }
    let mdc = CreateCompatibleDC(None);
    let old = SelectObject(mdc, HGDIOBJ(bmp.0));
    f(mdc, sw, sh);
    std::ptr::copy_nonoverlapping(bits as *const u8, big.as_mut_ptr(), big.len());
    SelectObject(mdc, old);
    let _ = DeleteDC(mdc);
    let _ = DeleteObject(HGDIOBJ(bmp.0));

    // 盒式滤波降采样
    let n = (SS * SS) as u32;
    let mut pixels = vec![0u8; (w * h * 4) as usize];
    for y in 0..h {
        for x in 0..w {
            let mut acc = [0u32; 3];
            for dy in 0..SS {
                let row = ((y * SS + dy) * sw + x * SS) as usize * 4;
                for dx in 0..SS {
                    let i = row + dx as usize * 4;
                    acc[0] += big[i] as u32;
                    acc[1] += big[i + 1] as u32;
                    acc[2] += big[i + 2] as u32;
                }
            }
            let o = ((y * w + x) * 4) as usize;
            pixels[o] = (acc[0] / n) as u8;
            pixels[o + 1] = (acc[1] / n) as u8;
            pixels[o + 2] = (acc[2] / n) as u8;
        }
    }
    (pixels, w)
}

/// 游戏图标（官方页面 favicon，64x64 BGRA）双线性缩放并做 alpha 混合。
fn blit_game_icon(dst: &mut [u8], dst_w: usize, rect: &RECT) {
    const ICON: &[u8] = include_bytes!("../assets/game_logo.bgra");
    const SRC: usize = 64;
    let (w, h) = ((rect.right - rect.left).max(1), (rect.bottom - rect.top).max(1));
    for dy in 0..h {
        for dx in 0..w {
            let fx = (dx as f32 + 0.5) * SRC as f32 / w as f32 - 0.5;
            let fy = (dy as f32 + 0.5) * SRC as f32 / h as f32 - 0.5;
            let x0 = fx.floor().max(0.0) as usize;
            let y0 = fy.floor().max(0.0) as usize;
            let x1 = (x0 + 1).min(SRC - 1);
            let y1 = (y0 + 1).min(SRC - 1);
            let tx = (fx - fx.floor()).clamp(0.0, 1.0);
            let ty = (fy - fy.floor()).clamp(0.0, 1.0);
            let mut px = [0f32; 4];
            for c in 0..4 {
                let p00 = ICON[(y0 * SRC + x0) * 4 + c] as f32;
                let p10 = ICON[(y0 * SRC + x1) * 4 + c] as f32;
                let p01 = ICON[(y1 * SRC + x0) * 4 + c] as f32;
                let p11 = ICON[(y1 * SRC + x1) * 4 + c] as f32;
                px[c] = p00 * (1.0 - tx) * (1.0 - ty)
                    + p10 * tx * (1.0 - ty)
                    + p01 * (1.0 - tx) * ty
                    + p11 * tx * ty;
            }
            let a = px[3].round() as u32;
            if a == 0 {
                continue;
            }
            let pos = ((rect.top + dy) as usize * dst_w + (rect.left + dx) as usize) * 4;
            if pos + 3 >= dst.len() {
                continue;
            }
            for i in 0..3 {
                let d = dst[pos + i] as u32;
                dst[pos + i] = ((px[i].round() as u32 * a + d * (255 - a)) / 255) as u8;
            }
        }
    }
}

unsafe fn font(scale: f32, px: f32, weight: i32) -> HFONT {
    let name = w!("Microsoft YaHei UI");
    CreateFontW(
        -((px * scale).round() as i32),
        0,
        0,
        0,
        weight,
        0,
        0,
        0,
        DEFAULT_CHARSET,
        OUT_DEFAULT_PRECIS,
        CLIP_DEFAULT_PRECIS,
        ANTIALIASED_QUALITY,
        DEFAULT_PITCH.0 as u32,
        name,
    )
}

unsafe fn text(hdc: HDC, rc: &RECT, s: &str, fmt: u32, color: COLORREF, f: HFONT) {
    let old = SelectObject(hdc, HGDIOBJ(f.0));
    SetBkMode(hdc, TRANSPARENT);
    SetTextColor(hdc, color);
    let mut buf: Vec<u16> = s.encode_utf16().collect();
    let mut r = *rc;
    DrawTextW(hdc, &mut buf, &mut r, windows::Win32::Graphics::Gdi::DRAW_TEXT_FORMAT(fmt));
    SelectObject(hdc, old);
}


unsafe fn round_frame(hdc: HDC, rc: RECT, color: COLORREF, radius: i32) {
    let pen = CreatePen(PS_SOLID, 1, color);
    let old = SelectObject(hdc, HGDIOBJ(pen.0));
    let ob = SelectObject(hdc, GetStockObject(NULL_BRUSH));
    let _ = RoundRect(hdc, rc.left, rc.top, rc.right, rc.bottom, radius * 2, radius * 2);
    SelectObject(hdc, ob);
    SelectObject(hdc, old);
    let _ = DeleteObject(HGDIOBJ(pen.0));
}

unsafe fn round_fill(hdc: HDC, rc: RECT, color: COLORREF, radius: i32) {
    let brush = CreateSolidBrush(color);
    let ob = SelectObject(hdc, HGDIOBJ(brush.0));
    let op = SelectObject(hdc, GetStockObject(NULL_PEN));
    let _ = RoundRect(hdc, rc.left, rc.top, rc.right, rc.bottom, radius * 2, radius * 2);
    SelectObject(hdc, op);
    SelectObject(hdc, ob);
    let _ = DeleteObject(HGDIOBJ(brush.0));
}

unsafe fn fill(hdc: HDC, rc: RECT, color: COLORREF) {
    let brush = CreateSolidBrush(color);
    let _ = FillRect(hdc, &rc, brush);
    let _ = DeleteObject(HGDIOBJ(brush.0));
}

unsafe fn stroke_line(hdc: HDC, color: COLORREF, width: i32, pts: &[(i32, i32)]) {
    if pts.len() < 2 {
        return;
    }
    let pen = CreatePen(PS_SOLID, width, color);
    let old = SelectObject(hdc, HGDIOBJ(pen.0));
    let _ = MoveToEx(hdc, pts[0].0, pts[0].1, None);
    for p in &pts[1..] {
        let _ = LineTo(hdc, p.0, p.1);
    }
    SelectObject(hdc, old);
    let _ = DeleteObject(HGDIOBJ(pen.0));
}

/// 窗口按钮图形：0=最小化 1=最大化/还原 2=关闭。
unsafe fn win_glyph(hdc: HDC, rc: &RECT, kind: u8, scale: f32, maximized: bool, color: COLORREF) {
    let cx = (rc.left + rc.right) / 2;
    let cy = (rc.top + rc.bottom) / 2;
    let d = (5.0 * scale).round() as i32;
    let lw = (1.4 * scale).round().max(1.0) as i32;
    match kind {
        0 => stroke_line(hdc, color, lw, &[(cx - d - 1, cy + 1), (cx + d + 1, cy + 1)]),
        1 => {
            let pen = CreatePen(PS_SOLID, lw, color);
            let old = SelectObject(hdc, HGDIOBJ(pen.0));
            let old_brush = SelectObject(hdc, GetStockObject(NULL_BRUSH));
            if maximized {
                let _ = RoundRect(hdc, cx - d + 2, cy - d, cx + d, cy + d - 2, 2, 2);
                let _ = RoundRect(hdc, cx - d, cy - d + 2, cx + d - 2, cy + d, 2, 2);
            } else {
                let _ = RoundRect(hdc, cx - d, cy - d, cx + d, cy + d, 2, 2);
            }
            SelectObject(hdc, old_brush);
            SelectObject(hdc, old);
            let _ = DeleteObject(HGDIOBJ(pen.0));
        }
        _ => stroke_line(hdc, color, lw, &[(cx - d, cy - d), (cx + d, cy + d)]),
    }
    if kind == 2 {
        stroke_line(hdc, color, lw, &[(cx + d, cy - d), (cx - d, cy + d)]);
    }
}

unsafe fn tab_close_glyph(hdc: HDC, rc: &RECT, scale: f32, color: COLORREF) {
    let cx = (rc.left + rc.right) / 2;
    let cy = (rc.top + rc.bottom) / 2;
    let d = (4.0 * scale).round() as i32;
    let lw = (1.3 * scale).round().max(1.0) as i32;
    stroke_line(hdc, color, lw, &[(cx - d, cy - d), (cx + d, cy + d)]);
    stroke_line(hdc, color, lw, &[(cx + d, cy - d), (cx - d, cy + d)]);
}

unsafe fn plus_glyph(hdc: HDC, rc: &RECT, scale: f32, color: COLORREF) {
    let cx = (rc.left + rc.right) / 2;
    let cy = (rc.top + rc.bottom) / 2;
    let d = (5.0 * scale).round() as i32;
    let lw = (1.5 * scale).round().max(1.0) as i32;
    stroke_line(hdc, color, lw, &[(cx - d, cy), (cx + d, cy)]);
    stroke_line(hdc, color, lw, &[(cx, cy - d), (cx, cy + d)]);
}

unsafe fn chevron_glyph(hdc: HDC, cx: i32, cy: i32, scale: f32, open: bool, color: COLORREF) {
    let d = (4.0 * scale).round() as i32;
    let lw = (1.4 * scale).round().max(1.0) as i32;
    if open {
        stroke_line(hdc, color, lw, &[(cx - d, cy + d / 2), (cx, cy - d / 2)]);
        stroke_line(hdc, color, lw, &[(cx, cy - d / 2), (cx + d, cy + d / 2)]);
    } else {
        stroke_line(hdc, color, lw, &[(cx - d, cy - d / 2), (cx, cy + d / 2)]);
        stroke_line(hdc, color, lw, &[(cx, cy + d / 2), (cx + d, cy - d / 2)]);
    }
}

/// 喇叭图标：muted 时右侧显示叉。
unsafe fn speaker_glyph(hdc: HDC, rc: &RECT, scale: f32, muted: bool) {
    let cx = (rc.left + rc.right) / 2;
    let cy = (rc.top + rc.bottom) / 2;
    let s = scale;
    let color = if muted { C_FAINT } else { C_TEXT };
    let body = [
        windows::Win32::Foundation::POINT { x: cx - (7.0 * s) as i32, y: cy - (3.0 * s) as i32 },
        windows::Win32::Foundation::POINT { x: cx - (4.0 * s) as i32, y: cy - (3.0 * s) as i32 },
        windows::Win32::Foundation::POINT { x: cx + (1.0 * s) as i32, y: cy - (7.0 * s) as i32 },
        windows::Win32::Foundation::POINT { x: cx + (1.0 * s) as i32, y: cy + (7.0 * s) as i32 },
        windows::Win32::Foundation::POINT { x: cx - (4.0 * s) as i32, y: cy + (3.0 * s) as i32 },
        windows::Win32::Foundation::POINT { x: cx - (7.0 * s) as i32, y: cy + (3.0 * s) as i32 },
    ];
    let brush = CreateSolidBrush(color);
    let ob = SelectObject(hdc, HGDIOBJ(brush.0));
    let op = SelectObject(hdc, GetStockObject(NULL_PEN));
    let _ = Polygon(hdc, &body);
    SelectObject(hdc, op);
    SelectObject(hdc, ob);
    let _ = DeleteObject(HGDIOBJ(brush.0));
    let lw = (1.3 * s).round().max(1.0) as i32;
    if muted {
        stroke_line(hdc, C_BAD, lw, &[
            (cx + (5.0 * s) as i32, cy - (3.0 * s) as i32),
            (cx + (11.0 * s) as i32, cy + (3.0 * s) as i32),
        ]);
        stroke_line(hdc, C_BAD, lw, &[
            (cx + (11.0 * s) as i32, cy - (3.0 * s) as i32),
            (cx + (5.0 * s) as i32, cy + (3.0 * s) as i32),
        ]);
    } else {
        // 两道声波（右开口圆弧）
        let ox = cx + (2.0 * s) as i32;
        for r in [5.0f32, 9.0] {
            let steps = 12;
            let mut pts: Vec<(i32, i32)> = Vec::with_capacity(steps + 1);
            for i in 0..=steps {
                let a = -0.95 + 1.9 * (i as f32 / steps as f32);
                pts.push((ox + (r * s * a.cos()) as i32, cy + (r * s * a.sin()) as i32));
            }
            stroke_line(hdc, color, lw, &pts);
        }
    }
}

/// 4 格信号：按延迟决定亮几格。
unsafe fn signal_bars(hdc: HDC, rc: &RECT, scale: f32, latency: u32) {
    let n = if latency == 0 {
        0
    } else if latency < 60 {
        4
    } else if latency < 120 {
        3
    } else if latency < 220 {
        2
    } else {
        1
    };
    let color = if n >= 3 { C_OK } else if n == 2 { C_WARN } else if n == 1 { C_BAD } else { C_FAINT };
    let cx = rc.left;
    let by = (rc.top + rc.bottom) / 2 + (7.0 * scale) as i32;
    let bw = (3.0 * scale).round().max(2.0) as i32;
    let gap = (2.0 * scale).round().max(1.0) as i32;
    for i in 0..4 {
        let hh = ((3.0 + 3.0 * i as f32) * scale).round() as i32;
        let x = cx + i * (bw + gap);
        let c = if (i as u32) < n { color } else { C_FAINT };
        let brush = CreateSolidBrush(c);
        let _ = FillRect(hdc, &RECT { left: x, top: by - hh, right: x + bw, bottom: by }, brush);
        let _ = DeleteObject(HGDIOBJ(brush.0));
    }
}

fn elapsed_text() -> String {
    let s = elapsed_secs();
    if s == 0 {
        return "--:--".into();
    }
    let (h, m, sec) = (s / 3600, (s / 60) % 60, s % 60);
    if h > 0 {
        format!("{h:02}:{m:02}:{sec:02}")
    } else {
        format!("{m:02}:{sec:02}")
    }
}

unsafe fn draw_bar(hdc: HDC, w: i32, h: i32, scale: f32) {
    let bar = compute_bar(w, scale);
    let hover = hover();
    let s = |v: f32| (v * scale).round() as i32;
    fill(hdc, RECT { left: 0, top: 0, right: w, bottom: h }, C_BG);
    fill(hdc, RECT { left: 0, top: h - s(1.0), right: w, bottom: h }, C_LINE);

    let f_tab = font(scale, 13.5, 500);
    let f_small = font(scale, 12.0, FW_NORMAL.0 as i32);
    let f_time = font(scale, 13.0, 500);
    let f_ctrl = font(scale, 13.0, 500);

    for (i, t) in bar.tabs.iter().enumerate() {
        let hovered = hover == Hit::Tab(i).tag() || hover == Hit::TabClose(i).tag();
        if t.active {
            round_fill(hdc, t.rect, C_TAB, s(7.0));
            round_frame(hdc, t.rect, C_TAB_LINE, s(7.0));
            round_fill(
                hdc,
                RECT {
                    left: t.rect.left + s(12.0),
                    top: t.rect.bottom - s(3.0),
                    right: t.rect.right - s(12.0),
                    bottom: t.rect.bottom,
                },
                C_ACCENT,
                s(2.0),
            );
        } else if hovered {
            round_fill(hdc, t.rect, C_HOVER, s(7.0));
        }
        let label = RECT {
            left: t.rect.left + s(12.0),
            top: t.rect.top,
            right: t.rect.right - s(26.0),
            bottom: t.rect.bottom - s(3.0),
        };
        let color = if t.active || hovered { C_TEXT } else { C_DIM };
        text(hdc, &label, &t.name, TF_VCENTER | TF_SINGLELINE | TF_END_ELLIPSIS, color, f_tab);
        // 激活页常显叉号；未激活页 hover 时才显示（含直接悬停叉号）
        if t.active || hovered {
            let close_hover = hover == Hit::TabClose(i).tag();
            if close_hover {
                round_fill(hdc, t.close, C_HOVER, s(4.0));
            }
            tab_close_glyph(hdc, &t.close, scale, if close_hover { C_TEXT } else { C_DIM });
        }
    }
    // 标题栏左侧显示当前账号昵称（官方把用户名放在顶部）
    let plus_hover = hover == Hit::NewTab.tag();
    if plus_hover {
        round_fill(hdc, bar.plus, C_HOVER, s(6.0));
    }
    plus_glyph(hdc, &bar.plus, scale, if plus_hover { C_TEXT } else { C_DIM });

    // 右侧状态区：信号格 + 实时码率 + 帧率 + 连接时长；悬停显示具体延迟
    let lat = latency();
    let elapsed = elapsed_text();
    let net = net_text(net_bytes_per_sec());
    let fps = fps();
    let fps_txt = fps_text(fps);
    let bars_right = bar.signal.left + s(20.0);
    signal_bars(
        hdc,
        &RECT { left: bar.signal.left, top: bar.signal.top, right: bars_right, bottom: bar.signal.bottom },
        scale,
        lat,
    );
    let mut x = bars_right + s(8.0);
    let net_rc = RECT {
        left: x,
        top: bar.signal.top,
        right: x + s(STAT_W_LOGICAL),
        bottom: bar.signal.bottom,
    };
    text(hdc, &net_rc, &net, TF_VCENTER | TF_SINGLELINE, C_DIM, f_small);
    x += s(STAT_W_LOGICAL) + s(10.0);
    let fps_rc = RECT {
        left: x,
        top: bar.signal.top,
        right: x + s(FPS_W_LOGICAL),
        bottom: bar.signal.bottom,
    };
    let fps_color = if fps == 0 {
        C_FAINT
    } else if fps >= 50 {
        C_OK
    } else if fps >= 30 {
        C_WARN
    } else {
        C_BAD
    };
    text(hdc, &fps_rc, &fps_txt, TF_VCENTER | TF_SINGLELINE, fps_color, f_small);
    x += s(FPS_W_LOGICAL) + s(10.0);
    // 计时用固定槽位，右缘与状态区尾隙对齐
    let time_rc = RECT {
        left: x,
        top: bar.signal.top,
        right: x + s(TIME_W_LOGICAL),
        bottom: bar.signal.bottom,
    };
    text(hdc, &time_rc, &elapsed, TF_VCENTER | TF_SINGLELINE, C_TEXT, f_time);
    if hover == Hit::Signal.tag() {
        let tip_w = s(104.0);
        let tip_h = s(26.0);
        let rc = RECT {
            left: bar.signal.left - s(10.0) - tip_w,
            top: (h - tip_h) / 2,
            right: bar.signal.left - s(10.0),
            bottom: (h + tip_h) / 2,
        };
        round_fill(hdc, rc, C_PANEL, s(6.0));
        round_frame(hdc, rc, C_PANEL_LINE, s(6.0));
        let (txt, color) = if lat == 0 {
            ("延迟 测量中".to_string(), C_FAINT)
        } else {
            (format!("延迟 {lat} ms"), if lat < 80 { C_OK } else if lat < 160 { C_WARN } else { C_BAD })
        };
        text(hdc, &rc, &txt, TF_CENTER | TF_VCENTER | TF_SINGLELINE, color, f_ctrl);
    }

    // 静音
    if hover == Hit::Mute.tag() {
        round_fill(hdc, bar.mute, C_HOVER, s(7.0));
    }
    speaker_glyph(hdc, &bar.mute, scale, muted());

    // 控制中心
    let ctrl_hover = hover == Hit::Control.tag();
    round_fill(hdc, bar.control, if ctrl_hover { C_HOVER } else { C_TAB }, s(8.0));
    round_frame(hdc, bar.control, C_TAB_LINE, s(8.0));
    let ctrl_text = RECT {
        left: bar.control.left,
        top: bar.control.top,
        right: bar.control.right - s(16.0),
        bottom: bar.control.bottom,
    };
    text(hdc, &ctrl_text, "控制中心", TF_CENTER | TF_VCENTER | TF_SINGLELINE, C_TEXT, f_ctrl);
    chevron_glyph(hdc, bar.control.right - s(11.0), (bar.control.top + bar.control.bottom) / 2, scale, false, C_DIM);

    // 窗口按钮
    for (rc, hit, kind) in [
        (&bar.min, Hit::Min, 0u8),
        (&bar.max, Hit::Max, 1u8),
        (&bar.close, Hit::Close, 2u8),
    ] {
        if hover == hit.tag() {
            fill(hdc, *rc, if kind == 2 { C_CLOSE_HOVER } else { C_HOVER });
        }
        win_glyph(hdc, rc, kind, scale, is_maximized(), C_TEXT);
    }

    let _ = DeleteObject(HGDIOBJ(f_tab.0));
    let _ = DeleteObject(HGDIOBJ(f_small.0));
    let _ = DeleteObject(HGDIOBJ(f_time.0));
    let _ = DeleteObject(HGDIOBJ(f_ctrl.0));
}

unsafe fn draw_panel(hdc: HDC, w: i32, h: i32, scale: f32) {
    let hover = hover();
    let s = |v: f32| (v * scale).round() as i32;
    fill(hdc, RECT { left: 0, top: 0, right: w, bottom: h }, C_PANEL);
    // 1px 描边
    fill(hdc, RECT { left: 0, top: 0, right: w, bottom: s(1.0) }, C_PANEL_LINE);
    fill(hdc, RECT { left: 0, top: h - s(1.0), right: w, bottom: h }, C_PANEL_LINE);
    fill(hdc, RECT { left: 0, top: 0, right: s(1.0), bottom: h }, C_PANEL_LINE);
    fill(hdc, RECT { left: w - s(1.0), top: 0, right: w, bottom: h }, C_PANEL_LINE);

    let f_head = font(scale, 12.5, 500);
    let f_row = font(scale, 13.5, 500);
    let f_dim = font(scale, 11.5, FW_NORMAL.0 as i32);
    let pad = s(16.0);
    let header_h = s(PANEL_HEAD_H);
    let row_h = s(PANEL_ROW_H);

    // 标题：金色竖条 + 画面质量，右侧显示当前档位
    let hb_top = (header_h - s(12.0)) / 2;
    fill(hdc, RECT { left: pad, top: hb_top, right: pad + s(3.0), bottom: hb_top + s(12.0) }, C_ACCENT);
    text(
        hdc,
        &RECT { left: pad + s(10.0), top: 0, right: w - pad - s(40.0), bottom: header_h },
        "画面质量",
        TF_VCENTER | TF_SINGLELINE,
        C_DIM,
        f_head,
    );
    text(
        hdc,
        &RECT { left: w - pad - s(60.0), top: 0, right: w - pad, bottom: header_h },
        PRESETS[quality()].0,
        TF_RIGHT | TF_VCENTER | TF_SINGLELINE,
        C_ACCENT_DIM,
        f_dim,
    );

    let active = quality();
    for (i, (name, min, max)) in PRESETS.iter().enumerate() {
        let top = header_h + i as i32 * row_h;
        let rc = RECT {
            left: s(8.0),
            top: top + s(3.0),
            right: w - s(8.0),
            bottom: top + row_h - s(3.0),
        };
        if hover == Hit::PanelRow(i).tag() {
            round_fill(hdc, rc, C_HOVER, s(5.0));
        }
        let label = RECT { left: pad, top, right: w - s(160.0), bottom: top + row_h };
        text(hdc, &label, name, TF_VCENTER | TF_SINGLELINE, if i == active { C_ACCENT } else { C_TEXT }, f_row);
        let sub = format!("{min}–{max} Kbps");
        let sub_rc = RECT {
            left: w - s(152.0),
            top,
            right: w - pad - s(20.0),
            bottom: top + row_h,
        };
        text(hdc, &sub_rc, &sub, TF_RIGHT | TF_VCENTER | TF_SINGLELINE, C_FAINT, f_dim);
        if i == active {
            let cx = w - pad - s(7.0);
            let cy = top + row_h / 2;
            stroke_line(hdc, C_ACCENT, s(1.6).max(1), &[
                (cx - s(5.0), cy),
                (cx - s(1.0), cy + s(4.0)),
                (cx + s(6.0), cy - s(4.0)),
            ]);
        }
        if i + 1 < PRESETS.len() {
            fill(
                hdc,
                RECT { left: pad, top: top + row_h, right: w - pad, bottom: top + row_h + s(1.0) },
                C_PANEL_SOFT,
            );
        }
    }

    // 第二组：显示
    let group2_top = header_h + PRESETS.len() as i32 * row_h;
    fill(
        hdc,
        RECT { left: 0, top: group2_top, right: w, bottom: group2_top + s(1.0) },
        C_PANEL_LINE,
    );
    let head2_h = s(PANEL_HEAD2_H);
    let hb2_top = group2_top + (head2_h - s(12.0)) / 2;
    fill(
        hdc,
        RECT { left: pad, top: hb2_top, right: pad + s(3.0), bottom: hb2_top + s(12.0) },
        C_ACCENT,
    );
    text(
        hdc,
        &RECT { left: pad + s(10.0), top: group2_top, right: w - pad, bottom: group2_top + head2_h },
        "显示",
        TF_VCENTER | TF_SINGLELINE,
        C_DIM,
        f_head,
    );

    // 全屏开关（Alt+Enter）
    let toggle_top = group2_top + head2_h;
    let trc = RECT {
        left: s(8.0),
        top: toggle_top + s(3.0),
        right: w - s(8.0),
        bottom: toggle_top + row_h - s(3.0),
    };
    if hover == Hit::Fullscreen.tag() {
        round_fill(hdc, trc, C_HOVER, s(5.0));
    }
    let full = is_fullscreen();
    text(
        hdc,
        &RECT { left: pad, top: toggle_top, right: w - s(120.0), bottom: toggle_top + row_h },
        "全屏",
        TF_VCENTER | TF_SINGLELINE,
        if full { C_ACCENT } else { C_TEXT },
        f_row,
    );
    text(
        hdc,
        &RECT { left: w - s(130.0), top: toggle_top, right: w - pad - s(20.0), bottom: toggle_top + row_h },
        "Alt + Enter",
        TF_RIGHT | TF_VCENTER | TF_SINGLELINE,
        C_FAINT,
        f_dim,
    );
    if full {
        let cx = w - pad - s(7.0);
        let cy = toggle_top + row_h / 2;
        stroke_line(hdc, C_ACCENT, s(1.6).max(1), &[
            (cx - s(5.0), cy),
            (cx - s(1.0), cy + s(4.0)),
            (cx + s(6.0), cy - s(4.0)),
        ]);
    }

    // 底部：当前码流分辨率（跟随窗口）
    let nodes = panel_nodes();
    let group3_top = toggle_top + row_h;
    fill(hdc, RECT { left: 0, top: group3_top, right: w, bottom: group3_top + s(1.0) }, C_PANEL_LINE);
    let hb3_top = group3_top + (head2_h - s(12.0)) / 2;
    fill(
        hdc,
        RECT { left: pad, top: hb3_top, right: pad + s(3.0), bottom: hb3_top + s(12.0) },
        C_ACCENT,
    );
    text(
        hdc,
        &RECT { left: pad + s(10.0), top: group3_top, right: w - pad, bottom: group3_top + head2_h },
        "线路",
        TF_VCENTER | TF_SINGLELINE,
        C_DIM,
        f_head,
    );
    let selected = node_id();
    let node_h = s(PANEL_NODE_H);
    for (i, n) in nodes.iter().enumerate() {
        let top = group3_top + head2_h + i as i32 * node_h;
        let rc = RECT {
            left: s(8.0),
            top: top + s(2.0),
            right: w - s(8.0),
            bottom: top + node_h - s(2.0),
        };
        if hover == Hit::PanelNode(i).tag() {
            round_fill(hdc, rc, C_HOVER, s(5.0));
        }
        let active = !selected.is_empty() && n.id == selected;
        text(
            hdc,
            &RECT { left: pad, top, right: w - s(96.0), bottom: top + node_h },
            &n.name,
            TF_VCENTER | TF_SINGLELINE | TF_END_ELLIPSIS,
            if active { C_ACCENT } else { C_TEXT },
            f_row,
        );
        let (ptxt, pcolor) = match n.ping {
            Some(ms) if ms < 60 => (format!("{ms} ms"), C_OK),
            Some(ms) if ms < 120 => (format!("{ms} ms"), C_WARN),
            Some(ms) => (format!("{ms} ms"), C_BAD),
            None => ("测速中".to_string(), C_FAINT),
        };
        text(
            hdc,
            &RECT { left: w - s(90.0), top, right: w - pad - s(18.0), bottom: top + node_h },
            &ptxt,
            TF_RIGHT | TF_VCENTER | TF_SINGLELINE,
            pcolor,
            f_dim,
        );
        if active {
            let cx = w - pad - s(6.0);
            let cy = top + node_h / 2;
            stroke_line(hdc, C_ACCENT, s(1.6).max(1), &[
                (cx - s(5.0), cy),
                (cx - s(1.0), cy + s(4.0)),
                (cx + s(6.0), cy - s(4.0)),
            ]);
        }
    }

    let foot_top = group3_top + head2_h + nodes.len().max(1) as i32 * node_h;
    fill(hdc, RECT { left: 0, top: foot_top, right: w, bottom: foot_top + s(1.0) }, C_PANEL_LINE);
    let (sw, sh) = stream_px();
    let info = if sw == 0 { "码流 —".to_string() } else { format!("码流 {sw}×{sh} · 本地缩放") };
    text(
        hdc,
        &RECT { left: pad, top: foot_top, right: w - pad, bottom: h },
        &info,
        TF_VCENTER | TF_SINGLELINE,
        C_FAINT,
        f_dim,
    );

    let _ = DeleteObject(HGDIOBJ(f_head.0));
    let _ = DeleteObject(HGDIOBJ(f_row.0));
    let _ = DeleteObject(HGDIOBJ(f_dim.0));
}

#[cfg(test)]
mod preview_tests {
    use super::*;

    fn dump(name: &str, w: u32, scale: f32, px: &[u8], h: u32) {
        let mut out = Vec::new();
        let data_len = (w * h * 4) as u32;
        out.extend_from_slice(b"BM");
        out.extend_from_slice(&(54 + data_len).to_le_bytes());
        out.extend_from_slice(&0u32.to_le_bytes());
        out.extend_from_slice(&54u32.to_le_bytes());
        out.extend_from_slice(&40u32.to_le_bytes());
        out.extend_from_slice(&(w as i32).to_le_bytes());
        out.extend_from_slice(&(-(h as i32)).to_le_bytes());
        out.extend_from_slice(&1u16.to_le_bytes());
        out.extend_from_slice(&32u16.to_le_bytes());
        out.extend_from_slice(&0u32.to_le_bytes());
        out.extend_from_slice(&data_len.to_le_bytes());
        out.extend_from_slice(&[0u8; 16]);
        out.extend_from_slice(px);
        std::fs::create_dir_all(".tmp").ok();
        std::fs::write(format!("../../.tmp/{name}.bmp"), out).unwrap();
    }

    #[test]
    fn dump_bar_preview() {
        let (tx, _rx) = std::sync::mpsc::channel();
        init(tx);
        set_sessions(
            vec![
                SessionTab { id: "a".into(), name: "云·二重螺旋".into() },
                SessionTab { id: "b".into(), name: "小号".into() },
            ],
            "a".into(),
        );
        set_stream_size(1920, 1080);
        mark_connected();
        sample_stats();
        for _ in 0..4 {
            std::thread::sleep(std::time::Duration::from_millis(650));
            add_rx_bytes(8_200_000);
            for _ in 0..39 { add_frame(); }
            sample_stats();
        }
        for w in [1600u32, 1100, 900] {
            let h = title_height(1.0);
            dump(&format!("bar_{w}"), w, 1.0, &render_bar(w, 1.0), h);
        }
        assert!(true);
    }

    #[test]
    fn dump_status_preview() {
        let (tx, _rx) = std::sync::mpsc::channel();
        init(tx);
        set_conn(Conn::Lost, "网络连接已中断");
        let (px, w, h) = render_status(1.0);
        dump("status", w, 1.0, &px, h);
        set_nodes(
            vec![
                NodeRow { id: "n1".into(), name: "华东-电信".into(), ping: Some(28) },
                NodeRow { id: "n2".into(), name: "华南-联通".into(), ping: Some(96) },
                NodeRow { id: "n3".into(), name: "华北-移动".into(), ping: None },
            ],
            "n1".into(),
        );
        let (px, w, h) = render_panel(1.0);
        dump("panel", w, 1.0, &px, h);
    }
}
