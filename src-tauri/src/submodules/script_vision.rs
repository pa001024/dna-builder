use base64::{Engine as _, engine::general_purpose};
use opencv::{
    calib3d,
    core::{self, CV_8UC1, Mat, Point, Point2f, Scalar, Size},
    features2d, imgproc,
    prelude::{
        DescriptorMatcherTraitConst, Feature2DTrait, KeyPointTraitConst, MatExprTraitConst,
        MatTrait, MatTraitConst, MatTraitConstManual, MatTraitManual,
    },
};
use std::{
    io::{Cursor, Read, Write},
    sync::atomic::{AtomicUsize, Ordering},
    thread,
};
use zip::{CompressionMethod, ZipArchive, ZipWriter, write::FileOptions};

use crate::submodules::{color::rgb_to_hsl, color_match::rgb_to_bgr, tpl_match::match_template};

pub type SiftLocateResult = (f64, f64, f64, f64, i32, i32, Vec<Point2f>);
pub type SiftStitchResult = (Mat, f64, f64, f64, f64, i32, i32, Vec<Point2f>);
pub type ContourResult = (f64, core::Rect, (f64, f64));
pub type BBoxResult = (i32, i32, i32, i32);

const ORB_DESCRIPTOR_COLS: i32 = 32;
const ORB_MATCH_RATIO_THRESHOLD: f32 = 0.75;
const ORB_MATCH_MIN_GOOD_COUNT: i32 = 4;

/// 使用 ZIP(Deflate) 压缩字节数组。
fn _compress_bytes_zip_deflate(raw: &[u8]) -> Result<Vec<u8>, String> {
    let cursor = Cursor::new(Vec::<u8>::new());
    let mut zip_writer = ZipWriter::new(cursor);
    let options = FileOptions::default().compression_method(CompressionMethod::Deflated);

    zip_writer
        .start_file("d", options)
        .map_err(|e| format!("ORB 特征 ZIP 创建失败: {e}"))?;
    zip_writer
        .write_all(raw)
        .map_err(|e| format!("ORB 特征 ZIP 写入失败: {e}"))?;

    let cursor = zip_writer
        .finish()
        .map_err(|e| format!("ORB 特征 ZIP 结束失败: {e}"))?;
    Ok(cursor.into_inner())
}

/// 使用 ZIP(Deflate) 解压字节数组。
fn _decompress_bytes_zip_deflate(compressed: &[u8]) -> Result<Vec<u8>, String> {
    let cursor = Cursor::new(compressed);
    let mut archive =
        ZipArchive::new(cursor).map_err(|e| format!("ORB 特征 ZIP 打开失败: {e}"))?;
    if archive.is_empty() {
        return Err("ORB 特征 ZIP 文件为空".to_string());
    }

    let mut file = archive
        .by_index(0)
        .map_err(|e| format!("ORB 特征 ZIP 读取条目失败: {e}"))?;
    let mut raw = Vec::<u8>::new();
    file.read_to_end(&mut raw)
        .map_err(|e| format!("ORB 特征 ZIP 解压失败: {e}"))?;
    Ok(raw)
}

/// 打包 ORB 特征字节流：`[rows:u16][cols:u16][descriptor bytes...]`。
fn _pack_orb_feature_bytes(rows: i32, cols: i32, raw: &[u8]) -> Result<Vec<u8>, String> {
    if rows < 0 || rows > u16::MAX as i32 {
        return Err(format!("ORB rows 超出 16 位范围: {rows}"));
    }
    if cols < 0 || cols > u16::MAX as i32 {
        return Err(format!("ORB cols 超出 16 位范围: {cols}"));
    }

    let mut payload = Vec::<u8>::with_capacity(4 + raw.len());
    payload.extend_from_slice(&(rows as u16).to_le_bytes());
    payload.extend_from_slice(&(cols as u16).to_le_bytes());
    payload.extend_from_slice(raw);
    Ok(payload)
}

/// 解包 ORB 特征字节流：`[rows:u16][cols:u16][descriptor bytes...]`。
fn _unpack_orb_feature_bytes(packed: &[u8]) -> Result<(i32, i32, &[u8]), String> {
    if packed.len() < 4 {
        return Err("ORB 特征字节流长度不足（至少 4 字节）".to_string());
    }
    let rows = u16::from_le_bytes([packed[0], packed[1]]) as i32;
    let cols = u16::from_le_bytes([packed[2], packed[3]]) as i32;
    Ok((rows, cols, &packed[4..]))
}

/// 将图像统一转换为灰度图，便于后续匹配计算。
fn _to_gray_mat(mat: &Mat) -> Result<Mat, String> {
    match mat.channels() {
        1 => Ok(mat.clone()),
        3 => {
            let mut gray = Mat::default();
            imgproc::cvt_color(mat, &mut gray, imgproc::COLOR_BGR2GRAY, 0)
                .map_err(|e| format!("BGR 转灰度失败: {e}"))?;
            Ok(gray)
        }
        4 => {
            let mut gray = Mat::default();
            imgproc::cvt_color(mat, &mut gray, imgproc::COLOR_BGRA2GRAY, 0)
                .map_err(|e| format!("BGRA 转灰度失败: {e}"))?;
            Ok(gray)
        }
        channels => Err(format!("不支持的通道数: {channels}")),
    }
}

/// 将图像统一转换为 BGR 三通道，便于绘制彩色标注。
fn _to_bgr_mat(mat: &Mat) -> Result<Mat, String> {
    let mut bgr_mat = Mat::default();
    match mat.channels() {
        1 => imgproc::cvt_color(mat, &mut bgr_mat, imgproc::COLOR_GRAY2BGR, 0)
            .map_err(|e| format!("灰度图转 BGR 失败: {e}"))?,
        3 => bgr_mat = mat.clone(),
        4 => imgproc::cvt_color(mat, &mut bgr_mat, imgproc::COLOR_BGRA2BGR, 0)
            .map_err(|e| format!("BGRA 转 BGR 失败: {e}"))?,
        channels => return Err(format!("不支持的通道数: {channels}")),
    }
    Ok(bgr_mat)
}

