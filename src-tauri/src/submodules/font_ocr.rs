use ndarray::{Array2, Array4};
use opencv::{
    core::{self, Mat, Point, Rect, Scalar, Size, Vector},
    imgcodecs, imgproc,
    prelude::{MatTraitConst, MatTraitConstManual, MatTraitManual},
};
use ort::{
    ep,
    session::{Session, builder::AutoDevicePolicy},
    value::TensorRef,
};
use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
};

/// 识别字典文件名。
const DICT_FILE_NAME: &str = "word_text_dict.txt";
/// 检测 ONNX 文件名。
const DET_MODEL_FILE_NAME: &str = "ch_PP-OCRv3_det_infer.onnx";
/// 识别 ONNX 文件名。
const REC_MODEL_FILE_NAME: &str = "ch_PP-OCRv3_rec_infer.onnx";
/// 训练工程相对输出目录。
const OUTPUT_DIR_NAME: &str = "output";
/// 识别模型相对目录。
const REC_MODEL_DIR_NAME: &str = "word_text_rec";
/// 检测模型相对目录。
const DET_MODEL_DIR_NAME: &str = "word_text_det";
/// 字典相对目录。
const DICT_DIR_NAME: &str = "data";
/// 识别模型环境变量。
const REC_MODEL_PATH_ENV: &str = "FONT_OCR_REC_MODEL_PATH";
/// 检测模型环境变量。
const DET_MODEL_PATH_ENV: &str = "FONT_OCR_DET_MODEL_PATH";
/// 字典环境变量。
const DICT_PATH_ENV: &str = "FONT_OCR_DICT_PATH";
/// 工程根目录环境变量。
const PROJECT_ROOT_ENV: &str = "FONT_OCR_PROJECT_ROOT";

/// 检测预处理的最长边。
const DET_LIMIT_SIDE_LEN: i32 = 736;
/// 检测概率阈值。
const DET_THRESH: f32 = 0.1;
/// 检测文本框阈值。
const DET_BOX_THRESH: f32 = 0.2;
/// 检测文本框展开比例。
const DET_UNCLIP_RATIO: f32 = 2.0;
/// 是否对二值图做膨胀。
const DET_USE_DILATION: bool = true;
/// 识别输入高度。
const REC_IMAGE_HEIGHT: i32 = 32;
/// 识别输入宽度。
const REC_IMAGE_WIDTH: i32 = 320;

/// 单条 OCR 结果。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FontOcrLine {
    pub box_points: Vec<[i32; 2]>,
    pub det_score: f32,
    pub text: String,
    pub rec_score: f32,
}

/// OCR 推理结果。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FontOcrPrediction {
    pub image_path: PathBuf,
    pub provider: String,
    pub lines: Vec<FontOcrLine>,
}

/// OCR 运行时。
struct FontOcrRuntime {
    det_session: Option<Session>,
    rec_session: Session,
    dictionary: Vec<String>,
    provider_label: String,
}

unsafe impl Send for FontOcrRuntime {}

/// OCR 全局单例。
static FONT_OCR_RUNTIME: OnceLock<Mutex<Option<FontOcrRuntime>>> = OnceLock::new();

/// 获取 OCR 状态容器。
fn runtime_cell() -> &'static Mutex<Option<FontOcrRuntime>> {
    FONT_OCR_RUNTIME.get_or_init(|| Mutex::new(None))
}

/// 获取训练工程根目录。
fn default_project_root() -> PathBuf {
    if let Ok(value) = std::env::var(PROJECT_ROOT_ENV) {
        let candidate = PathBuf::from(value);
        if candidate.exists() {
            return candidate;
        }
    }

    let mut candidates = Vec::new();

    if let Ok(current_dir) = std::env::current_dir() {
        candidates.push(current_dir);
    }
    if let Ok(exe_path) = std::env::current_exe()
        && let Some(parent) = exe_path.parent()
    {
        candidates.push(parent.to_path_buf());
        candidates.extend(parent.ancestors().skip(1).map(Path::to_path_buf));
    }

    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    candidates.push(manifest_dir.clone());
    candidates.extend(manifest_dir.ancestors().skip(1).map(Path::to_path_buf));

    for base in candidates {
        if contains_project_assets(&base) {
            return base;
        }

        if let Ok(entries) = fs::read_dir(&base) {
            for entry in entries.flatten() {
                let candidate = entry.path();
                if candidate.is_dir() && contains_project_assets(&candidate) {
                    return candidate;
                }
            }
        }
    }

    if let Some(parent) = manifest_dir.parent() {
        parent.to_path_buf()
    } else {
        manifest_dir
    }
}

