import type { CreateMobius, Resolver } from "graphql-mobius"
import { and, count, eq } from "drizzle-orm"
import { Context } from "../yoga"
import { db, schema } from ".."
import { getSubSelection } from "."
import { sanitizeHTML } from "../../util/html"
import { hasUser } from "../kv/room"

export const typeDefs = /* GraphQL */ `
    type Query {
        "获取指定房间消息数量"
        msgCount(roomId: String!): Int!
        "获取指定房间消息列表"
        msgs(roomId: String!, limit: Int, offset: Int): [Msg!]!
        "获取指定房间消息列表(倒序)"
        lastMsgs(roomId: String!, limit: Int, offset: Int): [Msg!]!
    }
    type Mutation {
        "发送消息"
        sendMessage(roomId: String!, content: String!): Msg
        "编辑消息"
        editMessage(msgId: String!, content: String!): Msg
        "添加表情"
        addReaction(msgId: String!, reaction: String!): Msg
    }
    type Subscription {
        "订阅新消息"
        newMessage(roomId: String!): Msg!
        "订阅新表情"
        newReaction(roomId: String!): Reaction!
        "订阅消息编辑"
        msgEdited(roomId: String!): Msg!
        "订阅用户加入"
        userJoined(roomId: String!): User!
        "订阅用户离开"
        userLeaved(roomId: String!): User!
    }

    type Msg {
        id: String!
        roomId: String!
        userId: String!
        content: String!
        edited: Int
        createdAt: String
        updateAt: String
        user: User!
        reactions: [Reaction!]
    }

    type Reaction {
        id: String!
        msgId: String!
        count: Int
        users: [User!]
        createdAt: String
    }
`

export const resolvers = {
    Query: {
        msgCount: async (parent, { roomId }, { user }, info) => {
            if (!user) throw new Error("need login")
            if (!hasUser(roomId, user.id)) throw new Error("need room join")

            const rst = await db.select({ value: count() }).from(schema.msgs).where(eq(schema.msgs.roomId, roomId))
            return rst[0].value
        },
        msgs: async (parent, { roomId, limit, offset }, context, info) => {
            if (!context.user) throw new Error("need login")
            if (!hasUser(roomId, context.user.id)) throw new Error("need room join")

            const user = getSubSelection(info, "user")
            const reactions = getSubSelection(info, "reactions")
            const msgs = await db.query.msgs.findMany({
                with: {
                    user: user && true,
                    reactions: reactions && true,
                },
                where: eq(schema.msgs.roomId, roomId),
                limit,
                offset,
            })
            return msgs
        },
        lastMsgs: async (parent, { roomId, limit, offset }, context, info) => {
            if (!context.user) throw new Error("need login")
            if (!hasUser(roomId, context.user.id)) throw new Error("need room join")

            const user = getSubSelection(info, "user")
            const reactions = getSubSelection(info, "reactions")
            const last = await db.query.msgs.findMany({
                with: {
                    user: user && true,
                    reactions: reactions && true,
                },
                where: eq(schema.msgs.roomId, roomId),
                limit,
                offset,
                orderBy: (t, { desc, sql }) => desc(sql`rowid`),
            })
            return last.reverse()
        },
    },
    Mutation: {
        sendMessage: async (parent, { roomId, content }, { user, pubsub }) => {
            if (!user) throw new Error("need login")
            // TODO: check if user is in the room
            const userId = user.id
            const rst = (
                await db
                    .insert(schema.msgs)
                    .values({
                        roomId,
                        userId,
                        content: sanitizeHTML(content),
                    })
                    .onConflictDoNothing()
                    .returning()
            )[0]
            if (rst) {
                const msg = await db.query.msgs.findFirst({
                    with: { user: true },
                    where: eq(schema.msgs.id, rst.id),
                })
                if (msg) {
                    await db.update(schema.rooms).set({ updateAt: schema.now() }).where(eq(schema.rooms.id, roomId))
                    pubsub.publish("newMessage", msg.roomId, { newMessage: msg })
                }
                return rst
            }
            return null
        },

        addReaction: async (parent, { msgId, reaction }, { user }) => {
            if (!user) return null
            const userId = user.id
            // 查询是否已经存在该 reaction
            let existReaction = await db.query.reactions.findFirst({
                where: and(eq(schema.reactions.msgId, msgId), eq(schema.userReactions.userId, userId)),
            })
            // 判断当前userReactions表是否包含我
            if (existReaction) {
                const hasMe = await db.query.userReactions.findFirst({
                    where: and(eq(schema.userReactions.reactionId, existReaction.id), eq(schema.userReactions.userId, userId)),
                })
                if (hasMe) {
                    await db.delete(schema.userReactions).where(and(eq(schema.userReactions.reactionId, hasMe.reactionId), eq(schema.userReactions.userId, userId)))
                } else {
                    await db.insert(schema.userReactions).values({
                        userId,
                        reactionId: existReaction.id,
                    })
                }
            } else {
                existReaction = (
                    await db
                        .insert(schema.reactions)
                        .values({
                            msgId,
                            content: reaction,
                        })
                        .returning()
                )[0]
                await db.insert(schema.userReactions).values({
                    userId,
                    reactionId: existReaction.id,
                })
            }
            return existReaction
        },

        editMessage: async (parent, { msgId, content }, { user, pubsub }, info) => {
            if (!user) return null
            const msg = await db.query.msgs.findFirst({
                with: { user: true },
                where: eq(schema.msgs.id, msgId),
            })
            if (!msg || msg.userId !== user.id) return null

            const content_sanitized = sanitizeHTML(content)
            const updated_msg = (
                await db
                    .update(schema.msgs)
                    .set({ content: content_sanitized, edited: (msg.edited ?? 0) + 1 })
                    .where(eq(schema.msgs.id, msgId))
                    .returning()
            )[0]
            if (updated_msg) {
                pubsub.publish("msgEdited", msg.roomId, { msgEdited: { ...msg, content: content_sanitized } })
            }

            return updated_msg
        },
    },
    Subscription: {
        newMessage: async (parent, { roomId }, { user, pubsub }, info) => {
            if (!user) throw new Error("need login")
            return pubsub.subscribe("newMessage", roomId)
        },
        newReaction: async (parent, { roomId }, { user, pubsub }, info) => {
            if (!user) throw new Error("need login")
            return pubsub.subscribe("newReaction", roomId)
        },
        msgEdited: async (parent, { roomId }, { user, pubsub }, info) => {
            if (!user) throw new Error("need login")
            return pubsub.subscribe("msgEdited", roomId)
        },
        userJoined: async (parent, { roomId }, { user, pubsub }, info) => {
            if (!user) throw new Error("need login")
            return pubsub.subscribe("userJoined", roomId)
        },
        userLeaved: async (parent, { roomId }, { user, pubsub }, info) => {
            if (!user) throw new Error("need login")
            return pubsub.subscribe("userLeaved", roomId)
        },
    },
} satisfies Resolver<MsgGQL, Context>

export type MsgGQL = CreateMobius<typeof typeDefs>
