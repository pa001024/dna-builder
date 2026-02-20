import { typedQuery } from "@/api/query"
import type * as Types from "./api-types"

export const meQuery = typedQuery(
    /* GraphQL */ `
        query {
            me {
                id
                name
                email
                qq
                pic
                uid
                roles
                createdAt
                updateAt
            }
        }
    ` as const
)<Types.User>()

export const userQuery = typedQuery(
    /* GraphQL */ `
        query ($id: String!) {
            user(id: $id) {
                id
                name
                email
                qq
                pic
                uid
                roles
                createdAt
                updateAt
            }
        }
    ` as const
)<Types.User, { id: string }>()

export const usersQuery = typedQuery(
    /* GraphQL */ `
        query ($limit: Int, $offset: Int, $search: String) {
            users(limit: $limit, offset: $offset, search: $search) {
                id
                name
                email
                qq
                pic
                uid
                roles
                createdAt
                updateAt
            }
        }
    ` as const
)<Types.User[], { limit?: number; offset?: number; search?: string }>()

export const usersCountQuery = typedQuery(
    /* GraphQL */ `
        query ($search: String) {
            usersCount(search: $search)
        }
    ` as const
)<number, { search?: string }>()

export const todosQuery = typedQuery(
    /* GraphQL */ `
        query ($type: String, $limit: Int, $offset: Int) {
            todos(type: $type, limit: $limit, offset: $offset) {
                id
                title
                description
                startTime
                endTime
                type
                isCompleted
                user {
                    id
                    name
                    qq
                }
            }
        }
    ` as const
)<Types.Todo[], { type?: string; limit?: number; offset?: number }>()

export const todoQuery = typedQuery(
    /* GraphQL */ `
        query ($id: String!) {
            todo(id: $id) {
                id
                title
                description
                startTime
                endTime
                type
                userId
                createdAt
                updateAt
                user {
                    id
                    name
                    qq
                }
                isCompleted
            }
        }
    ` as const
)<Types.Todo, { id: string }>()

export const todosCountQuery = typedQuery(
    /* GraphQL */ `
        query ($type: String) {
            todosCount(type: $type)
        }
    ` as const
)<number, { type?: string }>()

export const timelinesQuery = typedQuery(
    /* GraphQL */ `
        query ($search: String, $charId: Int, $userId: String, $limit: Int, $offset: Int, $sortBy: String) {
            timelines(search: $search, charId: $charId, userId: $userId, limit: $limit, offset: $offset, sortBy: $sortBy) {
                id
                title
                charId
                charName
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
    ` as const
)<Types.Timeline[], { search?: string; charId?: number; userId?: string; limit?: number; offset?: number; sortBy?: string }>()

export const timelinesCountQuery = typedQuery(
    /* GraphQL */ `
        query ($search: String, $charId: Int) {
            timelinesCount(search: $search, charId: $charId)
        }
    ` as const
)<number, { search?: string; charId?: number }>()

export const recommendedTimelinesQuery = typedQuery(
    /* GraphQL */ `
        query ($limit: Int) {
            recommendedTimelines(limit: $limit) {
                id
                title
                charId
                charName
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
    ` as const
)<Types.Timeline[], { limit?: number }>()

export const trendingTimelinesQuery = typedQuery(
    /* GraphQL */ `
        query ($limit: Int) {
            trendingTimelines(limit: $limit) {
                id
                title
                charId
                charName
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
    ` as const
)<Types.Timeline[], { limit?: number }>()

export const timelineQuery = typedQuery(
    /* GraphQL */ `
        query ($id: String!) {
            timeline(id: $id) {
                id
                title
                charId
                charName
                tracks
                items
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
    ` as const
)<Types.Timeline, { id: string }>()

export const tasksQuery = typedQuery(
    /* GraphQL */ `
        query ($roomId: String!, $limit: Int, $offset: Int) {
            tasks(roomId: $roomId, limit: $limit, offset: $offset) {
                id
                name
                desc
                maxUser
                maxAge
                userList
                startTime
                endTime
                roomId
                userId
                createdAt
                updateAt
                online
                paused
                user {
                    id
                    name
                    qq
                }
            }
        }
    ` as const
)<Types.Task[], { roomId: string; limit?: number; offset?: number }>()

export const doingTasksQuery = typedQuery(
    /* GraphQL */ `
        query ($roomId: String!) {
            doingTasks(roomId: $roomId) {
                id
                name
                desc
                maxUser
                maxAge
                userList
                startTime
                endTime
                roomId
                userId
                createdAt
                updateAt
                online
                paused
                user {
                    id
                    name
                    qq
                }
            }
        }
    ` as const
)<Types.Task[], { roomId: string }>()

