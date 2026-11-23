import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import {
    affixes,
    getMasterworkMax,
    type TranscendGearAffixRoll,
    type TranscendGearCraftState,
    type TranscendGearItemConfig,
    uniqueEquips,
} from "@/data"
import { getCurrentSeasonId } from "./catalog"
import {
    GEAR_LINE_MARK_COLORS,
    getAffixFinalValueText,
    getAffixSkillLevelInfo,
    getAffixStrengthRangeText,
    getAffixValuePresentation,
    getAncientGearLineCount,
    getGearAffixTitle,
    getGearCraftCostLines,
    getGearCraftSummary,
    getGearLineMarkState,
    getGearSocketMarkKind,
    getGearSocketPointStyle,
    getItemAffixLines,
    getItemAncientAffixCount,
    hasFinalMasterworkGearAffix,
    hasTierRange,
    isAncientGearLine,
    isBaseGearLine,
    isFinalMasterworkGearLine,
    isGoldGearLineValue,
    isUniqueGearLine,
} from "./display"

/** 装备词条 roll */
function roll(affixId: number, patch: Partial<TranscendGearAffixRoll> = {}): TranscendGearAffixRoll {
    return { affixId, rollLevel: 50, masterworkLevel: 0, ancient: false, finalMasterwork: false, ...patch }
}

/** 物品构造 */
function item(patch: Partial<TranscendGearItemConfig> & Pick<TranscendGearItemConfig, "slotType">): TranscendGearItemConfig {
    return { kind: "normal", affixes: [], ...patch }
}

/** 满级 craft 状态 */
function craft(finalMasterworkAffixIndex?: number): TranscendGearCraftState {
    return { masterworkLevel: 10, finalMasterworkAffixIndex, temperingCount: 0, enchantCount: 0 }
}

const BASE_AFFIX_ID = 102
/** 带最终精锻公式的随机词条 */
const FINAL_AFFIX_ID = affixes.find(affix => affix.maxAffixUpdateFunc)!.id
/** 无最终精锻公式的专属词条（不能作为最终目标） */
const NO_FORMULA_AFFIX_ID = 2001
const UNIQUE_EQUIP = uniqueEquips.find(equip => affixes.find(affix => affix.id === equip.affixId)?.plan === 4)!

