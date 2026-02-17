use opencv::{
    calib3d,
    core::{self, CV_8UC1, Mat, Point, Point2f, Scalar, Size},
    features2d, imgproc,
    prelude::{
        DescriptorMatcherTraitConst, Feature2DTrait, KeyPointTraitConst, MatExprTraitConst,
        MatTraitConst, MatTraitConstManual, MatTraitManual,
    },
};
use std::{
    sync::atomic::{AtomicUsize, Ordering},
    thread,
};

use crate::submodules::{color::rgb_to_hsl, color_match::rgb_to_bgr, tpl_match::match_template};

pub type SiftLocateResult = (f64, f64, f64, f64, i32, i32, Vec<Point2f>);
pub type ContourResult = (f64, core::Rect, (f64, f64));
pub type BBoxResult = (i32, i32, i32, i32);

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
/// `abs(h1 - h2) + abs(s1 - s2) * 180 + abs(l1 - l2) * 75`
pub fn color_filter_hsl_impl(mat: &Mat, colors: &[u32], tolerance: f64) -> Result<Mat, String> {
    if mat.rows() <= 0 || mat.cols() <= 0 {
        return Err("源图像尺寸无效".to_string());
    }
    if colors.is_empty() {
        return Err("colors 不能为空".to_string());
    }
    if !tolerance.is_finite() || tolerance < 0.0 {
        return Err("tolerance 必须是非负有限数".to_string());
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
    let tolerance_scaled = (tolerance * 255.0).round().clamp(0.0, i32::MAX as f64) as i32;

    // 先用 HLS 轴向范围做候选粗筛，减少后续精算像素数。
    let delta_h_deg = (tolerance_scaled + 254) / 255;
    let delta_h_ch = (delta_h_deg + 1) / 2;
    let delta_s = (tolerance_scaled + 179) / 180;
    let delta_l = (tolerance_scaled + 74) / 75;
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
                // dist_scaled = abs(h1-h2)*255 + abs(s1-s2)*180 + abs(l1-l2)*75
                let distance_scaled =
                    (h_deg - *th).abs() * 255 + (s_u8 - *ts).abs() * 180 + (l_u8 - *tl).abs() * 75;
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
                            let distance_scaled = (h_deg - *th).abs() * 255
                                + (s_u8 - *ts).abs() * 180
                                + (l_u8 - *tl).abs() * 75;
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

/// 计算灰度图像的 ORB 聚合签名（256 bit）。
///
/// 签名构造方式：
/// 1. 提取 ORB 描述子（每个描述子 32 字节，共 256 bit）；
/// 2. 对每个 bit 位统计所有描述子中 1 的出现次数；
/// 3. 使用多数投票（`ones > rows/2`）得到最终 bit；
/// 4. 拼成固定 32 字节签名。
///
/// 说明：
/// - 对于高度较小的图（例如时间条、UI 片段），默认 ORB 可能检测不到关键点；
/// - 这里会尝试原图、放大图、均衡化图等候选输入，尽量减少“全 0 哈希”。
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

fn _orb_signature_256(gray: &Mat) -> Result<[u8; 32], String> {
    let descriptors = _detect_orb_descriptors(gray)?;

    if descriptors.empty() {
        return Ok([0u8; 32]);
    }

    if descriptors.cols() != 32 {
        return Err(format!(
            "ORB 描述子长度异常，期望 32 字节，实际 {}",
            descriptors.cols()
        ));
    }

    let rows = descriptors.rows();
    if rows <= 0 {
        return Ok([0u8; 32]);
    }

    let mut bit_votes = [0i32; 256];
    for row in 0..rows {
        for col in 0..32 {
            let byte = *descriptors
                .at_2d::<u8>(row, col)
                .map_err(|e| format!("读取 ORB 描述子失败[{row},{col}]: {e}"))?;
            for bit in 0..8 {
                if ((byte >> bit) & 1) == 1 {
                    bit_votes[col as usize * 8 + bit as usize] += 1;
                }
            }
        }
    }

    let mut signature = [0u8; 32];
    for bit_index in 0..256usize {
        if bit_votes[bit_index] > rows / 2 {
            signature[bit_index / 8] |= 1u8 << (bit_index % 8);
        }
    }
    Ok(signature)
}

/// 计算图像 ORB 特征哈希（固定 64 位十六进制字符串）。
pub fn orb_feature_hash_impl(mat: &Mat) -> Result<String, String> {
    if mat.rows() <= 0 || mat.cols() <= 0 {
        return Err("源图像尺寸无效".to_string());
    }

    let gray = _to_gray_mat(mat)?;
    let signature = _orb_signature_256(&gray)?;
    let mut hash = String::with_capacity(64);
    for byte in signature {
        hash.push_str(&format!("{byte:02x}"));
    }
    Ok(hash)
}

/// 比较 ORB 哈希与模板数组，返回最佳匹配索引或 -1。
pub fn match_orb_hash_impl(
    source_hash: &str,
    template_hashes: &[String],
    max_distance: u32,
) -> Result<i32, String> {
    let source_hash = normalize_hash_hex(source_hash)?;
    if source_hash.len() != 64 {
        return Err(format!(
            "ORB 哈希长度必须为 64 个十六进制字符，实际 {}",
            source_hash.len()
        ));
    }

    let mut best_index: i32 = -1;
    let mut best_distance = u32::MAX;
    for (index, template_hash) in template_hashes.iter().enumerate() {
        let normalized = normalize_hash_hex(template_hash)?;
        if normalized.len() != source_hash.len() {
            continue;
        }
        let distance = hamming_distance_hex(&source_hash, &normalized)?;
        if distance <= max_distance && distance < best_distance {
            best_distance = distance;
            best_index = index as i32;
            if distance == 0 {
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

    let mut orb = features2d::ORB::create_def().map_err(|e| format!("创建 ORB 检测器失败: {e}"))?;

    let mut keypoints1 = core::Vector::<core::KeyPoint>::new();
    let mut descriptors1 = Mat::default();
    orb.detect_and_compute(
        &gray1,
        &Mat::default(),
        &mut keypoints1,
        &mut descriptors1,
        false,
    )
    .map_err(|e| format!("计算 img1 ORB 特征失败: {e}"))?;

    let mut keypoints2 = core::Vector::<core::KeyPoint>::new();
    let mut descriptors2 = Mat::default();
    orb.detect_and_compute(
        &gray2,
        &Mat::default(),
        &mut keypoints2,
        &mut descriptors2,
        false,
    )
    .map_err(|e| format!("计算 img2 ORB 特征失败: {e}"))?;

    if descriptors1.empty() || descriptors2.empty() {
        return Ok(0);
    }

    let matcher = features2d::BFMatcher::create(core::NORM_HAMMING, false)
        .map_err(|e| format!("创建 ORB 匹配器失败: {e}"))?;
    let mut knn_matches = core::Vector::<core::Vector<core::DMatch>>::new();
    matcher
        .knn_train_match_def(&descriptors1, &descriptors2, &mut knn_matches, 2)
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

        // 使用 Lowe Ratio Test 过滤出质量更高的匹配。
        if first.distance < second.distance * 0.75 {
            good_count += 1;
        }
    }

    Ok(good_count)
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
