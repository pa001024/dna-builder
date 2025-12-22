import { describe, it, expect } from "vitest"
import { getDNAInstanceMHType } from "../src/index"

describe("Utility Functions", () => {
    describe("getDNAInstanceMHType", () => {
        it("should convert Chinese to English type", () => {
            expect(getDNAInstanceMHType("角色")).toBe("role")
            expect(getDNAInstanceMHType("武器")).toBe("weapon")
            expect(getDNAInstanceMHType("魔之楔")).toBe("mzx")
        })

        it("should convert English to Chinese type", () => {
            expect(getDNAInstanceMHType("role")).toBe("角色")
            expect(getDNAInstanceMHType("weapon")).toBe("武器")
            expect(getDNAInstanceMHType("mzx")).toBe("魔之楔")
        })

        it("should handle all valid keys", () => {
            const keys = ["角色", "武器", "魔之楔", "role", "weapon", "mzx"] as const
            keys.forEach(key => {
                expect(getDNAInstanceMHType(key)).toBeDefined()
            })
        })
    })
})