import { randomBytes } from "node:crypto"
import type { CreateMobius, Resolver } from "@pa001024/graphql-mobius"
import { and, count, desc, eq, like, sql } from "drizzle-orm"
import { createGraphQLError } from "graphql-yoga"
import { readAiQuota } from "../../ai-billing"
import { beijingDayKey, DAILY_LIMIT_MICROS, MICROS_PER_YUAN } from "../../ai-pricing"
import { db, schema } from ".."
import type { Context } from "../yoga"

export const typeDefs = /* GraphQL */ `
    type Query {
        "当前登录账号的 AI 额度（免费每日重置 + 充值永久有效，金额均为微元）"
        aiQuota: AiQuota!
        "兑换码批次列表（仅管理员）"
        adminRechargeBatches(limit: Int, offset: Int): [RechargeBatch!]!
        "兑换码明细（仅管理员）"
        adminRechargeCodes(batchId: String, status: String, search: String, limit: Int, offset: Int): [RechargeCode!]!
        "兑换码明细总数（仅管理员）"
        adminRechargeCodesCount(batchId: String, status: String, search: String): Int!
        "当前登录账号的兑换记录"
        myRechargeRedemptions(limit: Int): [RechargeCode!]!
    }

    type Mutation {
        "批量生成充值兑换码（仅管理员），金额以元为单位"
        adminCreateRechargeBatch(amountYuan: Float!, count: Int!, expiresInDays: Int): RechargeBatchResult!
        "作废单个未兑换的码（仅管理员）"
        adminRevokeRechargeCode(code: String!): Boolean!
        "作废整批未兑换的码（仅管理员），返回作废张数"
        adminRevokeRechargeBatch(batchId: String!): Int!
        "兑换充值码，额度永久有效"
        redeemRechargeCode(code: String!): RedeemResult!
    }

    type AiQuota {
        day: String!
        freeBalance: Int!
        permanentBalance: Int!
        totalBalance: Int!
        dailyLimit: Int!
    }

    type RechargeBatch {
        id: String!
        amountMicros: Int!
        total: Int!
        redeemed: Int!
        revoked: Int!
        unused: Int!
        expiresAt: Float
        createdBy: String
        createdAt: Float
    }

    type RechargeCode {
        code: String!
        amountMicros: Int!
        batchId: String!
        status: String!
        expiresAt: Float
        redeemedBy: String
        redeemedAt: Float
        createdAt: Float
    }

    type RechargeBatchResult {
        batch: RechargeBatch!
        codes: [String!]!
    }

    type RedeemResult {
        success: Boolean!
        message: String!
        amountMicros: Int!
        quota: AiQuota!
    }
`

/** 生成码 alphabet：剔除易混淆的 0/O/1/I。 */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
/** 单张面额上下限（元）。 */
const MIN_AMOUNT_YUAN = 0.1
const MAX_AMOUNT_YUAN = 500
/** 单次批量上限（张）。 */
const MAX_BATCH_COUNT = 500
/** 有效期上限（天）。 */
const MAX_EXPIRES_DAYS = 3650

/**
 * @description 生成一张兑换码（`XXXX-XXXX-XXXX`，密码学随机）。
 * @returns 未归一化的原始码文本（已为大写分组形式）。
 */
export function generateRechargeCode(): string {
    const bytes = randomBytes(12)
    const chars = Array.from(bytes, byte => CODE_ALPHABET[byte % CODE_ALPHABET.length])
    return `${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}-${chars.slice(8, 12).join("")}`
}

/**
 * @description 归一化用户输入的兑换码：去首尾空格、去全角空格、去横杠/空格分隔、转大写后重组分组。
 * 只做格式归一化，不做 `O→0` 之类猜测；归一化后仍非法即视为不存在。
 * @param value 原始输入
 * @returns 归一化后的 `XXXX-XXXX-XXXX`，非法时返回 null
 */
