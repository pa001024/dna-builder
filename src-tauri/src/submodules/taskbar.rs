//! 屏幕信息条与 Windows 任务栏的原生集成(任务栏显示模式)。
//!
//! 分两种情况,与 TrafficMonitor / TrayS 的处理一致:
//! - **Win10 风格任务栏**(Shell_TrayWnd 下没有 XAML 桥):把浮窗 `SetParent` 到
//!   `ReBarWindow32`(任务按钮区),成为任务栏的真子窗口,视觉与生命周期都"长在任务栏里"。
//! - **Win11 XAML 任务栏**(存在 `Windows.UI.Composition.DesktopWindowContentBridge`):
//!   微软已砍掉任务栏嵌入 API,所有"真嵌入"路线均不可行(原生 smoke 逐条实证):
//!   ① 普通子窗口挂在任务栏下(ReBar 遗留窗口 / Shell_TrayWnd 本体 / XAML 桥)不被 DWM 合成;
//!   ② 分层子窗口(`WS_EX_LAYERED` + 色键,TrayS 秒针时钟的做法)同样不合成;
//!   ③ DWM 缩略图以任务栏为目标被 `E_INVALIDARG` 拒绝(目标是 DComp 合成窗口);
//!   ④ `SetWindowBand` 与任务栏同带(ZBID_DESKTOP)插入无法免疫真实点击带来的抬升。
//!   因此退化为**覆盖模式**:浮窗保持顶层窗口并置顶,定位到任务栏区域内、托盘时钟左侧,
//!   视觉上覆盖在任务栏上。覆盖模式由后端看护线程负责两件事(放在后端是为了不给前端
//!   IPC 增加周期性调用):
//!   - 周期性把窗口压回 topmost 波段最上层——点击任务栏会把任务栏自己抬到信息条上面,
//!     靠 `SetWindowPos(HWND_TOPMOST)` 定时压回(TrafficMonitor 同思路);
//!   - 前台出现铺满显示器的全屏应用时隐藏信息条、退出全屏后恢复(TrayS 走 APPBAR
//!     回调,这里用同节拍轮询前台窗口矩形实现,效果一致)。
//!
//! explorer 重启在 Win10 嵌入模式下会连带销毁子窗口,自愈重建由前端看门狗负责(见 useScreenBar)。

use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, LazyLock, Mutex};
use std::thread;
use std::time::Duration;
use windows::Win32::Foundation::{HWND, POINT, RECT};
use windows::Win32::Graphics::Gdi::{
    ClientToScreen, GetMonitorInfoW, MONITORINFO, MONITOR_DEFAULTTONEAREST, MonitorFromWindow,
};
use windows::Win32::UI::HiDpi::GetDpiForWindow;
use windows::Win32::UI::WindowsAndMessaging::{
    GA_PARENT, FindWindowExW, FindWindowW, GetAncestor, GetClassNameW, GetClientRect,
    GetDesktopWindow, GetForegroundWindow, GetWindowRect, HWND_TOP, HWND_TOPMOST, IsWindow,
    IsWindowVisible, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW, SW_HIDE,
    SW_SHOWNOACTIVATE, SetParent, SetWindowPos, ShowWindow,
};
use windows::core::{PCWSTR, w};

/// Shell_TrayWnd 下 XAML 桥的类名;存在即 Win11 任务栏(子窗口嵌入不可用,走覆盖模式)。
const XAML_BRIDGE_CLASS: PCWSTR = w!("Windows.UI.Composition.DesktopWindowContentBridge");

/// 信息条与托盘区之间保留的物理像素边距。
const TASKBAR_RIGHT_MARGIN: i32 = 4;

/// 覆盖模式看护线程的轮询间隔。
///
/// 两个职责共用同一节拍:点击任务栏会把它抬到信息条上面,线程周期性把信息条压回
/// topmost 波段最上层(SetWindowPos 对"已经是最顶层"的窗口是空操作,固定节拍轮询
/// 没有视觉或性能代价);同一拍顺带检查全屏前台应用,决定隐藏或恢复显示。
const KEEP_TOP_INTERVAL: Duration = Duration::from_millis(500);

