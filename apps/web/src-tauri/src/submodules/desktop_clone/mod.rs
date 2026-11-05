//! 桌面分身后端核心：状态机、会话编排、控件事件分发、窗口/退出清理与前端事件契约。
//!
//! 线程模型：Tauri 命令可能在任意线程执行，所有 COM 操作经 [`on_main_sync`] 投递到主线程；
//! 主线程 thread-local 只在 `rdp_host` 内保存宿主句柄与控件接口。

pub mod capability;
pub mod input;
pub mod launcher;
pub mod rdp_host;
pub mod session;
pub mod settings;
pub mod viewer;

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Mutex, MutexGuard, OnceLock};
use std::thread::ThreadId;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

pub use capability::CloneCapability;
pub use settings::{
    CloneGeometry, CloneOptions, CloneProgram, DesktopCloneSettings, KeyboardHook, MouseMode,
    SmallWindowMode,
};

use rdp_host::Credentials;

/// 克隆窗口 label（前端路由 `/desktop-clone`）。
pub const WINDOW_LABEL: &str = "desktop-clone";
pub const EVENT_STATUS: &str = "desktop-clone:status";
pub const EVENT_CLOSE_REQUESTED: &str = "desktop-clone:close-requested";
pub const EVENT_CREDENTIALS_REQUIRED: &str = "desktop-clone:credentials-required";
pub const EVENT_RECONNECT_REQUIRED: &str = "desktop-clone:reconnect-required";
pub const EVENT_MOUSE_MODE_CHANGED: &str = "desktop-clone:mouse-mode-changed";

/// 标题栏逻辑高度（前端 `ResizeObserver` 上报前使用）。
pub const DEFAULT_CHROME_HEIGHT: f64 = settings::TITLE_BAR_HEIGHT;

/// 关闭会话时等待控件完成断开的时长。
const DISCONNECT_SETTLE: Duration = Duration::from_millis(500);
const MAIN_THREAD_TIMEOUT: Duration = Duration::from_secs(10);
/// OnLogonError 之后等待后续事件（Connected/Disconnected）的宽限期。
const LOGON_ERROR_GRACE: Duration = Duration::from_secs(5);
/// 退出清理允许阻塞调用方的上限（会话注销 + 任务清理在后台线程里跑）。
const SHUTDOWN_BUDGET: Duration = Duration::from_secs(4);
/// 取消连接时轮询子会话 ID 的次数与间隔。
const CANCEL_LOOKUP_ATTEMPTS: usize = 4;
const CANCEL_LOOKUP_INTERVAL: Duration = Duration::from_millis(300);

/// 生命周期操作互斥：connect / reconnect / close_session / prepare 串行执行，
/// 避免 check-then-act 交叉执行同一套 COM 与状态。
static LIFECYCLE: Mutex<()> = Mutex::new(());
/// 选项提交互斥：设置页与控制中心可能同时提交完整选项对象。
static OPTIONS: Mutex<()> = Mutex::new(());
/// 设置快照 + 落盘互斥：保证文件内容与最后一次快照一致。
static SETTINGS_PERSIST: Mutex<()> = Mutex::new(());
/// 连接代次：每个生命周期操作开始时自增，晚到的主线程闭包与控件事件据此作废。
static GENERATION: AtomicU64 = AtomicU64::new(1);
/// 进程正在退出：生命周期命令一律拒绝，避免退出后重建宿主/窗口。
static SHUTTING_DOWN: AtomicBool = AtomicBool::new(false);
/// 控件事件序号：登录错误宽限期据此判断期间是否还有进展。
static EVENT_SEQUENCE: AtomicU64 = AtomicU64::new(0);

pub(crate) fn current_generation() -> u64 {
    GENERATION.load(Ordering::SeqCst)
}

pub(crate) fn is_current_generation(generation: u64) -> bool {
    current_generation() == generation
}

fn bump_generation() -> u64 {
    GENERATION.fetch_add(1, Ordering::SeqCst) + 1
}

fn lock_lifecycle() -> MutexGuard<'static, ()> {
    LIFECYCLE.lock().unwrap_or_else(|error| error.into_inner())
}

/// 覆写命令行参数里的口令副本。
pub fn zeroize_string(value: &mut String) {
    unsafe {
        for byte in value.as_bytes_mut() {
            *byte = 0;
        }
    }
}

/// 仅存在于内存的口令：丢弃时覆写字节，且刻意不实现 `Debug`/`Clone`。
pub struct SecretString(String);

impl SecretString {
    pub fn from_text(value: &str) -> Self {
        Self(value.to_string())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    pub fn duplicate(&self) -> Self {
        Self(self.0.clone())
    }
}

impl Drop for SecretString {
    fn drop(&mut self) {
        zeroize_string(&mut self.0);
        self.0.clear();
    }
}

fn ensure_running() -> Result<(), String> {
    if SHUTTING_DOWN.load(Ordering::SeqCst) {
        Err("应用正在退出".to_string())
    } else {
        Ok(())
    }
}

/// 克隆会话状态（序列化为 kebab-case 字符串，如 `awaiting-credentials`）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum CloneState {
    Unsupported,
    Idle,
    Preparing,
    AwaitingCredentials,
    Connecting,
    Connected,
    Disconnected,
    Error,
    Closing,
}

/// 结构化错误，`code` 供前端做分支，`message` 可直接展示。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloneError {
    pub code: String,
    pub message: String,
}

impl CloneError {
    fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }
}

/// `desktop_clone_status` 的完整载荷。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloneStatus {
    pub state: CloneState,
    pub capability: CloneCapability,
    pub session_id: Option<u32>,
    pub error: Option<CloneError>,
    pub options: CloneOptions,
    pub chrome_height: f64,
    pub overlay_visible: bool,
}

/// 控件回调事件（由事件槽解析后投递）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RdpEvent {
    Connecting,
    Connected,
    LoginComplete,
    LogonError(i32),
    Disconnected(i32),
    FatalError(i32),
    ConfirmClose,
    /// 控件报告的鼠标输入模式是否已切为相对模式。
    MouseInputMode(bool),
}

/// 状态转换合法性：非法转换只记日志并忽略。
pub fn can_transition(from: CloneState, to: CloneState) -> bool {
    use CloneState::*;
    if from == to {
        return true;
    }
    if from == Unsupported {
        return to == Idle;
    }
    match to {
        Idle => matches!(
            from,
            Idle | Preparing
                | AwaitingCredentials
                | Connecting
                | Connected
                | Disconnected
                | Error
                | Closing
        ),
        Preparing => matches!(from, Idle | AwaitingCredentials | Disconnected | Error),
        AwaitingCredentials => matches!(
            from,
            Idle | Preparing | Connecting | Connected | Disconnected | Error
        ),
        Connecting => matches!(
            from,
            Idle | Preparing | AwaitingCredentials | Disconnected | Error
        ),
        // 等待凭据期间连接仍可能自行完成（例如 -2 宽限期已落到等待凭据）
        Connected => matches!(from, Connecting | AwaitingCredentials),
        Disconnected => matches!(
            from,
            Preparing | Connecting | Connected | AwaitingCredentials
        ),
        Error => !matches!(from, Unsupported),
        Closing => !matches!(from, Unsupported),
        Unsupported => from == Unsupported,
    }
}

