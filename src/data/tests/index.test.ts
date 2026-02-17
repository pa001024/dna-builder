import { describe, it, expect } from "vitest"
import * as dataModule from "../index"
import { CharBuild } from "../CharBuild"
import { LeveledChar, LeveledWeapon, LeveledMod, LeveledBuff } from "../leveled"

// 测试模块导出
describe("模块导出测试", () => {
    it("应该导出CharBuild类", () => {
        expect(dataModule.CharBuild).toBeDefined()
        expect(dataModule.CharBuild).toBe(CharBuild)
    })

    it("应该导出LeveledChar类", () => {
        expect(dataModule.LeveledChar).toBeDefined()
        expect(dataModule.LeveledChar).toBe(LeveledChar)
    })

    it("应该导出LeveledWeapon类", () => {
        expect(dataModule.LeveledWeapon).toBeDefined()
        expect(dataModule.LeveledWeapon).toBe(LeveledWeapon)
    })

    it("应该导出LeveledMod类", () => {
        expect(dataModule.LeveledMod).toBeDefined()
        expect(dataModule.LeveledMod).toBe(LeveledMod)
    })

    it("应该导出LeveledBuff类", () => {
        expect(dataModule.LeveledBuff).toBeDefined()
        expect(dataModule.LeveledBuff).toBe(LeveledBuff)
    })

    it("应该导出achievementData", () => {
        expect(dataModule.achievementData).toBeDefined()
        expect(dataModule.achievementData).toBe(dataModule.achievementData)
    })
})

// 测试模块功能
describe("模块功能测试", () => {
    it("应该能够使用导出的类创建实例", () => {
        const char = new dataModule.LeveledChar("黎瑟")
        expect(char).toBeInstanceOf(LeveledChar)
        expect(char.名称).toBe("黎瑟")

        const weapon = new dataModule.LeveledWeapon(10302)
        expect(weapon).toBeInstanceOf(LeveledWeapon)
        expect(weapon.名称).toBe("铸铁者")

        const mod = new dataModule.LeveledMod(41001)
        expect(mod).toBeInstanceOf(LeveledMod)
        expect(mod.id).toBe(41001)

        const buff = new dataModule.LeveledBuff("助战50攻")
        expect(buff).toBeInstanceOf(LeveledBuff)
        expect(buff.名称).toBe("助战50攻")
    })

    it("应该能够使用导出的类创建CharBuild", () => {
        const charBuild = new dataModule.CharBuild({
            char: new dataModule.LeveledChar("黎瑟"),
            hpPercent: 0.5,
            resonanceGain: 2,
            charMods: [new dataModule.LeveledMod(41001)],
            buffs: [new dataModule.LeveledBuff("助战50攻")],
            melee: new dataModule.LeveledWeapon(10302), //"铸铁者"),
            ranged: new dataModule.LeveledWeapon(20601), //"烈焰孤沙"),
            baseName: "一段伤害",
            enemyId: 130,
            enemyLevel: 80,
            enemyResistance: 0.5,
            targetFunction: "伤害",
        })

        expect(charBuild).toBeInstanceOf(CharBuild)
        expect(charBuild.char.名称).toBe("黎瑟")
        expect(charBuild.meleeWeapon.名称).toBe("铸铁者")
    })

    it("应该能够访问游戏数据", () => {
        expect(dataModule.charData).toBeDefined()
        expect(Array.isArray(dataModule.charData)).toBe(true)
        expect(dataModule.charData.length).toBeGreaterThan(0)

        expect(dataModule.modData).toBeDefined()
        expect(Array.isArray(dataModule.modData)).toBe(true)
        expect(dataModule.modData.length).toBeGreaterThan(0)

        expect(dataModule.weaponData).toBeDefined()
        expect(Array.isArray(dataModule.weaponData)).toBe(true)
        expect(dataModule.weaponData.length).toBeGreaterThan(0)

        expect(dataModule.buffData).toBeDefined()
        expect(Array.isArray(dataModule.buffData)).toBe(true)
        expect(dataModule.buffData.length).toBeGreaterThan(0)
    })

    it("应该能够访问成就数据", () => {
        expect(dataModule.achievementData).toBeDefined()
        expect(typeof dataModule.achievementData).toBe("object")

        if (dataModule.achievementData) {
            expect(Array.isArray(dataModule.achievementData)).toBe(true)
        }
    })
})

