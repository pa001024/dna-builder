import { beforeEach, describe, expect, it } from "vitest"
import {
    type ASTBinary,
    type ASTFunction,
    type ASTMemberAccess,
    type ASTProperty,
    type ASTTemporaryAttributes,
    type ASTUnary,
    parseAST,
} from "../ast"
import { CharBuild } from "../CharBuild"
import { LeveledBuff, LeveledChar, LeveledMod, LeveledWeapon } from "../leveled"

describe("evaluateAST函数测试", () => {
    let charBuild: CharBuild
    let testAttrs: ReturnType<CharBuild["calculateWeaponAttributes"]>

    beforeEach(() => {
        // 创建测试用的CharBuild实例
        charBuild = new CharBuild({
            char: new LeveledChar("黎瑟"),
            hpPercent: 0.5,
            resonanceGain: 2,
            charMods: [new LeveledMod(41324), new LeveledMod(51313)],
            buffs: [new LeveledBuff("黎瑟E")],
            melee: new LeveledWeapon(10302), //"铸铁者"),
            ranged: new LeveledWeapon(20601), //"烈焰孤沙"),
            baseName: "快速出击", // 设置为技能而不是武器，这样selectedSkill才会有值
            enemyId: 130,
            enemyLevel: 80,
            enemyResistance: 0.5,
            targetFunction: "伤害",
        })

        // 预先计算属性和伤害
        testAttrs = charBuild.calculateWeaponAttributes()
    })

    describe("基础AST节点求值测试", () => {
        it("应该正确求值数字节点", () => {
            // 需要通过targetFunction来测试evaluateAST
            // 使用简单表达式
            charBuild.targetFunction = "100"
            const attrs = charBuild.calculateWeaponAttributes()

            // 测试数字求值
            const result = charBuild.evaluateAST("100", attrs)
            expect(result).toBe(100)
        })

        it("应该正确求值负数", () => {
            const attrs = charBuild.calculateWeaponAttributes()

            const result = charBuild.evaluateAST("-50", attrs)
            expect(result).toBe(-50)
        })
    })

    describe("二元运算符测试", () => {
        it("应该正确执行加法运算", () => {
            charBuild.targetFunction = "10 + 20"
            // 由于calculate中会除以时间（如果是DPS），我们需要直接测试evaluateAST
            const attrs = charBuild.calculateWeaponAttributes()
            const evalResult = charBuild.evaluateAST("10 + 20", attrs)

            expect(evalResult).toBe(30)
        })

        it("应该使用自定义变量表达式参与求值", () => {
            charBuild.customVariables = [["[花刺]层数", "2 + 3"]]

            const result = charBuild.evaluateAST("10 + 4 * [花刺]层数", testAttrs)

            expect(result).toBe(30)
        })

        it("临时属性应该只影响被修饰的字段", () => {
            const baseDamage = charBuild.evaluateAST("[攻击]", testAttrs)
            const temporaryDamage = charBuild.evaluateAST("[攻击]{增伤:0.1}", testAttrs)
            const expectedDamage = charBuild.evaluateAST("[攻击]", { ...testAttrs, 增伤: testAttrs.增伤 + 0.1 })

            expect(temporaryDamage).toBeCloseTo(expectedDamage, 6)
            expect(temporaryDamage).toBeGreaterThan(baseDamage)
            expect(charBuild.evaluateAST("[攻击]", testAttrs)).toBeCloseTo(baseDamage, 6)
        })

        it("临时属性应该支持伤害成员分支", () => {
            const temporaryDamage = charBuild.evaluateAST("[攻击]{增伤:0.1}.暴击", testAttrs)
            const expectedDamage = charBuild.evaluateAST("[攻击].暴击", { ...testAttrs, 增伤: testAttrs.增伤 + 0.1 })

            expect(temporaryDamage).toBeCloseTo(expectedDamage, 6)
        })

        it("召唤物字段应该在继承缩放后应用临时属性", () => {
            const summonBuild = new CharBuild({
                char: new LeveledChar("塔比瑟"),
                skillLevel: 10,
                hpPercent: 1,
                resonanceGain: 0,
                buffs: [
                    new LeveledBuff({
                        名称: "召唤物继承测试",
                        描述: "测试用召唤物属性继承比例",
                        召唤物属性继承比例: -0.5,
                    }),
                ],
                melee: new LeveledWeapon(10302),
                ranged: new LeveledWeapon(20601),
                baseName: "正义群殴！",
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance: 0,
                targetFunction: "[攻击]",
            })
            const attrs = summonBuild.calculateWeaponAttributes()
            const temporaryDamage = summonBuild.evaluateAST("[攻击]{攻击:100}", attrs)
            const globallyModifiedDamage = summonBuild.evaluateAST("[攻击]", { ...attrs, 攻击: attrs.攻击 + 100 })

            expect(attrs.召唤物属性继承比例).toBeCloseTo(0.5, 6)
            expect(temporaryDamage).toBeGreaterThan(globallyModifiedDamage)
        })

        it("武器关键词应该使用对应装备的武器伤害面板", () => {
            const meleeDamage = charBuild.evaluateAST("[近战]", testAttrs)
            const rangedDamage = charBuild.evaluateAST("[远程]", testAttrs)

            expect(meleeDamage).toBeCloseTo(charBuild.evaluateAST("近战::[攻击]", testAttrs), 6)
            expect(rangedDamage).toBeCloseTo(charBuild.evaluateAST("远程::[攻击]", testAttrs), 6)
            expect(meleeDamage).not.toBeCloseTo(rangedDamage, 6)
        })

        it("武器伤害字段的临时属性应该按武器基础值应用加成", () => {
            const weapon = charBuild.meleeWeapon
            const weaponAttrs = charBuild.calculateWeaponAttributes(weapon, true, true).weapon!
            const temporaryWeaponAttrs = {
                ...weaponAttrs,
                攻击: weaponAttrs.攻击 + weapon.基础攻击 * 0.1,
                暴击: weaponAttrs.暴击 + weapon.基础暴击 * 0.2,
            }
            const defense = charBuild.calculateDefenseMultiplier(testAttrs, undefined, false)
            const temporaryDamage = charBuild.calculateWeaponDamage({ ...testAttrs, weapon: temporaryWeaponAttrs }, weapon)
            const expected =
                (testAttrs.攻击 + temporaryWeaponAttrs.攻击) *
                defense *
                (temporaryDamage.higherCritExpectedTrigger || temporaryDamage.expectedDamage)
            const directAddedWeaponAttrs = {
                ...weaponAttrs,
                攻击: weaponAttrs.攻击 + 0.1,
                暴击: weaponAttrs.暴击 + 0.2,
            }
            const directAddedDamage = charBuild.calculateWeaponDamage({ ...testAttrs, weapon: directAddedWeaponAttrs }, weapon)
            const directAddedResult =
                (testAttrs.攻击 + directAddedWeaponAttrs.攻击) *
                defense *
                (directAddedDamage.higherCritExpectedTrigger || directAddedDamage.expectedDamage)
            const result = charBuild.evaluateAST("[近战]{攻击:0.1,暴击:0.2}.暴击", testAttrs)

            expect(result).toBeCloseTo(expected, 6)
            expect(result).not.toBeCloseTo(directAddedResult, 6)
        })

        it("临时属性将概率/倍率类武器属性加成到负值时不应导致伤害输出归零", () => {
            // 灾厄武器的触发倍率为 1（敌方抗性非 0），触发率被临时属性推成负值后
            // 触发期望会溢出为负，最终 calculate 输出归零
            const calamityBuild = new CharBuild({
                char: new LeveledChar("黎瑟"),
                hpPercent: 0.5,
                resonanceGain: 2,
                melee: new LeveledWeapon(10299), // "无止无休" 灾厄武器
                ranged: new LeveledWeapon(20601),
                baseName: "快速出击",
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance: 0.5,
                targetFunction: "[近战]{触发:-9}",
            })
            const attrs = calamityBuild.calculateWeaponAttributes()

            // 触发率被 -9 倍基础值加成后为负，应按 0（不触发）处理
            const negativeTrigger = calamityBuild.evaluateAST("[近战]{触发:-9}", attrs)
            const zeroTrigger = calamityBuild.evaluateAST("[近战]{触发:-1}", attrs)
            expect(negativeTrigger).toBeGreaterThan(0)
            expect(negativeTrigger).toBeCloseTo(zeroTrigger, 6)
            expect(calamityBuild.calculate()).toBeGreaterThan(0)
            // 暴击率/暴伤同理不应溢出为负
            expect(calamityBuild.evaluateAST("[近战]{暴击:-9}", attrs)).toBeGreaterThan(0)
            expect(calamityBuild.evaluateAST("[近战]{暴伤:-9}", attrs)).toBeGreaterThan(0)
        })

        it("同律关键词应该使用角色装备的同律武器面板", () => {
            const skillWeaponBuild = new CharBuild({
                char: new LeveledChar("煜明"),
                skillLevel: 10,
                hpPercent: 1,
                resonanceGain: 0,
                melee: new LeveledWeapon(10299),
                ranged: new LeveledWeapon(20601),
                baseName: "疑星落",
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance: 0,
                targetFunction: "[同律]",
            })
            const attrs = skillWeaponBuild.calculateWeaponAttributes()

            expect(skillWeaponBuild.skillWeapon).toBeDefined()
            expect(skillWeaponBuild.evaluateAST("[同律]", attrs)).toBeCloseTo(skillWeaponBuild.evaluateAST("同律::[攻击]", attrs), 6)
        })

        it("技能格式表达式应该使用自定义变量", () => {
            const floraBuild = new CharBuild({
                char: new LeveledChar("芙罗拉"),
                hpPercent: 1,
                resonanceGain: 3,
                melee: new LeveledWeapon(10302),
                ranged: new LeveledWeapon(20601),
                baseName: "群花邀约",
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance: 0,
                targetFunction: "[终章]蓄力攻击伤害",
                skillLevel: 10,
            })

            floraBuild.customVariables = [["[花刺]层数", "0"]]
            const noThornDamage = floraBuild.calculate()
            floraBuild.customVariables = [["[花刺]层数", "12"]]
            const fullThornDamage = floraBuild.calculate()

            expect(fullThornDamage).toBeGreaterThan(noThornDamage)
        })

        it("字段名携带蓄力攻击时应该吃近战蓄力增伤和独立增伤", () => {
            const baseBuild = new CharBuild({
                char: new LeveledChar("芙罗拉"),
                hpPercent: 1,
                resonanceGain: 3,
                melee: new LeveledWeapon(10302),
                ranged: new LeveledWeapon(20601),
                baseName: "群花邀约",
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance: 0,
                targetFunction: "[终章]蓄力攻击伤害",
                skillLevel: 10,
            })
            baseBuild.customVariables = [["[花刺]层数", "0"]]

            const buffedBuild = baseBuild.clone()
            buffedBuild.buffs = [
                new LeveledBuff({
                    名称: "测试近战蓄力加成",
                    描述: "测试用",
                    近战蓄力增伤: 1,
                    近战蓄力独立增伤: 3,
                }),
            ]

            expect(buffedBuild.calculateOneTime()).toBeCloseTo(baseBuild.calculateOneTime() * 8, 6)
        })

        it("蓄力加成不应该作用到普通攻击字段", () => {
            const baseBuild = new CharBuild({
                char: new LeveledChar("黎瑟"),
                hpPercent: 1,
                resonanceGain: 3,
                melee: new LeveledWeapon(10302),
                ranged: new LeveledWeapon(20601),
                baseName: "普通攻击",
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance: 0,
                targetFunction: "伤害",
                skillLevel: 10,
            })

            const buffedBuild = baseBuild.clone()
            buffedBuild.buffs = [
                new LeveledBuff({
                    名称: "测试近战蓄力加成",
                    描述: "测试用",
                    近战蓄力增伤: 3,
                    近战蓄力独立增伤: 3,
                }),
            ]

            expect(buffedBuild.calculate()).toBe(baseBuild.calculate())
        })

        it("同律武器普攻连段字段应该吃同律近战普攻增伤", () => {
            const baseBuild = new CharBuild({
                char: new LeveledChar("贝蕾妮卡"),
                hpPercent: 0.5,
                resonanceGain: 2,
                melee: new LeveledWeapon(10302),
                ranged: new LeveledWeapon(20601),
                baseName: "伊弥尔", // 同律近战武器
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance: 0.5,
                targetFunction: "一段伤害", // 普攻连段字段，不携带攻击类型关键字
                skillLevel: 10,
            })

            const buffedBuild = baseBuild.clone()
            buffedBuild.buffs = [
                new LeveledBuff({
                    名称: "测试同律近战普攻加成",
                    描述: "测试用",
                    同律近战普攻增伤: 1,
                }),
            ]

            expect(buffedBuild.calculate()).toBeCloseTo(baseBuild.calculate() * 2, 6)
        })

        it("同律武器蓄力字段应该吃同律近战蓄力增伤", () => {
            const baseBuild = new CharBuild({
                char: new LeveledChar("贝蕾妮卡"),
                hpPercent: 0.5,
                resonanceGain: 2,
                melee: new LeveledWeapon(10302),
                ranged: new LeveledWeapon(20601),
                baseName: "伊弥尔", // 同律近战武器
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance: 0.5,
                targetFunction: "蓄力攻击伤害",
                skillLevel: 10,
            })

            const buffedBuild = baseBuild.clone()
            buffedBuild.buffs = [
                new LeveledBuff({
                    名称: "测试同律近战蓄力加成",
                    描述: "测试用",
                    同律近战蓄力增伤: 1,
                }),
            ]

            expect(buffedBuild.calculate()).toBeCloseTo(baseBuild.calculate() * 2, 6)
        })

        it("同律近战普攻增伤不应该作用到同律武器蓄力字段", () => {
            const baseBuild = new CharBuild({
                char: new LeveledChar("贝蕾妮卡"),
                hpPercent: 0.5,
                resonanceGain: 2,
                melee: new LeveledWeapon(10302),
                ranged: new LeveledWeapon(20601),
                baseName: "伊弥尔", // 同律近战武器
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance: 0.5,
                targetFunction: "蓄力攻击伤害",
                skillLevel: 10,
            })

            const buffedBuild = baseBuild.clone()
            buffedBuild.buffs = [
                new LeveledBuff({
                    名称: "测试同律近战普攻加成",
                    描述: "测试用",
                    同律近战普攻增伤: 1,
                }),
            ]

            expect(buffedBuild.calculate()).toBe(baseBuild.calculate())
        })

        it("普攻连段字段判定应排除其他攻击类型字段", () => {
            const getPrefix = (baseName: string, fieldName?: string) => (charBuild as any).getWeaponAttackTypePrefix(baseName, fieldName)
            // "下落攻击二段伤害" 属于下落攻击而非普攻
            expect(getPrefix("下落攻击", "下落攻击二段伤害")).toBe("下落")
            // "骑乘攻击一段伤害" 属于骑乘攻击而非普攻
            expect(getPrefix("饱饱工作", "骑乘攻击一段伤害")).toBeUndefined()
            // "一段剑气伤害" 不属于普攻连段
            expect(getPrefix("伊弥尔", "一段剑气伤害")).toBeUndefined()
        })

        it("循环引用的自定义变量应按0处理", () => {
            charBuild.customVariables = [
                ["A", "B + 1"],
                ["B", "A + 1"],
            ]

            const result = charBuild.evaluateAST("A + B", testAttrs)

            expect(result).toBe(3)
        })

        it("应该正确执行减法运算", () => {
            const attrs = charBuild.calculateWeaponAttributes()
            const result = charBuild.evaluateAST("50 - 20", attrs)

            expect(result).toBe(30)
        })

        it("应该正确执行乘法运算", () => {
            const attrs = charBuild.calculateWeaponAttributes()
            const result = charBuild.evaluateAST("5 * 6", attrs)

            expect(result).toBe(30)
        })

        it("应该正确执行除法运算", () => {
            const attrs = charBuild.calculateWeaponAttributes()
            const result = charBuild.evaluateAST("60 / 4", attrs)

            expect(result).toBe(15)
        })

        it("应该正确执行取模运算", () => {
            const attrs = charBuild.calculateWeaponAttributes()
            const result = charBuild.evaluateAST("17 % 5", attrs)

            expect(result).toBe(2)
        })

        it("应该正确执行整数除法运算", () => {
            const attrs = charBuild.calculateWeaponAttributes()
            const result = charBuild.evaluateAST("17 // 5", attrs)

            expect(result).toBe(3)
        })

        it("应该处理除以零的情况", () => {
            const attrs = charBuild.calculateWeaponAttributes()
            const result = charBuild.evaluateAST("10 / 0", attrs)

            expect(result).toBe(0)
        })

        it("应该正确执行复杂表达式", () => {
            const attrs = charBuild.calculateWeaponAttributes()
            const result = charBuild.evaluateAST("2 + 3 * 4 - 6 / 2", attrs)

            expect(result).toBe(11) // 2 + 12 - 3 = 11
        })

        it("应该正确处理括号", () => {
            const attrs = charBuild.calculateWeaponAttributes()
            const result = charBuild.evaluateAST("(2 + 3) * 4", attrs)

            expect(result).toBe(20) // (2 + 3) * 4 = 20
        })
    })

    describe("函数调用测试", () => {
        it("应该正确执行min函数", () => {
            const attrs = charBuild.calculateWeaponAttributes()
            const result = charBuild.evaluateAST("min(10, 5, 8)", attrs)

            expect(result).toBe(5)
        })

        it("应该正确执行max函数", () => {
            const attrs = charBuild.calculateWeaponAttributes()
            const result = charBuild.evaluateAST("max(10, 5, 8)", attrs)

            expect(result).toBe(10)
        })

        it("应该正确执行floor函数", () => {
            const attrs = charBuild.calculateWeaponAttributes()
            const result = charBuild.evaluateAST("floor(3.7)", attrs)

            expect(result).toBe(3)
        })

        it("应该正确执行ceil函数", () => {
            const attrs = charBuild.calculateWeaponAttributes()
            const result = charBuild.evaluateAST("ceil(3.2)", attrs)

            expect(result).toBe(4)
        })

        it("应该正确执行or函数", () => {
            const attrs = charBuild.calculateWeaponAttributes()

            // 测试第一个非零值
            const result1 = charBuild.evaluateAST("or(0, 5, 3)", attrs)
            expect(result1).toBe(5)

            // 测试全零情况
            const result2 = charBuild.evaluateAST("or(0, 0, 0)", attrs)
            expect(result2).toBe(0)
        })

        it("应该在函数中使用属性", () => {
            const attrs = charBuild.calculateWeaponAttributes()

            // 使用攻击属性
            const result = charBuild.evaluateAST("floor(攻击 / 100)", attrs)
            expect(result).toBeGreaterThanOrEqual(0)
        })
    })

    describe("属性访问测试", () => {
        it("应该正确访问攻击属性", () => {
            const attrs = charBuild.calculateWeaponAttributes()
            const result = charBuild.evaluateAST("攻击", attrs)

            expect(result).toBeGreaterThan(0)
            // 验证结果接近攻击属性的数值
            expect(result).toBeCloseTo(attrs.攻击, 0)
        })

        it("应该正确访问生命属性", () => {
            const attrs = charBuild.calculateWeaponAttributes()
            const result = charBuild.evaluateAST("生命", attrs)

            expect(result).toBeGreaterThan(0)
        })

        it("应该正确访问防御属性", () => {
            const attrs = charBuild.calculateWeaponAttributes()
            const result = charBuild.evaluateAST("防御", attrs)

            expect(result).toBeGreaterThanOrEqual(0)
        })

        it("应该正确访问增伤属性", () => {
            const attrs = charBuild.calculateWeaponAttributes()
            const result = charBuild.evaluateAST("增伤", attrs)

            expect(result).toBeGreaterThanOrEqual(0)
        })
    })

    describe("成员访问测试", () => {
        it("应该正确处理成员访问语法", () => {
            // 测试成员访问的语法解析，使用攻击.暴击（虽然攻击不是伤害属性，但可以测试语法）
            const result = charBuild.evaluateAST("攻击 * 1.5", testAttrs)
            expect(result).toBeGreaterThan(0)
            expect(result).toBeCloseTo(testAttrs.攻击 * 1.5, 0)
        })

        it("应该正确处理属性乘法", () => {
            const result = charBuild.evaluateAST("增伤", testAttrs)

            expect(result).toBeGreaterThanOrEqual(0)
        })
    })

    describe("成员访问测试", () => {
        it("应该正确处理成员访问语法", () => {
            // 测试成员访问的语法解析，使用攻击.暴击（虽然攻击不是伤害属性，但可以测试语法）
            const result = charBuild.evaluateAST("攻击 * 1.5", testAttrs)
            expect(result).toBeGreaterThan(0)
            expect(result).toBeCloseTo(testAttrs.攻击 * 1.5, 0)
        })

        it("应该正确处理属性乘法", () => {
            const result = charBuild.evaluateAST("攻击 * 2", testAttrs)
            expect(result).toBeCloseTo(testAttrs.攻击 * 2, 0)
        })
    })

    describe("复杂表达式测试", () => {
        it("应该正确处理属性和运算符的组合", () => {
            const result = charBuild.evaluateAST("攻击 * 2 + 100", testAttrs)
            expect(result).toBeGreaterThan(0)
        })

        it("应该正确处理嵌套函数调用", () => {
            const result = charBuild.evaluateAST("floor(max(攻击, 100) / 10)", testAttrs)
            expect(result).toBeGreaterThanOrEqual(0)
        })

        it("应该正确处理成员访问和运算符的组合", () => {
            const result = charBuild.evaluateAST("攻击 * 1.5 + 50", testAttrs)
            expect(result).toBeGreaterThan(0)
        })

        it("应该正确处理复杂混合表达式", () => {
            const result = charBuild.evaluateAST("floor(攻击 / 100) * 10 + 50", testAttrs)
            expect(result).toBeGreaterThan(0)
        })
    })

    describe("边界条件测试", () => {
        it("应该处理空字符串输入", () => {
            const attrs = charBuild.calculateWeaponAttributes()

            const result = charBuild.evaluateAST("", attrs)
            expect(result).toBe(0)
        })

        it("应该处理不存在的属性", () => {
            const attrs = charBuild.calculateWeaponAttributes()

            const result = charBuild.evaluateAST("不存在的属性", attrs)
            expect(result).toBe(0)
        })

        it("应该处理不存在的函数", () => {
            const attrs = charBuild.calculateWeaponAttributes()

            expect(() => {
                charBuild.evaluateAST("unknownFunction(10)", attrs)
            }).toThrow()
        })

        it("应该处理大数值计算", () => {
            const attrs = charBuild.calculateWeaponAttributes()

            const result = charBuild.evaluateAST("1000000 * 1000000", attrs)
            expect(result).toBe(1000000000000)
        })
    })

    describe("AST缓存测试", () => {
        it("应该缓存已解析的AST", () => {
            const attrs = charBuild.calculateWeaponAttributes()

            const expression = "攻击 + 100"

            // 第一次调用会解析并缓存
            const result1 = charBuild.evaluateAST(expression, attrs)

            // 第二次调用应该使用缓存的AST
            const result2 = charBuild.evaluateAST(expression, attrs)

            expect(result1).toBe(result2)
            expect(charBuild.astCache.has(expression)).toBe(true)
        })

        it("应该为不同表达式创建不同的缓存", () => {
            const attrs = charBuild.calculateWeaponAttributes()

            charBuild.evaluateAST("攻击 + 100", attrs)
            charBuild.evaluateAST("攻击 * 2", attrs)
            // console.log(charBuild["astCache"])

            expect(charBuild.astCache.size).toBe(2)
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

        it("应该拒绝不存在的临时属性", () => {
            expect(charBuild.validateAST("[攻击]{不存在:0.1}")).toContain("找不到临时属性")
            expect(charBuild.validateAST("[近战]{weapon:0.1}")).toContain("找不到临时属性")
            expect(charBuild.validateAST("[攻击]{暴击:0.1}")).toContain("找不到临时属性")
            expect(charBuild.validateAST("[近战]{暴击:0.1}")).toBeUndefined()
        })

        it("应该拒绝给非字段表达式添加临时属性", () => {
            expect(() => parseAST("1{增伤:0.1}")).toThrow("只能应用于字段")
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

        it("应该正确计算Q命名空间下的技能伤害字段", () => {
            charBuild = new CharBuild({
                char: new LeveledChar("苏乙"),
                skillLevel: 10,
                hpPercent: 1,
                resonanceGain: 0,
                buffs: [],
                melee: new LeveledWeapon(10302),
                ranged: new LeveledWeapon(20601),
                baseName: "歼星模式",
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance: 0,
                targetFunction: "Q::[剑如虹]伤害",
            })

            const attrs = charBuild.calculateWeaponAttributes()
            const result = charBuild.evaluateAST("Q::[剑如虹]伤害", attrs)

            expect(result).toBeGreaterThan(0)
            expect(result).toBeCloseTo(36661.61, 2)
        })

        it("非伤害技能字段不应套用伤害乘区", () => {
            const lowHpBuild = new CharBuild({
                char: new LeveledChar("丽蓓卡"),
                skillLevel: 10,
                hpPercent: 0.1,
                resonanceGain: 3,
                melee: new LeveledWeapon(10302),
                ranged: new LeveledWeapon(20601),
                baseName: "纯爱试炼",
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance: 0,
                targetFunction: "[爱之毒]持续时间",
            })
            const highHpBuild = new CharBuild({
                char: new LeveledChar("丽蓓卡"),
                skillLevel: 10,
                hpPercent: 0.9,
                resonanceGain: 3,
                melee: new LeveledWeapon(10302),
                ranged: new LeveledWeapon(20601),
                baseName: "纯爱试炼",
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance: 0,
                targetFunction: "[爱之毒]持续时间",
            })

            const lowHpAttrs = lowHpBuild.calculateWeaponAttributes()
            const highHpAttrs = highHpBuild.calculateWeaponAttributes()
            const lowHpResult = lowHpBuild.evaluateAST("[爱之毒]持续时间", lowHpAttrs)
            const highHpResult = highHpBuild.evaluateAST("[爱之毒]持续时间", highHpAttrs)

            expect(lowHpResult).toBeCloseTo(highHpResult, 6)
            expect(lowHpResult).toBeCloseTo(6, 6)
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
            const b = charBuild.meleeWeapon.技能!.find(x => x.名称 === "普通攻击")!.字段.find(x => x.名称.includes("伤害"))!.值! //  一段伤害: "40.0%",
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
                0
            )
        })
    })

    describe("转xx 属性转换测试", () => {
        // 护盾木桩（enemyId 0）：血量类型为护盾，只有切割类型伤害可以触发
        function shieldBuild(targetFunction: string) {
            return new CharBuild({
                char: new LeveledChar("黎瑟"),
                hpPercent: 0.5,
                resonanceGain: 2,
                melee: new LeveledWeapon(10302),
                ranged: new LeveledWeapon(20601), // 贯穿 + 触发 0.2，在护盾木桩下不触发
                baseName: "快速出击",
                enemyId: 0, // 护盾木桩
                enemyLevel: 80,
                enemyResistance: 0.5,
                targetFunction,
            })
        }

        it("转成非触发类型（转贯穿）同样不参与触发", () => {
            const build = shieldBuild("[远程]")
            const attrs = build.calculateWeaponAttributes()
            const base = build.evaluateAST("[远程]", attrs)
            const converted = build.evaluateAST("[远程]{转贯穿:1}", attrs)

            expect(converted).toBeCloseTo(base, 6)
        })

        it("转切割在护盾木桩下按触发率加权触发（100% 转换）", () => {
            const build = shieldBuild("[远程]")
            const attrs = build.calculateWeaponAttributes()
            const weaponAttrs = build.calculateWeaponAttributes(build.rangedWeapon, true, true).weapon!
            const triggerRate = Math.max(0, Math.min(1, weaponAttrs.触发))
            const base = build.evaluateAST("[远程]", attrs)
            const converted = build.evaluateAST("[远程]{转切割:1}", attrs)

            // 护盾木桩切割触发倍率 = 护盾系数 1 + 触发倍率 0 = 1，全量转换 → 按触发率加权为 1 + triggerRate 倍
            expect(triggerRate).toBeGreaterThan(0)
            expect(converted).toBeCloseTo(base * (1 + triggerRate), 6)
        })

        it("部分转换按比例提升：转切割 0.5 → 1 + 0.5×触发率", () => {
            const build = shieldBuild("[远程]")
            const attrs = build.calculateWeaponAttributes()
            const weaponAttrs = build.calculateWeaponAttributes(build.rangedWeapon, true, true).weapon!
            const triggerRate = Math.max(0, Math.min(1, weaponAttrs.触发))
            const base = build.evaluateAST("[远程]", attrs)
            const half = build.evaluateAST("[远程]{转切割:0.5}", attrs)

            expect(half).toBeCloseTo(base * (1 + 0.5 * triggerRate), 6)
        })

        it("总转换比例钳制到 100%，转贯穿1+转切割1 与 转切割0.5 伤害相同", () => {
            const build = shieldBuild("[远程]")
            const attrs = build.calculateWeaponAttributes()
            const base = build.evaluateAST("[远程]", attrs)
            const half = build.evaluateAST("[远程]{转切割:0.5}", attrs)
            const mixed = build.evaluateAST("[远程]{转贯穿:1,转切割:1}", attrs)

            // 总比例 2 > 1 → 归一化各占 50%：贯穿在护盾木桩不触发 + 切割按率触发，与 0.5 转换一致
            expect(mixed).toBeCloseTo(half, 6)
            expect(mixed).toBeGreaterThan(base)
        })

        it("转xx 临时属性应通过表达式校验", () => {
            const build = shieldBuild("[远程]")
            expect(build.validateAST("[远程]{转切割:1}")).toBeUndefined()
            expect(build.validateAST("[远程]{转属克:1}")).toBeUndefined()
            expect(build.validateAST("[远程]{转属逆:1}")).toBeUndefined()
            expect(build.validateAST("[攻击]{转灾厄:1}")).toBeUndefined()
        })

        // 夫人(1502)：E::伤害 为技能伤害，天然与武器面板解耦，适合验证抗性因子翻转。
        function ladyBuild(enemyResistance: number) {
            return new CharBuild({
                char: new LeveledChar(1502),
                hpPercent: 0.5,
                resonanceGain: 2,
                melee: new LeveledWeapon(10302),
                ranged: new LeveledWeapon(20601),
                baseName: "月猎",
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance,
                targetFunction: "伤害",
            })
        }

        it("转属逆：敌人 0 抗不处理，-4 弱抗等效 0.5（夫人 E::伤害 2 倍 / 5.5 倍）", () => {
            const attrs = ladyBuild(0).calculateAttributes()
            // 0 抗基准（也是小写命名空间别名的校验）
            const base = ladyBuild(0).evaluateAST("e::伤害", attrs)
            expect(ladyBuild(0).evaluateAST("E::伤害", attrs)).toBeCloseTo(base, 6)
            // 敌人 0 抗：转属逆不处理 → 未转换 + 转换部分均按原抗性 → 2 倍
            const zeroResist = ladyBuild(0).evaluateAST("E::伤害+E::伤害{转属逆:1}", attrs)
            expect(zeroResist).toBeCloseTo(base * 2, 6)
            // 敌人 -4：未转换部分按原抗性（5 倍），转属逆部分等效抗性 0.5（0.5 倍）→ 合计 5.5 倍
            expect(ladyBuild(-4).evaluateAST("E::伤害", attrs)).toBeCloseTo(base * 5, 6)
            const negFourConvert = ladyBuild(-4).evaluateAST("E::伤害+E::伤害{转属逆:1}", attrs)
            expect(negFourConvert).toBeCloseTo(base * 5.5, 6)
        })

        it("转属克：敌人 0.5 强抗等效 -4（夫人 E::伤害 5.5 倍）", () => {
            const attrs = ladyBuild(0).calculateAttributes()
            const base = ladyBuild(0).evaluateAST("E::伤害", attrs)
            // 敌人 0.5：未转换部分按原抗性（0.5 倍）
            expect(ladyBuild(0.5).evaluateAST("E::伤害", attrs)).toBeCloseTo(base * 0.5, 6)
            // 转属克部分等效 -4（5 倍）→ 合计 0.5 + 5 = 5.5 倍
            const exploit = ladyBuild(0.5).evaluateAST("E::伤害+E::伤害{转属克:1}", attrs)
            expect(exploit).toBeCloseTo(base * 5.5, 6)
        })

        it("转属克/转属逆方向相反：克不处理负抗、逆不处理正抗、0 抗均不处理", () => {
            const attrs = ladyBuild(0).calculateAttributes()
            const base = ladyBuild(0).evaluateAST("E::伤害", attrs)
            // 敌人 -4（负抗）：转属克不处理 → 仍 5 倍；转属逆翻转 → 0.5 倍
            expect(ladyBuild(-4).evaluateAST("E::伤害{转属克:1}", attrs)).toBeCloseTo(base * 5, 6)
            expect(ladyBuild(-4).evaluateAST("E::伤害{转属逆:1}", attrs)).toBeCloseTo(base * 0.5, 6)
            // 敌人 0.5（正抗）：转属逆不处理 → 仍 0.5 倍；转属克翻转 → 5 倍
            expect(ladyBuild(0.5).evaluateAST("E::伤害{转属逆:1}", attrs)).toBeCloseTo(base * 0.5, 6)
            expect(ladyBuild(0.5).evaluateAST("E::伤害{转属克:1}", attrs)).toBeCloseTo(base * 5, 6)
            // 敌人 0 抗：两者都不处理 → 均保持 1 倍
            expect(ladyBuild(0).evaluateAST("E::伤害{转属克:1}", attrs)).toBeCloseTo(base, 6)
            expect(ladyBuild(0).evaluateAST("E::伤害{转属逆:1}", attrs)).toBeCloseTo(base, 6)
        })

        it("转属逆按比例混合：负抗 -4 时 转属逆 0.5 → 2.75 倍", () => {
            const attrs = ladyBuild(0).calculateAttributes()
            const base = ladyBuild(0).evaluateAST("E::伤害", attrs)
            // 50% 按原抗性（5 倍）+ 50% 等效 0.5（0.5 倍）→ 2.75 倍
            expect(ladyBuild(-4).evaluateAST("E::伤害{转属逆:0.5}", attrs)).toBeCloseTo(base * 2.75, 6)
        })
    })

    describe("命名空间解析测试", () => {
        describe("基础命名空间解析", () => {
            it("应该正确解析命名空间属性", () => {
                const ast = parseAST("Math::PI")
                expect(ast.type).toBe("property")

                const propNode = ast as ASTProperty
                expect(propNode.name).toBe("PI")
                expect(propNode.namespace).toBe("Math")
            })

            it("应该正确解析命名空间函数调用", () => {
                const ast = parseAST("Math::max(10, 20)")
                expect(ast.type).toBe("function")

                const funcNode = ast as ASTFunction
                expect(funcNode.name).toBe("max")
                expect(funcNode.namespace).toBe("Math")
                expect(funcNode.args).toHaveLength(2)
            })

            it("应该正确解析多个参数的命名空间函数", () => {
                const ast = parseAST("Util::calc(a, b, c)")
                expect(ast.type).toBe("function")

                const funcNode = ast as ASTFunction
                expect(funcNode.name).toBe("calc")
                expect(funcNode.namespace).toBe("Util")
                expect(funcNode.args).toHaveLength(3)
            })
        })

        describe("命名空间与表达式组合", () => {
            it("应该正确处理命名空间属性与运算符的组合", () => {
                const ast = parseAST("Math::PI * 2")
                expect(ast.type).toBe("binary")

                const binaryNode = ast as ASTBinary
                expect(binaryNode.operator).toBe("*")
                expect(binaryNode.left.type).toBe("property")

                const propNode = binaryNode.left as ASTProperty
                expect(propNode.namespace).toBe("Math")
                expect(propNode.name).toBe("PI")
            })

            it("应该正确处理命名空间函数调用与运算符的组合", () => {
                const ast = parseAST("Math::max(10, 20) + 5")
                expect(ast.type).toBe("binary")

                const binaryNode = ast as ASTBinary
                expect(binaryNode.operator).toBe("+")
                expect(binaryNode.left.type).toBe("function")

                const funcNode = binaryNode.left as ASTFunction
                expect(funcNode.namespace).toBe("Math")
            })

            it("应该正确处理嵌套命名空间函数调用", () => {
                const ast = parseAST("Math::floor(Util::calc(10, 20))")
                expect(ast.type).toBe("function")

                const outerFunc = ast as ASTFunction
                expect(outerFunc.name).toBe("floor")
                expect(outerFunc.namespace).toBe("Math")
                expect(outerFunc.args).toHaveLength(1)
                expect(outerFunc.args[0].type).toBe("function")

                const innerFunc = outerFunc.args[0] as ASTFunction
                expect(innerFunc.namespace).toBe("Util")
            })
        })

        describe("命名空间与成员访问组合", () => {
            it("应该正确处理命名空间属性后的成员访问", () => {
                const ast = parseAST("Config::Settings.value")
                expect(ast.type).toBe("member_access")

                const memberNode = ast as ASTMemberAccess
                expect(memberNode.property).toBe("value")
                expect(memberNode.object.type).toBe("property")

                const propNode = memberNode.object as ASTProperty
                expect(propNode.namespace).toBe("Config")
                expect(propNode.name).toBe("Settings")
            })

            it("应该正确处理命名空间函数返回值的成员访问", () => {
                const ast = parseAST("Data::get(id).property")
                expect(ast.type).toBe("member_access")

                const memberNode = ast as ASTMemberAccess
                expect(memberNode.property).toBe("property")
                expect(memberNode.object.type).toBe("function")

                const funcNode = memberNode.object as ASTFunction
                expect(funcNode.namespace).toBe("Data")
                expect(funcNode.name).toBe("get")
            })

            it("应该正确处理多级成员访问", () => {
                const ast = parseAST("Config::Settings.data.value")
                expect(ast.type).toBe("member_access")

                const memberNode = ast as ASTMemberAccess
                expect(memberNode.property).toBe("value")
                expect(memberNode.object.type).toBe("member_access")
            })
        })

        describe("命名空间错误处理", () => {
            it("应该拒绝单个冒号语法", () => {
                expect(() => {
                    parseAST("Math:PI")
                }).toThrow("单个冒号")
            })

            it("应该在命名空间后缺少标识符时报错", () => {
                expect(() => {
                    parseAST("Math::")
                }).toThrow("命名空间")
            })

            it("应该在命名空间后不能直接使用数字", () => {
                expect(() => {
                    parseAST("Math::123")
                }).toThrow()
            })

            it("应该处理命名空间与括号组合", () => {
                const ast = parseAST("(Math::max(10, 20))")
                expect(ast.type).toBe("function")

                const funcNode = ast as ASTFunction
                expect(funcNode.namespace).toBe("Math")
                expect(funcNode.name).toBe("max")
            })
        })

        describe("复杂命名空间表达式", () => {
            it("应该正确处理命名空间与括号表达式的组合", () => {
                const ast = parseAST("Math::max(10, 20) * (2 + 3)")
                expect(ast.type).toBe("binary")

                const binaryNode = ast as ASTBinary
                expect(binaryNode.operator).toBe("*")
                expect(binaryNode.left.type).toBe("function")

                const funcNode = binaryNode.left as ASTFunction
                expect(funcNode.namespace).toBe("Math")
            })

            it("应该正确处理多个命名空间在表达式中", () => {
                const ast = parseAST("Math::max(10, 20) + Util::min(5, 15)")
                expect(ast.type).toBe("binary")

                const binaryNode = ast as ASTBinary
                expect(binaryNode.operator).toBe("+")
                expect(binaryNode.left.type).toBe("function")
                expect(binaryNode.right.type).toBe("function")

                const leftFunc = binaryNode.left as ASTFunction
                expect(leftFunc.namespace).toBe("Math")

                const rightFunc = binaryNode.right as ASTFunction
                expect(rightFunc.namespace).toBe("Util")
            })

            it("应该正确处理命名空间在一元运算符中", () => {
                const ast = parseAST("-Math::value")
                expect(ast.type).toBe("unary")

                const unaryNode = ast as ASTUnary
                expect(unaryNode.operator).toBe("-")
                expect(unaryNode.argument.type).toBe("property")

                const propNode = unaryNode.argument as ASTProperty
                expect(propNode.namespace).toBe("Math")
            })
        })

        describe("命名空间属性验证", () => {
            it("应该解析字段临时属性", () => {
                const ast = parseAST("[攻击]{增伤:0.1,独立增伤:0.2}")

                expect(ast.type).toBe("temporary_attributes")
                const temporaryAttributes = ast as ASTTemporaryAttributes
                expect(temporaryAttributes.target).toMatchObject({ type: "property", name: "[攻击]" })
                expect(temporaryAttributes.attributes).toHaveLength(2)
                expect(temporaryAttributes.attributes[0]).toMatchObject({ name: "增伤", value: { type: "number", value: 0.1 } })
            })

            it("没有命名空间的属性应该namespace为undefined", () => {
                const ast = parseAST("攻击")
                expect(ast.type).toBe("property")

                const propNode = ast as ASTProperty
                expect(propNode.name).toBe("攻击")
                expect(propNode.namespace).toBeUndefined()
            })

            it("没有命名空间的函数应该namespace为undefined", () => {
                const ast = parseAST("max(10, 20)")
                expect(ast.type).toBe("function")

                const funcNode = ast as ASTFunction
                expect(funcNode.name).toBe("max")
                expect(funcNode.namespace).toBeUndefined()
            })

            it("命名空间应该支持中文标识符", () => {
                const ast = parseAST("数学::圆周率")
                expect(ast.type).toBe("property")

                const propNode = ast as ASTProperty
                expect(propNode.namespace).toBe("数学")
                expect(propNode.name).toBe("圆周率")
            })

            it("命名空间应该支持带标签的标识符", () => {
                const ast = parseAST("[配置]::值")
                expect(ast.type).toBe("property")

                const propNode = ast as ASTProperty
                expect(propNode.namespace).toBe("[配置]")
                expect(propNode.name).toBe("值")
            })
        })
    })
})
