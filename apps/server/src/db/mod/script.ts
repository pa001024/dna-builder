import type { CreateMobius, Resolver } from "@pa001024/graphql-mobius"
import { and, desc, eq, like, sql } from "drizzle-orm"
import { createGraphQLError } from "graphql-yoga"
import { replaceScriptHeader } from "../../util/script-header"
import { db, schema } from ".."
import type { Context } from "../yoga"
import { getSubSelection } from "."

/**
 * 确保脚本分类存在；若不存在则自动创建。
 * @param category 原始分类名称
 * @returns 规范化后的分类名称
 */
async function ensureScriptCategory(category: string) {
    const normalizedCategory = category.trim() || "其他"
    const existing = await db.query.scriptCategories.findFirst({
        where: eq(schema.scriptCategories.name, normalizedCategory),
    })

    if (!existing) {
        await db.insert(schema.scriptCategories).values({
            name: normalizedCategory,
        })
    }

    return normalizedCategory
}

export const typeDefs = /* GraphQL */ `
    type Script {
        id: String!
        title: String!
        description: String
        content: String!
        category: String!
        userId: String!
        views: Int!
        likes: Int!
        isRecommended: Boolean
        isPinned: Boolean
        createdAt: Float!
        updateAt: Float!
        user: User
        isLiked: Boolean
    }

    input ScriptInput {
        title: String!
        description: String
        content: String!
        category: String!
    }

    type Mutation {
        createScript(input: ScriptInput!): Script
        updateScript(id: String!, input: ScriptInput!): Script
        deleteScript(id: String!): Boolean
        likeScript(id: String!): Script
        unlikeScript(id: String!): Script
        recommendScript(id: String!, recommended: Boolean!): Script
        pinScript(id: String!, pinned: Boolean!): Script
    }

    type Query {
        scripts(search: String, category: String, userId: String, limit: Int = 20, offset: Int = 0): [Script!]!
        scriptsCount(search: String, category: String): Int!
        script(id: String!, preview: Boolean = false): Script
    }
`

