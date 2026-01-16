import { type AnyVariables, gql, type OperationContext } from "@urql/vue"
import { useUIStore } from "@/store/ui"
import { gqClient } from "./graphql"
import { extractType } from "./query"

/**
 * 从GraphQL查询字符串中提取查询名称，并返回一个异步函数，用于执行该查询。
 * @param gqlQuery GraphQL查询字符串
 * @returns 解构后的查询结果
 */
function typedMutation<R = { id: string }, V extends AnyVariables = AnyVariables, G extends string = string>(gqlQuery: G) {
    const name = extractType(gqlQuery)
    const query = gql(gqlQuery)
    const fn = async (variables?: V, context?: Partial<OperationContext> | undefined) => {
        try {
            const raw = await gqClient.mutation(query, variables, context).toPromise()
            if (raw?.error) {
                useUIStore().showErrorMessage("操作失败:", raw?.error?.message || "未知错误")
                return
            }
            return raw?.data?.[name] as R
        } catch (e) {
            useUIStore().showErrorMessage("操作失败:", e instanceof Error ? e.message : "未知错误")
        }
    }

    fn.raw = gqlQuery
    return fn as typeof fn & { raw: G }
}

export const sendMessageMutation = typedMutation<{ id: string }, { content: string; roomId: string }>(/* GraphQL */ `
    mutation ($content: String!, $roomId: String!) {
        sendMessage(content: $content, roomId: $roomId) {
            id
        }
    }
`)

export const editMessageMutation = typedMutation<{ id: string }, { content: string; msgId: string }>(/* GraphQL */ `
    mutation ($content: String!, $msgId: String!) {
        editMessage(content: $content, msgId: $msgId) {
            id
        }
    }
`)

export const deleteRoomMutation = typedMutation<boolean, { id: string }>(/* GraphQL */ `
    mutation ($id: String!) {
        deleteRoom(id: $id)
    }
`)

export const loginMutation = typedMutation<
    {
        success: boolean
        message: string
        token: string
        user: {
            id: string
            name: string
            qq: string
        }
    },
    { email: string; password: string }
>(/* GraphQL */ `
    mutation ($email: String!, $password: String!) {
        login(password: $password, email: $email) {
            success
            message
            token
            user {
                id
                name
                qq
            }
        }
    }
`)

export const registerMutation = typedMutation<
    {
        success: boolean
        message: string
        token: string
        user: {
            id: string
            name: string
            qq: string
        }
    },
    { name: string; qq: string; email: string; password: string }
>(/* GraphQL */ `
    mutation ($name: String!, $qq: String!, $email: String!, $password: String!) {
        register(name: $name, qq: $qq, email: $email, password: $password) {
            success
            message
            token
            user {
                id
                name
                qq
            }
        }
    }
`)

export const guestMutation = typedMutation<
    {
        success: boolean
        message: string
        token: string
        user: {
            id: string
            name: string
            qq: string
        }
    },
    { name: string; qq: string }
>(/* GraphQL */ `
    mutation ($name: String!, $qq: String!) {
        guest(name: $name, qq: $qq) {
            success
            message
            token
            user {
                id
                name
                qq
            }
        }
    }
`)

export const updatePasswordMutation = typedMutation<
    {
        success: boolean
        token: string
    },
    { old_password: string; new_password: string }
>(/* GraphQL */ `
    mutation ($old_password: String!, $new_password: String!) {
        updatePassword(old_password: $old_password, new_password: $new_password) {
            success
            token
        }
    }
`)

export const updateUserMetaMutation = typedMutation<
    {
        success: boolean
        message: string
        token: string
        user: {
            id: string
            name: string
            qq: string
        }
    },
    { name?: string; qq?: string }
>(/* GraphQL */ `
    mutation ($name: String, $qq: String) {
        updateUserMeta(data: { name: $name, qq: $qq }) {
            success
            message
            token
            user {
                id
                name
                qq
            }
        }
    }
`)

export const addTaskMutation = typedMutation<
    { id: string },
    { roomId: string; name: string; maxUser?: number; desc?: string }
>(/* GraphQL */ `
    mutation ($roomId: String!, $name: String!, $maxUser: Int, $desc: String) {
        addTask(roomId: $roomId, name: $name, maxUser: $maxUser, desc: $desc) {
            id
        }
    }
`)

export const addTaskAsyncMutation = typedMutation<
    { id: string },
    { roomId: string; name: string; maxUser?: number; desc?: string }
>(/* GraphQL */ `
    mutation ($roomId: String!, $name: String!, $maxUser: Int, $desc: String) {
        addTaskAsync(roomId: $roomId, name: $name, maxUser: $maxUser, desc: $desc) {
            id
        }
    }
`)

export const addTaskEndAsyncMutation = typedMutation<
    { id: string },
    {
        roomId: string
        name: string
        maxUser?: number
        desc?: string
    }
