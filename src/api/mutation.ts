import { AnyVariables, gql, OperationContext } from "@urql/vue"
import { gqClient } from "./graphql"
import { useUIStore } from "@/store/ui"

function extractType<T extends string>(gqlQuery: T) {
    const match = gqlQuery.match(/mutation[\s\S]*?\s(\w+?)\s*\(/m)
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
function typedMutation<R = { id: string }, G extends string = string>(gqlQuery: G) {
    const name = extractType(gqlQuery)
    const query = gql(gqlQuery)
    return async (variables?: AnyVariables, context?: Partial<OperationContext> | undefined) => {
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
}

export const sendMessageMutation = typedMutation(/* GraphQL */ `
    mutation ($content: String!, $roomId: String!) {
        sendMessage(content: $content, roomId: $roomId) {
            id
        }
    }
`)

export const editMessageMutation = typedMutation(/* GraphQL */ `
    mutation ($content: String!, $msgId: String!) {
        editMessage(content: $content, msgId: $msgId) {
            id
        }
    }
`)

export const deleteRoomMutation = typedMutation<boolean>(/* GraphQL */ `
    mutation ($id: String!) {
        deleteRoom(id: $id)
    }
`)

export const loginMutation = typedMutation<{
    success: boolean
    message: string
    token: string
    user: {
        id: string
        name: string
        qq: string
    }
}>(/* GraphQL */ `
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

export const registerMutation = typedMutation<{
    success: boolean
    message: string
    token: string
    user: {
        id: string
        name: string
        qq: string
    }
}>(/* GraphQL */ `
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

export const guestMutation = typedMutation<{
    success: boolean
    message: string
    token: string
    user: {
        id: string
        name: string
        qq: string
    }
}>(/* GraphQL */ `
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

export const updatePasswordMutation = typedMutation<{
    success: boolean
    token: string
}>(/* GraphQL */ `
    mutation ($old_password: String!, $new_password: String!) {
        updatePassword(old_password: $old_password, new_password: $new_password) {
            success
            token
        }
    }
`)

export const updateUserMetaMutation = typedMutation<{
    success: boolean
    message: string
    token: string
    user: {
        id: string
        name: string
        qq: string
    }
}>(/* GraphQL */ `
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

export const addTaskMutation = typedMutation(/* GraphQL */ `
    mutation ($roomId: String!, $name: String!, $maxUser: Int, $desc: String) {
        addTask(roomId: $roomId, name: $name, maxUser: $maxUser, desc: $desc) {
            id
        }
    }
`)

export const addTaskAsyncMutation = typedMutation(/* GraphQL */ `
    mutation ($roomId: String!, $name: String!, $maxUser: Int, $desc: String) {
        addTaskAsync(roomId: $roomId, name: $name, maxUser: $maxUser, desc: $desc) {
            id
        }
    }
`)

export const addTaskEndAsyncMutation = typedMutation(/* GraphQL */ `
    mutation ($roomId: String!, $name: String!, $maxUser: Int, $desc: String) {
        addTaskEndAsync(roomId: $roomId, name: $name, maxUser: $maxUser, desc: $desc) {
            id
        }
    }
`)

export const endTaskMutation = typedMutation<boolean>(/* GraphQL */ `
    mutation ($taskId: String!) {
        endTask(taskId: $taskId)
    }
`)

export const pauseTaskMutation = typedMutation<boolean>(/* GraphQL */ `
    mutation ($taskId: String!) {
        pauseTask(taskId: $taskId)
    }
`)

export const joinTaskMutation = typedMutation<boolean>(/* GraphQL */ `
    mutation ($taskId: String!) {
        joinTask(taskId: $taskId)
    }
`)

export const rtcSignalMutation = typedMutation<boolean>(/* GraphQL */ `
    mutation ($roomId: String!, $type: String!, $from: String!, $to: String!, $body: String!) {
        rtcSignal(roomId: $roomId, type: $type, from: $from, to: $to, body: $body)
    }
`)

export const rtcJoinMutation = typedMutation<{
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
}>(/* GraphQL */ `
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

export const joinRoomMutation = typedMutation<RoomInfo>(/* GraphQL */ `
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

export const createRoomMutation = typedMutation(/* GraphQL */ `
    mutation ($data: RoomsCreateInput!) {
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

export const updateRoomMutation = typedMutation(/* GraphQL */ `
    mutation ($id: String!, $data: RoomsUpdateInput!) {
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

export const deleteUserMutation = typedMutation<boolean>(/* GraphQL */ `
    mutation ($id: String!) {
        deleteUser(id: $id)
    }
`)

export const updateUserMutation = typedMutation(/* GraphQL */ `
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

export const updateGuideMutation = typedMutation(/* GraphQL */ `
    mutation ($id: String!, $input: GuideInput!) {
        updateGuide(id: $id, input: $input) {
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
        }
    }
`)

export const deleteGuideMutation = typedMutation<boolean>(/* GraphQL */ `
    mutation ($id: String!) {
        deleteGuide(id: $id)
    }
`)

export const recommendGuideMutation = typedMutation(/* GraphQL */ `
    mutation ($id: String!, $recommended: Boolean!) {
        recommendGuide(id: $id, recommended: $recommended) {
            id
            isRecommended
        }
    }
`)

export const pinGuideMutation = typedMutation(/* GraphQL */ `
    mutation ($id: String!, $pinned: Boolean!) {
        pinGuide(id: $id, pinned: $pinned) {
            id
            isPinned
        }
    }
`)

export const createSystemTodoMutation = typedMutation(/* GraphQL */ `
    mutation ($input: TodoInput!) {
        createSystemTodo(input: $input) {
            id
        }
    }
`)

export const updateSystemTodoMutation = typedMutation(/* GraphQL */ `
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
