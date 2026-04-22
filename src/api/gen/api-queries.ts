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
                experience
                level
                dailyExperienceStatus {
                    todayAwardedExp
                    totalAvailableExp
                    dailyLaunchProgress
                    dailyLaunchLimit
                    dailyOnlineHourProgress
                    dailyOnlineHourLimit
                    dailyMessageProgress
                    dailyMessageLimit
                    dailyOnlineHourRetryAfterMs
                }
                abyssUsageUploadStatus {
                    uploadedThisSeason
                }
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
                experience
                level
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
                experience
                level
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

export const shopProductsQuery = typedQuery(
    /* GraphQL */ `
        query ($limit: Int, $offset: Int, $search: String, $rewardType: String, $activeOnly: Boolean) {
            shopProducts(limit: $limit, offset: $offset, search: $search, rewardType: $rewardType, activeOnly: $activeOnly) {
                id
                name
                description
                assetId
                rewardType
                rewardKey
                rewardName
                displayClass
                displayCss
                pointsCost
                sortOrder
                isActive
                startTime
                endTime
                createdAt
                updateAt
                asset {
                    id
                    rewardType
                    rewardKey
                    rewardName
                    displayClass
                    displayCss
                    createdAt
                    updateAt
                }
            }
        }
    ` as const
)<Types.ShopProduct[], { limit?: number; offset?: number; search?: string; rewardType?: string; activeOnly?: boolean }>()

export const shopProductsCountQuery = typedQuery(
    /* GraphQL */ `
        query ($search: String, $rewardType: String, $activeOnly: Boolean) {
            shopProductsCount(search: $search, rewardType: $rewardType, activeOnly: $activeOnly)
        }
    ` as const
)<number, { search?: string; rewardType?: string; activeOnly?: boolean }>()

export const myShopItemsQuery = typedQuery(
    /* GraphQL */ `
        query {
            myShopItems {
                id
                userId
                assetId
                createdAt
                asset {
                    id
                    rewardType
                    rewardKey
                    rewardName
                    displayClass
                    displayCss
                    createdAt
                    updateAt
                }
            }
        }
    ` as const
)<Types.UserShopItem[]>()

export const myShopSummaryQuery = typedQuery(
    /* GraphQL */ `
        query {
            myShopSummary {
                points
                selectedTitleAssetId
                selectedNameCardAssetId
                selectedTitleAsset {
                    id
                    rewardType
                    rewardKey
                    rewardName
                    displayClass
                    displayCss
                    createdAt
                    updateAt
                }
                selectedNameCardAsset {
                    id
                    rewardType
                    rewardKey
                    rewardName
                    displayClass
                    displayCss
                    createdAt
                    updateAt
                }
                ownedAssetIds
            }
        }
    ` as const
)<Types.UserShopSummary>()

export const adminShopRedemptionsQuery = typedQuery(
    /* GraphQL */ `
        query ($limit: Int, $offset: Int, $search: String) {
            adminShopRedemptions(limit: $limit, offset: $offset, search: $search) {
                id
                userId
                productId
                assetId
                pointsCost
                createdAt
                user {
                    id
                    name
                    email
                    qq
                    pic
                    uid
                    roles
                    experience
                    points
                    level
                    selectedTitleAssetId
                    selectedNameCardAssetId
                    createdAt
                    updateAt
                }
                product {
                    id
                    name
                    description
                    assetId
                    rewardType
                    rewardKey
                    rewardName
                    displayClass
                    displayCss
                    pointsCost
                    sortOrder
                    isActive
                    startTime
                    endTime
                    createdAt
                    updateAt
                    asset {
                        id
                        rewardType
                        rewardKey
                        rewardName
                        displayClass
                        displayCss
                        createdAt
                        updateAt
                    }
                }
            }
        }
    ` as const
)<Types.ShopRedemption[], { limit?: number; offset?: number; search?: string }>()

export const adminShopRedemptionsCountQuery = typedQuery(
    /* GraphQL */ `
        query ($search: String) {
            adminShopRedemptionsCount(search: $search)
        }
    ` as const
)<number, { search?: string }>()

export const scriptCategoriesQuery = typedQuery(
    /* GraphQL */ `
        query {
            scriptCategories {
                id
                name
                description
                createdAt
                updateAt
            }
        }
    ` as const
)<Types.ScriptCategory[]>()

export const scriptCategoryQuery = typedQuery(
    /* GraphQL */ `
        query ($id: String!) {
            scriptCategory(id: $id) {
                id
                name
                description
                createdAt
                updateAt
            }
        }
    ` as const
)<Types.ScriptCategory, { id: string }>()

export const scriptCategoriesCountQuery = typedQuery(
    /* GraphQL */ `
        query {
            scriptCategoriesCount
        }
    ` as const
)<number>()

