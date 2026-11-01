import type { CreateMobius, Resolver } from "@pa001024/graphql-mobius"
import { and, desc, eq, like, sql } from "drizzle-orm"
import { createGraphQLError } from "graphql-yoga"
import { db, schema } from ".."
import type { Context } from "../yoga"
import { getSubSelection } from "."

/** 节点图 JSON 体积上限：含全部 nodes/edges，比构筑 charSettings 宽松一个数量级。 */
const MAX_GRAPH_DATA_LENGTH = 200000

export const typeDefs = /* GraphQL */ `
    type Graph {
        id: String!
        title: String!
        desc: String
        graphData: String!
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

    input GraphInput {
        title: String!
        desc: String
        graphData: String!
    }

    type Mutation {
        createGraph(input: GraphInput!): Graph
        updateGraph(id: String!, input: GraphInput!): Graph
        deleteGraph(id: String!): Boolean
        likeGraph(id: String!): Graph
        unlikeGraph(id: String!): Graph
        recommendGraph(id: String!, recommended: Boolean!): Graph
        pinGraph(id: String!, pinned: Boolean!): Graph
    }

    type Query {
        graphs(search: String, userId: String, limit: Int = 20, offset: Int = 0, sortBy: String): [Graph!]!
        graphsCount(search: String): Int!
        recommendedGraphs(limit: Int = 10): [Graph!]!
        trendingGraphs(limit: Int = 10): [Graph!]!
        graph(id: String!): Graph
    }
`

function validateGraphData(graphData: string): string | null {
    if (!graphData?.trim()) {
        return "节点图数据不能为空"
    }
    if (graphData.length > MAX_GRAPH_DATA_LENGTH) {
        return "节点图数据过大，请精简后再分享"
    }
    try {
        const parsed = JSON.parse(graphData) as { nodes?: unknown; edges?: unknown }
        if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
            return "节点图数据格式不正确（需要 { nodes[], edges[] }）"
        }
    } catch {
        return "节点图数据不是合法 JSON"
    }
    return null
}

