export const DNA_CURRENT_VERSION_GLOBAL_KEY = "__DNA_CURRENT_VERSION__"
export const DNA_SAFE_VERSION_LIMIT = 1.6

type VersionedItem = {
    版本?: string
}

type GlobalWithCurrentVersion = typeof globalThis & {
    [DNA_CURRENT_VERSION_GLOBAL_KEY]?: number
}

/**
 * 读取当前允许展示的最高版本号，优先使用全局变量，缺失时回退到本地存储。
 *
 * 安全模式状态只由 setting_safe_mode 一个键判定：关闭时该键写入当前版本门限，
 * 因此键值等于当前版本门限 → 关闭（放开全部版本）；其余情况（键不存在 / 旧版本值）
 * → 开启。版本门限更新后旧键值与当前不一致，自动回到开启。
 * @returns 当前允许展示的最高版本号
 */
export function getCurrentVersionLimit(): number {
    const globalScope = globalThis as GlobalWithCurrentVersion
    if (typeof globalScope[DNA_CURRENT_VERSION_GLOBAL_KEY] === "number") {
        return globalScope[DNA_CURRENT_VERSION_GLOBAL_KEY]
    }
    if (typeof localStorage === "undefined" || localStorage.getItem("setting_safe_mode") === String(DNA_SAFE_VERSION_LIMIT)) {
        return Number.POSITIVE_INFINITY
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
 * 判断安全模式当前是否处于关闭状态。
 * 判定依据：setting_safe_mode 键值等于当前版本门限即视为关闭；
 * 键值缺失或为旧版本（与当前不一致）均视为开启。
 * @returns 当前是否已关闭安全模式
 */
export function isSafeModeClosed(): boolean {
    if (typeof localStorage === "undefined") {
        return false
    }
    return localStorage.getItem("setting_safe_mode") === String(DNA_SAFE_VERSION_LIMIT)
}

/**
 * 开启安全模式：删除 setting_safe_mode 键（键不存在 → 与当前版本不一致 → 视为开启）。
 */
export function openSafeMode(): void {
    if (typeof localStorage === "undefined") {
        return
    }
    localStorage.removeItem("setting_safe_mode")
}

/**
 * 关闭安全模式：将 setting_safe_mode 键写为当前版本门限。
 * 版本门限更新后，旧键值与当前版本不一致，安全模式将自动回到开启。
 */
export function closeSafeMode(): void {
    if (typeof localStorage === "undefined") {
        return
    }
    localStorage.setItem("setting_safe_mode", String(DNA_SAFE_VERSION_LIMIT))
}

/**
 * 判断条目在当前安全模式下是否允许导出。
 * @param item 带版本字段的条目
 * @returns 当前条目是否允许展示
 */
export function isVersionAllowed(item: VersionedItem, ver?: number): boolean {
    if (!item.版本) {
        return true
    }

    const parsedVersion = Number(item.版本)
    if (!Number.isFinite(parsedVersion)) {
        return true
    }
    const version = ver || getCurrentVersionLimit()
    return parsedVersion <= version
}

/**
 * 对带版本字段的数据列表应用安全模式过滤。
 * @param items 原始数据列表
 * @returns 过滤后的数据列表
 */
export function applyVersionGate<T extends VersionedItem>(items: T[]): T[] {
    const ver = getCurrentVersionLimit()
    if (ver >= Number.POSITIVE_INFINITY) return items
    return items.filter(item => isVersionAllowed(item, ver))
}
