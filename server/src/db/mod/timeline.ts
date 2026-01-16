import type { CreateMobius, Resolver } from "@pa001024/graphql-mobius"
import { and, desc, eq, like, sql } from "drizzle-orm"
import { createGraphQLError } from "graphql-yoga"
import { db, schema } from ".."
import type { Context } from "../yoga"
import { getSubSelection } from "."

export const typeDefs = /* GraphQL */ `
    type Timeline {
        id: String!
        title: String!
        charId: Int!
        charName: String!
        tracks: String!
        items: String!
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

    input TimelineInput {
        title: String!
        charId: Int!
        charName: String!
        tracks: String!
        items: String!
    }

    type Mutation {
        createTimeline(input: TimelineInput!): Timeline
        updateTimeline(id: String!, input: TimelineInput!): Timeline
        deleteTimeline(id: String!): Boolean
        likeTimeline(id: String!): Timeline
        unlikeTimeline(id: String!): Timeline
        recommendTimeline(id: String!, recommended: Boolean!): Timeline
        pinTimeline(id: String!, pinned: Boolean!): Timeline
    }

    type Query {
        timelines(search: String, charId: Int, userId: String, limit: Int = 20, offset: Int = 0, sortBy: String): [Timeline!]!
        timelinesCount(search: String, charId: Int): Int!
        recommendedTimelines(limit: Int = 10): [Timeline!]!
        trendingTimelines(limit: Int = 10): [Timeline!]!
        timeline(id: String!): Timeline
    }
`