/// 小地图 SIFT 预处理：保留圆盘并遮蔽中心角色与朝向高亮锥形区域。
///
/// # 参数
/// - `mat`: 输入图像（支持灰度/BGR/BGRA）
/// - `center_x/center_y`: 圆盘中心坐标
/// - `radius`: 圆盘半径
/// - `cone_angle_deg`: 视角锥形角度（度，<=0 表示不遮蔽锥形）
/// - `inner_radius`: 中心遮罩半径（<=0 表示不遮蔽中心）
/// - `heading_deg`: 视角方向角（度，0=向右，90=向下，-90=向上）
///
/// # 返回
/// 返回与输入同尺寸的 BGR 黑白图：
/// - 小地图“黑色结构”区域为黑色；
/// - 其余区域（含圆盘外、锥形遮罩、中心遮罩）均为白色。
pub fn preprocess_minimap_for_sift_impl(
    mat: &Mat,
    center_x: i32,
    center_y: i32,
    radius: i32,
    cone_angle_deg: f64,
    inner_radius: i32,
    heading_deg: f64,
) -> Result<Mat, String> {
    if mat.rows() <= 0 || mat.cols() <= 0 {
        return Err("源图像尺寸无效".to_string());
    }

    let bgr = _to_bgr_mat(mat)?;
    let rows = bgr.rows();
    let cols = bgr.cols();
    let safe_radius = radius.max(1);

    let mut mask = Mat::zeros(rows, cols, CV_8UC1)
        .map_err(|e| format!("创建小地图掩码失败: {e}"))?
        .to_mat()
        .map_err(|e| format!("初始化小地图掩码失败: {e}"))?;

    imgproc::circle(
        &mut mask,
        Point::new(center_x, center_y),
        safe_radius,
        Scalar::all(255.0),
        -1,
        imgproc::LINE_AA,
        0,
    )
    .map_err(|e| format!("绘制小地图圆形掩码失败: {e}"))?;

    if inner_radius > 0 {
        imgproc::circle(
            &mut mask,
            Point::new(center_x, center_y),
            inner_radius,
            Scalar::all(0.0),
            -1,
            imgproc::LINE_AA,
            0,
        )
        .map_err(|e| format!("绘制中心遮罩失败: {e}"))?;
    }

    if cone_angle_deg > 0.0 {
        let half_angle_rad = (cone_angle_deg * 0.5).to_radians();
        let heading_rad = heading_deg.to_radians();
        let edge_radius = safe_radius as f64 * 1.05;
        let left_point = Point::new(
            (center_x as f64 + edge_radius * (heading_rad - half_angle_rad).cos()).round() as i32,
            (center_y as f64 + edge_radius * (heading_rad - half_angle_rad).sin()).round() as i32,
        );
        let right_point = Point::new(
            (center_x as f64 + edge_radius * (heading_rad + half_angle_rad).cos()).round() as i32,
            (center_y as f64 + edge_radius * (heading_rad + half_angle_rad).sin()).round() as i32,
        );
        let mut cone_points = core::Vector::<Point>::new();
        cone_points.push(Point::new(center_x, center_y));
        cone_points.push(left_point);
        cone_points.push(right_point);
        imgproc::fill_convex_poly(
            &mut mask,
            &cone_points,
            Scalar::all(0.0),
            imgproc::LINE_AA,
            0,
        )
        .map_err(|e| format!("绘制视角锥形遮罩失败: {e}"))?;
    }

    // 新策略：暗色固定色域(#080908±10) + 白边约束，只保留与白边邻近的暗色连通域。
    let mut hsv = Mat::default();
    imgproc::cvt_color(&bgr, &mut hsv, imgproc::COLOR_BGR2HSV, 0)
        .map_err(|e| format!("BGR 转 HSV 失败: {e}"))?;

    let mut dark_color_mask = Mat::default();
    core::in_range(
        &bgr,
        &Scalar::new(0.0, 0.0, 0.0, 0.0),
        &Scalar::new(18.0, 19.0, 18.0, 0.0),
        &mut dark_color_mask,
    )
    .map_err(|e| format!("固定暗色筛选失败: {e}"))?;

    let mut dark_hsv_mask = Mat::default();
    core::in_range(
        &hsv,
        &Scalar::new(0.0, 0.0, 0.0, 0.0),
        &Scalar::new(180.0, 120.0, 45.0, 0.0),
        &mut dark_hsv_mask,
    )
    .map_err(|e| format!("低亮暗色筛选失败: {e}"))?;

    let mut dark_candidate = Mat::default();
    core::bitwise_or(
        &dark_color_mask,
        &dark_hsv_mask,
        &mut dark_candidate,
        &Mat::default(),
    )
    .map_err(|e| format!("合并暗色候选失败: {e}"))?;

    let mut dark_candidate_in_minimap = Mat::default();
    core::bitwise_and(
        &dark_candidate,
        &mask,
        &mut dark_candidate_in_minimap,
        &Mat::default(),
    )
    .map_err(|e| format!("应用小地图暗色掩码失败: {e}"))?;

    let mut white_border_mask = Mat::default();
    core::in_range(
        &hsv,
        &Scalar::new(0.0, 0.0, 170.0, 0.0),
        &Scalar::new(180.0, 50.0, 255.0, 0.0),
        &mut white_border_mask,
    )
    .map_err(|e| format!("白边筛选失败: {e}"))?;

    let mut white_border_in_minimap = Mat::default();
    core::bitwise_and(
        &white_border_mask,
        &mask,
        &mut white_border_in_minimap,
        &Mat::default(),
    )
    .map_err(|e| format!("应用白边掩码失败: {e}"))?;

    let seed_kernel = imgproc::get_structuring_element(
        imgproc::MORPH_ELLIPSE,
        Size::new(7, 7),
        Point::new(-1, -1),
    )
    .map_err(|e| format!("创建白边邻域核失败: {e}"))?;
    let mut white_near = Mat::default();
    imgproc::dilate(
        &white_border_in_minimap,
        &mut white_near,
        &seed_kernel,
        Point::new(-1, -1),
        1,
        core::BORDER_CONSTANT,
        Scalar::all(0.0),
    )
    .map_err(|e| format!("白边邻域扩张失败: {e}"))?;

    let mut seed_mask = Mat::default();
    core::bitwise_and(
        &dark_candidate_in_minimap,
        &white_near,
        &mut seed_mask,
        &Mat::default(),
    )
    .map_err(|e| format!("构建白边暗色种子失败: {e}"))?;

    let mut labels = Mat::default();
    let mut stats = Mat::default();
    let mut centroids = Mat::default();
    let label_count = imgproc::connected_components_with_stats(
        &dark_candidate_in_minimap,
        &mut labels,
        &mut stats,
        &mut centroids,
        8,
        core::CV_32S,
    )
    .map_err(|e| format!("暗色连通域分析失败: {e}"))?;

    let labels_contiguous = if labels.is_continuous() {
        labels
    } else {
        let mut copied = Mat::default();
        labels
            .copy_to(&mut copied)
            .map_err(|e| format!("复制标签图失败: {e}"))?;
        copied
    };
    let seed_contiguous = if seed_mask.is_continuous() {
        seed_mask
    } else {
        let mut copied = Mat::default();
        seed_mask
            .copy_to(&mut copied)
            .map_err(|e| format!("复制种子图失败: {e}"))?;
        copied
    };
    let labels_data = labels_contiguous
        .data_typed::<i32>()
        .map_err(|e| format!("读取标签图数据失败: {e}"))?;
    let seed_data = seed_contiguous
        .data_typed::<u8>()
        .map_err(|e| format!("读取种子图数据失败: {e}"))?;

    let mut area_by_label = vec![0i32; label_count as usize];
    for label in 1..label_count {
        area_by_label[label as usize] = *stats
            .at_2d::<i32>(label, imgproc::CC_STAT_AREA)
            .map_err(|e| format!("读取连通域面积失败: {e}"))?;
    }
    let mut seed_count_by_label = vec![0i32; label_count as usize];
    for (index, label) in labels_data.iter().enumerate() {
        if *label > 0 && seed_data[index] > 0 {
            seed_count_by_label[*label as usize] += 1;
        }
    }

    const MIN_COMPONENT_AREA: i32 = 24;
    const MIN_SEED_PIXELS: i32 = 3;
    let mut cleaned_mask = Mat::zeros(rows, cols, CV_8UC1)
        .map_err(|e| format!("创建输出掩码失败: {e}"))?
        .to_mat()
        .map_err(|e| format!("初始化输出掩码失败: {e}"))?;
    let cleaned_data = cleaned_mask
        .data_typed_mut::<u8>()
        .map_err(|e| format!("读取输出掩码数据失败: {e}"))?;
    for (index, label) in labels_data.iter().enumerate() {
        if *label <= 0 {
            continue;
        }
        let li = *label as usize;
        if li < area_by_label.len()
            && area_by_label[li] >= MIN_COMPONENT_AREA
            && seed_count_by_label[li] >= MIN_SEED_PIXELS
        {
            cleaned_data[index] = 255;
        }
    }

    // 稀疏场景（仅看到一小块地图）时，优先保留离圆心最近的连通域，进一步抑制背景噪声。
    let minimap_area =
        core::count_non_zero(&mask).map_err(|e| format!("统计小地图区域像素失败: {e}"))?;
    let cleaned_area = core::count_non_zero(&cleaned_mask)
        .map_err(|e| format!("统计预处理前景像素失败: {e}"))?;
    if minimap_area > 0 && (cleaned_area as f64) / (minimap_area as f64) < 0.05 {
        let mut sparse_labels = Mat::default();
        let mut sparse_stats = Mat::default();
        let mut sparse_centroids = Mat::default();
        let sparse_label_count = imgproc::connected_components_with_stats(
            &cleaned_mask,
            &mut sparse_labels,
            &mut sparse_stats,
            &mut sparse_centroids,
            8,
            core::CV_32S,
        )
        .map_err(|e| format!("稀疏前景连通域分析失败: {e}"))?;

        if sparse_label_count > 1 {
            let mut best_label = 0i32;
            let mut best_dist_sq = f64::INFINITY;
            for label in 1..sparse_label_count {
                let area = *sparse_stats
                    .at_2d::<i32>(label, imgproc::CC_STAT_AREA)
                    .map_err(|e| format!("读取稀疏连通域面积失败: {e}"))?;
                if area <= 0 {
                    continue;
                }
                let cx = *sparse_centroids
                    .at_2d::<f64>(label, 0)
                    .map_err(|e| format!("读取稀疏连通域中心 X 失败: {e}"))?;
                let cy = *sparse_centroids
                    .at_2d::<f64>(label, 1)
                    .map_err(|e| format!("读取稀疏连通域中心 Y 失败: {e}"))?;
                let dx = cx - center_x as f64;
                let dy = cy - center_y as f64;
                let dist_sq = dx * dx + dy * dy;
                if dist_sq < best_dist_sq {
                    best_dist_sq = dist_sq;
                    best_label = label;
                }
            }

            if best_label > 0 {
                let sparse_labels_contiguous = if sparse_labels.is_continuous() {
                    sparse_labels
                } else {
                    let mut copied = Mat::default();
                    sparse_labels
                        .copy_to(&mut copied)
                        .map_err(|e| format!("复制稀疏标签图失败: {e}"))?;
                    copied
                };
                let sparse_label_data = sparse_labels_contiguous
                    .data_typed::<i32>()
                    .map_err(|e| format!("读取稀疏标签图数据失败: {e}"))?;

                let mut center_filtered = Mat::zeros(rows, cols, CV_8UC1)
                    .map_err(|e| format!("创建中心筛选掩码失败: {e}"))?
                    .to_mat()
                    .map_err(|e| format!("初始化中心筛选掩码失败: {e}"))?;
                let center_filtered_data = center_filtered
                    .data_typed_mut::<u8>()
                    .map_err(|e| format!("读取中心筛选掩码数据失败: {e}"))?;
                for (index, label) in sparse_label_data.iter().enumerate() {
                    if *label == best_label {
                        center_filtered_data[index] = 255;
                    }
                }
                cleaned_mask = center_filtered;
            }
        }
    }

    // 开运算去除零散噪点，避免拼接时把背景点带入大图。
    let open_kernel = imgproc::get_structuring_element(
        imgproc::MORPH_ELLIPSE,
        Size::new(3, 3),
        Point::new(-1, -1),
    )
    .map_err(|e| format!("创建形态学核失败: {e}"))?;
    let mut opened = Mat::default();
    imgproc::morphology_ex(
        &cleaned_mask,
        &mut opened,
        imgproc::MORPH_OPEN,
        &open_kernel,
        Point::new(-1, -1),
        1,
        core::BORDER_CONSTANT,
        Scalar::all(0.0),
    )
    .map_err(|e| format!("暗色掩码开运算失败: {e}"))?;
    cleaned_mask = opened;

    // 输出统一为“白底黑图”，避免半透明背景被带入拼接大图。
    let mut out = Mat::new_rows_cols_with_default(rows, cols, bgr.typ(), Scalar::all(255.0))
        .map_err(|e| format!("创建白底输出图失败: {e}"))?;
    out.set_to(&Scalar::all(0.0), &cleaned_mask)
        .map_err(|e| format!("写入黑色前景失败: {e}"))?;
    Ok(out)
}

/// 选择“前景为白色”的二值图，便于后续按投影做字符分割。
///
/// 说明：
/// 1. 同时计算 `THRESH_BINARY` 与 `THRESH_BINARY_INV`；
/// 2. 优先选择白色像素更少的一侧，假设文本区域通常小于背景区域。
fn _to_text_foreground_binary(gray: &Mat) -> Result<Mat, String> {
    let mut binary = Mat::default();
    imgproc::threshold(
        gray,
        &mut binary,
        0.0,
        255.0,
        imgproc::THRESH_BINARY | imgproc::THRESH_OTSU,
    )
    .map_err(|e| format!("二值化(THRESH_BINARY)失败: {e}"))?;

    let mut binary_inv = Mat::default();
    imgproc::threshold(
        gray,
        &mut binary_inv,
        0.0,
        255.0,
        imgproc::THRESH_BINARY_INV | imgproc::THRESH_OTSU,
    )
    .map_err(|e| format!("二值化(THRESH_BINARY_INV)失败: {e}"))?;

    let white_binary = core::count_non_zero(&binary)
        .map_err(|e| format!("统计白色像素(THRESH_BINARY)失败: {e}"))?;
    let white_binary_inv = core::count_non_zero(&binary_inv)
        .map_err(|e| format!("统计白色像素(THRESH_BINARY_INV)失败: {e}"))?;

    if white_binary_inv <= white_binary {
        Ok(binary_inv)
    } else {
        Ok(binary)
    }
}

