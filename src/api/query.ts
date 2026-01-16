import { type AnyVariables, gql, type OperationContext } from "@urql/vue"
import { gqClient } from "./graphql"

export function extractType<T extends string>(gqlQuery: T) {
    const match = gqlQuery.match(/query[\s\S]*?\s(\w+?)\s*[({]/m)
    if (match) {
        return match[1]
    }
    return ""
}
export type ExtractVariablesFromTypedQuery<T> = T extends (variables?: infer V, context?: Partial<OperationContext>) => Promise<any>
    ? V // 提取到变量类型 V（继承 AnyVariables）
    : never

/**
 * 从GraphQL查询字符串中提取查询名称，并返回一个异步函数，用于执行该查询。
 * @param gqlQuery GraphQL查询字符串
 * @returns 解构后的查询结果
 */
export function typedQuery<R = { id: string }, V extends AnyVariables = AnyVariables, G extends string = string>(
    gqlQuery: G,
    name?: string
) {
    name = name || extractType(gqlQuery)
    const query = gql(gqlQuery)
    const fn = async (variables?: V, context?: Partial<OperationContext> | undefined) => {
        const raw = await gqClient.query(query, variables, context).toPromise()
        return raw?.data?.[name] as R | undefined
    }
    fn.raw = gqlQuery
    return fn
}

/**
 * 从GraphQL查询字符串中提取查询名称，并返回一个异步函数，用于执行该查询。
 * @param gqlQuery GraphQL查询字符串
 * @returns 原始查询结果
 */
function typedQueryRaw<R = { id: string }, V extends AnyVariables = AnyVariables, G extends string = string>(gqlQuery: G) {
    const query = gql(gqlQuery)
    const fn = async (variables?: V, context?: Partial<OperationContext> | undefined) => {
        const raw = await gqClient.query(query, variables, context).toPromise()
        return raw?.data as R | undefined
    }
    fn.raw = gqlQuery
    return fn
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

export interface Msg {
    id: string
    edited: number
    content: string
    createdAt: string
    user: {
        id: string
        name: string
        qq: string
    }
}

export const msgsQuery = typedQuery<
    Msg[],
    {
        roomId: string
        limit?: number
        offset?: number
    }
>(/* GraphQL */ `
    query ($roomId: String!, $limit: Int, $offset: Int) {
        msgs(roomId: $roomId, limit: $limit, offset: $offset) {
            id, edited, content, createdAt, user { id, name, qq }
        }
    }
`)

export const adminStatsQuery = typedQuery<{
    adminStats: {
        totalUsers: number
        totalGuides: number
        totalRooms: number
        totalMessages: number
        totalBuilds: number
        totalTimelines: number
    }
}>(/* GraphQL */ `
    query {
        adminStats {
            totalUsers
            totalGuides
            totalRooms
            totalMessages
            totalBuilds
            totalTimelines
        }
    }
`)

export const recentActivitiesQuery = typedQuery<
    {
        id: string
        user: string
        action: string
        target: string
        time: string
    }[],
    {
        limit?: number
    }
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

export interface UsersItem {
    id: string
    name: string
    email: string
    qq: string
    roles: string
    createdAt: string
    updateAt: string
}

export const usersQuery = typedQueryRaw<
    {
        users: UsersItem[]
        usersCount: number
    },
    {
        limit?: number
        offset?: number
        search?: string
    }
>(/* GraphQL */ `
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

export interface GuideItem {
    id: string
    title: string
    type: "text" | "image"
    content: string
    images: string[]
    charId?: number
    userId: string
    buildId?: string
    views: number
    likes: number
    isRecommended?: boolean
    isPinned?: boolean
    isLiked: boolean
    createdAt: string
    updateAt: string
    user: {
        id: string
        name: string
        qq: string
    }
}

export const guideQuery = typedQuery<GuideItem, { id: string }>(/* GraphQL */ `
    query ($id: String!) {
        guide(id: $id) {
            id
            title
            type
            content
            images
            charId
            userId
            buildId
            views
            likes
            isRecommended
            isPinned
            isLiked
            createdAt
            updateAt
            user {
                id
                name
                qq
            }
        }
    }
`)

export const guidesQuery = typedQueryRaw<
    {
        guides: GuideItem[]
        guidesCount: number
    },
    {
        limit?: number
        offset?: number
        search?: string
        type?: string
        charId?: number
        userId?: string
    }
>(/* GraphQL */ `
    query ($limit: Int, $offset: Int, $search: String, $type: String, $charId: Int, $userId: String) {
        guides(limit: $limit, offset: $offset, search: $search, type: $type, charId: $charId, userId: $userId) {
            id
            title
            type
            content
            images
            charId
            userId
            buildId
            views
            likes
            isRecommended
            isPinned
            isLiked
            createdAt
            updateAt
            user {
                id
                name
                qq
            }
        }
        guidesCount(search: $search, type: $type)
    }
`)

export interface RoomItem {
    id: string
    name: string
    type?: string
    ownerId: string
    maxUsers?: number
    createdAt: string
    updateAt: string
    owner: {
        id: string
        name: string
        qq: string
    }
}

export const roomsQuery = typedQueryRaw<
    {
        rooms: RoomItem[]
        roomsCount: number
    },
    {
        limit?: number
        offset?: number
    }
>(/* GraphQL */ `
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
                qq
            }
        }
        roomsCount
    }
`)

export type RoomWithLastMsg = {
    id: string
    name: string
    type?: string
    ownerId: string
    maxUsers?: number
    createdAt: string
    updateAt: string
    msgCount: number
    owner: {
        id: string
        name: string
        qq: string
    }
    lastMsg: {
        id: string
        content: string
        createdAt: string
        user: {
            id: string
            name: string
            qq: string
        }
    }
}
export const roomsWithLastMsgQuery = typedQuery<
    RoomWithLastMsg[],
    {
        limit?: number
        offset?: number
        name_like?: string
    }
>(/* GraphQL */ `
    query ($limit: Int, $offset: Int, $name_like: String) {
        rooms(limit: $limit, offset: $offset, name_like: $name_like) {
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
                qq
            }
            lastMsg {
                id
                content
                createdAt
                user {
                    id
                    name
                    qq
                }
            }
        }
    }
