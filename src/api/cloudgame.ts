import { invoke } from "@tauri-apps/api/core"
import { listen, type Event, type UnlistenFn } from "@tauri-apps/api/event"

export const CLOUDGAME_BRIDGE_EVENT = "cloudgame://bridge"
export const CLOUDGAME_PAGE_LOAD_EVENT = "cloudgame://page-load"
export const CLOUDGAME_WINDOW_EVENT = "cloudgame://window-state"

/**
 * 云游戏后台窗口的启动配置。
 */
export interface CloudGameWindowOptions {
    url?: string
    title?: string
    width?: number
    height?: number
    minWidth?: number
    minHeight?: number
    x?: number
    y?: number
    visible?: boolean
    focus?: boolean
    decorations?: boolean
    resizable?: boolean
    alwaysOnTop?: boolean
    skipTaskbar?: boolean
    incognito?: boolean
    openDevtools?: boolean
    userAgent?: string
    proxyUrl?: string
}

/**
 * 云游戏后台窗口的实时状态。
 */
export interface CloudGameWindowState {
    label: string
    url: string
    title: string
    visible: boolean
    focused: boolean
}

/**
 * 云游戏桥接事件负载。
 */
export interface CloudGameBridgePayload {
    type: string
    payload: unknown
}

/**
 * 云游戏 SDK 桥接状态。
 */
export interface CloudGameBridgeStatus {
    hookedAt: number
    transportReady: boolean
    transportKind: string | null
    transportAttached: boolean
    sid: number | null
    connected: boolean
    inputMode: string | null
    lastAction: string | null
    lastPacket: unknown
    connectArg: unknown
    seenActionNames: string[]
    seenPackets: number
}

/**
 * 云游戏原生鼠标指令参数。
 */
export interface CloudGameMouseCommand {
    mouseX: number
    mouseY: number
    cursorX: number
    cursorY: number
    action: number
    code: number
    value?: number
    extra?: number
}

/**
 * 云游戏原生键盘指令参数。
 */
export interface CloudGameKeyEventCommand {
    action: number
    state: number
}

/**
 * 云游戏原生触摸指令参数。
 */
export interface CloudGameTouchCommand {
    action: number
    state: number
    index?: number
    x: number
    y: number
    extra1?: number
    extra2?: number
}

/**
 * 云游戏页面加载事件负载。
 */
export interface CloudGamePageLoadPayload {
    label: string
    url: string
    event: string
}

/**
 * 打开或复用云游戏后台窗口。
 * @param options 云游戏后台窗口配置
 * @returns 当前窗口状态
 */
export async function openCloudGameWindow(options: CloudGameWindowOptions = {}) {
    return await invoke<CloudGameWindowState>("open_cloudgame_window", { options })
}

/**
 * 获取云游戏后台窗口状态。
 * @returns 窗口状态，未打开时返回 null
 */
export async function getCloudGameWindowState() {
    return await invoke<CloudGameWindowState | null>("get_cloudgame_window_state")
}

/**
 * 关闭云游戏后台窗口。
 * @returns 是否实际关闭了窗口
 */
export async function closeCloudGameWindow() {
    return await invoke<boolean>("close_cloudgame_window")
}

/**
 * 显示云游戏后台窗口。
 * @returns 最新窗口状态，未打开时返回 null
 */
export async function showCloudGameWindow() {
    return await invoke<CloudGameWindowState | null>("show_cloudgame_window")
}

/**
 * 隐藏云游戏后台窗口。
 * @returns 最新窗口状态，未打开时返回 null
 */
export async function hideCloudGameWindow() {
    return await invoke<CloudGameWindowState | null>("hide_cloudgame_window")
}

/**
 * 聚焦云游戏后台窗口。
 * @returns 最新窗口状态，未打开时返回 null
 */
export async function focusCloudGameWindow() {
    return await invoke<CloudGameWindowState | null>("focus_cloudgame_window")
}

/**
 * 重新加载云游戏页面。
 * @returns 最新窗口状态，未打开时返回 null
 */
export async function reloadCloudGameWindow() {
    return await invoke<CloudGameWindowState | null>("reload_cloudgame_window")
}