describe("装备标记判定", () => {
    it("基础行永久无标记：即使标记太古或命中 craft 目标也不显示", () => {
        const lines = getItemAffixLines(
            item({
                slotType: 1,
                affixes: [roll(BASE_AFFIX_ID, { source: "base", ancient: true })],
                craft: craft(0),
            })
        )
        const line = lines[0]

        expect(isUniqueGearLine(line)).toBe(false)
        expect(isAncientGearLine(line)).toBe(false)
        expect(isFinalMasterworkGearLine(line)).toBe(false)
        expect(
            hasFinalMasterworkGearAffix(item({ slotType: 1, affixes: [roll(BASE_AFFIX_ID, { source: "base" })], craft: craft(0) }))
        ).toBe(false)
    })

    it("专属行不再排除太古 / 最终精锻（上游只排除 base）：命中时按 Forge 叠图", () => {
        const lines = getItemAffixLines({
            kind: "unique",
            slotType: UNIQUE_EQUIP.slot,
            affixes: [],
            uniqueAffix: roll(UNIQUE_EQUIP.affixId, { source: "unique", ancient: true, finalMasterwork: true }),
        })
        const line = lines[0]

        // 底层透传：专属行保留 ancient 字段（供图标判定），词条行按 Forge 叠图只画太古层
        expect(line.ancient).toBe(true)
        expect(isUniqueGearLine(line)).toBe(true)
        expect(isAncientGearLine(line)).toBe(true)
        expect(isFinalMasterworkGearLine(line)).toBe(false)
        expect(getGearLineMarkState(line)).toMatchObject({
            ancient: true,
            unique: true,
            forge: true,
            pointStyle: 1,
        })
    })

    it("专属行（非太古）只显示橙星 PointStyle=2", () => {
        const lines = getItemAffixLines({
            kind: "unique",
            slotType: UNIQUE_EQUIP.slot,
            affixes: [],
            uniqueAffix: roll(UNIQUE_EQUIP.affixId, { source: "unique" }),
        })
        const line = lines[0]

        expect(isUniqueGearLine(line)).toBe(true)
        expect(isAncientGearLine(line)).toBe(false)
        expect(isFinalMasterworkGearLine(line)).toBe(false)
        expect(getGearLineMarkState(line)).toMatchObject({ unique: true, forge: false, pointStyle: 2 })
    })

    it("同一随机词条命中太古 + 最终精锻：两层同时成立，不取最高级", () => {
        const target = item({
            slotType: 1,
            affixes: [roll(BASE_AFFIX_ID, { source: "base" }), roll(FINAL_AFFIX_ID, { source: "random", ancient: true })],
            craft: craft(1),
        })
        const line = getItemAffixLines(target).find(entry => entry.roll.affixId === FINAL_AFFIX_ID)!

        // 两个条件都成立：Forge 叠图同时保留太古银星与最终金星
        expect(isAncientGearLine(line)).toBe(true)
        expect(isFinalMasterworkGearLine(line)).toBe(true)
        expect(getGearLineMarkState(line)).toMatchObject({
            ancient: true,
            finalMasterwork: true,
            forge: true,
            pointStyle: 1,
        })
        expect(hasFinalMasterworkGearAffix(target)).toBe(true)
    })

    it("淬炼词条同时命中太古：两标记并存，不互相覆盖", () => {
        const target = item({
            slotType: 1,
            affixes: [roll(BASE_AFFIX_ID, { source: "base" }), roll(1001, { source: "tempering", ancient: true })],
        })
        const line = getItemAffixLines(target).find(entry => entry.roll.affixId === 1001)!

        expect(line.ancient).toBe(true)
        expect(line.tempering).toBe(true)
        expect(line.forge).toBe(true)
        expect(line.pointStyle).toBe(1)
        expect(getGearLineMarkState(line)).toMatchObject({
            ancient: true,
            tempering: true,
            forge: true,
            pointStyle: 1,
        })
        // 太古行不显示强度区间
        expect(line.rangeText).toBe("")
    })

    it("黄星只在精锻满级且目标词条可最终精锻时显示", () => {
        const notMax = item({
            slotType: 1,
            affixes: [roll(BASE_AFFIX_ID, { source: "base" }), roll(FINAL_AFFIX_ID, { source: "random" })],
            craft: { ...craft(1), masterworkLevel: 9 },
        })
        expect(isFinalMasterworkGearLine(getItemAffixLines(notMax).find(entry => entry.roll.affixId === FINAL_AFFIX_ID)!)).toBe(false)
        expect(hasFinalMasterworkGearAffix(notMax)).toBe(false)

        const noFormula = item({
            slotType: 1,
            affixes: [roll(BASE_AFFIX_ID, { source: "base" }), roll(NO_FORMULA_AFFIX_ID, { source: "random" })],
            craft: craft(1),
        })
        expect(isFinalMasterworkGearLine(getItemAffixLines(noFormula).find(entry => entry.roll.affixId === NO_FORMULA_AFFIX_ID)!)).toBe(
            false
        )
        expect(hasFinalMasterworkGearAffix(noFormula)).toBe(false)
    })

    it("craft 状态优先于 per-affix 快照：旧快照为真但精锻未满级时不显示", () => {
        const legacy = item({
            slotType: 1,
            affixes: [roll(BASE_AFFIX_ID, { source: "base" }), roll(FINAL_AFFIX_ID, { source: "random", finalMasterwork: true })],
        })
        expect(isFinalMasterworkGearLine(getItemAffixLines(legacy).find(entry => entry.roll.affixId === FINAL_AFFIX_ID)!)).toBe(false)
        expect(hasFinalMasterworkGearAffix(legacy)).toBe(false)

        const authority = item({
            slotType: 1,
            affixes: [roll(BASE_AFFIX_ID, { source: "base" }), roll(FINAL_AFFIX_ID, { source: "random", finalMasterwork: false })],
            craft: craft(1),
        })
        expect(isFinalMasterworkGearLine(getItemAffixLines(authority).find(entry => entry.roll.affixId === FINAL_AFFIX_ID)!)).toBe(true)
        expect(hasFinalMasterworkGearAffix(authority)).toBe(true)
    })

    it("旧数据正例：无 craft、finalMasterwork 且精锻满级时最终标记亮起", () => {
        const legacy = item({
            slotType: 1,
            affixes: [
                roll(BASE_AFFIX_ID, { source: "base", masterworkLevel: 10 }),
                roll(FINAL_AFFIX_ID, { source: "random", masterworkLevel: 10, finalMasterwork: true }),
            ],
        })
        const line = getItemAffixLines(legacy).find(entry => entry.roll.affixId === FINAL_AFFIX_ID)!

        expect(isFinalMasterworkGearLine(line)).toBe(true)
        expect(hasFinalMasterworkGearAffix(legacy)).toBe(true)
    })

    it("craft 与 per-affix 冲突：craft 满级但无最终目标时旧快照不生效", () => {
        const conflict = item({
            slotType: 1,
            affixes: [
                roll(BASE_AFFIX_ID, { source: "base", masterworkLevel: 10 }),
                roll(FINAL_AFFIX_ID, { source: "random", masterworkLevel: 10, finalMasterwork: true }),
            ],
            craft: craft(undefined),
        })
        const line = getItemAffixLines(conflict).find(entry => entry.roll.affixId === FINAL_AFFIX_ID)!

        expect(isFinalMasterworkGearLine(line)).toBe(false)
        expect(hasFinalMasterworkGearAffix(conflict)).toBe(false)
    })

    it("跨赛季专属：bDisabled 只作用于专属行", () => {
        const otherSeason = getCurrentSeasonId() + 1
        const uniqueLine = getItemAffixLines({
            kind: "unique",
            slotType: UNIQUE_EQUIP.slot,
            seasonId: otherSeason,
            affixes: [],
            uniqueAffix: roll(UNIQUE_EQUIP.affixId, { source: "unique" }),
        })[0]
        expect(uniqueLine.disabled).toBe(true)
        expect(getGearLineMarkState(uniqueLine)).toMatchObject({ disabled: true, pointStyle: 2 })

        const normalLine = getItemAffixLines(
            item({
                slotType: 1,
                seasonId: otherSeason,
                affixes: [roll(BASE_AFFIX_ID, { source: "base" }), roll(FINAL_AFFIX_ID, { source: "random" })],
            })
        ).find(line => !line.base)!
        expect(normalLine.disabled).toBe(false)
    })

    it("按 item.affixes 数组顺序输出，不按来源重排，不产生 NaN", () => {
        const lines = getItemAffixLines(
            item({
                slotType: 1,
                affixes: [
                    roll(1001, { source: "tempering" }),
                    roll(BASE_AFFIX_ID, { source: "base" }),
                    roll(1002, { source: "enchant" }),
                    roll(1003, { source: "random" }),
                ],
            })
        )

        expect(lines.map(line => line.source)).toEqual(["tempering", "base", "enchant", "random"])
    })

    it("词条行顺序：按数组顺序，专属行追加在数组行之后", () => {
        const uniqueEquip = uniqueEquips.find(equip => equip.slot === 1)!
        const lines = getItemAffixLines({
            kind: "unique",
            slotType: 1,
            affixes: [
                roll(1001, { source: "tempering" }),
                roll(BASE_AFFIX_ID, { source: "base" }),
                roll(FINAL_AFFIX_ID, { source: "random" }),
            ],
            uniqueAffix: roll(uniqueEquip.affixId, { source: "unique" }),
        })

        expect(lines.map(line => line.source)).toEqual(["tempering", "base", "random", "unique"])
        expect(lines[1].base).toBe(true)
    })

    it("仅随机与淬炼时：保持数组顺序（随机与淬炼都不重排）", () => {
        const lines = getItemAffixLines(
            item({
                slotType: 1,
                affixes: [roll(1001, { source: "tempering" }), roll(1003, { source: "random" })],
            })
        )

        expect(lines.map(line => line.source)).toEqual(["tempering", "random"])
    })

    it("最终精锻目标（random 来源）按数组位置输出，不被来源重排", () => {
        const lines = getItemAffixLines(
            item({
                slotType: 1,
                equipBaseScore: 50,
                affixes: [
                    roll(BASE_AFFIX_ID, { source: "base" }),
                    roll(FINAL_AFFIX_ID, { source: "random" }),
                    roll(1001, { source: "tempering" }),
                ],
                craft: {
                    masterworkLevel: 10,
                    finalMasterworkAffixIndex: 1,
                    temperingAffixIndex: 2,
                    temperingCount: 1,
                    enchantCount: 0,
                },
            })
        )

        expect(lines.map(line => line.source)).toEqual(["base", "random", "tempering"])
        const finalLine = lines.find(line => line.finalMasterwork)!
        expect(finalLine.source).toBe("random")
        expect(lines.indexOf(finalLine)).toBe(1)
        expect(lines.at(-1)!.source).toBe("tempering")
    })
})

