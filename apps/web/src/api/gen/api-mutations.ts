import { typedMutation } from "@/api/mutation"
import type * as Types from "./api-types"

export const updatePasswordMutation = typedMutation<Types.UserLoginResult, { old_password: string; new_password: string }>(/* GraphQL */ `
    mutation ($old_password: String!, $new_password: String!) {
        updatePassword(old_password: $old_password, new_password: $new_password) {
            success
            message
            token
        }
    }
`)

export const loginMutation = typedMutation<Types.UserLoginResult, { email: string; password: string }>(/* GraphQL */ `
    mutation ($email: String!, $password: String!) {
        login(email: $email, password: $password) {
            success
            message
            token
        }
    }
`)

export const guestMutation = typedMutation<Types.UserLoginResult, { name: string; qq?: string }>(/* GraphQL */ `
    mutation ($name: String!, $qq: String) {
        guest(name: $name, qq: $qq) {
            success
            message
            token
        }
    }
`)

export const registerMutation = typedMutation<Types.UserLoginResult, { name: string; qq: string; email: string; password: string }>(
    /* GraphQL */ `
        mutation ($name: String!, $qq: String!, $email: String!, $password: String!) {
            register(name: $name, qq: $qq, email: $email, password: $password) {
                success
                message
                token
            }
        }
    `
)

export const updateUserMetaMutation = typedMutation<Types.UserLoginResult, { data: Types.UsersUpdateInput }>(/* GraphQL */ `
    mutation ($data: UsersUpdateInput!) {
        updateUserMeta(data: $data) {
            success
            message
            token
        }
    }
`)

export const claimDailyLaunchExperienceMutation = typedMutation<Types.UserExperienceRewardResult>(/* GraphQL */ `
    mutation {
        claimDailyLaunchExperience {
            success
            message
            source
            awardedExp
            retryAfterMs
            user {
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
    }
`)

export const claimDailyOnlineExperienceMutation = typedMutation<Types.UserExperienceRewardResult>(/* GraphQL */ `
    mutation {
        claimDailyOnlineExperience {
            success
            message
            source
            awardedExp
            retryAfterMs
            user {
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
    }
`)

export const deleteUserMutation = typedMutation<boolean, { id: string }>(/* GraphQL */ `
    mutation ($id: String!) {
        deleteUser(id: $id)
    }
`)

export const updateUserMutation = typedMutation<Types.User, { id: string; email?: string; roles?: string }>(/* GraphQL */ `
    mutation ($id: String!, $email: String, $roles: String) {
        updateUser(id: $id, email: $email, roles: $roles) {
            id
        }
    }
`)

export const forgotPasswordMutation = typedMutation<boolean, { email: string }>(/* GraphQL */ `
    mutation ($email: String!) {
        forgotPassword(email: $email)
    }
`)

export const resetPasswordMutation = typedMutation<Types.UserLoginResult, { token: string; new_password: string }>(/* GraphQL */ `
    mutation ($token: String!, $new_password: String!) {
        resetPassword(token: $token, new_password: $new_password) {
            success
            message
            token
        }
    }
`)

export const createTodoMutation = typedMutation<Types.Todo, { input: Types.TodoInput }>(/* GraphQL */ `
    mutation ($input: TodoInput!) {
        createTodo(input: $input) {
            id
            # title
            # description
            # startTime
            # endTime
            # type
            # userId
            # createdAt
            # updateAt
            # user {
            #     id
            #     name
            #     email
            #     qq
            #     pic
            #     uid
            #     roles
            #     createdAt
            #     updateAt
            # }
            # isCompleted
        }
    }
`)

export const updateTodoMutation = typedMutation<Types.Todo, { id: string; input: Types.TodoInput }>(/* GraphQL */ `
    mutation ($id: String!, $input: TodoInput!) {
        updateTodo(id: $id, input: $input) {
            id
        }
    }
`)

export const deleteTodoMutation = typedMutation<boolean, { id: string }>(/* GraphQL */ `
    mutation ($id: String!) {
        deleteTodo(id: $id)
    }
`)

export const createSystemTodoMutation = typedMutation<Types.Todo, { input: Types.TodoInput }>(/* GraphQL */ `
    mutation ($input: TodoInput!) {
        createSystemTodo(input: $input) {
            id
        }
    }
`)

export const updateSystemTodoMutation = typedMutation<Types.Todo, { id: string; input: Types.TodoInput }>(/* GraphQL */ `
    mutation ($id: String!, $input: TodoInput!) {
        updateSystemTodo(id: $id, input: $input) {
            id
        }
    }
`)

export const deleteSystemTodoMutation = typedMutation<boolean, { id: string }>(/* GraphQL */ `
    mutation ($id: String!) {
        deleteSystemTodo(id: $id)
    }
`)