/**
 * 导航云游戏后台窗口到新地址。
 * @param url 目标地址
 * @returns 最新窗口状态，未打开时返回 null
 */
export async function navigateCloudGameWindow(url: string) {
    return await invoke<CloudGameWindowState | null>("navigate_cloudgame_window", { url })
}

/**
 * 通过注入桥向页面派发高阶控制命令。
 * @param action 控制动作名称
 * @param payload 控制动作负载
 */
export async function dispatchCloudGameCommand(action: string, payload?: unknown) {
    await invoke("dispatch_cloudgame_command", { action, payload })
}

/**
 * 请求当前桥接到的 SDK 输入通道状态。
 * 实际结果会通过 bridge 事件异步回流。
 */
export async function requestCloudGameBridgeStatus() {
    await dispatchCloudGameCommand("status")
}

/**
 * 直接发送原始 transport 数据包。
 * @param packet 目标 worker/port 协议包
 */
export async function sendCloudGameRawPacket(packet: Record<string, unknown>) {
    await dispatchCloudGameCommand("sendRaw", packet)
}

/**
 * 发送 x_fn_exec 原生指令。
 * @param actionName SDK 原生动作名
 * @param args 动作参数（不含 sid）
 */
export async function sendCloudGameXFnExec(actionName: string, args: unknown[] = []) {
    await dispatchCloudGameCommand("xFnExec", { actionName, args })
}

/**
 * 发送 fn_exec 原生指令。
 * @param actionName SDK 原生动作名
 * @param args 动作参数
 * @param prependSid 是否自动补 sid
 */
export async function sendCloudGameFnExec(actionName: string, args: unknown[] = [], prependSid = true) {
    await dispatchCloudGameCommand("fnExec", { actionName, args, prependSid })
}

/**
 * 发送云游戏原生鼠标指令。
 * @param command 鼠标动作参数
 */
export async function sendCloudGameMouse(command: CloudGameMouseCommand) {
    await dispatchCloudGameCommand("mouse", command)
}

/**
 * 发送云游戏原生键盘指令。
 * @param command 键盘动作参数
 */
export async function sendCloudGameKeyEvent(command: CloudGameKeyEventCommand) {
    await dispatchCloudGameCommand("keyEvent", command)
}

/**
 * 发送云游戏原生触摸指令。
 * @param command 触摸动作参数
 */
export async function sendCloudGameTouch(command: CloudGameTouchCommand) {
    await dispatchCloudGameCommand("touch", command)
}

/**
 * 主动发送 keep-alive 指令，验证 transport 是否存活。
 */
export async function sendCloudGameKeepAlive() {
    await dispatchCloudGameCommand("keepAlive")
}

/**
 * 直接在云游戏页面执行脚本。
 * @param script 要执行的脚本
 */
export async function evalCloudGameWindow(script: string) {
    return await invoke("eval_cloudgame_window", { script })
}

/**
 * 监听云游戏桥接事件。
 * @param handler 事件处理函数
 * @returns 取消监听函数
 */
export async function listenCloudGameBridge(handler: (event: Event<CloudGameBridgePayload>) => void): Promise<UnlistenFn> {
    return await listen<CloudGameBridgePayload>(CLOUDGAME_BRIDGE_EVENT, handler)
}

/**
 * 监听云游戏页面加载事件。
 * @param handler 事件处理函数
 * @returns 取消监听函数
 */
export async function listenCloudGamePageLoad(handler: (event: Event<CloudGamePageLoadPayload>) => void): Promise<UnlistenFn> {
    return await listen<CloudGamePageLoadPayload>(CLOUDGAME_PAGE_LOAD_EVENT, handler)
}

/**
 * 监听云游戏窗口状态事件。
 * @param handler 事件处理函数
 * @returns 取消监听函数
 */
export async function listenCloudGameWindowState(handler: (event: Event<CloudGameWindowState | null>) => void): Promise<UnlistenFn> {
    return await listen<CloudGameWindowState | null>(CLOUDGAME_WINDOW_EVENT, handler)
}
