import { describe, it, expect } from "vitest"
import { CharBuild } from "../CharBuild"
import { LeveledChar } from "../leveled"
import { LeveledWeapon } from "../leveled"
import { LeveledMod } from "../leveled"
import { LeveledBuff } from "../leveled"

describe("CharBuild类测试", () => {
    // 创建测试用数据
    const mockMeleeWeapon = new LeveledWeapon("铸铁者")
    const mockRangedWeapon = new LeveledWeapon("烈焰孤沙")
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
            hpPercent: 0.5,
            resonanceGain: 2,
            charMods: [...mockMods],
            buffs: [...mockBuffs],
            melee: new LeveledWeapon("铸铁者"),
            ranged: new LeveledWeapon("烈焰孤沙"),
            baseName: mockMeleeWeapon.名称,
            enemyType: "小型",
            enemyLevel: 80,
            enemyResistance: 0.5,
            enemyHpType: "生命",
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

        const attackBonus = charBuild.char.攻击 || 0
        const atk = baseAtk * (3 + attackBonus)
        expect(attrs.attack).toBeCloseTo(atk, 1)

        charBuild.mods = [mod3]
        const atk2 = baseAtk * (3 + attackBonus + 0.75)
        const attrs2 = charBuild.calculateAttributes()
        // const atb = charBuild.getTotalBonus("攻击")
        // console.log(atb)
        expect(attrs2.attack).toBeCloseTo(atk2, 1)
        // 验证基础属性是否为数字
        expect(attrs.health).toBe(baseHp * 3)
        expect(attrs.shield).toBe(baseShield * 3)
        expect(attrs.defense).toBe(baseDefense * 3)
        expect(attrs.sanity).toBe(baseSanity)
    })

    // 测试其他属性计算
    it("应该能够正确计算其他属性", () => {
        const charBuild = createCharBuild()
        const attrs = charBuild.calculateAttributes()

        expect(attrs.damageIncrease).toBe(1.34)
        expect(attrs.penetration).toBe(0)
        expect(attrs.independentDamageIncrease).toBe(0)

        charBuild.buffs = []
        const attrs2 = charBuild.calculateAttributes()
        expect(attrs2.damageIncrease).toBe(0.44)
        expect(attrs2.penetration).toBe(0)
        expect(attrs2.independentDamageIncrease).toBe(0)
    })

    // 测试武器属性计算
    it("应该能够正确计算武器属性", () => {
        const charBuild = createCharBuild()
        charBuild.baseName = mockMeleeWeapon.名称
        const { weapon: meleeWeaponAttrs } = charBuild.calculateWeaponAttributes()
        charBuild.baseName = mockRangedWeapon.名称
        const { weapon: rangedWeaponAttrs } = charBuild.calculateWeaponAttributes()

        const { 基础攻击, 基础暴击, 基础暴伤, 基础触发 } = charBuild.meleeWeapon
        // 验证武器属性是否为数字
        expect(meleeWeaponAttrs!.attack).toBe(基础攻击)
        expect(meleeWeaponAttrs!.critRate).toBe(基础暴击 * 2) // 铸铁者100%暴击
        expect(meleeWeaponAttrs!.critDamage).toBe(基础暴伤)
        expect(meleeWeaponAttrs!.triggerRate).toBe(基础触发)

        const { 基础攻击: 基础远程攻击, 基础暴击: 基础远程暴击, 基础暴伤: 基础远程暴伤, 基础触发: 基础远程触发 } = charBuild.rangedWeapon
        expect(rangedWeaponAttrs!.attack).toBe(基础远程攻击)
        expect(rangedWeaponAttrs!.critRate).toBe(基础远程暴击)
        expect(rangedWeaponAttrs!.critDamage).toBe(基础远程暴伤)
        expect(rangedWeaponAttrs!.triggerRate).toBe(基础远程触发)
        // 测试MOD
        charBuild.mods = [mod4]
        charBuild.baseName = mockMeleeWeapon.名称
        const { weapon: meleeWeaponAttrs2 } = charBuild.calculateWeaponAttributes()
        expect(meleeWeaponAttrs2!.critRate).toBeCloseTo(基础暴击 * 3, 1)
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
        charBuildWithoutMod.baseName = mockMeleeWeapon.名称
        const { weapon: meleeAttrsWithoutMod } = charBuildWithoutMod.calculateWeaponAttributes()
        charBuildWithoutMod.baseName = mockRangedWeapon.名称
        const { weapon: rangedAttrsWithoutMod } = charBuildWithoutMod.calculateWeaponAttributes()

        // 计算有MOD52001时的武器属性
        charBuildWithMod.baseName = mockMeleeWeapon.名称
        const { weapon: meleeAttrsWithMod } = charBuildWithMod.calculateWeaponAttributes()
        charBuildWithMod.baseName = mockRangedWeapon.名称
        const { weapon: rangedAttrsWithMod } = charBuildWithMod.calculateWeaponAttributes()

        // 验证近战武器攻击增加了150%
        expect(meleeAttrsWithMod!.attack).toBeCloseTo(meleeAttrsWithoutMod!.attack * 2.5, 2)

        // 验证远程武器攻击不受影响
        expect(rangedAttrsWithMod!.attack).toBeCloseTo(rangedAttrsWithoutMod!.attack, 2)
    })

    // 测试独立增伤计算
    it("应该能够正确计算独立增伤", () => {
        const charBuild = createCharBuild()
        const attrs = charBuild.calculateAttributes()
        expect(attrs.independentDamageIncrease).toBeTypeOf("number")
        expect(attrs.independentDamageIncrease).toBeGreaterThanOrEqual(0)
    })

    // 测试无视防御计算
    it("应该能够正确计算无视防御", () => {
        const charBuild = createCharBuild()
        const attrs = charBuild.calculateAttributes()
        expect(attrs.ignoreDefense).toBeTypeOf("number")
        expect(attrs.ignoreDefense).toBeGreaterThanOrEqual(0)
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
        charBuild.enemyHpType = "护盾"
        expect(charBuild.calculateDefenseMultiplier(attrs)).toBe(1)
    })

    // 测试主要计算方法
    it("应该能够正确执行主要计算方法", () => {
        const charBuild = createCharBuild()
        charBuild.baseName = charBuild.skills[0].名称
        const attrs = charBuild.calculateAttributes()
        const result = charBuild.calculate()
        const atk = charBuild.char.基础攻击 * (3 + 1.25) * 1.18
        expect(charBuild.getTotalBonus("攻击")).toBe(1.25)
        expect(atk).toBeCloseTo(attrs.attack, 0)
        const b = charBuild.skills[0].伤害值 * 1.18
        const dm = charBuild.calculateDefenseMultiplier(attrs)
        // 验证结果
        expect(result).toBeCloseTo(atk * b * dm * 0.5 * (1.9 + 0.44), 0)
    })

    // 测试更改目标函数
    it("应该能够正确执行主要计算方法", () => {
        const charBuild = createCharBuild()
        charBuild.baseName = mockMeleeWeapon.名称
        charBuild.targetFunction = "每秒伤害"
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
            charBuild.targetFunction = "每秒伤害"

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
})
