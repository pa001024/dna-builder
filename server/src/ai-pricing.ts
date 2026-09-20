/**
 * AI 中转接口的计费口径（纯函数，不碰数据库，可直接单元测试）。
 *
 * 从 `ai-billing.ts` 里再拆一层的原因：账务模块要连数据库，而数据库模块会拉起
 * `node-machine-id`（JWT 密钥来源），在没有注册表访问权限的环境下无法加载。
 * 把「怎么算钱」与「怎么记账」分开后，计费规则可以独立验证。
 *
 * 价格来源：DeepSeek 官网价目表，`deepseek-flash`（V4.1 Flash），
 * 北京时间 2026-09-10 12:00 起生效的峰谷定价。
 */

/**
 * DeepSeek-V4.1-Flash 官方单价（元 / 百万 tokens）。
 * 空闲时段价格为高峰时段的一半；高峰时段为北京时间周一至周五 9:00-12:00 与 14:00-18:00。
 *
 * 注意：单价数值上恰好等于「微元 / token」
 * （1 元 / 百万 tokens = 1_000_000 微元 / 1_000_000 tokens = 1 微元 / token），
 * 所以计费时可以直接用 tokens × 单价 得到微元，全程整数运算，不存在浮点累加误差。
 */
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

/** 每个账号每天可用的额度上限（微元）：0.5 元。 */
export const DAILY_LIMIT_MICROS = 0.5 * MICROS_PER_YUAN

/**
 * 判定「额度已用尽」的剩余额度阈值（微元）。
 * 约等于高峰时段 256 个输出 tokens 的费用；剩余额度低于此值时即使放行也只能吐出几个字符，
 * 不如直接告知用户额度用完。
 */
export const MIN_REQUEST_MICROS = 256 * PRICE_PER_MILLION_TOKENS.output.peak

/**
 * 客户端未指定 max_tokens 时的输出上限。
 * 上游对 max_tokens 缺省时会放开到几十万 tokens，单次请求就可能击穿每日额度，因此必须补一个默认上限。
 */
export const DEFAULT_MAX_TOKENS = 4096

/** 上游返回的 usage 字段（DeepSeek 在 OpenAI 兼容结构上额外给出缓存命中明细）。 */
export interface UpstreamUsage {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
    /** DeepSeek 专有：命中上下文缓存的输入 tokens。 */
    prompt_cache_hit_tokens?: number
    /** DeepSeek 专有：未命中缓存的输入 tokens。 */
    prompt_cache_miss_tokens?: number
    /** OpenAI 兼容写法：命中缓存的输入 tokens。 */
    prompt_tokens_details?: { cached_tokens?: number }
}

/** 归一化后用于计费的三档 tokens。 */
export interface BillingTokens {
    /** 输入中命中缓存的部分。 */
    cacheHit: number
    /** 输入中未命中缓存的部分。 */
    cacheMiss: number
    /** 输出部分。 */
    output: number
}

/** SSE 数据行前缀。 */
const SSE_DATA_PREFIX = "data:"

/**
 * @description 判断给定时刻是否处于 DeepSeek 高峰计费时段。
 * 高峰时段为北京时间（UTC+8）周一至周五的 9:00-12:00 与 14:00-18:00，其余时间（含周末）均为空闲时段。
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
 * @description 取北京时间自然日的日期键，额度按该键分桶（与 DeepSeek 峰谷时段保持同一时区）。
 * @param date 待取日期的时间点，默认当前时间
 * @returns YYYY-MM-DD
 */
export function beijingDayKey(date: Date = new Date()): string {
    return new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/**
 * @description 把微元金额格式化成便于展示的「元」文本（去掉尾随 0）。
 * @param micros 金额（微元）
 * @returns 元文本，如 500000 → "0.5"
 */
export function formatYuan(micros: number): string {
    return (micros / MICROS_PER_YUAN).toFixed(3).replace(/\.?0+$/, "")
}

/**
 * @description 把上游 usage 归一化成计费所需的三档 tokens。
 * 缓存命中优先取 DeepSeek 的 prompt_cache_hit_tokens，缺失时退回 OpenAI 的 prompt_tokens_details.cached_tokens；
 * 未命中缺失时用 prompt_tokens 与命中数的差值补齐。
 * @param usage 上游 usage 字段
 * @returns 三档 tokens（非法值一律按 0 处理）
 */
export function normalizeUsage(usage: UpstreamUsage | undefined | null): BillingTokens {
    const toCount = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0)
    if (!usage) {
        return { cacheHit: 0, cacheMiss: 0, output: 0 }
    }

    const prompt = toCount(usage.prompt_tokens)
    const rawHit = toCount(usage.prompt_cache_hit_tokens ?? usage.prompt_tokens_details?.cached_tokens)
    // 命中数不可能超过输入总量；上游没给 prompt_tokens 时无法交叉校验，直接采信
    const cacheHit = prompt > 0 ? Math.min(rawHit, prompt) : rawHit
    const cacheMiss =
        usage.prompt_cache_miss_tokens === undefined ? Math.max(0, prompt - cacheHit) : toCount(usage.prompt_cache_miss_tokens)

    return { cacheHit, cacheMiss, output: toCount(usage.completion_tokens) }
}

