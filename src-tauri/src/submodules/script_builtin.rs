use base64::{Engine as _, engine::general_purpose};
use boa_engine::class::Class;
use boa_engine::job::NativeAsyncJob;
use boa_engine::object::builtins::{JsArray, JsFunction, JsPromise};
use boa_engine::{
    Context, IntoJsFunctionCopied, JsData, JsError, JsNativeError, JsObject, JsResult, JsValue,
    js_string, js_value,
};
use boa_engine::{js_error, js_object};
use opencv::{
    core::Mat,
    imgproc,
    prelude::{MatTraitConst, MatTraitConstManual, VectorToVec},
};
use std::{
    cell::RefCell,
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex, OnceLock, mpsc,
        atomic::{AtomicU64, Ordering},
    },
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::Emitter;
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, SetForegroundWindow};

use crate::submodules::{
    color_match::{check_color_mat, find_color_and_match_template, rgb_to_bgr},
    fx::draw_border,
    input::*,
    jsmat::{IntoJs, JsMat},
    ocr::{self, OcrInitConfig},
    predict_rotation::predict_rotation,
    route::find_path,
    script_vision::{
        batch_match_color_impl, color_filter_hsl_impl, color_filter_impl, color_key_match_impl,
        draw_bboxes_impl, draw_contours_impl, find_contours_impl, hamming_distance_hex,
        match_orb_hash_impl, morphology_ex_impl, normalize_hash_hex, orb_feature_hash_impl,
        orb_match_count_impl, perceptual_hash_impl, segment_single_line_chars_impl,
        sift_locate_impl,
    },
    tpl::{get_template, get_template_b64},
    tpl_match::match_template,
    util::{capture_window, capture_window_roi, capture_window_wgc, capture_window_wgc_roi, check_size},
    win::{find_window, get_window_by_process_name, move_window, win_get_client_pos},
};
use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;

trait JsArgExt {
    // 泛型 T 必须实现 Class (为了获取名字) 和 JsData (为了转换)
    fn get_native<T: Class + JsData>(&self) -> JsResult<JsObject<T>>;
}

/// imshow 工作线程命令。
enum ImshowCommand {
    /// 显示或更新指定标题窗口的图像。
    Show { title: String, mat: Mat },
}

/// imshow 全局工作线程状态。
struct ImshowWorker {
    sender: mpsc::Sender<ImshowCommand>,
}

/// 全局 imshow 工作线程单例。
static IMSHOW_WORKER: OnceLock<ImshowWorker> = OnceLock::new();
/// 全局脚本事件发送器（用于向前端推送脚本状态等事件）。
static SCRIPT_EVENT_APP_HANDLE: OnceLock<Arc<tauri::AppHandle>> = OnceLock::new();
/// readConfig 请求序号，用于生成唯一 request_id。
static SCRIPT_CONFIG_REQ_SEQ: AtomicU64 = AtomicU64::new(1);
/// readConfig 等待中的请求映射：request_id -> 回传通道。
static SCRIPT_CONFIG_PENDING: OnceLock<Mutex<HashMap<String, mpsc::Sender<serde_json::Value>>>> =
    OnceLock::new();

thread_local! {
    /// 当前执行线程对应的脚本路径（用于 readConfig 作用域与相对路径解析）。
    static CURRENT_SCRIPT_PATH: RefCell<String> = const { RefCell::new(String::new()) };
}

#[derive(Clone, Copy)]
enum ScriptConfigKind {
    Number,
    String,
    Select,
    MultiSelect,
    Boolean,
}

impl ScriptConfigKind {
    /// 配置类型转前端字符串标识。
    fn as_str(self) -> &'static str {
        match self {
            ScriptConfigKind::Number => "number",
            ScriptConfigKind::String => "string",
            ScriptConfigKind::Select => "select",
            ScriptConfigKind::MultiSelect => "multi-select",
            ScriptConfigKind::Boolean => "boolean",
        }
    }
}

#[derive(Clone)]
struct ScriptConfigFormatSpec {
    kind: ScriptConfigKind,
    options: Vec<String>,
}

#[derive(Clone)]
enum ScriptConfigValue {
    Number(f64),
    String(String),
    Strings(Vec<String>),
    Boolean(bool),
}

/// 设置脚本事件发送器（首次设置生效）。
pub fn set_script_event_app_handle(app_handle: tauri::AppHandle) {
    let _ = SCRIPT_EVENT_APP_HANDLE.set(Arc::new(app_handle));
}

/// 设置当前执行脚本路径（用于 readConfig 作用域标识）。
pub fn set_current_script_path(script_path: String) {
    CURRENT_SCRIPT_PATH.with(|storage| {
        *storage.borrow_mut() = script_path;
    });
}

/// 获取当前执行脚本路径（完整路径，用于事件 scope）。
pub fn get_current_script_path() -> Option<String> {
    let script_path = CURRENT_SCRIPT_PATH.with(|storage| storage.borrow().clone());
    let normalized = script_path.trim().to_string();
    if normalized.is_empty() {
        None
    } else {
        Some(normalized)
    }
}

/// 获取 readConfig 等待映射表。
fn _script_config_pending_map() -> &'static Mutex<HashMap<String, mpsc::Sender<serde_json::Value>>> {
    SCRIPT_CONFIG_PENDING.get_or_init(|| Mutex::new(HashMap::new()))
}

/// 生成 readConfig 的唯一请求 ID。
fn _next_script_config_request_id() -> String {
    let seq = SCRIPT_CONFIG_REQ_SEQ.fetch_add(1, Ordering::Relaxed);
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("script_cfg_{now_ms}_{seq}")
}

/// 获取当前脚本配置作用域（文件名）。
fn _current_script_scope_name() -> Option<String> {
    let script_path = CURRENT_SCRIPT_PATH.with(|storage| storage.borrow().clone());
    if script_path.trim().is_empty() {
        return None;
    }
    let file_name = Path::new(script_path.as_str()).file_name()?.to_string_lossy();
    let normalized = file_name.trim().to_string();
    if normalized.is_empty() {
        None
    } else {
        Some(normalized)
    }
}

/// 获取当前脚本所在目录。
fn _current_script_dir() -> Option<PathBuf> {
    let script_path = CURRENT_SCRIPT_PATH.with(|storage| storage.borrow().clone());
    if script_path.trim().is_empty() {
        return None;
    }
    let path = Path::new(script_path.as_str());
    path.parent().map(|parent| parent.to_path_buf())
}

/// 按当前脚本目录解析资源路径（绝对路径保持不变，相对路径转绝对）。
fn _resolve_script_resource_path(path: &str) -> String {
    let normalized = String::from(path).trim().to_string();
    if normalized.is_empty() {
        return normalized;
    }
    let raw_path = Path::new(normalized.as_str());
    if raw_path.is_absolute() {
        return normalized;
    }
    if let Some(script_dir) = _current_script_dir() {
        return script_dir.join(raw_path).to_string_lossy().to_string();
    }
    normalized
}

/// 由前端回传 readConfig 请求结果。
pub fn resolve_script_config_request(
    request_id: String,
    value: serde_json::Value,
) -> Result<(), String> {
    let sender = {
        let pending = _script_config_pending_map()
            .lock()
            .map_err(|e| format!("获取配置请求映射锁失败: {e:?}"))?;
        pending.get(&request_id).cloned()
    };

    if let Some(tx) = sender {
        tx.send(value)
            .map_err(|e| format!("发送配置回传值失败: {e}"))?;
    }

    Ok(())
}

/// 获取 imshow 工作线程发送端；首次调用会自动启动渲染线程。
fn _get_imshow_sender() -> mpsc::Sender<ImshowCommand> {
    IMSHOW_WORKER
        .get_or_init(|| {
            let (sender, receiver) = mpsc::channel::<ImshowCommand>();
            thread::spawn(move || _imshow_worker_loop(receiver));
            ImshowWorker { sender }
        })
        .sender
        .clone()
}