describe("太古总数（逐词缀计数，上游 AncientRows 口径）", () => {
    it("0 / 1 / 多条：只统计非基础太古行", () => {
        const none = getItemAffixLines(
            item({
                slotType: 1,
                affixes: [roll(BASE_AFFIX_ID, { source: "base" }), roll(1001, { source: "random" })],
            })
        )
        expect(getAncientGearLineCount(none)).toBe(0)
        expect(getAncientGearLineCount([])).toBe(0)

        const one = getItemAffixLines(
            item({
                slotType: 1,
                affixes: [roll(BASE_AFFIX_ID, { source: "base" }), roll(1001, { source: "random", ancient: true })],
            })
        )
        expect(getAncientGearLineCount(one)).toBe(1)

        const many = getItemAffixLines(
            item({
                slotType: 1,
                affixes: [
                    roll(BASE_AFFIX_ID, { source: "base" }),
                    roll(1001, { source: "random", ancient: true }),
                    roll(1002, { source: "random", ancient: true }),
                    roll(1003, { source: "random", ancient: false }),
                    roll(1004, { source: "random", ancient: true }),
                ],
            })
        )
        expect(getAncientGearLineCount(many)).toBe(3)
    })

    it("基础词条即使标记太古也不计入（上游只排除 base）", () => {
        const lines = getItemAffixLines(
            item({
                slotType: 1,
                affixes: [roll(BASE_AFFIX_ID, { source: "base", ancient: true }), roll(1001, { source: "random", ancient: true })],
            })
        )
        expect(getAncientGearLineCount(lines)).toBe(1)
        expect(getAncientGearLineCount(lines.filter(line => line.base))).toBe(0)
    })

    it("source=base 的直行即使 ancient 也排除（isBaseGearLine 的 source 兜底）", () => {
        expect(getAncientGearLineCount([{ source: "base", ancient: true }])).toBe(0)
        expect(getAncientGearLineCount([{ source: "random", ancient: true, base: true }])).toBe(0)
    })

    it("source=unknown 的太古行计入（上游只排除 base，未知来源同样计数）", () => {
        expect(getAncientGearLineCount([{ source: "unknown", ancient: true }])).toBe(1)
        expect(getAncientGearLineCount([{ source: "unknown", ancient: false }])).toBe(0)
        expect(
            getAncientGearLineCount([
                { source: "base", ancient: true },
                { source: "unknown", ancient: true },
                { source: "unknown", ancient: true },
            ])
        ).toBe(2)
    })

    it("专属太古行计入；非太古专属不计", () => {
        const base = {
            kind: "unique" as const,
            slotType: UNIQUE_EQUIP.slot,
            affixes: [roll(1001, { source: "random", ancient: true })],
        }
        const ancientUnique = getItemAffixLines({ ...base, uniqueAffix: roll(UNIQUE_EQUIP.affixId, { source: "unique", ancient: true }) })
        const plainUnique = getItemAffixLines({ ...base, uniqueAffix: roll(UNIQUE_EQUIP.affixId, { source: "unique" }) })

        expect(getAncientGearLineCount(ancientUnique)).toBe(2)
        expect(getAncientGearLineCount(plainUnique)).toBe(1)
    })

    it("计数与 getGearLineMarkState 的 ancient 层完全一致（与 pointStyle 同源）", () => {
        const lines = getItemAffixLines({
            kind: "unique",
            slotType: UNIQUE_EQUIP.slot,
            affixes: [
                roll(BASE_AFFIX_ID, { source: "base", ancient: true }),
                roll(1001, { source: "random", ancient: true }),
                roll(1002, { source: "tempering", ancient: true }),
                roll(1003, { source: "random", ancient: false }),
            ],
            uniqueAffix: roll(UNIQUE_EQUIP.affixId, { source: "unique", ancient: true }),
        })
        expect(getAncientGearLineCount(lines)).toBe(3)
        expect(getAncientGearLineCount(lines)).toBe(lines.filter(line => getGearLineMarkState(line).ancient).length)
    })

    it("装备级 getItemAncientAffixCount 与词缀行计数一致（基础排除、专属计入）", () => {
        const gear = item({
            slotType: 1,
            affixes: [
                roll(BASE_AFFIX_ID, { source: "base", ancient: true }),
                roll(1001, { source: "random", ancient: true }),
                roll(1002, { source: "random", ancient: true }),
            ],
        })
        expect(getItemAncientAffixCount(gear)).toBe(2)
        expect(getItemAncientAffixCount(gear)).toBe(getAncientGearLineCount(getItemAffixLines(gear)))
        expect(getItemAncientAffixCount(item({ slotType: 1, affixes: [] }))).toBe(0)
    })
})

