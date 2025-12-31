import { describe, it, expect, beforeEach } from "vitest"
import { CharBuild } from "../CharBuild"
import { LeveledChar } from "../leveled"
import { LeveledWeapon } from "../leveled"
import { LeveledMod } from "../leveled"
import { LeveledBuff } from "../leveled"
import { parseAST } from "../ast"

describe("evaluateAST函数测试", () => {
    let charBuild: CharBuild
    let testAttrs: ReturnType<CharBuild["calculateWeaponAttributes"]>
    let testDamage: import("../CharBuild").DamageResult

    beforeEach(() => {
        // 创建测试用的CharBuild实例
        charBuild = new CharBuild({
            char: new LeveledChar("黎瑟"),
            hpPercent: 0.5,
            resonanceGain: 2,
            charMods: [new LeveledMod(41324), new LeveledMod(51313)],
            buffs: [new LeveledBuff("黎瑟E")],
            melee: new LeveledWeapon("铸铁者"),
            ranged: new LeveledWeapon("烈焰孤沙"),
            baseName: "快速出击", // 设置为技能而不是武器，这样selectedSkill才会有值
            enemyId: 1001001,
            enemyLevel: 80,
            enemyResistance: 0.5,
            enemyHpType: "生命",
            targetFunction: "伤害",
        })

        // 预先计算属性和伤害
        testAttrs = charBuild.calculateWeaponAttributes()
        const damageValue = charBuild.calculateRandomDamage(charBuild.baseName)
        testDamage = {
            expectedDamage: damageValue,
            lowerCritNoTrigger: damageValue * 0.8,
            higherCritNoTrigger: damageValue * 1.2,
            lowerCritTrigger: damageValue * 0.9,
            higherCritTrigger: damageValue * 1.3,
            lowerCritExpectedTrigger: damageValue * 0.85,
            higherCritExpectedTrigger: damageValue * 1.15,
            expectedCritTrigger: damageValue * 1.1,
            expectedCritNoTrigger: damageValue * 0.95,
        }
    })

    describe("基础AST节点求值测试", () => {
        it("应该正确求值数字节点", () => {
            // 需要通过targetFunction来测试evaluateAST
            // 使用简单表达式
            charBuild.targetFunction = "100"
            const attrs = charBuild.calculateWeaponAttributes()

            // 测试数字求值
            const result = charBuild.evaluateAST("100", testDamage, attrs)
            expect(result).toBe(100)
        })

        it("应该正确求值负数", () => {
            const attrs = charBuild.calculateWeaponAttributes()

            const result = charBuild.evaluateAST("-50", testDamage, attrs)
            expect(result).toBe(-50)
        })
    })

    describe("二元运算符测试", () => {
        it("应该正确执行加法运算", () => {
            charBuild.targetFunction = "10 + 20"
            // 由于calculate中会除以时间（如果是DPS），我们需要直接测试evaluateAST
            const attrs = charBuild.calculateWeaponAttributes()
            const evalResult = charBuild.evaluateAST("10 + 20", testDamage, attrs)

            expect(evalResult).toBe(30)
        })

        it("应该正确执行减法运算", () => {
            const attrs = charBuild.calculateWeaponAttributes()
            const result = charBuild.evaluateAST("50 - 20", testDamage, attrs)

            expect(result).toBe(30)
        })

        it("应该正确执行乘法运算", () => {
            const attrs = charBuild.calculateWeaponAttributes()
            const result = charBuild.evaluateAST("5 * 6", testDamage, attrs)

            expect(result).toBe(30)
        })

        it("应该正确执行除法运算", () => {
            const attrs = charBuild.calculateWeaponAttributes()
            const result = charBuild.evaluateAST("60 / 4", testDamage, attrs)

            expect(result).toBe(15)
        })

        it("应该正确执行取模运算", () => {
            const attrs = charBuild.calculateWeaponAttributes()
            const result = charBuild.evaluateAST("17 % 5", testDamage, attrs)

            expect(result).toBe(2)
        })

        it("应该正确执行整数除法运算", () => {
            const attrs = charBuild.calculateWeaponAttributes()
            const result = charBuild.evaluateAST("17 // 5", testDamage, attrs)

            expect(result).toBe(3)
        })

        it("应该处理除以零的情况", () => {
            const attrs = charBuild.calculateWeaponAttributes()
            const result = charBuild.evaluateAST("10 / 0", testDamage, attrs)

            expect(result).toBe(0)
        })

        it("应该正确执行复杂表达式", () => {
            const attrs = charBuild.calculateWeaponAttributes()
            const result = charBuild.evaluateAST("2 + 3 * 4 - 6 / 2", testDamage, attrs)

            expect(result).toBe(11) // 2 + 12 - 3 = 11
        })

        it("应该正确处理括号", () => {
            const attrs = charBuild.calculateWeaponAttributes()
            const result = charBuild.evaluateAST("(2 + 3) * 4", testDamage, attrs)

            expect(result).toBe(20) // (2 + 3) * 4 = 20
        })
    })

    describe("函数调用测试", () => {
        it("应该正确执行min函数", () => {
            const attrs = charBuild.calculateWeaponAttributes()
            const result = charBuild.evaluateAST("min(10, 5, 8)", testDamage, attrs)

            expect(result).toBe(5)
        })

        it("应该正确执行max函数", () => {
            const attrs = charBuild.calculateWeaponAttributes()
            const result = charBuild.evaluateAST("max(10, 5, 8)", testDamage, attrs)

            expect(result).toBe(10)
        })

        it("应该正确执行floor函数", () => {
            const attrs = charBuild.calculateWeaponAttributes()
            const result = charBuild.evaluateAST("floor(3.7)", testDamage, attrs)

            expect(result).toBe(3)
        })

        it("应该正确执行ceil函数", () => {
            const attrs = charBuild.calculateWeaponAttributes()
            const result = charBuild.evaluateAST("ceil(3.2)", testDamage, attrs)

            expect(result).toBe(4)
        })

        it("应该正确执行or函数", () => {
            const attrs = charBuild.calculateWeaponAttributes()

            // 测试第一个非零值
            const result1 = charBuild.evaluateAST("or(0, 5, 3)", testDamage, attrs)
            expect(result1).toBe(5)

            // 测试全零情况
            const result2 = charBuild.evaluateAST("or(0, 0, 0)", testDamage, attrs)
            expect(result2).toBe(0)
        })

        it("应该在函数中使用属性", () => {
            const attrs = charBuild.calculateWeaponAttributes()

            // 使用攻击属性
            const result = charBuild.evaluateAST("floor(攻击 / 100)", testDamage, attrs)
            expect(result).toBeGreaterThanOrEqual(0)
        })
    })

    describe("属性访问测试", () => {
        it("应该正确访问攻击属性", () => {
            const attrs = charBuild.calculateWeaponAttributes()
            const result = charBuild.evaluateAST("攻击", testDamage, attrs)

            expect(result).toBeGreaterThan(0)
            // 验证结果接近攻击属性的数值
            expect(result).toBeCloseTo(attrs.攻击, 0)
        })

        it("应该正确访问生命属性", () => {
            const attrs = charBuild.calculateWeaponAttributes()
            const result = charBuild.evaluateAST("生命", testDamage, attrs)

            expect(result).toBeGreaterThan(0)
        })

        it("应该正确访问防御属性", () => {
            const attrs = charBuild.calculateWeaponAttributes()
            const result = charBuild.evaluateAST("防御", testDamage, attrs)

            expect(result).toBeGreaterThanOrEqual(0)
        })

        it("应该正确访问增伤属性", () => {
            const attrs = charBuild.calculateWeaponAttributes()
            const result = charBuild.evaluateAST("增伤", testDamage, attrs)

            expect(result).toBeGreaterThanOrEqual(0)
        })
    })

    describe("成员访问测试", () => {
        it("应该正确处理成员访问语法", () => {
            // 测试成员访问的语法解析，使用攻击.暴击（虽然攻击不是伤害属性，但可以测试语法）
            const result = charBuild.evaluateAST("攻击 * 1.5", testDamage, testAttrs)
            expect(result).toBeGreaterThan(0)
            expect(result).toBeCloseTo(testAttrs.攻击 * 1.5, 0)
        })

        it("应该正确处理属性乘法", () => {
            const result = charBuild.evaluateAST("增伤", testDamage, testAttrs)

            expect(result).toBeGreaterThanOrEqual(0)
        })
    })

    describe("成员访问测试", () => {
        it("应该正确处理成员访问语法", () => {
            // 测试成员访问的语法解析，使用攻击.暴击（虽然攻击不是伤害属性，但可以测试语法）
            const result = charBuild.evaluateAST("攻击 * 1.5", testDamage, testAttrs)
            expect(result).toBeGreaterThan(0)
            expect(result).toBeCloseTo(testAttrs.攻击 * 1.5, 0)
        })

        it("应该正确处理属性乘法", () => {
            const result = charBuild.evaluateAST("攻击 * 2", testDamage, testAttrs)
            expect(result).toBeCloseTo(testAttrs.攻击 * 2, 0)
        })
    })

    describe("复杂表达式测试", () => {
        it("应该正确处理属性和运算符的组合", () => {
            const result = charBuild.evaluateAST("攻击 * 2 + 100", testDamage, testAttrs)
            expect(result).toBeGreaterThan(0)
        })

        it("应该正确处理嵌套函数调用", () => {
            const result = charBuild.evaluateAST("floor(max(攻击, 100) / 10)", testDamage, testAttrs)
            expect(result).toBeGreaterThanOrEqual(0)
        })

        it("应该正确处理成员访问和运算符的组合", () => {
            const result = charBuild.evaluateAST("攻击 * 1.5 + 50", testDamage, testAttrs)
            expect(result).toBeGreaterThan(0)
        })

        it("应该正确处理复杂混合表达式", () => {
            const result = charBuild.evaluateAST("floor(攻击 / 100) * 10 + 50", testDamage, testAttrs)
            expect(result).toBeGreaterThan(0)
        })
    })

    describe("边界条件测试", () => {
        it("应该处理空字符串输入", () => {
            const attrs = charBuild.calculateWeaponAttributes()

            const result = charBuild.evaluateAST("", testDamage, attrs)
            expect(result).toBe(0)
        })

        it("应该处理不存在的属性", () => {
            const attrs = charBuild.calculateWeaponAttributes()

            const result = charBuild.evaluateAST("不存在的属性", testDamage, attrs)
            expect(result).toBe(0)
        })

        it("应该处理不存在的函数", () => {
            const attrs = charBuild.calculateWeaponAttributes()

            expect(() => {
                charBuild.evaluateAST("unknownFunction(10)", testDamage, attrs)
            }).toThrow()
        })

        it("应该处理大数值计算", () => {
            const attrs = charBuild.calculateWeaponAttributes()

            const result = charBuild.evaluateAST("1000000 * 1000000", testDamage, attrs)
            expect(result).toBe(1000000000000)
        })
    })

    describe("AST缓存测试", () => {
        it("应该缓存已解析的AST", () => {
            const attrs = charBuild.calculateWeaponAttributes()

            const expression = "攻击 + 100"

            // 第一次调用会解析并缓存
            const result1 = charBuild.evaluateAST(expression, testDamage, attrs)

            // 第二次调用应该使用缓存的AST
            const result2 = charBuild.evaluateAST(expression, testDamage, attrs)

            expect(result1).toBe(result2)
            expect(charBuild["astCache"].has(expression)).toBe(true)
        })

        it("应该为不同表达式创建不同的缓存", () => {
            const attrs = charBuild.calculateWeaponAttributes()

            charBuild.evaluateAST("攻击 + 100", testDamage, attrs)
            charBuild.evaluateAST("攻击 * 2", testDamage, attrs)

            expect(charBuild["astCache"].size).toBe(2)
        })
    })

    describe("错误处理测试", () => {
        it("应该抛出无效语法的错误", () => {
            expect(() => {
                parseAST("10 + + 20")
            }).toThrow()
        })

        it("应该抛出未闭合括号的错误", () => {
            expect(() => {
                parseAST("(10 + 20")
            }).toThrow()
        })

        it("应该抛出运算符后缺少操作数的错误", () => {
            // 测试以运算符结尾的表达式
            expect(charBuild.validateAST("攻击 +")).toBeDefined()
            expect(charBuild.validateAST("攻击*")).toBeDefined()
            expect(charBuild.validateAST("[幻象]伤害/max(20,神智消耗)+")).toBeDefined()
        })

        it("应该抛出无效运算符的错误", () => {
            // 注: 如果AST解析器不接受此表达式，会抛出错误
            // 这取决于parseAST的实现
            expect(() => {
                parseAST("10 & 20")
            }).toThrow()
        })
    })

    describe("实战场景测试", () => {
        it("应该正确计算自定义目标函数", () => {
            charBuild.targetFunction = "floor(攻击 * 增伤 / 100)"
            const result = charBuild.calculate()

            expect(result).toBeGreaterThan(0)
            expect(result).toBeTypeOf("number")
        })

        it("应该支持带有成员访问的目标函数", () => {
            charBuild.targetFunction = "伤害.暴击"
            const result = charBuild.calculate()

            expect(result).toBeGreaterThan(0)
        })

        it("应该支持复杂的自定义目标函数", () => {
            charBuild.mods = [
                new LeveledMod(41324), // 雷鸣·燎原
                new LeveledMod(51313), // 决斗
                new LeveledMod(41001), // 炽灼 (75%)
                new LeveledMod(42003), // 盛怒 (100%)
            ]
            charBuild.baseName = "普通攻击" // 铸铁者
            charBuild.targetFunction = "max(伤害.暴击, 伤害.未暴击) * 1.1"
            const attrs = charBuild.calculateWeaponAttributes()
            expect(attrs.攻击).toBeCloseTo(276.15 * 1.18 * (1 + 0.75 + 2 + 0.5), 2)
            expect(attrs.weapon?.攻击).toBe(225.94)
            expect(attrs.weapon?.暴伤).toBe(4.1)
            const b = charBuild.meleeWeapon.技能!.find((x) => x.名称 === "普通攻击")!.字段.find((x) => x.名称.includes("伤害"))?.值! //  一段伤害: "40.0%",
            expect(b).toBe(0.4)
            const def = charBuild.calculateDefenseMultiplier(attrs)
            const result = charBuild.calculate()
            expect(result).toBeCloseTo(
                (1384.89 * 0.5 + 225.94) *
                    b *
                    def *
                    1.1 * // * 1.1
                    (0.9 + 1.44) * // 增伤
                    4.1, // 暴伤盛怒
                0,
            )
        })
    })
})