export const completeTodoMutation = typedMutation<Types.Todo, { id: string }>(/* GraphQL */ `
    mutation ($id: String!) {
        completeTodo(id: $id) {
            id
        }
    }
`)

export const createTimelineMutation = typedMutation<Types.Timeline, { input: Types.TimelineInput }>(/* GraphQL */ `
    mutation ($input: TimelineInput!) {
        createTimeline(input: $input) {
            id
        }
    }
`)

export const updateTimelineMutation = typedMutation<Types.Timeline, { id: string; input: Types.TimelineInput }>(/* GraphQL */ `
    mutation ($id: String!, $input: TimelineInput!) {
        updateTimeline(id: $id, input: $input) {
            id
        }
    }
`)

export const deleteTimelineMutation = typedMutation<boolean, { id: string }>(/* GraphQL */ `
    mutation ($id: String!) {
        deleteTimeline(id: $id)
    }
`)

export const likeTimelineMutation = typedMutation<Types.Timeline, { id: string }>(/* GraphQL */ `
    mutation ($id: String!) {
        likeTimeline(id: $id) {
            id
            isLiked
        }
    }
`)

export const unlikeTimelineMutation = typedMutation<Types.Timeline, { id: string }>(/* GraphQL */ `
    mutation ($id: String!) {
        unlikeTimeline(id: $id) {
            id
            isLiked
        }
    }
`)

export const recommendTimelineMutation = typedMutation<Types.Timeline, { id: string; recommended: boolean }>(/* GraphQL */ `
    mutation ($id: String!, $recommended: Boolean!) {
        recommendTimeline(id: $id, recommended: $recommended) {
            id
            isRecommended
        }
    }
`)

export const pinTimelineMutation = typedMutation<Types.Timeline, { id: string; pinned: boolean }>(/* GraphQL */ `
    mutation ($id: String!, $pinned: Boolean!) {
        pinTimeline(id: $id, pinned: $pinned) {
            id
            isPinned
        }
    }
`)

export const addTaskMutation = typedMutation<
    Types.Task,
    { roomId: string; name: string; maxUser?: number; maxAge?: number; desc?: string }
>(/* GraphQL */ `
    mutation ($roomId: String!, $name: String!, $maxUser: Int, $maxAge: Int, $desc: String) {
        addTask(roomId: $roomId, name: $name, maxUser: $maxUser, maxAge: $maxAge, desc: $desc) {
            id
        }
    }
`)

export const addTaskAsyncMutation = typedMutation<
    Types.Task,
    { roomId: string; name: string; maxUser?: number; maxAge?: number; desc?: string }
>(/* GraphQL */ `
    mutation ($roomId: String!, $name: String!, $maxUser: Int, $maxAge: Int, $desc: String) {
        addTaskAsync(roomId: $roomId, name: $name, maxUser: $maxUser, maxAge: $maxAge, desc: $desc) {
            id
        }
    }
`)

export const addTaskEndAsyncMutation = typedMutation<
    Types.Task,
    { roomId: string; name: string; maxUser?: number; maxAge?: number; desc?: string }
>(/* GraphQL */ `
    mutation ($roomId: String!, $name: String!, $maxUser: Int, $maxAge: Int, $desc: String) {
        addTaskEndAsync(roomId: $roomId, name: $name, maxUser: $maxUser, maxAge: $maxAge, desc: $desc) {
            id
        }
    }
`)

export const joinTaskMutation = typedMutation<boolean, { taskId: string }>(/* GraphQL */ `
    mutation ($taskId: String!) {
        joinTask(taskId: $taskId)
    }
`)

export const endTaskMutation = typedMutation<boolean, { taskId: string }>(/* GraphQL */ `
    mutation ($taskId: String!) {
        endTask(taskId: $taskId)
    }
`)

export const pauseTaskMutation = typedMutation<boolean, { taskId: string }>(/* GraphQL */ `
    mutation ($taskId: String!) {
        pauseTask(taskId: $taskId)
    }
`)

export const redeemShopProductMutation = typedMutation<Types.ShopRedeemResult, { productId: string }>(/* GraphQL */ `
    mutation ($productId: String!) {
        redeemShopProduct(productId: $productId) {
            success
            message
        }
    }
`)

export const equipShopAssetMutation = typedMutation<Types.ShopEquipResult, { assetId: string }>(/* GraphQL */ `
    mutation ($assetId: String!) {
        equipShopAsset(assetId: $assetId) {
            success
            message
        }
    }
`)

export const adminGrantShopProductMutation = typedMutation<Types.ShopRedeemResult, { userId: string; productId: string }>(/* GraphQL */ `
    mutation ($userId: String!, $productId: String!) {
        adminGrantShopProduct(userId: $userId, productId: $productId) {
            success
            message
        }
    }
`)

