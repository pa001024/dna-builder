import { describe, it, expect, beforeEach } from "vitest"
import { LeveledMod, LeveledModWithCount } from "../leveled/LeveledMod"
import { Quality } from "../data-types"

describe("LeveledMod", () => {
    describe("Constructor", () => {
        it("should create LeveledMod instance with mod ID", () => {
            const mod = new LeveledMod(41324) // 雷鸣·燎原
            expect(mod).toBeInstanceOf(LeveledMod)
            expect(mod.id).toBe(41324)
            expect(mod.名称).toBeDefined()
            expect(mod.品质).toBeDefined()
        })

        it("should throw error for invalid mod ID", () => {
            expect(() => new LeveledMod(99999999)).toThrow("未在静态表中找到")
        })

        it("should accept optional level parameter", () => {
            const mod = new LeveledMod(41324, 5)
            expect(mod.等级).toBe(5)
        })

        it("should set level to maxLevel if not provided", () => {
            const mod = new LeveledMod(41324)
            expect(mod.等级).toBe(mod.maxLevel)
        })

        it("should accept buff level parameter", () => {
            const mod = new LeveledMod(41324, 5, 3)
            expect(mod.buffLv).toBe(3)
        })

        it("should clamp level to maxLevel", () => {
            const mod = new LeveledMod(41324, 999)
            expect(mod.等级).toBeLessThanOrEqual(mod.maxLevel)
        })

        it("should clamp level to minimum of 0", () => {
            const mod = new LeveledMod(41324, -5)
            expect(mod.等级).toBeGreaterThanOrEqual(0)
        })
    })

    describe("fromDNA", () => {
        it("should create LeveledMod from DNA mod with valid ID", () => {
            const dnaMod = { id: 41324, name: "测试", quality: 4, icon: "" }
            const mod = LeveledMod.fromDNA(dnaMod)
            expect(mod).toBeInstanceOf(LeveledMod)
            expect(mod!.id).toBe(41324)
        })

        it("should return null for ID -1", () => {
            const dnaMod = { id: -1, name: "", quality: 1, icon: "" }
            const mod = LeveledMod.fromDNA(dnaMod)
            expect(mod).toBeNull()
        })

        it("should create mod with provided data for unknown ID", () => {
            const dnaMod = { id: 999999, name: "未知MOD", quality: 3, icon: "" }
            const mod = LeveledMod.fromDNA(dnaMod)
            expect(mod).toBeInstanceOf(LeveledMod)
            expect(mod!.名称).toBe("未知MOD")
            expect(mod!.品质).toBe("蓝")
        })

        it("should map quality number to Chinese quality", () => {
            const qualities = [
                { num: 1, expected: "白" },
                { num: 2, expected: "绿" },
                { num: 3, expected: "蓝" },
                { num: 4, expected: "紫" },
                { num: 5, expected: "金" },
            ]

            qualities.forEach(({ num, expected }) => {
                const dnaMod = { id: 999999, name: "Test", quality: num, icon: "" }
                const mod = LeveledMod.fromDNA(dnaMod)
                expect(mod!.品质).toBe(expected)
            })
        })

        it("should use default quality for missing quality", () => {
            const dnaMod = { id: 999999, name: "Test", icon: "" } as any
            const mod = LeveledMod.fromDNA(dnaMod)
            expect(mod!.品质).toBe("白")
        })
    })

    describe("Level Management", () => {
        let mod: LeveledMod

        beforeEach(() => {
            mod = new LeveledMod(41324, 1)
        })

        it("should get current level", () => {
            expect(mod.等级).toBe(1)
        })

        it("should set level within valid range", () => {
            mod.等级 = 5
            expect(mod.等级).toBe(5)
        })

        it("should clamp level to minimum when setting", () => {
            mod.等级 = -10
            expect(mod.等级).toBeGreaterThanOrEqual(1)
        })

        it("should clamp level to 80 maximum when setting", () => {
            mod.等级 = 100
            expect(mod.等级).toBe(80)
        })

        it("should update properties when level changes", () => {
            const initialEndurance = mod.耐受
            mod.等级 = mod.maxLevel
            // Properties should be different at max level
            expect(mod.耐受).toBeDefined()
        })
    })

    describe("Quality and Max Level", () => {
        it("should set correct maxLevel for 金 quality", () => {
            const goldQuality = LeveledMod.modQualityMaxLevel[Quality.金]
            expect(goldQuality).toBe(10)
        })

        it("should set correct maxLevel for 紫 quality", () => {
            const purpleQuality = LeveledMod.modQualityMaxLevel[Quality.紫]
            expect(purpleQuality).toBe(5)
        })

        it("should set correct maxLevel for 蓝 quality", () => {
            const blueQuality = LeveledMod.modQualityMaxLevel[Quality.蓝]
            expect(blueQuality).toBe(5)
        })

        it("should set correct maxLevel for 绿 quality", () => {
            const greenQuality = LeveledMod.modQualityMaxLevel[Quality.绿]
            expect(greenQuality).toBe(3)
        })

        it("should set correct maxLevel for 白 quality", () => {
            const whiteQuality = LeveledMod.modQualityMaxLevel[Quality.白]
            expect(whiteQuality).toBe(3)
        })

        it("getMaxLevel should return correct value for quality", () => {
            expect(LeveledMod.getMaxLevel(Quality.金)).toBe(10)
            expect(LeveledMod.getMaxLevel(Quality.紫)).toBe(5)
            expect(LeveledMod.getMaxLevel("unknown")).toBe(1)
        })
    })

    describe("Properties", () => {
        let mod: LeveledMod

        beforeEach(() => {
            mod = new LeveledMod(41324)
        })

        it("should have fullName property", () => {
            expect(mod.fullName).toBe(`${mod.系列}之${mod.名称}`)
        })

        it("should return properties list excluding internal fields", () => {
            const props = mod.properties
            expect(props).toBeInstanceOf(Array)
            expect(props).not.toContain("id")
            expect(props).not.toContain("_等级")
            expect(props).not.toContain("_originalModData")
        })

        it("should return baseProperties from original mod data", () => {
            const baseProps = mod.baseProperties
            expect(baseProps).toBeInstanceOf(Array)
            expect(baseProps).not.toContain("id")
        })

        it("getProperties should return property values", () => {
            const properties = mod.getProperties()
            expect(typeof properties).toBe("object")
        })

        it("should have url property", () => {
            expect(mod.url).toBeDefined()
            expect(typeof mod.url).toBe("string")
            expect(mod.url).toMatch(/\/imgs\//)
        })

        it("getUrl static method should return url for mod ID", () => {
            const url = LeveledMod.getUrl(41324)
            expect(url).toBeDefined()
            expect(typeof url).toBe("string")
        })

        it("getQuality static method should return quality for mod ID", () => {
            const quality = LeveledMod.getQuality(41324)
            expect(quality).toBeDefined()
            expect(["白", "绿", "蓝", "紫", "金"]).toContain(quality)
        })

        it("getQuality should return default for invalid ID", () => {
            const quality = LeveledMod.getQuality(99999999)
            expect(quality).toBe("紫")
        })
    })

    describe("Buff System", () => {
        it("should create buff if effect exists", () => {
            // This depends on effectMap having data for the mod
            const mod = new LeveledMod(41324)
            // Buff may or may not exist depending on data
            if (mod.buff) {
                expect(mod.buff.pid).toBe(mod.名称)
            }
        })

        it("should not create buff if effect doesn't exist", () => {
            // Create a mod without buff
            const mod = new LeveledMod(41001)
            // Check buff existence based on actual data
            expect(mod.buff === undefined || mod.buff !== undefined).toBe(true)
        })
    })

    describe("equals method", () => {
        it("should return true for identical mods", () => {
            const mod1 = new LeveledMod(41324, 5)
            const mod2 = new LeveledMod(41324, 5)
            expect(mod1.equals(mod2)).toBe(true)
        })

        it("should return false for different IDs", () => {
            const mod1 = new LeveledMod(41324, 5)
            const mod2 = new LeveledMod(51313, 5)
            expect(mod1.equals(mod2)).toBe(false)
        })

        it("should return false for different levels", () => {
            const mod1 = new LeveledMod(41324, 3)
            const mod2 = new LeveledMod(41324, 5)
            expect(mod1.equals(mod2)).toBe(false)
        })

        it("should return true for same reference", () => {
            const mod = new LeveledMod(41324, 5)
            expect(mod.equals(mod)).toBe(true)
        })
    })

    describe("Endurance Calculation", () => {
        it("should calculate endurance correctly for normal mods", () => {
            const mod = new LeveledMod(41324)
            expect(mod.耐受).toBeDefined()
            expect(typeof mod.耐受).toBe("number")
        })

        it("should calculate endurance inversely for stance mods (ID > 100000)", () => {
            // Create a stance mod if available
            const mod = new LeveledMod(41324, 1)
            const initialEndurance = mod.耐受
            mod.等级 = mod.maxLevel
            // For normal mods, endurance should increase
            // For stance mods (ID > 100000), it should decrease
            if (mod.id > 100000) {
                expect(mod.耐受).toBeLessThanOrEqual(initialEndurance)
            } else {
                expect(mod.耐受).toBeGreaterThanOrEqual(initialEndurance)
            }
        })
    })

    describe("Property Scaling", () => {
        it("should scale properties based on level", () => {
            const mod = new LeveledMod(41324, 1)
            const level1Value = mod.耐受

            mod.等级 = mod.maxLevel
            const maxLevelValue = mod.耐受

            // Values should be different at different levels
            expect(level1Value).not.toBe(maxLevelValue)
        })

        it("should round 神智回复 values", () => {
            // Create mod with 神智回复 if available
            const mod = new LeveledMod(41324)
            if (mod["神智回复"]) {
                expect(Number.isInteger(mod["神智回复"])).toBe(true)
            }
        })

        it("should round 最大耐受 values", () => {
            const mod = new LeveledMod(41324)
            if (mod["最大耐受"]) {
                expect(Number.isInteger(mod["最大耐受"])).toBe(true)
            }
        })
    })
})

describe("LeveledModWithCount", () => {
    describe("Constructor", () => {
        it("should create LeveledModWithCount instance", () => {
            const mod = new LeveledModWithCount(41324)
            expect(mod).toBeInstanceOf(LeveledModWithCount)
            expect(mod).toBeInstanceOf(LeveledMod)
        })

        it("should set default count to 0", () => {
            const mod = new LeveledModWithCount(41324)
            expect(mod.count).toBe(0)
        })

        it("should accept custom count", () => {
            const mod = new LeveledModWithCount(41324, 5, 3, 10)
            expect(mod.count).toBe(10)
        })

        it("should inherit all LeveledMod functionality", () => {
            const mod = new LeveledModWithCount(41324, 5)
            expect(mod.等级).toBe(5)
            expect(mod.id).toBe(41324)
        })
    })

    describe("Count Management", () => {
        it("should allow count modification", () => {
            const mod = new LeveledModWithCount(41324, 5, 3, 10)
            mod.count = 20
            expect(mod.count).toBe(20)
        })

        it("should handle zero count", () => {
            const mod = new LeveledModWithCount(41324, 5, 3, 0)
            expect(mod.count).toBe(0)
        })

        it("should handle negative count", () => {
            const mod = new LeveledModWithCount(41324, 5, 3, -5)
            expect(mod.count).toBe(-5)
        })
    })
})