/**
 * 归一化时间戳单位，优先兼容毫秒，其次兼容秒。
 * @param timestamp 原始时间戳
 * @returns 毫秒时间戳
 */
function normalizeTimestamp(timestamp: number): number {
    return timestamp >= 1e11 ? timestamp : timestamp * 1000
}

/**
 * 将时间戳格式化为本地化日期时间文本。
 * @param timestamp 时间戳，支持秒或毫秒。
 * @returns 日期时间文本
 */
export function formatDateTime(timestamp: number, locale = "zh-CN"): string {
    return new Date(normalizeTimestamp(timestamp)).toLocaleString(locale, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    })
}

/**
 * 将时间戳格式化为仅包含时分秒的本地化文本。
 * @param timestamp 时间戳，支持秒或毫秒。
 * @returns 时间文本
 */
export function formatTimeOnly(timestamp: number, locale = "zh-CN"): string {
    return new Date(normalizeTimestamp(timestamp)).toLocaleTimeString(locale, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    })
}

/**
 * 将时间范围格式化为单行文本。
 * @param start 开始时间戳
 * @param end 结束时间戳
 * @param untilNowText 结束时间为空时的文案
 * @param locale 本地化区域
 * @returns 时间范围文本
 */
export function formatTimeRange(start?: number, end?: number | null, untilNowText = "至今", locale = "zh-CN"): string {
    if (!start) {
        return ""
    }

    return `${formatDateTime(start, locale)} ~ ${end !== null && end !== undefined ? formatDateTime(end, locale) : untilNowText}`
}
