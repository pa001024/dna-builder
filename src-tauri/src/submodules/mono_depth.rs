use ndarray::{Array2, Array4};
use opencv::{
    core::{self, CV_8UC1, CV_32F, Mat, Scalar, Size},
    dnn, imgproc,
    prelude::{MatTraitConst, MatTraitConstManual, MatTraitManual},
};
use ort::{
    ep,
    session::{Session, builder::AutoDevicePolicy},
    value::TensorRef,
};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
    time::Instant,
};

/// Lite-Mono 默认模型根地址。
const DEFAULT_MONO_DEPTH_BASE_URL: &str = "https://modelscope.cn/models/pa001024/Lite-Mono-ONNX/resolve/master/model/lite-mono-tiny_640x192";
/// Lite-Mono 编码器模型文件名。
const ENCODER_MODEL_FILE: &str = "encoder.onnx";
/// Lite-Mono 解码器模型文件名。
const DECODER_MODEL_FILE: &str = "decoder.onnx";
/// Lite-Mono Tiny 固定输入宽度。
const MODEL_INPUT_WIDTH: i32 = 640;
/// Lite-Mono Tiny 固定输入高度。
const MODEL_INPUT_HEIGHT: i32 = 192;
/// Lite-Mono 运行时状态。
struct MonoDepthRuntime {
    encoder: Session,
    decoder: Session,
    input_size: Size,
    provider_label: String,
}

unsafe impl Send for MonoDepthRuntime {}

/// Lite-Mono 初始化配置。
pub struct MonoDepthInitConfig {
    pub local_root_dir: Option<PathBuf>,
    pub base_url: Option<String>,
}

/// Lite-Mono 全局单例。
static MONO_DEPTH_RUNTIME: OnceLock<Mutex<Option<MonoDepthRuntime>>> = OnceLock::new();

/// 获取 Lite-Mono 全局状态容器。
fn mono_depth_runtime_cell() -> &'static Mutex<Option<MonoDepthRuntime>> {
    MONO_DEPTH_RUNTIME.get_or_init(|| Mutex::new(None))
}

/// 获取 Lite-Mono 默认本地目录。
fn default_mono_depth_root_dir() -> PathBuf {
    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        return PathBuf::from(local_app_data)
            .join("dna-builder")
            .join("mono-depth");
    }
    std::env::temp_dir().join("dna-builder").join("mono-depth")
}

impl Default for MonoDepthInitConfig {
    fn default() -> Self {
        Self {
            local_root_dir: None,
            base_url: None,
        }
    }
}

/// 规范化模型根地址。
fn normalize_base_url(base_url: Option<&str>) -> String {
    base_url
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(DEFAULT_MONO_DEPTH_BASE_URL)
        .trim_end_matches('/')
        .to_string()
}

/// 根据文件名拼接下载地址。
fn build_model_url(base_url: &str, file_name: &str) -> String {
    format!("{base_url}/{file_name}?download=true")
}

/// 下载文件到目标位置，使用临时文件避免中途失败污染缓存。
fn download_file(url: &str, target_path: &Path) -> Result<(), String> {
    let client = reqwest::blocking::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| format!("创建 Lite-Mono 下载客户端失败: {e}"))?;
    let response = client
        .get(url)
        .send()
        .map_err(|e| format!("下载 Lite-Mono 模型失败: {url}, {e}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "下载 Lite-Mono 模型失败: {url}, HTTP {}",
            response.status().as_u16()
        ));
    }

    let bytes = response
        .bytes()
        .map_err(|e| format!("读取 Lite-Mono 模型内容失败: {url}, {e}"))?;

    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("创建 Lite-Mono 模型目录失败: {}, {e}", parent.display()))?;
    }

    let tmp_path = target_path.with_extension("downloading");
    fs::write(&tmp_path, &bytes)
        .map_err(|e| format!("写入 Lite-Mono 临时模型失败: {}, {e}", tmp_path.display()))?;
    if target_path.exists() {
        fs::remove_file(target_path)
            .map_err(|e| format!("删除旧 Lite-Mono 模型失败: {}, {e}", target_path.display()))?;
    }
    fs::rename(&tmp_path, target_path).map_err(|e| {
        format!(
            "重命名 Lite-Mono 临时模型失败: {} -> {}, {e}",
            tmp_path.display(),
            target_path.display()
        )
    })?;
    Ok(())
}

