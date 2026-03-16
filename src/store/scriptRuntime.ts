import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { defineStore } from "pinia"
import { getScriptRuntimeInfo, resolveScriptConfigRequest, type ScriptRuntimeInfo, stopScript, stopScriptByPath } from "@/api/app"

type ScriptRunningMode = "single" | "scheduler" | null
type ScriptConfigKind = "number" | "string" | "select" | "multi-select" | "boolean"
type ScriptConfigValue = string | number | boolean | string[]
export type ScriptRuntimeSidePanelTab = "status" | "config"

interface ScriptReadConfigPayload {
    requestId: string
    scope?: string
    name: string
    desc: string
    kind: ScriptConfigKind
    options?: string[]
    defaultValue?: ScriptConfigValue
}

interface ScriptSetConfigPayload {
    scope?: string
    name: string
    value: unknown
}

interface ScriptConfigItem {
    name: string
    desc: string
    kind: ScriptConfigKind
    options: string[]
    value: ScriptConfigValue
    defaultValue: ScriptConfigValue
    updatedAt: number
}

const SCRIPT_CONFIG_STORAGE_KEY = "script-runtime-config-v1"

/**
 * 脚本控制台日志项。
 */
export interface ScriptConsoleLog {
    scope?: string
    level: string
    message: string
    timestamp: number
}

/**
 * 脚本状态项（文本/图片）。
 */
export interface ScriptStatusItem {
    scope?: string
    title: string
    text?: string
    image?: string
    images?: string[]
    timestamp: number
}

let runtimeUnlistenFn: UnlistenFn | null = null
let consoleUnlistenFn: UnlistenFn | null = null
let statusUnlistenFn: UnlistenFn | null = null
let readConfigUnlistenFn: UnlistenFn | null = null
let setConfigUnlistenFn: UnlistenFn | null = null
let runtimeListenerReady = false
let consoleListenerReady = false
let statusListenerReady = false
let readConfigListenerReady = false
let setConfigListenerReady = false

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

/**
 * 规范化脚本事件作用域，统一路径分隔符与大小写。
 * @param scope 原始作用域
 * @returns 规范化后的作用域；空值返回 undefined
 */
