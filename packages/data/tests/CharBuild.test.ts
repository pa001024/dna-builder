import { describe, expect, it, vi } from "vitest"
import { CharBuild } from "../CharBuild"
import {
    createBuffFromSettings,
    createCharBuildFromSettings,
    createCustomBuff,
    resolveTranscendEffectsForSettings,
} from "../CharBuildHelper"
import { createBuildFromSnapshot, createWorkerSnapshot } from "../CharBuildSnapshot"
import { createDefaultAssistSideSettings, createDefaultCharSettings, normalizeCharSettings } from "../charSettings"
import { buffMap, charMap } from "../d"
import type { Mod, Weapon } from "../data-types"
import { LeveledModHelper, weaponData } from "../index"
import { LeveledBuff, LeveledChar, LeveledMod, LeveledSkill, type LeveledSkillWeapon, LeveledWeapon } from "../leveled"
import { ADDITIONAL_DAMAGE_KEYS, LEGACY_ADDITIONAL_DAMAGE_KEY, resetAdditionalDamageWarnings } from "../leveled/additionalDamage"
import { LeveledModWithCount } from "../leveled/LeveledMod"
import { isTranscendBuffElementAllowed, resolveGearEffects } from "../transcend"
import { TRANSCEND_BUFF_MAP } from "../transcendBuffs"
import { flattenEquippedGear } from "../transcendGear"
import type { TranscendGearAffixRoll, TranscendGearEntry, TranscendGearItemConfig } from "../transcendSettings"
import {
    applyTranscendSkillReplacement,
    mergeTranscendSkillReplacement,
    resetSkillReplacementWarnings,
    TRANSCEND_SKILL_REPLACEMENTS,
} from "../transcendSkills"
import { createShardBuild1, shardBuild1 } from "./fixtures/shardBuild1"

const gear = (patch: Partial<TranscendGearEntry> & Pick<TranscendGearEntry, "slotId" | "affixId">): TranscendGearEntry => ({
    rollLevel: 1,
    masterworkLevel: 0,
    ancient: false,
    finalMasterwork: false,
    ...patch,
})

// 线上真实构筑（莉兹贝尔 shardBuild1）已抽出为公共夹具，供本测试与性能基准共用：
// 见 ./fixtures/shardBuild1.ts

describe("派生缓存失效（mods / 自定义变量）", () => {
    it("原地追加 MOD 槽位元素后，派生结果应立即生效", () => {
        const build = createShardBuild1()
        const before = build.calculate()
        const beforeAttack = build.calculateAttributes().攻击
        const beforeModCount = build.mods.length

        // 原地 push：缓存以槽位快照比对失效，不能持有槽位数组引用
        build.charMods.push(new LeveledMod(41001)) // 炽灼：攻击 +75%

        const after = build.calculate()
        const afterAttack = build.calculateAttributes().攻击
        expect(build.mods.length).toBe(beforeModCount + 1)
        expect(afterAttack).toBeGreaterThan(beforeAttack)
        expect(after).toBeGreaterThan(before)

        // 与「等价的新建构筑」完全一致，证明吃到的是最新槽位
        const rebuilt = createShardBuild1()
        rebuilt.charMods.push(new LeveledMod(41001))
        expect(afterAttack).toBeCloseTo(rebuilt.calculateAttributes().攻击, 6)
        expect(after).toBeCloseTo(rebuilt.calculate(), 6)
    })

    it("原地移除 MOD 槽位元素后，派生结果应立即回退", () => {
        const build = createShardBuild1()
        const expected = createShardBuild1()
        expected.charMods.splice(0, 1)
        const expectedAttack = expected.calculateAttributes().攻击
        const beforeModCount = build.mods.length

        build.charMods.splice(0, 1)

        expect(build.mods.length).toBe(beforeModCount - 1)
        expect(build.calculateAttributes().攻击).toBeCloseTo(expectedAttack, 6)
        expect(build.calculate()).toBeCloseTo(expected.calculate(), 6)
    })

    it("原地替换 MOD 槽位元素后，派生结果应立即生效", () => {
        const build = createShardBuild1()
        build.charMods[0] = new LeveledMod(41001)

        const reference = createShardBuild1()
        reference.charMods[0] = new LeveledMod(41001)

        expect(build.mods[0].id).toBe(41001)
        expect(build.calculate()).toBeCloseTo(reference.calculate(), 6)
    })

    it("MOD 槽位整体替换后，派生结果应立即生效", () => {
        const build = createShardBuild1()
        // 注意 auraMod 的 attrType 同为「角色」，不能按 attrType 计数判断槽位是否已换
        const replacedIds = build.charMods.map(mod => mod?.id)
        expect(replacedIds).not.toContain(41001)

        build.charMods = [new LeveledMod(41001)]

        const reference = createShardBuild1()
        reference.charMods = [new LeveledMod(41001)]

        // 整槽替换后，旧角色位 MOD 必须全部从派生列表中消失
        expect(build.mods.filter(mod => replacedIds.includes(mod.id))).toHaveLength(0)
        expect(build.mods[0].id).toBe(41001)
        expect(build.calculate()).toBeCloseTo(reference.calculate(), 6)
    })

    it("自定义变量原地替换后应立即生效", () => {
        const build = createShardBuild1()
        const baseline = build.calculate()

        build.customVariables[6] = ["循环用时", "1"]
        const changed = build.calculate()
        expect(changed).not.toBeCloseTo(baseline, 6)

        build.customVariables[6] = ["循环用时", shardBuild1.customVariables[6][1]]
        expect(build.calculate()).toBeCloseTo(baseline, 6)
    })
})

describe("作用域属性表失效", () => {
    // 属性汇总表把全部来源的数值属性一次性展开（见 CharBuild.buildBonusSourceTable），
    // 失效来源有四条：MOD 槽位变化、来源自身数值改写（版本号）、武器实例替换、BUFF 数组增删换。
    // 这里逐条构造「原地改写后」与「等价新建构筑」的对比。

    it("原地修改 MOD 等级后，属性汇总应立即生效", () => {
        const build = createShardBuild1()
        const reference = createShardBuild1()
        const untouched = createShardBuild1()

        // 满级 MOD 降到 1 级：数值减半，必定改变结果
        build.charMods[0]!.等级 = 1
        reference.charMods[0]!.等级 = 1

        expect(build.calculate()).toBeCloseTo(reference.calculate(), 6)
        expect(build.calculate()).not.toBeCloseTo(untouched.calculate(), 6)
    })

    it("原地修改 BUFF 等级后，属性汇总应立即生效", () => {
        const build = createShardBuild1()
        const reference = createShardBuild1()
        const untouched = createShardBuild1()

        const target = build.buffs.find(buff => buff.名称 === "色散成霓")!
        const mirror = reference.buffs.find(buff => buff.名称 === "色散成霓")!
        expect(target).toBeDefined()
        target.等级 = 1
        mirror.等级 = 1

        expect(build.calculate()).toBeCloseTo(reference.calculate(), 6)
        expect(build.calculate()).not.toBeCloseTo(untouched.calculate(), 6)
    })

    it("原地修改武器等级后，属性汇总应立即生效", () => {
        const build = createShardBuild1()
        const reference = createShardBuild1()
        const untouched = createShardBuild1()

        build.meleeWeapon.等级 = 1
        reference.meleeWeapon.等级 = 1

        // 熔炉武器的等级只改写「基础攻击」（词条按精炼固定），而该字段同样在属性表内，
        // 因此用近战作用域查询它来验证表已随版本号失效，而不是靠目标函数（它只吃同律面板）。
        const changed = build.getTotalBonus("基础攻击", "近战")
        expect(changed).toBeCloseTo(reference.getTotalBonus("基础攻击", "近战"), 6)
        expect(changed).not.toBeCloseTo(untouched.getTotalBonus("基础攻击", "近战"), 6)
    })

    it("切换武器熔炼生效状态后，属性汇总应立即生效", () => {
        const build = createShardBuild1()
        const reference = createShardBuild1()

        build.meleeWeapon.setForgeEffective(false)
        reference.meleeWeapon.setForgeEffective(false)
        const off = build.calculate()
        expect(off).toBeCloseTo(reference.calculate(), 6)

        build.meleeWeapon.setForgeEffective(true)
        reference.meleeWeapon.setForgeEffective(true)
        expect(build.calculate()).toBeCloseTo(reference.calculate(), 6)
        expect(off).not.toBeCloseTo(reference.calculate(), 6)
    })

    it("整体替换 BUFF 列表后，属性汇总应立即生效", () => {
        const build = createShardBuild1()
        const reference = createShardBuild1()
        const untouched = createShardBuild1()

        build.buffs = build.buffs.slice(0, 5)
        reference.buffs = reference.buffs.slice(0, 5)

        expect(build.calculate()).toBeCloseTo(reference.calculate(), 6)
        expect(build.calculate()).not.toBeCloseTo(untouched.calculate(), 6)
    })

    it("临时 BUFF 增删（收益试算路径）后应立即回退", () => {
        const build = createShardBuild1()
        const baseline = build.calculate()

        // calcIncome 会临时 push / pop 一条 BUFF，其间必须能查到带该 BUFF 的结果
        const buff = new LeveledBuff("助战50攻")
        build.buffs.push(buff)
        const withBuff = build.calculate()
        build.buffs.pop()

        expect(withBuff).not.toBeCloseTo(baseline, 6)
        expect(build.calculate()).toBeCloseTo(baseline, 6)
    })

    it("临时 MOD 槽位（收益试算路径）增删后应立即回退", () => {
        const build = createShardBuild1()
        const baseline = build.calculate()

        build.tempMod = new LeveledMod(41001) // 炽灼：攻击 +75%
        const withTemp = build.calculate()
        build.tempMod = null

        expect(withTemp).not.toBeCloseTo(baseline, 6)
        expect(build.calculate()).toBeCloseTo(baseline, 6)
    })

    it("临时替换武器槽位（收益试算路径）后应立即回退", () => {
        const build = createShardBuild1()
        const baseline = build.calculate()

        const original = build.meleeWeapon
        build.meleeWeapon = new LeveledWeapon(10302)
        const replaced = build.calculate()
        build.meleeWeapon = original

        expect(replaced).not.toBeCloseTo(baseline, 6)
        expect(build.calculate()).toBeCloseTo(baseline, 6)
    })
})