export function normalizeRechargeCode(value: unknown): string | null {
    const compact = String(value ?? "")
        .replace(/[\s-]/g, "")
        .toUpperCase()
    if (!/^[A-Z0-9]{12}$/.test(compact)) return null
    return `${compact.slice(0, 4)}-${compact.slice(4, 8)}-${compact.slice(8, 12)}`
}

/**
 * @description 校验批量生成参数并换算成微元。
 * @param amountYuan 单张面额（元）
 * @param count 张数
 * @param expiresInDays 有效期天数（null/undefined = 永久有效）
 * @returns 面额微元与过期时间戳
 */
export function validateBatchInput(
    amountYuan: number,
    count: number,
    expiresInDays?: number | null
): { amountMicros: number; expiresAt: number | null } {
    if (!Number.isFinite(amountYuan) || amountYuan < MIN_AMOUNT_YUAN || amountYuan > MAX_AMOUNT_YUAN) {
        throw createGraphQLError(`单张面额需在 ${MIN_AMOUNT_YUAN}~${MAX_AMOUNT_YUAN} 元之间`)
    }
    if (!Number.isInteger(count) || count < 1 || count > MAX_BATCH_COUNT) {
        throw createGraphQLError(`单次生成数量需在 1~${MAX_BATCH_COUNT} 张之间`)
    }
    let expiresAt: number | null = null
    if (expiresInDays !== undefined && expiresInDays !== null) {
        if (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > MAX_EXPIRES_DAYS) {
            throw createGraphQLError(`有效期需在 1~${MAX_EXPIRES_DAYS} 天之间，不填表示永久有效`)
        }
        expiresAt = Date.now() + expiresInDays * 24 * 60 * 60 * 1000
    }
    return { amountMicros: Math.round(amountYuan * MICROS_PER_YUAN), expiresAt }
}

/**
 * @description 需要管理员权限时的统一断言。
 * @param context GraphQL 上下文
 */
function requireAdmin(context: Context) {
    if (!context.user?.roles?.includes("admin")) {
        throw createGraphQLError("Unauthorized: Admin role required")
    }
}

/**
 * @description 需要登录时的统一断言。
 * @param context GraphQL 上下文
 * @returns 登录用户
 */
function requireUser(context: Context) {
    if (!context.user) {
        throw createGraphQLError("请先登录")
    }
    return context.user
}

/**
 * @description 把额度快照序列化为 GraphQL 响应对象。
 * @param userId 用户 id
 * @param day 北京自然日
 * @returns 额度响应
 */
async function serializeQuota(userId: string, day: string) {
    const quota = await readAiQuota(userId, day)
    return {
        day: quota.day,
        freeBalance: quota.freeRemainingMicros,
        permanentBalance: quota.rechargeBalanceMicros,
        totalBalance: quota.totalAvailableMicros,
        dailyLimit: DAILY_LIMIT_MICROS,
    }
}

/**
 * @description 汇总一批次的兑换状态计数。
 * @param batchId 批次 ID
 * @returns 各状态张数
 */
async function countBatchStatus(batchId: string) {
    const rows = await db
        .select({ status: schema.aiRechargeCodes.status, value: count() })
        .from(schema.aiRechargeCodes)
        .where(eq(schema.aiRechargeCodes.batchId, batchId))
        .groupBy(schema.aiRechargeCodes.status)
    const byStatus = new Map(rows.map(row => [row.status, row.value]))
    const redeemed = byStatus.get("redeemed") ?? 0
    const revoked = byStatus.get("revoked") ?? 0
    const total = redeemed + revoked + (byStatus.get("unused") ?? 0)
    return { total, redeemed, revoked, unused: Math.max(0, total - redeemed - revoked) }
}

