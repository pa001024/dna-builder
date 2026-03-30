/// 将 RGB 颜色值转换为 HSL 格式
///
/// # 参数
/// * `rgb` - RGB 颜色值，格式为 0xRRGGBB（整数）
///
/// # 返回值
/// * `(f64, f64, f64)` - HSL 值的元组 (hue, saturation, luminance)
///   - hue: 色相，范围 0-360
///   - saturation: 饱和度，范围 0-1
///   - luminance: 亮度，范围 0-1
pub fn rgb_to_hsl(rgb: u32) -> (f64, f64, f64) {
    // 提取 RGB 分量（0-255）
    let r = ((rgb >> 16) & 0xFF) as f64 / 255.0;
    let g = ((rgb >> 8) & 0xFF) as f64 / 255.0;
    let b = (rgb & 0xFF) as f64 / 255.0;

    // 计算最大值和最小值
    let vmax = r.max(g).max(b);
    let vmin = r.min(g).min(b);
    let delta = vmax - vmin;

    // 计算亮度
    let luminance = (vmax + vmin) / 2.0;

    // 计算饱和度
    let saturation = if delta == 0.0 {
        0.0
    } else if luminance > 0.5 {
        delta / (2.0 - vmax - vmin)
    } else {
        delta / (vmax + vmin)
    };

    // 计算色相
    let hue = if delta == 0.0 {
        0.0
    } else if vmax == r {
        if g < b {
            60.0 * ((g - b) / delta + 6.0)
        } else {
            60.0 * ((g - b) / delta)
        }
    } else if vmax == g {
        60.0 * ((b - r) / delta + 2.0)
    } else {
        // vmax == b
        60.0 * ((r - g) / delta + 4.0)
    };

    // 确保色相在 0-360 范围内
    let hue = hue % 360.0;
    let hue = if hue < 0.0 { hue + 360.0 } else { hue };

    (hue, saturation, luminance)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rgb_to_hsl_red() {
        // 红色 0xFF0000
        let (h, s, l) = rgb_to_hsl(0xFF0000);
        assert_eq!(h, 0.0);
        assert_eq!(s, 1.0);
        assert_eq!(l, 0.5);
    }

    #[test]
    fn test_rgb_to_hsl_green() {
        // 绿色 0x00FF00
        let (h, s, l) = rgb_to_hsl(0x00FF00);
        assert_eq!(h, 120.0);
        assert_eq!(s, 1.0);
        assert_eq!(l, 0.5);
    }

    #[test]
    fn test_rgb_to_hsl_blue() {
        // 蓝色 0x0000FF
        let (h, s, l) = rgb_to_hsl(0x0000FF);
        assert_eq!(h, 240.0);
        assert_eq!(s, 1.0);
        assert_eq!(l, 0.5);
    }

    #[test]
    fn test_rgb_to_hsl_white() {
        // 白色 0xFFFFFF
        let (h, s, l) = rgb_to_hsl(0xFFFFFF);
        assert_eq!(h, 0.0);
        assert_eq!(s, 0.0);
        assert_eq!(l, 1.0);
    }

    #[test]
    fn test_rgb_to_hsl_black() {
        // 黑色 0x000000
        let (h, s, l) = rgb_to_hsl(0x000000);
        assert_eq!(h, 0.0);
        assert_eq!(s, 0.0);
        assert_eq!(l, 0.0);
    }

    #[test]
    fn test_rgb_to_hsl_gray() {
        // 灰色 0x808080
        let (h, s, l) = rgb_to_hsl(0x808080);
        assert_eq!(h, 0.0);
        assert_eq!(s, 0.0);
        // 128/255 ≈ 0.502
        assert!((l - 0.502).abs() < 0.001);
    }

    #[test]
    fn test_rgb_to_hsl_yellow() {
        // 黄色 0xFFFF00
        let (h, s, l) = rgb_to_hsl(0xFFFF00);
        assert_eq!(h, 60.0);
        assert_eq!(s, 1.0);
        assert_eq!(l, 0.5);
    }

    #[test]
    fn test_rgb_to_hsl_cyan() {
        // 青色 0x00FFFF
        let (h, s, l) = rgb_to_hsl(0x00FFFF);
        assert_eq!(h, 180.0);
        assert_eq!(s, 1.0);
        assert_eq!(l, 0.5);
    }

    #[test]
    fn test_rgb_to_hsl_magenta() {
        // 洋红色 0xFF00FF
        let (h, s, l) = rgb_to_hsl(0xFF00FF);
        assert_eq!(h, 300.0);
        assert_eq!(s, 1.0);
        assert_eq!(l, 0.5);
    }
}
