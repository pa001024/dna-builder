export type QQBotEvent =
    | QQBotEventReady
    | QQBotEventGroupAddRobot
    | QQBotEventGroupDelRobot
    | QQBotEventGroupAtMessageCreate
    | QQBotEventC2CMessageCreate
    | QQBotEventReload
    | QQBotEventRestart
    | QQBotEventHeartbeatInterval
    | QQBotEventHeartbeat

export interface MessageScene {
    source: string
}

export interface Author {
    id: string
    member_openid: string
    union_openid: string
}

export interface QQBotUser {
    id: string
    username: string
    bot: boolean
    status: number
}

/**
 * 机器人准备事件
 */
export interface QQBotEventReady {
    op: 0
    t: "READY"
    s: number
    d: {
        version: number
        session_id: string
        user: QQBotUser
        shard: number[]
    }
}
/**
 * 机器人加入群事件
 */
export interface QQBotEventGroupAddRobot {
    op: 0
    t: "GROUP_ADD_ROBOT"
    s: number
    d: {
        group_openid: string
        op_member_openid: string
        timestamp: number
    }
}
/**
 * 机器人移除群事件
 */
export interface QQBotEventGroupDelRobot {
    op: 0
    t: "GROUP_DEL_ROBOT"
    s: number
    d: {
        group_openid: string
        op_member_openid: string
        timestamp: number
    }
}

/**
 * 群at消息创建事件
 */
export interface QQBotEventGroupAtMessageCreate {
    op: 0
    s: number
    t: "GROUP_AT_MESSAGE_CREATE"
    id: string
    d: {
        author: Author
        content: string
        group_id: string
        group_openid: string
        id: string
        message_scene: MessageScene
        timestamp: string
    }
}
/**
 * 私聊消息创建事件
 */
export interface QQBotEventC2CMessageCreate {
    op: 0
    s: number
    t: "C2C_MESSAGE_CREATE"
    id: string
    d: {
        author: Author
        content: string
        id: string
        message_scene: MessageScene
        timestamp: string
    }
}
/**
 * 重新加载事件
 */
export interface QQBotEventReload {
    op: 7
}
/**
 * 重启事件
 */
export interface QQBotEventRestart {
    op: 9
}
/**
 * 心跳间隔事件
 */
export interface QQBotEventHeartbeatInterval {
    op: 10
    d: {
        heartbeat_interval: number
    }
}
/**
 * 心跳事件
 */
export interface QQBotEventHeartbeat {
    op: 11
}
