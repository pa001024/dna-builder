import i18next from "i18next"

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
 * 将时间戳格式化为相对时间文本（刚刚 / N 分钟前 / N 小时前 / N 天前），文案随指定语言国际化。
 * @param timestamp 时间戳，支持秒或毫秒。
 * @param language 目标语言（BCP47），缺省使用当前 i18n 语言；超过 30 天回退为日期时间文本。
 * @returns 相对时间文本
 */
export function formatRelativeTime(timestamp: number, language?: string): string {
    const time = normalizeTimestamp(timestamp)
    const diff = Date.now() - time
    const minute = 60_000
    const hour = 60 * minute
    const day = 24 * hour
    const locale = language ?? i18next.language
    const t = i18next.getFixedT(locale)
    if (diff < minute) return t("time.justNow")
    if (diff < hour) return t("time.minutesAgo", { count: Math.floor(diff / minute) })
    if (diff < day) return t("time.hoursAgo", { count: Math.floor(diff / hour) })
    if (diff < 30 * day) return t("time.daysAgo", { count: Math.floor(diff / day) })
    return formatDateTime(time, locale)
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