export const adminRevokeShopProductMutation = typedMutation<Types.ShopRedeemResult, { userId: string; productId: string }>(/* GraphQL */ `
    mutation ($userId: String!, $productId: String!) {
        adminRevokeShopProduct(userId: $userId, productId: $productId) {
            success
            message
        }
    }
`)

export const createShopProductMutation = typedMutation<Types.ShopProduct, { data: Types.ShopProductInput }>(/* GraphQL */ `
    mutation ($data: ShopProductInput!) {
        createShopProduct(data: $data) {
            id
        }
    }
`)

export const updateShopProductMutation = typedMutation<Types.ShopProduct, { id: string; data: Types.ShopProductInput }>(/* GraphQL */ `
    mutation ($id: String!, $data: ShopProductInput!) {
        updateShopProduct(id: $id, data: $data) {
            id
        }
    }
`)

export const deleteShopProductMutation = typedMutation<boolean, { id: string }>(/* GraphQL */ `
    mutation ($id: String!) {
        deleteShopProduct(id: $id)
    }
`)

export const createScriptCategoryMutation = typedMutation<Types.ScriptCategory, { input: Types.ScriptCategoryInput }>(/* GraphQL */ `
    mutation ($input: ScriptCategoryInput!) {
        createScriptCategory(input: $input) {
            id
        }
    }
`)

export const updateScriptCategoryMutation = typedMutation<Types.ScriptCategory, { id: string; input: Types.ScriptCategoryInput }>(
    /* GraphQL */ `
        mutation ($id: String!, $input: ScriptCategoryInput!) {
            updateScriptCategory(id: $id, input: $input) {
                id
            }
        }
    `
)

export const deleteScriptCategoryMutation = typedMutation<boolean, { id: string }>(/* GraphQL */ `
    mutation ($id: String!) {
        deleteScriptCategory(id: $id)
    }
`)

export const createScriptMutation = typedMutation<Types.Script, { input: Types.ScriptInput }>(/* GraphQL */ `
    mutation ($input: ScriptInput!) {
        createScript(input: $input) {
            id
            updateAt
            user {
                id
                name
            }
        }
    }
`)

export const updateScriptMutation = typedMutation<Types.Script, { id: string; input: Types.ScriptInput }>(/* GraphQL */ `
    mutation ($id: String!, $input: ScriptInput!) {
        updateScript(id: $id, input: $input) {
            id
            updateAt
            user {
                id
                name
            }
        }
    }
`)

export const deleteScriptMutation = typedMutation<boolean, { id: string }>(/* GraphQL */ `
    mutation ($id: String!) {
        deleteScript(id: $id)
    }
`)

export const likeScriptMutation = typedMutation<Types.Script, { id: string }>(/* GraphQL */ `
    mutation ($id: String!) {
        likeScript(id: $id) {
            id
            isLiked
        }
    }
`)

export const unlikeScriptMutation = typedMutation<Types.Script, { id: string }>(/* GraphQL */ `
    mutation ($id: String!) {
        unlikeScript(id: $id) {
            id
            isLiked
        }
    }
`)

export const recommendScriptMutation = typedMutation<Types.Script, { id: string; recommended: boolean }>(/* GraphQL */ `
    mutation ($id: String!, $recommended: Boolean!) {
        recommendScript(id: $id, recommended: $recommended) {
            id
        }
    }
`)

export const pinScriptMutation = typedMutation<Types.Script, { id: string; pinned: boolean }>(/* GraphQL */ `
    mutation ($id: String!, $pinned: Boolean!) {
        pinScript(id: $id, pinned: $pinned) {
            id
        }
    }
`)

export const rtcSignalMutation = typedMutation<boolean, { roomId: string; type: string; from: string; to: string; body: string }>(
    /* GraphQL */ `
        mutation ($roomId: String!, $type: String!, $from: String!, $to: String!, $body: String!) {
            rtcSignal(roomId: $roomId, type: $type, from: $from, to: $to, body: $body)
        }
    `
)

export const rtcJoinMutation = typedMutation<Types.RtcJoinResult, { roomId: string }>(/* GraphQL */ `
    mutation ($roomId: String!) {
        rtcJoin(roomId: $roomId) {
            id
            end
            user {
                id
                name
                qq
            }
            clients {
                id
                end
                user {
                    id
                    name
                    qq
                }
            }
        }
    }
`)

export const createRoomMutation = typedMutation<Types.Room, { data: Types.RoomInput }>(/* GraphQL */ `
    mutation ($data: RoomInput!) {
        createRoom(data: $data) {
            id
        }
    }
`)

export const deleteRoomMutation = typedMutation<boolean, { id: string }>(/* GraphQL */ `
    mutation ($id: String!) {
        deleteRoom(id: $id)
    }
`)

export const joinRoomMutation = typedMutation<Types.Room, { id: string }>(/* GraphQL */ `
    mutation ($id: String!) {
        joinRoom(id: $id) {
            id
        }
    }
`)

