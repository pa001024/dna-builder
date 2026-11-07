import type { UnlistenFn } from "@tauri-apps/api/event"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { t } from "i18next"
import { defineStore } from "pinia"
import { launchNormal } from "@/api/app"
import {
    type CloudGamePageLoadPayload,
    type CloudGameWindowOptions,
    type CloudGameWindowState,
    closeCloudGameWindow,
    focusCloudGameWindow,
    getCloudGameWindowState,
    listenCloudGamePageLoad,
    listenCloudGameWindowState,
    openCloudGameWindow,
} from "@/api/cloudgame"
import { env } from "@/env"
import { useUIStore } from "@/store/ui"
import {
    downloadCloudgameNative,
    installCloudgameNative,
    isCloudgameNativeInstalled,
    resolveCloudgameNativePaths,
} from "@/utils/cloudgame-native"

/** 云游戏实现方式：原版 WebView 网页端 / 原生客户端。 */
export type CloudGameImplementation = "web" | "native"

/** 原生客户端部署阶段，用于界面展示进度文案。 */
export type CloudGameNativePhase = "idle" | "checking" | "downloading" | "deploying" | "launching"

/** 云游戏实现方式在 localStorage 中的键名。 */
const CLOUDGAME_IMPLEMENTATION_KEY = "cloudgame.implementation"

let pageLoadUnlistenFn: UnlistenFn | null = null
let windowStateUnlistenFn: UnlistenFn | null = null
let cloudGameListenerReady = false

/**
 * 判断当前是否在桌面端主窗口中运行，避免在子窗口重复初始化全局监听。
 * @returns 是否允许初始化全局云游戏监听
 */
function canInitCloudGameTracking() {
    return env.isApp && getCurrentWindow().label === "main"
}

export const useCloudGameStore = defineStore("cloudgame", {
    state: () => ({
        initialized: false,
        opening: false,
        implementation: "web" as CloudGameImplementation,
        nativePhase: "idle" as CloudGameNativePhase,
        nativeProgress: 0,
        windowState: null as CloudGameWindowState | null,
        lastPageLoadPayload: null as CloudGamePageLoadPayload | null,
    }),
    getters: {
        isWindowOpen: state => Boolean(state.windowState),
        isNativeBusy: state => state.opening && state.implementation === "native",
    },
    actions: {
        /**
         * 切换云游戏实现方式并持久化，供启动器下拉选择与脚本页按钮共用。
         * @param implementation 目标实现方式
         */
        setImplementation(implementation: CloudGameImplementation) {
            this.implementation = implementation
            if (typeof localStorage !== "undefined") {
                localStorage.setItem(CLOUDGAME_IMPLEMENTATION_KEY, implementation)
            }
        },

        /**
         * 从 localStorage 恢复上次选择的云游戏实现方式。
         */
        restoreImplementation() {
            if (typeof localStorage === "undefined") return
            const stored = localStorage.getItem(CLOUDGAME_IMPLEMENTATION_KEY)
            if (stored === "web" || stored === "native") {
                this.implementation = stored
            }
        },

        /**
         * 应用云游戏窗口状态。
         * @param windowState 最新窗口状态
         */
        applyWindowState(windowState: CloudGameWindowState | null) {
            this.windowState = windowState
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

            this.restoreImplementation()

            if (cloudGameListenerReady) {
                this.initialized = true
                await this.syncWindowStateFromBackend()
                return
            }

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
        },

        /**
         * 打开或复用云游戏窗口。
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
            } catch (error) {
                console.error("打开云游戏窗口失败", error)
                ui.showErrorMessage(`打开云游戏窗口失败: ${error instanceof Error ? error.message : String(error)}`)
                throw error
            } finally {
                this.opening = false
            }
        },

        /**
         * 启动原生云游戏客户端；本地未部署当前版本时先下载并解压。
         */
        async launchNativeCloudGame() {
            const ui = useUIStore()
            if (this.opening) return
            this.opening = true
            this.nativePhase = "checking"
            this.nativeProgress = 0
            try {
                const paths = await resolveCloudgameNativePaths()
                if (!(await isCloudgameNativeInstalled(paths))) {
                    this.nativePhase = "downloading"
                    await downloadCloudgameNative(paths, event => {
                        this.nativeProgress = event.progress
                    })
                    this.nativePhase = "deploying"
                    await installCloudgameNative(paths)
                }
                this.nativePhase = "launching"
                const launched = (await launchNormal(paths.exePath, "")) as unknown as boolean
                if (launched === false) {
                    throw new Error("ShellExecute failed")
                }
            } catch (error) {
                console.error("启动原生云游戏客户端失败", error)
                ui.showErrorMessage(
                    t("game-launcher.cloudGameNativeFailed", {
                        error: error instanceof Error ? error.message : String(error),
                    })
                )
            } finally {
                this.opening = false
                this.nativePhase = "idle"
                this.nativeProgress = 0
            }
        },

        /**
         * 聚焦已存在的云游戏窗口；不存在时退化为直接打开。
         */
        async openOrFocusCloudGame() {
            if (this.implementation === "native" && env.isApp) {
                await this.launchNativeCloudGame()
                return
            }
            await this.syncWindowStateFromBackend()
            if (this.windowState) {
                const nextState = await focusCloudGameWindow()
                this.applyWindowState(nextState ?? null)
                if (!nextState) {
                    await this.openCloudGame()
                }
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
            pageLoadUnlistenFn?.()
            windowStateUnlistenFn?.()
            pageLoadUnlistenFn = null
            windowStateUnlistenFn = null
            cloudGameListenerReady = false
            this.initialized = false
        },
    },
})
