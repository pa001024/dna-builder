import { describe, expect, it } from "vitest"
import { decodeSkinColorizeCode, encodeSkinColorizeCode } from "../skin-colorize"

describe("skin colorize code", () => {
    it("matches the game C + 10 base36 skin id + 2 base36 color ids format", () => {
        const code = encodeSkinColorizeCode({ type: "Char", skinId: 1101, colorIds: [1001, 0, 1022] })
        expect(code).toBe("C00000000ULRT00SE")
        expect(decodeSkinColorizeCode(code)).toEqual({ type: "Char", skinId: 1101, colorIds: [1001, 0, 1022] })
    })

    it("matches the game H hair format with 6 color parts (length differs from skin)", () => {
        const code = encodeSkinColorizeCode({ type: "Hair", skinId: 1101, colorIds: [1001, 0, 1022, 0, 0, 0] })
        expect(code).toBe("H00000000ULRT00SE000000")
        expect(code).toHaveLength(23)
        expect(decodeSkinColorizeCode(code)).toEqual({ type: "Hair", skinId: 1101, colorIds: [1001, 0, 1022, 0, 0, 0] })
    })

    it("round-trips an imported hair code with a fashion hair id", () => {
        const code = "H0000002D3ORT00SE000000"
        expect(decodeSkinColorizeCode(code)).toEqual({ type: "Hair", skinId: 110292, colorIds: [1001, 0, 1022, 0, 0, 0] })
        expect(encodeSkinColorizeCode(decodeSkinColorizeCode(code) as { type: "Hair"; skinId: number; colorIds: number[] })).toBe(code)
    })

    it("rejects an odd color payload", () => {
        expect(() => decodeSkinColorizeCode("C0000000000000")).toThrow("长度")
    })
})
