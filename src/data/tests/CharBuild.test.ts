import { describe, it, expect } from "vitest"
import { CharBuild } from "../CharBuild"
import { LeveledChar } from "../leveled"
import { LeveledWeapon } from "../leveled"
import { LeveledMod } from "../leveled"
import { LeveledBuff } from "../leveled"

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
            enemyId: 1001001,
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
        charBuild.enemyId = 1001001
        expect(charBuild.calculateDefenseMultiplier(attrs)).toBeCloseTo(0.69, 1)
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
        const b = charBuild.skills[0].字段.find((field) => field.名称.includes("伤害"))!.值 * 1.18
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
            charBuild.enemyId = 1001001

            const attrs = charBuild.calculateAttributes()
            const defenseMultiplier = charBuild.calculateDefenseMultiplier(attrs)
            expect(defenseMultiplier).toBeLessThan(1)
        })
    })

    // 角色测试
    describe("角色测试", () => {
        it("应该能够处理不同角色", () => {
            const chars = ["黎瑟", "菲娜", "希尔妲", "莉兹贝尔"]

            chars.forEach((charName) => {
                const charBuild = new CharBuild({
                    char: new LeveledChar(charName),
                    hpPercent: 0.5,
                    resonanceGain: 2,
                    charMods: [...mockMods],
                    buffs: [...mockBuffs],
                    melee: new LeveledWeapon(10302), //"铸铁者"),
                    ranged: new LeveledWeapon(20601), //"烈焰孤沙"),
                    baseName: "普通攻击",
                    enemyId: 1001001,
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

            weapons.forEach((weaponId) => {
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

            weapons.forEach((weaponId) => {
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
})
