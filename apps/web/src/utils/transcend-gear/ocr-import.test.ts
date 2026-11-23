import { describe, expect, it } from "vitest"
import { affixes, resolveAffixValue, type TranscendGearAffixRoll } from "@/data"
import { quantizeAffixDisplayValue } from "@/utils/transcendence-gear"
import { getItemAffixLines } from "./display"
import { getGearRandomAffixPool } from "./generation"
import { type GearOcrLine, type GearOcrParseResult, parseGearOcrCards, parseGearOcrLines } from "./ocr-import"

const LEFT_CARD = [
    "精致海蚀护胸",
    "强度 50",
    "升华装备·护胸",
    "生命 +262%",
    "技能威力 +76% [75.5-76.5]%",
    "技能效益 +47.5% [47-47.5]%",
    "普通近战武器暴击率 +84.5%",
    "普通近战武器暴击伤害 +70% [69.5-70.5]%",
    "8000",
    "装备中",
]

const RIGHT_CARD = [
    "精致海妖护胸",
    "强度 50",
    "升华装备·护胸",
    "生命 +262%",
    "普通近战武器暴击伤害 +84.5%",
    "普通近战武器基础攻击力 +121.5% [121-122]%",
    "背水 +17.9% [17.7-17.95]%",
    "生命 +87% [86-87]%",
    "8000",
    "装备",
]

/** U90a 实测：两张卡按 y 交错输出的 21 行（文本逐字取自 REPORT-u90a.md） */
const REAL_OCR_LINES: GearOcrLine[] = [
    { text: "精致海蚀护胸", x: 16, y: 67, width: 107, height: 23 },
    { text: "精致海妖护胸", x: 366, y: 67, width: 107, height: 23 },
    { text: "强度50", x: 16, y: 105, width: 70, height: 23 },
    { text: "强度50", x: 366, y: 105, width: 70, height: 23 },
    { text: "升华装备.护胸", x: 16, y: 140, width: 120, height: 23 },
    { text: "升华装备.护胸", x: 366, y: 140, width: 120, height: 23 },
    { text: "生命+262%", x: 16, y: 178, width: 100, height: 23 },
    { text: "生命+262%", x: 366, y: 178, width: 100, height: 23 },
    { text: "·技能威力+76%[75.5~76.5]%", x: 10, y: 210, width: 200, height: 23 },
    { text: "普通近战武器暴击伤害+84.5%", x: 366, y: 210, width: 230, height: 23 },
    { text: "·技能效益+47.5%[47~47.5]%", x: 10, y: 242, width: 200, height: 23 },
    { text: "普通近战武器基础攻击力+121.5%", x: 366, y: 242, width: 240, height: 23 },
    { text: "[121~122]%", x: 400, y: 268, width: 80, height: 23 },
    { text: "*普通近战武器暴击率+84.5%", x: 10, y: 274, width: 230, height: 23 },
    { text: "·背水+17.9% [17.7-17.95]%", x: 366, y: 300, width: 180, height: 23 },
    { text: "普通近战武器暴击伤害+70%", x: 10, y: 306, width: 210, height: 23 },
    { text: "[69.5~70.5]%", x: 50, y: 332, width: 90, height: 23 },
    { text: "生命+87%[86-87]%", x: 366, y: 332, width: 140, height: 23 },
    { text: "8000", x: 250, y: 390, width: 40, height: 23 },
    { text: "福8000", x: 600, y: 390, width: 60, height: 23 },
    { text: "装备中", x: 120, y: 420, width: 55, height: 23 },
]

const makeCard = (texts: readonly string[]): GearOcrLine[] =>
    texts.map((text, index) => ({ text, x: 24, y: 40 + index * 36, width: Math.max(80, text.length * 16), height: 24 }))

/** 21 行按 x 拆成两卡（左列 x < 300，右列 x ≥ 300） */
const REAL_LEFT_LINES = REAL_OCR_LINES.filter(line => line.x < 300)
const REAL_RIGHT_LINES = REAL_OCR_LINES.filter(line => line.x >= 300)

const randomAffixes = (result: GearOcrParseResult) => result.affixes.filter(affix => affix.source === "random")

const warningCodes = (result: GearOcrParseResult) => result.warnings.map(warning => warning.code)

