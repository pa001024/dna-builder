import { describe, expect, it } from "vitest"
import { decodeSkinColorizeCode, encodeSkinColorizeCode } from "../skin-colorize"

describe("skin colorize code", () => {
    it("matches the game C + 10 base36 skin id + 2 base36 color ids format", () => {
        const code = encodeSkinColorizeCode({ type: "Char", skinId: 1101, colorIds: [1001, 0, 1022] })
        expect(code).toBe("C00000000ULRT00SE")
        expect(decodeSkinColorizeCode(code)).toEqual({ type: "Char", skinId: 1101, colorIds: [1001, 0, 1022] })
    })

    it("rejects an odd color payload", () => {
        expect(() => decodeSkinColorizeCode("C0000000000000")).toThrow("长度")
    })
})
