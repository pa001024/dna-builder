import type { CreateMobius, Resolver } from "@pa001024/graphql-mobius"
import { and, count, eq, or } from "drizzle-orm"
import { createGraphQLError } from "graphql-yoga"
import { sanitizeHTML } from "../../util/html"
import { db, schema } from ".."
import { hasUser, waitForUser } from "../kv/room"
import type { Context } from "../yoga"
import { getSubSelection } from "."
import { processMessageImageContent } from "./messageImage"
import { canViewMessageInRoom, getPrivateRoomMessageTopic, isPrivateRoomType } from "./roomVisibility"

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
        sendMessage(roomId: String!, content: String!, replyToMsgId: String): Msg
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
        replyToMsgId: String
        replyToUserId: String
        user: User
        replyTo: Msg
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

/**
 * @description 预处理消息内容：将可能导致消息过长的内联图片转为 OSS 地址后再做安全清洗。
 * @param content 原始消息 HTML。
 * @returns 可安全入库的消息 HTML。
 * @throws GraphQLError 当图片转存失败时抛出业务错误。
 */
async function preprocessMessageContent(content: string): Promise<string> {
    try {
        const imageProcessed = await processMessageImageContent(content)
        return sanitizeHTML(imageProcessed)
    } catch (error) {
        console.error("消息图片预处理失败:", error)
        throw createGraphQLError(error instanceof Error ? error.message : "image process failed")
    }
}

type RoomVisibilityInfo = {
    id: string
    type: string | null
    ownerId: string
}

/**
 * @description 加载房间可见性判断所需的最小字段。
 * @param roomId 房间 ID。
 * @returns 房间信息，不存在时返回 null。
 */
async function getRoomVisibilityInfo(roomId: string): Promise<RoomVisibilityInfo | null> {
    const room = await db.query.rooms.findFirst({
        where: eq(schema.rooms.id, roomId),
        columns: {
            id: true,
            type: true,
            ownerId: true,
        },
    })
    return room ?? null
}

/**
 * @description 构造“当前用户可见消息”过滤条件。
 * @param room 房间信息。
 * @param viewerUserId 当前查看者用户 ID。
 * @returns Drizzle where 条件。
 */
function createVisibleMessageWhere(room: RoomVisibilityInfo, viewerUserId: string) {
    if (!isPrivateRoomType(room.type) || room.ownerId === viewerUserId) {
        return eq(schema.msgs.roomId, room.id)
    }
    return and(eq(schema.msgs.roomId, room.id), or(eq(schema.msgs.userId, viewerUserId), eq(schema.msgs.replyToUserId, viewerUserId)))
}

/**
 * @description 解析回复目标消息，确保回复目标存在且属于同一房间。
 * @param room 当前房间信息。
 * @param senderUserId 发送者用户 ID。
 * @param replyToMsgId 被回复消息 ID。
 * @returns 可写入消息表的回复信息。
 * @throws GraphQLError 当回复目标不存在、跨房间或发送者不可见时抛出。
 */
async function resolveReplyMessage(
    room: RoomVisibilityInfo,
    senderUserId: string,
    replyToMsgId: string | null | undefined
): Promise<{ replyToMsgId: string | null; replyToUserId: string | null }> {
    if (!replyToMsgId) {
        return {
            replyToMsgId: null,
            replyToUserId: null,
        }
    }

    const replyMsg = await db.query.msgs.findFirst({
        where: eq(schema.msgs.id, replyToMsgId),
        columns: {
            id: true,
            roomId: true,
            userId: true,
            replyToUserId: true,
        },
    })

    if (!replyMsg || replyMsg.roomId !== room.id) {
        throw createGraphQLError("reply message not found")
    }

    if (!canViewMessageInRoom(room.type, room.ownerId, senderUserId, replyMsg.userId, replyMsg.replyToUserId)) {
        throw createGraphQLError("cannot reply to invisible message")
    }

    return {
        replyToMsgId: replyMsg.id,
        replyToUserId: replyMsg.userId,
    }
}

