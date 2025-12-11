import type { CreateMobius, Resolver } from "graphql-mobius"
import { db, schema } from ".."
import { Context } from "../yoga"
import { desc, eq, getTableColumns, like, sql } from "drizzle-orm"
import { getSubSelection } from "."
import { addClient, hasUser, removeClient, getUsers, getClientRoom } from "../kv/room"

export const typeDefs = /* GraphQL */ `
    type Mutation {
        createRoom(data: RoomsCreateInput!): Room
        deleteRoom(id: String!): Boolean!
        "获取房间加入权限 实际加入事件由subscription触发"
        joinRoom(id: String!): Room
    }

    type Query {
        room(id: String!): Room
        rooms(name_like: String, limit: Int, offset: Int): [Room!]!
        timeOffset(t: Int!): Int!
    }

    type Subscription {
        "订阅新的客户端变更"
        newRoomUser(roomId: String!): RoomUserChange!
    }

    type RoomUserChange {
        id: String!
        roomId: String!
        userId: String!
        end: Boolean!
        user: TinyUser!
    }

    type Room {
        id: String!
        name: String!
        type: String
        ownerId: String!
        maxUsers: Int
        createdAt: String
        updateAt: String

        "房间创建者"
        owner: User
        msgCount: Int
        "最后一条消息 仅在rooms中可用"
        lastMsg: Msg
        onlineUsers: [TinyUser!]
    }

    type RoomFilter {
        name: String
        type: String
        ownerId: String
    }

    input RoomsCreateInput {
        name: String!
        type: String
        maxUsers: Int
    }
`