export const scriptsQuery = typedQuery(
    /* GraphQL */ `
        query ($search: String, $category: String, $userId: String, $limit: Int, $offset: Int) {
            scripts(search: $search, category: $category, userId: $userId, limit: $limit, offset: $offset) {
                id
                title
                description
                category
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
        query ($id: String!, $preview: Boolean) {
            script(id: $id, preview: $preview) {
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
)<Types.Script, { id: string; preview?: boolean }>()

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
        query ($t: Float!) {
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
                    level
                    currentTitleText
                    currentTitleClass
                    nameEffectClass
                }
                replyTo {
                    id
                    content
                    user {
                        id
                        name
                        qq
                        level
                    }
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
                    level
                    currentTitleText
                    currentTitleClass
                    nameEffectClass
                }
                replyTo {
                    id
                    content
                    user {
                        id
                        name
                        qq
                        level
                    }
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

export const abyssUsageSubmissionsQuery = typedQuery(
    /* GraphQL */ `
        query ($limit: Int, $offset: Int, $seasonId: Int, $minLevel: Int, $maxLevel: Int) {
            abyssUsageSubmissions(limit: $limit, offset: $offset, seasonId: $seasonId, minLevel: $minLevel, maxLevel: $maxLevel) {
                id
                uidSha256
                seasonId
                level
                charId
                meleeId
                rangedId
                support1
                supportWeapon1
                support2
                supportWeapon2
                stars
                petId
                createdAt
                updateAt
                roleParticipants {
                    submissionId
                    roleType
                    charId
                    gradeLevel
                    createdAt
                }
                weaponParticipants {
                    submissionId
                    roleType
                    weaponId
                    skillLevel
                    createdAt
                }
            }
        }
    ` as const
)<Types.AbyssUsageSubmission[], { limit?: number; offset?: number; seasonId?: number; minLevel?: number; maxLevel?: number }>()

export const abyssUsageSubmissionsCountQuery = typedQuery(
    /* GraphQL */ `
        query ($seasonId: Int, $minLevel: Int, $maxLevel: Int) {
            abyssUsageSubmissionsCount(seasonId: $seasonId, minLevel: $minLevel, maxLevel: $maxLevel)
        }
    ` as const
)<number, { seasonId?: number; minLevel?: number; maxLevel?: number }>()

export const abyssUsageRoleStatsQuery = typedQuery(
    /* GraphQL */ `
        query ($seasonId: Int, $minLevel: Int, $maxLevel: Int) {
            abyssUsageRoleStats(seasonId: $seasonId, minLevel: $minLevel, maxLevel: $maxLevel) {
                charId
                submissionCount
                ownedCount
                gradeLevelDistribution
            }
        }
    ` as const
)<Types.AbyssRoleUsageStat[], { seasonId?: number; minLevel?: number; maxLevel?: number }>()

export const abyssUsageWeaponStatsQuery = typedQuery(
    /* GraphQL */ `
        query ($seasonId: Int, $minLevel: Int, $maxLevel: Int) {
            abyssUsageWeaponStats(seasonId: $seasonId, minLevel: $minLevel, maxLevel: $maxLevel) {
                weaponId
                submissionCount
                ownedCount
                skillLevelDistribution
            }
        }
    ` as const
)<Types.AbyssWeaponUsageStat[], { seasonId?: number; minLevel?: number; maxLevel?: number }>()

export const abyssUsageLineupStatsQuery = typedQuery(
    /* GraphQL */ `
        query ($seasonId: Int, $charId: Int, $mainOnly: Boolean, $limit: Int, $minLevel: Int, $maxLevel: Int) {
            abyssUsageLineupStats(
                seasonId: $seasonId
                charId: $charId
                mainOnly: $mainOnly
                limit: $limit
                minLevel: $minLevel
                maxLevel: $maxLevel
            ) {
                charId
                meleeId
                rangedId
                support1
                supportWeapon1
                support2
                supportWeapon2
                petId
                submissionCount
            }
        }
    ` as const
)<
    Types.AbyssUsageLineupStat[],
    { seasonId?: number; charId?: number; mainOnly?: boolean; limit?: number; minLevel?: number; maxLevel?: number }
>()

export const abyssUsageSlotStatsQuery = typedQuery(
    /* GraphQL */ `
        query ($seasonId: Int, $minLevel: Int, $maxLevel: Int) {
            abyssUsageSlotStats(seasonId: $seasonId, minLevel: $minLevel, maxLevel: $maxLevel) {
                support {
                    id
                    submissionCount
                }
                meleeWeapon {
                    id
                    submissionCount
                }
                rangedWeapon {
                    id
                    submissionCount
                }
                pet {
                    id
                    submissionCount
                }
            }
        }
    ` as const
)<Types.AbyssUsageSlotStats, { seasonId?: number; minLevel?: number; maxLevel?: number }>()

export const abyssUsageLevelStatsQuery = typedQuery(
    /* GraphQL */ `
        query ($seasonId: Int, $minLevel: Int, $maxLevel: Int) {
            abyssUsageLevelStats(seasonId: $seasonId, minLevel: $minLevel, maxLevel: $maxLevel) {
                level
                submissionCount
            }
        }
    ` as const
)<Types.AbyssUsageLevelStat[], { seasonId?: number; minLevel?: number; maxLevel?: number }>()

export const abyssUsageRoleRankQuery = typedQuery(
    /* GraphQL */ `
        query ($seasonId: Int, $limit: Int, $minLevel: Int, $maxLevel: Int) {
            abyssUsageRoleRank(seasonId: $seasonId, limit: $limit, minLevel: $minLevel, maxLevel: $maxLevel) {
                charId
                submissionCount
                ownedCount
                gradeLevelDistribution
            }
        }
    ` as const
)<Types.AbyssRoleUsageStat[], { seasonId?: number; limit?: number; minLevel?: number; maxLevel?: number }>()

export const abyssUsageWeaponRankQuery = typedQuery(
    /* GraphQL */ `
        query ($seasonId: Int, $limit: Int, $minLevel: Int, $maxLevel: Int) {
            abyssUsageWeaponRank(seasonId: $seasonId, limit: $limit, minLevel: $minLevel, maxLevel: $maxLevel) {
                weaponId
                submissionCount
                ownedCount
                skillLevelDistribution
            }
        }
    ` as const
)<Types.AbyssWeaponUsageStat[], { seasonId?: number; limit?: number; minLevel?: number; maxLevel?: number }>()
