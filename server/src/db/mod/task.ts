import type { CreateMobius, Resolver } from "@pa001024/graphql-mobius"
import { and, eq, isNull } from "drizzle-orm"
import { createGraphQLError } from "graphql-yoga"
import { db, schema } from ".."
import { hasUser } from "../kv/room"
import { clearTaskOnline, getTaskOnlineStatus, isTaskOnline, setTaskOnline, toggleTaskPaused } from "../kv/task"
import { now } from "../schema"
import type { Context } from "../yoga"

export const typeDefs = /* GraphQL */ `
    type Query {
        "获取任务"
        tasks(roomId: String!, limit: Int, offset: Int): [Task!]!
        "获取进行中的任务"
        doingTasks(roomId: String!): [Task!]!
    }
    type Mutation {
        "添加任务"
        addTask(roomId: String!, name: String!, maxUser: Int, maxAge: Int, desc: String): Task
        "异步添加任务等待变更"
        addTaskAsync(roomId: String!, name: String!, maxUser: Int, maxAge: Int, desc: String): Task
        "异步添加任务等待结束"
        addTaskEndAsync(roomId: String!, name: String!, maxUser: Int, maxAge: Int, desc: String): Task
        "加入任务"
        joinTask(taskId: String!): Boolean!
        "结束任务"
        endTask(taskId: String!): Boolean!
        "暂停任务"
        pauseTask(taskId: String!): Boolean!
    }
    type Subscription {
        "订阅新任务"
        newTask(roomId: String!): Task!
        "订阅任务更新"
        updateTask(roomId: String!): Task!
        "订阅单个任务更新"
        watchTask(taskId: String!): Task!
    }

    type Task {
        id: String!
        name: String!
        desc: String
        maxUser: Int!
        maxAge: Int
        userList: [String!]!
        startTime: String
        endTime: String
        roomId: String!
        userId: String!
        createdAt: String
        updateAt: String
        online: Boolean
        paused: Boolean

        user: User!
    }
`
async function checkAndAddTask(roomId: string, userId: string, name: string, maxUser: number, maxAge: number, desc?: string) {
    return await db.transaction(async tx => {
        // 在同一事务内先结束旧任务再创建新任务，避免并发下出现多个进行中任务。
        await tx
            .update(schema.tasks)
            .set({ endTime: now() })
            .where(and(eq(schema.tasks.roomId, roomId), isNull(schema.tasks.endTime)))

        const res = (
            await tx
                .insert(schema.tasks)
                .values({
                    name,
                    maxUser: maxUser || 3,
                    maxAge,
                    desc,
                    roomId,
                    userId,
                    userList: [],
                })
                .returning()
        )[0]
        if (!res) return null
        return await tx.query.tasks.findFirst({
            with: { user: true },
            where: eq(schema.tasks.id, res.id),
        })
    })
}

/**
 * @description 校验用户是否已加入指定房间，未加入时抛出业务错误。
 * @param roomId 房间 ID。
 * @param userId 用户 ID。
 * @throws GraphQLError 当用户不在房间时抛出。
 */
function assertRoomJoined(roomId: string, userId: string) {
    if (!hasUser(roomId, userId)) {
        throw createGraphQLError("need room join")
    }
}

/**
 * @description 判断用户是否具备任务管理权限（任务创建者或管理员）。
 * @param taskOwnerId 任务创建者 ID。
 * @param user 当前用户。
 * @returns 是否具备管理权限。
 */
function canManageTask(taskOwnerId: string, user: NonNullable<Context["user"]>) {
    return taskOwnerId === user.id || user.roles?.includes("admin")
}