describe("太古总数条渲染契约（只出星，无可见 ×N）", () => {
    /** 读取组件源码：无 @vue/test-utils 环境下的渲染契约锚点 */
    const componentSource = (relativePath: string) => readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8")

    it("总数条：!compact 且 count > 0 才渲染，按 count 逐颗输出、无可见计数文本", () => {
        const source = componentSource("../../components/transcend-build/TranscendGearItemCard.vue")
        expect(source).toContain('v-if="!compact && ancientCount > 0"')
        expect(source).toContain('v-for="index in ancientCount"')
        const start = source.indexOf("data-gear-ancient-bar")
        expect(start).toBeGreaterThan(0)
        const block = source.slice(start, source.indexOf("</div>", start))
        expect(block).toContain('role="img"')
        expect(block).toContain(':aria-label="ancientLabel"')
        // 只出 N 张星图，不插可见计数文本（上游 List_Primordial / 游戏截图口径）
        expect(block).not.toContain("{{")
        expect(block).not.toContain("×")
        // 计数只出现在无障碍文案里
        expect(source).toContain(`×\${ancientCount.value}`)
    })

    it("库存方形卡卡面不新增总数条（tooltip 内复用 ItemCard 才显示）", () => {
        const square = componentSource("../../components/transcend-build/TranscendGearSquareCard.vue")
        expect(square).not.toContain("data-gear-ancient-bar")
        expect(square).toContain("<TranscendGearItemCard")
    })
})

describe("craft 摘要与成本展示", () => {
    it("装备级摘要：精锻 / 最终目标 / 淬炼 / 附魔 / 次数", () => {
        const summary = getGearCraftSummary(
            item({
                slotType: 1,
                affixes: [
                    roll(BASE_AFFIX_ID, { source: "base" }),
                    roll(1001, { source: "tempering" }),
                    roll(FINAL_AFFIX_ID, { source: "enchant" }),
                ],
                craft: {
                    masterworkLevel: 10,
                    finalMasterworkAffixIndex: 2,
                    temperingAffixIndex: 1,
                    temperingCount: 3,
                    enchantAffixIndex: 2,
                    enchantCount: 2,
                },
            })
        )
        expect(summary).toEqual({
            masterworkLevel: 10,
            masterworkMax: 10,
            finalMasterwork: true,
            tempering: true,
            enchant: true,
            temperingCount: 3,
            enchantCount: 2,
        })
    })

    it("附魔成本按次数成长；craft 6 无材料 / 货币成本", () => {
        const first = getGearCraftCostLines(4, 0)
        expect(first.multiplier).toBe(1)
        expect(first.rows.find(row => row.price)?.count).toBe(300000)
        const second = getGearCraftCostLines(4, 1)
        expect(second.multiplier).toBe(2)
        expect(second.rows.find(row => row.price)?.count).toBe(600000)
        expect(getGearCraftCostLines(6).rows).toEqual([])
        expect(getGearCraftCostLines(7).rows.find(row => row.price)?.count).toBe(50000)
    })

    it("满级口径与数据 craft 1 maxCount 同源：摘要上限 / 黄星一致", () => {
        const max = getMasterworkMax()
        const affixesAtMax = [roll(BASE_AFFIX_ID, { source: "base" }), roll(FINAL_AFFIX_ID, { source: "random" })]
        const atMax = item({ slotType: 1, affixes: affixesAtMax, craft: { ...craft(1), masterworkLevel: max } })
        expect(getGearCraftSummary(atMax).masterworkMax).toBe(max)
        expect(hasFinalMasterworkGearAffix(atMax)).toBe(true)

        const below = item({ slotType: 1, affixes: affixesAtMax, craft: { ...craft(1), masterworkLevel: max - 1 } })
        expect(hasFinalMasterworkGearAffix(below)).toBe(false)
    })
})