/// 获取默认检测模型路径。
fn default_det_model_path(project_root: &Path) -> PathBuf {
    project_root
        .join(OUTPUT_DIR_NAME)
        .join(DET_MODEL_DIR_NAME)
        .join("onnx")
        .join(DET_MODEL_FILE_NAME)
}

/// 获取默认识别模型路径。
fn default_rec_model_path(project_root: &Path) -> PathBuf {
    project_root
        .join(OUTPUT_DIR_NAME)
        .join(REC_MODEL_DIR_NAME)
        .join("onnx")
        .join(REC_MODEL_FILE_NAME)
}

/// 获取默认字典路径。
fn default_dict_path(project_root: &Path) -> PathBuf {
    project_root
        .join(DICT_DIR_NAME)
        .join("dict")
        .join(DICT_FILE_NAME)
}

/// 判断工程资产是否已经就位。
fn contains_project_assets(project_root: &Path) -> bool {
    default_rec_model_path(project_root).exists() && default_dict_path(project_root).exists()
}

/// 解析可覆盖的模型路径。
fn resolve_model_path(env_name: &str, default_path: PathBuf) -> PathBuf {
    match std::env::var(env_name) {
        Ok(value) => {
            let candidate = PathBuf::from(value);
            if candidate.exists() {
                candidate
            } else {
                default_path
            }
        }
        Err(_) => default_path,
    }
}

/// 读取字典文件，并补上 CTC blank。
fn load_dictionary(dict_path: &Path) -> Result<Vec<String>, String> {
    let text = fs::read_to_string(dict_path)
        .map_err(|e| format!("读取字典失败: {}, {e}", dict_path.display()))?;
    let mut dictionary = vec!["blank".to_string()];
    for line in text.lines() {
        let value = line.trim_end_matches(['\r', '\n']);
        if !value.is_empty() {
            dictionary.push(value.to_string());
        }
    }
    Ok(dictionary)
}

/// 获取 Session 的第一个输出名。
fn first_output_name(session: &Session, label: &str) -> Result<String, String> {
    session
        .outputs()
        .first()
        .map(|output| output.name().to_string())
        .ok_or_else(|| format!("{label} 没有输出定义"))
}

/// 规范化 SessionBuilder，优先尝试 DirectML。
fn build_session_with_auto_device(
    model_path: &Path,
    label: &str,
    use_gpu: bool,
) -> Result<(Session, String), String> {
    let explicit_builder =
        Session::builder().map_err(|e| format!("创建 {label} SessionBuilder 失败: {e}"))?;

    if use_gpu
        && let Ok(mut builder) =
            explicit_builder.with_execution_providers([ep::DirectML::default()
                .with_device_filter(ep::directml::DeviceFilter::Gpu)
                .with_performance_preference(ep::directml::PerformancePreference::HighPerformance)
                .build()
                .error_on_failure()])
        && let Ok(session) = builder.commit_from_file(model_path)
    {
        return Ok((session, "DirectML".to_string()));
    }

    let mut session_builder =
        Session::builder().map_err(|e| format!("创建 {label} SessionBuilder 失败: {e}"))?;
    if use_gpu {
        session_builder = match session_builder.with_auto_device(AutoDevicePolicy::PreferGPU) {
            Ok(builder) => builder,
            Err(_) => Session::builder()
                .map_err(|e| format!("创建 {label} SessionBuilder 失败: {e}"))?
                .with_auto_device(AutoDevicePolicy::Default)
                .map_err(|e| format!("配置 {label} 自动设备策略失败: {e}"))?,
        };
    }

    let session = session_builder
        .commit_from_file(model_path)
        .map_err(|e| format!("加载 {label} 失败: {e}"))?;
    Ok((session, "CPUFallback".to_string()))
}

