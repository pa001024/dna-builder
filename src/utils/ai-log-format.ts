/**
 * AI 调用日志的展示格式化（纯函数，供后台日志页与会话回放弹窗复用）。
 *
 * 服务端记录的字段都是机器友好格式（ISO 时间、毫秒、微元），这里统一转成一眼能读的文本。
 */

/** 一位数补零。 */
function pad(value: number): string {
    return String(value).padStart(2, "0")
}

/**
 * @description 把 ISO 时间戳格式化成带秒的本地时间文本。
 * @param iso ISO 8601 时间字符串。
 * @returns `YYYY-MM-DD HH:mm:ss`；无法解析时返回 `-`。
 */
export function formatLogTime(iso: string | null | undefined): string {
    if (!iso) return "-"
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return "-"
    return (
        `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
        `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    )
}

/**
 * @description 格式化耗时（毫秒 → ms / s / m）。
 * @param ms 毫秒数。
 * @returns 展示文本；无效值为 `-`。
 */
export function formatDuration(ms: number | null | undefined): string {
    if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return "-"
    if (ms < 1000) return `${Math.round(ms)}ms`
    if (ms < 60_000) return `${(ms / 1000).toFixed(2)}s`
    return `${Math.floor(ms / 60_000)}m${Math.round((ms % 60_000) / 1000)}s`
}

/**
 * @description 格式化费用（微元 → 元，保留 4 位小数，与后端计费口径一致）。
 * @param micros 微元金额。
 * @returns 展示文本，如 `¥0.0031`。
 */
export function formatCost(micros: number | null | undefined): string {
    if (typeof micros !== "number" || !Number.isFinite(micros) || micros <= 0) return "¥0"
    return `¥${(micros / 1_000_000).toFixed(4)}`
}

/**
 * @description 千分位数字文本。
 * @param value 数值。
 * @returns 展示文本；无效值为 `-`。
 */
export function formatCount(value: number | null | undefined): string {
    if (typeof value !== "number" || !Number.isFinite(value)) return "-"
    return value.toLocaleString("zh-CN")
}

/**
 * @description 抽取消息 content 的纯文本（兼容字符串与多模态数组）。
 * @param content 消息 content 字段。
 * @returns 纯文本；无法识别时返回空字符串。
 */
export function formatMessageContent(content: unknown): string {
    if (typeof content === "string") return content
    if (content === null || content === undefined) return ""
    if (Array.isArray(content)) {
        return content
            .map(part => {
                if (typeof part === "string") return part
                const record = part as { type?: string; text?: string } | null
                if (typeof record?.text === "string") return record.text
                if (record?.type === "image_url") return "[图片]"
                return JSON.stringify(part)
            })
            .filter(Boolean)
            .join("\n")
    }
    return String(content)
}

/**
 * @description 美化 JSON 文本（工具调用参数是模型生成的字符串，可能是压缩过的一行）。
 * @param raw 原始文本。
 * @returns 缩进后的 JSON；解析失败时原样返回。
 */
export function formatJsonText(raw: string | null | undefined): string {
    const text = (raw || "").trim()
    if (!text) return ""
    try {
        return JSON.stringify(JSON.parse(text), null, 2)
    } catch {
        return text
    }
}
