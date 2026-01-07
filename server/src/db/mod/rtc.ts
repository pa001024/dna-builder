import type { CreateMobius, Resolver } from "@pa001024/graphql-mobius"
import { Context } from "../yoga"
import { id } from "../schema"
import { getClients, hasUser } from "../kv/room"
import { createGraphQLError } from "graphql-yoga"

export const typeDefs = /* GraphQL */ `
    type Mutation {
        "发送信令"
        rtcSignal(roomId: String!, type: String!, from: String!, to: String!, body: String!): Boolean!
        "获取rtcId"
        rtcJoin(roomId: String!): RtcJoinResult
    }

    type Query {
        "获取当前房间的所有客户端"
        rtcClients(roomId: String!): [RtcClient!]!
    }
    type Subscription {
        "订阅新的信令事件"
        newRtcEvent(roomId: String!): RtcEvent!
    }

    type RtcJoinResult {
        id: String!
        end: Boolean!
        user: TinyUser!
        clients: [RtcClient!]!
    }

    type RtcClient {
        id: String!
        end: Boolean!
        user: TinyUser!
    }

    type RtcEvent {
        id: String!
        type: String!
        from: String!
        to: String!
        body: String!
    }
`

// 内存RTC信令服务器
export const resolvers = {
    Query: {
        rtcClients: async (parent, { roomId }, context, info) => {
            if (!context.user) return []
            return getClients(roomId)
        },
    },
    Mutation: {
        rtcJoin: async (parent, { roomId }, { user, pubsub }, info) => {
            if (!user) return null
            if (!hasUser(roomId, user.id)) return null
            return {
                id: hasUser(roomId, user.id),
                end: false,
                user: {
                    id: user.id,
                    name: user.name,
                    qq: user.qq,
                },
                clients: getClients(roomId),
            }
        },
        rtcSignal: async (parent, { roomId, type, from, to, body }, { user, pubsub }, info) => {
            if (!user) return false
            const clients = getClients(roomId)
            const rtc = clients?.find((c) => c.id === from && c.user.id === user.id)
            pubsub.publish("newRtcEvent", roomId, { newRtcEvent: { id: id(), type, from, to, body } })
            if (rtc) return true
            return false
        },
    },
    Subscription: {
        newRtcEvent: (parent, { roomId }, { user, pubsub }, info) => {
            if (!user) throw createGraphQLError("need login")
            return pubsub.subscribe("newRtcEvent", roomId)
        },
    },
} satisfies Resolver<CreateMobius<typeof typeDefs>, Context>
