import { type Cache, cacheExchange as graphcacheExchange } from "@urql/exchange-graphcache"
import { Client, fetchExchange, gql, subscriptionExchange } from "@urql/vue"
import { createClient, type SubscribePayload } from "graphql-ws"
import { jwtDecode } from "jwt-decode"
import { nanoid } from "nanoid"
import { env } from "../env"

const CHAT_MSG_PAGE_LIMIT = 20
const ROOM_MSG_META_FRAGMENT = gql`
    fragment _ on Room {
        id
        msgCount
        lastMsg {
            id
        }
    }
`
const ROOM_LAST_MSG_FRAGMENT = gql`
    fragment _ on Room {
        id
        msgCount
        lastMsg {
            id
            roomId
            userId
            edited
            content
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
        }
    }
`
const ROOM_MSGS_QUERY = gql`
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
                    currentTitleText
                    currentTitleClass
                    nameEffectClass
                }
            }
        }
    }
`

/**
 * @description 读取当前持久化的 JWT，避免把 store 拉进 API 初始化链。
 * @returns 当前 JWT 或空字符串。
 */
function getJwtToken() {
    if (typeof localStorage === "undefined") return ""
    return localStorage.getItem("jwt_token") || ""
}

/**
 * @description 从 JWT 中读取当前用户 ID，用于缓存更新时跳过自身事件。
 * @returns 当前用户 ID 或空字符串。
 */
function getCurrentUserId() {
    const token = getJwtToken()
    if (!token) return ""
    try {
        return jwtDecode<{ id?: string }>(token).id || ""
    } catch {
        return ""
    }
}

/**
 * @description 计算消息列表“最新页”在分页查询中的 offset，和 ChatRoom/GQAutoPage 保持一致。
 * @param total 当前消息总数。
 * @param limit 每页大小。
 * @returns 最新页对应的 offset。
 */
function getLatestMsgPageOffset(total: number, limit = CHAT_MSG_PAGE_LIMIT) {
    if (total <= 0) return 0
    return total - (total % limit || limit)
}

/**
 * @description 判断目标消息是否已经存在于指定分页缓存中，避免订阅回放或重连补同步导致重复插入。
 * @param cache Graphcache 实例。
 * @param roomId 房间 ID。
 * @param offset 分页偏移量。
 * @param msgId 消息 ID。
 * @returns 当前分页是否已存在该消息。
 */
function hasMessageInCachedPage(cache: Cache, roomId: string, offset: number, msgId: string) {
    const cachedPage = cache.readQuery<{ msgs: { id: string }[] }>({
        query: ROOM_MSGS_QUERY,
        variables: { roomId, limit: CHAT_MSG_PAGE_LIMIT, offset },
    })
    return cachedPage?.msgs?.some(item => item.id === msgId) ?? false
}

/**
 * @description 将新消息同步写入房间元信息和最新消息分页缓存。
 * @param cache Graphcache 实例。
 * @param roomId 房间 ID。
 * @param msg 新消息对象。
 */
function updateNewMessageCache(cache: Cache, roomId: string, msg: any) {
    const roomCache = cache.readFragment<{ id: string; msgCount?: number; lastMsg?: { id?: string } | null }>(ROOM_MSG_META_FRAGMENT, {
        id: roomId as any,
    })
    const hasWrittenAsLastMessage = roomCache?.lastMsg?.id === msg.id
    const currentCount = roomCache?.msgCount || 0
    const nextCount = hasWrittenAsLastMessage ? currentCount : currentCount + 1
    const latestPageOffset = getLatestMsgPageOffset(nextCount)
    const hasMessageInLatestPage = hasMessageInCachedPage(cache, roomId, latestPageOffset, msg.id)

    cache.writeFragment(ROOM_LAST_MSG_FRAGMENT, {
        id: roomId,
        msgCount: nextCount,
        lastMsg: {
            __typename: "Msg",
            id: msg.id,
            roomId: msg.roomId,
            userId: msg.userId,
            edited: msg.edited,
            content: msg.content,
            replyToMsgId: msg.replyToMsgId,
            replyToUserId: msg.replyToUserId,
            createdAt: msg.createdAt,
            updateAt: msg.updateAt,
            user: msg.user && {
                __typename: "User",
                id: msg.user.id,
                name: msg.user.name,
                qq: msg.user.qq,
            },
            replyTo: msg.replyTo && {
                __typename: "Msg",
                id: msg.replyTo.id,
                content: msg.replyTo.content,
                user: msg.replyTo.user && {
                    __typename: "User",
                    id: msg.replyTo.user.id,
                    name: msg.replyTo.user.name,
                    qq: msg.replyTo.user.qq,
                },
            },
        },
    })

    cache.updateQuery(
        {
            query: ROOM_MSGS_QUERY,
            variables: { roomId, limit: CHAT_MSG_PAGE_LIMIT, offset: latestPageOffset },
        },
        data => {
            if (hasMessageInLatestPage) return data
            if (!data) return { msgs: [msg] }
            return {
                ...data,
                msgs: [...data.msgs, msg],
            }
        }
    )
}