describe("CharBuild类测试", () => {
    // 创建测试用数据
    const mod1 = new LeveledMod(41324) // 雷鸣·燎原
    const mod2 = new LeveledMod(51313) // 决斗
    const mod3 = new LeveledMod(41001) // 炽灼 (75%)
    const mod4 = new LeveledMod(42002) // 专注 (100%)
    const mockMods = [mod1, mod2, mod3]
    const buff1 = new LeveledBuff("黎瑟E")
    const mockBuffs = [buff1]

    // 基础对象 不要直接使用，而是通过clone()方法创建新实例
    function createCharBuild() {
        return new CharBuild({
            char: new LeveledChar("黎瑟"),
            skillLevel: 10,
            hpPercent: 0.5,
            resonanceGain: 2,
            charMods: [...mockMods],
            buffs: [...mockBuffs],
            melee: new LeveledWeapon(10302), //"铸铁者"),
            ranged: new LeveledWeapon(20601), //"烈焰孤沙"),
            baseName: "快速出击",
            enemyId: 130,
            enemyLevel: 80,
            enemyResistance: 0.5,
            targetFunction: "伤害",
        })
    }

    // 测试构造函数
    it("应该能够创建CharBuild实例", () => {
        const charBuild = createCharBuild()
        expect(charBuild).toBeInstanceOf(CharBuild)
    })
    // 测试clone函数
    it("应该能够clone", () => {
        const charBuild = createCharBuild()
        expect(charBuild).toBeInstanceOf(CharBuild)
        expect(charBuild).not.toBe(createCharBuild())
    })

    // 测试等级系数获取
    it("应该能够正确获取等级系数", () => {
        const charBuild = createCharBuild()
        // 测试等级系数变化
        charBuild.char.等级 = 80
        const result1 = charBuild.calculate()
        expect(result1).toBeTypeOf("number")
        expect(result1).toBeGreaterThanOrEqual(0)
        charBuild.char.等级 = 70
        const result2 = charBuild.calculate()
        expect(result2).toBeTypeOf("number")
        expect(result2).toBeLessThan(result1)
    })

    // 测试基础属性计算
    it("应该能够正确计算基础属性", () => {
        const charBuild = createCharBuild()
        charBuild.mods = []
        charBuild.buffs = []
        const attrs = charBuild.calculateAttributes()

        const baseAtk = charBuild.char.基础攻击
        const baseHp = charBuild.char.基础生命
        const baseShield = charBuild.char.基础护盾
        const baseDefense = charBuild.char.基础防御
        const baseSanity = charBuild.char.基础神智

        const attackBonus = charBuild.char.加成?.攻击 || 0
        const atk = baseAtk * (3 + attackBonus)
        expect(attrs.攻击).toBeCloseTo(atk, 1)

        charBuild.mods = [mod3]
        const atk2 = baseAtk * (3 + attackBonus + 0.75)
        const attrs2 = charBuild.calculateAttributes()
        // const atb = charBuild.getTotalBonus("攻击")
        // console.log(atb)
        expect(attrs2.攻击).toBeCloseTo(atk2, 1)
        // 验证基础属性是否为数字
        expect(attrs.生命).toBe(baseHp * 3)
        expect(attrs.护盾).toBe(baseShield * 3)
        expect(attrs.防御).toBe(baseDefense * 3)
        expect(attrs.神智).toBe(baseSanity)
    })

    // 测试其他属性计算
    it("应该能够正确计算其他属性", () => {
        const charBuild = createCharBuild()
        const attrs = charBuild.calculateAttributes()

        expect(attrs.增伤).toBe(1.34)
        expect(attrs.属性穿透).toBe(0)
        expect(attrs.独立增伤).toBe(0)

        charBuild.buffs = []
        const attrs2 = charBuild.calculateAttributes()
        expect(attrs2.增伤).toBe(0.44)
        expect(attrs2.属性穿透).toBe(0)
        expect(attrs2.独立增伤).toBe(0)
    })

    it("应该为不同构筑生成独立的自定义BUFF实例", () => {
        const buffA = createBuffFromSettings("自定义BUFF", 1, [["攻击", 0.1]])
        const buffB = createBuffFromSettings("自定义BUFF", 1, [["攻击", 0.2]])

        expect(buffA).not.toBe(buffB)
        expect(buffA.getAttrValue("攻击")).toBe(0.1)
        expect(buffB.getAttrValue("攻击")).toBe(0.2)

        const halfBuff = createBuffFromSettings("自定义BUFF", 1, [["攻击", 0.1]], 0.5)
        expect(halfBuff.coverage).toBe(0.5)
        expect(halfBuff.getAttrValue("攻击")).toBe(0.05)

        const buildA = new CharBuild({
            char: new LeveledChar("黎瑟"),
            skillLevel: 10,
            hpPercent: 0.5,
            resonanceGain: 2,
            buffs: [buffA],
            melee: new LeveledWeapon(10302),
            ranged: new LeveledWeapon(20601),
            baseName: "快速出击",
            enemyId: 130,
            enemyLevel: 80,
            enemyResistance: 0.5,
            targetFunction: "伤害",
        })
        const buildB = new CharBuild({
            char: new LeveledChar("黎瑟"),
            skillLevel: 10,
            hpPercent: 0.5,
            resonanceGain: 2,
            buffs: [buffB],
            melee: new LeveledWeapon(10302),
            ranged: new LeveledWeapon(20601),
            baseName: "快速出击",
            enemyId: 130,
            enemyLevel: 80,
            enemyResistance: 0.5,
            targetFunction: "伤害",
        })

        expect(buildA.buffs[0]).not.toBe(buildB.buffs[0])
        expect(buildA.buffs[0].getAttrValue("攻击")).toBe(0.1)
        expect(buildB.buffs[0].getAttrValue("攻击")).toBe(0.2)
    })

    it("选择召唤物技能时不应让namespace访问的其他技能误吃召唤物伤害", () => {
        const summonBuild = new CharBuild({
            char: new LeveledChar("丽蓓卡"),
            skillLevel: 10,
            hpPercent: 1,
            resonanceGain: 3,
            melee: new LeveledWeapon(10302),
            ranged: new LeveledWeapon(20601),
            baseName: "缠绵之触",
            enemyId: 130,
            enemyLevel: 80,
            enemyResistance: 0,
            targetFunction: "纯爱试炼::[爱之毒]伤害",
        })
        const summonAttrs = summonBuild.calculateWeaponAttributes()
        const summonResult = summonBuild.evaluateAST("纯爱试炼::[爱之毒]伤害", summonAttrs)

        const normalBuild = new CharBuild({
            char: new LeveledChar("丽蓓卡"),
            skillLevel: 10,
            hpPercent: 1,
            resonanceGain: 3,
            melee: new LeveledWeapon(10302),
            ranged: new LeveledWeapon(20601),
            baseName: "纯爱试炼",
            enemyId: 130,
            enemyLevel: 80,
            enemyResistance: 0,
            targetFunction: "纯爱试炼::[爱之毒]伤害",
        })
        const normalAttrs = normalBuild.calculateWeaponAttributes()
        const normalResult = normalBuild.evaluateAST("纯爱试炼::[爱之毒]伤害", normalAttrs)

        expect(summonResult).toBeCloseTo(normalResult, 6)
    })

    it("字段名含召唤物时应计入召唤物伤害，即使技能名不含召唤物", () => {
        const baseBuild = new CharBuild({
            char: new LeveledChar("伊薇"),
            skillLevel: 10,
            hpPercent: 1,
            resonanceGain: 0,
            buffs: [],
            melee: new LeveledWeapon(10302),
            ranged: new LeveledWeapon(20601),
            baseName: "乐园构想",
            enemyId: 130,
            enemyLevel: 80,
            enemyResistance: 0,
            targetFunction: "[召唤物·战车]技能伤害",
        })
        const buffedBuild = new CharBuild({
            char: new LeveledChar("伊薇"),
            skillLevel: 10,
            hpPercent: 1,
            resonanceGain: 0,
            buffs: [
                new LeveledBuff({
                    名称: "召唤物伤害测试",
                    描述: "测试用召唤物伤害加成",
                    attr: { 召唤物伤害: 0.5 },
                }),
            ],
            melee: new LeveledWeapon(10302),
            ranged: new LeveledWeapon(20601),
            baseName: "乐园构想",
            enemyId: 130,
            enemyLevel: 80,
            enemyResistance: 0,
            targetFunction: "[召唤物·战车]技能伤害",
        })

        const baseDamage = baseBuild.calculateTargetFunction(undefined, "[召唤物·战车]技能伤害")
        const buffedDamage = buffedBuild.calculateTargetFunction(undefined, "[召唤物·战车]技能伤害")

        expect(baseDamage).toBeGreaterThan(0)
        expect(buffedDamage).toBeGreaterThan(baseDamage)
        expect(buffedDamage / baseDamage).toBeCloseTo(1.5, 5)
    })

    it("技能命名空间按 tag 判定召唤物：字段名含「召唤物」但无召唤物 tag 时不吃召唤物伤害", () => {
        const createBuild = (buffs: LeveledBuff[]) =>
            new CharBuild({
                char: new LeveledChar("主角-水"),
                skillLevel: 10,
                hpPercent: 1,
                resonanceGain: 0,
                buffs,
                melee: new LeveledWeapon(10302),
                ranged: new LeveledWeapon(20601),
                baseName: "斩首行动",
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance: 0,
                targetFunction: "e::召唤物伤害",
            })

        const baseBuild = createBuild([])
        const buffedBuild = createBuild([
            new LeveledBuff({
                名称: "召唤物伤害测试",
                描述: "测试用召唤物伤害加成",
                attr: { 召唤物伤害: 0.5 },
            }),
        ])
        const baseDamage = baseBuild.calculateTargetFunction(undefined, "e::召唤物伤害")
        const buffedDamage = buffedBuild.calculateTargetFunction(undefined, "e::召唤物伤害")

        // 斩首行动的「召唤物伤害」字段 tag 为 ["技能","WeitaWater"]，不含「召唤物」，按 tag-only 语义不吃加成
        expect(baseDamage).toBeGreaterThan(0)
        expect(buffedDamage / baseDamage).toBeCloseTo(1, 5)
    })

    it("技能命名空间：字段 tag 含「召唤物」时应用召唤物伤害加成", () => {
        const createBuild = (buffs: LeveledBuff[]) =>
            new CharBuild({
                char: new LeveledChar("伊薇"),
                skillLevel: 10,
                hpPercent: 1,
                resonanceGain: 0,
                buffs,
                melee: new LeveledWeapon(10302),
                ranged: new LeveledWeapon(20601),
                baseName: "乐园构想",
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance: 0,
                targetFunction: "e::[召唤物·战车]技能伤害",
            })

        const baseBuild = createBuild([])
        const buffedBuild = createBuild([
            new LeveledBuff({
                名称: "召唤物伤害测试",
                描述: "测试用召唤物伤害加成",
                attr: { 召唤物伤害: 0.5 },
            }),
        ])
        const baseDamage = baseBuild.calculateTargetFunction(undefined, "e::[召唤物·战车]技能伤害")
        const buffedDamage = buffedBuild.calculateTargetFunction(undefined, "e::[召唤物·战车]技能伤害")

        // 乐园构想的 [召唤物·战车]技能伤害 字段 tag 含「召唤物」，命中 tag-only 召唤物语义
        expect(baseDamage).toBeGreaterThan(0)
        expect(buffedDamage / baseDamage).toBeCloseTo(1.5, 5)
    })

    it("角色、近战、远程命名空间支持中英文别名并拒绝无效命名空间", () => {
        const build = createCharBuild()
        expect(build.validateAST("角色::攻击")).toBeUndefined()
        expect(build.validateAST("character::攻击")).toBeUndefined()
        expect(build.evaluateAST("近战::攻击")).toBeCloseTo(build.evaluateAST("melee::攻击"), 6)
        expect(build.evaluateAST("远程::攻击")).toBeCloseTo(build.evaluateAST("ranged::攻击"), 6)
        expect(build.validateAST("invalid::攻击")).toContain('无效命名空间: "invalid"')
    })

    it("[召唤物·战车]技能伤害应被无止无休5熔的召唤物属性继承比例增幅", () => {
        const createBuild = (buffs: LeveledBuff[]) =>
            new CharBuild({
                char: new LeveledChar("伊薇"),
                skillLevel: 10,
                hpPercent: 1,
                resonanceGain: 0,
                buffs,
                melee: new LeveledWeapon(10302),
                ranged: new LeveledWeapon(20601),
                baseName: "乐园构想",
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance: 0,
                targetFunction: "[召唤物·战车]技能伤害",
            })
        const baseBuild = createBuild([])
        const buffedBuild = createBuild([
            new LeveledBuff({
                名称: "无止无休5熔",
                mx: 30,
                描述: "[降灵]最多叠加层数提高至30.0层，每层[降灵]使自身召唤召唤物时，召唤物属性继承比例提高0.25%。",
                attr: { 召唤物属性继承比例: 0.0025 },
            }),
        ])

        const baseDamage = baseBuild.calculateTargetFunction(undefined, "[召唤物·战车]技能伤害")
        const buffedDamage = buffedBuild.calculateTargetFunction(undefined, "[召唤物·战车]技能伤害")

        // 无止无休5熔满层30层：每层0.25% → 召唤物属性继承比例 = 1 + 0.0025×30 = 1.075
        expect(baseDamage).toBeGreaterThan(0)
        expect(buffedDamage).toBeGreaterThan(baseDamage)
        expect(buffedDamage / baseDamage).toBeCloseTo(1.075, 5)
    })

    it("[召唤物·皇帝]技能伤害应被无止无休5熔的召唤物属性继承比例增幅", () => {
        const createBuild = (buffs: LeveledBuff[]) =>
            new CharBuild({
                char: new LeveledChar("伊薇"),
                skillLevel: 10,
                hpPercent: 1,
                resonanceGain: 0,
                buffs,
                melee: new LeveledWeapon(10302),
                ranged: new LeveledWeapon(20601),
                baseName: "乐园构想",
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance: 0,
                targetFunction: "[召唤物·皇帝]技能伤害",
            })
        const baseBuild = createBuild([])
        const buffedBuild = createBuild([
            new LeveledBuff({
                名称: "无止无休5熔",
                mx: 30,
                描述: "[降灵]最多叠加层数提高至30.0层，每层[降灵]使自身召唤召唤物时，召唤物属性继承比例提高0.25%。",
                attr: { 召唤物属性继承比例: 0.0025 },
            }),
        ])

        const baseDamage = baseBuild.calculateTargetFunction(undefined, "[召唤物·皇帝]技能伤害")
        const buffedDamage = buffedBuild.calculateTargetFunction(undefined, "[召唤物·皇帝]技能伤害")

        expect(baseDamage).toBeGreaterThan(0)
        expect(buffedDamage).toBeGreaterThan(baseDamage)
        expect(buffedDamage / baseDamage).toBeCloseTo(1.075, 5)
    })

    it("伊薇4溯应作为复合BUFF同时生效普通属性与code，提升[召唤物·战车]技能伤害", () => {
        const createBuild = (buffs: LeveledBuff[]) =>
            new CharBuild({
                char: new LeveledChar("伊薇"),
                skillLevel: 10,
                hpPercent: 1,
                resonanceGain: 0,
                buffs,
                melee: new LeveledWeapon(10302),
                ranged: new LeveledWeapon(20601),
                baseName: "乐园构想",
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance: 0,
                targetFunction: "[召唤物·战车]技能伤害",
            })
        const baseBuild = createBuild([])
        const buffedBuild = createBuild([new LeveledBuff("伊薇4溯")])

        // 复合BUFF：普通属性部分进入属性链（buffs），code部分进入dynamicBuffs
        expect(buffedBuild.buffs.map(b => b.名称)).toContain("伊薇4溯")
        expect(buffedBuild.dynamicBuffs.map(b => b.名称)).toContain("伊薇4溯")

        // 普通属性部分先进入attr链：召唤物攻击速度 = 0.3
        const attrs = buffedBuild.calculateAttributes()
        expect(attrs.召唤物攻击速度).toBeCloseTo(0.3, 6)
        // code部分在attr链之后计算：召唤物独立增伤（0起始）= (1+0) × (1+0.3) - 1 = 0.3
        expect(attrs.召唤物独立增伤).toBeCloseTo(0.3, 6)
        expect(baseBuild.calculateAttributes().召唤物独立增伤).toBeCloseTo(0, 6)

        // 目标test：使 [召唤物·战车]技能伤害 伤害增加（独立乘区 1+0.3 = 1.3）
        const baseDamage = baseBuild.calculateTargetFunction(undefined, "[召唤物·战车]技能伤害")
        const buffedDamage = buffedBuild.calculateTargetFunction(undefined, "[召唤物·战车]技能伤害")

        expect(baseDamage).toBeGreaterThan(0)
        expect(buffedDamage).toBeGreaterThan(baseDamage)
        expect(buffedDamage / baseDamage).toBeCloseTo(1.3, 5)
    })

    it("伊薇4溯克隆与快照往返不应重复生效", () => {
        const createBuild = () =>
            new CharBuild({
                char: new LeveledChar("伊薇"),
                skillLevel: 10,
                hpPercent: 1,
                resonanceGain: 0,
                buffs: [new LeveledBuff("伊薇4溯")],
                melee: new LeveledWeapon(10302),
                ranged: new LeveledWeapon(20601),
                baseName: "乐园构想",
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance: 0,
                targetFunction: "[召唤物·战车]技能伤害",
            })
        const build = createBuild()
        const originalDamage = build.calculateTargetFunction(undefined, "[召唤物·战车]技能伤害")
        expect(originalDamage).toBeGreaterThan(0)

        // clone：复合BUFF按引用去重后克隆，不重复生效
        const clonedDamage = build.clone().calculateTargetFunction(undefined, "[召唤物·战车]技能伤害")
        expect(clonedDamage).toBeCloseTo(originalDamage, 6)

        // 快照往返：同样按引用去重，恢复后结果一致
        const restored = createBuildFromSnapshot(createWorkerSnapshot(build))
        expect(restored.calculateTargetFunction(undefined, "[召唤物·战车]技能伤害")).toBeCloseTo(originalDamage, 6)
    })

    it("BUFF覆盖率应在快照往返后保持", () => {
        const build = new CharBuild({
            char: new LeveledChar("黎瑟"),
            skillLevel: 10,
            hpPercent: 1,
            resonanceGain: 0,
            buffs: [new LeveledBuff("助战50攻", 1)],
            melee: new LeveledWeapon(10302),
            ranged: new LeveledWeapon(20601),
            baseName: "快速出击",
            enemyId: 130,
            enemyLevel: 80,
            enemyResistance: 0,
            targetFunction: "伤害",
        })
        build.buffs[0].coverage = 0.5

        const snapshot = createWorkerSnapshot(build)
        expect(snapshot.buffs[0].coverage).toBe(0.5)

        const restored = createBuildFromSnapshot(snapshot)
        expect(restored.buffs[0].coverage).toBe(0.5)
        expect(restored.buffs[0].getAttrValue("攻击")).toBeCloseTo(build.buffs[0].getAttrValue("攻击")!, 10)
    })

    it("召唤物转化词条应按充盈威力范式汇总：近战攻速MOD 52004 + 水雾弥散 51921", () => {
        const build = new CharBuild({
            char: new LeveledChar("伊薇"),
            skillLevel: 10,
            hpPercent: 1,
            resonanceGain: 0,
            charMods: [new LeveledMod(51921)], // 水雾弥散（召唤物攻击速度转化 49.5%，召唤物范围转化 24.2%）
            meleeMods: [new LeveledMod(52004)], // 迅捷（近战攻速 +75%）
            melee: new LeveledWeapon(10302),
            ranged: new LeveledWeapon(20601),
            baseName: "庆典开始喽",
            enemyId: 130,
            enemyLevel: 80,
            enemyResistance: 0,
            targetFunction: "[召唤物·审判]技能伤害",
        })
        const attrs = build.calculateWeaponAttributes(build.meleeWeapon)

        // 召唤物转化（武器属性）：角色槽 51921 为公共转化词条，近战武器作用域可见
        expect(attrs.weapon!.召唤物攻击速度转化).toBeCloseTo(0.495, 6)
        expect(attrs.weapon!.召唤物范围转化).toBeCloseTo(0.242, 6)
        // 近战武器攻速 = 1 × (1 + 0.75) = 1.75
        expect(attrs.weapon!.攻速).toBeCloseTo(1.75, 6)
        // 召唤物攻击速度（角色属性）= 近战武器攻速全额 1.75 × 转化 0.495 = 0.86625
        expect(attrs.召唤物攻击速度).toBeCloseTo(1.75 * 0.495, 6)
        // 召唤物范围（角色属性）= 转化词条 0.242
        expect(attrs.召唤物范围).toBeCloseTo(0.242, 6)

        // 召唤物实际攻速与攻击间隔（召唤物·审判：攻击间隔 3 秒）
        const summonMap = build.selectedSkill!.getSummonAttrsMap(attrs)
        expect(summonMap!.attackSpeed).toBeCloseTo(1.75 * 0.495, 6)
        expect(summonMap!.interval).toBeCloseTo(3 / (1 + 1.75 * 0.495), 6)
    })

    it("伊薇4溯预期收益应计入近战攻速转化：52004 + 51921 下召唤物独立增伤 = 0.3+1.75×0.495，召唤物伤害倍率 = 1+该值", () => {
        const createBuild = (buffs: LeveledBuff[]) =>
            new CharBuild({
                char: new LeveledChar("伊薇"),
                skillLevel: 10,
                hpPercent: 1,
                resonanceGain: 0,
                charMods: [new LeveledMod(51921)],
                meleeMods: [new LeveledMod(52004)],
                buffs,
                melee: new LeveledWeapon(10302),
                ranged: new LeveledWeapon(20601),
                baseName: "庆典开始喽",
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance: 0,
                targetFunction: "[召唤物·审判]技能伤害",
            })
        const baseBuild = createBuild([])
        const buffedBuild = createBuild([new LeveledBuff("伊薇4溯")])

        // 无武器上下文：召唤物攻击速度 = BUFF 直接加成 0.3，召唤物独立增伤（0起始）= 0.3
        expect(buffedBuild.calculateAttributes().召唤物攻击速度).toBeCloseTo(0.3, 6)
        expect(buffedBuild.calculateAttributes().召唤物独立增伤).toBeCloseTo(0.3, 6)

        // 武器上下文：召唤物攻击速度 = 0.3 + 1.75×0.495 = 1.16625，召唤物独立增伤 = 1.16625
        const attrs = buffedBuild.calculateWeaponAttributes()
        expect(attrs.召唤物攻击速度).toBeCloseTo(0.3 + 1.75 * 0.495, 6)
        expect(attrs.召唤物独立增伤).toBeCloseTo(0.3 + 1.75 * 0.495, 6)

        // 预期收益：召唤物技能伤害倍率 = 召唤物独立增伤倍率（仅超过100%的部分转化）
        const baseDamage = baseBuild.calculateTargetFunction(undefined, "[召唤物·审判]技能伤害")
        const buffedDamage = buffedBuild.calculateTargetFunction(undefined, "[召唤物·审判]技能伤害")
        expect(baseDamage).toBeGreaterThan(0)
        expect(buffedDamage / baseDamage).toBeCloseTo(1 + 0.3 + 1.75 * 0.495, 5)
    })

    it("伊薇4溯的直接攻速BUFF无需攻速MOD也应实际提速召唤物", () => {
        const build = new CharBuild({
            char: new LeveledChar("伊薇"),
            skillLevel: 10,
            hpPercent: 1,
            resonanceGain: 0,
            buffs: [new LeveledBuff("伊薇4溯")],
            melee: new LeveledWeapon(10302),
            ranged: new LeveledWeapon(20601),
            baseName: "庆典开始喽",
            enemyId: 130,
            enemyLevel: 80,
            enemyResistance: 0,
            targetFunction: "[召唤物·审判]技能伤害",
        })
        const attrs = build.calculateWeaponAttributes(build.meleeWeapon)
        // 近战武器无攻速加成（攻速 = 1，溢出 0），召唤物攻击速度 = BUFF 直接增量 0.3
        expect(attrs.weapon!.攻速).toBeCloseTo(1, 6)
        expect(attrs.召唤物攻击速度).toBeCloseTo(0.3, 6)
        const summonMap = build.selectedSkill!.getSummonAttrsMap(attrs)
        expect(summonMap!.attackSpeed).toBeCloseTo(0.3, 6)
        expect(summonMap!.interval).toBeCloseTo(3 / 1.3, 6)
    })

    it("[降灵]召唤物属性应按比例缩放召唤物伤害", () => {
        const baseBuild = new CharBuild({
            char: new LeveledChar("塔比瑟"),
            skillLevel: 10,
            hpPercent: 1,
            resonanceGain: 0,
            buffs: [],
            melee: new LeveledWeapon(10302),
            ranged: new LeveledWeapon(20601),
            baseName: "正义群殴！",
            enemyId: 130,
            enemyLevel: 80,
            enemyResistance: 0,
            targetFunction: "召唤物伤害",
        })
        const reducedBuild = new CharBuild({
            char: new LeveledChar("塔比瑟"),
            skillLevel: 10,
            hpPercent: 1,
            resonanceGain: 0,
            buffs: [
                new LeveledBuff({
                    名称: "[降灵]召唤物属性",
                    描述: "[降灵]最多叠加层数提高至30.0层，每层[降灵]使自身召唤召唤物时，召唤物属性继承比例提高0.25%。",
                    attr: { 召唤物属性继承比例: 0.0025 },
                }),
            ],
            melee: new LeveledWeapon(10302),
            ranged: new LeveledWeapon(20601),
            baseName: "正义群殴！",
            enemyId: 130,
            enemyLevel: 80,
            enemyResistance: 0,
            targetFunction: "召唤物伤害",
        })

        const baseDamage = baseBuild.calculateTargetFunction(undefined, "召唤物伤害")
        const reducedDamage = reducedBuild.calculateTargetFunction(undefined, "召唤物伤害")

        expect(baseDamage).toBeGreaterThan(0)
        expect(reducedDamage).toBeGreaterThan(0)
        expect(reducedDamage).toBeGreaterThan(baseDamage)
    })

    it("暴虐应提高近战武器攻速", () => {
        const baseBuild = new CharBuild({
            char: new LeveledChar("黎瑟"),
            skillLevel: 10,
            hpPercent: 1,
            resonanceGain: 0,
            buffs: [],
            melee: new LeveledWeapon(10302),
            ranged: new LeveledWeapon(20601),
            baseName: "普通攻击",
            enemyId: 130,
            enemyLevel: 80,
            enemyResistance: 0,
            targetFunction: "伤害",
        })
        const buffedBuild = new CharBuild({
            char: new LeveledChar("黎瑟"),
            skillLevel: 10,
            hpPercent: 1,
            resonanceGain: 0,
            buffs: [new LeveledBuff({ 名称: "暴虐", 描述: "x", attr: { 近战攻速: 0.3 } })],
            melee: new LeveledWeapon(10302),
            ranged: new LeveledWeapon(20601),
            baseName: "普通攻击",
            enemyId: 130,
            enemyLevel: 80,
            enemyResistance: 0,
            targetFunction: "伤害",
        })

        const baseAttackSpeed = baseBuild.calculateWeaponAttributes(baseBuild.meleeWeapon).weapon?.攻速
        const buffedAttackSpeed = buffedBuild.calculateWeaponAttributes(buffedBuild.meleeWeapon).weapon?.攻速

        expect(baseAttackSpeed).toBe(1)
        expect(buffedAttackSpeed).toBeCloseTo(1.3, 10)
    })

    // 测试武器独立增伤不应作用于角色
    it("武器MOD的独立增伤不应影响角色属性", () => {
        const charBuild = createCharBuild()
        charBuild.mods = [new LeveledMod(43604)]
        charBuild.baseName = "射击"

        const attrs = charBuild.calculateAttributes()
        const weaponAttrs = charBuild.calculateWeaponAttributes().weapon

        expect(attrs.独立增伤).toBe(0)
        expect(weaponAttrs?.独立增伤).toBe(-0.6)
    })

    // 测试武器属性计算
    it("应该能够正确计算武器属性", () => {
        const charBuild = createCharBuild()
        charBuild.baseName = "普通攻击"
        const { weapon: meleeWeaponAttrs } = charBuild.calculateWeaponAttributes()
        charBuild.baseName = "射击"
        const { weapon: rangedWeaponAttrs } = charBuild.calculateWeaponAttributes()

        const { 基础攻击, 基础暴击, 基础暴伤, 基础触发 } = charBuild.meleeWeapon
        // 验证武器属性是否为数字
        expect(meleeWeaponAttrs!.攻击).toBe(基础攻击)
        expect(meleeWeaponAttrs!.暴击).toBe(基础暴击 * 2) // 铸铁者100%暴击
        expect(meleeWeaponAttrs!.暴伤).toBe(基础暴伤)
        expect(meleeWeaponAttrs!.触发).toBe(基础触发)

        const { 基础攻击: 基础远程攻击, 基础暴击: 基础远程暴击, 基础暴伤: 基础远程暴伤, 基础触发: 基础远程触发 } = charBuild.rangedWeapon
        expect(rangedWeaponAttrs!.攻击).toBe(基础远程攻击)
        expect(rangedWeaponAttrs!.暴击).toBe(基础远程暴击)
        expect(rangedWeaponAttrs!.暴伤).toBe(基础远程暴伤)
        expect(rangedWeaponAttrs!.触发).toBe(基础远程触发)
        // 测试MOD
        charBuild.mods = [mod4]
        charBuild.baseName = "普通攻击"
        const { weapon: meleeWeaponAttrs2 } = charBuild.calculateWeaponAttributes()
        expect(meleeWeaponAttrs2!.暴击).toBeCloseTo(基础暴击 * 3, 1)
    })

    it("同律武器精通倍率为 1.4，普通武器保持 1.2，未命中精通为 1", () => {
        // 贝蕾妮卡精通：单手剑 / 突击枪，拥有同律近战武器「伊弥尔」（单手剑）
        const charBuild = new CharBuild({
            char: new LeveledChar("贝蕾妮卡"),
            skillLevel: 10,
            hpPercent: 0.5,
            resonanceGain: 0,
            charMods: [],
            meleeMods: [],
            rangedMods: [],
            skillMods: [],
            buffs: [],
            melee: new LeveledWeapon(10302), // 铸铁者（近战重剑，未命中精通）
            ranged: new LeveledWeapon(20201), // 赘生（远程双枪，命中精通）
            baseName: "普通攻击",
            enemyId: 130,
            enemyLevel: 80,
            enemyResistance: 0.5,
            targetFunction: "伤害",
        })

        // 普通武器未命中精通：1 倍
        const meleeWeaponAttrs = charBuild.calculateWeaponAttributes(charBuild.meleeWeapon).weapon
        expect(meleeWeaponAttrs!.攻击).toBeCloseTo(charBuild.meleeWeapon.基础攻击, 2)

        // 普通武器命中精通：1.2 倍
        const rangedWeaponAttrs = charBuild.calculateWeaponAttributes(charBuild.rangedWeapon).weapon
        expect(rangedWeaponAttrs!.攻击).toBeCloseTo(charBuild.rangedWeapon.基础攻击 * 1.2, 2)

        // 同律武器命中精通：1.4 倍
        const skillWeaponAttrs = charBuild.calculateWeaponAttributes(charBuild.skillWeapon!).weapon
        expect(skillWeaponAttrs!.攻击).toBeCloseTo(charBuild.skillWeapon!.基础攻击 * 1.4, 2)
    })

    it("应该将近战武器普通攻击替换为技能替换MOD中的字段", () => {
        const charBuild = new CharBuild({
            char: new LeveledChar("黎瑟"),
            skillLevel: 10,
            hpPercent: 0.5,
            resonanceGain: 2,
            meleeMods: [new LeveledMod(203001)],
            buffs: [],
            melee: new LeveledWeapon("万古的诀别"),
            ranged: new LeveledWeapon(20601),
            baseName: "普通攻击",
            enemyId: 130,
            enemyLevel: 80,
            enemyResistance: 0.5,
            targetFunction: "伤害",
        })

        const normalAttackSkill = charBuild.meleeWeaponSkills.find(skill => skill.名称 === "普通攻击")
        const replaceSkill = charBuild.meleeMods[0]?.技能替换?.["1030101"]
        const replaceFirstHit = replaceSkill?.字段?.find(field => field.名称 === "一段伤害")?.值

        expect(normalAttackSkill).toBeDefined()
        expect(normalAttackSkill?.id).toBe(1030201)
        expect(normalAttackSkill?.字段.some(field => field.名称 === "路径伤害")).toBe(true)
        expect(normalAttackSkill?.字段.find(field => field.名称 === "一段伤害")?.值).toBe(replaceFirstHit)
    })

    // 测试总加成计算
    it("应该能够正确计算总加成", () => {
        const charBuild = createCharBuild()
        // 测试获取攻击加成
        const attackBonus = charBuild.getTotalBonus("攻击")
        expect(attackBonus).toBe(1.25)

        // 测试获取生命加成
        const healthBonus = charBuild.getTotalBonus("生命")
        expect(healthBonus).toBe(0)
    })

    // 测试近战武器MOD52001的效果
    it("应该只增加近战武器攻击而不影响远程武器", () => {
        // 创建包含MOD52001的mods数组
        const modsWithMeleeMod = [...mockMods, new LeveledMod(52001)] // 近战攻势 (攻击+150%)

        // 创建没有MOD52001的CharBuild实例
        const charBuildWithoutMod = createCharBuild()

        // 创建包含MOD52001的CharBuild实例
        const charBuildWithMod = createCharBuild()
        charBuildWithMod.mods = modsWithMeleeMod

        // 计算没有MOD52001时的武器属性
        charBuildWithoutMod.baseName = "普通攻击"
        const { 攻击: meleeAttackWithoutMod, weapon: meleeAttrsWithoutMod } = charBuildWithoutMod.calculateWeaponAttributes()
        charBuildWithoutMod.baseName = "射击"
        const { 攻击: rangedAttackWithoutMod, weapon: rangedAttrsWithoutMod } = charBuildWithoutMod.calculateWeaponAttributes()

        // 计算有MOD52001时的武器属性
        charBuildWithMod.baseName = "普通攻击"
        const { 攻击: meleeAttackWithMod, weapon: meleeAttrsWithMod } = charBuildWithMod.calculateWeaponAttributes()
        charBuildWithMod.baseName = "射击"
        const { 攻击: rangedAttackWithMod, weapon: rangedAttrsWithMod } = charBuildWithMod.calculateWeaponAttributes()

        // 验证近战武器攻击增加了150%
        expect(meleeAttrsWithMod!.攻击).toBeCloseTo(meleeAttrsWithoutMod!.攻击 * 2.5, 2)

        // 验证远程武器攻击不受影响
        expect(rangedAttrsWithMod!.攻击).toBeCloseTo(rangedAttrsWithoutMod!.攻击, 2)

        // 验证角色攻击无影响
        expect(meleeAttackWithMod).toBe(meleeAttackWithoutMod)
        expect(rangedAttackWithMod).toBe(rangedAttackWithoutMod)
    })

    // 测试独立增伤计算
    it("应该能够正确计算独立增伤", () => {
        const charBuild = createCharBuild()
        const attrs = charBuild.calculateAttributes()
        expect(attrs.独立增伤).toBeTypeOf("number")
        expect(attrs.独立增伤).toBeGreaterThanOrEqual(0)
    })

    // 测试无视防御计算
    it("应该能够正确计算无视防御", () => {
        const charBuild = createCharBuild()
        const attrs = charBuild.calculateAttributes()
        expect(attrs.无视防御).toBeTypeOf("number")
        expect(attrs.无视防御).toBeGreaterThanOrEqual(0)
    })

    // 测试昂扬乘区计算
    it("应该能够正确计算昂扬乘区", () => {
        const charBuild = createCharBuild()
        const attrs = charBuild.calculateAttributes()

        // 确保返回值是数字且大于等于1
        const boostMultiplier = charBuild.calculateBoostMultiplier(attrs)
        expect(boostMultiplier).toBeTypeOf("number")
        expect(boostMultiplier).toBeGreaterThanOrEqual(1)

        // 修改当前HP百分比后再次测试
        charBuild.hpPercent = 0.5
        const boostMultiplier2 = charBuild.calculateBoostMultiplier(attrs)
        expect(boostMultiplier2).toBeTypeOf("number")
        expect(boostMultiplier2).toBeGreaterThanOrEqual(1)
    })

    // 测试背水乘区计算
    it("应该能够正确计算背水乘区", () => {
        const charBuild = createCharBuild()
        // 确保返回值是数字且大于等于1
        const attrs = charBuild.calculateAttributes()
        const desperateMultiplier = charBuild.calculateDesperateMultiplier(attrs)
        expect(desperateMultiplier).toBeTypeOf("number")
        expect(desperateMultiplier).toBeGreaterThanOrEqual(1)

        // 修改当前HP百分比后再次测试
        charBuild.hpPercent = 0.3
        const desperateMultiplier2 = charBuild.calculateDesperateMultiplier(attrs)
        expect(desperateMultiplier2).toBeTypeOf("number")
        expect(desperateMultiplier2).toBeGreaterThanOrEqual(1)
    })

    // 测试防御乘区计算
    it("应该能够正确计算防御乘区", () => {
        const charBuild = createCharBuild()
        const attrs = charBuild.calculateAttributes()
        const defenseMultiplier = charBuild.calculateDefenseMultiplier(attrs)
        expect(defenseMultiplier).toBeTypeOf("number")
        expect(defenseMultiplier).toBeGreaterThan(0)

        // 测试护盾类型的敌人
        charBuild.enemyId = 130
        expect(charBuild.calculateDefenseMultiplier(attrs)).toBeCloseTo(0.69, 1)
    })

    // 测试高级等级减伤乘区
    it("怪物等级大于等于200时应该启用高级等级减伤乘区", () => {
        const charBuild = createCharBuild()
        const attrs = charBuild.calculateAttributes()

        charBuild.enemyLevel = 200
        const level200Multiplier = charBuild.calculateDefenseMultiplier(attrs)

        charBuild.enemyLevel = 201
        const level201Multiplier = charBuild.calculateDefenseMultiplier(attrs)

        const level200Rate = 1 / (1 + (200 - 190) * 0.05)
        const level201Rate = 1 / (1 + (201 - 190) * 0.05)
        expect(level201Multiplier).toBeCloseTo(level200Multiplier * (level201Rate / level200Rate), 6)
    })

    // 测试主要计算方法
    it("应该能够正确执行主要计算方法", () => {
        const charBuild = createCharBuild()
        charBuild.baseName = charBuild.skills[0].名称
        const attrs = charBuild.calculateAttributes()
        const result = charBuild.calculate()
        const atk = charBuild.char.基础攻击 * (3 + 1.25) * 1.18
        expect(charBuild.getTotalBonus("攻击")).toBe(1.25)
        expect(atk).toBeCloseTo(attrs.攻击, 0)
        expect(attrs.技能威力).toBe(1.18)
        const b = charBuild.skills[0].字段.find(field => field.名称.includes("伤害"))!.值 * 1.18
        const dm = charBuild.calculateDefenseMultiplier(attrs)
        // 验证结果
        expect(result).toBeCloseTo(atk * b * dm * 0.5 * (1.9 + 0.44), 0)
    })

    // 测试更改目标函数
    it("应该能够正确执行主要计算方法", () => {
        const charBuild = createCharBuild()
        charBuild.baseName = "普通攻击"
        charBuild.targetFunction = "DPS"
        charBuild.mods = [] // 迅捷(75%)
        const income = charBuild.calcIncome(new LeveledMod(52004))
        // 验证结果
        expect(income).toBeCloseTo(0.75, 2)
    })

    it("应该能够计算收益", () => {
        const charBuild = createCharBuild()

        const buff = new LeveledBuff("黎瑟E")
        charBuild.mods = []
        charBuild.buffs = []
        const result2 = charBuild.calcIncome(buff)
        expect(result2).toBeCloseTo(0.9, 1)
    })

    // 测试目标函数计算
    describe("目标函数计算测试", () => {
        it("应该能够正确计算DPA（伤害）目标函数", () => {
            const charBuild = createCharBuild()
            charBuild.targetFunction = "伤害"

            const result = charBuild.calculate()

            // 验证结果是数字且大于0
            expect(result).toBeTypeOf("number")
            expect(result).toBeGreaterThan(0)
        })

        it("应该能够正确计算DPS（每秒伤害）目标函数", () => {
            const charBuild = createCharBuild()
            charBuild.targetFunction = "DPS"

            const result = charBuild.calculate()

            // 验证结果是数字且大于0
            expect(result).toBeTypeOf("number")
            expect(result).toBeGreaterThan(0)
        })

        it("应该能够正确计算DPAPM（每神智伤害）目标函数", () => {
            const charBuild = createCharBuild()
            charBuild.targetFunction = "每神智伤害"

            const result = charBuild.calculate()

            // 验证结果是数字且大于等于0
            expect(result).toBeTypeOf("number")
            expect(result).toBeGreaterThanOrEqual(0)
        })

        it("带熔炉的武器精炼应固定为0", () => {
            const weapon = new LeveledWeapon({
                id: 999999,
                名称: "测试熔炉武器",
                类型: ["近战", "长柄"],
                伤害类型: "切割",
                攻击: 10,
                暴击: 0.1,
                暴伤: 1.5,
                触发: 0.2,
                加成: { 攻击: 0.5 },
                熔炼: "A",
                熔炉: [{ lv: 0, 解锁: {} }],
            })
            expect(weapon.精炼).toBe(0)

            weapon.精炼 = 5
            expect(weapon.精炼).toBe(0)

            const cloned = weapon.clone()
            expect(cloned.精炼).toBe(0)
        })

        it("应该能够正确计算DPAPSM（每持续神智伤害）目标函数", () => {
            const charBuild = createCharBuild()
            charBuild.targetFunction = "每持续神智伤害"

            const result = charBuild.calculate()

            // 验证结果是数字且大于等于0
            expect(result).toBeTypeOf("number")
            expect(result).toBeGreaterThanOrEqual(0)
        })

        it("应该能够正确计算DPSPM（每神智每秒伤害）目标函数", () => {
            const charBuild = createCharBuild()
            charBuild.targetFunction = "每神智每秒伤害"

            const result = charBuild.calculate()

            // 验证结果是数字且大于等于0
            expect(result).toBeTypeOf("number")
            expect(result).toBeGreaterThanOrEqual(0)
        })

        it("应该能够正确计算DPSPSM（每持续神智每秒伤害）目标函数", () => {
            const charBuild = createCharBuild()
            charBuild.targetFunction = "每持续神智每秒伤害"

            const result = charBuild.calculate()

            // 验证结果是数字且大于等于0
            expect(result).toBeTypeOf("number")
            expect(result).toBeGreaterThanOrEqual(0)
        })
    })

    // 边界条件测试
    describe("边界条件测试", () => {
        it("应该处理HP百分比为0的情况", () => {
            const charBuild = createCharBuild()
            charBuild.hpPercent = 0

            const attrs = charBuild.calculateAttributes()
            const boostMultiplier = charBuild.calculateBoostMultiplier(attrs)
            const desperateMultiplier = charBuild.calculateDesperateMultiplier(attrs)

            // 根据实际实现调整断言
            expect(boostMultiplier).toBeTypeOf("number")
            expect(desperateMultiplier).toBeTypeOf("number")
            expect(boostMultiplier).toBeGreaterThanOrEqual(1)
            expect(desperateMultiplier).toBeGreaterThanOrEqual(1)
        })

        it("应该处理HP百分比为1的情况", () => {
            const charBuild = createCharBuild()
            charBuild.hpPercent = 1

            const attrs = charBuild.calculateAttributes()
            const boostMultiplier = charBuild.calculateBoostMultiplier(attrs)
            const desperateMultiplier = charBuild.calculateDesperateMultiplier(attrs)

            // 根据实际实现调整断言
            expect(boostMultiplier).toBeTypeOf("number")
            expect(desperateMultiplier).toBeTypeOf("number")
            expect(boostMultiplier).toBeGreaterThanOrEqual(1)
            expect(desperateMultiplier).toBeGreaterThanOrEqual(1)
        })

        it("应该处理敌人抗性为0的情况", () => {
            const charBuild = createCharBuild()
            charBuild.enemyResistance = 0

            const result = charBuild.calculate()
            expect(result).toBeTypeOf("number")
            expect(result).toBeGreaterThan(0)
        })

        it("应该处理敌人抗性为1的情况", () => {
            const charBuild = createCharBuild()
            charBuild.enemyResistance = 1

            const result = charBuild.calculate()
            expect(result).toBeTypeOf("number")
            expect(result).toBeGreaterThanOrEqual(0)
        })

        it("灾厄触发应由敌人抗性是否为0决定", () => {
            const charBuild = createCharBuild()
            const disasterWeapon = new LeveledWeapon({
                id: 999998,
                名称: "测试灾厄武器",
                类型: ["近战", "单手剑"],
                伤害类型: "灾厄",
                攻击: 100,
                暴击: 0,
                暴伤: 2,
                触发: 1,
            })

            charBuild.meleeWeapon = disasterWeapon
            charBuild.enemyResistance = 0
            const noResistanceAttrs = charBuild.calculateWeaponAttributes(disasterWeapon)
            noResistanceAttrs.攻击 = 0
            const noResistanceDamage = charBuild.calculateWeaponDamage(noResistanceAttrs, disasterWeapon)

            charBuild.enemyResistance = 0.5
            const resistanceAttrs = charBuild.calculateWeaponAttributes(disasterWeapon)
            resistanceAttrs.攻击 = 0
            const resistanceDamage = charBuild.calculateWeaponDamage(resistanceAttrs, disasterWeapon)

            expect(resistanceDamage.lowerCritNoTrigger).toBeCloseTo(noResistanceDamage.lowerCritNoTrigger!)
            expect(noResistanceDamage.lowerCritTrigger).toBeCloseTo(noResistanceDamage.lowerCritNoTrigger!)
            expect(resistanceDamage.lowerCritTrigger).toBeGreaterThan(resistanceDamage.lowerCritNoTrigger!)
            expect(resistanceDamage.expectedDamage).toBeGreaterThan(noResistanceDamage.expectedDamage)
        })

        it("字段伤害类型为灾厄时应按灾厄触发计算", () => {
            const weapon = weaponData.find(item => item.id === 20599)
            expect(weapon?.技能?.some(skill => skill.名称 === "寂灭")).toBe(true)

            const charBuild = new CharBuild({
                char: new LeveledChar("希尔妲"),
                skillLevel: 10,
                hpPercent: 0.5,
                resonanceGain: 0,
                charMods: [],
                buffs: [],
                melee: new LeveledWeapon(10302),
                ranged: new LeveledWeapon(20599),
                baseName: "寂灭",
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance: 0.5,
                targetFunction: "[寂灭]伤害",
            })
            const field = charBuild.rangedWeaponSkills.find(skill => skill.名称 === "寂灭")?.字段.find(field => field.名称 === "[寂灭]伤害")
            expect(field?.伤害类型).toBe("灾厄")

            charBuild.enemyResistance = 0
            const noResistanceDamage = charBuild.calculate()

            charBuild.enemyResistance = 0.5
            const averageDamage = charBuild.calculate()
            const triggerDamage = charBuild.calculateTargetFunction(undefined, "[寂灭]伤害.触发")
            const noTriggerDamage = charBuild.calculateTargetFunction(undefined, "[寂灭]伤害.未触发")

            expect(noResistanceDamage).toBeGreaterThan(0)
            expect(averageDamage).toBeGreaterThan(noTriggerDamage)
            expect(averageDamage).toBeLessThanOrEqual(Math.ceil(triggerDamage))
            expect(triggerDamage).toBeGreaterThan(noTriggerDamage)

            charBuild.targetFunction = "[寂灭]伤害.触发"
            const triggerDamage2 = charBuild.calculate()
            expect(triggerDamage2).toBeCloseTo(triggerDamage, 0)
        })

        it("箭雨的独立减伤不应影响灾厄伤害字段", () => {
            const makeBuild = (rangedMods: (LeveledMod | null)[]) =>
                new CharBuild({
                    char: new LeveledChar("希尔妲"),
                    skillLevel: 10,
                    hpPercent: 0.5,
                    resonanceGain: 0,
                    charMods: [],
                    buffs: [],
                    melee: new LeveledWeapon(10302),
                    ranged: new LeveledWeapon(20599),
                    rangedMods,
                    baseName: "寂灭",
                    enemyId: 130,
                    enemyLevel: 80,
                    enemyResistance: 0.5,
                    targetFunction: "[寂灭]伤害",
                })

            expect(makeBuild([new LeveledMod(43604)]).calculate()).toBeCloseTo(makeBuild([]).calculate(), 6)
        })

        it("箭雨的独立减伤在灾厄字段上不影响其他独立增伤来源", () => {
            const makeBuild = (charMods: (LeveledMod | null)[], rangedMods: (LeveledMod | null)[]) =>
                new CharBuild({
                    char: new LeveledChar("希尔妲"),
                    skillLevel: 10,
                    hpPercent: 0.5,
                    resonanceGain: 0,
                    charMods,
                    buffs: [],
                    melee: new LeveledWeapon(10302),
                    ranged: new LeveledWeapon(20599),
                    rangedMods,
                    baseName: "寂灭",
                    enemyId: 130,
                    enemyLevel: 80,
                    enemyResistance: 0.5,
                    targetFunction: "[寂灭]伤害",
                })
            const arrowRain = new LeveledMod(43604)
            const panshi = new LeveledMod(31526)

            // 豁免只剔除箭雨自身词条，磐石的 -15% 独立降伤仍按原行为作用于灾厄伤害
            expect(makeBuild([panshi], [arrowRain]).calculate()).toBeCloseTo(makeBuild([panshi], []).calculate(), 6)
            expect(makeBuild([panshi], [arrowRain]).calculate()).toBeCloseTo(makeBuild([], [arrowRain]).calculate() * 0.85, 4)
        })

        it("箭雨的独立减伤仍作用于武器自身攻击（射击子弹伤害）", () => {
            const makeBuild = (rangedMods: (LeveledMod | null)[]) =>
                new CharBuild({
                    char: new LeveledChar("希尔妲"),
                    skillLevel: 10,
                    hpPercent: 0.5,
                    resonanceGain: 0,
                    charMods: [],
                    buffs: [],
                    melee: new LeveledWeapon(10302),
                    ranged: new LeveledWeapon(20599),
                    rangedMods,
                    baseName: "射击",
                    enemyId: 130,
                    enemyLevel: 80,
                    enemyResistance: 0.5,
                    targetFunction: "射击::子弹伤害",
                })

            // 满级箭雨 -60%（独立），子弹伤害按 0.4 倍结算
            expect(makeBuild([new LeveledMod(43604)]).calculate()).toBeCloseTo(makeBuild([]).calculate() * 0.4, 4)
        })

        it("熔炉武器加成仅在角色精通武器类型匹配时生效", () => {
            const matchedBuild = new CharBuild({
                char: new LeveledChar("黎瑟"),
                skillLevel: 10,
                hpPercent: 0.5,
                resonanceGain: 0,
                charMods: [],
                buffs: [],
                melee: new LeveledWeapon(10302),
                ranged: new LeveledWeapon(20599),
                baseName: "快速出击",
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance: 0.5,
                targetFunction: "伤害",
            })
            const unmatchedBuild = new CharBuild({
                char: new LeveledChar("黎瑟"),
                skillLevel: 10,
                hpPercent: 0.5,
                resonanceGain: 0,
                charMods: [],
                buffs: [],
                melee: new LeveledWeapon(10299),
                ranged: new LeveledWeapon(20601),
                baseName: "快速出击",
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance: 0.5,
                targetFunction: "伤害",
            })

            expect(matchedBuild.rangedWeapon.forgeEffective).toBe(true)
            expect(matchedBuild.rangedWeapon.addAttr.技能威力).toBeCloseTo(0.45, 10)
            expect(matchedBuild.calculateAttributes().技能威力).toBeGreaterThan(1)

            expect(unmatchedBuild.meleeWeapon.forgeEffective).toBe(false)
            expect(unmatchedBuild.meleeWeapon.addAttr).toEqual({})
            expect(unmatchedBuild.calculateAttributes().技能威力).toBe(1)
        })

        it("额外精通武器使匹配类型的灾厄熔炼潜能生效并按 1.2 倍攻击乘算", () => {
            // 黎瑟精通：重剑 / 霰弹枪，未精通「长柄」；设置额外精通长柄后，
            // 灾厄武器「无止无休」(10299, 长柄) 的熔炼潜能应生效，且攻击按精通 1.2 倍乘算
            const build = new CharBuild({
                char: new LeveledChar("黎瑟"),
                skillLevel: 10,
                hpPercent: 0.5,
                resonanceGain: 0,
                charMods: [],
                buffs: [],
                melee: new LeveledWeapon(10299), // 无止无休（近战长柄，灾厄武器）
                ranged: new LeveledWeapon(20601),
                baseName: "快速出击",
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance: 0.5,
                targetFunction: "伤害",
                extraMastery: "长柄",
            })

            // 未设置额外精通时灾厄熔炼潜能不生效
            const baseline = new CharBuild({
                char: new LeveledChar("黎瑟"),
                skillLevel: 10,
                hpPercent: 0.5,
                resonanceGain: 0,
                charMods: [],
                buffs: [],
                melee: new LeveledWeapon(10299),
                ranged: new LeveledWeapon(20601),
                baseName: "快速出击",
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance: 0.5,
                targetFunction: "伤害",
            })
            expect(baseline.meleeWeapon.forgeEffective).toBe(false)
            expect(baseline.meleeWeapon.addAttr).toEqual({})
            expect(baseline.calculateWeaponAttributes(baseline.meleeWeapon).weapon!.攻击).toBeCloseTo(baseline.meleeWeapon.基础攻击, 2)

            // 额外精通长柄后：精通匹配，熔炼潜能生效
            expect(build.isWeaponCategoryMastered(build.meleeWeapon)).toBe(true)
            expect(build.meleeWeapon.forgeEffective).toBe(true)
            expect(build.meleeWeapon.addAttr.技能威力).toBeCloseTo(0.45, 10)
            expect(build.calculateAttributes().技能威力).toBeGreaterThan(1)

            // 1.2 倍攻击乘算正确应用
            const meleeAttrs = build.calculateWeaponAttributes(build.meleeWeapon).weapon
            expect(meleeAttrs!.攻击).toBeCloseTo(build.meleeWeapon.基础攻击 * 1.2, 2)

            // 克隆保留额外精通
            const cloned = build.clone()
            expect(cloned.isWeaponCategoryMastered(cloned.meleeWeapon)).toBe(true)
            expect(cloned.meleeWeapon.forgeEffective).toBe(true)

            // 快照往返保留额外精通
            const restored = createBuildFromSnapshot(createWorkerSnapshot(build))
            expect(restored.isWeaponCategoryMastered(restored.meleeWeapon)).toBe(true)
            expect(restored.meleeWeapon.forgeEffective).toBe(true)
        })
    })

    // 错误处理测试
    describe("错误处理测试", () => {
        it("应该处理空的MOD数组", () => {
            const charBuild = createCharBuild()
            charBuild.mods = []

            const attrs = charBuild.calculateAttributes()
            expect(attrs).toBeDefined()
            expect(attrs.攻击).toBeGreaterThan(0)
        })

        it("应该处理空的BUFF数组", () => {
            const charBuild = createCharBuild()
            charBuild.buffs = []

            const attrs = charBuild.calculateAttributes()
            expect(attrs).toBeDefined()
            expect(attrs.增伤).toBeLessThan(1)
        })

        it("应该处理不存在的武器名称", () => {
            const charBuild = createCharBuild()
            // 临时设置一个不存在的武器名称，应该回退到默认
            const originalBaseName = charBuild.baseName
            charBuild.baseName = "不存在的武器"

            // 应该不会抛出错误
            expect(() => charBuild.calculate()).not.toThrow()

            // 恢复原始名称
            charBuild.baseName = originalBaseName
        })
    })

    // 属性计算详细测试
    describe("属性计算详细测试", () => {
        it("应该正确计算威力属性", () => {
            const charBuild = createCharBuild()
            const attrs = charBuild.calculateAttributes()

            expect(attrs.技能威力).toBeTypeOf("number")
            expect(attrs.技能威力).toBeGreaterThanOrEqual(1)
        })

        it("应该正确计算持续属性", () => {
            const charBuild = createCharBuild()
            const attrs = charBuild.calculateAttributes()

            expect(attrs.技能耐久).toBeTypeOf("number")
            expect(attrs.技能耐久).toBeGreaterThanOrEqual(1)
        })

        it("应该正确计算效益属性", () => {
            const charBuild = createCharBuild()
            const attrs = charBuild.calculateAttributes()

            expect(attrs.技能效益).toBeTypeOf("number")
            expect(attrs.技能效益).toBeGreaterThanOrEqual(1)
        })

        it("应该正确计算范围属性", () => {
            const charBuild = createCharBuild()
            const attrs = charBuild.calculateAttributes()

            expect(attrs.技能范围).toBeTypeOf("number")
            expect(attrs.技能范围).toBeGreaterThanOrEqual(1)
        })

        it("应该正确计算技能速度属性", () => {
            const charBuild = createCharBuild()
            const attrs = charBuild.calculateAttributes()

            expect(attrs.技能速度).toBeTypeOf("number")
            expect(attrs.技能速度).toBeGreaterThanOrEqual(1)
        })

        it("应该正确计算技能倍率加数", () => {
            const charBuild = createCharBuild()
            const attrs = charBuild.calculateAttributes()

            expect(attrs.技能倍率加数).toBeTypeOf("number")
            expect(attrs.技能倍率加数).toBeGreaterThanOrEqual(0)
        })
    })

    // MOD效果测试
    describe("MOD效果测试", () => {
        it("应该正确应用攻击MOD", () => {
            const charBuild = createCharBuild()
            // 先清空现有MOD
            charBuild.mods = []
            const originalAttack = charBuild.calculateAttributes().攻击

            // 添加攻击MOD
            const attackMod = new LeveledMod(41001) // 炽灼 (75%攻击)
            charBuild.mods = [attackMod]

            const newAttack = charBuild.calculateAttributes().攻击
            expect(newAttack).toBeGreaterThan(originalAttack)
        })

        it("应该正确应用暴击MOD", () => {
            const charBuild = createCharBuild()
            charBuild.baseName = "普通攻击"
            const { weapon: originalWeaponAttrs } = charBuild.calculateWeaponAttributes()

            // 添加暴击MOD
            const critMod = new LeveledMod(42002) // 专注 (100%暴击)
            charBuild.mods = [critMod]

            const { weapon: newWeaponAttrs } = charBuild.calculateWeaponAttributes()
            expect(newWeaponAttrs!.暴击).toBeGreaterThan(originalWeaponAttrs!.暴击)
        })

        it("应该正确应用伤害MOD", () => {
            const charBuild = createCharBuild()
            // 先清空现有MOD和BUFF
            charBuild.mods = []
            charBuild.buffs = []
            const originalAttrs = charBuild.calculateAttributes()

            // 添加伤害MOD
            const damageMod = new LeveledMod(41324) // 雷鸣·燎原
            charBuild.mods = [damageMod]

            const newAttrs = charBuild.calculateAttributes()
            // 伤害增加应该是数字
            expect(newAttrs.增伤).toBeTypeOf("number")
            expect(originalAttrs.增伤).toBeTypeOf("number")
        })

        it("MOD效果中以 @ 声明的属性穿透到BUFF层：远程槽MOD的近战增伤作用于近战武器", () => {
            // 反转（43342，远程槽）：效果为近战武器伤害提高 60%，以 @近战增伤 声明后按 BUFF 口径汇总
            const 反转 = LeveledModHelper.fromId(43342, 5, 5)
            const createBuild = (rangedMods: LeveledMod[]) =>
                new CharBuild({
                    char: new LeveledChar("黎瑟"),
                    skillLevel: 10,
                    hpPercent: 0.5,
                    resonanceGain: 0,
                    charMods: [],
                    rangedMods,
                    buffs: [],
                    melee: new LeveledWeapon(10302),
                    ranged: new LeveledWeapon(20601),
                    baseName: "快速出击",
                    enemyId: 130,
                    enemyLevel: 80,
                    enemyResistance: 0.5,
                    targetFunction: "伤害",
                })

            const baseline = createBuild([])
            const build = createBuild([反转])

            // MOD 层不携带该属性，BUFF 层按属性自身作用域生效
            expect(反转.addAttr).toEqual({})
            expect(baseline.getTotalBonus("近战增伤", "近战")).toBe(0)
            expect(build.getTotalBonus("近战增伤", "近战")).toBeCloseTo(0.6, 10)
            // 近战作用域属性不影响远程面板
            expect(build.getTotalBonus("近战增伤", "远程")).toBe(0)
            // 同律近战经由近战作用域降级继承（BUFF 口径下降级查询不排除 BUFF）
            expect(build.getTotalBonus("近战增伤", "近战", { includeMods: false })).toBeCloseTo(0.6, 10)

            // 近战武器增伤乘区实际吃到该值
            const baselineWeapon = baseline.calculateWeaponAttributes(baseline.meleeWeapon).weapon!
            const meleeWeapon = build.calculateWeaponAttributes(build.meleeWeapon).weapon!
            expect(meleeWeapon.增伤).toBeCloseTo(baselineWeapon.增伤 + 0.6, 10)
        })

        it("特效的 @ 层属性作为候选BUFF计算收益：与开关特效的真值一致", () => {
            // BuffEditer 逐个收益把 MOD 特效的原始数据当作候选 BUFF：已选中按「移除该 BUFF」求边际收益
            const createBuild = (effectLevel: number) => {
                const melee = new LeveledWeapon(10302)
                const build = new CharBuild({
                    char: new LeveledChar("黎瑟"),
                    skillLevel: 10,
                    hpPercent: 0.5,
                    resonanceGain: 0,
                    charMods: [],
                    rangedMods: [LeveledModHelper.fromId(43342, 5, effectLevel)],
                    buffs: [],
                    melee,
                    ranged: new LeveledWeapon(20601),
                    // 以近战武器技能为伤害目标，保证近战增伤进入伤害计算
                    baseName: melee.技能![0].名称,
                    enemyId: 130,
                    enemyLevel: 80,
                    enemyResistance: 0.5,
                    targetFunction: "伤害",
                })
                return { build, effectBuff: build.rangedMods[0]!.buff! }
            }

            const on = createBuild(1)
            const off = createBuild(0)
            // 真值：特效开启（等级 1）相对关闭的伤害提升
            const truth = on.build.calculate() / off.build.calculate() - 1
            expect(truth).toBeCloseTo(0.6, 10)

            // 候选 BUFF 属性名已剥离 @ 前缀，否则 BUFF 口径汇总取不到该属性、收益恒为 0
            expect(on.effectBuff.getProperties()).toEqual({ 近战增伤: 0.6 })
            expect(on.build.calcIncome(new LeveledBuff(on.effectBuff._originalBuffData, on.effectBuff.等级), true)).toBeCloseTo(truth, 10)
            // 未选中态：候选 BUFF 取满级，收益为从关闭态加入后的提升
            expect(off.build.calcIncome(new LeveledBuff(on.effectBuff._originalBuffData, on.effectBuff.mx || 1), false)).toBeCloseTo(
                truth,
                10
            )
        })
    })

    // BUFF效果测试
    describe("BUFF效果测试", () => {
        it("应该正确应用攻击BUFF", () => {
            const charBuild = createCharBuild()
            // 先清空现有BUFF
            charBuild.buffs = []
            const originalAttack = charBuild.calculateAttributes().攻击

            // 添加攻击BUFF
            const attackBuff = new LeveledBuff("助战50攻")
            charBuild.buffs = [attackBuff]

            const newAttack = charBuild.calculateAttributes().攻击
            expect(newAttack).toBeGreaterThan(originalAttack)
        })

        it("应该正确应用伤害BUFF", () => {
            const charBuild = createCharBuild()
            // 先清空现有BUFF
            charBuild.buffs = []
            const originalAttrs = charBuild.calculateAttributes()

            // 添加伤害BUFF
            const damageBuff = new LeveledBuff("黎瑟E")
            charBuild.buffs = [damageBuff]

            const newAttrs = charBuild.calculateAttributes()
            expect(newAttrs.增伤).toBeGreaterThan(originalAttrs.增伤)
        })

        it("应该正确处理多个BUFF叠加", () => {
            const charBuild = createCharBuild()
            const originalAttack = charBuild.calculateAttributes().攻击

            // 添加多个BUFF
            const buff1 = new LeveledBuff("助战50攻")
            const buff2 = new LeveledBuff("黎瑟E")
            charBuild.buffs = [buff1, buff2]

            const newAttack = charBuild.calculateAttributes().攻击
            expect(newAttack).toBeGreaterThan(originalAttack)
        })
    })

    // 敌人类型测试
    describe("敌人类型测试", () => {
        it("应该正确处理小型敌人", () => {
            const charBuild = createCharBuild()
            charBuild.enemyId = 130

            const result = charBuild.calculate()
            expect(result).toBeTypeOf("number")
            expect(result).toBeGreaterThan(0)
        })

        it("应该正确处理大型敌人", () => {
            const charBuild = createCharBuild()
            charBuild.enemyId = 200

            const result = charBuild.calculate()
            expect(result).toBeTypeOf("number")
            expect(result).toBeGreaterThan(0)
        })

        it("应该正确处理首领敌人", () => {
            const charBuild = createCharBuild()
            charBuild.enemyId = 300

            const result = charBuild.calculate()
            expect(result).toBeTypeOf("number")
            expect(result).toBeGreaterThan(0)
        })
    })

    // 敌人血量类型测试
    describe("敌人血量类型测试", () => {
        it("应该正确处理生命类型敌人", () => {
            const charBuild = createCharBuild()
            charBuild.enemyId = 130

            const attrs = charBuild.calculateAttributes()
            const defenseMultiplier = charBuild.calculateDefenseMultiplier(attrs)
            expect(defenseMultiplier).toBeLessThan(1)
        })
    })

    // 角色测试
    describe("角色测试", () => {
        it("应该能够处理不同角色", () => {
            const chars = ["黎瑟", "菲娜", "莉兹贝尔"]

            chars.forEach(charName => {
                const charBuild = new CharBuild({
                    char: new LeveledChar(charName),
                    hpPercent: 0.5,
                    resonanceGain: 2,
                    charMods: [...mockMods],
                    buffs: [...mockBuffs],
                    melee: new LeveledWeapon(10302), //"铸铁者"),
                    ranged: new LeveledWeapon(20601), //"烈焰孤沙"),
                    baseName: "普通攻击",
                    enemyId: 130,
                    enemyLevel: 80,
                    enemyResistance: 0.5,
                    targetFunction: "伤害",
                })

                const result = charBuild.calculate()
                expect(result).toBeTypeOf("number")
                expect(result).toBeGreaterThan(0)
            })
        })
    })

    // 武器测试
    describe("武器测试", () => {
        it("应该能够处理不同近战武器", () => {
            const weapons = [10302, 10303, 10304]

            weapons.forEach(weaponId => {
                const charBuild = createCharBuild()
                charBuild.meleeWeapon = new LeveledWeapon(weaponId)

                const result = charBuild.calculateWeaponAttributes()
                // result可能包含weapon属性，也可能不包含
                if (result.weapon) {
                    expect(result.weapon.攻击).toBeGreaterThan(0)
                }
                // 无论如何，应该能够计算而不抛出错误
                expect(() => charBuild.calculateWeaponAttributes()).not.toThrow()
            })
        })

        it("应该能够处理不同远程武器", () => {
            const weapons = [20601, 20602, 20603]

            weapons.forEach(weaponId => {
                const charBuild = createCharBuild()
                charBuild.rangedWeapon = new LeveledWeapon(weaponId)

                const result = charBuild.calculateWeaponAttributes()
                // result可能包含weapon属性，也可能不包含
                if (result.weapon) {
                    expect(result.weapon.攻击).toBeGreaterThan(0)
                }
                // 无论如何，应该能够计算而不抛出错误
                expect(() => charBuild.calculateWeaponAttributes()).not.toThrow()
            })
        })

        it("atk=all 的 inherit 型同律武器应同步继承基础武器伤害类型并按纯元素结算", () => {
            const charBuild = new CharBuild({
                char: new LeveledChar("煜明"),
                skillLevel: 10,
                hpPercent: 0.5,
                resonanceGain: 2,
                charMods: [],
                buffs: [],
                melee: new LeveledWeapon(10303),
                ranged: new LeveledWeapon(20601),
                baseName: "疑星落",
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance: 1,
                targetFunction: "伤害",
            })

            expect(charBuild.skillWeapon?.inherit).toBe("melee")
            expect(charBuild.skillWeapon?.atk).toBe("all")
            expect(charBuild.skillWeapon?.伤害类型).toBe(charBuild.meleeWeapon.伤害类型)

            const attrs = charBuild.calculateWeaponAttributes(charBuild.skillWeapon)
            const damage = charBuild.calculateWeaponDamage(attrs, charBuild.skillWeapon!)

            expect(damage.lowerCritNoTrigger).toBeCloseTo(0, 6)
            expect(damage.expectedDamage).toBeCloseTo(0, 6)
        })

        it("疑星落装备无止无休时应保持纯元素结算", () => {
            const charBuild = new CharBuild({
                char: new LeveledChar("煜明"),
                skillLevel: 10,
                hpPercent: 0.5,
                resonanceGain: 2,
                charMods: [],
                buffs: [],
                melee: new LeveledWeapon(10299),
                ranged: new LeveledWeapon(20601),
                baseName: "疑星落",
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance: 0.5,
                targetFunction: "伤害",
            })

            expect(charBuild.skillWeapon?.伤害类型).toBe("灾厄")
            expect(charBuild.calculate()).toBeGreaterThan(0)
        })

        it("同律武器的下落攻击应参与下落增伤判断", () => {
            const charBuild = new CharBuild({
                char: new LeveledChar("煜明"),
                skillLevel: 10,
                hpPercent: 0.5,
                resonanceGain: 2,
                charMods: [],
                buffs: [],
                melee: new LeveledWeapon(10303),
                ranged: new LeveledWeapon(20601),
                baseName: "疑星落",
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance: 0.5,
                targetFunction: "伤害",
                skillMods: [new LeveledMod(54202)],
            })

            expect(charBuild.skillWeapon?.名称).toBe("疑星落")
            // 字段 tag 携带「下落攻击」（[疑星落]伤害 数据 tag 为 ["近战","武器","下落攻击"]）→ 按 tag 参与下落增伤
            const withTag = charBuild.calculateTargetFunction(charBuild.calculateWeaponAttributes(charBuild.skillWeapon), "[疑星落]伤害")
            // 移除字段 tag 的下落攻击后，回退到同律武器「视为」声明（仍为下落攻击）
            const field = charBuild.skillWeapon?.技能?.[0]?.字段.find(f => f.名称.includes("[疑星落]伤害"))
            const originalTags = field?.tag
            if (field) field.tag = ["近战", "武器"]
            const viaShiwei = charBuild.calculateTargetFunction(charBuild.calculateWeaponAttributes(charBuild.skillWeapon), "[疑星落]伤害")
            // 同时移除「视为」声明后不再享受下落增伤
            charBuild.skillWeapon!.视为 = undefined
            const withoutType = charBuild.calculateTargetFunction(
                charBuild.calculateWeaponAttributes(charBuild.skillWeapon),
                "[疑星落]伤害"
            )
            if (field && originalTags) field.tag = originalTags

            expect(withTag).toBeGreaterThan(withoutType)
            expect(viaShiwei).toBeGreaterThan(withoutType)
            expect(withTag).toBeCloseTo(viaShiwei, 6)
        })

        it("角色mod的effect暴击词条应对所有武器生效", () => {
            const charBuild = new CharBuild({
                char: new LeveledChar("黎瑟"),
                skillLevel: 10,
                hpPercent: 0.5,
                resonanceGain: 2,
                charMods: [new LeveledMod(41911)],
                buffs: [],
                melee: new LeveledWeapon(10302),
                ranged: new LeveledWeapon(20601),
                baseName: "普通攻击",
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance: 0.5,
                targetFunction: "伤害",
            })

            const meleeAttrs = charBuild.calculateWeaponAttributes(charBuild.meleeWeapon).weapon
            const rangedAttrs = charBuild.calculateWeaponAttributes(charBuild.rangedWeapon).weapon

            const baseBuild = new CharBuild({
                char: new LeveledChar("黎瑟"),
                skillLevel: 10,
                hpPercent: 0.5,
                resonanceGain: 2,
                charMods: [],
                buffs: [],
                melee: new LeveledWeapon(10302),
                ranged: new LeveledWeapon(20601),
                baseName: "普通攻击",
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance: 0.5,
                targetFunction: "伤害",
            })

            const baseMeleeAttrs = baseBuild.calculateWeaponAttributes(baseBuild.meleeWeapon).weapon
            const baseRangedAttrs = baseBuild.calculateWeaponAttributes(baseBuild.rangedWeapon).weapon

            expect(meleeAttrs?.暴击).toBeGreaterThan(baseMeleeAttrs?.暴击 || 0)
            expect(rangedAttrs?.暴击).toBeGreaterThan(baseRangedAttrs?.暴击 || 0)
        })
    })

    // 收益计算测试
    describe("收益计算测试", () => {
        it("应该能够计算MOD收益", () => {
            const charBuild = createCharBuild()
            charBuild.mods = []

            const mod = new LeveledMod(41001) // 炽灼 (75%攻击)
            const income = charBuild.calcIncome(mod)

            expect(income).toBeTypeOf("number")
            // 收益可能是正数、负数或0
            expect(income).toBeDefined()
        })

        it("应该能够计算BUFF收益", () => {
            const charBuild = createCharBuild()
            charBuild.buffs = []

            const buff = new LeveledBuff("助战50攻")
            const income = charBuild.calcIncome(buff)

            expect(income).toBeTypeOf("number")
            // 收益可能是正数、负数或0
            expect(income).toBeDefined()
        })

        it("应该能够计算不同MOD的收益", () => {
            const charBuild = createCharBuild()
            charBuild.mods = []

            // 测试不同类型的MOD
            const attackMod = new LeveledMod(41001) // 炽灼 (攻击)
            const critMod = new LeveledMod(42002) // 专注 (暴击)
            const damageMod = new LeveledMod(41324) // 雷鸣·燎原 (伤害)

            const income1 = charBuild.calcIncome(attackMod)
            const income2 = charBuild.calcIncome(critMod)
            const income3 = charBuild.calcIncome(damageMod)

            expect(income1).toBeTypeOf("number")
            expect(income2).toBeTypeOf("number")
            expect(income3).toBeTypeOf("number")
        })

        it("应该能够计算近战攻速MOD对召唤物的影响", () => {
            const charBuild = createCharBuild()
            charBuild.char = new LeveledChar("丽蓓卡")
            charBuild.targetFunction = "总伤"
            charBuild.baseName = "缠绵之触"
            const mod1 = new LeveledMod(51921) // 水雾弥散
            const mod2 = new LeveledMod(52004) // 迅捷
            charBuild.mods = [mod1, mod2]

            const attrs = charBuild.calculateWeaponAttributes()

            expect(attrs.weapon).toBeDefined()

            const income1 = charBuild.calcIncome(mod1, true)
            const income2 = charBuild.calcIncome(mod2, true)

            expect(income1).toBeGreaterThan(0)
            expect(income2).toBeGreaterThan(0)
        })

        it("移除技能倍率乘数BUFF时收益不应出现Infinity", () => {
            const charBuild = createCharBuild()
            const buff = new LeveledBuff("煜明2溯")

            charBuild.buffs = [buff]
            charBuild.calculate = () =>
                Math.max(
                    0,
                    charBuild.buffs.reduce((value, currentBuff) => value * (1 + (currentBuff.getAttrValue("技能倍率乘数") ?? 0)), 100)
                )

            const income = charBuild.calcIncome(buff, true)

            expect(Number.isFinite(income)).toBe(true)
            expect(income).toBeCloseTo(0.6, 10)
        })

        it("已装备MOD的精确收益应等于真实移除后的重算结果", () => {
            const charBuild = createCharBuild()
            const baseValue = charBuild.calculate()
            const removedBuild = charBuild.clone()

            removedBuild.charMods.splice(0, 1)
            const removedValue = removedBuild.calculate()

            expect(removedValue).toBeGreaterThan(0)
            expect(charBuild.calcEquippedModIncome("角色", 0)).toBeCloseTo(baseValue / removedValue - 1, 10)
        })
    })

    // 配置测试
    describe("配置测试", () => {
        it("应该能够获取构建选项", () => {
            const charBuild = createCharBuild()

            // 验证基本配置
            expect(charBuild.char).toBeDefined()
            expect(charBuild.hpPercent).toBeDefined()
            expect(charBuild.enemyId).toBeDefined()
            expect(charBuild.targetFunction).toBeDefined()
        })

        it("应该能够修改配置", () => {
            const charBuild = createCharBuild()

            // 修改配置
            charBuild.hpPercent = 0.8
            charBuild.enemyId = 130
            charBuild.targetFunction = "每秒伤害"

            // 验证修改
            expect(charBuild.hpPercent).toBe(0.8)
            expect(charBuild.enemyId).toBe(130)
            expect(charBuild.targetFunction).toBe("每秒伤害")
        })
    })

    describe("自动极化测试", () => {
        it("容量允许单次极化时应优先选择耐受更高的MOD", () => {
            const charBuild = createCharBuild()
            charBuild.char.等级 = 20
            charBuild.charMods = [new LeveledMod(51411), new LeveledMod(41732)]
            charBuild.auraMod = undefined

            expect(charBuild.getModCost("角色")).toBe(46)
            expect(charBuild.getModCap("角色")).toBe(40)
            expect(charBuild.getModCostTransfer("角色")).toEqual([0])
            expect(charBuild.getModCostMax("角色")).toBe(32)
        })
    })

    describe("方案兼容（共享极化方案）", () => {
        /**
         * 构造超上限的基础构筑：51411(28) + 41732(18) = 46 / 上限 40，第一套需极化 [0]。
         * @returns CharBuild
         */
        function buildOverCap() {
            const charBuild = createCharBuild()
            charBuild.char.等级 = 20
            charBuild.charMods = [new LeveledMod(51411), new LeveledMod(41732)]
            charBuild.auraMod = undefined
            return charBuild
        }

        /**
         * 构造 8 槽空第二套MOD表。
         * @returns 第二套MOD表
         */
        function emptyExtra() {
            return Array(8).fill(null) as (LeveledMod | null)[]
        }

        /**
         * 构造指定极性/耐受的角色MOD（复用同一基础MOD并覆写字段）。
         * @param pol 极性
         * @param cost 耐受
         * @returns 角色MOD
         */
        function mk(pol: "A" | "D" | "V", cost: number) {
            const mod = new LeveledMod(51411)
            mod.极性 = pol
            mod.耐受 = cost
            return mod
        }

        it("无注入时返回第一套自身极化方案", () => {
            const charBuild = buildOverCap()
            expect(charBuild.getModCostTransfer("角色")).toEqual([0])
            expect(charBuild.getModCostTransfer("角色", [])).toEqual([0])
            expect(charBuild.getModCostMax("角色")).toBe(32)
            expect(charBuild.getModCostMax("角色", [])).toBe(32)
        })

        it("角色光环可参与极化（光环极化）", () => {
            const charBuild = buildOverCap()
            const aura = new LeveledMod(31524) // 羽蛇·警惕
            aura.耐受 = 30 // 模拟高耐受光环，使其参与极化排序
            aura.最大耐受 = 0 // 不提升上限，保持 cap 40
            charBuild.auraMod = aura
            // 总 76 > 40：降序 30(光环 idx2)、28(idx0)、18(idx1)
            expect(charBuild.getModCostTransfer("角色")).toEqual([2, 0, 1])
            expect(charBuild.getModCostMax("角色")).toBe(38)
        })

        it("共享极化方案：用同一套方案同时满足两套（1V2A）", () => {
            const charBuild = createCharBuild()
            charBuild.char.等级 = 45 // cap = 20 + 45 = 65
            // A方案：30V 30D 20A 20A
            charBuild.charMods = [mk("V", 30), mk("D", 30), mk("A", 20), mk("A", 20)]
            charBuild.auraMod = undefined
            // B方案：30V 30A 20A 20A
            const extra = emptyExtra()
            extra[0] = mk("V", 30)
            extra[1] = mk("A", 30)
            extra[2] = mk("A", 20)
            extra[3] = mk("A", 20)

            const plan = charBuild.getSharedPolarizationPlan("角色", extra)
            // 应生成 1V2A 而非 A方案最优(V+D)+B方案最优(V+A)
            expect(plan.ok).toBe(true)
            expect(plan.plan).toEqual({ A: 2, D: 0, V: 1, O: 0 })
            // A方案被极化的槽位：V槽[0] + A槽[2,3]
            expect(plan.first).toEqual([0, 2, 3])
            // B方案被极化的槽位：V槽[0] + A槽[1,2]
            expect(plan.second).toEqual([0, 1, 2])
            // 合并索引：偏移 = base.length = 5
            expect(charBuild.getModCostTransfer("角色", extra)).toEqual([0, 2, 3, 5, 6, 7])
            // 两套应用共享方案后均不超上限
            expect(charBuild.checkSchemeCompat("角色", extra).ok).toBe(true)
            expect(charBuild.getModCostMax("角色", extra)).toBe(65)
        })

        it("无法同时满足时优先满足第一套（overcap）", () => {
            const charBuild = createCharBuild()
            charBuild.char.等级 = 45 // cap 65
            // 第一套：30V 30D 20A 20A（可满足）
            charBuild.charMods = [mk("V", 30), mk("D", 30), mk("A", 20), mk("A", 20)]
            // 第二套：8×30A = 240，即使全部极化仍 120 > 65，无法满足
            const extra = emptyExtra()
            for (let i = 0; i < 8; i++) extra[i] = mk("A", 30)
            extra.push(null) // 角色类型第二套需含光环位

            const plan = charBuild.getSharedPolarizationPlan("角色", extra)
            expect(plan.ok).toBe(false)
            expect(plan.reason).toBe("overcap")
            // 优先满足第一套：第一套应用共享方案后不超上限
            expect(plan.cost1).toBeLessThanOrEqual(charBuild.getModCap("角色"))
        })

        it("两套光环槽极性不同且均需极化时不兼容（aura）", () => {
            const charBuild = createCharBuild()
            charBuild.char.等级 = 45 // cap 65
            charBuild.charMods = [mk("A", 30), mk("A", 30)]
            const aura1 = new LeveledMod(31524) // D
            aura1.耐受 = 40
            aura1.最大耐受 = 0
            charBuild.auraMod = aura1 // 第一套光环需 D 槽（A槽全极化后仍 70 > 65）
            const extra = emptyExtra()
            extra[0] = mk("A", 30)
            extra[1] = mk("A", 30)
            const aura2 = new LeveledMod(31512) // V，与第一套不同
            aura2.耐受 = 40
            aura2.最大耐受 = 0
            extra.push(aura2) // 第二套光环需 V 槽

            const plan = charBuild.getSharedPolarizationPlan("角色", extra)
            // 中枢只能固定一种极性：优先满足第一套（D），第二套光环无法半价 → 不兼容
            expect(plan.ok).toBe(false)
            expect(plan.reason).toBe("aura")
        })

        it("共享极化数量不超过槽位上限，异极性槽位受×1.5惩罚", () => {
            const charBuild = createCharBuild()
            charBuild.char.等级 = 45 // cap 65
            // A方案：8×A10 = 80；B方案：8×V10 = 80（满槽，V槽落入A槽受惩罚）
            charBuild.charMods = Array(8)
                .fill(null)
                .map(() => mk("A", 10))
            const extra = emptyExtra()
            for (let i = 0; i < 8; i++) extra[i] = mk("V", 10)
            extra.push(null) // 角色类型第二套需含光环位（末尾元素）

            const plan = charBuild.getSharedPolarizationPlan("角色", extra)
            // 共享极化槽位总数 ≤ 9（8 普通 + 1 中央）
            const totalSlots = Object.values(plan.plan).reduce((sum, n) => sum + n, 0) + (plan.aura ? 1 : 0)
            expect(totalSlots).toBeLessThanOrEqual(9)
            // 第一套 3 个A槽半价后 65 ≤ 65；B方案V槽异极性×1.5惩罚后 95 > 65 → 无法共存
            expect(plan.ok).toBe(false)
            expect(plan.reason).toBe("overcap")
            expect(plan.first).toHaveLength(3)
            expect(plan.secondPenalty).toHaveLength(3)
            expect(plan.cost1).toBeLessThanOrEqual(charBuild.getModCap("角色"))
        })

        it("两套均需多极性极化时共享槽位总数不超过上限", () => {
            const charBuild = createCharBuild()
            charBuild.char.等级 = 45 // cap 65
            // 两套相同：4×A15 + 4×V15 = 120 → 全极化 64 ≤ 65
            const buildSet = () => {
                const mods = emptyExtra()
                for (let i = 0; i < 4; i++) mods[i] = mk("A", 15)
                for (let i = 4; i < 8; i++) mods[i] = mk("V", 15)
                return mods
            }
            charBuild.charMods = buildSet()
            const extra = buildSet()
            extra.push(null) // 角色类型第二套需含光环位

            const plan = charBuild.getSharedPolarizationPlan("角色", extra)
            const totalSlots = Object.values(plan.plan).reduce((sum, n) => sum + n, 0) + (plan.aura ? 1 : 0)
            expect(plan.ok).toBe(true)
            expect(totalSlots).toBeLessThanOrEqual(9)
            expect(totalSlots).toBe(8)
        })

        it("异极性惩罚修复假共存：旧模型误判可共存，加入×1.5惩罚后无法共存且优先满足第一套", () => {
            const charBuild = createCharBuild()
            charBuild.char.等级 = 50 // cap 70
            // A方案：8×A15 = 120；B方案：4×V15 = 60（单独不超上限）
            charBuild.charMods = Array(8)
                .fill(null)
                .map(() => mk("A", 15))
            const extra = emptyExtra()
            for (let i = 0; i < 4; i++) extra[i] = mk("V", 15)

            const plan = charBuild.getSharedPolarizationPlan("角色", extra)
            // 第一套全A槽极化后 64 ≤ 70；B方案V槽落入A槽受惩罚（92 > 70）→ 无法共存
            expect(plan.ok).toBe(false)
            expect(plan.reason).toBe("overcap")
            // 优先满足第一套
            expect(plan.cost1).toBeLessThanOrEqual(charBuild.getModCap("角色"))
        })

        it("近战类型同样支持共享极化方案注入", () => {
            const charBuild = createCharBuild()
            charBuild.meleeWeapon.等级 = 20
            charBuild.meleeMods = [new LeveledMod(51411), new LeveledMod(41732)] // 46 > 40 → 极化 [0]
            expect(charBuild.getModCostTransfer("近战")).toEqual([0])

            const extra = emptyExtra()
            extra[0] = new LeveledMod(51411)
            extra[1] = new LeveledMod(41732)
            // 偏移 = getMods("近战").length = 2；共享方案下两套各极化 1 个槽
            expect(charBuild.getModCostTransfer("近战", extra)).toEqual([0, 2])
            expect(charBuild.checkSchemeCompat("近战", extra).ok).toBe(true)
        })
    })

    // 自动构筑测试
    describe("自动构筑测试", () => {
        it("无同律武器角色勾选同律MOD时不应报错", () => {
            const charBuild = createCharBuild()
            charBuild.buffs = []

            expect(() =>
                charBuild.autoBuild({
                    includeTypes: ["skillMods"],
                    modOptions: [new LeveledModWithCount(54202, undefined, undefined, 1)],
                    enableLog: false,
                })
            ).not.toThrow()
        })

        it("当初始MOD数量已达上限时不应继续超量添加", () => {
            const charBuild = createCharBuild()
            charBuild.mods = [
                new LeveledMod(41001),
                new LeveledMod(41002),
                new LeveledMod(41003),
                new LeveledMod(41004),
                new LeveledMod(41007),
                new LeveledMod(41213),
                new LeveledMod(41214),
                new LeveledMod(41311),
            ]
            charBuild.buffs = []

            const result = charBuild.autoBuild({
                includeTypes: ["charMods"],
                preserveTypes: ["charMods"],
                modOptions: [new LeveledModWithCount(41324, undefined, undefined, 5)],
                enableLog: true,
            })

            expect(result.newBuild.charMods.length).toBe(8)
            expect(result.newBuild.charMods.some(mod => mod?.id === 41324)).toBe(false)
        })

        it("应该优先补齐趋向条件再继续常规迭代", () => {
            const charBuild = createCharBuild()
            charBuild.mods = [new LeveledMod(41002), new LeveledMod(41003), new LeveledMod(41746)]
            charBuild.buffs = []

            const modOptions = [new LeveledModWithCount(51742, undefined, undefined, 1)]

            const result = charBuild.autoBuild({
                includeTypes: ["charMods"],
                preserveTypes: ["charMods"],
                modOptions,
                enableLog: true,
            })

            const conditionMod = result.newBuild.charMods.find(mod => mod?.id === 41746)
            const dCount = result.newBuild.charMods.filter(mod => mod?.极性 === "D").length

            expect(conditionMod).toBeDefined()
            expect(dCount).toBeGreaterThanOrEqual(4)
            expect(result.newBuild.checkModEffective(conditionMod!)?.isEffective).toBe(true)
        })

        it("当条件MOD在auraMod时也应优先补齐趋向条件", () => {
            const charBuild = createCharBuild()
            charBuild.mods = [new LeveledMod(41002), new LeveledMod(41003)]
            charBuild.auraMod = new LeveledMod(41746)
            charBuild.buffs = []

            const modOptions = [new LeveledModWithCount(51742, undefined, undefined, 1)]

            const result = charBuild.autoBuild({
                includeTypes: ["charMods"],
                preserveTypes: ["charMods"],
                modOptions,
                enableLog: true,
            })

            const dCount = result.newBuild.mods.filter(mod => mod?.极性 === "D").length

            expect(result.newBuild.auraMod?.id).toBe(41746)
            expect(dCount).toBeGreaterThanOrEqual(4)
            expect(result.newBuild.checkModEffective(result.newBuild.auraMod!)?.isEffective).toBe(true)
        })

        it("应该仅在装备的魔之楔id重复不超过1次时生效", () => {
            const charBuild = createCharBuild()
            const targetMod = new LeveledMod(41716)
            const attrs = charBuild.calculateAttributes()

            expect(targetMod.checkCondition(attrs, [new LeveledMod(41002), new LeveledMod(41003), targetMod])?.isEffective).toBe(true)

            expect(targetMod.checkCondition(attrs, [new LeveledMod(41002), new LeveledMod(41002), targetMod])?.isEffective).toBe(false)

            expect(
                targetMod.checkCondition(attrs, [new LeveledMod(41002), new LeveledMod(41003), targetMod, new LeveledMod(41716)])
                    ?.isEffective
            ).toBe(false)
        })

        it("应该先补齐技能效益条件再纳入对应条件MOD", () => {
            const charBuild = createCharBuild()
            charBuild.char = new LeveledChar("丽蓓卡")
            charBuild.baseName = "普通攻击"
            charBuild.mods = [new LeveledMod(56121)]
            charBuild.buffs = []

            const modOptions = [
                new LeveledModWithCount(56121, undefined, undefined, 1),
                new LeveledModWithCount(56122, undefined, undefined, 1),
                new LeveledModWithCount(56161, undefined, undefined, 1),
                new LeveledModWithCount(56162, undefined, undefined, 1),
                new LeveledModWithCount(51723, undefined, undefined, 3),
            ]

            const result = charBuild.autoBuild({
                includeTypes: ["charMods"],
                preserveTypes: ["charMods"],
                modOptions,
                enableLog: true,
            })

            const conditionalMod = result.newBuild.charMods.find(mod => mod?.id === 56121)

            expect(conditionalMod).toBeDefined()
            expect(result.newBuild.checkModEffective(conditionalMod!)?.isEffective).toBe(true)
            expect(result.newBuild.calculateAttributes().技能效益).toBeGreaterThanOrEqual(1.65)
        })

        it("替换不应破坏光环条件导致收益误判", () => {
            const charBuild = createCharBuild()
            charBuild.mods = [
                new LeveledMod(51742),
                new LeveledMod(41002),
                new LeveledMod(41003),
                new LeveledMod(51324),
                new LeveledMod(41324),
                new LeveledMod(41001),
                new LeveledMod(51313),
            ]
            charBuild.auraMod = new LeveledMod(51746)
            charBuild.buffs = []

            const modOptions = [51742, 41002, 41003, 51324, 41324, 41001, 51313, 51743, 41007].map(
                id => new LeveledModWithCount(id, undefined, undefined, 20)
            )

            const result = charBuild.autoBuild({
                includeTypes: ["charMods"],
                preserveTypes: ["charMods"],
                modOptions,
                enableLog: true,
            })

            const dCount = result.newBuild.charMods.filter(mod => mod?.极性 === "D").length

            expect(dCount).toBeGreaterThanOrEqual(3)
            expect(result.newBuild.checkModEffective(result.newBuild.auraMod!)?.isEffective).toBe(true)
        })

        it("角色限定的MOD：限定为角色id，仅对应角色可入选；0 收益候选跳过", () => {
            // 追踪模式 (150401) 限定=苏乙 id 1504，唯一加成是技能威力 +0.55
            const suyiSettings = {
                charLevel: 80,
                baseName: "歼星模式",
                hpPercent: 1,
                resonanceGain: 3,
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance: 0,
                isRouge: false,
                targetFunction: "[星如雨]伤害",
                mainTargetEnabled: true,
                charSkillLevel: 12,
                meleeWeapon: 10601,
                meleeWeaponLevel: 80,
                meleeWeaponRefine: 5,
                rangedWeapon: 20101,
                rangedWeaponLevel: 80,
                rangedWeaponRefine: 5,
                auraMod: 51765,
                imbalance: false,
                charMods: Array(8).fill(null),
                meleeMods: Array(8).fill(null) as ([number, number] | null)[],
                rangedMods: [
                    [53005, 10],
                    [53012, 10],
                    [43002, 5],
                    [53011, 10],
                    [53009, 10],
                    [53010, 10],
                    [43343, 5],
                    [33332, 5],
                ] as ([number, number] | null)[],
                skillWeaponMods: Array(4).fill(null) as ([number, number] | null)[],
                buffs: [
                    ["菲娜Q", 12],
                    ["菲娜被动+1溯", 1],
                    ["全盛·振奋", 10],
                    ["激扬寒波", 10],
                    ["菲娜6溯", 5],
                    ["菲娜4溯", 1],
                    ["菲娜助战", 1],
                    ["菲娜被动(自身)", 1],
                    ["羽翼·鼓舞·专注(光)", 10],
                    ["色散成霓", 10],
                ] as [string, number][],
                customBuff: [] as [string, number][],
                customVariables: [] as [string, string][],
                team1: "-" as number | "-",
                team1Weapon: "-" as number | "-",
                team1Build: "-",
                team2: "-" as number | "-",
                team2Weapon: "-" as number | "-",
                team2Build: "-",
                assist1: createDefaultAssistSideSettings(),
                assist2: createDefaultAssistSideSettings(),
                timelineDPS: false,
                useGlobal: false,
                effectConfig: {} as Record<string, number>,
                actions: { enable: false, i: [], b: [], hp: [], bgs: [] },
                extraMastery: "",
                dotSettings: { skill: 0, melee: 0, ranged: 0, skillweapon: 0 },
                petId: 0,
                petLevel: 3,
                petCoverage: 1,
                petAutoCoverage: true,
                modVariantIndex: 0,
                modVariants: [],
                team1BuildVariant: "A" as const,
                team2BuildVariant: "A" as const,
                traits: Array(4).fill(null) as ([number, number] | null)[],
            }
            // 苏乙目标吃技能威力：限定命中且有收益，应入选
            const suyiBuild = createCharBuildFromSettings(1504, suyiSettings)
            const suyiResult = suyiBuild.autoBuild({
                includeTypes: ["charMods"],
                preserveTypes: ["charMods"],
                modOptions: [new LeveledModWithCount(150401, undefined, undefined, 1)],
                enableLog: true,
            })
            expect(suyiResult.newBuild.charMods.some(mod => mod?.id === 150401)).toBe(true)
            expect(suyiResult.log).not.toContain("当前选项MOD无收益")

            // 射击目标不吃技能威力：0 收益候选按既定行为跳过
            const zeroIncomeBuild = createCharBuildFromSettings(1504, {
                ...suyiSettings,
                baseName: "射击",
                targetFunction: "DPS/0.71*1.71",
            })
            const zeroIncomeResult = zeroIncomeBuild.autoBuild({
                includeTypes: ["charMods"],
                preserveTypes: ["charMods"],
                modOptions: [new LeveledModWithCount(150401, undefined, undefined, 1)],
                enableLog: true,
            })
            expect(zeroIncomeResult.newBuild.charMods.some(mod => mod?.id === 150401)).toBe(false)
            expect(zeroIncomeResult.log).toContain("当前选项MOD无收益")

            // 非限定角色（黎瑟）该 MOD 有收益，但因限定不入选
            const liseBuild = createCharBuild()
            liseBuild.charMods = []
            liseBuild.buffs = []
            expect(liseBuild.calcIncome(new LeveledModWithCount(150401, undefined, undefined, 1))).toBeGreaterThan(0)
            const liseResult = liseBuild.autoBuild({
                includeTypes: ["charMods"],
                preserveTypes: ["charMods"],
                modOptions: [new LeveledModWithCount(150401, undefined, undefined, 1)],
                enableLog: false,
            })
            expect(liseResult.newBuild.charMods.some(mod => mod?.id === 150401)).toBe(false)
        })
    })

    describe("锋芒条件MOD测试", () => {
        it("应该按队友武器数量叠加紫色锋芒增伤", () => {
            const baseBuild = createCharBuild()
            baseBuild.baseName = "普通攻击"
            baseBuild.mods = [new LeveledMod(41803)]
            baseBuild.buffs = []
            const baseDamageIncrease = baseBuild.calculateAttributes().增伤

            const charBuild = createCharBuild()
            charBuild.baseName = "普通攻击"
            charBuild.mods = [new LeveledMod(41803)]
            charBuild.buffs = []
            charBuild.teamWeaponCategories = ["重剑"]
            const attrs = charBuild.calculateAttributes()

            expect(attrs.增伤 - baseDamageIncrease).toBeCloseTo(0.06, 5)
        })

        it("应该在自身与两名队友同类别时封顶金色锋芒增伤", () => {
            const baseBuild = createCharBuild()
            baseBuild.baseName = "普通攻击"
            baseBuild.mods = []
            baseBuild.buffs = []
            const baseDamageIncrease = baseBuild.calculateAttributes().增伤

            const charBuild = createCharBuild()
            charBuild.baseName = "普通攻击"
            charBuild.mods = [new LeveledMod(51803)]
            charBuild.buffs = []
            charBuild.teamWeaponCategories = ["重剑", "重剑"]
            const attrs = charBuild.calculateAttributes()

            expect(attrs.增伤 - baseDamageIncrease).toBeCloseTo(0.33, 5)
        })

        it("同类别计数达到4时仍应按3层上限计算", () => {
            const baseBuild = createCharBuild()
            baseBuild.char = new LeveledChar("莉兹贝尔")
            baseBuild.baseName = "普通攻击"
            baseBuild.mods = []
            baseBuild.buffs = []
            const baseDamageIncrease = baseBuild.calculateAttributes().增伤

            const charBuild = createCharBuild()
            charBuild.char = new LeveledChar("莉兹贝尔")
            charBuild.baseName = "普通攻击"
            charBuild.mods = [new LeveledMod(51803)]
            charBuild.buffs = []
            charBuild.teamWeaponCategories = ["重剑", "重剑"]
            const attrs = charBuild.calculateAttributes()

            expect(attrs.增伤 - baseDamageIncrease).toBeCloseTo(0.33, 5)
        })
    })

    describe("表达式测试", () => {
        it("应该能够计算常数", () => {
            const charBuild = createCharBuild()

            // 修改配置
            charBuild.enemyId = 0
            charBuild.targetFunction = "1+1"
            const result = charBuild.calculate()

            // 验证修改
            expect(result).toBe(2)
        })

        it("动态武器属性应参与伤害计算", () => {
            const baseBuild = createCharBuild()
            baseBuild.baseName = "射击"

            const dynamicBuild = createCharBuild()
            dynamicBuild.baseName = "射击"
            dynamicBuild.dynamicBuffs.push(
                new LeveledBuff({
                    名称: "测试动态攻击",
                    描述: "测试用动态属性",
                    code: "weaponAttr.攻击 += 100",
                })
            )

            const dynamicAttrs = dynamicBuild.calculateWeaponAttributes()
            expect(dynamicAttrs.weapon?.攻击).toBeCloseTo(baseBuild.calculateWeaponAttributes().weapon!.攻击 + 100, 9)
            expect(dynamicBuild.calculate()).toBeGreaterThan(baseBuild.calculate())
        })

        it("追加伤害BUG应按怪物等级减伤再次降低追加伤害", () => {
            const charBuild = createCharBuild()
            charBuild.baseName = "射击"
            charBuild.enemyLevel = 200
            charBuild.dynamicBuffs.push(
                new LeveledBuff({
                    名称: "测试追加伤害",
                    描述: "测试用追加伤害",
                    code: "weaponAttr.追加伤害=2",
                }),
                new LeveledBuff("追加伤害BUG")
            )

            const dynamicAttrs = charBuild.calculateWeaponAttributes()

            expect(dynamicAttrs.weapon?.追加伤害).toBeCloseTo(2 / (1 + (200 - 190) * 0.05))
        })

        it("构造函数选中的追加伤害BUG应进入动态BUFF并影响追加伤害", () => {
            const selectedBuffBuild = new CharBuild({
                char: new LeveledChar("黎瑟"),
                skillLevel: 10,
                hpPercent: 0.5,
                resonanceGain: 2,
                charMods: [...mockMods],
                buffs: [
                    new LeveledBuff({
                        名称: "测试追加伤害",
                        描述: "测试用追加伤害",
                        attr: { 追加伤害: 2 },
                    }),
                    new LeveledBuff("追加伤害BUG"),
                ],
                melee: new LeveledWeapon(10302),
                ranged: new LeveledWeapon(20601),
                baseName: "射击",
                enemyId: 130,
                enemyLevel: 200,
                enemyResistance: 0.5,
                targetFunction: "伤害",
            })
            const dynamicAttrs = selectedBuffBuild.calculateWeaponAttributes()

            expect(selectedBuffBuild.dynamicBuffs.map(buff => buff.名称)).toContain("追加伤害BUG")
            expect(dynamicAttrs.weapon?.追加伤害).toBeCloseTo(2 / (1 + (200 - 190) * 0.05))
        })

        it("动态attr属性应在最终阶段按表达式计算", () => {
            const charBuild = createCharBuild()
            charBuild.baseName = "射击"
            const baseAttrs = charBuild.calculateAttributes()
            const staticBuild = createCharBuild()
            staticBuild.baseName = "射击"
            staticBuild.buffs.push(
                new LeveledBuff({
                    名称: "测试静态属性字段",
                    描述: "测试用静态属性",
                    attr: {
                        技能伤害: 0.2 * baseAttrs.技能威力,
                        远程暴伤: 0.8 * baseAttrs.技能威力,
                    },
                })
            )
            const buff = new LeveledBuff({
                名称: "测试动态属性字段",
                描述: "测试用动态属性",
                attr: {
                    技能伤害: "0.2*技能威力",
                    远程暴伤: "0.8*技能威力",
                },
            })
            charBuild.buffs.push(buff)

            const attrs = charBuild.calculateAttributes()
            const weaponAttrs = charBuild.calculateWeaponAttributes(charBuild.rangedWeapon).weapon
            const optionBuff = new LeveledBuff({
                名称: "测试动态属性选项",
                描述: "测试用动态属性",
                attr: {
                    远程暴伤: "0.8*技能威力",
                },
            })
            const preparedBuff = charBuild.prepareBuff(optionBuff)

            expect(buff.getAttrValue("技能伤害")).toBeCloseTo(0.2 * baseAttrs.技能威力)
            expect(buff.getAttrValue("远程暴伤")).toBeCloseTo(0.8 * baseAttrs.技能威力)
            expect(preparedBuff.getProperties().远程暴伤).toBeCloseTo(0.8 * baseAttrs.技能威力)
            expect(optionBuff.getProperties().远程暴伤).toBeUndefined()
            expect(charBuild.calcIncome(optionBuff)).toBeCloseTo(charBuild.calcIncome(preparedBuff))
            expect(charBuild.calcIncome(buff, true)).toBeGreaterThan(0)
            expect(charBuild.calcIncome(buff, true)).toBeCloseTo(charBuild.calcEquippedBuffIncome(buff))
            expect(attrs.技能伤害).toBeCloseTo(staticBuild.calculateAttributes().技能伤害)
            expect(weaponAttrs?.暴伤).toBeCloseTo(staticBuild.calculateWeaponAttributes(staticBuild.rangedWeapon).weapon?.暴伤 || 0)
        })
    })

    describe("E2E", () => {
        it("clone 的计算结果应该相同", () => {
            const build = createCharBuildFromSettings(1504, {
                charLevel: 80,
                baseName: "射击",
                hpPercent: 1,
                resonanceGain: 3,
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance: 0,
                isRouge: false,
                targetFunction: "DPS/0.71*1.71",
                mainTargetEnabled: true,
                charSkillLevel: 12,
                meleeWeapon: 10601,
                meleeWeaponLevel: 80,
                meleeWeaponRefine: 5,
                rangedWeapon: 20101,
                rangedWeaponLevel: 80,
                rangedWeaponRefine: 5,
                auraMod: 51765,
                imbalance: false,
                charMods: [
                    [51463, 10],
                    [51961, 10],
                    [56164, 10],
                    [51336, 10],
                    [51763, 10],
                    [51761, 10],
                    [51761, 10],
                    [51761, 10],
                ],
                meleeMods: [null, null, null, null, null, null, null, null],
                rangedMods: [
                    [53005, 10],
                    [53012, 10],
                    [43002, 5],
                    [53011, 10],
                    [53009, 10],
                    [53010, 10],
                    [43343, 5],
                    [33332, 5],
                ],
                skillWeaponMods: [null, null, null, null],
                buffs: [
                    ["菲娜Q", 12],
                    ["菲娜被动+1溯", 1],
                    ["全盛·振奋", 10],
                    ["激扬寒波", 10],
                    ["菲娜6溯", 5],
                    ["菲娜4溯", 1],
                    ["菲娜助战", 1],
                    ["菲娜被动(自身)", 1],
                    ["羽翼·鼓舞·专注(光)", 10],
                    ["色散成霓", 10],
                ],
                customBuff: [],
                customVariables: [],
                team1: "-",
                team1Weapon: "-",
                team1Build: "-",
                team2: "-",
                team2Weapon: "-",
                team2Build: "-",
                assist1: createDefaultAssistSideSettings(),
                assist2: createDefaultAssistSideSettings(),
                timelineDPS: false,
                useGlobal: false,
                effectConfig: {},
                actions: { enable: false, i: [], b: [], hp: [], bgs: [] },
                extraMastery: "",
                dotSettings: { skill: 0, melee: 0, ranged: 0, skillweapon: 0 },
                petId: 0,
                petLevel: 3,
                petCoverage: 1,
                petAutoCoverage: true,
                modVariantIndex: 0,
                modVariants: [],
                team1BuildVariant: "A" as const,
                team2BuildVariant: "A" as const,
                traits: Array(4).fill(null) as ([number, number] | null)[],
            })
            const cloned = build.clone()
            expect(build.calculate()).toBe(cloned.calculate())
        })
    })

    // 性能测试
    describe("性能测试", () => {
        it("应该能够处理大量MOD", () => {
            const charBuild = createCharBuild()

            // 添加多个MOD
            const manyMods = []
            for (let i = 0; i < 20; i++) {
                manyMods.push(new LeveledMod(41001)) // 炽灼
            }
            charBuild.mods = manyMods

            const result = charBuild.calculate()
            expect(result).toBeTypeOf("number")
            expect(result).toBeGreaterThan(0)
        })
    })

    // 转属克/转属逆 应把物理+元素一并转为属克/属逆元素并按翻转抗性结算；物理/元素 访问器按结算类型拆分期望伤害
    describe("转属克/转属逆 物理分量转换 与 物理/元素 访问器", () => {
        function buildFlora(enemyResistance = 0.5) {
            return new CharBuild({
                char: new LeveledChar("芙罗拉"),
                skillLevel: 10,
                hpPercent: 0.5,
                resonanceGain: 2,
                melee: new LeveledWeapon(10302),
                ranged: new LeveledWeapon(20601),
                baseName: "圆舞",
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance,
                targetFunction: "[圆舞]路径伤害",
            })
        }

        it("atk=all 的纯元素字段不吃触发加成：[圆舞]路径伤害 应等于 {触发:-9}（护盾型敌人下切割触发倍率非0）", () => {
            // 护盾木桩(currentHPType=护盾)会给出非 0 的切割触发倍率：
            // 若纯元素字段错误吃到触发加成，plain 会被触发率放大，与 {触发:-9} 不等
            const cb = new CharBuild({
                char: new LeveledChar("芙罗拉"),
                skillLevel: 10,
                hpPercent: 0.5,
                resonanceGain: 2,
                melee: new LeveledWeapon(10302), // 切割，基础触发 0.3
                ranged: new LeveledWeapon(20601),
                baseName: "圆舞",
                enemyId: 0, // 护盾木桩 → currentHPType=护盾 → 切割触发倍率>0
                enemyLevel: 80,
                enemyResistance: 0.5,
                targetFunction: "[圆舞]路径伤害",
            })
            expect(cb.skillWeapon?.inherit).toBe("melee")
            expect(cb.skillWeapon?.atk).toBe("all")
            const plain = cb.evaluateAST("[圆舞]路径伤害")
            const noTrigger = cb.evaluateAST("[圆舞]路径伤害{触发:-9}")
            expect(plain / noTrigger).toBeCloseTo(1, 6)
            // 纯元素：物理访问器≈0，元素访问器=合计
            expect(cb.evaluateAST("[圆舞]路径伤害.物理")).toBeCloseTo(0, 6)
            expect(cb.evaluateAST("[圆舞]路径伤害.元素") / plain).toBeCloseTo(1, 6)
        })

        it("芙罗拉 圆舞 转属克:1 在 0.5抗 与 0抗 时应成 5 倍关系", () => {
            const cb = buildFlora(0.5)
            const d05 = cb.evaluateAST("[圆舞]路径伤害{转属克:1,触发:-9}")
            cb.enemyResistance = 0
            const d0 = cb.evaluateAST("[圆舞]路径伤害{转属克:1,触发:-9}")
            // 转属克:1 把 100% 物理+元素 转为属克元素：0.5抗翻转为负抗-4(因子5)，0抗始终按原抗(因子1)，故 5 倍
            expect(d05 / d0).toBeCloseTo(5, 3)
        })

        it("转属克:1 应把物理分量转为属克元素（物理≈0，元素=合计）", () => {
            const cb = buildFlora(0.5)
            const phys = cb.evaluateAST("[圆舞]路径伤害{转属克:1}.物理")
            const elem = cb.evaluateAST("[圆舞]路径伤害{转属克:1}.元素")
            const total = cb.evaluateAST("[圆舞]路径伤害{转属克:1}")
            // 物理分量已全部转为元素，故物理访问器≈0；元素访问器等于合计
            expect(phys).toBeCloseTo(0, 3)
            expect(elem).toBeCloseTo(total, 3)
        })

        it("无转属克 时 物理/元素 访问器之和等于合计伤害", () => {
            const cb = buildFlora(0.5)
            const phys = cb.evaluateAST("普通攻击::一段.物理")
            const elem = cb.evaluateAST("普通攻击::一段.元素")
            const total = cb.evaluateAST("普通攻击::一段")
            // 物理分量应 > 0
            expect(phys).toBeGreaterThan(0)
            expect(phys + elem).toBeCloseTo(total, 3)
        })

        // 转切割/转贯穿/转震荡/转灾厄：把「物理+元素」100% 转为对应物理子类，
        // 全部按物理类型结算（settlesElement:false），故物理访问器=合计、元素访问器≈0
        for (const key of ["转切割", "转贯穿", "转震荡", "转灾厄"] as const) {
            it(`${key}:1 应把物理+元素100%转为对应物理（物理=合计，元素≈0）`, () => {
                const cb = buildFlora(0.5)
                const expr = `[圆舞]路径伤害{${key}:1}`
                const phys = cb.evaluateAST(`${expr}.物理`)
                const elem = cb.evaluateAST(`${expr}.元素`)
                const total = cb.evaluateAST(expr)
                // 物理+元素 已全部转为对应物理类型，元素访问器≈0，物理访问器=合计
                expect(elem).toBeCloseTo(0, 3)
                expect(phys).toBeCloseTo(total, 3)
            })
        }

        // 叠加多种转物理属性时，总转换比例钳制到 100%（convertScale），物理访问器仍=合计
        it("转切割:0.6 + 转贯穿:0.6 叠加时物理访问器仍=合计（转换比例钳制到100%）", () => {
            const cb = buildFlora(0.5)
            const expr = "[圆舞]路径伤害{转切割:0.6,转贯穿:0.6}"
            const phys = cb.evaluateAST(`${expr}.物理`)
            const elem = cb.evaluateAST(`${expr}.元素`)
            const total = cb.evaluateAST(expr)
            expect(elem).toBeCloseTo(0, 3)
            expect(phys).toBeCloseTo(total, 3)
        })

        // 转属克 与 转物理 共存：合计转换比例共享同一转换池，超过 100% 时等比重压缩
        it("转灾厄:1 + 转属克:1 等价于 转灾厄:0.5 + 转属克:0.5（合计>1 等比重压缩）", () => {
            const cb = buildFlora(0.5) // 0.5抗 → 转属克生效
            const exprA = "[圆舞]路径伤害{转灾厄:1,转属克:1,触发:-9}"
            const exprB = "[圆舞]路径伤害{转灾厄:0.5,转属克:0.5,触发:-9}"
            for (const member of ["", ".物理", ".元素"] as const) {
                const a = cb.evaluateAST(`${exprA}${member}`)
                const b = cb.evaluateAST(`${exprB}${member}`)
                // 合计/物理/元素 三类访问器在压缩前后完全一致
                expect(a / b).toBeCloseTo(1, 5)
            }
        })

        it("转灾厄:0.7 + 转属克:0.7 仍等价于 转灾厄:0.5 + 转属克:0.5（合计>1 压缩到同一比例）", () => {
            const cb = buildFlora(0.5)
            const a = cb.evaluateAST("[圆舞]路径伤害{转灾厄:0.7,转属克:0.7,触发:-9}")
            const b = cb.evaluateAST("[圆舞]路径伤害{转灾厄:0.5,转属克:0.5,触发:-9}")
            expect(a / b).toBeCloseTo(1, 5)
        })

        // 合计转换比例不足 100% 时，剩余部分按原始物理/元素比例结算
        it("转灾厄:0.5 + 转属克:0.2 时剩余 30% 按原始物理/元素比例结算（合计=物理+元素）", () => {
            const cb = buildFlora(0.5)
            const expr = "[圆舞]路径伤害{转灾厄:0.5,转属克:0.2,触发:-9}"
            const phys = cb.evaluateAST(`${expr}.物理`)
            const elem = cb.evaluateAST(`${expr}.元素`)
            const total = cb.evaluateAST(expr)
            // 合计 = 物理 + 元素（结构性成立）
            expect(phys + elem).toBeCloseTo(total, 0)
            // 转属克 将 20% 物理+元素 转为属克元素 → 元素访问器 > 0；剩余分量仍按物理结算 → 物理访问器 < 合计
            expect(elem).toBeGreaterThan(0)
            expect(phys).toBeLessThan(total)
            // 剩余 30% 按原始比例分量：以无转换基线校验精确拆分（由转换比例推导）
            const phys0 = cb.evaluateAST("[圆舞]路径伤害{触发:-9}.物理")
            const elem0 = cb.evaluateAST("[圆舞]路径伤害{触发:-9}.元素")
            // 物理访问器 = 0.8*phys0 + 1.4*elem0；元素访问器 = phys0 + 1.4*elem0
            expect(phys / (0.8 * phys0 + 1.4 * elem0)).toBeCloseTo(1, 4)
            expect(elem / (phys0 + 1.4 * elem0)).toBeCloseTo(1, 4)
        })

        // 负抗时由 转属逆 接管元素转换，同样满足压缩等价
        it("负抗时 转灾厄:1 + 转属逆:1 等价于 转灾厄:0.5 + 转属逆:0.5", () => {
            const cb = buildFlora(-4) // 负抗 → 转属逆生效
            const exprA = "[圆舞]路径伤害{转灾厄:1,转属逆:1,触发:-9}"
            const exprB = "[圆舞]路径伤害{转灾厄:0.5,转属逆:0.5,触发:-9}"
            expect(cb.evaluateAST(exprA) / cb.evaluateAST(exprB)).toBeCloseTo(1, 5)
        })

        // 转充盈：独立额外乘区，不参与转换池、不改变物理/元素比例。
        // 转充盈: X 把 X 比例的伤害视为充盈伤害并享受充盈威力加成，整体乘区 = 1 + X × (充盈威力 - 1)
        describe("转充盈（独立额外乘区）", () => {
            // 护盾木桩：近战切割在护盾木桩下可触发（物理分量>0），便于验证物理/元素比例不变
            function buildConvertField(enemyResistance = 0.5) {
                return new CharBuild({
                    char: new LeveledChar("黎瑟"),
                    hpPercent: 0.5,
                    resonanceGain: 2,
                    melee: new LeveledWeapon(10302), // 切割，护盾木桩下触发
                    ranged: new LeveledWeapon(20601), // 贯穿
                    baseName: "快速出击",
                    enemyId: 0, // 护盾木桩
                    enemyLevel: 80,
                    enemyResistance,
                    targetFunction: "[近战]",
                })
            }

            it("无充盈威力时转充盈不改变伤害", () => {
                const cb = buildConvertField()
                const F = cb.calculateWeaponAttributes().充盈威力
                expect(F).toBe(1)
                const base = cb.evaluateAST("[近战]")
                const converted = cb.evaluateAST("[近战]{转充盈:1}")
                // 充盈威力基础 1 → 乘区 = 1 + 转充盈×(F-1) = 1，伤害不变
                expect(converted).toBeCloseTo(base, 3)
            })

            it("整体乘区 = 1 + 转充盈×(充盈威力-1)，作用于所有伤害分量", () => {
                const cb = buildConvertField()
                const F = cb.calculateWeaponAttributes().充盈威力 ?? 1
                const base = cb.evaluateAST("[近战]")
                const full = cb.evaluateAST("[近战]{转充盈:1,充盈威力:1}")
                const half = cb.evaluateAST("[近战]{转充盈:0.5,充盈威力:1}")
                expect(full).toBeCloseTo(base * (1 + F), 3)
                expect(half).toBeCloseTo(base * (1 + 0.5 * F), 3)
            })

            it("不改变物理/元素比例：物理、元素分量同倍放大", () => {
                const cb = buildConvertField()
                const phys0 = cb.evaluateAST("[近战].物理")
                const elem0 = cb.evaluateAST("[近战].元素")
                const expr = "[近战]{转充盈:1,充盈威力:1}"
                const phys = cb.evaluateAST(`${expr}.物理`)
                const elem = cb.evaluateAST(`${expr}.元素`)
                expect(phys0).toBeGreaterThan(0)
                expect(elem0).toBeGreaterThan(0)
                // 物理与元素同乘同一乘区 → 比例保持不变
                expect(phys / phys0).toBeCloseTo(elem / elem0, 3)
                // 结构性成立：合计 = 物理 + 元素
                expect(phys + elem).toBeCloseTo(cb.evaluateAST(expr), 0)
            })

            it("不参与转换池：与 转切割 独立叠加", () => {
                const cb = buildConvertField()
                const F = cb.calculateWeaponAttributes().充盈威力 ?? 1
                const cut = cb.evaluateAST("[近战]{转切割:1}")
                const cutFull = cb.evaluateAST("[近战]{转切割:1,转充盈:1,充盈威力:1}")
                // 转充盈 不压缩转换池 → 转切割 100% 转换保持，额外乘区 ×充盈威力
                expect(cutFull).toBeCloseTo(cut * (1 + F), 3)
            })

            it("对纯元素同律字段（atk=all）同样生效", () => {
                const cb = buildFlora(0.5) // [圆舞]路径伤害 为 inherit+atk=all 纯元素
                const F = cb.calculateWeaponAttributes().充盈威力 ?? 1
                const base = cb.evaluateAST("[圆舞]路径伤害")
                const buffed = cb.evaluateAST("[圆舞]路径伤害{转充盈:1,充盈威力:1}")
                expect(buffed).toBeCloseTo(base * (1 + F), 3)
            })
        })
    })

    // 元素增伤/物理增伤：与 增伤 同池加算，只作用于对应分量（元素/物理），不影响另一分量。
    // 技能伤害视为纯元素，故 元素增伤 生效、物理增伤 不生效。
    describe("元素增伤/物理增伤（分量级加算增伤）", () => {
        // 护盾木桩 + 切割近战：物理与元素分量均 > 0，便于验证分量选择性
        function buildField(enemyResistance = 0.5) {
            return new CharBuild({
                char: new LeveledChar("黎瑟"),
                hpPercent: 0.5,
                resonanceGain: 2,
                melee: new LeveledWeapon(10302), // 切割，护盾木桩下触发
                ranged: new LeveledWeapon(20601), // 贯穿
                baseName: "快速出击",
                enemyId: 0, // 护盾木桩
                enemyLevel: 80,
                enemyResistance,
                targetFunction: "[近战]",
            })
        }

        it("基线：无分量增伤时物理/元素分量均 > 0", () => {
            const cb = buildField()
            expect(cb.evaluateAST("[近战].物理")).toBeGreaterThan(0)
            expect(cb.evaluateAST("[近战].元素")).toBeGreaterThan(0)
        })

        it("元素增伤 只放大元素分量，物理分量不变", () => {
            const cb = buildField()
            const phys0 = cb.evaluateAST("[近战].物理")
            const elem0 = cb.evaluateAST("[近战].元素")
            const phys = cb.evaluateAST("[近战]{元素增伤:0.5}.物理")
            const elem = cb.evaluateAST("[近战]{元素增伤:0.5}.元素")
            // 物理分量不受 元素增伤 影响
            expect(phys / phys0).toBeCloseTo(1, 6)
            // 元素分量被放大
            expect(elem).toBeGreaterThan(elem0)
        })

        it("物理增伤 只放大物理分量，元素分量不变", () => {
            const cb = buildField()
            const phys0 = cb.evaluateAST("[近战].物理")
            const elem0 = cb.evaluateAST("[近战].元素")
            const phys = cb.evaluateAST("[近战]{物理增伤:0.5}.物理")
            const elem = cb.evaluateAST("[近战]{物理增伤:0.5}.元素")
            // 元素分量不受 物理增伤 影响
            expect(elem / elem0).toBeCloseTo(1, 6)
            // 物理分量被放大
            expect(phys).toBeGreaterThan(phys0)
        })

        it("元素增伤 与 增伤 加算（非独立乘区）", () => {
            const cb = buildField()
            const elem0 = cb.evaluateAST("[近战].元素")
            const elem1 = cb.evaluateAST("[近战]{元素增伤:0.5}.元素")
            const elem2 = cb.evaluateAST("[近战]{增伤:0.5}.元素")
            const elem12 = cb.evaluateAST("[近战]{增伤:0.5,元素增伤:0.5}.元素")
            // 加算：+0.5 元素增伤 的增益等于 +0.5 增伤（同一加法池）
            expect(elem1 / elem0).toBeCloseTo(elem2 / elem0, 5)
            // 叠加后非独立乘区：(base+0.5+0.5)/(base+0) 而非 (base+0.5)*1.5/base
            const ratio = elem12 / elem0
            const independent = (elem2 / elem0) * (elem1 / elem0)
            expect(ratio).toBeLessThan(independent)
        })

        it("合计 = 物理 + 元素（分量增伤后结构性成立）", () => {
            const cb = buildField()
            const expr = "[近战]{元素增伤:0.5,物理增伤:0.3}"
            const phys = cb.evaluateAST(`${expr}.物理`)
            const elem = cb.evaluateAST(`${expr}.元素`)
            const total = cb.evaluateAST(expr)
            expect(phys + elem).toBeCloseTo(total, 1)
        })

        it("技能伤害（纯元素）吃 元素增伤，不吃 物理增伤", () => {
            const cb = buildField()
            const base = cb.evaluateAST("[近战]")
            const elemBuffed = cb.evaluateAST("[近战]{元素增伤:0.5}")
            const physBuffed = cb.evaluateAST("[近战]{物理增伤:0.5}")
            // [近战] 整体 = 物理+元素：元素增伤提升合计，物理增伤也提升合计（因含物理分量）
            expect(elemBuffed).toBeGreaterThan(base)
            expect(physBuffed).toBeGreaterThan(base)
            // 但物理增伤不改变元素分量本身
            expect(cb.evaluateAST("[近战]{物理增伤:0.5}.元素") / cb.evaluateAST("[近战].元素")).toBeCloseTo(1, 6)
        })

        it("元素专属伤害率：只吃匹配元素的那一项", () => {
            const cb = buildField()
            expect(cb.char.属性).toBe("雷")
            const elem0 = cb.evaluateAST("[近战].元素")
            const hit = cb.evaluateAST("[近战]{雷属性增伤:0.5}.元素")
            const miss = cb.evaluateAST("[近战]{火属性增伤:0.5}.元素")
            expect(hit).toBeGreaterThan(elem0)
            expect(miss / elem0).toBeCloseTo(1, 6)
            // 聚合视角：匹配元素进入独立桶，伤害结算时并入元素增伤池
            const attrs = new CharBuild({
                char: new LeveledChar("黎瑟"),
                hpPercent: 0.5,
                resonanceGain: 2,
                melee: new LeveledWeapon(10302),
                ranged: new LeveledWeapon(20601),
                baseName: "快速出击",
                enemyId: 0,
                enemyLevel: 80,
                enemyResistance: 0.5,
                targetFunction: "[近战]",
                buffs: [new LeveledBuff({ 名称: "雷伤", 描述: "", attr: { 雷属性增伤: 0.5 } })],
            }).calculateAttributes()
            expect(attrs.元素增伤).toBeCloseTo(0, 9)
            expect(attrs.雷属性增伤).toBeCloseTo(0.5, 9)
            expect(attrs.火属性增伤).toBeCloseTo(0, 9)
        })

        it("元素限定键不计入通用元素增伤桶（MOD属性加权只落同名键）", () => {
            const mod = (加成: Record<string, number[]>) =>
                new LeveledMod({ id: 990001, 名称: "U62测试", 系列: "狮鹫", 品质: "金", 耐受: 0, 类型: "角色", 加成 } satisfies Mod)
            // MOD属性来源：狮鹫机制对元素系列 MOD 词条加权 50%
            const modAttrBuff = new LeveledBuff({ 名称: "MOD属性", 描述: "", attr: { 雷MOD属性: 0.5 } })
            const mk = (加成: Record<string, number[]>) =>
                new CharBuild({
                    char: new LeveledChar("黎瑟"),
                    hpPercent: 0.5,
                    resonanceGain: 2,
                    melee: new LeveledWeapon(10302),
                    ranged: new LeveledWeapon(20601),
                    baseName: "快速出击",
                    enemyId: 0,
                    enemyLevel: 80,
                    enemyResistance: 0.5,
                    targetFunction: "[近战]",
                    charMods: [mod(加成)],
                    buffs: [modAttrBuff],
                })
            const base = mk({})
            const hit = mk({ 雷属性增伤: [0.3] })
            const miss = mk({ 火属性增伤: [0.3] })
            // 硬断言：MOD 提供的雷属性增伤对通用桶贡献为 0，只进同名元素桶（含加权 0.45）
            expect(hit.calculateAttributes().元素增伤).toBe(0)
            expect(hit.calculateAttributes().雷属性增伤).toBeCloseTo(0.45, 12)
            expect(hit.calculateAttributes().火属性增伤).toBe(0)
            // 匹配元素生效；同一构筑换成不匹配元素键 → 逐位等于基线
            const elem0 = base.evaluateAST("[近战].元素")
            expect(hit.evaluateAST("[近战].元素")).toBeGreaterThan(elem0)
            expect(miss.evaluateAST("[近战].元素")).toBe(elem0)
            expect(miss.calculateAttributes().元素增伤).toBe(0)
            expect(miss.calculateAttributes().火属性增伤).toBeCloseTo(0.45, 12)
            // 叠加：通用桶只含自身（0.2 加权后 0.3），元素桶独立（0.45）
            const stack = mk({ 元素增伤: [0.2], 雷属性增伤: [0.3] })
            expect(stack.calculateAttributes().元素增伤).toBeCloseTo(0.3, 12)
            expect(stack.calculateAttributes().雷属性增伤).toBeCloseTo(0.45, 12)
            expect(stack.evaluateAST("[近战].元素")).toBeGreaterThan(hit.evaluateAST("[近战].元素"))
            // 旧路径：仅元素增伤时仍按 MOD属性加权，且不写入元素键
            const legacy = mk({ 元素增伤: [0.2] })
            expect(legacy.calculateAttributes().元素增伤).toBeCloseTo(0.3, 12)
            expect(legacy.calculateAttributes().雷属性增伤).toBe(0)
        })
    })
})

