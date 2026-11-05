//! 桌面分身设置持久化：`options` / `geometry.normal` / `activeSessionId`，原子写 JSON。

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

/// 所有写入串行化：几何防抖线程、命令层与退出清理可能并发落盘。
static SAVE_LOCK: Mutex<()> = Mutex::new(());
/// 唯一临时文件名序号，避免并发写同一个临时文件。
static SAVE_SEQUENCE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);

pub const SETTINGS_FILE: &str = "desktop-clone.json";
pub const SETTINGS_VERSION: u32 = 1;

/// 克隆窗口最小逻辑尺寸（与窗口构建参数保持一致）。
///
/// 低于 16:9 视口所需高度是允许的：画面按 letterbox 收缩，不会被非等比拉伸。
pub const MIN_WINDOW_WIDTH: f64 = 500.0;
pub const MIN_WINDOW_HEIGHT: f64 = 281.0;
/// 标题栏逻辑高度（与前端 `h-11` 一致）：比例锁定与预设都要在视口之外加回这段。
pub const TITLE_BAR_HEIGHT: f64 = 44.0;
/// 克隆窗口默认逻辑尺寸：视口 1280×720 + 标题栏。
pub const DEFAULT_WINDOW_WIDTH: f64 = 1280.0;
pub const DEFAULT_WINDOW_HEIGHT: f64 = 720.0 + TITLE_BAR_HEIGHT;
/// 小窗预设的窗口尺寸：画面尺寸（500×281 / 1280×720）+ 标题栏。
pub const SMALL_500_WIDTH: f64 = 500.0;
pub const SMALL_500_HEIGHT: f64 = 281.0 + TITLE_BAR_HEIGHT;
pub const SMALL_1280_WIDTH: f64 = 1280.0;
pub const SMALL_1280_HEIGHT: f64 = 720.0 + TITLE_BAR_HEIGHT;
/// 远程桌面视口固定 16:9。
pub const ASPECT_WIDTH: f64 = 16.0;
pub const ASPECT_HEIGHT: f64 = 9.0;

/// 小窗预设。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub enum SmallWindowMode {
    #[default]
    #[serde(rename = "off")]
    Off,
    #[serde(rename = "500")]
    Width500,
    #[serde(rename = "1280")]
    Width1280,
}

impl SmallWindowMode {
    /// 预设逻辑尺寸；普通模式无固定尺寸。
    pub fn preset_size(self) -> Option<(f64, f64)> {
        match self {
            SmallWindowMode::Off => None,
            SmallWindowMode::Width500 => Some((SMALL_500_WIDTH, SMALL_500_HEIGHT)),
            SmallWindowMode::Width1280 => Some((SMALL_1280_WIDTH, SMALL_1280_HEIGHT)),
        }
    }
}

/// 系统热键路由目标：本机或子会话。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum KeyboardHook {
    #[default]
    Local,
    Remote,
}

/// 鼠标模式：普通或相对（游戏）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum MouseMode {
    #[default]
    Normal,
    Game,
}

/// 控制中心里可由用户配置、投送到子会话的程序（u2 使用）。
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CloneProgram {
    pub id: String,
    pub name: String,
    pub path: String,
    pub args: String,
    pub elevated: bool,
}

/// 克隆窗口选项。u1 只应用 `alwaysOnTop` / `smartSizing`，其余字段原样持久化。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CloneOptions {
    pub always_on_top: bool,
    pub smart_sizing: bool,
    pub aspect_lock: bool,
    pub small_window: SmallWindowMode,
    pub keyboard_hook: KeyboardHook,
    pub mouse_mode: MouseMode,
    pub muted: bool,
    pub programs: Vec<CloneProgram>,
}

impl Default for CloneOptions {
    fn default() -> Self {
        Self {
            always_on_top: false,
            smart_sizing: true,
            aspect_lock: true,
            small_window: SmallWindowMode::Off,
            keyboard_hook: KeyboardHook::Local,
            mouse_mode: MouseMode::Normal,
            muted: false,
            programs: Vec::new(),
        }
    }
}

/// 克隆窗口几何（逻辑像素）。
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CloneGeometry {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl Default for CloneGeometry {
    fn default() -> Self {
        Self {
            x: 120.0,
            y: 80.0,
            width: DEFAULT_WINDOW_WIDTH,
            height: DEFAULT_WINDOW_HEIGHT,
        }
    }
}

/// 几何集合：普通模式与小窗各自记忆位置/尺寸。
#[derive(Debug, Clone, Copy, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CloneGeometrySet {
    pub normal: CloneGeometry,
    pub small500: Option<CloneGeometry>,
    pub small1280: Option<CloneGeometry>,
}

