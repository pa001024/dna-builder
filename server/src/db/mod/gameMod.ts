import type { CreateMobius, Resolver } from "@pa001024/graphql-mobius"
import { and, desc, eq, like, sql } from "drizzle-orm"
import type { GraphQLResolveInfo } from "graphql"
import { createGraphQLError } from "graphql-yoga"
import { deleteModFiles, getModFileUrl } from "../../util/mod-storage"
import { isGameModCategory } from "../../util/mod-zip"
import { db, schema } from ".."
import type { Context } from "../yoga"
import { getSubSelection } from "."

/** 名称长度上限。 */
const MAX_NAME_LENGTH = 100

/** 描述长度上限。 */
const MAX_DESC_LENGTH = 2000

/**
 * @description 校验并规范化 MOD 元数据输入（更新场景），非法时抛出 GraphQL 错误。
 * @param input MOD 元数据输入。
 * @returns 规范化后的更新字段（去除 null 与空字符串）。
 * @throws 输入不合法时抛出 GraphQL 错误。
 */
function validateGameModInput(input: {
    name?: string | null
    description?: string | null
    category?: string | null
    entity?: string | null
    requires?: string[] | null
    source?: string | null
}) {
    if (input.name !== undefined && input.name !== null) {
        if (input.name.trim().length === 0) {
            throw createGraphQLError("MOD 名称不能为空")
        }
        if (input.name.length > MAX_NAME_LENGTH) {
            throw createGraphQLError(`MOD 名称不能超过 ${MAX_NAME_LENGTH} 个字符`)
        }
    }
    if (input.description && input.description.length > MAX_DESC_LENGTH) {
        throw createGraphQLError(`描述不能超过 ${MAX_DESC_LENGTH} 个字符`)
    }
    if (input.category !== undefined && input.category !== null && !isGameModCategory(input.category)) {
        throw createGraphQLError("MOD 分类不合法")
    }
    if (input.requires !== undefined && input.requires !== null && !Array.isArray(input.requires)) {
        throw createGraphQLError("前置 MOD 列表不合法")
    }
    // 来源：任意文本（空表示原创），无格式限制；前端渲染时将其中链接转为 a 标签
}

/**
 * @description 将数据库行转换为对外返回的 MOD 结构（封面/预览图地址为相对路径）。
 * 文件属性（fileName/fileSize）来自最新版本，兼容旧字段。
 * @param row 数据库查询行。
 * @param versions 该 MOD 的版本列表（按创建时间倒序，首个视为最新版）。
 * @returns 对外 MOD 结构。
 */
function toGameModRow(
    row: typeof schema.gameMods.$inferSelect & { user?: unknown },
    versions: (typeof schema.gameModVersions.$inferSelect)[] = []
) {
    const imageKeys = Array.isArray(row.images) ? row.images : []
    const latest = versions[0] || null
    return {
        ...row,
        requires: row.requires || [],
        /** 封面静态直链（OSS/CDN），未设置封面时为 null。 */
        coverUrl: row.coverKey ? getModFileUrl(row.coverKey) : null,
        /** 预览图（非封面）静态直链列表（OSS/CDN）。 */
        images: imageKeys.map(key => getModFileUrl(key)),
        status: row.status || "pending",
        views: row.views ?? 0,
        downloads: row.downloads ?? 0,
        likes: row.likes ?? 0,
        isActive: row.isActive ?? true,
        isRecommended: row.isRecommended ?? false,
        isPinned: row.isPinned ?? false,
        createdAt: row.createdAt ?? 0,
        updateAt: row.updateAt ?? 0,
        /** 文件属性由最新版本提供（兼容旧字段）。 */
        fileName: latest?.fileName || "",
        fileSize: latest?.fileSize ?? 0,
        latestVersion: latest ? toGameModVersionRow(latest) : null,
        versions: versions.map(toGameModVersionRow),
    }
}

/**
 * @description 将版本行转换为对外结构。
 * @param row 版本数据库行。
 * @returns 对外版本结构。
 */
function toGameModVersionRow(row: typeof schema.gameModVersions.$inferSelect) {
    return {
        ...row,
        downloads: row.downloads ?? 0,
        createdAt: row.createdAt ?? 0,
    }
}