describe("空武器（近战/远程不装备）", () => {
    // 基础构筑：近战/远程均用空武器占位（id 为 0），验证“未装备”语义
    function createEmptyWeaponBuild() {
        return new CharBuild({
            char: new LeveledChar("黎瑟"),
            skillLevel: 10,
            hpPercent: 0.5,
            resonanceGain: 2,
            melee: LeveledWeapon.emptyWeapon,
            ranged: LeveledWeapon.emptyWeapon,
            baseName: "快速出击",
            enemyId: 130,
            enemyLevel: 80,
            enemyResistance: 0,
            targetFunction: "伤害",
        })
    }

    it("LeveledWeapon.emptyWeapon 为空占位且无技能/属性加成", () => {
        const weapon = LeveledWeapon.emptyWeapon
        expect(weapon.isEmpty).toBe(true)
        expect(weapon.id).toBe(0)
        expect(weapon.技能).toEqual([])
        expect(weapon.addAttr).toEqual({})
    })

    it("空武器构筑不提供任何武器技能", () => {
        const charBuild = createEmptyWeaponBuild()
        expect(charBuild.meleeWeapon.isEmpty).toBe(true)
        expect(charBuild.rangedWeapon.isEmpty).toBe(true)
        expect(charBuild.meleeWeaponSkills).toHaveLength(0)
        expect(charBuild.rangedWeaponSkills).toHaveLength(0)
        expect(charBuild.isMeleeWeapon).toBe(false)
        expect(charBuild.isRangedWeapon).toBe(false)
        expect(charBuild.selectedWeapon).toBeUndefined()
    })

    it("近战/远程均为空武器时仍可正常计算角色技能伤害", () => {
        const charBuild = createEmptyWeaponBuild()
        // 空武器不应抛错，伤害结果为有限数值
        const damage = charBuild.calculate()
        expect(damage).toBeTypeOf("number")
        expect(Number.isFinite(damage)).toBe(true)
        expect(damage).toBeGreaterThanOrEqual(0)
    })
})