/// 基于横向空隙（列投影）对单行文本做字符分割，返回从左到右的 bbox 列表。
///
/// # 参数
/// - `mat`: 输入图像（建议灰度图；若非灰度会自动转换）。
/// - `min_gap_width`: 最小分割空隙宽度（像素列）。
/// - `min_char_width`: 最小字符宽度（像素）。
///
/// # 返回
/// - `Vec<(x, y, w, h)>`: 字符外接框列表，按 x 升序排列。
pub fn segment_single_line_chars_impl(
    mat: &Mat,
    min_gap_width: i32,
    min_char_width: i32,
) -> Result<Vec<BBoxResult>, String> {
    if mat.rows() <= 0 || mat.cols() <= 0 {
        return Err("源图像尺寸无效".to_string());
    }

    let gray = _to_gray_mat(mat)?;
    let binary = _to_text_foreground_binary(&gray)?;

    let rows = binary.rows();
    let cols = binary.cols();
    let mut row_projection = vec![0i32; rows as usize];
    for y in 0..rows {
        let mut count = 0i32;
        for x in 0..cols {
            let value = *binary
                .at_2d::<u8>(y, x)
                .map_err(|e| format!("读取像素失败[{x},{y}]: {e}"))?;
            if value > 0 {
                count += 1;
            }
        }
        row_projection[y as usize] = count;
    }

    let line_top = row_projection
        .iter()
        .position(|&v| v > 0)
        .map(|idx| idx as i32);
    let line_bottom = row_projection
        .iter()
        .rposition(|&v| v > 0)
        .map(|idx| idx as i32);
    let (line_top, line_bottom) = match (line_top, line_bottom) {
        (Some(top), Some(bottom)) if bottom >= top => (top, bottom),
        _ => return Ok(Vec::new()),
    };

    let mut col_projection = vec![0i32; cols as usize];
    for x in 0..cols {
        let mut count = 0i32;
        for y in line_top..=line_bottom {
            let value = *binary
                .at_2d::<u8>(y, x)
                .map_err(|e| format!("读取像素失败[{x},{y}]: {e}"))?;
            if value > 0 {
                count += 1;
            }
        }
        col_projection[x as usize] = count;
    }

    // 先提取原始字符段（连续非空列），再按最小空隙宽度做合并。
    let mut raw_spans: Vec<(i32, i32)> = Vec::new();
    let mut x = 0i32;
    while x < cols {
        while x < cols && col_projection[x as usize] == 0 {
            x += 1;
        }
        if x >= cols {
            break;
        }
        let start = x;
        while x < cols && col_projection[x as usize] > 0 {
            x += 1;
        }
        raw_spans.push((start, x - 1));
    }

    if raw_spans.is_empty() {
        return Ok(Vec::new());
    }

    let min_gap_width = min_gap_width.max(1);
    let mut merged_spans: Vec<(i32, i32)> = Vec::with_capacity(raw_spans.len());
    for (start, end) in raw_spans {
        if let Some(last) = merged_spans.last_mut() {
            let gap = start - last.1 - 1;
            if gap < min_gap_width {
                last.1 = end;
                continue;
            }
        }
        merged_spans.push((start, end));
    }

    let min_char_width = min_char_width.max(1);
    let mut bboxes: Vec<BBoxResult> = Vec::with_capacity(merged_spans.len());
    for (start_x, end_x) in merged_spans {
        let width = end_x - start_x + 1;
        if width < min_char_width {
            continue;
        }

        let mut top = line_bottom;
        let mut bottom = line_top;
        let mut has_foreground = false;
        for y in line_top..=line_bottom {
            let mut row_has_foreground = false;
            for x in start_x..=end_x {
                let value = *binary
                    .at_2d::<u8>(y, x)
                    .map_err(|e| format!("读取像素失败[{x},{y}]: {e}"))?;
                if value > 0 {
                    row_has_foreground = true;
                    has_foreground = true;
                    break;
                }
            }
            if row_has_foreground {
                top = top.min(y);
                bottom = bottom.max(y);
            }
        }

        if !has_foreground || bottom < top {
            continue;
        }

        bboxes.push((start_x, top, width, bottom - top + 1));
    }

    Ok(bboxes)
}

/// 根据色键集合生成二值灰度图（命中为 255，未命中为 0）。
pub fn color_filter_impl(mat: &Mat, colors: &[u32], tolerance: u8) -> Result<Mat, String> {
    if mat.rows() <= 0 || mat.cols() <= 0 {
        return Err("源图像尺寸无效".to_string());
    }
    if colors.is_empty() {
        return Err("colors 不能为空".to_string());
    }

    let mut bgr_mat = Mat::default();
    match mat.channels() {
        1 => imgproc::cvt_color(mat, &mut bgr_mat, imgproc::COLOR_GRAY2BGR, 0)
            .map_err(|e| format!("灰度图转 BGR 失败: {e}"))?,
        3 => bgr_mat = mat.clone(),
        4 => imgproc::cvt_color(mat, &mut bgr_mat, imgproc::COLOR_BGRA2BGR, 0)
            .map_err(|e| format!("BGRA 转 BGR 失败: {e}"))?,
        channels => return Err(format!("不支持的通道数: {channels}")),
    }

    let mask_expr = Mat::zeros(bgr_mat.rows(), bgr_mat.cols(), CV_8UC1)
        .map_err(|e| format!("创建掩码失败: {e}"))?;
    let mut merged_mask = mask_expr
        .to_mat()
        .map_err(|e| format!("初始化掩码失败: {e}"))?;

    for color in colors {
        let (b, g, r) = rgb_to_bgr(*color);
        let lower = Scalar::new(
            b.saturating_sub(tolerance) as f64,
            g.saturating_sub(tolerance) as f64,
            r.saturating_sub(tolerance) as f64,
            0.0,
        );
        let upper = Scalar::new(
            b.saturating_add(tolerance) as f64,
            g.saturating_add(tolerance) as f64,
            r.saturating_add(tolerance) as f64,
            255.0,
        );

        let mut single_mask = Mat::default();
        core::in_range(&bgr_mat, &lower, &upper, &mut single_mask)
            .map_err(|e| format!("inRange 失败: {e}"))?;

        let mut next_mask = Mat::default();
        core::bitwise_or(&merged_mask, &single_mask, &mut next_mask, &Mat::default())
            .map_err(|e| format!("掩码合并失败: {e}"))?;
        merged_mask = next_mask;
    }

    Ok(merged_mask)
}

/// 使用 HSL 加权差进行颜色过滤并返回灰度二值图（命中为 255，未命中为 0）。
///
/// 容差计算公式：
/// `abs(h1 - h2) * wh + abs(s1 - s2) * ws + abs(l1 - l2) * wl`
///
/// 说明：
/// - `weights` 为可选参数，格式 `[wh, ws, wl]`；
/// - 默认权重为 `[255, 180, 75]`，与历史行为保持一致；
/// - 例如 `[0, 0, 1]` 表示仅按 L 通道差值匹配。
pub fn color_filter_hsl_impl(
    mat: &Mat,
    colors: &[u32],
    tolerance: f64,
    weights: Option<[f64; 3]>,
) -> Result<Mat, String> {
    if mat.rows() <= 0 || mat.cols() <= 0 {
        return Err("源图像尺寸无效".to_string());
    }
    if colors.is_empty() {
        return Err("colors 不能为空".to_string());
    }
    if !tolerance.is_finite() || tolerance < 0.0 {
        return Err("tolerance 必须是非负有限数".to_string());
    }
    let weights = weights.unwrap_or([255.0, 180.0, 75.0]);
    let [weight_h, weight_s, weight_l] = weights;
    if !weight_h.is_finite()
        || !weight_s.is_finite()
        || !weight_l.is_finite()
        || weight_h < 0.0
        || weight_s < 0.0
        || weight_l < 0.0
    {
        return Err("weights 必须是非负有限数数组 [h, s, l]".to_string());
    }
    if weight_h <= 0.0 && weight_s <= 0.0 && weight_l <= 0.0 {
        return Err("weights 不能全为 0".to_string());
    }

    let mut bgr_mat = Mat::default();
    match mat.channels() {
        1 => imgproc::cvt_color(mat, &mut bgr_mat, imgproc::COLOR_GRAY2BGR, 0)
            .map_err(|e| format!("灰度图转 BGR 失败: {e}"))?,
        3 => bgr_mat = mat.clone(),
        4 => imgproc::cvt_color(mat, &mut bgr_mat, imgproc::COLOR_BGRA2BGR, 0)
            .map_err(|e| format!("BGRA 转 BGR 失败: {e}"))?,
        channels => return Err(format!("不支持的通道数: {channels}")),
    }

    let mask_expr = Mat::zeros(bgr_mat.rows(), bgr_mat.cols(), CV_8UC1)
        .map_err(|e| format!("创建掩码失败: {e}"))?;
    let mut merged_mask = mask_expr
        .to_mat()
        .map_err(|e| format!("初始化掩码失败: {e}"))?;

    // 先将整图转为 HLS，避免逐像素调用 rgb_to_hsl 的高开销。
    let mut hls_mat = Mat::default();
    imgproc::cvt_color(&bgr_mat, &mut hls_mat, imgproc::COLOR_BGR2HLS, 0)
        .map_err(|e| format!("BGR 转 HLS 失败: {e}"))?;

    let target_hsl = colors
        .iter()
        .map(|color| {
            let (h, s, l) = rgb_to_hsl(*color);
            (
                h.round().clamp(0.0, 360.0) as i32,
                (s * 255.0).round().clamp(0.0, 255.0) as i32,
                (l * 255.0).round().clamp(0.0, 255.0) as i32,
            )
        })
        .collect::<Vec<_>>();

    let target_hls_u8 = target_hsl
        .iter()
        .map(|(h, s, l)| (((h + 1) / 2).clamp(0, 180), *l, *s))
        .collect::<Vec<_>>();

    let pixel_count = (hls_mat.rows() * hls_mat.cols()) as usize;
    let tolerance_scaled = (tolerance * 255.0).max(0.0);

    // 先用 HLS 轴向范围做候选粗筛，减少后续精算像素数。
    let delta_h_deg = if weight_h > 0.0 {
        (tolerance_scaled / weight_h).ceil().clamp(0.0, 360.0) as i32
    } else {
        360
    };
    let delta_h_ch = (delta_h_deg + 1) / 2;
    let delta_s = if weight_s > 0.0 {
        (tolerance_scaled / weight_s).ceil().clamp(0.0, 255.0) as i32
    } else {
        255
    };
    let delta_l = if weight_l > 0.0 {
        (tolerance_scaled / weight_l).ceil().clamp(0.0, 255.0) as i32
    } else {
        255
    };
    let mut candidate_mask = Mat::zeros(hls_mat.rows(), hls_mat.cols(), CV_8UC1)
        .map_err(|e| format!("创建候选掩码失败: {e}"))?
        .to_mat()
        .map_err(|e| format!("初始化候选掩码失败: {e}"))?;
    let mut single_mask = Mat::default();

    for (h_ch, l_u8, s_u8) in &target_hls_u8 {
        let low_h = (h_ch - delta_h_ch).max(0);
        let high_h = (h_ch + delta_h_ch).min(180);
        let low_l = (l_u8 - delta_l).max(0);
        let high_l = (l_u8 + delta_l).min(255);
        let low_s = (s_u8 - delta_s).max(0);
        let high_s = (s_u8 + delta_s).min(255);

        // OpenCV HLS 通道顺序为 H, L, S
        let lower = Scalar::new(low_h as f64, low_l as f64, low_s as f64, 0.0);
        let upper = Scalar::new(high_h as f64, high_l as f64, high_s as f64, 255.0);
        core::in_range(&hls_mat, &lower, &upper, &mut single_mask)
            .map_err(|e| format!("HLS 粗筛 inRange 失败: {e}"))?;

        let mut next_mask = Mat::default();
        core::bitwise_or(
            &candidate_mask,
            &single_mask,
            &mut next_mask,
            &Mat::default(),
        )
        .map_err(|e| format!("合并候选掩码失败: {e}"))?;
        candidate_mask = next_mask;
    }

    let hls_bytes = hls_mat
        .data_bytes()
        .map_err(|e| format!("读取 HLS 数据失败: {e}"))?;
    let candidate_bytes = candidate_mask
        .data_bytes()
        .map_err(|e| format!("读取候选掩码失败: {e}"))?;
    let mask_bytes = merged_mask
        .data_bytes_mut()
        .map_err(|e| format!("读取掩码数据失败: {e}"))?;

    if hls_bytes.len() < pixel_count * 3
        || candidate_bytes.len() < pixel_count
        || mask_bytes.len() < pixel_count
    {
        return Err("图像内存布局异常，无法执行 HSL 过滤".to_string());
    }

    // 大图使用并行分块，显著降低逐像素 HSL 匹配耗时。
    let worker_count = if pixel_count >= 200_000 {
        thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(1)
            .min(8)
    } else {
        1
    };

    if worker_count <= 1 {
        for idx in 0..pixel_count {
            if candidate_bytes[idx] == 0 {
                continue;
            }
            let base = idx * 3;
            // OpenCV HLS 8U 通道顺序是 H, L, S；其中 H 范围 0-180，对应角度 0-360。
            let h_deg = hls_bytes[base] as i32 * 2;
            let l_u8 = hls_bytes[base + 1] as i32;
            let s_u8 = hls_bytes[base + 2] as i32;

            let mut is_match = false;
            for (th, ts, tl) in &target_hsl {
                // 采用整数缩放后的等价距离：
                // dist_scaled = abs(h1-h2)*wh + abs(s1-s2)*ws + abs(l1-l2)*wl
                let distance_scaled = (h_deg - *th).abs() as f64 * weight_h
                    + (s_u8 - *ts).abs() as f64 * weight_s
                    + (l_u8 - *tl).abs() as f64 * weight_l;
                if distance_scaled <= tolerance_scaled {
                    is_match = true;
                    break;
                }
            }

            if is_match {
                mask_bytes[idx] = 255;
            }
        }
    } else {
        let mut out = vec![0u8; pixel_count];
        let chunk_size = pixel_count.div_ceil(worker_count);
        let target_hsl_ref = &target_hsl;

        thread::scope(|scope| {
            for (chunk_idx, out_chunk) in out.chunks_mut(chunk_size).enumerate() {
                let start = chunk_idx * chunk_size;
                let end = start + out_chunk.len();
                let hls_chunk = &hls_bytes[start * 3..end * 3];
                let candidate_chunk = &candidate_bytes[start..end];
                scope.spawn(move || {
                    for (local_idx, out_px) in out_chunk.iter_mut().enumerate() {
                        if candidate_chunk[local_idx] == 0 {
                            continue;
                        }
                        let base = local_idx * 3;
                        let h_deg = hls_chunk[base] as i32 * 2;
                        let l_u8 = hls_chunk[base + 1] as i32;
                        let s_u8 = hls_chunk[base + 2] as i32;

                        let mut is_match = false;
                        for (th, ts, tl) in target_hsl_ref {
                            let distance_scaled = (h_deg - *th).abs() as f64 * weight_h
                                + (s_u8 - *ts).abs() as f64 * weight_s
                                + (l_u8 - *tl).abs() as f64 * weight_l;
                            if distance_scaled <= tolerance_scaled {
                                is_match = true;
                                break;
                            }
                        }

                        if is_match {
                            *out_px = 255;
                        }
                    }
                });
            }
        });

        mask_bytes[..pixel_count].copy_from_slice(&out);
    }

    Ok(merged_mask)
}

