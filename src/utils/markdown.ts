import MarkdownIt from "markdown-it"
import mdHighlightjs from "markdown-it-highlightjs"
// @ts-expect-error 模块无 ts 定义，也不需要类型检查
import mdKatex from "markdown-it-katex"
import { router } from "@/router"
import { isHashHistory, isInternalSitePath, toRouterHref } from "@/utils/site-link"

/**
 * 统一的 markdown 渲染器。
 *
 * 资料检索回答、剧情摘录等都需要渲染 markdown（含公式与代码高亮），
 * 这里集中创建实例，避免每个组件各建一份。
 *
 * 除标准 markdown 外，额外支持两件事（均由渲染层处理，AI 侧写法保持稳定）：
 * 1. **站内链接可用**：AI 一律以 history 模式写 `/db/xxx`，渲染时按当前路由模式
 *    转换成可点击地址（hash 模式补 `#`），见 `toRouterHref`。
 * 2. **特殊组件**：AI 可输出白名单内的组件标签（如 `<ResourceCostItem/>`），
 *    由 `parseRichComponents` 解析，渲染端再实例化成真实组件。
 */
const md = MarkdownIt({
    html: false,
    linkify: true,
    typographer: true,
    breaks: true,
})
    .use(mdKatex, { throwOnError: false })
    .use(mdHighlightjs)

/**
 * 渲染 markdown 文本为 HTML。
 *
 * `hashMode` 只影响站内链接的 href 形态：链接文本始终显示原始路径（不带 `#`），
 * 仅 href 按模式补前缀，这样既保证可点击，又不会让用户看到 `#` 之类的实现细节。
 * @param text markdown 源文本
 * @param hashMode 当前是否为 hash 路由模式
 * @returns 渲染后的 HTML；渲染失败时回退为纯文本转义结果
 */
export function renderMarkdown(text: string, hashMode = false): string {
    if (!text) {
        return ""
    }

    try {
        return renderInternalLinks(md.render(text), hashMode)
    } catch (error) {
        console.error("Markdown 渲染失败:", error)
        return md.utils.escapeHtml(text)
    }
}

/**
 * 把渲染结果里的站内链接改写为当前路由模式下的 href。
 *
 * markdown-it 的 linkify 与 `[...](path)` 都会产出 `<a href="/db/...">`，
 * 这里统一在渲染后处理，比改 renderer 规则更不容易漏掉分支。
 * @param html 已渲染的 HTML
 * @param hashMode 是否为 hash 路由模式
 * @returns 改写后的 HTML
 */
function renderInternalLinks(html: string, hashMode: boolean): string {
    if (!html.includes("<a ")) {
        return html
    }

    return html.replace(/<a\s([^>]*?)href="([^"]*)"([^>]*)>/g, (full, before: string, href: string, after: string) => {
        const decoded = decodeHtmlEntities(href)

        if (!isInternalSitePath(decoded)) {
            return full
        }

        const converted = toRouterHref(decoded, hashMode)

        // 站内链接用 SPA 内跳转，避免在 Tauri 里触发整页刷新
        return `<a ${before}href="${escapeAttribute(converted)}" data-site-link="1"${after}>`
    })
}

/**
 * 还原 HTML 属性里被转义的实体，便于做路径判断。
 * @param value 属性原文
 * @returns 还原后的文本
 */
function decodeHtmlEntities(value: string): string {
    return value
        .replace(/&amp;/g, "&")
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
}

/**
 * 转义用于 HTML 属性的文本。
 * @param value 原始文本
 * @returns 转义后的文本
 */
function escapeAttribute(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/**
 * 判断当前是否处于 hash 路由模式。
 *
 * 直接读 vue-router 实例的 history base 判定，比各处重复判断 `env.isApp` 更可靠，
 * 也让「链接渲染」与「路由实际模式」始终一致。
 * @returns 是否为 hash 模式
 */
export function isHashRouterMode(): boolean {
    try {
        return isHashHistory(router.options.history)
    } catch {
        // 路由尚未就绪时按 history 模式处理（站内路径原样可用）
        return false
    }
}