describe("全档位标签条件 hasTierRange", () => {
    const affixById = (id: number) => affixes.find(entry => entry.id === id)!

    it("有属性块的 Plan 1 / Plan 2 / Plan 3 显示", () => {
        expect(hasTierRange(affixById(101))).toBe(true)
        expect(hasTierRange(affixById(1001))).toBe(true)
        expect(hasTierRange(affixById(1058))).toBe(true)
    })

    it("Plan 4 单值（min === max）与无属性块不显示", () => {
        expect(affixById(3101).minValue).toBe(affixById(3101).maxValue)
        expect(hasTierRange(affixById(3101))).toBe(false)
        expect(hasTierRange(affixById(2001))).toBe(false)
    })

    it("手写建模（Plan 3 技能等级无属性块）不显示", () => {
        expect(hasTierRange(affixById(1038))).toBe(false)
    })

    it("非 Plan 2/3 且区间塌缩为单值时不显示", () => {
        expect(hasTierRange({ ...affixById(101), minValue: 1, maxValue: 1 })).toBe(false)
    })
})

describe("技能等级词条展示（U58-fix：skillTypes / skillIds 统一口径）", () => {
    const affixById = (id: number) => affixes.find(entry => entry.id === id)!

    it("Plan 4 skillIds：+10、槽位正确、固定值强度区间 [10~10]", () => {
        const cases = [
            { id: 110201, type: "Skill1", unresolved: [] as number[] },
            { id: 180101, type: "Skill1", unresolved: [180112] },
            { id: 310201, type: "Skill2", unresolved: [] as number[] },
            { id: 310202, type: "Passive", unresolved: [] as number[] },
        ]
        for (const item of cases) {
            const affix = affixById(item.id)
            const info = getAffixSkillLevelInfo(affix)
            expect(info.isSkillLevel, `${item.id}`).toBe(true)
            expect(info.skillTypes, `${item.id}`).toEqual([item.type])
            expect(info.unresolvedSkillIds, `${item.id}`).toEqual(item.unresolved)
            expect(getAffixFinalValueText(affix, roll(item.id, { rollLevel: 1 })), `${item.id}`).toBe("+10")
            expect(getAffixStrengthRangeText(affix, 50), `${item.id}`).toBe("[10~10]")
            expect(getAffixStrengthRangeText(affix, 10), `${item.id}`).toBe("[10~10]")
        }
    })

    it("1.8.7.1 全部 14 条 Plan 4 skillIds 词条：至少映射一个槽位、+10、区间非空", () => {
        const plan4Skill = affixes.filter(affix => affix.plan === 4 && (affix.addSkillLevel?.skillIds?.length ?? 0) > 0)
        expect(plan4Skill).toHaveLength(14)
        for (const affix of plan4Skill) {
            const info = getAffixSkillLevelInfo(affix)
            expect(info.skillTypes.length, `${affix.id}`).toBeGreaterThan(0)
            expect(getAffixFinalValueText(affix, roll(affix.id)), `${affix.id}`).toBe("+10")
            expect(getAffixStrengthRangeText(affix, 50), `${affix.id}`).toBe("[10~10]")
        }
    })

    it("Plan 3 skillTypes 不回归：Skill1 / Skill2 / Passive、+N、档位区间保持原口径", () => {
        const cases = [
            { id: 1038, type: "Skill1" },
            { id: 1039, type: "Skill2" },
            { id: 1040, type: "Passive" },
        ]
        for (const item of cases) {
            const affix = affixById(item.id)
            const info = getAffixSkillLevelInfo(affix)
            expect(info.isSkillLevel).toBe(true)
            expect(info.skillTypes).toEqual([item.type])
            expect(info.unresolvedSkillIds).toEqual([])
            expect(getAffixFinalValueText(affix, roll(item.id, { rollLevel: 1 }))).toBe("+1")
            expect(getAffixFinalValueText(affix, roll(item.id, { rollLevel: 5 }))).toBe("+5")
            expect(getAffixStrengthRangeText(affix, 10)).toBe("[1~2]")
            // 档位区间塌缩：沿用既有空串口径（U28）
            expect(getAffixStrengthRangeText(affix, 50)).toBe("")
        }
    })

    it("两者都缺：不算技能等级词条，不显示 +N / 区间", () => {
        const affix = affixById(150401)
        expect(getAffixSkillLevelInfo(affix)).toEqual({ isSkillLevel: false, skillTypes: [], unresolvedSkillIds: [] })
        expect(getAffixFinalValueText(affix, roll(affix.id))).toBe("")
        expect(getAffixStrengthRangeText(affix, 50)).toBe("")
    })

    it("两者并存：类型去重合并；全部 id 无法映射时仍显示 +N", () => {
        const base = affixById(110201)
        const merged = getAffixSkillLevelInfo({ ...base, addSkillLevel: { skillTypes: ["Skill2", "Skill1"], skillIds: [110201, 999999] } })
        expect(merged.isSkillLevel).toBe(true)
        expect(merged.skillTypes).toEqual(["Skill2", "Skill1"])
        expect(merged.unresolvedSkillIds).toEqual([999999])

        const noneMapped = { ...base, id: 999998, addSkillLevel: { skillIds: [999999] } }
        const info = getAffixSkillLevelInfo(noneMapped)
        expect(info.isSkillLevel).toBe(true)
        expect(info.skillTypes).toEqual([])
        expect(info.unresolvedSkillIds).toEqual([999999])
        expect(getAffixFinalValueText(noneMapped, roll(999998))).toBe("+10")
        expect(getAffixStrengthRangeText(noneMapped, 50)).toBe("[10~10]")
    })

    it("构筑词缀行（专属来源）：unique 行 valueText = +10，专属行不生成强度区间", () => {
        const equip = uniqueEquips.find(entry => entry.affixId === 110201)!
        const lines = getItemAffixLines({
            kind: "unique",
            slotType: equip.slot,
            affixes: [],
            uniqueAffix: roll(110201, { source: "unique", rollLevel: 1 }),
        })
        expect(lines[0].valueText).toBe("+10")
        expect(lines[0].rangeText).toBe("")
    })
})

