/**
 * @description 私密房间类型标识。该类型下消息仅房主、发送者、被回复者可见。
 */
export const ROOM_TYPE_PRIVATE = "private"

/**
 * @description 判断房间类型是否为私密类型。
 * @param roomType 房间类型字符串。
 * @returns 是否为私密房间类型。
 */
export function isPrivateRoomType(roomType: string | null | undefined): boolean {
    return roomType === ROOM_TYPE_PRIVATE
}

/**
 * @description 判断指定用户是否可查看某条消息。
 * @param roomType 房间类型。
 * @param roomOwnerId 房间创建者 ID。
 * @param viewerUserId 当前查看者用户 ID。
 * @param messageUserId 消息发送者用户 ID。
 * @param replyToUserId 被回复者用户 ID。
 * @returns 是否有权限查看消息。
 */
export function canViewMessageInRoom(
    roomType: string | null | undefined,
    roomOwnerId: string,
    viewerUserId: string,
    messageUserId: string,
    replyToUserId: string | null | undefined
): boolean {
    if (!isPrivateRoomType(roomType)) return true
    return roomOwnerId === viewerUserId || messageUserId === viewerUserId || replyToUserId === viewerUserId
}

/**
 * @description 生成私密房间用户级消息频道，仅该用户订阅可收到私密消息事件。
 * @param roomId 房间 ID。
 * @param userId 用户 ID。
 * @returns 用户级频道键。
 */
export function getPrivateRoomMessageTopic(roomId: string, userId: string): string {
    return `${roomId}:${userId}`
}