/// Tauri managed state：状态快照、持久化设置与仅内存的重连凭据。
pub struct CloneManager {
    status: Mutex<CloneStatus>,
    settings: Mutex<DesktopCloneSettings>,
    credentials: Mutex<Option<Credentials>>,
    previous_session: Mutex<Option<u32>>,
}

impl CloneManager {
    pub fn new() -> Self {
        let capability = capability::detect();
        let state = if capability.supported {
            CloneState::Idle
        } else {
            CloneState::Unsupported
        };
        Self {
            status: Mutex::new(CloneStatus {
                state,
                capability,
                session_id: None,
                error: None,
                options: CloneOptions::default(),
                chrome_height: DEFAULT_CHROME_HEIGHT,
                overlay_visible: false,
            }),
            settings: Mutex::new(DesktopCloneSettings::default()),
            credentials: Mutex::new(None),
            previous_session: Mutex::new(None),
        }
    }

    fn lock_status(&self) -> MutexGuard<'_, CloneStatus> {
        self.status
            .lock()
            .unwrap_or_else(|error| error.into_inner())
    }

    fn lock_settings(&self) -> MutexGuard<'_, DesktopCloneSettings> {
        self.settings
            .lock()
            .unwrap_or_else(|error| error.into_inner())
    }

    pub fn snapshot(&self) -> CloneStatus {
        self.lock_status().clone()
    }

    pub fn state(&self) -> CloneState {
        self.lock_status().state
    }

    pub fn capability(&self) -> CloneCapability {
        self.lock_status().capability.clone()
    }

    pub fn session_id(&self) -> Option<u32> {
        self.lock_status().session_id
    }

    pub fn options(&self) -> CloneOptions {
        self.lock_status().options.clone()
    }

    pub fn chrome_height(&self) -> f64 {
        self.lock_status().chrome_height
    }

    pub fn overlay_visible(&self) -> bool {
        self.lock_status().overlay_visible
    }

    pub fn settings_copy(&self) -> DesktopCloneSettings {
        self.lock_settings().clone()
    }

    pub fn set_capability(&self, capability: CloneCapability) {
        self.lock_status().capability = capability;
    }

    pub fn set_state(&self, state: CloneState) -> bool {
        let mut status = self.lock_status();
        if status.state == state {
            return false;
        }
        if !can_transition(status.state, state) {
            eprintln!(
                "[desktop-clone] 忽略非法状态转换 {:?} -> {:?}",
                status.state, state
            );
            return false;
        }
        status.state = state;
        true
    }

    /// 绕过转换规则设置状态：仅用于把界面恢复到能力对应的静止状态（Idle / Unsupported）。
    pub fn force_state(&self, state: CloneState) -> bool {
        let mut status = self.lock_status();
        if status.state == state {
            return false;
        }
        status.state = state;
        true
    }

    /// 内存或持久化标记里是否还有可追踪的子会话。
    pub fn has_tracked_session(&self) -> bool {
        if self.session_id().is_some() {
            return true;
        }
        self.settings_copy().active_session_id.is_some()
    }

    pub fn set_error(&self, error: Option<CloneError>) {
        self.lock_status().error = error;
    }

    pub fn set_session_id(&self, session_id: Option<u32>) {
        self.lock_status().session_id = session_id;
    }

    pub fn set_options(&self, options: CloneOptions) {
        self.lock_status().options = options;
    }

    pub fn set_chrome_height(&self, height: f64) {
        self.lock_status().chrome_height = height;
    }

    pub fn set_overlay_visible(&self, visible: bool) {
        self.lock_status().overlay_visible = visible;
    }

    pub fn update_settings(&self, update: impl FnOnce(&mut DesktopCloneSettings)) {
        update(&mut self.lock_settings());
    }

    /// 重连时使用的凭据：只从内存复制，不落盘、不日志。
    pub fn store_credentials(&self, credentials: Credentials) {
        *self
            .credentials
            .lock()
            .unwrap_or_else(|error| error.into_inner()) = Some(credentials);
    }

    pub fn credentials_snapshot(&self) -> Option<Credentials> {
        self.credentials
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .as_ref()
            .map(Credentials::duplicate)
    }

    pub fn clear_credentials(&self) {
        *self
            .credentials
            .lock()
            .unwrap_or_else(|error| error.into_inner()) = None;
    }

    pub fn set_previous_session(&self, session_id: Option<u32>) {
        *self
            .previous_session
            .lock()
            .unwrap_or_else(|error| error.into_inner()) = session_id;
    }

    pub fn take_previous_session(&self) -> Option<u32> {
        self.previous_session
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .take()
    }
}