/**
 * @description 计算私密房间消息事件的推送目标用户。
 * @param room 房间信息。
 * @param senderUserId 消息发送者 ID。
 * @param replyToUserId 被回复者用户 ID。
 * @returns 推送目标用户 ID 列表。
 */
function getPrivateRoomTargets(room: RoomVisibilityInfo, senderUserId: string, replyToUserId: string | null | undefined): string[] {
    const users = new Set<string>([room.ownerId, senderUserId])
    if (replyToUserId) users.add(replyToUserId)
    return [...users]
}

export const resolvers = {
    Query: {
        msgCount: async (_parent, { roomId }, { user }, _info) => {
            if (!user) throw createGraphQLError("need login")
            if (!hasUser(roomId, user.id)) throw createGraphQLError("need room join")
            const room = await getRoomVisibilityInfo(roomId)
            if (!room) throw createGraphQLError("room not found")

            const rst = await db.select({ value: count() }).from(schema.msgs).where(createVisibleMessageWhere(room, user.id))
            return rst[0].value
        },
        msgs: async (_parent, { roomId, limit, offset }, context, _info) => {
            if (!context.user) throw createGraphQLError("need login")
            const room = await getRoomVisibilityInfo(roomId)
            if (!room) throw createGraphQLError("room not found")
            if (!hasUser(roomId, context.user.id)) {
                try {
                    await waitForUser(roomId, context.user.id)
                } catch {
                    throw createGraphQLError("wait for user timeout")
                }
                // 等待用户加入房间后，再次检查是否加入成功
                if (!hasUser(roomId, context.user.id)) throw createGraphQLError("need room join")
            }

            const user = getSubSelection(_info, "user")
            const reactions = getSubSelection(_info, "reactions")
            const replyTo = getSubSelection(_info, "replyTo")
            const replyToUser = getSubSelection(_info, "replyTo.user")
            const msgs = await db.query.msgs.findMany({
                with: {
                    user: user && true,
                    reactions: reactions && true,
                    replyTo:
                        replyTo &&
                        ({
                            with: {
                                user: replyToUser && true,
                            },
                        } as const),
                },
                where: createVisibleMessageWhere(room, context.user.id),
                limit,
                offset,
            })
            return msgs
        },
        lastMsgs: async (_parent, { roomId, limit, offset }, context, info) => {
            if (!context.user) throw createGraphQLError("need login")
            if (!hasUser(roomId, context.user.id)) throw createGraphQLError("need room join")
            const room = await getRoomVisibilityInfo(roomId)
            if (!room) throw createGraphQLError("room not found")

            const user = getSubSelection(info, "user")
            const reactions = getSubSelection(info, "reactions")
            const replyTo = getSubSelection(info, "replyTo")
            const replyToUser = getSubSelection(info, "replyTo.user")
            const last = await db.query.msgs.findMany({
                with: {
                    user: user && true,
                    reactions: reactions && true,
                    replyTo:
                        replyTo &&
                        ({
                            with: {
                                user: replyToUser && true,
                            },
                        } as const),
                },
                where: createVisibleMessageWhere(room, context.user.id),
                limit,
                offset,
                orderBy: (_t, { desc, sql }) => desc(sql`rowid`),
            })
            return last.reverse()
        },
    },
    Mutation: {
        sendMessage: async (_parent, { roomId, content, replyToMsgId }, { user, pubsub }) => {
            if (!user) throw createGraphQLError("need login")
            const room = await getRoomVisibilityInfo(roomId)
            if (!room) throw createGraphQLError("room not found")
            const userId = user.id
            const replyTarget = await resolveReplyMessage(room, userId, replyToMsgId)
            const parsedContent = await preprocessMessageContent(content)
            if (!parsedContent) throw createGraphQLError("invalid content")
            const rst = (
                await db
                    .insert(schema.msgs)
                    .values({
                        roomId,
                        userId,
                        content: parsedContent,
                        replyToMsgId: replyTarget.replyToMsgId,
                        replyToUserId: replyTarget.replyToUserId,
                    })
                    .onConflictDoNothing()
                    .returning()
            )[0]
            if (rst) {
                const msg = await db.query.msgs.findFirst({
                    with: {
                        user: true,
                        replyTo: {
                            with: {
                                user: true,
                            },
                        },
                    },
                    where: eq(schema.msgs.id, rst.id),
                })
                if (msg) {
                    await db.update(schema.rooms).set({ updateAt: schema.now() }).where(eq(schema.rooms.id, roomId))
                    if (isPrivateRoomType(room.type)) {
                        const targets = getPrivateRoomTargets(room, userId, msg.replyToUserId)
                        for (const targetUserId of targets) {
                            pubsub.publish("newMessage", getPrivateRoomMessageTopic(room.id, targetUserId), { newMessage: msg })
                        }
                    } else {
                        pubsub.publish("newMessage", msg.roomId, { newMessage: msg })
                    }
                }
                return rst
            }
            return null
        },

        addReaction: async (_parent, { msgId, reaction }, { user }) => {
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
                    await db
                        .delete(schema.userReactions)
                        .where(and(eq(schema.userReactions.reactionId, hasMe.reactionId), eq(schema.userReactions.userId, userId)))
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

        editMessage: async (_parent, { msgId, content }, { user, pubsub }, _info) => {
            if (!user) return null
            const msg = await db.query.msgs.findFirst({
                with: {
                    user: true,
                    replyTo: {
                        with: {
                            user: true,
                        },
                    },
                },
                where: eq(schema.msgs.id, msgId),
            })
            if (!msg || msg.userId !== user.id) return null

            const content_sanitized = await preprocessMessageContent(content)
            const updated_msg = (
                await db
                    .update(schema.msgs)
                    .set({ content: content_sanitized, edited: (msg.edited ?? 0) + 1 })
                    .where(eq(schema.msgs.id, msgId))
                    .returning()
            )[0]
            if (updated_msg) {
                const room = await getRoomVisibilityInfo(msg.roomId)
                const msgEdited = {
                    ...msg,
                    content: content_sanitized,
                    edited: updated_msg.edited,
                }
                if (room && isPrivateRoomType(room.type)) {
                    const targets = getPrivateRoomTargets(room, msg.userId, msg.replyToUserId)
                    for (const targetUserId of targets) {
                        pubsub.publish("msgEdited", getPrivateRoomMessageTopic(room.id, targetUserId), { msgEdited })
                    }
                } else {
                    pubsub.publish("msgEdited", msg.roomId, { msgEdited })
                }
            }

            return updated_msg
        },
    },
    Subscription: {
        newMessage: async (_parent, { roomId }, { user, pubsub }, _info) => {
            if (!user) throw createGraphQLError("need login")
            const room = await getRoomVisibilityInfo(roomId)
            if (!room) throw createGraphQLError("room not found")
            if (isPrivateRoomType(room.type)) {
                return pubsub.subscribe("newMessage", getPrivateRoomMessageTopic(room.id, user.id))
            }
            return pubsub.subscribe("newMessage", roomId)
        },
        newReaction: async (_parent, { roomId }, { user, pubsub }, _info) => {
            if (!user) throw createGraphQLError("need login")
            return pubsub.subscribe("newReaction", roomId)
        },
        msgEdited: async (_parent, { roomId }, { user, pubsub }, _info) => {
            if (!user) throw createGraphQLError("need login")
            const room = await getRoomVisibilityInfo(roomId)
            if (!room) throw createGraphQLError("room not found")
            if (isPrivateRoomType(room.type)) {
                return pubsub.subscribe("msgEdited", getPrivateRoomMessageTopic(room.id, user.id))
            }
            return pubsub.subscribe("msgEdited", roomId)
        },
        userJoined: async (_parent, { roomId }, { user, pubsub }, _info) => {
            if (!user) throw createGraphQLError("need login")
            return pubsub.subscribe("userJoined", roomId)
        },
        userLeaved: async (_parent, { roomId }, { user, pubsub }, _info) => {
            if (!user) throw createGraphQLError("need login")
            return pubsub.subscribe("userLeaved", roomId)
        },
    },
} satisfies Resolver<MsgGQL, Context>

export type MsgGQL = CreateMobius<typeof typeDefs>
