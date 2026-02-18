use opencv::{
    core::Mat,
    prelude::MatTraitConst,
};
use std::{
    ffi::{CStr, CString, c_char, c_int, c_void},
    fs,
    os::windows::ffi::OsStrExt,
    path::{Path, PathBuf},
    ptr,
    sync::{Mutex, OnceLock},
};
use windows::{
    Win32::{
        Foundation::{FreeLibrary, HMODULE},
        System::LibraryLoader::{GetProcAddress, LoadLibraryW},
    },
    core::{PCSTR, PCWSTR},
};

/// OCR 资源默认 CDN 根地址。
const DEFAULT_OCR_CDN_BASE: &str = "https://cdn.dna-builder.cn/ocr";
/// 检测模型文件名。
const DET_MODEL_FILE: &str = "ch_PP-OCRv3_det_infer.onnx";
/// 分类模型文件名。
const CLS_MODEL_FILE: &str = "ch_ppocr_mobile_v2.0_cls_infer.onnx";
/// 识别模型文件名。
const REC_MODEL_FILE: &str = "ch_PP-OCRv3_rec_infer.onnx";
/// 字典文件名。
const KEYS_FILE: &str = "ppocr_keys_v1.txt";

type OcrHandle = *mut c_void;
type OcrInitFn = unsafe extern "C" fn(
    det_model: *const u16,
    cls_model: *const u16,
    rec_model: *const u16,
    keys_dict: *const u16,
    num_thread: c_int,
) -> OcrHandle;
type OcrDestroyFn = unsafe extern "C" fn(handle: OcrHandle);
type OcrTextCallback = unsafe extern "C" fn(*mut c_void, *const c_char, *const c_void);
type OcrDetectMatFn = unsafe extern "C" fn(
    handle: OcrHandle,
    mat: *const c_void,
    param: *const c_void,
    callback: OcrTextCallback,
    userdata: *mut c_void,
) -> u8;

/// OCR 初始化参数。
#[derive(Debug, Clone)]
pub struct OcrInitConfig {
    pub local_root_dir: Option<PathBuf>,
    pub cdn_base_url: Option<String>,
    pub num_thread: i32,
}

impl Default for OcrInitConfig {
    fn default() -> Self {
        Self {
            local_root_dir: None,
            cdn_base_url: None,
            num_thread: 2,
        }
    }
}

/// OCR 运行时状态（DLL + 句柄 + 导出函数）。
struct OcrRuntime {
    module: HMODULE,
    handle: OcrHandle,
    detect_mat: OcrDetectMatFn,
    destroy: OcrDestroyFn,
}

unsafe impl Send for OcrRuntime {}

impl Drop for OcrRuntime {
    /// 释放 OCR 句柄与 DLL 资源。
    fn drop(&mut self) {
        unsafe {
            (self.destroy)(self.handle);
            let _ = FreeLibrary(self.module);
        }
    }
}

/// OCR 全局单例。
static OCR_RUNTIME: OnceLock<Mutex<Option<OcrRuntime>>> = OnceLock::new();

/// 获取 OCR 全局状态容器。
fn ocr_runtime_cell() -> &'static Mutex<Option<OcrRuntime>> {
    OCR_RUNTIME.get_or_init(|| Mutex::new(None))
}

/// 获取当前平台对应的 DLL 相对路径。
fn dll_remote_relative_path() -> &'static str {
    #[cfg(target_pointer_width = "64")]
    {
        "64bit/RapidOcrOnnx.dll"
    }
    #[cfg(target_pointer_width = "32")]
    {
        "32bit/RapidOcrOnnx.dll"
    }
}

/// 获取 OCR 默认本地目录（优先 `%LOCALAPPDATA%`，失败回退到临时目录）。
fn default_ocr_root_dir() -> PathBuf {
    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        return PathBuf::from(local_app_data).join("dna-builder").join("ocr");
    }
    std::env::temp_dir().join("dna-builder").join("ocr")
}