impl Default for CloneManager {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------- main thread

static MAIN_THREAD: OnceLock<ThreadId> = OnceLock::new();

/// 记录 Tauri 主线程 ID（setup 时调用）。
pub fn mark_main_thread() {
    let _ = MAIN_THREAD.set(std::thread::current().id());
}

pub fn is_main_thread() -> bool {
    MAIN_THREAD.get() == Some(&std::thread::current().id())
}

/// 在主线程同步执行闭包；已在主线程时直接执行，否则投递并限时等待。
pub fn on_main_sync<T, F>(app: &AppHandle, task: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> T + Send + 'static,
{
    if is_main_thread() {
        return Ok(task());
    }
    let (sender, receiver) = std::sync::mpsc::channel();
    app.run_on_main_thread(move || {
        let _ = sender.send(task());
    })
    .map_err(|error| format!("投递到主线程失败: {error}"))?;
    receiver
        .recv_timeout(MAIN_THREAD_TIMEOUT)
        .map_err(|_| "等待主线程响应超时".to_string())
}

// ---------------------------------------------------------------- events

fn manager(app: &AppHandle) -> tauri::State<'_, CloneManager> {
    app.state::<CloneManager>()
}

/// 向克隆窗口推送状态快照。
pub fn publish(app: &AppHandle) {
    let status = manager(app).snapshot();
    let _ = app.emit_to(WINDOW_LABEL, EVENT_STATUS, status);
}

/// 原生子窗口的可见性判据：只有已连接且没有网页弹层时才显示。
pub(crate) fn host_should_be_visible(state: CloneState, overlay_visible: bool) -> bool {
    state == CloneState::Connected && !overlay_visible
}

/// 按当前状态重排 WebView2 与原生宿主（条状/整窗切换）。
///
/// 必须延后到主线程：控件事件回调发生在 `Connect()` 内部（宿主正被可变借用），
/// 就地访问 `HOST` 会重入 panic。
fn sync_host_visibility(app: &AppHandle) {
    viewer::request_layout(app);
}

fn transition(app: &AppHandle, state: CloneState) -> bool {
    let changed = manager(app).set_state(state);
    if changed {
        publish(app);
        sync_host_visibility(app);
    }
    changed
}

fn set_error_and_transition(app: &AppHandle, state: CloneState, code: &str, message: &str) {
    manager(app).set_error(Some(CloneError::new(code, message)));
    transition(app, state);
    publish(app);
}

/// 严格状态推进：非法转换返回错误而不是静默忽略，生命周期操作据此中止。
fn advance(app: &AppHandle, state: CloneState) -> Result<(), String> {
    let manager = manager(app);
    let current = manager.state();
    if current == state {
        return Ok(());
    }
    if !can_transition(current, state) {
        return Err(format!("当前状态 {current:?} 不能切换到 {state:?}"));
    }
    manager.set_state(state);
    publish(app);
    sync_host_visibility(app);
    Ok(())
}

/// `Closing` 期间一律视为忙。
fn ensure_not_busy(manager: &CloneManager) -> Result<(), String> {
    if manager.state() == CloneState::Closing {
        return Err("正在结束会话，请稍候".to_string());
    }
    Ok(())
}

/// 连接中/已连接/正在关闭时，内存里的子会话 ID 必定是本控件刚创建的那个。
fn tracks_live_session(state: CloneState) -> bool {
    matches!(
        state,
        CloneState::Connecting | CloneState::Connected | CloneState::Closing
    )
}

/// 会话所有权判据（纯函数，便于测试）。
///
/// 只有 `tracks_live_session` 的状态信任内存 ID；其余状态下会话 ID 可能已被系统复用，
/// 必须与当前 child session（且与持久化标记一致）比对后才允许注销/投送。
fn trusted_session_id(
    state: CloneState,
    memory: Option<u32>,
    marker: Option<u32>,
    current: Option<u32>,
) -> Option<u32> {
    if tracks_live_session(state) && memory.is_some() {
        return memory;
    }
    let recorded = if tracks_live_session(state) {
        marker
    } else {
        memory.or(marker)
    };
    if session::should_logoff_orphan(recorded, current) {
        current
    } else {
        None
    }
}

/// 本应用拥有的子会话：优先内存记录；内存缺失时只接受与持久化标记一致的当前子会话。
///
/// 绝不能裸用 `active_child_session_id()`：那可能是其他程序或上次运行创建的会话。
fn owned_child_session_id(manager: &CloneManager) -> Option<u32> {
    trusted_session_id(
        manager.state(),
        manager.session_id(),
        manager.settings_copy().active_session_id,
        session::active_child_session_id(),
    )
}

/// 本应用此刻必定拥有的会话：`allow_active` 仅在本应用正处于连接中/已连接时传 `true`，
/// 此时 `WTSGetChildSessionId` 返回的就是本控件创建的子会话。
fn owned_or_active_child_session_id(manager: &CloneManager, allow_active: bool) -> Option<u32> {
    owned_child_session_id(manager).or_else(|| {
        if allow_active {
            session::active_child_session_id()
        } else {
            None
        }
    })
}

fn counts_as_active(state: CloneState) -> bool {
    matches!(
        state,
        CloneState::Connecting | CloneState::Connected | CloneState::AwaitingCredentials
    )
}

/// 回到能力对应的静止状态（不支持的机器显示 `Unsupported` 而不是可启动的 `Idle`）。
fn settle_resting_state(app: &AppHandle) {
    let manager = manager(app);
    let target = if manager.capability().supported {
        CloneState::Idle
    } else {
        CloneState::Unsupported
    };
    if manager.force_state(target) {
        publish(app);
    }
    sync_host_visibility(app);
}

// ---------------------------------------------------------------- lifecycle

/// setup 阶段初始化：读取设置、刷新能力、恢复状态。
pub fn initialize(app: &AppHandle) {
    mark_main_thread();
    let manager = manager(app);
    let settings = settings::load(app);
    manager.set_options(settings.options.clone());
    manager.update_settings(|current| *current = settings);

    let capability = capability::detect();
    let supported = capability.supported;
    manager.set_capability(capability);
    if supported {
        manager.set_state(CloneState::Idle);
    } else {
        manager.set_state(CloneState::Unsupported);
    }
    manager.set_chrome_height(DEFAULT_CHROME_HEIGHT);
    publish(app);
}

/// 重新检测能力并同步状态（不改变已连接会话）。
pub fn refresh_capability(app: &AppHandle) -> CloneCapability {
    let capability = capability::detect();
    let manager = manager(app);
    manager.set_capability(capability.clone());
    if !capability.supported {
        if matches!(manager.state(), CloneState::Idle | CloneState::Unsupported) {
            manager.force_state(CloneState::Unsupported);
        }
    } else if manager.state() == CloneState::Unsupported {
        manager.force_state(CloneState::Idle);
    }
    publish(app);
    capability
}

/// 当前状态快照。
pub fn status(app: &AppHandle) -> CloneStatus {
    manager(app).snapshot()
}

/// 退出/关闭前的尽力清理：释放输入捕获、断开控件、销毁宿主、清理任务、注销本应用的子会话。
///
/// 本函数可能由主线程调用（托盘菜单/`app_close`），因此会话注销与 Task Scheduler 清理
/// 放到后台线程，并只在 [`SHUTDOWN_BUDGET`] 内等待；超时后剩余清理交给进程退出兜底。
pub fn shutdown(app: &AppHandle) {
    // 先立起退出标记：之后的命令一律拒绝，避免退出过程中再重建宿主或窗口
    SHUTTING_DOWN.store(true, Ordering::SeqCst);
    // 作废在途的主线程闭包与控件事件；退出路径不阻塞等待生命周期锁
    bump_generation();
    let generation = current_generation();
    input::release(app);
    let _ = rdp_host::disconnect(app, generation);
    rdp_host::destroy(app, generation);

    let handle = app.clone();
    let (sender, receiver) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        launcher::cleanup_all();
        let manager = manager(&handle);
        manager.clear_credentials();
        // 先内存 id，再回落标记；cleanup_orphan 内部仍要求与当前 child session 一致
        let recorded = manager
            .session_id()
            .or_else(|| manager.settings_copy().active_session_id);
        match session::cleanup_orphan(recorded) {
            session::OrphanCleanup::LoggedOff(session_id) => {
                println!("[desktop-clone] 已注销子会话 {session_id}");
                manager.set_session_id(None);
                manager.update_settings(|settings| settings.active_session_id = None);
            }
            session::OrphanCleanup::NothingToDo => {
                manager.set_session_id(None);
                manager.update_settings(|settings| settings.active_session_id = None);
            }
            session::OrphanCleanup::Failed { session_id, error } => {
                // 会话可能仍存活：保留标记，下次启动继续清理
                eprintln!("[desktop-clone] 注销子会话 {session_id} 失败（保留清理标记）: {error}");
            }
        }
        persist_settings(&handle);
        let _ = sender.send(());
    });
    if receiver.recv_timeout(SHUTDOWN_BUDGET).is_err() {
        eprintln!("[desktop-clone] 退出清理超时，剩余步骤交由进程退出兜底");
    }
}

