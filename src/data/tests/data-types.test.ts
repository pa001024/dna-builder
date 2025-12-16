import { describe, it, expect } from "vitest"
import gameData from "../data.json"
import achievementData from "../achievement.json"

// 测试数据类型的完整性和有效性
describe("数据类型测试", () => {
    // 游戏数据测试
    describe("游戏数据完整性测试", () => {
        it("应该包含角色数据", () => {
            expect(gameData.char).toBeDefined()
            expect(Array.isArray(gameData.char)).toBe(true)
            expect(gameData.char.length).toBeGreaterThan(0)
        })

        it("应该包含MOD数据", () => {
            expect(gameData.mod).toBeDefined()
            expect(Array.isArray(gameData.mod)).toBe(true)
            expect(gameData.mod.length).toBeGreaterThan(0)
        })

        it("应该包含武器数据", () => {
            expect(gameData.weapon).toBeDefined()
            expect(Array.isArray(gameData.weapon)).toBe(true)
            expect(gameData.weapon.length).toBeGreaterThan(0)
        })

        it("应该包含武器基础数据", () => {
            expect(gameData.base).toBeDefined()
            expect(Array.isArray(gameData.base)).toBe(true)
            expect(gameData.base.length).toBeGreaterThan(0)
        })

        it("应该包含BUFF数据", () => {
            expect(gameData.buff).toBeDefined()
            expect(Array.isArray(gameData.buff)).toBe(true)
            expect(gameData.buff.length).toBeGreaterThan(0)
        })

        it("应该包含敌人数据", () => {
            expect(gameData.mob).toBeDefined()
            expect(Array.isArray(gameData.mob)).toBe(true)
            expect(gameData.mob.length).toBeGreaterThan(0)
        })
    })

    // 角色数据测试
    describe("角色数据测试", () => {
        it("角色应该包含必要属性", () => {
            const sampleChar = gameData.char[0]

            expect(sampleChar).toBeDefined()
            expect(sampleChar.名称).toBeDefined()
            expect(typeof sampleChar.名称).toBe("string")

            expect(sampleChar.基础攻击).toBeDefined()
            expect(typeof sampleChar.基础攻击).toBe("number")

            expect(sampleChar.基础生命).toBeDefined()
            expect(typeof sampleChar.基础生命).toBe("number")

            expect(sampleChar.基础护盾).toBeDefined()
            expect(typeof sampleChar.基础护盾).toBe("number")

            expect(sampleChar.基础防御).toBeDefined()
            expect(typeof sampleChar.基础防御).toBe("number")

            expect(sampleChar.基础神智).toBeDefined()
            expect(typeof sampleChar.基础神智).toBe("number")
        })

        it("角色应该有标识符", () => {
            gameData.char.forEach((char) => {
                // 角色应该有名称或id作为标识符
                expect(char.名称).toBeDefined()
                expect(typeof char.名称).toBe("string")
                expect(char.名称.length).toBeGreaterThan(0)
            })
        })

        it("角色属性应该是有效数值", () => {
            gameData.char.forEach((char) => {
                expect(char.基础攻击).toBeGreaterThan(0)
                expect(char.基础生命).toBeGreaterThan(0)
                expect(char.基础护盾).toBeGreaterThanOrEqual(0)
                expect(char.基础防御).toBeGreaterThan(0)
                expect(char.基础神智).toBeGreaterThan(0)
            })
        })
    })

    // MOD数据测试
    describe("MOD数据测试", () => {
        it("MOD应该包含基本属性", () => {
            const sampleMod = gameData.mod[0]

            expect(sampleMod).toBeDefined()
            expect(sampleMod.id).toBeDefined()
            expect(typeof sampleMod.id).toBe("number")

            expect(sampleMod.名称).toBeDefined()
            expect(typeof sampleMod.名称).toBe("string")
        })

        it("MOD应该有ID和名称", () => {
            gameData.mod.forEach((mod) => {
                expect(mod.id).toBeDefined()
                expect(typeof mod.id).toBe("number")

                expect(mod.名称).toBeDefined()
                expect(typeof mod.名称).toBe("string")
                expect(mod.名称.length).toBeGreaterThan(0)
            })
        })
    })

    // 武器数据测试
    describe("武器数据测试", () => {
        it("武器应该包含基本属性", () => {
            const sampleWeapon = gameData.weapon[0]

            expect(sampleWeapon).toBeDefined()
            expect(sampleWeapon.名称).toBeDefined()
            expect(typeof sampleWeapon.名称).toBe("string")

            expect(sampleWeapon.基础攻击).toBeDefined()
            expect(typeof sampleWeapon.基础攻击).toBe("number")
        })

        it("武器应该有名称和基础类型", () => {
            gameData.weapon.forEach((weapon) => {
                expect(weapon.名称).toBeDefined()
                expect(typeof weapon.名称).toBe("string")
                expect(weapon.名称.length).toBeGreaterThan(0)

                expect(weapon.基础攻击).toBeDefined()
                expect(typeof weapon.基础攻击).toBe("number")
                expect(weapon.基础攻击).toBeGreaterThan(0)
            })
        })

        it("武器应该有基础属性", () => {
            gameData.weapon.forEach((weapon) => {
                expect(weapon.基础攻击).toBeDefined()
                expect(typeof weapon.基础攻击).toBe("number")
                expect(weapon.基础攻击).toBeGreaterThan(0)
            })
        })
    })

    // 武器基础数据测试
    describe("武器基础数据测试", () => {
        it("武器基础应该包含基本属性", () => {
            const sampleBase = gameData.base[0]

            expect(sampleBase).toBeDefined()
            expect(sampleBase.名称).toBeDefined()
            expect(typeof sampleBase.名称).toBe("string")
        })

        it("武器基础应该有名称", () => {
            gameData.base.forEach((base) => {
                expect(base.名称).toBeDefined()
                expect(typeof base.名称).toBe("string")
                expect(base.名称.length).toBeGreaterThan(0)
            })
        })

        it("武器基础应该有倍率或攻击数据", () => {
            gameData.base.forEach((base) => {
                // 检查是否有倍率或攻击相关数据
                const hasData = base.倍率 !== undefined
                expect(hasData).toBe(true)
            })
        })
    })

    // BUFF数据测试
    describe("BUFF数据测试", () => {
        it("BUFF应该包含必要属性", () => {
            const sampleBuff = gameData.buff[0]

            expect(sampleBuff).toBeDefined()
            expect(sampleBuff.名称).toBeDefined()
            expect(typeof sampleBuff.名称).toBe("string")

            expect(sampleBuff.描述).toBeDefined()
            expect(typeof sampleBuff.描述).toBe("string")
        })

        it("BUFF应该有名称", () => {
            gameData.buff.forEach((buff) => {
                expect(buff.名称).toBeDefined()
                expect(typeof buff.名称).toBe("string")
                expect(buff.名称.length).toBeGreaterThan(0)
            })
        })

        it("BUFF属性应该是有效数值", () => {
            gameData.buff.forEach((buff) => {
                // 检查所有可能的数值属性
                const numericProperties = [
                    "攻击",
                    "生命",
                    "护盾",
                    "防御",
                    "神智",
                    "威力",
                    "耐久",
                    "效益",
                    "范围",
                    "昂扬",
                    "背水",
                    "增伤",
                    "独立增伤",
                    "武器伤害",
                    "技能伤害",
                    "暴击",
                    "暴伤",
                    "攻速",
                    "多重",
                    "追加伤害",
                    "属性穿透",
                    "无视防御",
                    "固定攻击",
                    "技能速度",
                ]

                numericProperties.forEach((prop) => {
                    if ((buff as any)[prop] !== undefined) {
                        expect(typeof (buff as any)[prop]).toBe("number")
                    }
                })
            })
        })
    })

    // 敌人数据测试
    describe("敌人数据测试", () => {
        it("敌人应该包含必要属性", () => {
            const sampleMob = gameData.mob[0]

            expect(sampleMob).toBeDefined()
            expect(sampleMob.名称).toBeDefined()
            expect(typeof sampleMob.名称).toBe("string")

            expect(sampleMob.类型).toBeDefined()
            expect(typeof sampleMob.类型).toBe("string")
        })

        it("敌人类型应该是有效值", () => {
            const validTypes = ["小型", "大型", "首领"]

            gameData.mob.forEach((mob) => {
                expect(validTypes).toContain(mob.类型)
            })
        })
    })

    // 成就数据测试
    describe("成就数据测试", () => {
        it("应该包含成就数据", () => {
            expect(achievementData).toBeDefined()
            expect(typeof achievementData).toBe("object")
        })

        it("成就数据应该有正确的结构", () => {
            expect(achievementData).toBeDefined()
            expect(Array.isArray(achievementData)).toBe(true)

            if (achievementData.length > 0) {
                const sampleAchievement = achievementData[0]
                expect(sampleAchievement.名称).toBeDefined()
                expect(typeof sampleAchievement.名称).toBe("string")

                expect(sampleAchievement.描述).toBeDefined()
                expect(typeof sampleAchievement.描述).toBe("string")
            }
        })
    })

    // 数据一致性测试
    describe("数据一致性测试", () => {
        it("MOD应该引用有效的角色或武器", () => {
            const charNames = gameData.char.map((c) => c.名称)
            const weaponNames = gameData.weapon.map((w) => w.名称)
            const weaponTypes = [...new Set(gameData.weapon.map((w) => w.类别))]
            const allNames = [...charNames, ...weaponNames, ...weaponTypes, "切割", "贯穿", "震荡"]

            gameData.mod.forEach((mod) => {
                if (mod.限定) {
                    expect(allNames).toContain(mod.限定)
                }
            })
        })

        it("BUFF应该引用有效的角色", () => {
            const charNames = gameData.char.map((c) => c.名称)

            gameData.buff.forEach((buff) => {
                if (buff.限定) {
                    expect(charNames).toContain(buff.限定)
                }
            })
        })
    })

    // 数据导出测试
    describe("数据导出测试", () => {
        it("应该能够序列化游戏数据", () => {
            const jsonString = JSON.stringify(gameData)
            expect(typeof jsonString).toBe("string")
            expect(jsonString.length).toBeGreaterThan(0)

            // 应该能够反序列化
            const parsedData = JSON.parse(jsonString)
            expect(parsedData).toBeDefined()
            expect(parsedData.char).toBeDefined()
        })

        it("应该能够序列化成就数据", () => {
            const jsonString = JSON.stringify(achievementData)
            expect(typeof jsonString).toBe("string")
            expect(jsonString.length).toBeGreaterThan(0)

            // 应该能够反序列化
            const parsedData = JSON.parse(jsonString)
            expect(parsedData).toBeDefined()
        })
    })

    // 性能测试
    describe("性能测试", () => {
        it("应该能够快速访问所有数据", () => {
            const startTime = performance.now()

            // 访问所有数据
            const charCount = gameData.char.length
            const modCount = gameData.mod.length
            const weaponCount = gameData.weapon.length
            const buffCount = gameData.buff.length
            const mobCount = gameData.mob.length

            const endTime = performance.now()
            const duration = endTime - startTime

            // 数据访问应该在合理时间内完成
            expect(duration).toBeLessThan(100) // 100毫秒内完成

            // 验证数据数量
            expect(charCount).toBeGreaterThan(0)
            expect(modCount).toBeGreaterThan(0)
            expect(weaponCount).toBeGreaterThan(0)
            expect(buffCount).toBeGreaterThan(0)
            expect(mobCount).toBeGreaterThan(0)
        })

        it("应该能够快速搜索数据", () => {
            const startTime = performance.now()

            // 搜索测试
            const searchChar = gameData.char.find((c) => c.名称 === "黎瑟")
            const searchMod = gameData.mod.find((m) => m.id === 41001)
            const searchWeapon = gameData.weapon.find((w) => w.名称 === "铸铁者")

            const endTime = performance.now()
            const duration = endTime - startTime

            // 搜索应该在合理时间内完成
            expect(duration).toBeLessThan(50) // 50毫秒内完成

            // 验证搜索结果
            expect(searchChar).toBeDefined()
            expect(searchMod).toBeDefined()
            expect(searchWeapon).toBeDefined()
        })
    })
})