export const updateRoomMutation = typedMutation<Types.Room, { id: string; data: Types.RoomInput }>(/* GraphQL */ `
    mutation ($id: String!, $data: RoomInput!) {
        updateRoom(id: $id, data: $data) {
            id
        }
    }
`)

export const createRankingListMutation = typedMutation<Types.RankingList, { input: Types.RankingListInput }>(/* GraphQL */ `
    mutation ($input: RankingListInput!) {
        createRankingList(input: $input) {
            id
        }
    }
`)

export const updateRankingListMutation = typedMutation<Types.RankingList, { id: string; input: Types.RankingListInput }>(/* GraphQL */ `
    mutation ($id: String!, $input: RankingListInput!) {
        updateRankingList(id: $id, input: $input) {
            id
        }
    }
`)

export const deleteRankingListMutation = typedMutation<boolean, { id: string }>(/* GraphQL */ `
    mutation ($id: String!) {
        deleteRankingList(id: $id)
    }
`)

export const addMissionsIngameMutation = typedMutation<Types.MissionsIngame, { token?: string; server: string; missions: string[][] }>(
    /* GraphQL */ `
        mutation ($token: String, $server: String!, $missions: [[String!]!]!) {
            addMissionsIngame(token: $token, server: $server, missions: $missions) {
                id
            }
        }
    `
)

export const sendMessageMutation = typedMutation<Types.Msg, { roomId: string; content: string; replyToMsgId?: string }>(/* GraphQL */ `
    mutation ($roomId: String!, $content: String!, $replyToMsgId: String) {
        sendMessage(roomId: $roomId, content: $content, replyToMsgId: $replyToMsgId) {
            id
        }
    }
`)

export const editMessageMutation = typedMutation<Types.Msg, { msgId: string; content: string }>(/* GraphQL */ `
    mutation ($msgId: String!, $content: String!) {
        editMessage(msgId: $msgId, content: $content) {
            id
        }
    }
`)

export const addReactionMutation = typedMutation<Types.Msg, { msgId: string; reaction: string }>(/* GraphQL */ `
    mutation ($msgId: String!, $reaction: String!) {
        addReaction(msgId: $msgId, reaction: $reaction) {
            id
        }
    }
`)

export const createGuideMutation = typedMutation<Types.Guide, { input: Types.GuideInput }>(/* GraphQL */ `
    mutation ($input: GuideInput!) {
        createGuide(input: $input) {
            id
        }
    }
`)

export const updateGuideMutation = typedMutation<Types.Guide, { id: string; input: Types.GuideInput }>(/* GraphQL */ `
    mutation ($id: String!, $input: GuideInput!) {
        updateGuide(id: $id, input: $input) {
            id
        }
    }
`)

export const deleteGuideMutation = typedMutation<boolean, { id: string }>(/* GraphQL */ `
    mutation ($id: String!) {
        deleteGuide(id: $id)
    }
`)

export const likeGuideMutation = typedMutation<Types.Guide, { id: string }>(/* GraphQL */ `
    mutation ($id: String!) {
        likeGuide(id: $id) {
            id
            isLiked
        }
    }
`)

export const unlikeGuideMutation = typedMutation<Types.Guide, { id: string }>(/* GraphQL */ `
    mutation ($id: String!) {
        unlikeGuide(id: $id) {
            id
            isLiked
        }
    }
`)

export const recommendGuideMutation = typedMutation<Types.Guide, { id: string; recommended: boolean }>(/* GraphQL */ `
    mutation ($id: String!, $recommended: Boolean!) {
        recommendGuide(id: $id, recommended: $recommended) {
            id
            isRecommended
        }
    }
`)

export const pinGuideMutation = typedMutation<Types.Guide, { id: string; pinned: boolean }>(/* GraphQL */ `
    mutation ($id: String!, $pinned: Boolean!) {
        pinGuide(id: $id, pinned: $pinned) {
            id
            isPinned
        }
    }
`)

export const createGraphMutation = typedMutation<Types.Graph, { input: Types.GraphInput }>(/* GraphQL */ `
    mutation ($input: GraphInput!) {
        createGraph(input: $input) {
            id
        }
    }
`)

export const updateGraphMutation = typedMutation<Types.Graph, { id: string; input: Types.GraphInput }>(/* GraphQL */ `
    mutation ($id: String!, $input: GraphInput!) {
        updateGraph(id: $id, input: $input) {
            id
            graphInfo
            updateAt
        }
    }
`)

export const deleteGraphMutation = typedMutation<boolean, { id: string }>(/* GraphQL */ `
    mutation ($id: String!) {
        deleteGraph(id: $id)
    }
`)

export const likeGraphMutation = typedMutation<Types.Graph, { id: string }>(/* GraphQL */ `
    mutation ($id: String!) {
        likeGraph(id: $id) {
            id
            isLiked
            likes
        }
    }
`)