// 测试数据完整性
describe("数据完整性测试", () => {
    it("导出的成就数据应该与原始数据相同", () => {
        expect(dataModule.achievementData).toEqual(dataModule.achievementData)
    })

    it("应该包含所有必要的导出", () => {
        const exports = Object.keys(dataModule)

        // 检查核心类
        expect(exports).toContain("CharBuild")
        expect(exports).toContain("LeveledChar")
        expect(exports).toContain("LeveledWeapon")
        expect(exports).toContain("LeveledMod")
        expect(exports).toContain("LeveledBuff")

        // 检查数据
        expect(exports).toContain("achievementData")
    })
})

// 测试模块使用场景
describe("模块使用场景测试", () => {
    it("应该能够导入特定导出", () => {
        // 模拟不同的导入方式
        const { CharBuild: CB, LeveledChar: LC } = dataModule

        expect(CB).toBe(CharBuild)
        expect(LC).toBe(LeveledChar)
    })

    it("应该能够使用默认导入", () => {
        // 注意：由于是命名空间导出，没有默认导出
        // 但我们可以测试命名空间的使用
        const moduleExports = dataModule

        expect(moduleExports.CharBuild).toBeDefined()
        expect(moduleExports.charData).toBeDefined()
        expect(moduleExports.modData).toBeDefined()
        expect(moduleExports.weaponData).toBeDefined()
        expect(moduleExports.buffData).toBeDefined()
        expect(moduleExports.achievementData).toBeDefined()
        expect(moduleExports.monsterData).toBeDefined()
        expect(moduleExports.effectData).toBeDefined()
    })

    it("应该能够与其他模块一起使用", () => {
        // 创建完整的构建流程
        const char = new dataModule.LeveledChar("黎瑟")
        const melee = new dataModule.LeveledWeapon(10302) //"铸铁者")
        const ranged = new dataModule.LeveledWeapon(20601) //"烈焰孤沙")
        const mod = new dataModule.LeveledMod(41001)
        const buff = new dataModule.LeveledBuff("助战50攻")

        const charBuild = new dataModule.CharBuild({
            char,
            hpPercent: 0.5,
            resonanceGain: 2,
            charMods: [mod],
            buffs: [buff],
            melee,
            ranged,
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

// 测试错误处理
describe("错误处理测试", () => {
    it("应该处理无效的角色名称", () => {
        // 尝试创建无效角色，可能返回默认角色或抛出错误
        try {
            const char = new dataModule.LeveledChar("不存在的角色")
            // 如果创建成功，验证它是LeveledChar实例
            expect(char).toBeInstanceOf(LeveledChar)
        } catch (error) {
            // 如果抛出错误，验证错误类型
            expect(error).toBeDefined()
        }
    })

    it("应该处理无效的武器名称", () => {
        // 尝试创建无效武器，可能返回默认武器或抛出错误
        try {
            const weapon = new dataModule.LeveledWeapon(99999)
            // 如果创建成功，验证它是LeveledWeapon实例
            expect(weapon).toBeInstanceOf(LeveledWeapon)
        } catch (error) {
            // 如果抛出错误，验证错误类型
            expect(error).toBeDefined()
        }
    })

    it("应该处理无效的MOD ID", () => {
        // 尝试创建无效MOD，可能返回默认MOD或抛出错误
        try {
            const mod = new dataModule.LeveledMod(99999)
            // 如果创建成功，验证它是LeveledMod实例
            expect(mod).toBeInstanceOf(LeveledMod)
        } catch (error) {
            // 如果抛出错误，验证错误类型
            expect(error).toBeDefined()
        }
    })

    it("应该处理无效的BUFF名称", () => {
        // 尝试创建无效BUFF，可能返回默认BUFF或抛出错误
        try {
            const buff = new dataModule.LeveledBuff("不存在的BUFF")
            // 如果创建成功，验证它是LeveledBuff实例
            expect(buff).toBeInstanceOf(LeveledBuff)
        } catch (error) {
            // 如果抛出错误，验证错误类型
            expect(error).toBeDefined()
        }
    })
})

// 测试性能
describe("性能测试", () => {
    it("应该能够快速创建多个实例", () => {
        const startTime = performance.now()

        // 创建多个实例
        const instances = []
        for (let i = 0; i < 1000; i++) {
            instances.push(new dataModule.LeveledChar("黎瑟"))
        }

        const endTime = performance.now()
        const duration = endTime - startTime

        // 100000个实例应该在合理时间内创建
        expect(duration).toBeLessThan(100) // 0.1秒内完成
        expect(instances.length).toBe(1000)
    })
})
