import { describe, expect, it } from "vitest"
import { CharBuild } from "../CharBuild"
import buffData from "../d/buff.data"
import modData from "../d/mod.data"
import { LeveledBuff, LeveledChar, LeveledMod, LeveledWeapon } from "../leveled"

/** 黎瑟（雷）+ 同源武器：与 CharBuildModEquip.test.ts 的 createTestBuild 同口径 */
function createBuild(options: { buffNames?: string[]; charMods?: number[] } = {}) {
    return new CharBuild({
        char: new LeveledChar("黎瑟"),
        skillLevel: 10,
        hpPercent: 0.5,
        resonanceGain: 2,
        charMods: (options.charMods ?? []).map(id => new LeveledMod(id, 10)),
        buffs: (options.buffNames ?? []).map(name => new LeveledBuff(name, 10)),
        melee: new LeveledWeapon(10302),
        ranged: new LeveledWeapon(20601),
        baseName: "快速出击",
        enemyId: 130,
        enemyLevel: 80,
        enemyResistance: 0.5,
        targetFunction: "伤害",
    })
}

describe("BUFF 与 MOD 互斥（数据 `禁用`）", () => {
    it("数据里 `禁用` 引用的 MOD id 都存在", () => {
        const modIds = new Set(modData.map(mod => mod.id))
        for (const buff of buffData) {
            for (const id of buff.禁用 ?? []) {
                expect(modIds.has(id), `${buff.名称} 引用了不存在的 MOD ${id}`).toBe(true)
            }
        }
    })

    it("全盛·振奋：装备同名 MOD 后 BUFF 失效，不重复叠加增伤", () => {
        const buffOnly = createBuild({ buffNames: ["全盛·振奋"] })
        expect(buffOnly.calculateAttributes().增伤).toBeCloseTo(0.2, 10)

        const modOnly = createBuild({ charMods: [51445] }).calculateAttributes()
        const both = createBuild({ buffNames: ["全盛·振奋"], charMods: [51445] }).calculateAttributes()
        // 命中互斥：带 BUFF + MOD 与只带 MOD 完全一致（BUFF 的 20% 不再叠加）
        expect(both.增伤).toBeCloseTo(modOnly.增伤, 10)
        expect(both.增伤).toBeCloseTo(0.2, 10)
    })

    it("海妖 / 换生灵：昂扬 BUFF 被两种 MOD 同时禁用", () => {
        const build = createBuild({ buffNames: ["羽翼·鼓舞·昂扬(雷)"] })
        const buff = build.buffs.find(item => item.名称 === "羽翼·鼓舞·昂扬(雷)")!
        expect(build.isBuffDisabled(buff)).toBe(false)
        // 换生灵「昂扬」
        expect(createBuild({ charMods: [56143] }).isBuffDisabled(buff)).toBe(true)
        // 海妖「羽翼·鼓舞·昂扬」
        expect(createBuild({ charMods: [56144] }).isBuffDisabled(buff)).toBe(true)
        // 同系列但不是同一增益（决断）不禁用
        expect(createBuild({ charMods: [56141] }).isBuffDisabled(buff)).toBe(false)
    })

    it("findBuffDisablingMod 返回命中的已装备 MOD", () => {
        const build = createBuild({ buffNames: ["羽翼·鼓舞·昂扬(雷)"], charMods: [56144] })
        const buff = build.buffs.find(item => item.名称 === "羽翼·鼓舞·昂扬(雷)")!
        expect(build.findBuffDisablingMod(buff)?.id).toBe(56144)
        const clean = createBuild({ buffNames: ["羽翼·鼓舞·昂扬(雷)"] })
        expect(clean.findBuffDisablingMod(clean.buffs[0])).toBeUndefined()
    })

    it("自动构筑口径：会禁用已有 BUFF 的 MOD 收益更低", () => {
        const mod = new LeveledMod(51445, 10)
        // calcIncome 走 tempMod，口径与 autoBuild 追加候选一致
        const incomeWithBuff = createBuild({ buffNames: ["全盛·振奋"] }).calcIncome(mod, false)
        const incomeWithoutBuff = createBuild().calcIncome(mod, false)
        expect(incomeWithBuff).toBeLessThan(incomeWithoutBuff)
    })
})