impl CloneGeometrySet {
    pub fn get(&self, mode: SmallWindowMode) -> Option<CloneGeometry> {
        match mode {
            SmallWindowMode::Off => Some(self.normal),
            SmallWindowMode::Width500 => self.small500,
            SmallWindowMode::Width1280 => self.small1280,
        }
    }

    pub fn set(&mut self, mode: SmallWindowMode, geometry: CloneGeometry) {
        match mode {
            SmallWindowMode::Off => self.normal = geometry,
            SmallWindowMode::Width500 => self.small500 = Some(geometry),
            SmallWindowMode::Width1280 => self.small1280 = Some(geometry),
        }
    }
}

/// 落盘设置。绝不包含凭据字段。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct DesktopCloneSettings {
    pub version: u32,
    pub options: CloneOptions,
    pub geometry: CloneGeometrySet,
    /// 当前由本应用创建的子会话 ID；用于启动/退出时的孤儿清理。
    pub active_session_id: Option<u32>,
}

impl Default for DesktopCloneSettings {
    fn default() -> Self {
        Self {
            version: SETTINGS_VERSION,
            options: CloneOptions::default(),
            geometry: CloneGeometrySet::default(),
            active_session_id: None,
        }
    }
}

impl DesktopCloneSettings {
    /// 修正越界几何，保持窗口可用；小窗槽位按各自预设尺寸兜底。
    pub fn normalize(&mut self) {
        normalize_geometry(
            &mut self.geometry.normal,
            MIN_WINDOW_WIDTH,
            MIN_WINDOW_HEIGHT,
            DEFAULT_WINDOW_WIDTH,
            DEFAULT_WINDOW_HEIGHT,
        );
        for (slot, preset) in [
            (
                &mut self.geometry.small500,
                (SMALL_500_WIDTH, SMALL_500_HEIGHT),
            ),
            (
                &mut self.geometry.small1280,
                (SMALL_1280_WIDTH, SMALL_1280_HEIGHT),
            ),
        ] {
            if let Some(geometry) = slot {
                normalize_geometry(geometry, preset.0, preset.1, preset.0, preset.1);
            }
        }
    }
}

fn normalize_geometry(
    geometry: &mut CloneGeometry,
    min_width: f64,
    min_height: f64,
    fallback_width: f64,
    fallback_height: f64,
) {
    if !geometry.width.is_finite() || geometry.width < min_width {
        geometry.width = fallback_width;
    }
    if !geometry.height.is_finite() || geometry.height < min_height {
        geometry.height = fallback_height;
    }
    if !geometry.x.is_finite() {
        geometry.x = CloneGeometry::default().x;
    }
    if !geometry.y.is_finite() {
        geometry.y = CloneGeometry::default().y;
    }
}

/// 打开窗口时使用的几何：优先该模式的记忆值，其次以普通模式位置套用预设尺寸。
pub fn geometry_for(settings: &DesktopCloneSettings, mode: SmallWindowMode) -> CloneGeometry {
    if let Some(geometry) = settings.geometry.get(mode) {
        return geometry;
    }
    let base = settings.geometry.normal;
    match mode.preset_size() {
        Some((width, height)) => CloneGeometry {
            width,
            height,
            ..base
        },
        None => base,
    }
}

/// 16:9 目标高度：按宽度推导并夹在最小高度之上，避免与窗口最小尺寸互相拉扯。
pub fn aspect_height(width: f64, min_height: f64) -> f64 {
    if !width.is_finite() || width <= 0.0 {
        return min_height;
    }
    (width * ASPECT_HEIGHT / ASPECT_WIDTH)
        .round()
        .max(min_height)
}

/// 尺寸差异超过 1 像素才需要校正，避免亚像素抖动触发递归。
pub fn needs_aspect_correction(width: f64, height: f64, min_height: f64) -> bool {
    (aspect_height(width, min_height) - height).abs() > 1.0
}

/// 视口 16:9 + 标题栏的整窗高度（比例锁定的目标值）。
pub fn window_aspect_height(width: f64, chrome: f64, min_height: f64) -> f64 {
    let chrome = chrome.max(0.0);
    aspect_height(width, (min_height - chrome).max(0.0)) + chrome
}

