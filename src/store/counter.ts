import { register, unregister } from "@tauri-apps/plugin-global-shortcut"
import { defineStore } from "pinia"
import { DEFAULT_COUNTER_RESET_CRON, getNextCronOccurrence, normalizeCronExpression } from "@/utils/cron"

export type CounterTriggerActionType = "-1" | "+1" | "+2" | "+3" | "+4" | "+5" | "+10" | "reset"

export interface CounterTrigger {
    id: string
    hotkey: string
    action: CounterTriggerActionType
}

export interface CounterItem {
    id: string
    name: string
    value: number
    maxValue: number | null
    resetCron: string | null
    lastResetAt: number
    triggers: CounterTrigger[]
}

interface PersistedCounterState {
    counters: CounterItem[]
}

const COUNTER_STORAGE_KEY = "counter-view-state-v1"
const DEFAULT_COUNTERS: Omit<CounterItem, "id" | "lastResetAt" | "triggers">[] = [
    {
        name: "无尽副本魔灵",
        value: 0,
        maxValue: 30,
        resetCron: DEFAULT_COUNTER_RESET_CRON,
    },
    {
        name: "副本魔灵",
        value: 0,
        maxValue: 20,
        resetCron: DEFAULT_COUNTER_RESET_CRON,
    },
    {
        name: "钓鱼额外奖励",
        value: 0,
        maxValue: 30,
        resetCron: DEFAULT_COUNTER_RESET_CRON,
    },
]

const registeredShortcutHandlers = new Map<string, (event: { state: string }) => void>()

/**
 * 生成一个稳定的本地 ID。
 * @returns 本地 ID
 */
function createLocalId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * 规整字符串。
 * @param value 原始值
 * @returns 清洗后的字符串
 */
function normalizeText(value: unknown): string {
    return String(value ?? "").trim()
}

/**
 * 规整非负整数。
 * @param value 原始值
 * @returns 非负整数
 */
function normalizeCount(value: unknown): number {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return 0
    return Math.max(0, Math.floor(numeric))
}

/**
 * 规整可选正整数。
 * @param value 原始值
 * @returns 正整数或 null
 */
function normalizeOptionalPositiveInt(value: unknown): number | null {
    if (value === null || value === undefined || value === "") return null
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return null
    const normalized = Math.floor(numeric)
    return normalized > 0 ? normalized : null
}

/**
 * 规整 cron 表达式。
 * @param value 原始值
 * @returns cron 表达式或 null
 */
function normalizeOptionalCron(value: unknown): string | null {
    const text = normalizeText(value)
    if (!text) return null
    return normalizeCronExpression(text)
}

/**
 * 规整触发器动作。
 * @param action 原始动作
 * @returns 支持的动作
 */
function normalizeAction(action: unknown): CounterTriggerActionType {
    const text = normalizeText(action)
    switch (text) {
        case "-1":
        case "+1":
        case "+2":
        case "+3":
        case "+4":
        case "+5":
        case "+10":
        case "reset":
            return text
        default:
            return "+1"
    }
}

/**
 * 规整触发器。
 * @param raw 原始值
 * @returns 触发器对象或 null
 */
function normalizeTrigger(raw: unknown): CounterTrigger | null {
    if (!raw || typeof raw !== "object") return null
    const candidate = raw as Record<string, unknown>
    const hotkey = normalizeText(candidate.hotkey)
    if (!hotkey) return null
    return {
        id: normalizeText(candidate.id) || createLocalId(),
        hotkey,
        action: normalizeAction(candidate.action),
    }
}

/**
 * 规整计数器。
 * @param raw 原始值
 * @returns 计数器对象或 null
 */
