use opencv::{
    calib3d::{StereoSGBM, StereoSGBM_MODE_SGBM_3WAY},
    core::{self, Mat, Point},
    imgproc,
    prelude::*,
};
use std::cmp::Ordering;

/// 深度估计结果
#[derive(Debug, Clone)]
#[allow(unused)]
pub struct DepthMap {
    /// 视差图（0-255，值越大表示越近）
    pub disparity_mat: Mat,
    /// 障碍物掩码（0表示无障碍，255表示有障碍）
    pub obstacle_mask: Mat,
}

/// 基于双图进行立体匹配深度估计（使用 StereoSGBM）
///
/// # 参数
/// * `left_image` - 左图（第一次截图）
/// * `right_image` - 右图（移动后的第二次截图）
/// * `num_disp` - 视差搜索范围（必须是16的倍数，如160）
/// * `block_size` - 匹配块大小（3-7）
///
/// # 返回值
/// * `Result<DepthMap, String>` - 包含视差图和障碍物掩码
pub fn predict_depth(
    left_image: &Mat,
    right_image: &Mat,
    num_disp: i32,
    block_size: i32,
) -> Result<DepthMap, String> {
    let normalized_num_disp = ((num_disp.max(16) + 15) / 16) * 16;
    let normalized_block_size = block_size.clamp(3, 11) | 1;

    // 检查图像尺寸
    let size1 = left_image
        .size()
        .map_err(|e| format!("获取左图尺寸失败: {}", e))?;
    let size2 = right_image
        .size()
        .map_err(|e| format!("获取右图尺寸失败: {}", e))?;

    if size1 != size2 {
        return Err("两张图像尺寸不一致".to_string());
    }
    let full_rows = size1.height;
    let full_cols = size1.width;
    let active_rows = (full_rows / 2).max(1);

    // 转换为灰度图
    let mut left_gray = Mat::default();
    let mut right_gray = Mat::default();
    imgproc::cvt_color(left_image, &mut left_gray, imgproc::COLOR_BGR2GRAY, 0)
        .map_err(|e| format!("转换左图为灰度失败: {}", e))?;
    imgproc::cvt_color(right_image, &mut right_gray, imgproc::COLOR_BGR2GRAY, 0)
        .map_err(|e| format!("转换右图为灰度失败: {}", e))?;

    // 创建 StereoSGBM 匹配器
    let mut stereo =
        StereoSGBM::create_def().map_err(|e| format!("创建 StereoSGBM 失败: {}", e))?;

    // 设置参数
    stereo
        .set_min_disparity(0)
        .map_err(|e| format!("设置最小视差失败: {}", e))?;
    stereo
        .set_num_disparities(normalized_num_disp)
        .map_err(|e| format!("设置视差范围失败: {}", e))?;
    stereo
        .set_block_size(normalized_block_size)
        .map_err(|e| format!("设置块大小失败: {}", e))?;
    let p1 = 8 * normalized_block_size * normalized_block_size;
    let p2 = 32 * normalized_block_size * normalized_block_size;
    stereo
        .set_p1(p1 * 3)
        .map_err(|e| format!("设置 P1 失败: {}", e))?;
    stereo
        .set_p2(p2 * 3)
        .map_err(|e| format!("设置 P2 失败: {}", e))?;
    stereo
        .set_disp12_max_diff(1)
        .map_err(|e| format!("设置左右一致性检查失败: {}", e))?;
    stereo
        .set_pre_filter_cap(31)
        .map_err(|e| format!("设置预滤波上限失败: {}", e))?;
    stereo
        .set_uniqueness_ratio(15)
        .map_err(|e| format!("设置唯一性约束失败: {}", e))?;
    stereo
        .set_speckle_window_size(120)
        .map_err(|e| format!("设置 speckle 窗口失败: {}", e))?;
    stereo
        .set_speckle_range(32)
        .map_err(|e| format!("设置 speckle 范围失败: {}", e))?;
    stereo
        .set_mode(StereoSGBM_MODE_SGBM_3WAY)
        .map_err(|e| format!("设置 StereoSGBM 模式失败: {}", e))?;

    // 仅在上半区执行 StereoSGBM，降低计算耗时。
    let stereo_roi = core::Rect::new(0, 0, full_cols, active_rows);
    let left_gray_roi = left_gray
        .roi(stereo_roi)
        .map_err(|e| format!("提取左图 ROI 失败: {}", e))?;
    let right_gray_roi = right_gray
        .roi(stereo_roi)
        .map_err(|e| format!("提取右图 ROI 失败: {}", e))?;

    // 计算上半区视差图
    let mut disparity = Mat::default();
    stereo
        .compute(&left_gray_roi, &right_gray_roi, &mut disparity)
        .map_err(|e| format!("计算视差图失败: {}", e))?;

    // StereoSGBM 输出的是 16 位固定点数（有 4 位小数），先转换为浮点视差值
    let mut disparity_f32 = Mat::default();
    disparity
        .convert_to(&mut disparity_f32, core::CV_32F, 1.0 / 16.0, 0.0)
        .map_err(|e| format!("视差图转换为浮点失败: {}", e))?;

    // 有效视差掩码：仅保留 > 0 的像素，后续归一化与后处理都基于此掩码
    let mut valid_mask_f32 = Mat::default();
    imgproc::threshold(
        &disparity_f32,
        &mut valid_mask_f32,
        0.0,
        255.0,
        imgproc::THRESH_BINARY,
    )
    .map_err(|e| format!("生成有效视差掩码失败: {}", e))?;
    let mut valid_mask = Mat::default();
    valid_mask_f32
        .convert_to(&mut valid_mask, core::CV_8U, 1.0, 0.0)
        .map_err(|e| format!("有效视差掩码转换失败: {}", e))?;

    // 按有效区域做 min-max 归一化，避免无效区域干扰动态范围
    let mut normalized_disparity_u8_raw = Mat::default();
    core::normalize(
        &disparity_f32,
        &mut normalized_disparity_u8_raw,
        0.0,
        255.0,
        core::NORM_MINMAX,
        core::CV_8U,
        &valid_mask,
    )
    .map_err(|e| format!("归一化视差图失败: {}", e))?;

    // 对归一化深度做去噪，抑制椒盐噪点
    let mut median_disparity = Mat::default();
    imgproc::median_blur(&normalized_disparity_u8_raw, &mut median_disparity, 5)
        .map_err(|e| format!("中值滤波失败: {}", e))?;

    let kernel = imgproc::get_structuring_element(
        imgproc::MORPH_RECT,
        core::Size::new(3, 3),
        Point::new(-1, -1),
    )
    .map_err(|e| format!("创建形态学核失败: {}", e))?;

    let mut opened_disparity = Mat::default();
    imgproc::morphology_ex(
        &median_disparity,
        &mut opened_disparity,
        imgproc::MORPH_OPEN,
        &kernel,
        Point::new(-1, -1),
        1,
        core::BORDER_CONSTANT,
        core::Scalar::all(0.0),
    )
    .map_err(|e| format!("深度图开运算失败: {}", e))?;

    let mut closed_disparity = Mat::default();
    imgproc::morphology_ex(
        &opened_disparity,
        &mut closed_disparity,
        imgproc::MORPH_CLOSE,
        &kernel,
        Point::new(-1, -1),
        1,
        core::BORDER_CONSTANT,
        core::Scalar::all(0.0),
    )
    .map_err(|e| format!("深度图闭运算失败: {}", e))?;

    // 强制无效区域为 0，避免后处理引入伪深度
    let mut normalized_disparity_u8 = Mat::default();
    core::bitwise_and_def(&closed_disparity, &valid_mask, &mut normalized_disparity_u8)
        .map_err(|e| format!("应用有效掩码失败: {}", e))?;

    // 额外剔除“高亮小连通域”噪声（常见于纹理重复或匹配失败导致的白色闪点）。
    let mut bright_noise_mask = Mat::default();
    imgproc::threshold(
        &normalized_disparity_u8,
        &mut bright_noise_mask,
        220.0,
        255.0,
        imgproc::THRESH_BINARY,
    )
    .map_err(|e| format!("生成亮点噪声掩码失败: {}", e))?;

    let mut bright_labels = Mat::default();
    let mut bright_stats = Mat::default();
    let mut bright_centroids = Mat::default();
    let bright_label_count = imgproc::connected_components_with_stats(
        &bright_noise_mask,
        &mut bright_labels,
        &mut bright_stats,
        &mut bright_centroids,
        8,
        core::CV_32S,
    )
    .map_err(|e| format!("亮点连通域分析失败: {}", e))?;

    if bright_label_count > 1 {
        let bright_labels_contiguous = if bright_labels.is_continuous() {
            bright_labels
        } else {
            let mut copied = Mat::default();
            bright_labels
                .copy_to(&mut copied)
                .map_err(|e| format!("复制亮点标签图为连续内存失败: {}", e))?;
            copied
        };

        let bright_labels_data = bright_labels_contiguous
            .data_typed::<i32>()
            .map_err(|e| format!("读取亮点标签图数据失败: {}", e))?;
        let mut remove_label = vec![false; bright_label_count as usize];
        for label in 1..bright_label_count {
            let area = *bright_stats
                .at_2d::<i32>(label, imgproc::CC_STAT_AREA)
                .map_err(|e| format!("读取亮点连通域面积失败: {}", e))?;
            if area > 0 && area <= 28 {
                remove_label[label as usize] = true;
            }
        }

        let mut despeckled_disparity = Mat::default();
        normalized_disparity_u8
            .copy_to(&mut despeckled_disparity)
            .map_err(|e| format!("复制深度图失败: {}", e))?;
        let despeckled_data = despeckled_disparity
            .data_typed_mut::<u8>()
            .map_err(|e| format!("读取深度图可变数据失败: {}", e))?;

        for (index, label) in bright_labels_data.iter().enumerate() {
            if *label > 0
                && (*label as usize) < remove_label.len()
                && remove_label[*label as usize]
            {
                despeckled_data[index] = 0;
            }
        }

        normalized_disparity_u8 = despeckled_disparity;
    }

    // 使用阈值生成障碍物掩码
    // 视差值大的区域（近处）可能需要绕行
    let mut obstacle_mask = Mat::default();
    imgproc::threshold(
        &normalized_disparity_u8,
        &mut obstacle_mask,
        40.0,
        255.0,
        imgproc::THRESH_BINARY,
    )
    .map_err(|e| format!("二值化失败: {}", e))?;

    let mut cleaned_mask = Mat::default();
    imgproc::morphology_ex(
        &obstacle_mask,
        &mut cleaned_mask,
        imgproc::MORPH_CLOSE,
        &kernel,
        Point::new(-1, -1),
        1,
        core::BORDER_CONSTANT,
        core::Scalar::all(0.0),
    )
    .map_err(|e| format!("形态学操作失败: {}", e))?;

    // 回填为全尺寸 Mat：下半区无权重，直接置零。
    let mut full_disparity = Mat::zeros(full_rows, full_cols, core::CV_8UC1)
        .map_err(|e| format!("创建全尺寸深度图失败: {}", e))?
        .to_mat()
        .map_err(|e| format!("初始化全尺寸深度图失败: {}", e))?;
    {
        let mut top_roi = Mat::roi_mut(&mut full_disparity, stereo_roi)
            .map_err(|e| format!("获取深度图上半区 ROI 失败: {}", e))?;
        normalized_disparity_u8
            .copy_to(&mut top_roi)
            .map_err(|e| format!("回填深度图上半区失败: {}", e))?;
    }

    let mut full_obstacle_mask = Mat::zeros(full_rows, full_cols, core::CV_8UC1)
        .map_err(|e| format!("创建全尺寸障碍掩码失败: {}", e))?
        .to_mat()
        .map_err(|e| format!("初始化全尺寸障碍掩码失败: {}", e))?;
    {
        let mut top_roi = Mat::roi_mut(&mut full_obstacle_mask, stereo_roi)
            .map_err(|e| format!("获取障碍掩码上半区 ROI 失败: {}", e))?;
        cleaned_mask
            .copy_to(&mut top_roi)
            .map_err(|e| format!("回填障碍掩码上半区失败: {}", e))?;
    }

    Ok(DepthMap {
        disparity_mat: full_disparity,
        obstacle_mask: full_obstacle_mask,
    })
}

