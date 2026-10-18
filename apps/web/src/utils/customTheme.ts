/**
 * 自定义主题（daisyUI 主题设计器）核心逻辑：
 * - 主题数据结构与默认值（基于 daisyUI dark 主题的色板）
 * - hex -> oklch 颜色转换（OKLab 算法，参考 Björn Ottosson）
 * - 生成与 daisyui.com/theme-generator 相同格式的主题 CSS
 */

/** 主题色键（20 个，与 daisyUI 主题变量一一对应） */
export type CustomThemeColorKey =
    | "base-100"
    | "base-200"
    | "base-300"
    | "base-content"
    | "primary"
    | "primary-content"
    | "secondary"
    | "secondary-content"
    | "accent"
    | "accent-content"
    | "neutral"
    | "neutral-content"
    | "info"
    | "info-content"
    | "success"
    | "success-content"
    | "warning"
    | "warning-content"
    | "error"
    | "error-content"

/** 自定义主题的固定内部 id（data-theme 属性与注入样式选择器均使用它） */
export const CUSTOM_THEME_ID = "custom"

/** 自定义主题数据结构，colors 统一存 hex（#rrggbb） */
export interface CustomTheme {
    /** 配色模式 */
    colorScheme: "light" | "dark"
    /** 各语义色（hex） */
    colors: Record<CustomThemeColorKey, string>
    /** 选择器圆角（rem） */
    radiusSelector: number
    /** 输入框圆角（rem） */
    radiusField: number
    /** 卡片圆角（rem） */
    radiusBox: number
    /** 边框宽度（px） */
    border: number
    /** 阴影深度 0-2 */
    depth: number
    /** 噪点强度 0-1 */
    noise: number
}

/** 默认自定义主题：以 daisyUI dark 主题为起点（hex 由 oklch 转换而来） */
export const DEFAULT_CUSTOM_THEME: CustomTheme = {
    colorScheme: "dark",
    colors: {
        "base-100": "#1d232a",
        "base-200": "#191e24",
        "base-300": "#15191e",
        "base-content": "#ecf9ff",
        primary: "#605dff",
        "primary-content": "#edf1fe",
        secondary: "#f43098",
        "secondary-content": "#f9e4f0",
        accent: "#00d3bb",
        "accent-content": "#084d49",
        neutral: "#09090b",
        "neutral-content": "#e4e4e7",
        info: "#00bafe",
        "info-content": "#042e49",
        success: "#00d390",
        "success-content": "#004c39",
        warning: "#fcb700",
        "warning-content": "#793205",
        error: "#ff627d",
        "error-content": "#4d0218",
    },
    radiusSelector: 0.5,
    radiusField: 0.25,
    radiusBox: 0.5,
    border: 1,
    depth: 1,
    noise: 0,
}

/** 颜色分组（与 daisyUI 主题生成器一致的分组展示） */
export const CUSTOM_THEME_COLOR_GROUPS: { key: CustomThemeColorKey }[][] = [
    [{ key: "base-100" }, { key: "base-200" }, { key: "base-300" }, { key: "base-content" }],
    [
        { key: "primary" },
        { key: "primary-content" },
        { key: "secondary" },
        { key: "secondary-content" },
        { key: "accent" },
        { key: "accent-content" },
        { key: "neutral" },
        { key: "neutral-content" },
    ],
    [
        { key: "info" },
        { key: "info-content" },
        { key: "success" },
        { key: "success-content" },
        { key: "warning" },
        { key: "warning-content" },
        { key: "error" },
        { key: "error-content" },
    ],
]