/** 按解析档位复算模型显示值：上游 0.5 步进（百分比 ×100），固定值保留 2 位 */
const modelDisplay = (affixId: number, rollLevel: number, ancient: boolean): number => {
    const affix = affixes.find(item => item.id === affixId)
    if (!affix) throw new Error(`missing affix ${affixId}`)
    const attr = affix.addAttrs?.[0]
    const result = resolveAffixValue(affix, {
        affixId,
        slotId: 0,
        rollLevel,
        masterworkLevel: 0,
        ancient,
        finalMasterwork: false,
    })
    if (!attr) return Math.round(result.final)

    return quantizeAffixDisplayValue(attr, result.final)
}

const randomRollOf = (result: GearOcrParseResult, affixId: number): TranscendGearAffixRoll => {
    const roll = result.item?.affixes.find(item => item.affixId === affixId)
    if (!roll) throw new Error(`missing item affix ${affixId}`)
    return roll
}

describe("parseGearOcrLines — 附图两卡", () => {
    it("左卡：称号 / 强度 / 品质 / 基础词条 / 4 条随机 / 单条太古", () => {
        const result = parseGearOcrLines(makeCard(LEFT_CARD))
        expect(result.cardCount).toBe(1)
        expect(result.cardIndex).toBe(0)
        expect(result.item).not.toBeNull()
        expect(result.slotType).toBe(2)
        expect(result.strength).toBe(50)
        expect(result.rarityId).toBe(5)
        expect(result.iconId).toBe(1004)
        expect(result.item?.kind).toBe("normal")
        expect(result.item?.nameId).toBe(1002)
        expect(result.item?.equipBaseScore).toBe(50)

        const random = randomAffixes(result)
        expect(random).toHaveLength(4)
        expect(random.map(affix => affix.affixId).sort((left, right) => left - right)).toEqual([1013, 1014, 1043, 1044])

        const base = result.affixes.filter(affix => affix.source === "base")
        expect(base).toHaveLength(1)
        expect(base[0].affixId).toBe(103)
        expect(base[0].rollLevel).toBe(50)
        expect(base[0].ancient).toBe(false)

        const ancient = result.affixes.filter(affix => affix.ancient)
        expect(ancient).toHaveLength(1)
        expect(ancient[0].affixId).toBe(1043)
        expect(ancient[0].text).toContain("普通近战武器暴击率")
        expect(warningCodes(result)).toContain("ancient_inferred")

        for (const affix of random) {
            const model = modelDisplay(affix.affixId, affix.rollLevel, affix.ancient)
            expect(Math.abs(model - affix.displayValue)).toBeLessThanOrEqual(0.6)
            expect(affix.confidence).toBeGreaterThan(0.5)
        }
        expect(result.unmatchedLines).toEqual(["8000", "装备中"])
    })

    it("左卡：显示值在模型精度内的词条误差 ≤ 0.06", () => {
        const result = parseGearOcrLines(makeCard(LEFT_CARD))
        const random = randomAffixes(result)
        for (const affixId of [1013, 1014, 1044]) {
            const affix = random.find(item => item.affixId === affixId)
            expect(affix, `affix ${affixId}`).toBeDefined()
            expect(affix?.error).toBeLessThanOrEqual(0.06)
        }
    })

    it("太古 84.5 与上游显示口径自洽：不再误报 affix_value_uncertain", () => {
        const result = parseGearOcrLines(makeCard(LEFT_CARD))
        const ancient = result.affixes.find(affix => affix.affixId === 1043)!
        expect(ancient.ancient).toBe(true)
        expect(ancient.displayValue).toBe(84.5)
        expect(ancient.error).toBe(0)
        expect(ancient.rollLevel).toBe(500)
        expect(warningCodes(result)).toContain("ancient_inferred")
        expect(warningCodes(result)).not.toContain("affix_value_uncertain")
    })

    it("非太古 70% 落在 0.5 显示桶的最低档（1044 → roll 492，而非 491）", () => {
        const result = parseGearOcrLines(makeCard(LEFT_CARD))
        const damage = randomAffixes(result).find(affix => affix.affixId === 1044)!
        expect(damage.ancient).toBe(false)
        expect(damage.displayValue).toBe(70)
        expect(damage.error).toBe(0)
        expect(damage.rollLevel).toBe(492)
    })

    it("右卡：基础「生命」与随机「生命」分离，4 条随机 / 单条太古", () => {
        const result = parseGearOcrLines(makeCard(RIGHT_CARD))
        expect(result.cardCount).toBe(1)
        expect(result.cardIndex).toBe(0)
        expect(result.item).not.toBeNull()
        expect(result.slotType).toBe(2)
        expect(result.strength).toBe(50)
        expect(result.rarityId).toBe(5)
        expect(result.iconId).toBe(1006)

        const random = randomAffixes(result)
        expect(random).toHaveLength(4)
        expect(random.map(affix => affix.affixId).sort((left, right) => left - right)).toEqual([1003, 1018, 1042, 1044])

        const base = result.affixes.find(affix => affix.source === "base")
        expect(base?.affixId).toBe(103)
        expect(base?.rollLevel).toBe(50)
        expect(randomRollOf(result, 103).source).toBe("base")
        expect(randomRollOf(result, 103).rollLevel).toBe(50)

        const lifeRandom = random.find(affix => affix.affixId === 1003)
        expect(lifeRandom).toBeDefined()
        expect(lifeRandom?.text).toContain("+87%")
        expect(lifeRandom?.rollLevel).toBeGreaterThan(491)

        const ancient = result.affixes.filter(affix => affix.ancient)
        expect(ancient).toHaveLength(1)
        expect(ancient[0].affixId).toBe(1044)
        expect(ancient[0].displayValue).toBe(84.5)
        expect(ancient[0].error).toBe(0)
        expect(ancient[0].text).toContain("普通近战武器暴击伤害")
        expect(warningCodes(result)).not.toContain("affix_value_uncertain")

        const ancientRoll = randomRollOf(result, 1044)
        expect(ancientRoll.ancient).toBe(true)

        const backwater = random.find(affix => affix.affixId === 1018)
        expect(backwater).toBeDefined()
        expect(backwater?.ancient).toBe(false)
        expect(backwater?.displayValue).toBe(17.9)
        expect(backwater?.error).toBe(0)
        expect(backwater?.rollLevel).toBe(498)
        expect(warningCodes(result)).toContain("affix_out_of_pool")
        expect(result.item?.affixes.some(affix => affix.affixId === 1018)).toBe(true)

        for (const affix of random) {
            expect(Math.abs(modelDisplay(affix.affixId, affix.rollLevel, affix.ancient) - affix.displayValue)).toBeLessThanOrEqual(0.6)
        }
        expect(result.unmatchedLines).toEqual(["8000", "装备"])
    })

    it("「普通近战武器基础攻击力」命中数据 attr 普通近战攻击", () => {
        const result = parseGearOcrLines(makeCard(RIGHT_CARD))
        const attack = randomAffixes(result).find(affix => affix.affixId === 1042)
        expect(attack).toBeDefined()
        expect(attack?.error).toBeLessThanOrEqual(0.06)
        expect(attack?.rollLevel).toBeGreaterThanOrEqual(491)
        expect(attack?.rollLevel).toBeLessThanOrEqual(500)
    })
})

