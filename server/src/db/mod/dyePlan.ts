import type { CreateMobius, Resolver } from "@pa001024/graphql-mobius"
import { and, desc, eq, inArray, like, sql } from "drizzle-orm"
import type { GraphQLResolveInfo } from "graphql"
import { createGraphQLError } from "graphql-yoga"
import { db, schema } from ".."
import type { Context } from "../yoga"
import { getSubSelection } from "."

/** 染色方案评论使用的通用评论目标 ID 前缀。 */
const DYE_PLAN_COMMENT_TARGET_PREFIX = "dp_"

/**
 * @description 生成染色方案评论使用的目标唯一 ID。
 * @param planId 染色方案 ID。
 * @returns 通用评论目标 ID。
 */
function dyePlanCommentTarget(planId: string) {
    return `${DYE_PLAN_COMMENT_TARGET_PREFIX}${planId}`
}

/** 染色方案允许的类型，与游戏 ModModel_DyePlanCopyModeComp.lua 的社区码前缀对应。 */
const DYE_PLAN_TYPES = ["Char", "Hair", "Weapon"] as const

/** 染色部件数量上限，与游戏染色码长度限制保持一致。 */
const MAX_COLOR_PARTS = 64

/** 色板 ID 上限，2 位 Base36 可表示的最大值。 */
const MAX_COLOR_ID = 1295

/** 标题长度上限。 */
const MAX_TITLE_LENGTH = 100

/** 描述长度上限。 */
const MAX_DESC_LENGTH = 2000

/** 转载来源标注长度上限。 */
const MAX_SOURCE_LENGTH = 500

/**
 * @description 批量统计染色方案的评论数（通用评论表按 dp_ 前缀目标 ID 查询）。
 * @param planIds 染色方案 ID 列表。
 * @returns 染色方案 ID 到评论数的映射。
 */
async function getDyePlanCommentCounts(planIds: string[]) {
    if (planIds.length === 0) return new Map<string, number>()
    const rows = await db
        .select({ targetId: schema.comments.targetId, count: sql<number>`count(*)` })
        .from(schema.comments)
        .where(
            inArray(
                schema.comments.targetId,
                planIds.map(planId => dyePlanCommentTarget(planId))
            )
        )
        .groupBy(schema.comments.targetId)
    return new Map(rows.map(row => [row.targetId, Number(row.count)]))
}

/**
 * @description 校验染色方案输入，非法时抛出 GraphQL 错误。
 * @param input 染色方案输入。
 * @throws 输入不合法时抛出 GraphQL 错误。
 */
function validateDyePlanInput(input: {
    title: string
    desc?: string | null
    type: string
    skinId: number
    colorIds: number[]
    imageUrl?: string | null
    isOriginal: boolean
    source?: string | null
}) {
    if (!input.title || input.title.trim().length === 0) {
        throw createGraphQLError("标题不能为空")
    }
    if (input.title.length > MAX_TITLE_LENGTH) {
        throw createGraphQLError(`标题不能超过 ${MAX_TITLE_LENGTH} 个字符`)
    }
    if (input.desc && input.desc.length > MAX_DESC_LENGTH) {
        throw createGraphQLError(`描述不能超过 ${MAX_DESC_LENGTH} 个字符`)
    }
    if (!DYE_PLAN_TYPES.includes(input.type as (typeof DYE_PLAN_TYPES)[number])) {
        throw createGraphQLError("不支持的染色类型")
    }
    if (!Number.isInteger(input.skinId) || input.skinId <= 0) {
        throw createGraphQLError("皮肤 ID 不合法")
    }
    if (!Array.isArray(input.colorIds) || input.colorIds.length === 0 || input.colorIds.length > MAX_COLOR_PARTS) {
        throw createGraphQLError(`染色部件数量必须在 1 到 ${MAX_COLOR_PARTS} 之间`)
    }
    if (input.colorIds.some(colorId => !Number.isInteger(colorId) || colorId < 0 || colorId > MAX_COLOR_ID)) {
        throw createGraphQLError(`色板 ID 必须在 0 到 ${MAX_COLOR_ID} 之间`)
    }
    if (input.imageUrl && !/^https?:\/\//i.test(input.imageUrl)) {
        throw createGraphQLError("预览图地址不合法")
    }
    if (typeof input.isOriginal !== "boolean") {
        throw createGraphQLError("原创标识不合法")
    }
    if (!input.isOriginal && (!input.source || input.source.trim().length === 0)) {
        throw createGraphQLError("转载必须标注来源链接或作者名称")
    }
    if (input.source && input.source.length > MAX_SOURCE_LENGTH) {
        throw createGraphQLError(`来源标注不能超过 ${MAX_SOURCE_LENGTH} 个字符`)
    }
}

