import { ref } from "vue"
import type { DataPackModuleRecord } from "./data-pack"

type DataPackFallbackKind = "array" | "object" | "map" | "undefined"

type DataPackBindingSetter = (value: unknown) => void

type DataPackBindingEntry = {
    fallbackKind: DataPackFallbackKind
    setter: DataPackBindingSetter
}

const bindingRegistry = new Map<string, Map<string, DataPackBindingEntry>>()
const hydrationCallbacks = new Set<() => void>()
let hydrated = false

/**
 * 标记数据包水合完成的全局刷新计数。
 */
export const dataPackHydrationKey = ref(0)

/**
 * 标记数据包是否仍在启动加载中。
 */
export const dataPackBootstrapLoading = ref(false)

/**
 * 创建数据包导出绑定的空值。
 * @param fallbackKind 空值类型
 * @returns 对应空值
 */
function createFallbackValue(fallbackKind: DataPackFallbackKind): unknown {
    if (fallbackKind === "array") return []
    if (fallbackKind === "object") return {}
    if (fallbackKind === "map") return new Map()
    return undefined
}

/**
 * 注册一个可回填的数据包导出绑定。
 * @param moduleKey 模块键
 * @param exportName 导出名
 * @param fallbackKind 空值类型
 * @param setter 赋值器
 */
export function registerDataPackBinding(
    moduleKey: string,
    exportName: string,
    fallbackKind: DataPackFallbackKind,
    setter: DataPackBindingSetter
): void {
    let moduleBindings = bindingRegistry.get(moduleKey)
    if (!moduleBindings) {
        moduleBindings = new Map()
        bindingRegistry.set(moduleKey, moduleBindings)
    }

    moduleBindings.set(exportName, {
        fallbackKind,
        setter,
    })
}

/**
 * 回填指定模块的所有已注册导出。
 * @param moduleKey 模块键
 * @param moduleRecord 模块导出记录
 */
export function hydrateRegisteredDataPackBindings(moduleKey: string, moduleRecord: DataPackModuleRecord): void {
    const moduleBindings = bindingRegistry.get(moduleKey)
    if (!moduleBindings) {
        return
    }

    for (const [exportName, entry] of moduleBindings) {
        if (Object.hasOwn(moduleRecord, exportName)) {
            entry.setter(moduleRecord[exportName])
        } else {
            entry.setter(createFallbackValue(entry.fallbackKind))
        }
    }
}

/**
 * 重置所有已注册导出为空值。
 */
export function resetRegisteredDataPackBindings(): void {
    for (const moduleBindings of bindingRegistry.values()) {
        for (const entry of moduleBindings.values()) {
            entry.setter(createFallbackValue(entry.fallbackKind))
        }
    }
}

/**
 * 标记数据包完成一次水合。
 */
export function markDataPackHydrated(): void {
    hydrated = true
    dataPackHydrationKey.value += 1
    for (const callback of hydrationCallbacks) {
        callback()
    }
}

/**
 * 注册数据包完成水合后的回调。
 * @param callback 回调
 */
export function registerDataPackHydrationCallback(callback: () => void): void {
    hydrationCallbacks.add(callback)
    if (hydrated) {
        callback()
    }
}

/**
 * 判断数据包是否已经完成过一次水合。
 * @returns 是否已水合
 */
export function isDataPackHydrated(): boolean {
    return hydrated
}