describe("词缀行标记 / 区间 / 标题（官方 tips 口径）", () => {
    const affixById = (id: number) => affixes.find(entry => entry.id === id)!

    it("isBaseGearLine 只认基础来源 / 显式 base 字段", () => {
        expect(isBaseGearLine({ source: "base" })).toBe(true)
        expect(isBaseGearLine({ source: "unknown", base: true })).toBe(true)
        expect(isBaseGearLine({ source: "base", base: false })).toBe(false)
        for (const source of ["random", "tempering", "enchant", "unique", "unknown"] as const) {
            expect(isBaseGearLine({ source }), source).toBe(false)
        }
    })

    it("表驱动：base / random / unique / ancient / final / tempering / enchant / forge 组合 → PointStyle", () => {
        const base = { source: "base", ancient: false, finalMasterwork: false } as const
        const cases: [string, Parameters<typeof getGearLineMarkState>[0], Record<string, unknown>][] = [
            ["base", base, { pointStyle: "none", forge: false, base: true }],
            [
                "base 即使索引全命中",
                { ...base, base: true, ancient: true, finalMasterwork: true, tempering: true, enchant: true },
                { pointStyle: "none", forge: false },
            ],
            ["random", { source: "random", ancient: false, finalMasterwork: false }, { pointStyle: 0, forge: false }],
            ["unique", { source: "unique", ancient: false, finalMasterwork: false }, { pointStyle: 2, unique: true, forge: false }],
            [
                "unique + forge",
                { source: "unique", unique: true, ancient: true, finalMasterwork: false },
                { pointStyle: 1, unique: true, forge: true },
            ],
            ["ancient", { source: "random", ancient: true, finalMasterwork: false }, { pointStyle: 1, ancient: true, forge: true }],
            ["final", { source: "random", ancient: false, finalMasterwork: true }, { pointStyle: 1, finalMasterwork: true, forge: true }],
            [
                "tempering",
                { source: "tempering", tempering: true, ancient: false, finalMasterwork: false },
                { pointStyle: 1, tempering: true },
            ],
            ["enchant", { source: "enchant", enchant: true, ancient: false, finalMasterwork: false }, { pointStyle: 1, enchant: true }],
            [
                "forge 四层同时成立",
                { source: "tempering", ancient: true, finalMasterwork: true, tempering: true, enchant: true },
                { pointStyle: 1, ancient: true, finalMasterwork: true, tempering: true, enchant: true, forge: true },
            ],
            ["unknown 来源", { source: "unknown", ancient: false, finalMasterwork: false }, { pointStyle: 0, unknown: true }],
        ]
        for (const [label, line, expected] of cases) expect(getGearLineMarkState(line), label).toMatchObject(expected)
    })

    it("索引严格指向行：最终 / 淬炼 / 附魔各自独立，索引缺省时无打造标记", () => {
        const target = item({
            slotType: 1,
            affixes: [
                roll(BASE_AFFIX_ID, { source: "base" }),
                roll(FINAL_AFFIX_ID, { source: "random" }),
                roll(1001, { source: "random" }),
                roll(1002, { source: "random" }),
                roll(1003, { source: "random" }),
            ],
            craft: {
                masterworkLevel: 10,
                finalMasterworkAffixIndex: 1,
                temperingAffixIndex: 2,
                enchantAffixIndex: 3,
                temperingCount: 1,
                enchantCount: 1,
            },
        })
        const byIndex = (index: number) => getItemAffixLines(target).find(line => line.affixIndex === index)!
        expect(getGearLineMarkState(byIndex(1))).toMatchObject({ finalMasterwork: true, pointStyle: 1 })
        expect(getGearLineMarkState(byIndex(2))).toMatchObject({ tempering: true, finalMasterwork: false, pointStyle: 1 })
        expect(getGearLineMarkState(byIndex(3))).toMatchObject({ enchant: true, finalMasterwork: false, pointStyle: 1 })
        expect(getGearLineMarkState(byIndex(4))).toMatchObject({ forge: false, pointStyle: 0 })

        const noCraft = item({
            slotType: 1,
            affixes: [roll(BASE_AFFIX_ID, { source: "base" }), roll(FINAL_AFFIX_ID, { source: "random" })],
        })
        expect(getItemAffixLines(noCraft).map(line => getGearLineMarkState(line).pointStyle)).toEqual(["none", 0])
    })

    it("精锻等级本身不产生逐词条标记", () => {
        const lines = getItemAffixLines(
            item({
                slotType: 1,
                affixes: [roll(BASE_AFFIX_ID, { source: "base" }), roll(FINAL_AFFIX_ID, { source: "random", masterworkLevel: 10 })],
                craft: { masterworkLevel: 10, temperingCount: 0, enchantCount: 0 },
            })
        )
        expect(lines.map(line => getGearLineMarkState(line).pointStyle)).toEqual(["none", 0])
    })

    it("物品行：太古 + 淬炼来源各自保留，Forge 叠图同时画两层", () => {
        const lines = getItemAffixLines(
            item({
                slotType: 1,
                affixes: [roll(BASE_AFFIX_ID, { source: "base" }), roll(1001, { source: "tempering", ancient: true })],
            })
        )
        const line = lines.find(entry => entry.source === "tempering")!
        expect(line.ancient).toBe(true)
        expect(getGearLineMarkState(line)).toMatchObject({ ancient: true, tempering: true, forge: true, pointStyle: 1 })
    })

    it("孔位：PointStyle 3 空孔 / 4 已镶嵌", () => {
        expect(getGearSocketMarkKind(1001)).toBe("occupiedGroove")
        expect(getGearSocketMarkKind(undefined)).toBe("emptyGroove")
        expect(getGearSocketMarkKind(0)).toBe("emptyGroove")
        expect(getGearSocketPointStyle(1001)).toBe(4)
        expect(getGearSocketPointStyle(undefined)).toBe(3)
        expect(getGearSocketPointStyle(0)).toBe(3)
    })

    it("小点颜色：灰 #99FFFFFF（0.6 不透明度由渲染层施加）；紫 = 附魔、橙 = 淬炼", () => {
        expect(GEAR_LINE_MARK_COLORS).toEqual({ random: "#99FFFFFF", tempering: "#EB774E", enchant: "#A34EEB" })
    })

    it("数值金色：Value != Base 用 Gold；基础 / 太古强制白色", () => {
        const target = item({
            slotType: 1,
            affixes: [
                roll(BASE_AFFIX_ID, { source: "base", masterworkLevel: 10 }),
                roll(FINAL_AFFIX_ID, { source: "random" }),
                roll(FINAL_AFFIX_ID, { source: "random", masterworkLevel: 10 }),
                roll(1001, { source: "tempering", masterworkLevel: 10, ancient: true }),
            ],
            craft: { masterworkLevel: 10, finalMasterworkAffixIndex: 2, temperingCount: 1, enchantCount: 0 },
        })
        const lines = getItemAffixLines(target)
        expect(isGoldGearLineValue(lines.find(line => line.base)!)).toBe(false)
        expect(isGoldGearLineValue(lines.find(line => line.affixIndex === 1)!)).toBe(false)
        expect(isGoldGearLineValue(lines.find(line => line.affixIndex === 2)!)).toBe(true)
        expect(isGoldGearLineValue(lines.find(line => line.ancient && !line.base)!)).toBe(false)
    })

    it("淬炼 / 附魔行生成区间，格式无前导 + 且 % 在括号外", () => {
        const lines = getItemAffixLines(
            item({
                slotType: 1,
                equipBaseScore: 50,
                affixes: [
                    roll(BASE_AFFIX_ID, { source: "base" }),
                    roll(1043, { source: "random", rollLevel: 500 }),
                    roll(1043, { source: "tempering", rollLevel: 500 }),
                    roll(1043, { source: "enchant", rollLevel: 500 }),
                ],
            })
        )
        for (const source of ["random", "tempering", "enchant"] as const) {
            const line = lines.find(entry => entry.source === source)!
            expect(line.rangeText, source).toBe("[69.5~70.5]%")
            expect(line.rangeText.startsWith("+"), source).toBe(false)
        }
        expect(lines.find(entry => entry.source === "base")!.rangeText).toBe("")
    })

    it("太古 1043 显示按上游 0.5 步进：mw0/2/10 → 84.5/86.5/93.5，最终 → 93/95/103", () => {
        const affix = affixById(1043)
        const text = (masterworkLevel: number, finalMasterwork: boolean) =>
            getAffixFinalValueText(affix, roll(1043, { rollLevel: 500, masterworkLevel, ancient: true, finalMasterwork }), 2)

        expect(text(0, false)).toBe("+84.5%")
        expect(text(2, false)).toBe("+86.5%")
        expect(text(10, false)).toBe("+93.5%")
        expect(text(0, true)).toBe("+93%")
        expect(text(2, true)).toBe("+95%")
        expect(text(10, true)).toBe("+103%")
        // 1043 / 1044 同数值行：太古 mw=0 均为 +84.5%
        expect(getAffixFinalValueText(affixById(1044), roll(1044, { rollLevel: 500, ancient: true }), 2)).toBe("+84.5%")
        // 非太古同口径：70.83% 落入 [70.5,71) 桶
        expect(getAffixFinalValueText(affix, roll(1043, { rollLevel: 500 }), 2)).toBe("+70.5%")
    })

    it("词条行当前值跟随区间细精度：1018 背水 强度 50 / roll 498 → +17.9% 与 [17.7~17.95]%", () => {
        const lines = getItemAffixLines(
            item({
                slotType: 1,
                equipBaseScore: 50,
                affixes: [roll(BASE_AFFIX_ID, { source: "base" }), roll(1018, { source: "random", rollLevel: 498 })],
            })
        )
        const line = lines.find(entry => entry.roll.affixId === 1018)!
        expect(line.valueText).toBe("+17.9%")
        expect(line.rangeText).toBe("[17.7~17.95]%")
    })

    it("太古缺 ancientFunc：base 取 MaxValue，普通精锻后转为金色", () => {
        const affix = affixById(101)
        const plain = getAffixValuePresentation(affix, roll(101, { rollLevel: 25, ancient: true }), 3)
        expect(plain.valueText).toBe("+262%")
        expect(plain.gold).toBe(false)
        const refined = getAffixValuePresentation(affix, roll(101, { rollLevel: 25, ancient: true, masterworkLevel: 2 }), 3)
        expect(refined.valueText).toBe("+267.5%")
        expect(refined.gold).toBe(true)
    })

    it("旧物品按 craft 索引回退淬炼 / 附魔来源（无 source 字段）", () => {
        const lines = getItemAffixLines({
            kind: "normal",
            slotType: 1,
            equipBaseScore: 50,
            affixes: [roll(BASE_AFFIX_ID), roll(1001), roll(1002)],
            craft: { masterworkLevel: 0, temperingAffixIndex: 1, temperingCount: 1, enchantAffixIndex: 2, enchantCount: 1 },
        })
        expect(lines.map(entry => entry.source)).toEqual(["base", "tempering", "enchant"])
        // 回退来源同样生成区间
        expect(lines.find(entry => entry.source === "tempering")!.rangeText).not.toBe("")
    })

    it("旧物品最终精锻索引回退为 Random 来源（不是 unknown），保留区间", () => {
        const lines = getItemAffixLines(
            item({
                slotType: 1,
                equipBaseScore: 50,
                affixes: [roll(BASE_AFFIX_ID), roll(FINAL_AFFIX_ID)],
                craft: craft(1),
            })
        )
        const line = lines.find(entry => entry.affixIndex === 1)!
        expect(line.source).toBe("random")
        expect(line.finalMasterwork).toBe(true)
        expect(line.rangeText).not.toBe("")
    })

    it("标题保留富文本标签：专属 desc-only 加「效果:」前缀，普通词条用摘要分段", () => {
        const uniqueAffix = affixById(150201)
        expect(getGearAffixTitle(uniqueAffix, [], text => text ?? "", { effect: "效果:", unknown: "未知" })).toContain("<H>妮弗尔夫人</>")
        expect(getGearAffixTitle(affixById(1043), ["攻击"], text => text ?? "", { effect: "效果:", unknown: "未知" })).toBe("攻击")
        expect(getGearAffixTitle(undefined, [], text => text ?? "", { effect: "效果:", unknown: "未知" })).toBe("未知")
    })
})

