import { describe, expect, it, vi } from "vitest"
import type { AfkEvent } from "@/api/afkSupport"

vi.mock("@/api/afkSupport", () => ({
    AFK_PIPE_NAME: "test-pipe",
    onAfkEvent: vi.fn(),
    onAfkStatus: vi.fn(),
    afkBridgeStart: vi.fn(),
    afkBridgeStop: vi.fn(),
    afkBridgeStatus: vi.fn(),
}))
vi.mock("@/env", () => ({ env: { isApp: true } }))
vi.mock("@/store/afkLedger", () => ({ useAfkLedgerStore: () => ({ record: vi.fn(), beginSession: vi.fn() }) }))
vi.mock("@/store/forgeAlarm", () => ({ notifySystem: vi.fn(), useForgeAlarm: () => ({ alarm: { value: null }, cancel: vi.fn() }) }))
vi.mock("@/store/ui", () => ({ useUIStore: () => ({ showSuccessMessage: vi.fn() }) }))

const { afkToAutomationEvent } = await import("./afkPipe")
const { formatAfkEvent } = await import("@/store/afkSupport")

describe("afk mapping", () => {
    it("8 种事件映射到约定 kind 与单层 data", () => {
        const cases: AfkEvent[] = [
            { kind: "dungeon", id: "64102", status: "complete", name: "扼守/无尽", receivedAt: 1000, raw: "" },
            { kind: "reward", id: 7, name: "金羊毛", rarity: 4, count: 2, receivedAt: 1000, raw: "" },
            { kind: "craft", name: "金羊毛", rarity: 4, count: 1, receivedAt: 1000, raw: "" },
            { kind: "character", id: 3, skin: null, state: "idle", name: "主角", scene: "town", receivedAt: 1000, raw: "" },
            { kind: "monster", id: 9, receivedAt: 1000, raw: "" },
            { kind: "chat", team: 1, world: 2, party: 3, receivedAt: 1000, raw: "" },
            { kind: "language", lang: "cn", receivedAt: 1000, raw: "" },
            { kind: "control", action: "show", receivedAt: 1000, raw: "" },
        ]
        const events = cases.map(event => afkToAutomationEvent(event))
        expect(events.every(event => event !== null)).toBe(true)
        expect(events.map(event => event?.kind)).toEqual([
            "dungeon",
            "reward",
            "craft",
            "character",
            "monster",
            "chat",
            "language",
            "control",
        ])
        expect(events[0]?.data).toEqual({ id: "64102", status: "complete", name: "扼守/无尽" })
        expect(events[1]?.data).toEqual({ name: "金羊毛", count: 2, rarity: 4 })
        expect(events[2]?.data).toEqual({ name: "金羊毛" })
        expect(events[3]?.data).toEqual({ id: 3, state: "idle", scene: "town", name: "主角" })
        expect(events[4]?.data).toEqual({ id: 9 })
        expect(events[5]?.data).toEqual({ team: 1, world: 2, party: 3 })
        expect(events[6]?.data).toEqual({ lang: "cn" })
        expect(events[7]?.data).toEqual({ action: "show" })
        for (const [index, event] of cases.entries()) {
            expect(events[index]?.source).toBe("afk")
            expect(events[index]?.at).toBe(1000)
            expect(events[index]?.label).toBe(formatAfkEvent(event))
        }
    })

    it("receivedAt 缺失时回落到当前时刻", () => {
        const before = Date.now()
        const event = afkToAutomationEvent({ kind: "monster", id: 1, receivedAt: 0, raw: "" })
        expect(event?.at).toBeGreaterThanOrEqual(before)
    })
})