export const unlikeGraphMutation = typedMutation<Types.Graph, { id: string }>(/* GraphQL */ `
    mutation ($id: String!) {
        unlikeGraph(id: $id) {
            id
            isLiked
            likes
        }
    }
`)

export const recommendGraphMutation = typedMutation<Types.Graph, { id: string; recommended: boolean }>(/* GraphQL */ `
    mutation ($id: String!, $recommended: Boolean!) {
        recommendGraph(id: $id, recommended: $recommended) {
            id
            isRecommended
        }
    }
`)

export const pinGraphMutation = typedMutation<Types.Graph, { id: string; pinned: boolean }>(/* GraphQL */ `
    mutation ($id: String!, $pinned: Boolean!) {
        pinGraph(id: $id, pinned: $pinned) {
            id
            isPinned
        }
    }
`)

export const updateGameModMutation = typedMutation<Types.GameMod, { id: string; input: Types.GameModInput }>(/* GraphQL */ `
    mutation ($id: String!, $input: GameModInput!) {
        updateGameMod(id: $id, input: $input) {
            id
        }
    }
`)

export const deleteGameModMutation = typedMutation<boolean, { id: string }>(/* GraphQL */ `
    mutation ($id: String!) {
        deleteGameMod(id: $id)
    }
`)

export const deleteGameModVersionMutation = typedMutation<boolean, { id: string }>(/* GraphQL */ `
    mutation ($id: String!) {
        deleteGameModVersion(id: $id)
    }
`)

export const recommendGameModMutation = typedMutation<Types.GameMod, { id: string; recommended: boolean }>(/* GraphQL */ `
    mutation ($id: String!, $recommended: Boolean!) {
        recommendGameMod(id: $id, recommended: $recommended) {
            id
            isRecommended
        }
    }
`)

export const pinGameModMutation = typedMutation<Types.GameMod, { id: string; pinned: boolean }>(/* GraphQL */ `
    mutation ($id: String!, $pinned: Boolean!) {
        pinGameMod(id: $id, pinned: $pinned) {
            id
            isPinned
        }
    }
`)

export const setGameModActiveMutation = typedMutation<Types.GameMod, { id: string; active: boolean }>(/* GraphQL */ `
    mutation ($id: String!, $active: Boolean!) {
        setGameModActive(id: $id, active: $active) {
            id
            isActive
        }
    }
`)

export const approveGameModMutation = typedMutation<Types.GameMod, { id: string }>(/* GraphQL */ `
    mutation ($id: String!) {
        approveGameMod(id: $id) {
            id
            status
        }
    }
`)

export const rejectGameModMutation = typedMutation<Types.GameMod, { id: string }>(/* GraphQL */ `
    mutation ($id: String!) {
        rejectGameMod(id: $id) {
            id
            status
        }
    }
`)

export const createDyePlanMutation = typedMutation<Types.DyePlan, { input: Types.DyePlanInput }>(/* GraphQL */ `
    mutation ($input: DyePlanInput!) {
        createDyePlan(input: $input) {
            id
        }
    }
`)

export const updateDyePlanMutation = typedMutation<Types.DyePlan, { id: string; input: Types.DyePlanInput }>(/* GraphQL */ `
    mutation ($id: String!, $input: DyePlanInput!) {
        updateDyePlan(id: $id, input: $input) {
            id
        }
    }
`)

export const deleteDyePlanMutation = typedMutation<boolean, { id: string }>(/* GraphQL */ `
    mutation ($id: String!) {
        deleteDyePlan(id: $id)
    }
`)

export const likeDyePlanMutation = typedMutation<Types.DyePlan, { id: string }>(/* GraphQL */ `
    mutation ($id: String!) {
        likeDyePlan(id: $id) {
            id
            isLiked
            likes
        }
    }
`)

export const unlikeDyePlanMutation = typedMutation<Types.DyePlan, { id: string }>(/* GraphQL */ `
    mutation ($id: String!) {
        unlikeDyePlan(id: $id) {
            id
            isLiked
            likes
        }
    }
`)

export const recommendDyePlanMutation = typedMutation<Types.DyePlan, { id: string; recommended: boolean }>(/* GraphQL */ `
    mutation ($id: String!, $recommended: Boolean!) {
        recommendDyePlan(id: $id, recommended: $recommended) {
            id
            isRecommended
        }
    }
`)

export const pinDyePlanMutation = typedMutation<Types.DyePlan, { id: string; pinned: boolean }>(/* GraphQL */ `
    mutation ($id: String!, $pinned: Boolean!) {
        pinDyePlan(id: $id, pinned: $pinned) {
            id
            isPinned
        }
    }
`)

export const createDPSMutation = typedMutation<Types.DPS, { input: Types.DPSInput }>(/* GraphQL */ `
    mutation ($input: DPSInput!) {
        createDPS(input: $input) {
            id
        }
    }
`)