/// 色键匹配，返回匹配像素均值最高的颜色索引；若无命中或低于阈值则返回 -1。
pub fn color_key_match_impl(
    mat: &Mat,
    colors: &[u32],
    min_mean: f64,
    tolerance: u8,
) -> Result<i32, String> {
    if mat.rows() <= 0 || mat.cols() <= 0 {
        return Err("源图像尺寸无效".to_string());
    }
    if colors.is_empty() {
        return Ok(-1);
    }

    let mut bgr_mat = Mat::default();
    match mat.channels() {
        1 => imgproc::cvt_color(mat, &mut bgr_mat, imgproc::COLOR_GRAY2BGR, 0)
            .map_err(|e| format!("灰度图转 BGR 失败: {e}"))?,
        3 => bgr_mat = mat.clone(),
        4 => imgproc::cvt_color(mat, &mut bgr_mat, imgproc::COLOR_BGRA2BGR, 0)
            .map_err(|e| format!("BGRA 转 BGR 失败: {e}"))?,
        channels => return Err(format!("不支持的通道数: {channels}")),
    }

    let mut best_index = -1i32;
    let mut best_mean = 0.0f64;
    let mut mask = Mat::default();

    for (index, color) in colors.iter().enumerate() {
        let (b, g, r) = rgb_to_bgr(*color);
        let lower = Scalar::new(
            b.saturating_sub(tolerance) as f64,
            g.saturating_sub(tolerance) as f64,
            r.saturating_sub(tolerance) as f64,
            0.0,
        );
        let upper = Scalar::new(
            b.saturating_add(tolerance) as f64,
            g.saturating_add(tolerance) as f64,
            r.saturating_add(tolerance) as f64,
            255.0,
        );

        core::in_range(&bgr_mat, &lower, &upper, &mut mask)
            .map_err(|e| format!("inRange 失败: {e}"))?;
        let mean =
            core::mean(&mask, &Mat::default()).map_err(|e| format!("计算 mean 失败: {e}"))?[0];

        if mean > best_mean {
            best_mean = mean;
            best_index = index as i32;
        }
    }

    if best_index < 0 || best_mean < min_mean {
        return Ok(-1);
    }

    Ok(best_index)
}

/// 并行匹配多个模板，返回首个命中的模板索引和坐标。
pub fn batch_match_color_impl(
    src: &Mat,
    tpls: Vec<Mat>,
    cap: f64,
) -> Result<Option<(usize, i32, i32)>, String> {
    if src.rows() <= 0 || src.cols() <= 0 {
        return Err("源图像尺寸无效".to_string());
    }
    if tpls.is_empty() {
        return Ok(None);
    }

    let src_gray = _to_gray_mat(src)?;
    let mut gray_templates = Vec::with_capacity(tpls.len());
    for (idx, tpl) in tpls.into_iter().enumerate() {
        if tpl.rows() <= 0 || tpl.cols() <= 0 {
            return Err(format!("模板[{idx}] 尺寸无效"));
        }
        let tpl_gray = _to_gray_mat(&tpl)?;
        if src_gray.rows() < tpl_gray.rows() || src_gray.cols() < tpl_gray.cols() {
            continue;
        }
        gray_templates.push((idx, tpl_gray));
    }

    if gray_templates.is_empty() {
        return Ok(None);
    }

    let worker_count = thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(1)
        .min(gray_templates.len());
    let chunk_size = gray_templates.len().div_ceil(worker_count);
    let first_match_index = AtomicUsize::new(usize::MAX);

    thread::scope(|scope| -> Result<Option<(usize, i32, i32)>, String> {
        let mut handles = Vec::with_capacity(worker_count);
        let mut iter = gray_templates.into_iter();

        for _ in 0..worker_count {
            let mut chunk = Vec::with_capacity(chunk_size);
            for _ in 0..chunk_size {
                if let Some(item) = iter.next() {
                    chunk.push(item);
                } else {
                    break;
                }
            }
            if chunk.is_empty() {
                continue;
            }

            let src_gray = src_gray.clone();
            let first_match_index = &first_match_index;
            handles.push(
                scope.spawn(move || -> Result<Option<(usize, i32, i32)>, String> {
                    let mut local_best: Option<(usize, i32, i32)> = None;

                    for (idx, tpl_gray) in chunk {
                        if idx >= first_match_index.load(Ordering::Acquire) {
                            break;
                        }

                        match match_template(&src_gray, &tpl_gray, cap) {
                            Ok(Some((x, y))) => {
                                if local_best.map_or(true, |(best_idx, _, _)| idx < best_idx) {
                                    local_best = Some((idx, x, y));
                                }

                                let mut observed = first_match_index.load(Ordering::Acquire);
                                while idx < observed {
                                    match first_match_index.compare_exchange(
                                        observed,
                                        idx,
                                        Ordering::AcqRel,
                                        Ordering::Acquire,
                                    ) {
                                        Ok(_) => break,
                                        Err(next) => observed = next,
                                    }
                                }
                            }
                            Ok(None) => {}
                            Err(e) => {
                                return Err(format!("模板[{idx}] 匹配失败: {e:?}"));
                            }
                        }
                    }

                    Ok(local_best)
                }),
            );
        }

        let mut best: Option<(usize, i32, i32)> = None;
        for handle in handles {
            let local = handle
                .join()
                .map_err(|_| "batch_match_color 线程执行失败".to_string())??;
            if let Some((idx, x, y)) = local {
                if best.map_or(true, |(best_idx, _, _)| idx < best_idx) {
                    best = Some((idx, x, y));
                }
            }
        }

        Ok(best)
    })
}

/// 将哈希字符串标准化为无前缀、小写十六进制字符串。
pub fn normalize_hash_hex(hash: &str) -> Result<String, String> {
    let mut normalized = hash.trim().to_ascii_lowercase();
    if let Some(stripped) = normalized.strip_prefix("0x") {
        normalized = stripped.to_string();
    }
    if normalized.is_empty() {
        return Err("哈希字符串不能为空".to_string());
    }
    if !normalized.chars().all(|ch| ch.is_ascii_hexdigit()) {
        return Err(format!("哈希字符串包含非法字符: {hash}"));
    }
    if normalized.len() % 2 != 0 {
        return Err(format!("哈希字符串长度必须为偶数: {hash}"));
    }
    Ok(normalized)
}

