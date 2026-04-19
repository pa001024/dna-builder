import { createPinia, setActivePinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_COUNTER_RESET_CRON } from "@/utils/cron"

const mockRegister = vi.fn()
const mockUnregister = vi.fn()
const localStorageMock = (() => {
    let store: Record<string, string> = {}

    return {
        clear: () => {
            store = {}
        },
        getItem: (key: string) => (key in store ? store[key] : null),
        setItem: (key: string, value: string) => {
            store[key] = String(value)
        },
        removeItem: (key: string) => {
            delete store[key]
        },
    }
})()

vi.mock("@tauri-apps/plugin-global-shortcut", () => ({
    register: mockRegister,
    unregister: mockUnregister,
}))

describe("counter store", () => {
    beforeEach(() => {
        vi.resetModules()
        vi.useFakeTimers()
        mockRegister.mockReset()
        mockUnregister.mockReset()
        Object.defineProperty(globalThis, "localStorage", {
            configurable: true,
            value: localStorageMock,
        })
        globalThis.localStorage.clear()
        setActivePinia(createPinia())
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it("应该把旧的毫秒重置数据兼容为 cron", async () => {
        globalThis.localStorage.setItem(
            "counter-view-state-v1",
            JSON.stringify({
                counters: [
                    {
                        id: "counter-1",
                        name: "Counter",
                        value: 3,
                        maxValue: null,
                        resetPeriodMs: 60000,
                        lastResetAt: 0,
                        triggers: [],
                    },
                ],
            })
        )

        const { useCounterStore } = await import("./counter")
        const store = useCounterStore()

        expect(store.counters[0].resetCron).toBe(DEFAULT_COUNTER_RESET_CRON)
    })

    it("应该在 cron 到期后自动重置计数器", async () => {
        const currentTime = new Date(2026, 3, 20, 5, 0, 30, 0).getTime()
        vi.setSystemTime(currentTime)
        globalThis.localStorage.setItem(
            "counter-view-state-v1",
            JSON.stringify({
                counters: [
                    {
                        id: "counter-1",
                        name: "Counter",
                        value: 7,
                        maxValue: null,
                        resetCron: "0 5 * * 1",
                        lastResetAt: new Date(2026, 3, 13, 5, 0, 0, 0).getTime(),
                        triggers: [],
                    },
                ],
            })
        )

        const { useCounterStore } = await import("./counter")
        const store = useCounterStore()

        store.refreshExpiredCounters()

        expect(store.counters[0].value).toBe(0)
        expect(store.counters[0].lastResetAt).toBe(currentTime)
    })

    it("应该在空状态下注入默认计数器", async () => {
        const { useCounterStore } = await import("./counter")
        const store = useCounterStore()

        expect(store.counters.map(counter => counter.name)).toEqual(["无尽副本魔灵", "副本魔灵", "钓鱼额外奖励"])
        expect(store.counters.map(counter => counter.maxValue)).toEqual([30, 20, 30])
        expect(store.counters.every(counter => counter.resetCron === DEFAULT_COUNTER_RESET_CRON)).toBe(true)
    })
})
