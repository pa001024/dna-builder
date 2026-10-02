/**
 * daisyUI 内置主题清单。
 *
 * 主设置页的主题选择器与屏幕信息条的独立主题选择共用这一份清单,
 * 新增 / 删除主题时只改这里,两处下拉自动同步。
 */

/** 浅色主题(选择器里按深浅分组展示)。 */
export const LIGHT_THEMES = [
    "light",
    "lofi",
    "cupcake",
    "retro",
    "valentine",
    "garden",
    "aqua",
    "pastel",
    "wireframe",
    "winter",
    "cyberpunk",
    "corporate",
    "bumblebee",
    "emerald",
    "fantasy",
    "cmyk",
    "autumn",
    "acid",
    "lemonade",
    "ez",
] as const

/** 深色主题。 */
export const DARK_THEMES = ["dark", "black", "synthwave", "halloween", "forest", "dracula", "business", "night", "coffee"] as const

/** 全部合法主题 id(内置 + 自定义);归一化用户输入时用它做白名单。 */
const KNOWN_THEMES: ReadonlySet<string> = new Set([...LIGHT_THEMES, ...DARK_THEMES, "custom"])

/**
 * 判断一个主题 id 是否合法(内置主题或自定义主题)。
 * @param theme 待校验的主题 id
 * @returns 是否合法
 */
export function isKnownTheme(theme: string): boolean {
    return KNOWN_THEMES.has(theme)
}