/// imshow 后台渲染循环。
///
/// 特性：
/// 1. 同标题窗口重复调用会实时更新内容；
/// 2. 不同标题可并行展示多窗口；
/// 3. 使用短 wait_key(1) 轮询事件，避免单次调用阻塞后续调用。
fn _imshow_worker_loop(receiver: mpsc::Receiver<ImshowCommand>) {
    let mut latest_frames: HashMap<String, Mat> = HashMap::new();
    let mut dirty_titles: HashSet<String> = HashSet::new();

    loop {
        match receiver.recv_timeout(Duration::from_millis(8)) {
            Ok(ImshowCommand::Show { title, mat }) => {
                latest_frames.insert(title.clone(), mat);
                dirty_titles.insert(title);
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }

        while let Ok(ImshowCommand::Show { title, mat }) = receiver.try_recv() {
            latest_frames.insert(title.clone(), mat);
            dirty_titles.insert(title);
        }

        if !dirty_titles.is_empty() {
            for title in dirty_titles.drain() {
                if let Some(mat) = latest_frames.get(&title) {
                    let _ = opencv::highgui::imshow(&title, mat);
                }
            }
        }

        let _ = opencv::highgui::wait_key(1);
    }
}
// 为 JsValue 实现该 Trait
impl JsArgExt for JsValue {
    fn get_native<T: Class + JsData>(&self) -> JsResult<JsObject<T>> {
        self.as_object()
            .and_then(|obj| obj.downcast::<T>().ok())
            .ok_or_else(|| {
                // 自动生成清晰的错误信息，例如 "Argument must be a Mat"
                let msg = format!("Argument must be a {}", T::NAME);
                JsNativeError::typ().with_message(msg).into()
            })
    }
}

/// 将 JS `Mat[]` 数组参数解析为 Rust `Vec<Mat>`。
fn _parse_mat_array(arg: JsValue, ctx: &mut Context) -> JsResult<Vec<Mat>> {
    let array_obj = arg
        .as_object()
        .ok_or_else(|| JsNativeError::typ().with_message("tpls 参数必须是 Mat[]"))?;
    let array = JsArray::from_object(array_obj.clone())?;
    let length = array.length(ctx)? as usize;
    let mut mats = Vec::with_capacity(length);

    for idx in 0..length {
        let value = array.get(idx as u32, ctx)?;
        let js_mat = value
            .get_native::<JsMat>()
            .map_err(|_| JsNativeError::typ().with_message(format!("tpls[{idx}] 必须是 Mat")))?;
        mats.push((*js_mat.borrow().data().inner).clone());
    }

    Ok(mats)
}

/// 将 JS `number[]` 数组参数解析为 Rust `Vec<u32>`。
fn _parse_u32_array(arg: JsValue, ctx: &mut Context) -> JsResult<Vec<u32>> {
    let array_obj = arg
        .as_object()
        .ok_or_else(|| JsNativeError::typ().with_message("colors 参数必须是 number[]"))?;
    let array = JsArray::from_object(array_obj.clone())?;
    let length = array.length(ctx)? as usize;
    let mut values = Vec::with_capacity(length);

    for idx in 0..length {
        let value = array.get(idx as u32, ctx)?;
        let number = value
            .to_number(ctx)
            .map_err(|_| JsNativeError::typ().with_message(format!("colors[{idx}] 必须是数字")))?;
        values.push(number as u32 & 0x00FF_FFFF);
    }

    Ok(values)
}

/// 将 JS `string[]` 数组参数解析为 Rust `Vec<String>`。
fn _parse_string_array(arg: JsValue, ctx: &mut Context) -> JsResult<Vec<String>> {
    let array_obj = arg
        .as_object()
        .ok_or_else(|| JsNativeError::typ().with_message("hashes 参数必须是 string[]"))?;
    let array = JsArray::from_object(array_obj.clone())?;
    let length = array.length(ctx)? as usize;
    let mut values = Vec::with_capacity(length);

    for idx in 0..length {
        let value = array.get(idx as u32, ctx)?;
        let text = value
            .to_string(ctx)
            .map_err(|_| JsNativeError::typ().with_message(format!("hashes[{idx}] 必须是字符串")))?
            .to_std_string_lossy();
        values.push(text);
    }

    Ok(values)
}

/// 规范化 select 选项：去除空白、去重并保留原顺序。
fn _normalize_select_options(options: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::<String>::new();
    let mut normalized = Vec::with_capacity(options.len());
    for option in options {
        let trimmed = option.trim().to_string();
        if trimmed.is_empty() {
            continue;
        }
        if seen.insert(trimmed.clone()) {
            normalized.push(trimmed);
        }
    }
    normalized
}

/// 规范化 multi-select 值：去空、去重，并按 options（若存在）过滤。
fn _normalize_multi_select_values(values: Vec<String>, options: &[String]) -> Vec<String> {
    let mut seen = HashSet::<String>::new();
    let mut normalized = Vec::with_capacity(values.len());

    for value in values {
        let text = value.trim().to_string();
        if text.is_empty() || seen.contains(&text) {
            continue;
        }
        if !options.is_empty() && !options.iter().any(|option| option == &text) {
            continue;
        }
        seen.insert(text.clone());
        normalized.push(text);
    }

    normalized
}

/// 从 JS 数组解析 select 选项列表。
fn _parse_select_options_from_array(array: &JsArray, ctx: &mut Context) -> JsResult<Vec<String>> {
    let length = array.length(ctx)? as usize;
    let mut options = Vec::with_capacity(length);
    for idx in 0..length {
        let option = array.get(idx as u32, ctx)?.to_string(ctx)?.to_std_string_lossy();
        options.push(option);
    }
    Ok(_normalize_select_options(options))
}

/// 解析 readConfig 的 format 参数。
///
/// 支持：
/// 1. 字符串：`number` / `string` / `boolean` / `select` / `multi-select` /
///    `select:a|b|c` / `multi-select:a|b|c`
/// 2. 数组：`[\"选项A\", \"选项B\"]`（等价 select）
/// 3. 对象：`{ type: \"select\"|\"multi-select\", options: [...] }`
fn _parse_script_config_format(
    format: Option<JsValue>,
    ctx: &mut Context,
) -> JsResult<ScriptConfigFormatSpec> {
    let Some(value) = format else {
        return Ok(ScriptConfigFormatSpec {
            kind: ScriptConfigKind::String,
            options: Vec::new(),
        });
    };

    if value.is_undefined() || value.is_null() {
        return Ok(ScriptConfigFormatSpec {
            kind: ScriptConfigKind::String,
            options: Vec::new(),
        });
    }

    if let Some(obj) = value.as_object() {
        if let Ok(array) = JsArray::from_object(obj.clone()) {
            let options = _parse_select_options_from_array(&array, ctx)?;
            return Ok(ScriptConfigFormatSpec {
                kind: ScriptConfigKind::Select,
                options,
            });
        }

        let type_text = obj
            .get(js_string!("type"), ctx)?
            .to_string(ctx)?
            .to_std_string_lossy()
            .trim()
            .to_lowercase();

        let kind = match type_text.as_str() {
            "number" => ScriptConfigKind::Number,
            "string" => ScriptConfigKind::String,
            "boolean" | "bool" => ScriptConfigKind::Boolean,
            "select" => ScriptConfigKind::Select,
            "multi-select" | "multiselect" | "multi_select" => ScriptConfigKind::MultiSelect,
            _ => {
                return Err(JsNativeError::typ()
                    .with_message(
                        "readConfig format.type 无效，可选 number/string/select/multi-select/boolean",
                    )
                    .into());
            }
        };

        let options = if matches!(kind, ScriptConfigKind::Select | ScriptConfigKind::MultiSelect) {
            let options_value = obj.get(js_string!("options"), ctx)?;
            if options_value.is_undefined() || options_value.is_null() {
                Vec::new()
            } else {
                let options_obj = options_value.as_object().ok_or_else(|| {
                    JsNativeError::typ().with_message("readConfig format.options 必须是字符串数组")
                })?;
                let options_array = JsArray::from_object(options_obj.clone()).map_err(|_| {
                    JsNativeError::typ().with_message("readConfig format.options 必须是字符串数组")
                })?;
                _parse_select_options_from_array(&options_array, ctx)?
            }
        } else {
            Vec::new()
        };

        return Ok(ScriptConfigFormatSpec { kind, options });
    }

    let raw_format_text = value
        .to_string(ctx)?
        .to_std_string_lossy()
        .trim()
        .to_string();
    let format_text = raw_format_text.to_lowercase();
    match format_text.as_str() {
        "number" => Ok(ScriptConfigFormatSpec {
            kind: ScriptConfigKind::Number,
            options: Vec::new(),
        }),
        "string" => Ok(ScriptConfigFormatSpec {
            kind: ScriptConfigKind::String,
            options: Vec::new(),
        }),
        "boolean" | "bool" => Ok(ScriptConfigFormatSpec {
            kind: ScriptConfigKind::Boolean,
            options: Vec::new(),
        }),
        "select" => Ok(ScriptConfigFormatSpec {
            kind: ScriptConfigKind::Select,
            options: Vec::new(),
        }),
        "multi-select" | "multiselect" | "multi_select" => Ok(ScriptConfigFormatSpec {
            kind: ScriptConfigKind::MultiSelect,
            options: Vec::new(),
        }),
        _ if format_text.starts_with("select:") => {
            let tail = raw_format_text
                .split_once(':')
                .map(|(_, rest)| rest)
                .unwrap_or_default();
            let separator = if tail.contains('|') { '|' } else { ',' };
            let options = _normalize_select_options(
                tail.split(separator)
                    .map(|item| item.trim().to_string())
                    .collect(),
            );
            Ok(ScriptConfigFormatSpec {
                kind: ScriptConfigKind::Select,
                options,
            })
        }
        _ if format_text.starts_with("multi-select:")
            || format_text.starts_with("multiselect:")
            || format_text.starts_with("multi_select:") =>
        {
            let tail = raw_format_text
                .split_once(':')
                .map(|(_, rest)| rest)
                .unwrap_or_default();
            let separator = if tail.contains('|') { '|' } else { ',' };
            let options = _normalize_select_options(
                tail.split(separator)
                    .map(|item| item.trim().to_string())
                    .collect(),
            );
            Ok(ScriptConfigFormatSpec {
                kind: ScriptConfigKind::MultiSelect,
                options,
            })
        }
        _ => Err(JsNativeError::typ()
            .with_message("readConfig format 无效，可选 number/string/select/multi-select/boolean")
            .into()),
    }
}

/// 为指定配置类型生成默认值。
fn _default_script_config_value(spec: &ScriptConfigFormatSpec) -> ScriptConfigValue {
    match spec.kind {
        ScriptConfigKind::Number => ScriptConfigValue::Number(0.0),
        ScriptConfigKind::String => ScriptConfigValue::String(String::new()),
        ScriptConfigKind::Boolean => ScriptConfigValue::Boolean(false),
        ScriptConfigKind::Select => ScriptConfigValue::String(
            spec.options.first().cloned().unwrap_or_default(),
        ),
        ScriptConfigKind::MultiSelect => ScriptConfigValue::Strings(Vec::new()),
    }
}

/// 将 JS 值规整为配置值类型。
fn _coerce_js_to_script_config_value(
    value: JsValue,
    spec: &ScriptConfigFormatSpec,
    ctx: &mut Context,
) -> JsResult<ScriptConfigValue> {
    if value.is_undefined() || value.is_null() {
        return Ok(_default_script_config_value(spec));
    }

    match spec.kind {
        ScriptConfigKind::Number => {
            let mut number = value.to_number(ctx)?;
            if !number.is_finite() {
                number = 0.0;
            }
            Ok(ScriptConfigValue::Number(number))
        }
        ScriptConfigKind::Boolean => {
            if let Some(bool_value) = value.as_boolean() {
                return Ok(ScriptConfigValue::Boolean(bool_value));
            }
            if let Some(number) = value.as_number() {
                return Ok(ScriptConfigValue::Boolean(number != 0.0));
            }
            let text = value.to_string(ctx)?.to_std_string_lossy().trim().to_lowercase();
            let bool_value = matches!(text.as_str(), "1" | "true" | "yes" | "y" | "on");
            Ok(ScriptConfigValue::Boolean(bool_value))
        }
        ScriptConfigKind::String => {
            let text = value.to_string(ctx)?.to_std_string_lossy();
            Ok(ScriptConfigValue::String(text))
        }
        ScriptConfigKind::Select => {
            let text = value.to_string(ctx)?.to_std_string_lossy();
            if spec.options.is_empty() || spec.options.iter().any(|option| option == &text) {
                Ok(ScriptConfigValue::String(text))
            } else {
                Ok(ScriptConfigValue::String(
                    spec.options.first().cloned().unwrap_or_default(),
                ))
            }
        }
        ScriptConfigKind::MultiSelect => {
            let raw_values = if let Some(obj) = value.as_object() {
                if let Ok(array) = JsArray::from_object(obj.clone()) {
                    let length = array.length(ctx)? as usize;
                    let mut values = Vec::with_capacity(length);
                    for idx in 0..length {
                        let item_text = array.get(idx as u32, ctx)?.to_string(ctx)?.to_std_string_lossy();
                        values.push(item_text);
                    }
                    values
                } else {
                    let text = value.to_string(ctx)?.to_std_string_lossy();
                    if text.trim().is_empty() {
                        Vec::new()
                    } else {
                        vec![text]
                    }
                }
            } else {
                let text = value.to_string(ctx)?.to_std_string_lossy();
                if text.trim().is_empty() {
                    Vec::new()
                } else {
                    vec![text]
                }
            };

            Ok(ScriptConfigValue::Strings(_normalize_multi_select_values(
                raw_values,
                &spec.options,
            )))
        }
    }
}

/// 将配置值转为 JSON，便于通过事件发送给前端。
fn _script_config_value_to_json(value: &ScriptConfigValue) -> serde_json::Value {
    match value {
        ScriptConfigValue::Number(number) => serde_json::json!(number),
        ScriptConfigValue::String(text) => serde_json::json!(text),
        ScriptConfigValue::Strings(values) => serde_json::json!(values),
        ScriptConfigValue::Boolean(boolean) => serde_json::json!(boolean),
    }
}

/// 将前端回传的 JSON 值规整为配置值类型。
fn _coerce_json_to_script_config_value(
    value: &serde_json::Value,
    spec: &ScriptConfigFormatSpec,
    fallback: &ScriptConfigValue,
) -> ScriptConfigValue {
    match spec.kind {
        ScriptConfigKind::Number => {
            let parsed = if let Some(number) = value.as_f64() {
                Some(number)
            } else if let Some(text) = value.as_str() {
                text.parse::<f64>().ok()
            } else {
                None
            };

            match parsed.filter(|number| number.is_finite()) {
                Some(number) => ScriptConfigValue::Number(number),
                None => fallback.clone(),
            }
        }
        ScriptConfigKind::Boolean => {
            let parsed = if let Some(boolean) = value.as_bool() {
                Some(boolean)
            } else if let Some(number) = value.as_f64() {
                Some(number != 0.0)
            } else if let Some(text) = value.as_str() {
                let normalized = text.trim().to_lowercase();
                Some(matches!(
                    normalized.as_str(),
                    "1" | "true" | "yes" | "y" | "on"
                ))
            } else {
                None
            };

            match parsed {
                Some(boolean) => ScriptConfigValue::Boolean(boolean),
                None => fallback.clone(),
            }
        }
        ScriptConfigKind::String => {
            if let Some(text) = value.as_str() {
                ScriptConfigValue::String(text.to_string())
            } else if value.is_null() {
                fallback.clone()
            } else {
                ScriptConfigValue::String(value.to_string())
            }
        }
        ScriptConfigKind::Select => {
            let text = if let Some(text) = value.as_str() {
                text.to_string()
            } else if value.is_null() {
                String::new()
            } else {
                value.to_string()
            };

            if spec.options.is_empty() || spec.options.iter().any(|option| option == &text) {
                ScriptConfigValue::String(text)
            } else {
                fallback.clone()
            }
        }
        ScriptConfigKind::MultiSelect => {
            if value.is_null() {
                return fallback.clone();
            }

            let raw_values = if let Some(array) = value.as_array() {
                array
                    .iter()
                    .map(|item| item.as_str().map(|s| s.to_string()).unwrap_or_else(|| item.to_string()))
                    .collect::<Vec<String>>()
            } else if let Some(text) = value.as_str() {
                if text.trim().is_empty() {
                    Vec::new()
                } else {
                    vec![text.to_string()]
                }
            } else {
                vec![value.to_string()]
            };

            ScriptConfigValue::Strings(_normalize_multi_select_values(raw_values, &spec.options))
        }
    }
}

/// 将配置值转换为 JS 值返回给脚本。
fn _script_config_value_to_js(value: &ScriptConfigValue, ctx: &mut Context) -> JsResult<JsValue> {
    match value {
        ScriptConfigValue::Number(number) => Ok(JsValue::new(*number)),
        ScriptConfigValue::String(text) => Ok(JsValue::from(js_string!(text.clone()))),
        ScriptConfigValue::Strings(values) => {
            let js_array = JsArray::new(ctx);
            for value in values {
                js_array.push(JsValue::from(js_string!(value.clone())), ctx)?;
            }
            Ok(js_array.into())
        }
        ScriptConfigValue::Boolean(boolean) => Ok(JsValue::new(*boolean)),
    }
}

/// 从 JS 数组对象中解析单个 bbox 元组 `(x, y, w, h)`。
fn _parse_bbox_tuple(
    array: &JsArray,
    index: usize,
    ctx: &mut Context,
) -> JsResult<(i32, i32, i32, i32)> {
    if array.length(ctx)? < 4 {
        return Err(JsNativeError::typ()
            .with_message(format!("bboxes[{index}] 长度不足 4，必须为 [x, y, w, h]"))
            .into());
    }

    let x = array.get(0, ctx)?.to_number(ctx)?.round() as i32;
    let y = array.get(1, ctx)?.to_number(ctx)?.round() as i32;
    let w = array.get(2, ctx)?.to_number(ctx)?.round() as i32;
    let h = array.get(3, ctx)?.to_number(ctx)?.round() as i32;
    Ok((x, y, w, h))
}

/// 将 JS bbox 数组解析为 Rust 向量。
///
/// 支持两种元素格式：
/// 1. `[x, y, w, h]`
/// 2. `{ bbox: [x, y, w, h] }`
fn _parse_bbox_array(arg: JsValue, ctx: &mut Context) -> JsResult<Vec<(i32, i32, i32, i32)>> {
    let array_obj = arg
        .as_object()
        .ok_or_else(|| JsNativeError::typ().with_message("bboxes 参数必须是数组"))?;
    let array = JsArray::from_object(array_obj.clone())
        .map_err(|_| JsNativeError::typ().with_message("bboxes 参数必须是数组"))?;
    let length = array.length(ctx)? as usize;
    let mut values = Vec::with_capacity(length);

    for idx in 0..length {
        let item = array.get(idx as u32, ctx)?;
        let item_obj = item.as_object().ok_or_else(|| {
            JsNativeError::typ().with_message(format!("bboxes[{idx}] 必须是数组或对象"))
        })?;

        // 格式1：[x, y, w, h]
        if let Ok(item_array) = JsArray::from_object(item_obj.clone()) {
            values.push(_parse_bbox_tuple(&item_array, idx, ctx)?);
            continue;
        }

        // 格式2：{ bbox: [x, y, w, h] }
        let bbox_value = item_obj.get(js_string!("bbox"), ctx).map_err(|_| {
            JsNativeError::typ().with_message(format!("读取 bboxes[{idx}].bbox 失败"))
        })?;
        let bbox_obj = bbox_value.as_object().ok_or_else(|| {
            JsNativeError::typ().with_message(format!("bboxes[{idx}].bbox 必须是数组"))
        })?;
        let bbox_array = JsArray::from_object(bbox_obj.clone()).map_err(|_| {
            JsNativeError::typ().with_message(format!("bboxes[{idx}].bbox 必须是数组"))
        })?;
        values.push(_parse_bbox_tuple(&bbox_array, idx, ctx)?);
    }

    Ok(values)
}

/// 解析轮廓检索模式参数，支持字符串别名或 OpenCV 常量值。
fn _parse_contour_mode(mode: Option<JsValue>, ctx: &mut Context) -> JsResult<i32> {
    let Some(value) = mode else {
        return Ok(imgproc::RETR_TREE);
    };
    if value.is_undefined() || value.is_null() {
        return Ok(imgproc::RETR_TREE);
    }

    if let Some(mode_num) = value.as_number() {
        return Ok(mode_num as i32);
    }

    let mode_text = value.to_string(ctx)?.to_std_string_lossy().to_lowercase();
    match mode_text.as_str() {
        "external" => Ok(imgproc::RETR_EXTERNAL),
        "list" => Ok(imgproc::RETR_LIST),
        "ccomp" => Ok(imgproc::RETR_CCOMP),
        "tree" => Ok(imgproc::RETR_TREE),
        "floodfill" => Ok(imgproc::RETR_FLOODFILL),
        _ => Err(JsNativeError::typ()
            .with_message(
                "mode 参数无效，可选: external/list/ccomp/tree/floodfill 或 OpenCV 常量值",
            )
            .into()),
    }
}

/// 解析轮廓逼近方法参数，支持字符串别名或 OpenCV 常量值。
fn _parse_contour_method(method: Option<JsValue>, ctx: &mut Context) -> JsResult<i32> {
    let Some(value) = method else {
        return Ok(imgproc::CHAIN_APPROX_SIMPLE);
    };
    if value.is_undefined() || value.is_null() {
        return Ok(imgproc::CHAIN_APPROX_SIMPLE);
    }

    if let Some(method_num) = value.as_number() {
        return Ok(method_num as i32);
    }

    let method_text = value.to_string(ctx)?.to_std_string_lossy().to_lowercase();
    match method_text.as_str() {
        "none" => Ok(imgproc::CHAIN_APPROX_NONE),
        "simple" => Ok(imgproc::CHAIN_APPROX_SIMPLE),
        "tc89l1" => Ok(imgproc::CHAIN_APPROX_TC89_L1),
        "tc89kcos" => Ok(imgproc::CHAIN_APPROX_TC89_KCOS),
        _ => Err(JsNativeError::typ()
            .with_message("method 参数无效，可选: none/simple/tc89l1/tc89kcos 或 OpenCV 常量值")
            .into()),
    }
}

/// 解析形态学操作类型参数，支持字符串别名或 OpenCV 常量值。
fn _parse_morphology_op(op: Option<JsValue>, ctx: &mut Context) -> JsResult<i32> {
    let Some(value) = op else {
        return Ok(imgproc::MORPH_OPEN);
    };
    if value.is_undefined() || value.is_null() {
        return Ok(imgproc::MORPH_OPEN);
    }

    if let Some(op_num) = value.as_number() {
        return Ok(op_num as i32);
    }

    let op_text = value.to_string(ctx)?.to_std_string_lossy().to_lowercase();
    match op_text.as_str() {
        "erode" => Ok(imgproc::MORPH_ERODE),
        "dilate" => Ok(imgproc::MORPH_DILATE),
        "open" => Ok(imgproc::MORPH_OPEN),
        "close" => Ok(imgproc::MORPH_CLOSE),
        "gradient" => Ok(imgproc::MORPH_GRADIENT),
        "tophat" => Ok(imgproc::MORPH_TOPHAT),
        "blackhat" => Ok(imgproc::MORPH_BLACKHAT),
        "hitmiss" => Ok(imgproc::MORPH_HITMISS),
        _ => Err(JsNativeError::typ()
            .with_message("op 参数无效，可选: erode/dilate/open/close/gradient/tophat/blackhat/hitmiss 或 OpenCV 常量值")
            .into()),
    }
}

/// 解析形态学核形状参数，支持字符串别名或 OpenCV 常量值。
fn _parse_morphology_shape(shape: Option<JsValue>, ctx: &mut Context) -> JsResult<i32> {
    let Some(value) = shape else {
        return Ok(imgproc::MORPH_RECT);
    };
    if value.is_undefined() || value.is_null() {
        return Ok(imgproc::MORPH_RECT);
    }

    if let Some(shape_num) = value.as_number() {
        return Ok(shape_num as i32);
    }

    let shape_text = value.to_string(ctx)?.to_std_string_lossy().to_lowercase();
    match shape_text.as_str() {
        "rect" => Ok(imgproc::MORPH_RECT),
        "cross" => Ok(imgproc::MORPH_CROSS),
        "ellipse" => Ok(imgproc::MORPH_ELLIPSE),
        _ => Err(JsNativeError::typ()
            .with_message("shape 参数无效，可选: rect/cross/ellipse 或 OpenCV 常量值")
            .into()),
    }
}

fn _win_get_client_pos(hwnd: Option<JsValue>, ctx: &mut Context) -> JsResult<JsValue> {
    let hwnd = HWND(
        hwnd.unwrap_or_else(|| JsValue::undefined())
            .to_i32(ctx)
            .unwrap_or(0) as isize as *mut std::ffi::c_void,
    );
    // Get ownership of rest arguments.
    if let Some((x, y, width, height)) = win_get_client_pos(hwnd) {
        Ok(js_value!([x, y, width, height], ctx))
    } else {
        Ok(JsValue::undefined())
    }
}

/// 鼠标点击函数
fn _mc(
    hwnd: Option<JsValue>,
    x: Option<JsValue>,
    y: Option<JsValue>,
    ctx: &mut Context,
) -> JsResult<JsValue> {
    let hwnd = HWND(
        hwnd.unwrap_or_else(|| JsValue::undefined())
            .to_number(ctx)? as isize as *mut std::ffi::c_void,
    );
    let x = x.unwrap_or_else(|| JsValue::undefined()).to_number(ctx)? as i32;
    let y = y.unwrap_or_else(|| JsValue::undefined()).to_number(ctx)? as i32;
    if hwnd.is_invalid() {
        if x <= 0 || y <= 0 {
            click(10);
            return Ok(JsValue::undefined());
        }
        click_to(x, y);
    } else {
        post_mouse_click(hwnd, x, y);
    }
    Ok(JsValue::undefined())
}

/// 鼠标移动函数
fn _mm(x: Option<JsValue>, y: Option<JsValue>, ctx: &mut Context) -> JsResult<JsValue> {
    let x = x.unwrap_or_else(|| JsValue::undefined()).to_number(ctx)? as i32;
    let y = y.unwrap_or_else(|| JsValue::undefined()).to_number(ctx)? as i32;
    mouse_move(x, y);
    Ok(JsValue::undefined())
}

/// 鼠标绝对移动函数（带缓动，异步）
fn _move_to(
    hwnd: Option<JsValue>,
    x: Option<JsValue>,
    y: Option<JsValue>,
    duration: Option<JsValue>,
    ctx: &mut Context,
) -> JsResult<JsValue> {
    let hwnd = HWND(
        hwnd.unwrap_or_else(|| JsValue::undefined())
            .to_number(ctx)? as isize as *mut std::ffi::c_void,
    );
    let mut end_x = x.unwrap_or_else(|| JsValue::undefined()).to_number(ctx)? as i32;
    let mut end_y = y.unwrap_or_else(|| JsValue::undefined()).to_number(ctx)? as i32;
    let duration = duration
        .unwrap_or_else(|| JsValue::undefined())
        .to_number(ctx)? as u64;

    if !hwnd.is_invalid() {
        let (x, y, _width, _height) = win_get_client_pos(hwnd).unwrap_or((0, 0, 0, 0));
        end_x += x;
        end_y += y;
    }

    // 获取当前鼠标位置
    let mut current_pos = windows::Win32::Foundation::POINT { x: 0, y: 0 };
    unsafe {
        let _ = GetCursorPos(&mut current_pos);
    }

    // 立即开始移动（在 tokio 任务中）
    let start_x = current_pos.x;
    let start_y = current_pos.y;
    let duration_ms = duration as u32;
    tokio::spawn(async move {
        mouse_move_to_eased(start_x, start_y, end_x, end_y, duration_ms).await;
    });

    // 返回在 duration 毫秒后 resolve 的 promise
    let mut cb: Option<JsFunction> = None;
    let promise = JsPromise::new(
        |resolvers, _context| {
            cb = Some(resolvers.resolve.clone());

            Ok(JsValue::undefined())
        },
        ctx,
    );
    let job = boa_engine::job::TimeoutJob::new(
        boa_engine::job::NativeJob::new(move |context| {
            cb.unwrap()
                .call(&JsValue::undefined(), &[], context)
                .unwrap();
            Ok(JsValue::undefined())
        }),
        duration,
    );
    ctx.enqueue_job(job.into());
    Ok(promise.into())
}

/// 鼠标绝对移动后点击 (带缓动)
fn _move_c(
    hwnd: Option<JsValue>,
    x: Option<JsValue>,
    y: Option<JsValue>,
    duration: Option<JsValue>,
    ctx: &mut Context,
) -> JsResult<JsValue> {
    let hwnd = HWND(
        hwnd.unwrap_or_else(|| JsValue::undefined())
            .to_number(ctx)? as isize as *mut std::ffi::c_void,
    );
    let mut end_x = x.unwrap_or_else(|| JsValue::undefined()).to_number(ctx)? as i32;
    let mut end_y = y.unwrap_or_else(|| JsValue::undefined()).to_number(ctx)? as i32;
    let cx = end_x;
    let cy = end_y;
    let duration = duration
        .unwrap_or_else(|| JsValue::undefined())
        .to_number(ctx)? as u64;

    if !hwnd.is_invalid() {
        let (x, y, _width, _height) = win_get_client_pos(hwnd).unwrap_or((0, 0, 0, 0));
        end_x += x;
        end_y += y;
    }

    // 获取当前鼠标位置
    let mut current_pos = windows::Win32::Foundation::POINT { x: 0, y: 0 };
    unsafe {
        let _ = GetCursorPos(&mut current_pos);
    }

    // 立即开始移动（在 tokio 任务中）
    let start_x = current_pos.x;
    let start_y = current_pos.y;
    let duration_ms = duration as u32;
    let hwnd_safe = hwnd.0 as isize;
    tokio::spawn(async move {
        mouse_move_to_eased(start_x, start_y, end_x, end_y, duration_ms).await;
        if hwnd_safe != 0 {
            post_click(HWND(hwnd_safe as *mut std::ffi::c_void), cx, cy, 1);
        } else {
            click(10);
        }
    });

    // 返回在 duration 毫秒后 resolve 的 promise
    let mut cb: Option<JsFunction> = None;
    let promise = JsPromise::new(
        |resolvers, _context| {
            cb = Some(resolvers.resolve.clone());

            Ok(JsValue::undefined())
        },
        ctx,
    );
    let job = boa_engine::job::TimeoutJob::new(
        boa_engine::job::NativeJob::new(move |context| {
            cb.unwrap()
                .call(&JsValue::undefined(), &[], context)
                .unwrap();
            Ok(JsValue::undefined())
        }),
        duration,
    );
    ctx.enqueue_job(job.into());
    Ok(promise.into())
}

/// 鼠标按下函数
fn _md(
    hwnd: Option<JsValue>,
    x: Option<JsValue>,
    y: Option<JsValue>,
    ctx: &mut Context,
) -> JsResult<JsValue> {
    let hwnd = HWND(
        hwnd.unwrap_or_else(|| JsValue::undefined())
            .to_number(ctx)? as isize as *mut std::ffi::c_void,
    );
    let x = x.unwrap_or_else(|| js_value!(-1)).to_number(ctx)? as i32;
    let y = y.unwrap_or_else(|| js_value!(-1)).to_number(ctx)? as i32;
    if hwnd.is_invalid() {
        if x == -1 || y == -1 {
            mouse_down();
        } else {
            mouse_move_to(x, y);
            mouse_down();
        }
    } else {
        post_mouse_down(hwnd, x, y);
    }
    Ok(JsValue::undefined())
}

/// 鼠标释放函数
fn _mu(
    hwnd: Option<JsValue>,
    x: Option<JsValue>,
    y: Option<JsValue>,
    ctx: &mut Context,
) -> JsResult<JsValue> {
    let hwnd = HWND(
        hwnd.unwrap_or_else(|| JsValue::undefined())
            .to_number(ctx)? as isize as *mut std::ffi::c_void,
    );
    let x = x.unwrap_or_else(|| js_value!(-1)).to_number(ctx)? as i32;
    let y = y.unwrap_or_else(|| js_value!(-1)).to_number(ctx)? as i32;
    if hwnd.is_invalid() {
        if x == -1 || y == -1 {
            mouse_up();
        } else {
            mouse_move_to(x, y);
            mouse_up();
        }
    } else {
        post_mouse_up(hwnd, x, y);
    }
    Ok(JsValue::undefined())
}

/// 鼠标中键点击函数
fn _mt(
    hwnd: Option<JsValue>,
    x: Option<JsValue>,
    y: Option<JsValue>,
    ctx: &mut Context,
) -> JsResult<JsValue> {
    let hwnd = HWND(
        hwnd.unwrap_or_else(|| JsValue::undefined())
            .to_number(ctx)? as isize as *mut std::ffi::c_void,
    );
    let x = x.unwrap_or_else(|| js_value!(-1)).to_number(ctx)? as i32;
    let y = y.unwrap_or_else(|| js_value!(-1)).to_number(ctx)? as i32;
    if hwnd.is_invalid() {
        if x == -1 || y == -1 {
            middle_click();
        } else {
            middle_click_to(x, y);
        }
    } else {
        post_mouse_middle_click(hwnd, x, y);
    }
    Ok(JsValue::undefined())
}

/// 鼠标滚轮函数
///
/// 行为说明：
/// - `hwnd = 0`：发送到前台（可选先移动到 `x,y`）；
/// - `hwnd != 0`：通过 `PostMessage` 向指定窗口发送 `WM_MOUSEWHEEL`。
fn _wheel(
    hwnd: Option<JsValue>,
    x: Option<JsValue>,
    y: Option<JsValue>,
    delta: Option<JsValue>,
    ctx: &mut Context,
) -> JsResult<JsValue> {
    let hwnd = HWND(
        hwnd.unwrap_or_else(|| JsValue::undefined())
            .to_number(ctx)? as isize as *mut std::ffi::c_void,
    );
    let x = x.unwrap_or_else(|| JsValue::undefined()).to_number(ctx)? as i32;
    let y = y.unwrap_or_else(|| JsValue::undefined()).to_number(ctx)? as i32;
    let delta = delta.unwrap_or_else(|| js_value!(0)).to_number(ctx)? as i32;

    if hwnd.is_invalid() {
        if x > 0 && y > 0 {
            mouse_move_to(x, y);
        }
        wheel(delta);
    } else {
        post_wheel(hwnd, x, y, delta);
    }
    Ok(JsValue::undefined())
}

/// 键盘按键函数
fn _kb(
    hwnd: Option<JsValue>,
    key: Option<JsValue>,
    duration: Option<JsValue>,
    ctx: &mut Context,
) -> JsResult<JsValue> {
    let hwnd_raw = hwnd
        .unwrap_or_else(|| JsValue::undefined())
        .to_number(ctx)? as isize;
    let key = key
        .unwrap_or_else(|| JsValue::undefined())
        .to_string(ctx)?
        .to_std_string_lossy();
    let duration = duration.unwrap_or_else(|| js_value!(0)).to_number(ctx)? as u32;

    let (promise, resolvers) = JsPromise::new_pending(ctx);
    let resolvers_clone = resolvers.clone();
    ctx.enqueue_job(
        NativeAsyncJob::new(async move |context| {
            let async_result = tokio::task::spawn_blocking(move || {
                let hwnd = HWND(hwnd_raw as *mut std::ffi::c_void);
                if hwnd.is_invalid() {
                    key_press(&key, duration);
                } else {
                    post_key_press(hwnd, &key, duration);
                }
            })
            .await;

            let context = &mut context.borrow_mut();
            match async_result {
                Ok(_) => resolvers_clone
                    .resolve
                    .call(&JsValue::undefined(), &[], context),
                Err(e) => {
                    let msg = format!("kb 线程执行失败: {e}");
                    resolvers_clone.reject.call(
                        &JsValue::undefined(),
                        &[JsValue::from(js_string!(msg))],
                        context,
                    )
                }
            }
        })
        .into(),
    );

    Ok(promise.into())
}

/// 键盘按下函数
fn _kd(hwnd: Option<JsValue>, key: Option<JsValue>, ctx: &mut Context) -> JsResult<JsValue> {
    let hwnd = HWND(
        hwnd.unwrap_or_else(|| JsValue::undefined())
            .to_number(ctx)? as isize as *mut std::ffi::c_void,
    );
    let key = key
        .unwrap_or_else(|| JsValue::undefined())
        .to_string(ctx)?
        .to_std_string_lossy();
    let vkey = key_to_vkey(&key);
    if hwnd.is_invalid() {
        key_down(vkey);
    } else {
        post_key_down(hwnd, vkey);
    }
    Ok(JsValue::undefined())
}

/// 键盘释放函数
fn _ku(hwnd: Option<JsValue>, key: Option<JsValue>, ctx: &mut Context) -> JsResult<JsValue> {
    let hwnd = HWND(
        hwnd.unwrap_or_else(|| JsValue::undefined())
            .to_number(ctx)? as isize as *mut std::ffi::c_void,
    );
    let key = key
        .unwrap_or_else(|| JsValue::undefined())
        .to_string(ctx)?
        .to_std_string_lossy();
    let vkey = key_to_vkey(&key);
    if hwnd.is_invalid() {
        key_up(vkey);
    } else {
        post_key_up(hwnd, vkey);
    }
    Ok(JsValue::undefined())
}

/// 设置前景窗口函数
fn _set_foreground_window(hwnd: Option<JsValue>, ctx: &mut Context) -> JsResult<JsValue> {
    let hwnd = HWND(
        hwnd.unwrap_or_else(|| JsValue::undefined())
            .to_number(ctx)? as isize as *mut std::ffi::c_void,
    );
    unsafe {
        let _ = SetForegroundWindow(hwnd);
    }
    Ok(JsValue::undefined())
}

/// 检查窗口大小函数
fn _check_size(hwnd: Option<JsValue>, ctx: &mut Context) -> JsResult<JsValue> {
    let hwnd = HWND(
        hwnd.unwrap_or_else(|| JsValue::undefined())
            .to_number(ctx)? as isize as *mut std::ffi::c_void,
    );
    check_size(hwnd);
    Ok(JsValue::undefined())
}

/// 移动窗口并设置大小函数
fn _move_window(
    hwnd: Option<JsValue>,
    x: Option<JsValue>,
    y: Option<JsValue>,
    w: Option<JsValue>,
    h: Option<JsValue>,
    ctx: &mut Context,
) -> JsResult<JsValue> {
    let hwnd = HWND(
        hwnd.unwrap_or_else(|| JsValue::undefined())
            .to_number(ctx)? as isize as *mut std::ffi::c_void,
    );
    let x = x.unwrap_or_else(|| JsValue::undefined()).to_number(ctx)? as i32;
    let y = y.unwrap_or_else(|| JsValue::undefined()).to_number(ctx)? as i32;
    let w = w.and_then(|v| v.to_number(ctx).ok()).map(|v| v as i32);
    let h = h.and_then(|v| v.to_number(ctx).ok()).map(|v| v as i32);
    if hwnd.is_invalid() {
        return Ok(JsValue::new(false));
    }
    let result = move_window(hwnd, x, y, w, h);
    Ok(JsValue::new(result))
}

/// 解析可选 ROI 数值参数。
///
/// - 参数为 `undefined` 时返回 `None`；
/// - 参数为数字时返回对应 `i32`。
fn _parse_optional_i32_arg(value: Option<JsValue>, ctx: &mut Context) -> JsResult<Option<i32>> {
    if let Some(value) = value {
        if value.is_undefined() || value.is_null() {
            return Ok(None);
        }
        return Ok(Some(value.to_number(ctx)? as i32));
    }
    Ok(None)
}

/// 统一解析 ROI 参数，要求 x/y/w/h 要么全部缺省，要么全部提供。
fn _parse_capture_roi_args(
    x: Option<JsValue>,
    y: Option<JsValue>,
    w: Option<JsValue>,
    h: Option<JsValue>,
    ctx: &mut Context,
) -> JsResult<Option<(i32, i32, i32, i32)>> {
    let x = _parse_optional_i32_arg(x, ctx)?;
    let y = _parse_optional_i32_arg(y, ctx)?;
    let w = _parse_optional_i32_arg(w, ctx)?;
    let h = _parse_optional_i32_arg(h, ctx)?;
    match (x, y, w, h) {
        (None, None, None, None) => Ok(None),
        (Some(x), Some(y), Some(w), Some(h)) => Ok(Some((x, y, w, h))),
        _ => Err(js_error!("ROI 参数必须同时提供 x、y、w、h")),
    }
}

/// 从窗口获取图像 Mat 对象函数。
///
/// 参数：
/// - `hwnd`: 窗口句柄
/// - `x/y/w/h`（可选）: ROI 参数（相对客户区）
/// - `useWgc`（可选）: 是否启用 WGC 实现（默认 false）
fn _capture_window(
    hwnd: Option<JsValue>,
    x: Option<JsValue>,
    y: Option<JsValue>,
    w: Option<JsValue>,
    h: Option<JsValue>,
    use_wgc: Option<JsValue>,
    ctx: &mut Context,
) -> JsResult<JsValue> {
    let hwnd = HWND(
        hwnd.unwrap_or_else(|| JsValue::undefined())
            .to_number(ctx)? as isize as *mut std::ffi::c_void,
    );
    let roi = _parse_capture_roi_args(x, y, w, h, ctx)?;
    let use_wgc = use_wgc.unwrap_or_else(|| JsValue::new(false)).to_boolean();

    let mat = if use_wgc {
        if let Some((x, y, w, h)) = roi {
            capture_window_wgc_roi(hwnd, x, y, w, h)
        } else {
            capture_window_wgc(hwnd)
        }
    } else if let Some((x, y, w, h)) = roi {
        capture_window_roi(hwnd, x, y, w, h)
    } else {
        capture_window(hwnd)
    };

    if let Some(mat) = mat {
        mat.into_js(ctx)
    } else {
        Err(js_error!("capture_window failed"))
    }
}

/// 从窗口获取图像 Mat 对象函数（WGC 优化版，兼容旧接口）。
///
/// 参数：
/// - `hwnd`: 窗口句柄
/// - `x/y/w/h`（可选）: ROI 参数（相对客户区）
fn _capture_window_wgc(
    hwnd: Option<JsValue>,
    x: Option<JsValue>,
    y: Option<JsValue>,
    w: Option<JsValue>,
    h: Option<JsValue>,
    ctx: &mut Context,
) -> JsResult<JsValue> {
    let hwnd = HWND(
        hwnd.unwrap_or_else(|| JsValue::undefined())
            .to_number(ctx)? as isize as *mut std::ffi::c_void,
    );
    let roi = _parse_capture_roi_args(x, y, w, h, ctx)?;
    let mat = if let Some((x, y, w, h)) = roi {
        capture_window_wgc_roi(hwnd, x, y, w, h)
    } else {
        capture_window_wgc(hwnd)
    };
    if let Some(mat) = mat {
        mat.into_js(ctx)
    } else {
        Err(js_error!("capture_window_wgc failed"))
    }
}

/// 从文件加载模板Mat对象函数
fn _get_template(path: Option<JsValue>, ctx: &mut Context) -> JsResult<JsValue> {
    let path = path
        .unwrap_or_else(|| JsValue::undefined())
        .to_string(ctx)?
        .to_std_string_lossy();
    let resolved_path = _resolve_script_resource_path(&path);

    if let Ok(mat) = get_template(&resolved_path) {
        let js_mat = Box::new(mat).into_js(ctx)?;
        Ok(js_mat)
    } else {
        Err(js_error!("get_template failed"))
    }
}

/// 从 base64 字符串加载模板Mat对象函数
fn _get_template_b64(b64_str: Option<JsValue>, ctx: &mut Context) -> JsResult<JsValue> {
    let b64_str = b64_str
        .unwrap_or_else(|| JsValue::undefined())
        .to_string(ctx)?
        .to_std_string_lossy();

    if let Ok(mat) = get_template_b64(&b64_str) {
        let js_mat = Box::new(mat).into_js(ctx)?;
        Ok(js_mat)
    } else {
        Err(js_error!("get_template_b64 failed"))
    }
}

/// 从文件加载图像Mat对象函数
fn _imread(path: Option<JsValue>, ctx: &mut Context) -> JsResult<JsValue> {
    let path = path
        .unwrap_or_else(|| JsValue::undefined())
        .to_string(ctx)?
        .to_std_string_lossy();
    let resolved_path = _resolve_script_resource_path(&path);

    if let Ok(mat) = opencv::imgcodecs::imread(&resolved_path, opencv::imgcodecs::IMREAD_COLOR) {
        let js_mat = Box::new(mat).into_js(ctx)?;
        Ok(js_mat)
    } else {
        Err(js_error!("imread failed"))
    }
}
/// 从文件加载图像Mat对象函数
fn _imread_rgba(path: Option<JsValue>, ctx: &mut Context) -> JsResult<JsValue> {
    let path = path
        .unwrap_or_else(|| JsValue::undefined())
        .to_string(ctx)?
        .to_std_string_lossy();
    let resolved_path = _resolve_script_resource_path(&path);

    if let Ok(mat) = opencv::imgcodecs::imread(&resolved_path, opencv::imgcodecs::IMREAD_UNCHANGED)
    {
        let js_mat = Box::new(mat).into_js(ctx)?;
        Ok(js_mat)
    } else {
        Err(js_error!("imread_rgba failed"))
    }
}

/// 保存Mat对象到文件函数
fn _imwrite(
    path: Option<JsValue>,
    js_img_mat: Option<JsValue>,
    ctx: &mut Context,
) -> JsResult<JsValue> {
    // 获取第一个参数 (文件路径)
    let path = path
        .unwrap_or_else(|| JsValue::undefined())
        .to_string(ctx)?
        .to_std_string_lossy();
    let resolved_path = _resolve_script_resource_path(&path);

    // 获取第二个参数 (图像Mat)
    let js_img_mat = js_img_mat
        .unwrap_or_else(|| JsValue::undefined())
        .get_native::<JsMat>()?;

    // 保存图像到文件
    match opencv::imgcodecs::imwrite(
        &resolved_path,
        &*js_img_mat.borrow().data().inner,
        &opencv::core::Vector::new(),
    ) {
        Ok(_) => Ok(JsValue::new(true)),
        Err(_) => Ok(JsValue::new(false)),
    }
}

/// 复制Mat对象到剪贴板函数
fn _copy_image(js_img_mat: Option<JsValue>, _ctx: &mut Context) -> JsResult<JsValue> {
    // 获取第一个参数 (图像Mat)
    let js_img_mat = js_img_mat
        .unwrap_or_else(|| JsValue::undefined())
        .get_native::<JsMat>()?;

    // 将 Mat 转换为字节数据
    let mut buf = opencv::core::Vector::new();
    let params = opencv::core::Vector::new();
    match opencv::imgcodecs::imencode(
        ".png",
        &*js_img_mat.borrow().data().inner,
        &mut buf,
        &params,
    ) {
        Ok(_) => {
            // 使用 arboard 复制图像到剪贴板
            let (width, height, rgba_bytes) = {
                let mat_ref = js_img_mat.borrow();
                let src_mat = &*mat_ref.data().inner;
                let width = src_mat.cols();
                let height = src_mat.rows();
                if width <= 0 || height <= 0 {
                    return Ok(JsValue::new(false));
                }

                let mut rgba_mat = opencv::core::Mat::default();
                let convert_result = match src_mat.channels() {
                    1 => opencv::imgproc::cvt_color(
                        src_mat,
                        &mut rgba_mat,
                        opencv::imgproc::COLOR_GRAY2RGBA,
                        0,
                    ),
                    3 => opencv::imgproc::cvt_color(
                        src_mat,
                        &mut rgba_mat,
                        opencv::imgproc::COLOR_BGR2RGBA,
                        0,
                    ),
                    4 => opencv::imgproc::cvt_color(
                        src_mat,
                        &mut rgba_mat,
                        opencv::imgproc::COLOR_BGRA2RGBA,
                        0,
                    ),
                    _ => return Ok(JsValue::new(false)),
                };
                if convert_result.is_err() {
                    return Ok(JsValue::new(false));
                }

                let rgba_bytes = match rgba_mat.data_bytes() {
                    Ok(bytes) => bytes.to_vec(),
                    Err(_) => return Ok(JsValue::new(false)),
                };
                let expected_len = width as usize * height as usize * 4;
                if rgba_bytes.len() != expected_len {
                    return Ok(JsValue::new(false));
                }

                (width, height, rgba_bytes)
            };

            let mut clipboard = match arboard::Clipboard::new() {
                Ok(clipboard) => clipboard,
                Err(_) => return Ok(JsValue::new(false)),
            };
            let image_data = arboard::ImageData {
                bytes: rgba_bytes.into(),
                width: width as usize,
                height: height as usize,
            };

            match clipboard.set_image(image_data) {
                Ok(_) => Ok(JsValue::new(true)),
                Err(_) => Ok(JsValue::new(false)),
            }
        }
        Err(_) => Ok(JsValue::new(false)),
    }
}

/// 从本地或网络加载图像Mat对象函数
/// 如果 local_path 不为空，先尝试从本地路径加载，失败则从网络下载并保存到本地
/// 如果 local_path 为空，直接从网络加载不保存到本地
fn _imread_url(
    local_path: Option<JsValue>,
    url: Option<JsValue>,
    ctx: &mut Context,
) -> JsResult<JsValue> {
    let local_path = local_path
        .unwrap_or_else(|| JsValue::undefined())
        .to_string(ctx)?
        .to_std_string_lossy();
    let url = url
        .unwrap_or_else(|| JsValue::undefined())
        .to_string(ctx)?
        .to_std_string_lossy();
    let resolved_local_path = _resolve_script_resource_path(&local_path);

    // 如果 local_path 不为空，先尝试从本地加载
    if !local_path.is_empty() {
        if let Ok(mat) = opencv::imgcodecs::imread(&resolved_local_path, opencv::imgcodecs::IMREAD_COLOR)
        {
            let js_mat = Box::new(mat).into_js(ctx)?;
            return Ok(js_mat);
        }
    }

    // 从网络下载
    match reqwest::blocking::get(&url) {
        Ok(response) => {
            if response.status().is_success() {
                match response.bytes() {
                    Ok(bytes) => {
                        // 将字节数据转换为 Vec<u8>
                        let byte_vec: Vec<u8> = bytes.to_vec();

                        // 如果 local_path 不为空，保存原始数据到本地
                        if !local_path.is_empty() {
                            if let Err(_) = std::fs::write(&resolved_local_path, &byte_vec) {
                                return Ok(JsValue::undefined());
                            }
                        }

                        // 将字节数据解码为图像
                        match opencv::imgcodecs::imdecode(
                            &opencv::core::Vector::<u8>::from(byte_vec),
                            opencv::imgcodecs::IMREAD_COLOR,
                        ) {
                            Ok(mat) => {
                                let js_mat = Box::new(mat).into_js(ctx)?;
                                Ok(js_mat)
                            }
                            Err(_) => Ok(JsValue::undefined()),
                        }
                    }
                    Err(_) => Ok(JsValue::undefined()),
                }
            } else {
                Err(js_error!("imread_url failed"))
            }
        }
        Err(_) => Err(js_error!("imread_url failed")),
    }
}

/// 从本地或网络加载图像Mat对象函数
/// 如果 local_path 不为空，先尝试从本地路径加载，失败则从网络下载并保存到本地
/// 如果 local_path 为空，直接从网络加载不保存到本地
fn _imread_url_rgba(
    local_path: Option<JsValue>,
    url: Option<JsValue>,
    ctx: &mut Context,
) -> JsResult<JsValue> {
    let local_path = local_path
        .unwrap_or_else(|| JsValue::undefined())
        .to_string(ctx)?
        .to_std_string_lossy();
    let url = url
        .unwrap_or_else(|| JsValue::undefined())
        .to_string(ctx)?
        .to_std_string_lossy();
    let resolved_local_path = _resolve_script_resource_path(&local_path);

    // 如果 local_path 不为空，先尝试从本地加载
    if !local_path.is_empty() {
        if let Ok(mat) = opencv::imgcodecs::imread(
            &resolved_local_path,
            opencv::imgcodecs::IMREAD_UNCHANGED,
        )
        {
            let js_mat = Box::new(mat).into_js(ctx)?;
            return Ok(js_mat);
        }
    }

    // 从网络下载
    match reqwest::blocking::get(&url) {
        Ok(response) => {
            if response.status().is_success() {
                match response.bytes() {
                    Ok(bytes) => {
                        // 将字节数据转换为 Vec<u8>
                        let byte_vec: Vec<u8> = bytes.to_vec();

                        // 如果 local_path 不为空，保存原始数据到本地
                        if !local_path.is_empty() {
                            if let Err(_) = std::fs::write(&resolved_local_path, &byte_vec) {
                                return Ok(JsValue::undefined());
                            }
                        }

                        // 将字节数据解码为图像
                        match opencv::imgcodecs::imdecode(
                            &opencv::core::Vector::<u8>::from(byte_vec),
                            opencv::imgcodecs::IMREAD_COLOR,
                        ) {
                            Ok(mat) => {
                                let js_mat = Box::new(mat).into_js(ctx)?;
                                Ok(js_mat)
                            }
                            Err(_) => Ok(JsValue::undefined()),
                        }
                    }
                    Err(_) => Ok(JsValue::undefined()),
                }
            } else {
                Err(js_error!("imread_url_rgba failed"))
            }
        }
        Err(_) => Err(js_error!("imread_url_rgba failed")),
    }
}

/// 初始化 OCR 模块（自动下载缺失资源）。
///
/// 参数：
/// - `local_root_dir`：可选，本地资源目录（为空时使用默认目录）；
/// - `cdn_base_url`：可选，CDN 根地址（默认 `https://cdn.dna-builder.cn/ocr`）；
/// - `num_thread`：可选，OCR 线程数（默认 2）。
///
/// 返回：
/// - 实际使用的本地资源目录绝对路径。
fn _init_ocr(
    local_root_dir: Option<JsValue>,
    cdn_base_url: Option<JsValue>,
    num_thread: Option<JsValue>,
    ctx: &mut Context,
) -> JsResult<JsValue> {
    let local_root_dir = local_root_dir.unwrap_or_else(|| JsValue::undefined());
    let cdn_base_url = cdn_base_url.unwrap_or_else(|| JsValue::undefined());
    let num_thread = num_thread.unwrap_or_else(|| JsValue::new(2.0));

    let local_root_dir = if local_root_dir.is_undefined() || local_root_dir.is_null() {
        None
    } else {
        let raw = local_root_dir.to_string(ctx)?.to_std_string_lossy();
        let normalized = raw.trim().to_string();
        if normalized.is_empty() {
            None
        } else {
            Some(PathBuf::from(_resolve_script_resource_path(&normalized)))
        }
    };

    let cdn_base_url = if cdn_base_url.is_undefined() || cdn_base_url.is_null() {
        None
    } else {
        let raw = cdn_base_url.to_string(ctx)?.to_std_string_lossy();
        let normalized = raw.trim().to_string();
        if normalized.is_empty() {
            None
        } else {
            Some(normalized)
        }
    };

    let num_thread = num_thread.to_number(ctx)? as i32;
    let config = OcrInitConfig {
        local_root_dir,
        cdn_base_url,
        num_thread,
    };
    let root_dir = ocr::init_ocr(config)
        .map_err(|e| JsNativeError::error().with_message(format!("initOcr 失败: {e}")))?;
    Ok(JsValue::from(js_string!(root_dir.to_string_lossy().to_string())))
}

/// OCR 文字识别：输入 Mat，返回识别文本。
fn _ocr_text(js_img_mat: Option<JsValue>, _ctx: &mut Context) -> JsResult<JsValue> {
    let js_img_mat = js_img_mat
        .unwrap_or_else(|| JsValue::undefined())
        .get_native::<JsMat>()?;
    let mat = (*js_img_mat.borrow().data().inner).clone();
    let text = ocr::ocr_text_from_mat(&mat)
        .map_err(|e| JsNativeError::error().with_message(format!("ocrText 失败: {e}")))?;
    Ok(JsValue::from(js_string!(text)))
}

/// 显示图片函数 (异步)
fn _imshow(
    title: Option<JsValue>,
    js_img_mat: Option<JsValue>,
    wait_key_ms: Option<JsValue>,
    ctx: &mut Context,
) -> JsResult<JsValue> {
    let (promise, resolvers) = JsPromise::new_pending(ctx);
    let js_img_mat = js_img_mat.unwrap_or_else(|| JsValue::undefined());
    let js_img_mat = js_img_mat.get_native::<JsMat>()?;

    let title = title
        .unwrap_or_else(|| JsValue::undefined())
        .to_string(ctx)?
        .to_std_string_lossy();
    let wait_key_ms = wait_key_ms.unwrap_or_else(|| js_value!(0)).to_number(ctx)? as i32;

    let mat_clone = (*js_img_mat.borrow().data().inner).clone();
    let sender = _get_imshow_sender();
    let delay_ms = wait_key_ms.max(0) as u64;

    ctx.enqueue_job(
        NativeAsyncJob::new(async move |context| {
            let _ = sender.send(ImshowCommand::Show {
                title,
                mat: mat_clone,
            });
            if delay_ms > 0 {
                thread::sleep(Duration::from_millis(delay_ms));
            }

            let context = &mut context.borrow_mut();
            resolvers.resolve.call(&JsValue::undefined(), &[], context)
        })
        .into(),
    );

    Ok(promise.into())
}

/// 交互式选择图像 ROI 区域函数（异步）
///
/// 在独立线程中弹出窗口，用户按回车/空格确认选区，按 c 取消。
/// 取消时返回 `undefined`，确认时返回 `[x, y, w, h]`。
fn _select_roi(
    title: Option<JsValue>,
    js_img_mat: Option<JsValue>,
    show_crosshair: Option<JsValue>,
    from_center: Option<JsValue>,
    print_notice: Option<JsValue>,
    ctx: &mut Context,
) -> JsResult<JsValue> {
    let (promise, resolvers) = JsPromise::new_pending(ctx);
    let js_img_mat = js_img_mat.unwrap_or_else(|| JsValue::undefined());
    let js_img_mat = js_img_mat.get_native::<JsMat>()?;

    let title = title
        .unwrap_or_else(|| JsValue::from(js_string!("selectroi")))
        .to_string(ctx)?
        .to_std_string_lossy();
    let show_crosshair = show_crosshair
        .unwrap_or_else(|| JsValue::new(true))
        .to_boolean();
    let from_center = from_center
        .unwrap_or_else(|| JsValue::new(false))
        .to_boolean();
    let print_notice = print_notice
        .unwrap_or_else(|| JsValue::new(true))
        .to_boolean();

    let mat_clone = (*js_img_mat.borrow().data().inner).clone();
    let resolvers_clone = resolvers.clone();

    ctx.enqueue_job(
        NativeAsyncJob::new(async move |context| {
            let async_result = tokio::task::spawn_blocking(move || {
                let roi_result = opencv::highgui::select_roi(
                    &title,
                    &mat_clone,
                    show_crosshair,
                    from_center,
                    print_notice,
                );
                let _ = opencv::highgui::destroy_window(&title);

                roi_result.map(|rect| {
                    if rect.width > 0 && rect.height > 0 {
                        Some((rect.x, rect.y, rect.width, rect.height))
                    } else {
                        None
                    }
                })
            })
            .await;

            let context = &mut context.borrow_mut();
            match async_result {
                Ok(Ok(Some((x, y, w, h)))) => resolvers_clone.resolve.call(
                    &JsValue::undefined(),
                    &[js_value!([x, y, w, h], context)],
                    context,
                ),
                Ok(Ok(None)) => resolvers_clone
                    .resolve
                    .call(&JsValue::undefined(), &[], context),
                Ok(Err(e)) => {
                    let msg = format!("selectroi 失败: {e}");
                    resolvers_clone.reject.call(
                        &JsValue::undefined(),
                        &[JsValue::from(js_string!(msg))],
                        context,
                    )
                }
                Err(e) => {
                    let msg = format!("selectroi 线程执行失败: {e}");
                    resolvers_clone.reject.call(
                        &JsValue::undefined(),
                        &[JsValue::from(js_string!(msg))],
                        context,
                    )
                }
            }
        })
        .into(),
    );

    Ok(promise.into())
}

/// 颜色键过滤函数，返回根据色键过滤后的灰度图像。
fn _color_filter(
    js_img_mat: Option<JsValue>,
    colors: Option<JsValue>,
    tolerance: Option<JsValue>,
    ctx: &mut Context,
) -> JsResult<JsValue> {
    let js_img_mat = js_img_mat
        .unwrap_or_else(|| JsValue::undefined())
        .get_native::<JsMat>()?;
    let img_mat = (*js_img_mat.borrow().data().inner).clone();

    let colors = _parse_u32_array(colors.unwrap_or_else(|| JsValue::undefined()), ctx)?;
    let tolerance = tolerance.unwrap_or_else(|| js_value!(0)).to_number(ctx)?;
    let tolerance = tolerance.clamp(0.0, 255.0) as u8;

    match color_filter_impl(&img_mat, &colors, tolerance) {
        Ok(mask) => Box::new(mask).into_js(ctx),
        Err(msg) => Err(JsNativeError::error().with_message(msg).into()),
    }
}

/// HSL 加权色键过滤函数，返回根据色键过滤后的灰度图像。
fn _color_filter_hsl(
    js_img_mat: Option<JsValue>,
    colors: Option<JsValue>,
    tolerance: Option<JsValue>,
    ctx: &mut Context,
) -> JsResult<JsValue> {
    let js_img_mat = js_img_mat
        .unwrap_or_else(|| JsValue::undefined())
        .get_native::<JsMat>()?;
    let img_mat = (*js_img_mat.borrow().data().inner).clone();

    let colors = _parse_u32_array(colors.unwrap_or_else(|| JsValue::undefined()), ctx)?;
    let tolerance = tolerance.unwrap_or_else(|| js_value!(0.0)).to_number(ctx)?;
    let tolerance = if tolerance.is_finite() {
        tolerance.max(0.0)
    } else {
        0.0
    };

    match color_filter_hsl_impl(&img_mat, &colors, tolerance) {
        Ok(mask) => Box::new(mask).into_js(ctx),
        Err(msg) => Err(JsNativeError::error().with_message(msg).into()),
    }
}

/// 色键匹配函数，返回匹配像素均值最大的颜色索引（支持最小 mean 与颜色容差）。
fn _color_key_match(
    js_img_mat: Option<JsValue>,
    colors: Option<JsValue>,
    min_mean: Option<JsValue>,
    tolerance: Option<JsValue>,
    ctx: &mut Context,
) -> JsResult<JsValue> {
    let js_img_mat = js_img_mat
        .unwrap_or_else(|| JsValue::undefined())
        .get_native::<JsMat>()?;
    let img_mat = (*js_img_mat.borrow().data().inner).clone();

    let colors = _parse_u32_array(colors.unwrap_or_else(|| JsValue::undefined()), ctx)?;
    let min_mean = min_mean.unwrap_or_else(|| js_value!(0.0)).to_number(ctx)?;
    let min_mean = if min_mean.is_finite() {
        min_mean.max(0.0)
    } else {
        0.0
    };
    let tolerance = tolerance.unwrap_or_else(|| js_value!(0)).to_number(ctx)?;
    let tolerance = tolerance.clamp(0.0, 255.0) as u8;

    let index = color_key_match_impl(&img_mat, &colors, min_mean, tolerance)
        .map_err(|msg| JsNativeError::error().with_message(msg))?;
    Ok(JsValue::new(index))
}

/// 批量颜色模板匹配函数，返回首个命中模板的位置和索引。
fn _batch_match_color(
    js_src_mat: Option<JsValue>,
    js_tpl_mats: Option<JsValue>,
    cap: Option<JsValue>,
    ctx: &mut Context,
) -> JsResult<JsValue> {
    let js_src_mat = js_src_mat
        .unwrap_or_else(|| JsValue::undefined())
        .get_native::<JsMat>()?;
    let src_mat = (*js_src_mat.borrow().data().inner).clone();

    let tpl_mats = _parse_mat_array(js_tpl_mats.unwrap_or_else(|| JsValue::undefined()), ctx)?;
    let cap = cap.unwrap_or_else(|| js_value!(0.8)).to_number(ctx)?;
    let cap = cap.clamp(0.0, 1.0);

    match batch_match_color_impl(&src_mat, tpl_mats, cap) {
        Ok(Some((index, x, y))) => {
            let pos = js_value!([x, y], ctx);
            let result = js_object!({
                pos: pos,
                index: index,
            }, ctx);

            Ok(result.into())
        }
        Ok(None) => Ok(JsValue::undefined()),
        Err(msg) => Err(JsNativeError::error().with_message(msg).into()),
    }
}

/// ORB 特征比较函数，返回优质匹配数量。
fn _orb_match_count(
    js_img1_mat: Option<JsValue>,
    js_img2_mat: Option<JsValue>,
    _ctx: &mut Context,
) -> JsResult<JsValue> {
    let js_img1_mat = js_img1_mat
        .unwrap_or_else(|| JsValue::undefined())
        .get_native::<JsMat>()?;
    let img1_mat = (*js_img1_mat.borrow().data().inner).clone();

    let js_img2_mat = js_img2_mat
        .unwrap_or_else(|| JsValue::undefined())
        .get_native::<JsMat>()?;
    let img2_mat = (*js_img2_mat.borrow().data().inner).clone();

    let count = orb_match_count_impl(&img1_mat, &img2_mat)
        .map_err(|msg| JsNativeError::error().with_message(msg))?;
    Ok(JsValue::new(count))
}

/// SIFT 匹配定位函数，返回 img2 在 img1 中的坐标与尺寸信息。
fn _sift_locate(
    js_img1_mat: Option<JsValue>,
    js_img2_mat: Option<JsValue>,
    ctx: &mut Context,
) -> JsResult<JsValue> {
    let js_img1_mat = js_img1_mat
        .unwrap_or_else(|| JsValue::undefined())
        .get_native::<JsMat>()?;
    let img1_mat = (*js_img1_mat.borrow().data().inner).clone();

    let js_img2_mat = js_img2_mat
        .unwrap_or_else(|| JsValue::undefined())
        .get_native::<JsMat>()?;
    let img2_mat = (*js_img2_mat.borrow().data().inner).clone();

    let result = sift_locate_impl(&img1_mat, &img2_mat)
        .map_err(|msg| JsNativeError::error().with_message(msg))?;

    let Some((x, y, w, h, good_matches, inliers, corners)) = result else {
        return Ok(JsValue::undefined());
    };

    let js_corners = JsArray::new(ctx);
    for point in corners {
        js_corners.push(js_value!([point.x, point.y], ctx), ctx)?;
    }

    let result_obj = js_object!(
        {
            pos: js_value!([x, y], ctx),
            size: js_value!([w, h], ctx),
            bbox: js_value!([x, y, w, h], ctx),
            goodMatches: good_matches,
            inliers: inliers,
            corners: js_corners,
        },
        ctx
    );

    Ok(result_obj.into())
}

/// 计算输入图像的感知哈希（支持彩色模式）。
fn _perceptual_hash(
    js_img_mat: Option<JsValue>,
    color: Option<JsValue>,
    _ctx: &mut Context,
) -> JsResult<JsValue> {
    let js_img_mat = js_img_mat
        .unwrap_or_else(|| JsValue::undefined())
        .get_native::<JsMat>()?;
    let img_mat = (*js_img_mat.borrow().data().inner).clone();
    let color = color.is_some_and(|v| v.to_boolean());

    let hash = perceptual_hash_impl(&img_mat, color)
        .map_err(|msg| JsNativeError::error().with_message(msg))?;
    Ok(JsValue::from(js_string!(hash)))
}

/// 计算输入图像的 ORB 特征哈希（固定 64 位十六进制字符串）。
fn _orb_feature_hash(js_img_mat: Option<JsValue>, _ctx: &mut Context) -> JsResult<JsValue> {
    let js_img_mat = js_img_mat
        .unwrap_or_else(|| JsValue::undefined())
        .get_native::<JsMat>()?;
    let img_mat = (*js_img_mat.borrow().data().inner).clone();

    let hash =
        orb_feature_hash_impl(&img_mat).map_err(|msg| JsNativeError::error().with_message(msg))?;
    Ok(JsValue::from(js_string!(hash)))
}

/// 预测罗盘/圆盘类图像朝向角度（单位：度，范围 0-359）。
fn _predict_rotation(js_img_mat: Option<JsValue>, _ctx: &mut Context) -> JsResult<JsValue> {
    let js_img_mat = js_img_mat
        .unwrap_or_else(|| JsValue::undefined())
        .get_native::<JsMat>()?;
    let img_mat = (*js_img_mat.borrow().data().inner).clone();

    let angle = predict_rotation(&img_mat)
        .map_err(|e| JsNativeError::error().with_message(e.to_string()))?;
    Ok(JsValue::new(angle))
}

/// 比较源哈希和模板哈希数组的汉明距离，返回最佳匹配索引或 -1。
fn _match_hamming_hash(
    source_hash: Option<JsValue>,
    template_hashes: Option<JsValue>,
    max_distance: Option<JsValue>,
    ctx: &mut Context,
) -> JsResult<JsValue> {
    let source_hash = source_hash
        .unwrap_or_else(|| JsValue::undefined())
        .to_string(ctx)?
        .to_std_string_lossy();
    let source_hash =
        normalize_hash_hex(&source_hash).map_err(|msg| JsNativeError::error().with_message(msg))?;

    let template_hashes =
        _parse_string_array(template_hashes.unwrap_or_else(|| JsValue::undefined()), ctx)?;
    let max_distance = max_distance
        .unwrap_or_else(|| js_value!(0))
        .to_number(ctx)?;
    let max_distance = if max_distance.is_finite() {
        max_distance.max(0.0) as u32
    } else {
        0
    };

    let mut best_index: i32 = -1;
    let mut best_distance = u32::MAX;
    for (index, template_hash) in template_hashes.iter().enumerate() {
        let normalized = normalize_hash_hex(template_hash)
            .map_err(|msg| JsNativeError::error().with_message(msg))?;
        if normalized.len() != source_hash.len() {
            continue;
        }
        let distance = hamming_distance_hex(&source_hash, &normalized)
            .map_err(|msg| JsNativeError::error().with_message(msg))?;
        if distance <= max_distance && distance < best_distance {
            best_distance = distance;
            best_index = index as i32;
            if distance == 0 {
                break;
            }
        }
    }

    Ok(JsValue::new(best_index))
}

/// 比较 ORB 哈希和模板哈希数组，返回最佳匹配索引或 -1。
fn _match_orb_hash(
    source_hash: Option<JsValue>,
    template_hashes: Option<JsValue>,
    max_distance: Option<JsValue>,
    ctx: &mut Context,
) -> JsResult<JsValue> {
    let source_hash = source_hash
        .unwrap_or_else(|| JsValue::undefined())
        .to_string(ctx)?
        .to_std_string_lossy();

    let template_hashes =
        _parse_string_array(template_hashes.unwrap_or_else(|| JsValue::undefined()), ctx)?;
    let max_distance = max_distance
        .unwrap_or_else(|| js_value!(0))
        .to_number(ctx)?;
    let max_distance = if max_distance.is_finite() {
        max_distance.max(0.0) as u32
    } else {
        0
    };

    let best_index = match_orb_hash_impl(&source_hash, &template_hashes, max_distance)
        .map_err(|msg| JsNativeError::error().with_message(msg))?;
    Ok(JsValue::new(best_index))
}

/// 形态学图像处理函数，支持开闭运算、腐蚀、膨胀等操作。
fn _morphology_ex(
    js_img_mat: Option<JsValue>,
    op: Option<JsValue>,
    kernel_size: Option<JsValue>,
    iterations: Option<JsValue>,
    shape: Option<JsValue>,
    ctx: &mut Context,
) -> JsResult<JsValue> {
    let js_img_mat = js_img_mat
        .unwrap_or_else(|| JsValue::undefined())
        .get_native::<JsMat>()?;
    let img_mat = (*js_img_mat.borrow().data().inner).clone();

    let op = _parse_morphology_op(op, ctx)?;
    let shape = _parse_morphology_shape(shape, ctx)?;
    let kernel_size = kernel_size.unwrap_or_else(|| js_value!(3)).to_number(ctx)? as i32;
    let iterations = iterations.unwrap_or_else(|| js_value!(1)).to_number(ctx)? as i32;

    match morphology_ex_impl(&img_mat, op, kernel_size, iterations, shape) {
        Ok(dst) => Box::new(dst).into_js(ctx),
        Err(msg) => Err(JsNativeError::error().with_message(msg).into()),
    }
}

/// 轮廓提取函数，返回轮廓信息列表（面积、外接矩形、中心点）。
fn _find_contours(
    js_img_mat: Option<JsValue>,
    min_area: Option<JsValue>,
    mode: Option<JsValue>,
    method: Option<JsValue>,
    ctx: &mut Context,
) -> JsResult<JsValue> {
    let js_img_mat = js_img_mat
        .unwrap_or_else(|| JsValue::undefined())
        .get_native::<JsMat>()?;
    let img_mat = (*js_img_mat.borrow().data().inner).clone();

    // 兼容旧参数顺序: findContours(img, mode, method, minArea)
    // 新参数顺序: findContours(img, minArea, mode, method)
    let (raw_min_area, raw_mode, raw_method) = if min_area.as_ref().is_some_and(JsValue::is_string)
    {
        (method, min_area, mode)
    } else {
        (min_area, mode, method)
    };

    let mode = _parse_contour_mode(raw_mode, ctx)?;
    let method = _parse_contour_method(raw_method, ctx)?;
    let min_area = raw_min_area
        .unwrap_or_else(|| js_value!(0.0))
        .to_number(ctx)?;
    let min_area = if min_area.is_finite() {
        min_area.max(0.0)
    } else {
        0.0
    };

    let contours = find_contours_impl(&img_mat, mode, method, min_area)
        .map_err(|msg| JsNativeError::error().with_message(msg))?;

    let result = JsArray::new(ctx);
    for (area, rect, center) in contours {
        let contour_obj = js_object!(
            {
                area: area,
                bbox: js_value!([rect.x, rect.y, rect.width, rect.height], ctx),
                center: js_value!([center.0, center.1], ctx),
            },
            ctx
        );

        result.push(contour_obj, ctx)?;
    }

    Ok(result.into())
}

/// 单行文本字符分割函数（基于灰度图 + 横向空隙检测）。
///
/// 参数：
/// - `js_img_mat`: 输入图像 Mat（建议灰度图；彩色会自动转灰度）
/// - `min_gap_width`: 最小分割空隙宽度，默认 2
/// - `min_char_width`: 最小字符宽度，默认 2
///
/// 返回：
/// - `[[x, y, w, h], ...]`，按从左到右排序的 bbox 数组
fn _segment_chars(
    js_img_mat: Option<JsValue>,
    min_gap_width: Option<JsValue>,
    min_char_width: Option<JsValue>,
    ctx: &mut Context,
) -> JsResult<JsValue> {
    let js_img_mat = js_img_mat
        .unwrap_or_else(|| JsValue::undefined())
        .get_native::<JsMat>()?;
    let img_mat = (*js_img_mat.borrow().data().inner).clone();

    let min_gap_width = min_gap_width
        .unwrap_or_else(|| js_value!(2))
        .to_number(ctx)? as i32;
    let min_char_width = min_char_width
        .unwrap_or_else(|| js_value!(2))
        .to_number(ctx)? as i32;

    let bboxes = segment_single_line_chars_impl(&img_mat, min_gap_width, min_char_width)
        .map_err(|msg| JsNativeError::error().with_message(msg))?;

    let result = JsArray::new(ctx);
    for (x, y, w, h) in bboxes {
        result.push(js_value!([x, y, w, h], ctx), ctx)?;
    }

    Ok(result.into())
}

/// 轮廓绘制函数，返回绘制后的图像（BGR）。
fn _draw_contours(
    js_img_mat: Option<JsValue>,
    min_area: Option<JsValue>,
    mode: Option<JsValue>,
    method: Option<JsValue>,
    color: Option<JsValue>,
    thickness: Option<JsValue>,
    ctx: &mut Context,
) -> JsResult<JsValue> {
    let js_img_mat = js_img_mat
        .unwrap_or_else(|| JsValue::undefined())
        .get_native::<JsMat>()?;
    let img_mat = (*js_img_mat.borrow().data().inner).clone();

    // 新增模式：drawContours(img, bboxes, color?, thickness?)
    // 其中 bboxes 支持 [[x,y,w,h], ...] 或 [{ bbox: [x,y,w,h] }, ...]
    let is_bbox_mode = min_area
        .as_ref()
        .and_then(JsValue::as_object)
        .is_some_and(|obj| JsArray::from_object(obj.clone()).is_ok());
    if is_bbox_mode {
        let bboxes = _parse_bbox_array(min_area.unwrap_or_else(|| JsValue::undefined()), ctx)?;
        // 在 bbox 模式下，第三、四参数分别映射为 color/thickness
        let draw_color = color
            .or(mode)
            .unwrap_or_else(|| js_value!(0x00FF00))
            .to_number(ctx)? as u32
            & 0x00FF_FFFF;
        let draw_thickness = thickness
            .or(method)
            .unwrap_or_else(|| js_value!(1))
            .to_number(ctx)? as i32;

        return match draw_bboxes_impl(&img_mat, &bboxes, draw_color, draw_thickness.max(1)) {
            Ok(dst) => Box::new(dst).into_js(ctx),
            Err(msg) => Err(JsNativeError::error().with_message(msg).into()),
        };
    }

    // 兼容旧参数顺序: drawContours(img, mode, method, minArea, color, thickness)
    // 新参数顺序: drawContours(img, minArea, mode, method, color, thickness)
    let (raw_min_area, raw_mode, raw_method) = if min_area.as_ref().is_some_and(JsValue::is_string)
    {
        (method, min_area, mode)
    } else {
        (min_area, mode, method)
    };

    let mode = _parse_contour_mode(raw_mode, ctx)?;
    let method = _parse_contour_method(raw_method, ctx)?;
    let min_area = raw_min_area
        .unwrap_or_else(|| js_value!(0.0))
        .to_number(ctx)?;
    let min_area = if min_area.is_finite() {
        min_area.max(0.0)
    } else {
        0.0
    };

    let color = color
        .unwrap_or_else(|| js_value!(0x00FF00))
        .to_number(ctx)? as u32
        & 0x00FF_FFFF;
    let thickness = thickness.unwrap_or_else(|| js_value!(1)).to_number(ctx)? as i32;
    let thickness = thickness.max(1);

    match draw_contours_impl(&img_mat, mode, method, min_area, color, thickness) {
        Ok(dst) => Box::new(dst).into_js(ctx),
        Err(msg) => Err(JsNativeError::error().with_message(msg).into()),
    }
}

/// 使用两个Mat对象进行颜色和模板匹配函数
fn _find_color_and_match_template(
    js_img_mat: Option<JsValue>,
    js_tpl_mat: Option<JsValue>,
    color: Option<JsValue>,
    tolerance: Option<JsValue>,
    ctx: &mut Context,
) -> JsResult<JsValue> {
    // 获取第一个参数 (图像Mat)
    let js_img_mat = js_img_mat
        .unwrap_or_else(|| JsValue::undefined())
        .get_native::<JsMat>()?;

    // 获取第二个参数 (模板Mat)
    let js_tpl_mat = js_tpl_mat
        .unwrap_or_else(|| JsValue::undefined())
        .get_native::<JsMat>()?;

    // 获取颜色参数
    let color = color
        .unwrap_or_else(|| JsValue::undefined())
        .to_number(ctx)? as u32;
    let tolerance = tolerance
        .unwrap_or_else(|| JsValue::undefined())
        .to_number(ctx)? as u8;
    let bgr_color = rgb_to_bgr(color);

    let (promise, resolvers) = JsPromise::new_pending(ctx);
    let img_mat = (*js_img_mat.borrow().data().inner).clone();
    let tpl_mat = (*js_tpl_mat.borrow().data().inner).clone();
    let resolvers_clone = resolvers.clone();

    ctx.enqueue_job(
        NativeAsyncJob::new(async move |context| {
            let async_result = tokio::task::spawn_blocking(move || {
                find_color_and_match_template(&img_mat, &tpl_mat, bgr_color, tolerance)
            })
            .await;

            let context = &mut context.borrow_mut();
            match async_result {
                Ok(Ok(Some((x, y)))) => resolvers_clone.resolve.call(
                    &JsValue::undefined(),
                    &[js_value!([x, y], context)],
                    context,
                ),
                Ok(Ok(None)) => resolvers_clone
                    .resolve
                    .call(&JsValue::undefined(), &[], context),
                Ok(Err(e)) => {
                    let msg = format!("findColorAndMatchTemplate 匹配失败: {:?}", e);
                    resolvers_clone.reject.call(
                        &JsValue::undefined(),
                        &[JsValue::from(js_string!(msg))],
                        context,
                    )
                }
                Err(e) => {
                    let msg = format!("findColorAndMatchTemplate 线程执行失败: {e}");
                    resolvers_clone.reject.call(
                        &JsValue::undefined(),
                        &[JsValue::from(js_string!(msg))],
                        context,
                    )
                }
            }
        })
        .into(),
    );

    Ok(promise.into())
}

/// 模板匹配函数
fn _match_template(
    js_img_mat: Option<JsValue>,
    js_tpl_mat: Option<JsValue>,
    tolerance: Option<JsValue>,
    ctx: &mut Context,
) -> JsResult<JsValue> {
    // 获取第一个参数 (图像Mat)
    let js_img_mat = js_img_mat
        .unwrap_or_else(|| JsValue::undefined())
        .get_native::<JsMat>()?;

    // 获取第二个参数 (模板Mat)
    let js_tpl_mat = js_tpl_mat
        .unwrap_or_else(|| JsValue::undefined())
        .get_native::<JsMat>()?;

    // 获取容差参数
    let tolerance = tolerance
        .unwrap_or_else(|| JsValue::undefined())
        .to_number(ctx)? as f64;

    let (promise, resolvers) = JsPromise::new_pending(ctx);
    let img_mat = (*js_img_mat.borrow().data().inner).clone();
    let tpl_mat = (*js_tpl_mat.borrow().data().inner).clone();
    let resolvers_clone = resolvers.clone();

    ctx.enqueue_job(
        NativeAsyncJob::new(async move |context| {
            let async_result =
                tokio::task::spawn_blocking(move || match_template(&img_mat, &tpl_mat, tolerance))
                    .await;

            let context = &mut context.borrow_mut();
            match async_result {
                Ok(Ok(Some((x, y)))) => resolvers_clone.resolve.call(
                    &JsValue::undefined(),
                    &[js_value!([x, y], context)],
                    context,
                ),
                Ok(Ok(None)) => resolvers_clone
                    .resolve
                    .call(&JsValue::undefined(), &[], context),
                Ok(Err(e)) => {
                    let msg = format!("matchTemplate 匹配失败: {:?}", e);
                    resolvers_clone.reject.call(
                        &JsValue::undefined(),
                        &[JsValue::from(js_string!(msg))],
                        context,
                    )
                }
                Err(e) => {
                    let msg = format!("matchTemplate 线程执行失败: {e}");
                    resolvers_clone.reject.call(
                        &JsValue::undefined(),
                        &[JsValue::from(js_string!(msg))],
                        context,
                    )
                }
            }
        })
        .into(),
    );

    Ok(promise.into())
}

/// 颜色矩阵检查函数
fn _cc(
    js_img_mat: Option<JsValue>,
    x: Option<JsValue>,
    y: Option<JsValue>,
    color: Option<JsValue>,
    tolerance: Option<JsValue>,
    ctx: &mut Context,
) -> JsResult<JsValue> {
    // 获取第一个参数 (图像Mat)
    let js_img_mat = js_img_mat
        .unwrap_or_else(|| JsValue::undefined())
        .get_native::<JsMat>()?;

    let x = x.unwrap_or_else(|| JsValue::undefined()).to_number(ctx)? as i32;
    let y = y.unwrap_or_else(|| JsValue::undefined()).to_number(ctx)? as i32;
    let color = color
        .unwrap_or_else(|| JsValue::undefined())
        .to_number(ctx)? as u32;
    let tolerance = tolerance
        .unwrap_or_else(|| JsValue::undefined())
        .to_number(ctx)? as u8;

    Ok(JsValue::new(check_color_mat(
        &js_img_mat.borrow().data().inner,
        x,
        y,
        color,
        tolerance,
    )))
}

/// 等待窗口指定坐标颜色达到条件（异步）。
///
/// 规则：
/// - `tolerance >= 0`：等待颜色“满足”条件后返回 `true`。
/// - `tolerance < 0`：等待颜色“变为不满足”条件后返回 `true`。
/// - 超时后返回 `false`。
fn _wait_color(
    hwnd: Option<JsValue>,
    x: Option<JsValue>,
    y: Option<JsValue>,
    color: Option<JsValue>,
    tolerance: Option<JsValue>,
    timeout: Option<JsValue>,
    ctx: &mut Context,
) -> JsResult<JsValue> {
    let hwnd_raw = hwnd
        .unwrap_or_else(|| JsValue::undefined())
        .to_number(ctx)? as isize;
    let x = x.unwrap_or_else(|| JsValue::undefined()).to_number(ctx)? as i32;
    let y = y.unwrap_or_else(|| JsValue::undefined()).to_number(ctx)? as i32;
    let color = color
        .unwrap_or_else(|| JsValue::undefined())
        .to_number(ctx)? as u32;

    let tolerance_raw = tolerance.unwrap_or_else(|| js_value!(0)).to_number(ctx)?;
    let wait_for_match = tolerance_raw >= 0.0;
    let tolerance_abs = tolerance_raw.abs().clamp(0.0, 255.0) as u8;

    let timeout_raw = timeout
        .unwrap_or_else(|| js_value!(20_000))
        .to_number(ctx)?;
    let timeout_ms = if timeout_raw.is_finite() {
        timeout_raw.clamp(0.0, u64::MAX as f64) as u64
    } else {
        20_000_u64
    };

    let (promise, resolvers) = JsPromise::new_pending(ctx);
    let resolvers_clone = resolvers.clone();
    ctx.enqueue_job(
        NativeAsyncJob::new(async move |context| {
            let async_result = tokio::task::spawn_blocking(move || {
                let hwnd = HWND(hwnd_raw as *mut std::ffi::c_void);
                let deadline = Duration::from_millis(timeout_ms);
                let start = std::time::Instant::now();
                let poll_interval = Duration::from_millis(30);

                loop {
                    if let Some(img_mat) = capture_window_wgc(hwnd) {
                        let matched = check_color_mat(&img_mat, x, y, color, tolerance_abs);
                        let condition_met = if wait_for_match { matched } else { !matched };
                        if condition_met {
                            return true;
                        }
                    }

                    if start.elapsed() >= deadline {
                        return false;
                    }
                    thread::sleep(poll_interval);
                }
            })
            .await;

            let context = &mut context.borrow_mut();
            match async_result {
                Ok(result) => resolvers_clone.resolve.call(
                    &JsValue::undefined(),
                    &[JsValue::new(result)],
                    context,
                ),
                Err(e) => {
                    let msg = format!("waitColor 线程执行失败: {e}");
                    resolvers_clone.reject.call(
                        &JsValue::undefined(),
                        &[JsValue::from(js_string!(msg))],
                        context,
                    )
                }
            }
        })
        .into(),
    );

    Ok(promise.into())
}

/// 读取脚本配置项并返回当前值。
///
/// 行为说明：
/// 1. 每次调用都会向前端发送事件，请求创建/更新配置 UI；
/// 2. 前端持久化配置并回传当前值；
/// 3. 若回传超时或异常，则返回默认值。
fn _read_config(
    name: Option<JsValue>,
    desc: Option<JsValue>,
    format: Option<JsValue>,
    default_value: Option<JsValue>,
    ctx: &mut Context,
) -> JsResult<JsValue> {
    let name = name
        .unwrap_or_else(|| JsValue::undefined())
        .to_string(ctx)?
        .to_std_string_lossy()
        .trim()
        .to_string();
    if name.is_empty() {
        return Err(JsNativeError::typ().with_message("readConfig name 不能为空").into());
    }

    let desc = desc
        .unwrap_or_else(|| JsValue::from(js_string!("")))
        .to_string(ctx)?
        .to_std_string_lossy();
    let format_spec = _parse_script_config_format(format, ctx)?;
    let default_value = _coerce_js_to_script_config_value(
        default_value.unwrap_or_else(|| JsValue::undefined()),
        &format_spec,
        ctx,
    )?;

    let Some(app_handle) = SCRIPT_EVENT_APP_HANDLE.get() else {
        return _script_config_value_to_js(&default_value, ctx);
    };

    let request_id = _next_script_config_request_id();
    let (tx, rx) = mpsc::channel::<serde_json::Value>();
    {
        let mut pending = _script_config_pending_map()
            .lock()
            .map_err(|e| JsNativeError::error().with_message(format!("配置请求映射锁失败: {e:?}")))?;
        pending.insert(request_id.clone(), tx);
    }

    let emit_result = app_handle.emit(
        "script-read-config",
        serde_json::json!({
            "requestId": request_id,
            "scope": _current_script_scope_name(),
            "name": name,
            "desc": desc,
            "kind": format_spec.kind.as_str(),
            "options": format_spec.options.clone(),
            "defaultValue": _script_config_value_to_json(&default_value),
        }),
    );
    if let Err(e) = emit_result {
        let mut pending = _script_config_pending_map()
            .lock()
            .map_err(|lock_err| JsNativeError::error().with_message(format!("配置请求映射锁失败: {lock_err:?}")))?;
        pending.remove(&request_id);
        return Err(JsNativeError::error()
            .with_message(format!("发送 script-read-config 事件失败: {e}"))
            .into());
    }

    let response = rx.recv_timeout(Duration::from_secs(10)).ok();
    {
        let mut pending = _script_config_pending_map()
            .lock()
            .map_err(|e| JsNativeError::error().with_message(format!("配置请求映射锁失败: {e:?}")))?;
        pending.remove(&request_id);
    }

    let result_value = if let Some(response_value) = response {
        _coerce_json_to_script_config_value(&response_value, &format_spec, &default_value)
    } else {
        default_value
    };

    _script_config_value_to_js(&result_value, ctx)
}

/// 寻路函数
fn _find_path(
    js_left_image: Option<JsValue>,
    js_right_image: Option<JsValue>,
    start_x: Option<JsValue>,
    start_y: Option<JsValue>,
    end_x: Option<JsValue>,
    end_y: Option<JsValue>,
    num_disp: Option<JsValue>,
    block_size: Option<JsValue>,
    strategy: Option<JsValue>,
    ctx: &mut Context,
) -> JsResult<JsValue> {
    // 获取第一个参数 (左图Mat)
    let js_left_image = js_left_image
        .unwrap_or_else(|| JsValue::undefined())
        .get_native::<JsMat>()?;

    // 获取第二个参数 (右图Mat)
    let js_right_image = js_right_image
        .unwrap_or_else(|| JsValue::undefined())
        .get_native::<JsMat>()?;

    let start_x = start_x
        .unwrap_or_else(|| JsValue::undefined())
        .to_number(ctx)? as i32;
    let start_y = start_y
        .unwrap_or_else(|| JsValue::undefined())
        .to_number(ctx)? as i32;
    let end_x = end_x
        .unwrap_or_else(|| JsValue::undefined())
        .to_number(ctx)? as i32;
    let end_y = end_y
        .unwrap_or_else(|| JsValue::undefined())
        .to_number(ctx)? as i32;
    let num_disp = num_disp
        .unwrap_or_else(|| JsValue::undefined())
        .to_number(ctx)? as i32;
    let block_size = block_size
        .unwrap_or_else(|| JsValue::undefined())
        .to_number(ctx)? as i32;
    let strategy = strategy
        .unwrap_or_else(|| JsValue::undefined())
        .to_string(ctx)?
        .to_std_string()
        .map_err(|e| {
            JsError::from_opaque(JsValue::from(js_string!(format!(
                "无效的策略字符串: {:?}",
                e
            ))))
        })?;

    // 执行寻路
    let path = find_path(
        &js_left_image.borrow().data().inner,
        &js_right_image.borrow().data().inner,
        start_x,
        start_y,
        end_x,
        end_y,
        num_disp,
        block_size,
        &strategy,
    );

    // 将路径转换为 JavaScript 数组
    let js_array = JsArray::new(ctx);
    for point in path {
        let point_array = js_value!([point[0], point[1]], ctx);
        js_array.push(point_array, ctx)?;
    }

    Ok(js_array.into())
}

/// 边框绘制函数
fn _draw_border(
    hwnd: Option<JsValue>,
    x: Option<JsValue>,
    y: Option<JsValue>,
    w: Option<JsValue>,
    h: Option<JsValue>,
    ctx: &mut Context,
) -> JsResult<JsValue> {
    let hwnd = HWND(
        hwnd.unwrap_or_else(|| JsValue::undefined())
            .to_number(ctx)? as isize as *mut std::ffi::c_void,
    );
    let x = x.unwrap_or_else(|| JsValue::undefined()).to_number(ctx)? as i32;
    let y = y.unwrap_or_else(|| JsValue::undefined()).to_number(ctx)? as i32;
    let w = w.unwrap_or_else(|| JsValue::undefined()).to_number(ctx)? as i32;
    let h = h.unwrap_or_else(|| JsValue::undefined()).to_number(ctx)? as i32;

    draw_border(hwnd, x, y, w, h, Some(0xFF0000));
    Ok(JsValue::undefined())
}

/// 延迟函数
fn _s(ms: Option<JsValue>, ctx: &mut Context) -> JsResult<JsValue> {
    let ms = ms.unwrap_or_else(|| JsValue::undefined()).to_number(ctx)? as u64;
    thread::sleep(Duration::from_millis(ms));
    Ok(JsValue::undefined())
}

/// 异步延迟函数
fn _sleep(ms: Option<JsValue>, ctx: &mut Context) -> JsResult<JsValue> {
    let ms = ms.unwrap_or_else(|| JsValue::undefined()).to_number(ctx)? as u64;
    let mut cb: Option<JsFunction> = None;
    let promise = JsPromise::new(
        |resolvers, _context| {
            cb = Some(resolvers.resolve.clone());

            Ok(JsValue::undefined())
        },
        ctx,
    );
    let job = boa_engine::job::TimeoutJob::new(
        boa_engine::job::NativeJob::new(move |context| {
            cb.unwrap()
                .call(&JsValue::undefined(), &[], context)
                .unwrap();
            Ok(JsValue::undefined())
        }),
        ms,
    );
    ctx.enqueue_job(job.into());
    Ok(promise.into())
}

/// 复制文本到剪贴板
fn _copy_text(text: Option<JsValue>, ctx: &mut Context) -> JsResult<JsValue> {
    let text = text
        .unwrap_or_else(|| JsValue::undefined())
        .to_string(ctx)?
        .to_std_string_lossy();

    // 使用 arboard 复制文本到剪贴板
    let mut clipboard = arboard::Clipboard::new().unwrap();
    let _ = clipboard.set_text(&text);

    Ok(JsValue::undefined())
}

/// 从剪贴板粘贴文本
fn _paste_text(_ctx: &mut Context) -> JsResult<JsValue> {
    // 使用 arboard 从剪贴板读取文本
    let mut clipboard = arboard::Clipboard::new().unwrap();
    match clipboard.get_text() {
        Ok(text) => Ok(JsValue::from(js_string!(text))),
        Err(_) => Ok(JsValue::undefined()),
    }
}

/// 将 Mat 编码为 PNG data URL，便于前端直接显示。
fn _mat_to_png_data_url(mat: &Mat) -> Result<String, String> {
    let mut buf = opencv::core::Vector::<u8>::new();
    opencv::imgcodecs::imencode(".png", mat, &mut buf, &opencv::core::Vector::new())
        .map_err(|e| format!("状态图片编码失败: {e}"))?;
    let image_b64 = general_purpose::STANDARD.encode(buf.to_vec());
    Ok(format!("data:image/png;base64,{image_b64}"))
}

/// 向前端发送脚本状态事件（支持按标题新增/更新/删除）。
fn _emit_script_status(
    title: String,
    text: Option<String>,
    image: Option<String>,
    images: Option<Vec<String>>,
) {
    if let Some(app_handle) = SCRIPT_EVENT_APP_HANDLE.get() {
        let scope = get_current_script_path();
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        let has_images = images.as_ref().is_some_and(|items| !items.is_empty());
        let action = if text.is_none() && image.is_none() && !has_images {
            "remove"
        } else {
            "upsert"
        };
        let _ = app_handle.emit(
            "script-status",
            serde_json::json!({
                "scope": scope,
                "action": action,
                "title": title,
                "text": text,
                "image": image,
                "images": images,
                "timestamp": timestamp,
            }),
        );
    }
}

/// 设置脚本运行状态（按标题维护，内容参数自动按类型判断）。
///
/// 参数：
/// - `title`: 状态标题（必填，用于区分多条状态）
/// - `payload`: 状态内容，可选
///   - Mat: 作为图片状态
///   - Mat[]: 作为多图状态
///   - 其他类型: 转为字符串作为文本状态
/// - `payload_text`: 附加文本，可选，仅在 payload 为 Mat/Mat[] 时生效
///   - undefined/null: 删除该标题状态
fn _set_status(
    title: Option<JsValue>,
    payload: Option<JsValue>,
    payload_text: Option<JsValue>,
    ctx: &mut Context,
) -> JsResult<JsValue> {
    let title = title
        .unwrap_or_else(|| JsValue::undefined())
        .to_string(ctx)?
        .to_std_string_lossy()
        .trim()
        .to_string();
    if title.is_empty() {
        return Err(JsNativeError::typ().with_message("title 不能为空").into());
    }

    let mut text: Option<String> = None;
    let mut image: Option<String> = None;
    let mut images: Option<Vec<String>> = None;
    let mut has_image_payload = false;
    if let Some(value) = payload {
        if !value.is_undefined() && !value.is_null() {
            if value.as_object().is_some() {
                if let Ok(js_mat) = value.get_native::<JsMat>() {
                    let mat = (*js_mat.borrow().data().inner).clone();
                    let image_data = _mat_to_png_data_url(&mat)
                        .map_err(|msg| JsNativeError::error().with_message(msg))?;
                    image = Some(image_data.clone());
                    images = Some(vec![image_data]);
                    has_image_payload = true;
                } else if let Some(array_obj) = value.as_object() {
                    if let Ok(array) = JsArray::from_object(array_obj.clone()) {
                        let length = array.length(ctx)? as usize;
                        let mut next_images = Vec::with_capacity(length);

                        for idx in 0..length {
                            let item = array.get(idx as u32, ctx)?;
                            let js_mat = item.get_native::<JsMat>().map_err(|_| {
                                JsNativeError::typ().with_message(format!(
                                    "payload[{idx}] 必须是 Mat（数组模式下仅支持 Mat[]）"
                                ))
                            })?;
                            let mat = (*js_mat.borrow().data().inner).clone();
                            let image_data = _mat_to_png_data_url(&mat)
                                .map_err(|msg| JsNativeError::error().with_message(msg))?;
                            next_images.push(image_data);
                        }

                        if !next_images.is_empty() {
                            image = next_images.first().cloned();
                            images = Some(next_images);
                            has_image_payload = true;
                        }
                    } else {
                        return Err(JsNativeError::typ()
                            .with_message("payload 必须是 Mat、Mat[] 或可转字符串值")
                            .into());
                    }
                } else {
                    return Err(JsNativeError::typ()
                        .with_message("payload 必须是 Mat、Mat[] 或可转字符串值")
                        .into());
                }
            } else {
                text = Some(value.to_string(ctx)?.to_std_string_lossy());
            }
        }
    }
    if has_image_payload {
        if let Some(value) = payload_text {
            if !value.is_undefined() && !value.is_null() {
                text = Some(value.to_string(ctx)?.to_std_string_lossy());
            }
        }
    }

    _emit_script_status(title, text, image, images);
    Ok(JsValue::undefined())
}

/// 根据窗口标题查找窗口句柄函数
fn _find_window(title: Option<JsValue>, ctx: &mut Context) -> JsResult<JsValue> {
    let title = title
        .unwrap_or_else(|| JsValue::undefined())
        .to_string(ctx)?
        .to_std_string_lossy();
    match find_window(&title) {
        Some(hwnd) => Ok(JsValue::new(hwnd.0 as u64 as f64)),
        None => Ok(JsValue::new(0 as u64 as f64)),
    }
}

/// 获取窗口句柄函数
fn _get_window_by_process_name(
    process_name: Option<JsValue>,
    ctx: &mut Context,
) -> JsResult<JsValue> {
    let process_name = process_name
        .unwrap_or_else(|| JsValue::undefined())
        .to_string(ctx)?
        .to_std_string_lossy();
    match get_window_by_process_name(&process_name) {
        Some(hwnd) => Ok(JsValue::new(hwnd.0 as u64 as f64)),
        None => Ok(JsValue::new(0 as u64 as f64)),
    }
}

/// 获取前台窗口函数
fn _get_foreground_window(_ctx: &mut Context) -> JsResult<JsValue> {
    let hwnd = unsafe { GetForegroundWindow() };
    Ok(JsValue::new(hwnd.0 as u64 as f64))
}

/// 检查当前进程是否以管理员权限运行。
fn _is_elevated(_ctx: &mut Context) -> JsResult<JsValue> {
    #[cfg(target_os = "windows")]
    {
        let elevated = crate::util::is_elevated().unwrap_or(false);
        Ok(JsValue::new(elevated))
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(JsValue::new(false))
    }
}

fn _set_program_volume(
    program_name: Option<JsValue>,
    volume: Option<JsValue>,
    ctx: &mut Context,
) -> JsResult<JsValue> {
    let program_name = program_name
        .unwrap_or_else(|| JsValue::undefined())
        .to_string(ctx)?
        .to_std_string_lossy();
    let volume = volume
        .unwrap_or_else(|| JsValue::undefined())
        .to_number(ctx)? as f32;
    super::setvol::set_program_volume(program_name, volume);
    Ok(JsValue::undefined())
}

// 注册到JS环境中的函数集合
pub fn register_builtin_functions(context: &mut Context) -> JsResult<()> {
    // AHK: WinGetClientPos
    let f = _win_get_client_pos.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("winGetClientPos"), 1, f)?;
    // 鼠标操作函数
    let f = _mc.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("mc"), 3, f)?;

    let f = _mm.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("mm"), 2, f)?;

    let f = _move_to.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("moveTo"), 4, f)?;

    let f = _move_c.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("moveC"), 4, f)?;

    let f = _md.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("md"), 3, f)?;

    let f = _mu.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("mu"), 3, f)?;

    let f = _mt.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("mt"), 3, f)?;

    let f = _wheel.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("wheel"), 4, f)?;

    // 键盘操作函数
    let f = _kb.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("kb"), 3, f)?;

    let f = _kd.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("kd"), 2, f)?;

    let f = _ku.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("ku"), 2, f)?;

    // 延迟函数
    let f = _s.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("s"), 1, f)?;

    // 异步延迟函数
    let f = _sleep.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("sleep"), 1, f)?;

    // 剪贴板操作函数
    let f = _copy_text.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("copyText"), 1, f)?;

    let f = _paste_text.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("pasteText"), 0, f)?;

    // 脚本状态显示函数（支持文字与图片）
    let f = _set_status.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("setStatus"), 3, f)?;

    // 获取窗口句柄函数
    let f = _find_window.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("findWindow"), 1, f)?;

    let f = _get_window_by_process_name.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("getWindowByProcessName"), 1, f)?;

    // 设置前景窗口
    let f = _set_foreground_window.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("setForegroundWindow"), 1, f)?;

    // 检查窗口大小
    let f = _check_size.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("checkSize"), 1, f)?;

    // 移动窗口并设置大小
    let f = _move_window.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("moveWindow"), 5, f)?;

    // 获取前台窗口
    let f = _get_foreground_window.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("getForegroundWindow"), 0, f)?;

    // 检查是否以管理员权限运行
    let f = _is_elevated.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("isElevated"), 0, f)?;

    // 从窗口获取图像Mat对象
    let f = _capture_window.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("captureWindow"), 6, f)?;

    // 从窗口获取图像Mat对象（WGC优化版）
    let f = _capture_window_wgc.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("captureWindowWGC"), 5, f)?;

    // 从文件加载模板Mat对象
    let f = _get_template.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("getTemplate"), 1, f)?;

    // 从 base64 字符串加载模板Mat对象
    let f = _get_template_b64.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("getTemplateB64"), 1, f)?;

    // 从文件加载模板Mat对象
    let f = _imread.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("imread"), 1, f)?;

    // 从文件加载图像Mat对象（RGBA通道）
    let f = _imread_rgba.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("imreadRgba"), 1, f)?;

    // 保存Mat对象到文件
    let f = _imwrite.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("imwrite"), 2, f)?;

    // 复制Mat对象到剪贴板
    let f = _copy_image.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("copyImage"), 1, f)?;

    // 从本地或网络加载图像Mat对象
    let f = _imread_url.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("imreadUrl"), 2, f)?;

    // 从本地或网络加载图像Mat对象，并返回RGBA通道
    let f = _imread_url_rgba.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("imreadUrlRgba"), 2, f)?;

    // OCR 初始化（自动下载资源）
    let f = _init_ocr.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("initOcr"), 3, f)?;

    // OCR 文字识别
    let f = _ocr_text.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("ocrText"), 1, f)?;

    // 显示图片
    let f = _imshow.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("imshow"), 3, f)?;

    // 交互式选择图像 ROI
    let f = _select_roi.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("selectroi"), 5, f)?;

    // 使用两个Mat对象进行颜色和模板匹配
    let f = _find_color_and_match_template.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("findColorAndMatchTemplate"), 4, f)?;

    // 颜色键过滤函数
    let f = _color_filter.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("colorFilter"), 3, f)?;

    // HSL 加权颜色键过滤函数
    let f = _color_filter_hsl.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("colorFilterHSL"), 3, f)?;

    // 色键匹配函数
    let f = _color_key_match.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("colorKeyMatch"), 4, f)?;

    // 并行批量模板匹配函数
    let f = _batch_match_color.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("batchMatchColor"), 3, f)?;

    // ORB 优质匹配计数函数
    let f = _orb_match_count.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("orbMatchCount"), 2, f)?;

    // SIFT 定位函数
    let f = _sift_locate.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("siftLocate"), 2, f)?;

    // 感知哈希函数（支持彩色）
    let f = _perceptual_hash.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("perceptualHash"), 2, f)?;

    // ORB 特征哈希函数
    let f = _orb_feature_hash.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("orbFeatureHash"), 1, f)?;

    // 图像角度预测函数
    let f = _predict_rotation.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("predictRotation"), 1, f)?;

    // 哈希汉明距离匹配函数
    let f = _match_hamming_hash.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("matchHammingHash"), 3, f)?;

    // ORB 哈希匹配函数
    let f = _match_orb_hash.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("matchOrbHash"), 3, f)?;

    // 形态学图像处理函数
    let f = _morphology_ex.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("morphologyEx"), 5, f)?;

    // 轮廓提取函数
    let f = _find_contours.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("findContours"), 4, f)?;

    // 单行字符分割函数（横向空隙检测）
    let f = _segment_chars.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("segmentChars"), 3, f)?;

    // 轮廓绘制函数
    let f = _draw_contours.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("drawContours"), 6, f)?;

    // 模板匹配函数
    let f = _match_template.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("matchTemplate"), 3, f)?;

    // 边框绘制函数
    let f = _draw_border.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("drawBorder"), 5, f)?;

    // 颜色矩阵检查函数
    let f = _cc.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("cc"), 5, f)?;

    // 等待颜色达到条件函数（异步）
    let f = _wait_color.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("waitColor"), 6, f)?;

    // 脚本配置读取函数
    let f = _read_config.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("readConfig"), 4, f)?;

    // 设置程序音量函数
    let f = _set_program_volume.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("setProgramVolume"), 2, f)?;

    // 寻路函数
    let f = _find_path.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("findPath"), 9, f)?;

    Ok(())
}