export const resolvers = {
    Query: {
        aiQuota: async (_parent, _args, context) => {
            const user = requireUser(context)
            return await serializeQuota(user.id, beijingDayKey())
        },
        adminRechargeBatches: async (_parent, args, context) => {
            requireAdmin(context)
            const limit = Math.max(0, Math.floor(args?.limit ?? 20))
            const offset = Math.max(0, Math.floor(args?.offset ?? 0))
            const rows = await db
                .select({
                    batchId: schema.aiRechargeCodes.batchId,
                    amountMicros: schema.aiRechargeCodes.amountMicros,
                    expiresAt: schema.aiRechargeCodes.expiresAt,
                    createdBy: schema.aiRechargeCodes.createdBy,
                    createdAt: schema.aiRechargeCodes.createdAt,
                })
                .from(schema.aiRechargeCodes)
                .groupBy(schema.aiRechargeCodes.batchId)
                .orderBy(desc(sql`max(${schema.aiRechargeCodes.createdAt})`))
                .limit(limit)
                .offset(offset)
            return await Promise.all(
                rows.map(async row => ({
                    id: row.batchId,
                    amountMicros: row.amountMicros,
                    ...(await countBatchStatus(row.batchId)),
                    expiresAt: row.expiresAt,
                    createdBy: row.createdBy,
                    createdAt: row.createdAt,
                }))
            )
        },
        adminRechargeCodes: async (_parent, args, context) => {
            requireAdmin(context)
            const limit = Math.max(0, Math.floor(args?.limit ?? 50))
            const offset = Math.max(0, Math.floor(args?.offset ?? 0))
            const conditions = []
            if (args?.batchId) conditions.push(eq(schema.aiRechargeCodes.batchId, String(args.batchId)))
            if (args?.status) conditions.push(eq(schema.aiRechargeCodes.status, String(args.status)))
            const search = String(args?.search ?? "").trim()
            if (search) {
                const normalized = normalizeRechargeCode(search)
                conditions.push(like(schema.aiRechargeCodes.code, `%${normalized ?? search.toUpperCase()}%`))
            }
            return await db.query.aiRechargeCodes.findMany({
                where: conditions.length > 0 ? and(...conditions) : undefined,
                orderBy: [desc(schema.aiRechargeCodes.createdAt)],
                limit,
                offset,
            })
        },
        adminRechargeCodesCount: async (_parent, args, context) => {
            requireAdmin(context)
            const conditions = []
            if (args?.batchId) conditions.push(eq(schema.aiRechargeCodes.batchId, String(args.batchId)))
            if (args?.status) conditions.push(eq(schema.aiRechargeCodes.status, String(args.status)))
            const search = String(args?.search ?? "").trim()
            if (search) {
                const normalized = normalizeRechargeCode(search)
                conditions.push(like(schema.aiRechargeCodes.code, `%${normalized ?? search.toUpperCase()}%`))
            }
            const [result] = await db
                .select({ value: count() })
                .from(schema.aiRechargeCodes)
                .where(conditions.length > 0 ? and(...conditions) : undefined)
            return result?.value ?? 0
        },
        myRechargeRedemptions: async (_parent, args, context) => {
            const user = requireUser(context)
            const limit = Math.max(0, Math.floor(args?.limit ?? 20))
            return await db.query.aiRechargeCodes.findMany({
                where: and(eq(schema.aiRechargeCodes.redeemedBy, user.id), eq(schema.aiRechargeCodes.status, "redeemed")),
                orderBy: [desc(schema.aiRechargeCodes.redeemedAt)],
                limit,
            })
        },
    },
    Mutation: {
        adminCreateRechargeBatch: async (_parent, args, context) => {
            requireAdmin(context)
            const { amountMicros, expiresAt } = validateBatchInput(args?.amountYuan, args?.count, args?.expiresInDays ?? null)
            const count = Math.floor(args.count)
            const batchId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
            const createdBy = context.user!.id
            const codes: string[] = []
            const seen = new Set<string>()
            while (codes.length < count) {
                const code = generateRechargeCode()
                if (seen.has(code)) continue
                seen.add(code)
                codes.push(code)
            }
            await db.transaction(async tx => {
                for (const code of codes) {
                    try {
                        await tx.insert(schema.aiRechargeCodes).values({
                            code,
                            amountMicros,
                            batchId,
                            status: "unused",
                            expiresAt,
                            createdBy,
                        })
                    } catch {
                        const retry = generateRechargeCode()
                        await tx.insert(schema.aiRechargeCodes).values({
                            code: retry,
                            amountMicros,
                            batchId,
                            status: "unused",
                            expiresAt,
                            createdBy,
                        })
                        codes[codes.indexOf(code)] = retry
                    }
                }
            })
            const [sample] = await db.select().from(schema.aiRechargeCodes).where(eq(schema.aiRechargeCodes.batchId, batchId)).limit(1)
            return {
                batch: {
                    id: batchId,
                    amountMicros,
                    ...(await countBatchStatus(batchId)),
                    expiresAt,
                    createdBy,
                    createdAt: sample?.createdAt ?? Date.now(),
                },
                codes,
            }
        },
        adminRevokeRechargeCode: async (_parent, args, context) => {
            requireAdmin(context)
            const code = normalizeRechargeCode(args?.code)
            if (!code) throw createGraphQLError("兑换码格式无效")
            const [row] = await db
                .update(schema.aiRechargeCodes)
                .set({ status: "revoked" })
                .where(and(eq(schema.aiRechargeCodes.code, code), eq(schema.aiRechargeCodes.status, "unused")))
                .returning()
            if (!row) throw createGraphQLError("该兑换码不存在或已兑换/已作废")
            return true
        },
        adminRevokeRechargeBatch: async (_parent, args, context) => {
            requireAdmin(context)
            const batchId = String(args?.batchId ?? "").trim()
            if (!batchId) throw createGraphQLError("批次 ID 不能为空")
            const rows = await db
                .update(schema.aiRechargeCodes)
                .set({ status: "revoked" })
                .where(and(eq(schema.aiRechargeCodes.batchId, batchId), eq(schema.aiRechargeCodes.status, "unused")))
                .returning()
            return rows.length
        },
        redeemRechargeCode: async (_parent, args, context) => {
            const user = requireUser(context)
            const code = normalizeRechargeCode(args?.code)
            if (!code) throw createGraphQLError("兑换码格式无效，请检查后重试")
            const amountMicros = await db.transaction(async tx => {
                const [row] = await tx.select().from(schema.aiRechargeCodes).where(eq(schema.aiRechargeCodes.code, code)).limit(1)
                if (!row) throw createGraphQLError("兑换码不存在，请检查后重试")
                if (row.status === "revoked") throw createGraphQLError("该兑换码已被作废，请联系管理员")
                if (row.status === "redeemed") throw createGraphQLError("该兑换码已被兑换")
                if (row.expiresAt !== null && row.expiresAt !== undefined && row.expiresAt < Date.now()) {
                    throw createGraphQLError("该兑换码已过期")
                }
                const now = Date.now()
                await tx
                    .update(schema.aiRechargeCodes)
                    .set({ status: "redeemed", redeemedBy: user.id, redeemedAt: now })
                    .where(and(eq(schema.aiRechargeCodes.code, code), eq(schema.aiRechargeCodes.status, "unused")))
                await tx
                    .insert(schema.aiRechargeCredits)
                    .values({ userId: user.id, balanceMicros: row.amountMicros, totalRedeemedMicros: row.amountMicros })
                    .onConflictDoUpdate({
                        target: [schema.aiRechargeCredits.userId],
                        set: {
                            balanceMicros: sql`${schema.aiRechargeCredits.balanceMicros} + ${row.amountMicros}`,
                            totalRedeemedMicros: sql`${schema.aiRechargeCredits.totalRedeemedMicros} + ${row.amountMicros}`,
                            updateAt: now,
                        },
                    })
                return row.amountMicros
            })
            return {
                success: true,
                message: "兑换成功，额度已永久到账",
                amountMicros,
                quota: await serializeQuota(user.id, beijingDayKey()),
            }
        },
    },
} satisfies Resolver<CreateMobius<typeof typeDefs>, Context>
