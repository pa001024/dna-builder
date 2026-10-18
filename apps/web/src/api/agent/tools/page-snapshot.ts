/**
 * 页面快照工具：把资料库页面（含页面内嵌的子玩法组件）渲染成净化后的 HTML / 文本。
 *
 * 与检索类工具的分工：那些工具读的是「原始字段」，本工具读的是「页面成品」——
 * 只有渲染后才会出现的组合文案、内嵌子模块与交互态内容，只能靠它拿到。
 */

import i18next from "i18next"
import type { AgentTool } from "@/api/agent/tool"
import { pageSnapshotToText, renderPageSnapshot } from "@/utils/page-html-snapshot"

/** 单次返回内容的默认字符数 */
const DEFAULT_MAX_CHARS = 20000
/** 单次返回内容的字符数上限 */
const MAX_CHARS = 60000

/**
 * @description 构造 render_page 工具：渲染指定资料库页面并返回净化后的内容。
 * @returns 工具
 */
export function createPageSnapshotTool<TPayload = never>(): AgentTool<TPayload> {
    return {
        definition: {
            name: "render_page",
            description:
                "把资料库页面渲染一次，读取「页面上真实呈现的内容」（净化后的 HTML 或结构化文本）。\n" +
                "用于读**原始数据工具读不到**的页面成品：活动页内嵌的子玩法模块（永恒梦魇 / 高难挑战的增益与掉落、忘川夜话、试锋芒、签到、拍照任务、累充返利、盲盒掉落、背包解谜等）、" +
                "页面上的组合文案与表格、组件现算出来的说明——这些只在渲染后存在，read_entry / query_module_entries 的字段里没有。\n" +
                "path 取自其它工具返回的 path（例如 read_entry 的 entry.path、query_module_entries 的 path），只支持 /db 开头的站内路径。\n" +
                "需要点开页签 / 折叠面板才出现的内容：先用默认参数渲染一次，结果里的 clickable 是页面上的按钮与页签名称，" +
                "把要点的名称放进 click（可给多个，按顺序点）再渲染一次即可。\n" +
                "只渲染本地数据：排行榜这类需要服务端接口的内容不会出现在结果里。\n" +
                "返回内容按界面语言渲染，lang 参数不适用。",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description: "站内资料库路径，例如 /db/event/103036、/db/hardboss/101。只接受 /db 开头的路径",
                    },
                    format: {
                        type: "string",
                        enum: ["html", "text"],
                        description:
                            "输出格式：html（默认）是净化后的语义 HTML，保留标题 / 列表 / 表格结构；" +
                            "text 是同一份内容的结构化纯文本（标题带 #、列表带 -、表格按 | 分列），更省 token，适合只要文字时",
                    },
                    click: {
                        type: "array",
                        items: { type: "string" },
                        description:
                            "可选，渲染后依次点击的目标（最多 4 个）：按钮 / 页签的名称（可只给其中一段文字），或 CSS 选择器。" +
                            "用来读取需要切换页签、展开面板才出现的内容。名称取上一次结果里的 clickable",
                    },
                    max_chars: {
                        type: "integer",
                        description: `可选，返回内容的最大字符数，默认 ${DEFAULT_MAX_CHARS}，最大 ${MAX_CHARS}`,
                    },
                    settle_ms: {
                        type: "integer",
                        description: "可选，渲染后等待界面落定的毫秒数，默认 240；页面内容明显不全时可调到 600~1200",
                    },
                },
                required: ["path"],
            },
        },

        async execute(args) {
            const path = `${args.path ?? ""}`.trim()

            if (!path) {
                return {
                    content: JSON.stringify({ error: "缺少 path：请传入资料库页面路径，例如 /db/event/103036" }),
                    isError: true,
                }
            }

            const format = args.format === "text" ? "text" : "html"
            const maxChars = clampChars(Number(args.max_chars))
            const clicks = normalizeClicks(args.click)

            let snapshot: Awaited<ReturnType<typeof renderPageSnapshot>>

            try {
                snapshot = await renderPageSnapshot(path, {
                    settleMs: Number(args.settle_ms) || undefined,
                    clicks,
                })
            } catch (error) {
                return {
                    content: JSON.stringify({
                        error: `${error instanceof Error ? error.message : error}`,
                        path,
                        hint: "路径要用其它工具返回的 path（如 /db/event/103036）；只支持 /db 开头的资料库页面。",
                    }),
                    isError: true,
                }
            }

            const body = format === "text" ? pageSnapshotToText(snapshot.html) : snapshot.html
            const { content, truncated } = truncateContent(body, maxChars, format)
            const payload = {
                path: snapshot.path,
                title: snapshot.title,
                language: snapshot.language,
                format,
                chars: content.length,
                truncated,
                clicks: clicks.length ? clicks : undefined,
                missingClicks: snapshot.missingClicks.length ? snapshot.missingClicks : undefined,
                clickable: snapshot.clickable.length ? snapshot.clickable : undefined,
                errors: snapshot.errors.length ? snapshot.errors.slice(0, 5) : undefined,
                content,
                note: buildNote({
                    clickable: snapshot.clickable,
                    missing: snapshot.missingClicks,
                    clicks,
                    truncated,
                    errorCount: snapshot.errors.length,
                    dataReady: snapshot.dataReady,
                }),
            }

            return {
                content: JSON.stringify(payload),
                summary: i18next.t("dbAgent.summary.pageSnapshot", {
                    defaultValue: "页面渲染 {{chars}} 字",
                    chars: content.length,
                }),
            }
        },
    }
}

