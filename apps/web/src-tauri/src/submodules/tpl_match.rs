use opencv::{
    core::{self, CV_32F, Mat, Point},
    imgproc,
    prelude::*,
};

use thiserror::Error;

#[derive(Error, Debug)]
pub enum MatchError {
    #[error("图像处理错误: {0}")]
    ImageProcessing(String),

    #[error("OpenCV 错误: {0}")]
    OpenCV(String),
}

/// 模板匹配函数（自动检测是否带透明度）
///
/// # 参数
/// * `img_bgr` - 源图像（BGR格式）
/// * `template` - 模板图像（BGR或BGRA格式）
/// * `tolerance` - 匹配阈值
///
/// # 返回值
/// * `Result<Option<(i32, i32)>>` - 匹配位置（x, y）或错误
pub(crate) fn match_template(
    img_bgr: &Mat,
    template: &Mat,
    tolerance: f64,
) -> Result<Option<(i32, i32)>, MatchError> {
    if img_bgr.rows() <= 0 || img_bgr.cols() <= 0 {
        return Err(MatchError::ImageProcessing("源图像尺寸无效".to_string()));
    }
    if template.rows() <= 0 || template.cols() <= 0 {
        return Err(MatchError::ImageProcessing("模板图像尺寸无效".to_string()));
    }

    // 确保模板尺寸小于源图像
    if img_bgr.rows() < template.rows() || img_bgr.cols() < template.cols() {
        return Err(MatchError::ImageProcessing(
            "模板尺寸大于源图像".to_string(),
        ));
    }

    // 检查模板通道数，确定是否需要掩码
    let use_mask = template.channels() == 4;

    // 创建掩码（如果模板是BGRA格式，提取alpha通道；否则使用默认mask）
    let mask = if use_mask {
        // 提取alpha通道作为权重
        let mut alpha = Mat::default();
        opencv::core::extract_channel(template, &mut alpha, template.channels() - 1)
            .map_err(|e| MatchError::OpenCV(format!("extract_channel: {e}")))?;
        alpha
    } else {
        Mat::default()
    };

    // 将模板转换为BGR格式（如果是BGRA）
    let template_bgr = if use_mask {
        let mut bgr = Mat::default();
        imgproc::cvt_color(template, &mut bgr, imgproc::COLOR_BGRA2BGR, 0)
            .map_err(|e| MatchError::OpenCV(format!("cvt_color: {e}")))?;
        bgr
    } else {
        template.clone()
    };

    // 创建结果矩阵
    let result_cols = img_bgr.cols() - template.cols() + 1;
    let result_rows = img_bgr.rows() - template.rows() + 1;
    let mut result = unsafe {
        Mat::new_rows_cols(result_rows, result_cols, CV_32F)
            .map_err(|e| MatchError::OpenCV(format!("Mat::new_rows_cols: {e}")))?
    };

    // 执行模板匹配（带或不带掩码）
    imgproc::match_template(
        img_bgr,
        &template_bgr,
        &mut result,
        imgproc::TM_CCOEFF_NORMED,
        &mask,
    )
    .map_err(|e| MatchError::OpenCV(format!("match_template: {e}")))?;

    // 找到最佳匹配位置
    let mut min_val = 0.0;
    let mut max_val = 0.0;
    let mut min_loc = Point::new(0, 0);
    let mut max_loc = Point::new(0, 0);
    core::min_max_loc(
        &result,
        Some(&mut min_val),
        Some(&mut max_val),
        Some(&mut min_loc),
        Some(&mut max_loc),
        &Mat::default(),
    )
    .map_err(|e| MatchError::OpenCV(format!("min_max_loc: {e}")))?;

    // 阈值判断：只返回置信度高于阈值的匹配
    if max_val > tolerance {
        Ok(Some((max_loc.x, max_loc.y)))
    } else {
        Ok(None)
    }
}
