import type { CreateMobius, Resolver } from "@pa001024/graphql-mobius"
import { and, desc, eq, like, sql } from "drizzle-orm"
import { createGraphQLError } from "graphql-yoga"
import { db, schema } from ".."
import type { Context } from "../yoga"
import { getSubSelection } from "."

export const typeDefs = /* GraphQL */ `
    type Build {
        id: String!
        title: String!
        desc: String
        charId: Int!
        charSettings: String!
        userId: String!
        views: Int!
        likes: Int!
        isRecommended: Boolean
        isPinned: Boolean
        createdAt: String!
        updateAt: String!
        user: User
        isLiked: Boolean
    }

    input BuildInput {
        title: String!
        desc: String
        charId: Int!
        charSettings: String!
    }

    type Mutation {
        createBuild(input: BuildInput!): Build
        updateBuild(id: String!, input: BuildInput!): Build
        deleteBuild(id: String!): Boolean
        likeBuild(id: String!): Build
        unlikeBuild(id: String!): Build
        recommendBuild(id: String!, recommended: Boolean!): Build
        pinBuild(id: String!, pinned: Boolean!): Build
    }

    type Query {
        builds(search: String, charId: Int, userId: String, limit: Int = 20, offset: Int = 0, sortBy: String): [Build!]!
        buildsCount(search: String, charId: Int): Int!
        recommendedBuilds(limit: Int = 10): [Build!]!
        trendingBuilds(limit: Int = 10): [Build!]!
        build(id: String!): Build
    }
`

