import { describe, expect, it } from "vitest"
import { base36Pad } from "@/util"
import { encodeModCode, parseModCode } from "@/utils/modCode"

type Slots = ([number, number] | null)[]

function createSlots(ids: number[], count = 8): Slots {
    return Array.from({ length: count }, (_, index) => {
        const id = ids[index] ?? 0
        return id > 0 ? [id, 10] : null
    })
}

/** 同律武器没有导出路径，按 4 槽交换表手工拼一份代码用于解析测试 */
function encodeFourSlotWeapon(ownerId: number, ids: number[]) {
    const groups = ["0000", "0000", "0000", "0000"]
    const positions = [0, 2, 3, 1]
    ids.forEach((id, index) => {
        groups[positions[index]] = base36Pad(id)
    })
    return `W${base36Pad(ownerId)}${groups.join("")}`
}

describe("modCode", () => {
    it("角色代码按槽位顺序编解码，并携带中枢", () => {
        const slots = createSlots([101, 0, 102, 103, 0, 104, 0, 105])
        const code = encodeModCode("C", 1101, slots, 201)
        const parsed = parseModCode(code)
        expect(parsed).toEqual({
            flag: "C",
            ownerId: 1101,
            mods: [101, 0, 102, 103, 0, 104, 0, 105],
            auraMod: 201,
            slotCount: 8,
        })
    })

    it("武器代码按槽位顺序编解码", () => {
        const slots = createSlots([301, 302, 0, 0, 303, 0, 0, 304])
        const code = encodeModCode("W", 10101, slots)
        const parsed = parseModCode(code)
        expect(parsed?.flag).toBe("W")
        expect(parsed?.ownerId).toBe(10101)
        expect(parsed?.mods).toEqual([301, 302, 0, 0, 303, 0, 0, 304])
        expect(parsed?.auraMod).toBe(0)
        expect(parsed?.slotCount).toBe(8)
    })

    it("同律 4 槽代码按前四个槽位还原", () => {
        const code = encodeFourSlotWeapon(10102, [401, 0, 402, 403])
        expect(code).toHaveLength(21)
        const parsed = parseModCode(code)
        expect(parsed?.slotCount).toBe(4)
        expect(parsed?.mods).toEqual([401, 0, 402, 403, 0, 0, 0, 0])
    })

    it("允许代码中夹杂换行与空格", () => {
        const code = encodeModCode("C", 1102, createSlots([501]), 502)
        const wrapped = `${code.slice(0, 12)}\n${code.slice(12)}`
        expect(parseModCode(wrapped)?.ownerId).toBe(1102)
    })

    it("拒绝普通文本与截断代码", () => {
        expect(parseModCode("这是一段说明文字")).toBeNull()
        expect(parseModCode("")).toBeNull()
        expect(parseModCode("C1101")).toBeNull()
        expect(parseModCode(encodeModCode("C", 1101, createSlots([]), 0).slice(0, -4))).toBeNull()
        expect(parseModCode(`W10101${"0000".repeat(5)}`)).toBeNull()
        expect(parseModCode(`W10101${"0000".repeat(9)}`)).toBeNull()
    })

    it("旧代码把中枢顶进普通槽位时清除重复项", () => {
        const code = encodeModCode("C", 1103, createSlots([601, 602, 603]), 601)
        const parsed = parseModCode(code)
        expect(parsed?.mods[0]).toBe(0)
        expect(parsed?.auraMod).toBe(601)
    })
})
