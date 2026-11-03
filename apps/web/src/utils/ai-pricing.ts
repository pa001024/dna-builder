/**
 * 前端侧的 AI 计费口径（纯函数）。
 *
 * 单价、峰谷时段与取整方式必须与 `apps/server/src/ai-pricing.ts` 保持一致，
 * 这样实时对话里展示的「费用」才能和后台 AI 调用日志对上账。
 */

/** DeepSeek-V4.1-Flash 官方单价（元 / 百万 tokens，数值上等于微元 / token）。 */
export const PRICE_PER_MILLION_TOKENS = {
    /** 输入（缓存命中）。 */
    cacheHit: { idle: 0.02, peak: 0.04 },
    /** 输入（缓存未命中）。 */
    cacheMiss: { idle: 1, peak: 2 },
    /** 输出。 */
    output: { idle: 4, peak: 8 },
} as const

/** 计费金额的最小单位：微元（1 元 = 1_000_000 微元）。 */
export const MICROS_PER_YUAN = 1_000_000

/** 归一化后用于计费的三档 tokens。 */
export interface BillingTokens {
    /** 输入中命中缓存的部分。 */
    cacheHit: number
    /** 输入中未命中的部分。 */
    cacheMiss: number
    /** 输出部分。 */
    output: number
}

/** 一次模型请求的用量（与 `AgentRoundUsage` 的结构兼容）。 */
export interface UsageBillingInput {
    /** 输入 tokens（含缓存命中部分） */
    inputTokens: number
    /** 输出 tokens */
    outputTokens: number
    /** 输入中命中缓存的部分 */
    cacheReadTokens: number
}

/**
 * @description 判断给定时刻是否处于 DeepSeek 高峰计费时段（北京时间工作日 9:00-12:00 与 14:00-18:00）。
 * @param date 待判断的时间点，默认当前时间
 * @returns 是否处于高峰时段
 */
export function isPeakPricing(date: Date = new Date()): boolean {
    const beijing = new Date(date.getTime() + 8 * 60 * 60 * 1000)
    const weekday = beijing.getUTCDay()
    if (weekday === 0 || weekday === 6) return false
    const hour = beijing.getUTCHours()
    return (hour >= 9 && hour < 12) || (hour >= 14 && hour < 18)
}

/**
 * @description 按三档 tokens 与峰谷时段计算本次请求费用。
 * @param tokens 三档 tokens
 * @param peak 是否高峰时段
 * @returns 费用（微元）
 */
export function computeCostMicros(tokens: BillingTokens, peak: boolean): number {
    const tier = (price: { idle: number; peak: number }) => (peak ? price.peak : price.idle)
    return Math.round(
        tokens.cacheHit * tier(PRICE_PER_MILLION_TOKENS.cacheHit) +
            tokens.cacheMiss * tier(PRICE_PER_MILLION_TOKENS.cacheMiss) +
            tokens.output * tier(PRICE_PER_MILLION_TOKENS.output)
    )
}

/**
 * @description 把一次模型请求的归一化用量折算成费用（微元）。
 * 未命中缓存的输入 = 输入总量 - 缓存命中量，与后端的 Messages 口径一致。
 * @param usage 单次请求的用量
 * @param peak 是否高峰时段
 * @returns 费用（微元）
 */
export function computeUsageCostMicros(usage: UsageBillingInput, peak: boolean): number {
    // 缓存命中是输入的子集：上游回传异常时按输入总量封顶，避免命中量超过总输入而多计费
    const cacheHit = Math.min(Math.max(0, usage.inputTokens), Math.max(0, usage.cacheReadTokens))
    const cacheMiss = Math.max(0, usage.inputTokens - cacheHit)

    return computeCostMicros({ cacheHit, cacheMiss, output: Math.max(0, usage.outputTokens) }, peak)
}
