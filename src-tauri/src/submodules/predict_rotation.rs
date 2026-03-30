use opencv::{
    core::{self, BorderTypes, CV_8UC1, CV_32F, Mat, Point2f, Rect, Size},
    imgproc,
    prelude::*,
};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum PredictRotationError {
    #[error("图像尺寸无效")]
    InvalidImageSize,
    #[error("输入图像通道数无效: {0}，仅支持 BGR 三通道图像")]
    InvalidInputChannels(i32),
    #[error("{op} 失败: {source}")]
    OpenCv {
        op: &'static str,
        #[source]
        source: opencv::Error,
    },
}

/// 创建带操作名的 OpenCV 错误，便于定位失败阶段
fn cv_error(op: &'static str, source: opencv::Error) -> PredictRotationError {
    PredictRotationError::OpenCv { op, source }
}

/// 使用与 Python 版本一致的循环卷积：
/// `sum(np.roll(arr, i) * (kernel - abs(i)) // kernel)`。
///
/// # 参数
/// - `arr`: 一维离散信号
/// - `kernel`: 卷积核半径参数（Python 代码中默认 3）
///
/// # 返回
/// 卷积后的离散信号
fn convolve(arr: &[i64], kernel: i32) -> Vec<i64> {
    if arr.is_empty() {
        return vec![];
    }
    if kernel <= 0 {
        return arr.to_vec();
    }

    let kernel_i64 = kernel as i64;
    let mut output = vec![0i64; arr.len()];

    for shift in (-kernel + 1)..kernel {
        let weight = (kernel - shift.abs()) as i64;
        let rolled = roll_vec(arr, shift as isize);

        for (idx, value) in rolled.iter().enumerate() {
            // Python 的 // 是向下取整，Rust 用 div_euclid 对齐该行为。
            let term = (*value * weight).div_euclid(kernel_i64);
            output[idx] += term;
        }
    }

    output
}

fn roll_vec<T: Clone>(v: &[T], shift: isize) -> Vec<T> {
    let n = v.len() as isize;
    if n == 0 {
        return vec![];
    }
    let s = ((shift % n) + n) % n; // 0..n-1
    let s = s as usize;
    let mut out = Vec::with_capacity(v.len());
    out.extend_from_slice(&v[v.len() - s..]);
    out.extend_from_slice(&v[..v.len() - s]);
    out
}

// Local maxima with a height threshold (used in predict(), matches SciPy call with only height)
fn find_peaks_height(arr: &[f32], height: f32) -> Vec<usize> {
    let n = arr.len();
    if n < 3 {
        return vec![];
    }
    let mut peaks = Vec::new();
    for i in 1..n - 1 {
        if arr[i] >= height && arr[i] > arr[i - 1] && arr[i] >= arr[i + 1] {
            peaks.push(i);
        }
    }
    peaks
}

// Prominence approximation for confidence calc (SciPy-like for the purpose used)
fn find_peaks_with_prominence(arr: &[f64], min_prom: f64) -> Vec<(usize, f64)> {
    let n = arr.len();
    if n < 3 {
        return vec![];
    }
    let mut peaks = Vec::new();
    for i in 1..n - 1 {
        if arr[i] > arr[i - 1] && arr[i] >= arr[i + 1] {
            let h = arr[i];

            let mut left_min = h;
            let mut j = i as isize - 1;
            while j >= 0 {
                let v = arr[j as usize];
                if v > h {
                    break;
                }
                if v < left_min {
                    left_min = v;
                }
                j -= 1;
            }

            let mut right_min = h;
            let mut k = i + 1;
            while k < n {
                let v = arr[k];
                if v > h {
                    break;
                }
                if v < right_min {
                    right_min = v;
                }
                k += 1;
            }

            let base = left_min.max(right_min);
            let prom = h - base;
            if prom >= min_prom {
                peaks.push((i, h));
            }
        }
    }
    peaks
}

fn peak_confidence(arr: &[i64]) -> f64 {
    let n = arr.len();
    if n == 0 {
        return 0.0;
    }
    let mut arr3 = Vec::with_capacity(n * 3);
    arr3.extend(arr.iter().map(|&x| x as f64));
    arr3.extend(arr.iter().map(|&x| x as f64));
    arr3.extend(arr.iter().map(|&x| x as f64));

    let peaks = find_peaks_with_prominence(&arr3, 10.0);
    let mut heights: Vec<f64> = peaks
        .into_iter()
        .filter(|(idx, _)| *idx >= n && *idx < 2 * n)
        .map(|(_, h)| h)
        .collect();

    if heights.is_empty() {
        // Matches Python fallback branch in peak_confidence: (1-0)/1
        return 1.0;
    }

    heights.sort_by(|a, b| b.partial_cmp(a).unwrap());
    let highest = heights[0];
    let second = if heights.len() > 1 { heights[1] } else { 0.0 };

    if highest <= 0.0 {
        0.0
    } else {
        (highest - second) / highest
    }
}