/**
 * @description 将数据库行转换为 GraphQL 返回结构，解析 colorIds JSON。
 * @param row 数据库查询行。
 * @param likedIds 当前用户已点赞的染色方案 ID 集合。
 * @returns GraphQL 染色方案对象。
 */
function toDyePlanRow(row: typeof schema.dyePlans.$inferSelect & { user?: unknown }, likedIds: Set<string>) {
    let colorIds: number[] = []
    try {
        const parsed = JSON.parse(row.colorIds)
        if (Array.isArray(parsed)) colorIds = parsed.map(Number).filter(Number.isInteger)
    } catch {}
    return {
        ...row,
        colorIds,
        isOriginal: row.isOriginal ?? true,
        views: row.views ?? 0,
        likes: row.likes ?? 0,
        isRecommended: row.isRecommended ?? false,
        isPinned: row.isPinned ?? false,
        createdAt: row.createdAt ?? 0,
        updateAt: row.updateAt ?? 0,
        isLiked: likedIds.has(row.id),
    }
}

/**
 * @description 查询当前用户已点赞的染色方案 ID 集合。
 * @param userId 当前用户 ID，未登录时返回空集合。
 * @returns 已点赞的染色方案 ID 集合。
 */
async function getLikedDyePlanIds(userId?: string) {
    if (!userId) return new Set<string>()
    const rows = await db
        .select({ dyePlanId: schema.dyePlanLikes.dyePlanId })
        .from(schema.dyePlanLikes)
        .where(eq(schema.dyePlanLikes.userId, userId))
    return new Set(rows.map(row => row.dyePlanId))
}

export const typeDefs = /* GraphQL */ `
    type DyePlan {
        id: String!
        title: String!
        desc: String
        type: String!
        skinId: Int!
        colorIds: [Int!]!
        imageUrl: String
        isOriginal: Boolean!
        source: String
        userId: String!
        views: Int!
        likes: Int!
        commentsCount: Int!
        isRecommended: Boolean
        isPinned: Boolean
        createdAt: Float!
        updateAt: Float!
        user: User
        isLiked: Boolean
    }

    input DyePlanInput {
        title: String!
        desc: String
        type: String!
        skinId: Int!
        colorIds: [Int!]!
        imageUrl: String
        isOriginal: Boolean!
        source: String
    }

    type Mutation {
        createDyePlan(input: DyePlanInput!): DyePlan
        updateDyePlan(id: String!, input: DyePlanInput!): DyePlan
        deleteDyePlan(id: String!): Boolean
        likeDyePlan(id: String!): DyePlan
        unlikeDyePlan(id: String!): DyePlan
        recommendDyePlan(id: String!, recommended: Boolean!): DyePlan
        pinDyePlan(id: String!, pinned: Boolean!): DyePlan
    }

    type Query {
        dyePlans(search: String, type: String, skinId: Int, skinIds: [Int!], userId: String, limit: Int = 20, offset: Int = 0, sortBy: String): [DyePlan!]!
        dyePlansCount(search: String, type: String, skinId: Int, skinIds: [Int!]): Int!
        dyePlan(id: String!): DyePlan
    }
`