function normalizeScriptEventScope(scope?: string | null): string | undefined {
    const normalized = String(scope ?? "")
        .trim()
        .replace(/\//g, "\\")
        .toLowerCase()
    return normalized || undefined
}

/**
 * 规整脚本配置选项列表。
 * @param options 原始选项
 * @returns 清洗后的选项数组
 */
function normalizeScriptConfigOptions(options: unknown): string[] {
    if (!Array.isArray(options)) return []
    const seen = new Set<string>()
    const normalized: string[] = []
    for (const option of options) {
        const text = String(option ?? "").trim()
        if (!text || seen.has(text)) continue
        seen.add(text)
        normalized.push(text)
    }
    return normalized
}

/**
 * 按配置类型规整配置值。
 * @param kind 配置类型
 * @param rawValue 原始值
 * @param defaultValue 默认值
 * @param options select/multi-select 选项
 * @returns 规整后的值
 */
function normalizeScriptConfigValue(
    kind: ScriptConfigKind,
    rawValue: unknown,
    defaultValue: ScriptConfigValue,
    options: string[]
): ScriptConfigValue {
    if (kind === "multi-select") {
        const fallback = Array.isArray(defaultValue) ? defaultValue : []
        const candidates = Array.isArray(rawValue) ? rawValue : rawValue === undefined || rawValue === null ? fallback : [rawValue]
        const seen = new Set<string>()
        const normalized: string[] = []
        for (const candidate of candidates) {
            const text = String(candidate ?? "").trim()
            if (!text || seen.has(text)) continue
            if (options.length > 0 && !options.includes(text)) continue
            seen.add(text)
            normalized.push(text)
        }
        return normalized
    }

    if (kind === "number") {
        const numeric = typeof rawValue === "number" ? rawValue : Number(rawValue)
        if (Number.isFinite(numeric)) {
            return numeric
        }
        return typeof defaultValue === "number" ? defaultValue : 0
    }
    if (kind === "boolean") {
        if (typeof rawValue === "boolean") return rawValue
        if (typeof rawValue === "number") return rawValue !== 0
        const text = String(rawValue ?? "")
            .trim()
            .toLowerCase()
        return ["1", "true", "yes", "y", "on"].includes(text)
    }

    const text = String(rawValue ?? "")
    if (kind === "select" && options.length > 0) {
        if (options.includes(text)) {
            return text
        }
        if (typeof defaultValue === "string" && options.includes(defaultValue)) {
            return defaultValue
        }
        return options[0]
    }
    return text
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
        showConsole: false,
        showStatusPanel: false,
        sidePanelTab: "status" as ScriptRuntimeSidePanelTab,
        consoleLogs: [] as ScriptConsoleLog[],
        scriptStatuses: [] as ScriptStatusItem[],
        lastEventAt: 0,
        activeConfigScope: "",
        scriptConfigStore: {} as Record<string, Record<string, ScriptConfigItem>>,
    }),
    actions: {
        /**
         * 更新最近一次脚本事件时间戳。
         */
        touchScriptEvent() {
            this.lastEventAt = Date.now()
        },

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
         * 追加一条控制台日志。
         * @param level 日志级别
         * @param message 日志内容
         */
        appendConsoleLog(level: string, message: string) {
            this.consoleLogs.push({
                scope: undefined,
                level,
                message,
                timestamp: Date.now(),
            })
        },

        /**
         * 追加一条来自后端事件的控制台日志。
         * @param payload 控制台事件负载
         */
        appendConsoleEvent(payload: { scope?: string; level?: string; message?: string }) {
            const message = String(payload.message ?? "")
            if (!message) return
            this.touchScriptEvent()
            this.consoleLogs.push({
                scope: normalizeScriptEventScope(payload.scope),
                level: String(payload.level ?? "info"),
                message,
                timestamp: Date.now(),
            })
        },

        /**
         * 清空控制台日志。
         */
        clearConsoleLogs() {
            this.consoleLogs = []
        },

        /**
         * 按作用域清空控制台日志。
         * @param scope 作用域
         */
        clearConsoleLogsByScope(scope?: string) {
            const normalizedScope = normalizeScriptEventScope(scope)
            if (!normalizedScope) {
                return
            }
            this.consoleLogs = this.consoleLogs.filter(item => normalizeScriptEventScope(item.scope) !== normalizedScope)
        },

        /**
         * 按“当前可见”语义清空控制台日志。
         * @param scope 当前脚本作用域
         * @param includeGlobal 是否同时清理无作用域日志
         */
        clearConsoleLogsForScope(scope?: string, includeGlobal = true) {
            const normalizedScope = normalizeScriptEventScope(scope)
            this.consoleLogs = this.consoleLogs.filter(item => {
                const itemScope = normalizeScriptEventScope(item.scope)
                if (normalizedScope && itemScope === normalizedScope) {
                    return false
                }
                if (includeGlobal && !itemScope) {
                    return false
                }
                return true
            })
        },

        /**
         * 按标题移除指定脚本状态。
         * @param title 状态标题
         */
        removeScriptStatus(title: string, scope?: string) {
            const normalizedTitle = String(title ?? "").trim()
            if (!normalizedTitle) return
            const normalizedScope = normalizeScriptEventScope(scope) ?? ""
            const index = this.scriptStatuses.findIndex(item => (item.scope ?? "") === normalizedScope && item.title === normalizedTitle)
            if (index >= 0) {
                this.scriptStatuses.splice(index, 1)
            }
        },

        /**
         * 新增或更新脚本状态。
         * @param status 脚本状态
         */
        upsertScriptStatus(status: ScriptStatusItem) {
            const normalizedTitle = String(status.title ?? "").trim()
            if (!normalizedTitle) return
            const nextStatus: ScriptStatusItem = {
                ...status,
                scope: normalizeScriptEventScope(status.scope),
                title: normalizedTitle,
            }
            const normalizedScope = nextStatus.scope ?? ""
            const index = this.scriptStatuses.findIndex(item => (item.scope ?? "") === normalizedScope && item.title === normalizedTitle)
            if (index >= 0) {
                this.scriptStatuses[index] = nextStatus
                return
            }
            this.scriptStatuses.push(nextStatus)
        },

        /**
         * 处理来自后端的脚本状态事件。
         * @param payload 状态事件负载
         */
        applyScriptStatusEvent(payload: {
            scope?: string
            action?: "upsert" | "remove"
            title?: string
            text?: string
            image?: string
            images?: string[]
            timestamp?: number
        }) {
            const normalizedTitle = String(payload.title ?? "").trim()
            if (!normalizedTitle) return
            this.touchScriptEvent()
            const normalizedScope = normalizeScriptEventScope(payload.scope)
            if (payload.action === "remove") {
                this.removeScriptStatus(normalizedTitle, normalizedScope)
                return
            }

            const normalizedImages = Array.isArray(payload.images)
                ? payload.images.filter(item => typeof item === "string" && item.trim().length > 0)
                : []
            const normalizedImage = typeof payload.image === "string" && payload.image.trim().length > 0 ? payload.image : undefined
            if (normalizedImages.length === 0 && normalizedImage) {
                normalizedImages.push(normalizedImage)
            }

            if (!payload.text && normalizedImages.length === 0) {
                this.removeScriptStatus(normalizedTitle, normalizedScope)
                return
            }

            this.upsertScriptStatus({
                scope: normalizedScope,
                title: normalizedTitle,
                text: payload.text,
                image: normalizedImages[0],
                images: normalizedImages,
                timestamp: payload.timestamp ?? Date.now(),
            })
        },

        /**
         * 持久化脚本配置项。
         */
        persistScriptConfigItems() {
            localStorage.setItem(SCRIPT_CONFIG_STORAGE_KEY, JSON.stringify(this.scriptConfigStore))
        },

        /**
         * 解析脚本配置作用域，兼容路径与文件名混用。
         * @param scope 原始作用域
         * @param fallbackScope 兜底作用域
         * @returns 实际存储键
         */
        resolveStoredScriptConfigScope(scope?: string | null, fallbackScope?: string | null): string {
            const normalizedScope = normalizeScriptEventScope(scope) ?? normalizeScriptEventScope(fallbackScope)
            if (!normalizedScope) return ""
            const fileName = getScriptFileNameFromPath(normalizedScope) || normalizedScope
            const lowerScope = fileName.toLowerCase()
            const matchedScope = Object.keys(this.scriptConfigStore).find(key => {
                const normalizedKey = getScriptFileNameFromPath(key) || key
                return normalizedKey.toLowerCase() === lowerScope
            })
            return matchedScope ?? fileName
        },

        /**
         * 从本地存储加载脚本配置项。
         */
        loadScriptConfigItems() {
            const stored = localStorage.getItem(SCRIPT_CONFIG_STORAGE_KEY)
            if (!stored) {
                this.scriptConfigStore = {}
                return
            }

            try {
                const parsed = JSON.parse(stored) as Record<string, Record<string, Partial<ScriptConfigItem>>>
                const normalizedStore: Record<string, Record<string, ScriptConfigItem>> = {}
                for (const [scope, items] of Object.entries(parsed ?? {})) {
                    const scopeKey = this.resolveStoredScriptConfigScope(scope)
                    if (!scopeKey || !items || typeof items !== "object") continue
                    const scopeItems: Record<string, ScriptConfigItem> = {
                        ...(normalizedStore[scopeKey] ?? {}),
                    }
                    for (const [name, item] of Object.entries(items as Record<string, Partial<ScriptConfigItem>>)) {
                        if (!item || typeof item !== "object") continue
                        const normalizedName = String(name ?? "").trim()
                        if (!normalizedName) continue
                        const kind: ScriptConfigKind = ["number", "string", "select", "multi-select", "boolean"].includes(String(item.kind))
                            ? (item.kind as ScriptConfigKind)
                            : "string"
                        const options = normalizeScriptConfigOptions(item.options)
                        const fallbackDefaultValue: ScriptConfigValue =
                            kind === "number" ? 0 : kind === "boolean" ? false : kind === "multi-select" ? [] : ""
                        const defaultValue = normalizeScriptConfigValue(kind, item.defaultValue, fallbackDefaultValue, options)
                        const value = normalizeScriptConfigValue(kind, item.value, defaultValue, options)
                        scopeItems[normalizedName] = {
                            name: normalizedName,
                            desc: String(item.desc ?? ""),
                            kind,
                            options,
                            value,
                            defaultValue,
                            updatedAt: typeof item.updatedAt === "number" ? item.updatedAt : Date.now(),
                        }
                    }
                    normalizedStore[scopeKey] = scopeItems
                }
                this.scriptConfigStore = normalizedStore
            } catch (error) {
                console.error("加载脚本配置失败", error)
                this.scriptConfigStore = {}
            }
        },

        /**
         * 根据 readConfig 请求创建或更新配置项，并返回当前值。
         * @param payload readConfig 事件负载
         * @param fallbackScope 页面侧兜底作用域
         * @returns 当前配置值
         */
        upsertScriptConfigFromRequest(payload: ScriptReadConfigPayload, fallbackScope?: string | null): ScriptConfigValue {
            this.touchScriptEvent()
            const explicitScope = normalizeScriptEventScope(payload.scope)
            const scope = explicitScope
                ? this.resolveStoredScriptConfigScope(
                      payload.scope,
                      fallbackScope ?? this.activeConfigScope ?? this.runningScriptPaths[0] ?? this.runningScriptName
                  )
                : ""
            const normalizedName = String(payload.name ?? "").trim()
            const kind: ScriptConfigKind = ["number", "string", "select", "multi-select", "boolean"].includes(String(payload.kind))
                ? payload.kind
                : "string"
            const options = normalizeScriptConfigOptions(payload.options)
            const fallbackDefaultValue: ScriptConfigValue =
                kind === "number" ? 0 : kind === "boolean" ? false : kind === "multi-select" ? [] : ""
            const defaultValue = normalizeScriptConfigValue(kind, payload.defaultValue, fallbackDefaultValue, options)
            if (!scope || !normalizedName) {
                return defaultValue
            }

            const scopedItems = this.scriptConfigStore[scope] ?? {}
            const existing = scopedItems[normalizedName]
            const nextValue = normalizeScriptConfigValue(kind, existing?.value ?? defaultValue, defaultValue, options)
            this.scriptConfigStore[scope] = {
                ...scopedItems,
                [normalizedName]: {
                    name: normalizedName,
                    desc: String(payload.desc ?? existing?.desc ?? ""),
                    kind,
                    options,
                    defaultValue,
                    value: nextValue,
                    updatedAt: Date.now(),
                },
            }
            this.activeConfigScope = scope
            this.persistScriptConfigItems()
            return this.scriptConfigStore[scope][normalizedName].value
        },

        /**
         * 处理脚本 setConfig 事件并更新已存在的配置项。
         * @param payload setConfig 事件负载
         * @param fallbackScope 页面侧兜底作用域
         * @returns 是否成功更新
         */
        applyScriptSetConfigFromEvent(payload: ScriptSetConfigPayload, fallbackScope?: string | null): boolean {
            this.touchScriptEvent()
            const explicitScope = normalizeScriptEventScope(payload.scope)
            const scope = explicitScope
                ? this.resolveStoredScriptConfigScope(
                      payload.scope,
                      fallbackScope ?? this.activeConfigScope ?? this.runningScriptPaths[0] ?? this.runningScriptName
                  )
                : ""
            const normalizedName = String(payload.name ?? "").trim()
            if (!scope || !normalizedName) {
                return false
            }

            const scopedItems = this.scriptConfigStore[scope]
            if (!scopedItems) {
                return false
            }
            const matchedName = Object.keys(scopedItems).find(key => key.toLowerCase() === normalizedName.toLowerCase()) ?? normalizedName
            const item = scopedItems[matchedName]
            if (!item) {
                return false
            }

            item.value = normalizeScriptConfigValue(item.kind, payload.value, item.defaultValue, item.options)
            item.updatedAt = Date.now()
            this.activeConfigScope = scope
            this.persistScriptConfigItems()
            return true
        },

        /**
         * 清空全部脚本状态。
         */
        clearScriptStatuses() {
            this.scriptStatuses = []
        },

        /**
         * 按作用域清空脚本状态。
         * @param scope 作用域
         */
        clearScriptStatusesByScope(scope?: string) {
            const normalizedScope = normalizeScriptEventScope(scope)
            if (!normalizedScope) {
                return
            }
            this.scriptStatuses = this.scriptStatuses.filter(item => normalizeScriptEventScope(item.scope) !== normalizedScope)
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
            this.loadScriptConfigItems()
            if (runtimeListenerReady) {
                await this.syncRunningStateFromBackend()
            } else {
                runtimeUnlistenFn = await listen<ScriptRuntimeInfo>("script-runtime-updated", event => {
                    if (!event?.payload) return
                    this.applyBackendRuntimeInfo(event.payload)
                })
                runtimeListenerReady = true
                await this.syncRunningStateFromBackend()
            }

            if (!consoleListenerReady) {
                consoleUnlistenFn = await listen<{ scope?: string; level?: string; message?: string }>("script-console", event => {
                    if (!event?.payload) return
                    this.appendConsoleEvent(event.payload)
                })
                consoleListenerReady = true
            }

            if (!statusListenerReady) {
                statusUnlistenFn = await listen<{
                    scope?: string
                    action?: "upsert" | "remove"
                    title?: string
                    text?: string
                    image?: string
                    images?: string[]
                    timestamp?: number
                }>("script-status", event => {
                    if (!event?.payload) return
                    this.applyScriptStatusEvent(event.payload)
                })
                statusListenerReady = true
            }

            if (!readConfigListenerReady) {
                readConfigUnlistenFn = await listen<ScriptReadConfigPayload>("script-read-config", async event => {
                    const payload = event.payload
                    if (!payload?.requestId || !payload?.name) return
                    const value = this.upsertScriptConfigFromRequest(payload)
                    try {
                        await resolveScriptConfigRequest(payload.requestId, value)
                    } catch (error) {
                        console.error("回传脚本配置失败", error)
                    }
                })
                readConfigListenerReady = true
            }

            if (!setConfigListenerReady) {
                setConfigUnlistenFn = await listen<ScriptSetConfigPayload>("script-set-config", event => {
                    if (!event?.payload?.name) return
                    this.applyScriptSetConfigFromEvent(event.payload)
                })
                setConfigListenerReady = true
            }
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
            if (consoleUnlistenFn) {
                consoleUnlistenFn()
                consoleUnlistenFn = null
            }
            if (statusUnlistenFn) {
                statusUnlistenFn()
                statusUnlistenFn = null
            }
            if (readConfigUnlistenFn) {
                readConfigUnlistenFn()
                readConfigUnlistenFn = null
            }
            if (setConfigUnlistenFn) {
                setConfigUnlistenFn()
                setConfigUnlistenFn = null
            }
            runtimeListenerReady = false
            consoleListenerReady = false
            statusListenerReady = false
            readConfigListenerReady = false
            setConfigListenerReady = false
        },
    },
})
