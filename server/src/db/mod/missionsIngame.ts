import type { CreateMobius, Resolver } from "@pa001024/graphql-mobius"
import { desc, eq } from "drizzle-orm"
import { Context } from "../yoga"
import { db, schema } from ".."

export const typeDefs = /* GraphQL */ `
    type Query {
        "获取委托"
        missionsIngame(server: String!): MissionsIngame
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
        missionsIngame: async (parent, { server }, context, info) => {
            const missionsIngame = await db.query.missionsIngame.findFirst({
                where: eq(schema.missionsIngame.server, server),
                orderBy: desc(schema.missionsIngame.id),
            })
            return missionsIngame
        },
    },
    Mutation: {
        addMissionsIngame: async (parent, { token, server, missions }, { user, pubsub }, info) => {
            if (!token || token !== process.env.API_TOKEN) throw new Error("need api token")
            // TODO: 重复校验
            const missionsIngame = await db
                .insert(schema.missionsIngame)
                .values({
                    server,
                    missions,
                })
                .returning()
            return missionsIngame[0]
        },
    },
    Subscription: {
        updateMissionsIngame: async (parent, { server }, { user, pubsub, extra }, info) => {
            if (!user) throw new Error("need login")
            return pubsub.subscribe("updateMissionsIngame", server)
        },
    },
} satisfies Resolver<MsgGQL, Context>

export type MsgGQL = CreateMobius<typeof typeDefs>
