import type { CreateMobius, Resolver } from "@pa001024/graphql-mobius"
import { eq, and, or, desc, sql, like } from "drizzle-orm"
import { db, schema } from ".."
import type { Context } from "../yoga"
import { createGraphQLError } from "graphql-yoga"
import { getSubSelection } from "."

export const typeDefs = /* GraphQL */ `
    type Todo {
        id: String!
        title: String!
        description: String
        startTime: String
        endTime: String
        type: String!
        userId: String!
        createdAt: String!
        updateAt: String!
        user: User
        isCompleted: Boolean
    }

    input TodoInput {
        title: String!
        description: String
        startTime: String
        endTime: String
    }

    type Mutation {
        createTodo(input: TodoInput!): Todo
        updateTodo(id: String!, input: TodoInput!): Todo
        deleteTodo(id: String!): Boolean
        createSystemTodo(input: TodoInput!): Todo
        updateSystemTodo(id: String!, input: TodoInput!): Todo
        deleteSystemTodo(id: String!): Boolean
        completeTodo(id: String!): Todo
    }

    type Query {
        todos(type: String, limit: Int = 20, offset: Int = 0): [Todo!]!
        todo(id: String!): Todo
        todosCount(type: String): Int!
    }
`

export const resolvers = {
    Query: {
        todos: async (parent, args, context, info) => {
            const { type, limit = 20, offset = 0 } = args || {}
            const conditions: any[] = []

            if (context.user) {
                // 已登录：返回用户的个人待办事项 AND 系统待办事项
                const userCondition = or(eq(schema.todos.userId, context.user!.id), eq(schema.todos.type, "system"))
                conditions.push(userCondition)
            } else {
                // 未登录：只返回系统待办事项
                conditions.push(eq(schema.todos.type, "system"))
            }

            if (type) {
                // 如果指定了类型，添加到条件中
                conditions.push(eq(schema.todos.type, type))
            }

            const withUser = getSubSelection(info, "user")
            const withCompletions = context.user && !type // 只有已登录且未指定type时才查询completions

            const result = await db.query.todos.findMany({
                where: conditions.length > 0 ? and(...conditions) : undefined,
                orderBy: [desc(schema.todos.createdAt)],
                limit,
                offset,
                with: {
                    user: withUser ? true : undefined,
                    completions: withCompletions ? true : undefined,
                },
            })

            // 使用数据库查询结果中的 completions，无需 Promise.all
            const todosWithCompleted = result.map((todo) => {
                let isCompleted = false

                // 只有系统待办事项需要检查完成状态
                if (todo.type === "system" && context.user && todo.completions) {
                    // 检查当前用户是否已完成该系统todo
                    isCompleted = todo.completions.some((c) => c.userId === context.user!.id)
                }

                return {
                    ...todo,
                    description: todo.description ?? "",
                    startTime: todo.startTime ?? "",
                    endTime: todo.endTime ?? "",
                    createdAt: todo.createdAt ?? "",
                    updateAt: todo.updateAt ?? "",
                    isCompleted,
                }
            })

            return todosWithCompleted
        },
        todo: async (parent, args, context, info) => {
            const { id } = args

            const withUser = getSubSelection(info, "user")

            const todo = await db.query.todos.findFirst({
                where: eq(schema.todos.id, id),
                with: {
                    user: withUser ? true : undefined,
                    completions: context.user ? true : undefined,
                },
            })

            if (!todo) {
                throw createGraphQLError("待办事项不存在")
            }

            // 检查权限：用户只能查看自己的待办事项或系统待办事项
            if (context.user && todo.userId !== context.user.id && todo.type !== "system") {
                throw createGraphQLError("无权查看此待办事项")
            }

            // 计算完成状态（使用数据库查询结果中的 completions）
            let isCompleted = false
            if (todo.type === "system" && context.user && todo.completions) {
                isCompleted = todo.completions.some((c) => c.userId === context.user!.id)
            }

            return {
                ...todo,
                description: todo.description ?? "",
                startTime: todo.startTime ?? "",
                endTime: todo.endTime ?? "",
                createdAt: todo.createdAt ?? "",
                updateAt: todo.updateAt ?? "",
                isCompleted,
            }
        },
        todosCount: async (parent, args, context) => {
            const { type } = args || {}
            const conditions: any[] = []

            if (context.user) {
                // 已登录：统计用户的个人待办事项 AND 系统待办事项
                // 使用 OR 逻辑：userId == 当前用户.id OR type == "system"
                const userCondition = or(eq(schema.todos.userId, context.user.id), eq(schema.todos.type, "system"))
                conditions.push(userCondition)
            } else {
                // 未登录：只统计系统待办事项
                conditions.push(eq(schema.todos.type, "system"))
            }

            if (type) {
                // 如果指定了类型，添加到条件中
                conditions.push(eq(schema.todos.type, type))
            }

            const whereClause = conditions.length > 0 ? and(...conditions) : undefined

            const [result] = await db
                .select({ count: sql<number>`count(*)` })
                .from(schema.todos)
                .where(whereClause)
            return result?.count || 0
        },
    },
    Mutation: {
        createTodo: async (parent, args, context, info) => {
            if (!context.user) {
                throw createGraphQLError("需要登录")
            }

            const { input } = args

            const [todo] = await db
                .insert(schema.todos)
                .values({
                    ...input,
                    type: "user",
                    userId: context.user.id,
                })
                .returning()

            let result = todo
            if (getSubSelection(info, "user")) {
                const userTodo = await db.query.todos.findFirst({
                    where: eq(schema.todos.id, todo.id),
                    with: { user: true },
                })
                if (userTodo) result = userTodo
            }

            return {
                ...result,
                description: result.description ?? "",
                startTime: result.startTime ?? "",
                endTime: result.endTime ?? "",
                createdAt: result.createdAt ?? "",
                updateAt: result.updateAt ?? "",
                isCompleted: false,
            }
        },
        updateTodo: async (parent, args, context, info) => {
            if (!context.user) {
                throw createGraphQLError("需要登录")
            }

            const { id, input } = args
            const todo = await db.query.todos.findFirst({
                where: eq(schema.todos.id, id),
            })

            if (!todo) {
                throw createGraphQLError("待办事项不存在")
            }

            // 只能修改自己的用户待办事项
            if (todo.type !== "user" || todo.userId !== context.user.id) {
                throw createGraphQLError("无权修改此待办事项")
            }

            const [updated] = await db.update(schema.todos).set(input).where(eq(schema.todos.id, id)).returning()

            let result = updated
            if (getSubSelection(info, "user")) {
                const userTodo = await db.query.todos.findFirst({
                    where: eq(schema.todos.id, id),
                    with: { user: true },
                })
                if (userTodo) result = userTodo
            }

            return {
                ...result,
                description: result.description ?? "",
                startTime: result.startTime ?? "",
                endTime: result.endTime ?? "",
                createdAt: result.createdAt ?? "",
                updateAt: result.updateAt ?? "",
                isCompleted: false,
            }
        },
        deleteTodo: async (parent, { id }, context) => {
            if (!context.user) {
                throw createGraphQLError("需要登录")
            }

            const todo = await db.query.todos.findFirst({
                where: eq(schema.todos.id, id),
            })

            if (!todo) {
                throw createGraphQLError("待办事项不存在")
            }

            // 只能删除自己的用户待办事项
            if (todo.type !== "user" || todo.userId !== context.user.id) {
                throw createGraphQLError("无权删除此待办事项")
            }

            await db.delete(schema.todos).where(eq(schema.todos.id, id))
            return true
        },
        createSystemTodo: async (parent, args, context, info) => {
            if (!context.user || !context.user.roles?.includes("admin")) {
                throw createGraphQLError("无权限")
            }

            const { input } = args

            const [todo] = await db
                .insert(schema.todos)
                .values({
                    ...input,
                    type: "system",
                    userId: context.user.id, // 记录创建者
                })
                .returning()

            let result = todo
            if (getSubSelection(info, "user")) {
                const userTodo = await db.query.todos.findFirst({
                    where: eq(schema.todos.id, todo.id),
                    with: { user: true },
                })
                if (userTodo) result = userTodo
            }

            return {
                ...result,
                description: result.description ?? "",
                startTime: result.startTime ?? "",
                endTime: result.endTime ?? "",
                createdAt: result.createdAt ?? "",
                updateAt: result.updateAt ?? "",
                isCompleted: false,
            }
        },
        updateSystemTodo: async (parent, args, context, info) => {
            if (!context.user || !context.user.roles?.includes("admin")) {
                throw createGraphQLError("无权限")
            }

            const { id, input } = args
            const todo = await db.query.todos.findFirst({
                where: eq(schema.todos.id, id),
            })

            if (!todo) {
                throw createGraphQLError("待办事项不存在")
            }

            // 只能修改系统待办事项
            if (todo.type !== "system") {
                throw createGraphQLError("只能修改系统待办事项")
            }

            const [updated] = await db.update(schema.todos).set(input).where(eq(schema.todos.id, id)).returning()

            // 重新查询完整数据（包含 completions）
            const withUser = getSubSelection(info, "user")
            const result = await db.query.todos.findFirst({
                where: eq(schema.todos.id, id),
                with: {
                    user: withUser ? true : undefined,
                    completions: true,
                },
            })

            if (!result) {
                throw createGraphQLError("待办事项不存在")
            }

            // 计算当前用户的完成状态
            let isCompleted = false
            if (context.user && result.completions) {
                isCompleted = result.completions.some((c: any) => c.userId === context.user!.id)
            }

            return {
                ...result,
                description: result.description ?? "",
                startTime: result.startTime ?? "",
                endTime: result.endTime ?? "",
                createdAt: result.createdAt ?? "",
                updateAt: result.updateAt ?? "",
                isCompleted,
            }
        },
        deleteSystemTodo: async (parent, { id }, context) => {
            if (!context.user || !context.user.roles?.includes("admin")) {
                throw createGraphQLError("无权限")
            }

            const todo = await db.query.todos.findFirst({
                where: eq(schema.todos.id, id),
            })

            if (!todo) {
                throw createGraphQLError("待办事项不存在")
            }

            // 只能删除系统待办事项
            if (todo.type !== "system") {
                throw createGraphQLError("只能删除系统待办事项")
            }

            await db.delete(schema.todos).where(eq(schema.todos.id, id))
            return true
        },
        completeTodo: async (parent, args, context, info) => {
            if (!context.user) {
                throw createGraphQLError("需要登录")
            }

            const { id } = args
            const todo = await db.query.todos.findFirst({
                where: eq(schema.todos.id, id),
            })

            if (!todo) {
                throw createGraphQLError("待办事项不存在")
            }

            // 检查是否已经完成
            const [existing] = await db
                .select()
                .from(schema.todoCompletions)
                .where(and(eq(schema.todoCompletions.todoId, id), eq(schema.todoCompletions.userId, context.user.id)))

            let isCompleted = false
            if (existing) {
                // 已完成，取消完成（删除完成记录）
                await db.delete(schema.todoCompletions).where(and(eq(schema.todoCompletions.id, existing.id)))
                isCompleted = false
            } else {
                // 未完成，添加完成记录
                await db.insert(schema.todoCompletions).values({
                    todoId: id,
                    userId: context.user.id,
                })
                isCompleted = true
            }

            // 返回更新后的待办事项
            const updated = await db.query.todos.findFirst({
                where: eq(schema.todos.id, id),
                with: { user: getSubSelection(info, "user") ? true : undefined },
            })

            if (!updated) {
                throw createGraphQLError("待办事项不存在")
            }

            return {
                ...updated,
                description: updated.description ?? "",
                startTime: updated.startTime ?? "",
                endTime: updated.endTime ?? "",
                createdAt: updated.createdAt ?? "",
                updateAt: updated.updateAt ?? "",
                isCompleted,
            }
        },
    },
} satisfies Resolver<CreateMobius<typeof typeDefs>, Context>
