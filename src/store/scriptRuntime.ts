import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { defineStore } from "pinia"
import { getScriptRuntimeInfo, type ScriptRuntimeInfo, stopScript, stopScriptByPath } from "@/api/app"

type ScriptRunningMode = "single" | "scheduler" | null

let runtimeUnlistenFn: UnlistenFn | null = null
let runtimeListenerReady = false

/**
 * 从脚本路径中提取文件名。
 * @param scriptPath 脚本完整路径
 * @returns 文件名
 */
function getScriptFileNameFromPath(scriptPath: string): string {
    return (
        String(scriptPath ?? "")
            .split(/[\\/]/)
            .filter(Boolean)
            .pop() ?? ""
    )
}

export const useScriptRuntimeStore = defineStore("script-runtime", {
    state: () => ({
        isRunning: false,
        runningMode: null as ScriptRunningMode,
        runningScriptName: "",
        runningScriptCount: 0,
        runningScriptPaths: [] as string[],
        runningStartedAt: 0,
        schedulerStopRequested: false,
    }),
    actions: {
        /**
         * 标记脚本开始运行。
         * @param scriptName 脚本名称
         * @param options 附加选项
         */
        markRunningScript(
            scriptName: string,
            options: {
                count?: number
                keepSchedulerMode?: boolean
            } = {}
        ) {
            if (!this.isRunning) {
                this.runningStartedAt = Date.now()
            }
            this.isRunning = true
            if (!(options.keepSchedulerMode && this.runningMode === "scheduler")) {
                this.runningMode = "single"
            }
            this.runningScriptName = String(scriptName ?? "").trim()
            this.runningScriptCount = Math.max(1, Number(options.count ?? 1))
        },

        /**
         * 标记调度器开始运行。
         */
        markSchedulerRunning() {
            if (!this.isRunning) {
                this.runningStartedAt = Date.now()
            }
            this.isRunning = true
            this.runningMode = "scheduler"
            this.runningScriptCount = Math.max(1, this.runningScriptCount || 1)
        },

        /**
         * 请求停止调度器。
         */
        requestSchedulerStop() {
            this.schedulerStopRequested = true
        },

        /**
         * 清理调度器停止请求状态。
         */
        clearSchedulerStopRequest() {
            this.schedulerStopRequested = false
        },

        /**
         * 清空运行状态。
         */
        clearRunningState() {
            this.isRunning = false
            this.runningMode = null
            this.runningScriptName = ""
            this.runningScriptCount = 0
            this.runningScriptPaths = []
            this.runningStartedAt = 0
        },

        /**
         * 用后端运行信息刷新前端状态。
         * @param runtimeInfo 后端运行信息
         */
        applyBackendRuntimeInfo(runtimeInfo: ScriptRuntimeInfo) {
            const normalizedPaths = Array.isArray(runtimeInfo.scriptPaths)
                ? runtimeInfo.scriptPaths.map(path => String(path ?? "").trim()).filter(path => path.length > 0)
                : []
            this.runningScriptPaths = normalizedPaths

            const normalizedCount = Number(runtimeInfo.runningCount ?? 0)
            const hasRunningScripts = Boolean(runtimeInfo.running) && normalizedPaths.length > 0 && normalizedCount > 0
            if (hasRunningScripts) {
                if (!this.isRunning) {
                    this.runningStartedAt = Date.now()
                }
                this.isRunning = true
                if (this.runningMode !== "scheduler") {
                    this.runningMode = "single"
                }
                this.runningScriptCount = normalizedCount
                this.runningScriptName = getScriptFileNameFromPath(normalizedPaths[0] ?? "")
                return
            }

            if (this.runningMode === "single") {
                this.runningMode = null
            }
            if (this.runningMode !== "scheduler") {
                this.clearRunningState()
            }
        },

        /**
         * 主动向后端同步当前脚本运行态。
         */
        async syncRunningStateFromBackend() {
            const runtimeInfo = await getScriptRuntimeInfo()
            this.applyBackendRuntimeInfo(runtimeInfo)
        },

        /**
         * 初始化全局脚本运行态监听，仅初始化一次。
         */
        async initRuntimeTracking() {
            if (runtimeListenerReady) {
                await this.syncRunningStateFromBackend()
                return
            }

            runtimeUnlistenFn = await listen<ScriptRuntimeInfo>("script-runtime-updated", event => {
                if (!event?.payload) return
                this.applyBackendRuntimeInfo(event.payload)
            })
            runtimeListenerReady = true
            await this.syncRunningStateFromBackend()
        },

        /**
         * 向后端发送停止所有脚本请求。
         */
        async stopAllScripts() {
            await stopScript()
        },

        /**
         * 按路径停止指定脚本实例。
         * @param scriptPath 脚本完整路径
         */
        async stopScriptByFilePath(scriptPath: string) {
            await stopScriptByPath(scriptPath)
        },

        /**
         * 释放全局监听（仅用于测试或热重载场景）。
         */
        disposeRuntimeTracking() {
            if (runtimeUnlistenFn) {
                runtimeUnlistenFn()
                runtimeUnlistenFn = null
            }
            runtimeListenerReady = false
        },
    },
})
