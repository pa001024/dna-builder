import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { AfkEvent } from "@/api/afkSupport"

const notifySystem = vi.fn()
const showSuccessMessage = vi.fn()

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
vi.mock("@/store/forgeAlarm", () => ({ notifySystem, useForgeAlarm: () => ({ alarm: { value: null }, cancel: vi.fn() }) }))
vi.mock("@/store/ui", () => ({ useUIStore: () => ({ showSuccessMessage }) }))

const { useAfkSupportStore } = await import("@/store/afkSupport")

describe("afk dungeon notification toggle", () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        notifySystem.mockClear()
        showSuccessMessage.mockClear()
    })

    it("sends a desktop notification when enabled and skips it when disabled, regardless of the receiver switch", () => {
        const store = useAfkSupportStore()
        const event: AfkEvent = {
            kind: "dungeon",
            id: "64102",
            status: "complete",
            name: "扼守/无尽",
            receivedAt: 1,
            raw: "",
        }

        store.enabled = false
        store.notifyDungeon = true
        store.announce(event)
        expect(notifySystem).toHaveBeenCalledTimes(1)
        expect(showSuccessMessage).toHaveBeenCalledTimes(1)

        store.enabled = false
        store.notifyDungeon = false
        store.announce(event)
        expect(notifySystem).toHaveBeenCalledTimes(1)
        expect(showSuccessMessage).toHaveBeenCalledTimes(2)
    })
})