export const resolvers = {
    Query: {
        graphs: async (_parent, args, context, info) => {
            const { search, userId, limit = 20, offset = 0, sortBy = "latest" } = args || {}
            const conditions = []

            if (search) {
                conditions.push(like(schema.graphs.title, `%${search}%`))
            }
            if (userId) {
                conditions.push(eq(schema.graphs.userId, userId))
            }

            const sortOrders: Record<string, any[]> = {
                likes: [desc(schema.graphs.likes)],
                views: [desc(schema.graphs.views)],
            }
            const orderBy = sortOrders[sortBy] ?? [desc(schema.graphs.updateAt)]

            const result = await db.query.graphs.findMany({
                where: conditions.length > 0 ? and(...conditions) : undefined,
                orderBy,
                limit,
                offset,
                with: { user: getSubSelection(info, "user") ? true : undefined },
            })

            const likedGraphIds = context.user
                ? new Set(
                      (
                          await db
                              .select({ graphId: schema.graphLikes.graphId })
                              .from(schema.graphLikes)
                              .where(eq(schema.graphLikes.userId, context.user.id))
                      ).map(r => r.graphId)
                  )
                : new Set()

            return result.map(graph => ({
                ...graph,
                views: graph.views ?? 0,
                likes: graph.likes ?? 0,
                isRecommended: graph.isRecommended ?? false,
                isPinned: graph.isPinned ?? false,
                createdAt: graph.createdAt ?? 0,
                updateAt: graph.updateAt ?? 0,
                isLiked: likedGraphIds.has(graph.id),
            }))
        },
        graphsCount: async (_parent, args) => {
            const search = args?.search
            const conditions = []

            if (search) {
                conditions.push(like(schema.graphs.title, `%${search}%`))
            }

            const whereClause = conditions.length > 0 ? and(...conditions) : undefined

            const [result] = await db.select({ count: sql<number>`count(*)` }).from(schema.graphs).where(whereClause)
            return result?.count || 0
        },
        recommendedGraphs: async (_parent, args, context, info) => {
            const limit = args?.limit ?? 10
            const result = await db.query.graphs.findMany({
                where: eq(schema.graphs.isRecommended, true),
                orderBy: [desc(schema.graphs.createdAt)],
                limit,
                with: { user: getSubSelection(info, "user") ? true : undefined },
            })

            const likedGraphIds = context.user
                ? new Set(
                      (
                          await db
                              .select({ graphId: schema.graphLikes.graphId })
                              .from(schema.graphLikes)
                              .where(eq(schema.graphLikes.userId, context.user.id))
                      ).map(r => r.graphId)
                  )
                : new Set()

            return result.map(graph => ({
                ...graph,
                views: graph.views ?? 0,
                likes: graph.likes ?? 0,
                isRecommended: graph.isRecommended ?? false,
                isPinned: graph.isPinned ?? false,
                createdAt: graph.createdAt ?? 0,
                updateAt: graph.updateAt ?? 0,
                isLiked: likedGraphIds.has(graph.id),
            }))
        },
        trendingGraphs: async (_parent, args, context, info) => {
            const limit = args?.limit ?? 10
            const result = await db.query.graphs.findMany({
                orderBy: [desc(schema.graphs.views), desc(schema.graphs.likes)],
                limit,
                with: { user: getSubSelection(info, "user") ? true : undefined },
            })

            const likedGraphIds = context.user
                ? new Set(
                      (
                          await db
                              .select({ graphId: schema.graphLikes.graphId })
                              .from(schema.graphLikes)
                              .where(eq(schema.graphLikes.userId, context.user.id))
                      ).map(r => r.graphId)
                  )
                : new Set()

            return result.map(graph => ({
                ...graph,
                views: graph.views ?? 0,
                likes: graph.likes ?? 0,
                isRecommended: graph.isRecommended ?? false,
                isPinned: graph.isPinned ?? false,
                createdAt: graph.createdAt ?? 0,
                updateAt: graph.updateAt ?? 0,
                isLiked: likedGraphIds.has(graph.id),
            }))
        },
        graph: async (_parent, args, context, info) => {
            const { id } = args
            const graph = await db.query.graphs.findFirst({
                where: eq(schema.graphs.id, id),
                with: { user: getSubSelection(info, "user") ? true : undefined },
            })

            if (!graph) {
                throw createGraphQLError("节点图不存在")
            }

            await db
                .update(schema.graphs)
                .set({ views: sql`${schema.graphs.views} + 1` })
                .where(eq(schema.graphs.id, id))

            const likedGraphIds = context.user
                ? new Set(
                      (
                          await db
                              .select({ graphId: schema.graphLikes.graphId })
                              .from(schema.graphLikes)
                              .where(eq(schema.graphLikes.userId, context.user.id))
                      ).map(r => r.graphId)
                  )
                : new Set()

            return {
                ...graph,
                views: (graph.views ?? 0) + 1,
                likes: graph.likes ?? 0,
                isRecommended: graph.isRecommended ?? false,
                isPinned: graph.isPinned ?? false,
                createdAt: graph.createdAt ?? 0,
                updateAt: graph.updateAt ?? 0,
                isLiked: likedGraphIds.has(id),
            }
        },
    },
    Mutation: {
        createGraph: async (_parent, args, context, info) => {
            if (!context.user) {
                throw createGraphQLError("需要登录")
            }

            const { input } = args
            const invalid = validateGraphData(input.graphData)
            if (invalid) {
                throw createGraphQLError(invalid)
            }
            const [graph] = await db
                .insert(schema.graphs)
                .values({
                    ...input,
                    userId: context.user.id,
                    updateAt: schema.now(),
                })
                .returning()

            if (!graph) {
                throw createGraphQLError("创建失败")
            }

            const result = await db.query.graphs.findFirst({
                where: eq(schema.graphs.id, graph.id),
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
                createdAt: result.createdAt ?? 0,
                updateAt: result.updateAt ?? 0,
                isLiked: false,
            }
        },
        updateGraph: async (_parent, args, context, info) => {
            if (!context.user) {
                throw createGraphQLError("需要登录")
            }

            const { id, input } = args
            const invalid = validateGraphData(input.graphData)
            if (invalid) {
                throw createGraphQLError(invalid)
            }
            const graph = await db.query.graphs.findFirst({
                where: eq(schema.graphs.id, id),
            })

            if (!graph) {
                throw createGraphQLError("节点图不存在")
            }

            if (graph.userId !== context.user.id && !context.user.roles?.includes("admin")) {
                throw createGraphQLError("无权修改此节点图")
            }

            const [updated] = await db
                .update(schema.graphs)
                .set({ ...input, updateAt: schema.now() })
                .where(eq(schema.graphs.id, id))
                .returning()

            if (!updated) {
                throw createGraphQLError("更新失败")
            }

            const result = await db.query.graphs.findFirst({
                where: eq(schema.graphs.id, id),
                with: { user: getSubSelection(info, "user") ? true : undefined },
            })

            if (!result) {
                throw createGraphQLError("更新失败")
            }

            const likedGraphIds = context.user
                ? new Set(
                      (
                          await db
                              .select({ graphId: schema.graphLikes.graphId })
                              .from(schema.graphLikes)
                              .where(eq(schema.graphLikes.userId, context.user.id))
                      ).map(r => r.graphId)
                  )
                : new Set()

            return {
                ...result,
                views: result.views ?? 0,
                likes: result.likes ?? 0,
                isRecommended: result.isRecommended ?? false,
                isPinned: result.isPinned ?? false,
                createdAt: result.createdAt ?? 0,
                updateAt: result.updateAt ?? 0,
                isLiked: likedGraphIds.has(id),
            }
        },
        deleteGraph: async (_parent, args, context) => {
            if (!context.user) {
                throw createGraphQLError("需要登录")
            }

            const { id } = args
            const graph = await db.query.graphs.findFirst({
                where: eq(schema.graphs.id, id),
            })

            if (!graph) {
                throw createGraphQLError("节点图不存在")
            }

            if (graph.userId !== context.user.id && !context.user.roles?.includes("admin")) {
                throw createGraphQLError("无权删除此节点图")
            }

            await db.delete(schema.graphs).where(eq(schema.graphs.id, id))
            return true
        },
        likeGraph: async (_parent, args, context, info) => {
            if (!context.user) {
                throw createGraphQLError("需要登录")
            }

            const { id } = args
            const graph = await db.query.graphs.findFirst({
                where: eq(schema.graphs.id, id),
            })

            if (!graph) {
                throw createGraphQLError("节点图不存在")
            }

            const [existing] = await db
                .select()
                .from(schema.graphLikes)
                .where(and(eq(schema.graphLikes.userId, context.user.id), eq(schema.graphLikes.graphId, id)))

            if (existing) {
                throw createGraphQLError("已经点赞过了")
            }

            await db.insert(schema.graphLikes).values({
                graphId: id,
                userId: context.user.id,
            })

            await db
                .update(schema.graphs)
                .set({ likes: sql`${schema.graphs.likes} + 1` })
                .where(eq(schema.graphs.id, id))

            const updated = await db.query.graphs.findFirst({
                where: eq(schema.graphs.id, id),
                with: { user: getSubSelection(info, "user") ? true : undefined },
            })

            if (!updated) {
                throw createGraphQLError("节点图不存在")
            }

            return {
                ...updated,
                views: updated.views ?? 0,
                likes: (graph.likes ?? 0) + 1,
                isRecommended: updated.isRecommended ?? false,
                isPinned: updated.isPinned ?? false,
                createdAt: updated.createdAt ?? 0,
                updateAt: updated.updateAt ?? 0,
                isLiked: true,
            }
        },
        unlikeGraph: async (_parent, args, context, info) => {
            if (!context.user) {
                throw createGraphQLError("需要登录")
            }

            const { id } = args
            const graph = await db.query.graphs.findFirst({
                where: eq(schema.graphs.id, id),
            })

            if (!graph) {
                throw createGraphQLError("节点图不存在")
            }

            await db.delete(schema.graphLikes).where(and(eq(schema.graphLikes.userId, context.user.id), eq(schema.graphLikes.graphId, id)))

            await db
                .update(schema.graphs)
                .set({ likes: sql`${schema.graphs.likes} - 1` })
                .where(eq(schema.graphs.id, id))

            const updated = await db.query.graphs.findFirst({
                where: eq(schema.graphs.id, id),
                with: { user: getSubSelection(info, "user") ? true : undefined },
            })

            if (!updated) {
                throw createGraphQLError("节点图不存在")
            }

            return {
                ...updated,
                views: updated.views ?? 0,
                likes: Math.max(0, (graph.likes ?? 0) - 1),
                isRecommended: updated.isRecommended ?? false,
                isPinned: updated.isPinned ?? false,
                createdAt: updated.createdAt ?? 0,
                updateAt: updated.updateAt ?? 0,
                isLiked: false,
            }
        },
        recommendGraph: async (_parent, args, context, info) => {
            if (!context.user?.roles?.includes("admin")) {
                throw createGraphQLError("无权限")
            }

            const { id, recommended } = args
            const graph = await db.query.graphs.findFirst({
                where: eq(schema.graphs.id, id),
            })

            if (!graph) {
                throw createGraphQLError("节点图不存在")
            }

            const [updated] = await db.update(schema.graphs).set({ isRecommended: recommended }).where(eq(schema.graphs.id, id)).returning()

            if (!updated) {
                throw createGraphQLError("更新失败")
            }

            const result = await db.query.graphs.findFirst({
                where: eq(schema.graphs.id, id),
                with: { user: getSubSelection(info, "user") ? true : undefined },
            })

            if (!result) {
                throw createGraphQLError("节点图不存在")
            }

            const likedGraphIds = context.user
                ? new Set(
                      (
                          await db
                              .select({ graphId: schema.graphLikes.graphId })
                              .from(schema.graphLikes)
                              .where(eq(schema.graphLikes.userId, context.user.id))
                      ).map(r => r.graphId)
                  )
                : new Set()

            return {
                ...result,
                views: result.views ?? 0,
                likes: result.likes ?? 0,
                isRecommended: result.isRecommended ?? false,
                isPinned: result.isPinned ?? false,
                createdAt: result.createdAt ?? 0,
                updateAt: result.updateAt ?? 0,
                isLiked: likedGraphIds.has(id),
            }
        },
        pinGraph: async (_parent, args, context, info) => {
            if (!context.user?.roles?.includes("admin")) {
                throw createGraphQLError("无权限")
            }

            const { id, pinned } = args
            const graph = await db.query.graphs.findFirst({
                where: eq(schema.graphs.id, id),
            })

            if (!graph) {
                throw createGraphQLError("节点图不存在")
            }

            const [updated] = await db.update(schema.graphs).set({ isPinned: pinned }).where(eq(schema.graphs.id, id)).returning()

            if (!updated) {
                throw createGraphQLError("更新失败")
            }

            const result = await db.query.graphs.findFirst({
                where: eq(schema.graphs.id, id),
                with: { user: getSubSelection(info, "user") ? true : undefined },
            })

            if (!result) {
                throw createGraphQLError("节点图不存在")
            }

            const likedGraphIds = context.user
                ? new Set(
                      (
                          await db
                              .select({ graphId: schema.graphLikes.graphId })
                              .from(schema.graphLikes)
                              .where(eq(schema.graphLikes.userId, context.user.id))
                      ).map(r => r.graphId)
                  )
                : new Set()

            return {
                ...result,
                views: result.views ?? 0,
                likes: result.likes ?? 0,
                isRecommended: result.isRecommended ?? false,
                isPinned: result.isPinned ?? false,
                createdAt: result.createdAt ?? 0,
                updateAt: result.updateAt ?? 0,
                isLiked: likedGraphIds.has(id),
            }
        },
    },
} satisfies Resolver<CreateMobius<typeof typeDefs>, Context>

export type GraphGQL = CreateMobius<typeof typeDefs>
