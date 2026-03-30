import type { CreateMobius, Resolver } from "@pa001024/graphql-mobius"
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm"
import { createGraphQLError } from "graphql-yoga"
import { db, schema } from ".."
import type { Context } from "../yoga"

export const typeDefs = /* GraphQL */ `
    type Query {
        "获取单个活动"
        activity(server: String!, id: Int!): Activity
        "获取活动列表"
        activities(server: String!, startTime: Float, endTime: Float): [Activity!]!
    }

    type Mutation {
        "创建活动"
        createActivity(server: String!, input: ActivityInput!): Activity!
        "更新活动"
        updateActivity(server: String!, id: Int!, input: ActivityUpdateInput!): Activity!
        "删除活动"
        deleteActivity(server: String!, id: Int!): Boolean!
        "批量上传并覆盖活动"
        upsertActivitiesIngame(token: String!, server: String!, activities: [ActivityInput!]!): [Activity!]!
    }

    type Activity {
        id: Int!
        server: String!
        postId: String
        startTime: Float!
        endTime: Float!
        name: String!
        icon: String!
        desc: String!
        createdAt: String
        updateAt: String
    }

    input ActivityInput {
        id: Int!
        postId: String
        startTime: Float!
        endTime: Float!
        name: String!
        icon: String!
        desc: String!
    }

    input ActivityUpdateInput {
        postId: String
        startTime: Float!
        endTime: Float!
        name: String!
        icon: String!
        desc: String!
    }
`

/**
 * 校验服务端同步令牌
 */
function verifyApiToken(token: string) {
    if (!token || token !== process.env.API_TOKEN) {
        throw createGraphQLError("need api token")
    }
}

/**
 * 校验 JWT 管理员权限
 */
function verifyAdmin(context: Context) {
    if (!context.user || !context.user.roles?.includes("admin")) {
        throw createGraphQLError("无权限")
    }
}

/**
 * 判断输入活动与数据库记录是否完全一致
 */
function isSameActivity(
    input: { postId?: string | null; startTime: number; endTime: number; name: string; icon: string; desc: string },
    existing: { postId: string | null; startTime: number; endTime: number; name: string; icon: string; desc: string }
) {
    return (
        (input.postId ?? null) === (existing.postId ?? null) &&
        input.startTime === existing.startTime &&
        input.endTime === existing.endTime &&
        input.name === existing.name &&
        input.icon === existing.icon &&
        input.desc === existing.desc
    )
}

export const resolvers = {
    Query: {
        activity: async (_parent, { server, id }, _context) => {
            return await db.query.activitiesIngame.findFirst({
                where: and(eq(schema.activitiesIngame.server, server), eq(schema.activitiesIngame.id, id)),
            })
        },
        activities: async (_parent, { server, startTime, endTime }, _context) => {
            const conditions = [eq(schema.activitiesIngame.server, server)]
            if (startTime !== undefined && startTime !== null) {
                conditions.push(gte(schema.activitiesIngame.endTime, startTime))
            }
            if (endTime !== undefined && endTime !== null) {
                conditions.push(lte(schema.activitiesIngame.startTime, endTime))
            }
            return await db.query.activitiesIngame.findMany({
                where: and(...conditions),
                orderBy: [desc(schema.activitiesIngame.startTime), desc(schema.activitiesIngame.id)],
            })
        },
    },
    Mutation: {
        createActivity: async (_parent, { server, input }, context) => {
            verifyAdmin(context)
            const [created] = await db
                .insert(schema.activitiesIngame)
                .values({
                    ...input,
                    server,
                })
                .returning()
            if (!created) throw createGraphQLError("create activity failed")
            return created
        },
        updateActivity: async (_parent, { server, id, input }, context) => {
            verifyAdmin(context)
            const [updated] = await db
                .update(schema.activitiesIngame)
                .set({
                    ...input,
                })
                .where(and(eq(schema.activitiesIngame.server, server), eq(schema.activitiesIngame.id, id)))
                .returning()
            if (!updated) throw createGraphQLError("activity not found")
            return updated
        },
        deleteActivity: async (_parent, { server, id }, context) => {
            verifyAdmin(context)
            const deleted = await db
                .delete(schema.activitiesIngame)
                .where(and(eq(schema.activitiesIngame.server, server), eq(schema.activitiesIngame.id, id)))
                .returning({ id: schema.activitiesIngame.id })
            return deleted.length > 0
        },
        upsertActivitiesIngame: async (_parent, { token, server, activities }) => {
            verifyApiToken(token)
            return await db.transaction(async tx => {
                const ids = [...new Set(activities.map((activity: { id: number }) => activity.id))]
                if (ids.length === 0) {
                    return await tx.query.activitiesIngame.findMany({
                        where: eq(schema.activitiesIngame.server, server),
                        orderBy: [desc(schema.activitiesIngame.startTime), desc(schema.activitiesIngame.id)],
                    })
                }

                const existingRows = await tx.query.activitiesIngame.findMany({
                    where: and(eq(schema.activitiesIngame.server, server), inArray(schema.activitiesIngame.id, ids)),
                })
                const existingMap = new Map(existingRows.map(row => [row.id, row]))

                for (const activity of activities) {
                    const normalized = {
                        postId: activity.postId ?? null,
                        startTime: activity.startTime,
                        endTime: activity.endTime,
                        name: activity.name,
                        icon: activity.icon,
                        desc: activity.desc,
                    }
                    const existing = existingMap.get(activity.id)

                    if (!existing) {
                        await tx.insert(schema.activitiesIngame).values({
                            id: activity.id,
                            server,
                            ...normalized,
                        })
                        continue
                    }

                    if (isSameActivity(normalized, existing)) {
                        continue
                    }

                    await tx
                        .update(schema.activitiesIngame)
                        .set(normalized)
                        .where(and(eq(schema.activitiesIngame.server, server), eq(schema.activitiesIngame.id, activity.id)))
                }

                return await tx.query.activitiesIngame.findMany({
                    where: eq(schema.activitiesIngame.server, server),
                    orderBy: [desc(schema.activitiesIngame.startTime), desc(schema.activitiesIngame.id)],
                })
            })
        },
    },
} satisfies Resolver<CreateMobius<typeof typeDefs>, Context>
