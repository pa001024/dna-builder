import { RoomUserEvent } from "../../rt/pubsub"

const rtcClientsMap = new Map<string, RoomUserEvent[]>()
const userRoomsMap = new Map<string, string[]>()
const clientRoomMap = new Map<string, string>()

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

export function removeClient(id: string, roomId: string, user: { id: string; name: string; qq?: string }) {
    const clients = rtcClientsMap.get(roomId)?.filter((c) => c.id !== id) || []
    rtcClientsMap.set(roomId, clients)

    if (!clients.some((v) => v.user.id === user.id)) {
        const rooms = userRoomsMap.get(user.id) || []
        userRoomsMap.set(
            user.id,
            rooms.filter((r) => r !== roomId)
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

export function hasUser(roomId: string, userId: string) {
    return rtcClientsMap.get(roomId)?.find((c) => c.user.id === userId)?.id
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
