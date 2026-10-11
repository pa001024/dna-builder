import { describe, expect, it } from "vitest"
import { weaponDraftMap } from "@/data/d"
import modData from "@/data/d/mod.data"
import resourceData from "@/data/d/resource.data"
import weaponData from "@/data/d/weapon.data"
import { LevelUpCalculator, type ResourceCost } from "../LevelUpCalculator"
import { calculateCharLevelUp, calculateModLevelUp, calculateWeaponLevelUp, estimateTime, type ModExt } from "../LevelUpCalculatorImpl"
import { collectResourceQuestSources, collectResourceShopSources } from "../resource-source"

describe("LevelUpCalculator", () => {
    const mockResourceNeeds: ResourceCost = {
        深红凝珠: 68400,
        铜币: 3342000,
        "设计稿: 决斗": [10, 51313, "Draft"],
        人面狮之决斗: [50, 41313, "Mod"],
        委托密函线索: 1100,
        "设计稿: 羽翼·鼓舞·背水": [10, 56154, "Draft"],
        换生灵之背水: [10, 56153, "Mod"],
        不死鸟之羽翼: [100, 31004, "Mod"],
        海妖之羽翼·鼓舞: [100, 31301, "Mod"],
    }

    const calc = new LevelUpCalculator()

    /**
     * 构建最小化的魔之楔映射
     * @returns 供 estimateTime 使用的魔之楔映射
     */
    function createModMap() {
        return modData
            .map(mod => calc.extractMinimalModData(mod))
            .reduce((acc, mod) => {
                acc.set(mod.id, mod)
                return acc
            }, new Map<number, ModExt>())
    }

    /**
     * 统计估算结果中的总副本次数
     * @param result 时间估算结果
     * @returns 所有副本次数之和
     */
    function getTotalDungeonRuns(result: ReturnType<typeof estimateTime>) {
        return Object.values(result.dungeonTimes).reduce((sum, [times]) => sum + times, 0)
    }

    /**
     * 构造用于技能升级材料测试的角色数据
     * @returns 最小角色与技能升级表
     */
    function createSkillLevelUpChar() {
        return {
            id: 1,
            突破: [],
            技能: [
                {
                    升级: [
                        { 铜币: 10, A: 1 },
                        { 铜币: 20, B: 1 },
                        { 铜币: 30, C: 1 },
                    ],
                },
                {},
                {},
            ],
        }
    }

    it("test estimateTime", () => {
        const modMap = createModMap()
        const result = estimateTime(mockResourceNeeds, Object.fromEntries(modMap))
        // console.log(result)
        // 检查天数必须大于0
        expect(result.days).toBeGreaterThan(0)
    })

    it("should reduce expected dungeon runs when drop bonus increases", () => {
        const modMap = createModMap()
        const baseResult = estimateTime(mockResourceNeeds, Object.fromEntries(modMap), {
            dungeonDropRateBonus: 0,
        })
        const boostedResult = estimateTime(mockResourceNeeds, Object.fromEntries(modMap), {
            dungeonDropRateBonus: 0.5,
        })

        expect(getTotalDungeonRuns(boostedResult)).toBeLessThan(getTotalDungeonRuns(baseResult))
    })

    it("should increase estimated minutes when dungeon time multiplier increases", () => {
        const modMap = createModMap()
        const simpleNeed: ResourceCost = {
            深红凝珠: 1080,
        }

        const fastResult = estimateTime(simpleNeed, Object.fromEntries(modMap), {
            dungeonDropRateBonus: 0,
            dungeonTimeMultiplier: 1,
        })
        const slowResult = estimateTime(simpleNeed, Object.fromEntries(modMap), {
            dungeonDropRateBonus: 0,
            dungeonTimeMultiplier: 2,
        })

        expect(fastResult.mins).toBe(1)
        expect(slowResult.mins).toBe(2)
    })

    it("should count skill upgrade materials from previous level to next level", async () => {
        const result = calculateCharLevelUp([createSkillLevelUpChar() as never], {
            chars: [
                {
                    currentLevel: 1,
                    targetLevel: 1,
                    skills: [
                        { currentLevel: 1, targetLevel: 3 },
                        { currentLevel: 1, targetLevel: 1 },
                        { currentLevel: 1, targetLevel: 1 },
                    ],
                },
            ],
        })

        expect(result.details.skills).toEqual({
            铜币: 30,
            A: 1,
            B: 1,
        })
    })

    it("should count calamity weapon forge materials by smelting level", () => {
        const result = calculateWeaponLevelUp(
            [
                {
                    id: 1,
                    draft: {
                        id: 1,
                        n: "测试武器",
                        r: 5,
                        v: "1.0",
                        t: "Weapon",
                        c: 1,
                        p: 1,
                        d: 1,
                        s: 1,
                        x: [
                            {
                                id: 1,
                                n: "本体材料",
                                c: 9,
                                t: "Resource",
                            },
                        ],
                        m: 100,
                    },
                    熔炉: [
                        {
                            lv: 0,
                        },
                        {
                            lv: 1,
                            解锁: {
                                A: 2,
                            },
                            技能: [
                                {
                                    id: 101,
                                    名称: "测试技能一",
                                    icon: "test",
                                    解锁: {
                                        B: 3,
                                    },
                                },
                                {
                                    id: 102,
                                    名称: "测试技能二",
                                    icon: "test",
                                    解锁: {
                                        B: 3,
                                    },
                                },
                            ],
                        },
                        {
                            lv: 2,
                            解锁: {
                                A: 5,
                            },
                            技能: [
                                {
                                    id: 103,
                                    名称: "测试技能三",
                                    icon: "test",
                                    解锁: {
                                        C: 7,
                                    },
                                },
                            ],
                        },
                    ],
                },
            ],
            {},
            {
                weapons: [
                    {
                        currentLevel: 1,
                        targetLevel: 1,
                        currentRefine: 0,
                        targetRefine: 2,
                    },
                ],
            }
        )

        expect(result.details.craft).toEqual({
            铜币: 100,
            本体材料: 9,
            A: 7,
            B: 3,
            C: 7,
        })
    })

    it("should charge only walnut clues for direct-finished walnut gold mods", () => {
        // 新版本密函金奖直接开成品（以 51317 人面狮之充盈·巧力为例）
        const mod = modData.find(item => item.id === 51317)
        expect(mod).toBeDefined()
        const minimal = calc.extractMinimalModData(mod!)
        expect(minimal.walnutFinished).toBe(1)

        const result = calculateModLevelUp([minimal], new Map(), new Map(), {
            mods: [{ currentLevel: 1, targetLevel: 10, count: 1 }],
        })

        // 本体 1 + 增幅 9 = 10 份成品，每份 100 线索；不再需要图纸链
        expect(result.totalCost).toEqual({
            深红凝珠: 34200,
            铜币: 171000,
            委托密函线索: 1000,
        })
        // 依赖树只含基础材料与线索，不再含设计稿/狗粮节点
        const tree = result.resourceTree?.children?.[0]
        expect(tree?.children?.map(child => child.type)).toEqual(["Resource", "Resource", "Resource"])
        expect(tree?.children?.find(child => child.name === "委托密函线索")?.amount).toBe(1000)
    })

    it("should charge walnut clues for本体 and partial amplification copies", () => {
        const mod = modData.find(item => item.id === 51317)
        const minimal = calc.extractMinimalModData(mod!)

        const result = calculateModLevelUp([minimal], new Map(), new Map(), {
            mods: [{ currentLevel: 5, targetLevel: 8, count: 2 }],
        })

        // 本体 2 + 增幅 (1+1+2)*2 = 10 份成品
        expect(result.totalCost.委托密函线索).toBe(1000)
        expect(result.totalCost["设计稿: 充盈·巧力-151317"]).toBeUndefined()
    })

    it("should keep draft chain for walnut mods that still grant drafts", () => {
        const draft = {
            id: 151317,
            n: "充盈·巧力",
            r: 5,
            v: "1.0",
            t: "Mod",
            c: 1,
            p: 51317,
            d: 30,
            b: 1,
            s: 1,
            x: [{ id: 41317, n: "充盈·巧力", c: 5, t: "Mod" }],
            m: 50000,
        }
        const mod: ModExt = {
            id: 51317,
            名称: "充盈·巧力",
            品质: "金",
            消耗: [51317],
            draft: draft as never,
            costDraft: draft as never,
            walnut: 1,
        }
        const result = calculateModLevelUp([mod], new Map([[draft.p, draft as never]]), new Map(), {
            mods: [{ currentLevel: 1, targetLevel: 10, count: 1 }],
        })

        // 旧口径（密函开图纸）保留：线索 + 图纸 + 紫色狗粮 + 锻造铜币
        expect(result.totalCost.委托密函线索).toBe(1000)
        expect(result.totalCost["设计稿: 充盈·巧力-151317"]).toEqual([10, 51317, "Draft"])
        expect(result.totalCost["充盈·巧力-41317"]).toEqual([50, 41317, "Mod"])
    })

    it("should calculate real calamity weapon forge materials and list smelting mould sources", () => {
        const weapon = weaponData.find(item => item.名称 === "棘刺绝响")
        const smeltingMould = resourceData.find(item => item.name === "熔炼模具")

        expect(weapon).toBeDefined()
        expect(smeltingMould).toBeDefined()

        const result = calculateWeaponLevelUp(
            [{ ...weapon!, draft: weaponDraftMap.get(weapon!.id) }],
            {},
            {
                weapons: [
                    {
                        currentLevel: 1,
                        targetLevel: 1,
                        currentRefine: 0,
                        targetRefine: 5,
                    },
                ],
            }
        )
        const shopSources = collectResourceShopSources(smeltingMould!)
        const questSources = collectResourceQuestSources(smeltingMould!)

        expect(result.details.craft?.熔炼模具).toBe(1)
        expect(result.details.craft?.铜币).toBe(500000)
        expect(result.details.craft?.熔铸突击枪的领悟).toBe(5)
        expect(result.details.craft?.棘刺绝响的原型).toBe(450)
        expect(shopSources.length + questSources.length).toBeGreaterThan(0)
    })
})