export const typeDefs = /* GraphQL */ `
    type GameModVersion {
        id: String!
        version: String!
        changelog: String
        fileName: String!
        fileSize: Int!
        downloads: Int!
        createdAt: Float!
    }

    type GameMod {
        id: String!
        name: String!
        description: String
        category: String!
        entity: String
        fileName: String!
        fileSize: Int!
        coverUrl: String
        images: [String!]
        status: String!
        modJson: String
        requires: [String!]
        source: String
        userId: String!
        downloads: Int!
        views: Int!
        likes: Int!
        isActive: Boolean!
        isRecommended: Boolean
        isPinned: Boolean
        createdAt: Float!
        updateAt: Float!
        user: User
        versions: [GameModVersion!]
        latestVersion: GameModVersion
    }

    input GameModInput {
        name: String
        description: String
        category: String
        entity: String
        requires: [String!]
        source: String
    }

    type Mutation {
        updateGameMod(id: String!, input: GameModInput!): GameMod
        deleteGameMod(id: String!): Boolean
        deleteGameModVersion(id: String!): Boolean
        recommendGameMod(id: String!, recommended: Boolean!): GameMod
        pinGameMod(id: String!, pinned: Boolean!): GameMod
        setGameModActive(id: String!, active: Boolean!): GameMod
        approveGameMod(id: String!): GameMod
        rejectGameMod(id: String!): GameMod
    }

    type Query {
        gameMods(
            search: String
            category: String
            entity: String
            userId: String
            active: Boolean
            status: String
            mine: Boolean
            limit: Int = 20
            offset: Int = 0
            sortBy: String
        ): [GameMod!]!
        gameModsCount(search: String, category: String, entity: String, active: Boolean, status: String, mine: Boolean): Int!
        gameMod(id: String!): GameMod
    }
`

/**
 * @description 根据查询参数拼装 gameMods 的查询条件。
 * @param args 查询参数。
 * @returns 条件数组。
 */
function buildGameModConditions(args: {
    search?: string
    category?: string
    entity?: string
    userId?: string
    active?: boolean
    status?: string
}) {
    const conditions = []
    if (args.search) {
        conditions.push(like(schema.gameMods.name, `%${args.search}%`))
    }
    if (args.category) {
        conditions.push(eq(schema.gameMods.category, args.category))
    }
    if (args.entity) {
        conditions.push(eq(schema.gameMods.entity, args.entity))
    }
    if (args.userId) {
        conditions.push(eq(schema.gameMods.userId, args.userId))
    }
    if (typeof args.active === "boolean") {
        conditions.push(eq(schema.gameMods.isActive, args.active))
    }
    if (args.status) {
        conditions.push(eq(schema.gameMods.status, args.status))
    }
    return conditions
}

/**
 * @description 非管理员查询一律只看已审核通过的 MOD（待审核/已拒绝对普通用户不可见）。
 * 管理员可通过 status 参数筛选任意审核状态。
 * @param status 客户端传入的审核状态过滤。
 * @param isAdmin 是否管理员。
 * @returns 最终生效的审核状态过滤。
 */
function resolveStatusFilter(status: string | undefined, isAdmin: boolean): string | undefined {
    if (isAdmin) return status || undefined
    return "approved"
}

/**
 * @description 按 id 查询单个 MOD，供多个解析器复用（附带最新版本，供 fileName/fileSize 计算）。
 * @param id MOD id。
 * @param info 可选 GraphQL 查询信息，用于附带 user。
 * @returns MOD 行。
 */
async function findGameModById(id: string, info?: GraphQLResolveInfo) {
    return db.query.gameMods.findFirst({
        where: eq(schema.gameMods.id, id),
        with: {
            ...(info && getSubSelection(info, "user") ? { user: true } : {}),
            versions: {
                orderBy: [desc(schema.gameModVersions.createdAt), desc(schema.gameModVersions.id)],
                limit: 1,
            },
        },
    })
}

/**
 * @description 解析「我的发布」过滤：mine 为真时强制只看当前登录用户的 MOD（含待审核/已拒绝）。
 * @param mine 是否只看自己的发布。
 * @param contextUser 当前登录用户。
 * @param userId 客户端传入的 userId 过滤。
 * @returns 生效的 userId 过滤。
 */
function resolveMineUserId(mine: boolean | undefined, contextUser: { id: string } | undefined, userId?: string): string | undefined {
    if (mine) return contextUser?.id || "__none__"
    return userId
}

