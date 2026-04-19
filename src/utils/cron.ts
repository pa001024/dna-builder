export const DEFAULT_COUNTER_RESET_CRON = "0 5 * * 1"

interface CronFieldMatcher {
    wildcard: boolean
    values: Set<number>
}

/**
 * 规整 cron 表达式。
 * @param value 原始表达式
 * @returns 规整后的 5 或 6 段 cron，非法时返回 null
 */
export function normalizeCronExpression(value: unknown): string | null {
    const text = String(value ?? "")
        .trim()
        .replace(/\s+/gu, " ")
    const parts = text.split(" ").filter(Boolean)
    if (parts.length !== 5 && parts.length !== 6) {
        return null
    }
    return parts.join(" ")
}

/**
 * 解析 cron 字段为可匹配集合。
 * @param field cron 字段
 * @param min 最小值
 * @param max 最大值
 * @param weekday 是否为星期字段
 * @returns 匹配器，非法时返回 null
 */
function parseCronField(field: string, min: number, max: number, weekday = false): CronFieldMatcher | null {
    const text = String(field ?? "").trim()
    if (!text) {
        return null
    }
    if (text === "*") {
        return { wildcard: true, values: new Set<number>() }
    }

    const values = new Set<number>()

    /**
     * 向集合中补充一个取值。
     * @param rawValue 原始数值
     */
    function addValue(rawValue: number) {
        if (!Number.isFinite(rawValue)) {
            return
        }
        const normalized = weekday && rawValue === 7 ? 0 : rawValue
        if (normalized < min || normalized > max) {
            return
        }
        values.add(normalized)
    }

    for (const segment of text.split(",")) {
        const trimmed = segment.trim()
        if (!trimmed) {
            continue
        }

        const [rangePart, stepPart] = trimmed.split("/", 2)
        const step = stepPart ? Number(stepPart) : 1
        if (!Number.isFinite(step) || step <= 0) {
            return null
        }

        if (rangePart === "*") {
            for (let value = min; value <= max; value += step) {
                values.add(value)
            }
            continue
        }

        const rangeMatch = rangePart.match(/^(\d+)-(\d+)$/u)
        if (rangeMatch) {
            const start = Number(rangeMatch[1])
            const end = Number(rangeMatch[2])
            const normalizedStart = weekday && start === 7 ? 0 : start
            const normalizedEnd = weekday && end === 7 ? 0 : end
            if (!Number.isFinite(normalizedStart) || !Number.isFinite(normalizedEnd) || normalizedStart > normalizedEnd) {
                return null
            }
            for (let value = normalizedStart; value <= normalizedEnd; value += step) {
                values.add(value)
            }
            continue
        }

        const number = Number(rangePart)
        if (!Number.isFinite(number)) {
            return null
        }
        addValue(number)
    }

    return values.size > 0 ? { wildcard: false, values } : null
}

/**
 * 判断指定时间是否满足 cron 字段。
 * @param date 目标时间
 * @param minuteMatch 分钟匹配器
 * @param hourMatch 小时匹配器
 * @param dayMatch 日匹配器
 * @param monthMatch 月匹配器
 * @param weekdayMatch 星期匹配器
 * @returns 是否匹配
 */
function matchesCronDate(
    date: Date,
    minuteMatch: CronFieldMatcher,
    hourMatch: CronFieldMatcher,
    dayMatch: CronFieldMatcher,
    monthMatch: CronFieldMatcher,
    weekdayMatch: CronFieldMatcher,
    yearMatch: CronFieldMatcher | null
): boolean {
    const minute = date.getMinutes()
    const hour = date.getHours()
    const day = date.getDate()
    const month = date.getMonth() + 1
    const weekday = date.getDay()
    const year = date.getFullYear()

    if (!(minuteMatch.wildcard || minuteMatch.values.has(minute))) {
        return false
    }
    if (!(hourMatch.wildcard || hourMatch.values.has(hour))) {
        return false
    }
    if (!(monthMatch.wildcard || monthMatch.values.has(month))) {
        return false
    }
    if (yearMatch && !(yearMatch.wildcard || yearMatch.values.has(year))) {
        return false
    }

    const dayOfMonthMatches = dayMatch.wildcard || dayMatch.values.has(day)
    const dayOfWeekMatches = weekdayMatch.wildcard || weekdayMatch.values.has(weekday)

    if (dayMatch.wildcard && weekdayMatch.wildcard) {
        return true
    }
    if (dayMatch.wildcard) {
        return dayOfWeekMatches
    }
    if (weekdayMatch.wildcard) {
        return dayOfMonthMatches
    }
    return dayOfMonthMatches || dayOfWeekMatches
}

/**
 * 计算 cron 的下一次触发时间。
 * @param expression cron 表达式
 * @param afterTimestamp 起始时间戳
 * @returns 下一次触发时间戳，非法时返回 null
 */
export function getNextCronOccurrence(expression: string, afterTimestamp: number): number | null {
    const normalized = normalizeCronExpression(expression)
    if (!normalized) {
        return null
    }

    const parts = normalized.split(" ")
    const [minuteRaw, hourRaw, dayRaw, monthRaw, weekdayRaw, yearRaw] = parts
    const minuteMatch = parseCronField(minuteRaw, 0, 59)
    const hourMatch = parseCronField(hourRaw, 0, 23)
    const dayMatch = parseCronField(dayRaw, 1, 31)
    const monthMatch = parseCronField(monthRaw, 1, 12)
    const weekdayMatch = parseCronField(weekdayRaw, 0, 6, true)
    const yearMatch = yearRaw ? parseCronField(yearRaw, 1970, 9999) : null
    if (!minuteMatch || !hourMatch || !dayMatch || !monthMatch || !weekdayMatch || (yearRaw && !yearMatch)) {
        return null
    }

    const current = new Date(afterTimestamp)
    current.setSeconds(0, 0)
    current.setMinutes(current.getMinutes() + 1)

    const limit = afterTimestamp + 5 * 366 * 24 * 60 * 60 * 1000
    while (current.getTime() <= limit) {
        if (matchesCronDate(current, minuteMatch, hourMatch, dayMatch, monthMatch, weekdayMatch, yearMatch)) {
            return current.getTime()
        }
        current.setMinutes(current.getMinutes() + 1)
    }

    return null
}
