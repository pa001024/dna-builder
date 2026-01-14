import { gql, type AnyVariables, type OperationContext } from "@urql/vue"
import { gqClient } from "./graphql"

function extractType<T extends string>(gqlQuery: T) {
    const match = gqlQuery.match(/query[\s\S]*?\s(\w+?)\s*\(/m)
    if (match) {
        return match[1]
    }
    return ""
}

/**
 * 从GraphQL查询字符串中提取查询名称，并返回一个异步函数，用于执行该查询。
 * @param gqlQuery GraphQL查询字符串
 * @returns 解构后的查询结果
 */
function typedQuery<R = { id: string }, G extends string = string>(gqlQuery: G, name?: string) {
    name = name || extractType(gqlQuery)
    const query = gql(gqlQuery)
    return async (variables?: AnyVariables, context?: Partial<OperationContext> | undefined) => {
        const raw = await gqClient.query(query, variables, context).toPromise()
        return raw?.data?.[name] as R | undefined
    }
}

/**
 * 从GraphQL查询字符串中提取查询名称，并返回一个异步函数，用于执行该查询。
 * @param gqlQuery GraphQL查询字符串
 * @returns 原始查询结果
 */
function typedQueryRaw<R = { id: string }, G extends string = string>(gqlQuery: G) {
    const query = gql(gqlQuery)
    return async (variables?: AnyVariables, context?: Partial<OperationContext> | undefined) => {
        const raw = await gqClient.query(query, variables, context).toPromise()
        return raw?.data as R | undefined
    }
}

export const missionsIngameQuery = typedQuery<{
    missions: string[][]
    createdAt: string
}>(/* GraphQL */ `
    query {
        missionsIngame(server: "cn") {
            missions
            createdAt
        }
    }
`)

export const adminStatsQuery = typedQuery<{
    totalUsers: number
    totalGuides: number
    totalRooms: number
    totalMessages: number
}>(
    /* GraphQL */ `
        query {
            adminStats {
                totalUsers
                totalGuides
                totalRooms
                totalMessages
            }
        }
    `,
    "adminStats"
)

export const recentActivitiesQuery = typedQuery<
    Array<{
        id: string
        user: string
        action: string
        target: string
        time: string
    }>
>(/* GraphQL */ `
    query ($limit: Int) {
        recentActivities(limit: $limit) {
            id
            user
            action
            target
            time
        }
    }
`)

// ========== Admin Queries ==========

export interface UsersQueryResult {
    users: Array<{
        id: string
        name: string
        email: string
        qq: string
        roles: string
        createdAt: string
        updateAt: string
    }>
    usersCount: number
}

export interface GuidesQueryResult {
    guides: Array<{
        id: string
        title: string
        type: string
        content: string
        images: string[]
        charId: number | null
        userId: string
        charSettings: string
        views: number
        likes: number
        isRecommended: boolean | null
        isPinned: boolean | null
        createdAt: string
        updateAt: string
        user: {
            id: string
            name: string
        }
    }>
    guidesCount: number
}

export interface RoomsQueryResult {
    rooms: Array<{
        id: string
        name: string
        type: string | null
        ownerId: string
        maxUsers: number | null
        createdAt: string
        updateAt: string
        owner: {
            id: string
            name: string
        }
    }>
    roomsCount: number
}

export interface TodosQueryResult {
    todos: Array<{
        id: string
        title: string
        description: string | null
        startTime: string | null
        endTime: string | null
        type: string
        userId: string
        createdAt: string
        updateAt: string
        isCompleted: boolean
        user: {
            id: string
            name: string
        }
    }>
    todosCount: number
}

export const usersQuery = typedQueryRaw<UsersQueryResult>(/* GraphQL */ `
    query ($limit: Int, $offset: Int, $search: String) {
        users(limit: $limit, offset: $offset, search: $search) {
            id
            name
            email
            qq
            roles
            createdAt
            updateAt
        }
        usersCount(search: $search)
    }
`)

export const guidesQuery = typedQueryRaw<GuidesQueryResult>(/* GraphQL */ `
    query ($limit: Int, $offset: Int, $search: String, $type: String) {
        guides(limit: $limit, offset: $offset, search: $search, type: $type) {
            id
            title
            type
            content
            images
            charId
            userId
            charSettings
            views
            likes
            isRecommended
            isPinned
            createdAt
            updateAt
            user {
                id
                name
            }
        }
        guidesCount(search: $search, type: $type)
    }
`)

export const roomsQuery = typedQueryRaw<RoomsQueryResult>(/* GraphQL */ `
    query ($limit: Int, $offset: Int) {
        rooms(limit: $limit, offset: $offset) {
            id
            name
            type
            ownerId
            maxUsers
            createdAt
            updateAt
            owner {
                id
                name
            }
        }
        roomsCount
    }
`)

export const todosQuery = typedQueryRaw<TodosQueryResult>(/* GraphQL */ `
    query ($limit: Int, $offset: Int, $type: String) {
        todos(limit: $limit, offset: $offset, type: $type) {
            id
            title
            description
            startTime
            endTime
            type
            userId
            createdAt
            updateAt
            isCompleted
            user {
                id
                name
            }
        }
        todosCount(type: $type)
    }
`)

// ========== User Todo Query (获取用户+系统todos) ==========

export const userTodosQuery = typedQueryRaw<TodosQueryResult>(/* GraphQL */ `
    query UserTodos($limit: Int, $offset: Int) {
        todos(limit: $limit, offset: $offset) {
            id
            title
            description
            startTime
            endTime
            type
            userId
            createdAt
            updateAt
            isCompleted
            user {
                id
                name
            }
        }
        todosCount
    }
`)
