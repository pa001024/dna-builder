import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ConsoleLogRingBuffer, truncateConsoleMessage } from "./scriptConsoleRing"

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
        store.flushConsoleLogs()

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
        store.flushConsoleLogs()

        expect(store.consoleLogs.length).toBe(1000)
        expect(store.consoleLogs[0].message).toBe("m200")
        expect(store.consoleLogs[999].message).toBe("m1199")
        expect(store.consoleLogDroppedCount).toBe(200)
    })

    it("写满后继续写入仍推进末条 seq（供视图自动滚动监听）", async () => {
        const { useScriptRuntimeStore } = await import("./scriptRuntime")
        const store = useScriptRuntimeStore()

        for (let i = 0; i < 1005; i++) {
            store.appendConsoleEvent({ message: `m${i}` })
        }
        store.flushConsoleLogs()
        const before = store.consoleLogs.at(-1)?.seq ?? 0

        store.appendConsoleEvent({ message: "new" })
        store.flushConsoleLogs()
        const after = store.consoleLogs.at(-1)?.seq ?? 0

        expect(store.consoleLogs.length).toBe(1000)
        expect(after).toBeGreaterThan(before)
    })

    it("清空控制台同步清空缓冲与丢弃计数", async () => {
        const { useScriptRuntimeStore } = await import("./scriptRuntime")
        const store = useScriptRuntimeStore()

        for (let i = 0; i < 1200; i++) {
            store.appendConsoleEvent({ message: `m${i}` })
        }
        store.clearConsoleLogs()

        expect(store.consoleLogs.length).toBe(0)
        expect(store.consoleLogDroppedCount).toBe(0)
        store.appendConsoleEvent({ message: "after-clear" })
        store.flushConsoleLogs()
        expect(store.consoleLogs.map(log => log.message)).toEqual(["after-clear"])
    })

    it("按作用域清空只移除匹配条目", async () => {
        const { useScriptRuntimeStore } = await import("./scriptRuntime")
        const store = useScriptRuntimeStore()

        store.appendConsoleEvent({ scope: "a.js", message: "a1" })
        store.appendConsoleEvent({ scope: "b.js", message: "b1" })
        store.appendConsoleEvent({ message: "global" })
        store.clearConsoleLogsByScope("a.js")
        store.flushConsoleLogs()

        expect(store.consoleLogs.map(log => log.message).sort()).toEqual(["b1", "global"])
    })
})

describe("ConsoleLogRingBuffer", () => {
    it("写满后覆盖最旧条目并累计丢弃数", () => {
        const ring = new ConsoleLogRingBuffer<string>(3)
        ring.push("a")
        ring.push("b")
        ring.push("c")
        ring.push("d")
        ring.push("e")
        expect(ring.toArray()).toEqual(["c", "d", "e"])
        expect(ring.droppedCount).toBe(2)
    })

    it("removeIf 只移除匹配条目并保持顺序", () => {
        const ring = new ConsoleLogRingBuffer<number>(5)
        for (let i = 0; i < 5; i++) ring.push(i)
        expect(ring.removeIf(n => n % 2 === 0)).toBe(3)
        expect(ring.toArray()).toEqual([1, 3])
        ring.push(5)
        ring.push(6)
        expect(ring.toArray()).toEqual([1, 3, 5, 6])
    })
})

describe("truncateConsoleMessage", () => {
    it("短消息原样返回，超长消息截断", () => {
        expect(truncateConsoleMessage("hello")).toBe("hello")
        const long = "x".repeat(5000)
        const truncated = truncateConsoleMessage(long)
        expect(truncated.length).toBeLessThan(long.length)
        expect(truncated).toContain("(已截断")
    })
})
