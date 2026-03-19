import type { UnlistenFn } from "@tauri-apps/api/event"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { defineStore } from "pinia"
import {
    type CloudGameBridgePayload,
    type CloudGameBridgeStatus,
    type CloudGamePageLoadPayload,
    type CloudGameWindowOptions,
    type CloudGameWindowState,
    closeCloudGameWindow,
    focusCloudGameWindow,
    getCloudGameWindowState,
    listenCloudGameBridge,
    listenCloudGamePageLoad,
    listenCloudGameWindowState,
    openCloudGameWindow,
    requestCloudGameBridgeStatus,
} from "@/api/cloudgame"
import { env } from "@/env"
import { useUIStore } from "@/store/ui"

let bridgeUnlistenFn: UnlistenFn | null = null
let pageLoadUnlistenFn: UnlistenFn | null = null
let windowStateUnlistenFn: UnlistenFn | null = null
let cloudGameListenerReady = false

interface CloudGameCommandResultPayload {
    action: string | null
    ok: boolean
    result?: unknown
    error?: string
}

/**
 * 判断当前是否在桌面端主窗口中运行，避免在子窗口重复初始化全局监听。
 * @returns 是否允许初始化全局云游戏监听
 */
function canInitCloudGameTracking() {
    return env.isApp && getCurrentWindow().label === "main"
}

/**
 * 判断输入值是否像云游戏桥状态对象。
 * @param payload 待判断负载
 * @returns 是否为桥状态
 */
function isCloudGameBridgeStatus(payload: unknown): payload is CloudGameBridgeStatus {
    if (!payload || typeof payload !== "object") return false
    const candidate = payload as Record<string, unknown>
    return (
        typeof candidate.hookedAt === "number" &&
        typeof candidate.transportReady === "boolean" &&
        typeof candidate.transportAttached === "boolean" &&
        Array.isArray(candidate.seenActionNames)
    )
}

/**
 * 判断输入值是否像 command-result 负载。
 * @param payload 待判断负载
 * @returns 是否为命令结果负载
 */
function isCloudGameCommandResultPayload(payload: unknown): payload is CloudGameCommandResultPayload {
    if (!payload || typeof payload !== "object") return false
    const candidate = payload as Record<string, unknown>
    return typeof candidate.ok === "boolean" && ("action" in candidate || "result" in candidate || "error" in candidate)
}

/**
 * 从桥接事件负载中提取桥状态，兼容多种事件结构。
 * @param payload 桥接事件负载
 * @returns 桥状态，不存在时返回 null
 */
function extractBridgeStatus(payload: unknown): CloudGameBridgeStatus | null {
    if (isCloudGameBridgeStatus(payload)) {
        return payload
    }
    if (!payload || typeof payload !== "object") {
        return null
    }

    const candidate = payload as Record<string, unknown>
    if (isCloudGameBridgeStatus(candidate.state)) {
        return candidate.state
    }
    if (isCloudGameCommandResultPayload(payload) && isCloudGameBridgeStatus(candidate.result)) {
        return candidate.result
    }
    return null
}