export const resolvers = {
    Query: {
        timelines: async (_parent, args, context, info) => {
            const { search, charId, userId, limit = 20, offset = 0, sortBy = "recent" } = args || {}
            const conditions = []

            if (search) {
                conditions.push(like(schema.timelines.title, `%${search}%`))
            }

            if (charId) {
                conditions.push(eq(schema.timelines.charId, charId))
            }
            if (userId) {
                conditions.push(eq(schema.timelines.userId, userId))
            }

            let orderBy: any[]
            switch (sortBy) {
                case "likes":
                    orderBy = [desc(schema.timelines.likes)]
                    break
                case "views":
                    orderBy = [desc(schema.timelines.views)]
                    break
                default:
                    orderBy = [desc(schema.timelines.createdAt)]
            }

            const result = await db.query.timelines.findMany({
                where: conditions.length > 0 ? and(...conditions) : undefined,
                orderBy,
                limit,
                offset,
                with: { user: getSubSelection(info, "user") ? true : undefined },
            })

            const likedTimelineIds = context.user
                ? new Set(
                      (
                          await db
                              .select({ timelineId: schema.timelineLikes.timelineId })
                              .from(schema.timelineLikes)
                              .where(eq(schema.timelineLikes.userId, context.user.id))
                      ).map(r => r.timelineId)
                  )
                : new Set()
            return result.map(timeline => ({
                ...timeline,
                views: timeline.views ?? 0,
                likes: timeline.likes ?? 0,
                isRecommended: timeline.isRecommended ?? false,
                isPinned: timeline.isPinned ?? false,
                createdAt: timeline.createdAt ?? "",
                updateAt: timeline.updateAt ?? "",
                isLiked: likedTimelineIds.has(timeline.id),
            }))
        },
        timelinesCount: async (_parent, args) => {
            const search = args?.search
            const charId = args?.charId
            const conditions = []

            if (search) {
                conditions.push(like(schema.timelines.title, `%${search}%`))
            }

            if (charId) {
                conditions.push(eq(schema.timelines.charId, charId))
            }

            const whereClause = conditions.length > 0 ? and(...conditions) : undefined

            const [result] = await db.select({ count: sql<number>`count(*)` }).from(schema.timelines).where(whereClause)
            return result?.count || 0
        },
        recommendedTimelines: async (_parent, args, context, info) => {
            const limit = args?.limit ?? 10
            const result = await db.query.timelines.findMany({
                where: eq(schema.timelines.isRecommended, true),
                orderBy: [desc(schema.timelines.createdAt)],
                limit,
                with: { user: getSubSelection(info, "user") ? true : undefined },
            })

            const likedTimelineIds = context.user
                ? new Set(
                      (
                          await db
                              .select({ timelineId: schema.timelineLikes.timelineId })
                              .from(schema.timelineLikes)
                              .where(eq(schema.timelineLikes.userId, context.user.id))
                      ).map(r => r.timelineId)
                  )
                : new Set()
            return result.map(timeline => ({
                ...timeline,
                views: timeline.views ?? 0,
                likes: timeline.likes ?? 0,
                isRecommended: timeline.isRecommended ?? false,
                isPinned: timeline.isPinned ?? false,
                createdAt: timeline.createdAt ?? "",
                updateAt: timeline.updateAt ?? "",
                isLiked: likedTimelineIds.has(timeline.id),
            }))
        },
        trendingTimelines: async (_parent, args, context, info) => {
            const limit = args?.limit ?? 10
            const result = await db.query.timelines.findMany({
                orderBy: [desc(schema.timelines.views), desc(schema.timelines.likes)],
                limit,
                with: { user: getSubSelection(info, "user") ? true : undefined },
            })

            const likedTimelineIds = context.user
                ? new Set(
                      (
                          await db
                              .select({ timelineId: schema.timelineLikes.timelineId })
                              .from(schema.timelineLikes)
                              .where(eq(schema.timelineLikes.userId, context.user.id))
                      ).map(r => r.timelineId)
                  )
                : new Set()
            return result.map(timeline => ({
                ...timeline,
                views: timeline.views ?? 0,
                likes: timeline.likes ?? 0,
                isRecommended: timeline.isRecommended ?? false,
                isPinned: timeline.isPinned ?? false,
                createdAt: timeline.createdAt ?? "",
                updateAt: timeline.updateAt ?? "",
                isLiked: likedTimelineIds.has(timeline.id),
            }))
        },
        timeline: async (_parent, args, context, info) => {
            const { id } = args
            const timeline = await db.query.timelines.findFirst({
                where: eq(schema.timelines.id, id),
                with: { user: getSubSelection(info, "user") ? true : undefined },
            })

            if (!timeline) {
                throw createGraphQLError("时间线不存在")
            }

            await db
                .update(schema.timelines)
                .set({ views: sql`${schema.timelines.views} + 1` })
                .where(eq(schema.timelines.id, id))

            const likedTimelineIds = context.user
                ? new Set(
                      (
                          await db
                              .select({ timelineId: schema.timelineLikes.timelineId })
                              .from(schema.timelineLikes)
                              .where(eq(schema.timelineLikes.userId, context.user.id))
                      ).map(r => r.timelineId)
                  )
                : new Set()
            return {
                ...timeline,
                views: (timeline.views ?? 0) + 1,
                likes: timeline.likes ?? 0,
                isRecommended: timeline.isRecommended ?? false,
                isPinned: timeline.isPinned ?? false,
                createdAt: timeline.createdAt ?? "",
                updateAt: timeline.updateAt ?? "",
                isLiked: likedTimelineIds.has(id),
            }
        },
    },
    Mutation: {
        createTimeline: async (_parent, args, context, info) => {
            if (!context.user) {
                throw createGraphQLError("需要登录")
            }

            const { input } = args
            const [timeline] = await db
                .insert(schema.timelines)
                .values({
                    ...input,
                    tracks: JSON.parse(input.tracks),
                    items: JSON.parse(input.items),
                    userId: context.user.id,
                })
                .returning()

            if (!timeline) {
                throw createGraphQLError("创建失败")
            }

            const result = await db.query.timelines.findFirst({
                where: eq(schema.timelines.id, timeline.id),
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
        updateTimeline: async (_parent, args, context, info) => {
            if (!context.user) {
                throw createGraphQLError("需要登录")
            }

            const { id, input } = args
            const timeline = await db.query.timelines.findFirst({
                where: eq(schema.timelines.id, id),
            })

            if (!timeline) {
                throw createGraphQLError("时间线不存在")
            }

            if (timeline.userId !== context.user.id) {
                throw createGraphQLError("无权修改此时间线")
            }

            const [updated] = await db
                .update(schema.timelines)
                .set({ ...input, tracks: JSON.parse(input.tracks), items: JSON.parse(input.items) })
                .where(eq(schema.timelines.id, id))
                .returning()

            if (!updated) {
                throw createGraphQLError("更新失败")
            }

            const result = await db.query.timelines.findFirst({
                where: eq(schema.timelines.id, id),
                with: { user: getSubSelection(info, "user") ? true : undefined },
            })

            if (!result) {
                throw createGraphQLError("更新失败")
            }

            const likedTimelineIds = context.user
                ? new Set(
                      (
                          await db
                              .select({ timelineId: schema.timelineLikes.timelineId })
                              .from(schema.timelineLikes)
                              .where(eq(schema.timelineLikes.userId, context.user.id))
                      ).map(r => r.timelineId)
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
                isLiked: likedTimelineIds.has(id),
            }
        },
        deleteTimeline: async (_parent, args, context) => {
            if (!context.user) {
                throw createGraphQLError("需要登录")
            }

            const { id } = args
            const timeline = await db.query.timelines.findFirst({
                where: eq(schema.timelines.id, id),
            })

            if (!timeline) {
                throw createGraphQLError("时间线不存在")
            }

            if (timeline.userId !== context.user.id && !context.user.roles?.includes("admin")) {
                throw createGraphQLError("无权删除此时间线")
            }

            await db.delete(schema.timelines).where(eq(schema.timelines.id, id))
            return true
        },
        likeTimeline: async (_parent, args, context, info) => {
            if (!context.user) {
                throw createGraphQLError("需要登录")
            }

            const { id } = args
            const timeline = await db.query.timelines.findFirst({
                where: eq(schema.timelines.id, id),
            })

            if (!timeline) {
                throw createGraphQLError("时间线不存在")
            }

            const [existing] = await db
                .select()
                .from(schema.timelineLikes)
                .where(and(eq(schema.timelineLikes.userId, context.user.id), eq(schema.timelineLikes.timelineId, id)))

            if (existing) {
                throw createGraphQLError("已经点赞过了")
            }

            await db.insert(schema.timelineLikes).values({
                timelineId: id,
                userId: context.user.id,
            })

            await db
                .update(schema.timelines)
                .set({ likes: sql`${schema.timelines.likes} + 1` })
                .where(eq(schema.timelines.id, id))

            const updated = await db.query.timelines.findFirst({
                where: eq(schema.timelines.id, id),
                with: { user: getSubSelection(info, "user") ? true : undefined },
            })

            if (!updated) {
                throw createGraphQLError("时间线不存在")
            }

            return {
                ...updated,
                views: updated.views ?? 0,
                likes: (timeline.likes ?? 0) + 1,
                isRecommended: updated.isRecommended ?? false,
                isPinned: updated.isPinned ?? false,
                createdAt: updated.createdAt ?? "",
                updateAt: updated.updateAt ?? "",
                isLiked: true,
            }
        },
        unlikeTimeline: async (_parent, args, context, info) => {
            if (!context.user) {
                throw createGraphQLError("需要登录")
            }

            const { id } = args
            const timeline = await db.query.timelines.findFirst({
                where: eq(schema.timelines.id, id),
            })

            if (!timeline) {
                throw createGraphQLError("时间线不存在")
            }

            await db
                .delete(schema.timelineLikes)
                .where(and(eq(schema.timelineLikes.userId, context.user.id), eq(schema.timelineLikes.timelineId, id)))

            await db
                .update(schema.timelines)
                .set({ likes: sql`${schema.timelines.likes} - 1` })
                .where(eq(schema.timelines.id, id))

            const updated = await db.query.timelines.findFirst({
                where: eq(schema.timelines.id, id),
                with: { user: getSubSelection(info, "user") ? true : undefined },
            })

            if (!updated) {
                throw createGraphQLError("时间线不存在")
            }

            return {
                ...updated,
                views: updated.views ?? 0,
                likes: Math.max(0, (timeline.likes ?? 0) - 1),
                isRecommended: updated.isRecommended ?? false,
                isPinned: updated.isPinned ?? false,
                createdAt: updated.createdAt ?? "",
                updateAt: updated.updateAt ?? "",
                isLiked: false,
            }
        },
        recommendTimeline: async (_parent, args, context, info) => {
            if (!context.user || !context.user.roles?.includes("admin")) {
                throw createGraphQLError("无权限")
            }

            const { id, recommended } = args
            const timeline = await db.query.timelines.findFirst({
                where: eq(schema.timelines.id, id),
            })

            if (!timeline) {
                throw createGraphQLError("时间线不存在")
            }

            const [updated] = await db
                .update(schema.timelines)
                .set({ isRecommended: recommended })
                .where(eq(schema.timelines.id, id))
                .returning()
            if (!updated) {
                throw createGraphQLError("更新失败")
            }

            const result = await db.query.timelines.findFirst({
                where: eq(schema.timelines.id, id),
                with: { user: getSubSelection(info, "user") ? true : undefined },
            })

            if (!result) {
                throw createGraphQLError("时间线不存在")
            }

            const likedTimelineIds = context.user
                ? new Set(
                      (
                          await db
                              .select({ timelineId: schema.timelineLikes.timelineId })
                              .from(schema.timelineLikes)
                              .where(eq(schema.timelineLikes.userId, context.user.id))
                      ).map(r => r.timelineId)
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
                isLiked: likedTimelineIds.has(id),
            }
        },
        pinTimeline: async (_parent, args, context, info) => {
            if (!context.user || !context.user.roles?.includes("admin")) {
                throw createGraphQLError("无权限")
            }

            const { id, pinned } = args
            const timeline = await db.query.timelines.findFirst({
                where: eq(schema.timelines.id, id),
            })

            if (!timeline) {
                throw createGraphQLError("时间线不存在")
            }

            const [updated] = await db.update(schema.timelines).set({ isPinned: pinned }).where(eq(schema.timelines.id, id)).returning()

            if (!updated) {
                throw createGraphQLError("更新失败")
            }

            const result = await db.query.timelines.findFirst({
                where: eq(schema.timelines.id, id),
                with: { user: getSubSelection(info, "user") ? true : undefined },
            })

            if (!result) {
                throw createGraphQLError("时间线不存在")
            }

            const likedTimelineIds = context.user
                ? new Set(
                      (
                          await db
                              .select({ timelineId: schema.timelineLikes.timelineId })
                              .from(schema.timelineLikes)
                              .where(eq(schema.timelineLikes.userId, context.user.id))
                      ).map(r => r.timelineId)
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
                isLiked: likedTimelineIds.has(id),
            }
        },
    },
} satisfies Resolver<CreateMobius<typeof typeDefs>, Context>

export type TimelineGQL = CreateMobius<typeof typeDefs>
