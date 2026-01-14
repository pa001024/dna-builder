import type { CreateMobius, Resolver } from "@pa001024/graphql-mobius"
import { eq, and, desc, sql, like } from "drizzle-orm"
import { db, schema } from ".."
import type { Context } from "../yoga"
import { createGraphQLError } from "graphql-yoga"
import { sanitizeHTML } from "../../util/html"
import { getSubSelection } from "."

function isSafeURL(value: string): boolean {
    if (!value || typeof value !== "string") return false

    const valueLower = value.toLowerCase().trim()

    if (valueLower.startsWith("javascript:")) return false
    if (valueLower.startsWith("vbscript:")) return false
    if (valueLower.startsWith("data:")) return false
    if (valueLower.startsWith("file:")) return false
    if (valueLower.startsWith("about:")) return false

    return true
}

function sanitizeImages(images: string[]): string[] {
    if (!images || !Array.isArray(images)) return []

    return images.filter((url) => isSafeURL(url))
}

export { isSafeURL, sanitizeImages }

export const typeDefs = /* GraphQL */ `
    type Guide {
        id: String!
        title: String!
        type: String!
        content: String!
        images: [String!]!
        charId: Int
        userId: String!
        charSettings: String
        views: Int!
        likes: Int!
        isRecommended: Boolean
        isPinned: Boolean
        createdAt: String!
        updateAt: String!
        user: User
        isLiked: Boolean
    }

    input GuideInput {
        title: String!
        type: String!
        content: String!
        images: [String!]!
        charId: Int
        charSettings: String
    }

    type Mutation {
        createGuide(input: GuideInput!): Guide
        updateGuide(id: String!, input: GuideInput!): Guide
        deleteGuide(id: String!): Boolean
        likeGuide(id: String!): Guide
        unlikeGuide(id: String!): Guide
        recommendGuide(id: String!, recommended: Boolean!): Guide
        pinGuide(id: String!, pinned: Boolean!): Guide
    }

    type Query {
        guides(search: String, type: String, charId: Int, userId: String, limit: Int = 20, offset: Int = 0): [Guide!]!
        guidesCount(search: String, type: String): Int!
        guide(id: String!): Guide
    }
`