pub fn predict_rotation(img_bgr: &Mat) -> Result<i32, PredictRotationError> {
    let d = img_bgr.rows();
    if d <= 0 {
        return Err(PredictRotationError::InvalidImageSize);
    }
    if img_bgr.channels() != 3 {
        return Err(PredictRotationError::InvalidInputChannels(
            img_bgr.channels(),
        ));
    }
    let scale = 1i32;

    // BGR -> YUV, take V channel
    // let mut yuv = Mat::default();
    // imgproc::cvt_color(img_bgr, &mut yuv, imgproc::COLOR_BGR2YUV, 0)
    //     .map_err(|e| cv_error("cvt_color", e))?;
    // let mut yuv_channels = Vector::<Mat>::new();
    // core::split(&yuv, &mut yuv_channels).map_err(|e| cv_error("split", e))?;
    // if yuv_channels.len() != 3 {
    //     return Err(PredictRotationError::InvalidYuvChannels(yuv_channels.len()));
    // }
    // let v = yuv_channels
    //     .get(2)
    //     .map_err(|e| cv_error("get channel 2", e))?;
    let mut v = Mat::default();
    imgproc::cvt_color(img_bgr, &mut v, imgproc::COLOR_BGR2GRAY, 0)
        .map_err(|e| cv_error("cvt_color", e))?;

    // img2 = 128 - v
    let mut img2 = Mat::default();
    let zero = Mat::zeros(v.rows(), v.cols(), CV_8UC1)
        .map_err(|e| cv_error("Mat::zeros", e))?
        .to_mat()
        .map_err(|e| cv_error("to_mat", e))?;
    core::add_weighted(&v, -1.0, &zero, 0.0, 128.0, &mut img2, -1)
        .map_err(|e| cv_error("add_weighted", e))?;

    // Gaussian blur (3x3)
    let mut img2_blur = Mat::default();
    imgproc::gaussian_blur(
        &img2,
        &mut img2_blur,
        Size::new(3, 3),
        0.0,
        0.0,
        BorderTypes::BORDER_REFLECT as i32,
    )
    .map_err(|e| cv_error("gaussian_blur", e))?;

    // warpPolar to (d x d), center (d/2, d/2), maxRadius d/2, INTER_LINEAR (matching Python)
    let dsize = Size::new(d, d);
    let center = Point2f::new(d as f32 / 2.0, d as f32 / 2.0);
    let max_radius = d as f32 / 2.0;
    let mut polar = Mat::default();
    imgproc::warp_polar(
        &img2_blur,
        &mut polar,
        dsize,
        center,
        max_radius as f64,
        imgproc::INTER_LINEAR,
    )
    .map_err(|e| cv_error("warp_polar", e))?;

    // transpose
    let mut polar_t = Mat::default();
    core::transpose(&polar, &mut polar_t).map_err(|e| cv_error("transpose", e))?;

    // crop rows [d*2/10 .. d*5/10)
    let row_start = (d * 1) / 10;
    let row_end = (d * 4) / 10;
    let remap2 = Mat::roi(
        &polar_t,
        Rect::new(0, row_start, polar_t.cols(), row_end - row_start),
    )
    .map_err(|e| cv_error("ROI", e))?;

    // Scharr along x: CV_32F
    let mut gradx = Mat::default();
    imgproc::scharr(
        &remap2,
        &mut gradx,
        CV_32F,
        1,
        0,
        1.0,
        0.0,
        BorderTypes::BORDER_REFLECT as i32,
    )
    .map_err(|e| cv_error("Scharr", e))?;

    // Ensure continuous data then flatten - fixed: is_continuous() returns bool not Result
    let gradx_cont = if gradx.is_continuous() {
        gradx
    } else {
        let mut tmp = Mat::default();
        gradx.copy_to(&mut tmp).map_err(|e| cv_error("copyTo", e))?;
        tmp
    };
    let total = (gradx_cont.rows() * gradx_cont.cols()) as usize;
    let grad_slice: &[f32] =
        unsafe { std::slice::from_raw_parts(gradx_cont.data() as *const u8 as *const f32, total) };

    let period = (d * scale) as usize;

    // Peaks on +grad and -grad
    let peaks_l = find_peaks_height(grad_slice, 50.0);
    let mut neg_grad = Vec::with_capacity(total);
    neg_grad.extend(grad_slice.iter().map(|&v| -v));
    let peaks_r = find_peaks_height(&neg_grad, 50.0);

    // Histograms l, r of modulo positions
    let mut l = vec![0i64; period];
    let mut r = vec![0i64; period];
    for p in peaks_l {
        l[p % period] += 1;
    }
    for p in peaks_r {
        r[p % period] += 1;
    }

    // l = max(l - r, 0), r = max(r - l, 0)
    let mut l2 = vec![0i64; period];
    let mut r2 = vec![0i64; period];
    for i in 0..period {
        let dl = l[i] - r[i];
        let dr = r[i] - l[i];
        l2[i] = if dl > 0 { dl } else { 0 };
        r2[i] = if dr > 0 { dr } else { 0 };
    }

    // Build conv0 for offsets in [-1, 0, 1] (kernel=2*scale)
    let mut conv0: Vec<Vec<i64>> = Vec::new();
    let kernel2 = 2 * scale; // = 2
    for offset in (-kernel2 + 1)..kernel2 {
        let shift1 = ((d * scale) * 80) / 360 + offset;
        let r_shift1 = roll_vec(&r2, shift1 as isize);
        let r_conv1 = convolve(&r_shift1, 3 * scale);
        let mut result = vec![0i64; period];
        for i in 0..period {
            result[i] = l2[i] * r_conv1[i];
        }

        let r_shift2 = roll_vec(&r2, offset as isize);
        let r_conv2 = convolve(&r_shift2, 10 * scale);
        for i in 0..period {
            result[i] -= (l2[i] * r_conv2[i]) / 5;
        }

        let result_final = convolve(&result, 3 * scale);
        conv0.push(result_final);
    }

    // Clamp <1 to 1
    for row in &mut conv0 {
        for v in row.iter_mut() {
            if *v < 1 {
                *v = 1;
            }
        }
    }

    // maximum across rows
    let mut maximum = vec![1i64; period];
    for i in 0..period {
        let mut m = i64::MIN;
        for row in &conv0 {
            if row[i] > m {
                m = row[i];
            }
        }
        maximum[i] = if m < 1 { 1 } else { m };
    }

    // confidence and result curve
    let conf = peak_confidence(&maximum);
    let result_curve: Vec<f64> = if conf > 0.3 {
        maximum.iter().map(|&x| x as f64).collect()
    } else {
        let mut avg = vec![0f64; period];
        let mut minv = vec![i64::MAX; period];
        for row in &conv0 {
            for i in 0..period {
                avg[i] += row[i] as f64;
                if row[i] < minv[i] {
                    minv[i] = row[i];
                }
            }
        }
        for i in 0..period {
            avg[i] /= conv0.len() as f64;
        }
        let maximum_f: Vec<f64> = maximum.iter().map(|&x| x as f64).collect();
        let minv_f: Vec<f64> = minv.iter().map(|&x| x as f64).collect();
        maximum_f
            .iter()
            .zip(avg.iter())
            .zip(minv_f.iter())
            .map(|((&a, &b), &c)| a * b * c)
            .collect()
    };

    // argmax
    let mut argm = 0usize;
    let mut best = f64::MIN;
    for (i, &v) in result_curve.iter().enumerate() {
        if v > best {
            best = v;
            argm = i;
        }
    }

    // degree = idx / (d*scale) * 360 + 55
    let deg = ((argm as f64) / ((d * scale) as f64) * 360.0 + 55.0) % 360.0;
    Ok(deg as i32)
}

