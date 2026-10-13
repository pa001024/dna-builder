import { ref } from "vue"
import { applyVersionGate, type VersionedItem } from "@/data/versionGate"
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

export const dataPackHydrationKey = ref(0)

export const dataPackBootstrapLoading = ref(false)

function createFallbackValue(fallbackKind: DataPackFallbackKind): unknown {
    if (fallbackKind === "array") return []
    if (fallbackKind === "object") return {}
    if (fallbackKind === "map") return new Map()
    return undefined
}

/**
 * 数据包水合时重放版本门限 rebuildStaticIndexes
 */
function applyVersionGateToPackedValue(value: unknown): unknown {
    if (Array.isArray(value)) {
        return applyVersionGate(value as VersionedItem[])
    }
    return value
}

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

export function hydrateRegisteredDataPackBindings(moduleKey: string, moduleRecord: DataPackModuleRecord): void {
    const moduleBindings = bindingRegistry.get(moduleKey)
    if (!moduleBindings) {
        return
    }

    for (const [exportName, entry] of moduleBindings) {
        if (Object.hasOwn(moduleRecord, exportName)) {
            entry.setter(applyVersionGateToPackedValue(moduleRecord[exportName]))
        } else {
            entry.setter(createFallbackValue(entry.fallbackKind))
        }
    }
}

export function resetRegisteredDataPackBindings(): void {
    for (const moduleBindings of bindingRegistry.values()) {
        for (const entry of moduleBindings.values()) {
            entry.setter(createFallbackValue(entry.fallbackKind))
        }
    }
}

export function getRegisteredDataPackModuleKeys(): string[] {
    return [...bindingRegistry.keys()]
}

export function replaceRegisteredDataPackBindings(moduleRecords: ReadonlyMap<string, DataPackModuleRecord>): void {
    resetRegisteredDataPackBindings()
    for (const [moduleKey, moduleRecord] of moduleRecords) {
        hydrateRegisteredDataPackBindings(moduleKey, moduleRecord)
    }
    markDataPackHydrated()
}

export function markDataPackHydrated(): void {
    hydrated = true
    dataPackHydrationKey.value += 1
    for (const callback of hydrationCallbacks) {
        callback()
    }
}

export function registerDataPackHydrationCallback(callback: () => void): void {
    hydrationCallbacks.add(callback)
    if (hydrated) {
        callback()
    }
}

export function isDataPackHydrated(): boolean {
    return hydrated
}

export function isDataAvailable(): boolean {
    return hydrated || isDataPackRewriteDisabled()
}

export function isDataPackRewriteDisabled(): boolean {
    return bindingRegistry.size === 0
}
