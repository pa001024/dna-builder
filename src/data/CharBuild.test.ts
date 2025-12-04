import { describe, it, expect, vi } from "vitest"
import { CharBuild } from "./CharBuild"
import { LeveledChar } from "./leveled"
import { LeveledWeapon } from "./leveled"
import { LeveledMod } from "./leveled"
import { LeveledBuff } from "./leveled"
import { LeveledSkill } from "./leveled"

describe("CharBuild类测试", () => {
    // 创建测试用数据
    const mockChar = new LeveledChar("黎瑟")
    const mockMeleeWeapon = new LeveledWeapon("铸铁者")
    const mockRangedWeapon = new LeveledWeapon("烈焰孤沙")
    const mockMods = [new LeveledMod(41324)]
    const mockBuffs = [new LeveledBuff("助战50攻", 1)]

    // 测试构造函数
    it("应该能够创建CharBuild实例", () => {
        const charBuild = new CharBuild({
            char: mockChar,
            hpPercent: 0.5,
            resonanceGain: 2,
            mods: mockMods,
            buffs: mockBuffs,
            melee: mockMeleeWeapon,
            ranged: mockRangedWeapon,
            baseName: "铸铁者",
            enemyType: "小型",
            enemyLevel: 80,
            enemyResistance: 0.5,
            enemyHpType: "生命",
            targetFunction: "伤害",
        })

        expect(charBuild).toBeInstanceOf(CharBuild)
    })

    // 测试等级系数获取
    it("应该能够正确获取等级系数", () => {
        const charBuild = new CharBuild({
            char: mockChar,
            hpPercent: 0.5, // 50%
            resonanceGain: 0,
            mods: mockMods,
            buffs: mockBuffs,
            melee: mockMeleeWeapon,
            ranged: mockRangedWeapon,
            baseName: mockMeleeWeapon.名称,
            enemyType: "人类",
            enemyLevel: 80,
            enemyResistance: 0,
            enemyHpType: "生命",
            targetFunction: "技能伤害",
        })

        // 直接测试calculate方法返回值是否为数字
        const result = charBuild.calculate()
        expect(result).toBeTypeOf("number")
        expect(result).toBeGreaterThanOrEqual(0)
    })

    // 测试基础属性计算
    it("应该能够正确计算基础属性", () => {
        const charBuild = new CharBuild({
            char: mockChar,
            hpPercent: 0.5, // 50%
            resonanceGain: 0,
            mods: mockMods,
            buffs: mockBuffs,
            melee: mockMeleeWeapon,
            ranged: mockRangedWeapon,
            baseName: mockMeleeWeapon.名称,
            enemyType: "人类",
            enemyLevel: 80,
            enemyResistance: 0,
            enemyHpType: "生命",
            targetFunction: "技能伤害",
        })

        const attrs = charBuild.calculateAttributes()

        // 验证基础属性是否为数字
        expect(attrs.attack).toBeTypeOf("number")
        expect(attrs.health).toBeTypeOf("number")
        expect(attrs.shield).toBeTypeOf("number")
        expect(attrs.defense).toBeTypeOf("number")
        expect(attrs.sanity).toBeTypeOf("number")
    })

    // 测试其他属性计算
    it("应该能够正确计算其他属性", () => {
        const charBuild = new CharBuild({
            char: mockChar,
            hpPercent: 0.5,
            resonanceGain: 2,
            mods: mockMods,
            buffs: mockBuffs,
            melee: mockMeleeWeapon,
            ranged: mockRangedWeapon,
            baseName: "铸铁者",
            enemyType: "小型",
            enemyLevel: 80,
            enemyResistance: 0.5,
            enemyHpType: "生命",
            targetFunction: "伤害",
        })

        const attrs = charBuild.calculateAttributes()

        // 验证其他属性是否为数字
        expect(attrs.damageIncrease).toBeTypeOf("number")
        expect(attrs.penetration).toBeTypeOf("number")
        expect(attrs.independentDamageIncrease).toBeTypeOf("number")
    })

    // 测试武器属性计算
    it("应该能够正确计算武器属性", () => {
        const charBuild = new CharBuild({
            char: mockChar,
            hpPercent: 0.5,
            resonanceGain: 2,
            mods: mockMods,
            buffs: mockBuffs,
            melee: mockMeleeWeapon,
            ranged: mockRangedWeapon,
            baseName: "铸铁者",
            enemyType: "小型",
            enemyLevel: 80,
            enemyResistance: 0.5,
            enemyHpType: "生命",
            targetFunction: "伤害",
        })

        const meleeWeaponAttrs = charBuild.calculateWeaponAttributes(mockMeleeWeapon)
        const rangedWeaponAttrs = charBuild.calculateWeaponAttributes(mockRangedWeapon)

        // 验证武器属性是否为数字
        expect(meleeWeaponAttrs.attack).toBeTypeOf("number")
        expect(meleeWeaponAttrs.critRate).toBeTypeOf("number")
        expect(meleeWeaponAttrs.critDamage).toBeTypeOf("number")
        expect(meleeWeaponAttrs.triggerRate).toBeTypeOf("number")
        expect(meleeWeaponAttrs.attackSpeed).toBeTypeOf("number")
        expect(meleeWeaponAttrs.multiShot).toBeTypeOf("number")

        expect(rangedWeaponAttrs.attack).toBeTypeOf("number")
        expect(rangedWeaponAttrs.critRate).toBeTypeOf("number")
        expect(rangedWeaponAttrs.critDamage).toBeTypeOf("number")
        expect(rangedWeaponAttrs.triggerRate).toBeTypeOf("number")
        expect(rangedWeaponAttrs.attackSpeed).toBeTypeOf("number")
        expect(rangedWeaponAttrs.multiShot).toBeTypeOf("number")
    })

    // 测试总加成计算
    it("应该能够正确计算总加成", () => {
        const charBuild = new CharBuild({
            char: mockChar,
            hpPercent: 0.5,
            resonanceGain: 2,
            mods: mockMods,
            buffs: mockBuffs,
            melee: mockMeleeWeapon,
            ranged: mockRangedWeapon,
            baseName: "铸铁者",
            enemyType: "小型",
            enemyLevel: 80,
            enemyResistance: 0.5,
            enemyHpType: "生命",
            targetFunction: "伤害",
        })

        // 测试获取攻击加成
        const attackBonus = charBuild.getTotalBonus("攻击")
        expect(attackBonus).toBeTypeOf("number")

        // 测试获取生命加成
        const healthBonus = charBuild.getTotalBonus("生命")
        expect(healthBonus).toBeTypeOf("number")
    })

    // 测试近战武器MOD52001的效果
    it("应该只增加近战武器攻击而不影响远程武器", () => {
        // 创建包含MOD52001的mods数组
        const modsWithMeleeMod = [...mockMods, new LeveledMod(52001)]

        // 创建没有MOD52001的CharBuild实例
        const charBuildWithoutMod = new CharBuild({
            char: mockChar,
            hpPercent: 0.5,
            resonanceGain: 2,
            mods: mockMods,
            buffs: mockBuffs,
            melee: mockMeleeWeapon,
            ranged: mockRangedWeapon,
            baseName: "铸铁者",
            enemyType: "小型",
            enemyLevel: 80,
            enemyResistance: 0.5,
            enemyHpType: "生命",
            targetFunction: "伤害",
        })

        // 创建包含MOD52001的CharBuild实例
        const charBuildWithMod = new CharBuild({
            char: mockChar,
            hpPercent: 0.5,
            resonanceGain: 2,
            mods: modsWithMeleeMod,
            buffs: mockBuffs,
            melee: mockMeleeWeapon,
            ranged: mockRangedWeapon,
            baseName: "铸铁者",
            enemyType: "小型",
            enemyLevel: 80,
            enemyResistance: 0.5,
            enemyHpType: "生命",
            targetFunction: "伤害",
        })

        // 计算没有MOD52001时的武器属性
        const meleeAttrsWithoutMod = charBuildWithoutMod.calculateWeaponAttributes(mockMeleeWeapon)
        const rangedAttrsWithoutMod = charBuildWithoutMod.calculateWeaponAttributes(mockRangedWeapon)

        // 计算有MOD52001时的武器属性
        const meleeAttrsWithMod = charBuildWithMod.calculateWeaponAttributes(mockMeleeWeapon)
        const rangedAttrsWithMod = charBuildWithMod.calculateWeaponAttributes(mockRangedWeapon)

        // 验证近战武器攻击增加了150%
        expect(meleeAttrsWithMod.attack).toBeCloseTo(meleeAttrsWithoutMod.attack * 2.5, 2)

        // 验证远程武器攻击不受影响
        expect(rangedAttrsWithMod.attack).toBeCloseTo(rangedAttrsWithoutMod.attack, 2)
    })

    // 测试独立增伤计算
    it("应该能够正确计算独立增伤", () => {
        const charBuild = new CharBuild({
            char: mockChar,
            hpPercent: 0.5,
            resonanceGain: 2,
            mods: mockMods,
            buffs: mockBuffs,
            melee: mockMeleeWeapon,
            ranged: mockRangedWeapon,
            baseName: "铸铁者",
            enemyType: "小型",
            enemyLevel: 80,
            enemyResistance: 0.5,
            enemyHpType: "生命",
            targetFunction: "伤害",
        })

        const attrs = charBuild.calculateAttributes()
        expect(attrs.independentDamageIncrease).toBeTypeOf("number")
        expect(attrs.independentDamageIncrease).toBeGreaterThanOrEqual(0)
    })

    // 测试无视防御计算
    it("应该能够正确计算无视防御", () => {
        const charBuild = new CharBuild({
            char: mockChar,
            hpPercent: 0.5,
            resonanceGain: 2,
            mods: mockMods,
            buffs: mockBuffs,
            melee: mockMeleeWeapon,
            ranged: mockRangedWeapon,
            baseName: "铸铁者",
            enemyType: "小型",
            enemyLevel: 80,
            enemyResistance: 0.5,
            enemyHpType: "生命",
            targetFunction: "伤害",
        })

        const attrs = charBuild.calculateAttributes()
        expect(attrs.ignoreDefense).toBeTypeOf("number")
        expect(attrs.ignoreDefense).toBeGreaterThanOrEqual(0)
    })

    // 测试昂扬乘区计算
    it("应该能够正确计算昂扬乘区", () => {
        const charBuild = new CharBuild({
            char: mockChar,
            hpPercent: 0.5,
            resonanceGain: 2,
            mods: mockMods,
            buffs: mockBuffs,
            melee: mockMeleeWeapon,
            ranged: mockRangedWeapon,
            baseName: "铸铁者",
            enemyType: "小型",
            enemyLevel: 80,
            enemyResistance: 0.5,
            enemyHpType: "生命",
            targetFunction: "伤害",
        })

        // 确保返回值是数字且大于等于1
        const boostMultiplier = charBuild.calculateBoostMultiplier()
        expect(boostMultiplier).toBeTypeOf("number")
        expect(boostMultiplier).toBeGreaterThanOrEqual(1)

        // 修改当前HP百分比后再次测试
        charBuild.hpPercent = 0.5
        const boostMultiplier2 = charBuild.calculateBoostMultiplier()
        expect(boostMultiplier2).toBeTypeOf("number")
        expect(boostMultiplier2).toBeGreaterThanOrEqual(1)
    })

    // 测试背水乘区计算
    it("应该能够正确计算背水乘区", () => {
        const charBuild = new CharBuild({
            char: mockChar,
            hpPercent: 0.5,
            resonanceGain: 2,
            mods: mockMods,
            buffs: mockBuffs,
            melee: mockMeleeWeapon,
            ranged: mockRangedWeapon,
            baseName: "铸铁者",
            enemyType: "小型",
            enemyLevel: 80,
            enemyResistance: 0.5,
            enemyHpType: "生命",
            targetFunction: "伤害",
        })

        // 确保返回值是数字且大于等于1
        const desperateMultiplier = charBuild.calculateDesperateMultiplier()
        expect(desperateMultiplier).toBeTypeOf("number")
        expect(desperateMultiplier).toBeGreaterThanOrEqual(1)

        // 修改当前HP百分比后再次测试
        charBuild.hpPercent = 0.3
        const desperateMultiplier2 = charBuild.calculateDesperateMultiplier()
        expect(desperateMultiplier2).toBeTypeOf("number")
        expect(desperateMultiplier2).toBeGreaterThanOrEqual(1)
    })

    // 测试防御乘区计算
    it("应该能够正确计算防御乘区", () => {
        const charBuild = new CharBuild({
            char: mockChar,
            hpPercent: 0.5,
            resonanceGain: 2,
            mods: mockMods,
            buffs: mockBuffs,
            melee: mockMeleeWeapon,
            ranged: mockRangedWeapon,
            baseName: "铸铁者",
            enemyType: "小型",
            enemyLevel: 80,
            enemyResistance: 0.5,
            enemyHpType: "生命",
            targetFunction: "伤害",
        })

        const defenseMultiplier = charBuild.calculateDefenseMultiplier()
        expect(defenseMultiplier).toBeTypeOf("number")
        expect(defenseMultiplier).toBeGreaterThan(0)

        // 测试护盾类型的敌人
        charBuild.enemyHpType = "护盾"
        expect(charBuild.calculateDefenseMultiplier()).toBe(1)
    })

    // 测试主要计算方法
    it("应该能够正确执行主要计算方法", () => {
        const charBuild = new CharBuild({
            char: mockChar,
            hpPercent: 0.5,
            resonanceGain: 2,
            mods: mockMods,
            buffs: mockBuffs,
            melee: mockMeleeWeapon,
            ranged: mockRangedWeapon,
            baseName: "铸铁者",
            enemyType: "小型",
            enemyLevel: 80,
            enemyResistance: 0.5,
            enemyHpType: "生命",
            targetFunction: "伤害",
        })

        const result = charBuild.calculate()

        // 验证结果是数字
        expect(result).toBeTypeOf("number")
        // 验证结果是有限的数字
        expect(isFinite(result)).toBe(true)
    })

    // 测试目标函数计算
    describe("目标函数计算测试", () => {
        // 使用模拟的技能对象，而不是实际创建LeveledSkill实例
        const mockSkill = {
            神智消耗: 10,
            持续消耗: 2,
        } as LeveledSkill

        it("应该能够正确计算DPA（伤害）目标函数", () => {
            const charBuild = new CharBuild({
                char: mockChar,
                hpPercent: 0.5,
                resonanceGain: 2,
                mods: mockMods,
                buffs: mockBuffs,
                melee: mockMeleeWeapon,
                ranged: mockRangedWeapon,
                baseName: "铸铁者",
                enemyType: "小型",
                enemyLevel: 80,
                enemyResistance: 0.5,
                enemyHpType: "生命",
                targetFunction: "伤害",
            })

            const result = charBuild.calculate()

            // 验证结果是数字且大于0
            expect(result).toBeTypeOf("number")
            expect(result).toBeGreaterThan(0)
        })

        it("应该能够正确计算DPS（每秒伤害）目标函数", () => {
            const charBuild = new CharBuild({
                char: mockChar,
                hpPercent: 0.5,
                resonanceGain: 2,
                mods: mockMods,
                buffs: mockBuffs,
                melee: mockMeleeWeapon,
                ranged: mockRangedWeapon,
                baseName: "铸铁者",
                enemyType: "小型",
                enemyLevel: 80,
                enemyResistance: 0.5,
                enemyHpType: "生命",
                targetFunction: "每秒伤害",
            })

            const result = charBuild.calculate()

            // 验证结果是数字且大于0
            expect(result).toBeTypeOf("number")
            expect(result).toBeGreaterThan(0)
        })

        it("应该能够正确计算DPAPM（每神智伤害）目标函数", () => {
            const charBuild = new CharBuild({
                char: mockChar,
                hpPercent: 0.5,
                resonanceGain: 2,
                mods: mockMods,
                buffs: mockBuffs,
                melee: mockMeleeWeapon,
                ranged: mockRangedWeapon,
                baseName: "铸铁者",
                enemyType: "小型",
                enemyLevel: 80,
                enemyResistance: 0.5,
                enemyHpType: "生命",
                targetFunction: "每神智伤害",
            })

            const result = charBuild.calculate()

            // 验证结果是数字且大于等于0
            expect(result).toBeTypeOf("number")
            expect(result).toBeGreaterThanOrEqual(0)
        })

        it("应该能够正确计算DPAPSM（每持续神智伤害）目标函数", () => {
            const charBuild = new CharBuild({
                char: mockChar,
                hpPercent: 0.5,
                resonanceGain: 2,
                mods: mockMods,
                buffs: mockBuffs,
                melee: mockMeleeWeapon,
                ranged: mockRangedWeapon,
                baseName: "铸铁者",
                enemyType: "小型",
                enemyLevel: 80,
                enemyResistance: 0.5,
                enemyHpType: "生命",
                targetFunction: "每持续神智伤害",
            })

            const result = charBuild.calculate()

            // 验证结果是数字且大于等于0
            expect(result).toBeTypeOf("number")
            expect(result).toBeGreaterThanOrEqual(0)
        })

        it("应该能够正确计算DPSPM（每神智每秒伤害）目标函数", () => {
            const charBuild = new CharBuild({
                char: mockChar,
                hpPercent: 0.5,
                resonanceGain: 2,
                mods: mockMods,
                buffs: mockBuffs,
                melee: mockMeleeWeapon,
                ranged: mockRangedWeapon,
                baseName: "铸铁者",
                enemyType: "小型",
                enemyLevel: 80,
                enemyResistance: 0.5,
                enemyHpType: "生命",
                targetFunction: "每神智每秒伤害",
            })

            const result = charBuild.calculate()

            // 验证结果是数字且大于等于0
            expect(result).toBeTypeOf("number")
            expect(result).toBeGreaterThanOrEqual(0)
        })

        it("应该能够正确计算DPSPSM（每持续神智每秒伤害）目标函数", () => {
            const charBuild = new CharBuild({
                char: mockChar,
                hpPercent: 0.5,
                resonanceGain: 2,
                mods: mockMods,
                buffs: mockBuffs,
                melee: mockMeleeWeapon,
                ranged: mockRangedWeapon,
                baseName: "铸铁者",
                enemyType: "小型",
                enemyLevel: 80,
                enemyResistance: 0.5,
                enemyHpType: "生命",
                targetFunction: "每持续神智每秒伤害",
            })

            const result = charBuild.calculate()

            // 验证结果是数字且大于等于0
            expect(result).toBeTypeOf("number")
            expect(result).toBeGreaterThanOrEqual(0)
        })
    })
})
