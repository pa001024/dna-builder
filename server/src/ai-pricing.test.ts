import { describe, expect, it } from "bun:test"
import {
    beijingDayKey,
    computeCostMicros,
    consumeSseBuffer,
    DAILY_LIMIT_MICROS,
    DEFAULT_MAX_TOKENS,
    finalizeOnEnd,
    formatYuan,
    isPeakPricing,
    MIN_REQUEST_MICROS,
    normalizeUsage,
    pipeWithUsage,
    resolveMaxTokens,
    type UpstreamUsage,
} from "./ai-pricing"

/**
 * 计费口径测试。
 *
 * 期望值刻意手写而不引用 `PRICE_PER_MILLION_TOKENS`，否则等于拿被测常量验证被测常量：
 * 这些数字直接来自 DeepSeek 官网价目表（元 / 百万 tokens，北京时间 2026-09-10 12:00 起生效）。
 */

/** 微元换算：元 → 微元。 */
const yuan = (value: number) => value * 1_000_000

/**
 * 构造一个「北京时间」时刻。
 * @param iso 北京时间的 "YYYY-MM-DD HH:mm" 文本
 * @returns 对应的时间对象
 */
function beijingTime(iso: string): Date {
    return new Date(`${iso.replace(" ", "T")}:00+08:00`)
}

describe("isPeakPricing", () => {
    // 2026-09-16 是周三，2026-09-19 / 20 分别是周六、周日
    const cases: Array<[string, boolean]> = [
        ["2026-09-16 08:59", false],
        ["2026-09-16 09:00", true],
        ["2026-09-16 11:59", true],
        ["2026-09-16 12:00", false],
        ["2026-09-16 13:59", false],
        ["2026-09-16 14:00", true],
        ["2026-09-16 17:59", true],
        ["2026-09-16 18:00", false],
        ["2026-09-16 23:59", false],
        ["2026-09-17 00:00", false],
    ]

    it("按北京时间工作日 9-12 / 14-18 判定高峰", () => {
        for (const [time, expected] of cases) {
            expect(isPeakPricing(beijingTime(time))).toBe(expected)
        }
    })

    it("周末全天按空闲时段计算", () => {
        // 高峰窗口内的周末时刻也必须是空闲价
        expect(isPeakPricing(beijingTime("2026-09-19 10:00"))).toBe(false)
        expect(isPeakPricing(beijingTime("2026-09-19 15:00"))).toBe(false)
        expect(isPeakPricing(beijingTime("2026-09-20 10:00"))).toBe(false)
    })
})

describe("beijingDayKey", () => {
    it("按北京时间切分自然日（UTC+8 的午夜为分界）", () => {
        expect(beijingDayKey(new Date("2026-09-16T15:59:00Z"))).toBe("2026-09-16")
        expect(beijingDayKey(new Date("2026-09-16T16:00:00Z"))).toBe("2026-09-17")
        // 北京时间 00:00 之前的时刻仍属于前一天
        expect(beijingDayKey(new Date("2026-09-16T00:00:00Z"))).toBe("2026-09-16")
        expect(beijingDayKey(new Date("2026-09-15T23:59:00Z"))).toBe("2026-09-16")
    })
})

describe("computeCostMicros", () => {
    it("空闲时段：缓存命中 0.02 / 未命中 1 / 输出 4 元每百万 tokens", () => {
        expect(computeCostMicros({ cacheHit: 1_000_000, cacheMiss: 0, output: 0 }, false)).toBe(yuan(0.02))
        expect(computeCostMicros({ cacheHit: 0, cacheMiss: 1_000_000, output: 0 }, false)).toBe(yuan(1))
        expect(computeCostMicros({ cacheHit: 0, cacheMiss: 0, output: 1_000_000 }, false)).toBe(yuan(4))
    })

    it("高峰时段：单价是空闲时段的两倍", () => {
        expect(computeCostMicros({ cacheHit: 1_000_000, cacheMiss: 0, output: 0 }, true)).toBe(yuan(0.04))
        expect(computeCostMicros({ cacheHit: 0, cacheMiss: 1_000_000, output: 0 }, true)).toBe(yuan(2))
        expect(computeCostMicros({ cacheHit: 0, cacheMiss: 0, output: 1_000_000 }, true)).toBe(yuan(8))
    })

    it("三档并存时按各档单价相加", () => {
        const tokens = { cacheHit: 5000, cacheMiss: 2000, output: 800 }
        // 空闲：5000×0.02 + 2000×1 + 800×4 = 100 + 2000 + 3200 = 5300 微元
        expect(computeCostMicros(tokens, false)).toBe(5300)
        // 高峰：5000×0.04 + 2000×2 + 800×8 = 200 + 4000 + 6400 = 10600 微元
        expect(computeCostMicros(tokens, true)).toBe(10600)
    })

    it("无用量时不产生费用", () => {
        expect(computeCostMicros({ cacheHit: 0, cacheMiss: 0, output: 0 }, true)).toBe(0)
    })
})

