import { invoke } from "@tauri-apps/api/core"
import { type Event, listen, type UnlistenFn } from "@tauri-apps/api/event"

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
