import * as VueUseCore from "@vueuse/core"
import { unzipSync } from "fflate"
import * as I18NextVue from "i18next-vue"
import type { Component } from "vue"
import * as Vue from "vue"
import { markRaw, reactive } from "vue"
import { builtinActions } from "./builtin"
import { registerAction, unregisterAction } from "./bus"
import * as DobHost from "./host"
import type { ActionDef, PluginAccount } from "./types"

/** 插件设置界面（按插件 id，仅已安装的才有，响应式）。 */
export const pluginSettings = reactive<Record<string, Component>>({})
/** 插件展示名（按插件 id，缺省为 id 本身）。 */
export const pluginTitles = reactive<Record<string, string>>({})
/** 插件账号能力（仅已安装且提供的才有）。 */
export const pluginAccounts = reactive<Record<string, PluginAccount>>({})
/** 已安装插件元数据（持久化，响应式）。 */
export const installedPlugins = reactive<Record<string, InstalledPlugin>>({})
/** 可发现插件清单（市场列表，只做展示，不下载，响应式）。 */
export const availablePlugins = reactive<RemotePluginEntry[]>([])

export interface InstalledPlugin {
    id: string
    version: string
    kind: string
    title?: string
    desc?: string
    hasSettings: boolean
    file: string
    sha256: string
    js: string
    actionIds: string[]
}

/** 宿主注入表：bundle 里的 require("...") 只允许命中这些。 */
function hostRequire(spec: string): unknown {
    switch (spec) {
        case "@dob/host":
            return DobHost
        case "vue":
            return Vue
        case "i18next-vue":
            return I18NextVue
        case "@vueuse/core":
            return VueUseCore
        default:
            throw new Error(`未知宿主模块: ${spec}`)
    }
}

interface BundleExports {
    __dob_plugin?: {
        def?: ActionDef
        account?: PluginAccount
        settings?: Component
    }
}

function executeBundle(pluginId: string, code: string): BundleExports["__dob_plugin"] {
    const module = { exports: {} as Record<string, unknown> }
    const requireShim = (spec: string): unknown => hostRequire(spec)
    const runner = new Function("require", "module", "exports", code) as (
        require: (spec: string) => unknown,
        module: { exports: Record<string, unknown> },
        exports: Record<string, unknown>
    ) => void
    runner(requireShim, module, module.exports)
    const plugin = (module.exports as BundleExports).__dob_plugin
    if (!plugin || typeof plugin !== "object") throw new Error(`${pluginId}: bundle 未导出 __dob_plugin`)
    return plugin
}

export interface RemotePluginEntry {
    id: string
    version: string
    kind: string
    title?: string
    desc?: string
    hasSettings: boolean
    file: string
    size: number
    sha256: string
    url?: string
}

async function indexUrls(): Promise<string[]> {
    if (import.meta.env.DEV) return [`/mock/plugins/plugins.json`]
    const { resolveCdnUrls } = await import("@/utils/cdn")
    const { primary, backup } = resolveCdnUrls("plugins/plugins.json")
    return [primary, backup]
}

async function fileUrls(file: string): Promise<string[]> {
    if (import.meta.env.DEV) return [`/mock/plugins/${file}`]
    const { resolveCdnUrls } = await import("@/utils/cdn")
    const { primary, backup } = resolveCdnUrls(`plugins/${file}`)
    return [primary, backup]
}

async function fetchFirst(urls: string[]): Promise<Response> {
    let lastError = ""
    for (const url of urls) {
        try {
            const response = await fetch(url)
            if (response.ok) return response
            lastError = `${url}: ${response.status}`
        } catch (error) {
            lastError = `${url}: ${error instanceof Error ? error.message : String(error)}`
        }
    }
    throw new Error(`拉取失败: ${lastError}`)
}

/**
 * 拉取可发现插件清单（只读索引不下载包体；市场列表用）。
 * 失败时保持旧列表并抛错，由调用方提示。
 */
export async function refreshAvailable(): Promise<RemotePluginEntry[]> {
    const response = await fetchFirst(await indexUrls())
    const index = (await response.json()) as RemotePluginEntry[]
    availablePlugins.splice(0, availablePlugins.length, ...index)
    for (const item of index) {
        if (!(item.id in pluginTitles)) pluginTitles[item.id] = item.title ?? item.id
    }
    return index
}

/** 从 zip 包解出 bundle 文本（包内须含 `<id>.js`）。 */
export async function extractBundle(id: string, zip: Uint8Array): Promise<string> {
    const entries = unzipSync(zip)
    const js = entries[`${id}.js`]
    if (!js) throw new Error(`${id}: zip 内缺少 ${id}.js`)
    return new TextDecoder().decode(js)
}

async function sha256Hex(data: Uint8Array): Promise<string | null> {
    try {
        const digest = await crypto.subtle.digest("SHA-256", data as BufferSource)
        return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("")
    } catch {
        return null
    }
}

const STORAGE_KEY = "setting_automation_installed"
const memFallback = new Map<string, string>()