/// 确保单个 Lite-Mono 模型文件存在。
fn ensure_model_file(base_url: &str, root_dir: &Path, file_name: &str) -> Result<PathBuf, String> {
    let target_path = root_dir.join(file_name);
    if let Ok(meta) = fs::metadata(&target_path) {
        if meta.is_file() && meta.len() > 0 {
            return Ok(target_path);
        }
    }

    let url = build_model_url(base_url, file_name);
    download_file(&url, &target_path)?;
    Ok(target_path)
}

/// 创建 Lite-Mono Session，优先尝试 GPU 自动设备策略，失败时回退默认 CPU/自动策略。
fn build_session_with_auto_device(
    model_path: &Path,
    label: &str,
) -> Result<(Session, String), String> {
    let mut explicit_gpu_builder = Session::builder()
        .map_err(|e| format!("创建 Lite-Mono {label} SessionBuilder 失败: {e}"))?;
    if let Ok(builder) = explicit_gpu_builder.with_execution_providers([ep::DirectML::default()
        .with_device_filter(ep::directml::DeviceFilter::Gpu)
        .with_performance_preference(ep::directml::PerformancePreference::HighPerformance)
        .build()
        .error_on_failure()])
    {
        explicit_gpu_builder = builder;
        if let Ok(session) = explicit_gpu_builder.commit_from_file(model_path) {
            return Ok((session, "DirectML".to_string()));
        }
    }

    let session_builder = Session::builder()
        .map_err(|e| format!("创建 Lite-Mono {label} SessionBuilder 失败: {e}"))?;
    let mut session_builder = match session_builder.with_auto_device(AutoDevicePolicy::PreferGPU) {
        Ok(builder) => builder,
        Err(_) => Session::builder()
            .map_err(|e| format!("创建 Lite-Mono {label} SessionBuilder 失败: {e}"))?
            .with_auto_device(AutoDevicePolicy::Default)
            .map_err(|fallback_error| {
                format!("配置 Lite-Mono {label} 自动设备策略失败: {fallback_error}")
            })?,
    };

    let session = session_builder
        .commit_from_file(model_path)
        .map_err(|e| format!("加载 Lite-Mono {label} 失败: {e}"))?;
    Ok((session, "AutoDevice/CPUFallback".to_string()))
}

/// 加载 Lite-Mono 运行时。
fn load_runtime(root_dir: &Path, base_url: Option<&str>) -> Result<MonoDepthRuntime, String> {
    let normalized_base_url = normalize_base_url(base_url);
    let encoder_path = ensure_model_file(&normalized_base_url, root_dir, ENCODER_MODEL_FILE)?;
    let decoder_path = ensure_model_file(&normalized_base_url, root_dir, DECODER_MODEL_FILE)?;

    let (encoder, encoder_provider) = build_session_with_auto_device(&encoder_path, "encoder")?;
    let (decoder, decoder_provider) = build_session_with_auto_device(&decoder_path, "decoder")?;
    let input_size = Size::new(MODEL_INPUT_WIDTH, MODEL_INPUT_HEIGHT);
    let provider_label = format!("encoder={encoder_provider}, decoder={decoder_provider}");

    Ok(MonoDepthRuntime {
        encoder,
        decoder,
        input_size,
        provider_label,
    })
}

/// 初始化 Lite-Mono：下载模型并预热运行时。
pub fn init_mono_depth(config: MonoDepthInitConfig) -> Result<PathBuf, String> {
    let root_dir = config
        .local_root_dir
        .unwrap_or_else(default_mono_depth_root_dir);
    let mut guard = mono_depth_runtime_cell()
        .lock()
        .map_err(|e| format!("获取 Lite-Mono 状态锁失败: {e:?}"))?;
    if guard.is_none() {
        let runtime = load_runtime(&root_dir, config.base_url.as_deref())?;
        println!("[monoDepth] runtime provider: {}", runtime.provider_label);
        *guard = Some(runtime);
    }
    Ok(root_dir)
}

/// 将输入图像规范化为 Lite-Mono 期望的 BGR 三通道。
fn normalize_input_mat(input: &Mat) -> Result<Mat, String> {
    let channels = input.channels();
    let mut bgr = Mat::default();
    match channels {
        1 => imgproc::cvt_color(input, &mut bgr, imgproc::COLOR_GRAY2BGR, 0)
            .map_err(|e| format!("Lite-Mono 灰度转 BGR 失败: {e}"))?,
        3 => input
            .copy_to(&mut bgr)
            .map_err(|e| format!("Lite-Mono 复制输入图像失败: {e}"))?,
        4 => imgproc::cvt_color(input, &mut bgr, imgproc::COLOR_BGRA2BGR, 0)
            .map_err(|e| format!("Lite-Mono BGRA 转 BGR 失败: {e}"))?,
        _ => {
            return Err(format!(
                "monoDepth 仅支持 1/3/4 通道 Mat，当前通道数: {channels}"
            ));
        }
    }
    Ok(bgr)
}