export const scriptsQuery = typedQuery(
    /* GraphQL */ `
        query ($search: String, $category: String, $userId: String, $limit: Int, $offset: Int) {
            scripts(search: $search, category: $category, userId: $userId, limit: $limit, offset: $offset) {
                id
                title
                description
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
    ` as const
)<Types.Script[], { search?: string; category?: string; userId?: string; limit?: number; offset?: number }>()

export const scriptsCountQuery = typedQuery(
    /* GraphQL */ `
        query ($search: String, $category: String) {
            scriptsCount(search: $search, category: $category)
        }
    ` as const
)<number, { search?: string; category?: string }>()

export const scriptQuery = typedQuery(
    /* GraphQL */ `
        query ($id: String!) {
            script(id: $id) {
                id
                title
                description
                content
                category
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
    ` as const
)<Types.Script, { id: string }>()

export const rtcClientsQuery = typedQuery(
    /* GraphQL */ `
        query ($roomId: String!) {
            rtcClients(roomId: $roomId) {
                id
                end
                user {
                    id
                    name
                    qq
                    roles
                }
            }
        }
    ` as const
)<Types.RtcClient[], { roomId: string }>()

export const roomQuery = typedQuery(
    /* GraphQL */ `
        query ($id: String!) {
            room(id: $id) {
                id
                name
                type
                maxUsers
                createdAt
                updateAt
                owner {
                    id
                    name
                    qq
                }
                msgCount
                lastMsg {
                    id
                    roomId
                    userId
                    content
                    edited
                    createdAt
                    updateAt
                    user {
                        id
                        name
                    }
                }
            }
        }
    ` as const
)<Types.Room, { id: string }>()

export const roomsQuery = typedQuery(
    /* GraphQL */ `
        query ($name_like: String, $limit: Int, $offset: Int) {
            rooms(name_like: $name_like, limit: $limit, offset: $offset) {
                id
                name
                type
                maxUsers
                createdAt
                updateAt
                owner {
                    id
                    name
                    qq
                }
                msgCount
                lastMsg {
                    id
                    roomId
                    userId
                    content
                    createdAt
                    updateAt
                    user {
                        id
                        name
                        qq
                    }
                }
            }
        }
    ` as const
)<Types.Room[], { name_like?: string; limit?: number; offset?: number }>()

export const roomsCountQuery = typedQuery(
    /* GraphQL */ `
        query ($name_like: String) {
            roomsCount(name_like: $name_like)
        }
    ` as const
)<number, { name_like?: string }>()

export const timeOffsetQuery = typedQuery(
    /* GraphQL */ `
        query ($t: Int!) {
            timeOffset(t: $t)
        }
    ` as const
)<number, { t: number }>()

export const missionsIngameQuery = typedQuery(
    /* GraphQL */ `
        query ($server: String!) {
            missionsIngame(server: $server) {
                id
                server
                missions
                createdAt
            }
        }
    ` as const
)<Types.MissionsIngame, { server: string }>()

export const missionsIngamesQuery = typedQuery(
    /* GraphQL */ `
        query ($server: String!, $limit: Int, $offset: Int) {
            missionsIngames(server: $server, limit: $limit, offset: $offset) {
                id
                server
                missions
                createdAt
            }
        }
    ` as const
)<Types.MissionsIngame[], { server: string; limit?: number; offset?: number }>()

export const msgCountQuery = typedQuery(
    /* GraphQL */ `
        query ($roomId: String!) {
            msgCount(roomId: $roomId)
        }
    ` as const
)<number, { roomId: string }>()

export const msgsQuery = typedQuery(
    /* GraphQL */ `
        query ($roomId: String!, $limit: Int, $offset: Int) {
            msgs(roomId: $roomId, limit: $limit, offset: $offset) {
                id
                roomId
                userId
                content
                edited
                createdAt
                updateAt
                replyToMsgId
                replyToUserId
                user {
                    id
                    name
                    qq
                }
                replyTo {
                    id
                    content
                    user {
                        id
                        name
                        qq
                    }
                }
                reactions {
                    id
                    count
                    users {
                        id
                        name
                        qq
                    }
                    createdAt
                }
            }
        }
    ` as const
)<Types.Msg[], { roomId: string; limit?: number; offset?: number }>()

export const lastMsgsQuery = typedQuery(
    /* GraphQL */ `
        query ($roomId: String!, $limit: Int, $offset: Int) {
            lastMsgs(roomId: $roomId, limit: $limit, offset: $offset) {
                id
                roomId
                userId
                content
                edited
                createdAt
                updateAt
                replyToMsgId
                replyToUserId
                user {
                    id
                    name
                    qq
                }
                replyTo {
                    id
                    content
                    user {
                        id
                        name
                        qq
                    }
                }
                reactions {
                    id
                    msgId
                    count
                    users {
                        id
                        name
                        qq
                    }
                    createdAt
                }
            }
        }
    ` as const
)<Types.Msg[], { roomId: string; limit?: number; offset?: number }>()

