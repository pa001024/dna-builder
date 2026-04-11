use clipper2_rust::clipper::inflate_paths_64;
use clipper2_rust::core::{Path64, Paths64, Point64};
use clipper2_rust::offset::{EndType, JoinType};
use ndarray::Array4;
use opencv::{
    core::{self, Mat, Point, Point2f, Rect, Scalar, Size, Vector},
    imgproc,
    prelude::{MatTraitConst, MatTraitConstManual, MatTraitManual},
};
use ort::{
    ep,
    session::builder::GraphOptimizationLevel,
    session::{Session, builder::AutoDevicePolicy},
    value::TensorRef,
};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
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
/// 默认 padding。
const DEFAULT_PADDING: i32 = 50;
/// 默认最长边。
const DEFAULT_MAX_SIDE_LEN: i32 = 1024;
/// 默认检测框置信度门限。
const DEFAULT_BOX_SCORE_THRESH: f32 = 0.6;
/// 默认二值门限。
const DEFAULT_BOX_THRESH: f32 = 0.3;
/// 默认文本框展开倍率。
const DEFAULT_UNCLIP_RATIO: f32 = 2.0;
/// 识别模型输入高度。
const REC_IMAGE_HEIGHT: i32 = 48;
/// 识别模型输入最大宽度。
const REC_IMAGE_WIDTH: i32 = 320;
/// 检测模型均值。
const DET_MEAN_VALUES: [f32; 3] = [0.485 * 255.0, 0.456 * 255.0, 0.406 * 255.0];
/// 检测模型归一化系数。
const DET_NORM_VALUES: [f32; 3] = [
    1.0 / (0.229 * 255.0),
    1.0 / (0.224 * 255.0),
    1.0 / (0.225 * 255.0),
];
/// 识别/分类模型均值。
const REC_MEAN_VALUES: [f32; 3] = [127.5, 127.5, 127.5];
/// 识别/分类模型归一化系数。
const REC_NORM_VALUES: [f32; 3] = [1.0 / 127.5, 1.0 / 127.5, 1.0 / 127.5];

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

/// OCR 运行时状态。
struct OcrRuntime {
    det_session: Option<Session>,
    cls_session: Option<Session>,
    rec_session: Session,
    dictionary: Vec<String>,
}

/// 图像缩放参数。
struct ScaleParam {
    dst_width: i32,
    dst_height: i32,
    scale_width: f32,
    scale_height: f32,
}

/// 检测框点集。
type TextBoxPoints = [Point; 4];

unsafe impl Send for OcrRuntime {}

/// OCR 全局单例。
static OCR_RUNTIME: OnceLock<Mutex<Option<OcrRuntime>>> = OnceLock::new();

/// 获取 OCR 全局状态容器。
fn ocr_runtime_cell() -> &'static Mutex<Option<OcrRuntime>> {
    OCR_RUNTIME.get_or_init(|| Mutex::new(None))
}

/// 获取 OCR 默认本地目录（优先 `%LOCALAPPDATA%`，失败回退到临时目录）。
fn default_ocr_root_dir() -> PathBuf {
    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        return PathBuf::from(local_app_data)
            .join("dna-builder")
            .join("ocr");
    }
    std::env::temp_dir().join("dna-builder").join("ocr")
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

/// 复制并添加白边。
fn make_padding(src: &Mat, padding: i32) -> Result<Mat, String> {
    if padding <= 0 {
        return Ok(src.clone());
    }

    let mut padding_src = Mat::default();
    core::copy_make_border(
        src,
        &mut padding_src,
        padding,
        padding,
        padding,
        padding,
        core::BORDER_ISOLATED,
        Scalar::all(255.0),
    )
    .map_err(|e| format!("OCR padding 失败: {e}"))?;
    Ok(padding_src)
}