/// 计算两个十六进制哈希串的汉明距离。
pub fn hamming_distance_hex(a: &str, b: &str) -> Result<u32, String> {
    if a.len() != b.len() {
        return Err(format!(
            "哈希长度不一致，无法比较: {} vs {}",
            a.len(),
            b.len()
        ));
    }

    let mut distance = 0u32;
    let bytes_a = a.as_bytes();
    let bytes_b = b.as_bytes();
    let mut idx = 0usize;
    while idx < bytes_a.len() {
        let byte_a = std::str::from_utf8(&bytes_a[idx..idx + 2])
            .map_err(|e| format!("解析哈希失败: {e}"))
            .and_then(|s| {
                u8::from_str_radix(s, 16).map_err(|e| format!("解析哈希字节失败 {s}: {e}"))
            })?;
        let byte_b = std::str::from_utf8(&bytes_b[idx..idx + 2])
            .map_err(|e| format!("解析哈希失败: {e}"))
            .and_then(|s| {
                u8::from_str_radix(s, 16).map_err(|e| format!("解析哈希字节失败 {s}: {e}"))
            })?;
        distance += (byte_a ^ byte_b).count_ones();
        idx += 2;
    }

    Ok(distance)
}

/// 计算单通道图像的 64 位感知哈希（pHash）。
fn _phash_gray_64(gray: &Mat) -> Result<u64, String> {
    let mut resized = Mat::default();
    imgproc::resize(
        gray,
        &mut resized,
        Size::new(32, 32),
        0.0,
        0.0,
        imgproc::INTER_LINEAR,
    )
    .map_err(|e| format!("resize 失败: {e}"))?;

    let mut resized_f32 = Mat::default();
    resized
        .convert_to(&mut resized_f32, core::CV_32F, 1.0, 0.0)
        .map_err(|e| format!("convert_to(CV_32F) 失败: {e}"))?;

    let mut dct_mat = Mat::default();
    core::dct(&resized_f32, &mut dct_mat, 0).map_err(|e| format!("DCT 失败: {e}"))?;

    let mut values = Vec::with_capacity(63);
    for y in 0..8 {
        for x in 0..8 {
            if x == 0 && y == 0 {
                continue;
            }
            let v = *dct_mat
                .at_2d::<f32>(y, x)
                .map_err(|e| format!("读取 DCT 系数失败: {e}"))?;
            values.push(v);
        }
    }
    values.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let median = values[values.len() / 2];

    let mut hash = 0u64;
    for y in 0..8 {
        for x in 0..8 {
            if x == 0 && y == 0 {
                continue;
            }
            let v = *dct_mat
                .at_2d::<f32>(y, x)
                .map_err(|e| format!("读取 DCT 系数失败: {e}"))?;
            if v > median {
                hash |= 1u64 << ((y * 8 + x) as u64);
            }
        }
    }
    Ok(hash)
}

/// 计算图像感知哈希，支持灰度/彩色模式。
pub fn perceptual_hash_impl(mat: &Mat, color: bool) -> Result<String, String> {
    if mat.rows() <= 0 || mat.cols() <= 0 {
        return Err("源图像尺寸无效".to_string());
    }

    if color {
        let mut bgr = Mat::default();
        match mat.channels() {
            1 => imgproc::cvt_color(mat, &mut bgr, imgproc::COLOR_GRAY2BGR, 0)
                .map_err(|e| format!("GRAY 转 BGR 失败: {e}"))?,
            3 => bgr = mat.clone(),
            4 => imgproc::cvt_color(mat, &mut bgr, imgproc::COLOR_BGRA2BGR, 0)
                .map_err(|e| format!("BGRA 转 BGR 失败: {e}"))?,
            channels => return Err(format!("不支持的通道数: {channels}")),
        }

        let mut parts = String::with_capacity(16 * 3);
        for channel in 0..3 {
            let mut channel_mat = Mat::default();
            core::extract_channel(&bgr, &mut channel_mat, channel)
                .map_err(|e| format!("提取通道[{channel}]失败: {e}"))?;
            let channel_hash = _phash_gray_64(&channel_mat)?;
            parts.push_str(&format!("{channel_hash:016x}"));
        }
        Ok(parts)
    } else {
        let gray = _to_gray_mat(mat)?;
        let hash = _phash_gray_64(&gray)?;
        Ok(format!("{hash:016x}"))
    }
}

/// 提取灰度图像 ORB 描述子。
///
/// 说明：
/// - 对于高度较小的图（例如小地图局部），默认 ORB 可能检测不到关键点；
/// - 这里会尝试原图、放大图、均衡化图等候选输入，尽量减少“空描述子”。
fn _detect_orb_descriptors(gray: &Mat) -> Result<Mat, String> {
    if gray.rows() <= 0 || gray.cols() <= 0 {
        return Err("源图像尺寸无效".to_string());
    }

    let mut candidates: Vec<Mat> = vec![gray.clone()];
    let short_side = gray.rows().min(gray.cols());

    // 小图先放大，避免 ORB 默认参数在短边图像上取不到关键点。
    if short_side < 96 {
        let scale = 128.0 / short_side as f64;
        let target_w = ((gray.cols() as f64) * scale).round().max(1.0) as i32;
        let target_h = ((gray.rows() as f64) * scale).round().max(1.0) as i32;
        let mut resized = Mat::default();
        imgproc::resize(
            gray,
            &mut resized,
            Size::new(target_w, target_h),
            0.0,
            0.0,
            imgproc::INTER_LINEAR,
        )
        .map_err(|e| format!("ORB 小图放大失败: {e}"))?;
        candidates.push(resized);
    }

    // 加入均衡化候选，提升低对比度图像的可检测性。
    let mut eq_gray = Mat::default();
    imgproc::equalize_hist(gray, &mut eq_gray).map_err(|e| format!("ORB 直方图均衡失败: {e}"))?;
    candidates.push(eq_gray);

    if short_side < 96 {
        let mut eq_resized = Mat::default();
        imgproc::equalize_hist(
            candidates
                .get(1)
                .ok_or_else(|| "ORB 候选图像构建失败".to_string())?,
            &mut eq_resized,
        )
        .map_err(|e| format!("ORB 放大图均衡失败: {e}"))?;
        candidates.push(eq_resized);
    }

    for candidate in &candidates {
        let mut orb = features2d::ORB::create_def().map_err(|e| format!("创建 ORB 检测器失败: {e}"))?;
        let mut keypoints = core::Vector::<core::KeyPoint>::new();
        let mut descriptors = Mat::default();
        orb.detect_and_compute(
            candidate,
            &Mat::default(),
            &mut keypoints,
            &mut descriptors,
            false,
        )
        .map_err(|e| format!("计算 ORB 描述子失败: {e}"))?;

        if !descriptors.empty() {
            return Ok(descriptors);
        }
    }

    Ok(Mat::default())
}

/// 将 ORB 描述子矩阵编码为字符串（`base64`）。
///
/// 说明：
/// - 压缩前字节流格式为 `[rows:u16][cols:u16][descriptor bytes...]`；
/// - 对整段字节流做 ZIP(Deflate) 压缩后，再做 Base64（无填充）编码。
fn _encode_orb_descriptors(descriptors: &Mat) -> Result<String, String> {
    let rows = if descriptors.empty() { 0 } else { descriptors.rows() };
    let cols = if descriptors.empty() {
        ORB_DESCRIPTOR_COLS
    } else {
        descriptors.cols()
    };

    if cols != ORB_DESCRIPTOR_COLS {
        return Err(format!(
            "ORB 描述子长度异常，期望 {ORB_DESCRIPTOR_COLS} 字节，实际 {}",
            cols
        ));
    }

    let mut raw = Vec::<u8>::new();
    if rows > 0 {
        raw.reserve((rows as usize) * (ORB_DESCRIPTOR_COLS as usize));
        for row in 0..rows {
            for col in 0..ORB_DESCRIPTOR_COLS {
                let value = *descriptors
                    .at_2d::<u8>(row, col)
                    .map_err(|e| format!("读取 ORB 描述子失败[{row},{col}]: {e}"))?;
                raw.push(value);
            }
        }
    }

    let packed = _pack_orb_feature_bytes(rows, ORB_DESCRIPTOR_COLS, &raw)?;
    let compressed = _compress_bytes_zip_deflate(&packed)?;
    let encoded = general_purpose::STANDARD_NO_PAD.encode(compressed);
    Ok(encoded)
}

/// 从字符串解码 ORB 描述子矩阵（`base64`）。
fn _decode_orb_descriptors(feature: &str) -> Result<Mat, String> {
    let compressed = general_purpose::STANDARD_NO_PAD
        .decode(feature.trim())
        .or_else(|_| general_purpose::STANDARD.decode(feature.trim()))
        .map_err(|e| format!("ORB 特征 payload 解码失败: {e}"))?;
    let packed = _decompress_bytes_zip_deflate(&compressed)?;
    let (rows, cols, raw) = _unpack_orb_feature_bytes(&packed)?;

    if cols <= 0 {
        return Err("ORB 特征尺寸非法".to_string());
    }
    if cols != ORB_DESCRIPTOR_COLS {
        return Err(format!(
            "ORB 特征列数非法，期望 {ORB_DESCRIPTOR_COLS}，实际 {cols}"
        ));
    }
    if rows == 0 {
        if raw.is_empty() {
            return Ok(Mat::default());
        }
        return Err("ORB 特征 rows=0 时 descriptor 数据必须为空".to_string());
    }
    let expected_len = (rows as usize) * (cols as usize);
    if raw.len() != expected_len {
        return Err(format!(
            "ORB 特征 payload 长度不匹配，期望 {expected_len}，实际 {}",
            raw.len()
        ));
    }

    let mut descriptors = Mat::zeros(rows, cols, CV_8UC1)
        .map_err(|e| format!("创建 ORB 描述子 Mat 失败: {e}"))?
        .to_mat()
        .map_err(|e| format!("初始化 ORB 描述子 Mat 失败: {e}"))?;
    let dst = descriptors
        .data_bytes_mut()
        .map_err(|e| format!("写入 ORB 描述子失败: {e}"))?;
    if dst.len() != expected_len {
        return Err(format!(
            "ORB 描述子 Mat 大小异常，期望 {expected_len}，实际 {}",
            dst.len()
        ));
    }
    dst.copy_from_slice(&raw);

    Ok(descriptors)
}