/// 将路径转成 DLL 需要的 UTF-16 宽字符串（NUL 结尾）。
fn path_to_utf16(path: &Path) -> Vec<u16> {
    path.as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

/// 规范化 CDN 地址（去掉尾部斜杠）。
fn normalize_cdn_base_url(base: Option<String>) -> String {
    let raw = base
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| DEFAULT_OCR_CDN_BASE.to_string());
    raw.trim_end_matches('/').to_string()
}

/// 根据相对路径拼接 CDN 完整地址。
fn build_cdn_url(base: &str, relative: &str) -> String {
    let normalized = relative.replace('\\', "/");
    format!("{base}/{normalized}")
}

/// 下载单个文件（写入临时文件后原子替换，避免中途中断污染）。
fn download_file(url: &str, target_path: &Path) -> Result<(), String> {
    let response = reqwest::blocking::get(url).map_err(|e| format!("下载失败: {url}, {e}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "下载失败: {url}, HTTP {}",
            response.status().as_u16()
        ));
    }
    let bytes = response
        .bytes()
        .map_err(|e| format!("读取下载内容失败: {url}, {e}"))?;

    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}, {e}", parent.display()))?;
    }

    let tmp_path = target_path.with_extension("downloading");
    fs::write(&tmp_path, &bytes).map_err(|e| format!("写入临时文件失败: {}, {e}", tmp_path.display()))?;
    if target_path.exists() {
        fs::remove_file(target_path).map_err(|e| format!("删除旧文件失败: {}, {e}", target_path.display()))?;
    }
    fs::rename(&tmp_path, target_path).map_err(|e| {
        format!(
            "重命名临时文件失败: {} -> {}, {e}",
            tmp_path.display(),
            target_path.display()
        )
    })?;

    Ok(())
}

/// 确保单个 OCR 资源文件存在（缺失时从 CDN 下载）。
fn ensure_resource_file(base_url: &str, remote_relative: &str, local_path: &Path) -> Result<(), String> {
    if let Ok(meta) = fs::metadata(local_path) {
        if meta.is_file() && meta.len() > 0 {
            return Ok(());
        }
    }

    let url = build_cdn_url(base_url, remote_relative);
    download_file(&url, local_path)
}

/// 预下载 OCR 运行所需文件。
fn ensure_ocr_resources(root_dir: &Path, base_url: &str) -> Result<(), String> {
    let resource_list = vec![
        (dll_remote_relative_path(), root_dir.join("RapidOcrOnnx.dll")),
        (
            "models/ch_PP-OCRv3_det_infer.onnx",
            root_dir.join("models").join(DET_MODEL_FILE),
        ),
        (
            "models/ch_ppocr_mobile_v2.0_cls_infer.onnx",
            root_dir.join("models").join(CLS_MODEL_FILE),
        ),
        (
            "models/ch_PP-OCRv3_rec_infer.onnx",
            root_dir.join("models").join(REC_MODEL_FILE),
        ),
        ("models/ppocr_keys_v1.txt", root_dir.join("models").join(KEYS_FILE)),
    ];

    for (remote_relative, local_path) in resource_list {
        ensure_resource_file(base_url, remote_relative, local_path.as_path())?;
    }

    Ok(())
}

/// 加载 DLL。
fn load_library(module_path: &Path) -> Result<HMODULE, String> {
    let mut wide_path: Vec<u16> = module_path.as_os_str().encode_wide().collect();
    wide_path.push(0);
    let module = unsafe { LoadLibraryW(PCWSTR(wide_path.as_ptr())) }
        .map_err(|e| format!("加载 OCR DLL 失败: {}, {e}", module_path.display()))?;
    Ok(module)
}

/// 从 DLL 解析导出函数。
unsafe fn load_proc<T>(module: HMODULE, name: &str) -> Result<T, String> {
    let symbol_name = CString::new(name).map_err(|e| format!("导出函数名无效: {name}, {e}"))?;
    let proc = unsafe { GetProcAddress(module, PCSTR(symbol_name.as_ptr() as *const u8)) }
        .ok_or_else(|| format!("找不到导出函数: {name}"))?;
    Ok(unsafe { std::mem::transmute_copy(&proc) })
}