describe("条件BUFF（filter）", () => {
    const buffData = buffMap.get("法露茜2溯")!
    const rockData = buffMap.get("磐石")! // 独立增伤 -0.15，制造非零全局乘法池

    /**
     * 构造法露茜构筑。
     * @param withBuff 是否装配法露茜2溯
     * @returns 构筑实例
     */
    function createFilterBuild(withBuff: boolean) {
        return new CharBuild({
            char: new LeveledChar("法露茜"),
            skillLevel: 10,
            hpPercent: 0.5,
            resonanceGain: 2,
            buffs: [new LeveledBuff(rockData, 1), ...(withBuff ? [new LeveledBuff(buffData, 1)] : [])],
            melee: new LeveledWeapon(10401),
            ranged: new LeveledWeapon(20601),
            baseName: "潜入夜色",
            enemyId: 130,
            enemyLevel: 80,
            enemyResistance: 0.5,
            targetFunction: "E::[暗影奔袭]伤害",
        })
    }

    it("条件BUFF不参与全局属性汇总", () => {
        const build = createFilterBuild(true)
        // 全局独立增伤只含磐石 -0.15，法露茜2溯的 +100% 只作用于匹配字段
        expect(build.calculateAttributes().独立增伤).toBeCloseTo(-0.15, 6)
    })

    it("条件BUFF只作用于名称匹配的字段", () => {
        const without = createFilterBuild(false)
        const withBuff = createFilterBuild(true)
        // 独立增伤 +100%：乘法池 (1-0.15)×(1+1)-1 = 0.7，倍率 1.7/0.85 = 2
        expect(
            withBuff.calculateTargetFunction(undefined, "E::[暗影奔袭]伤害") /
                without.calculateTargetFunction(undefined, "E::[暗影奔袭]伤害")
        ).toBeCloseTo(2, 6)
        // 名称不匹配的字段不受影响
        expect(
            withBuff.calculateTargetFunction(undefined, "E::[暗影一刺]伤害") /
                without.calculateTargetFunction(undefined, "E::[暗影一刺]伤害")
        ).toBeCloseTo(1, 6)
    })

    it("条件BUFF的加/减收益对称（乘法池属性按乘法合并）", () => {
        const enabled = createFilterBuild(true)
        const addIncome = createFilterBuild(false).calcIncome(new LeveledBuff(buffData, 1), false)
        const minusIncome = enabled.calcIncome(new LeveledBuff(buffData, 1), true)
        expect(addIncome).toBeGreaterThan(0)
        expect(addIncome).toBeCloseTo(minusIncome, 6)
    })
})

