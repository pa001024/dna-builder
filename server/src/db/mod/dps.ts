import type { CreateMobius, Resolver } from "@pa001024/graphql-mobius"
import { and, desc, eq, sql } from "drizzle-orm"
import { createGraphQLError } from "graphql-yoga"
import { db, schema } from ".."
import type { Context } from "../yoga"
import { getSubSelection } from "."

export const typeDefs = /* GraphQL */ `
    type DPS {
        id: String!
        charId: Int!
        buildId: String
        timelineId: String
        dpsValue: Int!
        details: String
        userId: String!
        createdAt: String!
        updateAt: String!
        user: User
        build: Build
        timeline: Timeline
    }

    input DPSInput {
        charId: Int!
        buildId: String
        timelineId: String
        dpsValue: Int!
        details: String
    }

    type Query {
        dpsList(charId: Int, buildId: String, timelineId: String, limit: Int = 20, offset: Int = 0, sortBy: String = "dpsValue"): [DPS!]!
        dpsCount(charId: Int, buildId: String, timelineId: String): Int!
        charDPS(charId: Int!, limit: Int = 10): [DPS!]!
    }

    type Mutation {
        createDPS(input: DPSInput!): DPS
        updateDPS(id: String!, input: DPSInput!): DPS
        deleteDPS(id: String!): Boolean
    }
`

export const resolvers = {
    Query: {
        dpsList: async (_parent, args, _context, info) => {
            const { charId, buildId, timelineId, limit = 20, offset = 0, sortBy = "dpsValue" } = args || {}
            const conditions = []

            if (charId) {
                conditions.push(eq(schema.dps.charId, charId))
            }
            if (buildId) {
                conditions.push(eq(schema.dps.buildId, buildId))
            }
            if (timelineId) {
                conditions.push(eq(schema.dps.timelineId, timelineId))
            }

            let orderBy: any[]
            switch (sortBy) {
                case "dpsValue":
                    orderBy = [desc(schema.dps.dpsValue)]
                    break
                case "createdAt":
                    orderBy = [desc(schema.dps.createdAt)]
                    break
                default:
                    orderBy = [desc(schema.dps.dpsValue)]
            }

            const result = await db.query.dps.findMany({
                where: conditions.length > 0 ? and(...conditions) : undefined,
                orderBy,
                limit,
                offset,
                with: {
                    user: getSubSelection(info, "user") ? true : undefined,
                    build: getSubSelection(info, "build") ? true : undefined,
                    timeline: getSubSelection(info, "timeline") ? true : undefined,
                },
            })

            return result.map(dps => ({
                ...dps,
                createdAt: dps.createdAt ?? "",
                updateAt: dps.updateAt ?? "",
            }))
        },
        dpsCount: async (_parent, args) => {
            const { charId, buildId, timelineId } = args || {}
            const conditions = []

            if (charId) {
                conditions.push(eq(schema.dps.charId, charId))
            }
            if (buildId) {
                conditions.push(eq(schema.dps.buildId, buildId))
            }
            if (timelineId) {
                conditions.push(eq(schema.dps.timelineId, timelineId))
            }

            const whereClause = conditions.length > 0 ? and(...conditions) : undefined

            const [result] = await db.select({ count: sql<number>`count(*)` }).from(schema.dps).where(whereClause)
            return result?.count || 0
        },
        charDPS: async (_parent, args, _context, info) => {
            const { charId, limit = 10 } = args || {}
            if (!charId) {
                throw createGraphQLError("charId is required")
            }

            const result = await db.query.dps.findMany({
                where: eq(schema.dps.charId, charId),
                orderBy: [desc(schema.dps.dpsValue)],
                limit,
                with: {
                    user: getSubSelection(info, "user") ? true : undefined,
                    build: getSubSelection(info, "build") ? true : undefined,
                    timeline: getSubSelection(info, "timeline") ? true : undefined,
                },
            })

            return result.map(dps => ({
                ...dps,
                createdAt: dps.createdAt ?? "",
                updateAt: dps.updateAt ?? "",
            }))
        },
    },
    Mutation: {
        createDPS: async (_parent, args, context, info) => {
            if (!context.user) {
                throw createGraphQLError("需要登录")
            }

            const { input } = args
            const [dps] = await db
                .insert(schema.dps)
                .values({
                    ...input,
                    userId: context.user.id,
                })
                .returning()

            if (!dps) {
                throw createGraphQLError("创建失败")
            }

            const result = await db.query.dps.findFirst({
                where: eq(schema.dps.id, dps.id),
                with: {
                    user: getSubSelection(info, "user") ? true : undefined,
                    build: getSubSelection(info, "build") ? true : undefined,
                    timeline: getSubSelection(info, "timeline") ? true : undefined,
                },
            })

            if (!result) {
                throw createGraphQLError("创建失败")
            }

            return {
                ...result,
                createdAt: result.createdAt ?? "",
                updateAt: result.updateAt ?? "",
            }
        },
        updateDPS: async (_parent, args, context, info) => {
            if (!context.user) {
                throw createGraphQLError("需要登录")
            }

            const { id, input } = args
            const existingDPS = await db.query.dps.findFirst({
                where: eq(schema.dps.id, id),
            })

            if (!existingDPS) {
                throw createGraphQLError("DPS数据不存在")
            }

            if (existingDPS.userId !== context.user.id && !context.user.roles?.includes("admin")) {
                throw createGraphQLError("无权修改此DPS数据")
            }

            const [updated] = await db
                .update(schema.dps)
                .set({ ...input })
                .where(eq(schema.dps.id, id))
                .returning()

            if (!updated) {
                throw createGraphQLError("更新失败")
            }

            const result = await db.query.dps.findFirst({
                where: eq(schema.dps.id, id),
                with: {
                    user: getSubSelection(info, "user") ? true : undefined,
                    build: getSubSelection(info, "build") ? true : undefined,
                    timeline: getSubSelection(info, "timeline") ? true : undefined,
                },
            })

            if (!result) {
                throw createGraphQLError("更新失败")
            }

            return {
                ...result,
                createdAt: result.createdAt ?? "",
                updateAt: result.updateAt ?? "",
            }
        },
        deleteDPS: async (_parent, args, context) => {
            if (!context.user) {
                throw createGraphQLError("需要登录")
            }

            const { id } = args
            const dps = await db.query.dps.findFirst({
                where: eq(schema.dps.id, id),
            })

            if (!dps) {
                throw createGraphQLError("DPS数据不存在")
            }

            if (dps.userId !== context.user.id && !context.user.roles?.includes("admin")) {
                throw createGraphQLError("无权删除此DPS数据")
            }

            await db.delete(schema.dps).where(eq(schema.dps.id, id))
            return true
        },
    },
} satisfies Resolver<CreateMobius<typeof typeDefs>, Context>

export type DPSGQL = CreateMobius<typeof typeDefs>