/// 启动时清理上次残留的子会话（只清理设置中记录且仍然匹配的会话）。
///
/// 必须在任何 connect 之前同步执行；会话 ID 会被系统复用，晚到执行可能误杀新会话。
pub fn cleanup_orphan_session(app: &AppHandle) {
    let _guard = lock_lifecycle();
    let manager = manager(app);
    if !matches!(manager.state(), CloneState::Idle | CloneState::Unsupported) {
        return;
    }
    let recorded = manager.settings_copy().active_session_id;
    if recorded.is_none() {
        return;
    }
    match session::cleanup_orphan(recorded) {
        session::OrphanCleanup::LoggedOff(session_id) => {
            println!("[desktop-clone] 已清理残留子会话 {session_id}");
            manager.set_session_id(None);
            manager.update_settings(|settings| settings.active_session_id = None);
        }
        session::OrphanCleanup::NothingToDo => {
            // 会话已消失或记录已不匹配，标记没有继续保留的意义
            manager.update_settings(|settings| settings.active_session_id = None);
        }
        session::OrphanCleanup::Failed { session_id, error } => {
            eprintln!("[desktop-clone] 清理残留子会话 {session_id} 失败（保留标记）: {error}");
        }
    }
    persist_settings(app);
}

/// 写入设置文件。
///
/// 快照与落盘必须在同一临界区：否则后取的快照可能先写，文件反而回退到旧状态。
pub fn persist_settings(app: &AppHandle) {
    let _guard = SETTINGS_PERSIST
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    let settings = manager(app).settings_copy();
    if let Err(error) = settings::save(app, &settings) {
        eprintln!("[desktop-clone] 保存设置失败: {error}");
    }
}

// ---------------------------------------------------------------- operations

/// 打开（或聚焦）克隆窗口，不连接。
pub fn open(app: &AppHandle) -> Result<(), String> {
    ensure_running()?;
    let manager = manager(app);
    let options = manager.options();
    let geometry = settings::geometry_for(&manager.settings_copy(), options.small_window);
    viewer::open_window(app, &options, Some(&geometry), current_generation())?;
    publish(app);
    Ok(())
}

/// 启动 TermService 并启用 child sessions（幂等，已连接时直接返回能力）。
pub fn prepare(app: &AppHandle) -> Result<CloneCapability, String> {
    ensure_running()?;
    let _guard = lock_lifecycle();
    prepare_locked(app)
}

fn prepare_locked(app: &AppHandle) -> Result<CloneCapability, String> {
    let manager = manager(app);
    ensure_not_busy(&manager)?;
    let capability = manager.capability();
    if !capability.supported {
        return Err(capability
            .reason
            .clone()
            .unwrap_or_else(|| "当前系统不支持桌面分身".to_string()));
    }
    if matches!(
        manager.state(),
        CloneState::Connected | CloneState::Connecting | CloneState::Preparing
    ) {
        return Ok(capability);
    }

    bump_generation();
    advance(app, CloneState::Preparing)?;
    match session::prepare() {
        Ok(()) => {
            let capability = refresh_capability(app);
            advance(app, CloneState::Idle)?;
            Ok(capability)
        }
        Err(error) => {
            set_error_and_transition(app, CloneState::Error, "prepare-failed", &error);
            Err(error)
        }
    }
}

/// 连接子会话。空账号表示使用当前登录身份（自动登录）。
pub fn connect(app: &AppHandle, username: &str, password: &str) -> Result<(), String> {
    ensure_running()?;
    let _guard = lock_lifecycle();
    let manager = manager(app);
    ensure_not_busy(&manager)?;
    let capability = manager.capability();
    if !capability.supported {
        return Err(capability
            .reason
            .clone()
            .unwrap_or_else(|| "当前系统不支持桌面分身".to_string()));
    }
    if matches!(
        manager.state(),
        CloneState::Preparing | CloneState::Connecting | CloneState::Connected
    ) {
        return Err("桌面分身已连接或正在连接".to_string());
    }

    let explicit = session::resolve_identity(username);
    // 空账号 + 显式密码：回落到当前登录用户，绝不能把密码静默丢弃
    let identity = explicit
        .clone()
        .or_else(|| (!password.is_empty()).then(session::current_identity));

    if !password.is_empty() {
        let check = explicit.clone().unwrap_or_else(session::current_identity);
        session::precheck_credentials(&check, password).map_err(|failure| failure.to_string())?;
    }

    // 缓存仅供重连：记录本次实际使用的身份；SSO/自动登录时身份为空，重连仍走自动登录
    let (user, domain) = match &identity {
        Some(identity) => (identity.user.clone(), identity.domain.clone()),
        None => (String::new(), String::new()),
    };
    let secret = (!password.is_empty()).then(|| SecretString::from_text(password));
    manager.store_credentials(Credentials::new(
        user,
        domain,
        secret.as_ref().map(SecretString::duplicate),
    ));

    // close_session(false) 留下的会话作为 previous：新连接落到别的会话时注销旧的那个
    let previous_session = manager.session_id();
    let generation = bump_generation();
    let result = start_connect_locked(app, generation, identity, secret, previous_session);
    if result.is_err() {
        // 连接失败时不再保留凭据，并作废可能仍在主线程队列里的晚到闭包
        manager.clear_credentials();
        bump_generation();
    }
    result
}

/// 打开窗口并创建控件。`previous_session` 用于重连时对比旧子会话。
///
/// 调用方必须已持有生命周期锁并完成代次自增。
fn start_connect_locked(
    app: &AppHandle,
    generation: u64,
    identity: Option<session::Identity>,
    password: Option<SecretString>,
    previous_session: Option<u32>,
) -> Result<(), String> {
    let manager = manager(app);
    manager.set_error(None);
    if previous_session.is_none() {
        manager.set_session_id(None);
    }
    manager.set_previous_session(previous_session);
    if let Err(error) = advance(app, CloneState::Preparing) {
        set_error_and_transition(app, CloneState::Error, "state", &error);
        return Err(error);
    }

    if let Err(error) = session::prepare() {
        set_error_and_transition(app, CloneState::Error, "prepare-failed", &error);
        return Err(error);
    }

    let options = manager.options();
    let geometry = settings::geometry_for(&manager.settings_copy(), options.small_window);
    if let Err(error) = viewer::open_window(app, &options, Some(&geometry), generation) {
        set_error_and_transition(app, CloneState::Error, "window-failed", &error);
        return Err(error);
    }

    if let Err(error) = advance(app, CloneState::Connecting) {
        set_error_and_transition(app, CloneState::Error, "state", &error);
        return Err(error);
    }
    let credentials =
        identity.map(|identity| Credentials::new(identity.user, identity.domain, password));
    let chrome_height = manager.chrome_height();
    if let Err(error) = rdp_host::connect(app, credentials, &options, chrome_height, generation) {
        rdp_host::clear_control_password(app);
        set_error_and_transition(app, CloneState::Error, "connect-failed", &error);
        return Err(error);
    }

    publish(app);
    // 宿主按 WS_VISIBLE 创建：连接完成前先藏起来，让网页的进度/凭据层可见
    sync_host_visibility(app);
    Ok(())
}