/// 将输入图像统一为 BGR 三通道。
fn normalize_input_mat(input: &Mat) -> Result<Mat, String> {
    let channels = input.channels();
    let mut bgr = Mat::default();
    match channels {
        1 => imgproc::cvt_color(input, &mut bgr, imgproc::COLOR_GRAY2BGR, 0)
            .map_err(|e| format!("灰度转 BGR 失败: {e}"))?,
        3 => input
            .copy_to(&mut bgr)
            .map_err(|e| format!("复制输入图像失败: {e}"))?,
        4 => imgproc::cvt_color(input, &mut bgr, imgproc::COLOR_BGRA2BGR, 0)
            .map_err(|e| format!("BGRA 转 BGR 失败: {e}"))?,
        _ => return Err(format!("仅支持 1/3/4 通道 Mat，当前通道数: {channels}")),
    }
    Ok(bgr)
}

/// 将 BGR Mat 转成识别模型的 NCHW 输入。
fn mat_to_rec_array(input: &Mat, image_shape: (i32, i32, i32)) -> Result<Array4<f32>, String> {
    let (_, img_h, img_w) = image_shape;
    let normalized = normalize_input_mat(input)?;
    let height = normalized.rows();
    let width = normalized.cols();
    if height <= 0 || width <= 0 {
        return Err("识别输入尺寸无效".to_string());
    }

    let ratio = width as f32 / height as f32;
    let resized_w = if (img_h as f32 * ratio).ceil() as i32 > img_w {
        img_w
    } else {
        (img_h as f32 * ratio).ceil() as i32
    };

    let mut resized = Mat::default();
    imgproc::resize(
        &normalized,
        &mut resized,
        Size::new(resized_w, img_h),
        0.0,
        0.0,
        imgproc::INTER_LINEAR,
    )
    .map_err(|e| format!("识别图像缩放失败: {e}"))?;

    let data = resized
        .data_bytes()
        .map_err(|e| format!("读取识别图像数据失败: {e}"))?;
    let channels = 3usize;
    let mut array = Array4::<f32>::zeros((1, channels, img_h as usize, img_w as usize));
    let stride = resized_w as usize * channels;
    for y in 0..img_h as usize {
        for x in 0..resized_w as usize {
            let base = y * stride + x * channels;
            for ch in 0..channels {
                let value = data[base + ch] as f32;
                array[[0, ch, y, x]] = (value / 255.0 - 0.5) / 0.5;
            }
        }
    }
    Ok(array)
}

/// 将检测输入图像转成 NCHW 张量，并返回缩放比例。
fn mat_to_det_array(input: &Mat) -> Result<(Array4<f32>, f32), String> {
    let normalized = normalize_input_mat(input)?;
    let height = normalized.rows();
    let width = normalized.cols();
    if height <= 0 || width <= 0 {
        return Err("检测输入尺寸无效".to_string());
    }

    let max_side = height.max(width);
    let scale = if max_side > DET_LIMIT_SIDE_LEN {
        DET_LIMIT_SIDE_LEN as f32 / max_side as f32
    } else {
        1.0
    };
    let resized_h = ((height as f32 * scale).round() as i32).max(32);
    let resized_w = ((width as f32 * scale).round() as i32).max(32);
    let resized_h = ((resized_h + 31) / 32) * 32;
    let resized_w = ((resized_w + 31) / 32) * 32;

    let mut resized = Mat::default();
    imgproc::resize(
        &normalized,
        &mut resized,
        Size::new(resized_w, resized_h),
        0.0,
        0.0,
        imgproc::INTER_LINEAR,
    )
    .map_err(|e| format!("检测图像缩放失败: {e}"))?;

    let data = resized
        .data_bytes()
        .map_err(|e| format!("读取检测图像数据失败: {e}"))?;
    let channels = 3usize;
    let mut array = Array4::<f32>::zeros((1, channels, resized_h as usize, resized_w as usize));
    let stride = resized_w as usize * channels;
    let mean = [0.485f32, 0.456, 0.406];
    let std = [0.229f32, 0.224, 0.225];
    for y in 0..resized_h as usize {
        for x in 0..resized_w as usize {
            let base = y * stride + x * channels;
            for ch in 0..channels {
                let value = data[base + ch] as f32 / 255.0;
                array[[0, ch, y, x]] = (value - mean[ch]) / std[ch];
            }
        }
    }
    Ok((array, scale))
}

