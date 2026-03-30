import { readFileSync } from "node:fs"
import postcss from "postcss"
import tailwindcss from "tailwindcss"

/**
 * 编译 Tailwind CSS
 * @returns 编译后的 CSS 字符串
 */
export async function compileTailwindCSS(): Promise<string> {
    try {
        // 读取 CSS 文件内容
        const cssContent = readFileSync("./src/bot/ssr/styles.css", "utf8")

        // 编译 CSS
        const result = await postcss([tailwindcss]).process(cssContent, {
            from: "./src/bot/ssr/styles.css",
            to: "./dist/styles.css",
        })

        return result.css
    } catch (error) {
        console.error("CSS 编译失败:", error)
        return ""
    }
}

/**
 * 缓存编译后的 CSS
 */
let cachedCSS: string | null = null

/**
 * 获取编译后的 Tailwind CSS
 * @returns 编译后的 CSS 字符串
 */
export async function getCompiledCSS(): Promise<string> {
    if (!cachedCSS) {
        cachedCSS = await compileTailwindCSS()
    }

    return cachedCSS
}