describe("条件BUFF（filter）- 煜明2溯", () => {
    const yuming2sData = buffMap.get("煜明2溯")!

    /**
     * 构造煜明构筑。
     * @param withBuff 是否装配煜明2溯
     * @returns 构筑实例
     */
    function createYumingBuild(withBuff: boolean) {
        return new CharBuild({
            char: new LeveledChar("煜明"),
            skillLevel: 10,
            hpPercent: 0.5,
            resonanceGain: 2,
            buffs: withBuff ? [new LeveledBuff(yuming2sData, 1)] : [],
            melee: new LeveledWeapon(10401),
            ranged: new LeveledWeapon(20601),
            baseName: "濯暗鳞",
            enemyId: 130,
            enemyLevel: 80,
            enemyResistance: 0.5,
            targetFunction: "Q::[酣战]伤害",
        })
    }

    it("技能倍率乘数只作用于名称匹配的字段", () => {
        const without = createYumingBuild(false)
        const withBuff = createYumingBuild(true)
        // 技能倍率乘数 0.6：[酣战]伤害 ×1.6
        expect(
            withBuff.calculateTargetFunction(undefined, "Q::[酣战]伤害") / without.calculateTargetFunction(undefined, "Q::[酣战]伤害")
        ).toBeCloseTo(1.6, 6)
        // 名称不匹配的字段不受影响
        expect(
            withBuff.calculateTargetFunction(undefined, "E::[星河寥落]伤害") /
                without.calculateTargetFunction(undefined, "E::[星河寥落]伤害")
        ).toBeCloseTo(1, 6)
        // 全局技能倍率乘数不含条件BUFF
        expect(withBuff.calculateAttributes().技能倍率乘数).toBe(0)
    })

    it("技能倍率乘数BUFF的加/减收益对称", () => {
        const enabled = createYumingBuild(true)
        const addIncome = createYumingBuild(false).calcIncome(new LeveledBuff(yuming2sData, 1), false)
        const minusIncome = enabled.calcIncome(new LeveledBuff(yuming2sData, 1), true)
        expect(addIncome).toBeCloseTo(minusIncome, 6)
    })
})

describe("条件BUFF（技能限定）- 妮弗尔夫人2溯", () => {
    const nifflerData = buffMap.get("妮弗尔夫人2溯")!

    /**
     * 构造妮弗尔夫人构筑。
     * @param withBuff 是否装配妮弗尔夫人2溯
     * @returns 构筑实例
     */
    function createNifflerBuild(withBuff: boolean) {
        return new CharBuild({
            char: new LeveledChar("妮弗尔夫人"),
            skillLevel: 10,
            hpPercent: 0.5,
            resonanceGain: 2,
            buffs: withBuff ? [new LeveledBuff(nifflerData, 1)] : [],
            melee: new LeveledWeapon(10401),
            ranged: new LeveledWeapon(20601),
            baseName: "月猎",
            enemyId: 130,
            enemyLevel: 80,
            enemyResistance: 0.5,
            targetFunction: "E::[月猎]伤害",
        })
    }

    it("多技能模式（|）命中任一字段即生效", () => {
        const without = createNifflerBuild(false)
        const withBuff = createNifflerBuild(true)
        const ratio = (expr: string) => withBuff.calculateTargetFunction(undefined, expr) / without.calculateTargetFunction(undefined, expr)
        // 技能伤害 0.75：[月猎]伤害 与 [日食]伤害 均应 ×1.75
        expect(ratio("E::[月猎]伤害")).toBeCloseTo(1.75, 6)
        expect(ratio("E::[日食]伤害")).toBeCloseTo(1.75, 6)
        // 不匹配的字段不受影响
        expect(ratio("攻击")).toBeCloseTo(1, 6)
    })
})

describe("条件BUFF（tag 战技限定）- 升华·午后独立（180101）", () => {
    /** 菲娜真实技能字段取样：0 = 战技 180101「在一个暖和的午后」，1 = 终结技 180102「下午茶开始了！」，2 = 被动 180103 */
    const feina = charMap.get("菲娜")!
    /**
     * 读取菲娜技能字段（取样自 char.data.ts，不臆造字段名）。
     * @param skillIndex 技能索引（E/Q/P）
     * @param fieldName 字段名
     * @returns 技能字段数据
     */
    function fieldOf(skillIndex: number, fieldName: string) {
        const field = feina.技能?.[skillIndex]?.字段?.find(item => item.名称 === fieldName)
        if (!field) throw new Error(`菲娜技能 ${skillIndex} 缺少字段「${fieldName}」`)
        return field
    }

    /**
     * 构造菲娜构筑：buffs 只来自 180101 的手写映射（不叠加技能等级增量，倍率差异只反映 BUFF 口径）。
     * @param withAffix 是否装配 180101 专属词条
     * @returns 构筑实例
     */
    function createFeinaBuild(withAffix: boolean) {
        // 只取手写映射 BUFF：技能等级三键会驱动 E 等级，干扰「只比较条件增伤」的口径
        const sourced = withAffix
            ? resolveGearEffects([gear({ slotId: 1, affixId: 180101 })], "main", { charId: 1801 }).buffs.filter(
                  item => !item.buff.名称.endsWith("技能等级")
              )
            : []
        return new CharBuild({
            char: new LeveledChar("菲娜"),
            skillLevel: 10,
            hpPercent: 0.5,
            resonanceGain: 2,
            buffs: sourced.map(item => new LeveledBuff(item.buff, 1)),
            melee: new LeveledWeapon(10401),
            ranged: new LeveledWeapon(20601),
            baseName: "“在一个暖和的午后”",
            enemyId: 130,
            enemyLevel: 80,
            enemyResistance: 0.5,
            targetFunction: "E::伤害",
        })
    }

    it("手写 BUFF 按 tag「战技」限定，映射不再声明 Skill1 限定 / 全技能上界", () => {
        expect(TRANSCEND_BUFF_MAP.get("升华·午后独立")?.tag).toEqual(["战技"])
        const mapped = resolveGearEffects([gear({ slotId: 1, affixId: 180101 })], "main", { charId: 1801 })
        expect(mapped.entries[0].excluded).not.toContain("Skill1 限定")
        expect(mapped.entries[0].note).toContain("仅战技字段")
        expect(mapped.entries[0].note).not.toMatch(/上界|全技能/)
        expect(mapped.buffs.find(item => item.buff.名称 === "升华·午后独立")!.buff.tag).toEqual(["战技"])
    })

    it("条件 BUFF 不参与全局属性汇总，只进入字段级条件列表", () => {
        const build = createFeinaBuild(true)
        expect(build.calculateAttributes().技能独立增伤).toBe(0)
        const conditional = build.getConditionalBuffPropsList()
        expect(conditional).toHaveLength(1)
        expect(conditional[0].tag).toEqual(["战技"])
        expect(conditional[0].props.技能独立增伤).toBeCloseTo(0.3, 6)
    })

    it("战技字段命中（×1.3）；终结技 / 被动字段不命中", () => {
        // 真实字段取样：战技伤害字段带 tag ["技能","战技"]，终结技 / 被动字段不带 tag
        const battle = fieldOf(0, "伤害")
        const ultimate = fieldOf(1, "持续伤害")
        const passive = fieldOf(2, "永续追加伤害倍率")
        expect(battle.tag).toEqual(["技能", "战技"])
        expect(ultimate.tag).toBeUndefined()
        expect(passive.tag).toBeUndefined()

        const conditional = createFeinaBuild(true).getConditionalBuffPropsList()
        expect(LeveledSkill.matchesFieldConditional(conditional[0], battle.名称, battle.tag)).toBe(true)
        expect(LeveledSkill.matchesFieldConditional(conditional[0], ultimate.名称, ultimate.tag)).toBe(false)
        expect(LeveledSkill.matchesFieldConditional(conditional[0], passive.名称, passive.tag)).toBe(false)

        const without = createFeinaBuild(false)
        const withAffix = createFeinaBuild(true)
        const ratio = (expr: string) =>
            withAffix.calculateTargetFunction(undefined, expr) / without.calculateTargetFunction(undefined, expr)
        // 战技（Skill1）伤害字段命中 tag → 技能独立增伤 3% × 10 层 = 30%
        expect(ratio("E::伤害")).toBeCloseTo(1.3, 6)
        // 终结技 180102「持续伤害」不命中 tag，保持原值
        expect(ratio("Q::持续伤害")).toBeCloseTo(1, 6)
    })
})

describe("条件BUFF（字段级作用域）- 月猎强化 / 花宴独立 / 切割齿轮（U127）", () => {
    /**
     * 构造只装一件专属词条的构筑：剔除技能等级增量，倍率差异只反映词条口径。
     * @param options 角色 / 词条 / 远程武器与技能命名
     * @returns 未装配与已装配词条的构筑对
     */
    function createPair(options: {
        charName: string
        charId: number
        slotId: number
        affixId: number
        rangedId: number
        baseName: string
    }) {
        const make = (withAffix: boolean) => {
            const sourced = withAffix
                ? resolveGearEffects([gear({ slotId: options.slotId, affixId: options.affixId })], "main", {
                      charId: options.charId,
                  }).buffs.filter(item => !item.buff.名称.endsWith("技能等级"))
                : []
            return new CharBuild({
                char: new LeveledChar(options.charName),
                skillLevel: 10,
                hpPercent: 0.5,
                resonanceGain: 2,
                buffs: sourced.map(item => new LeveledBuff(item.buff, 1)),
                melee: new LeveledWeapon(10401),
                ranged: new LeveledWeapon(options.rangedId),
                baseName: options.baseName,
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance: 0.5,
            })
        }
        return { without: make(false), withAffix: make(true) }
    }

    /**
     * 目标函数在「已装配 / 未装配」两次求值间的倍率。
     * @param without 未装配词条的构筑
     * @param withAffix 已装配词条的构筑
     * @param expr 目标函数表达式
     * @returns 伤害比值
     */
    function ratioOf(without: CharBuild, withAffix: CharBuild, expr: string) {
        return withAffix.calculateTargetFunction(undefined, expr) / without.calculateTargetFunction(undefined, expr)
    }

    it("150203 月猎强化：只命中 [月猎] 字段，[日食] 不命中", () => {
        const { without, withAffix } = createPair({
            charName: "妮弗尔夫人",
            charId: 1502,
            slotId: 2,
            affixId: 150203,
            rangedId: 20601,
            baseName: "月猎",
        })

        // 条件 BUFF 不参与全局属性汇总
        expect(withAffix.calculateAttributes().技能伤害).toBe(0)
        const conditional = withAffix.getConditionalBuffPropsList()
        expect(conditional).toHaveLength(1)
        expect(conditional[0].技能).toBe("月猎")
        expect(conditional[0].props.技能伤害).toBeCloseTo(1.5, 6)

        // 真实字段取样：月猎 / 日食伤害字段都带 ["技能","战技"]，只有名称区分
        expect(LeveledSkill.matchesFieldConditional(conditional[0], "[月猎]伤害", ["技能", "战技", "NifuDark"])).toBe(true)
        expect(LeveledSkill.matchesFieldConditional(conditional[0], "[日食]伤害", ["技能", "战技", "NifuLight"])).toBe(false)

        // 技能伤害 +150% → ×2.5；日食保持原值
        expect(ratioOf(without, withAffix, "E::[月猎]伤害")).toBeCloseTo(2.5, 6)
        expect(ratioOf(without, withAffix, "E::[日食]伤害")).toBeCloseTo(1, 9)
    })

    it("2030301 花宴独立：只命中武器标签字段，技能字段不命中", () => {
        const { without, withAffix } = createPair({
            charName: "希尔妲",
            charId: 3102,
            slotId: 6,
            affixId: 2030301,
            rangedId: 20302,
            baseName: "射击",
        })

        expect(withAffix.calculateAttributes().独立增伤).toBe(0)
        const conditional = withAffix.getConditionalBuffPropsList()
        expect(conditional).toHaveLength(1)
        expect(conditional[0].tag).toEqual(["武器"])
        expect(conditional[0].props.独立增伤).toBeCloseTo(0.0584488560441114 * withAffix.calculateAttributes().技能威力, 6)

        // 真实字段取样：炽枪的花宴「爆炸伤害」带 ["远程","武器","爆炸"]，希尔妲战技字段带 ["技能","战技"]
        expect(LeveledSkill.matchesFieldConditional(conditional[0], "爆炸伤害", ["远程", "武器", "爆炸"])).toBe(true)
        expect(LeveledSkill.matchesFieldConditional(conditional[0], "伤害", ["技能", "战技", "XierSkill1Laser"])).toBe(false)

        // 独立增伤 ×(1 + 5.84%×技能威力)；技能字段保持原值
        expect(ratioOf(without, withAffix, "射击::爆炸伤害")).toBeCloseTo(
            1 + 0.0584488560441114 * withAffix.calculateAttributes().技能威力,
            6
        )
        expect(ratioOf(without, withAffix, "E::伤害")).toBeCloseTo(1, 9)
    })

    it("2040601 切割齿轮：只命中 [子弹伤害] 字段，[射击伤害] 不命中", () => {
        const { without, withAffix } = createPair({
            charName: "耶尔与奥利弗",
            charId: 3103,
            slotId: 6,
            affixId: 2040601,
            rangedId: 20406,
            baseName: "射击",
        })

        expect(withAffix.calculateAttributes().武器伤害).toBe(0)
        const conditional = withAffix.getConditionalBuffPropsList()
        expect(conditional).toHaveLength(1)
        expect(conditional[0].技能).toBe("子弹伤害")
        expect(conditional[0].props.武器伤害).toBeCloseTo(1.2, 6)

        // 切割齿轮两条武器字段名不同、标签相同
        expect(LeveledSkill.matchesFieldConditional(conditional[0], "子弹伤害", ["远程", "武器", "Shotgun20406"])).toBe(true)
        expect(LeveledSkill.matchesFieldConditional(conditional[0], "射击伤害", ["远程", "武器", "Shotgun20406"])).toBe(false)

        // 加算武器伤害 1.2 进入武器增伤池；射击伤害保持原值
        expect(ratioOf(without, withAffix, "射击::子弹伤害")).toBeCloseTo(1.7059, 3)
        expect(ratioOf(without, withAffix, "射击::射击伤害")).toBeCloseTo(1, 9)
    })
})