/// 计算 ORB 描述子的优质匹配数量（Lowe Ratio Test）。
fn _orb_good_match_count_from_descriptors(query: &Mat, train: &Mat) -> Result<i32, String> {
    if query.empty() || train.empty() {
        return Ok(0);
    }

    let matcher = features2d::BFMatcher::create(core::NORM_HAMMING, false)
        .map_err(|e| format!("创建 ORB 匹配器失败: {e}"))?;
    let mut knn_matches = core::Vector::<core::Vector<core::DMatch>>::new();
    matcher
        .knn_train_match_def(query, train, &mut knn_matches, 2)
        .map_err(|e| format!("ORB knn 匹配失败: {e}"))?;

    let mut good_count = 0i32;
    for idx in 0..knn_matches.len() {
        let pair = knn_matches
            .get(idx)
            .map_err(|e| format!("读取 ORB 匹配对[{idx}]失败: {e}"))?;
        if pair.len() < 2 {
            continue;
        }
        let first = pair
            .get(0)
            .map_err(|e| format!("读取 ORB 匹配 first[{idx}]失败: {e}"))?;
        let second = pair
            .get(1)
            .map_err(|e| format!("读取 ORB 匹配 second[{idx}]失败: {e}"))?;
        if first.distance < second.distance * ORB_MATCH_RATIO_THRESHOLD {
            good_count += 1;
        }
    }

    Ok(good_count)
}

/// 基于 ORB 描述子计算匹配置信度（0-1，越大越像）。
fn _orb_match_confidence_from_descriptors(source: &Mat, template: &Mat) -> Result<f64, String> {
    if source.empty() || template.empty() {
        return Ok(0.0);
    }

    let good_count = _orb_good_match_count_from_descriptors(source, template)?;
    if good_count < ORB_MATCH_MIN_GOOD_COUNT {
        return Ok(0.0);
    }

    let denom = source.rows().min(template.rows()).max(1) as f64;
    Ok((good_count as f64 / denom).clamp(0.0, 1.0))
}

/// 解析 ORB 匹配阈值：
/// - `0.0..=1.0` 视为最小置信度；
/// - `1.0..=100.0` 视为百分比并换算到 `0.0..=1.0`。
fn _parse_orb_min_confidence(threshold: f64) -> f64 {
    if !threshold.is_finite() {
        return 0.0;
    }
    if threshold <= 1.0 {
        threshold.max(0.0)
    } else {
        (threshold / 100.0).clamp(0.0, 1.0)
    }
}

/// 计算图像 ORB 特征字符串（压缩后的原始描述子）。
pub fn orb_feature_impl(mat: &Mat) -> Result<String, String> {
    if mat.rows() <= 0 || mat.cols() <= 0 {
        return Err("源图像尺寸无效".to_string());
    }

    let gray = _to_gray_mat(mat)?;
    let descriptors = _detect_orb_descriptors(&gray)?;
    _encode_orb_descriptors(&descriptors)
}

/// 比较 ORB 特征字符串数组，返回最佳匹配索引或 -1。
///
/// 输入字符串必须为 ORB 压缩特征 `base64` 格式。
/// 参数 `threshold` 表示最小置信度（支持 0-1 或 0-100）。
pub fn match_orb_feature_impl(
    source_feature: &str,
    template_features: &[String],
    threshold: f64,
) -> Result<i32, String> {
    let source_descriptors = _decode_orb_descriptors(source_feature)?;
    let min_confidence = _parse_orb_min_confidence(threshold);

    let mut best_index: i32 = -1;
    let mut best_confidence = 0.0f64;
    for (index, template_feature) in template_features.iter().enumerate() {
        let template_descriptors = _decode_orb_descriptors(template_feature)
            .map_err(|e| format!("templateFeatures[{index}] 解析失败: {e}"))?;
        let confidence =
            _orb_match_confidence_from_descriptors(&source_descriptors, &template_descriptors)?;
        if confidence >= min_confidence && confidence > best_confidence {
            best_confidence = confidence;
            best_index = index as i32;
            if confidence >= 0.999 {
                break;
            }
        }
    }

    Ok(best_index)
}

/// 计算 ORB 优质匹配数量（Lowe Ratio Test）。
pub fn orb_match_count_impl(img1: &Mat, img2: &Mat) -> Result<i32, String> {
    let gray1 = _to_gray_mat(img1)?;
    let gray2 = _to_gray_mat(img2)?;

    let descriptors1 = _detect_orb_descriptors(&gray1)?;
    let descriptors2 = _detect_orb_descriptors(&gray2)?;
    _orb_good_match_count_from_descriptors(&descriptors1, &descriptors2)
}

/// 使用 SIFT + 单应性估计定位 img2 在 img1 中的位置与尺寸。
pub fn sift_locate_impl(img1: &Mat, img2: &Mat) -> Result<Option<SiftLocateResult>, String> {
    let gray1 = _to_gray_mat(img1)?;
    let gray2 = _to_gray_mat(img2)?;

    let mut sift =
        features2d::SIFT::create_def().map_err(|e| format!("创建 SIFT 检测器失败: {e}"))?;

    let mut keypoints1 = core::Vector::<core::KeyPoint>::new();
    let mut descriptors1 = Mat::default();
    sift.detect_and_compute(
        &gray1,
        &Mat::default(),
        &mut keypoints1,
        &mut descriptors1,
        false,
    )
    .map_err(|e| format!("计算 img1 SIFT 特征失败: {e}"))?;

    let mut keypoints2 = core::Vector::<core::KeyPoint>::new();
    let mut descriptors2 = Mat::default();
    sift.detect_and_compute(
        &gray2,
        &Mat::default(),
        &mut keypoints2,
        &mut descriptors2,
        false,
    )
    .map_err(|e| format!("计算 img2 SIFT 特征失败: {e}"))?;

    if descriptors1.empty() || descriptors2.empty() {
        return Ok(None);
    }

    // query=img2, train=img1，最终得到 img2->img1 的空间映射。
    let matcher = features2d::BFMatcher::create(core::NORM_L2, false)
        .map_err(|e| format!("创建 SIFT 匹配器失败: {e}"))?;
    let mut knn_matches = core::Vector::<core::Vector<core::DMatch>>::new();
    matcher
        .knn_train_match_def(&descriptors2, &descriptors1, &mut knn_matches, 2)
        .map_err(|e| format!("SIFT knn 匹配失败: {e}"))?;

    let mut src_points = core::Vector::<Point2f>::new();
    let mut dst_points = core::Vector::<Point2f>::new();
    let mut good_matches = 0i32;

    for idx in 0..knn_matches.len() {
        let pair = knn_matches
            .get(idx)
            .map_err(|e| format!("读取 SIFT 匹配对[{idx}]失败: {e}"))?;
        if pair.len() < 2 {
            continue;
        }
        let first = pair
            .get(0)
            .map_err(|e| format!("读取 SIFT 匹配 first[{idx}]失败: {e}"))?;
        let second = pair
            .get(1)
            .map_err(|e| format!("读取 SIFT 匹配 second[{idx}]失败: {e}"))?;

        if first.distance >= second.distance * 0.75 {
            continue;
        }

        if first.query_idx < 0 || first.train_idx < 0 {
            continue;
        }

        let kp2 = keypoints2
            .get(first.query_idx as usize)
            .map_err(|e| format!("读取 img2 关键点失败: {e}"))?;
        let kp1 = keypoints1
            .get(first.train_idx as usize)
            .map_err(|e| format!("读取 img1 关键点失败: {e}"))?;

        src_points.push(kp2.pt());
        dst_points.push(kp1.pt());
        good_matches += 1;
    }

    if src_points.len() < 4 || dst_points.len() < 4 {
        return Ok(None);
    }

    let mut inlier_mask = Mat::default();
    let homography = calib3d::find_homography(
        &src_points,
        &dst_points,
        &mut inlier_mask,
        calib3d::RANSAC,
        3.0,
    )
    .map_err(|e| format!("估计单应矩阵失败: {e}"))?;

    if homography.empty() {
        return Ok(None);
    }

    let img2_w = img2.cols() as f32;
    let img2_h = img2.rows() as f32;
    if img2_w <= 0.0 || img2_h <= 0.0 {
        return Ok(None);
    }

    let mut corners = core::Vector::<Point2f>::new();
    corners.push(Point2f::new(0.0, 0.0));
    corners.push(Point2f::new(img2_w, 0.0));
    corners.push(Point2f::new(img2_w, img2_h));
    corners.push(Point2f::new(0.0, img2_h));

    let mut transformed = core::Vector::<Point2f>::new();
    core::perspective_transform(&corners, &mut transformed, &homography)
        .map_err(|e| format!("透视变换失败: {e}"))?;

    if transformed.len() != 4 {
        return Ok(None);
    }

    let mut transformed_points = Vec::with_capacity(4);
    let mut min_x = f32::INFINITY;
    let mut min_y = f32::INFINITY;
    let mut max_x = f32::NEG_INFINITY;
    let mut max_y = f32::NEG_INFINITY;
    for idx in 0..transformed.len() {
        let p = transformed
            .get(idx)
            .map_err(|e| format!("读取变换角点[{idx}]失败: {e}"))?;
        transformed_points.push(p);
        min_x = min_x.min(p.x);
        min_y = min_y.min(p.y);
        max_x = max_x.max(p.x);
        max_y = max_y.max(p.y);
    }

    let width = max_x - min_x;
    let height = max_y - min_y;
    if !min_x.is_finite()
        || !min_y.is_finite()
        || !width.is_finite()
        || !height.is_finite()
        || width <= 0.0
        || height <= 0.0
    {
        return Ok(None);
    }

    let inliers =
        core::count_non_zero(&inlier_mask).map_err(|e| format!("统计内点数量失败: {e}"))?;

    Ok(Some((
        min_x as f64,
        min_y as f64,
        width as f64,
        height as f64,
        good_matches,
        inliers,
        transformed_points,
    )))
}

