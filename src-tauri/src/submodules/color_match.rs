use opencv::{
    core::{self, BORDER_CONSTANT, CV_8UC1, CV_32F, Mat, Point, Scalar, Size},
    imgproc,
    prelude::*,
};
use thiserror::Error;
#[derive(Error, Debug)]
pub enum ColorMatchError {
    #[error("图像处理错误: {0}")]
    ImageProcessing(String),

    #[error("OpenCV 错误: {0}")]
    OpenCV(String),
}

pub(crate) fn rgb_to_bgr(color: u32) -> (u8, u8, u8) {
    let r = ((color >> 16) & 0xFF) as u8;
    let g = ((color >> 8) & 0xFF) as u8;
    let b = (color & 0xFF) as u8;
    (b, g, r)
}

pub(crate) fn check_color_mat(img_bgr: &Mat, x: i32, y: i32, color: u32, tolerance: u8) -> bool {
    return img_bgr
        .at_2d::<core::Vec3b>(y, x)
        .map(|pixel| {
            let b = pixel[0];
            let g = pixel[1];
            let r = pixel[2];
            let (b_target, g_target, r_target) = rgb_to_bgr(color);
            let db = (b as i32 - b_target as i32).abs() as u8;
            let dg = (g as i32 - g_target as i32).abs() as u8;
            let dr = (r as i32 - r_target as i32).abs() as u8;
            if db <= tolerance && dg <= tolerance && dr <= tolerance {
                return true;
            }
            false
        })
        .unwrap_or(false);
}
/// 颜色匹配与模板匹配函数
///
/// # 参数
/// * `img_bgr` - 源图像（BGR格式）
/// * `template` - 模板图像（BGR格式）
/// * `target_color` - 目标颜色（B, G, R）
/// * `tolerance` - 颜色容差
///
/// # 返回值
/// * `Result<Option<(i32, i32)>>` - 匹配位置（x, y）或错误
pub(crate) fn find_color_and_match_template(
    img_bgr: &Mat,
    template: &Mat,
    target_color: (u8, u8, u8), // B, G, R
    tolerance: u8,
) -> Result<Option<(i32, i32)>, ColorMatchError> {
    if img_bgr.rows() <= 0 || img_bgr.cols() <= 0 {
        return Err(ColorMatchError::ImageProcessing(
            "源图像尺寸无效".to_string(),
        ));
    }
    if template.rows() <= 0 || template.cols() <= 0 {
        return Err(ColorMatchError::ImageProcessing(
            "模板图像尺寸无效".to_string(),
        ));
    }

    // 处理图像：创建掩码、二值化、形态学操作
    fn process_image(
        img: &Mat,
        target_color: (u8, u8, u8),
        tolerance: u8,
    ) -> Result<Mat, ColorMatchError> {
        // 创建掩码：查找与目标颜色近似的像素
        let mask_expr = Mat::zeros(img.rows(), img.cols(), CV_8UC1)
            .map_err(|e| ColorMatchError::OpenCV(format!("Mat::zeros: {e}")))?;
        let mut mask = mask_expr
            .to_mat()
            .map_err(|e| ColorMatchError::OpenCV(format!("to_mat: {e}")))?;

        for y in 0..img.rows() {
            for x in 0..img.cols() {
                let pixel = img
                    .at_2d::<core::Vec3b>(y, x)
                    .map_err(|e| ColorMatchError::OpenCV(format!("at_2d: {e}")))?;
                let b = pixel[0];
                let g = pixel[1];
                let r = pixel[2];

                // 计算与目标颜色的差值
                let db = (b as i32 - target_color.0 as i32).abs() as u8;
                let dg = (g as i32 - target_color.1 as i32).abs() as u8;
                let dr = (r as i32 - target_color.2 as i32).abs() as u8;

                // 如果差值在容差范围内，标记为白色（255）
                if db <= tolerance && dg <= tolerance && dr <= tolerance {
                    *mask
                        .at_2d_mut::<u8>(y, x)
                        .map_err(|e| ColorMatchError::OpenCV(format!("at_2d_mut: {e}")))? = 255;
                }
            }
        }

        // 对二值图像进行形态学操作，去除噪声
        let kernel = imgproc::get_structuring_element(
            imgproc::MORPH_RECT,
            Size::new(3, 3),
            Point::new(-1, -1),
        )
        .map_err(|e| ColorMatchError::OpenCV(format!("get_structuring_element: {e}")))?;
        let mut processed = Mat::default();
        imgproc::morphology_ex(
            &mask,
            &mut processed,
            imgproc::MORPH_CLOSE,
            &kernel,
            Point::new(-1, -1),
            1,
            BORDER_CONSTANT,
            Scalar::all(0.0),
        )
        .map_err(|e| ColorMatchError::OpenCV(format!("morphology_ex: {e}")))?;

        Ok(processed)
    }

    // 处理源图像
    let processed = process_image(img_bgr, target_color, tolerance)?;

    // 处理模板图像
    let processed_template = process_image(template, target_color, tolerance)?;

    // 确保模板尺寸小于源图像
    if processed_template.rows() > processed.rows() || processed_template.cols() > processed.cols()
    {
        return Err(ColorMatchError::ImageProcessing(
            "模板尺寸大于源图像".to_string(),
        ));
    }

    // 创建结果矩阵
    let result_cols = processed.cols() - processed_template.cols() + 1;
    let result_rows = processed.rows() - processed_template.rows() + 1;
    let mut result = unsafe {
        Mat::new_rows_cols(result_rows, result_cols, CV_32F)
            .map_err(|e| ColorMatchError::OpenCV(format!("Mat::new_rows_cols: {e}")))?
    };

    // 执行模板匹配
    imgproc::match_template(
        &processed,
        &processed_template,
        &mut result,
        imgproc::TM_CCOEFF_NORMED,
        &Mat::default(),
    )
    .map_err(|e| ColorMatchError::OpenCV(format!("match_template: {e}")))?;

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
    .map_err(|e| ColorMatchError::OpenCV(format!("min_max_loc: {e}")))?;

    // 阈值判断：只返回置信度高于0.8的匹配
    if max_val > 0.8 {
        Ok(Some((max_loc.x, max_loc.y)))
    } else {
        Ok(None)
    }
}
