use opencv::{
    calib3d::StereoSGBM,
    core::{self, Mat, Point},
    imgproc,
    prelude::*,
};
use std::cmp::Ordering;
use std::collections::{BinaryHeap, HashMap, HashSet};

/// 深度估计结果
#[derive(Debug, Clone)]
pub struct DepthMap {
    /// 视差图（0-255，值越大表示越近）
    pub disparity_mat: Mat,
    /// 障碍物掩码（0表示无障碍，255表示有障碍）
    pub obstacle_mask: Mat,
}

/// 路径点
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct PathPoint {
    pub x: i32,
    pub y: i32,
}

impl PathPoint {
    fn new(x: i32, y: i32) -> Self {
        Self { x, y }
    }

    /// 计算到另一个点的欧几里得距离
    fn euclidean_distance(&self, other: &Self) -> f64 {
        let dx = (self.x - other.x) as f64;
        let dy = (self.y - other.y) as f64;
        (dx * dx + dy * dy).sqrt()
    }
}

/// A* 算法节点
#[derive(Debug, Clone)]
struct AStarNode {
    point: PathPoint,
    g_cost: f64,
    h_cost: f64,
    parent: Option<PathPoint>,
}

impl PartialEq for AStarNode {
    fn eq(&self, other: &Self) -> bool {
        self.point == other.point
    }
}

impl Eq for AStarNode {}

impl Ord for AStarNode {
    fn cmp(&self, other: &Self) -> Ordering {
        let f_self = self.g_cost + self.h_cost;
        let f_other = other.g_cost + other.h_cost;
        f_other.partial_cmp(&f_self).unwrap_or(Ordering::Equal)
    }
}