/// 使用 SIFT + 单应性将 patch 拼接到 base，必要时自动扩展画布。
///
/// # 参数
/// - `base`: 当前大图（作为 train）
/// - `patch`: 新帧小图（作为 query）
/// - `min_good_matches`: 最小优质匹配数量，<=0 表示不限制
/// - `min_inliers`: 最小内点数量，<=0 表示不限制
/// - `ransac_reproj_threshold`: RANSAC 重投影阈值（像素，非有限值时回退为 3.0）
///
/// # 返回
/// - `None`: 匹配不足，无法可靠拼接
/// - `Some`: 返回拼接后图像、bbox、匹配统计与变换角点
pub fn sift_stitch_impl(
    base: &Mat,
    patch: &Mat,
    min_good_matches: i32,
    min_inliers: i32,
    ransac_reproj_threshold: f64,
) -> Result<Option<SiftStitchResult>, String> {
    if base.rows() <= 0 || base.cols() <= 0 {
        return Err("base 图像尺寸无效".to_string());
    }
    if patch.rows() <= 0 || patch.cols() <= 0 {
        return Err("patch 图像尺寸无效".to_string());
    }

    let base_bgr = _to_bgr_mat(base)?;
    let patch_bgr = _to_bgr_mat(patch)?;
    let gray_base = _to_gray_mat(&base_bgr)?;
    let gray_patch = _to_gray_mat(&patch_bgr)?;

    let mut sift =
        features2d::SIFT::create_def().map_err(|e| format!("创建 SIFT 检测器失败: {e}"))?;

    let mut keypoints_base = core::Vector::<core::KeyPoint>::new();
    let mut descriptors_base = Mat::default();
    sift.detect_and_compute(
        &gray_base,
        &Mat::default(),
        &mut keypoints_base,
        &mut descriptors_base,
        false,
    )
    .map_err(|e| format!("计算 base SIFT 特征失败: {e}"))?;

    let mut keypoints_patch = core::Vector::<core::KeyPoint>::new();
    let mut descriptors_patch = Mat::default();
    sift.detect_and_compute(
        &gray_patch,
        &Mat::default(),
        &mut keypoints_patch,
        &mut descriptors_patch,
        false,
    )
    .map_err(|e| format!("计算 patch SIFT 特征失败: {e}"))?;

    if descriptors_base.empty() || descriptors_patch.empty() {
        return Ok(None);
    }

    let matcher = features2d::BFMatcher::create(core::NORM_L2, false)
        .map_err(|e| format!("创建 SIFT 匹配器失败: {e}"))?;
    let mut knn_matches = core::Vector::<core::Vector<core::DMatch>>::new();
    matcher
        .knn_train_match_def(&descriptors_patch, &descriptors_base, &mut knn_matches, 2)
        .map_err(|e| format!("SIFT knn 匹配失败: {e}"))?;

    let mut src_points = core::Vector::<Point2f>::new();
    let mut dst_points = core::Vector::<Point2f>::new();
    let mut good_matches = 0i32;
    for idx in 0..knn_matches.len() {
        let pair = knn_matches
            .get(idx)
            .map_err(|e| format!("读取 SIFT 匹配对[{idx}]失败: {e}"))?;
        if pair.len() < 2 {
            continue;
        }

        let first = pair
            .get(0)
            .map_err(|e| format!("读取 SIFT 匹配 first[{idx}]失败: {e}"))?;
        let second = pair
            .get(1)
            .map_err(|e| format!("读取 SIFT 匹配 second[{idx}]失败: {e}"))?;
        if first.distance >= second.distance * 0.75 {
            continue;
        }
        if first.query_idx < 0 || first.train_idx < 0 {
            continue;
        }

        let kp_patch = keypoints_patch
            .get(first.query_idx as usize)
            .map_err(|e| format!("读取 patch 关键点失败: {e}"))?;
        let kp_base = keypoints_base
            .get(first.train_idx as usize)
            .map_err(|e| format!("读取 base 关键点失败: {e}"))?;
        src_points.push(kp_patch.pt());
        dst_points.push(kp_base.pt());
        good_matches += 1;
    }

    if src_points.len() < 4 || dst_points.len() < 4 {
        return Ok(None);
    }

    let mut inlier_mask = Mat::default();
    let ransac_threshold = if ransac_reproj_threshold.is_finite() {
        ransac_reproj_threshold.max(0.5)
    } else {
        3.0
    };
    let homography = calib3d::find_homography(
        &src_points,
        &dst_points,
        &mut inlier_mask,
        calib3d::RANSAC,
        ransac_threshold,
    )
    .map_err(|e| format!("估计单应矩阵失败: {e}"))?;
    if homography.empty() {
        return Ok(None);
    }

    let inliers =
        core::count_non_zero(&inlier_mask).map_err(|e| format!("统计内点数量失败: {e}"))?;
    if min_good_matches > 0 && good_matches < min_good_matches {
        return Ok(None);
    }
    if min_inliers > 0 && inliers < min_inliers {
        return Ok(None);
    }

    let patch_w = patch_bgr.cols() as f32;
    let patch_h = patch_bgr.rows() as f32;
    if patch_w <= 0.0 || patch_h <= 0.0 {
        return Ok(None);
    }

    let mut patch_corners = core::Vector::<Point2f>::new();
    patch_corners.push(Point2f::new(0.0, 0.0));
    patch_corners.push(Point2f::new(patch_w, 0.0));
    patch_corners.push(Point2f::new(patch_w, patch_h));
    patch_corners.push(Point2f::new(0.0, patch_h));

    let mut transformed_on_base = core::Vector::<Point2f>::new();
    core::perspective_transform(&patch_corners, &mut transformed_on_base, &homography)
        .map_err(|e| format!("透视变换失败: {e}"))?;
    if transformed_on_base.len() != 4 {
        return Ok(None);
    }

    let mut min_x = f32::INFINITY;
    let mut min_y = f32::INFINITY;
    let mut max_x = f32::NEG_INFINITY;
    let mut max_y = f32::NEG_INFINITY;
    for idx in 0..transformed_on_base.len() {
        let p = transformed_on_base
            .get(idx)
            .map_err(|e| format!("读取变换角点[{idx}]失败: {e}"))?;
        min_x = min_x.min(p.x);
        min_y = min_y.min(p.y);
        max_x = max_x.max(p.x);
        max_y = max_y.max(p.y);
    }

    let base_w = base_bgr.cols();
    let base_h = base_bgr.rows();
    let pad_left = if min_x < 0.0 { (-min_x).ceil() as i32 } else { 0 };
    let pad_top = if min_y < 0.0 { (-min_y).ceil() as i32 } else { 0 };
    let pad_right = if max_x > base_w as f32 {
        (max_x.ceil() as i32 - base_w).max(0)
    } else {
        0
    };
    let pad_bottom = if max_y > base_h as f32 {
        (max_y.ceil() as i32 - base_h).max(0)
    } else {
        0
    };

    let canvas_w = base_w + pad_left + pad_right;
    let canvas_h = base_h + pad_top + pad_bottom;
    if canvas_w <= 0 || canvas_h <= 0 {
        return Err("拼接后画布尺寸无效".to_string());
    }

    let mut stitched = Mat::zeros(canvas_h, canvas_w, base_bgr.typ())
        .map_err(|e| format!("创建拼接画布失败: {e}"))?
        .to_mat()
        .map_err(|e| format!("初始化拼接画布失败: {e}"))?;
    {
        let roi = core::Rect::new(pad_left, pad_top, base_w, base_h);
        let mut base_roi =
            Mat::roi_mut(&mut stitched, roi).map_err(|e| format!("获取大图 ROI 失败: {e}"))?;
        base_bgr
            .copy_to(&mut base_roi)
            .map_err(|e| format!("复制 base 到画布失败: {e}"))?;
    }

    let translate = Mat::from_slice_2d(&[
        [1.0f64, 0.0, pad_left as f64],
        [0.0, 1.0, pad_top as f64],
        [0.0, 0.0, 1.0],
    ])
    .map_err(|e| format!("创建平移矩阵失败: {e}"))?;
    let mut homography_on_canvas = Mat::default();
    core::gemm(
        &translate,
        &homography,
        1.0,
        &Mat::default(),
        0.0,
        &mut homography_on_canvas,
        0,
    )
    .map_err(|e| format!("计算画布单应矩阵失败: {e}"))?;

    let mut warped_patch = Mat::zeros(canvas_h, canvas_w, base_bgr.typ())
        .map_err(|e| format!("创建变换图失败: {e}"))?
        .to_mat()
        .map_err(|e| format!("初始化变换图失败: {e}"))?;
    imgproc::warp_perspective(
        &patch_bgr,
        &mut warped_patch,
        &homography_on_canvas,
        Size::new(canvas_w, canvas_h),
        imgproc::INTER_LINEAR,
        core::BORDER_CONSTANT,
        Scalar::all(0.0),
    )
    .map_err(|e| format!("patch 透视变换失败: {e}"))?;

    // 仅将 patch 的非零区域覆盖到画布，避免背景黑边污染已有大图。
    let mut patch_mask = Mat::default();
    imgproc::threshold(
        &gray_patch,
        &mut patch_mask,
        1.0,
        255.0,
        imgproc::THRESH_BINARY,
    )
    .map_err(|e| format!("构建 patch 有效区域掩码失败: {e}"))?;
    let mut warped_mask = Mat::zeros(canvas_h, canvas_w, CV_8UC1)
        .map_err(|e| format!("创建变换掩码失败: {e}"))?
        .to_mat()
        .map_err(|e| format!("初始化变换掩码失败: {e}"))?;
    imgproc::warp_perspective(
        &patch_mask,
        &mut warped_mask,
        &homography_on_canvas,
        Size::new(canvas_w, canvas_h),
        imgproc::INTER_NEAREST,
        core::BORDER_CONSTANT,
        Scalar::all(0.0),
    )
    .map_err(|e| format!("patch 掩码透视变换失败: {e}"))?;

    let mut foreground = Mat::default();
    core::bitwise_and(&warped_patch, &warped_patch, &mut foreground, &warped_mask)
        .map_err(|e| format!("提取前景失败: {e}"))?;
    let mut inverse_mask = Mat::default();
    core::bitwise_not(&warped_mask, &mut inverse_mask, &Mat::default())
        .map_err(|e| format!("反转掩码失败: {e}"))?;
    let mut background = Mat::default();
    core::bitwise_and(&stitched, &stitched, &mut background, &inverse_mask)
        .map_err(|e| format!("提取背景失败: {e}"))?;
    let mut merged = Mat::default();
    core::add(&background, &foreground, &mut merged, &Mat::default(), -1)
        .map_err(|e| format!("融合拼接图失败: {e}"))?;

    let mut transformed_on_canvas = core::Vector::<Point2f>::new();
    core::perspective_transform(&patch_corners, &mut transformed_on_canvas, &homography_on_canvas)
        .map_err(|e| format!("计算画布角点失败: {e}"))?;
    if transformed_on_canvas.len() != 4 {
        return Ok(None);
    }

    let mut out_corners = Vec::with_capacity(4);
    let mut out_min_x = f32::INFINITY;
    let mut out_min_y = f32::INFINITY;
    let mut out_max_x = f32::NEG_INFINITY;
    let mut out_max_y = f32::NEG_INFINITY;
    for idx in 0..transformed_on_canvas.len() {
        let p = transformed_on_canvas
            .get(idx)
            .map_err(|e| format!("读取画布角点[{idx}]失败: {e}"))?;
        out_corners.push(p);
        out_min_x = out_min_x.min(p.x);
        out_min_y = out_min_y.min(p.y);
        out_max_x = out_max_x.max(p.x);
        out_max_y = out_max_y.max(p.y);
    }

    let out_w = out_max_x - out_min_x;
    let out_h = out_max_y - out_min_y;
    if !out_min_x.is_finite()
        || !out_min_y.is_finite()
        || !out_w.is_finite()
        || !out_h.is_finite()
        || out_w <= 0.0
        || out_h <= 0.0
    {
        return Ok(None);
    }

    Ok(Some((
        merged,
        out_min_x as f64,
        out_min_y as f64,
        out_w as f64,
        out_h as f64,
        good_matches,
        inliers,
        out_corners,
    )))
}

