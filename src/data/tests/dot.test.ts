import { describe, expect, it } from "vitest"
import { CharBuild, type CharBuildOptions, type DotFrequencySettings } from "../CharBuild"
import { createBuffFromSettings } from "../CharBuildHelper"
import type { Weapon } from "../data-types"
import { LeveledBuff, LeveledChar, LeveledMod, LeveledWeapon } from "../leveled"

/**
 * 构造测试用武器：自定义基础触发与追加伤害，避免依赖真实武器表数值。
 * @param name 武器名称
 * @param trigger 基础触发（可溢出，测试 min 处理）
 * @returns 等级化武器实例
 */
function mkWeapon(name: string, trigger: number): LeveledWeapon {
    const data: Weapon = {
        id: 99999,
        名称: name,
        类型: ["近战", "长柄"],
        伤害类型: "切割",
        攻击: 100,
        暴击: 0.05,
        暴伤: 1.5,
        触发: trigger,
        描述: "",
        加成: {},
        熔炼: [],
        技能: [],
    }
    return new LeveledWeapon(data)
}

/**
 * 构造 DOT 测试构筑（默认 黎瑟=雷(非光暗)、双武器满触发、技能触发 0、无 BUFF）。
 * @param overrides 构筑参数覆盖
 * @returns 构筑实例
 */
function createDotBuild(overrides: Partial<CharBuildOptions> = {}) {
    const char = new LeveledChar("黎瑟")
    const options: CharBuildOptions = {
        char,
        skillLevel: 10,
        hpPercent: 1,
        resonanceGain: 3,
        charMods: [],
        buffs: [],
        melee: mkWeapon("测试近战", 1),
        ranged: mkWeapon("测试远程", 1),
        baseName: char.技能[0].名称,
        enemyId: 130,
        enemyLevel: 80,
        enemyResistance: 0,
        targetFunction: "伤害",
        dotSettings: { skill: 0, melee: 0, ranged: 0, skillweapon: 0 },
        ...overrides,
    }
    return new CharBuild(options)
}