/// 断开控件连接，保留子会话。
pub fn disconnect(app: &AppHandle) -> Result<(), String> {
    ensure_running()?;
    let manager = manager(app);
    if manager.state() == CloneState::Closing {
        return Err("正在结束会话，请稍候".to_string());
    }
    // 与 connect/reconnect/close 串行，避免关闭过程中再调用 COM
    let _guard = LIFECYCLE
        .try_lock()
        .map_err(|_| "另一个桌面分身操作正在进行，请稍候".to_string())?;
    let generation = current_generation();
    input::release(app);
    if !rdp_host::is_present() {
        return Ok(());
    }
    rdp_host::disconnect(app, generation)?;
    rdp_host::clear_control_password(app);
    transition(app, CloneState::Disconnected);
    Ok(())
}

/// 关闭会话：断开、按需注销子会话、销毁宿主并回到 idle。
///
/// `logoff=false` 时保留会话 ID 与持久化标记（凭据清空），窗口销毁/退出/下次启动仍能追踪该会话。
pub fn close_session(app: &AppHandle, logoff: bool) -> Result<(), String> {
    ensure_running()?;
    let _guard = lock_lifecycle();
    let manager = manager(app);
    ensure_not_busy(&manager)?;
    // 进入 Closing 前记录：连接中/已连接时当前 child session 必定是本控件创建的
    let active_session = counts_as_active(manager.state());
    bump_generation();
    let generation = current_generation();
    advance(app, CloneState::Closing)?;
    input::release(app);
    let _ = rdp_host::disconnect(app, generation);
    std::thread::sleep(DISCONNECT_SETTLE);
    rdp_host::destroy(app, generation);
    launcher::cleanup_all();
    manager.clear_credentials();
    manager.set_previous_session(None);

    if logoff {
        let mut logoff_failure = None;
        match owned_or_active_child_session_id(&manager, active_session) {
            Some(session_id) => match session::logoff_child_session(session_id) {
                Ok(()) => {
                    manager.set_session_id(None);
                    manager.update_settings(|settings| settings.active_session_id = None);
                }
                Err(error) => {
                    // 注销失败：保留 id 与标记，交给窗口销毁/shutdown/下次启动重试
                    eprintln!("[desktop-clone] {error}");
                    logoff_failure = Some(error);
                }
            },
            None => {
                manager.set_session_id(None);
                manager.update_settings(|settings| settings.active_session_id = None);
            }
        }
        persist_settings(app);
        settle_resting_state(app);
        // 失败必须回报给前端：否则关窗确认会被再次拦截，形成无法关掉窗口的循环
        if let Some(error) = logoff_failure {
            return Err(error);
        }
        return Ok(());
    }

    // 取消连接（logoff=false）：登录已完成但回写 ID 之前取消时，会话会变成孤儿。
    // 此时立刻查询并记录子会话 ID，交给窗口销毁/shutdown/下次启动清理。
    if active_session
        && manager.session_id().is_none()
        && manager.settings_copy().active_session_id.is_none()
    {
        if let Some(session_id) = await_child_session_id() {
            manager.set_session_id(Some(session_id));
            manager.update_settings(|settings| settings.active_session_id = Some(session_id));
            println!("[desktop-clone] 取消连接时记录子会话 {session_id} 以便后续清理");
        }
    }
    persist_settings(app);
    settle_resting_state(app);
    Ok(())
}

/// 取消连接时短轮询当前子会话 ID（控件创建会话与查询之间存在延迟）。
fn await_child_session_id() -> Option<u32> {
    for _ in 0..CANCEL_LOOKUP_ATTEMPTS {
        if let Some(session_id) = session::active_child_session_id() {
            return Some(session_id);
        }
        std::thread::sleep(CANCEL_LOOKUP_INTERVAL);
    }
    session::active_child_session_id()
}

/// 重建控件并用内存中的凭据重新连接（热键路由 / 静音变更后使用）。
pub fn reconnect(app: &AppHandle) -> Result<(), String> {
    ensure_running()?;
    let _guard = lock_lifecycle();
    let manager = manager(app);
    ensure_not_busy(&manager)?;
    let generation = bump_generation();
    let previous_session = manager.session_id();
    input::release(app);
    if rdp_host::is_present() {
        let _ = rdp_host::disconnect(app, generation);
        rdp_host::clear_control_password(app);
        std::thread::sleep(DISCONNECT_SETTLE);
        rdp_host::destroy(app, generation);
    }
    if matches!(
        manager.state(),
        CloneState::Preparing
            | CloneState::Connecting
            | CloneState::Connected
            | CloneState::AwaitingCredentials
    ) {
        advance(app, CloneState::Disconnected)?;
    }

    let Some(cached) = manager.credentials_snapshot() else {
        manager.set_error(Some(CloneError::new(
            "credentials-required",
            "会话已断开，请重新输入账号密码",
        )));
        advance(app, CloneState::AwaitingCredentials)?;
        emit_credentials_required(app);
        return Ok(());
    };

    let identity = (!cached.user.is_empty()).then(|| session::Identity {
        user: cached.user.clone(),
        domain: cached.domain.clone(),
    });
    let result = start_connect_locked(
        app,
        generation,
        identity,
        cached.password_copy(),
        previous_session,
    );
    if result.is_err() {
        // 重连失败：保留凭据以便再次重试，但必须作废晚到的闭包
        bump_generation();
    }
    result
}

fn emit_credentials_required(app: &AppHandle) {
    let _ = app.emit_to(
        WINDOW_LABEL,
        EVENT_CREDENTIALS_REQUIRED,
        serde_json::json!({ "usernameHint": session::default_username_hint() }),
    );
}

/// 隐藏窗口，保留会话与程序。
pub fn hide(app: &AppHandle) -> Result<(), String> {
    input::set_window_focused(app, false);
    let window = app
        .get_webview_window(WINDOW_LABEL)
        .ok_or_else(|| "克隆窗口未创建".to_string())?;
    window
        .hide()
        .map_err(|error| format!("隐藏克隆窗口失败: {error}"))
}