/// 计算 C++ 同款缩放参数。
fn get_scale_param(src: &Mat, target_size: i32) -> Result<ScaleParam, String> {
    let src_width = src.cols();
    let src_height = src.rows();
    if src_width <= 0 || src_height <= 0 {
        return Err("OCR 缩放输入尺寸无效".to_string());
    }

    let ratio = if src_width > src_height {
        target_size as f32 / src_width as f32
    } else {
        target_size as f32 / src_height as f32
    };

    let mut dst_width = (src_width as f32 * ratio) as i32;
    let mut dst_height = (src_height as f32 * ratio) as i32;
    if dst_width % 32 != 0 {
        dst_width = (dst_width / 32) * 32;
        dst_width = dst_width.max(32);
    }
    if dst_height % 32 != 0 {
        dst_height = (dst_height / 32) * 32;
        dst_height = dst_height.max(32);
    }

    Ok(ScaleParam {
        dst_width,
        dst_height,
        scale_width: dst_width as f32 / src_width as f32,
        scale_height: dst_height as f32 / src_height as f32,
    })
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
        fs::create_dir_all(parent)
            .map_err(|e| format!("创建目录失败: {}, {e}", parent.display()))?;
    }

    let tmp_path = target_path.with_extension("downloading");
    fs::write(&tmp_path, &bytes)
        .map_err(|e| format!("写入临时文件失败: {}, {e}", tmp_path.display()))?;
    if target_path.exists() {
        fs::remove_file(target_path)
            .map_err(|e| format!("删除旧文件失败: {}, {e}", target_path.display()))?;
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
fn ensure_resource_file(
    base_url: &str,
    remote_relative: &str,
    local_path: &Path,
) -> Result<(), String> {
    if let Ok(meta) = fs::metadata(local_path)
        && meta.is_file()
        && meta.len() > 0
    {
        return Ok(());
    }

    let url = build_cdn_url(base_url, remote_relative);
    download_file(&url, local_path)
}

/// 预下载 OCR 运行所需文件。
fn ensure_ocr_resources(root_dir: &Path, base_url: &str) -> Result<(), String> {
    let resource_list = vec![
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
        (
            "models/ppocr_keys_v1.txt",
            root_dir.join("models").join(KEYS_FILE),
        ),
    ];

    for (remote_relative, local_path) in resource_list {
        ensure_resource_file(base_url, remote_relative, local_path.as_path())?;
    }

    Ok(())
}

/// 获取默认检测模型路径。
fn default_det_model_path(project_root: &Path) -> PathBuf {
    project_root.join("models").join(DET_MODEL_FILE)
}

/// 获取默认识别模型路径。
fn default_rec_model_path(project_root: &Path) -> PathBuf {
    project_root.join("models").join(REC_MODEL_FILE)
}

/// 获取默认字典路径。
fn default_dict_path(project_root: &Path) -> PathBuf {
    project_root.join("models").join(KEYS_FILE)
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

/// 读取字典文件，并补上 C++ 同款 `#` / 空格标记。
fn load_dictionary(dict_path: &Path) -> Result<Vec<String>, String> {
    let text = fs::read_to_string(dict_path)
        .map_err(|e| format!("读取字典失败: {}, {e}", dict_path.display()))?;
    let mut dictionary = Vec::with_capacity(text.lines().count() + 2);
    dictionary.push("#".to_string());
    for line in text.lines() {
        let value = line.trim_end_matches(['\r', '\n']);
        dictionary.push(value.to_string());
    }
    dictionary.push(" ".to_string());
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
    num_thread: i32,
) -> Result<(Session, String), String> {
    let base_builder =
        Session::builder().map_err(|e| format!("创建 {label} SessionBuilder 失败: {e}"))?;

    if use_gpu
        && let Ok(builder) = base_builder.with_execution_providers([ep::DirectML::default()
            .with_device_filter(ep::directml::DeviceFilter::Gpu)
            .with_performance_preference(ep::directml::PerformancePreference::HighPerformance)
            .build()
            .error_on_failure()])
    {
        if let Ok(builder) = builder
            .with_intra_threads(num_thread.max(1) as usize)
            .and_then(|builder| builder.with_inter_threads(num_thread.max(1) as usize))
        {
            let mut builder = builder;
            if let Ok(session) = builder.commit_from_file(model_path) {
                return Ok((session, "DirectML".to_string()));
            }
        }
    }

    let mut builder =
        Session::builder().map_err(|e| format!("创建 {label} SessionBuilder 失败: {e}"))?;
    if use_gpu {
        builder = match builder.with_auto_device(AutoDevicePolicy::PreferGPU) {
            Ok(builder) => builder,
            Err(_) => Session::builder()
                .map_err(|e| format!("创建 {label} SessionBuilder 失败: {e}"))?
                .with_auto_device(AutoDevicePolicy::Default)
                .map_err(|e| format!("配置 {label} 自动设备策略失败: {e}"))?,
        };
    }
    builder = builder
        .with_optimization_level(GraphOptimizationLevel::All)
        .map_err(|e| format!("配置 {label} 图优化级别失败: {e}"))?;
    builder = builder
        .with_intra_threads(num_thread.max(1) as usize)
        .map_err(|e| format!("配置 {label} IntraOp 线程失败: {e}"))?;
    builder = builder
        .with_inter_threads(num_thread.max(1) as usize)
        .map_err(|e| format!("配置 {label} InterOp 线程失败: {e}"))?;

    let session = builder
        .commit_from_file(model_path)
        .map_err(|e| format!("加载 {label} 失败: {e}"))?;
    Ok((session, "CPUFallback".to_string()))
}

/// 计算多边形面积相关参数，用于展开文本框。
fn get_contour_area(points: &[Point2f; 4], unclip_ratio: f32) -> f32 {
    let mut area = 0.0f32;
    let mut dist = 0.0f32;
    for i in 0..4usize {
        let next = (i + 1) % 4;
        area += points[i].x * points[next].y - points[i].y * points[next].x;
        dist += ((points[i].x - points[next].x).powi(2) + (points[i].y - points[next].y).powi(2))
            .sqrt();
    }

    let area = (area / 2.0).abs();
    if dist <= 0.0 {
        return 0.0;
    }
    area * unclip_ratio / dist
}

/// 扩张文本框，保持和 C++ `unClip` 一致的行为。
fn unclip_box(points: &[Point2f; 4], unclip_ratio: f32) -> Result<core::RotatedRect, String> {
    let distance = get_contour_area(points, unclip_ratio);
    if distance <= 0.0 {
        return core::RotatedRect::new(Point2f::new(0.0, 0.0), core::Size2f::new(1.0, 1.0), 0.0)
            .map_err(|e| format!("创建默认文本框失败: {e}"));
    }

    let mut path = Path64::with_capacity(4);
    for point in points {
        path.push(Point64::new(point.x as i64, point.y as i64));
    }
    let paths: Paths64 = vec![path];
    let inflated = inflate_paths_64(
        &paths,
        distance as f64,
        JoinType::Round,
        EndType::Polygon,
        2.0,
        0.0,
    );
    let first_path = inflated
        .first()
        .ok_or_else(|| "OCR 展开文本框失败".to_string())?;
    let mut contour = Vector::<Point>::new();
    for point in first_path {
        contour.push(Point::new(point.x as i32, point.y as i32));
    }
    if contour.len() < 3 {
        return core::RotatedRect::new(Point2f::new(0.0, 0.0), core::Size2f::new(1.0, 1.0), 0.0)
            .map_err(|e| format!("创建默认文本框失败: {e}"));
    }
    imgproc::min_area_rect(&contour).map_err(|e| format!("计算最小外接旋转矩形失败: {e}"))
}

/// 判断点是否在多边形中。
fn polygon_score(points: &[Point2f; 4], score_map: &Mat) -> Result<f32, String> {
    let mut min_x = points[0].x;
    let mut max_x = points[0].x;
    let mut min_y = points[0].y;
    let mut max_y = points[0].y;
    for point in points {
        min_x = min_x.min(point.x);
        max_x = max_x.max(point.x);
        min_y = min_y.min(point.y);
        max_y = max_y.max(point.y);
    }

    let left = min_x.floor().clamp(0.0, (score_map.cols() - 1) as f32) as i32;
    let right = max_x.ceil().clamp(0.0, (score_map.cols() - 1) as f32) as i32;
    let top = min_y.floor().clamp(0.0, (score_map.rows() - 1) as f32) as i32;
    let bottom = max_y.ceil().clamp(0.0, (score_map.rows() - 1) as f32) as i32;

    if right < left || bottom < top {
        return Ok(0.0);
    }

    let roi = Mat::roi(
        score_map,
        Rect::new(left, top, right - left + 1, bottom - top + 1),
    )
    .map_err(|e| format!("获取检测打分 ROI 失败: {e}"))?;
    let mut mask = Mat::new_rows_cols_with_default(
        bottom - top + 1,
        right - left + 1,
        core::CV_8UC1,
        Scalar::all(0.0),
    )
    .map_err(|e| format!("创建检测掩码失败: {e}"))?;
    let mut shifted = Vector::<Point>::new();
    for point in points {
        shifted.push(Point::new((point.x as i32) - left, (point.y as i32) - top));
    }
    let mut polys = Vector::<Vector<Point>>::new();
    polys.push(shifted);
    imgproc::fill_poly_def(&mut mask, &polys, Scalar::all(1.0))
        .map_err(|e| format!("填充检测掩码失败: {e}"))?;
    let mean = core::mean(&roi, &mask).map_err(|e| format!("计算检测框分数失败: {e}"))?;
    Ok(mean[0] as f32)
}

/// 依据旋转矩形裁剪文本区域。
fn get_rotate_crop_image(src: &Mat, box_points: &[Point; 4]) -> Result<Mat, String> {
    let xs = [
        box_points[0].x,
        box_points[1].x,
        box_points[2].x,
        box_points[3].x,
    ];
    let ys = [
        box_points[0].y,
        box_points[1].y,
        box_points[2].y,
        box_points[3].y,
    ];
    let left = *xs
        .iter()
        .min()
        .ok_or_else(|| "裁剪框缺少 X 坐标".to_string())?;
    let right = *xs
        .iter()
        .max()
        .ok_or_else(|| "裁剪框缺少 X 坐标".to_string())?;
    let top = *ys
        .iter()
        .min()
        .ok_or_else(|| "裁剪框缺少 Y 坐标".to_string())?;
    let bottom = *ys
        .iter()
        .max()
        .ok_or_else(|| "裁剪框缺少 Y 坐标".to_string())?;

    let rect = Rect::new(left, top, right - left, bottom - top);
    let img_crop = Mat::roi(src, rect).map_err(|e| format!("裁剪检测框失败: {e}"))?;

    let mut points = [Point2f::new(0.0, 0.0); 4];
    for (idx, point) in box_points.iter().enumerate() {
        points[idx] = Point2f::new((point.x - left) as f32, (point.y - top) as f32);
    }

    let img_crop_width =
        (((points[0].x - points[1].x).powi(2) + (points[0].y - points[1].y).powi(2)).sqrt()) as i32;
    let img_crop_height =
        (((points[0].x - points[3].x).powi(2) + (points[0].y - points[3].y).powi(2)).sqrt()) as i32;
    let img_crop_width = img_crop_width.max(1);
    let img_crop_height = img_crop_height.max(1);

    let src_pts = Vector::<Point2f>::from_iter(points);
    let dst_pts = Vector::<Point2f>::from_iter([
        Point2f::new(0.0, 0.0),
        Point2f::new(img_crop_width as f32, 0.0),
        Point2f::new(img_crop_width as f32, img_crop_height as f32),
        Point2f::new(0.0, img_crop_height as f32),
    ]);
    let m = imgproc::get_perspective_transform(&src_pts, &dst_pts, 0)
        .map_err(|e| format!("生成透视变换矩阵失败: {e}"))?;
    let mut part_img = Mat::default();
    imgproc::warp_perspective(
        &img_crop,
        &mut part_img,
        &m,
        Size::new(img_crop_width, img_crop_height),
        imgproc::INTER_LINEAR,
        core::BORDER_REPLICATE,
        Scalar::all(0.0),
    )
    .map_err(|e| format!("文本裁剪透视变换失败: {e}"))?;

    if (part_img.rows() as f32) >= (part_img.cols() as f32) * 1.5 {
        let mut rotated = Mat::default();
        core::transpose(&part_img, &mut rotated).map_err(|e| format!("竖图转置失败: {e}"))?;
        let mut rotated_180 = Mat::default();
        core::flip(&rotated, &mut rotated_180, 0).map_err(|e| format!("竖图翻转失败: {e}"))?;
        Ok(rotated_180)
    } else {
        Ok(part_img)
    }
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

/// 按 C++ 的 `substractMeanNormalize` 生成 NCHW 张量。
fn substract_mean_normalize(
    src: &Mat,
    mean_vals: [f32; 3],
    norm_vals: [f32; 3],
) -> Result<Vec<f32>, String> {
    let rows = src.rows();
    let cols = src.cols();
    let channels = src.channels();
    if rows <= 0 || cols <= 0 || channels != 3 {
        return Err("OCR 归一化输入无效".to_string());
    }

    let data = src
        .data_bytes()
        .map_err(|e| format!("读取 OCR 图像数据失败: {e}"))?;
    let image_size = (rows * cols) as usize;
    let mut values = vec![0f32; image_size * channels as usize];
    for pid in 0..image_size {
        let base = pid * channels as usize;
        for ch in 0..channels as usize {
            let data_value = data[base + ch] as f32;
            values[ch * image_size + pid] =
                data_value * norm_vals[ch] - mean_vals[ch] * norm_vals[ch];
        }
    }
    Ok(values)
}

/// 将检测输入图像转成 NCHW 张量。
fn mat_to_det_array(input: &Mat, scale: &ScaleParam) -> Result<Array4<f32>, String> {
    let mut resized = Mat::default();
    imgproc::resize(
        input,
        &mut resized,
        Size::new(scale.dst_width, scale.dst_height),
        0.0,
        0.0,
        imgproc::INTER_LINEAR,
    )
    .map_err(|e| format!("检测图像缩放失败: {e}"))?;

    let data = substract_mean_normalize(&resized, DET_MEAN_VALUES, DET_NORM_VALUES)?;
    Array4::from_shape_vec(
        (1, 3, scale.dst_height as usize, scale.dst_width as usize),
        data,
    )
    .map_err(|e| format!("构造检测输入张量失败: {e}"))
}

/// 将识别输入图像转成 C++ 同款动态宽度 NCHW 张量。
fn mat_to_rec_array(input: &Mat, image_shape: (i32, i32, i32)) -> Result<Array4<f32>, String> {
    let (_, img_h, _img_w) = image_shape;
    let normalized = normalize_input_mat(input)?;
    let height = normalized.rows();
    let width = normalized.cols();
    if height <= 0 || width <= 0 {
        return Err("识别输入尺寸无效".to_string());
    }

    let ratio = width as f32 / height as f32;
    let mut resized_w = (img_h as f32 * ratio) as i32;
    resized_w = resized_w.max(1);

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

    let data = substract_mean_normalize(&resized, REC_MEAN_VALUES, REC_NORM_VALUES)?;
    Array4::from_shape_vec((1, 3, img_h as usize, resized_w as usize), data)
        .map_err(|e| format!("构造识别输入张量失败: {e}"))
}

/// 将分类输入图像转成 C++ 同款固定尺寸 NCHW 张量。
fn mat_to_cls_array(input: &Mat, image_shape: (i32, i32, i32)) -> Result<Array4<f32>, String> {
    let (_, img_h, img_w) = image_shape;
    let scale = img_h as f32 / input.rows() as f32;
    let mut angle_width = (input.cols() as f32 * scale) as i32;
    angle_width = angle_width.max(1);

    let mut resized = Mat::default();
    imgproc::resize(
        input,
        &mut resized,
        Size::new(angle_width, img_h),
        0.0,
        0.0,
        imgproc::INTER_LINEAR,
    )
    .map_err(|e| format!("分类图像缩放失败: {e}"))?;

    let mut fitted =
        Mat::new_rows_cols_with_default(img_h, img_w, core::CV_8UC3, Scalar::all(255.0))
            .map_err(|e| format!("创建分类输入画布失败: {e}"))?;
    if angle_width < img_w {
        let rect = Rect::new(0, 0, resized.cols(), resized.rows());
        let mut roi =
            Mat::roi_mut(&mut fitted, rect).map_err(|e| format!("获取分类画布 ROI 失败: {e}"))?;
        resized
            .copy_to(&mut roi)
            .map_err(|e| format!("拷贝分类缩放图失败: {e}"))?;
    } else {
        let rect = Rect::new(0, 0, img_w, img_h);
        let src_roi = Mat::roi(&resized, rect).map_err(|e| format!("裁剪分类缩放图失败: {e}"))?;
        let mut roi =
            Mat::roi_mut(&mut fitted, rect).map_err(|e| format!("获取分类画布 ROI 失败: {e}"))?;
        src_roi
            .copy_to(&mut roi)
            .map_err(|e| format!("拷贝分类缩放图失败: {e}"))?;
    }

    let data = substract_mean_normalize(&fitted, REC_MEAN_VALUES, REC_NORM_VALUES)?;
    Array4::from_shape_vec((1, 3, img_h as usize, img_w as usize), data)
        .map_err(|e| format!("构造分类输入张量失败: {e}"))
}

/// 计算文本行的 CTC 解码结果。
fn decode_ctc(
    prediction: &[f32],
    time_dim: usize,
    class_dim: usize,
    dictionary: &[String],
) -> (String, f32) {
    let mut last_index = 0usize;
    let mut chars = Vec::new();
    let mut scores = Vec::new();

    for t in 0..time_dim {
        let mut max_index = 0usize;
        let mut max_score = f32::NEG_INFINITY;
        for c in 0..class_dim {
            let score = prediction[t * class_dim + c];
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

/// 从检测概率图中提取文本框。
fn detect_boxes_from_map(
    score_map: &Mat,
    scale: &ScaleParam,
    original_size: Size,
) -> Result<Vec<(TextBoxPoints, f32)>, String> {
    let mut threshold_mat = Mat::default();
    imgproc::threshold(
        score_map,
        &mut threshold_mat,
        DEFAULT_BOX_THRESH as f64,
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

    let mut binary_mask = threshold_u8;
    let kernel =
        imgproc::get_structuring_element(imgproc::MORPH_RECT, Size::new(2, 2), Point::new(-1, -1))
            .map_err(|e| format!("创建检测膨胀核失败: {e}"))?;
    let mut dilated = Mat::default();
    imgproc::dilate(
        &binary_mask,
        &mut dilated,
        &kernel,
        Point::new(-1, -1),
        1,
        core::BORDER_CONSTANT,
        Scalar::all(0.0),
    )
    .map_err(|e| format!("检测二值图膨胀失败: {e}"))?;
    binary_mask = dilated;

    let mut contours = Vector::<Vector<Point>>::new();
    imgproc::find_contours_def(
        &binary_mask,
        &mut contours,
        imgproc::RETR_LIST,
        imgproc::CHAIN_APPROX_SIMPLE,
    )
    .map_err(|e| format!("检测轮廓提取失败: {e}"))?;

    let mut results = Vec::new();

    for idx in 0..contours.len() {
        let contour = contours
            .get(idx)
            .map_err(|e| format!("读取检测轮廓失败: {e}"))?;
        if contour.len() < 3 {
            continue;
        }
        let rotated = imgproc::min_area_rect(&contour)
            .map_err(|e| format!("计算最小外接旋转矩形失败: {e}"))?;
        let mut vertices = [Point2f::new(0.0, 0.0); 4];
        rotated
            .points(&mut vertices)
            .map_err(|e| format!("读取旋转矩形顶点失败: {e}"))?;
        let long_side = rotated.size.width.max(rotated.size.height);
        if long_side < 3.0 {
            continue;
        }

        let score = polygon_score(&vertices, score_map)?;
        if score < DEFAULT_BOX_SCORE_THRESH {
            continue;
        }

        let unclipped = unclip_box(&vertices, DEFAULT_UNCLIP_RATIO)?;
        let mut clip_vertices = [Point2f::new(0.0, 0.0); 4];
        unclipped
            .points(&mut clip_vertices)
            .map_err(|e| format!("读取展开后矩形顶点失败: {e}"))?;
        let clip_vertices = order_box_points(clip_vertices);

        let long_side_after = unclipped.size.width.max(unclipped.size.height);
        if long_side_after < 5.0 {
            continue;
        }

        let mut box_points = [Point::new(0, 0); 4];
        for (index, point) in clip_vertices.iter().enumerate() {
            let x = (point.x / scale.scale_width).floor() as i32;
            let y = (point.y / scale.scale_height).floor() as i32;
            box_points[index] = Point::new(
                x.clamp(0, original_size.width - 1),
                y.clamp(0, original_size.height - 1),
            );
        }
        results.push((box_points, score));
    }

    results.reverse();

    Ok(results)
}

/// 按 C++ `getMinBoxes` 的顺序整理四点坐标。
fn order_box_points(points: [Point2f; 4]) -> [Point2f; 4] {
    let mut box_points = points;
    box_points.sort_by(|a, b| a.x.partial_cmp(&b.x).unwrap_or(std::cmp::Ordering::Equal));

    let (index1, index4) = if box_points[1].y > box_points[0].y {
        (0, 1)
    } else {
        (1, 0)
    };
    let (index2, index3) = if box_points[3].y > box_points[2].y {
        (2, 3)
    } else {
        (3, 2)
    };

    [
        box_points[index1],
        box_points[index2],
        box_points[index3],
        box_points[index4],
    ]
}

/// 执行 OCR 检测并裁剪候选文本块。
fn detect_and_crop_text_blocks(
    normalized: &Mat,
    runtime: &mut OcrRuntime,
) -> Result<Vec<(TextBoxPoints, f32, Mat)>, String> {
    let original_size = normalized
        .size()
        .map_err(|e| format!("读取 OCR 输入尺寸失败: {e}"))?;
    let origin_max_side = original_size.width.max(original_size.height);
    let resize = if DEFAULT_MAX_SIDE_LEN <= 0 || DEFAULT_MAX_SIDE_LEN > origin_max_side {
        origin_max_side
    } else {
        DEFAULT_MAX_SIDE_LEN
    };
    let padding = DEFAULT_PADDING.max(0);
    let padding_src = make_padding(&normalized, padding)?;
    let scale = get_scale_param(&padding_src, resize + 2 * padding)?;
    let mut crops: Vec<(TextBoxPoints, f32, Mat)> = Vec::new();

    if let Some(det_session) = runtime.det_session.as_mut() {
        let det_array = mat_to_det_array(&padding_src, &scale)?;
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

        let boxes = detect_boxes_from_map(
            &score_map,
            &scale,
            padding_src
                .size()
                .map_err(|e| format!("读取 OCR 输入尺寸失败: {e}"))?,
        )?;

        for (box_points, det_score) in boxes {
            let crop = get_rotate_crop_image(&padding_src, &box_points)?;
            crops.push((box_points, det_score, crop));
        }
    } else {
        crops.push((
            [
                Point::new(0, 0),
                Point::new(original_size.width - 1, 0),
                Point::new(original_size.width - 1, original_size.height - 1),
                Point::new(0, original_size.height - 1),
            ],
            1.0,
            padding_src.clone(),
        ));
    }

    if crops.is_empty() {
        crops.push((
            [
                Point::new(0, 0),
                Point::new(original_size.width - 1, 0),
                Point::new(original_size.width - 1, original_size.height - 1),
                Point::new(0, original_size.height - 1),
            ],
            1.0,
            padding_src.clone(),
        ));
    }

    Ok(crops)
}

/// 将裁剪块解码为最终文本。
fn recognize_text_blocks(
    blocks: Vec<(TextBoxPoints, f32, Mat)>,
    runtime: &mut OcrRuntime,
) -> Result<String, String> {
    let mut crops: Vec<(TextBoxPoints, f32, Mat)> = blocks;
    if let Some(cls_session) = runtime.cls_session.as_mut() {
        let cls_output_name = first_output_name(cls_session, "分类模型")?;
        let mut angles = Vec::with_capacity(crops.len());

        for (_, _, crop) in &crops {
            let cls_array = mat_to_cls_array(crop, (3, 48, 192))?;
            let cls_outputs = cls_session
                .run(ort::inputs! {
                    "x" => TensorRef::from_array_view(cls_array.view())
                        .map_err(|e| format!("创建分类输入张量失败: {e}"))?
                })
                .map_err(|e| format!("分类模型推理失败: {e}"))?;
            let cls_output = cls_outputs
                .get(cls_output_name.as_str())
                .ok_or_else(|| format!("分类模型没有输出: {cls_output_name}"))?;
            let cls_array = cls_output
                .try_extract_array::<f32>()
                .map_err(|e| format!("提取分类输出失败: {e}"))?
                .to_owned();
            let shape = cls_array.shape().to_vec();
            let angle_index = if shape.len() == 2
                && shape[0] == 1
                && shape[1] >= 2
                && cls_array[[0, 1]] > cls_array[[0, 0]]
            {
                1
            } else {
                0
            };
            angles.push(angle_index);
        }

        if !angles.is_empty() {
            let sum = angles.iter().copied().sum::<i32>() as f64;
            let half_percent = angles.len() as f64 / 2.0;
            let most_angle_index = if sum < half_percent { 0 } else { 1 };
            if most_angle_index == 1 {
                for (_, _, crop) in &mut crops {
                    let mut rotated = Mat::default();
                    core::rotate(crop, &mut rotated, core::RotateFlags::ROTATE_180.into())
                        .map_err(|e| format!("OCR 旋转 180 度失败: {e}"))?;
                    *crop = rotated;
                }
            }
        }
    }

    let mut lines = Vec::new();
    for (box_points, det_score, crop) in crops {
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

        let rec_view = rec_array
            .as_slice()
            .ok_or_else(|| "识别输出内存非连续".to_string())?;
        let (time_dim, class_dim, offset) = if shape[2] >= shape[1] {
            (shape[1], shape[2], 0usize)
        } else {
            (shape[2], shape[1], 0usize)
        };
        let (decoded, rec_score) = decode_ctc(
            &rec_view[offset..],
            time_dim,
            class_dim,
            &runtime.dictionary,
        );

        lines.push((box_points, det_score, decoded, rec_score));
    }

    let mut result = String::new();
    for (index, (_box_points, _det_score, text, _rec_score)) in lines.iter().enumerate() {
        if index > 0 {
            result.push('\n');
        }
        result.push_str(text);
    }
    Ok(result)
}

#[cfg(test)]
pub(crate) fn ocr_test_assets_root() -> PathBuf {
    default_ocr_root_dir()
}

#[cfg(test)]
pub(crate) fn ocr_test_image_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(|parent| parent.join("misc").join("1.png"))
        .unwrap_or_else(|| PathBuf::from("misc").join("1.png"))
}

#[cfg(test)]
pub(crate) fn ocr_test_load_mat(image_path: &Path) -> Result<Mat, String> {
    let path_string = image_path.to_string_lossy().to_string();
    opencv::imgcodecs::imread(&path_string, opencv::imgcodecs::IMREAD_COLOR)
        .map_err(|e| format!("读取测试图像失败: {}: {e}", image_path.display()))
}

/// 初始化 OCR：下载资源、加载 ONNX 模型、创建推理会话。
pub fn init_ocr(config: OcrInitConfig) -> Result<PathBuf, String> {
    let root_dir = config.local_root_dir.unwrap_or_else(default_ocr_root_dir);
    let cdn_base_url = normalize_cdn_base_url(config.cdn_base_url);
    ensure_ocr_resources(root_dir.as_path(), &cdn_base_url)?;

    let dictionary_path = resolve_model_path("OCR_DICT_PATH", default_dict_path(&root_dir));
    let dictionary = load_dictionary(&dictionary_path)?;

    let det_model_path =
        resolve_model_path("OCR_DET_MODEL_PATH", default_det_model_path(&root_dir));
    let rec_model_path =
        resolve_model_path("OCR_REC_MODEL_PATH", default_rec_model_path(&root_dir));
    let cls_model_path = resolve_model_path(
        "OCR_CLS_MODEL_PATH",
        root_dir.join("models").join(CLS_MODEL_FILE),
    );

    if !rec_model_path.exists() {
        return Err(format!(
            "未找到识别 ONNX 模型: {}",
            rec_model_path.display()
        ));
    }
    if !dictionary_path.exists() {
        return Err(format!("未找到字典文件: {}", dictionary_path.display()));
    }

    let (rec_session, _rec_provider) =
        build_session_with_auto_device(&rec_model_path, "识别模型", false, config.num_thread)?;
    let (det_session, _det_provider) = if det_model_path.exists() {
        let (session, provider) =
            build_session_with_auto_device(&det_model_path, "检测模型", false, config.num_thread)?;
        (Some(session), provider)
    } else {
        (None, "FallbackFullImage".to_string())
    };
    let (cls_session, _cls_provider) = if cls_model_path.exists() {
        let (session, provider) =
            build_session_with_auto_device(&cls_model_path, "分类模型", false, config.num_thread)?;
        (Some(session), provider)
    } else {
        (None, "Disabled".to_string())
    };

    let runtime = OcrRuntime {
        det_session,
        cls_session,
        rec_session,
        dictionary,
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
        return Err(format!("OCR 仅支持 1/3/4 通道 Mat，当前通道数: {channels}"));
    }
    let normalized = normalize_input_mat(input)?;
    let size = normalized
        .size()
        .map_err(|e| format!("读取 OCR 输入尺寸失败: {e}"))?;
    if size.width <= 0 || size.height <= 0 {
        return Err("OCR 输入 Mat 尺寸无效".to_string());
    }

    let crops = detect_and_crop_text_blocks(&normalized, runtime)?;
    let text = recognize_text_blocks(crops, runtime)?;
    if text.is_empty() {
        Ok(text)
    } else {
        Ok(format!("{text}\n"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::{CString, OsStr, c_char, c_int, c_void};
    use std::os::windows::ffi::OsStrExt;
    use std::path::Path;
    use std::time::Instant;
    use windows::{
        Win32::{
            Foundation::{FreeLibrary, HMODULE},
            System::LibraryLoader::{GetProcAddress, LoadLibraryW},
        },
        core::{PCSTR, PCWSTR},
    };

    type OcrHandle = *mut c_void;
    type OcrInitFn = unsafe extern "C" fn(
        det_model: *const u16,
        cls_model: *const u16,
        rec_model: *const u16,
        keys_dict: *const u16,
        num_thread: c_int,
    ) -> OcrHandle;
    #[repr(C)]
    struct OcrParamRaw {
        padding: i32,
        max_side_len: i32,
        box_score_thresh: f32,
        box_thresh: f32,
        un_clip_ratio: f32,
        do_angle: i32,
        most_angle: i32,
        output_path: *const c_char,
    }

    type OcrDestroyFn = unsafe extern "C" fn(handle: OcrHandle);
    type OcrTextCallback = unsafe extern "C" fn(*mut c_void, *const c_char, *const c_void);
    type OcrDetectMatFn = unsafe extern "C" fn(
        handle: OcrHandle,
        mat: *const c_void,
        param: *const c_void,
        callback: OcrTextCallback,
        userdata: *mut c_void,
    ) -> u8;

    struct DllOcrRuntime {
        module: HMODULE,
        handle: OcrHandle,
        detect_mat: OcrDetectMatFn,
        destroy: OcrDestroyFn,
    }

    impl Drop for DllOcrRuntime {
        fn drop(&mut self) {
            unsafe {
                (self.destroy)(self.handle);
                let _ = FreeLibrary(self.module);
            }
        }
    }

    fn path_to_utf16(path: &Path) -> Vec<u16> {
        OsStr::new(path)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect()
    }

    unsafe fn load_proc<T>(module: HMODULE, name: &str) -> Result<T, String> {
        let symbol_name = CString::new(name).map_err(|e| format!("导出函数名无效: {name}, {e}"))?;
        let proc = unsafe { GetProcAddress(module, PCSTR(symbol_name.as_ptr() as *const u8)) }
            .ok_or_else(|| format!("找不到导出函数: {name}"))?;
        Ok(unsafe { std::mem::transmute_copy(&proc) })
    }

    unsafe extern "C" fn collect_ocr_text(
        userdata: *mut c_void,
        text: *const c_char,
        _result: *const c_void,
    ) {
        if userdata.is_null() || text.is_null() {
            return;
        }
        let output = unsafe { &mut *(userdata as *mut String) };
        let value = unsafe { std::ffi::CStr::from_ptr(text) };
        *output = value.to_string_lossy().to_string();
    }

    /// 构造和原生 DLL 一致的默认参数。
    fn default_dll_param() -> OcrParamRaw {
        OcrParamRaw {
            padding: DEFAULT_PADDING,
            max_side_len: DEFAULT_MAX_SIDE_LEN,
            box_score_thresh: DEFAULT_BOX_SCORE_THRESH,
            box_thresh: DEFAULT_BOX_THRESH,
            un_clip_ratio: DEFAULT_UNCLIP_RATIO,
            do_angle: 1,
            most_angle: 1,
            output_path: std::ptr::null(),
        }
    }

    fn init_dll_ocr(root_dir: &Path) -> Result<DllOcrRuntime, String> {
        let dll_path = root_dir.join("RapidOcrOnnx.dll");
        let det_path = root_dir.join("models").join(DET_MODEL_FILE);
        let cls_path = root_dir.join("models").join(CLS_MODEL_FILE);
        let rec_path = root_dir.join("models").join(REC_MODEL_FILE);
        let keys_path = root_dir.join("models").join(KEYS_FILE);

        let wide_path = path_to_utf16(&dll_path);
        let module = unsafe { LoadLibraryW(PCWSTR(wide_path.as_ptr())) }
            .map_err(|e| format!("加载 OCR DLL 失败: {}, {e}", dll_path.display()))?;

        let init_result = (|| -> Result<DllOcrRuntime, String> {
            let ocr_init: OcrInitFn = unsafe { load_proc(module, "OcrInit")? };
            let ocr_destroy: OcrDestroyFn = unsafe { load_proc(module, "OcrDestroy")? };
            let ocr_detect_mat: OcrDetectMatFn = unsafe { load_proc(module, "OcrDetectMat")? };
            let det_model = path_to_utf16(&det_path);
            let cls_model = path_to_utf16(&cls_path);
            let rec_model = path_to_utf16(&rec_path);
            let keys_dict = path_to_utf16(&keys_path);
            let handle = unsafe {
                ocr_init(
                    det_model.as_ptr(),
                    cls_model.as_ptr(),
                    rec_model.as_ptr(),
                    keys_dict.as_ptr(),
                    2,
                )
            };
            if handle.is_null() {
                return Err("OCR DLL 初始化失败".to_string());
            }
            Ok(DllOcrRuntime {
                module,
                handle,
                detect_mat: ocr_detect_mat,
                destroy: ocr_destroy,
            })
        })();

        match init_result {
            Ok(runtime) => Ok(runtime),
            Err(err) => {
                unsafe {
                    let _ = FreeLibrary(module);
                }
                Err(err)
            }
        }
    }

    fn run_dll_ocr(runtime: &DllOcrRuntime, mat: &Mat) -> Result<String, String> {
        let mut text = String::new();
        let param = default_dll_param();
        let success = unsafe {
            (runtime.detect_mat)(
                runtime.handle,
                mat.as_raw_Mat(),
                &param as *const OcrParamRaw as *const c_void,
                collect_ocr_text,
                &mut text as *mut String as *mut c_void,
            )
        };
        if success == 0 {
            return Ok(String::new());
        }
        Ok(text)
    }

    fn prepare_direct_ocr(root_dir: &Path) -> Result<(), String> {
        let config = OcrInitConfig {
            local_root_dir: Some(root_dir.to_path_buf()),
            cdn_base_url: None,
            num_thread: 2,
        };
        let _ = init_ocr(config)?;
        Ok(())
    }

    fn run_direct_ocr(mat: &Mat) -> Result<String, String> {
        ocr_text_from_mat(mat)
    }

    #[test]
    fn direct_ocr_matches_dll_output_and_speed() {
        let root_dir = ocr_test_assets_root();
        let image_path = ocr_test_image_path();
        if !image_path.exists() {
            panic!("测试图像不存在: {}", image_path.display());
        }
        if !root_dir.join("RapidOcrOnnx.dll").exists() {
            panic!("OCR DLL 不存在: {}", root_dir.display());
        }

        let dict_path = root_dir.join("models").join(KEYS_FILE);
        let dictionary = load_dictionary(&dict_path).expect("加载字典失败");
        let raw_keys = std::fs::read_to_string(&dict_path).expect("读取字典源文件失败");
        assert_eq!(
            dictionary.len(),
            raw_keys.lines().count() + 2,
            "字典长度必须和 C++ 约定一致"
        );
        assert_eq!(
            dictionary.first().map(String::as_str),
            Some("#"),
            "字典首项必须是 C++ blank 标记"
        );
        assert_eq!(
            dictionary.last().map(String::as_str),
            Some(" "),
            "字典末项必须是 C++ 空格标记"
        );

        let mat = ocr_test_load_mat(&image_path).expect("读取测试图像失败");
        let dll_runtime = init_dll_ocr(&root_dir).expect("初始化 DLL OCR 失败");

        prepare_direct_ocr(&root_dir).expect("初始化直接 OCR 失败");
        let warmup_direct = run_direct_ocr(&mat).expect("直接 OCR 失败");
        let warmup_dll = run_dll_ocr(&dll_runtime, &mat).expect("DLL OCR 失败");
        assert_eq!(warmup_direct, warmup_dll, "直接推理和 DLL 首次输出不一致");

        {
            let mut guard = ocr_runtime_cell().lock().expect("获取 OCR 状态锁失败");
            let runtime = guard.as_mut().expect("OCR 未初始化");
            let detect_start = Instant::now();
            let crops = detect_and_crop_text_blocks(&mat, runtime).expect("直接检测失败");
            let detect_elapsed = detect_start.elapsed().as_millis();
            let recognize_start = Instant::now();
            let text = recognize_text_blocks(crops, runtime).expect("直接识别失败");
            let recognize_elapsed = recognize_start.elapsed().as_millis();
            eprintln!(
                "direct stage detect={}ms recognize={}ms blocks={}",
                detect_elapsed,
                recognize_elapsed,
                text.lines().count()
            );
        }

        let iterations = 10usize;
        let mut direct_total = 0u128;
        let mut dll_total = 0u128;
        let mut direct_text = String::new();
        let mut dll_text = String::new();

        for _ in 0..iterations {
            let start = Instant::now();
            direct_text = run_direct_ocr(&mat).expect("直接 OCR 失败");
            direct_total += start.elapsed().as_micros();

            let start = Instant::now();
            dll_text = run_dll_ocr(&dll_runtime, &mat).expect("DLL OCR 失败");
            dll_total += start.elapsed().as_micros();
        }

        assert_eq!(direct_text, dll_text, "直接推理和 DLL 输出必须一致");

        let direct_avg = direct_total as f64 / iterations as f64;
        let dll_avg = dll_total as f64 / iterations as f64;
        let ratio = if dll_avg == 0.0 {
            f64::INFINITY
        } else {
            (direct_avg - dll_avg).abs() / dll_avg
        };

        assert!(
            ratio <= 0.20,
            "直接推理速度偏差超出 20%: direct_avg={}us dll_avg={}us ratio={}",
            direct_avg,
            dll_avg,
            ratio
        );
    }
}