describe("parseGearOcrLines — U90a 实拍 21 行（按 x 拆成左右两卡）", () => {
    it("左卡：精致海蚀护胸（4 随机 / 单条太古 / `*` 太古信号）", () => {
        const result = parseGearOcrLines(REAL_LEFT_LINES)
        expect(result.cardCount).toBe(1)
        expect(result.cardIndex).toBe(0)
        expect(result.item).not.toBeNull()
        expect(result.item?.nameSnapshot).toBe("精致海蚀护胸")
        expect(result.slotType).toBe(2)
        expect(result.strength).toBe(50)
        expect(result.rarityId).toBe(5)
        expect(result.iconId).toBe(1004)

        const random = randomAffixes(result)
        expect(random).toHaveLength(4)
        expect(random.map(affix => affix.affixId).sort((left, right) => left - right)).toEqual([1013, 1014, 1043, 1044])

        const ancient = result.affixes.filter(affix => affix.ancient)
        expect(ancient).toHaveLength(1)
        expect(ancient[0].affixId).toBe(1043)
        expect(ancient[0].text).toContain("普通近战武器暴击率")

        const damage = result.affixes.find(affix => affix.affixId === 1044)
        expect(damage?.ancient).toBe(false)
        expect(damage?.error).toBeLessThanOrEqual(0.06)
        expect(result.affixes.find(affix => affix.affixId === 1013)?.error).toBeLessThanOrEqual(0.06)
        expect(result.affixes.find(affix => affix.affixId === 1014)?.error).toBeLessThanOrEqual(0.06)

        expect(result.unmatchedLines).toEqual(["8000", "装备中"])
        expect(result.unmatchedLines).not.toContain("福8000")
        expect(result.unmatchedLines).not.toContain("[69.5~70.5]%")
    })

    it("右卡：精致海妖护胸（4 随机 / 基础生命不计入 / 单条太古）", () => {
        const result = parseGearOcrLines(REAL_RIGHT_LINES)
        expect(result.cardCount).toBe(1)
        expect(result.cardIndex).toBe(0)
        expect(result.item).not.toBeNull()
        expect(result.item?.nameSnapshot).toBe("精致海妖护胸")
        expect(result.slotType).toBe(2)
        expect(result.strength).toBe(50)
        expect(result.rarityId).toBe(5)
        expect(result.iconId).toBe(1006)

        const random = randomAffixes(result)
        expect(random).toHaveLength(4)
        expect(random.map(affix => affix.affixId).sort((left, right) => left - right)).toEqual([1003, 1018, 1042, 1044])

        const base = result.affixes.find(affix => affix.source === "base")
        expect(base?.affixId).toBe(103)
        expect(base?.rollLevel).toBe(50)
        expect(randomRollOf(result, 103).source).toBe("base")
        expect(randomRollOf(result, 103).rollLevel).toBe(50)

        const lifeRandom = random.find(affix => affix.affixId === 1003)
        expect(lifeRandom).toBeDefined()
        expect(lifeRandom?.text).toContain("+87%")

        const ancient = result.affixes.filter(affix => affix.ancient)
        expect(ancient).toHaveLength(1)
        expect(ancient[0].affixId).toBe(1044)
        expect(ancient[0].text).toContain("普通近战武器暴击伤害")

        const backwater = random.find(affix => affix.affixId === 1018)
        expect(backwater).toBeDefined()
        expect(backwater?.ancient).toBe(false)
        expect(backwater?.displayValue).toBe(17.9)
        expect(backwater?.error).toBe(0)
        expect(backwater?.rollLevel).toBe(498)
        expect(warningCodes(result)).toContain("affix_out_of_pool")
        expect(result.item?.affixes.some(affix => affix.affixId === 1018)).toBe(true)

        expect(result.unmatchedLines).toEqual(["福8000"])
    })

    it("parseGearOcrCards：同一 21 行返回左右两个独立结果", () => {
        const results = parseGearOcrCards(REAL_OCR_LINES)
        expect(results).toHaveLength(2)
        expect(results.map(result => result.cardIndex)).toEqual([0, 1])
        expect(results.map(result => result.cardCount)).toEqual([2, 2])
        expect(results[0].item?.nameSnapshot).toBe("精致海蚀护胸")
        expect(results[1].item?.nameSnapshot).toBe("精致海妖护胸")
        expect(results[0].iconId).toBe(1004)
        expect(results[1].iconId).toBe(1006)
        expect(randomAffixes(results[0])).toHaveLength(4)
        expect(randomAffixes(results[1])).toHaveLength(4)
        expect(results[1].affixes.some(affix => affix.affixId === 1018)).toBe(true)
        expect(warningCodes(results[1])).toContain("affix_out_of_pool")
        expect(results[0].unmatchedLines).toEqual(["8000", "装备中"])
        expect(results[1].unmatchedLines).toEqual(["福8000"])
    })
})