/** sRGB 非线性值 -> 线性值 */
function srgbToLinear(c: number): number {
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/**
 * 将 hex 颜色转换为 OKLCH 分量。
 * @param hex #rrggbb 格式
 * @returns l∈[0,1]、c 色度、h 色相角（0-360）
 */
export function hexToOklch(hex: string): { l: number; c: number; h: number } {
    const raw = hex.replace("#", "")
    const r = parseInt(raw.slice(0, 2), 16) / 255
    const g = parseInt(raw.slice(2, 4), 16) / 255
    const b = parseInt(raw.slice(4, 6), 16) / 255
    const rl = srgbToLinear(r)
    const gl = srgbToLinear(g)
    const bl = srgbToLinear(b)
    const l_ = 0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl
    const m_ = 0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl
    const s_ = 0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl
    const l3 = Math.cbrt(l_)
    const m3 = Math.cbrt(m_)
    const s3 = Math.cbrt(s_)
    const L = 0.2104542553 * l3 + 0.793617785 * m3 - 0.0040720468 * s3
    const a = 1.9779984951 * l3 - 2.428592205 * m3 + 0.4505937099 * s3
    const bv = 0.0259040371 * l3 + 0.7827717662 * m3 - 0.808675766 * s3
    const c = Math.sqrt(a * a + bv * bv)
    let h = (Math.atan2(bv, a) * 180) / Math.PI
    if (h < 0) {
        h += 360
    }
    return { l: L, c, h }
}

/**
 * 将 hex 颜色格式化为 daisyUI 风格的 oklch() 字符串。
 * @param hex #rrggbb 格式
 * @returns 如 oklch(58% 0.233 277.117)
 */
export function formatOklch(hex: string): string {
    const { l, c, h } = hexToOklch(hex)
    const lightness = `${(l * 100).toFixed(2)}%`
    const chroma = c.toFixed(3)
    // 无色度时色相无意义，统一输出 0
    const hue = Number(chroma) === 0 ? "0" : h.toFixed(2)
    return `oklch(${lightness} ${chroma} ${hue})`
}

/**
 * 生成主题运行时注入 CSS（固定使用 CUSTOM_THEME_ID 选择器）。
 * @param theme 自定义主题
 * @returns 注入到页面 <style> 的主题变量代码
 */
export function buildCustomThemeCss(theme: CustomTheme): string {
    const lines: string[] = []
    lines.push(`[data-theme=${CUSTOM_THEME_ID}] {`)
    lines.push(`color-scheme: ${theme.colorScheme};`)
    for (const [key, hex] of Object.entries(theme.colors) as [CustomThemeColorKey, string][]) {
        lines.push(`--color-${key}: ${formatOklch(hex)};`)
    }
    lines.push(`--radius-selector: ${theme.radiusSelector}rem;`)
    lines.push(`--radius-field: ${theme.radiusField}rem;`)
    lines.push(`--radius-box: ${theme.radiusBox}rem;`)
    lines.push(`--size-selector: 0.25rem;`)
    lines.push(`--size-field: 0.25rem;`)
    lines.push(`--border: ${theme.border}px;`)
    lines.push(`--depth: ${theme.depth};`)
    lines.push(`--noise: ${theme.noise};`)
    lines.push(`}`)
    return lines.join("\n")
}

/** 校验 hex 字符串是否合法（#rrggbb） */
export function isValidHex(value: string): boolean {
    return /^#([0-9a-fA-F]{6})$/.test(value.trim())
}

/** 全部 20 个主题色键（扁平列表，用于遍历捕获当前主题变量） */
export const CUSTOM_THEME_COLOR_KEYS = CUSTOM_THEME_COLOR_GROUPS.flat().map(group => group.key)

/** 线性值 -> sRGB 非线性值 */
function linearToSrgb(c: number): number {
    return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055
}

/**
 * 将 OKLCH 分量转换为 hex（OKLab 逆变换）。
 * @param l 明度 0-1
 * @param c 色度
 * @param h 色相角（度）
 * @returns #rrggbb
 */
export function oklchToHex(l: number, c: number, h: number): string {
    const rad = (h * Math.PI) / 180
    const a = c * Math.cos(rad)
    const b = c * Math.sin(rad)
    const l_ = l + 0.3963377774 * a + 0.2158037573 * b
    const m_ = l - 0.1055613458 * a - 0.0638541728 * b
    const s_ = l - 0.0894841775 * a - 1.291485548 * b
    const l3 = l_ ** 3
    const m3 = m_ ** 3
    const s3 = s_ ** 3
    const r = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3
    const g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3
    const bl = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3
    // 超出 sRGB 色域的颜色裁剪到最近可表示值
    const clamp = (v: number) => Math.min(1, Math.max(0, linearToSrgb(v)))
    const toHex = (v: number) =>
        Math.round(clamp(v) * 255)
            .toString(16)
            .padStart(2, "0")
    return `#${toHex(r)}${toHex(g)}${toHex(bl)}`
}

/**
 * 解析 CSS oklch() 字符串为分量。
 * @param value 如 "oklch(58% 0.233 277.117)" 或 "oklch(0.58 0.233 277.117deg)"
 * @returns 分量，解析失败返回 null
 */
export function parseOklch(value: string): { l: number; c: number; h: number } | null {
    const match = value.trim().match(/^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*\)$/i)
    if (!match) {
        return null
    }
    const l = match[1].endsWith("%") ? Number.parseFloat(match[1]) / 100 : Number.parseFloat(match[1])
    const c = Number.parseFloat(match[2])
    const h = Number.parseFloat(match[3])
    if ([l, c, h].some(Number.isNaN)) {
        return null
    }
    return { l, c, h }
}