export const updateDPSMutation = typedMutation<Types.DPS, { id: string; input: Types.DPSInput }>(/* GraphQL */ `
    mutation ($id: String!, $input: DPSInput!) {
        updateDPS(id: $id, input: $input) {
            id
        }
    }
`)

export const deleteDPSMutation = typedMutation<boolean, { id: string }>(/* GraphQL */ `
    mutation ($id: String!) {
        deleteDPS(id: $id)
    }
`)

export const createCommentMutation = typedMutation<Types.Comment, { targetId: string; content: string }>(/* GraphQL */ `
    mutation ($targetId: String!, $content: String!) {
        createComment(targetId: $targetId, content: $content) {
            id
            targetId
            content
            createdAt
            user {
                id
                name
                qq
            }
        }
    }
`)

export const deleteCommentMutation = typedMutation<boolean, { id: string }>(/* GraphQL */ `
    mutation ($id: String!) {
        deleteComment(id: $id)
    }
`)

export const createBuildMutation = typedMutation<Types.Build, { input: Types.BuildInput }>(/* GraphQL */ `
    mutation ($input: BuildInput!) {
        createBuild(input: $input) {
            id
        }
    }
`)

export const updateBuildMutation = typedMutation<Types.Build, { id: string; input: Types.BuildInput }>(/* GraphQL */ `
    mutation ($id: String!, $input: BuildInput!) {
        updateBuild(id: $id, input: $input) {
            id
        }
    }
`)

export const deleteBuildMutation = typedMutation<boolean, { id: string }>(/* GraphQL */ `
    mutation ($id: String!) {
        deleteBuild(id: $id)
    }
`)

export const likeBuildMutation = typedMutation<Types.Build, { id: string }>(/* GraphQL */ `
    mutation ($id: String!) {
        likeBuild(id: $id) {
            id
            isLiked
            likes
        }
    }
`)

export const unlikeBuildMutation = typedMutation<Types.Build, { id: string }>(/* GraphQL */ `
    mutation ($id: String!) {
        unlikeBuild(id: $id) {
            id
            isLiked
            likes
        }
    }
`)

export const recommendBuildMutation = typedMutation<Types.Build, { id: string; recommended: boolean }>(/* GraphQL */ `
    mutation ($id: String!, $recommended: Boolean!) {
        recommendBuild(id: $id, recommended: $recommended) {
            id
            isRecommended
        }
    }
`)

export const pinBuildMutation = typedMutation<Types.Build, { id: string; pinned: boolean }>(/* GraphQL */ `
    mutation ($id: String!, $pinned: Boolean!) {
        pinBuild(id: $id, pinned: $pinned) {
            id
            isPinned
        }
    }
`)

export const clearBuildTargetValueCacheMutation = typedMutation<number>(/* GraphQL */ `
    mutation {
        clearBuildTargetValueCache
    }
`)

export const adminUpdateBugMutation = typedMutation<
    Types.AdminBugResult,
    { bugId: string; fields: Types.AdminBugFields; reason: string; expectedVersion: number }
>(/* GraphQL */ `
    mutation ($bugId: ID!, $fields: AdminBugFields!, $reason: String!, $expectedVersion: Int!) {
        adminUpdateBug(bugId: $bugId, fields: $fields, reason: $reason, expectedVersion: $expectedVersion) {
            bug {
                id
                version
                tagVersion
            }
            changed
        }
    }
`)

export const adminMergeBugsMutation = typedMutation<
    Types.AdminBugResult,
    { sourceBugIds: string[]; targetBugId: string; reason: string; expectedVersions: number[] }
>(/* GraphQL */ `
    mutation ($sourceBugIds: [ID!]!, $targetBugId: ID!, $reason: String!, $expectedVersions: [Int!]!) {
        adminMergeBugs(sourceBugIds: $sourceBugIds, targetBugId: $targetBugId, reason: $reason, expectedVersions: $expectedVersions) {
            bug {
                id
                version
                tagVersion
            }
            changed
        }
    }
`)

export const adminRevertMergeMutation = typedMutation<
    Types.AdminBugResult,
    { mergeEventId: string; reason: string; expectedVersions: number[] }
>(/* GraphQL */ `
    mutation ($mergeEventId: ID!, $reason: String!, $expectedVersions: [Int!]!) {
        adminRevertMerge(mergeEventId: $mergeEventId, reason: $reason, expectedVersions: $expectedVersions) {
            bug {
                id
                version
                tagVersion
            }
            changed
        }
    }
`)

export const adminSetRelationMutation = typedMutation<
    Types.AdminBugResult,
    { bugId: string; targetBugId: string; relationType: Types.RelationType; evidenceRefs?: string[]; expectedGraphVersion: number }