describe("同 id 随机 + 淬炼词条行", () => {
    it("预览按数组顺序保留两行，标记分别落在随机行 / 淬炼行与专属行", () => {
        const twin = item({
            kind: "unique",
            slotType: 9,
            rarityId: 10,
            equipBaseScore: 50,
            uniqueId: 210001,
            uniqueAffix: roll(240101, { source: "unique" }),
            affixes: [
                roll(108, { rollLevel: 50, source: "base" }),
                roll(1501, { rollLevel: 500, source: "random" }),
                roll(1502, { rollLevel: 500, source: "random" }),
                roll(1502, { rollLevel: 500, source: "tempering" }),
            ],
            craft: { masterworkLevel: 0, temperingAffixIndex: 3, temperingCount: 1, enchantCount: 0 },
        })
        const lines = getItemAffixLines(twin, 10)
        expect(lines).toHaveLength(5)
        expect(lines.map(entry => entry.roll.affixId)).toEqual([108, 1501, 1502, 1502, 240101])
        expect(lines.map(entry => entry.tempering)).toEqual([false, false, false, true, false])
        expect(lines.map(entry => entry.base)).toEqual([true, false, false, false, false])
        expect(lines[2].source).toBe("random")
        expect(lines[3].source).toBe("tempering")
        expect(lines[4].unique).toBe(true)
    })
})