/// 计算文本行的 CTC 解码结果。
#[allow(dead_code)]
fn decode_ctc(prediction: &Array2<f32>, dictionary: &[String]) -> (String, f32) {
    let shape = prediction.shape();
    if shape.len() != 2 {
        return (String::new(), 0.0);
    }

    let time_dim = shape[0];
    let class_dim = shape[1];
    let mut last_index = 0usize;
    let mut chars = Vec::new();
    let mut scores = Vec::new();

    for t in 0..time_dim {
        let mut max_index = 0usize;
        let mut max_score = f32::NEG_INFINITY;
        for c in 0..class_dim {
            let score = prediction[[t, c]];
            if score > max_score {
                max_score = score;
                max_index = c;
            }
        }

        if max_index == 0 || max_index == last_index {
            last_index = max_index;
            continue;
        }
        if let Some(character) = dictionary.get(max_index) {
            chars.push(character.clone());
            scores.push(max_score);
        }
        last_index = max_index;
    }

    let text = chars.join("");
    let score = if scores.is_empty() {
        0.0
    } else {
        scores.iter().sum::<f32>() / scores.len() as f32
    };
    (text, score)
}

/// 将识别结果输出为矩形框。
fn rect_to_box_points(rect: Rect, image_width: i32, image_height: i32) -> Vec<[i32; 2]> {
    let left = rect.x.clamp(0, image_width.saturating_sub(1));
    let top = rect.y.clamp(0, image_height.saturating_sub(1));
    let right = (rect.x + rect.width).clamp(left + 1, image_width);
    let bottom = (rect.y + rect.height).clamp(top + 1, image_height);
    vec![[left, top], [right, top], [right, bottom], [left, bottom]]
}

/// 对检测图做一次简单的框扩张。
fn unclipped_rect(rect: Rect, ratio: f32, image_width: i32, image_height: i32) -> Rect {
    let cx = rect.x as f32 + rect.width as f32 / 2.0;
    let cy = rect.y as f32 + rect.height as f32 / 2.0;
    let new_w = (rect.width as f32 * ratio).round().max(1.0) as i32;
    let new_h = (rect.height as f32 * ratio).round().max(1.0) as i32;
    let new_x = (cx - new_w as f32 / 2.0).round() as i32;
    let new_y = (cy - new_h as f32 / 2.0).round() as i32;
    Rect::new(
        new_x.clamp(0, image_width.saturating_sub(1)),
        new_y.clamp(0, image_height.saturating_sub(1)),
        new_w.min(image_width).max(1),
        new_h.min(image_height).max(1),
    )
}

