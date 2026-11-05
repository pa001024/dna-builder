import { describe, expect, test } from "bun:test"
import { createRng, hashLabel } from "../../src/core/rng"

describe("createRng", () => {
    test("同 seed 序列完全一致", () => {
        const a = createRng(12345)
        const b = createRng(12345)
        for (let i = 0; i < 32; i++) expect(a.nextUint32()).toBe(b.nextUint32())
    })

    test("不同 seed 序列不同", () => {
        const a = createRng(1)
        const b = createRng(2)
        expect(a.nextUint32()).not.toBe(b.nextUint32())
    })

    test("next 落在 [0, 1)", () => {
        const rng = createRng(7)
        for (let i = 0; i < 1000; i++) {
            const value = rng.next()
            expect(value).toBeGreaterThanOrEqual(0)
            expect(value).toBeLessThan(1)
        }
    })

    test("int 边界与退化区间", () => {
        const rng = createRng(9)
        for (let i = 0; i < 500; i++) {
            const value = rng.int(3, 7)
            expect(value).toBeGreaterThanOrEqual(3)
            expect(value).toBeLessThan(7)
            expect(Number.isInteger(value)).toBe(true)
        }
        expect(rng.int(5, 5)).toBe(5)
        expect(rng.int(5, 4)).toBe(5)
    })

    test("chance(0) / chance(1)", () => {
        const rng = createRng(11)
        for (let i = 0; i < 100; i++) {
            expect(rng.chance(0)).toBe(false)
            expect(rng.chance(1)).toBe(true)
        }
    })

    test("pick 空数组返回 undefined，否则返回成员", () => {
        const rng = createRng(13)
        expect(rng.pick([])).toBeUndefined()
        const items = ["a", "b", "c"]
        for (let i = 0; i < 50; i++) expect(items).toContain(rng.pick(items) as string)
    })

    test("shuffle 不修改入参且可复现", () => {
        const source = [1, 2, 3, 4, 5, 6, 7, 8]
        const a = createRng(17).shuffle(source)
        const b = createRng(17).shuffle(source)
        expect(a).toEqual(b)
        expect(source).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
        expect(a.slice().sort((x, y) => x - y)).toEqual(source)
    })

    test("fork 按标签确定派生", () => {
        expect(createRng(5).fork("crit").nextUint32()).toBe(createRng(5).fork("crit").nextUint32())
        expect(createRng(5).fork("crit").nextUint32()).not.toBe(createRng(5).fork("proc").nextUint32())
        expect(hashLabel("crit")).toBe(hashLabel("crit"))
    })

    test("非有限 seed 直接报错", () => {
        expect(() => createRng(Number.NaN)).toThrow()
        expect(() => createRng(Number.POSITIVE_INFINITY)).toThrow()
    })
})
