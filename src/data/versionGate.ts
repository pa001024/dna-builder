export const DNA_CURRENT_VERSION_GLOBAL_KEY = "__DNA_CURRENT_VERSION__"
export const DNA_SAFE_VERSION_LIMIT = 1.3

type VersionedItem = {
    版本?: string
}

type GlobalWithCurrentVersion = typeof globalThis & {
    [DNA_CURRENT_VERSION_GLOBAL_KEY]?: number
}

/**
 * 读取当前允许展示的最高版本号，优先使用全局变量，缺失时回退到本地存储。
 * @returns 当前允许展示的最高版本号
 */
export function getCurrentVersionLimit(): number {
    const globalScope = globalThis as GlobalWithCurrentVersion
    if (typeof globalScope[DNA_CURRENT_VERSION_GLOBAL_KEY] === "number") {
        return globalScope[DNA_CURRENT_VERSION_GLOBAL_KEY]
    }

    if (typeof localStorage !== "undefined") {
        const storedValue = localStorage.getItem("setting_safe_mode")
        if (storedValue !== null) {
            return storedValue === "false" ? Number.POSITIVE_INFINITY : DNA_SAFE_VERSION_LIMIT
        }
    }

    return DNA_SAFE_VERSION_LIMIT
}

/**
 * 写入当前允许展示的最高版本号到全局变量。
 * @param versionLimit 当前允许展示的最高版本号
 */
export function setCurrentVersionLimit(versionLimit: number): void {
    ;(globalThis as GlobalWithCurrentVersion)[DNA_CURRENT_VERSION_GLOBAL_KEY] = versionLimit
}

/**
 * 判断条目在当前安全模式下是否允许导出。
 * @param item 带版本字段的条目
 * @returns 当前条目是否允许展示
 */
export function isVersionAllowed(item: VersionedItem): boolean {
    if (!item.版本) {
        return true
    }

    const parsedVersion = Number(item.版本)
    if (!Number.isFinite(parsedVersion)) {
        return true
    }

    return parsedVersion <= getCurrentVersionLimit()
}

/**
 * 对带版本字段的数据列表应用安全模式过滤。
 * @param items 原始数据列表
 * @returns 过滤后的数据列表
 */
export function applyVersionGate<T extends VersionedItem>(items: T[]): T[] {
    return items.filter(item => isVersionAllowed(item))
}
