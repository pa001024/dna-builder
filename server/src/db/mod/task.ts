import type { CreateMobius, Resolver } from "@pa001024/graphql-mobius"
import { and, eq, isNull } from "drizzle-orm"
import { Context } from "../yoga"
import { db, schema } from ".."
import { now } from "../schema"
import { clearTaskOnline, getTaskOnlineStatus, isTaskOnline, setTaskOnline, toggleTaskPaused } from "../kv/task"
import { createGraphQLError } from "graphql-yoga"

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
    // 结束正在进行的任务
    await db
        .update(schema.tasks)
        .set({ endTime: now() })
        .where(and(eq(schema.tasks.roomId, roomId), isNull(schema.tasks.endTime)))

    const res = (
        await db
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
    if (res) {
        const task = await db.query.tasks.findFirst({
            with: { user: true },
            where: eq(schema.tasks.id, res.id),
        })
        return task
    }
}

export const resolvers = {
    Query: {
        tasks: async (parent, { roomId, limit, offset }, context, info) => {
            if (!context.user) return []
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
        doingTasks: async (parent, { roomId }, context, info) => {
            if (!context.user) return []
            const tasks = await db.query.tasks.findMany({
                with: {
                    user: true,
                },
                where: and(eq(schema.tasks.roomId, roomId), isNull(schema.tasks.endTime)),
            })

            return tasks.map((task) => {
                const status = getTaskOnlineStatus(task.id)
                if (status) {
                    return { ...task, ...status }
                }
                return task
            })
        },
    },
    Mutation: {
        addTask: async (parent, { roomId, name, maxUser, maxAge, desc }, { user, pubsub }, info) => {
            if (!user) return null
            const task = await checkAndAddTask(roomId, user.id, name, maxUser || 3, maxAge || 30, desc)
            if (task) {
                pubsub.publish("newTask", roomId, { newTask: task })
                return task
            }
            return null
        },
        addTaskAsync: async (parent, { roomId, name, maxUser, maxAge, desc }, { user, pubsub }, info) => {
            if (!user) return null
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
        addTaskEndAsync: async (parent, { roomId, name, maxUser, maxAge, desc }, { user, pubsub }, info) => {
            if (!user) return null
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
        joinTask: async (parent, { taskId }, { user, pubsub }, info) => {
            if (!user) return false
            const task = await db.query.tasks.findFirst({
                with: { user: true },
                where: eq(schema.tasks.id, taskId),
            })
            if (!task) return false
            if (task.userList.includes(user.id) || task.endTime) {
                return false
            }
            task.userList.push(user.id)
            task.startTime = task.startTime || now()
            task.endTime = task.userList.length >= task.maxUser ? now() : null
            await db
                .update(schema.tasks)
                .set({
                    userList: task.userList,
                    startTime: task.startTime,
                    endTime: task.endTime,
                })
                .where(eq(schema.tasks.id, taskId))
            pubsub.publish("updateTask", task.roomId, { updateTask: { ...task, ...getTaskOnlineStatus(task.id) } })
            pubsub.publish("watchTask", task.id, { watchTask: { ...task, ...getTaskOnlineStatus(task.id) } })
            return true
        },
        endTask: async (parent, { taskId }, { user, pubsub }, info) => {
            if (!user) return false
            const task = await db.query.tasks.findFirst({
                with: { user: true },
                where: eq(schema.tasks.id, taskId),
            })
            if (!task) return false
            if (task.endTime) {
                return false
            }
            task.startTime = task.startTime || now()
            task.endTime = now()
            await db
                .update(schema.tasks)
                .set({
                    startTime: task.startTime,
                    endTime: task.endTime,
                })
                .where(eq(schema.tasks.id, taskId))
            pubsub.publish("updateTask", task.roomId, { updateTask: task })
            pubsub.publish("watchTask", task.id, { watchTask: task })
            return true
        },
        pauseTask: async (parent, { taskId }, { user, pubsub }, info) => {
            if (!user) return false
            if (!isTaskOnline(taskId)) return false
            const task = await db.query.tasks.findFirst({
                with: { user: true },
                where: eq(schema.tasks.id, taskId),
            })
            if (!task) return false
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
        newTask: async (parent, { roomId }, { user, pubsub }, info) => {
            if (!user) throw createGraphQLError("need login")
            return pubsub.subscribe("newTask", roomId)
        },
        updateTask: async (parent, { roomId }, { user, pubsub, extra }, info) => {
            if (!user) throw createGraphQLError("need login")
            return pubsub.subscribe("updateTask", roomId)
        },
        watchTask: async (parent, { taskId }, { user, pubsub, extra }, info) => {
            if (!user) throw createGraphQLError("need login")
            const task = await db.query.tasks.findFirst({
                with: { user: true },
                where: eq(schema.tasks.id, taskId),
            })
            if (!task) throw createGraphQLError("task not exist")
            const socket = extra?.socket
            if (socket) {
                setTaskOnline(taskId)
                pubsub.publish("updateTask", task.roomId, { updateTask: { ...task, online: true } })

                const oldclose = socket.data.close
                socket.data.close = async (ws) => {
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
