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
    .use(richPlaceholderPlugin)

/**
 * 特殊组件占位注释：`<!--rich:0-->`（由 `parseRichComponents` 生成）。
 * 只匹配这个形态，模型自己写的任意 HTML 注释依旧按文本转义。
 */
const RICH_PLACEHOLDER_RE = /^<!--rich:\d+-->/

/**
 * 放行「特殊组件占位注释」的 markdown-it 插件。
 *
 * `html: false` 会把尖括号一律转义成实体，占位注释也不例外——那会让渲染端
 * 找不到注释节点（挂点变成页面上可见的 `&lt;!--rich:0--&gt;` 文本），特殊组件永远渲染不出来。
 * 这里只对 `<!--rich:N-->` 这一个形态产出 `html_inline` 原样透传，其余 HTML 仍走转义，
 * 与「AI 无法注入任意 HTML」的安全模型一致。
 * @param instance markdown-it 实例
 */
function richPlaceholderPlugin(instance: MarkdownIt): void {
    instance.inline.ruler.before("text", "rich_placeholder", (state, silent) => {
        const matched = RICH_PLACEHOLDER_RE.exec(state.src.slice(state.pos))

        if (!matched) {
            return false
        }

        if (!silent) {
            const token = state.push("html_inline", "", 0)
            token.content = matched[0]
        }

        state.pos += matched[0].length

        return true
    })
}

/**
 * 相邻特殊组件之间的换行。
 *
 * `breaks: true` 会把换行渲染成 `<br>`，于是模型逐行写出的多张卡片会各占一行。
 * 这里只删掉「两个占位注释之间」的那个 `<br>`，让同一段里的卡片并排成一行（放不下时自动折行），
 * 其余换行不受影响。
 */
const RICH_ADJACENT_BREAK_RE = /(<!--rich:\d+-->)\s*<br\s*\/?>\s*(?=<!--rich:\d+-->)/g

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
        return renderInternalLinks(md.render(text), hashMode).replace(RICH_ADJACENT_BREAK_RE, "$1")
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