`)

export interface TodoItem {
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
        qq: string
    }
}

export const todosWithCountQuery = typedQueryRaw<
    {
        todos: TodoItem[]
        todosCount: number
    },
    {
        limit?: number
        offset?: number
        type?: string
    }
>(/* GraphQL */ `
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
                qq
            }
        }
        todosCount(type: $type)
    }
`)

// ========== User Todo Query (获取用户+系统todos) ==========

export const userTodosWithCountQuery = typedQueryRaw<
    {
        todos: TodoItem[]
        todosCount: number
    },
    {
        limit?: number
        offset?: number
    }
>(/* GraphQL */ `
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

// ========== Build & Timeline Queries ==========
export const buildsQuery = typedQuery<
    Build[],
    {
        limit?: number
        offset?: number
        search?: string
        charId?: number
        userId?: string
    }
>(/* GraphQL */ `
    query ($limit: Int, $offset: Int, $search: String, $charId: Int, $userId: String) {
        builds(limit: $limit, offset: $offset, search: $search, charId: $charId, userId: $userId) {
            id
            title
            desc
            charId
            views
            likes
            isRecommended
            isPinned
            createdAt
            updateAt
            user {
                id
                name
                qq
            }
            isLiked
        }
        buildsCount(search: $search, charId: $charId)
    }
`)
export const buildsWithCountQuery = typedQueryRaw<
    {
        builds: Build[]
        buildsCount: number
    },
    {
        limit?: number
        offset?: number
        search?: string
        charId?: number
        userId?: string
    }
>(/* GraphQL */ `
    query ($limit: Int, $offset: Int, $search: String, $charId: Int, $userId: String) {
        builds(limit: $limit, offset: $offset, search: $search, charId: $charId, userId: $userId) {
            id
            title
            desc
            charId
            views
            likes
            isRecommended
            isPinned
            createdAt
            updateAt
            user {
                id
                name
                qq
            }
            isLiked
        }
        buildsCount(search: $search, charId: $charId)
    }
`)