function storageGet(key: string): string | null {
    try {
        return localStorage.getItem(key)
    } catch {
        return memFallback.get(key) ?? null
    }
}

function storageSet(key: string, value: string): void {
    try {
        localStorage.setItem(key, value)
    } catch {
        memFallback.set(key, value)
    }
}

function storageDel(key: string): void {
    try {
        localStorage.removeItem(key)
    } catch {
        memFallback.delete(key)
    }
}

function readInstalled(): Record<string, InstalledPlugin> {
    try {
        const raw = storageGet(STORAGE_KEY)
        if (!raw) return {}
        const parsed: unknown = JSON.parse(raw)
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {}
        return parsed as Record<string, InstalledPlugin>
    } catch {
        return {}
    }
}

function applyInstalled(plugin: InstalledPlugin): void {
    installedPlugins[plugin.id] = plugin
    pluginTitles[plugin.id] = plugin.title ?? plugin.id
}

function activateBundle(id: string, code: string): string[] {
    const bundle = executeBundle(id, code)
    if (typeof bundle?.def?.execute !== "function") {
        throw new Error(`${id}: bundle 未导出合法 ActionDef`)
    }
    if (typeof bundle.def.id !== "string" || !bundle.def.id.startsWith(`${id}.`)) {
        throw new Error(`${id}: 动作 id "${String(bundle.def.id)}" 与插件 id 不符`)
    }
    registerAction(bundle.def)
    if (bundle.account) pluginAccounts[id] = bundle.account
    if (bundle.settings) pluginSettings[id] = markRaw(bundle.settings)
    return [bundle.def.id]
}

function deactivatePlugin(id: string, actionIds: string[]): void {
    for (const actionId of actionIds) unregisterAction(actionId)
    delete pluginSettings[id]
    delete pluginAccounts[id]
    delete installedPlugins[id]
}

/**
 * 手动安装插件：拉 zip → 校验哈希 → 解包执行 → 落盘。
 * 已安装的同版本直接返回（幂等），新版本覆盖更新。
 */
export async function installPlugin(id: string): Promise<InstalledPlugin> {
    const index = availablePlugins.length > 0 ? [...availablePlugins] : await refreshAvailable()
    const entry = index.find(item => item.id === id)
    if (!entry) throw new Error(`插件 ${id} 不在可发现清单中`)
    const response = await fetchFirst(await fileUrls(entry.file))
    const bytes = new Uint8Array(await response.arrayBuffer())
    const hash = await sha256Hex(bytes)
    if (hash && hash !== entry.sha256) throw new Error(`插件 ${id} 校验失败（sha256 不符）`)
    const code = await extractBundle(id, bytes)
    const existed = installedPlugins[id]
    if (existed) deactivatePlugin(id, existed.actionIds)
    const actionIds = activateBundle(id, code)
    const installed: InstalledPlugin = {
        id: entry.id,
        version: entry.version,
        kind: entry.kind,
        title: entry.title,
        desc: entry.desc,
        hasSettings: entry.hasSettings,
        file: entry.file,
        sha256: entry.sha256,
        js: code,
        actionIds,
    }
    applyInstalled(installed)
    persistInstalled()
    return installed
}

/** 卸载插件：注销动作并删持久化（规则保留，再次触发时报动作缺失）。 */
export function uninstallPlugin(id: string): void {
    const existed = installedPlugins[id]
    if (!existed) return
    deactivatePlugin(id, existed.actionIds)
    persistInstalled()
}

function persistInstalled(): void {
    storageSet(STORAGE_KEY, JSON.stringify(installedPlugins))
}

/** 测试/调试用：清空全部运行时状态（不碰持久化标记以外的任何东西）。 */
export function __resetPluginsForTests(): void {
    for (const key of Object.keys(pluginSettings)) delete pluginSettings[key]
    for (const key of Object.keys(pluginTitles)) delete pluginTitles[key]
    for (const key of Object.keys(pluginAccounts)) delete pluginAccounts[key]
    for (const key of Object.keys(installedPlugins)) delete installedPlugins[key]
    availablePlugins.splice(0)
    storageDel(STORAGE_KEY)
    loading = null
}

let loading: Promise<void> | null = null

/**
 * 启动时恢复已安装插件（只读本地不联网）。
 * 规则派发前调用确保动作已注册；市场列表需另调 refreshAvailable。
 */
export function ensurePluginsLoaded(): Promise<void> {
    if (!loading) {
        loading = (async () => {
            for (const builtin of builtinActions) registerAction(builtin)
            const stored = readInstalled()
            for (const plugin of Object.values(stored)) {
                try {
                    const actionIds = activateBundle(plugin.id, plugin.js)
                    applyInstalled({ ...plugin, actionIds })
                } catch (error) {
                    console.warn(`[automation] 已安装插件 ${plugin.id} 恢复失败:`, error)
                }
            }
        })().catch(error => {
            console.warn("[automation] 插件恢复失败:", error)
        })
    }
    return loading
}
