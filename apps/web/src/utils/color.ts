/**
 * 颜色换算与色差（ΔE）工具。
 * 用于「按目标颜色检索相近色板」这类场景：sRGB ↔ HSV / OKLab，以及 OKLab 欧氏距离色差。
 *
 * 色差为什么用 OKLab 而不是 CIELAB（ΔE76/ΔE00）：两者都能算色差，但 CIELAB 是为反射色料设计的，
 * 在蓝紫区域会压缩色相角。实测 #0800ed（纯蓝）与 #7f20ac（紫）在 CIELAB 里只差 11° 色相，
 * ΔE00 只按「彩度差」计价，于是纯蓝会排到暗紫色（#482565）前面，与肉眼判断相反；
 * 而在 OKLab 里两者色相差 47°，排序与肉眼一致。×100 后数值量级与 ΔE00 相当
 * （黑白相差 100，约 2 以内基本看不出差别）。
 */

/** sRGB 三元组，分量取值 0~255 */
export type Rgb = [number, number, number]

/** OKLab 三元组，L 约 0~1，a/b 为红绿与黄蓝轴（约 -0.4~0.4） */
export type Oklab = [number, number, number]

/** 把数值限制在闭区间内。 */
function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value))
}

/** 将 0~255 的 sRGB 分量转为 0~1 的线性光分量。 */
function toLinear(channel: number): number {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

/**
 * @description 将 sRGB 颜色转为 OKLab（Björn Ottosson 的显示色感知均匀空间）。
 * @param rgb 0~255 的 sRGB 三元组
 * @returns OKLab 三元组
 */
export function rgbToOklab(rgb: Rgb): Oklab {
    const [r, g, b] = [toLinear(rgb[0]), toLinear(rgb[1]), toLinear(rgb[2])]
    // 线性 sRGB → LMS 锥体响应
    const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    // 立方根非线性 → Lab 轴
    const lRoot = Math.cbrt(l)
    const mRoot = Math.cbrt(m)
    const sRoot = Math.cbrt(s)
    return [
        0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot,
        1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot,
        0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot,
    ]
}

/**
 * @description 两个 OKLab 颜色的欧氏距离色差（deltaEOK），×100 归一化到 0~100 量级。
 * @param lab1 第一个颜色的 OKLab 值
 * @param lab2 第二个颜色的 OKLab 值
 * @returns 色差 ΔE，约 2 以内为基本不可辨
 */
export function deltaEOk(lab1: Oklab, lab2: Oklab): number {
    return Math.hypot(lab1[0] - lab2[0], lab1[1] - lab2[1], lab1[2] - lab2[2]) * 100
}

/**
 * @description 两个 sRGB 颜色的色差（内部换算 OKLab 后取欧氏距离）。
 * @param rgb1 第一个颜色
 * @param rgb2 第二个颜色
 * @returns 色差 ΔE
 */
export function deltaE(rgb1: Rgb, rgb2: Rgb): number {
    return deltaEOk(rgbToOklab(rgb1), rgbToOklab(rgb2))
}

/**
 * @description 十六进制色值转 sRGB 三元组，支持带/不带 # 的 3 位与 6 位写法。
 * @param hex 十六进制色值，如 "#b7dde8"
 * @returns sRGB 三元组，格式非法时返回 null
 */
export function hexToRgb(hex: string): Rgb | null {
    const value = hex.trim().replace(/^#/, "")
    const full = value.length === 3 ? [...value].map(char => char + char).join("") : value
    if (!/^[0-9a-f]{6}$/i.test(full)) return null
    return [Number.parseInt(full.slice(0, 2), 16), Number.parseInt(full.slice(2, 4), 16), Number.parseInt(full.slice(4, 6), 16)]
}

/**
 * @description sRGB 三元组转 "#rrggbb" 小写十六进制色值。
 * @param rgb sRGB 三元组
 * @returns 十六进制色值
 */
export function rgbToHex(rgb: Rgb): string {
    const part = (channel: number) => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, "0")
    return `#${part(rgb[0])}${part(rgb[1])}${part(rgb[2])}`
}

/**
 * @description HSV 转 sRGB。
 * @param h 色相 0~360
 * @param s 饱和度 0~1
 * @param v 明度 0~1
 * @returns sRGB 三元组
 */
export function hsvToRgb(h: number, s: number, v: number): Rgb {
    const hue = ((h % 360) + 360) % 360
    const saturation = clamp(s, 0, 1)
    const value = clamp(v, 0, 1)
    const chroma = value * saturation
    const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1))
    const m = value - chroma
    const table: Rgb[] = [
        [chroma, x, 0],
        [x, chroma, 0],
        [0, chroma, x],
        [0, x, chroma],
        [x, 0, chroma],
        [chroma, 0, x],
    ]
    const [r, g, b] = table[Math.floor(hue / 60) % 6]
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
}

/**
 * @description sRGB 转 HSV。
 * @param rgb sRGB 三元组
 * @returns [色相 0~360, 饱和度 0~1, 明度 0~1]
 */
export function rgbToHsv(rgb: Rgb): [number, number, number] {
    const [r, g, b] = [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255]
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const delta = max - min
    let hue = 0
    if (delta !== 0) {
        if (max === r) hue = 60 * (((g - b) / delta) % 6)
        else if (max === g) hue = 60 * ((b - r) / delta + 2)
        else hue = 60 * ((r - g) / delta + 4)
    }
    return [(hue + 360) % 360, max === 0 ? 0 : delta / max, max]
}