export const guidesQuery = typedQuery(
    /* GraphQL */ `
        query ($search: String, $type: String, $charId: Int, $userId: String, $limit: Int, $offset: Int) {
            guides(search: $search, type: $type, charId: $charId, userId: $userId, limit: $limit, offset: $offset) {
                id
                title
                type
                images
                charId
                userId
                buildId
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
    ` as const
)<Types.Guide[], { search?: string; type?: string; charId?: number; userId?: string; limit?: number; offset?: number }>()

export const guidesCountQuery = typedQuery(
    /* GraphQL */ `
        query ($search: String, $type: String) {
            guidesCount(search: $search, type: $type)
        }
    ` as const
)<number, { search?: string; type?: string }>()

export const guideQuery = typedQuery(
    /* GraphQL */ `
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
    ` as const
)<Types.Guide, { id: string }>()

export const dpsListQuery = typedQuery(
    /* GraphQL */ `
        query ($charId: Int, $buildId: String, $timelineId: String, $limit: Int, $offset: Int, $sortBy: String) {
            dpsList(charId: $charId, buildId: $buildId, timelineId: $timelineId, limit: $limit, offset: $offset, sortBy: $sortBy) {
                id
                charId
                buildId
                timelineId
                dpsValue
                details
                userId
                createdAt
                updateAt
            }
        }
    ` as const
)<Types.DPS[], { charId?: number; buildId?: string; timelineId?: string; limit?: number; offset?: number; sortBy?: string }>()

export const dpsCountQuery = typedQuery(
    /* GraphQL */ `
        query ($charId: Int, $buildId: String, $timelineId: String) {
            dpsCount(charId: $charId, buildId: $buildId, timelineId: $timelineId)
        }
    ` as const
)<number, { charId?: number; buildId?: string; timelineId?: string }>()

export const charDPSQuery = typedQuery(
    /* GraphQL */ `
        query ($charId: Int!, $limit: Int) {
            charDPS(charId: $charId, limit: $limit) {
                id
                charId
                buildId
                timelineId
                dpsValue
                details
                userId
                createdAt
                updateAt
            }
        }
    ` as const
)<Types.DPS[], { charId: number; limit?: number }>()

export const buildsQuery = typedQuery(
    /* GraphQL */ `
        query ($search: String, $charId: Int, $userId: String, $limit: Int, $offset: Int, $sortBy: String) {
            builds(search: $search, charId: $charId, userId: $userId, limit: $limit, offset: $offset, sortBy: $sortBy) {
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
    ` as const
)<Types.Build[], { search?: string; charId?: number; userId?: string; limit?: number; offset?: number; sortBy?: string }>()

export const buildsCountQuery = typedQuery(
    /* GraphQL */ `
        query ($search: String, $charId: Int) {
            buildsCount(search: $search, charId: $charId)
        }
    ` as const
)<number, { search?: string; charId?: number }>()

export const recommendedBuildsQuery = typedQuery(
    /* GraphQL */ `
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
    ` as const
)<Types.Build[], { limit?: number }>()

export const trendingBuildsQuery = typedQuery(
    /* GraphQL */ `
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
    ` as const
)<Types.Build[], { limit?: number }>()

export const buildQuery = typedQuery(
    /* GraphQL */ `
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
                isLiked
            }
        }
    ` as const
)<Types.Build, { id: string }>()

export const adminStatsQuery = typedQuery(
    /* GraphQL */ `
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
    ` as const
)<Types.AdminStats>()

export const recentActivitiesQuery = typedQuery(
    /* GraphQL */ `
        query ($limit: Int) {
            recentActivities(limit: $limit) {
                id
                user
                action
                target
                time
            }
        }
    ` as const
)<Types.RecentActivity[], { limit?: number }>()

export const activityQuery = typedQuery(
    /* GraphQL */ `
        query ($server: String!, $id: Int!) {
            activity(server: $server, id: $id) {
                id
                server
                postId
                startTime
                endTime
                name
                icon
                desc
                createdAt
                updateAt
            }
        }
    ` as const
)<Types.Activity, { server: string; id: number }>()

export const activitiesQuery = typedQuery(
    /* GraphQL */ `
        query ($server: String!, $startTime: Float, $endTime: Float) {
            activities(server: $server, startTime: $startTime, endTime: $endTime) {
                id
                server
                postId
                startTime
                endTime
                name
                icon
                desc
                createdAt
                updateAt
            }
        }
    ` as const
)<Types.Activity[], { server: string; startTime?: number; endTime?: number }>()