/**
 * @description 当查询选择 commentsCount 时，为染色方案行批量附加评论数。
 * @param rows 染色方案行。
 * @param info GraphQL 查询信息。
 * @returns 附加评论数后的染色方案行。
 */
async function attachDyePlanCommentCounts(rows: ReturnType<typeof toDyePlanRow>[], info: GraphQLResolveInfo) {
    if (!getSubSelection(info, "commentsCount")) return rows
    const counts = await getDyePlanCommentCounts(rows.map(row => row.id))
    return rows.map(row => ({ ...row, commentsCount: counts.get(dyePlanCommentTarget(row.id)) || 0 }))
}

export const resolvers = {
    Query: {
        dyePlans: async (_parent, args, context, info) => {
            const { search, type, skinId, skinIds, userId, limit = 20, offset = 0, sortBy = "latest" } = args || {}
            const conditions = []

            if (search) {
                conditions.push(like(schema.dyePlans.title, `%${search}%`))
            }
            if (type) {
                conditions.push(eq(schema.dyePlans.type, type))
            }
            if (skinId) {
                conditions.push(eq(schema.dyePlans.skinId, skinId))
            }
            if (skinIds?.length) {
                conditions.push(inArray(schema.dyePlans.skinId, skinIds))
            }
            if (userId) {
                conditions.push(eq(schema.dyePlans.userId, userId))
            }

            let orderBy: any[]
            switch (sortBy) {
                case "likes":
                    orderBy = [desc(schema.dyePlans.likes)]
                    break
                case "views":
                    orderBy = [desc(schema.dyePlans.views)]
                    break
                default:
                    orderBy = [desc(schema.dyePlans.updateAt)]
            }

            const result = await db.query.dyePlans.findMany({
                where: conditions.length > 0 ? and(...conditions) : undefined,
                orderBy,
                limit,
                offset,
                with: { user: getSubSelection(info, "user") ? true : undefined },
            })

            const likedIds = await getLikedDyePlanIds(context.user?.id)
            return attachDyePlanCommentCounts(
                result.map(row => toDyePlanRow(row, likedIds)),
                info
            )
        },
        dyePlansCount: async (_parent, args) => {
            const { search, type, skinId, skinIds } = args || {}
            const conditions = []

            if (search) {
                conditions.push(like(schema.dyePlans.title, `%${search}%`))
            }
            if (type) {
                conditions.push(eq(schema.dyePlans.type, type))
            }
            if (skinId) {
                conditions.push(eq(schema.dyePlans.skinId, skinId))
            }
            if (skinIds?.length) {
                conditions.push(inArray(schema.dyePlans.skinId, skinIds))
            }

            const whereClause = conditions.length > 0 ? and(...conditions) : undefined
            const [result] = await db.select({ count: sql<number>`count(*)` }).from(schema.dyePlans).where(whereClause)
            return result?.count || 0
        },
        dyePlan: async (_parent, args, context, info) => {
            const { id } = args
            const plan = await db.query.dyePlans.findFirst({
                where: eq(schema.dyePlans.id, id),
                with: { user: getSubSelection(info, "user") ? true : undefined },
            })

            if (!plan) {
                throw createGraphQLError("染色方案不存在")
            }

            await db
                .update(schema.dyePlans)
                .set({ views: sql`${schema.dyePlans.views} + 1` })
                .where(eq(schema.dyePlans.id, id))

            const likedIds = await getLikedDyePlanIds(context.user?.id)
            const row = toDyePlanRow(plan, likedIds)
            return (await attachDyePlanCommentCounts([row], info))[0]
        },
    },
    Mutation: {
        createDyePlan: async (_parent, args, context, info) => {
            if (!context.user) {
                throw createGraphQLError("需要登录")
            }

            const { input } = args
            validateDyePlanInput(input)
            const [plan] = await db
                .insert(schema.dyePlans)
                .values({
                    title: input.title,
                    desc: input.desc,
                    type: input.type,
                    skinId: input.skinId,
                    colorIds: JSON.stringify(input.colorIds),
                    imageUrl: input.imageUrl,
                    isOriginal: input.isOriginal,
                    source: input.isOriginal ? null : input.source,
                    userId: context.user.id,
                    updateAt: schema.now(),
                })
                .returning()

            if (!plan) {
                throw createGraphQLError("创建失败")
            }

            const result = await db.query.dyePlans.findFirst({
                where: eq(schema.dyePlans.id, plan.id),
                with: { user: getSubSelection(info, "user") ? true : undefined },
            })

            if (!result) {
                throw createGraphQLError("创建失败")
            }

            return (await attachDyePlanCommentCounts([toDyePlanRow(result, new Set())], info))[0]
        },
        updateDyePlan: async (_parent, args, context, info) => {
            if (!context.user) {
                throw createGraphQLError("需要登录")
            }

            const { id, input } = args
            validateDyePlanInput(input)
            const plan = await db.query.dyePlans.findFirst({
                where: eq(schema.dyePlans.id, id),
            })

            if (!plan) {
                throw createGraphQLError("染色方案不存在")
            }

            if (plan.userId !== context.user.id) {
                throw createGraphQLError("无权修改此染色方案")
            }

            const [updated] = await db
                .update(schema.dyePlans)
                .set({
                    title: input.title,
                    desc: input.desc,
                    type: input.type,
                    skinId: input.skinId,
                    colorIds: JSON.stringify(input.colorIds),
                    imageUrl: input.imageUrl,
                    isOriginal: input.isOriginal,
                    source: input.isOriginal ? null : input.source,
                    updateAt: schema.now(),
                })
                .where(eq(schema.dyePlans.id, id))
                .returning()

            if (!updated) {
                throw createGraphQLError("更新失败")
            }

            const result = await db.query.dyePlans.findFirst({
                where: eq(schema.dyePlans.id, id),
                with: { user: getSubSelection(info, "user") ? true : undefined },
            })

            if (!result) {
                throw createGraphQLError("更新失败")
            }

            const likedIds = await getLikedDyePlanIds(context.user?.id)
            return (await attachDyePlanCommentCounts([toDyePlanRow(result, likedIds)], info))[0]
        },
        deleteDyePlan: async (_parent, args, context) => {
            if (!context.user) {
                throw createGraphQLError("需要登录")
            }

            const { id } = args
            const plan = await db.query.dyePlans.findFirst({
                where: eq(schema.dyePlans.id, id),
            })

            if (!plan) {
                throw createGraphQLError("染色方案不存在")
            }

            if (plan.userId !== context.user.id && !context.user.roles?.includes("admin")) {
                throw createGraphQLError("无权删除此染色方案")
            }

            await db.delete(schema.dyePlans).where(eq(schema.dyePlans.id, id))
            return true
        },
        likeDyePlan: async (_parent, args, context, info) => {
            if (!context.user) {
                throw createGraphQLError("需要登录")
            }

            const { id } = args
            const plan = await db.query.dyePlans.findFirst({
                where: eq(schema.dyePlans.id, id),
            })

            if (!plan) {
                throw createGraphQLError("染色方案不存在")
            }

            const [existing] = await db
                .select()
                .from(schema.dyePlanLikes)
                .where(and(eq(schema.dyePlanLikes.userId, context.user.id), eq(schema.dyePlanLikes.dyePlanId, id)))

            if (existing) {
                throw createGraphQLError("已经点赞过了")
            }

            await db.insert(schema.dyePlanLikes).values({
                dyePlanId: id,
                userId: context.user.id,
            })

            await db
                .update(schema.dyePlans)
                .set({ likes: sql`${schema.dyePlans.likes} + 1` })
                .where(eq(schema.dyePlans.id, id))

            const updated = await db.query.dyePlans.findFirst({
                where: eq(schema.dyePlans.id, id),
                with: { user: getSubSelection(info, "user") ? true : undefined },
            })

            if (!updated) {
                throw createGraphQLError("染色方案不存在")
            }

            return (await attachDyePlanCommentCounts([toDyePlanRow(updated, new Set([id]))], info))[0]
        },
        unlikeDyePlan: async (_parent, args, context, info) => {
            if (!context.user) {
                throw createGraphQLError("需要登录")
            }

            const { id } = args
            const plan = await db.query.dyePlans.findFirst({
                where: eq(schema.dyePlans.id, id),
            })

            if (!plan) {
                throw createGraphQLError("染色方案不存在")
            }

            await db
                .delete(schema.dyePlanLikes)
                .where(and(eq(schema.dyePlanLikes.userId, context.user.id), eq(schema.dyePlanLikes.dyePlanId, id)))

            await db
                .update(schema.dyePlans)
                .set({ likes: sql`${schema.dyePlans.likes} - 1` })
                .where(eq(schema.dyePlans.id, id))

            const updated = await db.query.dyePlans.findFirst({
                where: eq(schema.dyePlans.id, id),
                with: { user: getSubSelection(info, "user") ? true : undefined },
            })

            if (!updated) {
                throw createGraphQLError("染色方案不存在")
            }

            const likedIds = await getLikedDyePlanIds(context.user?.id)
            return (await attachDyePlanCommentCounts([toDyePlanRow(updated, likedIds)], info))[0]
        },
        recommendDyePlan: async (_parent, args, context, info) => {
            if (!context.user?.roles?.includes("admin")) {
                throw createGraphQLError("无权限")
            }

            const { id, recommended } = args
            const plan = await db.query.dyePlans.findFirst({
                where: eq(schema.dyePlans.id, id),
            })

            if (!plan) {
                throw createGraphQLError("染色方案不存在")
            }

            const [updated] = await db
                .update(schema.dyePlans)
                .set({ isRecommended: recommended })
                .where(eq(schema.dyePlans.id, id))
                .returning()

            if (!updated) {
                throw createGraphQLError("更新失败")
            }

            const result = await db.query.dyePlans.findFirst({
                where: eq(schema.dyePlans.id, id),
                with: { user: getSubSelection(info, "user") ? true : undefined },
            })

            if (!result) {
                throw createGraphQLError("染色方案不存在")
            }

            const likedIds = await getLikedDyePlanIds(context.user?.id)
            return (await attachDyePlanCommentCounts([toDyePlanRow(result, likedIds)], info))[0]
        },
        pinDyePlan: async (_parent, args, context, info) => {
            if (!context.user?.roles?.includes("admin")) {
                throw createGraphQLError("无权限")
            }

            const { id, pinned } = args
            const plan = await db.query.dyePlans.findFirst({
                where: eq(schema.dyePlans.id, id),
            })

            if (!plan) {
                throw createGraphQLError("染色方案不存在")
            }

            const [updated] = await db.update(schema.dyePlans).set({ isPinned: pinned }).where(eq(schema.dyePlans.id, id)).returning()

            if (!updated) {
                throw createGraphQLError("更新失败")
            }

            const result = await db.query.dyePlans.findFirst({
                where: eq(schema.dyePlans.id, id),
                with: { user: getSubSelection(info, "user") ? true : undefined },
            })

            if (!result) {
                throw createGraphQLError("染色方案不存在")
            }

            const likedIds = await getLikedDyePlanIds(context.user?.id)
            return (await attachDyePlanCommentCounts([toDyePlanRow(result, likedIds)], info))[0]
        },
    },
} satisfies Resolver<CreateMobius<typeof typeDefs>, Context>

export type DyePlanGQL = CreateMobius<typeof typeDefs>