export const resolvers = {
    Query: {
        scripts: async (_parent, args, context, info) => {
            const { search, category, userId, limit = 20, offset = 0 } = args || {}
            const conditions = []

            if (search) {
                conditions.push(like(schema.scripts.title, `%${search}%`))
            }

            if (category) {
                conditions.push(eq(schema.scripts.category, category))
            }
            if (userId) {
                conditions.push(eq(schema.scripts.userId, userId))
            }

            const result = await db.query.scripts.findMany({
                where: conditions.length > 0 ? and(...conditions) : undefined,
                orderBy: [desc(schema.scripts.views), desc(schema.scripts.createdAt)],
                limit,
                offset,
                with: { user: getSubSelection(info, "user") ? true : undefined },
            })

            const likedScriptIds = context.user
                ? new Set(
                      (
                          await db
                              .select({ scriptId: schema.scriptLikes.scriptId })
                              .from(schema.scriptLikes)
                              .where(eq(schema.scriptLikes.userId, context.user.id))
                      ).map(r => r.scriptId)
                  )
                : new Set()
            return result.map(script => {
                return {
                    ...script,
                    description: script.description ?? "",
                    views: script.views ?? 0,
                    likes: script.likes ?? 0,
                    isRecommended: script.isRecommended ?? false,
                    isPinned: script.isPinned ?? false,
                    createdAt: script.createdAt ?? 0,
                    updateAt: script.updateAt ?? 0,
                    isLiked: likedScriptIds.has(script.id),
                }
            })
        },
        scriptsCount: async (_parent, args) => {
            const search = args?.search
            const category = args?.category
            const conditions = []

            if (search) {
                conditions.push(like(schema.scripts.title, `%${search}%`))
            }

            if (category) {
                conditions.push(eq(schema.scripts.category, category))
            }

            const whereClause = conditions.length > 0 ? and(...conditions) : undefined

            const [result] = await db.select({ count: sql<number>`count(*)` }).from(schema.scripts).where(whereClause)
            return result?.count || 0
        },
        script: async (_parent, args, context, info) => {
            const { id, preview = false } = args
            const script = await db.query.scripts.findFirst({
                where: eq(schema.scripts.id, id),
                with: { user: getSubSelection(info, "user") ? true : undefined },
            })

            if (!script) {
                throw createGraphQLError("脚本不存在")
            }

            if (!preview) {
                await db
                    .update(schema.scripts)
                    .set({ views: sql`${schema.scripts.views} + 1` })
                    .where(eq(schema.scripts.id, id))
            }

            let isLiked = false
            if (context.user) {
                const [like] = await db
                    .select()
                    .from(schema.scriptLikes)
                    .where(and(eq(schema.scriptLikes.userId, context.user.id), eq(schema.scriptLikes.scriptId, id)))
                isLiked = !!like
            }

            return {
                ...script,
                description: script.description ?? "",
                views: (script.views ?? 0) + 1,
                likes: script.likes ?? 0,
                isRecommended: script.isRecommended ?? false,
                isPinned: script.isPinned ?? false,
                createdAt: script.createdAt ?? 0,
                updateAt: script.updateAt ?? 0,
                isLiked,
            }
        },
    },
    Mutation: {
        createScript: async (_parent, args, context, info) => {
            if (!context.user) {
                throw createGraphQLError("未登录")
            }

            const { input } = args
            const category = await ensureScriptCategory(input.category)
            const updateAt = schema.now()

            const [script] = await db
                .insert(schema.scripts)
                .values({
                    ...input,
                    category,
                    userId: context.user.id,
                })
                .returning()

            const content = replaceScriptHeader(input.content, {
                id: script.id,
                name: input.title,
                author: context.user.name,
                date: updateAt,
            })
            await db.update(schema.scripts).set({ content, updateAt }).where(eq(schema.scripts.id, script.id))
            let result = { ...script, content, updateAt }
            if (getSubSelection(info, "user")) {
                const userScript = await db.query.scripts.findFirst({
                    where: eq(schema.scripts.id, script.id),
                    with: { user: true },
                })
                if (userScript) {
                    result = {
                        ...userScript,
                        content,
                        updateAt,
                    }
                }
            }

            return {
                ...result,
                description: result.description ?? "",
                views: result.views ?? 0,
                likes: result.likes ?? 0,
                isRecommended: result.isRecommended ?? false,
                isPinned: result.isPinned ?? false,
                createdAt: result.createdAt ?? 0,
                updateAt: result.updateAt ?? 0,
                isLiked: false,
            }
        },
        updateScript: async (_parent, args, context, info) => {
            if (!context.user) {
                throw createGraphQLError("未登录")
            }

            const { id, input } = args
            const updateAt = schema.now()
            const script = await db.query.scripts.findFirst({
                where: eq(schema.scripts.id, id),
            })

            if (!script) {
                throw createGraphQLError("脚本不存在")
            }
            if (script.userId !== context.user.id && !context.user.roles?.includes("admin")) {
                throw createGraphQLError("无权修改此脚本")
            }

            const content = replaceScriptHeader(input.content, {
                id: script.id,
                name: input.title,
                author: context.user.name,
                date: updateAt,
            })

            const [updated] = await db
                .update(schema.scripts)
                .set({ ...input, content, updateAt })
                .where(eq(schema.scripts.id, id))
                .returning()

            let isLiked = false
            const [like] = await db
                .select()
                .from(schema.scriptLikes)
                .where(and(eq(schema.scriptLikes.userId, context.user.id), eq(schema.scriptLikes.scriptId, id)))
            isLiked = !!like

            let result = { ...updated, updateAt }
            if (getSubSelection(info, "user")) {
                const userScript = await db.query.scripts.findFirst({
                    where: eq(schema.scripts.id, id),
                    with: { user: true },
                })
                if (userScript) {
                    result = {
                        ...userScript,
                        content,
                        updateAt,
                    }
                }
            }

            return {
                ...result,
                content: result.content,
                description: result.description ?? "",
                views: result.views ?? 0,
                likes: result.likes ?? 0,
                isRecommended: result.isRecommended ?? false,
                isPinned: result.isPinned ?? false,
                createdAt: result.createdAt ?? 0,
                updateAt: result.updateAt ?? 0,
                isLiked,
            }
        },
        deleteScript: async (_parent, { id }, context) => {
            if (!context.user) {
                throw createGraphQLError("未登录")
            }

            const script = await db.query.scripts.findFirst({
                where: eq(schema.scripts.id, id),
            })

            if (!script) {
                throw createGraphQLError("脚本不存在")
            }
            if (script.userId !== context.user.id && !context.user.roles?.includes("admin")) {
                throw createGraphQLError("无权删除此脚本")
            }

            await db.delete(schema.scripts).where(eq(schema.scripts.id, id))
            return true
        },
        likeScript: async (_parent, args, context, info) => {
            if (!context.user) {
                throw createGraphQLError("需要登录")
            }

            const { id } = args
            const script = await db.query.scripts.findFirst({
                where: eq(schema.scripts.id, id),
            })

            if (!script) {
                throw createGraphQLError("脚本不存在")
            }

            const [existing] = await db
                .select()
                .from(schema.scriptLikes)
                .where(and(eq(schema.scriptLikes.userId, context.user.id), eq(schema.scriptLikes.scriptId, id)))

            if (existing) {
                throw createGraphQLError("已经点赞过了")
            }

            await db.insert(schema.scriptLikes).values({
                scriptId: id,
                userId: context.user.id,
            })

            await db
                .update(schema.scripts)
                .set({ likes: sql`${schema.scripts.likes} + 1` })
                .where(eq(schema.scripts.id, id))

            const updated = await db.query.scripts.findFirst({
                where: eq(schema.scripts.id, id),
                with: { user: getSubSelection(info, "user") ? true : undefined },
            })

            if (!updated) {
                throw createGraphQLError("脚本不存在")
            }

            return {
                ...updated,
                description: updated.description ?? "",
                views: updated.views ?? 0,
                likes: (script.likes ?? 0) + 1,
                isRecommended: updated.isRecommended ?? false,
                isPinned: updated.isPinned ?? false,
                createdAt: updated.createdAt ?? 0,
                updateAt: updated.updateAt ?? 0,
                isLiked: true,
            }
        },
        unlikeScript: async (_parent, args, context, info) => {
            if (!context.user) {
                throw createGraphQLError("需要登录")
            }

            const { id } = args
            const script = await db.query.scripts.findFirst({
                where: eq(schema.scripts.id, id),
            })

            if (!script) {
                throw createGraphQLError("脚本不存在")
            }

            await db
                .delete(schema.scriptLikes)
                .where(and(eq(schema.scriptLikes.userId, context.user.id), eq(schema.scriptLikes.scriptId, id)))

            await db
                .update(schema.scripts)
                .set({ likes: sql`${schema.scripts.likes} - 1` })
                .where(eq(schema.scripts.id, id))

            const updated = await db.query.scripts.findFirst({
                where: eq(schema.scripts.id, id),
                with: { user: getSubSelection(info, "user") ? true : undefined },
            })

            if (!updated) {
                throw createGraphQLError("脚本不存在")
            }

            return {
                ...updated,
                description: updated.description ?? "",
                views: updated.views ?? 0,
                likes: Math.max(0, (script.likes ?? 0) - 1),
                isRecommended: updated.isRecommended ?? false,
                isPinned: updated.isPinned ?? false,
                createdAt: updated.createdAt ?? 0,
                updateAt: updated.updateAt ?? 0,
                isLiked: false,
            }
        },
        recommendScript: async (_parent, { id, recommended }, context, info) => {
            if (!context.user?.roles?.includes("admin")) {
                throw createGraphQLError("无权限")
            }

            const script = await db.query.scripts.findFirst({
                where: eq(schema.scripts.id, id),
            })

            if (!script) {
                throw createGraphQLError("脚本不存在")
            }

            const [updated] = await db
                .update(schema.scripts)
                .set({ isRecommended: recommended })
                .where(eq(schema.scripts.id, id))
                .returning()

            if (!updated) {
                throw createGraphQLError("更新脚本失败")
            }

            const result = await db.query.scripts.findFirst({
                where: eq(schema.scripts.id, id),
                with: { user: getSubSelection(info, "user") ? true : undefined },
            })

            if (!result) {
                throw createGraphQLError("脚本不存在")
            }

            let isLiked = false
            const [like] = await db
                .select()
                .from(schema.scriptLikes)
                .where(and(eq(schema.scriptLikes.userId, context.user.id), eq(schema.scriptLikes.scriptId, id)))
            isLiked = !!like

            return {
                ...result,
                description: result.description ?? "",
                views: result.views ?? 0,
                likes: result.likes ?? 0,
                createdAt: result.createdAt ?? 0,
                updateAt: result.updateAt ?? 0,
                isLiked,
            }
        },
        pinScript: async (_parent, { id, pinned }, context, info) => {
            if (!context.user?.roles?.includes("admin")) {
                throw createGraphQLError("无权限")
            }

            const script = await db.query.scripts.findFirst({
                where: eq(schema.scripts.id, id),
            })

            if (!script) {
                throw createGraphQLError("脚本不存在")
            }

            const [updated] = await db.update(schema.scripts).set({ isPinned: pinned }).where(eq(schema.scripts.id, id)).returning()

            if (!updated) {
                throw createGraphQLError("更新脚本失败")
            }

            const result = await db.query.scripts.findFirst({
                where: eq(schema.scripts.id, id),
                with: { user: getSubSelection(info, "user") ? true : undefined },
            })

            if (!result) {
                throw createGraphQLError("脚本不存在")
            }

            let isLiked = false
            const [like] = await db
                .select()
                .from(schema.scriptLikes)
                .where(and(eq(schema.scriptLikes.userId, context.user.id), eq(schema.scriptLikes.scriptId, id)))
            isLiked = !!like

            return {
                ...result,
                description: result.description ?? "",
                views: result.views ?? 0,
                likes: result.likes ?? 0,
                createdAt: result.createdAt ?? 0,
                updateAt: result.updateAt ?? 0,
                isLiked,
            }
        },
    },
} satisfies Resolver<CreateMobius<typeof typeDefs>, Context>
