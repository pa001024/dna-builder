import { describe, expect, it } from "vitest"
import type { AbyssDungeon } from "@/data"
import { formatAbyssDungeonMbValue, hasAbyssDungeonMaxMb } from "./dungeon-utils"

describe("hasAbyssDungeonMaxMb", () => {
    it("应该识别 400% 属性加成", () => {
        const dungeon = {
            id: 1,
            did: 1,
            b: [],
            m: [],
            mb: {
                光: 4,
            },
        } as AbyssDungeon

        expect(hasAbyssDungeonMaxMb(dungeon)).toBe(true)
    })

    it("应该识别普通属性加成", () => {
        const dungeon = {
            id: 1,
            did: 1,
            b: [],
            m: [],
            mb: {
                光: 2,
            },
        } as AbyssDungeon

        expect(hasAbyssDungeonMaxMb(dungeon)).toBe(false)
    })
})

describe("formatAbyssDungeonMbValue", () => {
    it("当存在 400% 时，空值应该按 -50% 展示", () => {
        const dungeon = {
            id: 1,
            did: 1,
            b: [],
            m: [],
            mb: {
                光: 4,
                火: 1.5,
            },
        } as AbyssDungeon

        expect(formatAbyssDungeonMbValue(dungeon, "光")).toBe("400%")
        expect(formatAbyssDungeonMbValue(dungeon, "火")).toBe("150%")
        expect(formatAbyssDungeonMbValue(dungeon, "雷")).toBe("-50%")
    })

    it("当不存在 400% 时，空值应该显示占位符", () => {
        const dungeon = {
            id: 1,
            did: 1,
            b: [],
            m: [],
            mb: {
                光: 2,
            },
        } as AbyssDungeon

        expect(formatAbyssDungeonMbValue(dungeon, "光")).toBe("200%")
        expect(formatAbyssDungeonMbValue(dungeon, "雷")).toBe("--")
    })
})
