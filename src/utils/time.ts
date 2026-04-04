/**
 * 将秒级时间戳格式化为本地化日期时间文本。
 * @param timestamp 秒级时间戳
 * @returns 日期时间文本
 */
export function formatDateTime(timestamp: number, locale = "zh-CN"): string {
    return new Date(timestamp * 1000).toLocaleString(locale, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    })
}

/**
 * 将秒级时间范围格式化为单行文本。
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