export const resolvers = {
    Query: {
        builds: async (_parent, args, context, info) => {
            const { search, charId, userId, limit = 20, offset = 0, sortBy = "latest" } = args || {}
            const conditions = []

            if (search) {
                conditions.push(like(schema.builds.title, `%${search}%`))
            }
            if (charId) {
                conditions.push(eq(schema.builds.charId, charId))
            }
            if (userId) {
                conditions.push(eq(schema.builds.userId, userId))
            }

            let orderBy: any[]
            switch (sortBy) {
                case "likes":
                    orderBy = [desc(schema.builds.likes)]
                    break
                case "views":
                    orderBy = [desc(schema.builds.views)]
                    break
                default:
                    orderBy = [desc(schema.builds.updateAt)]
            }

            const result = await db.query.builds.findMany({
                where: conditions.length > 0 ? and(...conditions) : undefined,
                orderBy,
                limit,
                offset,
                with: { user: getSubSelection(info, "user") ? true : undefined },
            })

            const likedBuildIds = context.user
                ? new Set(
                      (
                          await db
                              .select({ buildId: schema.buildLikes.buildId })
                              .from(schema.buildLikes)
                              .where(eq(schema.buildLikes.userId, context.user.id))
                      ).map(r => r.buildId)
                  )
                : new Set()

            return result.map(build => ({
                ...build,
                views: build.views ?? 0,
                likes: build.likes ?? 0,
                isRecommended: build.isRecommended ?? false,
                isPinned: build.isPinned ?? false,
                createdAt: build.createdAt ?? "",
                updateAt: build.updateAt ?? "",
                isLiked: likedBuildIds.has(build.id),
            }))
        },
        buildsCount: async (_parent, args) => {
            const search = args?.search
            const charId = args?.charId
            const conditions = []

            if (search) {
                conditions.push(like(schema.builds.title, `%${search}%`))
            }

            if (charId) {
                conditions.push(eq(schema.builds.charId, charId))
            }

            const whereClause = conditions.length > 0 ? and(...conditions) : undefined

            const [result] = await db.select({ count: sql<number>`count(*)` }).from(schema.builds).where(whereClause)
            return result?.count || 0
        },
        recommendedBuilds: async (_parent, args, context, info) => {
            const limit = args?.limit ?? 10
            const result = await db.query.builds.findMany({
                where: eq(schema.builds.isRecommended, true),
                orderBy: [desc(schema.builds.createdAt)],
                limit,
                with: { user: getSubSelection(info, "user") ? true : undefined },
            })

            const likedBuildIds = context.user
                ? new Set(
                      (
                          await db
                              .select({ buildId: schema.buildLikes.buildId })
                              .from(schema.buildLikes)
                              .where(eq(schema.buildLikes.userId, context.user.id))
                      ).map(r => r.buildId)
                  )
                : new Set()

            return result.map(build => ({
                ...build,
                views: build.views ?? 0,
                likes: build.likes ?? 0,
                isRecommended: build.isRecommended ?? false,
                isPinned: build.isPinned ?? false,
                createdAt: build.createdAt ?? "",
                updateAt: build.updateAt ?? "",
                isLiked: likedBuildIds.has(build.id),
            }))
        },
        trendingBuilds: async (_parent, args, context, info) => {
            const limit = args?.limit ?? 10
            const result = await db.query.builds.findMany({
                orderBy: [desc(schema.builds.views), desc(schema.builds.likes)],
                limit,
                with: { user: getSubSelection(info, "user") ? true : undefined },
            })

            const likedBuildIds = context.user
                ? new Set(
                      (
                          await db
                              .select({ buildId: schema.buildLikes.buildId })
                              .from(schema.buildLikes)
                              .where(eq(schema.buildLikes.userId, context.user.id))
                      ).map(r => r.buildId)
                  )
                : new Set()

            return result.map(build => ({
                ...build,
                views: build.views ?? 0,
                likes: build.likes ?? 0,
                isRecommended: build.isRecommended ?? false,
                isPinned: build.isPinned ?? false,
                createdAt: build.createdAt ?? "",
                updateAt: build.updateAt ?? "",
                isLiked: likedBuildIds.has(build.id),
            }))
        },
        build: async (_parent, args, context, info) => {
            const { id } = args
            const build = await db.query.builds.findFirst({
                where: eq(schema.builds.id, id),
                with: { user: getSubSelection(info, "user") ? true : undefined },
            })

            if (!build) {
                throw createGraphQLError("构建不存在")
            }

            await db
                .update(schema.builds)
                .set({ views: sql`${schema.builds.views} + 1` })
                .where(eq(schema.builds.id, id))

            const likedBuildIds = context.user
                ? new Set(
                      (
                          await db
                              .select({ buildId: schema.buildLikes.buildId })
                              .from(schema.buildLikes)
                              .where(eq(schema.buildLikes.userId, context.user.id))
                      ).map(r => r.buildId)
                  )
                : new Set()

            return {
                ...build,
                views: (build.views ?? 0) + 1,
                likes: build.likes ?? 0,
                isRecommended: build.isRecommended ?? false,
                isPinned: build.isPinned ?? false,
                createdAt: build.createdAt ?? "",
                updateAt: build.updateAt ?? "",
                isLiked: likedBuildIds.has(id),
            }
        },
    },
    Mutation: {
        createBuild: async (_parent, args, context, info) => {
            if (!context.user) {
                throw createGraphQLError("需要登录")
            }

            const { input } = args
            if (input.charSettings.length > 20000) {
                throw createGraphQLError("非法请求")
            }
            const [build] = await db
                .insert(schema.builds)
                .values({
                    ...input,
                    userId: context.user.id,
                    updateAt: schema.now(),
                })
                .returning()

            if (!build) {
                throw createGraphQLError("创建失败")
            }

            const result = await db.query.builds.findFirst({
                where: eq(schema.builds.id, build.id),
                with: { user: getSubSelection(info, "user") ? true : undefined },
            })

            if (!result) {
                throw createGraphQLError("创建失败")
            }

            return {
                ...result,
                views: result.views ?? 0,
                likes: result.likes ?? 0,
                isRecommended: result.isRecommended ?? false,
                isPinned: result.isPinned ?? false,
                createdAt: result.createdAt ?? "",
                updateAt: result.updateAt ?? "",
                isLiked: false,
            }
        },
        updateBuild: async (_parent, args, context, info) => {
            if (!context.user) {
                throw createGraphQLError("需要登录")
            }

            const { id, input } = args
            if (input.charSettings.length > 20000) {
                throw createGraphQLError("非法请求")
            }
            const build = await db.query.builds.findFirst({
                where: eq(schema.builds.id, id),
            })

            if (!build) {
                throw createGraphQLError("构建不存在")
            }

            if (build.userId !== context.user.id) {
                throw createGraphQLError("无权修改此构建")
            }

            const [updated] = await db
                .update(schema.builds)
                .set({ ...input, updateAt: schema.now() })
                .where(eq(schema.builds.id, id))
                .returning()

            if (!updated) {
                throw createGraphQLError("更新失败")
            }

            const result = await db.query.builds.findFirst({
                where: eq(schema.builds.id, id),
                with: { user: getSubSelection(info, "user") ? true : undefined },
            })

            if (!result) {
                throw createGraphQLError("更新失败")
            }

            const likedBuildIds = context.user
                ? new Set(
                      (
                          await db
                              .select({ buildId: schema.buildLikes.buildId })
                              .from(schema.buildLikes)
                              .where(eq(schema.buildLikes.userId, context.user.id))
                      ).map(r => r.buildId)
                  )
                : new Set()

            return {
                ...result,
                views: result.views ?? 0,
                likes: result.likes ?? 0,
                isRecommended: result.isRecommended ?? false,
                isPinned: result.isPinned ?? false,
                createdAt: result.createdAt ?? "",
                updateAt: result.updateAt ?? "",
                isLiked: likedBuildIds.has(id),
            }
        },
        deleteBuild: async (_parent, args, context) => {
            if (!context.user) {
                throw createGraphQLError("需要登录")
            }

            const { id } = args
            const build = await db.query.builds.findFirst({
                where: eq(schema.builds.id, id),
            })

            if (!build) {
                throw createGraphQLError("构建不存在")
            }

            if (build.userId !== context.user.id && !context.user.roles?.includes("admin")) {
                throw createGraphQLError("无权删除此构建")
            }

            await db.delete(schema.builds).where(eq(schema.builds.id, id))
            return true
        },
        likeBuild: async (_parent, args, context, info) => {
            if (!context.user) {
                throw createGraphQLError("需要登录")
            }

            const { id } = args
            const build = await db.query.builds.findFirst({
                where: eq(schema.builds.id, id),
            })

            if (!build) {
                throw createGraphQLError("构建不存在")
            }

            const [existing] = await db
                .select()
                .from(schema.buildLikes)
                .where(and(eq(schema.buildLikes.userId, context.user.id), eq(schema.buildLikes.buildId, id)))

            if (existing) {
                throw createGraphQLError("已经点赞过了")
            }

            await db.insert(schema.buildLikes).values({
                buildId: id,
                userId: context.user.id,
            })

            await db
                .update(schema.builds)
                .set({ likes: sql`${schema.builds.likes} + 1` })
                .where(eq(schema.builds.id, id))

            const updated = await db.query.builds.findFirst({
                where: eq(schema.builds.id, id),
                with: { user: getSubSelection(info, "user") ? true : undefined },
            })

            if (!updated) {
                throw createGraphQLError("构建不存在")
            }

            return {
                ...updated,
                views: updated.views ?? 0,
                likes: (build.likes ?? 0) + 1,
                isRecommended: updated.isRecommended ?? false,
                isPinned: updated.isPinned ?? false,
                createdAt: updated.createdAt ?? "",
                updateAt: updated.updateAt ?? "",
                isLiked: true,
            }
        },
        unlikeBuild: async (_parent, args, context, info) => {
            if (!context.user) {
                throw createGraphQLError("需要登录")
            }

            const { id } = args
            const build = await db.query.builds.findFirst({
                where: eq(schema.builds.id, id),
            })

            if (!build) {
                throw createGraphQLError("构建不存在")
            }

            await db.delete(schema.buildLikes).where(and(eq(schema.buildLikes.userId, context.user.id), eq(schema.buildLikes.buildId, id)))

            await db
                .update(schema.builds)
                .set({ likes: sql`${schema.builds.likes} - 1` })
                .where(eq(schema.builds.id, id))

            const updated = await db.query.builds.findFirst({
                where: eq(schema.builds.id, id),
                with: { user: getSubSelection(info, "user") ? true : undefined },
            })

            if (!updated) {
                throw createGraphQLError("构建不存在")
            }

            return {
                ...updated,
                views: updated.views ?? 0,
                likes: Math.max(0, (build.likes ?? 0) - 1),
                isRecommended: updated.isRecommended ?? false,
                isPinned: updated.isPinned ?? false,
                createdAt: updated.createdAt ?? "",
                updateAt: updated.updateAt ?? "",
                isLiked: false,
            }
        },
        recommendBuild: async (_parent, args, context, info) => {
            if (!context.user || !context.user.roles?.includes("admin")) {
                throw createGraphQLError("无权限")
            }

            const { id, recommended } = args
            const build = await db.query.builds.findFirst({
                where: eq(schema.builds.id, id),
            })

            if (!build) {
                throw createGraphQLError("构建不存在")
            }

            const [updated] = await db.update(schema.builds).set({ isRecommended: recommended }).where(eq(schema.builds.id, id)).returning()

            if (!updated) {
                throw createGraphQLError("更新失败")
            }

            const result = await db.query.builds.findFirst({
                where: eq(schema.builds.id, id),
                with: { user: getSubSelection(info, "user") ? true : undefined },
            })

            if (!result) {
                throw createGraphQLError("构建不存在")
            }

            const likedBuildIds = context.user
                ? new Set(
                      (
                          await db
                              .select({ buildId: schema.buildLikes.buildId })
                              .from(schema.buildLikes)
                              .where(eq(schema.buildLikes.userId, context.user.id))
                      ).map(r => r.buildId)
                  )
                : new Set()

            return {
                ...result,
                views: result.views ?? 0,
                likes: result.likes ?? 0,
                isRecommended: result.isRecommended ?? false,
                isPinned: result.isPinned ?? false,
                createdAt: result.createdAt ?? "",
                updateAt: result.updateAt ?? "",
                isLiked: likedBuildIds.has(id),
            }
        },
        pinBuild: async (_parent, args, context, info) => {
            if (!context.user || !context.user.roles?.includes("admin")) {
                throw createGraphQLError("无权限")
            }

            const { id, pinned } = args
            const build = await db.query.builds.findFirst({
                where: eq(schema.builds.id, id),
            })

            if (!build) {
                throw createGraphQLError("构建不存在")
            }

            const [updated] = await db.update(schema.builds).set({ isPinned: pinned }).where(eq(schema.builds.id, id)).returning()

            if (!updated) {
                throw createGraphQLError("更新失败")
            }

            const result = await db.query.builds.findFirst({
                where: eq(schema.builds.id, id),
                with: { user: getSubSelection(info, "user") ? true : undefined },
            })

            if (!result) {
                throw createGraphQLError("构建不存在")
            }

            const likedBuildIds = context.user
                ? new Set(
                      (
                          await db
                              .select({ buildId: schema.buildLikes.buildId })
                              .from(schema.buildLikes)
                              .where(eq(schema.buildLikes.userId, context.user.id))
                      ).map(r => r.buildId)
                  )
                : new Set()

            return {
                ...result,
                views: result.views ?? 0,
                likes: result.likes ?? 0,
                isRecommended: result.isRecommended ?? false,
                isPinned: result.isPinned ?? false,
                createdAt: result.createdAt ?? "",
                updateAt: result.updateAt ?? "",
                isLiked: likedBuildIds.has(id),
            }
        },
    },
} satisfies Resolver<CreateMobius<typeof typeDefs>, Context>

export type BuildGQL = CreateMobius<typeof typeDefs>