>(/* GraphQL */ `
    mutation ($roomId: String!, $name: String!, $maxUser: Int, $desc: String) {
        addTaskEndAsync(roomId: $roomId, name: $name, maxUser: $maxUser, desc: $desc) {
            id
        }
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

export const joinTaskMutation = typedMutation<boolean, { taskId: string }>(/* GraphQL */ `
    mutation ($taskId: String!) {
        joinTask(taskId: $taskId)
    }
`)

export const rtcSignalMutation = typedMutation<
    boolean,
    {
        roomId: string
        type: string
        from: string
        to: string
        body: string
    }
>(/* GraphQL */ `
    mutation ($roomId: String!, $type: String!, $from: String!, $to: String!, $body: String!) {
        rtcSignal(roomId: $roomId, type: $type, from: $from, to: $to, body: $body)
    }
`)

export const rtcJoinMutation = typedMutation<
    {
        id: string
        end: boolean
        user: {
            id: string
            name: string
            qq: string
        }
        clients: {
            id: string
            user: {
                id: string
                name: string
                qq: string
            }
        }[]
    },
    { roomId: string }
>(/* GraphQL */ `
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
                user {
                    id
                    name
                    qq
                }
            }
        }
    }
`)

export interface RoomInfo {
    id: string
    name: string
    type: string
    maxUsers: number
    createdAt: string
    updateAt: string
    msgCount: number
    onlineUsers: {
        id: string
        name: string
        qq: string
    }[]
}

export const joinRoomMutation = typedMutation<RoomInfo, { id: string }>(/* GraphQL */ `
    mutation ($id: String!) {
        joinRoom(id: $id) {
            id
            name
            type
            msgCount
            onlineUsers {
                id
                name
                qq
            }
        }
    }
`)

// ========== Admin Mutations ==========

export interface RoomInput {
    name: string
    type?: string
    maxUsers?: number
}

export const createRoomMutation = typedMutation(/* GraphQL */ `
    mutation ($data: RoomInput!) {
        createRoom(data: $data) {
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
    }
`)

export const updateRoomMutation = typedMutation<RoomInfo, { id: string; data: RoomInput }>(/* GraphQL */ `
    mutation ($id: String!, $data: RoomInput!) {
        updateRoom(id: $id, data: $data) {
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
    }
`)

export const deleteUserMutation = typedMutation<boolean, { id: string }>(/* GraphQL */ `
    mutation ($id: String!) {
        deleteUser(id: $id)
    }
`)

export const updateUserMutation = typedMutation<{
    id: string
    name: string
    email: string
    qq: string
    roles: string
    createdAt: string
    updateAt: string
}>(/* GraphQL */ `
    mutation ($id: String!, $email: String, $roles: String) {
        updateUser(id: $id, email: $email, roles: $roles) {
            id
            name
            email
            qq
            roles
            createdAt
            updateAt
        }
    }
`)

export interface GuideInput {
    title: string
    type: string
    content: string
    images: string[]
    charId?: number
    buildId?: string
}

export const updateGuideMutation = typedMutation<
    {
        id: string
    },
    {
        id: string
        input: GuideInput
    }
>(/* GraphQL */ `
    mutation ($id: String!, $input: GuideInput!) {
        updateGuide(id: $id, input: $input) {
            id
        }
    }
`)

export const createGuideMutation = typedMutation<
    {
        id: string
    },
    {
        input: GuideInput
    }
>(/* GraphQL */ `
    mutation ($input: GuideInput!) {
        createGuide(input: $input) {
            id
        }
    }
`)

export const deleteGuideMutation = typedMutation<boolean, { id: string }>(/* GraphQL */ `
    mutation ($id: String!) {
        deleteGuide(id: $id)
    }
`)

export const recommendGuideMutation = typedMutation<
    {
        id: string
        isRecommended: boolean
    },
    { id: string; recommended: boolean }
>(/* GraphQL */ `
    mutation ($id: String!, $recommended: Boolean!) {
        recommendGuide(id: $id, recommended: $recommended) {
            id
            isRecommended
        }
    }
`)

export const pinGuideMutation = typedMutation<
    {
        id: string
        isPinned: boolean
    },
    { id: string; pinned: boolean }
>(/* GraphQL */ `   
    mutation ($id: String!, $pinned: Boolean!) {
        pinGuide(id: $id, pinned: $pinned) {
            id
            isPinned
        }
    }
`)

export interface TodoInput {
    title: string
    description: string
    startTime: string
    endTime: string
    type: string
    userId: string
}

export const createSystemTodoMutation = typedMutation<{ id: string }, { input: TodoInput }>(/* GraphQL */ `
    mutation ($input: TodoInput!) {
        createSystemTodo(input: $input) {
            id
        }
    }
`)

export const updateSystemTodoMutation = typedMutation<{ id: string }, { id: string; input: TodoInput }>(/* GraphQL */ `
    mutation ($id: String!, $input: TodoInput!) {
        updateSystemTodo(id: $id, input: $input) {
            id
        }
    }
`)

export const deleteSystemTodoMutation = typedMutation<boolean>(/* GraphQL */ `
    mutation ($id: String!) {
        deleteSystemTodo(id: $id)
    }
`)

// ========== User Todo Mutations ==========

export const createTodoMutation = typedMutation(/* GraphQL */ `
    mutation ($input: TodoInput!) {
        createTodo(input: $input) {
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
            }
        }
    }
`)

export const updateTodoMutation = typedMutation(/* GraphQL */ `
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
            user {
                id
                name
            }
        }
    }