>(/* GraphQL */ `
    mutation ($bugId: ID!, $targetBugId: ID!, $relationType: RelationType!, $evidenceRefs: [String!], $expectedGraphVersion: Int!) {
        adminSetRelation(
            bugId: $bugId
            targetBugId: $targetBugId
            relationType: $relationType
            evidenceRefs: $evidenceRefs
            expectedGraphVersion: $expectedGraphVersion
        ) {
            bug {
                id
                version
                tagVersion
            }
            changed
        }
    }
`)

export const adminRemoveRelationMutation = typedMutation<
    Types.AdminBugResult,
    { relationId: string; reason: string; expectedRelationVersion: number }
>(/* GraphQL */ `
    mutation ($relationId: ID!, $reason: String!, $expectedRelationVersion: Int!) {
        adminRemoveRelation(relationId: $relationId, reason: $reason, expectedRelationVersion: $expectedRelationVersion) {
            bug {
                id
                version
                tagVersion
            }
            changed
        }
    }
`)

export const adminSetTrackingTagsMutation = typedMutation<
    Types.TagSyncResult,
    { bugId: string; tagKeys: string[]; expectedTagVersion: number; reason: string; fixedVersion?: string; evidenceRefs?: string[] }
>(/* GraphQL */ `
    mutation (
        $bugId: ID!
        $tagKeys: [String!]!
        $expectedTagVersion: Int!
        $reason: String!
        $fixedVersion: String
        $evidenceRefs: [String!]
    ) {
        adminSetTrackingTags(
            bugId: $bugId
            tagKeys: $tagKeys
            expectedTagVersion: $expectedTagVersion
            reason: $reason
            fixedVersion: $fixedVersion
            evidenceRefs: $evidenceRefs
        ) {
            added
            removed
            tagVersion
            fixStage
            eventId
        }
    }
`)

export const adminSetGithubBindingMutation = typedMutation<
    boolean,
    { tagKey: string; repositoryId: string; labelName: string; expectedRegistryVersion: number }
>(/* GraphQL */ `
    mutation ($tagKey: String!, $repositoryId: String!, $labelName: String!, $expectedRegistryVersion: Int!) {
        adminSetGithubBinding(
            tagKey: $tagKey
            repositoryId: $repositoryId
            labelName: $labelName
            expectedRegistryVersion: $expectedRegistryVersion
        )
    }
`)

export const adminRetryJobMutation = typedMutation<boolean, { jobId: string; step: string }>(/* GraphQL */ `
    mutation ($jobId: ID!, $step: String!) {
        adminRetryJob(jobId: $jobId, step: $step)
    }
`)

export const adminReconcileMutation = typedMutation<boolean, { syncId: string }>(/* GraphQL */ `
    mutation ($syncId: ID!) {
        adminReconcile(syncId: $syncId)
    }
`)

export const submitBugMutation = typedMutation<Types.SubmissionReceipt, { input: Types.SubmitBugInput; idempotencyKey: string }>(
    /* GraphQL */ `
        mutation ($input: SubmitBugInput!, $idempotencyKey: String!) {
            submitBug(input: $input, idempotencyKey: $idempotencyKey) {
                submissionId
                revision
                state
                processingMode
                receiptToken
                suggestedPollAfterSeconds
            }
        }
    `
)

export const addBugRevisionMutation = typedMutation<
    Types.SubmissionReceipt,
    { submissionId: string; input: Types.SubmitBugInput; idempotencyKey: string }
>(/* GraphQL */ `
    mutation ($submissionId: ID!, $input: SubmitBugInput!, $idempotencyKey: String!) {
        addBugRevision(submissionId: $submissionId, input: $input, idempotencyKey: $idempotencyKey) {
            submissionId
            revision
            state
            processingMode
            receiptToken
            suggestedPollAfterSeconds
        }
    }
`)

export const withdrawSubmissionMutation = typedMutation<boolean, { submissionId: string }>(/* GraphQL */ `
    mutation ($submissionId: ID!) {
        withdrawSubmission(submissionId: $submissionId)
    }
`)

export const addFeedbackMutation = typedMutation<Types.FeedbackReceipt, { bugId: string; input: Types.FeedbackInput }>(/* GraphQL */ `
    mutation ($bugId: ID!, $input: FeedbackInput!) {
        addFeedback(bugId: $bugId, input: $input) {
            feedbackId
            submissionId
            bugId
            state
            receiptToken
            suggestedPollAfterSeconds
        }
    }
`)

export const addCommentMutation = typedMutation<Types.CommentResult, { bugId: string; body: string; visibility?: Types.Visibility }>(
    /* GraphQL */ `
        mutation ($bugId: ID!, $body: String!, $visibility: Visibility) {
            addComment(bugId: $bugId, body: $body, visibility: $visibility) {
                ok
                comment {
                    id
                    bugId
                    source
                    author
                    body
                    revision
                    visibility
                    deleted
                    createdAt
                }
            }
        }
    `
)