describe("防御乘区条件属性 - 召唤物破防 / 星河破防（U128）", () => {
    /**
     * 构造只装一件专属词条的构筑：剔除技能等级增量，倍率差异只反映词条口径。
     * @param options 角色 / 元素 / 词条 / 远程武器与技能命名
     * @returns 未装配与已装配词条的构筑对
     */
    function createPair(options: {
        charName: string
        charId: number
        charElement: string
        slotId: number
        affixId: number
        rangedId: number
        baseName: string
    }) {
        const make = (withAffix: boolean) => {
            const sourced = withAffix
                ? resolveGearEffects([gear({ slotId: options.slotId, affixId: options.affixId })], "main", {
                      charId: options.charId,
                      charElement: options.charElement,
                  }).buffs.filter(item => !item.buff.名称.endsWith("技能等级"))
                : []
            return new CharBuild({
                char: new LeveledChar(options.charName),
                skillLevel: 10,
                hpPercent: 0.5,
                resonanceGain: 2,
                buffs: sourced.map(item => new LeveledBuff(item.buff, 1)),
                melee: new LeveledWeapon(10401),
                ranged: new LeveledWeapon(options.rangedId),
                baseName: options.baseName,
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance: 0.5,
            })
        }
        return { without: make(false), withAffix: make(true) }
    }

    /**
     * 目标函数在「已装配 / 未装配」两次求值间的倍率。
     * @returns 伤害比值
     */
    function ratioOf(without: CharBuild, withAffix: CharBuild, expr: string) {
        return withAffix.calculateTargetFunction(undefined, expr) / without.calculateTargetFunction(undefined, expr)
    }

    /** 木桩 130：防御 130，角色 80 级，等级差 0 → 基线防御乘区 300 / 430 */
    const BASE_DEF_FACTOR = 300 / 430

    it("2007 召唤破防：只有 tag 召唤物 字段吃技能无视防御，非召唤字段不吃", () => {
        const { without, withAffix } = createPair({
            charName: "伊薇",
            charId: 2102,
            charElement: "水",
            slotId: 7,
            affixId: 2007,
            rangedId: 20601,
            baseName: "乐园构想",
        })

        // 条件 BUFF 不参与全局属性汇总
        expect(withAffix.calculateAttributes().技能无视防御).toBe(0)
        const conditional = withAffix.getConditionalBuffPropsList()
        expect(conditional).toHaveLength(1)
        expect(conditional[0].tag).toEqual(["召唤物"])
        expect(conditional[0].props.技能无视防御).toBeCloseTo(0.175, 6)

        // 真实字段取样：[召唤物·战车]技能伤害 带 ["技能","召唤物"]；普通攻击一段伤害不带召唤物
        expect(LeveledSkill.matchesFieldConditional(conditional[0], "[召唤物·战车]技能伤害", ["技能", "召唤物"])).toBe(true)
        expect(LeveledSkill.matchesFieldConditional(conditional[0], "一段伤害", ["近战", "武器"])).toBe(false)

        // 召唤字段：防御 130 → 130×(1-0.175)=107.25，乘区 (1-107.25/407.25)/(300/430) ≈ 1.05586
        const hitRatio = (1 - 107.25 / (300 + 107.25)) / BASE_DEF_FACTOR
        expect(ratioOf(without, withAffix, "E::[召唤物·战车]技能伤害")).toBeCloseTo(hitRatio, 9)
        expect(hitRatio).toBeCloseTo(1.0558626, 6)
        // 非召唤字段：普通攻击不吃（防御乘区与未装配一致）
        expect(ratioOf(without, withAffix, "普通攻击::一段伤害")).toBeCloseTo(1, 9)
    })

    it("420101 星河破防：只有 [星河寥落] 下落攻击字段吃无视防御，疑星落 / 奔雷不吃", () => {
        const { without, withAffix } = createPair({
            charName: "煜明",
            charId: 4201,
            charElement: "雷",
            slotId: 2,
            affixId: 420101,
            rangedId: 20601,
            baseName: "玉山崩",
        })

        expect(withAffix.calculateAttributes().无视防御).toBe(0)
        const conditional = withAffix.getConditionalBuffPropsList()
        expect(conditional).toHaveLength(1)
        expect(conditional[0].技能).toBe("星河寥落")
        expect(conditional[0].tag).toEqual(["下落攻击"])
        expect(conditional[0].props.无视防御).toBeCloseTo(1, 6)

        // 两条下落字段同名标签：只有技能名命中星河寥落
        expect(LeveledSkill.matchesFieldConditional(conditional[0], "[星河寥落]伤害", ["近战", "武器", "下落攻击"])).toBe(true)
        expect(LeveledSkill.matchesFieldConditional(conditional[0], "[疑星落]伤害", ["近战", "武器", "下落攻击"])).toBe(false)
        expect(LeveledSkill.matchesFieldConditional(conditional[0], "[奔雷]伤害", ["技能", "战技"])).toBe(false)

        // 星河寥落：无视 100% 防御 → 乘区 1 / (300/430) ≈ 1.43333
        const hitRatio = 1 / BASE_DEF_FACTOR
        expect(ratioOf(without, withAffix, "E::[星河寥落]伤害")).toBeCloseTo(hitRatio, 9)
        expect(hitRatio).toBeCloseTo(1.4333333, 6)
        expect(ratioOf(without, withAffix, "E::[疑星落]伤害")).toBeCloseTo(1, 9)
        expect(ratioOf(without, withAffix, "E::[奔雷]伤害")).toBeCloseTo(1, 9)
    })

    it("defCache 跨字段：命中 / 未命中字段任意求值顺序同值", () => {
        const { withAffix } = createPair({
            charName: "煜明",
            charId: 4201,
            charElement: "雷",
            slotId: 2,
            affixId: 420101,
            rangedId: 20601,
            baseName: "玉山崩",
        })
        const star = withAffix.calculateTargetFunction(undefined, "E::[星河寥落]伤害")
        const yi = withAffix.calculateTargetFunction(undefined, "E::[疑星落]伤害")
        const forward = withAffix.calculateTargetFunction(undefined, "E::[星河寥落]伤害 + E::[疑星落]伤害")
        const reverse = withAffix.calculateTargetFunction(undefined, "E::[疑星落]伤害 + E::[星河寥落]伤害")
        // 缓存键仅按 isWeapon 时第二个字段会复用第一个字段的防御乘区，两种顺序的合计不相等
        expect(forward).toBeCloseTo(star + yi, 6)
        expect(reverse).toBeCloseTo(star + yi, 6)
        expect(forward).toBeCloseTo(reverse, 6)
    })

    it("420101 name-hit / tag-miss：技能名命中但缺少下落攻击 tag 不生效", () => {
        const { withAffix } = createPair({
            charName: "煜明",
            charId: 4201,
            charElement: "雷",
            slotId: 2,
            affixId: 420101,
            rangedId: 20601,
            baseName: "玉山崩",
        })
        const conditional = withAffix.getConditionalBuffPropsList()[0]
        // 合成字段：名称含「星河寥落」但 tag 不含「下落攻击」
        expect(LeveledSkill.matchesFieldConditional(conditional, "[星河寥落]伤害", ["近战", "武器"])).toBe(false)
    })

    it("临时属性：条件增量叠加，且不污染无临时属性的防御缓存", () => {
        const { without, withAffix } = createPair({
            charName: "伊薇",
            charId: 2102,
            charElement: "水",
            slotId: 7,
            affixId: 2007,
            rangedId: 20601,
            baseName: "乐园构想",
        })
        const tempExpr = "E::[召唤物·战车]技能伤害{技能无视防御:0.1}"
        const plainExpr = "E::[召唤物·战车]技能伤害"
        // 条件 0.175 + 临时 0.1 = 0.275 → 300/394.25；仅临时 0.1 → 300/417
        expect(withAffix.calculateTargetFunction(undefined, tempExpr) / without.calculateTargetFunction(undefined, tempExpr)).toBeCloseTo(
            417 / 394.25,
            9
        )
        expect(withAffix.calculateTargetFunction(undefined, plainExpr) / without.calculateTargetFunction(undefined, plainExpr)).toBeCloseTo(
            430 / 407.25,
            9
        )
        // 同一求值内混合临时 / 无临时两条：各自乘区独立，等于分开求值之和；反序亦然
        const tempAlone = withAffix.calculateTargetFunction(undefined, tempExpr)
        const plainAlone = withAffix.calculateTargetFunction(undefined, plainExpr)
        const forward = withAffix.calculateTargetFunction(undefined, `${tempExpr} + ${plainExpr}`)
        const reverse = withAffix.calculateTargetFunction(undefined, `${plainExpr} + ${tempExpr}`)
        expect(forward).toBeCloseTo(tempAlone + plainAlone, 6)
        expect(reverse).toBeCloseTo(tempAlone + plainAlone, 6)
    })

    it("2007 非水角色不生效：元素限定在映射层拦截", () => {
        const resolved = resolveGearEffects([gear({ slotId: 7, affixId: 2007 })], "main", { charId: 4201, charElement: "雷" })
        expect(resolved.buffs.some(item => item.buff.名称 === "升华·召唤破防")).toBe(false)
        const build = new CharBuild({
            char: new LeveledChar("煜明"),
            skillLevel: 10,
            hpPercent: 0.5,
            resonanceGain: 2,
            buffs: resolved.buffs.map(item => new LeveledBuff(item.buff, 1)),
            melee: new LeveledWeapon(10401),
            ranged: new LeveledWeapon(20601),
            baseName: "玉山崩",
            enemyId: 130,
            enemyLevel: 80,
            enemyResistance: 0.5,
        })
        expect(build.calculateAttributes().技能无视防御).toBe(0)
        expect(build.getConditionalBuffPropsList()).toHaveLength(0)
    })
})

describe("条件BUFF（技能限定）- 琳恩裂伤特性（code类）", () => {
    const linenTraitData = buffMap.get("琳恩裂伤特性")!

    /**
     * 构造琳恩构筑。
     * @param withBuff 是否装配琳恩裂伤特性
     * @returns 构筑实例
     */
    function createLinenBuild(withBuff: boolean) {
        return new CharBuild({
            char: new LeveledChar("琳恩"),
            skillLevel: 10,
            hpPercent: 0.5,
            resonanceGain: 2,
            buffs: withBuff ? [new LeveledBuff(linenTraitData, 1)] : [],
            melee: new LeveledWeapon(10401),
            ranged: new LeveledWeapon(20601),
            baseName: "致命绽放",
            enemyId: 130,
            enemyLevel: 80,
            enemyResistance: 0.5,
            targetFunction: "E::[裂伤]基础伤害",
        })
    }

    it("code产生的独立增伤/攻击只作用于名称匹配的字段", () => {
        const without = createLinenBuild(false)
        const withBuff = createLinenBuild(true)
        // 全局属性不含条件codeBUFF的独立增伤
        expect(withBuff.calculateAttributes().独立增伤).toBe(0)
        // [裂伤]基础伤害吃到独立增伤（技能威力100% → ×2）与同律攻击力增量
        const ratio =
            withBuff.calculateTargetFunction(undefined, "E::[裂伤]基础伤害") /
            without.calculateTargetFunction(undefined, "E::[裂伤]基础伤害")
        expect(ratio).toBeGreaterThan(2)
        // 不匹配的字段不受影响
        expect(withBuff.calculateTargetFunction(undefined, "攻击") / without.calculateTargetFunction(undefined, "攻击")).toBeCloseTo(1, 6)
    })

    it("code类条件BUFF的加/减收益对称", () => {
        const enabled = createLinenBuild(true)
        const addIncome = createLinenBuild(false).calcIncome(new LeveledBuff(linenTraitData, 1), false)
        const minusIncome = enabled.calcIncome(new LeveledBuff(linenTraitData, 1), true)
        expect(addIncome).toBeCloseTo(minusIncome, 6)
    })
})

describe("条件BUFF（tag限定）- 莉莉蔻2溯(充盈)/4溯", () => {
    const s2Data = buffMap.get("莉莉蔻2溯(充盈)")!
    const s4Data = buffMap.get("莉莉蔻4溯")!

    function createFalusiBuild(buffs: string[]) {
        return new CharBuild({
            char: new LeveledChar("法露茜"),
            skillLevel: 10,
            hpPercent: 0.5,
            resonanceGain: 2,
            buffs: buffs.map(name => new LeveledBuff(buffMap.get(name)!, 1)),
            melee: new LeveledWeapon(10401),
            ranged: new LeveledWeapon(20601),
            baseName: "坠入黑渊",
            enemyId: 130,
            enemyLevel: 80,
            enemyResistance: 0.5,
            targetFunction: "Q::充盈伤害",
        })
    }

    it("4溯独立增伤只作用于充盈tag字段（含名中无充盈的附加伤害）", () => {
        const without = createFalusiBuild([])
        const withBuff = createFalusiBuild(["莉莉蔻4溯"])
        // 全局独立增伤不含条件BUFF
        expect(withBuff.calculateAttributes().独立增伤).toBe(0)
        const ratio = (expr: string) => withBuff.calculateTargetFunction(undefined, expr) / without.calculateTargetFunction(undefined, expr)
        // 独立增伤 0.2：充盈字段 ×1.2
        expect(ratio("Q::充盈伤害")).toBeCloseTo(1.2, 6)
        // 附加伤害名中无充盈但带充盈tag，同样 ×1.2
        expect(ratio("Q::附加伤害")).toBeCloseTo(1.2, 6)
        // 无充盈tag的同技能字段不受影响
        expect(ratio("Q::伤害")).toBeCloseTo(1, 6)
    })

    it("2溯(充盈)属性穿透只作用于充盈tag字段", () => {
        const without = createFalusiBuild([])
        const withBuff = createFalusiBuild(["莉莉蔻2溯(充盈)"])
        // 全局属性穿透不含条件BUFF
        expect(withBuff.calculateAttributes().属性穿透).toBe(0)
        const ratio = (expr: string) => withBuff.calculateTargetFunction(undefined, expr) / without.calculateTargetFunction(undefined, expr)
        // 抗性区 0.5 → 0.5×(1+0.16)=0.58，充盈字段 ×1.16
        expect(ratio("Q::充盈伤害")).toBeCloseTo(1.16, 6)
        expect(ratio("Q::附加伤害")).toBeCloseTo(1.16, 6)
        expect(ratio("Q::伤害")).toBeCloseTo(1, 6)
    })

    it("code与attr两种表示的计算结果逐位一致", () => {
        function createCompareBuild(options: {
            charName: string
            baseName: string
            target: string
            buffs: LeveledBuff[]
            rangedMods?: LeveledMod[]
        }) {
            return new CharBuild({
                char: new LeveledChar(options.charName),
                skillLevel: 10,
                hpPercent: 0.5,
                resonanceGain: 2,
                buffs: options.buffs,
                melee: new LeveledWeapon(10401),
                ranged: new LeveledWeapon(20601),
                rangedMods: options.rangedMods,
                baseName: options.baseName,
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance: 0.5,
                targetFunction: options.target,
            })
        }
        const cases: {
            name: string
            charName: string
            baseName: string
            target: string
            codeBuff: LeveledBuff
            attrBuff: LeveledBuff
            sharedBuffs: LeveledBuff[]
            rangedMods?: LeveledMod[]
            spotCheck: (build: CharBuild) => number | undefined
        }[] = [
            // 只有纯函数（不自读目标）的 code 才能转 attr：自引用式 x+=f(x) 在 attr 下每次计算复利发散
            //（伊薇4溯/狩月4/7 均因此保留 code，见 buff.data 注释），此处只锁定浴火被动2的等价性
            {
                name: "黎瑟·浴火被动2",
                charName: "黎瑟·浴火",
                baseName: "涡流狙击",
                target: "Q::[狙击子弹]伤害",
                codeBuff: new LeveledBuff({
                    名称: "黎瑟·浴火被动2(code)",
                    限定: 4103,
                    技能: "狙击子弹|^伤害$",
                    code: "if(rangedWeaponAttr)技能独立增伤+=Math.max(0,rangedWeaponAttr.暴击*(rangedWeaponAttr.暴伤-1))",
                }),
                attrBuff: new LeveledBuff(buffMap.get("黎瑟·浴火被动2")!, 1),
                sharedBuffs: [],
                rangedMods: [new LeveledMod(53009, 10), new LeveledMod(53010, 10)],
                spotCheck: build =>
                    build
                        .getConditionalBuffPropsList()
                        .find(entry => entry.技能 === "狙击子弹|^伤害$" || entry.tag?.includes("SPliseGun01"))?.props.技能独立增伤,
            },
        ]
        for (const testCase of cases) {
            const codeBuild = createCompareBuild({ ...testCase, buffs: [testCase.codeBuff, ...testCase.sharedBuffs] })
            const attrBuild = createCompareBuild({ ...testCase, buffs: [testCase.attrBuff, ...testCase.sharedBuffs] })
            expect(attrBuild.calculate(), testCase.name).toBe(codeBuild.calculate())
            const codeValue = testCase.spotCheck(codeBuild)
            const attrValue = testCase.spotCheck(attrBuild)
            expect(attrValue).toBeGreaterThan(0)
            expect(attrValue).toBe(codeValue)
        }
    })

    it("tag条件BUFF的加/减收益对称", () => {
        const enabled = createFalusiBuild(["莉莉蔻4溯"])
        const addIncome = createFalusiBuild([]).calcIncome(new LeveledBuff(s4Data, 1), false)
        const minusIncome = enabled.calcIncome(new LeveledBuff(s4Data, 1), true)
        expect(addIncome).toBeGreaterThan(0)
        expect(addIncome).toBeCloseTo(minusIncome, 6)
        expect(s2Data.tag).toEqual(["充盈"])
    })
})

describe("元素弱点抗性区（U95）", () => {
    /** 火角色（希尔妲）/ 雷角色（黎瑟）构筑；弱点通过自定义 BUFF 注入 */
    const createBuild = (options: { charName?: "希尔妲" | "黎瑟"; resistance?: number; buffs?: [string, number][] } = {}) => {
        const charName = options.charName ?? "希尔妲"
        return new CharBuild({
            char: new LeveledChar(charName),
            skillLevel: 10,
            hpPercent: 0.5,
            resonanceGain: 0,
            charMods: [],
            buffs: options.buffs?.length ? [createCustomBuff(options.buffs)] : [],
            melee: new LeveledWeapon(10302),
            ranged: new LeveledWeapon(20601),
            baseName: charName === "希尔妲" ? "高温清扫" : "快速出击",
            enemyId: 130,
            enemyLevel: 80,
            enemyResistance: options.resistance ?? 0,
            targetFunction: "伤害",
        })
    }

    const ratio = (resistance: number, buffs: [string, number][], baseBuffs: [string, number][] = []) =>
        createBuild({ resistance, buffs }).calculate() / createBuild({ resistance, buffs: baseBuffs }).calculate()

    it("属性面板输出七键，未提供的键为零", () => {
        const attrs = createBuild({ buffs: [["火属性弱点", 0.54]] }).calculateAttributes()
        expect(attrs.火属性弱点).toBeCloseTo(0.54, 12)
        expect(attrs.水属性弱点).toBe(0)
        expect(attrs.雷属性弱点).toBe(0)
        expect(attrs.风属性弱点).toBe(0)
        expect(attrs.光属性弱点).toBe(0)
        expect(attrs.暗属性弱点).toBe(0)
        expect(attrs.全属性弱点).toBe(0)
    })

    it("r=0.5 + 火属性弱点 0.54 → ×2.08（与抗性同区加算）", () => {
        expect(ratio(0.5, [["火属性弱点", 0.54]])).toBeCloseTo(2.08, 9)
    })

    it("已有 200% 增伤时仍为 ×2.08（不再被增伤池稀释）", () => {
        expect(
            ratio(
                0.5,
                [
                    ["火属性弱点", 0.54],
                    ["增伤", 2],
                ],
                [["增伤", 2]]
            )
        ).toBeCloseTo(2.08, 9)
    })

    it("r=0 → ×1.54；r=-4 → ×1.108", () => {
        expect(ratio(0, [["火属性弱点", 0.54]])).toBeCloseTo(1.54, 9)
        expect(ratio(-4, [["火属性弱点", 0.54]])).toBeCloseTo(1.108, 9)
    })

    it("弱点不参与抗性正负判定：r=0.5 + 弱点仍走正抗（转属克）分支", () => {
        // 若先用 r - 弱点 判号，0.5 抗性会被弱点翻成负抗而错误走转属逆；这里转属克 50% 应按正抗分支混入 -4 翻转
        const withConvert = createBuild({
            resistance: 0.5,
            buffs: [
                ["火属性弱点", 0.54],
                ["转属克", 0.5],
            ],
        }).calculate()
        const withoutConvert = createBuild({ resistance: 0.5, buffs: [["火属性弱点", 0.54]] }).calculate()
        const zone = (r: number, w: number) => Math.max(0, 1 - r + w)
        expect(withConvert / withoutConvert).toBeCloseTo((0.5 * zone(0.5, 0.54) + 0.5 * zone(-4, 0.54)) / zone(0.5, 0.54), 9)
    })

    it("物理分量不吃弱点；全属性弱点只作用于六元素分量", () => {
        const build = createBuild({ resistance: 0.5, buffs: [["全属性弱点", 0.54]] })
        const baseline = createBuild({ resistance: 0.5 })
        const attrs = build.calculateWeaponAttributes(build.rangedWeapon)
        const baseAttrs = baseline.calculateWeaponAttributes(baseline.rangedWeapon)
        const opts = { isSkillPool: false, fieldTag: ["武器伤害"] }
        const damage = build.calculateDamage(attrs, build.rangedWeapon, attrs.weapon, opts)
        const baseDamage = baseline.calculateDamage(baseAttrs, baseline.rangedWeapon, baseAttrs.weapon, opts)

        expect(damage.physicalDamage).toBeCloseTo(baseDamage.physicalDamage!, 9)
        expect(damage.elementDamage! / baseDamage.elementDamage!).toBeCloseTo(2.08, 9)
    })

    it("元素不匹配时弱点不生效；全属性弱点对任意元素生效", () => {
        // 非火角色带火属性弱点：不进入抗性区
        const nonFire = createBuild({ charName: "黎瑟", resistance: 0.5, buffs: [["火属性弱点", 0.54]] })
        const nonFireBase = createBuild({ charName: "黎瑟", resistance: 0.5 })
        expect(nonFire.calculate() / nonFireBase.calculate()).toBeCloseTo(1, 9)
        // 火角色也不吃水属性弱点
        const waterWeak = createBuild({ resistance: 0.5, buffs: [["水属性弱点", 0.54]] })
        expect(waterWeak.calculate() / createBuild({ resistance: 0.5 }).calculate()).toBeCloseTo(1, 9)
        // 全属性弱点对非火角色同样生效
        const allWeak = createBuild({ charName: "黎瑟", resistance: 0.5, buffs: [["全属性弱点", 0.54]] })
        expect(allWeak.calculate() / nonFireBase.calculate()).toBeCloseTo(2.08, 9)
    })

    it("DOT：ownZone 吃角色元素弱点 + 全属性弱点，otherZone 只吃全属性弱点", () => {
        const dotWeapon = () =>
            new LeveledWeapon({
                id: 99999,
                名称: "DOT测试武器",
                类型: ["近战", "长柄"],
                伤害类型: "切割",
                攻击: 100,
                暴击: 0.05,
                暴伤: 1.5,
                触发: 1,
                描述: "",
                加成: {},
                熔炼: "",
                技能: [],
            } satisfies Weapon)
        const dotBuild = (buffs: [string, number][]) =>
            new CharBuild({
                char: new LeveledChar("希尔妲"),
                skillLevel: 10,
                hpPercent: 1,
                resonanceGain: 0,
                charMods: [],
                // 四元素追伤：希尔妲=火，去重后 4 种 → 其余属性 3 种
                buffs: [
                    new LeveledBuff({
                        名称: "四元素追伤",
                        描述: "",
                        attr: { 水属性追伤: 0.1, 火属性追伤: 0.1, 雷属性追伤: 0.1, 风属性追伤: 0.1 },
                    }),
                    ...(buffs.length ? [createCustomBuff(buffs)] : []),
                ],
                melee: dotWeapon(),
                ranged: dotWeapon(),
                baseName: "高温清扫",
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance: 0.5,
                targetFunction: "伤害",
                dotSettings: { skill: 0, melee: 1, ranged: 0, skillweapon: 0 },
            })
        const zone = (r: number, w: number) => Math.max(0, 1 - r + w)
        const otherZone = (r: number, w: number, count: number) =>
            r < 0 ? Math.max(0, 0.5 + w) : (Math.max(0, 5 + w) + zone(r, w) * (count - 1)) / count
        const base = dotBuild([])
        const { ownFreq, otherFreq } = base.calculateDotFrequencies()
        expect(otherFreq).toBeGreaterThan(0)
        const expectedRatio = (ownW: number, allW: number) =>
            (ownFreq * zone(0.5, ownW) + otherFreq * otherZone(0.5, allW, 3)) / (ownFreq * zone(0.5, 0) + otherFreq * otherZone(0.5, 0, 3))

        const elementWeak = dotBuild([["火属性弱点", 0.54]])
        expect(elementWeak.calculateDotDamage() / base.calculateDotDamage()).toBeCloseTo(expectedRatio(0.54, 0), 9)
        expect(elementWeak.calculateDotDamage() / base.calculateDotDamage()).toBeLessThan(2.08)
        const allWeak = dotBuild([["全属性弱点", 0.54]])
        expect(allWeak.calculateDotDamage() / base.calculateDotDamage()).toBeCloseTo(expectedRatio(0.54, 0.54), 9)
    })
})

describe("U95-fix 真实 2008 注入链", () => {
    const gear2008: TranscendGearEntry = {
        slotId: 8,
        affixId: 2008,
        rollLevel: 1,
        masterworkLevel: 0,
        ancient: false,
        finalMasterwork: false,
    }

    /** 经 `normalizeCharSettings` → `createCharBuildFromSettings` 走完整升华注入链 */
    const buildFromSettings = (charName: string, gearList: TranscendGearEntry[]) => {
        const charId = charMap.get(charName)!.id
        const settings = createDefaultCharSettings()
        settings.baseName = charMap.get(charId)?.技能?.[0]?.名称 ?? ""
        settings.charSkillLevel = [10, 10, 10]
        settings.meleeWeapon = 10302
        settings.rangedWeapon = 20601
        settings.enemyResistance = 0.5
        settings.targetFunction = "伤害"
        settings.transcend = { ...settings.transcend, enabled: true, mainGear: gearList }
        return createCharBuildFromSettings(charId, normalizeCharSettings(settings))
    }

    it("火角色装备 2008：注入 火属性弱点 0.54，r=0.5 时 ×2.08", () => {
        const withGear = buildFromSettings("希尔妲", [gear2008])
        const withoutGear = buildFromSettings("希尔妲", [])

        expect(withGear.calculateAttributes().火属性弱点).toBeCloseTo(0.54, 12)
        expect(withGear.buffs.some(buff => buff.名称 === "升华·火属性弱点")).toBe(true)
        expect(withGear.calculate() / withoutGear.calculate()).toBeCloseTo(2.08, 9)
    })

    it("非火角色装备 2008：元素限定过滤，弱点不注入", () => {
        const withGear = buildFromSettings("黎瑟", [gear2008])
        const withoutGear = buildFromSettings("黎瑟", [])

        expect(withGear.calculateAttributes().火属性弱点 || 0).toBe(0)
        expect(withGear.buffs.some(buff => buff.名称 === "升华·火属性弱点")).toBe(false)
        expect(withGear.calculate() / withoutGear.calculate()).toBeCloseTo(1, 9)
    })
})

describe("U136 同 id 随机 + 淬炼双行在计算层双计", () => {
    const CHAR_ID = charMap.get("希尔妲")!.id
    /** 一条词条 roll（精锻由 craft 统一写入） */
    const affixRoll = (affixId: number, rollLevel = 1): TranscendGearAffixRoll => ({
        affixId,
        rollLevel,
        masterworkLevel: 0,
        ancient: false,
        finalMasterwork: false,
    })
    /**
     * 手套（槽型 3）物品：基础 101 + 指定词条；`temperingAffixIndex` 指向淬炼行。
     */
    const gloveItem = (affixes: TranscendGearAffixRoll[], temperingAffixIndex?: number): TranscendGearItemConfig => ({
        kind: "normal",
        slotType: 3,
        rarityId: 5,
        equipBaseScore: 50,
        affixes,
        ...(temperingAffixIndex === undefined
            ? {}
            : { craft: { masterworkLevel: 0, temperingAffixIndex, temperingCount: 1, enchantCount: 0 } }),
    })
    /** 经 `normalizeCharSettings` → `createCharBuildFromSettings` 走完整升华注入链 */
    const settingsFromItem = (item: TranscendGearItemConfig) => {
        const settings = createDefaultCharSettings()
        settings.baseName = charMap.get(CHAR_ID)?.技能?.[0]?.名称 ?? ""
        settings.charSkillLevel = [10, 10, 10]
        settings.meleeWeapon = 10302
        settings.rangedWeapon = 20601
        settings.enemyResistance = 0.5
        settings.targetFunction = "伤害"
        settings.transcend = { ...settings.transcend, enabled: true, mainGear: [{ slotId: 3, item }] }
        return normalizeCharSettings(settings)
    }
    const buildFromItem = (item: TranscendGearItemConfig) => createCharBuildFromSettings(CHAR_ID, settingsFromItem(item))!

    it("双行装备的伤害与面板 = 两行各自之和（不是只计一行）", () => {
        const base = buildFromItem(gloveItem([affixRoll(101)]))
        const random = buildFromItem(gloveItem([affixRoll(101), affixRoll(1001)]))
        const tempering = buildFromItem(gloveItem([affixRoll(101), affixRoll(1001)], 1))
        const twin = buildFromItem(gloveItem([affixRoll(101), affixRoll(1001), affixRoll(1001)], 2))

        const baseAttack = base.calculateAttributes().攻击
        const randomGain = random.calculateAttributes().攻击 - baseAttack
        const temperingGain = tempering.calculateAttributes().攻击 - baseAttack
        const twinGain = twin.calculateAttributes().攻击 - baseAttack
        expect(randomGain).toBeGreaterThan(0)
        expect(twinGain).toBeGreaterThan(randomGain)
        // 面板取整到 0.01：两行之和允许 0.02 的累计取整误差
        expect(Math.abs(twinGain - (randomGain + temperingGain))).toBeLessThan(0.02)

        const baseDamage = base.calculate()
        const randomDelta = random.calculate() - baseDamage
        const temperingDelta = tempering.calculate() - baseDamage
        const twinDelta = twin.calculate() - baseDamage
        expect(randomDelta).toBeGreaterThan(0)
        expect(twinDelta).toBeGreaterThan(randomDelta)
        expect(Math.abs(twinDelta - (randomDelta + temperingDelta)) / twinDelta).toBeLessThan(1e-4)
    })

    it("不同档位双行：面板与伤害增量均为两行各自数值之和", () => {
        const random = buildFromItem(gloveItem([affixRoll(101), affixRoll(1001, 1)]))
        const tempering = buildFromItem(gloveItem([affixRoll(101), affixRoll(1001, 5)], 1))
        const twin = buildFromItem(gloveItem([affixRoll(101), affixRoll(1001, 1), affixRoll(1001, 5)], 2))

        const baseAttack = buildFromItem(gloveItem([affixRoll(101)])).calculateAttributes().攻击
        const randomGain = random.calculateAttributes().攻击 - baseAttack
        const temperingGain = tempering.calculateAttributes().攻击 - baseAttack
        const twinGain = twin.calculateAttributes().攻击 - baseAttack
        // 两行档位不同：增量不同，且双行 = 两行之和（面板取整容差 0.02）
        expect(randomGain).toBeGreaterThan(0)
        expect(temperingGain).toBeGreaterThan(randomGain)
        expect(Math.abs(twinGain - (randomGain + temperingGain))).toBeLessThan(0.02)

        const baseDamage = buildFromItem(gloveItem([affixRoll(101)])).calculate()
        const randomDelta = random.calculate() - baseDamage
        const temperingDelta = tempering.calculate() - baseDamage
        const twinDelta = twin.calculate() - baseDamage
        expect(Math.abs(twinDelta - (randomDelta + temperingDelta)) / twinDelta).toBeLessThan(1e-4)
    })

    it("幂等深比较：settings / mainGear / entries / attrs 反复解析均不变", () => {
        const settings = settingsFromItem(gloveItem([affixRoll(101), affixRoll(1001, 1), affixRoll(1001, 5)], 2))
        const snapshot = structuredClone(settings)
        const first = resolveGearEffects(flattenEquippedGear(settings.transcend.mainGear).entries, "main")
        const firstEntries = structuredClone(first.entries)
        const firstAttrs = { ...first.attrs }
        const second = resolveGearEffects(flattenEquippedGear(settings.transcend.mainGear).entries, "main")

        expect(settings).toEqual(snapshot)
        expect(settings.transcend.mainGear).toEqual(snapshot.transcend.mainGear)
        expect(first.entries).toEqual(firstEntries)
        expect(second.entries).toEqual(firstEntries)
        expect(second.attrs).toEqual(firstAttrs)
    })

    it("重复解析幂等：每次新建结果，不额外翻倍也不改写源配置", () => {
        const settings = settingsFromItem(gloveItem([affixRoll(101), affixRoll(1001), affixRoll(1001)], 2))
        const first = resolveTranscendEffectsForSettings(settings, "main", { charId: CHAR_ID })
        const second = resolveTranscendEffectsForSettings(settings, "main", { charId: CHAR_ID })
        const attackBuffs = (buffs: typeof first.buffs) => buffs.filter(buff => buff.名称 === "升华装备·手套·攻击")

        // 基础 101 + 随机 1001 + 淬炼 1001 → 三条同名词条 BUFF
        expect(attackBuffs(first.buffs)).toHaveLength(3)
        expect(attackBuffs(second.buffs)).toHaveLength(3)
        expect(second.buffs.map(buff => buff.名称)).toEqual(first.buffs.map(buff => buff.名称))
        expect(settings.transcend.mainGear).toHaveLength(1)
    })
})