/// 将 RGB Mat 转为 NCHW Float32 输入张量。
fn mat_to_input_array(input: &Mat, input_size: Size) -> Result<Array4<f32>, String> {
    let blob = dnn::blob_from_image(
        input,
        1.0 / 255.0,
        input_size,
        Scalar::all(0.0),
        true,
        false,
        CV_32F,
    )
    .map_err(|e| format!("Lite-Mono blobFromImage 失败: {e}"))?;
    let contiguous_blob = if blob.is_continuous() {
        blob
    } else {
        let mut copied = Mat::default();
        blob.copy_to(&mut copied)
            .map_err(|e| format!("复制 Lite-Mono blob 输入失败: {e}"))?;
        copied
    };

    let blob_data = contiguous_blob
        .data_typed::<f32>()
        .map_err(|e| format!("读取 Lite-Mono blob 输入数据失败: {e}"))?;
    let width = input_size.width as usize;
    let height = input_size.height as usize;
    Array4::from_shape_vec((1, 3, height, width), blob_data.to_vec())
        .map_err(|e| format!("构造 Lite-Mono NCHW 输入数组失败: {e}"))
}

/// 将 Lite-Mono 输出张量转换为 2D 浮点 Mat。
fn array_to_depth_mat(depth_array: &Array2<f32>) -> Result<Mat, String> {
    let rows = depth_array.shape()[0] as i32;
    let cols = depth_array.shape()[1] as i32;
    let mut depth_mat = Mat::new_rows_cols_with_default(rows, cols, CV_32F, Scalar::all(0.0))
        .map_err(|e| format!("创建 Lite-Mono 深度 Mat 失败: {e}"))?;
    let depth_data = depth_mat
        .data_typed_mut::<f32>()
        .map_err(|e| format!("读取 Lite-Mono 深度 Mat 缓冲区失败: {e}"))?;
    if let Some(slice) = depth_array.as_slice() {
        depth_data.copy_from_slice(slice);
        return Ok(depth_mat);
    }
    let (owned, offset) = depth_array.to_owned().into_raw_vec_and_offset();
    if offset.unwrap_or(0) != 0 {
        return Err("Lite-Mono 深度数组偏移异常".to_string());
    }
    depth_data.copy_from_slice(&owned);
    Ok(depth_mat)
}