/// 嵌入落位结果(逻辑像素;宿主客户区尺寸供调用方判断内容是否被截断)。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenBarTaskbarFit {
    /// 实际生效的显示方式:"embedded" = 真实嵌入(任务栏子窗口),"overlay" = 顶层窗口覆盖在任务栏上。
    pub mode: &'static str,
    /// 信息条窗口最终逻辑宽度(超出可用区域时被截断)。
    pub width: f64,
    /// 信息条窗口最终逻辑高度(超出任务栏高度时被截断)。
    pub height: f64,
    /// 宿主客户区逻辑宽度。
    pub host_width: f64,
    /// 宿主客户区逻辑高度。
    pub host_height: f64,
    /// 宿主 DPI 缩放系数(物理像素 / 逻辑像素)。
    pub scale: f64,
}

/// 任务栏宿主类型。
#[derive(Debug, Clone, Copy)]
enum TaskbarHost {
    /// Win10 风格:真实嵌入,窗口成为该窗口的子窗口。
    Embed(HWND),
    /// Win11 XAML:不能真实嵌入,窗口保持顶层、置顶并覆盖在任务栏上。
    Overlay(HWND),
}

impl TaskbarHost {
    /// 宿主窗口句柄(两种模式的定位参照物)。
    fn hwnd(self) -> HWND {
        match self {
            TaskbarHost::Embed(hwnd) | TaskbarHost::Overlay(hwnd) => hwnd,
        }
    }
}

/// 探测任务栏宿主,返回 `(Shell_TrayWnd, 宿主)`;找不到任务栏(异常桌面环境)时返回 None。
///
/// 判定依据是 XAML 桥而非 ReBarWindow32:Win11 的 Shell_TrayWnd 下同样能找到一个
/// 遗留的 ReBarWindow32,但它被 XAML 层盖住,嵌进去的窗口永远不可见(smoke 实证)。
fn find_taskbar_host() -> Option<(HWND, TaskbarHost)> {
    unsafe {
        let tray = FindWindowW(w!("Shell_TrayWnd"), PCWSTR::null()).ok()?;
        if tray.0.is_null() {
            return None;
        }
        let xaml_bridge = FindWindowExW(Some(tray), None, XAML_BRIDGE_CLASS, PCWSTR::null())
            .unwrap_or_default();
        if !xaml_bridge.0.is_null() {
            return Some((tray, TaskbarHost::Overlay(tray)));
        }
        // Win10 及以下嵌 ReBarWindow32;极老系统没有该子窗口时退回 Shell_TrayWnd 本体
        let rebar = FindWindowExW(Some(tray), None, w!("ReBarWindow32"), PCWSTR::null())
            .unwrap_or_default();
        let host = if rebar.0.is_null() { tray } else { rebar };
        Some((tray, TaskbarHost::Embed(host)))
    }
}

/// 覆盖模式的保持置顶会话:正在被保持置顶的窗口与停止标志。
struct KeepTopSession {
    /// 目标窗口句柄值(HWND 裸指针不满足 Send,只存 isize)。
    hwnd: isize,
    /// 停止标志:分离/换窗口/窗口销毁时置 true,线程自行退出。
    stop: Arc<AtomicBool>,
}

/// 当前保持置顶会话;None 表示没有窗口需要保持置顶。
static KEEP_TOP: LazyLock<Mutex<Option<KeepTopSession>>> = LazyLock::new(|| Mutex::new(None));