export const editCommentMutation = typedMutation<Types.CommentResult, { commentId: string; body: string; expectedRevision: number }>(
    /* GraphQL */ `
        mutation ($commentId: ID!, $body: String!, $expectedRevision: Int!) {
            editComment(commentId: $commentId, body: $body, expectedRevision: $expectedRevision) {
                ok
                comment {
                    id
                    bugId
                    source
                    author
                    body
                    revision
                    visibility
                    deleted
                    createdAt
                }
            }
        }
    `
)

export const deleteBugCommentMutation = typedMutation<Types.CommentResult, { commentId: string }>(/* GraphQL */ `
    mutation ($commentId: ID!) {
        deleteBugComment(commentId: $commentId) {
            ok
            comment {
                id
                bugId
                source
                author
                body
                revision
                visibility
                deleted
                createdAt
            }
        }
    }
`)

export const setVoteMutation = typedMutation<Types.VoteResult, { bugId: string; active: boolean }>(/* GraphQL */ `
    mutation ($bugId: ID!, $active: Boolean!) {
        setVote(bugId: $bugId, active: $active) {
            bugId
            active
            votes
            reporters
        }
    }
`)

export const setSubscriptionMutation = typedMutation<boolean, { bugId: string; channels?: string[]; preferences?: unknown }>(/* GraphQL */ `
    mutation ($bugId: ID!, $channels: [String!], $preferences: JSON) {
        setSubscription(bugId: $bugId, channels: $channels, preferences: $preferences)
    }
`)

export const requestReopenMutation = typedMutation<Types.ReopenResult, { bugId: string; feedbackId: string }>(/* GraphQL */ `
    mutation ($bugId: ID!, $feedbackId: ID!) {
        requestReopen(bugId: $bugId, feedbackId: $feedbackId) {
            ok
            bugId
            status
            eventId
        }
    }
`)

export const adminCreateRechargeBatchMutation = typedMutation<
    Types.RechargeBatchResult,
    { amountYuan: number; count: number; expiresInDays?: number }
>(/* GraphQL */ `
    mutation ($amountYuan: Float!, $count: Int!, $expiresInDays: Int) {
        adminCreateRechargeBatch(amountYuan: $amountYuan, count: $count, expiresInDays: $expiresInDays) {
            batch {
                id
                amountMicros
            }
            codes
        }
    }
`)

export const adminRevokeRechargeCodeMutation = typedMutation<boolean, { code: string }>(/* GraphQL */ `
    mutation ($code: String!) {
        adminRevokeRechargeCode(code: $code)
    }
`)

export const adminRevokeRechargeBatchMutation = typedMutation<number, { batchId: string }>(/* GraphQL */ `
    mutation ($batchId: String!) {
        adminRevokeRechargeBatch(batchId: $batchId)
    }
`)

export const redeemRechargeCodeMutation = typedMutation<Types.RedeemResult, { code: string }>(/* GraphQL */ `
    mutation ($code: String!) {
        redeemRechargeCode(code: $code) {
            success
            message
            amountMicros
            quota {
                day
                freeBalance
                permanentBalance
                totalBalance
                dailyLimit
            }
        }
    }
`)

export const createActivityMutation = typedMutation<Types.Activity, { server: string; input: Types.ActivityInput }>(/* GraphQL */ `
    mutation ($server: String!, $input: ActivityInput!) {
        createActivity(server: $server, input: $input) {
            id
        }
    }
`)

export const updateActivityMutation = typedMutation<Types.Activity, { server: string; id: number; input: Types.ActivityUpdateInput }>(
    /* GraphQL */ `
        mutation ($server: String!, $id: Int!, $input: ActivityUpdateInput!) {
            updateActivity(server: $server, id: $id, input: $input) {
                id
            }
        }
    `
)

export const deleteActivityMutation = typedMutation<boolean, { server: string; id: number }>(/* GraphQL */ `
    mutation ($server: String!, $id: Int!) {
        deleteActivity(server: $server, id: $id)
    }
`)

export const upsertActivitiesIngameMutation = typedMutation<
    Types.Activity[],
    { token?: string; server: string; activities: Types.ActivityInput[] }
>(/* GraphQL */ `
    mutation ($token: String, $server: String!, $activities: [ActivityInput!]!) {
        upsertActivitiesIngame(token: $token, server: $server, activities: $activities) {
            id
        }
    }
`)

export const submitAbyssUsageMutation = typedMutation<Types.AbyssUsageSubmission, { input: Types.AbyssUsageSubmissionInput }>(
    /* GraphQL */ `
        mutation ($input: AbyssUsageSubmissionInput!) {
            submitAbyssUsage(input: $input) {
                id
                reward {
                    awardedExp
                    awardedPoints
                }
            }
        }
    `
)
