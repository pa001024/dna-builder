import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"

/** HTTPS 同步端口（手机 App 直连，自签证书 TLS） */
export const LAN_SYNC_HTTPS_PORT = 28182
/** UDP 设备发现端口（手机 App 广播探测） */
export const LAN_SYNC_UDP_PORT = 28183
/** 同步协议版本，与 Rust 侧 PROTOCOL_VERSION 保持一致 */
export const LAN_SYNC_PROTOCOL_VERSION = 1

/**
 * 已配对设备（持久化在桌面端 localStorage，与 Rust 侧 PairedDevice 对应）
 */
export interface LanSyncPairedDevice {
    /** 手机端稳定设备 id */
    deviceId: string
    /** 手机端展示名 */
    deviceName: string
    /** 鉴权 token（配对成功时由桌面端签发） */
    token: string
    /** 配对时间（Unix 毫秒） */
    pairedAt: number
    /** 最近活跃时间（Unix 毫秒） */
    lastSeenAt: number
}

/**
 * 启动服务时传给 Rust 的历史配对设备（不含时间戳）
 */
export interface LanSyncDeviceInput {
    deviceId: string
    deviceName: string
    token: string
}

/**
 * 局域网同步服务运行状态（Rust 侧 LanSyncStatus）
 */
export interface LanSyncStatus {
    running: boolean
    httpsPort: number
    udpPort: number
    deviceId: string
    deviceName: string
    /** 本机局域网地址（仅主网卡） */
    address: string
    /** 自签 CA 证书指纹（SHA-256 hex），手机端固定信任的比对依据 */
    caFingerprint: string
    devices: LanSyncPairedDevice[]
}

/**
 * DOB（DNA Builder 社区）账号同步载荷
 */
export interface LanSyncDobAccount {
    /** 社区账号 JWT */
    token: string
    /** 用户资料（可缺省，缺省时由桌面端自行刷新） */
    profile?: unknown
    /** 用户名（仅展示用） */
    name?: string
}

/**
 * 账号快照：桌面端与手机端共用同一结构，双向同步的交换格式
 */
export interface LanSyncSnapshot {
    /** DOB 账号，未登录时为 null */
    dob: LanSyncDobAccount | null
    /** DNA（皎皎角）游戏账号列表，按 uid 作为唯一键合并 */
    dnaUsers: Record<string, unknown>[]
    /** 桌面端当前使用的 DNA 账号 uid（空串表示未选择） */
    currentDnaUid: string
    /** 快照生成时间（Unix 毫秒） */
    updatedAt: number
}

/**
 * 手机端推送过来的账号数据（lan-sync-incoming 事件载荷）
 */
export interface LanSyncIncomingPayload {
    dob: LanSyncDobAccount | null
    dnaUsers: Record<string, unknown>[]
}

/**
 * 手机端发起的配对请求（lan-sync-pair-request 事件载荷），
 * 桌面端需弹窗让用户确认后调用 lanSyncResolvePair 应答。
 */
export interface LanSyncPairRequestPayload {
    /** 配对请求 id，应答时原样传回 */
    requestId: string
    /** 手机端稳定设备 id */
    deviceId: string
    /** 手机端展示名 */
    deviceName: string
}

/**
 * 启动局域网同步服务。
 * @param pairedDevices 历史配对设备（含 token）
 * @returns 启动后的运行状态
 */
export async function lanSyncStart(pairedDevices: LanSyncDeviceInput[]) {
    return await invoke<LanSyncStatus>("lan_sync_start", { pairedDevices })
}

/**
 * 停止局域网同步服务。
 */
export async function lanSyncStop() {
    return await invoke<void>("lan_sync_stop")
}

/**
 * 读取服务运行状态。
 */
export async function lanSyncStatus() {
    return await invoke<LanSyncStatus>("lan_sync_status")
}

/**
 * 向 Rust 侧注入最新账号快照（同时唤醒等待中的 /sync 请求）。
 * @param snapshot 账号快照
 */
export async function lanSyncUpdateSnapshot(snapshot: LanSyncSnapshot) {
    return await invoke<void>("lan_sync_update_snapshot", { snapshot })
}

/**
 * 删除已配对设备（吊销 token）。
 * @param token 设备 token
 * @returns 删除后的运行状态
 */
export async function lanSyncRemoveDevice(token: string) {
    return await invoke<LanSyncStatus>("lan_sync_remove_device", { token })
}

/**
 * 应答配对请求（用户在弹窗上允许/拒绝）。
 * @param requestId 配对请求 id
 * @param approved 是否允许
 */
export async function lanSyncResolvePair(requestId: string, approved: boolean) {
    return await invoke<void>("lan_sync_resolve_pair", { requestId, approved })
}

/**
 * 监听手机端推送的账号数据（收到后由前端负责导入）。
 * @param handler 事件处理函数
 * @returns 取消监听函数
 */
export function onLanSyncIncoming(handler: (payload: LanSyncIncomingPayload) => void) {
    return listen<LanSyncIncomingPayload>("lan-sync-incoming", event => handler(event.payload))
}

/**
 * 监听手机端的配对请求（前端弹窗让用户确认后应答）。
 * @param handler 事件处理函数
 * @returns 取消监听函数
 */
export function onLanSyncPairRequest(handler: (payload: LanSyncPairRequestPayload) => void) {
    return listen<LanSyncPairRequestPayload>("lan-sync-pair-request", event => handler(event.payload))
}

/**
 * 监听配对成功事件（前端据此持久化新设备 token）。
 * @param handler 事件处理函数
 * @returns 取消监听函数
 */
export function onLanSyncPaired(handler: (payload: LanSyncPairedDevice) => void) {
    return listen<LanSyncPairedDevice>("lan-sync-paired", event => handler(event.payload))
}
