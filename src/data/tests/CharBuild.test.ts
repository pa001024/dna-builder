import { describe, expect, it } from "vitest"
import { CharBuild } from "../CharBuild"
import { createBuffFromSettings, createCharBuildFromSettings } from "../CharBuildHelper"
import { createBuildFromSnapshot, createWorkerSnapshot } from "../CharBuildSnapshot"
import { weaponData } from "../index"
import { LeveledBuff, LeveledChar, LeveledMod, LeveledWeapon } from "../leveled"
import { LeveledModWithCount } from "../leveled/LeveledMod"

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
        expect(buffA.攻击).toBe(0.1)
        expect(buffB.攻击).toBe(0.2)

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
        expect(buildA.buffs[0].攻击).toBe(0.1)
        expect(buildB.buffs[0].攻击).toBe(0.2)
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
                    召唤物伤害: 0.5,
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
                召唤物属性继承比例: 0.0025,
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
                召唤物属性继承比例: 0.0025,
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
                    召唤物属性继承比例: 0.0025,
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
            buffs: [new LeveledBuff({ 名称: "暴虐", 描述: "x", 近战攻速: 0.3 })],
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

    it("权火将熄5熔按近战MOD原始属性25%提升同律武器，且不受BUFF影响", () => {
        // 贝蕾妮卡拥有同律近战武器「伊弥尔」
        const makeBuild = (buffs: string[]) =>
            new CharBuild({
                char: new LeveledChar("贝蕾妮卡"),
                skillLevel: 10,
                hpPercent: 0.5,
                resonanceGain: 2,
                charMods: [],
                meleeMods: [new LeveledMod(42002)], // 专注：暴击1.0（相对值）
                rangedMods: [],
                skillMods: [],
                buffs: buffs.map(name => new LeveledBuff(name, name === "色散成霓" ? 10 : undefined)),
                melee: new LeveledWeapon(10399), // 权火将熄
                ranged: new LeveledWeapon(20601),
                baseName: "普通攻击",
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance: 0.5,
                targetFunction: "伤害",
            })

        const skillWeaponCrit = (build: CharBuild) => build.calculateWeaponAttributes(build.skillWeapon).weapon?.暴击 ?? 0
        const baseCrit = skillWeaponCrit(makeBuild([]))
        const skillBaseCrit = makeBuild([]).skillWeapon!.基础暴击

        // 原始MOD区加成：近战MOD专注提供100%暴击1.0（相对值）
        expect(makeBuild([]).getModAttrs().meleeMods.暴击).toBeCloseTo(1, 10)

        // 权火将熄5熔：最终暴击增加量 = 同律基础暴击 × 近战MOD暴击 × 25%
        const expectedIncrease = skillBaseCrit * 1 * 0.25
        const qhBuild = makeBuild([])
        qhBuild.dynamicBuffs.push(new LeveledBuff("权火将熄5熔"))
        expect(skillWeaponCrit(qhBuild)).toBeCloseTo(baseCrit + expectedIncrease, 10)

        // 色散成霓BUFF提高近战/同律武器暴击，但不应影响权火将熄5熔读取的原始MOD值
        const snBuild = makeBuild(["色散成霓"])
        const bothBuild = makeBuild(["色散成霓"])
        bothBuild.dynamicBuffs.push(new LeveledBuff("权火将熄5熔"))
        const marginalWithoutSn = skillWeaponCrit(qhBuild) - baseCrit
        const marginalWithSn = skillWeaponCrit(bothBuild) - skillWeaponCrit(snBuild)
        expect(marginalWithSn).toBeCloseTo(marginalWithoutSn, 10)
        expect(marginalWithSn).toBeCloseTo(expectedIncrease, 10)
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
                熔炼: ["A", "B", "C", "D", "E", "F"],
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
            expect(attrs.技能速度).toBeGreaterThanOrEqual(0)
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
                    charBuild.buffs.reduce((value, currentBuff) => value * (1 + (currentBuff.技能倍率乘数 || 0)), 100)
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
                    名称: "测试动态追加伤害",
                    描述: "测试用动态属性",
                    code: "weaponAttr.追加伤害 += 100",
                })
            )

            const dynamicAttrs = dynamicBuild.calculateWeaponAttributes()
            expect(dynamicAttrs.weapon?.追加伤害).toBe(100)
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
                        追加伤害: 2,
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
                    技能伤害: 0.2 * baseAttrs.技能威力,
                    远程暴伤: 0.8 * baseAttrs.技能威力,
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

            expect(buff.技能伤害).toBeCloseTo(0.2 * baseAttrs.技能威力)
            expect(buff.远程暴伤).toBeCloseTo(0.8 * baseAttrs.技能威力)
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
                team2: "-",
                team2Weapon: "-",
                timelineDPS: false,
                useGlobal: false,
                effectConfig: {},
                actions: { enable: false, i: [], b: [], hp: [], bgs: [] },
            })
            const cloned = build.clone()
            expect(build.calculate()).toBe(cloned.calculate())
        })
    })

    // 性能测试
    describe("性能测试", () => {
        it("应该能够快速计算多次", () => {
            const charBuild = createCharBuild()
            const startTime = performance.now()

            // 计算100次
            for (let i = 0; i < 100; i++) {
                charBuild.calculate()
            }

            const endTime = performance.now()
            const duration = endTime - startTime

            // 100次计算应该在合理时间内完成
            expect(duration).toBeLessThan(1000) // 1秒内完成
        })

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
        // 转充盈: X 把 X 比例的伤害视为充盈伤害并享受充盈威力加成，整体乘区 = 1 + X × 充盈威力
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
                const F = cb.calculateWeaponAttributes().充盈威力 || 0
                const base = cb.evaluateAST("[近战]")
                const converted = cb.evaluateAST("[近战]{转充盈:1}")
                // 充盈威力为 0 → 乘区 = 1 + 转充盈×F = 1，伤害不变
                expect(converted).toBeCloseTo(base * (1 + F), 3)
            })

            it("整体乘区 = 1 + 转充盈×充盈威力，作用于所有伤害分量", () => {
                const cb = buildConvertField()
                const F = cb.calculateWeaponAttributes().充盈威力 || 0
                const base = cb.evaluateAST("[近战]")
                const full = cb.evaluateAST("[近战]{转充盈:1,充盈威力:1}")
                const half = cb.evaluateAST("[近战]{转充盈:0.5,充盈威力:1}")
                expect(full).toBeCloseTo(base * (1 + (F + 1)), 3)
                expect(half).toBeCloseTo(base * (1 + 0.5 * (F + 1)), 3)
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
                const F = cb.calculateWeaponAttributes().充盈威力 || 0
                const cut = cb.evaluateAST("[近战]{转切割:1}")
                const cutFull = cb.evaluateAST("[近战]{转切割:1,转充盈:1,充盈威力:1}")
                // 转充盈 不压缩转换池 → 转切割 100% 转换保持，额外乘区 ×(1+充盈威力)
                expect(cutFull).toBeCloseTo(cut * (1 + (F + 1)), 3)
            })

            it("对纯元素同律字段（atk=all）同样生效", () => {
                const cb = buildFlora(0.5) // [圆舞]路径伤害 为 inherit+atk=all 纯元素
                const F = cb.calculateWeaponAttributes().充盈威力 || 0
                const base = cb.evaluateAST("[圆舞]路径伤害")
                const buffed = cb.evaluateAST("[圆舞]路径伤害{转充盈:1,充盈威力:1}")
                expect(buffed).toBeCloseTo(base * (1 + (F + 1)), 3)
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
    })
})