/// 执行 Lite-Mono 推理并返回模型原生分辨率的 8 位相对深度图。
pub fn predict_mono_depth_model_space(input: &Mat) -> Result<Mat, String> {
    let total_started_at = Instant::now();
    let original_size = input
        .size()
        .map_err(|e| format!("读取 monoDepth 输入尺寸失败: {e}"))?;
    if original_size.width <= 0 || original_size.height <= 0 {
        return Err("monoDepth 输入 Mat 尺寸无效".to_string());
    }

    let root_dir = default_mono_depth_root_dir();
    let runtime_started_at = Instant::now();
    let mut guard = mono_depth_runtime_cell()
        .lock()
        .map_err(|e| format!("获取 Lite-Mono 状态锁失败: {e:?}"))?;
    let runtime_was_empty = guard.is_none();
    if guard.is_none() {
        let runtime = load_runtime(&root_dir, None)?;
        println!("[monoDepth] runtime provider: {}", runtime.provider_label);
        *guard = Some(runtime);
    }
    let runtime = guard
        .as_mut()
        .ok_or_else(|| "Lite-Mono 运行时初始化失败".to_string())?;
    let runtime_cost_ms = runtime_started_at.elapsed().as_millis();

    let preprocess_started_at = Instant::now();
    let normalized_input = normalize_input_mat(input)?;
    let input_array = mat_to_input_array(&normalized_input, runtime.input_size)?;
    let preprocess_cost_ms = preprocess_started_at.elapsed().as_millis();

    let encoder_started_at = Instant::now();
    let encoder_outputs = runtime
        .encoder
        .run(ort::inputs! {
            "input_image" => TensorRef::from_array_view(input_array.view())
                .map_err(|e| format!("创建 Lite-Mono encoder 输入张量失败: {e}"))?
        })
        .map_err(|e| format!("Lite-Mono encoder 推理失败: {e}"))?;
    let encoder_cost_ms = encoder_started_at.elapsed().as_millis();

    if encoder_outputs.len() < 3 {
        return Err("Lite-Mono encoder 输出特征图数量不足".to_string());
    }

    let feature_1 = encoder_outputs[0]
        .try_extract_array::<f32>()
        .map_err(|e| format!("提取 Lite-Mono features_1 失败: {e}"))?
        .to_owned();
    let feature_2 = encoder_outputs[1]
        .try_extract_array::<f32>()
        .map_err(|e| format!("提取 Lite-Mono features_2 失败: {e}"))?
        .to_owned();
    let feature_3 = encoder_outputs[2]
        .try_extract_array::<f32>()
        .map_err(|e| format!("提取 Lite-Mono features_3 失败: {e}"))?
        .to_owned();

    let decoder_started_at = Instant::now();
    let decoder_outputs = runtime
        .decoder
        .run(ort::inputs! {
            "features_1" => TensorRef::from_array_view(feature_1.view())
                .map_err(|e| format!("创建 Lite-Mono decoder features_1 张量失败: {e}"))?,
            "features_2" => TensorRef::from_array_view(feature_2.view())
                .map_err(|e| format!("创建 Lite-Mono decoder features_2 张量失败: {e}"))?,
            "features_3" => TensorRef::from_array_view(feature_3.view())
                .map_err(|e| format!("创建 Lite-Mono decoder features_3 张量失败: {e}"))?
        })
        .map_err(|e| format!("Lite-Mono decoder 推理失败: {e}"))?;
    let decoder_cost_ms = decoder_started_at.elapsed().as_millis();

    let decoder_output = decoder_outputs[0]
        .try_extract_array::<f32>()
        .map_err(|e| format!("提取 Lite-Mono decoder 输出失败: {e}"))?
        .to_owned();
    let decoder_shape = decoder_output.shape();
    if decoder_shape.len() < 4 {
        return Err("Lite-Mono decoder 输出维度异常".to_string());
    }
    let depth_rows = decoder_shape[decoder_shape.len() - 2];
    let depth_cols = decoder_shape[decoder_shape.len() - 1];
    let depth_2d = decoder_output
        .into_shape_with_order((depth_rows, depth_cols))
        .map_err(|e| format!("Lite-Mono decoder 输出 reshape 失败: {e}"))?;
    let decoder_mat = array_to_depth_mat(&depth_2d)?;

    let postprocess_started_at = Instant::now();
    let mut normalized_depth = Mat::default();
    core::normalize(
        &decoder_mat,
        &mut normalized_depth,
        0.0,
        255.0,
        core::NORM_MINMAX,
        CV_8UC1,
        &core::no_array(),
    )
    .map_err(|e| format!("Lite-Mono 模型尺度深度图归一化失败: {e}"))?;
    let postprocess_cost_ms = postprocess_started_at.elapsed().as_millis();
    let total_cost_ms = total_started_at.elapsed().as_millis();
    println!(
        "[monoDepthModel] provider={} runtimeInit={}ms firstCall={} preprocess={}ms encoder={}ms decoder={}ms postprocess={}ms total={}ms",
        runtime.provider_label,
        runtime_cost_ms,
        runtime_was_empty,
        preprocess_cost_ms,
        encoder_cost_ms,
        decoder_cost_ms,
        postprocess_cost_ms,
        total_cost_ms
    );

    Ok(normalized_depth)
}