export const resolvers = {
    Query: {
        room: async (parent, { id }, context, info) => {
            if (!context.user) return null
            const lastMsgSel = getSubSelection(info, "lastMsg")
            const onlineUsersSel = getSubSelection(info, "onlineUsers")
            let query = db
                .select(
                    schema.removeNull({
                        ...getTableColumns(schema.rooms),
                        owner: schema.link(schema.users, schema.rooms.ownerId),
                        msgCount: sql<number>`(select count(*) from ${schema.msgs} where ${schema.msgs.roomId} = "rooms"."id")`.as("msgCount"),
                        lastMsg:
                            lastMsgSel &&
                            sql`(select json_array("id", "room_id", "user_id", "content", "edited", "created_at", "update_at", (select json_array("id", "email", "name", "qq", "roles", "created_at", "update_at") from (select * from users where id = "rooms_lastMsgs"."user_id" limit 1))) from (select * from "msgs" "rooms_lastMsgs" where "rooms_lastMsgs"."room_id" = "rooms"."id" order by rowid desc limit 1) "rooms_lastMsgs" )`
                                .mapWith((data) => {
                                    data = JSON.parse(data)
                                    const userData = data[7]
                                    return {
                                        id: data[0],
                                        room_id: data[1],
                                        user_id: data[2],
                                        content: data[3],
                                        edited: data[4],
                                        created_at: data[5],
                                        update_at: data[6],
                                        user: {
                                            id: userData[0],
                                            email: userData[1],
                                            name: userData[2],
                                            qq: userData[3],
                                            roles: userData[4],
                                            created_at: userData[5],
                                            update_at: userData[6],
                                        },
                                    }
                                })
                                .as("lastMsg"),
                    })
                )
                .from(schema.rooms)
                .where(eq(schema.rooms.id, id))
                .limit(1)

            const rst = await query.execute()

            if (onlineUsersSel) {
                rst.forEach((room) => {
                    // @ts-ignore
                    room.onlineUsers = getUsers(room.id)
                })
            }
            return rst[0]
        },
        rooms: async (parent, args, context, info: any) => {
            if (!context.user) return []
            const lastMsgSel = getSubSelection(info, "lastMsg")
            const onlineUsersSel = getSubSelection(info, "onlineUsers")

            let query = db
                .select(
                    schema.removeNull({
                        ...getTableColumns(schema.rooms),
                        owner: schema.link(schema.users, schema.rooms.ownerId),
                        msgCount: sql<number>`(select count(*) from ${schema.msgs} where ${schema.msgs.roomId} = "rooms"."id")`.as("msgCount"),
                        lastMsg:
                            lastMsgSel &&
                            sql`(select json_array("id", "room_id", "user_id", "content", "edited", "created_at", "update_at", (select json_array("id", "email", "name", "qq", "roles", "created_at", "update_at") from (select * from users where id = "rooms_lastMsgs"."user_id" limit 1))) from (select * from "msgs" "rooms_lastMsgs" where "rooms_lastMsgs"."room_id" = "rooms"."id" order by rowid desc limit 1) "rooms_lastMsgs" )`
                                .mapWith((data) => {
                                    data = JSON.parse(data)
                                    const userData = data[7]
                                    return {
                                        id: data[0],
                                        room_id: data[1],
                                        user_id: data[2],
                                        content: data[3],
                                        edited: data[4],
                                        created_at: data[5],
                                        update_at: data[6],
                                        user: {
                                            id: userData[0],
                                            email: userData[1],
                                            name: userData[2],
                                            qq: userData[3],
                                            roles: userData[4],
                                            created_at: userData[5],
                                            update_at: userData[6],
                                        },
                                    }
                                })
                                .as("lastMsg"),
                    })
                )
                .from(schema.rooms)
                .orderBy(desc(schema.rooms.updateAt))

            // @ts-ignore
            if (args?.name_like) query = query.where(like(schema.rooms.name, `%${args.name_like}%`)) // 全表扫描
            // @ts-ignore
            if (args?.limit) query = query.limit(args.limit)
            // @ts-ignore
            if (args?.offset) query = query.offset(args.offset)

            const rst = await query.execute()

            if (onlineUsersSel) {
                rst.forEach((room) => {
                    // @ts-ignore
                    room.onlineUsers = getUsers(room.id)
                })
            }

            return rst
        },
        timeOffset: async (parent, { t }, context, info) => {
            return Date.now() - t
        },
    },
    Mutation: {
        createRoom: async (parent, { data: { name, type, maxUsers } }, context, info: any) => {
            const user = context.user
            if (!user) return null
            const rst = (
                await db
                    .insert(schema.rooms)
                    .values({
                        name,
                        type,
                        maxUsers,
                        ownerId: user.id,
                    })
                    .onConflictDoNothing()
                    .returning()
            )[0]
            if (rst) {
                const room = await db.query.rooms.findFirst({
                    with: { owner: true },
                })
                return room
            }
            return null
        },
        joinRoom: async (parent, { id }, context, info: any) => {
            const user = context.user
            if (!user) return null
            let query = db
                .select(
                    schema.removeNull({
                        ...getTableColumns(schema.rooms),
                        owner: schema.link(schema.users, schema.rooms.ownerId),
                        msgCount: sql<number>`(select count(*) from ${schema.msgs} where ${schema.msgs.roomId} = "rooms"."id")`.as("msgCount"),
                    })
                )
                .from(schema.rooms)
                .where(eq(schema.rooms.id, id))
                .limit(1)
            const rst = await query.execute()
            if (rst.length) {
                const room = rst[0]
                if (room) {
                    if (hasUser(room.id, user.id) || room.maxUsers > getUsers(room.id).length) return room
                }
            }
            return null
        },
        deleteRoom: async (parent, { id }, context, info) => {
            const user = context.user
            if (!user) return false
            const room = await db.query.rooms.findFirst({
                where: eq(schema.rooms.id, id),
                with: { owner: true },
            })
            if (room && room.ownerId === user.id) {
                await db.delete(schema.rooms).where(eq(schema.rooms.id, id)).execute()
                return true
            }
            return false
        },
    },
    Subscription: {
        newRoomUser: async (parent, { roomId }, { user, pubsub, extra }, info) => {
            if (!user) throw new Error("need login")
            const socket = extra?.socket
            const room = await db.query.rooms.findFirst({ where: eq(schema.rooms.id, roomId) })
            if (!room) throw new Error("room not found")
            if (room.ownerId !== user.id && !hasUser(room.id, user.id) && room.maxUsers && room.maxUsers <= getUsers(room.id).length) throw new Error("room full")
            if (socket) {
                const id = socket.data.id
                if (!hasUser(roomId, user.id)) {
                    const oldRoom = getClientRoom(id)
                    if (oldRoom) {
                        const newRoomUser = removeClient(id, oldRoom, user)
                        pubsub.publish("newRoomUser", oldRoom, { newRoomUser })
                    }
                    const newRoomUser = addClient(id, roomId, user)
                    pubsub.publish("newRoomUser", roomId, { newRoomUser })
                    const oldclose = socket.data.close
                    socket.data.close = async (ws) => {
                        oldclose?.(ws)
                        const newRoomUser = removeClient(id, roomId, user)
                        pubsub.publish("newRoomUser", roomId, { newRoomUser })
                    }
                }
            }
            return pubsub.subscribe("newRoomUser", roomId)
        },
    },
} satisfies Resolver<CreateMobius<typeof typeDefs>, Context>