describe("DOT计算", () => {
    describe("技能触发字段", () => {
        it("默认技能触发为 0", () => {
            const build = createDotBuild()
            expect(build.calculateAttributes().技能触发).toBe(0)
            expect(build.calculateDotFrequencies().sources[0].hidden).toBe(true)
        })

        it("充盈·巧力(紫 41317) patch 后技能触发为 54%", () => {
            const build = createDotBuild({ charMods: [new LeveledMod(41317)] })
            expect(build.calculateAttributes().技能触发).toBeCloseTo(0.54, 6)
        })

        it("充盈·巧力(金 51317) patch 后技能触发为 100%", () => {
            const build = createDotBuild({ charMods: [new LeveledMod(51317)] })
            expect(build.calculateAttributes().技能触发).toBeCloseTo(1, 6)
        })
    })

    describe("上限与触发", () => {
        it("上限 = 1/(0.4×触发)，触发 1 → 2.5 次/秒", () => {
            const build = createDotBuild({ charMods: [new LeveledMod(51317)] })
            const freqs = build.calculateDotFrequencies()
            expect(freqs.sources[0].trigger).toBeCloseTo(1, 6)
            expect(freqs.sources[0].cap).toBeCloseTo(2.5, 6)
            expect(freqs.sources[1].cap).toBeCloseTo(2.5, 6)
        })

        it("技能触发 0.54 → 上限 ≈ 4.63 次/秒", () => {
            const build = createDotBuild({ charMods: [new LeveledMod(41317)] })
            const freqs = build.calculateDotFrequencies()
            expect(freqs.sources[0].cap).toBeCloseTo(1 / (0.4 * 0.54), 6)
        })

        it("武器触发读取 min(触发,1)，触发溢出 250% 按 100% 计算", () => {
            const build = createDotBuild({ melee: mkWeapon("测试近战", 2.5) })
            const freqs = build.calculateDotFrequencies()
            expect(freqs.sources[1].trigger).toBe(1)
            expect(freqs.sources[1].cap).toBeCloseTo(2.5, 6)
        })

        it("武器触发为 0 时隐藏滑块（防止除零）", () => {
            const build = createDotBuild({ melee: mkWeapon("测试近战", 0), ranged: mkWeapon("测试远程", 0) })
            const freqs = build.calculateDotFrequencies()
            expect(freqs.sources[1].hidden).toBe(true)
            expect(freqs.sources[2].hidden).toBe(true)
            expect(freqs.cap).toBe(0)
        })

        it("用户输入频率可高于上限，但计算频率仍受上限约束", () => {
            const build = createDotBuild({
                charMods: [new LeveledMod(51317)],
                dotSettings: { skill: 99, melee: 99, ranged: 99 },
            })
            const freqs = build.calculateDotFrequencies()
            expect(freqs.sources[0].freq).toBeCloseTo(99, 6)
            expect(freqs.sources[1].freq).toBeCloseTo(99, 6)
            expect(freqs.sources[0].effectiveFreq).toBeCloseTo(2.5, 6)
            expect(freqs.sources[1].effectiveFreq).toBeCloseTo(2.5, 6)
        })
    })

    describe("共享上限（角色自身属性 DOT）", () => {
        it("技能/近战/远程 均满触发：技能2.5 近战1 远程1 → 角色自身属性2.5 其余属性0", () => {
            const build = createDotBuild({
                charMods: [new LeveledMod(51317)],
                dotSettings: { skill: 2.5, melee: 1, ranged: 1 },
            })
            const freqs = build.calculateDotFrequencies()
            expect(freqs.ownFreq).toBeCloseTo(2.5, 6)
            // 无异常数量 buff（异常数量=1）时无其余属性：n-1 = 0
            expect(freqs.otherFreq).toBeCloseTo(0, 6)
            expect(freqs.totalFreq).toBeCloseTo(2.5, 6)
            // 技能达到上限后，武器伤害的角色自身属性 DOT 部分视为 0
            expect(freqs.sources[0].ownFreq).toBeCloseTo(2.5, 6)
            expect(freqs.sources[1].ownFreq).toBeCloseTo(0, 6)
            expect(freqs.sources[2].ownFreq).toBeCloseTo(0, 6)
            // 其余属性无异常 buff 时由武器提供 0
            expect(freqs.sources[1].otherFreq).toBeCloseTo(0, 6)
            expect(freqs.sources[2].otherFreq).toBeCloseTo(0, 6)
        })

        it("技能未达上限时武器自身属性部分补充到共享上限", () => {
            const build = createDotBuild({
                charMods: [new LeveledMod(51317)],
                dotSettings: { skill: 1, melee: 2.5, ranged: 2.5 },
            })
            const freqs = build.calculateDotFrequencies()
            // 共享上限 2.5：技能 1 → 近战 1.5 → 远程 0
            expect(freqs.ownFreq).toBeCloseTo(2.5, 6)
            expect(freqs.sources[1].ownFreq).toBeCloseTo(1.5, 6)
            expect(freqs.sources[2].ownFreq).toBeCloseTo(0, 6)
        })

        it("共享上限取各来源上限最大值", () => {
            // 技能触发 0.54（上限≈4.63）高于武器上限 2.5
            const build = createDotBuild({
                charMods: [new LeveledMod(41317)],
                dotSettings: { skill: 2, melee: 2.5, ranged: 2.5 },
            })
            const freqs = build.calculateDotFrequencies()
            expect(freqs.cap).toBeCloseTo(1 / (0.4 * 0.54), 6)
            // 填充顺序 技能→近战→远程：技能 2 → 近战 2.5 → 远程 余量 0.13，共 4.63
            expect(freqs.ownFreq).toBeCloseTo(1 / (0.4 * 0.54), 6)
            expect(freqs.sources[1].ownFreq).toBeCloseTo(2.5, 6)
        })
    })

    describe("其余属性元素种数（异常数量）", () => {
        it("基础异常数量为 1，武器其余属性 0 种（n-1=0）", () => {
            const build = createDotBuild()
            expect(build.calculateAttributes().异常数量).toBe(1)
            expect(build.calculateDotFrequencies().sources[1].otherElementCount).toBe(0)
        })

        it("菲娜Q 追加异常数量 4：非光暗角色与附加异常重叠 1 种 → n=4、其余属性 n-1=3 种", () => {
            const build = createDotBuild({ buffs: [new LeveledBuff("菲娜Q")] })
            // 黎瑟=雷(非光暗)：自身属性与菲娜Q 的水/火/雷/风重叠 → 去重后 n=4
            expect(build.calculateAttributes().异常数量).toBe(4)
            const freqs = build.calculateDotFrequencies()
            expect(freqs.sources[1].otherElementCount).toBe(3)
            expect(freqs.sources[2].otherElementCount).toBe(3)
        })

        it("光/暗角色不重叠 → n=5、其余属性 n-1=4 种", () => {
            const char = new LeveledChar("菲娜")
            const build = createDotBuild({ char, buffs: [new LeveledBuff("菲娜Q")] })
            expect(build.char.属性).toBe("光")
            expect(build.calculateAttributes().异常数量).toBe(5)
            const freqs = build.calculateDotFrequencies()
            expect(freqs.sources[1].otherElementCount).toBe(4)
        })

        it("其余属性频率 = 武器有效频率 × 元素种数（非光暗 n-1=3）", () => {
            const build = createDotBuild({
                buffs: [new LeveledBuff("菲娜Q")],
                dotSettings: { skill: 0, melee: 1, ranged: 0 },
            })
            const freqs = build.calculateDotFrequencies()
            expect(freqs.sources[1].otherFreq).toBeCloseTo(6, 6)
            expect(freqs.otherFreq).toBeCloseTo(6, 6)
        })
    })

    describe("其余属性抗性反转（怪物抗性不为 0）", () => {
        it("负抗 -4：全部其余属性按翻转抗性 0.5（等同转属逆整体效果）", () => {
            const build = createDotBuild({
                buffs: [new LeveledBuff("菲娜Q")],
                dotSettings: { skill: 0, melee: 1, ranged: 0 },
                enemyResistance: -4,
            })
            const attrs = build.calculateWeaponAttributes()
            const freqs = build.calculateDotFrequencies()
            // 总追加伤害 > 0 时频率翻倍：ownFreq=2、otherFreq=6
            expect(freqs.ownFreq).toBeCloseTo(2, 6)
            expect(freqs.otherFreq).toBeCloseTo(6, 6)
            const base = attrs.攻击 * 0.2 * 6 * 3 * (1 + attrs.充盈威力)
            const penetration = 1 + (attrs.属性穿透 || 0)
            // 角色自身属性按正常抗性区 factor(-4)=5；其余属性全部按 0.5
            const expected = base * (freqs.ownFreq * Math.max(0, 1 - -4) + freqs.otherFreq * 0.5) * penetration
            expect(build.calculateDotDamage()).toBeCloseTo(expected, 6)
        })

        it("正抗 0.5：其中一种其余属性做 -4（因子 5），其余 n-1 种保持原抗性（0.5×3 → 5+0.5×2）", () => {
            const build = createDotBuild({
                buffs: [new LeveledBuff("菲娜Q")],
                dotSettings: { skill: 0, melee: 1, ranged: 0 },
                enemyResistance: 0.5,
            })
            const attrs = build.calculateWeaponAttributes()
            const freqs = build.calculateDotFrequencies()
            const base = attrs.攻击 * 0.2 * 6 * 3 * (1 + attrs.充盈威力)
            const penetration = 1 + (attrs.属性穿透 || 0)
            // 其余属性 3 种：原 0.5×3 = 1.5 → 5 + 0.5×2 = 6（每单位频率等效因子 = 6/3 = 2）
            const otherZone = (Math.max(0, 1 - -4) + Math.max(0, 1 - 0.5) * 2) / 3
            expect(otherZone).toBeCloseTo(2, 6)
            const expected = base * (freqs.ownFreq * Math.max(0, 1 - 0.5) + freqs.otherFreq * otherZone) * penetration
            expect(build.calculateDotDamage()).toBeCloseTo(expected, 6)
            // 其余属性贡献 = 12 × base × penetration（频率翻倍后为 6×2）
            expect(base * freqs.otherFreq * otherZone * penetration).toBeCloseTo(base * 12 * penetration, 6)
        })

        it("0 抗：不反转，按正常抗性区（自身与其余属性同一因子）", () => {
            const build = createDotBuild({
                buffs: [new LeveledBuff("菲娜Q")],
                dotSettings: { skill: 0, melee: 1, ranged: 0 },
                enemyResistance: 0,
            })
            const attrs = build.calculateWeaponAttributes()
            const freqs = build.calculateDotFrequencies()
            const base = attrs.攻击 * 0.2 * 6 * 3 * (1 + attrs.充盈威力)
            const penetration = 1 + (attrs.属性穿透 || 0)
            const expected = base * freqs.totalFreq * penetration
            expect(build.calculateDotDamage()).toBeCloseTo(expected, 6)
        })

        it("命名空间分量同样按反转抗性区拆分（melee::DOT伤害）", () => {
            const build = createDotBuild({
                buffs: [new LeveledBuff("菲娜Q")],
                dotSettings: { skill: 0, melee: 1, ranged: 0 },
                enemyResistance: 0.5,
            })
            const attrs = build.calculateWeaponAttributes()
            const freqs = build.calculateDotFrequencies()
            const base = attrs.攻击 * 0.2 * 6 * 3 * (1 + attrs.充盈威力)
            const penetration = 1 + (attrs.属性穿透 || 0)
            // melee 分量 = 自身 1×0.5 + 其余 3×2
            const expected = base * (freqs.sources[1].ownFreq * 0.5 + freqs.sources[1].otherFreq * 2) * penetration
            expect(build.calculateDotDamage("melee")).toBeCloseTo(expected, 6)
            expect(build.evaluateAST("melee::DOT伤害")).toBeCloseTo(build.calculateDotDamage("melee"), 6)
        })

        it("光/暗角色（菲娜）正抗 0.5：n=5 → 其余 4 种，5 + 0.5×3 = 6.5", () => {
            const char = new LeveledChar("菲娜")
            const build = createDotBuild({
                char,
                buffs: [new LeveledBuff("菲娜Q")],
                dotSettings: { skill: 0, melee: 1, ranged: 0 },
                enemyResistance: 0.5,
            })
            const attrs = build.calculateWeaponAttributes()
            const freqs = build.calculateDotFrequencies()
            expect(freqs.sources[1].otherElementCount).toBe(4)
            const base = attrs.攻击 * 0.2 * 6 * 3 * (1 + attrs.充盈威力)
            const penetration = 1 + (attrs.属性穿透 || 0)
            const otherZone = (Math.max(0, 1 - -4) + Math.max(0, 1 - 0.5) * 3) / 4
            expect(otherZone).toBeCloseTo(1.625, 6)
            const expected = base * (freqs.ownFreq * Math.max(0, 1 - 0.5) + freqs.otherFreq * otherZone) * penetration
            expect(build.calculateDotDamage()).toBeCloseTo(expected, 6)
            // 其余属性贡献 = 6.5 × base × penetration（5+0.5×3）
            expect(base * freqs.otherFreq * otherZone * penetration).toBeCloseTo(base * 6.5 * penetration, 6)
        })
    })

    describe("追加伤害频率翻倍", () => {
        it("非光暗角色总追加伤害>0 时频率翻倍（不超过上限）", () => {
            const build = createDotBuild({
                buffs: [createBuffFromSettings("自定义BUFF", 1, [["追加伤害", 0.5]])],
                dotSettings: { skill: 0, melee: 1, ranged: 0 },
            })
            const freqs = build.calculateDotFrequencies()
            expect(freqs.sources[1].hasAdditionalDamage).toBe(true)
            expect(freqs.sources[1].doubled).toBe(true)
            expect(freqs.sources[1].effectiveFreq).toBeCloseTo(2, 6)
            // 无异常 buff 无其余属性：翻倍全部进入角色自身属性池
            expect(freqs.ownFreq).toBeCloseTo(2, 6)
            expect(freqs.otherFreq).toBeCloseTo(0, 6)
        })

        it("翻倍不能超过该来源上限", () => {
            const build = createDotBuild({
                buffs: [createBuffFromSettings("自定义BUFF", 1, [["追加伤害", 0.5]])],
                dotSettings: { skill: 0, melee: 1.5, ranged: 0 },
            })
            const freqs = build.calculateDotFrequencies()
            expect(freqs.sources[1].doubled).toBe(true)
            expect(freqs.sources[1].effectiveFreq).toBeCloseTo(2.5, 6)
        })

        it("非光暗角色总追加伤害>0 时即使异常数量>1 也翻倍", () => {
            const build = createDotBuild({
                buffs: [new LeveledBuff("菲娜Q"), createBuffFromSettings("自定义BUFF", 1, [["追加伤害", 0.5]])],
                dotSettings: { skill: 0, melee: 1, ranged: 0 },
            })
            const freqs = build.calculateDotFrequencies()
            expect(freqs.sources[1].hasAdditionalDamage).toBe(true)
            expect(freqs.sources[1].doubled).toBe(true)
            expect(freqs.sources[1].effectiveFreq).toBeCloseTo(2, 6)
        })

        it("光暗角色仅来源于 MOD 的追加伤害时频率翻倍", () => {
            const char = new LeveledChar("菲娜")
            const mod = new LeveledMod({
                id: 999902,
                icon: "Test02",
                名称: "测试追加伤害",
                版本: "1.0",
                系列: "测试",
                品质: "金",
                极性: "A",
                耐受: 15,
                类型: "角色",
                追加伤害: 0.5,
                效果: "测试追加伤害",
            })
            const build = createDotBuild({ char, charMods: [mod], dotSettings: { skill: 0, melee: 1, ranged: 0 } })
            const freqs = build.calculateDotFrequencies()
            expect(freqs.sources[1].hasAdditionalDamage).toBe(true)
            expect(freqs.sources[1].doubled).toBe(true)
            expect(freqs.sources[1].effectiveFreq).toBeCloseTo(2, 6)
        })

        it("光暗角色仅有 BUFF 追加伤害时不翻倍", () => {
            const char = new LeveledChar("菲娜")
            const build = createDotBuild({
                char,
                buffs: [createBuffFromSettings("自定义BUFF", 1, [["追加伤害", 0.5]])],
                dotSettings: { skill: 0, melee: 1, ranged: 0 },
            })
            const freqs = build.calculateDotFrequencies()
            expect(freqs.sources[1].hasAdditionalDamage).toBe(false)
            expect(freqs.sources[1].doubled).toBe(false)
            expect(freqs.sources[1].effectiveFreq).toBeCloseTo(1, 6)
        })

        it("光暗角色手动设置有自属性追加伤害时翻倍", () => {
            const char = new LeveledChar("菲娜")
            const build = createDotBuild({
                char,
                dotSettings: { skill: 0, melee: 1, ranged: 0, forceOwnAdditionalDamage: true },
            })
            const freqs = build.calculateDotFrequencies()
            expect(freqs.sources[1].hasAdditionalDamage).toBe(true)
            expect(freqs.sources[1].doubled).toBe(true)
            expect(freqs.sources[1].effectiveFreq).toBeCloseTo(2, 6)
        })
    })

    describe("DOT伤害公式", () => {
        it("每秒DOT伤害 = 攻击×0.2×6×3×(1+充盈威力)×(自身频率×正常抗性区 + 其余频率×反转抗性区)", () => {
            const build = createDotBuild({
                charMods: [new LeveledMod(51317)],
                dotSettings: { skill: 2.5, melee: 1, ranged: 1 },
            })
            const attrs = build.calculateWeaponAttributes()
            const freqs = build.calculateDotFrequencies()
            // 敌人抗性 0：正常抗性区 = 1+属性穿透，反转抗性区 = 1+属性穿透（无反转）
            const penetration = 1 + (attrs.属性穿透 || 0)
            const expected = attrs.攻击 * 0.2 * 6 * 3 * (1 + (attrs.充盈威力 || 0)) * (freqs.ownFreq + freqs.otherFreq) * penetration
            expect(build.calculateDotDamage()).toBeCloseTo(expected, 6)
        })

        it("未配置任何 DOT 频率时伤害为 0", () => {
            const build = createDotBuild()
            expect(build.calculateDotDamage()).toBe(0)
        })

        it("充盈威力参与 DOT 乘区（51317 提供 5.5）", () => {
            const build = createDotBuild({
                charMods: [new LeveledMod(51317)],
                dotSettings: { skill: 2.5, melee: 0, ranged: 0 },
            })
            const attrs = build.calculateWeaponAttributes()
            expect(attrs.充盈威力).toBeCloseTo(5.5, 6)
            const noFullness = createDotBuild({
                charMods: [new LeveledMod(41317)],
                dotSettings: { skill: 2.5, melee: 0, ranged: 0 },
            })
            // 充盈威力参与：(1+充盈威力) 乘区不同 → 伤害不同
            expect(build.calculateDotDamage()).toBeGreaterThan(noFullness.calculateDotDamage())
        })
    })

    describe("表达式引用（命名空间）", () => {
        it("DOT伤害 无命名空间 = 全部来源", () => {
            const build = createDotBuild({
                charMods: [new LeveledMod(51317)],
                dotSettings: { skill: 2.5, melee: 1, ranged: 1 },
            })
            expect(build.evaluateAST("DOT伤害")).toBeCloseTo(build.calculateDotDamage(), 6)
        })

        it("角色::DOT伤害 只计算技能分量", () => {
            const build = createDotBuild({
                charMods: [new LeveledMod(51317)],
                dotSettings: { skill: 2.5, melee: 1, ranged: 1 },
            })
            expect(build.evaluateAST("角色::DOT伤害")).toBeCloseTo(build.calculateDotDamage("角色"), 6)
            // 技能分量 = 角色自身属性 2.5（技能占满共享上限）
            const attrs = build.calculateWeaponAttributes()
            const resistanceZone = Math.max(0, 1 + (attrs.属性穿透 || 0))
            expect(build.calculateDotDamage("角色")).toBeCloseTo(attrs.攻击 * 0.2 * 6 * 3 * (1 + attrs.充盈威力) * 2.5 * resistanceZone, 6)
        })

        it("melee::DOT伤害 只计算近战分量（自身属性部分 + 其余属性部分）", () => {
            // 技能 1 + 近战 1.5：共享上限 2.5 内，近战自身属性部分 = 1.5；无异常 buff 其余属性为 0
            const build = createDotBuild({
                charMods: [new LeveledMod(51317)],
                dotSettings: { skill: 1, melee: 1.5, ranged: 0 },
            })
            expect(build.evaluateAST("melee::DOT伤害")).toBeCloseTo(build.calculateDotDamage("melee"), 6)
            // 近战分量 = 自身属性 1.5 + 其余属性 0
            const attrs = build.calculateWeaponAttributes()
            const resistanceZone = Math.max(0, 1 + (attrs.属性穿透 || 0))
            expect(build.calculateDotDamage("melee")).toBeCloseTo(attrs.攻击 * 0.2 * 6 * 3 * (1 + attrs.充盈威力) * 1.5 * resistanceZone, 6)
        })

        it("ranged::DOT伤害 与中文别名 近战::/远程:: 均可用", () => {
            // 技能 1 + 远程 1.5：共享上限 2.5 内，远程自身属性部分 = 1.5；近战未配置为 0
            const build = createDotBuild({
                charMods: [new LeveledMod(51317)],
                dotSettings: { skill: 1, melee: 0, ranged: 1.5 },
            })
            expect(build.evaluateAST("ranged::DOT伤害")).toBeCloseTo(build.calculateDotDamage("ranged"), 6)
            expect(build.evaluateAST("近战::DOT伤害")).toBeCloseTo(build.calculateDotDamage("melee"), 6)
            expect(build.evaluateAST("远程::DOT伤害")).toBeCloseTo(build.calculateDotDamage("ranged"), 6)
            // 近战未配置 → 0
            expect(build.calculateDotDamage("melee")).toBe(0)
        })

        it("各命名空间之和 = 全部 DOT 伤害", () => {
            const build = createDotBuild({
                charMods: [new LeveledMod(51317)],
                dotSettings: { skill: 2.5, melee: 1, ranged: 1 },
            })
            const sum = build.evaluateAST("角色::DOT伤害+melee::DOT伤害+ranged::DOT伤害")
            expect(sum).toBeCloseTo(build.calculateDotDamage(), 6)
        })

        it("表达式可参与运算且 validateAST 校验通过", () => {
            const build = createDotBuild({
                charMods: [new LeveledMod(51317)],
                dotSettings: { skill: 2.5, melee: 1, ranged: 1 },
            })
            expect(build.validateAST("DOT伤害")).toBeUndefined()
            expect(build.validateAST("角色::DOT伤害+melee::DOT伤害")).toBeUndefined()
            expect(build.validateAST("DOT伤害*2+melee::DOT伤害")).toBeUndefined()
            expect(build.evaluateAST("DOT伤害*2")).toBeCloseTo(build.calculateDotDamage() * 2, 6)
        })

        it("DOT伤害 可作为自定义变量被引用", () => {
            const build = createDotBuild({
                charMods: [new LeveledMod(51317)],
                dotSettings: { skill: 2.5, melee: 1, ranged: 1 },
                customVariables: [["DOT总量", "DOT伤害"]],
            })
            expect(build.evaluateAST("DOT总量")).toBeCloseTo(build.calculateDotDamage(), 6)
        })
    })

    describe("同律武器 DOT", () => {
        /**
         * 构造贝蕾妮卡（暗、同律武器「伊弥尔」触发 0.5）测试构筑。
         * @param overrides 构筑参数覆盖
         * @returns 构筑实例
         */
        function createSkillWeaponBuild(overrides: Partial<CharBuildOptions> = {}) {
            const char = new LeveledChar("贝蕾妮卡")
            const options: CharBuildOptions = {
                char,
                skillLevel: 10,
                hpPercent: 1,
                resonanceGain: 3,
                charMods: [],
                buffs: [],
                melee: mkWeapon("测试近战", 1),
                ranged: mkWeapon("测试远程", 1),
                baseName: "残光",
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance: 0,
                targetFunction: "伤害",
                dotSettings: { skill: 0, melee: 0, ranged: 0, skillweapon: 0 },
                ...overrides,
            }
            return new CharBuild(options)
        }

        it("无同律武器角色（黎瑟）同律来源触发为 0 且隐藏", () => {
            const build = createDotBuild()
            const freqs = build.calculateDotFrequencies()
            const skillweapon = freqs.sources.find(source => source.type === "skillweapon")
            expect(skillweapon?.trigger).toBe(0)
            expect(skillweapon?.hidden).toBe(true)
        })

        it("读取同律武器自身触发（贝蕾妮卡 伊弥尔 触发 0.5 → 上限 5 次/秒）", () => {
            const build = createSkillWeaponBuild({ dotSettings: { skill: 0, melee: 0, ranged: 0, skillweapon: 1 } })
            const freqs = build.calculateDotFrequencies()
            const skillweapon = freqs.sources.find(source => source.type === "skillweapon")!
            expect(skillweapon.trigger).toBeCloseTo(0.5, 6)
            expect(skillweapon.cap).toBeCloseTo(5, 6)
            expect(skillweapon.hidden).toBe(false)
        })

        it("同律武器参与共享上限填充与其余属性", () => {
            const build = createSkillWeaponBuild({
                charMods: [new LeveledMod(51317)],
                dotSettings: { skill: 2.5, melee: 1, ranged: 1, skillweapon: 1 },
            })
            const freqs = build.calculateDotFrequencies()
            // 共享上限取各来源上限最大值：同律触发 0.5 → 上限 5 > 技能/武器 2.5
            // 角色自身属性按 技能→近战→远程→同律 依次填充：2.5 + 1 + 1 + 0.5 = 5（封顶）
            expect(freqs.ownFreq).toBeCloseTo(5, 6)
            // 无异常数量 buff（异常数量=1）时无其余属性
            expect(freqs.otherFreq).toBeCloseTo(0, 6)
            const skillweapon = freqs.sources.find(source => source.type === "skillweapon")!
            expect(skillweapon.ownFreq).toBeCloseTo(0.5, 6)
            expect(skillweapon.otherFreq).toBeCloseTo(0, 6)
        })

        it("skillweapon::DOT伤害 与 同律::DOT伤害 只计算同律分量", () => {
            const build = createSkillWeaponBuild({ dotSettings: { skill: 0, melee: 0, ranged: 0, skillweapon: 2 } })
            expect(build.evaluateAST("skillweapon::DOT伤害")).toBeCloseTo(build.calculateDotDamage("skillweapon"), 6)
            expect(build.evaluateAST("同律::DOT伤害")).toBeCloseTo(build.calculateDotDamage("同律"), 6)
            expect(build.calculateDotDamage("skillweapon")).toBeCloseTo(build.calculateDotDamage("同律"), 6)
        })

        it("各命名空间之和包含同律分量", () => {
            const build = createSkillWeaponBuild({
                dotSettings: { skill: 2.5, melee: 1, ranged: 1, skillweapon: 1 },
            })
            const sum = build.evaluateAST("角色::DOT伤害+melee::DOT伤害+ranged::DOT伤害+skillweapon::DOT伤害")
            expect(sum).toBeCloseTo(build.calculateDotDamage(), 6)
        })
    })

    describe("快照与设置", () => {
        it("dotSettings 缺省为全 0（默认不触发）", () => {
            const build = createDotBuild({ dotSettings: undefined as unknown as DotFrequencySettings })
            expect(build.dotSettings).toEqual({ skill: 0, melee: 0, ranged: 0, skillweapon: 0, forceOwnAdditionalDamage: false })
            expect(build.calculateDotFrequencies().totalFreq).toBe(0)
        })

        it("clone 保留 dotSettings", () => {
            const build = createDotBuild({ dotSettings: { skill: 2.5, melee: 1, ranged: 0.5, skillweapon: 1 } })
            const cloned = build.clone()
            expect(cloned.dotSettings).toEqual(build.dotSettings)
            expect(cloned.calculateDotDamage()).toBeCloseTo(build.calculateDotDamage(), 6)
        })
    })
})