export const resolvers = {
    Query: {
        gameMods: async (_parent, args, context, info) => {
            const { search, category, entity, userId, active, status, mine, limit = 20, offset = 0, sortBy = "latest" } = args || {}
            const isAdmin = !!context.user?.roles?.includes("admin")
            // mine 模式（看自己的发布）不强制 approved；其余非管理员一律只看已审核通过
            const effectiveStatus = mine ? status || undefined : resolveStatusFilter(status, isAdmin)
            const effectiveUserId = resolveMineUserId(mine, context.user, userId)
            const conditions = buildGameModConditions({
                search,
                category,
                entity,
                userId: effectiveUserId,
                active,
                status: effectiveStatus,
            })

            let orderBy: any[]
            switch (sortBy) {
                case "downloads":
                    orderBy = [desc(schema.gameMods.downloads)]
                    break
                case "likes":
                    orderBy = [desc(schema.gameMods.likes)]
                    break
                case "views":
                    orderBy = [desc(schema.gameMods.views)]
                    break
                default:
                    orderBy = [desc(schema.gameMods.updateAt), desc(schema.gameMods.createdAt)]
            }

            const result = await db.query.gameMods.findMany({
                where: conditions.length > 0 ? and(...conditions) : undefined,
                orderBy,
                limit,
                offset,
                with: {
                    ...(getSubSelection(info, "user") ? { user: true } : {}),
                    // 列表仅加载最新版本，用于 fileName/fileSize/latestVersion；完整版本列表走 GameMod.versions 字段解析器
                    versions: {
                        orderBy: [desc(schema.gameModVersions.createdAt), desc(schema.gameModVersions.id)],
                        limit: 1,
                    },
                },
            })
            return result.map(row => toGameModRow(row, row.versions || []))
        },
        gameModsCount: async (_parent, args, context) => {
            const { search, category, entity, active, status, mine } = args || {}
            const isAdmin = !!context.user?.roles?.includes("admin")
            const effectiveStatus = mine ? status || undefined : resolveStatusFilter(status, isAdmin)
            const effectiveUserId = resolveMineUserId(mine, context.user)
            const conditions = buildGameModConditions({
                search,
                category,
                entity,
                userId: effectiveUserId,
                active,
                status: effectiveStatus,
            })
            const whereClause = conditions.length > 0 ? and(...conditions) : undefined
            const [result] = await db.select({ count: sql<number>`count(*)` }).from(schema.gameMods).where(whereClause)
            return result?.count || 0
        },
        gameMod: async (_parent, args, _context, info) => {
            const { id } = args
            // 详情查询加载全部版本（按创建时间倒序），供 versions/latestVersion 字段使用
            const row = await db.query.gameMods.findFirst({
                where: eq(schema.gameMods.id, id),
                with: {
                    ...(getSubSelection(info, "user") ? { user: true } : {}),
                    versions: {
                        orderBy: [desc(schema.gameModVersions.createdAt), desc(schema.gameModVersions.id)],
                    },
                },
            })
            if (!row) {
                throw createGraphQLError("MOD 不存在")
            }
            await db
                .update(schema.gameMods)
                .set({ views: sql`${schema.gameMods.views} + 1` })
                .where(eq(schema.gameMods.id, id))
            return toGameModRow(row, row.versions || [])
        },
    },
    Mutation: {
        updateGameMod: async (_parent, args, context, info) => {
            if (!context.user) {
                throw createGraphQLError("需要登录")
            }
            const { id, input } = args
            validateGameModInput(input)

            const row = await findGameModById(id)
            if (!row) {
                throw createGraphQLError("MOD 不存在")
            }
            if (row.userId !== context.user.id && !context.user.roles?.includes("admin")) {
                throw createGraphQLError("无权修改此 MOD")
            }

            const normalized: Record<string, unknown> = {}
            if (input.name !== undefined && input.name !== null) normalized.name = input.name.trim()
            if (input.description !== undefined) normalized.description = input.description?.trim() || null
            if (input.category !== undefined && input.category !== null) normalized.category = input.category
            if (input.entity !== undefined) normalized.entity = input.entity?.trim() || ""
            if (input.requires !== undefined && input.requires !== null) normalized.requires = input.requires
            if (input.source !== undefined) normalized.source = input.source?.trim() || null
            normalized.updateAt = schema.now()

            const [updated] = await db.update(schema.gameMods).set(normalized).where(eq(schema.gameMods.id, id)).returning()

            if (!updated) {
                throw createGraphQLError("更新失败")
            }
            const result = await findGameModById(id, info)
            if (!result) {
                throw createGraphQLError("更新失败")
            }
            return toGameModRow(result, result.versions || [])
        },
        deleteGameMod: async (_parent, args, context) => {
            if (!context.user) {
                throw createGraphQLError("需要登录")
            }
            const { id } = args
            const row = await findGameModById(id)
            if (!row) {
                throw createGraphQLError("MOD 不存在")
            }
            if (row.userId !== context.user.id && !context.user.roles?.includes("admin")) {
                throw createGraphQLError("无权删除此 MOD")
            }
            // 先取全部版本的文件 key，删除发布后一并清理 OSS 对象
            const versions = await db.query.gameModVersions.findMany({
                where: eq(schema.gameModVersions.modId, id),
                columns: { fileKey: true },
            })
            await db.delete(schema.gameMods).where(eq(schema.gameMods.id, id))
            // 同步删除 OSS 上的压缩包（全部版本）/封面/预览图（异步失败仅记录日志，不影响删除结果）
            void deleteModFiles(null, row.coverKey, [...(row.images || []), ...versions.map(version => version.fileKey)])
            return true
        },
        deleteGameModVersion: async (_parent, args, context) => {
            if (!context.user) {
                throw createGraphQLError("需要登录")
            }
            const { id } = args
            const version = await db.query.gameModVersions.findFirst({
                where: eq(schema.gameModVersions.id, id),
            })
            if (!version) {
                throw createGraphQLError("版本不存在")
            }
            const mod = await db.query.gameMods.findFirst({
                where: eq(schema.gameMods.id, version.modId),
                columns: { id: true, userId: true },
            })
            if (!mod) {
                throw createGraphQLError("MOD 不存在")
            }
            if (mod.userId !== context.user.id && !context.user.roles?.includes("admin")) {
                throw createGraphQLError("无权删除此版本")
            }
            await db.delete(schema.gameModVersions).where(eq(schema.gameModVersions.id, id))
            await db.update(schema.gameMods).set({ updateAt: schema.now() }).where(eq(schema.gameMods.id, mod.id))
            // 同步删除 OSS 对象（异步失败仅记录日志）
            void deleteModFiles(version.fileKey, null)
            return true
        },
        recommendGameMod: async (_parent, args, context, info) => {
            if (!context.user?.roles?.includes("admin")) {
                throw createGraphQLError("无权限")
            }
            const { id, recommended } = args
            const row = await findGameModById(id)
            if (!row) {
                throw createGraphQLError("MOD 不存在")
            }
            const [updated] = await db
                .update(schema.gameMods)
                .set({ isRecommended: recommended })
                .where(eq(schema.gameMods.id, id))
                .returning()
            if (!updated) {
                throw createGraphQLError("更新失败")
            }
            const result = await findGameModById(id, info)
            if (!result) {
                throw createGraphQLError("MOD 不存在")
            }
            return toGameModRow(result, result.versions || [])
        },
        pinGameMod: async (_parent, args, context, info) => {
            if (!context.user?.roles?.includes("admin")) {
                throw createGraphQLError("无权限")
            }
            const { id, pinned } = args
            const row = await findGameModById(id)
            if (!row) {
                throw createGraphQLError("MOD 不存在")
            }
            const [updated] = await db.update(schema.gameMods).set({ isPinned: pinned }).where(eq(schema.gameMods.id, id)).returning()
            if (!updated) {
                throw createGraphQLError("更新失败")
            }
            const result = await findGameModById(id, info)
            if (!result) {
                throw createGraphQLError("MOD 不存在")
            }
            return toGameModRow(result, result.versions || [])
        },
        setGameModActive: async (_parent, args, context, info) => {
            if (!context.user?.roles?.includes("admin")) {
                throw createGraphQLError("无权限")
            }
            const { id, active } = args
            const row = await findGameModById(id)
            if (!row) {
                throw createGraphQLError("MOD 不存在")
            }
            const [updated] = await db.update(schema.gameMods).set({ isActive: active }).where(eq(schema.gameMods.id, id)).returning()
            if (!updated) {
                throw createGraphQLError("更新失败")
            }
            const result = await findGameModById(id, info)
            if (!result) {
                throw createGraphQLError("MOD 不存在")
            }
            return toGameModRow(result, result.versions || [])
        },
        approveGameMod: async (_parent, args, context, info) => {
            if (!context.user?.roles?.includes("admin")) {
                throw createGraphQLError("无权限")
            }
            const { id } = args
            const row = await findGameModById(id)
            if (!row) {
                throw createGraphQLError("MOD 不存在")
            }
            const [updated] = await db
                .update(schema.gameMods)
                .set({ status: "approved", isActive: true })
                .where(eq(schema.gameMods.id, id))
                .returning()
            if (!updated) {
                throw createGraphQLError("更新失败")
            }
            const result = await findGameModById(id, info)
            if (!result) {
                throw createGraphQLError("MOD 不存在")
            }
            return toGameModRow(result, result.versions || [])
        },
        rejectGameMod: async (_parent, args, context, info) => {
            if (!context.user?.roles?.includes("admin")) {
                throw createGraphQLError("无权限")
            }
            const { id } = args
            const row = await findGameModById(id)
            if (!row) {
                throw createGraphQLError("MOD 不存在")
            }
            const [updated] = await db
                .update(schema.gameMods)
                .set({ status: "rejected", isActive: false })
                .where(eq(schema.gameMods.id, id))
                .returning()
            if (!updated) {
                throw createGraphQLError("更新失败")
            }
            const result = await findGameModById(id, info)
            if (!result) {
                throw createGraphQLError("MOD 不存在")
            }
            return toGameModRow(result, result.versions || [])
        },
    },
} satisfies Resolver<CreateMobius<typeof typeDefs>, Context>

export type GameModGQL = CreateMobius<typeof typeDefs>