/// 从检测概率图中提取文本框。
fn detect_boxes_from_map(
    score_map: &Mat,
    original_size: Size,
    resized_size: Size,
) -> Result<Vec<(Rect, f32)>, String> {
    let mut threshold_mat = Mat::default();
    imgproc::threshold(
        score_map,
        &mut threshold_mat,
        DET_THRESH as f64,
        255.0,
        imgproc::THRESH_BINARY,
    )
    .map_err(|e| format!("检测阈值化失败: {e}"))?;

    let threshold_u8 = if threshold_mat.typ() == core::CV_8UC1 {
        threshold_mat
    } else {
        let mut converted = Mat::default();
        threshold_mat
            .convert_to(&mut converted, core::CV_8UC1, 1.0, 0.0)
            .map_err(|e| format!("检测二值图转换失败: {e}"))?;
        converted
    };

    let binary_mask = if DET_USE_DILATION {
        let kernel = imgproc::get_structuring_element(
            imgproc::MORPH_RECT,
            Size::new(2, 2),
            Point::new(-1, -1),
        )
        .map_err(|e| format!("创建检测膨胀核失败: {e}"))?;
        let mut dilated = Mat::default();
        imgproc::dilate(
            &threshold_u8,
            &mut dilated,
            &kernel,
            Point::new(-1, -1),
            1,
            core::BORDER_CONSTANT,
            Scalar::all(0.0),
        )
        .map_err(|e| format!("检测二值图膨胀失败: {e}"))?;
        dilated
    } else {
        threshold_u8
    };

    let mut contours = Vector::<Vector<Point>>::new();
    imgproc::find_contours_def(
        &binary_mask,
        &mut contours,
        imgproc::RETR_LIST,
        imgproc::CHAIN_APPROX_SIMPLE,
    )
    .map_err(|e| format!("检测轮廓提取失败: {e}"))?;

    let scale_x = original_size.width as f32 / resized_size.width as f32;
    let scale_y = original_size.height as f32 / resized_size.height as f32;
    let mut results = Vec::new();

    for idx in 0..contours.len() {
        let contour = contours
            .get(idx)
            .map_err(|e| format!("读取检测轮廓失败: {e}"))?;
        if contour.len() < 3 {
            continue;
        }
        let rect =
            imgproc::bounding_rect(&contour).map_err(|e| format!("计算检测外接矩形失败: {e}"))?;
        if rect.width < 3 || rect.height < 3 {
            continue;
        }

        let roi = Mat::roi(score_map, rect).map_err(|e| format!("获取检测得分 ROI 失败: {e}"))?;
        let mean =
            core::mean(&roi, &core::no_array()).map_err(|e| format!("计算检测分数失败: {e}"))?;
        let score = mean[0] as f32;
        if score < DET_BOX_THRESH {
            continue;
        }

        let expanded = unclipped_rect(
            Rect::new(
                (rect.x as f32 * scale_x).round() as i32,
                (rect.y as f32 * scale_y).round() as i32,
                (rect.width as f32 * scale_x).round() as i32,
                (rect.height as f32 * scale_y).round() as i32,
            ),
            DET_UNCLIP_RATIO,
            original_size.width,
            original_size.height,
        );
        results.push((expanded, score));
    }

    results.sort_by(|a, b| {
        let y_cmp = a.0.y.cmp(&b.0.y);
        if y_cmp.is_eq() {
            a.0.x.cmp(&b.0.x)
        } else {
            y_cmp
        }
    });

    Ok(results)
}

/// 初始化 OCR 运行时。
fn load_runtime(project_root: &Path, use_gpu: bool) -> Result<FontOcrRuntime, String> {
    let rec_model_path =
        resolve_model_path(REC_MODEL_PATH_ENV, default_rec_model_path(project_root));
    if !rec_model_path.exists() {
        return Err(format!(
            "未找到识别 ONNX 模型: {}",
            rec_model_path.display()
        ));
    }

    let dict_path = resolve_model_path(DICT_PATH_ENV, default_dict_path(project_root));
    if !dict_path.exists() {
        return Err(format!("未找到字典文件: {}", dict_path.display()));
    }

    let dictionary = load_dictionary(&dict_path)?;
    let (rec_session, rec_provider) =
        build_session_with_auto_device(&rec_model_path, "识别模型", use_gpu)?;
    let det_model_path =
        resolve_model_path(DET_MODEL_PATH_ENV, default_det_model_path(project_root));
    let (det_session, det_provider) = if det_model_path.exists() {
        let (session, provider) =
            build_session_with_auto_device(&det_model_path, "检测模型", use_gpu)?;
        (Some(session), provider)
    } else {
        (None, "FallbackFullImage".to_string())
    };

    Ok(FontOcrRuntime {
        det_session,
        rec_session,
        dictionary,
        provider_label: format!("det={det_provider}, rec={rec_provider}"),
    })
}

