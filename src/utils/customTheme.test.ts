import { afterEach, describe, expect, it, vi } from "vitest"
import {
    buildCustomThemeCss,
    CUSTOM_THEME_ID,
    captureCurrentThemeVars,
    cssColorToHex,
    DEFAULT_CUSTOM_THEME,
    formatOklch,
    hexToOklch,
    isValidHex,
    oklchToHex,
    parseOklch,
} from "./customTheme"

afterEach(() => {
    vi.unstubAllGlobals()
})

describe("customTheme 主题工具", () => {
    it("hexToOklch 应正确转换已知颜色", () => {
        // 白色：无色度
        expect(hexToOklch("#ffffff").l).toBeCloseTo(1, 5)
        expect(hexToOklch("#ffffff").c).toBeCloseTo(0, 5)
        // 黑色：零明度
        expect(hexToOklch("#000000").l).toBeCloseTo(0, 5)
        // 中性灰：无色度
        expect(hexToOklch("#808080").c).toBeLessThan(0.01)
    })

    it("hex -> oklch -> hex 应可逆（色域内颜色）", () => {
        for (const hex of ["#1d232a", "#605dff", "#f43098", "#00d3bb", "#ecf9ff", "#fcb700", "#ff627d"]) {
            const { l, c, h } = hexToOklch(hex)
            expect(oklchToHex(l, c, h)).toBe(hex)
        }
    })

    it("oklchToHex 应转换已知 oklch 值", () => {
        expect(oklchToHex(1, 0, 0)).toBe("#ffffff")
        expect(oklchToHex(0, 0, 0)).toBe("#000000")
        // daisyUI dark primary: oklch(58% 0.233 277.117)
        expect(oklchToHex(0.58, 0.233, 277.117)).toBe("#605dff")
    })

    it("formatOklch 应输出 daisyUI 风格 oklch 字符串", () => {
        expect(formatOklch("#ffffff")).toBe("oklch(100.00% 0.000 0)")
        expect(formatOklch("#000000")).toBe("oklch(0.00% 0.000 0)")
        expect(formatOklch("#605dff")).toMatch(/^oklch\(\d+\.\d{2}% \d\.\d{3} \d+\.\d{2}\)$/)
    })

    it("parseOklch 应解析百分比与小数两种明度写法", () => {
        expect(parseOklch("oklch(58% 0.233 277.117)")).toEqual({ l: 0.58, c: 0.233, h: 277.117 })
        expect(parseOklch("oklch(0.58 0.233 277.117deg)")).toEqual({ l: 0.58, c: 0.233, h: 277.117 })
        expect(parseOklch("not a color")).toBeNull()
    })

    it("cssColorToHex 应转换 oklch 字符串并透传 hex", () => {
        expect(cssColorToHex("oklch(58% 0.233 277.117)")).toBe("#605dff")
        expect(cssColorToHex("#1D232A")).toBe("#1d232a")
        expect(cssColorToHex("rgb(1 2 3)")).toBeNull()
    })

    it("buildCustomThemeCss 应生成完整的主题 CSS", () => {
        const css = buildCustomThemeCss({ ...DEFAULT_CUSTOM_THEME, colorScheme: "light" })
        expect(css).toContain(`[data-theme=${CUSTOM_THEME_ID}] {`)
        expect(css).toContain("color-scheme: light;")
        // 20 个语义色变量
        expect(css.match(/--color-[a-z0-9-]+: oklch\(/g)?.length).toBe(20)
        // 圆角/边框/深度/噪点
        expect(css).toContain("--radius-selector: 0.5rem;")
        expect(css).toContain("--radius-field: 0.25rem;")
        expect(css).toContain("--radius-box: 0.5rem;")
        expect(css).toContain("--border: 1px;")
        expect(css).toContain("--depth: 1;")
        expect(css).toContain("--noise: 0;")
    })

    it("buildCustomThemeCss 始终使用固定的 CUSTOM_THEME_ID 选择器", () => {
        const css = buildCustomThemeCss(DEFAULT_CUSTOM_THEME)
        expect(css).toContain(`[data-theme=${CUSTOM_THEME_ID}] {`)
        // 选择器只出现一次，无重复定义
        expect(css.match(/\[data-theme=/g)?.length).toBe(1)
    })

    it("captureCurrentThemeVars 应读取计算样式中的主题变量", () => {
        const vars = new Map<string, string>([
            ["--color-base-100", "oklch(25.33% 0.016 252.42)"],
            ["--color-primary", "oklch(58% 0.233 277.117)"],
            ["--color-info", "#00bafe"],
            ["--radius-selector", "0.25rem"],
            ["--radius-field", "0.5rem"],
            ["--radius-box", "1rem"],
            ["--border", "2px"],
            ["--depth", "2"],
            ["--noise", "0.1"],
        ])
        vi.stubGlobal("document", { body: {} })
        vi.stubGlobal("getComputedStyle", () => ({
            colorScheme: "dark",
            getPropertyValue: (prop: string) => vars.get(prop) ?? "",
        }))

        const captured = captureCurrentThemeVars()
        expect(captured.colorScheme).toBe("dark")
        expect(captured.colors["base-100"]).toBe("#1d232a")
        expect(captured.colors.primary).toBe("#605dff")
        expect(captured.colors.info).toBe("#00bafe")
        expect(captured.radiusSelector).toBe(0.25)
        expect(captured.radiusField).toBe(0.5)
        expect(captured.radiusBox).toBe(1)
        expect(captured.border).toBe(2)
        expect(captured.depth).toBe(2)
        expect(captured.noise).toBe(0.1)
        // 未提供的颜色键回退到默认主题
        expect(captured.colors["base-200"]).toBe(DEFAULT_CUSTOM_THEME.colors["base-200"])
    })

    it("captureCurrentThemeVars 解析失败时保留当前自定义主题的值", () => {
        vi.stubGlobal("document", { body: {} })
        vi.stubGlobal("getComputedStyle", () => ({
            colorScheme: "light",
            getPropertyValue: () => "",
        }))

        const current = { ...DEFAULT_CUSTOM_THEME, border: 3 }
        const captured = captureCurrentThemeVars(current)
        expect(captured.colorScheme).toBe("light")
        expect(captured.border).toBe(3)
        expect(captured.colors.primary).toBe(current.colors.primary)
    })

    it("isValidHex 应校验 hex 格式", () => {
        expect(isValidHex("#1d232a")).toBe(true)
        expect(isValidHex("#FFF")).toBe(false)
        expect(isValidHex("1d232a")).toBe(false)
        expect(isValidHex("#12345g")).toBe(false)
    })
})