describe("normalizeUsage", () => {
    it("优先使用 DeepSeek 的缓存命中 / 未命中字段", () => {
        const usage: UpstreamUsage = {
            prompt_tokens: 1000,
            prompt_cache_hit_tokens: 800,
            prompt_cache_miss_tokens: 200,
            completion_tokens: 50,
        }
        expect(normalizeUsage(usage)).toEqual({ cacheHit: 800, cacheMiss: 200, output: 50 })
    })

    it("缺失未命中字段时用 prompt_tokens 与命中数的差值补齐", () => {
        const usage: UpstreamUsage = { prompt_tokens: 1000, prompt_cache_hit_tokens: 300, completion_tokens: 10 }
        expect(normalizeUsage(usage)).toEqual({ cacheHit: 300, cacheMiss: 700, output: 10 })
    })

    it("兼容 OpenAI 的 prompt_tokens_details.cached_tokens", () => {
        const usage: UpstreamUsage = { prompt_tokens: 1000, prompt_tokens_details: { cached_tokens: 300 }, completion_tokens: 10 }
        expect(normalizeUsage(usage)).toEqual({ cacheHit: 300, cacheMiss: 700, output: 10 })
    })

    it("命中数不会超过输入总量", () => {
        const usage: UpstreamUsage = { prompt_tokens: 100, prompt_cache_hit_tokens: 500, completion_tokens: 1 }
        expect(normalizeUsage(usage)).toEqual({ cacheHit: 100, cacheMiss: 0, output: 1 })
    })

    it("没有 usage 或字段非法时按 0 处理", () => {
        expect(normalizeUsage(undefined)).toEqual({ cacheHit: 0, cacheMiss: 0, output: 0 })
        expect(normalizeUsage(null)).toEqual({ cacheHit: 0, cacheMiss: 0, output: 0 })
        expect(normalizeUsage({ prompt_tokens: Number.NaN, prompt_cache_hit_tokens: -5, completion_tokens: 1.9 } as UpstreamUsage)).toEqual(
            { cacheHit: 0, cacheMiss: 0, output: 1 }
        )
    })
})

describe("resolveMaxTokens", () => {
    it("额度充足时保留客户端请求值与默认上限", () => {
        expect(resolveMaxTokens(undefined, DAILY_LIMIT_MICROS, true)).toBe(DEFAULT_MAX_TOKENS)
        expect(resolveMaxTokens(2048, DAILY_LIMIT_MICROS, false)).toBe(2048)
    })

    it("额度不足时按「剩余额度 ÷ 输出单价」收紧", () => {
        // 高峰输出 8 元 / 百万 tokens → 0.5 元可负担 62500 tokens，请求 100000 被收紧
        expect(resolveMaxTokens(100_000, DAILY_LIMIT_MICROS, true)).toBe(62_500)
        // 空闲输出 4 元 / 百万 tokens → 0.5 元可负担 125000 tokens，请求值不被收紧
        expect(resolveMaxTokens(100_000, DAILY_LIMIT_MICROS, false)).toBe(100_000)
    })

    it("剩余额度极小时至少保留 1 个 token，不会产生 0 或负值", () => {
        expect(resolveMaxTokens(undefined, 100, true)).toBe(12)
        expect(resolveMaxTokens(undefined, 1, true)).toBe(1)
        expect(resolveMaxTokens(undefined, 0, true)).toBe(1)
    })

    it("忽略非正的 max_tokens", () => {
        expect(resolveMaxTokens(0, DAILY_LIMIT_MICROS, false)).toBe(DEFAULT_MAX_TOKENS)
        expect(resolveMaxTokens(-10, DAILY_LIMIT_MICROS, false)).toBe(DEFAULT_MAX_TOKENS)
    })
})

describe("额度常量", () => {
    it("每日上限为 0.5 元，用尽阈值为高峰 256 个输出 tokens 的费用", () => {
        expect(DAILY_LIMIT_MICROS).toBe(yuan(0.5))
        expect(MIN_REQUEST_MICROS).toBe(256 * 8)
    })

    it("formatYuan 去掉尾随 0", () => {
        expect(formatYuan(DAILY_LIMIT_MICROS)).toBe("0.5")
        expect(formatYuan(yuan(1))).toBe("1")
        expect(formatYuan(20_000)).toBe("0.02")
        expect(formatYuan(5300)).toBe("0.005")
        expect(formatYuan(0)).toBe("0")
    })
})