/**
 * @description 按三档 tokens 与峰谷时段计算本次请求费用。
 * 单价单位是「元 / 百万 tokens」，数值上等于「微元 / token」，因此直接相乘即为微元，只做一次四舍五入。
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
 * @description 按剩余额度折算本次请求可用的 max_tokens。
 * 取「客户端请求值（缺省 4096）」与「剩余额度 ÷ 输出单价」中的较小值，
 * 保证单次请求不会在输出阶段击穿每日额度。
 * @param requested 客户端请求的 max_tokens
 * @param remainingMicros 剩余额度（微元）
 * @param peak 是否高峰时段
 * @returns 实际下发给上游的 max_tokens
 */
export function resolveMaxTokens(requested: number | undefined, remainingMicros: number, peak: boolean): number {
    const outputPrice = peak ? PRICE_PER_MILLION_TOKENS.output.peak : PRICE_PER_MILLION_TOKENS.output.idle
    const affordable = Math.max(1, Math.floor(remainingMicros / outputPrice))
    const wanted = typeof requested === "number" && requested > 0 ? Math.floor(requested) : DEFAULT_MAX_TOKENS
    return Math.min(wanted, affordable)
}

/**
 * @description 从 SSE 缓冲区中取出完整行并解析其中的 usage。
 * 不完整的尾行留在缓冲区里等下一个数据块补全（SSE 事件可能被分片切断）。
 * @param buffer 待解析文本
 * @param onUsage 解析出 usage 时的回调
 * @param onEvent 解析出任意数据块时的回调（调用日志聚合用）；回调抛错不影响透传
 * @returns 尚未成行的尾部文本
 */
export function consumeSseBuffer(
    buffer: string,
    onUsage: (usage: UpstreamUsage) => void,
    onEvent?: (payload: Record<string, unknown>) => void
): string {
    const lines = buffer.split("\n")
    const rest = lines.pop() ?? ""

    for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith(SSE_DATA_PREFIX)) continue

        const payload = trimmed.slice(SSE_DATA_PREFIX.length).trim()
        if (!payload || payload === "[DONE]") continue

        let parsed: { usage?: UpstreamUsage } & Record<string, unknown>
        try {
            parsed = JSON.parse(payload)
        } catch {
            // 心跳/注释块不是 JSON，忽略
            continue
        }

        // 只有流末尾那个 choices 为空的数据块才带 usage，中间的数据块没有该字段
        if (parsed.usage) onUsage(parsed.usage)

        if (onEvent) {
            try {
                onEvent(parsed)
            } catch {
                // 观察者（调用日志）出错不得影响字节透传
            }
        }
    }

    return rest
}

/**
 * @description 把上游 SSE 流原样透传给客户端，同时旁路解析 usage 与数据块用于记账和记录日志。
 * 上游字节先原样下发再解析，客户端拿到的内容与直连上游完全一致。
 * @param source 上游响应体
 * @param onUsage 解析到 usage 时的回调（上游未返回 usage 时不会被调用）
 * @param onEvent 解析到任意数据块时的回调（调用日志聚合用）
 * @returns 可直接作为响应体返回的流
 */
export function pipeWithUsage(
    source: ReadableStream<Uint8Array>,
    onUsage: (usage: UpstreamUsage) => void,
    onEvent?: (payload: Record<string, unknown>) => void
): ReadableStream<Uint8Array> {
    const decoder = new TextDecoder()
    let buffer = ""

    return source.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
                controller.enqueue(chunk)
                buffer += decoder.decode(chunk, { stream: true })
                buffer = consumeSseBuffer(buffer, onUsage, onEvent)
            },
            flush() {
                buffer += decoder.decode()
                consumeSseBuffer(buffer, onUsage, onEvent)
            },
        })
    )
}

/**
 * @description 在流真正结束时执行收尾回调，覆盖「读完 / 客户端取消 / 上游报错」三种收尾。
 * `pipeWithUsage` 的 flush 只在正常读完时触发，客户端断开与上游中断都不会；调用日志必须在这三种情况下都收尾，
 * 所以这里按 `pull` 方式转发字节，并在结束与异常两个出口各触发一次回调（回调保证最多执行一次）。
 * 字节内容原样传递，不做任何改写。
 * @param source 已处理好记账与解析的下行流
 * @param onSettled 收尾回调
 * @returns 可直接作为响应体返回的流
 */
export function finalizeOnEnd(source: ReadableStream<Uint8Array>, onSettled: () => void): ReadableStream<Uint8Array> {
    const reader = source.getReader()
    let settled = false
    const settle = () => {
        if (settled) return
        settled = true
        onSettled()
    }

    return new ReadableStream<Uint8Array>({
        async pull(controller) {
            try {
                const { done, value } = await reader.read()
                if (done) {
                    settle()
                    controller.close()
                    return
                }
                controller.enqueue(value)
            } catch (error) {
                settle()
                controller.error(error)
            }
        },
        async cancel(reason) {
            settle()
            await reader.cancel(reason)
        },
    })
}
