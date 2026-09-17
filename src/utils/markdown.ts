import MarkdownIt from "markdown-it"
import mdHighlightjs from "markdown-it-highlightjs"
// @ts-expect-error 模块无 ts 定义，也不需要类型检查
import mdKatex from "markdown-it-katex"

/**
 * 统一的 markdown 渲染器。
 *
 * 资料检索回答、剧情摘录等都需要渲染 markdown（含公式与代码高亮），
 * 这里集中创建实例，避免每个组件各建一份。
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
 * @param text markdown 源文本
 * @returns 渲染后的 HTML；渲染失败时回退为纯文本转义结果
 */
export function renderMarkdown(text: string): string {
    if (!text) {
        return ""
    }

    try {
        return md.render(text)
    } catch (error) {
        console.error("Markdown 渲染失败:", error)
        return md.utils.escapeHtml(text)
    }
}
