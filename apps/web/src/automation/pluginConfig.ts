/** 插件级全局配置（连接信息配一次）：localStorage 持久化，建规则时自动带入。 */

function keyOf(pluginId: string) {
    return `setting_plugin_${pluginId}_config`
}

function readStorage(key: string): Record<string, unknown> {
    try {
        if (typeof localStorage === "undefined") return {}
        const raw = localStorage.getItem(key)
        if (!raw) return {}
        const parsed: unknown = JSON.parse(raw)
        return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
    } catch {
        return {}
    }
}

/** 读插件全局配置（读不到返回空对象）。 */
export function readPluginGlobalConfig(pluginId: string): Record<string, unknown> {
    return readStorage(keyOf(pluginId))
}

/** 写插件全局配置（写失败静默忽略）。 */
export function writePluginGlobalConfig(pluginId: string, config: Record<string, unknown>): void {
    try {
        if (typeof localStorage === "undefined") return
        localStorage.setItem(keyOf(pluginId), JSON.stringify(config))
    } catch {
        // 隐私模式等不可写存储：仅本次会话有效
    }
}