/// 整窗尺寸是否偏离「视口 16:9 + 标题栏」超过 1 像素。
pub fn needs_window_aspect_correction(
    width: f64,
    height: f64,
    chrome: f64,
    min_height: f64,
) -> bool {
    let chrome = chrome.max(0.0);
    needs_aspect_correction(width, height - chrome, (min_height - chrome).max(0.0))
}

/// 应用配置目录下的设置文件路径。
pub fn path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("获取配置目录失败: {error}"))?;
    Ok(dir.join(SETTINGS_FILE))
}

/// 读取设置；文件缺失或损坏时回落到默认值。
pub fn load_from(path: &Path) -> DesktopCloneSettings {
    let text = match std::fs::read_to_string(path) {
        Ok(text) => text,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return DesktopCloneSettings::default();
        }
        Err(error) => {
            eprintln!("[desktop-clone] 读取设置失败 {}: {error}", path.display());
            return DesktopCloneSettings::default();
        }
    };
    match serde_json::from_str::<DesktopCloneSettings>(&text) {
        Ok(mut settings) => {
            if settings.version > SETTINGS_VERSION {
                // 更高版本的文件不回写：先备份再按默认值启动，避免旧代码破坏新字段
                let backup = path.with_extension(format!("json.v{}.bak", settings.version));
                eprintln!(
                    "[desktop-clone] 设置文件版本 {} 高于当前支持版本 {}，已备份到 {}",
                    settings.version,
                    SETTINGS_VERSION,
                    backup.display()
                );
                let _ = std::fs::copy(path, &backup);
                return DesktopCloneSettings::default();
            }
            settings.version = SETTINGS_VERSION;
            settings.normalize();
            settings
        }
        Err(error) => {
            eprintln!("[desktop-clone] 解析设置失败 {}: {error}", path.display());
            DesktopCloneSettings::default()
        }
    }
}

/// 原子写入设置：先写唯一临时文件再 rename 覆盖；全程串行化。
pub fn save_to(path: &Path, settings: &DesktopCloneSettings) -> Result<(), String> {
    let _guard = SAVE_LOCK.lock().unwrap_or_else(|error| error.into_inner());
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|error| format!("创建配置目录失败: {error}"))?;
    }
    let text = serde_json::to_string_pretty(settings)
        .map_err(|error| format!("序列化设置失败: {error}"))?;
    let sequence = SAVE_SEQUENCE.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    let temp = path.with_extension(format!("json.{}.{}.tmp", std::process::id(), sequence));
    std::fs::write(&temp, text).map_err(|error| format!("写入设置临时文件失败: {error}"))?;
    std::fs::rename(&temp, path).map_err(|error| {
        let _ = std::fs::remove_file(&temp);
        format!("替换设置文件失败: {error}")
    })
}

/// 读取应用设置。
pub fn load(app: &AppHandle) -> DesktopCloneSettings {
    match path(app) {
        Ok(path) => load_from(&path),
        Err(error) => {
            eprintln!("[desktop-clone] {error}");
            DesktopCloneSettings::default()
        }
    }
}