describe("parseGearOcrLines — 边界用例", () => {
    it("区间拆到下一行时附着到上一条词条", () => {
        const texts = [...LEFT_CARD]
        const target = texts.indexOf("普通近战武器暴击伤害 +70% [69.5-70.5]%")
        texts.splice(target, 1, "普通近战武器暴击伤害 +70%", "[69.5-70.5]%")
        const result = parseGearOcrLines(makeCard(texts))
        const damage = randomAffixes(result).find(affix => affix.affixId === 1044)
        expect(damage).toBeDefined()
        expect(damage?.error).toBeLessThanOrEqual(0.06)
        expect(result.unmatchedLines).toEqual(["8000", "装备中"])
        expect(warningCodes(result)).not.toContain("affix_unmatched")
    })

    it("强度写作 5O / 全角数字仍为 50", () => {
        for (const strengthLine of ["强度 5O", "强度 ５０"]) {
            const texts = LEFT_CARD.map(text => (text.startsWith("强度") ? strengthLine : text))
            const result = parseGearOcrLines(makeCard(texts))
            expect(result.strength).toBe(50)
            expect(result.item).not.toBeNull()
        }
    })

    it("缺强度 → item 为 null 且输出 strength_missing", () => {
        const texts = LEFT_CARD.filter(text => !text.startsWith("强度"))
        const result = parseGearOcrLines(makeCard(texts))
        expect(result.item).toBeNull()
        expect(result.strength).toBeNull()
        expect(warningCodes(result)).toContain("strength_missing")
    })

    it("缺名称 → item 为 null 且输出 name_missing", () => {
        const texts = LEFT_CARD.filter(text => !text.includes("护胸") || text.startsWith("升华装备"))
        const result = parseGearOcrLines(makeCard(texts))
        expect(result.item).toBeNull()
        expect(warningCodes(result)).toContain("name_missing")
    })

    it("未知词条 → affix_unmatched，其余字段照常解析", () => {
        const texts = [...LEFT_CARD.slice(0, -2), "神秘未知词条 +12.3% [12-13]%", ...LEFT_CARD.slice(-2)]
        const result = parseGearOcrLines(makeCard(texts))
        expect(result.item).not.toBeNull()
        expect(warningCodes(result)).toContain("affix_unmatched")
        expect(result.unmatchedLines.some(line => line.includes("神秘未知词条"))).toBe(true)
        expect(randomAffixes(result)).toHaveLength(4)
    })

    it("重复词条 → affix_duplicate 且只保留一条", () => {
        const texts = [...LEFT_CARD.slice(0, -2), "技能威力 +76% [75.5-76.5]%", ...LEFT_CARD.slice(-2)]
        const result = parseGearOcrLines(makeCard(texts))
        expect(warningCodes(result)).toContain("affix_duplicate")
        expect(randomAffixes(result).filter(affix => affix.affixId === 1013)).toHaveLength(1)
        expect(randomAffixes(result)).toHaveLength(4)
    })

    it("槽型 9「终结技技能等级 +7」→ 1511 太古（1039 描述相同但不进协战候选）", () => {
        const texts = ["厚重海雾护符", "强度 50", "升华装备·印章", "生命 +306%", "终结技技能等级 +7"]
        const result = parseGearOcrLines(makeCard(texts))
        expect(result.slotType).toBe(9)
        expect(result.item).not.toBeNull()
        const skill = randomAffixes(result).find(affix => affix.affixId === 1511)
        expect(skill).toBeDefined()
        expect(skill?.ancient).toBe(true)
        expect(result.affixes.some(affix => affix.affixId === 1039)).toBe(false)
        expect(warningCodes(result)).toContain("ancient_inferred")
        expect(warningCodes(result)).not.toContain("affix_unmatched")
    })

    it("主控耳环「终结技技能等级 +7」→ 1039 太古（1511 只进印章候选）", () => {
        const texts = ["完美海蚀耳环", "强度 50", "升华装备·耳环", "护盾 +262%", "终结技技能等级 +7"]
        const result = parseGearOcrLines(makeCard(texts))
        expect(result.slotType).toBe(5)
        expect(result.item).not.toBeNull()
        const skill = randomAffixes(result).find(affix => affix.affixId === 1039)
        expect(skill).toBeDefined()
        expect(skill?.ancient).toBe(true)
        expect(result.affixes.some(affix => affix.affixId === 1511)).toBe(false)
        expect(warningCodes(result)).toContain("ancient_inferred")
        expect(warningCodes(result)).not.toContain("affix_unmatched")
    })

    it("主控项链「被动技能等级 +7」→ 1040 太古（1512 只进典籍候选）", () => {
        const texts = ["尊贵海蚀项链", "强度 50", "升华装备·项链", "增伤 +121%", "被动技能等级 +7"]
        const result = parseGearOcrLines(makeCard(texts))
        expect(result.slotType).toBe(6)
        expect(result.item).not.toBeNull()
        const skill = randomAffixes(result).find(affix => affix.affixId === 1040)
        expect(skill).toBeDefined()
        expect(skill?.ancient).toBe(true)
        expect(result.affixes.some(affix => affix.affixId === 1512)).toBe(false)
        expect(warningCodes(result)).toContain("ancient_inferred")
        expect(warningCodes(result)).not.toContain("affix_unmatched")
    })

    it("主候选池外 Plan 2 词条只经 fallback 命中并标记池外（行为不变）", () => {
        // 背水 1018（池 201）不在护胸池 [202,203,204]：主候选不可信时由 fallback 兜底
        expect(getGearRandomAffixPool(2).some(affix => affix.id === 1018)).toBe(false)
        const texts = ["精致海蚀护胸", "强度 50", "升华装备·护胸", "生命 +262%", "背水 +17.9% [17.7-17.95]%"]
        const result = parseGearOcrLines(makeCard(texts))
        const backwater = randomAffixes(result).find(affix => affix.affixId === 1018)
        expect(backwater).toBeDefined()
        expect(warningCodes(result)).toContain("affix_out_of_pool")
        expect(warningCodes(result)).not.toContain("affix_unmatched")
    })

    it("有区间时不得标记太古", () => {
        const texts = ["精致海蚀护胸", "强度 50", "升华装备·护胸", "生命 +262%", "普通近战武器暴击率 +70% [69.5-70.5]%"]
        const result = parseGearOcrLines(makeCard(texts))
        const crit = randomAffixes(result).find(affix => affix.affixId === 1043)
        expect(crit).toBeDefined()
        expect(crit?.ancient).toBe(false)
        expect(result.affixes.filter(affix => affix.ancient)).toHaveLength(0)
    })

    it("无区间且数值命中太古公式 → 标记太古", () => {
        const texts = ["精致海蚀护胸", "强度 50", "升华装备·护胸", "生命 +262%", "普通近战武器暴击伤害 +84.5%"]
        const result = parseGearOcrLines(makeCard(texts))
        const damage = randomAffixes(result).find(affix => affix.affixId === 1044)
        expect(damage).toBeDefined()
        expect(damage?.ancient).toBe(true)
        expect(warningCodes(result)).toContain("ancient_inferred")
    })

    it("行首 `*` 不能绕过太古数值门槛", () => {
        const texts = ["精致海蚀护胸", "强度 50", "升华装备·护胸", "生命 +262%", "*技能威力 +10%"]
        const result = parseGearOcrLines(makeCard(texts))
        const skill = result.affixes.find(affix => affix.affixId === 1013)
        expect(skill).toBeDefined()
        expect(skill?.ancient).toBe(false)
        expect(warningCodes(result)).not.toContain("ancient_inferred")
    })

    it("负值词条（减伤-15%）按负值解析并入库", () => {
        const texts = ["精致海蚀护胸", "强度 50", "升华装备·护胸", "生命 +262%", "减伤-15%"]
        const result = parseGearOcrLines(makeCard(texts))
        const reduction = randomAffixes(result).find(affix => affix.affixId === 1061)
        expect(reduction).toBeDefined()
        expect(reduction?.displayValue).toBe(-15)
        expect(result.item?.affixes.some(affix => affix.affixId === 1061)).toBe(true)
    })

    it("名称匹配先按大字号过滤，小字号装饰名不抢主名称", () => {
        const lines: GearOcrLine[] = [
            { text: "精致海妖护胸", x: 24, y: 8, width: 80, height: 10 },
            { text: "精致海蚀护", x: 24, y: 40, width: 120, height: 24 },
            { text: "强度 50", x: 24, y: 76, width: 80, height: 24 },
            { text: "升华装备·护胸", x: 24, y: 112, width: 120, height: 24 },
            { text: "生命 +262%", x: 24, y: 148, width: 100, height: 24 },
        ]
        const result = parseGearOcrLines(lines)
        expect(result.iconId).toBe(1004)
        expect(result.item?.nameSnapshot).toBe("精致海蚀护胸")
    })

    it("基础行 0.6 宽容差只限整数显示的百分比（262.5 → uncertain）", () => {
        const texts = LEFT_CARD.map(text => (text === "生命 +262%" ? "生命 +262.5%" : text))
        const result = parseGearOcrLines(makeCard(texts))
        const base = result.affixes.find(affix => affix.source === "base")
        expect(base?.displayValue).toBe(262.5)
        expect(warningCodes(result)).toContain("affix_value_uncertain")
    })

    it("暗金名称 → kind unique / rarity 10 / uniqueAffix", () => {
        const texts = ["星落梯云战甲", "强度 50", "升华装备·护胸", "生命 +262%", "普通近战武器暴击伤害 +84.5%"]
        const result = parseGearOcrLines(makeCard(texts))
        expect(result.item?.kind).toBe("unique")
        expect(result.rarityId).toBe(10)
        expect(result.uniqueId).toBe(120003)
        expect(result.item?.uniqueId).toBe(120003)
        expect(result.item?.uniqueAffix?.affixId).toBe(420101)
        expect(result.item?.uniqueAffix?.rollLevel).toBe(1)
        expect(warningCodes(result)).toContain("unique_affix_missing")
    })

    it("U131 词条按识别行序保留：item.affixes 与预览行顺序一致（防御 / 火属性增伤 / 昂扬 / 技能威力）", () => {
        const texts = ["海蚀头盔", "强度 50", "升华装备·头盔", "防御 +262%", "火属性增伤 +14%", "昂扬 +53.5%", "技能威力 +76.5%"]
        const result = parseGearOcrLines(makeCard(texts))
        expect(result.item).not.toBeNull()
        expect(warningCodes(result)).not.toContain("affix_unmatched")

        const order = [102, 1033, 1017, 1013]
        expect(result.item?.affixes.map(roll => roll.affixId)).toEqual(order)
        expect(result.item?.affixes[0].source).toBe("base")
        const lines = getItemAffixLines(result.item!, 1)
        expect(lines.map(line => line.roll.affixId)).toEqual(order)
        expect(lines[0].base).toBe(true)
        expect(lines.slice(1).every(line => line.source === "random")).toBe(true)
    })

    it("translate 译文别名可命中（非中文截图 / UI）", () => {
        const texts = ["精致海妖护胸", "强度 50", "升华装备·护胸", "生命 +262%", "Normal Melee ATK +121.5% [121-122]%"]
        const translate = (text: string) => (text === "普通近战攻击" ? "Normal Melee ATK" : text)
        const result = parseGearOcrLines(makeCard(texts), { translate })
        const attack = randomAffixes(result).find(affix => affix.affixId === 1042)
        expect(attack).toBeDefined()
        expect(attack?.error).toBeLessThanOrEqual(0.06)
    })

    it("缺部位行时由基底反推部位", () => {
        const texts = LEFT_CARD.filter(text => !text.startsWith("升华装备"))
        const result = parseGearOcrLines(makeCard(texts))
        expect(result.slotType).toBe(2)
        expect(result.item).not.toBeNull()
        expect(warningCodes(result)).not.toContain("slot_missing")
    })

    it("部位与名称不一致时以名称反推结果为准并警告", () => {
        const texts = LEFT_CARD.map(text => (text.startsWith("升华装备") ? "升华装备·头盔" : text))
        const result = parseGearOcrLines(makeCard(texts))
        expect(result.slotType).toBe(2)
        expect(result.warnings.some(warning => warning.code === "text_unparsed" && warning.detail?.includes("升华装备·头盔"))).toBe(true)
    })

    it("基础词条行缺失 → base_affix_missing，item 仍产出并由模型补基础", () => {
        const texts = LEFT_CARD.filter(text => !text.startsWith("生命 +262"))
        const result = parseGearOcrLines(makeCard(texts))
        expect(result.item).not.toBeNull()
        expect(warningCodes(result)).toContain("base_affix_missing")
        expect(randomRollOf(result, 103).source).toBe("base")
    })

    it("8000 / 福8000 / 装备中进入 unmatchedLines，不影响解析", () => {
        const texts = [...LEFT_CARD, "福8000"]
        const result = parseGearOcrLines(makeCard(texts))
        expect(result.unmatchedLines).toContain("8000")
        expect(result.unmatchedLines).toContain("福8000")
        expect(result.unmatchedLines).toContain("装备中")
        expect(result.item).not.toBeNull()
        expect(randomAffixes(result)).toHaveLength(4)
    })

    it("输出确定：相同输入两次解析结果一致", () => {
        const first = parseGearOcrLines(makeCard(LEFT_CARD))
        const second = parseGearOcrLines(makeCard(LEFT_CARD))
        expect(JSON.parse(JSON.stringify(first))).toEqual(JSON.parse(JSON.stringify(second)))
    })
})