export const useCloudGameStore = defineStore("cloudgame", {
    state: () => ({
        initialized: false,
        opening: false,
        windowState: null as CloudGameWindowState | null,
        bridgeStatus: null as CloudGameBridgeStatus | null,
        lastBridgeEventType: "",
        lastBridgePayload: null as unknown,
        lastPageLoadPayload: null as CloudGamePageLoadPayload | null,
    }),
    getters: {
        isWindowOpen: state => Boolean(state.windowState),
        isBridgeConnected: state => Boolean(state.bridgeStatus?.connected),
        bridgeEventSummary: state => {
            if (!state.lastBridgeEventType) return ""
            if (state.bridgeStatus?.connected) {
                return `${state.lastBridgeEventType} · 已连通`
            }
            return state.lastBridgeEventType
        },
    },
    actions: {
        /**
         * 应用云游戏窗口状态。
         * @param windowState 最新窗口状态
         */
        applyWindowState(windowState: CloudGameWindowState | null) {
            this.windowState = windowState
        },

        /**
         * 处理桥接事件并同步状态快照。
         * @param eventPayload 桥接事件负载
         */
        applyBridgeEvent(eventPayload: CloudGameBridgePayload) {
            this.lastBridgeEventType = String(eventPayload?.type ?? "")
            this.lastBridgePayload = eventPayload?.payload ?? null
            const bridgeStatus = extractBridgeStatus(eventPayload?.payload)
            if (bridgeStatus) {
                this.bridgeStatus = bridgeStatus
            }
        },

        /**
         * 处理页面加载事件。
         * @param payload 页面加载事件负载
         */
        applyPageLoadPayload(payload: CloudGamePageLoadPayload) {
            this.lastPageLoadPayload = payload
        },

        /**
         * 主动向后端同步当前云游戏窗口状态。
         */
        async syncWindowStateFromBackend() {
            this.applyWindowState(await getCloudGameWindowState())
        },

        /**
         * 初始化云游戏监听，仅在主窗口执行一次。
         */
        async initCloudGameTracking() {
            if (!canInitCloudGameTracking()) return

            if (cloudGameListenerReady) {
                this.initialized = true
                await this.syncWindowStateFromBackend()
                if (this.windowState) {
                    await requestCloudGameBridgeStatus()
                }
                return
            }

            bridgeUnlistenFn = await listenCloudGameBridge(event => {
                if (!event?.payload) return
                this.applyBridgeEvent(event.payload)
            })
            pageLoadUnlistenFn = await listenCloudGamePageLoad(event => {
                if (!event?.payload) return
                this.applyPageLoadPayload(event.payload)
            })
            windowStateUnlistenFn = await listenCloudGameWindowState(event => {
                this.applyWindowState(event?.payload ?? null)
            })

            cloudGameListenerReady = true
            this.initialized = true
            await this.syncWindowStateFromBackend()
            if (this.windowState) {
                await requestCloudGameBridgeStatus()
            }
        },

        /**
         * 打开或复用云游戏窗口，并刷新最新桥状态。
         * @param options 云游戏窗口配置
         */
        async openCloudGame(options: CloudGameWindowOptions = {}) {
            const ui = useUIStore()
            this.opening = true
            try {
                this.applyWindowState(
                    await openCloudGameWindow({
                        // openDevtools: true,
                        title: "云·二重螺旋",
                        ...options,
                    })
                )
                await requestCloudGameBridgeStatus()
            } catch (error) {
                console.error("打开云游戏窗口失败", error)
                ui.showErrorMessage(`打开云游戏窗口失败: ${error instanceof Error ? error.message : String(error)}`)
                throw error
            } finally {
                this.opening = false
            }
        },

        /**
         * 聚焦已存在的云游戏窗口；不存在时退化为直接打开。
         */
        async openOrFocusCloudGame() {
            await this.syncWindowStateFromBackend()
            if (this.windowState) {
                const nextState = await focusCloudGameWindow()
                this.applyWindowState(nextState ?? null)
                if (!nextState) {
                    await this.openCloudGame()
                    return
                }
                await requestCloudGameBridgeStatus()
                return
            }
            await this.openCloudGame()
        },

        /**
         * 关闭当前云游戏窗口。
         */
        async closeCloudGame() {
            const ui = useUIStore()
            try {
                await closeCloudGameWindow()
                this.applyWindowState(null)
            } catch (error) {
                console.error("关闭云游戏窗口失败", error)
                ui.showErrorMessage(`关闭云游戏窗口失败: ${error instanceof Error ? error.message : String(error)}`)
                throw error
            }
        },

        /**
         * 释放监听，仅用于热重载或测试场景。
         */
        disposeCloudGameTracking() {
            bridgeUnlistenFn?.()
            pageLoadUnlistenFn?.()
            windowStateUnlistenFn?.()
            bridgeUnlistenFn = null
            pageLoadUnlistenFn = null
            windowStateUnlistenFn = null
            cloudGameListenerReady = false
            this.initialized = false
        },
    },
})