describe("普通近战/远程前缀作用域（U16）", () => {
    /** 创建测试构筑（近战/远程为普通武器；同律武器来自角色数据） */
    const createBuild = (charName: string, options: { buffs?: [string, number][]; meleeMods?: LeveledMod[] } = {}) =>
        new CharBuild({
            char: new LeveledChar(charName),
            skillLevel: 10,
            hpPercent: 0.5,
            resonanceGain: 0,
            charMods: [],
            meleeMods: options.meleeMods ?? [],
            buffs: options.buffs?.length ? [createCustomBuff(options.buffs)] : [],
            melee: new LeveledWeapon(10302),
            ranged: new LeveledWeapon(20601),
            baseName: "普通攻击",
            enemyId: 130,
            enemyLevel: 80,
            enemyResistance: 0.5,
            targetFunction: "伤害",
        })

    /** 读取指定武器的面板 */
    const panelOf = (build: CharBuild, weapon: LeveledWeapon | LeveledSkillWeapon | undefined) =>
        build.calculateWeaponAttributes(weapon).weapon!

    it("裸「近战」前缀同时作用于普通近战与同律近战面板", () => {
        const baseline = createBuild("贝蕾妮卡")
        const buffed = createBuild("贝蕾妮卡", { buffs: [["近战攻击", 0.1]] })

        const baseMelee = panelOf(baseline, baseline.meleeWeapon)
        const buffedMelee = panelOf(buffed, buffed.meleeWeapon)
        expect(buffedMelee.攻击 / baseMelee.攻击).toBeCloseTo(1.1, 3)

        expect(baseline.skillWeapon?.inherit).toBeUndefined()
        const baseSkill = panelOf(baseline, baseline.skillWeapon)
        const buffedSkill = panelOf(buffed, buffed.skillWeapon)
        expect(buffedSkill.攻击 / baseSkill.攻击).toBeCloseTo(1.1, 3)

        // 近战前缀不影响远程面板
        expect(panelOf(buffed, buffed.rangedWeapon).攻击).toBe(panelOf(baseline, baseline.rangedWeapon).攻击)
    })

    it("「普通近战」只作用于普通近战面板（通用 base），同律近战面板不变", () => {
        const baseline = createBuild("贝蕾妮卡")
        const buffed = createBuild("贝蕾妮卡", {
            buffs: [
                ["普通近战攻击", 0.1],
                ["普通近战暴击", 0.1],
                ["普通近战暴伤", 0.1],
                ["普通近战触发", 0.1],
                ["普通近战独立增伤", 0.1],
                ["普通近战武器倍率", 0.1],
                ["普通近战攻速", 0.1],
                ["普通近战多重", 0.1],
                ["普通近战增伤", 0.1],
            ],
        })

        const baseMelee = panelOf(baseline, baseline.meleeWeapon)
        const buffedMelee = panelOf(buffed, buffed.meleeWeapon)
        expect(buffedMelee.攻击 / baseMelee.攻击).toBeCloseTo(1.1, 3)
        expect(buffedMelee.暴击).toBeGreaterThan(baseMelee.暴击)
        expect(buffedMelee.暴伤).toBeGreaterThan(baseMelee.暴伤)
        expect(buffedMelee.触发).toBeGreaterThan(baseMelee.触发)
        expect(buffedMelee.攻速).toBeGreaterThan(baseMelee.攻速)
        expect(buffedMelee.多重).toBeGreaterThan(baseMelee.多重)
        expect(buffedMelee.增伤).toBeGreaterThan(baseMelee.增伤)
        // 乘法属性与武器倍率同样走通用前缀
        expect(buffedMelee.独立增伤).toBeCloseTo(baseMelee.独立增伤 + 0.1, 6)
        expect(buffedMelee.武器倍率).toBeCloseTo(baseMelee.武器倍率 + 0.1, 6)

        // 同律面板（非继承）不读取普通近战专属前缀
        const baseSkill = panelOf(baseline, baseline.skillWeapon)
        const buffedSkill = panelOf(buffed, buffed.skillWeapon)
        expect(buffedSkill.攻击).toBe(baseSkill.攻击)
        expect(buffedSkill.暴击).toBe(baseSkill.暴击)
        expect(buffedSkill.暴伤).toBe(baseSkill.暴伤)
        expect(buffedSkill.触发).toBe(baseSkill.触发)
        expect(buffedSkill.攻速).toBe(baseSkill.攻速)
        expect(buffedSkill.多重).toBe(baseSkill.多重)
        expect(buffedSkill.增伤).toBe(baseSkill.增伤)
        expect(buffedSkill.独立增伤).toBe(baseSkill.独立增伤)
        expect(buffedSkill.武器倍率).toBe(baseSkill.武器倍率)
    })

    it("「普通远程」只作用于普通远程面板，同律远程面板不变；裸「远程」两者通吃", () => {
        const baseline = createBuild("赛琪")
        const ordinary = createBuild("赛琪", { buffs: [["普通远程攻击", 0.1]] })
        const bare = createBuild("赛琪", { buffs: [["远程攻击", 0.1]] })

        const baseRanged = panelOf(baseline, baseline.rangedWeapon)
        expect(panelOf(ordinary, ordinary.rangedWeapon).攻击 / baseRanged.攻击).toBeCloseTo(1.1, 3)
        // 普通近战/远程互不影响
        expect(panelOf(ordinary, ordinary.meleeWeapon).攻击).toBe(panelOf(baseline, baseline.meleeWeapon).攻击)

        const baseSkill = panelOf(baseline, baseline.skillWeapon)
        expect(panelOf(ordinary, ordinary.skillWeapon).攻击).toBe(baseSkill.攻击)
        expect(panelOf(bare, bare.skillWeapon).攻击 / baseSkill.攻击).toBeCloseTo(1.1, 3)
    })

    it("继承型同律武器（疑星落）面板不读取「普通近战」", () => {
        const createInheritBuild = (buffs: [string, number][]) =>
            new CharBuild({
                char: new LeveledChar("煜明"),
                skillLevel: 10,
                hpPercent: 0.5,
                resonanceGain: 2,
                charMods: [],
                buffs: buffs.length ? [createCustomBuff(buffs)] : [],
                melee: new LeveledWeapon(10303),
                ranged: new LeveledWeapon(20601),
                baseName: "疑星落",
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance: 0.5,
                targetFunction: "伤害",
            })

        const baseline = createInheritBuild([])
        const ordinary = createInheritBuild([["普通近战攻击", 0.1]])
        const bare = createInheritBuild([["近战攻击", 0.1]])

        expect(baseline.skillWeapon?.inherit).toBe("melee")

        // 普通面板吃到普通近战攻击
        expect(panelOf(ordinary, ordinary.meleeWeapon).攻击 / panelOf(baseline, baseline.meleeWeapon).攻击).toBeCloseTo(1.1, 3)
        // 继承型同律面板（近战面板来源仍属同律）不吃普通近战攻击
        expect(panelOf(ordinary, ordinary.skillWeapon).攻击).toBe(panelOf(baseline, baseline.skillWeapon).攻击)
        const baselineSkillAttrs = baseline.getAllWeaponSkillsAttrs().get("同律")!
        const ordinarySkillAttrs = ordinary.getAllWeaponSkillsAttrs().get("同律")!
        expect(ordinarySkillAttrs.攻击).toBe(baselineSkillAttrs.攻击)
        // 裸近战前缀仍按既有降级口径进入继承型同律面板
        expect(panelOf(bare, bare.skillWeapon).攻击 / panelOf(baseline, baseline.skillWeapon).攻击).toBeCloseTo(1.1, 3)
    })

    it("近战槽 MOD 仍不穿透同律面板，普通前缀不绕过该规则", () => {
        const meleeMod = new LeveledMod({
            id: 999801,
            icon: "Test01",
            名称: "测试·普通近战",
            版本: "1.0",
            系列: "测试",
            品质: "金",
            极性: "A",
            耐受: 15,
            类型: "近战",
            加成: { 近战攻击: 0.1, 普通近战攻击: 0.1 },
            效果: "测试用普通近战MOD",
        })
        const baseline = createBuild("贝蕾妮卡")
        const modded = createBuild("贝蕾妮卡", { meleeMods: [meleeMod] })

        // 近战面板：带前缀与普通前缀的 MOD 词条都计入
        expect(panelOf(modded, modded.meleeWeapon).攻击 / panelOf(baseline, baseline.meleeWeapon).攻击).toBeCloseTo(1.2, 3)
        // 同律面板：近战槽 MOD 不随前缀降级穿透，普通前缀也不会绕过
        expect(panelOf(modded, modded.skillWeapon).攻击).toBe(panelOf(baseline, baseline.skillWeapon).攻击)
    })
})

describe("普通前缀补全（U16b）", () => {
    /** 读取指定武器面板 */
    const panelOf = (build: CharBuild, weapon: LeveledWeapon | LeveledSkillWeapon | undefined) =>
        build.calculateWeaponAttributes(weapon).weapon!

    /** 创建测试构筑：近战 10302（普攻/蓄力/下落/滑行字段齐全）、远程 20201（有装填/弹匣/弹药） */
    const createBuild = (
        charName: string,
        options: { buffs?: [string, number][]; charMods?: LeveledMod[]; baseName?: string; targetFunction?: string } = {}
    ) =>
        new CharBuild({
            char: new LeveledChar(charName),
            skillLevel: 10,
            hpPercent: 0.5,
            resonanceGain: 0,
            charMods: options.charMods ?? [],
            buffs: options.buffs?.length ? [createCustomBuff(options.buffs)] : [],
            melee: new LeveledWeapon(10302),
            ranged: new LeveledWeapon(20201),
            baseName: options.baseName ?? "普通攻击",
            enemyId: 130,
            enemyLevel: 80,
            enemyResistance: 0,
            targetFunction: options.targetFunction ?? "伤害",
        })

    it("攻击细分键：普攻/蓄力/下落/滑行的增伤与独立增伤只在普通近战面板生效", () => {
        const cases = [
            { baseName: "普通攻击", attackType: "普攻", targetFunction: "一段伤害" },
            { baseName: "蓄力攻击", attackType: "蓄力", targetFunction: "蓄力攻击伤害" },
            { baseName: "下落攻击", attackType: "下落", targetFunction: "下落攻击伤害" },
            { baseName: "滑行攻击", attackType: "滑行", targetFunction: "滑行攻击伤害" },
        ]
        for (const { baseName, attackType, targetFunction } of cases) {
            const baseline = createBuild("黎瑟", { baseName, targetFunction })
            const expected = baseline.calculateOneTime()
            // 普通前缀键与既有作用域键口径一致
            for (const [suffix, extra] of [
                ["增伤", 1],
                ["独立增伤", 3],
            ] as const) {
                const ordinary = createBuild("黎瑟", {
                    baseName,
                    targetFunction,
                    buffs: [[`普通近战${attackType}${suffix}`, extra]],
                })
                const scoped = createBuild("黎瑟", {
                    baseName,
                    targetFunction,
                    buffs: [[`近战${attackType}${suffix}`, extra]],
                })
                expect(ordinary.calculateOneTime(), `${attackType}${suffix}`).toBeGreaterThan(expected)
                expect(ordinary.calculateOneTime(), `${attackType}${suffix}`).toBeCloseTo(scoped.calculateOneTime(), 6)
                // 远程前缀不作用于近战字段
                const crossScope = createBuild("黎瑟", {
                    baseName,
                    targetFunction,
                    buffs: [[`普通远程${attackType}${suffix}`, extra]],
                })
                expect(crossScope.calculateOneTime(), `${attackType}${suffix} 跨作用域`).toBe(expected)
            }
        }
    })

    it("攻击细分键：同律近战面板不读取普通近战细分键", () => {
        const createImyr = (attr?: Record<string, number>) => {
            const build = new CharBuild({
                char: new LeveledChar("贝蕾妮卡"),
                skillLevel: 10,
                hpPercent: 0.5,
                resonanceGain: 2,
                melee: new LeveledWeapon(10302),
                ranged: new LeveledWeapon(20201),
                baseName: "伊弥尔",
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance: 0.5,
                targetFunction: "一段伤害",
            })
            if (attr) build.buffs = [new LeveledBuff({ 名称: "测试普通前缀", 描述: "测试用", attr })]
            return build
        }
        const baseline = createImyr().calculate()
        // 对照：同律专属键正常生效，证明字段带攻击细分类型、用例非空洞
        expect(createImyr({ 同律近战普攻增伤: 1 }).calculate()).toBeGreaterThan(baseline)
        expect(createImyr({ 普通近战普攻增伤: 1 }).calculate()).toBe(baseline)
        expect(createImyr({ 普通近战普攻独立增伤: 1 }).calculate()).toBe(baseline)
        expect(createImyr({ 普通远程普攻增伤: 1 }).calculate()).toBe(baseline)
    })

    it("攻击细分键：继承型同律（疑星落）面板不读取普通近战细分键", () => {
        const createYueming = (attr?: Record<string, number>) => {
            const build = new CharBuild({
                char: new LeveledChar("煜明"),
                skillLevel: 10,
                hpPercent: 0.5,
                resonanceGain: 2,
                melee: new LeveledWeapon(10303),
                ranged: new LeveledWeapon(20201),
                baseName: "疑星落",
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance: 0.5,
                targetFunction: "伤害",
            })
            if (attr) build.buffs = [new LeveledBuff({ 名称: "测试普通前缀", 描述: "测试用", attr })]
            return build
        }
        const baseline = createYueming().calculate()
        expect(baseline).toBeGreaterThan(0)
        // 对照：裸下落增伤生效（疑星落「视为: 下落攻击」）
        expect(createYueming({ 下落增伤: 1 }).calculate()).toBeGreaterThan(baseline)
        expect(createYueming({ 普通近战下落增伤: 1 }).calculate()).toBe(baseline)
        expect(createYueming({ 普通近战下落独立增伤: 1 }).calculate()).toBe(baseline)
    })

    it("普通远程攻击细分键生效（远程字段注入普攻 tag）", () => {
        const createRangedBuild = (attr?: Record<string, number>) => {
            const build = createBuild("赛琪")
            const rangedSkill = build.rangedWeapon.技能!.find(skill => skill.字段?.length)!
            const field = rangedSkill.字段!.find(item => item.名称.endsWith("伤害"))!
            // 远程武器字段本身不带攻击类型 tag；显式标注普攻，验证远程细分键的读取路径
            field.tag = ["远程", "武器", "普攻"]
            build.baseName = rangedSkill.名称
            build.targetFunction = field.名称
            if (attr) build.buffs = [new LeveledBuff({ 名称: "测试普通前缀", 描述: "测试用", attr })]
            return build
        }
        const baseline = createRangedBuild().calculate()
        const ordinaryDamage = createRangedBuild({ 普通远程普攻增伤: 0.5 }).calculate()
        const scopedDamage = createRangedBuild({ 远程普攻增伤: 0.5 }).calculate()
        expect(ordinaryDamage).toBeGreaterThan(baseline)
        expect(ordinaryDamage).toBeCloseTo(scopedDamage, 6)
        expect(createRangedBuild({ 普通近战普攻增伤: 0.5 }).calculate()).toBe(baseline)
        expect(createRangedBuild({ 普通近战普攻独立增伤: 0.5 }).calculate()).toBe(baseline)

        const ordinaryIndependent = createRangedBuild({ 普通远程普攻独立增伤: 0.5 }).calculate()
        expect(ordinaryIndependent).toBeGreaterThan(baseline)
        expect(ordinaryIndependent).toBeCloseTo(createRangedBuild({ 远程普攻独立增伤: 0.5 }).calculate(), 6)
    })

    it("普通远程面板：装填/弹匣/弹药/攻速/多重/增伤生效，同律远程面板不变", () => {
        const baseline = createBuild("赛琪")
        const buffed = createBuild("赛琪", {
            buffs: [
                ["普通远程装填", 0.1],
                ["普通远程弹匣", 0.1],
                ["普通远程弹药", 0.1],
                ["普通远程攻速", 0.1],
                ["普通远程多重", 0.1],
                ["普通远程增伤", 0.1],
            ],
        })
        const baseRanged = panelOf(baseline, baseline.rangedWeapon)
        const buffedRanged = panelOf(buffed, buffed.rangedWeapon)
        // 装填为时间，加成越高装填越短
        expect(buffedRanged.装填).toBeLessThan(baseRanged.装填)
        expect(buffedRanged.弹匣).toBeGreaterThan(baseRanged.弹匣)
        expect(buffedRanged.弹药).toBeGreaterThan(baseRanged.弹药)
        expect(buffedRanged.攻速).toBeGreaterThan(baseRanged.攻速)
        expect(buffedRanged.多重).toBeGreaterThan(baseRanged.多重)
        expect(buffedRanged.增伤).toBeGreaterThan(baseRanged.增伤)
        // 普通远程前缀不影响普通近战面板
        expect(panelOf(buffed, buffed.meleeWeapon).攻速).toBe(panelOf(baseline, baseline.meleeWeapon).攻速)
        expect(panelOf(buffed, buffed.meleeWeapon).多重).toBe(panelOf(baseline, baseline.meleeWeapon).多重)

        const baseSkill = panelOf(baseline, baseline.skillWeapon)
        const buffedSkill = panelOf(buffed, buffed.skillWeapon)
        expect(buffedSkill.装填).toBe(baseSkill.装填)
        expect(buffedSkill.弹匣).toBe(baseSkill.弹匣)
        expect(buffedSkill.弹药).toBe(baseSkill.弹药)
        expect(buffedSkill.攻速).toBe(baseSkill.攻速)
        expect(buffedSkill.多重).toBe(baseSkill.多重)
        expect(buffedSkill.增伤).toBe(baseSkill.增伤)
    })

    it("普通远程前缀不影响普通近战面板", () => {
        const baseline = createBuild("黎瑟")
        const buffed = createBuild("黎瑟", {
            buffs: [
                ["普通远程攻击", 0.1],
                ["普通远程暴击", 0.1],
                ["普通远程攻速", 0.1],
                ["普通远程多重", 0.1],
                ["普通远程增伤", 0.1],
            ],
        })
        const baseMelee = panelOf(baseline, baseline.meleeWeapon)
        const buffedMelee = panelOf(buffed, buffed.meleeWeapon)
        expect(buffedMelee.攻击).toBe(baseMelee.攻击)
        expect(buffedMelee.暴击).toBe(baseMelee.暴击)
        expect(buffedMelee.攻速).toBe(baseMelee.攻速)
        expect(buffedMelee.多重).toBe(baseMelee.多重)
        expect(buffedMelee.增伤).toBe(baseMelee.增伤)
        // 对照：远程面板确实吃到
        expect(panelOf(buffed, buffed.rangedWeapon).攻击).toBeGreaterThan(panelOf(baseline, baseline.rangedWeapon).攻击)
    })

    it("独立增伤按独立乘区：近战独立增伤 × 普通近战独立增伤", () => {
        const plain = createBuild("贝蕾妮卡", { buffs: [["近战独立增伤", 0.2]] })
        const both = createBuild("贝蕾妮卡", {
            buffs: [
                ["近战独立增伤", 0.2],
                ["普通近战独立增伤", 0.3],
            ],
        })
        // 独立因子相乘：(1+0.2)×(1+0.3)-1 = 0.56；加性合并会得到 0.5
        expect(panelOf(both, both.meleeWeapon).独立增伤).toBeCloseTo(0.56, 6)
        // 同律面板只吃近战独立增伤，不读取普通近战独立增伤
        expect(panelOf(both, both.skillWeapon).独立增伤).toBe(panelOf(plain, plain.skillWeapon).独立增伤)
    })

    it("独立增伤按独立乘区：攻击细分键（近战普攻独立增伤 × 普通近战普攻独立增伤）", () => {
        const plain = createBuild("黎瑟", {
            baseName: "普通攻击",
            targetFunction: "一段伤害",
            buffs: [["近战普攻独立增伤", 0.2]],
        })
        const both = createBuild("黎瑟", {
            baseName: "普通攻击",
            targetFunction: "一段伤害",
            buffs: [
                ["近战普攻独立增伤", 0.2],
                ["普通近战普攻独立增伤", 0.3],
            ],
        })
        // 加性合并会得到 1.5/1.2 = 1.25
        expect(both.calculateOneTime() / plain.calculateOneTime()).toBeCloseTo(1.3, 6)
    })

    it("普通近战触发计入充盈威力，普通近战攻速计入召唤物攻速", () => {
        const baseline = createBuild("黎瑟", { buffs: [["召唤物攻击速度转化", 0.5]] })
        const buffed = createBuild("黎瑟", {
            buffs: [
                ["普通近战触发", 3],
                ["普通近战攻速", 0.5],
                ["召唤物攻击速度转化", 0.5],
            ],
        })
        const basePanel = panelOf(baseline, baseline.meleeWeapon)
        const buffedPanel = panelOf(buffed, buffed.meleeWeapon)
        const baseAttrs = baseline.calculateWeaponAttributes(baseline.meleeWeapon)
        const buffedAttrs = buffed.calculateWeaponAttributes(buffed.meleeWeapon)

        // 触发 → 充盈威力：溢出增量 × 充盈转化（无转化词条时为 1）
        expect(buffedPanel.触发).toBeGreaterThan(1)
        const fullnessDelta =
            Math.max(0, buffedPanel.触发 - 1) * (buffedPanel.充盈转化 ?? 1) - Math.max(0, basePanel.触发 - 1) * (basePanel.充盈转化 ?? 1)
        expect((buffedAttrs.充盈威力 ?? 1) - (baseAttrs.充盈威力 ?? 1)).toBeCloseTo(fullnessDelta, 6)

        // 攻速 → 召唤物攻速：攻速增量 × 召唤物攻击速度转化（转化词条为 0 时不产生召唤物攻速）
        expect(buffedPanel.攻速).toBeGreaterThan(basePanel.攻速)
        const summonConversion = buffed.getTotalBonus("召唤物攻击速度转化", "近战")
        expect(summonConversion).toBeCloseTo(0.5, 6)
        expect((buffedAttrs.召唤物攻击速度 ?? 0) - (baseAttrs.召唤物攻击速度 ?? 0)).toBeCloseTo(
            (buffedPanel.攻速 - basePanel.攻速) * summonConversion,
            6
        )
    })

    it("圆舞/剑非剑/疑星落：继承型同律面板不吃普通近战前缀", () => {
        for (const [charName, skillWeaponName] of [
            ["芙罗拉", "圆舞"],
            ["刻舟", "剑非剑"],
            ["煜明", "疑星落"],
        ] as const) {
            const baseline = createBuild(charName)
            const buffed = createBuild(charName, { buffs: [["普通近战攻击", 0.1]] })
            expect(baseline.skillWeapon?.名称, charName).toBe(skillWeaponName)
            expect(baseline.skillWeapon?.inherit, charName).toBe("melee")
            // 普通近战面板生效
            expect(panelOf(buffed, buffed.meleeWeapon).攻击 / panelOf(baseline, baseline.meleeWeapon).攻击, charName).toBeCloseTo(1.1, 3)
            // 继承型同律面板不变
            expect(panelOf(buffed, buffed.skillWeapon).攻击, charName).toBe(panelOf(baseline, baseline.skillWeapon).攻击)
        }
    })

    it("角色槽 MOD 的普通前缀不进入普通武器面板（按既有槽位作用域惯例）", () => {
        const charMod = new LeveledMod({
            id: 999802,
            icon: "Test01",
            名称: "测试·角色普通前缀",
            版本: "1.0",
            系列: "测试",
            品质: "金",
            极性: "A",
            耐受: 15,
            类型: "角色",
            加成: { 普通近战攻击: 0.1, 普通远程攻击: 0.1 },
            效果: "测试用角色槽普通前缀MOD",
        })
        const baseline = createBuild("黎瑟")
        const modded = createBuild("黎瑟", { charMods: [charMod] })
        expect(panelOf(modded, modded.meleeWeapon).攻击).toBe(panelOf(baseline, baseline.meleeWeapon).攻击)
        expect(panelOf(modded, modded.rangedWeapon).攻击).toBe(panelOf(baseline, baseline.rangedWeapon).攻击)
    })
})

describe("赛季增伤独立乘区（词条 1030）", () => {
    /** 构造基线构筑（无 BUFF）；自定义 BUFF 走 attr 表汇总 */
    const buildWith = (attrs?: Record<string, number>) =>
        new CharBuild({
            char: new LeveledChar("黎瑟"),
            skillLevel: 10,
            hpPercent: 0.5,
            resonanceGain: 0,
            charMods: [],
            buffs: attrs ? [new LeveledBuff({ 名称: "赛季增伤测试", 描述: "u44", attr: attrs })] : [],
            melee: new LeveledWeapon(10302),
            ranged: new LeveledWeapon(20601),
            baseName: "快速出击",
            enemyId: 130,
            enemyLevel: 80,
            enemyResistance: 0.5,
            targetFunction: "伤害",
        })

    it("多个来源先累加：0.1 + 0.2 → ×1.3（不是 1.1×1.2）", () => {
        const baseline = buildWith().calculate()
        const one = buildWith({ 赛季增伤: 0.1 }).calculate()
        const two = buildWith({ 赛季增伤: 0.3 }).calculate()
        // 两个独立 BUFF 各 0.1 / 0.2：汇总为 0.3，等价于单条 0.3
        const split = new CharBuild({
            char: new LeveledChar("黎瑟"),
            skillLevel: 10,
            hpPercent: 0.5,
            resonanceGain: 0,
            charMods: [],
            buffs: [
                new LeveledBuff({ 名称: "赛季增伤A", 描述: "u44", attr: { 赛季增伤: 0.1 } }),
                new LeveledBuff({ 名称: "赛季增伤B", 描述: "u44", attr: { 赛季增伤: 0.2 } }),
            ],
            melee: new LeveledWeapon(10302),
            ranged: new LeveledWeapon(20601),
            baseName: "快速出击",
            enemyId: 130,
            enemyLevel: 80,
            enemyResistance: 0.5,
            targetFunction: "伤害",
        })
        expect(one / baseline).toBeCloseTo(1.1, 9)
        expect(two / baseline).toBeCloseTo(1.3, 9)
        expect(split.calculateAttributes().赛季增伤).toBeCloseTo(0.3, 9)
        expect(split.calculate() / baseline).toBeCloseTo(1.3, 9)
    })

    it("与普通增伤分池：1.0 基础增伤下 +0.5 普通增伤 = ×1.25，+0.5 赛季增伤 = ×1.5", () => {
        const base = buildWith({ 增伤: 1 })
        const baseline = base.calculate()
        const normal = buildWith({ 增伤: 1.5 }).calculate()
        const season = buildWith({ 增伤: 1, 赛季增伤: 0.5 }).calculate()
        const both = buildWith({ 增伤: 1.5, 赛季增伤: 0.5 }).calculate()
        expect(normal / baseline).toBeCloseTo(1.25, 9)
        expect(season / baseline).toBeCloseTo(1.5, 9)
        // 两个乘区相乘：1.25 × 1.5
        expect(both / baseline).toBeCloseTo(1.875, 9)
        expect(season).not.toBeCloseTo(normal, 6)
    })

    it("1030 装备属性进 赛季增伤，不并入普通增伤池", () => {
        const result = resolveGearEffects([gear({ slotId: 1, affixId: 1030, rollLevel: 1 })], "main")
        const attrs = result.attrs as Record<string, number>
        expect(attrs.赛季增伤).toBeCloseTo(0.0625, 9)
        expect(attrs.增伤).toBeUndefined()

        // 基线已带 1.0 普通增伤：同数值并入普通池被稀释（×1.03），独立乘区不稀释（×1.0625）
        const build = buildWith({ 增伤: 1, ...attrs })
        const merged = buildWith({ 增伤: 1 + attrs.赛季增伤 })
        expect(build.calculateAttributes().赛季增伤).toBeCloseTo(0.0625, 9)
        expect(build.calculateAttributes().增伤).toBeCloseTo(1, 9)
        expect(build.calculate()).toBeCloseTo(buildWith({ 增伤: 1 }).calculate() * (1 + 0.0625), 6)
        expect(build.calculate()).toBeGreaterThan(merged.calculate())
    })
})

