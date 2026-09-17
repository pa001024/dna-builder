import { and, eq, sql } from "drizzle-orm"
import { computeCostMicros, DAILY_LIMIT_MICROS, formatYuan, normalizeUsage, type UpstreamUsage } from "./ai-pricing"
import { db, schema } from "./db"

/**
 * AI 中转接口的账务：读写 `ai_usage_daily`（按「用户 + 北京自然日」聚合的用量与费用）。
 *
 * 计费口径（单价、峰谷时段、tokens 归一化、额度折算）在 `ai-pricing.ts`，
 * 那里是纯函数、可单测；本文件只负责落库。
 */

/** 某个账号在某个北京自然日的额度使用情况。 */
export interface DailyQuota {
    /** 已产生费用（微元）。 */
    usedMicros: number
    /** 剩余额度（微元，不小于 0）。 */
    remainingMicros: number
    /** 已记账的请求次数。 */
    requests: number
}

/**
 * @description 查询某账号在北京当日的额度使用情况。
 * @param userId 用户 id
 * @param day 北京自然日（YYYY-MM-DD）
 * @returns 当日额度使用情况，无记录时各项为 0
 */
export async function readDailyQuota(userId: string, day: string): Promise<DailyQuota> {
    const [row] = await db
        .select()
        .from(schema.aiUsageDaily)
        .where(and(eq(schema.aiUsageDaily.userId, userId), eq(schema.aiUsageDaily.day, day)))
        .limit(1)

    const usedMicros = row ? Math.max(0, row.costMicros) : 0
    return {
        usedMicros,
        remainingMicros: Math.max(0, DAILY_LIMIT_MICROS - usedMicros),
        requests: row?.requests ?? 0,
    }
}

/**
 * @description 把一次请求的用量原子累加到当日记录。
 * 用 UPSERT + SQL 增量而不是「先读后写」，并发请求不会互相覆盖。
 * @param userId 用户 id
 * @param day 北京自然日（YYYY-MM-DD）
 * @param tokens 三档 tokens
 * @param costMicros 本次费用（微元）
 */
export async function recordUsage(
    userId: string,
    day: string,
    tokens: { cacheHit: number; cacheMiss: number; output: number },
    costMicros: number
): Promise<void> {
    await db
        .insert(schema.aiUsageDaily)
        .values({
            userId,
            day,
            cacheHitTokens: tokens.cacheHit,
            cacheMissTokens: tokens.cacheMiss,
            outputTokens: tokens.output,
            costMicros,
            requests: 1,
        })
        .onConflictDoUpdate({
            target: [schema.aiUsageDaily.userId, schema.aiUsageDaily.day],
            set: {
                cacheHitTokens: sql`${schema.aiUsageDaily.cacheHitTokens} + ${tokens.cacheHit}`,
                cacheMissTokens: sql`${schema.aiUsageDaily.cacheMissTokens} + ${tokens.cacheMiss}`,
                outputTokens: sql`${schema.aiUsageDaily.outputTokens} + ${tokens.output}`,
                costMicros: sql`${schema.aiUsageDaily.costMicros} + ${costMicros}`,
                requests: sql`${schema.aiUsageDaily.requests} + 1`,
                updateAt: schema.now(),
            },
        })
}

/**
 * @description 按上游 usage 记账。
 * 上游没返回 usage 时不计费（例如客户端中途断开、上游异常截断）；
 * 记账本身失败也只记日志，不影响已经把回复交给用户的事实。
 * @param userId 用户 id
 * @param day 北京自然日（YYYY-MM-DD）
 * @param peak 是否高峰时段
 * @param usage 上游 usage 字段
 */
export async function chargeUsage(userId: string, day: string, peak: boolean, usage: UpstreamUsage | undefined | null): Promise<void> {
    if (!usage) {
        console.warn(`[ai] 上游未返回 usage，本次请求不计费（用户 ${userId}）`)
        return
    }

    const tokens = normalizeUsage(usage)
    const costMicros = computeCostMicros(tokens, peak)

    try {
        await recordUsage(userId, day, tokens, costMicros)
        console.log(
            `[ai] 计费 ${formatYuan(costMicros)} 元（用户 ${userId} / ${day} / ${peak ? "高峰" : "空闲"}价）：` +
                `命中 ${tokens.cacheHit} + 未命中 ${tokens.cacheMiss} + 输出 ${tokens.output} tokens`
        )
    } catch (error) {
        console.error("[ai] AI 用量记账失败：", error)
    }
}