/**
 * @description 收敛 click 参数：字符串或字符串数组都接受，去空、去重、限 4 个。
 * @param raw 原始参数
 * @returns 点击目标列表
 */
function normalizeClicks(raw: unknown): string[] {
    const values = Array.isArray(raw) ? raw : [raw]
    const clicks: string[] = []

    for (const value of values) {
        const text = `${value ?? ""}`.trim()

        if (text && !clicks.includes(text)) {
            clicks.push(text)
        }

        if (clicks.length >= 4) {
            break
        }
    }

    return clicks
}

/**
 * @description 把字符数参数收敛到合法区间。
 * @param value 原始数值
 * @returns 字符数上限
 */
function clampChars(value: number): number {
    if (!Number.isFinite(value) || value <= 0) {
        return DEFAULT_MAX_CHARS
    }

    return Math.min(Math.round(value), MAX_CHARS)
}

/**
 * @description 按结构边界截断内容：HTML 截在标签边界上，文本截在行边界上，避免返回半截标签。
 * @param body 完整内容
 * @param maxChars 字符数上限
 * @param format 输出格式
 * @returns 截断后的内容与是否发生了截断
 */
function truncateContent(body: string, maxChars: number, format: "html" | "text"): { content: string; truncated: boolean } {
    if (body.length <= maxChars) {
        return { content: body, truncated: false }
    }

    const head = body.slice(0, maxChars)

    if (format === "text") {
        const lastLine = head.lastIndexOf("\n")
        return { content: (lastLine > 0 ? head.slice(0, lastLine) : head).trim(), truncated: true }
    }

    const lastTag = head.lastIndexOf("<")
    return { content: closeOpenTags(lastTag > 0 ? head.slice(0, lastTag) : head).trim(), truncated: true }
}

/** HTML 截断时不需要闭合的空元素标签 */
const VOID_TAGS = new Set(["br", "hr"])

/**
 * @description 补全被截断的浏览器 HTML：按开合顺序把未闭合的标签补上，避免返回半截结构。
 * @param html 截断后的 HTML
 * @returns 补全了尾标签的 HTML
 */
function closeOpenTags(html: string): string {
    const stack: string[] = []
    const tagPattern = /<(\/?)([a-z][a-z0-9]*)\b[^>]*>/gi
    let match = tagPattern.exec(html)

    while (match) {
        const [, closing, rawName] = match
        const name = rawName.toLowerCase()

        if (closing) {
            const index = stack.lastIndexOf(name)

            if (index >= 0) {
                stack.splice(index, 1)
            }
        } else if (!VOID_TAGS.has(name) && !match[0].endsWith("/>")) {
            stack.push(name)
        }

        match = tagPattern.exec(html)
    }

    return `${html}${stack
        .reverse()
        .map(name => `</${name}>`)
        .join("")}`
}

/**
 * @description 拼出本次渲染的补充说明，告诉模型怎么读交互态内容。
 * @param detail 渲染结果摘要
 * @param detail.clickable 页面上的可点击项
 * @param detail.missing 没点到的目标
 * @param detail.clicks 本次点击的目标
 * @param detail.truncated 内容是否被截断
 * @param detail.errorCount 渲染期错误数
 * @param detail.dataReady 渲染时游戏数据是否已就绪
 * @returns 说明文本
 */
function buildNote(detail: {
    clickable: string[]
    missing: string[]
    clicks: string[]
    truncated: boolean
    errorCount: number
    dataReady: boolean
}): string {
    const { clickable, missing, clicks, truncated, errorCount, dataReady } = detail
    const notes = ["内容是按当前界面语言渲染出来的页面成品（不是原始字段）。"]

    if (!dataReady) {
        notes.push("渲染时游戏数据还没就绪（数据包未安装或仍在加载），内容可能不完整。")
    }

    if (missing.length) {
        notes.push(`没找到要点击的元素：${missing.join(" / ")}——名称要与 clickable 里的一致，或用 CSS 选择器。`)
    }

    if (clickable.length && clicks.length === 0) {
        notes.push("需要切换页签 / 展开面板才能看到的内容不在本次结果里：把 clickable 里的名称放进 click 再渲染一次。")
    }

    if (truncated) {
        notes.push("内容超出上限已截断：可改用 format=text 让同样字符数装下更多内容，或用 click 只展开需要的部分。")
    }

    if (errorCount > 0) {
        notes.push(`有 ${errorCount} 处区块渲染失败（见 errors），对应区块的内容不完整；不代表资料库里没有这些数据。`)
    }

    return notes.join("")
}