function normalizeCounter(raw: unknown): CounterItem | null {
    if (!raw || typeof raw !== "object") return null
    const candidate = raw as Record<string, unknown>
    const name = normalizeText(candidate.name)
    if (!name) return null
    const triggers = Array.isArray(candidate.triggers) ? (candidate.triggers.map(normalizeTrigger).filter(Boolean) as CounterTrigger[]) : []
    const resetCron =
        normalizeOptionalCron(candidate.resetCron) ??
        (normalizeOptionalPositiveInt(candidate.resetPeriodMs) ? DEFAULT_COUNTER_RESET_CRON : null)
    return {
        id: normalizeText(candidate.id) || createLocalId(),
        name,
        value: normalizeCount(candidate.value),
        maxValue: normalizeOptionalPositiveInt(candidate.maxValue),
        resetCron,
        lastResetAt: Number.isFinite(Number(candidate.lastResetAt)) ? Number(candidate.lastResetAt) : Date.now(),
        triggers,
    }
}

/**
 * 规整持久化状态。
 * @param raw 原始值
 * @returns 规整后的状态
 */
function normalizePersistedState(raw: unknown): PersistedCounterState {
    const candidate = raw as Partial<PersistedCounterState> | null
    const counters = Array.isArray(candidate?.counters) ? (candidate.counters.map(normalizeCounter).filter(Boolean) as CounterItem[]) : []
    return { counters }
}

/**
 * 读取本地持久化状态。
 * @returns 持久化状态
 */
function readPersistedState(): PersistedCounterState {
    if (typeof localStorage === "undefined") {
        return { counters: [] }
    }
    try {
        return normalizePersistedState(JSON.parse(localStorage.getItem(COUNTER_STORAGE_KEY) || "{}"))
    } catch {
        return { counters: [] }
    }
}

/**
 * 补齐默认计数器。
 * @param counters 当前计数器
 * @returns 补齐后的计数器
 */
function ensureDefaultCounters(counters: CounterItem[]): CounterItem[] {
    if (counters.length > 0) {
        return counters
    }
    return DEFAULT_COUNTERS.map(counter => ({
        id: createLocalId(),
        name: counter.name,
        value: counter.value,
        maxValue: counter.maxValue,
        resetCron: counter.resetCron,
        lastResetAt: Date.now(),
        triggers: [],
    }))
}

/**
 * 写入本地持久化状态。
 * @param state 持久化状态
 */
function writePersistedState(state: PersistedCounterState) {
    if (typeof localStorage === "undefined") {
        return
    }
    localStorage.setItem(COUNTER_STORAGE_KEY, JSON.stringify(normalizePersistedState(state)))
}

/**
 * 将 AHK 风格热键转换为全局快捷键插件格式。
 * @param hotkey AHK 热键
 * @returns 插件格式热键
 */