/**
 * 将任意 CSS 颜色值（oklch / hex）转为 hex。
 * @param value CSS 颜色值
 * @returns #rrggbb，无法解析返回 null
 */
export function cssColorToHex(value: string): string | null {
    const trimmed = value.trim()
    if (isValidHex(trimmed)) {
        return trimmed.toLowerCase()
    }
    const oklch = parseOklch(trimmed)
    if (oklch) {
        return oklchToHex(oklch.l, oklch.c, oklch.h)
    }
    return null
}

/** 解析 CSS 长度值（rem/px）为数字，失败返回 fallback */
function parseCssLength(value: string, fallback: number): number {
    const num = Number.parseFloat(value)
    return Number.isFinite(num) ? num : fallback
}

/**
 * 从当前已应用的 daisyUI 主题的计算样式中捕获全部主题变量，
 * 作为自定义主题的编辑起点（视觉上与上一个主题完全一致）。
 * @param current 当前自定义主题，作为解析失败时的兜底值
 * @returns 捕获到的新主题
 */
export function captureCurrentThemeVars(current?: CustomTheme | null): CustomTheme {
    const style = getComputedStyle(document.body)
    const colors = {} as Record<CustomThemeColorKey, string>
    for (const key of CUSTOM_THEME_COLOR_KEYS) {
        const raw = style.getPropertyValue(`--color-${key}`)
        const hex = cssColorToHex(raw)
        colors[key] = hex ?? current?.colors[key] ?? DEFAULT_CUSTOM_THEME.colors[key]
    }
    return {
        colorScheme: style.colorScheme === "dark" ? "dark" : "light",
        colors,
        radiusSelector: parseCssLength(
            style.getPropertyValue("--radius-selector"),
            current?.radiusSelector ?? DEFAULT_CUSTOM_THEME.radiusSelector
        ),
        radiusField: parseCssLength(style.getPropertyValue("--radius-field"), current?.radiusField ?? DEFAULT_CUSTOM_THEME.radiusField),
        radiusBox: parseCssLength(style.getPropertyValue("--radius-box"), current?.radiusBox ?? DEFAULT_CUSTOM_THEME.radiusBox),
        border: parseCssLength(style.getPropertyValue("--border"), current?.border ?? DEFAULT_CUSTOM_THEME.border),
        depth: parseCssLength(style.getPropertyValue("--depth"), current?.depth ?? DEFAULT_CUSTOM_THEME.depth),
        noise: parseCssLength(style.getPropertyValue("--noise"), current?.noise ?? DEFAULT_CUSTOM_THEME.noise),
    }
}