export const resolvers = {
    Query: {
        tasks: async (_parent, { roomId, limit, offset }, context, _info) => {
            if (!context.user) return []
            if (!hasUser(roomId, context.user.id)) return []
            const tasks = await db.query.tasks.findMany({
                with: {
                    user: true,
                },
                where: eq(schema.tasks.roomId, roomId),
                limit,
                offset,
            })
            return tasks
        },
        doingTasks: async (_parent, { roomId }, context, _info) => {
            if (!context.user) return []
            if (!hasUser(roomId, context.user.id)) return []
            const tasks = await db.query.tasks.findMany({
                with: {
                    user: true,
                },
                where: and(eq(schema.tasks.roomId, roomId), isNull(schema.tasks.endTime)),
            })

            return tasks.map(task => {
                const status = getTaskOnlineStatus(task.id)
                if (status) {
                    return { ...task, ...status }
                }
                return task
            })
        },
    },
    Mutation: {
        addTask: async (_parent, { roomId, name, maxUser, maxAge, desc }, { user, pubsub }, _info) => {
            if (!user) return null
            assertRoomJoined(roomId, user.id)
            const task = await checkAndAddTask(roomId, user.id, name, maxUser || 3, maxAge || 30, desc)
            if (task) {
                pubsub.publish("newTask", roomId, { newTask: task })
                return task
            }
            return null
        },
        addTaskAsync: async (_parent, { roomId, name, maxUser, maxAge, desc }, { user, pubsub }, _info) => {
            if (!user) return null
            assertRoomJoined(roomId, user.id)
            const task = await checkAndAddTask(roomId, user.id, name, maxUser || 3, maxAge || 30, desc)
            if (task) {
                pubsub.publish("newTask", roomId, { newTask: task })
                const idle = pubsub.subscribe("updateTask", roomId)
                while (true) {
                    const message = await idle.next()
                    if (message.value.updateTask.id === task.id) {
                        return message.value.updateTask
                    }
                }
            }
            return null
        },
        addTaskEndAsync: async (_parent, { roomId, name, maxUser, maxAge, desc }, { user, pubsub }, _info) => {
            if (!user) return null
            assertRoomJoined(roomId, user.id)
            const task = await checkAndAddTask(roomId, user.id, name, maxUser || 3, maxAge || 30, desc)
            if (task) {
                pubsub.publish("newTask", roomId, { newTask: task })
                const idle = pubsub.subscribe("updateTask", roomId)
                while (true) {
                    const message = await idle.next()
                    if (message.value.updateTask.id === task.id && message.value.updateTask.endTime) {
                        return message.value.updateTask
                    }
                }
            }
            return null
        },
        joinTask: async (_parent, { taskId }, { user, pubsub }, _info) => {
            if (!user) return false
            const task = await db.transaction(async tx => {
                const currentTask = await tx.query.tasks.findFirst({
                    with: { user: true },
                    where: eq(schema.tasks.id, taskId),
                })
                if (!currentTask) return null
                if (!hasUser(currentTask.roomId, user.id)) return null
                if (currentTask.userList.includes(user.id) || currentTask.endTime) return null

                const nextUserList = [...currentTask.userList, user.id]
                const nextStartTime = currentTask.startTime || now()
                const nextEndTime = nextUserList.length >= currentTask.maxUser ? now() : null
                const updatedTask = (
                    await tx
                        .update(schema.tasks)
                        .set({
                            userList: nextUserList,
                            startTime: nextStartTime,
                            endTime: nextEndTime,
                        })
                        .where(and(eq(schema.tasks.id, taskId), isNull(schema.tasks.endTime)))
                        .returning()
                )[0]
                if (!updatedTask) return null
                return await tx.query.tasks.findFirst({
                    with: { user: true },
                    where: eq(schema.tasks.id, taskId),
                })
            })
            if (!task) return false
            const taskWithStatus = { ...task, ...getTaskOnlineStatus(task.id) }
            pubsub.publish("updateTask", task.roomId, { updateTask: taskWithStatus })
            pubsub.publish("watchTask", task.id, { watchTask: taskWithStatus })
            return true
        },
        endTask: async (_parent, { taskId }, { user, pubsub }, _info) => {
            if (!user) return false
            const task = await db.query.tasks.findFirst({
                with: { user: true },
                where: eq(schema.tasks.id, taskId),
            })
            if (!task) return false
            assertRoomJoined(task.roomId, user.id)
            if (!canManageTask(task.userId, user)) return false
            const updatedTask = (
                await db
                    .update(schema.tasks)
                    .set({
                        startTime: task.startTime || now(),
                        endTime: now(),
                    })
                    .where(and(eq(schema.tasks.id, taskId), isNull(schema.tasks.endTime)))
                    .returning()
            )[0]
            if (!updatedTask) return false
            const taskWithStatus = { ...updatedTask, ...getTaskOnlineStatus(task.id) }
            pubsub.publish("updateTask", task.roomId, { updateTask: taskWithStatus })
            pubsub.publish("watchTask", task.id, { watchTask: taskWithStatus })
            return true
        },
        pauseTask: async (_parent, { taskId }, { user, pubsub }, _info) => {
            if (!user) return false
            if (!isTaskOnline(taskId)) return false
            const task = await db.query.tasks.findFirst({
                with: { user: true },
                where: eq(schema.tasks.id, taskId),
            })
            if (!task) return false
            assertRoomJoined(task.roomId, user.id)
            if (!canManageTask(task.userId, user)) return false
            if (task.endTime) {
                return false
            }
            const taskWithStatus = { ...task, ...toggleTaskPaused(taskId) }
            pubsub.publish("updateTask", task.roomId, { updateTask: taskWithStatus })
            pubsub.publish("watchTask", task.id, { watchTask: taskWithStatus })
            return true
        },
    },
    Subscription: {
        newTask: async (_parent, { roomId }, { user, pubsub }, _info) => {
            if (!user) throw createGraphQLError("need login")
            assertRoomJoined(roomId, user.id)
            return pubsub.subscribe("newTask", roomId)
        },
        updateTask: async (_parent, { roomId }, { user, pubsub }, _info) => {
            if (!user) throw createGraphQLError("need login")
            assertRoomJoined(roomId, user.id)
            return pubsub.subscribe("updateTask", roomId)
        },
        watchTask: async (_parent, { taskId }, { user, pubsub, extra }, _info) => {
            if (!user) throw createGraphQLError("need login")
            const task = await db.query.tasks.findFirst({
                with: { user: true },
                where: eq(schema.tasks.id, taskId),
            })
            if (!task) throw createGraphQLError("task not exist")
            assertRoomJoined(task.roomId, user.id)
            const socket = extra?.socket
            if (socket) {
                setTaskOnline(taskId)
                pubsub.publish("updateTask", task.roomId, { updateTask: { ...task, online: true } })

                const oldclose = socket.data.close
                socket.data.close = async ws => {
                    oldclose?.(ws)
                    clearTaskOnline(taskId)
                    const task = await db.query.tasks.findFirst({
                        with: { user: true },
                        where: and(eq(schema.tasks.id, taskId), isNull(schema.tasks.endTime)),
                    })
                    if (task) {
                        pubsub.publish("updateTask", task.roomId, { updateTask: { ...task, online: false } })
                    }
                }
            }
            return pubsub.subscribe("watchTask", taskId)
        },
    },
} satisfies Resolver<MsgGQL, Context>

export type MsgGQL = CreateMobius<typeof typeDefs>
