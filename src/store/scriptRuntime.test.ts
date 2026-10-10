import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@tauri-apps/api/event", () => ({
    listen: vi.fn(async () => () => {}),
}))

vi.mock("@/api/app", () => ({
    stopScript: vi.fn(async () => {}),
    stopScriptByPath: vi.fn(async () => {}),
    resolveScriptConfigRequest: vi.fn(async () => {}),
}))

vi.mock("@/env", () => ({
    env: {},
}))

describe("scriptRuntime console logs", () => {
    beforeEach(() => {
        vi.resetModules()
        setActivePinia(createPinia())
    })

    it("seq 单调递增且可做稳定 key", async () => {
        const { useScriptRuntimeStore } = await import("./scriptRuntime")
        const store = useScriptRuntimeStore()

        store.appendConsoleEvent({ message: "a" })
        store.appendConsoleEvent({ message: "b" })
        store.appendConsoleLog("info", "c")

        const seqs = store.consoleLogs.map(log => log.seq)
        expect(seqs.length).toBe(3)
        expect(new Set(seqs).size).toBe(3)
        expect([...seqs].sort((x, y) => x - y)).toEqual(seqs)
    })

    it("超过上限只保留最新 1000 条", async () => {
        const { useScriptRuntimeStore } = await import("./scriptRuntime")
        const store = useScriptRuntimeStore()

        for (let i = 0; i < 1200; i++) {
            store.appendConsoleEvent({ message: `m${i}` })
        }

        expect(store.consoleLogs.length).toBe(1000)
        expect(store.consoleLogs[0].message).toBe("m200")
        expect(store.consoleLogs[999].message).toBe("m1199")
    })
})