#[cfg(test)]
mod tests {
    use super::*;
    use opencv::{core::MatTraitConst, imgcodecs};

    #[test]
    fn test_predict_rotation() {
        // 直接使用1.png作为测试图像
        let img_path = "roi.png";

        println!("正在测试实际图像旋转预测: {}", img_path);

        // 检查文件是否存在
        if !std::path::Path::new(img_path).exists() {
            println!("警告: 找不到图像文件 '{}'，跳过测试", img_path);
            assert!(true, "文件不存在，测试跳过");
            return;
        }

        // 尝试使用OpenCV直接读取图像文件
        match imgcodecs::imread(img_path, imgcodecs::IMREAD_COLOR) {
            Ok(mat_bgr) => {
                println!("成功读取图像，尺寸: {}x{}", mat_bgr.cols(), mat_bgr.rows());

                // 直接调用内部预测函数
                match predict_rotation(&mat_bgr) {
                    Ok(predicted_angle) => {
                        println!("预测的旋转角度: {}", predicted_angle);

                        // 检查预测结果是否接近333度（允许±1度误差）
                        let expected_angle = 333;
                        assert!(
                            (predicted_angle as i32 - expected_angle).abs() <= 1,
                            "预测结果与预期不一致: 期望接近333度，实际为{}度",
                            predicted_angle
                        );
                        println!("测试通过: 预测结果{}接近预期的333度", predicted_angle);
                    }
                    Err(e) => {
                        println!("预测失败: {:?}", e);
                        assert!(false, "预测失败: {:?}", e);
                    }
                }
            }
            Err(e) => {
                println!("读取图像失败: {:?}", e);
                assert!(false, "读取图像失败: {:?}", e);
            }
        }
    }
}