/// 在子会话内执行系统热键（`switch-window` / `show-desktop` / `task-manager`）。
pub fn send_keys(app: &AppHandle, action: &str) -> Result<String, String> {
    input::send_keys(app, action)
}

/// 把控制中心配置的程序投送到当前子会话，返回任务名。
pub fn launch_program(app: &AppHandle, id: &str) -> Result<String, String> {
    ensure_running()?;
    let manager = manager(app);
    ensure_not_busy(&manager)?;
    let program = manager
        .options()
        .programs
        .into_iter()
        .find(|program| program.id == id)
        .ok_or_else(|| format!("未找到程序配置：{id}"))?;
    // 只投送到本应用拥有的会话；已连接时允许取当前 child session
    let session_id =
        owned_or_active_child_session_id(&manager, manager.state() == CloneState::Connected)
            .ok_or_else(|| "子会话尚未就绪，无法投送程序".to_string())?;
    launcher::launch(&program, session_id)
}

/// 应用选项：持久化并应用全部交互字段。
pub fn apply_options(app: &AppHandle, options: CloneOptions) -> Result<CloneOptions, String> {
    ensure_running()?;
    // 设置页与控制中心可能同时提交完整选项对象：串行化读改写与副作用
    let _guard = OPTIONS.lock().unwrap_or_else(|error| error.into_inner());
    let manager = manager(app);
    let previous = manager.options();
    let mut options = options;
    manager.set_options(options.clone());
    manager.update_settings(|settings| settings.options = options.clone());
    persist_settings(app);

    if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
        window
            .set_always_on_top(options.always_on_top)
            .map_err(|error| format!("设置置顶失败: {error}"))?;
        // tao 在置顶/显示时会重设 GWL_STYLE：重新补齐顶层样式并重排
        viewer::refresh_window_layout(app);
    }
    if rdp_host::is_present() {
        if previous.smart_sizing != options.smart_sizing {
            let _ = rdp_host::set_smart_sizing(app, options.smart_sizing);
        }
        if previous.mouse_mode != options.mouse_mode {
            let game = options.mouse_mode == MouseMode::Game;
            if let Err(error) = rdp_host::set_relative_mouse_mode(app, game) {
                // 控件不支持相对鼠标：把选项回写成普通模式，避免界面与控件实际模式不一致
                eprintln!("[desktop-clone] 切换鼠标模式失败（降级为普通模式）: {error}");
                options.mouse_mode = MouseMode::Normal;
                manager.set_options(options.clone());
                manager.update_settings(|settings| settings.options = options.clone());
                persist_settings(app);
                let _ = app.emit_to(
                    WINDOW_LABEL,
                    EVENT_MOUSE_MODE_CHANGED,
                    serde_json::json!({ "relative": false, "degraded": error }),
                );
            }
        }
    }

    if previous.small_window != options.small_window {
        if let Err(error) =
            viewer::apply_small_window(app, previous.small_window, options.small_window)
        {
            eprintln!("[desktop-clone] 切换小窗失败: {error}");
        }
    }

    let reconnect_reason = if previous.keyboard_hook != options.keyboard_hook {
        Some("keyboard-hook")
    } else if previous.muted != options.muted {
        Some("mute")
    } else {
        None
    };
    if let Some(reason) = reconnect_reason {
        if matches!(
            manager.state(),
            CloneState::Connected | CloneState::Connecting
        ) {
            let _ = app.emit_to(
                WINDOW_LABEL,
                EVENT_RECONNECT_REQUIRED,
                serde_json::json!({ "reason": reason }),
            );
        }
    }

    input::sync(app);
    publish(app);
    Ok(options)
}

/// 记录控件侧被临时改写的热键路由，让界面与控件实际状态保持一致。
pub(crate) fn note_keyboard_hook(app: &AppHandle, mode: KeyboardHook) {
    // 与设置页/控制中心的整份选项提交串行，避免互相覆盖
    let _guard = OPTIONS.lock().unwrap_or_else(|error| error.into_inner());
    let manager = manager(app);
    let mut options = manager.options();
    if options.keyboard_hook == mode {
        return;
    }
    options.keyboard_hook = mode;
    manager.set_options(options.clone());
    manager.update_settings(|settings| settings.options = options);
    persist_settings(app);
    publish(app);
}

/// 关闭窗口的拦截判定；需要确认时向窗口发送 `close-requested`。
pub fn intercept_close(app: &AppHandle) -> bool {
    let manager = manager(app);
    let required =
        viewer::requires_close_confirmation(manager.state(), manager.has_tracked_session());
    if required {
        viewer::emit_close_requested(app);
    }
    required
}

/// 窗口销毁后释放宿主与子会话，恢复静止状态。
pub fn handle_window_destroyed(app: &AppHandle) {
    bump_generation();
    let generation = current_generation();
    input::release(app);
    rdp_host::destroy(app, generation);
    // Task Scheduler 调用最长等 20s：窗口销毁事件在主线程，不能同步阻塞界面
    std::thread::spawn(launcher::cleanup_all);
    let manager = manager(app);
    manager.clear_credentials();
    manager.set_previous_session(None);
    manager.set_overlay_visible(false);

    // close_session(false) 或注销失败留下的会话：保留内存 id 与标记，交给 shutdown/下次启动
    let state = manager.state();
    let keep_session = state == CloneState::Idle && manager.session_id().is_some();
    if keep_session {
        settle_resting_state(app);
        persist_settings(app);
        return;
    }

    match owned_or_active_child_session_id(&manager, counts_as_active(state)) {
        Some(session_id) => match session::logoff_child_session(session_id) {
            Ok(()) => {
                manager.set_session_id(None);
                manager.update_settings(|settings| settings.active_session_id = None);
            }
            Err(error) => {
                // 注销失败：保留标记（内存 id 清空），下次启动继续清理
                eprintln!("[desktop-clone] {error}");
                manager.set_session_id(None);
            }
        },
        None => {
            manager.set_session_id(None);
            manager.update_settings(|settings| settings.active_session_id = None);
        }
    }
    persist_settings(app);
    settle_resting_state(app);
}

