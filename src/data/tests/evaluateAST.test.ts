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
                targetFunction: "召唤物伤害",
            })
            const attrs = summonBuild.calculateWeaponAttributes()
            const temporaryDamage = summonBuild.evaluateAST("召唤物伤害{攻击:100}", attrs)
            const globallyModifiedDamage = summonBuild.evaluateAST("召唤物伤害", { ...attrs, 攻击: attrs.攻击 + 100 })

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

        it("固定攻击 临时属性应按平值加到攻击上", () => {
            const baseDamage = charBuild.evaluateAST("伤害", testAttrs)
            const temporaryDamage = charBuild.evaluateAST("伤害{固定攻击:1}", testAttrs)
            const expectedDamage = charBuild.evaluateAST("伤害", { ...testAttrs, 攻击: testAttrs.攻击 + 1 })

            expect(charBuild.validateAST("伤害{固定攻击:1}")).toBeUndefined()
            expect(temporaryDamage).toBeCloseTo(expectedDamage, 6)
            expect(temporaryDamage).toBeGreaterThan(baseDamage)
        })

        it("固定生命 临时属性应按平值加到生命上", () => {
            const baseValue = charBuild.evaluateAST("[生命]", testAttrs)
            const temporaryValue = charBuild.evaluateAST("[生命]{固定生命:100}", testAttrs)
            const expectedValue = charBuild.evaluateAST("[生命]", { ...testAttrs, 生命: testAttrs.生命 + 100 })

            expect(charBuild.validateAST("[生命]{固定生命:100}")).toBeUndefined()
            expect(temporaryValue).toBeCloseTo(expectedValue, 6)
            expect(temporaryValue).toBeGreaterThan(baseValue)
        })

        it("临时属性将触发率加成到负值时不应导致伤害输出归零", () => {
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
        })

        it("暴击率超过 100% 时应保留溢出暴击档位，不被钳制到 100%", () => {
            // 临时属性把暴击率加成到 100% 以上时，应继续按 floor/ceil 溢出档位计算
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
                targetFunction: "[近战]",
            })
            const attrs = calamityBuild.calculateWeaponAttributes()

            // 暴击:9 → 暴击率 10*基础暴击=2.0，暴击:4 → 5*基础暴击=1.0
            // 若被钳制到 100%，两者结果应相同；保留溢出档位时 暴击:9 应更高
            const critNine = calamityBuild.evaluateAST("[近战]{暴击:9}", attrs)
            const critFour = calamityBuild.evaluateAST("[近战]{暴击:4}", attrs)
            expect(critNine).toBeGreaterThan(critFour)
        })

        it("触发率允许数值溢出，但触发效果按 100% 封顶", () => {
            // 角色型 MOD 提供 +300% 触发加成，使武器触发率超过 100%
            const fullnessMod = new LeveledMod({
                id: 999901,
                icon: "Test01",
                名称: "测试·充盈",
                版本: "1.0",
                系列: "测试",
                品质: "金",
                极性: "A",
                耐受: 15,
                类型: "角色",
                触发: 3,
                充盈转化: 1,
                效果: "触发概率超过100%的部分按100.0%比例转化为角色的充盈威力。",
            })
            const build = new CharBuild({
                char: new LeveledChar("黎瑟"),
                hpPercent: 0.5,
                resonanceGain: 2,
                charMods: [fullnessMod],
                melee: new LeveledWeapon(10102), // 孤子的缚锁 贯穿 基础触发 0.3
                ranged: new LeveledWeapon(20601),
                baseName: "快速出击",
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance: 0.5,
                targetFunction: "[近战]",
            })
            const attrs = build.calculateWeaponAttributes(build.meleeWeapon)

            // 触发率数值允许超过 100%（不钳制上限）
            expect(attrs.weapon!.触发).toBeGreaterThan(1)

            // 触发效果按 100% 封顶：把触发率用临时属性精确压到 100%，与溢出触发伤害一致
            const offset = -(attrs.weapon!.触发 - 1) / build.meleeWeapon.基础触发
            const full = build.evaluateAST("[近战]", attrs)
            const capped = build.evaluateAST(`[近战]{触发:${offset}}`, attrs)
            expect(full).toBeCloseTo(capped, 4)
        })

        it("充盈转化=∑MOD充盈转化，充盈威力=溢出触发×转化率", () => {
            const fullnessMod = new LeveledMod({
                id: 999901,
                icon: "Test01",
                名称: "测试·充盈",
                版本: "1.0",
                系列: "测试",
                品质: "金",
                极性: "A",
                耐受: 15,
                类型: "角色",
                触发: 3,
                充盈转化: 1,
                效果: "触发概率超过100%的部分按100.0%比例转化为角色的充盈威力。",
            })
            const build = new CharBuild({
                char: new LeveledChar("黎瑟"),
                hpPercent: 0.5,
                resonanceGain: 2,
                charMods: [fullnessMod],
                melee: new LeveledWeapon(10102),
                ranged: new LeveledWeapon(20601),
                baseName: "快速出击",
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance: 0.5,
                targetFunction: "[近战]",
            })
            const attrs = build.calculateWeaponAttributes(build.meleeWeapon)

            // 充盈转化（武器属性）= 基础转化 1 + 该武器作用域 MOD 充盈转化
            expect(attrs.weapon!.充盈转化).toBe(2)
            // 充盈威力（角色属性）= 溢出触发 × 充盈转化（仅近战溢出）
            const overflow = Math.max(0, attrs.weapon!.触发 - 1)
            expect(attrs.充盈威力).toBeCloseTo(overflow * 2, 6)
            // 作为角色属性可被 AST 表达式引用
            expect(build.evaluateAST("充盈威力", attrs)).toBeCloseTo(attrs.充盈威力, 6)
        })

        it("多个充盈转化 MOD 的转化率应累加", () => {
            const mkMod = (id: number, 充盈转化: number, 触发: number) =>
                new LeveledMod({
                    id,
                    icon: "Test01",
                    名称: "测试·充盈",
                    版本: "1.0",
                    系列: "测试",
                    品质: "金",
                    极性: "A",
                    耐受: 15,
                    类型: "角色",
                    触发,
                    充盈转化: 充盈转化,
                    效果: "测试用充盈转化MOD",
                })
            const build = new CharBuild({
                char: new LeveledChar("黎瑟"),
                hpPercent: 0.5,
                resonanceGain: 2,
                charMods: [mkMod(999901, 1, 3), mkMod(999902, 0.5, 0)],
                melee: new LeveledWeapon(10102),
                ranged: new LeveledWeapon(20601),
                baseName: "快速出击",
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance: 0.5,
                targetFunction: "[近战]",
            })
            const attrs = build.calculateWeaponAttributes(build.meleeWeapon)
            expect(attrs.weapon!.充盈转化).toBe(2.5)
            const overflow = Math.max(0, attrs.weapon!.触发 - 1)
            expect(attrs.充盈威力).toBeCloseTo(overflow * 2.5, 6)
        })

        it("充盈转化为武器属性（各自作用域），充盈威力为角色汇总属性", () => {
            const mkMod = (id: number, 类型: string, 触发: number, 充盈转化: number) =>
                new LeveledMod({
                    id,
                    icon: "Test01",
                    名称: "测试·充盈",
                    版本: "1.0",
                    系列: "测试",
                    品质: "金",
                    极性: "A",
                    耐受: 15,
                    类型,
                    触发,
                    充盈转化: 充盈转化,
                    效果: "测试用充盈转化MOD",
                })
            // 近战与远程武器都触发溢出，各武器槽 MOD 的充盈转化各自计入
            const build = new CharBuild({
                char: new LeveledChar("黎瑟"),
                hpPercent: 0.5,
                resonanceGain: 2,
                meleeMods: [mkMod(999903, "近战", 4, 1)],
                rangedMods: [mkMod(999904, "远程", 5, 1)],
                melee: new LeveledWeapon(10102),
                ranged: new LeveledWeapon(20601),
                baseName: "快速出击",
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance: 0.5,
                targetFunction: "[近战]",
            })
            const aMelee = build.calculateWeaponAttributes(build.meleeWeapon)
            const aRanged = build.calculateWeaponAttributes(build.rangedWeapon)
            const meleeOverflow = Math.max(0, aMelee.weapon!.触发 - 1)
            const rangedOverflow = Math.max(0, aRanged.weapon!.触发 - 1)
            expect(meleeOverflow).toBeGreaterThan(0)
            expect(rangedOverflow).toBeGreaterThan(0)

            // 充盈转化（武器属性）：近战/远程 MOD 的转化只作用于各自武器
            expect(aMelee.weapon!.充盈转化).toBe(2)
            expect(aRanged.weapon!.充盈转化).toBe(2)
            // 充盈威力（角色属性）= Σ 各武器溢出触发 × 该武器充盈转化，与武器上下文无关
            const expected = (meleeOverflow + rangedOverflow) * 2
            expect(aMelee.充盈威力).toBeCloseTo(expected, 6)
            expect(aRanged.充盈威力).toBeCloseTo(expected, 6)
        })

        it("武器槽 MOD 的充盈转化只计入该武器自身", () => {
            const mkMod = (id: number, 类型: string, 触发: number, 充盈转化: number) =>
                new LeveledMod({
                    id,
                    icon: "Test01",
                    名称: "测试·充盈",
                    版本: "1.0",
                    系列: "测试",
                    品质: "金",
                    极性: "A",
                    耐受: 15,
                    类型,
                    触发,
                    充盈转化: 充盈转化,
                    效果: "测试用充盈转化MOD",
                })
            // 仅近战 MOD 带充盈转化词条：近战武器转化 = 2，远程武器保留基础转化 = 1
            const build = new CharBuild({
                char: new LeveledChar("黎瑟"),
                hpPercent: 0.5,
                resonanceGain: 2,
                meleeMods: [mkMod(999903, "近战", 4, 1)],
                melee: new LeveledWeapon(10102),
                ranged: new LeveledWeapon(20601),
                baseName: "快速出击",
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance: 0.5,
                targetFunction: "[近战]",
            })
            const aMelee = build.calculateWeaponAttributes(build.meleeWeapon)
            const aRanged = build.calculateWeaponAttributes(build.rangedWeapon)
            expect(aMelee.weapon!.充盈转化).toBe(2)
            expect(aRanged.weapon!.充盈转化).toBe(1)
            // 充盈威力为角色汇总属性：近战溢出已计入，与武器上下文无关
            const expected = Math.max(0, aMelee.weapon!.触发 - 1) * 2
            expect(expected).toBeGreaterThan(0)
            expect(aMelee.充盈威力).toBeCloseTo(expected, 6)
            expect(aRanged.充盈威力).toBeCloseTo(expected, 6)
        })

        it("同律武器按自身作用域计算充盈转化", () => {
            const mkMod = (id: number, 类型: string, 触发: number, 充盈转化: number) =>
                new LeveledMod({
                    id,
                    icon: "Test01",
                    名称: "测试·充盈",
                    版本: "1.0",
                    系列: "测试",
                    品质: "金",
                    极性: "A",
                    耐受: 15,
                    类型,
                    触发,
                    充盈转化: 充盈转化,
                    效果: "测试用充盈转化MOD",
                })
            // 贝蕾妮卡：非继承同律武器 伊弥尔（同律近战 基础触发 0.5），同律近战 MOD 带充盈转化词条
            const build = new CharBuild({
                char: new LeveledChar("贝蕾妮卡"),
                hpPercent: 0.5,
                resonanceGain: 2,
                skillMods: [mkMod(999905, "同律近战", 4, 1)],
                melee: new LeveledWeapon(10302),
                ranged: new LeveledWeapon(20601),
                baseName: "伊弥尔",
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance: 0.5,
                targetFunction: "[同律]",
            })
            expect(build.skillWeapon).toBeDefined()
            const aSkill = build.calculateWeaponAttributes(build.skillWeapon!)
            const skillOverflow = Math.max(0, aSkill.weapon!.触发 - 1)
            expect(skillOverflow).toBeGreaterThan(0)
            expect(aSkill.weapon!.充盈转化).toBe(2)
            expect(aSkill.充盈威力).toBeCloseTo(skillOverflow * 2, 6)
            // 同律 MOD 不作用于近战武器：近战武器保留基础转化 = 1，但角色充盈威力汇总已含同律溢出
            const aMelee = build.calculateWeaponAttributes(build.meleeWeapon)
            expect(aMelee.weapon!.充盈转化).toBe(1)
            expect(aMelee.充盈威力).toBeCloseTo(aSkill.充盈威力, 6)
        })

        it("角色MOD的充盈威力加成与武器转化的充盈威力正常累加", () => {
            const mkMod = (id: number, 类型: string, 触发: number, 充盈转化: number) =>
                new LeveledMod({
                    id,
                    icon: "Test01",
                    名称: "测试·充盈",
                    版本: "1.0",
                    系列: "测试",
                    品质: "金",
                    极性: "A",
                    耐受: 15,
                    类型,
                    触发,
                    充盈转化: 充盈转化,
                    效果: "测试用充盈转化MOD",
                })
            // 携带角色 MOD（充盈威力 +1）+ 近战转化 MOD 使近战武器触发溢出
            const build = new CharBuild({
                char: new LeveledChar("黎瑟"),
                hpPercent: 0.5,
                resonanceGain: 2,
                charMods: [
                    new LeveledMod({
                        id: 999901,
                        icon: "Test01",
                        名称: "测试·充盈威力",
                        版本: "1.0",
                        系列: "测试",
                        品质: "金",
                        极性: "A",
                        耐受: 15,
                        类型: "角色",
                        充盈威力: 1,
                        效果: "测试用充盈威力MOD",
                    }),
                ],
                meleeMods: [mkMod(999903, "近战", 4, 1)],
                melee: new LeveledWeapon(10102),
                ranged: new LeveledWeapon(20601),
                baseName: "快速出击",
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance: 0.5,
                targetFunction: "[近战]",
            })
            const attrs = build.calculateWeaponAttributes(build.meleeWeapon)

            // 角色 MOD 提供充盈威力 +1（角色属性，经公共加成向量汇总）
            expect(build.calculateAttributes(true).充盈威力).toBe(1)
            // 武器转化 = 溢出触发 × 该武器充盈转化
            const weaponConverted = Math.max(0, attrs.weapon!.触发 - 1) * attrs.weapon!.充盈转化
            expect(weaponConverted).toBeGreaterThan(0)
            // 角色充盈威力 = 角色 MOD 加成 + 武器转化，正常累加
            expect(attrs.充盈威力).toBeCloseTo(1 + weaponConverted, 6)
            // AST 引用同样返回累加值
            expect(build.evaluateAST("充盈威力", attrs)).toBeCloseTo(attrs.充盈威力, 6)
        })

        it("getFullnessWeaponSources 返回各武器转化来源，合计等于武器转化充盈威力", () => {
            const mkMod = (id: number, 类型: string, 触发: number, 充盈转化: number) =>
                new LeveledMod({
                    id,
                    icon: "Test01",
                    名称: "测试·充盈",
                    版本: "1.0",
                    系列: "测试",
                    品质: "金",
                    极性: "A",
                    耐受: 15,
                    类型,
                    触发,
                    充盈转化: 充盈转化,
                    效果: "测试用充盈转化MOD",
                })
            // 近战与远程武器都触发溢出，且不携带角色 MOD 充盈威力加成，便于直接对账
            const build = new CharBuild({
                char: new LeveledChar("黎瑟"),
                hpPercent: 0.5,
                resonanceGain: 2,
                meleeMods: [mkMod(999903, "近战", 4, 1)],
                rangedMods: [mkMod(999904, "远程", 5, 1)],
                melee: new LeveledWeapon(10102),
                ranged: new LeveledWeapon(20601),
                baseName: "快速出击",
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance: 0.5,
                targetFunction: "[近战]",
            })
            const attrs = build.calculateWeaponAttributes(build.meleeWeapon)
            const sources = build.getFullnessWeaponSources()

            // 每个来源携带武器名称与贡献值，且与溢出触发 × 充盈转化一致
            expect(sources.length).toBeGreaterThan(0)
            for (const source of sources) {
                expect(source.weapon.名称).toBeTruthy()
                expect(source.value).toBeCloseTo(Math.max(0, source.triggerRate - 1) * source.conversionRate, 6)
            }
            // 至少近战武器贡献非零溢出转化
            expect(sources.some(source => source.value > 0)).toBe(true)
            // 武器转化来源合计 = 角色充盈威力（本构建无角色 MOD 充盈威力加成）
            const total = sources.reduce((sum, source) => sum + source.value, 0)
            expect(total).toBeCloseTo(attrs.充盈威力, 6)
        })

        it("技能字段带 tag 充盈 时，最终伤害应乘以 (1+充盈威力)", () => {
            const mkFullnessMod = (id: number, 充盈威力: number) =>
                new LeveledMod({
                    id,
                    icon: "Test01",
                    名称: "测试·充盈威力",
                    版本: "1.0",
                    系列: "测试",
                    品质: "金",
                    极性: "A",
                    耐受: 15,
                    类型: "角色",
                    充盈威力,
                    效果: "测试用充盈威力MOD",
                })
            const createBuild = (charMods: LeveledMod[]) =>
                new CharBuild({
                    char: new LeveledChar("法露茜"),
                    skillLevel: 10,
                    hpPercent: 1,
                    resonanceGain: 0,
                    charMods,
                    melee: new LeveledWeapon(10302),
                    ranged: new LeveledWeapon(20601),
                    baseName: "坠入黑渊",
                    enemyId: 130,
                    enemyLevel: 80,
                    enemyResistance: 0,
                    targetFunction: "充盈伤害",
                })
            // 无充盈威力：充盈字段按原倍率结算
            const baseBuild = createBuild([])
            expect(baseBuild.calculateWeaponAttributes().充盈威力).toBe(0)
            const baseFullnessDamage = baseBuild.calculateTargetFunction(undefined, "充盈伤害")
            const baseAdditionalDamage = baseBuild.calculateTargetFunction(undefined, "附加伤害")
            const baseNormalDamage = baseBuild.calculateTargetFunction(undefined, "伤害")
            expect(baseFullnessDamage).toBeGreaterThan(0)

            // 角色 MOD 提供充盈威力 +1：带 充盈 tag 的字段伤害 × (1+1) = ×2，未带 tag 的字段不变
            const buffedBuild = createBuild([mkFullnessMod(999901, 1)])
            expect(buffedBuild.calculateWeaponAttributes().充盈威力).toBe(1)
            const buffedFullnessDamage = buffedBuild.calculateTargetFunction(undefined, "充盈伤害")
            const buffedAdditionalDamage = buffedBuild.calculateTargetFunction(undefined, "附加伤害")
            const buffedNormalDamage = buffedBuild.calculateTargetFunction(undefined, "伤害")

            expect(buffedFullnessDamage / baseFullnessDamage).toBeCloseTo(2, 6)
            expect(buffedAdditionalDamage / baseAdditionalDamage).toBeCloseTo(2, 6)
            // 未带 充盈 tag 的伤害字段不受充盈威力加成
            expect(buffedNormalDamage / baseNormalDamage).toBeCloseTo(1, 6)

            // 成员访问（如无血量因数 .N）同样整体乘以 (1+充盈威力)
            const buffedNoHp = buffedBuild.calculateTargetFunction(undefined, "充盈伤害.N")
            const baseNoHp = baseBuild.calculateTargetFunction(undefined, "充盈伤害.N")
            expect(buffedNoHp / baseNoHp).toBeCloseTo(2, 6)
        })

        it("转充盈 覆盖技能伤害：非充盈技能字段按 1 + 转充盈×充盈威力 加成", () => {
            // 法露茜「坠入黑渊」的「伤害」为技能伤害（经 calculateSkillDamage 结算），验证 转充盈 在字段层统一生效
            const build = new CharBuild({
                char: new LeveledChar("法露茜"),
                skillLevel: 10,
                hpPercent: 1,
                resonanceGain: 0,
                melee: new LeveledWeapon(10302),
                ranged: new LeveledWeapon(20601),
                baseName: "坠入黑渊",
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance: 0,
                targetFunction: "伤害",
            })
            const F = build.calculateWeaponAttributes().充盈威力 || 0
            const base = build.evaluateAST("伤害")
            const full = build.evaluateAST("伤害{转充盈:1,充盈威力:1}")
            const half = build.evaluateAST("伤害{转充盈:0.5,充盈威力:1}")
            expect(full).toBeCloseTo(base * (1 + (F + 1)), 3)
            expect(half).toBeCloseTo(base * (1 + 0.5 * (F + 1)), 3)
        })

        it("转充盈 与 充盈 tag 互斥：已带 tag 的字段不重复计乘", () => {
            // 「充盈伤害」字段自带 tag ["充盈"]，本身已整体 ×(1+充盈威力)，叠加 转充盈 不应再次计乘
            const build = new CharBuild({
                char: new LeveledChar("法露茜"),
                skillLevel: 10,
                hpPercent: 1,
                resonanceGain: 0,
                melee: new LeveledWeapon(10302),
                ranged: new LeveledWeapon(20601),
                baseName: "坠入黑渊",
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance: 0,
                targetFunction: "充盈伤害",
            })
            const tagged = build.evaluateAST("充盈伤害{充盈威力:1}")
            const taggedPlusConvert = build.evaluateAST("充盈伤害{转充盈:1,充盈威力:1}")
            expect(tagged).toBeGreaterThan(0)
            expect(taggedPlusConvert).toBeCloseTo(tagged, 3)
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

        it("近战MOD的蓄力增伤不应该穿透到同律武器（莉兹贝尔同律大剑）", () => {
            // MOD 52011「盛怒·蓄势」是近战MOD（蓄力增伤 0.33），装在近战武器上时，
            // 不应穿透加成到莉兹贝尔的同律大剑「萨麦尔」（同律近战 重剑）的蓄力攻击。
            // 根因：MOD 与 BUFF 作用域不同——前缀降级（近战→同律近战）对 BUFF/武器效果行得通，
            // 但 MOD 只作用于自身槽位（仅 attrAllowCharToWeapon 属性可跨作用域），不随降级穿透。
            const makeBuild = (withMod: boolean) =>
                new CharBuild({
                    char: new LeveledChar("莉兹贝尔"),
                    hpPercent: 0.5,
                    resonanceGain: 2,
                    meleeMods: withMod ? [new LeveledMod(52011)] : [],
                    rangedMods: [],
                    skillMods: [],
                    buffs: [],
                    melee: new LeveledWeapon(10302),
                    ranged: new LeveledWeapon(20601),
                    baseName: "萨麦尔", // 莉兹贝尔同律大剑（同律近战 重剑）
                    enemyId: 130,
                    enemyLevel: 80,
                    enemyResistance: 0.5,
                    targetFunction: "蓄力攻击伤害",
                    skillLevel: 10,
                })

            const baseBuild = makeBuild(false)
            const buffedBuild = makeBuild(true)

            expect(buffedBuild.skillWeapon?.名称).toBe("萨麦尔")
            // 同律武器蓄力字段的细分增伤应完全为 0（不继承近战武器上的该MOD）
            const skillBonus = (buffedBuild as any).getWeaponAttackTypeBonus("同律近战", "萨麦尔", "蓄力攻击伤害", "增伤")
            expect(skillBonus).toBe(0)
            // 端到端伤害应完全一致
            expect(buffedBuild.calculate()).toBeCloseTo(baseBuild.calculate(), 6)
        })

        it("近战MOD的蓄力增伤应该作用于近战武器自身的蓄力攻击", () => {
            // 同款 MOD 52011 装在近战武器上时，应正常加成近战武器自身（铸铁者）的蓄力攻击。
            const makeBuild = (withMod: boolean) =>
                new CharBuild({
                    char: new LeveledChar("莉兹贝尔"),
                    hpPercent: 0.5,
                    resonanceGain: 2,
                    meleeMods: withMod ? [new LeveledMod(52011)] : [],
                    rangedMods: [],
                    skillMods: [],
                    buffs: [],
                    melee: new LeveledWeapon(10302),
                    ranged: new LeveledWeapon(20601),
                    baseName: "蓄力攻击",
                    enemyId: 130,
                    enemyLevel: 80,
                    enemyResistance: 0.5,
                    targetFunction: "蓄力攻击伤害",
                    skillLevel: 10,
                })

            const baseBuild = makeBuild(false)
            const buffedBuild = makeBuild(true)

            // 近战武器蓄力字段的细分增伤应包含 MOD 52011 的满级蓄力增伤 0.33
            const meleeBonus = (buffedBuild as any).getWeaponAttackTypeBonus("近战", "蓄力攻击", "蓄力攻击伤害", "增伤")
            expect(meleeBonus).toBeCloseTo(0.33, 10)
            expect(buffedBuild.calculate()).toBeGreaterThan(baseBuild.calculate())
        })

        it("BUFF的近战蓄力增伤应通过前缀降级作用到同律武器", () => {
            // 与 MOD 不同：角色BUFF（如棘刺绝响5熔）的近战蓄力增伤允许前缀降级到同律近战武器，
            // 即使近战武器上同时装有 MOD 52011（该MOD本身不穿透到同律武器）。
            const makeBuild = (withBuff: boolean) =>
                new CharBuild({
                    char: new LeveledChar("莉兹贝尔"),
                    hpPercent: 0.5,
                    resonanceGain: 2,
                    meleeMods: [new LeveledMod(52011)],
                    rangedMods: [],
                    skillMods: [],
                    buffs: withBuff ? [new LeveledBuff({ 名称: "测试近战蓄力降级", 描述: "测试用", 近战蓄力增伤: 1 })] : [],
                    melee: new LeveledWeapon(10302),
                    ranged: new LeveledWeapon(20601),
                    baseName: "萨麦尔", // 莉兹贝尔同律大剑（同律近战 重剑）
                    enemyId: 130,
                    enemyLevel: 80,
                    enemyResistance: 0.5,
                    targetFunction: "蓄力攻击伤害",
                    skillLevel: 10,
                })

            const baseBuild = makeBuild(false)
            const buffedBuild = makeBuild(true)

            // BUFF 的近战蓄力增伤 1（+100%）通过前缀降级作用到同律武器，蓄力伤害应翻倍
            expect(buffedBuild.calculate()).toBeCloseTo(baseBuild.calculate() * 2, 6)
        })

        it("自定义MOD带多作用域蓄力属性时只吃自身作用域加成", () => {
            // 同一自定义MOD同时携带 同律近战蓄力增伤 / 近战蓄力增伤 / 蓄力增伤（各1）：
            // - 装在同律近战槽时，同律武器吃到 同律近战蓄力增伤 + 近战蓄力增伤 + 蓄力增伤 = 3；
            //   同律槽位 MOD 直接作用于同律武器自身，其下位作用域（近战蓄力增伤）同样生效。
            // - 装在近战槽时，同律武器完全吃不到（近战MOD不随前缀降级穿透到同律武器，修复点）。
            const mkMod = (id: number, 类型: string) =>
                new LeveledMod({
                    id,
                    icon: "Test01",
                    名称: "测试·蓄势",
                    版本: "1.0",
                    系列: "测试",
                    品质: "金",
                    极性: "A",
                    耐受: 15,
                    类型,
                    效果: "测试用",
                    同律近战蓄力增伤: 1,
                    近战蓄力增伤: 1,
                    蓄力增伤: 1,
                })

            const makeBuild = (slot: "skill" | "melee") =>
                new CharBuild({
                    char: new LeveledChar("莉兹贝尔"),
                    hpPercent: 0.5,
                    resonanceGain: 2,
                    meleeMods: slot === "melee" ? [mkMod(999991, "近战")] : [],
                    rangedMods: [],
                    skillMods: slot === "skill" ? [mkMod(999992, "同律近战")] : [],
                    buffs: [],
                    melee: new LeveledWeapon(10302),
                    ranged: new LeveledWeapon(20601),
                    baseName: "萨麦尔", // 莉兹贝尔同律大剑（同律近战 重剑）
                    enemyId: 130,
                    enemyLevel: 80,
                    enemyResistance: 0.5,
                    targetFunction: "蓄力攻击伤害",
                    skillLevel: 10,
                })

            // 同律近战槽：吃到 同律近战蓄力增伤 + 近战蓄力增伤 + 蓄力增伤 = 3
            const skillBonus = (makeBuild("skill") as any).getWeaponAttackTypeBonus("同律近战", "萨麦尔", "蓄力攻击伤害", "增伤")
            expect(skillBonus).toBe(3)
            // 近战槽：完全不穿透到同律武器
            const meleeBonus = (makeBuild("melee") as any).getWeaponAttackTypeBonus("同律近战", "萨麦尔", "蓄力攻击伤害", "增伤")
            expect(meleeBonus).toBe(0)
        })

        it("攻击类型应由字段 tag 判定", () => {
            const getPrefixFromTags = (tags?: string[]) => (charBuild as any).getWeaponAttackTypePrefixFromTags(tags)
            // tag 含「普攻」→ 普攻
            expect(getPrefixFromTags(["近战", "武器", "普攻"])).toBe("普攻")
            // tag 含「下落攻击」→ 下落（不再通过字段名"二段伤害"误判为普攻）
            expect(getPrefixFromTags(["近战", "武器", "下落攻击"])).toBe("下落")
            // tag 含「蓄力攻击」→ 蓄力
            expect(getPrefixFromTags(["近战", "武器", "蓄力攻击"])).toBe("蓄力")
            // tag 不含攻击类型（如纯技能字段、骑乘攻击）→ undefined
            expect(getPrefixFromTags(["技能", "战技"])).toBeUndefined()
            expect(getPrefixFromTags(["近战词条", "技能"])).toBeUndefined()
            // 同律武器「视为」声明的攻击类型（如 视为: "下落攻击"）
            expect(getPrefixFromTags(["下落攻击"])).toBe("下落")
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
            const b = charBuild.meleeWeapon.技能!.find(x => x.名称 === "普通攻击")!.字段.find(x => x.名称.includes("伤害"))!.值! //  一段伤害: "120.0%",
            expect(b).toBe(1.2)
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
            expect(build.validateAST("[攻击]{转充盈:1}")).toBeUndefined()
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

        // 转物理（转切割/转贯穿/转震荡/转灾厄）对技能伤害同样生效：转换出的分量按对应物理子类结算，
        // 物理伤害不受敌人元素抗性影响 → 100% 转换后伤害与敌人抗性无关。
        for (const key of ["转切割", "转贯穿", "转震荡", "转灾厄"] as const) {
            it(`技能伤害{${key}:1} 100%转物理后不受敌人抗性影响（夫人 E::伤害 0抗/正抗/负抗一致）`, () => {
                const attrs = ladyBuild(0).calculateAttributes()
                const base = ladyBuild(0).evaluateAST("E::伤害", attrs)
                const expr = `E::伤害{${key}:1}`
                // 0.5 强抗 与 -4 弱抗下均与 0 抗基准一致（不再乘抗性因子 0.5 / 5）
                expect(ladyBuild(0.5).evaluateAST(expr, attrs)).toBeCloseTo(base, 6)
                expect(ladyBuild(-4).evaluateAST(expr, attrs)).toBeCloseTo(base, 6)
            })
        }

        it("技能伤害部分转物理：{转震荡:0.5} 未转换部分按原抗性、转换部分不受抗性（夫人 E::伤害）", () => {
            const attrs = ladyBuild(0).calculateAttributes()
            const base = ladyBuild(0).evaluateAST("E::伤害", attrs)
            // 0.5 强抗：未转换 0.5×0.5 + 转震荡 0.5×1 = 0.75 倍
            expect(ladyBuild(0.5).evaluateAST("E::伤害{转震荡:0.5}", attrs)).toBeCloseTo(base * 0.75, 6)
            // -4 弱抗：未转换 0.5×5 + 转震荡 0.5×1 = 3 倍
            expect(ladyBuild(-4).evaluateAST("E::伤害{转震荡:0.5}", attrs)).toBeCloseTo(base * 3, 6)
        })

        it("技能伤害转物理后 物理/元素 访问器按结算类型拆分（夫人 E::伤害）", () => {
            const attrs = ladyBuild(0).calculateAttributes()
            const base = ladyBuild(0).evaluateAST("E::伤害", attrs)
            // 100% 转震荡：物理=合计、元素≈0
            const total = ladyBuild(0.5).evaluateAST("E::伤害{转震荡:1}", attrs)
            expect(ladyBuild(0.5).evaluateAST("E::伤害{转震荡:1}.物理", attrs)).toBeCloseTo(total, 6)
            expect(ladyBuild(0.5).evaluateAST("E::伤害{转震荡:1}.元素", attrs)).toBeCloseTo(0, 6)
            // 50% 转震荡（0.5 强抗）：物理=0.5×base、元素=0.25×base，合计=0.75×base
            const phys = ladyBuild(0.5).evaluateAST("E::伤害{转震荡:0.5}.物理", attrs)
            const elem = ladyBuild(0.5).evaluateAST("E::伤害{转震荡:0.5}.元素", attrs)
            expect(phys).toBeCloseTo(base * 0.5, 6)
            expect(elem).toBeCloseTo(base * 0.25, 6)
            expect(phys + elem).toBeCloseTo(base * 0.75, 6)
        })

        it("技能伤害 转物理 与 转属克 共享转换池（夫人 E::伤害）", () => {
            const attrs = ladyBuild(0).calculateAttributes()
            const base = ladyBuild(0).evaluateAST("E::伤害", attrs)
            const exprA = "E::伤害{转震荡:1,转属克:1}"
            const exprB = "E::伤害{转震荡:0.5,转属克:0.5}"
            // 0.5 强抗：转震荡 0.5×1（不受抗性）+ 属克 0.5×5（翻转抗性 -4）= 3 倍
            expect(ladyBuild(0.5).evaluateAST(exprA, attrs)).toBeCloseTo(base * 3, 5)
            // 合计转换比例 >1 时等比重压缩，与各占 0.5 完全等价
            expect(ladyBuild(0.5).evaluateAST(exprA, attrs)).toBeCloseTo(ladyBuild(0.5).evaluateAST(exprB, attrs), 5)
        })

        it("技能伤害转物理后吃 物理增伤、不吃 元素增伤（夫人 E::伤害）", () => {
            const attrs = ladyBuild(0).calculateAttributes()
            const base = ladyBuild(0).evaluateAST("E::伤害", attrs)
            // 100% 转震荡：分量按物理结算 → 元素增伤 不放大、物理增伤 全额放大
            expect(ladyBuild(0.5).evaluateAST("E::伤害{转震荡:1,元素增伤:0.5}", attrs)).toBeCloseTo(base, 6)
            expect(ladyBuild(0.5).evaluateAST("E::伤害{转震荡:1,物理增伤:0.5}", attrs)).toBeCloseTo(base * 1.5, 6)
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

    describe("强制属性运算符 ! 测试", () => {
        it("应该解析命名空间属性的 ! 后缀", () => {
            const ast = parseAST("e::攻击!")
            expect(ast.type).toBe("property")
            const propNode = ast as ASTProperty
            expect(propNode.name).toBe("攻击")
            expect(propNode.namespace).toBe("e")
            expect(propNode.forceAttr).toBe(true)
        })

        it("应该解析无命名空间属性的 ! 后缀", () => {
            const ast = parseAST("攻击!") as ASTProperty
            expect(ast.type).toBe("property")
            expect(ast.name).toBe("攻击")
            expect(ast.namespace).toBeUndefined()
            expect(ast.forceAttr).toBe(true)
        })

        it("不带 ! 的属性 forceAttr 应为空", () => {
            const ast = parseAST("攻击") as ASTProperty
            expect(ast.forceAttr).toBeUndefined()
        })

        it("! 后缀应该与运算符组合解析", () => {
            const ast = parseAST("攻击! * 2") as ASTBinary
            expect(ast.type).toBe("binary")
            const left = ast.left as ASTProperty
            expect(left.name).toBe("攻击")
            expect(left.forceAttr).toBe(true)
        })

        function forceBuild() {
            // 贝蕾妮卡的 Q 技能「冥焰」字段含「蓄力攻击伤害」，会挤占 q::攻击 的属性查询
            return new CharBuild({
                char: new LeveledChar("贝蕾妮卡"),
                skillLevel: 10,
                hpPercent: 1,
                resonanceGain: 0,
                melee: new LeveledWeapon(10302),
                ranged: new LeveledWeapon(20601),
                baseName: "冥焰",
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance: 0,
                targetFunction: "攻击",
            })
        }

        it("! 后缀强制返回攻击属性而非匹配到的技能字段", () => {
            const build = forceBuild()
            const attrs = build.calculateWeaponAttributes()

            // 未加 ! 时 q::攻击 命中「蓄力攻击伤害」技能字段
            expect(build.evaluateAST("q::攻击", attrs)).not.toBeCloseTo(attrs.攻击, 0)
            // 加 ! 后强制返回攻击属性值
            expect(build.evaluateAST("q::攻击!", attrs)).toBeCloseTo(attrs.攻击, 6)
            // 无命名空间时同理：冥焰 字段含「攻击」，! 强制返回攻击属性
            expect(build.evaluateAST("攻击", attrs)).not.toBeCloseTo(attrs.攻击, 0)
            expect(build.evaluateAST("攻击!", attrs)).toBeCloseTo(attrs.攻击, 6)
        })

        it("! 后缀应通过表达式校验且不影响普通属性校验", () => {
            const build = forceBuild()
            expect(build.validateAST("q::攻击!")).toBeUndefined()
            expect(build.validateAST("攻击!")).toBeUndefined()
            expect(build.validateAST("攻击! * 2")).toBeUndefined()
            expect(build.validateAST("q::不存在!")).toContain("找不到标识符")
        })

        it("角色:: 命名空间 + ! 后缀应解析为角色属性", () => {
            const build = forceBuild()
            const attrs = build.calculateWeaponAttributes()
            // 角色::攻击! 命中角色属性「攻击」
            expect(build.evaluateAST("角色::攻击!", attrs)).toBeCloseTo(attrs.攻击, 6)
            expect(build.validateAST("角色::攻击!")).toBeUndefined()
            expect(build.validateAST("角色::不存在!")).toContain("找不到标识符")
        })
    })

    describe("自定义函数测试", () => {
        it("应该支持 fn(x)=x*2 并在目标函数中调用 fn(2)", () => {
            charBuild.customVariables = [["fn(x)", "x*2"]]
            const result = charBuild.evaluateAST("fn(2)", testAttrs)

            expect(result).toBe(4)
        })

        it("应该支持多参数函数", () => {
            charBuild.customVariables = [["g(a, b)", "a + b * 10"]]
            const result = charBuild.evaluateAST("g(1, 2)", testAttrs)

            expect(result).toBe(21)
        })

        it("函数体应该能引用角色属性", () => {
            charBuild.customVariables = [["f(x)", "x * 攻击"]]
            const baseAttack = charBuild.evaluateAST("攻击", testAttrs)
            const result = charBuild.evaluateAST("f(2)", testAttrs)

            expect(result).toBeCloseTo(2 * baseAttack, 6)
        })

        it("函数体应该能引用其他自定义函数", () => {
            charBuild.customVariables = [
                ["double(x)", "x*2"],
                ["quad(x)", "double(double(x))"],
            ]
            const result = charBuild.evaluateAST("quad(3)", testAttrs)

            expect(result).toBe(12)
        })

        it("函数体应该能引用自定义变量", () => {
            charBuild.customVariables = [
                ["加成", "2"],
                ["fn(x)", "x + 加成"],
            ]
            const result = charBuild.evaluateAST("fn(3)", testAttrs)

            expect(result).toBe(5)
        })

        it("自定义函数应该能被普通变量表达式引用", () => {
            charBuild.customVariables = [
                ["fn(x)", "x*2"],
                ["total", "fn(5)"],
            ]
            const result = charBuild.evaluateAST("total", testAttrs)

            expect(result).toBe(10)
        })

        it("函数结果应该能参与算术运算", () => {
            charBuild.customVariables = [["fn(x)", "x*2"]]
            const result = charBuild.evaluateAST("fn(3) + fn(4)", testAttrs)

            expect(result).toBe(14)
        })

        it("函数参数同名时应优先于属性解析", () => {
            // 攻击 既是角色属性又是函数参数，函数体内应以参数绑定值为准
            charBuild.customVariables = [["fn(攻击)", "攻击*2"]]
            const result = charBuild.evaluateAST("fn(7)", testAttrs)

            expect(result).toBe(14)
        })

        it("递归定义应安全返回 0 而不死循环", () => {
            charBuild.customVariables = [["fn(x)", "fn(x)"]]
            const result = charBuild.evaluateAST("fn(1)", testAttrs)

            expect(result).toBe(0)
        })

        it("参数数量不匹配时应抛错", () => {
            charBuild.customVariables = [["fn(x, y)", "x+y"]]
            expect(() => charBuild.evaluateAST("fn(1)", testAttrs)).toThrow("参数")
        })

        it("未知函数应抛错", () => {
            charBuild.customVariables = []
            expect(() => charBuild.evaluateAST("unknownFn(1)", testAttrs)).toThrow("未知的函数")
        })

        it("validateAST 应允许自定义函数调用", () => {
            charBuild.customVariables = [["fn(x)", "x*2"]]
            expect(charBuild.validateAST("fn(2)")).toBeUndefined()
            expect(charBuild.validateAST("fn(2) * 伤害")).toBeUndefined()
        })

        it("validateAST 应拒绝未知函数", () => {
            charBuild.customVariables = [["fn(x)", "x*2"]]
            expect(charBuild.validateAST("unknownFn(2)")).toContain("未知函数")
        })

        it("validateAST 应拒绝自定义函数参数数量不匹配", () => {
            charBuild.customVariables = [["fn(x, y)", "x+y"]]
            expect(charBuild.validateAST("fn(1)")).toContain("参数数量不符")
        })

        it("validateAST 应校验自定义函数体合法性", () => {
            charBuild.customVariables = [["fn(x)", "x*不存在"]]
            expect(charBuild.validateAST("fn(2)")).toContain('函数 "fn" 定义错误')
        })

        it("validateCustomVariable 应接受函数定义", () => {
            charBuild.customVariables = []
            expect(charBuild.validateCustomVariable("fn(x)", "x*2")).toBeUndefined()
        })

        it("validateCustomVariable 应拒绝重复参数", () => {
            charBuild.customVariables = []
            expect(charBuild.validateCustomVariable("fn(x, x)", "x*2")).toContain("参数重复")
        })

        it("validateCustomVariable 应拒绝非法参数名", () => {
            charBuild.customVariables = []
            expect(charBuild.validateCustomVariable("fn(x y)", "x*2")).toContain("不合法")
        })

        it("evaluateCustomVariableDefinition 应以示例参数预览函数结果", () => {
            charBuild.customVariables = []
            const result = charBuild.evaluateCustomVariableDefinition("fn(x)", "x*2")

            expect(result).toBe(2) // 示例参数 x=1
        })

        it("getValidCustomVariables 应排除函数定义", () => {
            charBuild.customVariables = [
                ["a", "1"],
                ["fn(x)", "x*2"],
            ]
            // 通过 evaluateAST 验证：普通变量 a 可解析，函数定义名 fn 不作为普通变量使用
            expect(charBuild.evaluateAST("a", testAttrs)).toBe(1)
            expect(charBuild.validateAST("fn")).toContain("找不到标识符")
        })
    })
})