/// 执行检测 + 识别推理。
pub fn predict_font_ocr(image_path: &Path, use_gpu: bool) -> Result<FontOcrPrediction, String> {
    if !image_path.exists() {
        return Err(format!("未找到图片: {}", image_path.display()));
    }

    let project_root = default_project_root();
    let mut guard = runtime_cell()
        .lock()
        .map_err(|e| format!("获取 OCR 状态锁失败: {e:?}"))?;
    if guard.is_none() {
        let runtime = load_runtime(&project_root, use_gpu)?;
        println!("[fontOcr] runtime provider: {}", runtime.provider_label);
        *guard = Some(runtime);
    }

    let runtime = guard
        .as_mut()
        .ok_or_else(|| "OCR 运行时初始化失败".to_string())?;
    let input_image = imgcodecs::imread(
        image_path
            .to_str()
            .ok_or_else(|| "图片路径包含非法字符".to_string())?,
        imgcodecs::IMREAD_COLOR,
    )
    .map_err(|e| format!("读取图片失败: {e}"))?;
    if input_image.empty() {
        return Err("读取到空图片".to_string());
    }

    let original_size = input_image
        .size()
        .map_err(|e| format!("读取图片尺寸失败: {e}"))?;
    let mut crops: Vec<(Rect, f32, Mat)> = Vec::new();

    if let Some(det_session) = runtime.det_session.as_mut() {
        let (det_array, _scale) = mat_to_det_array(&input_image)?;
        let det_output_name = first_output_name(det_session, "检测模型")?;
        let det_outputs = det_session
            .run(ort::inputs! {
                "x" => TensorRef::from_array_view(det_array.view())
                    .map_err(|e| format!("创建检测输入张量失败: {e}"))?
            })
            .map_err(|e| format!("检测模型推理失败: {e}"))?;
        let det_output = det_outputs
            .get(det_output_name.as_str())
            .ok_or_else(|| format!("检测模型没有输出: {det_output_name}"))?;
        let det_array = det_output
            .try_extract_array::<f32>()
            .map_err(|e| format!("提取检测输出失败: {e}"))?
            .to_owned();
        let det_shape = det_array.shape().to_vec();
        if det_shape.len() < 4 {
            return Err("检测输出维度异常".to_string());
        }

        let score_map_2d = det_array
            .into_shape_with_order((det_shape[2], det_shape[3]))
            .map_err(|e| format!("检测输出 reshape 失败: {e}"))?;
        let mut score_map = Mat::new_rows_cols_with_default(
            det_shape[2] as i32,
            det_shape[3] as i32,
            core::CV_32F,
            Scalar::all(0.0),
        )
        .map_err(|e| format!("创建检测得分图失败: {e}"))?;
        {
            let dst = score_map
                .data_typed_mut::<f32>()
                .map_err(|e| format!("写入检测得分图失败: {e}"))?;
            if let Some(slice) = score_map_2d.as_slice() {
                dst.copy_from_slice(slice);
            } else {
                let (owned, offset) = score_map_2d.to_owned().into_raw_vec_and_offset();
                if offset.unwrap_or(0usize) != 0 {
                    return Err("检测输出偏移异常".to_string());
                }
                dst.copy_from_slice(&owned);
            }
        }

        let mut resized_score_map = Mat::default();
        imgproc::resize(
            &score_map,
            &mut resized_score_map,
            Size::new(original_size.width, original_size.height),
            0.0,
            0.0,
            imgproc::INTER_LINEAR,
        )
        .map_err(|e| format!("检测得分图缩放失败: {e}"))?;

        let boxes = detect_boxes_from_map(
            &resized_score_map,
            original_size,
            Size::new(original_size.width, original_size.height),
        )?;

        for (rect, det_score) in boxes {
            let roi =
                Mat::roi(&input_image, rect).map_err(|e| format!("获取检测框 ROI 失败: {e}"))?;
            let mut crop = Mat::default();
            roi.copy_to(&mut crop)
                .map_err(|e| format!("复制检测框 ROI 失败: {e}"))?;
            crops.push((rect, det_score, crop));
        }
    } else {
        crops.push((
            Rect::new(0, 0, original_size.width, original_size.height),
            1.0,
            input_image.clone(),
        ));
    }

    if crops.is_empty() {
        crops.push((
            Rect::new(0, 0, original_size.width, original_size.height),
            1.0,
            input_image.clone(),
        ));
    }

    let mut lines = Vec::new();
    for (rect, det_score, crop) in crops {
        let rec_array = mat_to_rec_array(&crop, (3, REC_IMAGE_HEIGHT, REC_IMAGE_WIDTH))?;
        let rec_output_name = first_output_name(&runtime.rec_session, "识别模型")?;
        let rec_outputs = runtime
            .rec_session
            .run(ort::inputs! {
                "x" => TensorRef::from_array_view(rec_array.view())
                    .map_err(|e| format!("创建识别输入张量失败: {e}"))?
            })
            .map_err(|e| format!("识别模型推理失败: {e}"))?;
        let rec_output = rec_outputs
            .get(rec_output_name.as_str())
            .ok_or_else(|| format!("识别模型没有输出: {rec_output_name}"))?;
        let rec_array = rec_output
            .try_extract_array::<f32>()
            .map_err(|e| format!("提取识别输出失败: {e}"))?
            .to_owned();
        let shape = rec_array.shape().to_vec();
        if shape.len() != 3 {
            return Err("识别输出维度异常".to_string());
        }

        let mut decoded = Vec::new();
        let mut last_index = 0usize;
        let mut score_sum = 0.0f32;
        let mut score_count = 0usize;

        if shape[2] >= shape[1] {
            let time_steps = shape[1];
            let class_count = shape[2];
            for t in 0..time_steps {
                let mut max_index = 0usize;
                let mut max_score = f32::NEG_INFINITY;
                for c in 0..class_count {
                    let score = rec_array[[0, t, c]];
                    if score > max_score {
                        max_score = score;
                        max_index = c;
                    }
                }
                if max_index == 0 || max_index == last_index {
                    last_index = max_index;
                    continue;
                }
                if let Some(character) = runtime.dictionary.get(max_index) {
                    decoded.push(character.clone());
                    score_sum += max_score;
                    score_count += 1;
                }
                last_index = max_index;
            }
        } else {
            let class_count = shape[1];
            let time_steps = shape[2];
            for t in 0..time_steps {
                let mut max_index = 0usize;
                let mut max_score = f32::NEG_INFINITY;
                for c in 0..class_count {
                    let score = rec_array[[0, c, t]];
                    if score > max_score {
                        max_score = score;
                        max_index = c;
                    }
                }
                if max_index == 0 || max_index == last_index {
                    last_index = max_index;
                    continue;
                }
                if let Some(character) = runtime.dictionary.get(max_index) {
                    decoded.push(character.clone());
                    score_sum += max_score;
                    score_count += 1;
                }
                last_index = max_index;
            }
        }

        let text = decoded.join("");
        let rec_score = if score_count == 0 {
            0.0
        } else {
            score_sum / score_count as f32
        };
        lines.push(FontOcrLine {
            box_points: rect_to_box_points(rect, original_size.width, original_size.height),
            det_score,
            text,
            rec_score,
        });
    }

    Ok(FontOcrPrediction {
        image_path: image_path.to_path_buf(),
        provider: runtime.provider_label.clone(),
        lines,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 验证指定样本图可以走完整的 OCR 推理链路。
    #[test]
    fn predict_sample_image() {
        let project_root = default_project_root();
        let image_path = project_root
            .join("data")
            .join("rec")
            .join("test")
            .join("word_000000.png");
        let result = predict_font_ocr(&image_path, true).expect("OCR 推理失败");
        println!("{result:#?}");
        assert!(!result.lines.is_empty());
    }
}