/// 控件事件入口（主线程，来自事件槽）。
pub fn handle_rdp_event(app: &AppHandle, event: RdpEvent) {
    // 鼠标模式事件不代表登录进展，不参与宽限期判定
    let sequence = if matches!(event, RdpEvent::MouseInputMode(_)) {
        EVENT_SEQUENCE.load(Ordering::SeqCst)
    } else {
        EVENT_SEQUENCE.fetch_add(1, Ordering::SeqCst) + 1
    };
    match event {
        RdpEvent::Connecting => {
            transition(app, CloneState::Connecting);
        }
        RdpEvent::Connected => {
            manager(app).set_error(None);
            transition(app, CloneState::Connected);
        }
        RdpEvent::LoginComplete => {
            manager(app).set_error(None);
            transition(app, CloneState::Connected);
            rdp_host::reset_control_password(app);
            spawn_session_lookup(app.clone(), current_generation());
        }
        RdpEvent::LogonError(code) => {
            // -2 = 先试 SSO 失败，随后可能用显式口令成功；其他代码同样先挂宽限期，
            // 期间出现任何进展事件就交给后续事件处理，否则按终态推进。
            let message = if code == -2 {
                "登录未完成（SSO 失败，且没有可用的显式凭据）".to_string()
            } else {
                format!("登录失败（代码 {code}）")
            };
            arm_logon_error_grace(app, sequence, code, &message);
        }
        RdpEvent::Disconnected(reason) => {
            // 断开即代表控件内的口令不再需要
            rdp_host::clear_control_password(app);
            if reason == 1 {
                transition(app, CloneState::Disconnected);
            } else if reason == 2055 {
                let manager = manager(app);
                // 缓存的凭据已不可用，清空后交由前端重新输入
                manager.clear_credentials();
                manager.set_error(Some(CloneError::new(
                    "credentials-required",
                    "子会话登录未完成，请重新输入账号密码",
                )));
                transition(app, CloneState::AwaitingCredentials);
                emit_credentials_required(app);
            } else {
                set_error_and_transition(
                    app,
                    CloneState::Error,
                    "disconnected",
                    &format!("连接已断开（原因码 {reason}）"),
                );
            }
        }
        RdpEvent::FatalError(code) => {
            rdp_host::clear_control_password(app);
            set_error_and_transition(
                app,
                CloneState::Error,
                "fatal",
                &format!("远程桌面控件发生致命错误（{code}）"),
            );
        }
        RdpEvent::ConfirmClose => {
            // 控件请求关闭：接入统一确认流程，由前端决定隐藏/注销/取消
            let manager = manager(app);
            if viewer::requires_close_confirmation(manager.state(), manager.has_tracked_session()) {
                viewer::emit_close_requested(app);
            }
        }
        RdpEvent::MouseInputMode(relative) => {
            let _ = app.emit_to(
                WINDOW_LABEL,
                EVENT_MOUSE_MODE_CHANGED,
                serde_json::json!({ "relative": relative }),
            );
        }
    }
    input::sync(app);
}

/// 为登录错误挂宽限期：期间没有新的控件事件（仍停在 connecting）就落到终态。
///
/// `-2` 不是终态，超时后回到等待凭据；其他代码落到 error。两条路径都会清掉控件里的口令。
fn arm_logon_error_grace(app: &AppHandle, sequence: u64, code: i32, message: &str) {
    if code != -2 {
        manager(app).set_error(Some(CloneError::new("logon-error", message)));
        publish(app);
    }
    let handle = app.clone();
    let generation = current_generation();
    let message = message.to_string();
    std::thread::spawn(move || {
        std::thread::sleep(LOGON_ERROR_GRACE);
        if !is_current_generation(generation) {
            return;
        }
        // 宽限期内出现新事件说明连接仍在推进（例如 -2 之后用显式口令登录成功）
        if EVENT_SEQUENCE.load(Ordering::SeqCst) != sequence {
            return;
        }
        if manager(&handle).state() != CloneState::Connecting {
            return;
        }
        rdp_host::clear_control_password(&handle);
        if code == -2 {
            let manager = manager(&handle);
            manager.clear_credentials();
            set_error_and_transition(
                &handle,
                CloneState::AwaitingCredentials,
                "credentials-required",
                &message,
            );
            emit_credentials_required(&handle);
        } else {
            set_error_and_transition(&handle, CloneState::Error, "logon-error", &message);
        }
    });
}

/// 登录完成后在后台轮询子会话 ID，并记录孤儿清理标记。
///
/// `generation` 为发起登录的连接代次：关闭/重连后晚到的轮询不再写回状态与标记。
fn spawn_session_lookup(app: AppHandle, generation: u64) {
    std::thread::spawn(move || {
        for _ in 0..10 {
            if !is_current_generation(generation) {
                return;
            }
            if let Some(session_id) = session::active_child_session_id() {
                let manager = manager(&app);
                if manager.state() != CloneState::Connected {
                    return;
                }
                manager.set_session_id(Some(session_id));
                manager.update_settings(|settings| settings.active_session_id = Some(session_id));
                persist_settings(&app);
                publish(&app);
                // 重连落到新的子会话时注销旧会话（同一个则跳过）
                if let Some(previous) = manager.take_previous_session() {
                    if previous != session_id {
                        if let Err(error) = session::logoff_child_session(previous) {
                            eprintln!("[desktop-clone] 注销旧子会话 {previous}: {error}");
                        }
                    }
                }
                return;
            }
            std::thread::sleep(Duration::from_millis(300));
        }
        eprintln!("[desktop-clone] 登录完成但未能获取子会话 ID");
    });
}

/// 托盘入口：窗口存在则聚焦，否则按保存的几何打开。
pub fn open_from_tray(app: &AppHandle) {
    if viewer::focus_window(app) {
        publish(app);
        return;
    }
    if let Err(error) = open(app) {
        eprintln!("[desktop-clone] 打开窗口失败: {error}");
    }
}