function toGlobalShortcut(hotkey: string): string {
    const text = normalizeText(hotkey)
    if (!text) return ""
    const comboParts = text.split(/\s*&\s*/u).filter(Boolean)
    if (comboParts.length > 1) {
        return comboParts
            .map(part => toGlobalShortcut(part))
            .filter(Boolean)
            .join("+")
    }

    const prefixMatch = text.match(/^([\^!+#]+)(.+)$/u)
    if (!prefixMatch) {
        return text
    }
    const modifiers = prefixMatch[1]
    const key = normalizeText(prefixMatch[2])
    const parts: string[] = []
    if (modifiers.includes("^")) parts.push("Control")
    if (modifiers.includes("!")) parts.push("Alt")
    if (modifiers.includes("+")) parts.push("Shift")
    if (modifiers.includes("#")) parts.push("Super")
    if (key) parts.push(key)
    return parts.join("+")
}

export const useCounterStore = defineStore("counter", {
    state: () => {
        const state = readPersistedState()
        return {
            counters: ensureDefaultCounters(state.counters),
        }
    },
    actions: {
        /**
         * 写回持久化状态。
         */
        persistState() {
            writePersistedState({ counters: this.counters })
        },
        /**
         * 载入时自动修正过期值。
         */
        refreshExpiredCounters() {
            let changed = false
            const now = Date.now()
            for (const counter of this.counters) {
                const nextResetAt = counter.resetCron ? getNextCronOccurrence(counter.resetCron, counter.lastResetAt) : null
                if (nextResetAt !== null && nextResetAt <= now) {
                    counter.value = 0
                    counter.lastResetAt = now
                    changed = true
                }
            }
            if (changed) this.persistState()
        },
        /**
         * 添加计数器。
         * @param name 计数器名称
         */
        addCounter(name = "Counter") {
            this.counters.push({
                id: createLocalId(),
                name,
                value: 0,
                maxValue: null,
                resetCron: DEFAULT_COUNTER_RESET_CRON,
                lastResetAt: Date.now(),
                triggers: [],
            })
            this.persistState()
        },
        /**
         * 更新计数器。
         * @param counterId 计数器 ID
         * @param patch 更新字段
         */
        updateCounter(counterId: string, patch: Partial<Pick<CounterItem, "name" | "value" | "maxValue" | "resetCron">>) {
            const counter = this.counters.find(item => item.id === counterId)
            if (!counter) return
            if (patch.name !== undefined) counter.name = normalizeText(patch.name) || counter.name
            if (patch.value !== undefined) counter.value = normalizeCount(patch.value)
            if (patch.maxValue !== undefined) counter.maxValue = normalizeOptionalPositiveInt(patch.maxValue)
            if (patch.resetCron !== undefined) counter.resetCron = normalizeOptionalCron(patch.resetCron)
            this.persistState()
        },
        /**
         * 手动设置计数值。
         * @param counterId 计数器 ID
         * @param value 目标值
         */
        setCounterValue(counterId: string, value: number) {
            const counter = this.counters.find(item => item.id === counterId)
            if (!counter) return
            counter.value = normalizeCount(value)
            this.persistState()
        },
        /**
         * 计数加一。
         * @param counterId 计数器 ID
         */
        incrementCounter(counterId: string) {
            const counter = this.counters.find(item => item.id === counterId)
            if (!counter) return
            const next = counter.value + 1
            counter.value = counter.maxValue ? Math.min(counter.maxValue, next) : next
            this.persistState()
        },
        /**
         * 重置计数器。
         * @param counterId 计数器 ID
         */
        resetCounter(counterId: string) {
            const counter = this.counters.find(item => item.id === counterId)
            if (!counter) return
            counter.value = 0
            counter.lastResetAt = Date.now()
            this.persistState()
        },
        /**
         * 重置全部计数器。
         */
        resetAllCounters() {
            const now = Date.now()
            for (const counter of this.counters) {
                counter.value = 0
                counter.lastResetAt = now
            }
            this.persistState()
        },
        /**
         * 删除计数器。
         * @param counterId 计数器 ID
         */
        removeCounter(counterId: string) {
            const index = this.counters.findIndex(item => item.id === counterId)
            if (index === -1) return
            this.counters.splice(index, 1)
            this.persistState()
            void this.syncTriggerHotkeys()
        },
        /**
         * 添加触发器。
         * @param counterId 计数器 ID
         */
        addTrigger(counterId: string) {
            const counter = this.counters.find(item => item.id === counterId)
            if (!counter) return
            counter.triggers.push({
                id: createLocalId(),
                hotkey: "",
                action: "+1",
            })
            this.persistState()
        },
        /**
         * 更新触发器。
         * @param counterId 计数器 ID
         * @param triggerId 触发器 ID
         * @param patch 更新字段
         */
        updateTrigger(counterId: string, triggerId: string, patch: Partial<CounterTrigger>) {
            const trigger = this.findTrigger(counterId, triggerId)
            if (!trigger) return
            if (patch.action !== undefined) trigger.action = normalizeAction(patch.action)
            if (patch.hotkey !== undefined) trigger.hotkey = normalizeText(patch.hotkey)
            this.persistState()
            void this.syncTriggerHotkeys()
        },
        /**
         * 删除触发器。
         * @param counterId 计数器 ID
         * @param triggerId 触发器 ID
         */
        removeTrigger(counterId: string, triggerId: string) {
            const counter = this.counters.find(item => item.id === counterId)
            if (!counter) return
            const index = counter.triggers.findIndex(item => item.id === triggerId)
            if (index === -1) return
            counter.triggers.splice(index, 1)
            this.persistState()
            void this.syncTriggerHotkeys()
        },
        /**
         * 在计数器之间移动触发器。
         * @param fromCounterId 来源计数器
         * @param toCounterId 目标计数器
         * @param triggerId 触发器 ID
         */
        moveTrigger(fromCounterId: string, toCounterId: string, triggerId: string) {
            if (fromCounterId === toCounterId) return
            const fromCounter = this.counters.find(item => item.id === fromCounterId)
            const toCounter = this.counters.find(item => item.id === toCounterId)
            if (!fromCounter || !toCounter) return
            const index = fromCounter.triggers.findIndex(item => item.id === triggerId)
            if (index === -1) return
            const [trigger] = fromCounter.triggers.splice(index, 1)
            toCounter.triggers.push(trigger)
            this.persistState()
            void this.syncTriggerHotkeys()
        },
        /**
         * 查找触发器。
         * @param counterId 计数器 ID
         * @param triggerId 触发器 ID
         */
        findTrigger(counterId: string, triggerId: string) {
            return this.counters.find(item => item.id === counterId)?.triggers.find(item => item.id === triggerId)
        },
        /**
         * 同步热键注册。
         */
        async syncTriggerHotkeys() {
            const expected = new Set<string>()
            for (const counter of this.counters) {
                for (const trigger of counter.triggers) {
                    const hotkey = toGlobalShortcut(trigger.hotkey)
                    if (!hotkey) continue
                    expected.add(hotkey)
                    if (registeredShortcutHandlers.has(hotkey)) continue
                    const handler = (event: { state: string }) => {
                        if (event.state !== "Pressed") return
                        this.handleTriggerHotkey(hotkey)
                    }
                    registeredShortcutHandlers.set(hotkey, handler)
                    await register(hotkey, handler)
                }
            }

            for (const [hotkey] of registeredShortcutHandlers) {
                if (expected.has(hotkey)) continue
                await unregister(hotkey)
                registeredShortcutHandlers.delete(hotkey)
            }
        },
        /**
         * 处理触发器热键。
         * @param hotkey 热键
         */
        handleTriggerHotkey(hotkey: string) {
            for (const counter of this.counters) {
                for (const trigger of counter.triggers) {
                    if (toGlobalShortcut(trigger.hotkey) !== hotkey) continue
                    switch (trigger.action) {
                        case "-1":
                            this.incrementBy(counter.id, -1)
                            break
                        case "+1":
                            this.incrementCounter(counter.id)
                            break
                        case "+2":
                            this.incrementBy(counter.id, 2)
                            break
                        case "+3":
                            this.incrementBy(counter.id, 3)
                            break
                        case "+4":
                            this.incrementBy(counter.id, 4)
                            break
                        case "+5":
                            this.incrementBy(counter.id, 5)
                            break
                        case "+10":
                            this.incrementBy(counter.id, 10)
                            break
                        case "reset":
                            this.resetCounter(counter.id)
                            break
                    }
                }
            }
        },
        /**
         * 判断触发器热键是否有效。
         * @param hotkey 热键
         */
        canRegisterTrigger(hotkey: string) {
            return Boolean(toGlobalShortcut(hotkey))
        },
        /**
         * 按指定步长增加计数。
         * @param counterId 计数器 ID
         * @param step 增加步长
         */
        incrementBy(counterId: string, step: number) {
            const counter = this.counters.find(item => item.id === counterId)
            if (!counter) return
            const next = counter.value + Math.floor(step)
            counter.value = counter.maxValue ? Math.min(counter.maxValue, Math.max(0, next)) : Math.max(0, next)
            this.persistState()
        },
    },
})
