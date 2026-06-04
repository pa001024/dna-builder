import { describe, expect, it } from "vitest"
import { collectResourceQuestSources, collectResourceShopSources } from "../../utils/resource-source"
import { weaponDraftMap } from "../d"
import modData from "../d/mod.data"
import resourceData from "../d/resource.data"
import weaponData from "../d/weapon.data"
import { LevelUpCalculator, type ResourceCost } from "../LevelUpCalculator"
import { calculateCharLevelUp, calculateWeaponLevelUp, estimateTime, type ModExt } from "../LevelUpCalculatorImpl"

describe("LevelUpCalculator", () => {
    const mockResourceNeeds: ResourceCost = {
        深红凝珠: 68400,
        铜币: 3342000,
        "图纸: 决斗": [10, 51313, "Draft"],
        人面狮之决斗: [50, 41313, "Mod"],
        委托密函线索: 1100,
        "图纸: 羽翼·鼓舞·背水": [10, 56154, "Draft"],
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

        console.log("棘刺绝响熔炼0-5锻造消耗", result.details.craft)
        console.log(
            "熔炼模具商店来源",
            shopSources.map(source => ({
                detail: source.detail,
                shopName: source.shopName,
                price: source.price,
                priceName: source.priceName,
                limit: source.limit,
                num: source.num,
                timeStart: source.timeStart,
                timeEnd: source.timeEnd,
            }))
        )
        console.log(
            "熔炼模具任务来源",
            questSources.map(source => ({
                questChainName: source.questChainName,
                chapterName: source.chapterName,
                episode: source.episode,
                rewardId: source.rewardId,
                num: source.num,
                timeStart: source.timeStart,
                timeEnd: source.timeEnd,
            }))
        )

        expect(result.details.craft?.熔炼模具).toBe(1)
        expect(result.details.craft?.铜币).toBe(500000)
        expect(result.details.craft?.熔铸突击枪的领悟).toBe(5)
        expect(result.details.craft?.棘刺绝响的原型).toBe(450)
        expect(shopSources.length + questSources.length).toBeGreaterThan(0)
    })
})