/// 启动(或确认已在运行)覆盖模式的看护线程(周期置顶 + 全屏隐藏/恢复)。
///
/// 线程独立于 Tauri 事件循环运行,SetWindowPos / ShowWindow 是跨线程调用(由窗口所属
/// 线程处理);已在为同一窗口运行时直接返回,避免重复起线程。
fn start_keep_top(hwnd: HWND) {
    let hwnd_id = hwnd.0 as isize;
    let mut session = KEEP_TOP.lock().unwrap();
    if let Some(current) = session.as_ref() {
        if current.hwnd == hwnd_id {
            return;
        }
        // 理论上不会发生(同一窗口才可能重复 embed);万一换了窗口,停掉旧线程
        current.stop.store(true, Ordering::Relaxed);
    }
    let stop = Arc::new(AtomicBool::new(false));
    *session = Some(KeepTopSession {
        hwnd: hwnd_id,
        stop: stop.clone(),
    });
    drop(session);
    let spawn_result = thread::Builder::new()
        .name("screen-bar-keep-top".to_string())
        .spawn(move || keep_top_loop(hwnd_id, stop));
    if let Err(error) = spawn_result {
        eprintln!("启动任务栏保持置顶线程失败: {error}");
        *KEEP_TOP.lock().unwrap() = None;
    }
}