describe("追伤分池（U112 §135：武器池 / 技能池不交叉）", () => {
    /** 无追伤词条的测试武器，隔离武器面板自带的追伤 */
    function plainWeapon(name: string): LeveledWeapon {
        const data: Weapon = {
            id: 99998,
            名称: name,
            类型: ["近战", "长柄"],
            伤害类型: "切割",
            攻击: 100,
            暴击: 0.05,
            暴伤: 1.5,
            触发: 0.2,
            描述: "",
            加成: {},
            熔炼: "",
            技能: [],
        }
        return new LeveledWeapon(data)
    }

    /** 雷属性角色（黎瑟）+ 无追伤武器，逐条注入追伤分量 */
    function chaseBuild(
        attr: Record<string, number>,
        enemyLevel = 80,
        options: { charName?: string; buffs?: LeveledBuff[]; enemyResistance?: number } = {}
    ) {
        return new CharBuild({
            char: new LeveledChar(options.charName ?? "黎瑟"),
            skillLevel: 10,
            hpPercent: 0.5,
            resonanceGain: 2,
            melee: plainWeapon("测试近战"),
            ranged: plainWeapon("测试远程"),
            buffs: [new LeveledBuff({ 名称: "追伤测试", 描述: "", attr }), ...(options.buffs ?? [])],
            baseName: "测试",
            enemyId: 130,
            enemyLevel,
            enemyResistance: options.enemyResistance ?? 0,
            targetFunction: "伤害",
        })
    }

    const weaponResult = (build: CharBuild) =>
        build.calculateWeaponDamage(build.calculateWeaponAttributes(build.meleeWeapon), build.meleeWeapon)
    /** 无触发期望值：隔离物理触发倍率 */
    const weaponDamage = (build: CharBuild) => weaponResult(build).higherCritNoTrigger!
    const skillDamage = (build: CharBuild) => build.calculateSkillDamage(build.calculateWeaponAttributes()).expectedDamage
    /** 追伤因子：同一背景下「有 / 无追伤」的伤害比，应恒等于 1 + Σ */
    const chaseFactor = (chase: Record<string, number>, shared: Record<string, number> = {}, enemyResistance = 0) =>
        weaponDamage(chaseBuild({ ...shared, ...chase }, 80, { enemyResistance })) /
        weaponDamage(chaseBuild(shared, 80, { enemyResistance }))

    it("武器池：七分量直接求和为 1+Σ 因子，与角色元素无关", () => {
        const base = weaponDamage(chaseBuild({}))
        for (const key of ["火属性追伤", "水属性追伤", "雷属性追伤", "风属性追伤", "光属性追伤", "暗属性追伤", "自属性追伤"]) {
            expect(weaponDamage(chaseBuild({ [key]: 0.1 })) / base, key).toBeCloseTo(1.1, 9)
        }
        const all = Object.fromEntries(
            ["火属性追伤", "水属性追伤", "雷属性追伤", "风属性追伤", "光属性追伤", "暗属性追伤", "自属性追伤"].map(key => [key, 0.1])
        )
        expect(weaponDamage(chaseBuild(all)) / base).toBeCloseTo(1.7, 9)
        // 负值参与求和
        expect(weaponDamage(chaseBuild({ 火属性追伤: -0.2 })) / base).toBeCloseTo(0.8, 9)
        expect(weaponDamage(chaseBuild({ 火属性追伤: 0.5, 水属性追伤: -0.2 })) / base).toBeCloseTo(1.3, 9)
        // 求和为负时整体非负钳制
        expect(weaponDamage(chaseBuild({ 火属性追伤: -1.5 }))).toBeCloseTo(0, 9)
    })

    it("武器池吃武器面板：weaponAttr 动态写入进入伤害，角色属性无追伤键", () => {
        const base = weaponDamage(chaseBuild({}))
        const build = chaseBuild({})
        build.dynamicBuffs.push(new LeveledBuff({ 名称: "面板追伤", 描述: "", code: "weaponAttr.火属性追伤 += 0.5" }))
        expect(build.calculateWeaponAttributes(build.meleeWeapon).weapon?.追加伤害).toBeCloseTo(0.5, 9)
        expect(weaponDamage(build) / base).toBeCloseTo(1.5, 9)
        const attrs = build.calculateAttributes() as unknown as Record<string, unknown>
        for (const key of [...ADDITIONAL_DAMAGE_KEYS, LEGACY_ADDITIONAL_DAMAGE_KEY]) expect(attrs[key]).toBeUndefined()
    })

    it("不吃弱点 / 元素增伤 / 抗性 / 转属：因子恒为 1+Σ，抗性区仍只按角色元素", () => {
        expect(chaseFactor({ 火属性追伤: 0.5 })).toBeCloseTo(1.5, 9)
        // 火弱点 / 全属性弱点 / 火属性增伤都不作用于追伤
        expect(chaseFactor({ 火属性追伤: 0.5 }, { 火属性弱点: 0.54 })).toBeCloseTo(1.5, 9)
        expect(chaseFactor({ 火属性追伤: 0.5 }, { 全属性弱点: 0.54 })).toBeCloseTo(1.5, 9)
        expect(chaseFactor({ 火属性追伤: 0.5 }, { 火属性增伤: 1 })).toBeCloseTo(1.5, 9)
        // 敌人抗性与转属克（正抗）/ 转属逆（负抗）/ 转切割都不拆分追伤
        expect(chaseFactor({ 火属性追伤: 0.5 }, {}, 0.5)).toBeCloseTo(1.5, 9)
        expect(chaseFactor({ 火属性追伤: 0.5 }, { 转属克: 1 }, 0.5)).toBeCloseTo(1.5, 9)
        expect(chaseFactor({ 火属性追伤: 0.5 }, { 转属逆: 1 }, -4)).toBeCloseTo(1.5, 9)
        expect(chaseFactor({ 火属性追伤: 0.5 }, { 转切割: 1 })).toBeCloseTo(1.5, 9)
        // 物理 / 元素分量整体同倍率放大（追伤不是独立分量）
        const plain = weaponResult(chaseBuild({}))
        const withChase = weaponResult(chaseBuild({ 火属性追伤: 0.5 }))
        expect(withChase.physicalDamage! / plain.physicalDamage!).toBeCloseTo(1.5, 9)
        expect(withChase.elementDamage! / plain.elementDamage!).toBeCloseTo(1.5, 9)
        // 非角色元素弱点完全不生效（雷角色 + 火弱点）
        expect(chaseFactor({}, { 火属性弱点: 0.54 })).toBeCloseTo(1, 9)
    })

    it("技能池只吃技能追伤：武器追伤不影响技能伤害，技能追伤不进武器池", () => {
        const skillBase = skillDamage(chaseBuild({}))
        expect(skillDamage(chaseBuild({ 火属性追伤: 0.5 })) / skillBase).toBeCloseTo(1, 9)
        expect(skillDamage(chaseBuild({ 火属性追伤: 0.2, 自属性追伤: 0.3 })) / skillBase).toBeCloseTo(1, 9)
        expect(skillDamage(chaseBuild({ 技能追伤: 0.4 })) / skillBase).toBeCloseTo(1.4, 9)
        const weaponBase = weaponDamage(chaseBuild({}))
        expect(weaponDamage(chaseBuild({ 技能追伤: 0.4 })) / weaponBase).toBeCloseTo(1, 9)
        // 两池不交叉：同时带武器追伤与技能追伤时各自只吃自己那一份
        const both = chaseBuild({ 火属性追伤: 0.5, 技能追伤: 0.4 })
        expect(weaponDamage(both) / weaponBase).toBeCloseTo(1.5, 9)
        expect(skillDamage(both) / skillBase).toBeCloseTo(1.4, 9)
        // 技能池因子同样非负钳制
        expect(skillDamage(chaseBuild({ 技能追伤: -1.5 }))).toBeCloseTo(0, 9)
    })

    it("光菲娜 + 菲娜Q：四份求和只进武器池，技能池不受影响", () => {
        const plain = chaseBuild({}, 80, { charName: "菲娜" })
        const withQ = chaseBuild({}, 80, { charName: "菲娜", buffs: [new LeveledBuff("菲娜Q")] })
        const panel = withQ.calculateWeaponAttributes(withQ.meleeWeapon).weapon!
        expect(panel.追加伤害).toBeCloseTo(0.6, 9)
        expect(weaponDamage(withQ) / weaponDamage(plain)).toBeCloseTo(1.6, 9)
        expect(skillDamage(withQ) / skillDamage(plain)).toBeCloseTo(1, 9)
        // 四份不是独立元素分量：物理 / 元素分量整体同倍率放大
        const plainWeapon = weaponResult(plain)
        const qWeapon = weaponResult(withQ)
        expect(qWeapon.physicalDamage! / plainWeapon.physicalDamage!).toBeCloseTo(1.6, 9)
        expect(qWeapon.elementDamage! / plainWeapon.elementDamage!).toBeCloseTo(1.6, 9)
    })

    it("非匹配元素分量在面板可见且不再被门限过滤", () => {
        const build = chaseBuild({ 火属性追伤: 0.4 })
        const panel = build.calculateWeaponAttributes(build.meleeWeapon).weapon!
        expect(panel.火属性追伤).toBeCloseTo(0.4, 9)
        expect(panel.雷属性追伤).toBe(0)
        expect(panel.追加伤害).toBeCloseTo(0.4, 9)
    })

    it("聚合 = Σ 七分量（武器面板），角色属性不产生追伤键，表达式可按武器命名空间读取", () => {
        const build = chaseBuild({
            水属性追伤: 0.1,
            火属性追伤: 0.2,
            雷属性追伤: 0.3,
            风属性追伤: 0.4,
            光属性追伤: 0.5,
            暗属性追伤: 0.6,
            自属性追伤: 0.7,
        })
        const attrs = build.calculateWeaponAttributes(build.meleeWeapon)
        expect(attrs.weapon!.追加伤害).toBeCloseTo(2.8, 9)
        const flat = attrs as unknown as Record<string, unknown>
        for (const key of [...ADDITIONAL_DAMAGE_KEYS, LEGACY_ADDITIONAL_DAMAGE_KEY]) expect(flat[key]).toBeUndefined()
        expect(build.evaluateAST("近战::追加伤害", attrs)).toBeCloseTo(2.8, 9)
    })

    it("字面「追加伤害」输入迁移为自属性追伤并告警（只进武器面板）", () => {
        resetAdditionalDamageWarnings()
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
        try {
            const build = chaseBuild({ 追加伤害: 0.5 })
            const panel = build.calculateWeaponAttributes(build.meleeWeapon).weapon!
            expect(panel.自属性追伤).toBeCloseTo(0.5, 9)
            expect(panel.追加伤害).toBeCloseTo(0.5, 9)
            expect(warn).toHaveBeenCalledWith(expect.stringContaining("自属性追伤"))
        } finally {
            warn.mockRestore()
        }
    })

    it("旧 code 对聚合的复合赋值按七分量迁移（*= / += / -= / =）", () => {
        resetAdditionalDamageWarnings()
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
        try {
            const panelWith = (code: string) => {
                const build = chaseBuild({ 雷属性追伤: 0.4, 自属性追伤: 0.2 })
                build.dynamicBuffs.push(new LeveledBuff({ 名称: "旧聚合写入", 描述: "", code }))
                return build.calculateWeaponAttributes(build.meleeWeapon).weapon!
            }
            // *=：七分量同比例缩放，元素匹配口径保持不变
            const scaled = panelWith("if(weaponAttr)weaponAttr.追加伤害*=0.5")
            expect(scaled.雷属性追伤).toBeCloseTo(0.2, 9)
            expect(scaled.自属性追伤).toBeCloseTo(0.1, 9)
            expect(scaled.追加伤害).toBeCloseTo(0.3, 9)
            // +=：差值记入自属性追伤
            const added = panelWith("weaponAttr.追加伤害+=0.1")
            expect(added.雷属性追伤).toBeCloseTo(0.4, 9)
            expect(added.自属性追伤).toBeCloseTo(0.3, 9)
            expect(added.追加伤害).toBeCloseTo(0.7, 9)
            // -=：差值从自属性追伤扣除
            const subtracted = panelWith("weaponAttr.追加伤害-=0.1")
            expect(subtracted.雷属性追伤).toBeCloseTo(0.4, 9)
            expect(subtracted.自属性追伤).toBeCloseTo(0.1, 9)
            expect(subtracted.追加伤害).toBeCloseTo(0.5, 9)
            // 纯赋值：覆盖为自属性追伤，其余六分量清零
            const assigned = panelWith("weaponAttr.追加伤害=1")
            expect(assigned.雷属性追伤).toBe(0)
            expect(assigned.自属性追伤).toBeCloseTo(1, 9)
            expect(assigned.追加伤害).toBeCloseTo(1, 9)
            expect(warn).toHaveBeenCalled()
        } finally {
            warn.mockRestore()
        }
    })

    it("数值锚点：菲娜Q 四分量 / 升华下午茶 / 升华暗追伤 / 10399 自属性", () => {
        // 菲娜Q 按 Q 技能字段表达式求值：Lv10/12/30 = 0.15/0.172/0.37，四元素同值
        for (const [qLevel, expected] of [
            [10, 0.15],
            [12, 0.172],
            [30, 0.37],
        ] as const) {
            const build = new CharBuild({
                char: new LeveledChar("菲娜"),
                skillLevel: [10, qLevel, 10],
                hpPercent: 1,
                resonanceGain: 0,
                buffs: [new LeveledBuff("菲娜Q")],
                melee: plainWeapon("测试近战"),
                ranged: plainWeapon("测试远程"),
                baseName: "测试",
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance: 0,
                targetFunction: "伤害",
            })
            const panel = build.calculateWeaponAttributes(build.meleeWeapon).weapon!
            for (const key of ["水属性追伤", "火属性追伤", "雷属性追伤", "风属性追伤"] as const) {
                expect(panel[key], `Q=${qLevel} ${key}`).toBeCloseTo(expected, 9)
            }
            expect(panel.追加伤害).toBeCloseTo(expected * 4, 9)
        }

        const tea = new LeveledBuff(TRANSCEND_BUFF_MAP.get("升华·下午茶追伤")!)
        for (const key of ["水属性追伤", "火属性追伤", "雷属性追伤", "风属性追伤"]) {
            expect(tea.getAttrValue(key), key).toBeCloseTo(0.2, 9)
        }

        const dark = new LeveledBuff(TRANSCEND_BUFF_MAP.get("升华·暗属性追伤")!)
        expect(dark.getAttrValue("暗属性追伤")).toBeCloseTo(0.64, 9)

        const weapon = new LeveledWeapon(10399)
        expect(weapon.自属性追伤).toBeCloseTo(0.35, 9)
        const build = new CharBuild({
            char: new LeveledChar("莉兹贝尔"),
            skillLevel: 10,
            hpPercent: 1,
            resonanceGain: 0,
            extraMastery: "重剑",
            melee: weapon,
            ranged: plainWeapon("测试远程"),
            baseName: "测试",
            enemyId: 130,
            enemyLevel: 80,
            enemyResistance: 0,
            targetFunction: "伤害",
        })
        const panel = build.calculateWeaponAttributes(weapon).weapon!
        expect(panel.自属性追伤).toBeCloseTo(0.35, 9)
        expect(panel.追加伤害).toBeCloseTo(0.35, 9)
        expect(panel.光属性追伤).toBe(0)
    })

    it("旧 MOD 字面「追加伤害」装载时归一，MOD属性加权不丢失", () => {
        resetAdditionalDamageWarnings()
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
        try {
            const legacyMod = new LeveledMod({
                id: 990002,
                名称: "旧追伤",
                系列: "百首",
                品质: "金",
                耐受: 0,
                类型: "角色",
                加成: { 追加伤害: [0.3] },
            } satisfies Mod)
            expect(legacyMod.自属性追伤).toBeCloseTo(0.3, 9)
            expect(legacyMod.追加伤害).toBeUndefined()
            expect(legacyMod.getAddAttrValue("追加伤害")).toBeUndefined()
            expect(legacyMod.getAddAttrValue("自属性追伤")).toBeCloseTo(0.3, 9)
            expect(warn).toHaveBeenCalledWith(expect.stringContaining("MOD 990002"))

            const build = new CharBuild({
                char: new LeveledChar("黎瑟"),
                skillLevel: 10,
                hpPercent: 0.5,
                resonanceGain: 2,
                melee: plainWeapon("测试近战"),
                ranged: plainWeapon("测试远程"),
                charMods: [legacyMod],
                buffs: [new LeveledBuff({ 名称: "MOD属性", 描述: "", attr: { 雷MOD属性: 0.5 } })],
                baseName: "测试",
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance: 0,
                targetFunction: "伤害",
            })
            const panel = build.calculateWeaponAttributes(build.meleeWeapon).weapon!
            // 0.3 基础 + 0.3 × MOD属性 0.5 加权（面板口径）
            expect(panel.自属性追伤).toBeCloseTo(0.45, 9)
            expect(panel.追加伤害).toBeCloseTo(0.45, 9)
        } finally {
            warn.mockRestore()
        }
    })

    it('getTotalBonus("追加伤害") 按分量求和并遵守 prefix / includeMods / includeBuffs', () => {
        const meleeMod = new LeveledMod({
            id: 990003,
            名称: "近战追伤",
            系列: "百首",
            品质: "金",
            耐受: 0,
            类型: "近战",
            加成: { 火属性追伤: [0.1] },
        } satisfies Mod)
        const build = new CharBuild({
            char: new LeveledChar("黎瑟"),
            skillLevel: 10,
            hpPercent: 0.5,
            resonanceGain: 2,
            melee: plainWeapon("测试近战"),
            ranged: plainWeapon("测试远程"),
            meleeMods: [meleeMod],
            buffs: [new LeveledBuff({ 名称: "追伤测试", 描述: "", attr: { 自属性追伤: 0.2 } })],
            baseName: "测试",
            enemyId: 130,
            enemyLevel: 80,
            enemyResistance: 0,
            targetFunction: "伤害",
        })
        expect(build.getTotalBonus("追加伤害")).toBeCloseTo(0.2, 9)
        expect(build.getTotalBonus("追加伤害", "近战")).toBeCloseTo(0.3, 9)
        expect(build.getTotalBonus("追加伤害", "远程")).toBeCloseTo(0.2, 9)
        expect(build.getTotalBonus("追加伤害", "同律近战")).toBeCloseTo(0.2, 9)
        expect(build.getTotalBonus("追加伤害", "近战", { includeMods: false })).toBeCloseTo(0.2, 9)
        expect(build.getTotalBonus("追加伤害", "近战", { includeBuffs: false })).toBeCloseTo(0.1, 9)
    })

    it("追加伤害BUG 按武器面板七分量缩放，武器伤害同比降低", () => {
        const k = 1 / (1 + (240 - 190) * 0.05)
        const plain = chaseBuild({ 雷属性追伤: 0.4, 自属性追伤: 0.2 }, 240)
        const build = chaseBuild({ 雷属性追伤: 0.4, 自属性追伤: 0.2 }, 240)
        build.dynamicBuffs.push(new LeveledBuff(buffMap.get("追加伤害BUG")!))
        // code 只改写武器面板：角色侧无追伤键，面板逐分量缩放
        expect((build.calculateAttributes() as unknown as Record<string, unknown>).雷属性追伤).toBeUndefined()
        const panel = build.calculateWeaponAttributes(build.meleeWeapon).weapon!
        expect(panel.雷属性追伤).toBeCloseTo(0.4 * k, 9)
        expect(panel.自属性追伤).toBeCloseTo(0.2 * k, 9)
        expect(panel.追加伤害).toBeCloseTo(0.6 * k, 9)
        expect(weaponDamage(build) / weaponDamage(plain)).toBeCloseTo((1 + 0.6 * k) / 1.6, 9)
    })

    it("旧 code 裸写角色侧聚合：重定向到武器面板（*= / += / -= / =）", () => {
        resetAdditionalDamageWarnings()
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
        try {
            const panelWith = (code: string) => {
                const build = chaseBuild({ 雷属性追伤: 0.4, 自属性追伤: 0.2 })
                build.dynamicBuffs.push(new LeveledBuff({ 名称: "旧角色聚合写入", 描述: "", code }))
                return build.calculateWeaponAttributes(build.meleeWeapon).weapon!
            }
            // 角色沙盒初值 0：*= 无净变化
            const scaled = panelWith("追加伤害*=0.5")
            expect(scaled.雷属性追伤).toBeCloseTo(0.4, 9)
            expect(scaled.自属性追伤).toBeCloseTo(0.2, 9)
            expect(scaled.追加伤害).toBeCloseTo(0.6, 9)
            // +=：差值累加到自属性
            const added = panelWith("追加伤害+=0.1")
            expect(added.雷属性追伤).toBeCloseTo(0.4, 9)
            expect(added.自属性追伤).toBeCloseTo(0.3, 9)
            expect(added.追加伤害).toBeCloseTo(0.7, 9)
            // -=：负差值累加到自属性
            const subtracted = panelWith("追加伤害-=0.1")
            expect(subtracted.雷属性追伤).toBeCloseTo(0.4, 9)
            expect(subtracted.自属性追伤).toBeCloseTo(0.1, 9)
            expect(subtracted.追加伤害).toBeCloseTo(0.5, 9)
            // 纯赋值：写入值累加到自属性，不覆盖已有来源
            const assigned = panelWith("追加伤害=1")
            expect(assigned.雷属性追伤).toBeCloseTo(0.4, 9)
            expect(assigned.自属性追伤).toBeCloseTo(1.2, 9)
            expect(assigned.追加伤害).toBeCloseTo(1.6, 9)
            expect(warn).toHaveBeenCalledWith(expect.stringContaining("重定向"))
        } finally {
            warn.mockRestore()
        }
    })

    it("旧 code 裸写角色侧分量：重定向到武器面板对应分量", () => {
        resetAdditionalDamageWarnings()
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
        try {
            const build = chaseBuild({ 雷属性追伤: 0.4, 自属性追伤: 0.2 })
            build.dynamicBuffs.push(new LeveledBuff({ 名称: "裸分量写入", 描述: "", code: "火属性追伤 += 0.5" }))
            const attrs = build.calculateWeaponAttributes(build.meleeWeapon)
            expect(attrs.weapon!.火属性追伤).toBeCloseTo(0.5, 9)
            expect(attrs.weapon!.追加伤害).toBeCloseTo(1.1, 9)
            expect((attrs as unknown as Record<string, unknown>).火属性追伤).toBeUndefined()
            expect(warn).toHaveBeenCalledWith(expect.stringContaining("重定向"))
            expect(weaponDamage(build) / weaponDamage(chaseBuild({ 雷属性追伤: 0.4, 自属性追伤: 0.2 }))).toBeCloseTo(2.1 / 1.6, 9)
        } finally {
            warn.mockRestore()
        }
    })

    it("旧 code 混合写聚合与分量：分量保留显式写入，聚合差值记入自属性", () => {
        resetAdditionalDamageWarnings()
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
        try {
            const build = chaseBuild({ 雷属性追伤: 0.4, 自属性追伤: 0.2 })
            build.dynamicBuffs.push(
                new LeveledBuff({ 名称: "混合写入", 描述: "", code: "weaponAttr.追加伤害*=0.5;weaponAttr.雷属性追伤+=1" })
            )
            const panel = build.calculateWeaponAttributes(build.meleeWeapon).weapon!
            // 显式分量写入保留：0.4 + 1；聚合差值 0.3 - 0.6 记入自属性
            expect(panel.雷属性追伤).toBeCloseTo(1.4, 9)
            expect(panel.自属性追伤).toBeCloseTo(-0.1, 9)
            expect(panel.追加伤害).toBeCloseTo(1.3, 9)
            expect(warn).toHaveBeenCalledWith(expect.stringContaining("分量写入"))
        } finally {
            warn.mockRestore()
        }
    })

    it("条件 BUFF 旧键归一化（角色侧不再重算追伤聚合）", () => {
        resetAdditionalDamageWarnings()
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
        try {
            const build = chaseBuild({})
            build.buffs.push(new LeveledBuff({ 名称: "条件追伤", 描述: "", 技能: "测试技能", attr: { 追加伤害: 0.3 } }))
            const list = build.getConditionalBuffPropsList()
            expect(list).toHaveLength(1)
            expect(list[0].props).toEqual({ 自属性追伤: 0.3 })
            expect(warn).toHaveBeenCalledWith(expect.stringContaining("条件 BUFF"))

            const merged = LeveledSkill.mergeConditionalProps({ 雷属性追伤: 0.4, 自属性追伤: 0.2, 追加伤害: 0.6 }, { 雷属性追伤: 0.1 })
            expect(merged.雷属性追伤).toBeCloseTo(0.5, 9)
            expect(merged.自属性追伤).toBeCloseTo(0.2, 9)
            // 聚合不再由角色侧重算：传入值原样保留
            expect(merged.追加伤害).toBeCloseTo(0.6, 9)
        } finally {
            warn.mockRestore()
        }
    })
})

describe("升华技能替换（U83b）", () => {
    const fillers = () => ({
        skillLevel: [10, 10, 10] as [number, number, number],
        hpPercent: 1,
        resonanceGain: 0,
        buffs: [],
        melee: new LeveledWeapon(10302),
        ranged: new LeveledWeapon(20201),
        baseName: "高温清扫",
    })

    it("角色技能：字段改写生效，未覆盖字段与等级保留", () => {
        const build = new CharBuild({
            ...fillers(),
            char: new LeveledChar("希尔妲"),
            skillReplacements: { 310201: { id: 310212, 名称: "高温清扫", 类型: "伤害", 字段改写: { 伤害: { 值: 9.03552 } } } },
        })
        const skill = build.charSkills.find(item => item.名称 === "高温清扫")!
        expect(skill.id).toBe(310212)
        expect(skill.等级).toBe(10)
        expect(skill.字段.map(field => field.名称)).toEqual(["神智消耗", "每秒神智消耗", "伤害", "[高温祛污焰束]长度"])
        expect(skill.字段.find(field => field.名称 === "伤害")?.值).toBeCloseTo(9.03552, 9)
    })

    it("角色技能：仅身份/名称替换时源字段与 E 技能等级保留", () => {
        const build = new CharBuild({
            ...fillers(),
            char: new LeveledChar("菲娜"),
            skillLevel: [7, 10, 10],
            baseName: "“在一个暖和的午后”",
            skillReplacements: { 180101: { id: 180112, 名称: "“在一个暖和的午后”", 类型: "伤害" } },
        })
        const skill = build.charSkills[0]
        expect(skill.id).toBe(180112)
        expect(skill.等级).toBe(7)
        expect(skill.字段.map(field => field.名称)).toEqual(["神智消耗", "伤害", "伤害半径", "[喧闹下午茶]内伤害", "移动速度降低持续时间"])
    })

    it("武器技能：替换保留字段 / 等级 / 武器名（2040601 → 2040603 仅身份）", () => {
        const build = new CharBuild({
            ...fillers(),
            char: new LeveledChar("黎瑟"),
            baseName: "射击",
            ranged: new LeveledWeapon("切割齿轮"),
            skillReplacements: { 2040601: { id: 2040603, 名称: "射击", 类型: "射击" } },
        })
        const skill = build.rangedWeaponSkills.find(item => item.id === 2040603)!
        expect(skill.名称).toBe("射击")
        expect(skill.武器名).toBe("切割齿轮")
        expect(skill.等级).toBe(10)
        expect(skill.字段.map(field => field.名称)).toEqual(["射击伤害", "子弹伤害"])
        expect(skill.字段[0].值).toBe(0.05)
    })

    it("MOD 与词条同源时 MOD 优先并告警", () => {
        resetSkillReplacementWarnings()
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
        try {
            const build = new CharBuild({
                ...fillers(),
                char: new LeveledChar("黎瑟"),
                meleeMods: [new LeveledMod(203001)],
                melee: new LeveledWeapon("万古的诀别"),
                ranged: new LeveledWeapon(20601),
                baseName: "普通攻击",
                skillReplacements: { 1030101: { id: 999999, 名称: "普通攻击", 类型: "武器伤害", 字段: [{ 名称: "升华字段", 值: 1 }] } },
            })
            const skill = build.meleeWeaponSkills.find(item => item.名称 === "普通攻击")!
            expect(skill.id).toBe(1030201)
            expect(skill.字段.some(field => field.名称 === "路径伤害")).toBe(true)
            expect(skill.字段.some(field => field.名称 === "升华字段")).toBe(false)
            expect(warn).toHaveBeenCalledWith(expect.stringContaining("MOD 优先"))
        } finally {
            warn.mockRestore()
        }
    })

    it("clone() 保留替换载荷", () => {
        const build = new CharBuild({
            ...fillers(),
            char: new LeveledChar("希尔妲"),
            skillReplacements: { 310201: { id: 310212, 名称: "高温清扫", 类型: "伤害", 字段改写: { 伤害: { 值: 9.03552 } } } },
        })
        const cloned = build.clone().charSkills.find(item => item.id === 310212)!
        expect(cloned.字段.find(field => field.名称 === "伤害")?.值).toBeCloseTo(9.03552, 9)
    })

    it("worker 快照保留替换：重建技能字段与伤害一致", () => {
        const build = new CharBuild({
            ...fillers(),
            char: new LeveledChar("希尔妲"),
            skillReplacements: { 310201: { id: 310212, 名称: "高温清扫", 类型: "伤害", 字段改写: { 伤害: { 值: 9.03552 } } } },
        })
        const snapshot = createWorkerSnapshot(build)
        expect(snapshot.skillReplacements?.[310201]).toMatchObject({ id: 310212, 字段改写: { 伤害: { 值: 9.03552 } } })
        const restored = createBuildFromSnapshot(snapshot)
        expect(restored.charSkills.find(item => item.id === 310212)?.字段.find(field => field.名称 === "伤害")?.值).toBeCloseTo(9.03552, 9)
        expect(restored.calculate()).toBeCloseTo(build.calculate(), 9)
    })

    it("元素限定谓词：未限定 / 未提供角色元素时放行", () => {
        expect(isTranscendBuffElementAllowed("火", "火")).toBe(true)
        expect(isTranscendBuffElementAllowed("火", "水")).toBe(false)
        expect(isTranscendBuffElementAllowed("火", undefined)).toBe(true)
        expect(isTranscendBuffElementAllowed(undefined, "水")).toBe(true)
    })

    it("元素限定词条的替换与手写 BUFF 同门控", () => {
        const table = TRANSCEND_SKILL_REPLACEMENTS as Record<number, Record<string, { id: number; 名称: string; 类型: string }>>
        table[2008] = { "310201": { id: 310212, 名称: "高温清扫", 类型: "伤害" } }
        try {
            // 2008 的手写 BUFF 限定「火」：水元素下 BUFF 与替换同时被排除
            const blocked = resolveGearEffects([gear({ slotId: 8, affixId: 2008 })], "main", { charElement: "水", charId: 3102 })
            expect(blocked.skillReplacements).toEqual({})
            expect(blocked.buffs).toHaveLength(0)
            const allowed = resolveGearEffects([gear({ slotId: 8, affixId: 2008 })], "main", { charElement: "火", charId: 3102 })
            expect(allowed.skillReplacements[310201]).toMatchObject({ id: 310212 })
        } finally {
            delete table[2008]
        }
    })

    it("同 source 冲突按 slotId 高者胜，与装备条目数组顺序无关", () => {
        const affixes = [
            {
                id: 990202,
                plan: 4,
                minValue: 1,
                maxValue: 1,
                totalValueLevel: 1,
                desc: "",
                skillReplacements: { "310201": { id: 310213, 名称: "高槽", 类型: "伤害" } },
            },
            {
                id: 990201,
                plan: 4,
                minValue: 1,
                maxValue: 1,
                totalValueLevel: 1,
                desc: "",
                skillReplacements: { "310201": { id: 310212, 名称: "低槽", 类型: "伤害" } },
            },
        ]
        // 高槽条目在数组前、低槽在后：仍按 slotId 裁决
        const result = resolveGearEffects([gear({ slotId: 2, affixId: 990202 }), gear({ slotId: 1, affixId: 990201 })], "main", {
            tables: { affixes },
        })
        expect(result.skillReplacements[310201]).toMatchObject({ id: 310213, 名称: "高槽" })
        expect(result.warnings.join()).toContain("被词条 990202 覆盖")
        expect(result.warnings.join()).toContain("原词条 990201")
    })

    it("2040601 导出字段被保留源字段抑制（merge 分支）", () => {
        const merged = mergeTranscendSkillReplacement(2040601, "2040601", {
            id: 2040603,
            名称: "射击",
            类型: "射击",
            字段: [{ 名称: "射击伤害", 值: 0.06 }],
        })
        expect(merged).toMatchObject({ id: 2040603, 名称: "射击" })
        expect(merged?.字段).toBeUndefined()
    })

    it("2040601 身份替换不改变伤害（源字段原值镜像）", () => {
        const make = () => ({
            ...fillers(),
            char: new LeveledChar("黎瑟"),
            baseName: "射击",
            ranged: new LeveledWeapon("切割齿轮"),
        })
        const plain = new CharBuild(make())
        const replaced = new CharBuild({
            ...make(),
            skillReplacements: { 2040601: { id: 2040603, 名称: "射击", 类型: "射击" } },
        })
        expect(replaced.calculate()).toBeCloseTo(plain.calculate(), 9)
    })

    it("310201 目标伤害按 9.03552 结算（10 级原值 8.72）", () => {
        const make = () => ({ ...fillers(), char: new LeveledChar("希尔妲") })
        const plain = new CharBuild(make())
        const replaced = new CharBuild({
            ...make(),
            skillReplacements: { 310201: { id: 310212, 名称: "高温清扫", 类型: "伤害", 字段改写: { 伤害: { 值: 9.03552 } } } },
        })
        expect(replaced.calculate()).toBeCloseTo(plain.calculate() * (9.03552 / 8.72), 8)
    })

    it("字段完整替换 / 移除字段 + 字段改写两条路径", () => {
        const source = new LeveledChar("希尔妲").技能[0].skillData
        const full = applyTranscendSkillReplacement(source, { 字段: [{ 名称: "新字段", 值: 2 }] })
        expect(full.字段).toEqual([{ 名称: "新字段", 值: 2 }])
        const edited = applyTranscendSkillReplacement(source, { 移除字段: ["[高温祛污焰束]长度"], 字段改写: { 伤害: { 值: 1 } } })
        expect(edited.字段?.map(field => field.名称)).toEqual(["神智消耗", "每秒神智消耗", "伤害"])
        expect(edited.字段?.find(field => field.名称 === "伤害")?.值).toBe(1)
    })
})