describe("consumeSseBuffer", () => {
    it("只解析完整行，不完整的尾行留给下一次", () => {
        const seen: UpstreamUsage[] = []
        const rest = consumeSseBuffer(`data: {"choices":[{"delta":{"content":"hi"}}]}\n\ndata: {"usage":{"prompt_tokens":`, usage =>
            seen.push(usage)
        )

        expect(seen).toEqual([])
        expect(rest).toContain('"prompt_tokens":')
    })

    it("[DONE] 与非 JSON 心跳块会被忽略", () => {
        const seen: UpstreamUsage[] = []
        consumeSseBuffer(`: keep-alive\ndata: [DONE]\n\n`, usage => seen.push(usage))
        expect(seen).toEqual([])
    })

    it("解析出带 usage 的数据块（含缓存命中明细）", () => {
        const seen: UpstreamUsage[] = []
        consumeSseBuffer(
            `data: {"choices":[],"usage":{"prompt_tokens":120,"prompt_cache_hit_tokens":100,"prompt_cache_miss_tokens":20,"completion_tokens":7}}\n\n`,
            usage => seen.push(usage)
        )
        expect(seen).toEqual([{ prompt_tokens: 120, prompt_cache_hit_tokens: 100, prompt_cache_miss_tokens: 20, completion_tokens: 7 }])
    })
})

describe("pipeWithUsage", () => {
    /** 上游流被任意切分时都要能解析出 usage，且下行字节与上行完全一致。 */
    it("原样透传字节流并旁路解析 usage", async () => {
        const chunks = [
            `data: {"choices":[{"delta":{"content":"你"}}]}\n\n`,
            `data: {"choices":[{"delta":{"content":"好"}}]}\n\n`,
            `data: {"choices":[],"usage":{"prompt_tokens":2000,"prompt_cache_hit_tokens":1500,"prompt_cache_miss_tokens":500,`,
            `"completion_tokens":33}}\n\ndata: [DONE]\n\n`,
        ]
        const source = new ReadableStream<Uint8Array>({
            start(controller) {
                for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk))
                controller.close()
            },
        })

        const seen: UpstreamUsage[] = []
        const text = await new Response(pipeWithUsage(source, usage => seen.push(usage))).text()

        // 透传无损
        expect(text).toBe(chunks.join(""))
        // usage 被解析（事件跨数据块，验证缓冲区拼接）
        expect(seen).toEqual([{ prompt_tokens: 2000, prompt_cache_hit_tokens: 1500, prompt_cache_miss_tokens: 500, completion_tokens: 33 }])
        expect(normalizeUsage(seen[0])).toEqual({ cacheHit: 1500, cacheMiss: 500, output: 33 })
    })

    it("上游未返回 usage 时不回调", async () => {
        const source = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new TextEncoder().encode(`data: {"choices":[{"delta":{"content":"x"}}]}\n\ndata: [DONE]\n\n`))
                controller.close()
            },
        })

        const seen: UpstreamUsage[] = []
        await new Response(pipeWithUsage(source, usage => seen.push(usage))).text()
        expect(seen).toEqual([])
    })

    it("旁路观察者能拿到每个数据块，且抛错不影响透传", async () => {
        const chunks = [
            `data: {"choices":[{"delta":{"content":"甲"}}]}\n\n`,
            `data: {"choices":[{"delta":{"content":"乙"}}],"usage":{"total_tokens":1}}\n\n`,
        ]
        const source = new ReadableStream<Uint8Array>({
            start(controller) {
                for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk))
                controller.close()
            },
        })

        const events: unknown[] = []
        const text = await new Response(
            pipeWithUsage(
                source,
                () => {},
                payload => {
                    events.push(payload)
                    if (events.length === 1) throw new Error("观察者出错")
                }
            )
        ).text()

        expect(text).toBe(chunks.join(""))
        expect(events).toHaveLength(2)
    })
})

describe("finalizeOnEnd", () => {
    /** 造一个按需产出的流。 */
    function makeSource(chunks: string[], failAfter = -1) {
        let index = 0
        return new ReadableStream<Uint8Array>({
            pull(controller) {
                if (failAfter >= 0 && index === failAfter) {
                    controller.error(new Error("上游中断"))
                    return
                }
                if (index >= chunks.length) {
                    controller.close()
                    return
                }
                controller.enqueue(new TextEncoder().encode(chunks[index++]))
            },
        })
    }

    it("正常读完时收尾一次，字节不变", async () => {
        const chunks = ["a", "b", "c"]
        let settled = 0
        const text = await new Response(finalizeOnEnd(makeSource(chunks), () => settled++)).text()

        expect(text).toBe("abc")
        expect(settled).toBe(1)
    })

    it("客户端取消（提前关闭读取端）时同样收尾，且只收尾一次", async () => {
        let settled = 0
        const stream = finalizeOnEnd(makeSource(["a", "b", "c"]), () => settled++)
        const reader = stream.getReader()

        expect(new TextDecoder().decode((await reader.read()).value)).toBe("a")
        await reader.cancel("客户端断开")
        expect(settled).toBe(1)

        reader.releaseLock()
        await stream.cancel("再次取消")
        expect(settled).toBe(1)
    })

    it("上游报错时先收尾再把错误抛给客户端", async () => {
        let settled = 0
        const stream = finalizeOnEnd(makeSource(["a"], 1), () => settled++)
        const reader = stream.getReader()

        expect(new TextDecoder().decode((await reader.read()).value)).toBe("a")
        await expect(reader.read()).rejects.toThrow("上游中断")
        expect(settled).toBe(1)
    })
})
