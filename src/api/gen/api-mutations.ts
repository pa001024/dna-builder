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

export const deleteUserMutation = typedMutation<boolean, { id: string }>(/* GraphQL */ `
    mutation ($id: String!) {
        deleteUser(id: $id)
    }
`)

export const updateUserMutation = typedMutation<Types.User, { id: string; email?: string; roles?: string }>(/* GraphQL */ `
    mutation ($id: String!, $email: String, $roles: String) {
        updateUser(id: $id, email: $email, roles: $roles) {
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
            title
            description
            startTime
            endTime
            type
            userId
            createdAt
            updateAt
            isCompleted
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
            isCompleted
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

export const createScriptMutation = typedMutation<Types.Script, { input: Types.ScriptInput }>(/* GraphQL */ `
    mutation ($input: ScriptInput!) {
        createScript(input: $input) {
            id
            user {
                name
            }
        }
    }
`)

export const updateScriptMutation = typedMutation<Types.Script, { id: string; input: Types.ScriptInput }>(/* GraphQL */ `
    mutation ($id: String!, $input: ScriptInput!) {
        updateScript(id: $id, input: $input) {
            id
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

export const addMissionsIngameMutation = typedMutation<Types.MissionsIngame, { token: string; server: string; missions: string[][] }>(
    /* GraphQL */ `
        mutation ($token: String!, $server: String!, $missions: [[String!]!]!) {
            addMissionsIngame(token: $token, server: $server, missions: $missions) {
                id
            }
        }
    `
)

export const sendMessageMutation = typedMutation<Types.Msg, { roomId: string; content: string }>(/* GraphQL */ `
    mutation ($roomId: String!, $content: String!) {
        sendMessage(roomId: $roomId, content: $content) {
            id
        }
    }
`)

export const editMessageMutation = typedMutation<Types.Msg, { msgId: string; content: string }>(/* GraphQL */ `
    mutation ($msgId: String!, $content: String!) {
        editMessage(msgId: $msgId, content: $content) {
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
                qq
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
`)

export const addReactionMutation = typedMutation<Types.Msg, { msgId: string; reaction: string }>(/* GraphQL */ `
    mutation ($msgId: String!, $reaction: String!) {
        addReaction(msgId: $msgId, reaction: $reaction) {
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
                qq
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