/// 执行 Lite-Mono 推理并返回单通道 8 位相对深度图。
pub fn predict_mono_depth(input: &Mat) -> Result<Mat, String> {
    let total_started_at = Instant::now();
    let original_size = input
        .size()
        .map_err(|e| format!("读取 monoDepth 输入尺寸失败: {e}"))?;
    if original_size.width <= 0 || original_size.height <= 0 {
        return Err("monoDepth 输入 Mat 尺寸无效".to_string());
    }

    let root_dir = default_mono_depth_root_dir();
    let runtime_started_at = Instant::now();
    let mut guard = mono_depth_runtime_cell()
        .lock()
        .map_err(|e| format!("获取 Lite-Mono 状态锁失败: {e:?}"))?;
    let runtime_was_empty = guard.is_none();
    if guard.is_none() {
        let runtime = load_runtime(&root_dir, None)?;
        println!("[monoDepth] runtime provider: {}", runtime.provider_label);
        *guard = Some(runtime);
    }
    let runtime = guard
        .as_mut()
        .ok_or_else(|| "Lite-Mono 运行时初始化失败".to_string())?;
    let runtime_cost_ms = runtime_started_at.elapsed().as_millis();

    let preprocess_started_at = Instant::now();
    let normalized_input = normalize_input_mat(input)?;

    let input_array = mat_to_input_array(&normalized_input, runtime.input_size)?;
    let preprocess_cost_ms = preprocess_started_at.elapsed().as_millis();

    let encoder_started_at = Instant::now();
    let encoder_outputs = runtime
        .encoder
        .run(ort::inputs! {
            "input_image" => TensorRef::from_array_view(input_array.view())
                .map_err(|e| format!("创建 Lite-Mono encoder 输入张量失败: {e}"))?
        })
        .map_err(|e| format!("Lite-Mono encoder 推理失败: {e}"))?;
    let encoder_cost_ms = encoder_started_at.elapsed().as_millis();

    if encoder_outputs.len() < 3 {
        return Err("Lite-Mono encoder 输出特征图数量不足".to_string());
    }

    let feature_1 = encoder_outputs[0]
        .try_extract_array::<f32>()
        .map_err(|e| format!("提取 Lite-Mono features_1 失败: {e}"))?
        .to_owned();
    let feature_2 = encoder_outputs[1]
        .try_extract_array::<f32>()
        .map_err(|e| format!("提取 Lite-Mono features_2 失败: {e}"))?
        .to_owned();
    let feature_3 = encoder_outputs[2]
        .try_extract_array::<f32>()
        .map_err(|e| format!("提取 Lite-Mono features_3 失败: {e}"))?
        .to_owned();

    let decoder_started_at = Instant::now();
    let decoder_outputs = runtime
        .decoder
        .run(ort::inputs! {
            "features_1" => TensorRef::from_array_view(feature_1.view())
                .map_err(|e| format!("创建 Lite-Mono decoder features_1 张量失败: {e}"))?,
            "features_2" => TensorRef::from_array_view(feature_2.view())
                .map_err(|e| format!("创建 Lite-Mono decoder features_2 张量失败: {e}"))?,
            "features_3" => TensorRef::from_array_view(feature_3.view())
                .map_err(|e| format!("创建 Lite-Mono decoder features_3 张量失败: {e}"))?
        })
        .map_err(|e| format!("Lite-Mono decoder 推理失败: {e}"))?;
    let decoder_cost_ms = decoder_started_at.elapsed().as_millis();

    let decoder_output = decoder_outputs[0]
        .try_extract_array::<f32>()
        .map_err(|e| format!("提取 Lite-Mono decoder 输出失败: {e}"))?
        .to_owned();
    let decoder_shape = decoder_output.shape();
    if decoder_shape.len() < 4 {
        return Err("Lite-Mono decoder 输出维度异常".to_string());
    }
    let depth_rows = decoder_shape[decoder_shape.len() - 2];
    let depth_cols = decoder_shape[decoder_shape.len() - 1];
    let depth_2d = decoder_output
        .into_shape_with_order((depth_rows, depth_cols))
        .map_err(|e| format!("Lite-Mono decoder 输出 reshape 失败: {e}"))?;
    let decoder_mat = array_to_depth_mat(&depth_2d)?;

    let postprocess_started_at = Instant::now();
    let mut resized_depth = Mat::default();
    imgproc::resize(
        &decoder_mat,
        &mut resized_depth,
        original_size,
        0.0,
        0.0,
        imgproc::INTER_LINEAR,
    )
    .map_err(|e| format!("Lite-Mono 深度图回采样失败: {e}"))?;

    let mut normalized_depth = Mat::default();
    core::normalize(
        &resized_depth,
        &mut normalized_depth,
        0.0,
        255.0,
        core::NORM_MINMAX,
        CV_8UC1,
        &core::no_array(),
    )
    .map_err(|e| format!("Lite-Mono 深度图归一化失败: {e}"))?;

    let postprocess_cost_ms = postprocess_started_at.elapsed().as_millis();
    let total_cost_ms = total_started_at.elapsed().as_millis();
    println!(
        "[monoDepth] provider={} runtimeInit={}ms firstCall={} preprocess={}ms encoder={}ms decoder={}ms postprocess={}ms total={}ms",
        runtime.provider_label,
        runtime_cost_ms,
        runtime_was_empty,
        preprocess_cost_ms,
        encoder_cost_ms,
        decoder_cost_ms,
        postprocess_cost_ms,
        total_cost_ms
    );

    Ok(normalized_depth)
}
