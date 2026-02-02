import type { CreateMobius, Resolver } from "@pa001024/graphql-mobius"
import { desc, eq } from "drizzle-orm"
import { createGraphQLError } from "graphql-yoga"
import { db, schema } from ".."
import type { Context } from "../yoga"

export const typeDefs = /* GraphQL */ `
    type Query {
        "获取委托"
        missionsIngame(server: String!): MissionsIngame
        missionsIngames(server: String!, limit: Int = 10, offset: Int = 0): [MissionsIngame!]!
    }
    type Mutation {
        "添加委托"
        addMissionsIngame(token: String!, server: String!, missions: [[String!]!]!): MissionsIngame!
    }
    type Subscription {
        "订阅委托更新"
        updateMissionsIngame(server: String!): MissionsIngame!
    }

    type MissionsIngame {
        id: Int!
        server: String!
        missions: [[String!]!]!
        createdAt: String
    }
`

export const resolvers = {
    Query: {
        missionsIngame: async (_parent, { server }) => {
            const missionsIngame = await db.query.missionsIngame.findFirst({
                where: eq(schema.missionsIngame.server, server),
                orderBy: desc(schema.missionsIngame.id),
            })
            if (!missionsIngame) throw createGraphQLError("no missionsIngame")
            return missionsIngame
        },
        missionsIngames: async (_parent, { server, limit, offset }) => {
            const missionsIngames = await db.query.missionsIngame.findMany({
                where: eq(schema.missionsIngame.server, server),
                orderBy: desc(schema.missionsIngame.id),
                limit,
                offset,
            })
            return missionsIngames
        },
    },
    Mutation: {
        addMissionsIngame: async (_parent, { token, server, missions }, { pubsub }) => {
            if (!token || token !== process.env.API_TOKEN) throw createGraphQLError("need api token")
            // 同server最后一个值重复校验
            const lastMissionsIngame = await db.query.missionsIngame.findFirst({
                where: eq(schema.missionsIngame.server, server),
                orderBy: desc(schema.missionsIngame.id),
            })
            if (lastMissionsIngame && JSON.stringify(lastMissionsIngame.missions) === JSON.stringify(missions))
                throw createGraphQLError("duplicate missions")

            const missionsIngame = await db
                .insert(schema.missionsIngame)
                .values({
                    server,
                    missions,
                })
                .returning()
            pubsub.publish("updateMissionsIngame", server, {
                updateMissionsIngame: missionsIngame[0],
            })
            return missionsIngame[0]
        },
    },
    Subscription: {
        updateMissionsIngame: async (_parent, { server }, { user, pubsub }) => {
            if (!user) throw createGraphQLError("need login")
            return pubsub.subscribe("updateMissionsIngame", server)
        },
    },
} satisfies Resolver<MsgGQL, Context>

export type MsgGQL = CreateMobius<typeof typeDefs>
