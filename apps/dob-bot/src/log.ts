/**
 * 统一输出 dob-bot 调试日志。
 * @param {string} event
 * @param {unknown} payload
 * @returns {void}
 */
export function logDob(event: string, payload?: unknown): void {
    if (payload === undefined) {
        console.log(`[dob-bot][${event}]`)
        return
    }
    console.log(`[dob-bot][${event}] ${stringifyForLog(payload)}`)
}

/**
 * 截断长字符串，避免日志刷屏。
 * @param {string} value
 * @param {number} maxLength
 * @returns {string}
 */
export function clipLogText(value: string, maxLength = 4000): string {
    if (value.length <= maxLength) return value
    return `${value.slice(0, maxLength)}\n...[truncated ${value.length - maxLength} chars]`
}

/**
 * 把任意值序列化为适合日志的字符串。
 * @param {unknown} value
 * @returns {string}
 */
function stringifyForLog(value: unknown): string {
    if (typeof value === "string") {
        return clipLogText(value)
    }

    try {
        return clipLogText(JSON.stringify(value, null, 2))
    } catch {
        return clipLogText(String(value))
    }
}