const cacheExchange = graphcacheExchange({
    keys: {
        UserDailyExperienceStatus: () => null,
        UserAbyssUsageUploadStatus: () => null,
    },
    resolvers: {
        Query: {
            msgCount: async (_data, args, cache, _info) => {
                const roomCache = cache.readFragment<{ id: string; msgCount?: number }>(
                    gql`
                        fragment _ on Room {
                            id
                            msgCount
                        }
                    `,
                    { id: args.roomId as any }
                )
                if (roomCache) return roomCache.msgCount
                return 0
            },
        },
    },
    updates: {
        Mutation: {
            rtcJoin: (
                result: {
                    rtcJoin: {
                        id: string
                        end: boolean
                        user: { id: string; name: string; qq: string }
                        clients: { id: string; end: boolean; user: { id: string; name: string; qq: string } }[]
                    }
                },
                args,
                cache,
                _info
            ) => {
                const newRtc = result.rtcJoin
                if (!newRtc) return
                cache.updateQuery<{
                    rtcClients: {
                        id: string
                    }[]
                }>(
                    {
                        query: gql`
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
                        `,
                        variables: { roomId: args.roomId },
                    },
                    data => {
                        if (!data) return { rtcClients: [] }
                        if (newRtc.user.id !== getCurrentUserId() && data.rtcClients.some(v => v.id !== newRtc.id)) {
                            data.rtcClients.push(newRtc)
                        }
                        return data
                    }
                )
            },
            updateTask(result: any, args, cache, _info) {
                const fragment = gql`
                    fragment _ on Task {
                        id
                        userList
                        startTime
                        endTime
                    }
                `

                const task = result.updateTask
                cache.writeFragment(fragment, {
                    id: task.id,
                    userList: task.userList,
                    startTime: task.startTime,
                    endTime: task.endTime,
                })
                if (task.endTime) {
                    cache.updateQuery(
                        {
                            query: gql`
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
                                        paused
                                        online
                                        user {
                                            id
                                            name
                                            qq
                                        }
                                    }
                                }
                            `,
                            variables: { roomId: args.roomId },
                        },
                        data => {
                            if (!data) return { doingTasks: [] }
                            data.doingTasks = data.doingTasks.filter((v: any) => !v.endTime)
                            return data
                        }
                    )
                }
            },
            newTask(result: any, args, cache, _info) {
                const task = result.newTask
                cache.updateQuery(
                    {
                        query: gql`
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
                                    user {
                                        id
                                        name
                                        qq
                                    }
                                }
                            }
                        `,
                        variables: { roomId: args.roomId },
                    },
                    data => {
                        if (!data) return { doingTasks: [task] }
                        data.doingTasks.push(task)
                        return data
                    }
                )
            },
            // newMessage(result: any, args, cache, _info) {
            //     const msg = result.newMessage
            //     if (!msg?.id) return
            //     updateNewMessageCache(cache, args.roomId as string, msg)
            // },
        },
        Subscription: {
            newMessage(result: any, args, cache, _info) {
                const msg = result.newMessage
                if (!msg?.id) return
                updateNewMessageCache(cache, args.roomId as string, msg)
            },
            msgEdited(result: any, _args, cache, _info) {
                const fragment = gql`
                    fragment _ on Msg {
                        id
                        content
                        edited
                    }
                `

                const msg = result.msgEdited
                cache.writeFragment(fragment, {
                    id: msg.id,
                    content: msg.content,
                    edited: msg.edited,
                })
            },
        },
    },
    optimistic: {},
})

/**
 * @description 创建并缓存 GraphQL 客户端，统一管理 HTTP 和 WS 连接。
 * @returns GraphQL 客户端实例。
 */
export const gqClient = (() => {
    const url = `${env.apiEndpoint}/graphql`
    const ws = createClient({
        url: url.replace("http", "ws"),
        connectionParams: () => {
            return {
                token: getJwtToken(),
            }
        },
        generateID: () => nanoid(),
    })
    return new Client({
        url,
        exchanges: [
            cacheExchange,
            fetchExchange,
            subscriptionExchange({
                forwardSubscription(operation) {
                    return {
                        subscribe: sink => {
                            const dispose = ws.subscribe(operation as SubscribePayload, sink)
                            return {
                                unsubscribe: dispose,
                            }
                        },
                    }
                },
            }),
        ],
        fetchOptions: () => {
            return {
                headers: { token: getJwtToken() },
            }
        },
    })
})()