/// 写入应用设置。
pub fn save(app: &AppHandle, settings: &DesktopCloneSettings) -> Result<(), String> {
    save_to(&path(app)?, settings)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> DesktopCloneSettings {
        DesktopCloneSettings {
            version: SETTINGS_VERSION,
            options: CloneOptions {
                always_on_top: true,
                smart_sizing: false,
                aspect_lock: false,
                small_window: SmallWindowMode::Width500,
                keyboard_hook: KeyboardHook::Remote,
                mouse_mode: MouseMode::Game,
                muted: true,
                programs: vec![CloneProgram {
                    id: "notepad".into(),
                    name: "记事本".into(),
                    path: r"C:\Windows\System32\notepad.exe".into(),
                    args: String::new(),
                    elevated: false,
                }],
            },
            geometry: CloneGeometrySet {
                normal: CloneGeometry {
                    x: 10.0,
                    y: 20.0,
                    width: 900.0,
                    height: 600.0,
                },
                small500: Some(CloneGeometry {
                    x: 30.0,
                    y: 40.0,
                    width: SMALL_500_WIDTH,
                    height: SMALL_500_HEIGHT,
                }),
                small1280: None,
            },
            active_session_id: Some(7),
        }
    }

    #[test]
    fn defaults_are_stable() {
        let options = CloneOptions::default();
        assert!(!options.always_on_top);
        assert!(options.smart_sizing);
        assert_eq!(options.small_window, SmallWindowMode::Off);
        assert_eq!(options.keyboard_hook, KeyboardHook::Local);
        assert_eq!(options.mouse_mode, MouseMode::Normal);
        assert!(!options.muted);
        assert!(options.programs.is_empty());

        let settings = DesktopCloneSettings::default();
        assert_eq!(settings.version, SETTINGS_VERSION);
        assert_eq!(settings.geometry.normal.width, DEFAULT_WINDOW_WIDTH);
        assert_eq!(settings.geometry.normal.height, DEFAULT_WINDOW_HEIGHT);
        assert!(settings.active_session_id.is_none());
    }

    #[test]
    fn serde_uses_camel_case_and_string_enums() {
        let text = serde_json::to_string(&sample()).unwrap();
        assert!(text.contains("\"alwaysOnTop\":true"));
        assert!(text.contains("\"smallWindow\":\"500\""));
        assert!(text.contains("\"keyboardHook\":\"remote\""));
        assert!(text.contains("\"mouseMode\":\"game\""));
        assert!(text.contains("\"activeSessionId\":7"));

        let parsed: DesktopCloneSettings = serde_json::from_str(&text).unwrap();
        assert_eq!(parsed, sample());
    }

    #[test]
    fn missing_fields_fall_back_to_defaults() {
        let parsed: DesktopCloneSettings = serde_json::from_str("{}").unwrap();
        assert_eq!(parsed, DesktopCloneSettings::default());
    }

    #[test]
    fn normalize_clamps_broken_geometry() {
        let mut settings = DesktopCloneSettings::default();
        settings.geometry.normal.width = 10.0;
        settings.geometry.normal.height = f64::NAN;
        settings.geometry.small500 = Some(CloneGeometry {
            x: f64::NAN,
            y: 10.0,
            width: 1.0,
            height: 1.0,
        });
        settings.normalize();
        assert_eq!(settings.geometry.normal.width, DEFAULT_WINDOW_WIDTH);
        assert_eq!(settings.geometry.normal.height, DEFAULT_WINDOW_HEIGHT);
        let small = settings.geometry.small500.unwrap();
        assert_eq!(small.width, SMALL_500_WIDTH);
        assert_eq!(small.height, SMALL_500_HEIGHT);
        assert_eq!(small.x, CloneGeometry::default().x);
    }

    #[test]
    fn geometry_slots_are_independent() {
        let mut set = CloneGeometrySet::default();
        let small = CloneGeometry {
            x: 5.0,
            y: 6.0,
            width: SMALL_500_WIDTH,
            height: SMALL_500_HEIGHT,
        };
        set.set(SmallWindowMode::Width500, small);
        assert_eq!(set.get(SmallWindowMode::Width500), Some(small));
        assert_eq!(set.get(SmallWindowMode::Width1280), None);
        assert_eq!(set.get(SmallWindowMode::Off), Some(set.normal));
    }

    #[test]
    fn geometry_for_falls_back_to_preset_at_normal_position() {
        let mut settings = DesktopCloneSettings::default();
        settings.geometry.normal.x = 40.0;
        settings.geometry.normal.y = 50.0;
        let geometry = geometry_for(&settings, SmallWindowMode::Width1280);
        assert_eq!(geometry.x, 40.0);
        assert_eq!(geometry.y, 50.0);
        assert_eq!(geometry.width, SMALL_1280_WIDTH);
        assert_eq!(geometry.height, SMALL_1280_HEIGHT);

        settings.geometry.small1280 = Some(CloneGeometry {
            x: 1.0,
            y: 2.0,
            width: 1280.0,
            height: 720.0,
        });
        assert_eq!(geometry_for(&settings, SmallWindowMode::Width1280).x, 1.0);
    }

    #[test]
    fn aspect_height_respects_minimum_and_rounds() {
        assert_eq!(aspect_height(1280.0, MIN_WINDOW_HEIGHT), 720.0);
        assert_eq!(aspect_height(500.0, MIN_WINDOW_HEIGHT), MIN_WINDOW_HEIGHT);
        assert_eq!(aspect_height(1000.0, MIN_WINDOW_HEIGHT), 563.0);
        assert_eq!(aspect_height(0.0, MIN_WINDOW_HEIGHT), MIN_WINDOW_HEIGHT);
        assert!(!needs_aspect_correction(1280.0, 720.0, MIN_WINDOW_HEIGHT));
        assert!(needs_aspect_correction(1280.0, 600.0, MIN_WINDOW_HEIGHT));
        assert!(!needs_aspect_correction(500.0, 281.0, MIN_WINDOW_HEIGHT));
    }

    #[test]
    fn window_aspect_height_accounts_for_title_bar() {
        assert_eq!(
            window_aspect_height(1280.0, TITLE_BAR_HEIGHT, MIN_WINDOW_HEIGHT),
            764.0
        );
        assert_eq!(
            window_aspect_height(500.0, TITLE_BAR_HEIGHT, MIN_WINDOW_HEIGHT),
            325.0
        );
        assert!(!needs_window_aspect_correction(
            1280.0,
            764.0,
            TITLE_BAR_HEIGHT,
            MIN_WINDOW_HEIGHT
        ));
        assert!(needs_window_aspect_correction(
            1280.0,
            720.0,
            TITLE_BAR_HEIGHT,
            MIN_WINDOW_HEIGHT
        ));
        // 标题栏尚未上报时退化为整窗 16:9
        assert_eq!(window_aspect_height(1280.0, 0.0, MIN_WINDOW_HEIGHT), 720.0);
        // 标题栏高于最小窗高时不产生负视口
        assert_eq!(window_aspect_height(0.0, 400.0, MIN_WINDOW_HEIGHT), 400.0);
    }

    #[test]
    fn presets_are_picture_size_plus_title_bar() {
        // 预设是画面尺寸（500×281 / 1280×720），窗口内高额外加标题栏
        assert_eq!(SMALL_500_HEIGHT, 281.0 + TITLE_BAR_HEIGHT);
        assert_eq!(SMALL_1280_HEIGHT, 720.0 + TITLE_BAR_HEIGHT);
        assert_eq!(
            SmallWindowMode::Width500.preset_size(),
            Some((SMALL_500_WIDTH, SMALL_500_HEIGHT))
        );
        assert_eq!(
            SmallWindowMode::Width1280.preset_size(),
            Some((SMALL_1280_WIDTH, SMALL_1280_HEIGHT))
        );
        // 预设仍高于最小尺寸（不会被系统夹高），且正好是 16:9 视口 + 标题栏
        assert!(SMALL_500_WIDTH >= MIN_WINDOW_WIDTH);
        assert!(SMALL_500_HEIGHT > MIN_WINDOW_HEIGHT);
        for (width, height) in [
            (SMALL_500_WIDTH, SMALL_500_HEIGHT),
            (DEFAULT_WINDOW_WIDTH, DEFAULT_WINDOW_HEIGHT),
            (SMALL_1280_WIDTH, SMALL_1280_HEIGHT),
        ] {
            assert_eq!(
                window_aspect_height(width, TITLE_BAR_HEIGHT, MIN_WINDOW_HEIGHT),
                height
            );
        }
    }

    #[test]
    fn save_and_load_round_trip() {
        let dir = std::env::temp_dir().join(format!(
            "dna-clone-settings-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        let path = dir.join(SETTINGS_FILE);
        let settings = sample();
        save_to(&path, &settings).unwrap();
        assert_eq!(load_from(&path), settings);
        let _ = std::fs::remove_dir_all(&dir);
    }

    fn temp_dir(tag: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "dna-clone-{tag}-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ))
    }

    #[test]
    fn newer_version_is_backed_up_and_ignored() {
        let dir = temp_dir("future");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(SETTINGS_FILE);
        std::fs::write(&path, r#"{"version":99,"activeSessionId":4}"#).unwrap();
        assert_eq!(load_from(&path), DesktopCloneSettings::default());
        assert!(dir.join("desktop-clone.json.v99.bak").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn concurrent_saves_leave_a_valid_file() {
        let dir = temp_dir("concurrent");
        let path = dir.join(SETTINGS_FILE);
        let handles: Vec<_> = (0..8)
            .map(|index| {
                let path = path.clone();
                std::thread::spawn(move || {
                    let mut settings = DesktopCloneSettings::default();
                    settings.active_session_id = Some(index);
                    save_to(&path, &settings).unwrap();
                })
            })
            .collect();
        for handle in handles {
            handle.join().unwrap();
        }
        let loaded = load_from(&path);
        assert!(loaded.active_session_id.is_some());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn corrupt_file_falls_back_to_defaults() {
        let dir = std::env::temp_dir().join(format!(
            "dna-clone-corrupt-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(SETTINGS_FILE);
        std::fs::write(&path, "{ not json").unwrap();
        assert_eq!(load_from(&path), DesktopCloneSettings::default());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
