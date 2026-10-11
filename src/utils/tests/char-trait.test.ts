import { describe, expect, it } from "vitest"
import type { Char } from "@/data/data-types"
import {
    buildCharTraitDirectory,
    charTraitEntries,
    getCharsByTraitName,
    getCharTraitByName,
    getCharTraitGroupName,
    getCharTraitIconUrl,
} from "@/utils/char-trait"

const mockChars: Char[] = [
    {
        id: 1,
        名称: "甲",
        属性: "火",
        精通: ["单手剑"],
        基础攻击: 10,
        基础生命: 100,
        基础护盾: 10,
        基础防御: 10,
        基础神智: 10,
        技能: [],
        特质: [
            { 名称: "冒险家", 描述: "擅长战斗。", icon: "T_Dispatch_A09", 标签: "Battle", 等级: 1, 解锁: [0] },
            { 名称: "拾穗者", 描述: "擅长采集。", icon: "T_Dispatch_A03", 标签: "Collect", 等级: 2, 解锁: [0, 4] },
        ],
    },
    {
        id: 2,
        名称: "乙",
        属性: "水",
        精通: ["双枪"],
        基础攻击: 10,
        基础生命: 100,
        基础护盾: 10,
        基础防御: 10,
        基础神智: 10,
        技能: [],
        特质: [{ 名称: "冒险家", 描述: "擅长战斗。", icon: "T_Dispatch_A09", 标签: "Battle", 等级: 1, 解锁: [2] }],
    },
    {
        id: 3,
        名称: "丙",
        属性: "雷",
        精通: ["太刀"],
        基础攻击: 10,
        基础生命: 100,
        基础护盾: 10,
        基础防御: 10,
        基础神智: 10,
        技能: [],
    },
]

describe("buildCharTraitDirectory", () => {
    it("同名特质合并并记录所属角色", () => {
        const entries = buildCharTraitDirectory(mockChars)
        expect(entries.map(entry => entry.name)).toEqual(["冒险家", "拾穗者"])
        const adv = entries.find(entry => entry.name === "冒险家")
        expect(adv?.owners.map(owner => owner.charId)).toEqual([1, 2])
        expect(adv?.owners[1]).toMatchObject({ charName: "乙", level: 1, unlock: [2] })
    })

    it("无特质角色不产生条目", () => {
        const entries = buildCharTraitDirectory(mockChars)
        expect(entries.every(entry => entry.owners.length > 0)).toBe(true)
    })
})

describe("charTraitEntries", () => {
    it("全量目录非空且 owners 按角色 id 排序", () => {
        expect(charTraitEntries.length).toBeGreaterThan(0)
        for (const entry of charTraitEntries) {
            const ids = entry.owners.map(owner => owner.charId)
            expect([...ids].sort((a, b) => a - b)).toEqual(ids)
        }
    })

    it("反向查询与按名查询一致", () => {
        const first = charTraitEntries[0]
        expect(getCharTraitByName(first.name)?.owners).toEqual(getCharsByTraitName(first.name))
        expect(getCharTraitByName("不存在的特质")).toBeNull()
        expect(getCharsByTraitName("不存在的特质")).toEqual([])
    })
})

describe("char-trait style helpers", () => {
    it("分组与图标地址符合约定", () => {
        expect(getCharTraitGroupName("Battle")).toBe("Red")
        expect(getCharTraitGroupName("Lucky")).toBe("Special")
        expect(getCharTraitGroupName("Unknown")).toBe("Other")
        expect(getCharTraitIconUrl("T_Dispatch_A09")).toBe("/imgs/webp/T_Dispatch_A09.webp")
    })
})