/// 形态学处理实现，返回处理后的 Mat。
pub fn morphology_ex_impl(
    mat: &Mat,
    op: i32,
    kernel_size: i32,
    iterations: i32,
    shape: i32,
) -> Result<Mat, String> {
    if mat.rows() <= 0 || mat.cols() <= 0 {
        return Err("源图像尺寸无效".to_string());
    }

    // 将核大小规范为正奇数，确保形态学核中心对称。
    let kernel_size = kernel_size.max(1);
    let kernel_size = if kernel_size % 2 == 0 {
        kernel_size + 1
    } else {
        kernel_size
    };
    let iterations = iterations.max(1);

    let kernel = imgproc::get_structuring_element(
        shape,
        Size::new(kernel_size, kernel_size),
        Point::new(-1, -1),
    )
    .map_err(|e| format!("创建形态学核失败: {e}"))?;

    let mut dst = Mat::default();
    imgproc::morphology_ex(
        mat,
        &mut dst,
        op,
        &kernel,
        Point::new(-1, -1),
        iterations,
        core::BORDER_CONSTANT,
        Scalar::all(0.0),
    )
    .map_err(|e| format!("morphologyEx 执行失败: {e}"))?;

    Ok(dst)
}

/// 计算外接矩形面积（像素）。
fn _rect_area(rect: &core::Rect) -> f64 {
    if rect.width <= 0 || rect.height <= 0 {
        return 0.0;
    }
    rect.width as f64 * rect.height as f64
}

/// 计算两个外接矩形的交集面积（像素）。
fn _rect_intersection_area(a: &core::Rect, b: &core::Rect) -> f64 {
    let left = a.x.max(b.x);
    let top = a.y.max(b.y);
    let right = (a.x + a.width).min(b.x + b.width);
    let bottom = (a.y + a.height).min(b.y + b.height);

    let width = (right - left).max(0);
    let height = (bottom - top).max(0);
    (width as f64) * (height as f64)
}

/// 判断两个矩形是否属于重复目标（强重叠或近似包含）。
fn _is_duplicate_rect(
    a: &core::Rect,
    b: &core::Rect,
    iou_threshold: f64,
    contain_threshold: f64,
) -> bool {
    let inter = _rect_intersection_area(a, b);
    if inter <= 0.0 {
        return false;
    }

    let area_a = _rect_area(a);
    let area_b = _rect_area(b);
    if area_a <= f64::EPSILON || area_b <= f64::EPSILON {
        return false;
    }

    let union = area_a + area_b - inter;
    let iou = if union > f64::EPSILON {
        inter / union
    } else {
        0.0
    };
    let overlap_small = inter / area_a.min(area_b);

    iou >= iou_threshold || overlap_small >= contain_threshold
}

/// 对重叠轮廓做抑制，优先保留面积更大的框，避免重复返回近似同一目标。
fn _suppress_overlapping_contours(mut contours: Vec<ContourResult>) -> Vec<ContourResult> {
    const IOU_THRESHOLD: f64 = 0.7;
    const CONTAIN_THRESHOLD: f64 = 0.9;

    contours.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));

    let mut kept: Vec<ContourResult> = Vec::with_capacity(contours.len());
    'contours_loop: for contour in contours {
        for existing in &kept {
            if _is_duplicate_rect(&contour.1, &existing.1, IOU_THRESHOLD, CONTAIN_THRESHOLD) {
                continue 'contours_loop;
            }
        }
        kept.push(contour);
    }

    // 输出按从上到下、从左到右排序，便于脚本层稳定处理。
    kept.sort_by(|a, b| {
        let ay = a.1.y;
        let by = b.1.y;
        if ay == by {
            a.1.x.cmp(&b.1.x)
        } else {
            ay.cmp(&by)
        }
    });
    kept
}

/// 对图像执行轮廓提取，返回轮廓面积、外接矩形和中心点信息。
pub fn find_contours_impl(
    mat: &Mat,
    mode: i32,
    method: i32,
    min_area: f64,
) -> Result<Vec<ContourResult>, String> {
    if mat.rows() <= 0 || mat.cols() <= 0 {
        return Err("源图像尺寸无效".to_string());
    }

    let gray = _to_gray_mat(mat)?;

    // 统一转为二值图，避免输入灰度层次过多导致轮廓噪声不稳定。
    let mut binary = Mat::default();
    imgproc::threshold(
        &gray,
        &mut binary,
        0.0,
        255.0,
        imgproc::THRESH_BINARY | imgproc::THRESH_OTSU,
    )
    .map_err(|e| format!("threshold 失败: {e}"))?;

    let mut contours = core::Vector::<core::Vector<Point>>::new();
    imgproc::find_contours_def(&binary, &mut contours, mode, method)
        .map_err(|e| format!("find_contours 失败: {e}"))?;

    let mut results = Vec::with_capacity(contours.len());
    for idx in 0..contours.len() {
        let contour = contours
            .get(idx)
            .map_err(|e| format!("读取轮廓[{idx}] 失败: {e}"))?;
        if contour.len() < 3 {
            continue;
        }

        let area = imgproc::contour_area(&contour, false)
            .map_err(|e| format!("计算轮廓[{idx}] 面积失败: {e}"))?;
        if area < min_area {
            continue;
        }

        let rect = imgproc::bounding_rect(&contour)
            .map_err(|e| format!("计算轮廓[{idx}] 外接矩形失败: {e}"))?;
        let moments = imgproc::moments(&contour, false)
            .map_err(|e| format!("计算轮廓[{idx}] 矩失败: {e}"))?;
        let center = if moments.m00.abs() > f64::EPSILON {
            (moments.m10 / moments.m00, moments.m01 / moments.m00)
        } else {
            (
                rect.x as f64 + rect.width as f64 / 2.0,
                rect.y as f64 + rect.height as f64 / 2.0,
            )
        };

        results.push((area, rect, center));
    }

    Ok(_suppress_overlapping_contours(results))
}

/// 绘制轮廓并返回可视化图像。
///
/// 说明：
/// 1. 为了保证输出可见彩色线条，返回图统一为 BGR 三通道；
/// 2. 轮廓提取流程与 `find_contours_impl` 一致（灰度 + OTSU 二值化）；
/// 3. 仅绘制面积 >= `min_area` 的轮廓。
pub fn draw_contours_impl(
    mat: &Mat,
    mode: i32,
    method: i32,
    min_area: f64,
    color: u32,
    thickness: i32,
) -> Result<Mat, String> {
    if mat.rows() <= 0 || mat.cols() <= 0 {
        return Err("源图像尺寸无效".to_string());
    }

    let gray = _to_gray_mat(mat)?;

    let mut binary = Mat::default();
    imgproc::threshold(
        &gray,
        &mut binary,
        0.0,
        255.0,
        imgproc::THRESH_BINARY | imgproc::THRESH_OTSU,
    )
    .map_err(|e| format!("threshold 失败: {e}"))?;

    let mut contours = core::Vector::<core::Vector<Point>>::new();
    imgproc::find_contours_def(&binary, &mut contours, mode, method)
        .map_err(|e| format!("find_contours 失败: {e}"))?;

    let mut filtered = core::Vector::<core::Vector<Point>>::new();
    for idx in 0..contours.len() {
        let contour = contours
            .get(idx)
            .map_err(|e| format!("读取轮廓[{idx}] 失败: {e}"))?;
        if contour.len() < 3 {
            continue;
        }
        let area = imgproc::contour_area(&contour, false)
            .map_err(|e| format!("计算轮廓[{idx}] 面积失败: {e}"))?;
        if area < min_area {
            continue;
        }
        filtered.push(contour);
    }

    let mut output = _to_bgr_mat(mat)?;

    if filtered.is_empty() {
        return Ok(output);
    }

    let (b, g, r) = rgb_to_bgr(color);
    let draw_color = Scalar::new(b as f64, g as f64, r as f64, 0.0);
    let draw_thickness = thickness.max(1);

    imgproc::draw_contours(
        &mut output,
        &filtered,
        -1,
        draw_color,
        draw_thickness,
        imgproc::LINE_8,
        &core::no_array(),
        i32::MAX,
        Point::new(0, 0),
    )
    .map_err(|e| format!("draw_contours 失败: {e}"))?;

    Ok(output)
}

/// 按外接框数组直接绘制矩形轮廓并返回可视化图像。
///
/// 参数 `bboxes` 元素格式为 `(x, y, w, h)`。
pub fn draw_bboxes_impl(
    mat: &Mat,
    bboxes: &[(i32, i32, i32, i32)],
    color: u32,
    thickness: i32,
) -> Result<Mat, String> {
    if mat.rows() <= 0 || mat.cols() <= 0 {
        return Err("源图像尺寸无效".to_string());
    }

    let mut output = _to_bgr_mat(mat)?;
    if bboxes.is_empty() {
        return Ok(output);
    }

    let (b, g, r) = rgb_to_bgr(color);
    let draw_color = Scalar::new(b as f64, g as f64, r as f64, 0.0);
    let draw_thickness = thickness.max(1);
    let cols = output.cols();
    let rows = output.rows();

    for (index, &(x, y, w, h)) in bboxes.iter().enumerate() {
        if w <= 0 || h <= 0 {
            continue;
        }

        // 对绘制区域做边界裁剪，避免非法矩形触发 OpenCV 异常。
        let x0 = x.clamp(0, cols.saturating_sub(1));
        let y0 = y.clamp(0, rows.saturating_sub(1));
        let x1 = (x + w).clamp(0, cols);
        let y1 = (y + h).clamp(0, rows);
        let cw = x1 - x0;
        let ch = y1 - y0;
        if cw <= 0 || ch <= 0 {
            continue;
        }

        let rect = core::Rect::new(x0, y0, cw, ch);
        imgproc::rectangle(&mut output, rect, draw_color, draw_thickness, imgproc::LINE_8, 0)
            .map_err(|e| format!("绘制 bbox[{index}] 失败: {e}"))?;
    }

    Ok(output)
}
