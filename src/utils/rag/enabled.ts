/**
 * 上下文检索增强（RAG）开关。
 *
 * 实验性功能，**默认关闭**。关闭时：不构建语料与索引（Worker 不启动）、
 * 不发起服务端向量召回请求、`rag_search` 直接返回不可用提示；
 * 开启后立即开始建索引（见 `DBView.vue` 的开关处理）。
 *
 * 状态放在模块级而不是 Pinia store：读它的既有工具层（`vector.ts` / `corpus.ts` / `api/dbAgent.ts`），
 * 也有组件层，模块级缓存让非组件代码也能同步读取，且不依赖 Pinia 已安装
 * （单测里直接调 `ragSearch` / `getRagCorpus` 同样成立）。
 */

/** 持久化键（与设置页其它开关同为 `setting_*` 前缀） */
const STORAGE_KEY = "setting_db_agent_rag"

/** 变化订阅者 */
const listeners = new Set<(enabled: boolean) => void>()

/**
 * 读取持久化的开关状态。
 * @returns 是否开启；未设置或存储不可用时为 false（默认关闭）
 */
function readStored(): boolean {
    if (typeof localStorage === "undefined") {
        return false
    }

    return localStorage.getItem(STORAGE_KEY) === "true"
}

/** 当前状态（模块级缓存，供同步读取） */
let enabled = readStored()

/**
 * 当前开关状态。
 * @returns 是否开启
 */
export function isRagEnabled(): boolean {
    return enabled
}

/**
 * 更新开关状态并持久化，同步通知订阅者。
 * @param value 是否开启
 */
export function setRagEnabled(value: boolean): void {
    if (enabled === value) {
        return
    }

    enabled = value

    if (typeof localStorage !== "undefined") {
        localStorage.setItem(STORAGE_KEY, String(value))
    }

    for (const listener of listeners) {
        listener(value)
    }
}

/**
 * 订阅开关变化（仅值真正变化时触发）。
 * @param listener 变化回调
 * @returns 取消订阅函数
 */
export function onRagEnabledChange(listener: (enabled: boolean) => void): () => void {
    listeners.add(listener)

    return () => {
        listeners.delete(listener)
    }
}