#[derive(Debug, Clone, Copy)]
struct DirectionCandidate {
    center_x: i32,
    center_y: i32,
    area: i32,
    score: f64,
}

/// 从深度图中提取可能的路径方向坐标。
///
/// 规则：
/// 1. 过滤深度值为 `0` 的无效区域（通常是角色、UI、遮挡导致不可计算区域）
/// 2. 对有效区域做连通域聚合
/// 3. 仅保留面积大于等于 `min_region_area` 的连通块
/// 4. 按“更深区域优先 + 面积更大优先”排序，返回中心坐标
///
/// # 参数
/// * `depth_map` - 由双图推算得到的深度图结果
/// * `min_region_area` - 连通区域最小面积（像素）
/// * `max_candidates` - 最多返回的方向候选数量
///
/// # 返回值
/// * `Result<Vec<[i32; 2]>, String>` - 候选方向中心点列表 `[[x, y], ...]`
pub fn find_path_direction_coords(
    depth_map: &DepthMap,
    min_region_area: i32,
    max_candidates: usize,
) -> Result<Vec<[i32; 2]>, String> {
    if max_candidates == 0 {
        return Ok(Vec::new());
    }

    let rows = depth_map.disparity_mat.rows();
    let cols = depth_map.disparity_mat.cols();
    if rows <= 0 || cols <= 0 {
        return Ok(Vec::new());
    }

    let min_region_area = min_region_area.max(200);
    let mut candidates: Vec<DirectionCandidate> = Vec::new();

    // 将深度图转换为可直接切片读取的连续内存，避免频繁 at_2d 访问。
    let disparity_contiguous = if depth_map.disparity_mat.is_continuous() {
        depth_map.disparity_mat.clone()
    } else {
        let mut copied = Mat::default();
        depth_map
            .disparity_mat
            .copy_to(&mut copied)
            .map_err(|e| format!("复制深度图为连续内存失败: {}", e))?;
        copied
    };

    let obstacle_contiguous = if depth_map.obstacle_mask.is_continuous() {
        depth_map.obstacle_mask.clone()
    } else {
        let mut copied = Mat::default();
        depth_map
            .obstacle_mask
            .copy_to(&mut copied)
            .map_err(|e| format!("复制障碍掩码为连续内存失败: {}", e))?;
        copied
    };

    let disparity_data = disparity_contiguous
        .data_typed::<u8>()
        .map_err(|e| format!("读取深度图数据失败: {}", e))?;
    let obstacle_data = obstacle_contiguous
        .data_typed::<u8>()
        .map_err(|e| format!("读取障碍掩码数据失败: {}", e))?;
    if disparity_data.len() != obstacle_data.len() {
        return Err("深度图与障碍掩码尺寸不一致".to_string());
    }

    // 先根据有效深度直方图做“远处阈值”估计，避免固定阈值在不同场景下漂移。
    let mut histogram = [0_u32; 256];
    let mut valid_count = 0_u32;
    for &value in disparity_data {
        if value > 0 {
            histogram[value as usize] += 1;
            valid_count += 1;
        }
    }
    if valid_count == 0 {
        return Ok(Vec::new());
    }

    let target_rank = ((valid_count as f64) * 0.30).round() as u32;
    let mut acc = 0_u32;
    let mut far_threshold = 84_u8;
    for value in 1_u16..=255_u16 {
        acc += histogram[value as usize];
        if acc >= target_rank {
            far_threshold = (value as u8).clamp(16, 132);
            break;
        }
    }

    // 构建导航候选掩码：有效深度 + 远处区域 + 去掉障碍/边缘/UI/角色区。
    let mut route_mask = Mat::zeros(rows, cols, core::CV_8UC1)
        .map_err(|e| format!("创建候选掩码失败: {}", e))?
        .to_mat()
        .map_err(|e| format!("初始化候选掩码失败: {}", e))?;
    {
        let route_mask_data = route_mask
            .data_typed_mut::<u8>()
            .map_err(|e| format!("访问候选掩码数据失败: {}", e))?;

        let margin_x = cols * 4 / 100;
        let roi_top = rows * 10 / 100;
        let roi_bottom = rows * 78 / 100;
        let player_half_w = cols * 10 / 100;
        let player_top = rows * 50 / 100;
        let player_bottom = rows * 94 / 100;
        let center_x = cols / 2;

        for y in 0..rows {
            for x in 0..cols {
                let index = (y * cols + x) as usize;
                let disparity = disparity_data[index];
                let obstacle = obstacle_data[index];
                if disparity == 0 || disparity > far_threshold || obstacle > 0 {
                    continue;
                }
                if x < margin_x || x >= cols - margin_x {
                    continue;
                }
                if y < roi_top || y >= roi_bottom {
                    continue;
                }

                // 屏幕下方中间区域通常是角色本体，直接排除。
                if y >= player_top
                    && y < player_bottom
                    && x >= center_x - player_half_w
                    && x <= center_x + player_half_w
                {
                    continue;
                }

                route_mask_data[index] = 255;
            }
        }
    }

    // 形态学去噪和连通，减少碎片化导致的误判点。
    let route_kernel = imgproc::get_structuring_element(
        imgproc::MORPH_RECT,
        core::Size::new(5, 5),
        Point::new(-1, -1),
    )
    .map_err(|e| format!("创建候选掩码形态学核失败: {}", e))?;
    let mut route_mask_closed = Mat::default();
    imgproc::morphology_ex(
        &route_mask,
        &mut route_mask_closed,
        imgproc::MORPH_CLOSE,
        &route_kernel,
        Point::new(-1, -1),
        1,
        core::BORDER_CONSTANT,
        core::Scalar::all(0.0),
    )
    .map_err(|e| format!("候选掩码闭运算失败: {}", e))?;
    let mut route_mask_opened = Mat::default();
    imgproc::morphology_ex(
        &route_mask_closed,
        &mut route_mask_opened,
        imgproc::MORPH_OPEN,
        &route_kernel,
        Point::new(-1, -1),
        1,
        core::BORDER_CONSTANT,
        core::Scalar::all(0.0),
    )
    .map_err(|e| format!("候选掩码开运算失败: {}", e))?;

    let mut labels = Mat::default();
    let mut stats = Mat::default();
    let mut centroids = Mat::default();
    let label_count = imgproc::connected_components_with_stats(
        &route_mask_opened,
        &mut labels,
        &mut stats,
        &mut centroids,
        8,
        core::CV_32S,
    )
    .map_err(|e| format!("连通域分析失败: {}", e))?;

    if label_count <= 1 {
        return Ok(Vec::new());
    }

    let labels_contiguous = if labels.is_continuous() {
        labels
    } else {
        let mut copied = Mat::default();
        labels
            .copy_to(&mut copied)
            .map_err(|e| format!("复制标签图为连续内存失败: {}", e))?;
        copied
    };

    // 线性扫描标签图与深度图：
    // 1) 纵向权重 w(y): 顶部为 1，至中线递减到 0，中线以下恒为 0；
    // 2) 以 x 为轴对纵向做积分，得到 column_integral[x]；
    // 3) 同时累计每个连通域的加权中心与加权得分。
    let labels_data = labels_contiguous
        .data_typed::<i32>()
        .map_err(|e| format!("读取标签图数据失败: {}", e))?;
    if labels_data.len() != disparity_data.len() {
        return Err("标签图与深度图尺寸不一致".to_string());
    }

    let mut column_integral = vec![0.0_f64; cols as usize];
    let mut label_weight_sum = vec![0.0_f64; label_count as usize];
    let mut label_x_weight_sum = vec![0.0_f64; label_count as usize];
    let mut label_y_weight_sum = vec![0.0_f64; label_count as usize];
    let mut label_far_sum = vec![0.0_f64; label_count as usize];

    let half_rows = (rows as f64 * 0.5).max(1.0);
    for (index, (label, disparity)) in labels_data.iter().zip(disparity_data.iter()).enumerate() {
        if *label <= 0 {
            continue;
        }

        let label_index = *label as usize;
        if label_index >= label_weight_sum.len() {
            continue;
        }

        let x = (index as i32) % cols;
        let y = (index as i32) / cols;
        let y_weight = ((half_rows - y as f64) / half_rows).clamp(0.0, 1.0);
        if y_weight <= 0.0 {
            continue;
        }

        let far_depth = f64::from(255_u16.saturating_sub(u16::from(*disparity))) / 255.0;
        let weighted = far_depth * y_weight;

        column_integral[x as usize] += weighted;
        label_weight_sum[label_index] += weighted;
        label_x_weight_sum[label_index] += weighted * x as f64;
        label_y_weight_sum[label_index] += weighted * y as f64;
        label_far_sum[label_index] += far_depth;
    }

    // 对列积分做平滑，降低随机纹理导致的高频抖动。
    let mut column_integral_smooth = vec![0.0_f64; cols as usize];
    let smooth_radius = 6_i32;
    for x in 0..cols {
        let left = (x - smooth_radius).max(0);
        let right = (x + smooth_radius).min(cols - 1);
        let mut sum = 0.0_f64;
        let mut count = 0_i32;
        for xi in left..=right {
            sum += column_integral[xi as usize];
            count += 1;
        }
        if count > 0 {
            column_integral_smooth[x as usize] = sum / count as f64;
        }
    }

    // 根据连通域面积和“列积分强度”筛选候选点。
    for label in 1..label_count {
        let label_index = label as usize;
        let area = *stats
            .at_2d::<i32>(label, imgproc::CC_STAT_AREA)
            .map_err(|e| format!("读取连通域面积失败: {}", e))?;
        if area < min_region_area || area <= 0 {
            continue;
        }

        let center_x = if label_weight_sum[label_index] > 1e-6 {
            (label_x_weight_sum[label_index] / label_weight_sum[label_index]).round() as i32
        } else {
            (*centroids
                .at_2d::<f64>(label, 0)
                .map_err(|e| format!("读取连通域中心X失败: {}", e))?)
            .round() as i32
        };
        let center_y = if label_weight_sum[label_index] > 1e-6 {
            (label_y_weight_sum[label_index] / label_weight_sum[label_index]).round() as i32
        } else {
            (*centroids
                .at_2d::<f64>(label, 1)
                .map_err(|e| format!("读取连通域中心Y失败: {}", e))?)
            .round() as i32
        };

        let left = *stats
            .at_2d::<i32>(label, imgproc::CC_STAT_LEFT)
            .map_err(|e| format!("读取连通域左边界失败: {}", e))?;
        let width = (*stats
            .at_2d::<i32>(label, imgproc::CC_STAT_WIDTH)
            .map_err(|e| format!("读取连通域宽度失败: {}", e))?)
        .max(1);
        let height = (*stats
            .at_2d::<i32>(label, imgproc::CC_STAT_HEIGHT)
            .map_err(|e| format!("读取连通域高度失败: {}", e))?)
        .max(1);

        let right = (left + width - 1).min(cols - 1);
        let mut column_score_sum = 0.0_f64;
        let mut column_count = 0_i32;
        for x in left.max(0)..=right.max(0) {
            column_score_sum += column_integral_smooth[x as usize];
            column_count += 1;
        }
        let column_score = if column_count > 0 {
            column_score_sum / column_count as f64
        } else {
            0.0
        };

        let top_weight = ((half_rows - center_y as f64) / half_rows).clamp(0.0, 1.0);
        let far_score = label_far_sum[label_index] / f64::from(area);
        let area_bonus = (f64::from(area).ln_1p()) * 1.4;
        let corridor_bonus = (f64::from(width) / f64::from(height)).clamp(0.0, 2.5) * 1.8;
        let score = column_score * 180.0 + top_weight * 24.0 + far_score * 16.0 + area_bonus + corridor_bonus;

        candidates.push(DirectionCandidate {
            center_x,
            center_y,
            area,
            score,
        });
    }

    candidates.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(Ordering::Equal)
            .then_with(|| b.area.cmp(&a.area))
    });

    // 做最小距离去重，避免多个点挤在同一小块区域。
    let min_point_distance = (cols as f64 * 0.14).max(24.0);
    let min_distance_sq = min_point_distance * min_point_distance;
    let mut selected: Vec<[i32; 2]> = Vec::new();
    for candidate in candidates {
        let mut too_close = false;
        for point in &selected {
            let dx = f64::from(point[0] - candidate.center_x);
            let dy = f64::from(point[1] - candidate.center_y);
            if dx * dx + dy * dy < min_distance_sq {
                too_close = true;
                break;
            }
        }
        if too_close {
            continue;
        }

        selected.push([candidate.center_x, candidate.center_y]);
        if selected.len() >= max_candidates {
            break;
        }
    }

    Ok(selected)
}
