import { describe, expect, it } from "bun:test"
import { generateRechargeCode, normalizeRechargeCode, validateBatchInput } from "./aiRecharge"

describe("兑换码生成", () => {
    it("格式为 XXXX-XXXX-XXXX 且不含易混淆字符", () => {
        for (let i = 0; i < 50; i++) {
            const code = generateRechargeCode()
            expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/)
            expect(code).not.toMatch(/[01OI]/)
        }
    })

    it("批量生成无重复", () => {
        const codes = new Set(Array.from({ length: 500 }, () => generateRechargeCode()))
        expect(codes.size).toBeGreaterThan(490)
    })
})

describe("兑换码归一化", () => {
    it("去空格横杠并转大写", () => {
        expect(normalizeRechargeCode("abcd-efgh-ijkl")).toBe("ABCD-EFGH-IJKL")
        expect(normalizeRechargeCode("  abcd efgh ijkl ")).toBe("ABCD-EFGH-IJKL")
        expect(normalizeRechargeCode("ABCDEFGHIJKL")).toBe("ABCD-EFGH-IJKL")
    })

    it("非法输入返回 null（严格匹配，不猜测 O→0）", () => {
        expect(normalizeRechargeCode("")).toBeNull()
        expect(normalizeRechargeCode("ABC")).toBeNull()
        expect(normalizeRechargeCode("ABCD-EFGH-IJK!")).toBeNull()
        expect(normalizeRechargeCode(null)).toBeNull()
    })
})

describe("批量参数校验", () => {
    it("正常参数换算微元", () => {
        const result = validateBatchInput(5, 10, null)
        expect(result.amountMicros).toBe(5_000_000)
        expect(result.expiresAt).toBeNull()
    })

    it("有效期换算为未来时间戳", () => {
        const before = Date.now()
        const result = validateBatchInput(0.5, 1, 30)
        expect(result.amountMicros).toBe(500_000)
        expect(result.expiresAt!).toBeGreaterThan(before)
    })

    it("越界参数抛错", () => {
        expect(() => validateBatchInput(0.05, 10, null)).toThrow()
        expect(() => validateBatchInput(501, 10, null)).toThrow()
        expect(() => validateBatchInput(5, 0, null)).toThrow()
        expect(() => validateBatchInput(5, 501, null)).toThrow()
        expect(() => validateBatchInput(5, 10, 0)).toThrow()
    })
})