impl PartialOrd for AStarNode {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
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
pub fn estimate_depth_stereo(
    left_image: &Mat,
    right_image: &Mat,
    num_disp: i32,
    block_size: i32,
) -> Result<DepthMap, String> {
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
        .set_num_disparities(num_disp)
        .map_err(|e| format!("设置视差范围失败: {}", e))?;
    stereo
        .set_block_size(block_size)
        .map_err(|e| format!("设置块大小失败: {}", e))?;

    // 计算视差图
    let mut disparity = Mat::default();
    stereo
        .compute(&left_gray, &right_gray, &mut disparity)
        .map_err(|e| format!("计算视差图失败: {}", e))?;

    // StereoSGBM 输出的是 16 位固定点数（有 4 位小数）
    // 归一化到 0-255 范围用于显示
    let mut normalized_disparity = Mat::default();
    core::normalize_def(&disparity, &mut normalized_disparity)
        .map_err(|e| format!("归一化视差图失败: {}", e))?;

    // 使用阈值生成障碍物掩码
    // 视差值大的区域（近处）可能需要绕行
    let mut obstacle_mask = Mat::default();
    imgproc::threshold(
        &normalized_disparity,
        &mut obstacle_mask,
        30.0,
        255.0,
        imgproc::THRESH_BINARY,
    )
    .map_err(|e| format!("二值化失败: {}", e))?;

    // 形态学操作，去除噪声
    let kernel = imgproc::get_structuring_element(
        imgproc::MORPH_RECT,
        core::Size::new(3, 3),
        Point::new(-1, -1),
    )
    .map_err(|e| format!("创建形态学核失败: {}", e))?;

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

    Ok(DepthMap {
        disparity_mat: normalized_disparity,
        obstacle_mask: cleaned_mask,
    })
}

/// 检查指定位置是否为障碍物
///
/// # 参数
/// * `depth_map` - 深度图
/// * `x` - X坐标
/// * `y` - Y坐标
///
/// # 返回值
/// * `bool` - true表示是障碍物
pub fn is_obstacle(depth_map: &DepthMap, x: i32, y: i32) -> bool {
    if x < 0 || y < 0 {
        return true;
    }

    let cols = depth_map.obstacle_mask.cols();
    let rows = depth_map.obstacle_mask.rows();

    if x >= cols || y >= rows {
        return true;
    }

    match depth_map.obstacle_mask.at_2d::<u8>(y, x) {
        Ok(pixel) => *pixel > 0,
        Err(_) => true,
    }
}

/// A* 寻路算法
///
/// # 参数
/// * `depth_map` - 深度图
/// * `start` - 起点坐标
/// * `end` - 终点坐标
/// * `allow_diagonal` - 是否允许对角线移动
///
/// # 返回值
/// * `Vec<PathPoint>` - 路径点列表（从起点到终点）
pub fn find_path_astar(
    depth_map: &DepthMap,
    start: PathPoint,
    end: PathPoint,
    allow_diagonal: bool,
) -> Vec<PathPoint> {
    if is_obstacle(depth_map, start.x, start.y) || is_obstacle(depth_map, end.x, end.y) {
        return Vec::new();
    }

    let directions = if allow_diagonal {
        vec![
            (-1, -1),
            (0, -1),
            (1, -1),
            (-1, 0),
            (1, 0),
            (-1, 1),
            (0, 1),
            (1, 1),
        ]
    } else {
        vec![(0, -1), (-1, 0), (1, 0), (0, 1)]
    };

    let mut open_list: BinaryHeap<AStarNode> = BinaryHeap::new();
    let mut closed_list: HashSet<PathPoint> = HashSet::new();
    let mut g_costs: HashMap<PathPoint, f64> = HashMap::new();
    let mut parents: HashMap<PathPoint, PathPoint> = HashMap::new();

    let start_g_cost = 0.0;
    let start_h_cost = start.euclidean_distance(&end);
    g_costs.insert(start, start_g_cost);

    open_list.push(AStarNode {
        point: start,
        g_cost: start_g_cost,
        h_cost: start_h_cost,
        parent: None,
    });

    while let Some(current) = open_list.pop() {
        if current.point == end {
            return reconstruct_path(&parents, end);
        }

        closed_list.insert(current.point);

        for (dx, dy) in &directions {
            let neighbor = PathPoint::new(current.point.x + dx, current.point.y + dy);

            if closed_list.contains(&neighbor) || is_obstacle(depth_map, neighbor.x, neighbor.y) {
                continue;
            }

            let new_g_cost = current.g_cost + if allow_diagonal { 1.414 } else { 1.0 };

            if !g_costs.contains_key(&neighbor)
                || new_g_cost < *g_costs.get(&neighbor).unwrap_or(&f64::MAX)
            {
                g_costs.insert(neighbor, new_g_cost);
                parents.insert(neighbor, current.point);

                let h_cost = neighbor.euclidean_distance(&end);
                open_list.push(AStarNode {
                    point: neighbor,
                    g_cost: new_g_cost,
                    h_cost,
                    parent: Some(current.point),
                });
            }
        }
    }

    Vec::new()
}

/// 从父节点记录重建路径
fn reconstruct_path(parents: &HashMap<PathPoint, PathPoint>, end: PathPoint) -> Vec<PathPoint> {
    let mut path = Vec::new();
    let mut current = end;

    while let Some(&parent) = parents.get(&current) {
        path.push(current);
        current = parent;
    }

    path.push(current);
    path.reverse();
    path
}

/// 智能寻路函数（带绕行策略）
///
/// # 参数
/// * `left_image` - 左图（第一次截图）
/// * `right_image` - 右图（移动后的第二次截图）
/// * `start_x` - 起点X坐标
/// * `start_y` - 起点Y坐标
/// * `end_x` - 终点X坐标
/// * `end_y` - 终点Y坐标
/// * `num_disp` - 视差搜索范围（必须是16的倍数，如160）
/// * `block_size` - 匹配块大小（3-7）
/// * `strategy` - 绕行策略（"left"|"right"|"auto"）
///
/// # 返回值
/// * `Vec<[i32; 2]>` - 路径点列表 [[x, y], ...]
pub fn find_path(
    left_image: &Mat,
    right_image: &Mat,
    start_x: i32,
    start_y: i32,
    end_x: i32,
    end_y: i32,
    num_disp: i32,
    block_size: i32,
    strategy: &str,
) -> Vec<[i32; 2]> {
    let depth_map = match estimate_depth_stereo(left_image, right_image, num_disp, block_size) {
        Ok(dm) => dm,
        Err(e) => {
            eprintln!("深度估计失败: {}", e);
            return Vec::new();
        }
    };

    let start = PathPoint::new(start_x, start_y);
    let end = PathPoint::new(end_x, end_y);

    match strategy {
        "left" => find_path_with_priority(&depth_map, start, end, true),
        "right" => find_path_with_priority(&depth_map, start, end, true),
        "auto" | _ => find_path_astar(&depth_map, start, end, true)
            .into_iter()
            .map(|p| [p.x, p.y])
            .collect(),
    }
}

/// 带优先级的寻路（用于绕行策略）
fn find_path_with_priority(
    depth_map: &DepthMap,
    start: PathPoint,
    end: PathPoint,
    allow_diagonal: bool,
) -> Vec<[i32; 2]> {
    let mut path = find_path_astar(depth_map, start, end, allow_diagonal);

    if path.is_empty() {
        path = find_path_astar(depth_map, start, end, false);
    }

    path.into_iter().map(|p| [p.x, p.y]).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_path_point_creation() {
        let point = PathPoint::new(10, 20);
        assert_eq!(point.x, 10);
        assert_eq!(point.y, 20);
    }

    #[test]
    fn test_euclidean_distance() {
        let p1 = PathPoint::new(0, 0);
        let p2 = PathPoint::new(3, 4);
        let dist = p1.euclidean_distance(&p2);
        assert!((dist - 5.0).abs() < 0.001);
    }
}
