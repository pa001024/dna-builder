import { describe, expect, it } from "vitest"
import { CharBuild } from "../CharBuild"
import { LeveledChar, LeveledMod, LeveledWeapon } from "../leveled"

/** 黎瑟（雷）+ 铸铁者（重剑/切割）+ 烈焰孤沙：与 CharBuild.test.ts 的 createCharBuild 同源 */
function createTestBuild() {
    return new CharBuild({
        char: new LeveledChar("黎瑟"),
        skillLevel: 10,
        hpPercent: 0.5,
        resonanceGain: 2,
        charMods: [],
        buffs: [],
        melee: new LeveledWeapon(10302),
        ranged: new LeveledWeapon(20601),
        baseName: "快速出击",
        enemyId: 130,
        enemyLevel: 80,
        enemyResistance: 0.5,
        targetFunction: "伤害",
    })
}

describe("MOD 可装备口径（CharBuild 原生能力）", () => {
    describe("modExclusionGroup", () => {
        it("新版囚狼自成一组，旧版囚狼不参与互斥", () => {
            expect(CharBuild.modExclusionGroup(new LeveledMod(103001))).toEqual(["囚狼1"])
            expect(CharBuild.modExclusionGroup(new LeveledMod(32201))).toEqual(["囚狼"])
        })
        it("换生灵与海妖共同互斥：两侧归一到同一组", () => {
            expect(CharBuild.modExclusionGroup(new LeveledMod(31301))).toEqual(["换生灵", "海妖"])
            expect(CharBuild.modExclusionGroup(new LeveledMod(56111))).toEqual(["换生灵", "海妖"])
        })
        it("其余系列自成一组", () => {
            expect(CharBuild.modExclusionGroup(new LeveledMod(41001))).toEqual(["不死鸟"])
        })
        it("与实例 excludeSeries 同源（同一规则的两面）", () => {
            for (const id of [103001, 32201, 31301, 56111, 41001]) {
                const inst = new LeveledMod(id)
                expect(inst.excludeSeries).toEqual(CharBuild.modExclusionGroup(inst))
            }
        })
    })

    describe("collectModOccupancy", () => {
        it("跳过空槽与整套缺失", () => {
            const occupancy = CharBuild.collectModOccupancy([null, undefined], undefined)
            expect(occupancy.series.size).toBe(0)
            expect(occupancy.names.size).toBe(0)
            expect(occupancy.counts.size).toBe(0)
        })
        it("互斥系列按 excludeSeries 展开记录", () => {
            const occupancy = CharBuild.collectModOccupancy([new LeveledMod(31301)])
            expect(occupancy.series.has("海妖")).toBe(true)
            expect(occupancy.series.has("换生灵")).toBe(true)
            expect(occupancy.names.has("羽翼·鼓舞")).toBe(true)
            expect(occupancy.counts.get(31301)).toBe(1)
        })
        it("契约者不记入名称互斥但计入数量", () => {
            const occupancy = CharBuild.collectModOccupancy([new LeveledMod(41741)])
            expect(occupancy.names.has("炽灼·涅槃")).toBe(false)
            expect(occupancy.counts.get(41741)).toBe(1)
        })
        it("多套列表合并计数", () => {
            const occupancy = CharBuild.collectModOccupancy([new LeveledMod(41001)], [new LeveledMod(41001)])
            expect(occupancy.counts.get(41001)).toBe(2)
        })
        it("旧版囚狼不产生系列占用", () => {
            const occupancy = CharBuild.collectModOccupancy([new LeveledMod(32201)])
            expect(occupancy.series.size).toBe(0)
            expect(occupancy.names.has("连环")).toBe(true)
        })
    })

    describe("isModSlotCompatible", () => {
        it("光环系列不占用普通槽位", () => {
            const build = createTestBuild()
            expect(build.isModSlotCompatible(new LeveledMod(31502), "charMods")).toBe(false)
            expect(build.isModSlotCompatible(new LeveledMod(31502), "meleeMods")).toBe(false)
        })
        it("槽位类型必须匹配", () => {
            const build = createTestBuild()
            expect(build.isModSlotCompatible(new LeveledMod(103001), "charMods")).toBe(false)
            expect(build.isModSlotCompatible(new LeveledMod(41001), "meleeMods")).toBe(false)
        })
        it("同律槽兼容两种子类型", () => {
            const build = createTestBuild()
            expect(build.isModSlotCompatible(new LeveledMod(14001), "skillMods")).toBe(true)
            expect(build.isModSlotCompatible(new LeveledMod(15001), "skillMods")).toBe(true)
        })
        it("元素属性 MOD 仅限同属性角色", () => {
            const build = createTestBuild()
            expect(build.isModSlotCompatible(new LeveledMod(11404), "charMods")).toBe(true)
            expect(build.isModSlotCompatible(new LeveledMod(11401), "charMods")).toBe(false)
        })
        it("角色限定支持 id / 名称 / 属性三种写法", () => {
            const build = createTestBuild()
            const base = { 名称: "探针", 系列: "探针", 类型: "角色" }
            expect(build.isModSlotCompatible({ ...base, id: 1, 限定: 4101 }, "charMods")).toBe(true)
            expect(build.isModSlotCompatible({ ...base, id: 2, 限定: 1504 }, "charMods")).toBe(false)
            expect(build.isModSlotCompatible({ ...base, id: 3, 限定: "黎瑟" }, "charMods")).toBe(true)
            expect(build.isModSlotCompatible({ ...base, id: 4, 限定: "雷" }, "charMods")).toBe(true)
            expect(build.isModSlotCompatible({ ...base, id: 5, 限定: "别人" }, "charMods")).toBe(false)
        })
        it("武器限定按类别或伤害类型匹配", () => {
            const build = createTestBuild()
            // 锋锐限定切割：近战（铸铁者/切割）可装，远程（烈焰孤沙/贯穿）不可装
            expect(build.isModSlotCompatible(new LeveledMod(12101), "meleeMods")).toBe(true)
            expect(build.isModSlotCompatible(new LeveledMod(12101), "rangedMods")).toBe(false)
        })
    })

    describe("isModEquipable", () => {
        it("同名非契约者被拦，契约者同名豁免", () => {
            const build = createTestBuild()
            const occupancy = CharBuild.collectModOccupancy([new LeveledMod(31008)])
            expect(build.isModEquipable(new LeveledMod(31008), "charMods", occupancy)).toBe(false)
            // 41741 炽灼·涅槃（契约者/雷）：与已装同名但允许共存
            expect(build.isModEquipable(new LeveledMod(41741), "charMods", occupancy)).toBe(true)
            expect(build.isModEquipable(new LeveledMod(41001), "charMods", occupancy)).toBe(true)
        })
        it("互斥系列整体被拦（含换生灵→海妖反向）", () => {
            const build = createTestBuild()
            const occupancy = CharBuild.collectModOccupancy([new LeveledMod(31301)])
            // 56141 决断（换生灵/雷）：槽位兼容但系列被占
            expect(build.isModSlotCompatible(new LeveledMod(56141), "charMods")).toBe(true)
            expect(build.isModEquipable(new LeveledMod(56141), "charMods", occupancy)).toBe(false)
            expect(build.isModEquipable(new LeveledMod(51301), "charMods", occupancy)).toBe(false)
            expect(build.isModEquipable(new LeveledMod(41001), "charMods", occupancy)).toBe(true)
            // 反向：已装换生灵时，海妖候选同样被拦（共同互斥，双向成立）
            const reverse = CharBuild.collectModOccupancy([new LeveledMod(56141)])
            expect(build.isModEquipable(new LeveledMod(51301), "charMods", reverse)).toBe(false)
            expect(build.isModEquipable(new LeveledMod(31301), "charMods", reverse)).toBe(false)
        })
        it("新版囚狼互斥，旧版囚狼不受影响", () => {
            const build = createTestBuild()
            const occupancy = CharBuild.collectModOccupancy([new LeveledMod(103001)])
            expect(build.isModEquipable(new LeveledMod(103002), "meleeMods", occupancy)).toBe(false)
            expect(build.isModEquipable(new LeveledMod(32201), "meleeMods", occupancy)).toBe(true)
        })
        it("数量达到上限后被拦", () => {
            const build = createTestBuild()
            const occupancy = CharBuild.collectModOccupancy([new LeveledMod(41741)])
            expect(build.isModEquipable(new LeveledMod(41741), "charMods", occupancy, 1)).toBe(false)
            expect(build.isModEquipable(new LeveledMod(41741), "charMods", occupancy, 2)).toBe(true)
        })
        it("缺省占用取构筑自身槽位", () => {
            const build = createTestBuild()
            build.charMods = [new LeveledMod(31008)]
            expect(build.isModEquipable(new LeveledMod(31008), "charMods")).toBe(false)
            expect(build.isModEquipable(new LeveledMod(41001), "charMods")).toBe(true)
        })
    })

    describe("filterEquipableMods", () => {
        it("同一口径批量过滤并保持原顺序", () => {
            const build = createTestBuild()
            const candidates = [new LeveledMod(41001), new LeveledMod(31008), new LeveledMod(41741), new LeveledMod(31502)]
            const result = build.filterEquipableMods(candidates, "charMods", { equipped: [[new LeveledMod(31008)]] })
            // 31008 同名被拦，31502 光环被拦，其余保留原顺序
            expect(result.map(mod => mod.id)).toEqual([41001, 41741])
        })
        it("极性过滤", () => {
            const build = createTestBuild()
            const candidates = [new LeveledMod(41001), new LeveledMod(41002), new LeveledMod(41003)]
            expect(build.filterEquipableMods(candidates, "charMods", { polarity: "D" }).map(mod => mod.id)).toEqual([41002, 41003])
        })
        it("可用数量回调参与判定", () => {
            const build = createTestBuild()
            const equipped = [new LeveledMod(41741)]
            const candidates = [new LeveledMod(41741)]
            expect(build.filterEquipableMods(candidates, "charMods", { equipped: [equipped], getAvailableCount: () => 1 })).toHaveLength(0)
            expect(build.filterEquipableMods(candidates, "charMods", { equipped: [equipped], getAvailableCount: () => 5 })).toHaveLength(1)
        })
        it("预计算占用优先于已装备列表", () => {
            const build = createTestBuild()
            const candidates = [new LeveledMod(31008)]
            const result = build.filterEquipableMods(candidates, "charMods", {
                occupancy: CharBuild.collectModOccupancy([]),
                equipped: [[new LeveledMod(31008)]],
            })
            expect(result.map(mod => mod.id)).toEqual([31008])
        })
    })
})
