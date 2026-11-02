import { describe, expect, it } from "vitest"
import { mihanToAutomationEvent } from "./mihan"

describe("mihan mapping", () => {
    it("映射为 commission_refresh 事件并携带任务名与类型", () => {
        const before = Date.now()
        const event = mihanToAutomationEvent({ name: "秘银任务", type: "角色" })
        expect(event.source).toBe("mihan")
        expect(event.kind).toBe("commission_refresh")
        expect(event.label).toBe("秘银任务")
        expect(event.data).toEqual({ mission: "秘银任务", type: "角色" })
        expect(event.at).toBeGreaterThanOrEqual(before)
        expect(event.at).toBeLessThanOrEqual(Date.now())
    })
})