export const resolvers = {
    Query: {
        guides: async (parent, args, context, info) => {
            const { search, type, charId, userId, limit = 20, offset = 0 } = args || {}
            const conditions = []

            if (search) {
                conditions.push(like(schema.guides.title, `%${search}%`))
            }

            if (type) {
                conditions.push(eq(schema.guides.type, type))
            }
            if (charId) {
                conditions.push(eq(schema.guides.charId, charId))
            }
            if (userId) {
                conditions.push(eq(schema.guides.userId, userId))
            }

            const result = await db.query.guides.findMany({
                where: conditions.length > 0 ? and(...conditions) : undefined,
                orderBy: [desc(schema.guides.createdAt)],
                limit,
                offset,
                with: { user: getSubSelection(info, "user") ? true : undefined },
            })

            const guidesWithLiked = await Promise.all(
                result.map(async (guide) => {
                    let isLiked = false
                    if (context.user) {
                        const [like] = await db
                            .select()
                            .from(schema.guideLikes)
                            .where(and(eq(schema.guideLikes.userId, context.user.id), eq(schema.guideLikes.guideId, guide.id)))
                        isLiked = !!like
                    }

                    return {
                        ...guide,
                        images: guide.images || [],
                        charSettings: guide.charSettings ? JSON.stringify(guide.charSettings) : undefined,
                        views: guide.views ?? 0,
                        likes: guide.likes ?? 0,
                        isRecommended: guide.isRecommended ?? false,
                        isPinned: guide.isPinned ?? false,
                        createdAt: guide.createdAt ?? "",
                        updateAt: guide.updateAt ?? "",
                        isLiked,
                    }
                }),
            )

            return guidesWithLiked
        },
        guidesCount: async (parent, args) => {
            const search = args?.search
            const type = args?.type
            const conditions = []

            if (search) {
                conditions.push(like(schema.guides.title, `%${search}%`))
            }

            if (type) {
                conditions.push(eq(schema.guides.type, type))
            }

            const whereClause = conditions.length > 0 ? and(...conditions) : undefined

            const [result] = await db
                .select({ count: sql<number>`count(*)` })
                .from(schema.guides)
                .where(whereClause)
            return result?.count || 0
        },
        guide: async (parent, args, context, info) => {
            const { id } = args
            const guide = await db.query.guides.findFirst({
                where: eq(schema.guides.id, id),
                with: { user: getSubSelection(info, "user") ? true : undefined },
            })

            if (!guide) {
                throw createGraphQLError("攻略不存在")
            }

            await db
                .update(schema.guides)
                .set({ views: sql`${schema.guides.views} + 1` })
                .where(eq(schema.guides.id, id))

            let isLiked = false
            if (context.user) {
                const [like] = await db
                    .select()
                    .from(schema.guideLikes)
                    .where(and(eq(schema.guideLikes.userId, context.user.id), eq(schema.guideLikes.guideId, id)))
                isLiked = !!like
            }

            return {
                ...guide,
                images: guide.images || [],
                charSettings: guide.charSettings ? JSON.stringify(guide.charSettings) : undefined,
                views: (guide.views ?? 0) + 1,
                likes: guide.likes ?? 0,
                isRecommended: guide.isRecommended ?? false,
                isPinned: guide.isPinned ?? false,
                createdAt: guide.createdAt ?? "",
                updateAt: guide.updateAt ?? "",
                isLiked,
            }
        },
    },
    Mutation: {
        createGuide: async (parent, args, context, info) => {
            if (!context.user) {
                throw createGraphQLError("需要登录")
            }

            const { input } = args
            const sanitizedInput = {
                ...input,
                images: sanitizeImages(input.images),
                charSettings: input.charSettings ? JSON.parse(input.charSettings) : undefined,
            }

            const [guide] = await db
                .insert(schema.guides)
                .values({
                    ...sanitizedInput,
                    userId: context.user.id,
                })
                .returning()

            let result = guide
            if (getSubSelection(info, "user")) {
                const userGuide = await db.query.guides.findFirst({
                    where: eq(schema.guides.id, guide.id),
                    with: { user: true },
                })
                if (userGuide) result = userGuide
            }

            return {
                ...result,
                images: result.images || [],
                charSettings: result.charSettings ? JSON.stringify(result.charSettings) : undefined,
                views: result.views ?? 0,
                likes: result.likes ?? 0,
                isRecommended: result.isRecommended ?? false,
                isPinned: result.isPinned ?? false,
                createdAt: result.createdAt ?? "",
                updateAt: result.updateAt ?? "",
                isLiked: false,
            }
        },
        updateGuide: async (parent, args, context, info) => {
            if (!context.user) {
                throw createGraphQLError("需要登录")
            }

            const { id, input } = args
            const guide = await db.query.guides.findFirst({
                where: eq(schema.guides.id, id),
            })

            if (!guide) {
                throw createGraphQLError("攻略不存在")
            }

            if (guide.userId !== context.user.id) {
                throw createGraphQLError("无权修改此攻略")
            }

            const sanitizedInput = {
                ...input,
                images: sanitizeImages(input.images),
                charSettings: input.charSettings ? JSON.parse(input.charSettings) : undefined,
            }

            const [updated] = await db.update(schema.guides).set(sanitizedInput).where(eq(schema.guides.id, id)).returning()

            let isLiked = false
            const [like] = await db
                .select()
                .from(schema.guideLikes)
                .where(and(eq(schema.guideLikes.userId, context.user.id), eq(schema.guideLikes.guideId, id)))
            isLiked = !!like

            let result = updated
            if (getSubSelection(info, "user")) {
                const userGuide = await db.query.guides.findFirst({
                    where: eq(schema.guides.id, id),
                    with: { user: true },
                })
                if (userGuide) result = userGuide
            }

            return {
                ...result,
                content: sanitizeHTML(result.content),
                images: result.images || [],
                charSettings: result.charSettings ? JSON.stringify(result.charSettings) : undefined,
                views: result.views ?? 0,
                likes: result.likes ?? 0,
                isRecommended: result.isRecommended ?? false,
                isPinned: result.isPinned ?? false,
                createdAt: result.createdAt ?? "",
                updateAt: result.updateAt ?? "",
                isLiked,
            }
        },
        deleteGuide: async (parent, { id }, context) => {
            if (!context.user) {
                throw createGraphQLError("需要登录")
            }

            const guide = await db.query.guides.findFirst({
                where: eq(schema.guides.id, id),
            })

            if (!guide) {
                throw createGraphQLError("攻略不存在")
            }

            if (guide.userId !== context.user.id && !context.user.roles?.includes("admin")) {
                throw createGraphQLError("无权删除此攻略")
            }

            await db.delete(schema.guides).where(eq(schema.guides.id, id))
            return true
        },
        likeGuide: async (parent, args, context, info) => {
            if (!context.user) {
                throw createGraphQLError("需要登录")
            }

            const { id } = args
            const guide = await db.query.guides.findFirst({
                where: eq(schema.guides.id, id),
            })

            if (!guide) {
                throw createGraphQLError("攻略不存在")
            }

            const [existing] = await db
                .select()
                .from(schema.guideLikes)
                .where(and(eq(schema.guideLikes.userId, context.user.id), eq(schema.guideLikes.guideId, id)))

            if (existing) {
                throw createGraphQLError("已经点赞过了")
            }

            await db.insert(schema.guideLikes).values({
                guideId: id,
                userId: context.user.id,
            })

            await db
                .update(schema.guides)
                .set({ likes: sql`${schema.guides.likes} + 1` })
                .where(eq(schema.guides.id, id))

            const updated = await db.query.guides.findFirst({
                where: eq(schema.guides.id, id),
                with: { user: getSubSelection(info, "user") ? true : undefined },
            })

            if (!updated) {
                throw createGraphQLError("攻略不存在")
            }

            return {
                ...updated,
                images: updated.images || [],
                charSettings: updated.charSettings ? JSON.stringify(updated.charSettings) : undefined,
                views: updated.views ?? 0,
                likes: (guide.likes ?? 0) + 1,
                isRecommended: updated.isRecommended ?? false,
                isPinned: updated.isPinned ?? false,
                createdAt: updated.createdAt ?? "",
                updateAt: updated.updateAt ?? "",
                isLiked: true,
            }
        },
        unlikeGuide: async (parent, args, context, info) => {
            if (!context.user) {
                throw createGraphQLError("需要登录")
            }

            const { id } = args
            const guide = await db.query.guides.findFirst({
                where: eq(schema.guides.id, id),
            })

            if (!guide) {
                throw createGraphQLError("攻略不存在")
            }

            await db.delete(schema.guideLikes).where(and(eq(schema.guideLikes.userId, context.user.id), eq(schema.guideLikes.guideId, id)))

            await db
                .update(schema.guides)
                .set({ likes: sql`${schema.guides.likes} - 1` })
                .where(eq(schema.guides.id, id))

            const updated = await db.query.guides.findFirst({
                where: eq(schema.guides.id, id),
                with: { user: getSubSelection(info, "user") ? true : undefined },
            })

            if (!updated) {
                throw createGraphQLError("攻略不存在")
            }

            return {
                ...updated,
                images: updated.images || [],
                charSettings: updated.charSettings ? JSON.stringify(updated.charSettings) : undefined,
                views: updated.views ?? 0,
                likes: Math.max(0, (guide.likes ?? 0) - 1),
                isRecommended: updated.isRecommended ?? false,
                isPinned: updated.isPinned ?? false,
                createdAt: updated.createdAt ?? "",
                updateAt: updated.updateAt ?? "",
                isLiked: false,
            }
        },
        recommendGuide: async (parent, { id, recommended }, context, info) => {
            if (!context.user || !context.user.roles?.includes("admin")) {
                throw createGraphQLError("无权限")
            }

            const guide = await db.query.guides.findFirst({
                where: eq(schema.guides.id, id),
            })

            if (!guide) {
                throw createGraphQLError("攻略不存在")
            }

            const [updated] = await db.update(schema.guides).set({ isRecommended: recommended }).where(eq(schema.guides.id, id)).returning()

            const result = await db.query.guides.findFirst({
                where: eq(schema.guides.id, id),
                with: { user: getSubSelection(info, "user") ? true : undefined },
            })

            if (!result) {
                throw createGraphQLError("攻略不存在")
            }

            let isLiked = false
            const [like] = await db
                .select()
                .from(schema.guideLikes)
                .where(and(eq(schema.guideLikes.userId, context.user.id), eq(schema.guideLikes.guideId, id)))
            isLiked = !!like

            return {
                ...result,
                images: result.images || [],
                charSettings: result.charSettings ? JSON.stringify(result.charSettings) : undefined,
                views: result.views ?? 0,
                likes: result.likes ?? 0,
                createdAt: result.createdAt ?? "",
                updateAt: result.updateAt ?? "",
                isLiked,
            }
        },
        pinGuide: async (parent, { id, pinned }, context, info) => {
            if (!context.user || !context.user.roles?.includes("admin")) {
                throw createGraphQLError("无权限")
            }

            const guide = await db.query.guides.findFirst({
                where: eq(schema.guides.id, id),
            })

            if (!guide) {
                throw createGraphQLError("攻略不存在")
            }

            const [updated] = await db.update(schema.guides).set({ isPinned: pinned }).where(eq(schema.guides.id, id)).returning()

            const result = await db.query.guides.findFirst({
                where: eq(schema.guides.id, id),
                with: { user: getSubSelection(info, "user") ? true : undefined },
            })

            if (!result) {
                throw createGraphQLError("攻略不存在")
            }

            let isLiked = false
            const [like] = await db
                .select()
                .from(schema.guideLikes)
                .where(and(eq(schema.guideLikes.userId, context.user.id), eq(schema.guideLikes.guideId, id)))
            isLiked = !!like

            return {
                ...result,
                images: result.images || [],
                charSettings: result.charSettings ? JSON.stringify(result.charSettings) : undefined,
                views: result.views ?? 0,
                likes: result.likes ?? 0,
                createdAt: result.createdAt ?? "",
                updateAt: result.updateAt ?? "",
                isLiked,
            }
        },
    },
} satisfies Resolver<CreateMobius<typeof typeDefs>, Context>
