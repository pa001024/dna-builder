import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"

/** 事件通道名，与 Rust 侧 `submodules/afk_bridge.rs` 的常量保持一致。 */
export const AFK_EVENT_NAME = "afk-support://event"
/** 连接状态通道名，与 Rust 侧常量保持一致。 */
export const AFK_STATUS_NAME = "afk-support://status"
/** 官方工具与游戏之间的管道名（仅用于展示与排查）。 */
export const AFK_PIPE_NAME = "\\\\.\\pipe\\TBH_RewardPipe"

/**
 * 奖励管道接收端运行状态（对应 Rust 侧 `AfkBridgeStatus`）。
 */
export interface AfkBridgeStatus {
    /** 接收端已启动（等连接也算运行中） */
    running: boolean
    /** 游戏已连上管道 */
    connected: boolean
    /** 本次连接建立时刻（Unix 毫秒） */
    connectedAt: number | null
    /** 累计下发的事件数 */
    received: number
    /** 累计丢弃的行数 */
    dropped: number
    /** 最近一条事件时刻（Unix 毫秒） */
    lastEventAt: number | null
    /** 最近一次错误（建管道/读管道失败） */
    lastError: string | null
}

/**
 * 协议事件类型（对应 Rust 侧 `AfkEventKind` 的 `kind`）。
 */
export type AfkEventKind = "reward" | "craft" | "dungeon" | "character" | "monster" | "chat" | "language" | "control"

/** 事件公共字段：所有事件都带接收时刻与原始行。 */
interface AfkEventBase {
    /** 本地接收时刻（Unix 毫秒）。连接瞬间会回放积压，不代表事件刚刚发生 */
    receivedAt: number
    /** 原始 JSON 行 */
    raw: string
}

/** 掉落/奖励；也是官方分发逻辑的兜底分支。 */
export interface AfkRewardEvent extends AfkEventBase {
    kind: "reward"
    id: number | null
    name: string
    rarity: number
    count: number
}

/** 铸造完成。 */
export interface AfkCraftEvent extends AfkEventBase {
    kind: "craft"
    name: string
    rarity: number
    count: number
}

/** 委托/副本进出，`status` 只有 `enter` / `complete`。 */
export interface AfkDungeonEvent extends AfkEventBase {
    kind: "dungeon"
    id: string
    status: "enter" | "complete"
    name: string
}

/** 角色状态（官方浮窗的像素战斗动画数据源）。 */
export interface AfkCharacterEvent extends AfkEventBase {
    kind: "character"
    id: number
    skin: number | null
    state: string
    name: string
    scene: string | null
}

/** 强制刷怪指令。 */
export interface AfkMonsterEvent extends AfkEventBase {
    kind: "monster"
    id: number
}

/** 聊天未读数。 */
export interface AfkChatEvent extends AfkEventBase {
    kind: "chat"
    team: number
    world: number
    party: number
}

/** 游戏语言。 */
export interface AfkLanguageEvent extends AfkEventBase {
    kind: "language"
    lang: string
}

/** 官方工具 UI 指令（游戏 → 工具），DNA Builder 只记录不执行。 */
export interface AfkControlEvent extends AfkEventBase {
    kind: "control"
    action: string
    index?: number
    value?: number
    x?: number
    y?: number
}

/** 一条协议事件。 */
export type AfkEvent =
    | AfkRewardEvent
    | AfkCraftEvent
    | AfkDungeonEvent
    | AfkCharacterEvent
    | AfkMonsterEvent
    | AfkChatEvent
    | AfkLanguageEvent
    | AfkControlEvent

/**
 * 启动本地管道接收端。
 * @returns 启动后的运行状态
 */
export async function afkBridgeStart() {
    return await invoke<AfkBridgeStatus>("afk_bridge_start")
}

/**
 * 停止接收端并释放管道实例（让官方小小狩月人可以接管）。
 * @returns 停止后的运行状态
 */
export async function afkBridgeStop() {
    return await invoke<AfkBridgeStatus>("afk_bridge_stop")
}

/**
 * 读取接收端运行状态。
 * @returns 当前运行状态
 */
export async function afkBridgeStatus() {
    return await invoke<AfkBridgeStatus>("afk_bridge_status")
}

/**
 * 监听管道事件（游戏推送的每条 JSON）。
 * @param handler 事件处理函数
 * @returns 取消监听函数
 */
export function onAfkEvent(handler: (event: AfkEvent) => void) {
    return listen<AfkEvent>(AFK_EVENT_NAME, event => handler(event.payload))
}

/**
 * 监听接收端状态变化。
 * @param handler 状态处理函数
 * @returns 取消监听函数
 */
export function onAfkStatus(handler: (status: AfkBridgeStatus) => void) {
    return listen<AfkBridgeStatus>(AFK_STATUS_NAME, event => handler(event.payload))
}