/// 诊断报告（多行文本，不含任何凭据）。
pub fn diagnose(app: &AppHandle) -> String {
    let status = status(app);
    let capability = &status.capability;
    let mut lines = Vec::new();
    lines.push("桌面分身诊断".to_string());
    lines.push(format!("状态: {:?}", status.state));
    lines.push(format!(
        "支持: {}（{}）",
        if capability.supported { "是" } else { "否" },
        capability
            .reason
            .clone()
            .unwrap_or_else(|| "无".to_string())
    ));
    lines.push(format!(
        "系统: {} {} build {}",
        capability.edition_id, capability.product_name, capability.build
    ));
    lines.push(format!("显示版本: {}", capability.display_version));
    lines.push(format!("管理员: {}", capability.elevated));
    lines.push(format!(
        "TermService 运行: {}",
        capability.term_service_running
    ));
    lines.push(format!(
        "child sessions 已启用: {}",
        capability.child_sessions_enabled
    ));
    lines.push(format!(
        "活动子会话: {}",
        capability
            .active_child_session_id
            .map(|id| id.to_string())
            .unwrap_or_else(|| "无".to_string())
    ));
    lines.push(format!(
        "atl.dll: {}，mstscax.dll: {}",
        capability.atl_available, capability.activex_available
    ));
    lines.push(format!(
        "远程桌面被禁用(fDenyTSConnections): {}",
        capability.remote_desktop_denied
    ));
    lines.push(format!(
        "会话 ID: {}",
        status
            .session_id
            .map(|id| id.to_string())
            .unwrap_or_else(|| "无".to_string())
    ));
    lines.push(rdp_host::diagnostics(app));
    lines.push(viewer::diagnostics());
    lines.push(input::diagnostics());
    lines.push(launcher::diagnostics());
    lines.push(format!(
        "鼠标模式: {:?}，热键路由: {:?}，静音: {}，小窗: {:?}，16:9 锁定: {}",
        status.options.mouse_mode,
        status.options.keyboard_hook,
        status.options.muted,
        status.options.small_window,
        status.options.aspect_lock
    ));
    lines.push(format!(
        "最近错误: {}",
        status
            .error
            .as_ref()
            .map(|error| format!("{}（{}）", error.message, error.code))
            .unwrap_or_else(|| "无".to_string())
    ));
    match settings::path(app) {
        Ok(path) => lines.push(format!("设置文件: {}", path.display())),
        Err(error) => lines.push(format!("设置文件: 不可用（{error}）")),
    }
    lines.push("会话列表:".to_string());
    for entry in session::enumerate_sessions() {
        if session::is_listen_session(&entry) {
            continue;
        }
        lines.push(format!(
            "  id={} station={:?} state={}",
            entry.id, entry.station, entry.state
        ));
    }
    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;
    use CloneState::*;

    #[test]
    fn happy_path_transitions_are_allowed() {
        let path = [
            Idle,
            Preparing,
            Connecting,
            Connected,
            Disconnected,
            Preparing,
        ];
        for pair in path.windows(2) {
            assert!(
                can_transition(pair[0], pair[1]),
                "{:?} -> {:?}",
                pair[0],
                pair[1]
            );
        }
    }

    #[test]
    fn error_and_closing_are_reachable() {
        for state in [
            Idle,
            Preparing,
            Connecting,
            Connected,
            Disconnected,
            AwaitingCredentials,
        ] {
            assert!(can_transition(state, Error), "{state:?}");
            assert!(can_transition(state, Closing), "{state:?}");
        }
    }

    #[test]
    fn illegal_transitions_are_rejected() {
        assert!(!can_transition(Connected, Connecting));
        assert!(!can_transition(Connected, Preparing));
        assert!(!can_transition(Idle, Connected));
        assert!(!can_transition(Unsupported, Connected));
        assert!(!can_transition(Unsupported, Error));
        assert!(!can_transition(Closing, Connected));
    }

    #[test]
    fn unsupported_only_recovers_to_idle() {
        assert!(can_transition(Unsupported, Idle));
        assert!(!can_transition(Unsupported, Preparing));
    }

    #[test]
    fn disconnected_can_ask_for_credentials() {
        assert!(can_transition(Disconnected, AwaitingCredentials));
        assert!(can_transition(Error, AwaitingCredentials));
        assert!(!can_transition(Closing, AwaitingCredentials));
    }

    #[test]
    fn self_transitions_are_noops() {
        for state in [
            Unsupported,
            Idle,
            Preparing,
            AwaitingCredentials,
            Connecting,
            Connected,
            Disconnected,
            Error,
            Closing,
        ] {
            assert!(can_transition(state, state));
        }
    }

    #[test]
    fn status_json_matches_frontend_contract() {
        let status = CloneStatus {
            state: CloneState::Idle,
            capability: CloneCapability {
                supported: true,
                reason: None,
                edition_id: "Professional".into(),
                product_name: String::new(),
                build: 28000,
                display_version: String::new(),
                elevated: true,
                child_sessions_enabled: true,
                term_service_running: true,
                remote_desktop_denied: false,
                active_child_session_id: None,
                activex_available: true,
                atl_available: true,
            },
            session_id: None,
            error: Some(CloneError::new("code", "message")),
            options: CloneOptions::default(),
            chrome_height: DEFAULT_CHROME_HEIGHT,
            overlay_visible: false,
        };
        let json = serde_json::to_value(&status).unwrap();
        for key in [
            "state",
            "capability",
            "sessionId",
            "error",
            "options",
            "chromeHeight",
            "overlayVisible",
        ] {
            assert!(json.get(key).is_some(), "缺少字段 {key}");
        }
    }

    #[test]
    fn awaiting_credentials_can_still_complete() {
        // -2 宽限期落到等待凭据后，连接仍可能自行完成
        assert!(can_transition(AwaitingCredentials, Connected));
    }

    #[test]
    fn retry_after_2055_can_connect_again() {
        // 2055 后重新输入凭据重试：等待凭据 → 准备 → 连接 → 已连接
        let path = [AwaitingCredentials, Preparing, Connecting, Connected];
        for pair in path.windows(2) {
            assert!(can_transition(pair[0], pair[1]), "{:?}", pair);
        }
        // 失败重试同样从 error 重新开始
        assert!(can_transition(Error, Preparing));
        assert!(can_transition(Error, Connecting));
    }

    #[test]
    fn live_states_trust_the_in_memory_session_id() {
        for state in [Connecting, Connected, Closing] {
            assert_eq!(
                trusted_session_id(state, Some(9), None, Some(4)),
                Some(9),
                "{state:?}"
            );
        }
        // 连接中但内存 ID 还没写回时，只接受与标记一致的当前子会话
        assert_eq!(
            trusted_session_id(Connected, None, Some(4), Some(4)),
            Some(4)
        );
        assert_eq!(trusted_session_id(Connected, None, None, Some(4)), None);
    }

    #[test]
    fn resting_states_never_trust_a_recycled_session_id() {
        // 外部已结束会话、ID 被系统复用：旧内存 ID 绝不能用于注销/投送
        assert_eq!(trusted_session_id(Idle, Some(4), None, Some(7)), None);
        assert_eq!(trusted_session_id(Error, Some(4), Some(4), Some(7)), None);
        assert_eq!(trusted_session_id(Disconnected, Some(4), None, None), None);
        // 记录与当前子会话一致时才认可
        assert_eq!(trusted_session_id(Idle, Some(7), None, Some(7)), Some(7));
        assert_eq!(
            trusted_session_id(Disconnected, None, Some(7), Some(7)),
            Some(7)
        );
    }

    #[test]
    fn overlay_only_hides_the_host_when_it_should_be_visible() {
        assert!(!host_should_be_visible(Connected, true));
        assert!(host_should_be_visible(Connected, false));
        for state in [Idle, Preparing, Connecting, Disconnected, Error, Closing] {
            assert!(!host_should_be_visible(state, false), "{state:?}");
        }
    }

    #[test]
    fn state_serializes_as_kebab_case() {
        assert_eq!(
            serde_json::to_string(&CloneState::AwaitingCredentials).unwrap(),
            "\"awaiting-credentials\""
        );
        assert_eq!(
            serde_json::to_string(&CloneState::Disconnected).unwrap(),
            "\"disconnected\""
        );
    }
}