`)

export const deleteTodoMutation = typedMutation<boolean>(/* GraphQL */ `
    mutation ($id: String!) {
        deleteTodo(id: $id)
    }
`)

export const completeTodoMutation = typedMutation(/* GraphQL */ `
    mutation ($id: String!) {
        completeTodo(id: $id) {
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
    }
`)

// ========== Build & Timeline Mutations ==========

export const deleteBuildMutation = typedMutation<boolean, { id: string }>(/* GraphQL */ `
    mutation ($id: String!) {
        deleteBuild(id: $id)
    }
`)

export const recommendBuildMutation = typedMutation<
    {
        id: string
        isRecommended: boolean
    },
    { id: string; recommended: boolean }
>(/* GraphQL */ `
    mutation ($id: String!, $recommended: Boolean!) {
        recommendBuild(id: $id, recommended: $recommended) {
            id
            isRecommended
        }
    }
`)

export const pinBuildMutation = typedMutation<
    {
        id: string
        isPinned: boolean
    },
    { id: string; pinned: boolean }
>(/* GraphQL */ `
    mutation ($id: String!, $pinned: Boolean!) {
        pinBuild(id: $id, pinned: $pinned) {
            id
            isPinned
        }
    }
`)

export const likeBuildMutation = typedMutation<
    {
        id: string
        likes: number
    },
    { id: string }
>(/* GraphQL */ `
    mutation ($id: String!) {
        likeBuild(id: $id) {
            id
            likes
        }
    }
`)

export const unlikeBuildMutation = typedMutation<
    {
        id: string
        likes: number
    },
    { id: string }
>(/* GraphQL */ `
    mutation ($id: String!) {
        unlikeBuild(id: $id) {
            id
            likes
        }
    }
`)

export const deleteTimelineMutation = typedMutation<boolean, { id: string }>(/* GraphQL */ `
    mutation ($id: String!) {
        deleteTimeline(id: $id)
    }
`)

export const recommendTimelineMutation = typedMutation<
    {
        id: string
        isRecommended: boolean
    },
    { id: string; recommended: boolean }
>(/* GraphQL */ `
    mutation ($id: String!, $recommended: Boolean!) {
        recommendTimeline(id: $id, recommended: $recommended) {
            id
            isRecommended
        }
    }
`)

export const pinTimelineMutation = typedMutation<
    {
        id: string
        isPinned: boolean
    },
    { id: string; pinned: boolean }
>(/* GraphQL */ `
    mutation ($id: String!, $pinned: Boolean!) {
        pinTimeline(id: $id, pinned: $pinned) {
            id
            isPinned
        }
    }
`)

export const likeTimelineMutation = typedMutation<
    {
        id: string
        likes: number
    },
    { id: string }
>(/* GraphQL */ `
    mutation ($id: String!) {
        likeTimeline(id: $id) {
            id
            likes
        }
    }
`)

export const unlikeTimelineMutation = typedMutation<
    {
        id: string
        likes: number
    },
    { id: string }
>(/* GraphQL */ `
    mutation ($id: String!) {
        unlikeTimeline(id: $id) {
            id
            likes
        }
    }
`)

export interface BuildInput {
    title: string
    desc?: string
    charId: number
    charSettings: string
}

// Create mutations for share functionality
export const createBuildMutation = typedMutation<
    {
        id: string
    },
    { input: BuildInput }
>(/* GraphQL */ `
    mutation ($input: BuildInput!) {
        createBuild(input: $input) {
            id
        }
    }
`)

export interface TimelineInput {
    title: string
    charId: number
    tracks: string
    items: string
}

export const createTimelineMutation = typedMutation<
    {
        id: string
    },
    { input: TimelineInput }
>(/* GraphQL */ `
    mutation ($input: TimelineInput!) {
        createTimeline(input: $input) {
            id
        }
    }
`)

export const updateBuildMutation = typedMutation<
    {
        id: string
    },
    { input: BuildInput }
>(/* GraphQL */ `
    mutation ($id: String!, $input: BuildInput!) {
        updateBuild(id: $id, input: $input) {
            id
        }
    }
`)

export const updateTimelineMutation = typedMutation<
    {
        id: string
    },
    { input: TimelineInput }
>(/* GraphQL */ `
    mutation ($id: String!, $input: TimelineInput!) {
        updateTimeline(id: $id, input: $input) {
            id
        }
    }
`)