export const timelinesWithCountQuery = typedQueryRaw<{
    timelines: Timeline[]
    timelinesCount: number
}>(/* GraphQL */ `
    query ($limit: Int, $offset: Int, $search: String, $charId: Int, $userId: String) {
        timelines(limit: $limit, offset: $offset, search: $search, charId: $charId, userId: $userId) {
            id
            title
            charId
            views
            likes
            isRecommended
            isPinned
            createdAt
            updateAt
            user {
                id
                name
                qq
            }
            isLiked
        }
        timelinesCount(search: $search, charId: $charId, userId: $userId)
    }
`)

export interface BuildDetail extends Build {
    charSettings: string
}

export interface Build {
    id: string
    title: string
    desc: string
    charId: number
    userId: string
    views: number
    likes: number
    isRecommended: boolean
    isPinned: boolean
    createdAt: string
    updateAt: string
    user: {
        id: string
        name: string
        qq: string
    }
    isLiked: boolean
}

export const recommendedBuildsQuery = typedQuery<
    Build[],
    {
        limit?: number
    }
>(/* GraphQL */ `
    query ($limit: Int) {
        recommendedBuilds(limit: $limit) {
            id
            title
            desc
            charId
            userId
            views
            likes
            isRecommended
            isPinned
            createdAt
            updateAt
            user {
                id
                name
                qq
            }
            isLiked
        }
    }
`)

export const trendingBuildsQuery = typedQuery<
    Build[],
    {
        limit?: number
    }
>(/* GraphQL */ `
    query ($limit: Int) {
        trendingBuilds(limit: $limit) {
            id
            title
            desc
            charId
            userId
            views
            likes
            isRecommended
            isPinned
            createdAt
            updateAt
            user {
                id
                name
                qq
            }
            isLiked
        }
    }
`)

export interface Timeline {
    id: string
    title: string
    charId: number
    userId: string
    views: number
    likes: number
    isRecommended: boolean
    isPinned: boolean
    createdAt: string
    updateAt: string
    user: {
        id: string
        name: string
    }
    isLiked: boolean
}

export const recommendedTimelinesQuery = typedQuery<
    Timeline[],
    {
        limit?: number
    }
>(/* GraphQL */ `
    query ($limit: Int = 10) {
        recommendedTimelines(limit: $limit) {
            id
            title
            charId
            userId
            views
            likes
            isRecommended
            isPinned
            createdAt
            updateAt
            user {
                id
                name
                qq
            }
            isLiked
        }
    }
`)

export const trendingTimelinesQuery = typedQuery<
    Timeline[],
    {
        limit?: number
    }
>(/* GraphQL */ `
    query ($limit: Int = 10) {
        trendingTimelines(limit: $limit) {
            id
            title
            charId
            userId
            views
            likes
            isRecommended
            isPinned
            createdAt
            updateAt
            user {
                id
                name
                qq
            }
            isLiked
        }
    }
`)

export const buildQuery = typedQuery<BuildDetail>(/* GraphQL */ `
    query ($id: String!) {
        build(id: $id) {
            id
            title
            desc
            charId
            charSettings
            userId
            views
            likes
            isRecommended
            isPinned
            createdAt
            updateAt
            user {
                id
                name
                qq
            }
        }
    }
`)

export const timelineQuery = typedQuery<Timeline>(/* GraphQL */ `
    query ($id: String!) {
        timeline(id: $id) {
            id
            title
            charId
            userId
            views
            likes
            isRecommended
            isPinned
            createdAt
            updateAt
            tracks
            items
        }
    }
`)

export const rtcClientsQuery = typedQuery<
    {
        id: string
        end: string
        user: {
            id: string
            name: string
            qq?: string
        }
    }[],
    { roomId: string }
>(/* GraphQL */ `
    query ($roomId: String!) {
        rtcClients(roomId: $roomId) {
            id
            end
            user {
                id
                name
                qq
            }
        }
    }
`)