/// OCR 文本回调：将识别结果写入 `String`。
unsafe extern "C" fn ocr_text_callback(userdata: *mut c_void, text: *const c_char, _result: *const c_void) {
    if userdata.is_null() {
        return;
    }
    let output = unsafe { &mut *(userdata as *mut String) };
    if text.is_null() {
        output.clear();
        return;
    }
    let value = unsafe { CStr::from_ptr(text) };
    *output = value.to_string_lossy().to_string();
}

/// 初始化 OCR：下载资源、加载 DLL、创建引擎句柄。
pub fn init_ocr(config: OcrInitConfig) -> Result<PathBuf, String> {
    let root_dir = config.local_root_dir.unwrap_or_else(default_ocr_root_dir);
    let cdn_base_url = normalize_cdn_base_url(config.cdn_base_url);
    ensure_ocr_resources(root_dir.as_path(), &cdn_base_url)?;

    let dll_path = root_dir.join("RapidOcrOnnx.dll");
    let models_dir = root_dir.join("models");
    let det_path = models_dir.join(DET_MODEL_FILE);
    let cls_path = models_dir.join(CLS_MODEL_FILE);
    let rec_path = models_dir.join(REC_MODEL_FILE);
    let keys_path = models_dir.join(KEYS_FILE);

    let det_model = path_to_utf16(det_path.as_path());
    let cls_model = path_to_utf16(cls_path.as_path());
    let rec_model = path_to_utf16(rec_path.as_path());
    let keys_dict = path_to_utf16(keys_path.as_path());

    let module = load_library(dll_path.as_path())?;
    let init_result = (|| -> Result<OcrRuntime, String> {
        let ocr_init: OcrInitFn = unsafe { load_proc(module, "OcrInit")? };
        let ocr_destroy: OcrDestroyFn = unsafe { load_proc(module, "OcrDestroy")? };
        let ocr_detect_mat: OcrDetectMatFn = unsafe { load_proc(module, "OcrDetectMat")? };

        let num_thread = config.num_thread.max(1);
        let handle = unsafe {
            ocr_init(
                det_model.as_ptr(),
                cls_model.as_ptr(),
                rec_model.as_ptr(),
                keys_dict.as_ptr(),
                num_thread,
            )
        };
        if handle.is_null() {
            return Err("OCR 引擎初始化失败".to_string());
        }

        Ok(OcrRuntime {
            module,
            handle,
            detect_mat: ocr_detect_mat,
            destroy: ocr_destroy,
        })
    })();

    let runtime = match init_result {
        Ok(runtime) => runtime,
        Err(err) => {
            unsafe {
                let _ = FreeLibrary(module);
            }
            return Err(err);
        }
    };

    let mut guard = ocr_runtime_cell()
        .lock()
        .map_err(|e| format!("获取 OCR 状态锁失败: {e:?}"))?;
    *guard = Some(runtime);
    Ok(root_dir)
}

/// 识别 Mat 中的文本。
pub fn ocr_text_from_mat(input: &Mat) -> Result<String, String> {
    let mut guard = ocr_runtime_cell()
        .lock()
        .map_err(|e| format!("获取 OCR 状态锁失败: {e:?}"))?;
    let runtime = guard
        .as_mut()
        .ok_or_else(|| "OCR 未初始化，请先调用 initOcr".to_string())?;

    let channels = input.channels();
    if channels != 1 && channels != 3 && channels != 4 {
        return Err(format!(
            "OCR 仅支持 1/3/4 通道 Mat，当前通道数: {channels}"
        ));
    }
    let width = input.cols();
    let height = input.rows();
    if width <= 0 || height <= 0 {
        return Err("OCR 输入 Mat 尺寸无效".to_string());
    }

    let mat_ptr = input.as_raw_Mat();
    if mat_ptr.is_null() {
        return Err("OCR 输入 Mat 指针无效".to_string());
    }

    let mut text = String::new();
    let success = unsafe {
        (runtime.detect_mat)(
            runtime.handle,
            mat_ptr,
            ptr::null(),
            ocr_text_callback,
            &mut text as *mut String as *mut c_void,
        )
    };

    if success == 0 {
        return Ok(String::new());
    }
    Ok(text)
}