/// 保持置顶线程主循环:周期性把窗口压回 topmost 波段最上层,并在全屏应用前台时隐藏、
/// 退出全屏后恢复显示,直到被停止或窗口销毁。
fn keep_top_loop(hwnd_id: isize, stop: Arc<AtomicBool>) {
    loop {
        if stop.load(Ordering::Relaxed) {
            return;
        }
        thread::sleep(KEEP_TOP_INTERVAL);
        if stop.load(Ordering::Relaxed) {
            return;
        }
        let hwnd = HWND(hwnd_id as *mut core::ffi::c_void);
        unsafe {
            // 窗口已销毁(浮窗页关闭/应用退出):清掉会话并结束线程
            if !IsWindow(Some(hwnd)).as_bool() {
                let mut session = KEEP_TOP.lock().unwrap();
                if session.as_ref().is_some_and(|current| current.hwnd == hwnd_id) {
                    *session = None;
                }
                return;
            }
            if is_foreground_fullscreen(hwnd) {
                // 全屏应用在前台:隐藏信息条避免盖住内容(与 TrayS/TrafficMonitor 行为一致);
                // IsWindowVisible 守卫保证只在状态翻转时调用一次,不重复发 ShowWindow
                if IsWindowVisible(hwnd).as_bool() {
                    let _ = ShowWindow(hwnd, SW_HIDE);
                }
            } else {
                // 回到普通桌面:先恢复显示(可能刚从全屏隐藏回来),再置回 topmost 波段最上层
                if !IsWindowVisible(hwnd).as_bool() {
                    let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
                }
                let _ = SetWindowPos(hwnd, Some(HWND_TOPMOST), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
            }
        }
    }
}

/// 判断前台窗口是否铺满了信息条所在显示器的全屏应用。
///
/// 口径:前台窗口矩形完整覆盖信息条所在显示器的物理矩形(最大化窗口只覆盖工作区、
/// 会给任务栏留出一条,不算全屏)。桌面与任务栏等 shell 窗口按类名排除,避免点击
/// 桌面(Progman/WorkerW 铺满显示器)时误判成全屏。
fn is_foreground_fullscreen(bar_hwnd: HWND) -> bool {
    unsafe {
        let foreground = GetForegroundWindow();
        if foreground.0.is_null() || foreground == bar_hwnd {
            return false;
        }
        // shell/桌面窗口按类名排除:它们铺满或占据特殊区域但不是"全屏应用"
        let mut class_buf = [0u16; 64];
        let class_len = GetClassNameW(foreground, &mut class_buf).max(0) as usize;
        let class = String::from_utf16_lossy(&class_buf[..class_len]);
        if matches!(class.as_str(), "Progman" | "WorkerW" | "Shell_TrayWnd" | "Shell_SecondaryTrayWnd") {
            return false;
        }
        let mut rect = RECT::default();
        if GetWindowRect(foreground, &mut rect).is_err() {
            return false;
        }
        // 以信息条自己所在的显示器为基准(多显示器时另一块屏上的全屏应用不影响本屏信息条)
        let monitor = MonitorFromWindow(bar_hwnd, MONITOR_DEFAULTTONEAREST);
        let mut info = MONITORINFO {
            cbSize: core::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if !GetMonitorInfoW(monitor, &mut info).as_bool() {
            return false;
        }
        rect.left <= info.rcMonitor.left
            && rect.right >= info.rcMonitor.right
            && rect.top <= info.rcMonitor.top
            && rect.bottom >= info.rcMonitor.bottom
    }
}

/// 停掉指定窗口的保持置顶线程(不匹配时是空操作)。
fn stop_keep_top(hwnd: HWND) {
    let hwnd_id = hwnd.0 as isize;
    let mut session = KEEP_TOP.lock().unwrap();
    if let Some(current) = session.as_ref() {
        if current.hwnd == hwnd_id {
            current.stop.store(true, Ordering::Relaxed);
            *session = None;
        }
    }
}

/// 把窗口按任务栏模式落位(幂等;重复调用等于按新尺寸重新摆放)。
///
/// 落位策略:水平贴右(与托盘区留边距,避开 Win11 居中的任务图标),垂直居中;
/// 宽高超过宿主可用区域时按宿主截断。窗口尺寸以逻辑像素传入,按宿主窗口自己的 DPI
/// 换算成物理像素。Win10 嵌入模式坐标是宿主客户区坐标,Win11 覆盖模式是屏幕坐标,
/// 两条路径都在这里换算好,调用方无需感知差异。
pub fn embed(hwnd: HWND, logical_width: f64, logical_height: f64) -> Result<ScreenBarTaskbarFit, String> {
    unsafe {
        let Some((tray, host)) = find_taskbar_host() else {
            return Err("未找到 Windows 任务栏窗口".to_string());
        };
        let host_hwnd = host.hwnd();

        // 宿主 DPI:任务栏在主显示器,拿宿主窗口自己的 DPI 做逻辑 -> 物理换算最可靠
        let dpi = GetDpiForWindow(host_hwnd);
        let scale = if dpi > 0 { dpi as f64 / 96.0 } else { 1.0 };

        // 宿主客户区(屏幕物理坐标)
        let mut client = RECT::default();
        GetClientRect(host_hwnd, &mut client).map_err(|error| format!("获取任务栏客户区失败: {error}"))?;
        let mut origin = POINT { x: 0, y: 0 };
        if !ClientToScreen(host_hwnd, &mut origin).as_bool() {
            return Err("获取任务栏客户区原点失败".to_string());
        }
        let client_width = (client.right - client.left).max(0);
        let client_height = (client.bottom - client.top).max(0);

        // 可用右边界:宿主是 Shell_TrayWnd 本体(Win11 覆盖模式)时压到托盘时钟左侧;
        // Win10 的 ReBarWindow32 天然不包含托盘区,不需要让位
        let mut limit_right = client_width;
        if host_hwnd.0 == tray.0 {
            let notify = FindWindowExW(Some(tray), None, w!("TrayNotifyWnd"), PCWSTR::null())
                .unwrap_or_default();
            if !notify.0.is_null() {
                let mut notify_origin = POINT { x: 0, y: 0 };
                if ClientToScreen(notify, &mut notify_origin).as_bool() {
                    limit_right = (notify_origin.x - origin.x).clamp(0, client_width);
                }
            }
        }

        let width = ((logical_width.max(1.0) * scale).round() as i32).clamp(1, limit_right.max(1));
        let height = ((logical_height.max(1.0) * scale).round() as i32).clamp(1, client_height.max(1));

        let mode = match host {
            TaskbarHost::Embed(target) => {
                // 窗口成为子窗口后不再需要保持置顶线程(点击任务栏不会盖住子窗口)
                stop_keep_top(hwnd);
                // SetParent 的返回值不可靠:窗口原来是顶层窗口时"旧父窗口"是桌面窗口,
                // 成功路径也可能返回 NULL,windows crate 会把 NULL 误报成 Err。
                // 这里不依赖返回值,挂完之后用 GetAncestor 验证父子关系才算数。
                let _ = SetParent(hwnd, Some(target));
                if GetAncestor(hwnd, GA_PARENT) != target {
                    return Err("嵌入任务栏失败: SetParent 未生效".to_string());
                }
                // SetParent 之后坐标变为宿主客户区坐标;置回兄弟窗口最上层
                let x = (limit_right - TASKBAR_RIGHT_MARGIN - width).max(0);
                let y = ((client_height - height) / 2).max(0);
                SetWindowPos(hwnd, Some(HWND_TOP), x, y, width, height, SWP_NOACTIVATE | SWP_SHOWWINDOW)
                    .map_err(|error| format!("任务栏内落位失败: {error}"))?;
                "embedded"
            }
            TaskbarHost::Overlay(_) => {
                // Win11:保持顶层窗口(若残留嵌入关系先脱离),置顶并覆盖到任务栏区域内。
                // 任务栏本身是置顶窗口,只有 HWND_TOPMOST 才能盖在它上面。
                if GetAncestor(hwnd, GA_PARENT) != GetDesktopWindow() {
                    let _ = SetParent(hwnd, None);
                }
                let x = origin.x + (limit_right - TASKBAR_RIGHT_MARGIN - width).max(0);
                let y = origin.y + ((client_height - height) / 2).max(0);
                SetWindowPos(hwnd, Some(HWND_TOPMOST), x, y, width, height, SWP_NOACTIVATE | SWP_SHOWWINDOW)
                    .map_err(|error| format!("任务栏上方落位失败: {error}"))?;
                // 覆盖模式由看护线程周期性压回最上层(点击任务栏会把它抬到信息条上面),
                // 并在前台出现全屏应用时隐藏、退出后恢复
                start_keep_top(hwnd);
                "overlay"
            }
        };

        Ok(ScreenBarTaskbarFit {
            mode,
            width: width as f64 / scale,
            height: height as f64 / scale,
            host_width: client_width as f64 / scale,
            host_height: client_height as f64 / scale,
            scale,
        })
    }
}

/// 把窗口从任务栏分离回顶层悬浮(幂等;未嵌入时是空操作)。
///
/// Win11 覆盖模式的窗口本来就是顶层,这里自然是空操作;分离后恢复显示并置顶,
/// 避免在浮窗页下一次落位前被其他窗口压住(也覆盖全屏隐藏后立即切换回顶部模式的场景)。
pub fn detach(hwnd: HWND) -> Result<(), String> {
    // 覆盖模式的看护线程随之停掉(分离后不再需要)
    stop_keep_top(hwnd);
    unsafe {
        // GetAncestor(GA_PARENT) 对顶层窗口返回桌面窗口;还挂在别的窗口下时先摘出来。
        // 与 embed 同理,SetParent 返回值不可信,以 GetAncestor 的实际父子关系为准。
        if GetAncestor(hwnd, GA_PARENT) != GetDesktopWindow() {
            let _ = SetParent(hwnd, None);
            if GetAncestor(hwnd, GA_PARENT) != GetDesktopWindow() {
                return Err("从任务栏分离失败: SetParent 未生效".to_string());
            }
            SetWindowPos(hwnd, Some(HWND_TOPMOST), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE)
                .map_err(|error| format!("分离后恢复置顶失败: {error}"))?;
        }
        // 若刚从全屏隐藏状态分离,直接恢复显示,避免窗口保持不可见
        if !IsWindowVisible(hwnd).as_bool() {
            let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
        }
    }
    Ok(())
}
