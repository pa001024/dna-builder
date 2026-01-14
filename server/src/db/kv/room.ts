import { RoomUserEvent } from "../../rt/pubsub"

const rtcClientsMap = new Map<string, RoomUserEvent[]>()
const userRoomsMap = new Map<string, string[]>()
const clientRoomMap = new Map<string, string>()

/**
 * 添加客户端到房间
 */
export function addClient(id: string, roomId: string, user: { id: string; name: string; qq?: string }) {
    const clients = rtcClientsMap.get(roomId) || []
    const newRtc = clients.find((v) => v.id === id) || {
        id,
        end: false,
        user: {
            id: user.id,
            name: user.name,
            qq: user.qq,
        },
    }
    const rooms = userRoomsMap.get(user.id) || []
    if (!rooms.includes(roomId)) {
        rooms.push(roomId)
    }
    userRoomsMap.set(user.id, rooms)
    clientRoomMap.set(id, roomId)
    rtcClientsMap.set(roomId, [...clients, newRtc])
    return newRtc
}

/**
 * 从房间移除客户端
 */
export function removeClient(id: string, roomId: string, user: { id: string; name: string; qq?: string }) {
    const clients = rtcClientsMap.get(roomId)?.filter((c) => c.id !== id) || []
    rtcClientsMap.set(roomId, clients)

    if (!clients.some((v) => v.user.id === user.id)) {
        const rooms = userRoomsMap.get(user.id) || []
        userRoomsMap.set(
            user.id,
            rooms.filter((r) => r !== roomId),
        )
    }
    clientRoomMap.delete(id)

    return {
        id,
        end: true,
        user: {
            id: user.id,
            name: user.name,
            qq: user.qq,
        },
    }
}

/**
 * 检查用户是否在房间中
 */
export function hasUser(roomId: string, userId: string) {
    return rtcClientsMap.get(roomId)?.find((c) => c.user.id === userId)?.id
}

/**
 * 等待用户进入房间
 * @param roomId 房间ID
 * @param userId 用户ID
 * @param timeout 超时时间（毫秒），默认30秒
 * @returns Promise，当用户进入房间时resolve，超时则reject
 */
export function waitForUser(roomId: string, userId: string, timeout: number = 30000): Promise<void> {
    // 立即检查用户是否已经在房间中
    if (hasUser(roomId, userId)) {
        return Promise.resolve()
    }

    return new Promise((resolve, reject) => {
        const checkInterval = setInterval(() => {
            if (hasUser(roomId, userId)) {
                clearInterval(checkInterval)
                clearTimeout(timeoutTimer)
                resolve()
            }
        }, 500) // 每500毫秒检查一次

        // 设置超时定时器
        const timeoutTimer = setTimeout(() => {
            clearInterval(checkInterval)
            reject(new Error(`等待用户进入房间超时: roomId=${roomId}, userId=${userId}`))
        }, timeout)
    })
}

export function getClients(roomId: string) {
    return rtcClientsMap.get(roomId) || []
}

export function getUsers(roomId: string) {
    return rtcClientsMap.get(roomId)?.map((c) => c.user) || []
}

export function getUserRooms(userId: string) {
    return userRoomsMap.get(userId)
}

export function isUserInRoom(userId: string, roomId: string) {
    return userRoomsMap.get(userId)?.includes(roomId) || false
}

export function getClientRoom(userId: string) {
    return clientRoomMap.get(userId)
}
