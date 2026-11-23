import { describe, expect, it } from "vitest"
import { affixes as affixData, crafts, inlays as inlayData } from "../d"
import { resolveAffixValue, resolveGearEffects } from "../transcend"
import {
    flattenEquippedGear,
    normalizeGearItem,
    TRANSCEND_MAX_ITEM_AFFIX_ROLLS,
    type TranscendGearAffixRoll,
    type TranscendGearItemConfig,
} from "../transcendGear"
import { decodeTranscendGearCode, encodeTranscendGearCode, TRANSCEND_GEAR_CODE_SNAPSHOT_PREFIX } from "../transcendGearCode"
import {
    applyCreateSocket,
    applyDetachAll,
    applyEnchant,
    applyFinalMasterwork,
    applyInlay,
    applyMasterwork,
    applyTemper,
    commitGearCraft,
    getCraftAvailability,
    getCraftCostMultiplier,
    getCraftCosts,
    getCraftDef,
    getGearCraftState,
    getGearEnchantTargets,
    getGearFinalMasterworkTargets,
    getGearTemperingAffixPool,
    getMasterworkMax,
    isAffixBlockedByEnchantSnapshot,
    replaceSocketGem,
    resetEnchant,
    resetTempering,
    setGearMasterworkLevel,
    setTemperingAncient,
    TRANSCEND_CRAFT_CREATE_SOCKET,
    TRANSCEND_CRAFT_ENCHANT,
    TRANSCEND_CRAFT_EQUIP_INLAY,
    TRANSCEND_CRAFT_FINAL_MASTERWORK,
    TRANSCEND_CRAFT_MASTERWORK,
    TRANSCEND_CRAFT_TEMPERING,
    TRANSCEND_CRAFT_UNEQUIP_INLAY,
    type TranscendCraftDatasets,
} from "../transcendGearCraft"

/** 词条 roll（精锻由 craft 统一写入，这里默认 0） */
const roll = (affixId: number, patch: Partial<TranscendGearAffixRoll> = {}): TranscendGearAffixRoll => ({
    affixId,
    rollLevel: 1,
    masterworkLevel: 0,
    ancient: false,
    finalMasterwork: false,
    ...patch,
})

/** 装备物品（槽型 3 手套：基础 101，淬炼池 201/203/205，两孔） */
const item = (patch: Partial<TranscendGearItemConfig> & Pick<TranscendGearItemConfig, "slotType">): TranscendGearItemConfig => ({
    kind: "normal",
    affixes: [],
    ...patch,
})

/** 金色品质基础物品：基础词条 101 + 一条随机词条 1001 */
const goldItem = (patch: Partial<TranscendGearItemConfig> = {}): TranscendGearItemConfig =>
    item({ slotType: 3, rarityId: 5, equipBaseScore: 50, affixes: [roll(101), roll(1001)], ...patch })

describe("craft 定义与成本", () => {
    it("craft 1-7 从数据表读取，不写死资源 id", () => {
        for (const id of [1, 2, 3, 4, 5, 6, 7]) expect(getCraftDef(id)?.id).toBe(id)
        expect(getCraftDef(1)?.maxCount).toBe(10)
        expect(getCraftDef(4)?.enchantGrowthFactor).toBe(1)
        expect(getCraftDef(4)?.enchantGrowthMaxCount).toBe(5)
        expect(getCraftDef(99)).toBeUndefined()
    })

    it("精锻上限取 craft 1 maxCount（缺失时回退 10）", () => {
        expect(getMasterworkMax()).toBe(10)
        expect(getMasterworkMax({ crafts: [{ id: 1, maxCount: 7 }] })).toBe(7)
        expect(getMasterworkMax({ crafts: [] })).toBe(10)
    })

    it("附魔费用成长 1×..6×，第 7 次起封顶 6×（不是次数上限）", () => {
        expect(getCraftCostMultiplier(getCraftDef(4)!, 0)).toBe(1)
        expect(getCraftCostMultiplier(getCraftDef(4)!, 1)).toBe(2)
        expect(getCraftCostMultiplier(getCraftDef(4)!, 5)).toBe(6)
        expect(getCraftCostMultiplier(getCraftDef(4)!, 6)).toBe(6)
        expect(getCraftCostMultiplier(getCraftDef(4)!, 99)).toBe(6)
        // 没有成长字段的 craft 恒为 1×
        expect(getCraftCostMultiplier(getCraftDef(1)!, 5)).toBe(1)
    })

    it("成本随附魔次数成长并逐行向上取整；craft 6 无成本、craft 7 仅货币", () => {
        const base = getCraftCosts(4, { enchantCount: 0 })
        expect(base.multiplier).toBe(1)
        expect(base.rows).toEqual([
            { id: 7000102, count: 100, price: false },
            { id: 7000103, count: 5, price: false },
            { id: 7000101, count: 300000, price: true },
        ])
        const second = getCraftCosts(4, { enchantCount: 1 })
        expect(second.multiplier).toBe(2)
        expect(second.rows.map(row => row.count)).toEqual([200, 10, 600000])
        expect(getCraftCosts(4, { enchantCount: 9 }).rows.map(row => row.count)).toEqual([600, 30, 1800000])
        expect(getCraftCosts(TRANSCEND_CRAFT_EQUIP_INLAY).rows).toEqual([])
        expect(getCraftCosts(TRANSCEND_CRAFT_UNEQUIP_INLAY).rows).toEqual([{ id: 7000101, count: 50000, price: true }])
        // 资源 id 全部来自数据表
        expect(Object.keys(getCraftDef(4)!.costItems!)).toEqual(["7000102", "7000103"])
        expect(crafts.length).toBeGreaterThanOrEqual(7)
    })
})

describe("craft 可用性门槛", () => {
    it("白 / 蓝品质只有 5/6/7；金色 / 暗金 1-7", () => {
        const white = item({ slotType: 1, rarityId: 1, affixes: [roll(102)] })
        for (const id of [
            TRANSCEND_CRAFT_MASTERWORK,
            TRANSCEND_CRAFT_FINAL_MASTERWORK,
            TRANSCEND_CRAFT_TEMPERING,
            TRANSCEND_CRAFT_ENCHANT,
        ]) {
            expect(getCraftAvailability(white, id)).toEqual({ craftId: id, available: false, reason: "rarity" })
        }
        expect(getCraftAvailability(white, TRANSCEND_CRAFT_CREATE_SOCKET).available).toBe(true)
        expect(getCraftAvailability(white, TRANSCEND_CRAFT_EQUIP_INLAY).available).toBe(false)
        expect(getCraftAvailability(white, TRANSCEND_CRAFT_EQUIP_INLAY).reason).toBe("no-empty-socket")

        const gold = goldItem()
        expect(getCraftAvailability(gold, TRANSCEND_CRAFT_MASTERWORK).available).toBe(true)
        expect(getCraftAvailability(gold, TRANSCEND_CRAFT_TEMPERING).available).toBe(true)
        expect(getCraftAvailability(gold, TRANSCEND_CRAFT_ENCHANT).available).toBe(true)
    })

    it("缺品质 / 未知 craft / 跨赛季明确不可用", () => {
        expect(getCraftAvailability(item({ slotType: 3 }), 1)).toEqual({ craftId: 1, available: false, reason: "unknown-rarity" })
        expect(getCraftAvailability(goldItem(), 99)).toEqual({ craftId: 99, available: false, reason: "unknown-craft" })
        const oldSeason = goldItem({ seasonId: 0 })
        // seasonId 0 视为未记录：不判跨赛季
        expect(getCraftAvailability(oldSeason, TRANSCEND_CRAFT_MASTERWORK).available).toBe(true)
        const crossSeason = goldItem({ seasonId: 99 })
        expect(getCraftAvailability(crossSeason, TRANSCEND_CRAFT_MASTERWORK)).toEqual({
            craftId: TRANSCEND_CRAFT_MASTERWORK,
            available: false,
            reason: "cross-season",
        })
    })

    it("精锻满 10 后才能最终精锻；最终目标只认有 MaxAffixUpdateFunc 的词条", () => {
        const mid = setGearMasterworkLevel(goldItem(), 5)
        expect(getCraftAvailability(mid, TRANSCEND_CRAFT_FINAL_MASTERWORK)).toEqual({
            craftId: TRANSCEND_CRAFT_FINAL_MASTERWORK,
            available: false,
            reason: "masterwork-required",
        })
        const max = setGearMasterworkLevel(goldItem(), 10)
        expect(getCraftAvailability(max, TRANSCEND_CRAFT_MASTERWORK)).toEqual({
            craftId: TRANSCEND_CRAFT_MASTERWORK,
            available: false,
            reason: "masterwork-max",
        })
        expect(getCraftAvailability(max, TRANSCEND_CRAFT_FINAL_MASTERWORK).available).toBe(true)
        const baseOnly = setGearMasterworkLevel(item({ slotType: 3, rarityId: 5, affixes: [roll(101)] }), 10)
        expect(getCraftAvailability(baseOnly, TRANSCEND_CRAFT_FINAL_MASTERWORK)).toEqual({
            craftId: TRANSCEND_CRAFT_FINAL_MASTERWORK,
            available: false,
            reason: "no-final-target",
        })
    })

    it("淬炼池来自槽位 temperAffixPoolIds（全 Plan，不按 Plan 过滤）；附魔无目标时不可用", () => {
        const pool = getGearTemperingAffixPool(3).map(affix => affix.id)
        expect(pool).toContain(1001)
        expect(pool).toContain(1058)
        expect(pool).not.toContain(1002)
        expect(getGearTemperingAffixPool(8).every(affix => affix.pool === 211)).toBe(true)

        const baseOnly = item({ slotType: 3, rarityId: 5, affixes: [roll(101)] })
        expect(getCraftAvailability(baseOnly, TRANSCEND_CRAFT_ENCHANT)).toEqual({
            craftId: TRANSCEND_CRAFT_ENCHANT,
            available: false,
            reason: "no-enchant-target",
        })
    })
})

describe("精锻与最终精锻", () => {
    it("精锻是装备级：0-10 钳制，全部词条统一展开，满级后不可再精锻", () => {
        const once = applyMasterwork(goldItem())
        expect(getGearCraftState(once).masterworkLevel).toBe(1)
        expect(once.affixes.every(entry => entry.masterworkLevel === 1)).toBe(true)

        const max = applyMasterwork(goldItem(), 99)
        expect(getGearCraftState(max).masterworkLevel).toBe(10)
        expect(applyMasterwork(max)).toBe(max)

        const clamped = setGearMasterworkLevel(goldItem(), 99)
        expect(getGearCraftState(clamped).masterworkLevel).toBe(10)
        expect(getGearCraftState(setGearMasterworkLevel(goldItem(), -3)).masterworkLevel).toBe(0)
    })

    it("最终精锻单目标：满 10 才能设置，只对目标词条生效，换目标后旧目标清除", () => {
        const mid = setGearMasterworkLevel(goldItem({ affixes: [roll(101), roll(1001), roll(1002)] }), 5)
        expect(applyFinalMasterwork(mid, 2)).toBe(mid)

        const max = setGearMasterworkLevel(goldItem({ affixes: [roll(101), roll(1001), roll(1002)] }), 10)
        expect(getGearFinalMasterworkTargets(max)).toEqual([1, 2])
        const first = applyFinalMasterwork(max, 1)
        expect(first.craft?.finalMasterworkAffixIndex).toBe(1)
        expect(first.affixes.map(entry => entry.finalMasterwork)).toEqual([false, true, false])

        const second = applyFinalMasterwork(first, 2)
        expect(second.craft?.finalMasterworkAffixIndex).toBe(2)
        expect(second.affixes.map(entry => entry.finalMasterwork)).toEqual([false, false, true])
        expect(applyFinalMasterwork(second, 0)).toBe(second) // 基础词条没有 MaxAffixUpdateFunc
        expect(applyFinalMasterwork(second, null).craft?.finalMasterworkAffixIndex).toBeUndefined()

        // 精锻降级清除最终目标
        expect(setGearMasterworkLevel(second, 9).craft?.finalMasterworkAffixIndex).toBeUndefined()
    })

    it("计算尊重真实 AffixUpdatePerLvFunc / MaxAffixUpdateFunc（×1.01^10 / Multi 1.1 / Add 3）", () => {
        const max = setGearMasterworkLevel(goldItem({ affixes: [roll(101), roll(1001), roll(1058)] }), 10)
        const targeted = applyFinalMasterwork(max, 2)
        const { entries } = flattenEquippedGear([{ slotId: 3, item: targeted }])
        const byId = new Map(entries.map(entry => [entry.affixId, entry]))
        expect(byId.get(1001)?.masterworkLevel).toBe(10)
        expect(byId.get(1001)?.finalMasterwork).toBe(false)
        expect(byId.get(1058)?.finalMasterwork).toBe(true)
        expect(byId.get(101)?.masterworkLevel).toBe(10)

        const numeric = resolveAffixValue(
            {
                id: 1001,
                plan: 2,
                minValue: 1,
                maxValue: 2,
                totalValueLevel: 500,
                affixUpdatePerLvFunc: { Multi: 1.01 },
                maxAffixUpdateFunc: { Multi: 1.1 },
            },
            byId.get(1001)!
        )
        expect(numeric.afterMasterwork).toBeCloseTo(numeric.afterAncient * 1.01 ** 10, 8)
        expect(numeric.final).toBeCloseTo(numeric.afterMasterwork, 8)

        const spirit = resolveAffixValue(
            {
                id: 1058,
                plan: 3,
                minValue: 3,
                maxValue: 15,
                totalValueLevel: 5,
                affixUpdatePerLvFunc: { Add: 0 },
                maxAffixUpdateFunc: { Add: 3 },
            },
            byId.get(1058)!
        )
        // Add 0 的精锻不改变数值；最终精锻 +3
        expect(spirit.afterMasterwork).toBe(spirit.afterAncient)
        expect(spirit.final).toBe(spirit.afterMasterwork + 3)
    })
})

describe("淬炼", () => {
    it("单条淬炼词条：池内可选、新增或替换、计数累计", () => {
        const tempered = applyTemper(goldItem(), { affixId: 1006 })
        expect(tempered.craft?.temperingAffixIndex).toBe(2)
        expect(tempered.craft?.temperingCount).toBe(1)
        expect(tempered.affixes[2].source).toBe("tempering")

        const replaced = applyTemper(tempered, { affixId: 1024, rollLevel: 3 })
        expect(replaced.affixes).toHaveLength(tempered.affixes.length)
        expect(replaced.craft?.temperingCount).toBe(2)
        const temperingRolls = replaced.affixes.filter(entry => entry.source === "tempering")
        expect(temperingRolls).toHaveLength(1)
        expect(temperingRolls[0]).toMatchObject({ affixId: 1024, rollLevel: 3 })
    })

    it("池外词条 / 基础词条不可淬炼；同 id 随机词条可（见共存用例）", () => {
        const base = goldItem({ affixes: [roll(101), roll(1002)] })
        expect(applyTemper(base, { affixId: 1002 })).toBe(base) // 池外（202 不在槽位 3 的池）
        expect(applyTemper(base, { affixId: 101 })).toBe(base) // 基础词条
        expect(applyTemper(base, { affixId: 1001 }).affixes.some(entry => entry.source === "tempering")).toBe(true)
        const withRandom = applyTemper(base, { affixId: 1001 })
        expect(applyTemper(withRandom, { affixId: 1001 }).craft?.temperingCount).toBe(2)
    })

    it("applyTemper 按入参写入太古；没有太古公式的词条恒为非太古", () => {
        const ancient = applyTemper(goldItem(), { affixId: 1006, ancient: true })
        expect(ancient.affixes.find(entry => entry.source === "tempering")).toMatchObject({ affixId: 1006, ancient: true })
        // 替换时按入参重新写入，不继承上一条的标记
        const replaced = applyTemper(ancient, { affixId: 1024 })
        expect(replaced.affixes.find(entry => entry.source === "tempering")).toMatchObject({ affixId: 1024, ancient: false })
        // 无 ancientFunc：即使传 true 也置 false
        const noFormulaDatasets: TranscendCraftDatasets = { affixes: [{ id: 1201, pool: 201, totalValueLevel: 500 }] }
        const noFormula = applyTemper(goldItem(), { affixId: 1201, ancient: true }, noFormulaDatasets)
        expect(noFormula.affixes.find(entry => entry.source === "tempering")).toMatchObject({ affixId: 1201, ancient: false })
    })

    it("setTemperingAncient 只改太古标记：不增加次数、保留档位 / 最终精锻 / 附魔状态", () => {
        const maxed = applyTemper(goldItem({ craft: { masterworkLevel: 10, temperingCount: 0, enchantCount: 0 } }), {
            affixId: 1006,
            rollLevel: 420,
        })
        const withFinal = applyFinalMasterwork(maxed, 1)
        expect(withFinal.craft?.finalMasterworkAffixIndex).toBe(1)

        const ancient = setTemperingAncient(withFinal, true)
        expect(ancient).not.toBe(withFinal)
        expect(ancient.craft).toMatchObject({ temperingCount: 1, temperingAffixIndex: 2, finalMasterworkAffixIndex: 1 })
        expect(ancient.affixes[2]).toMatchObject({
            affixId: 1006,
            ancient: true,
            source: "tempering",
            rollLevel: 420,
            masterworkLevel: 10,
        })
        expect(ancient.affixes[1]).toMatchObject({ affixId: 1001, finalMasterwork: true, ancient: false })
        // 已是太古时再次传 true：no-op
        expect(setTemperingAncient(ancient, true)).toBe(ancient)

        // 关闭太古不影响最终精锻与附魔索引 / 快照（保持词条数组顺序：1006 在 1024 之后）
        const enchanted = applyEnchant(withFinal, 1, { affixId: 1024 })
        expect(enchanted.craft).toMatchObject({ enchantAffixIndex: 1, temperingAffixIndex: 2 })
        const snapshot = enchanted.craft?.enchantSnapshot
        expect(snapshot).toMatchObject({ affixIndex: 1, roll: { affixId: 1001 } })
        const toggled = setTemperingAncient(enchanted, true)
        expect(toggled.craft).toMatchObject({ enchantAffixIndex: 1, finalMasterworkAffixIndex: 1, temperingCount: 1 })
        expect(toggled.craft?.enchantSnapshot).toEqual(snapshot)
        expect(toggled.affixes[2]).toMatchObject({ affixId: 1006, source: "tempering", ancient: true })
        expect(toggled.affixes[1]).toMatchObject({ affixId: 1024, source: "enchant" })
        const back = setTemperingAncient(toggled, false)
        expect(back.affixes[2].ancient).toBe(false)
        expect(back.craft?.temperingCount).toBe(1)
        expect(back.craft?.enchantSnapshot).toEqual(snapshot)
        expect(setTemperingAncient(back, false)).toBe(back)

        // 没有淬炼行时原样返回
        const plain = goldItem()
        expect(setTemperingAncient(plain, true)).toBe(plain)
        // 已知词条但没有 ancientFunc：先确认淬炼行成立，再断言拒绝打开太古
        const noFormulaDatasets: TranscendCraftDatasets = {
            affixes: [{ id: 1201, pool: 201, totalValueLevel: 500 }],
            slots: [{ id: 3, baseAffixId: 101, maxInlayCount: 2, temperAffixPoolIds: [201, 203, 205] }],
            rarities: [{ id: 5, craftTypes: [1, 2, 3, 4, 5, 6, 7] }],
        }
        const noFormulaItem = item({ slotType: 3, rarityId: 5, affixes: [roll(101), roll(1201, { source: "tempering" })] })
        expect(getGearCraftState(noFormulaItem, noFormulaDatasets).temperingAffixIndex).toBe(1)
        const refused = setTemperingAncient(noFormulaItem, true, noFormulaDatasets)
        expect(refused).toBe(noFormulaItem)
        expect(refused.affixes[1].ancient).toBe(false)
    })

    it("词条上限：基础 1 + 随机 4 + 淬炼 1 = 6，超过 7 条的归一化输入被裁剪", () => {
        expect(TRANSCEND_MAX_ITEM_AFFIX_ROLLS).toBe(7)
        const randomIds = [1001, 1002, 1003, 1004, 1005]
        const warnings: string[] = []
        const normalized = normalizeGearItem(
            item({
                slotType: 3,
                affixes: [
                    roll(101),
                    ...randomIds.map(id => roll(id)),
                    roll(1024, { source: "tempering" }),
                    roll(1025, { source: "tempering" }),
                ],
            }),
            undefined,
            { warnings }
        )!
        expect(normalized.affixes.length).toBe(6)
        expect(normalized.affixes.filter(entry => entry.source === "base")).toHaveLength(1)
        expect(normalized.affixes.filter(entry => entry.source === "tempering")).toHaveLength(1)
        expect(normalized.craft?.temperingAffixIndex).toBe(normalized.affixes.findIndex(entry => entry.source === "tempering"))
        expect(warnings.some(message => message.includes("淬炼词条有 2 条"))).toBe(true)
    })
})

describe("淬炼与随机词条同 id 共存", () => {
    it("已有随机 1001 时可再淬炼 1001：两行共存，craft 下标指向淬炼行", () => {
        const tempered = applyTemper(goldItem(), { affixId: 1001 })
        expect(tempered.affixes.map(entry => entry.affixId)).toEqual([101, 1001, 1001])
        expect(tempered.craft).toMatchObject({ temperingAffixIndex: 2, temperingCount: 1 })
        expect(tempered.affixes[tempered.craft!.temperingAffixIndex!]).toMatchObject({ affixId: 1001, source: "tempering" })
        // 归一化补齐来源：随机行保持 random，淬炼行保持 tempering
        expect(normalizeGearItem(tempered)!.affixes.map(entry => entry.source)).toEqual(["base", "random", "tempering"])

        // 再次淬炼同 id 走替换，不新增行
        const again = applyTemper(tempered, { affixId: 1001, rollLevel: 420 })
        expect(again.affixes).toHaveLength(3)
        expect(again.craft?.temperingCount).toBe(2)
        expect(again.affixes[2]).toMatchObject({ affixId: 1001, rollLevel: 420, source: "tempering" })

        // 换成不同 id 仍是替换，随机行保持原值
        const replaced = applyTemper(again, { affixId: 1024 })
        expect(replaced.affixes).toHaveLength(3)
        expect(replaced.affixes[2]).toMatchObject({ affixId: 1024, source: "tempering" })
        expect(replaced.affixes[1]).toMatchObject({ affixId: 1001 })
        expect(replaced.craft?.temperingAffixIndex).toBe(2)
    })

    it("归一化往返：随机 + 淬炼同 id 保两行与顺序，craft 下标不指错", () => {
        const tempered = applyTemper(goldItem(), { affixId: 1001 })
        const normalized = normalizeGearItem(tempered)!
        expect(normalized.affixes.map(entry => [entry.affixId, entry.source])).toEqual([
            [101, "base"],
            [1001, "random"],
            [1001, "tempering"],
        ])
        expect(normalized.craft?.temperingAffixIndex).toBe(2)
        // 二次归一化幂等（存档 / 分享读回同口径）
        expect(normalizeGearItem(normalized)).toEqual(normalized)
    })

    it("无来源原始数组按 craft 淬炼下标归类：同 id 随机行不会被去重吞掉", () => {
        const warnings: string[] = []
        const normalized = normalizeGearItem(
            item({
                slotType: 3,
                affixes: [roll(1001, { rollLevel: 2 }), roll(101), roll(1001, { rollLevel: 420 })],
                craft: { masterworkLevel: 0, temperingAffixIndex: 2, temperingCount: 1, enchantCount: 0 },
            }),
            undefined,
            { warnings }
        )!
        expect(normalized.affixes.map(entry => [entry.affixId, entry.source])).toEqual([
            [1001, "random"],
            [101, "base"],
            [1001, "tempering"],
        ])
        expect(normalized.craft?.temperingAffixIndex).toBe(2)
        expect(normalized.affixes[2].rollLevel).toBe(420)
        expect(warnings.some(message => message.includes("1001 重复"))).toBe(false)
    })

    it("同来源重复仍按有序数组去重：两条淬炼只保留一条", () => {
        const warnings: string[] = []
        const normalized = normalizeGearItem(
            item({
                slotType: 3,
                affixes: [
                    roll(101),
                    roll(1001, { rollLevel: 2 }),
                    roll(1001, { rollLevel: 7, source: "tempering" }),
                    roll(1001, { rollLevel: 9, source: "tempering" }),
                ],
            }),
            undefined,
            { warnings }
        )!
        expect(normalized.affixes.map(entry => [entry.affixId, entry.rollLevel])).toEqual([
            [101, 1],
            [1001, 2],
            [1001, 9],
        ])
        expect(normalized.craft?.temperingAffixIndex).toBe(2)
        expect(warnings.some(message => message.includes("词条 1001 重复，后者覆盖"))).toBe(true)
    })

    it("用户截图夹具：基础生命 + 随机防御/生命 + 专属终结技 + 淬炼生命，归一化保 5 行", () => {
        // 厚重海蚀护符（基底「海蚀护符」= 槽型 9）：基础生命 108；随机 1501 防御 / 1502 生命；淬炼 1502 生命；专属 240101
        const fixture = item({
            slotType: 9,
            kind: "unique",
            uniqueId: 210001,
            uniqueAffix: roll(240101, { source: "unique" }),
            rarityId: 10,
            equipBaseScore: 50,
            affixes: [
                roll(108, { source: "base" }),
                roll(1501, { rollLevel: 500 }),
                roll(1502, { rollLevel: 500 }),
                roll(1502, { rollLevel: 500, source: "tempering" }),
            ],
            craft: { masterworkLevel: 0, temperingAffixIndex: 3, temperingCount: 1, enchantCount: 0 },
        })
        const normalized = normalizeGearItem(fixture)!
        expect(normalized.affixes.map(entry => [entry.affixId, entry.source])).toEqual([
            [108, "base"],
            [1501, "random"],
            [1502, "random"],
            [1502, "tempering"],
        ])
        expect(normalized.affixes.filter(entry => entry.affixId === 1502)).toHaveLength(2)
        expect(normalized.craft?.temperingAffixIndex).toBe(3)
        expect(normalized.craft?.temperingCount).toBe(1)
        expect(normalized.uniqueAffix?.affixId).toBe(240101)
        expect(normalized.rarityId).toBe(10)
    })

    it("另一条淬炼行仍拒绝：craft 存在但无淬炼目标 + source=tempering 行在不同下标", () => {
        const stray = item({
            slotType: 3,
            rarityId: 5,
            affixes: [roll(101), roll(1001), roll(1006, { source: "tempering" })],
            craft: { masterworkLevel: 0, temperingCount: 0, enchantCount: 0 },
        })
        expect(getGearCraftState(stray).temperingAffixIndex).toBeUndefined()
        expect(applyTemper(stray, { affixId: 1006 })).toBe(stray)
    })

    it("未归一化双行 + 缺 source：setTemperingAncient / applyTemper 按 craft 下标定位，不翻到随机孪生", () => {
        const raw = item({
            slotType: 3,
            rarityId: 5,
            affixes: [roll(101), roll(1006), roll(1006)],
            craft: { masterworkLevel: 0, temperingAffixIndex: 2, temperingCount: 1, enchantCount: 0 },
        })
        const ancient = setTemperingAncient(raw, true)
        expect(ancient.craft?.temperingAffixIndex).toBe(2)
        expect(ancient.affixes[2]).toMatchObject({ affixId: 1006, source: "tempering", ancient: true })
        expect(ancient.affixes[1].source).toBeUndefined()

        const tempered = applyTemper(raw, { affixId: 1001 })
        expect(tempered.affixes.map(entry => entry.affixId)).toEqual([101, 1006, 1001])
        expect(tempered.craft?.temperingAffixIndex).toBe(2)
        expect(tempered.affixes[2]).toMatchObject({ affixId: 1001, source: "tempering" })
    })

    it("淬炼行排在随机孪生之前：往返保顺序与下标 0", () => {
        const normalized = normalizeGearItem(
            item({
                slotType: 3,
                affixes: [roll(1001, { source: "tempering" }), roll(101), roll(1001, { source: "random" })],
                craft: { masterworkLevel: 0, temperingAffixIndex: 0, temperingCount: 1, enchantCount: 0 },
            })
        )!
        expect(normalized.affixes.map(entry => [entry.affixId, entry.source])).toEqual([
            [1001, "tempering"],
            [101, "base"],
            [1001, "random"],
        ])
        expect(normalized.craft?.temperingAffixIndex).toBe(0)
        expect(normalizeGearItem(normalized)).toEqual(normalized)
    })

    it("越界 temperingAffixIndex + 无来源孪生：同类去重并给出可区分告警", () => {
        const warnings: string[] = []
        const normalized = normalizeGearItem(
            item({
                slotType: 3,
                affixes: [roll(1001, { rollLevel: 2 }), roll(101), roll(1001, { rollLevel: 9 })],
                craft: { masterworkLevel: 0, temperingAffixIndex: 9, temperingCount: 1, enchantCount: 0 },
            }),
            undefined,
            { warnings }
        )!
        expect(normalized.affixes.map(entry => [entry.affixId, entry.rollLevel])).toEqual([
            [1001, 9],
            [101, 1],
        ])
        expect(normalized.craft?.temperingAffixIndex).toBeUndefined()
        expect(warnings.some(message => message.includes("无来源重复") && message.includes("craft.temperingAffixIndex"))).toBe(true)
        expect(warnings.some(message => message.includes("下标 9 越界"))).toBe(true)
    })

    it("无 craft 的无来源孪生：按同类去重并提示需要 craft 才能还原", () => {
        const warnings: string[] = []
        normalizeGearItem(item({ slotType: 3, affixes: [roll(1001), roll(101), roll(1001)] }), undefined, { warnings })
        expect(warnings.some(message => message.includes("无来源重复") && message.includes("craft.temperingAffixIndex"))).toBe(true)
    })

    it("最终精锻目标落在淬炼行：归一化保行身份，applyFinalMasterwork 按下标写回", () => {
        const raw = item({
            slotType: 3,
            rarityId: 5,
            affixes: [roll(101), roll(1001), roll(1001, { source: "tempering" })],
            craft: { masterworkLevel: 10, finalMasterworkAffixIndex: 2, temperingAffixIndex: 2, temperingCount: 1, enchantCount: 0 },
        })
        const normalized = normalizeGearItem(raw)!
        expect(normalized.craft?.finalMasterworkAffixIndex).toBe(2)
        expect(normalized.affixes[2]).toMatchObject({ affixId: 1001, source: "tempering", finalMasterwork: true })
        expect(normalized.affixes[1].finalMasterwork).toBe(false)

        const applied = applyFinalMasterwork(normalized, 2)
        expect(applied.craft?.finalMasterworkAffixIndex).toBe(2)
        expect(applied.affixes[2].finalMasterwork).toBe(true)
        expect(applied.affixes[1].finalMasterwork).toBe(false)
    })

    it("重置淬炼：最终目标在淬炼行且存在同 id 随机孪生时清空，不挪到孪生行", () => {
        const tempered = applyTemper(goldItem(), { affixId: 1001 })
        const maxed = setGearMasterworkLevel(tempered, 10)
        const withFinal = applyFinalMasterwork(maxed, 2)
        expect(withFinal.craft?.finalMasterworkAffixIndex).toBe(2)

        const reset = resetTempering(withFinal)
        expect(reset.affixes.map(entry => entry.affixId)).toEqual([101, 1001])
        expect(reset.craft?.temperingAffixIndex).toBeUndefined()
        expect(reset.craft?.finalMasterworkAffixIndex).toBeUndefined()
        expect(reset.affixes[1].finalMasterwork).toBe(false)
    })
})

describe("附魔 + 淬炼同 id 裁定：允许共存并双计", () => {
    /**
     * 两条路径都得到「基础 101 + 附魔 1006 + 淬炼 1006」的同一形状：
     * 先附魔再淬炼 / 先淬炼再附魔，计算层应同值。
     */
    const attrsOf = (item: TranscendGearItemConfig) => {
        const normalized = normalizeGearItem(item)!
        const entries = flattenEquippedGear([{ slotId: 3, item: normalized }]).entries
        return { normalized, entries, result: resolveGearEffects(entries, "main") }
    }

    it("先附魔 1006 → 再淬炼 1006：两行共存，归一化 / 展平 / 计算都保留", () => {
        const enchanted = applyEnchant(goldItem(), 1, { affixId: 1006, rollLevel: 10 })
        expect(enchanted.affixes[1]).toMatchObject({ affixId: 1006, source: "enchant" })
        const tempered = applyTemper(enchanted, { affixId: 1006, rollLevel: 20 })
        expect(tempered.affixes).toHaveLength(3)

        const { normalized, entries, result } = attrsOf(tempered)
        expect(normalized.affixes.map(entry => [entry.affixId, entry.source])).toEqual([
            [101, "base"],
            [1006, "enchant"],
            [1006, "tempering"],
        ])
        expect(normalized.craft).toMatchObject({ enchantAffixIndex: 1, temperingAffixIndex: 2 })
        expect(entries.map(entry => [entry.affixId, entry.source])).toEqual([
            [101, "base"],
            [1006, "enchant"],
            [1006, "tempering"],
        ])
        expect(result.entries).toHaveLength(3)
        expect(result.buffs.map(buff => buff.key)).toEqual(["gear:3:-:101:other", "gear:3:-:1006:other", "gear:3:-:1006:tempering"])
        // 水属性攻击两行各计一次（附魔 10 档 + 淬炼 20 档）
        const valueAt = (rollLevel: number) =>
            resolveAffixValue(affixData.find(affix => affix.id === 1006)!, {
                slotId: 3,
                affixId: 1006,
                rollLevel,
                masterworkLevel: 0,
                ancient: false,
                finalMasterwork: false,
            }).final
        expect(result.attrs.水属性攻击).toBeCloseTo(valueAt(10) + valueAt(20), 12)
    })

    it("先淬炼 1006 → 再附魔 1006：不再被拒，先后顺序同值", () => {
        const tempered = applyTemper(goldItem(), { affixId: 1006, rollLevel: 20 })
        const enchanted = applyEnchant(tempered, 1, { affixId: 1006, rollLevel: 10 })
        expect(enchanted.affixes).toHaveLength(3)
        expect(enchanted.affixes[1]).toMatchObject({ affixId: 1006, source: "enchant" })

        const forward = attrsOf(
            applyTemper(applyEnchant(goldItem(), 1, { affixId: 1006, rollLevel: 10 }), { affixId: 1006, rollLevel: 20 })
        )
        const reverse = attrsOf(enchanted)
        expect(reverse.normalized.affixes.map(entry => [entry.affixId, entry.source])).toEqual(
            forward.normalized.affixes.map(entry => [entry.affixId, entry.source])
        )
        expect(reverse.result.attrs).toEqual(forward.result.attrs)
        expect(reverse.result.buffs.map(buff => buff.key)).toEqual(forward.result.buffs.map(buff => buff.key))
    })

    it("同 id 随机类行仍互斥；淬炼行本身仍不可作为附魔目标", () => {
        const randomTwin = item({
            slotType: 3,
            rarityId: 5,
            affixes: [roll(101), roll(1001), roll(1006, { source: "random" })],
        })
        expect(applyEnchant(randomTwin, 1, { affixId: 1006 })).toBe(randomTwin)
        const tempered = applyTemper(goldItem(), { affixId: 1006 })
        expect(applyEnchant(tempered, 2, { affixId: 1024 })).toBe(tempered)
    })
})

describe("附魔", () => {
    it("只替换随机 / 既有附魔词条；基础 / 淬炼 / 专属不可选；单槽只能继续替换同一条", () => {
        const tempered = applyTemper(goldItem(), { affixId: 1006 })
        const targets = getGearEnchantTargets(tempered)
        expect(targets).toEqual([1]) // 只有 1001 可替换（1006 是淬炼）
        const enchanted = applyEnchant(tempered, 1, { affixId: 1024, rollLevel: 5 })
        expect(enchanted.craft?.enchantCount).toBe(1)
        // 词条保持数组顺序（原位替换），索引不随 affixId 重排
        expect(enchanted.craft?.enchantAffixIndex).toBe(1)
        expect(enchanted.affixes[1]).toMatchObject({ affixId: 1024, rollLevel: 5, source: "enchant" })
        expect(getGearEnchantTargets(enchanted)).toEqual([1])

        // 已有附魔后只能替换同一条：替换后仍占同一位置
        expect(applyEnchant(enchanted, 1, { affixId: 1025 })).toMatchObject({ craft: { enchantAffixIndex: 1 } })
        // 基础 / 淬炼词条不可作为目标或替换结果
        expect(applyEnchant(tempered, 0, { affixId: 1025 })).toBe(tempered)
        expect(applyEnchant(enchanted, 2, { affixId: 101 })).toBe(enchanted)
        expect(applyEnchant(enchanted, 2, { affixId: 1006 })).toBe(enchanted)
        expect(applyEnchant(enchanted, 1, { affixId: 101 })).toBe(enchanted) // 基础词条不可作为替换结果
    })
})

describe("孔位 / 镶嵌 / 拆取", () => {
    it("添加镶孔逐次 +1，受槽型上限约束（槽型 3 上限 2，槽型 8 上限 0）", () => {
        const first = applyCreateSocket(goldItem())
        expect(first.socketCount).toBe(1)
        const second = applyCreateSocket(first)
        expect(second.socketCount).toBe(2)
        expect(applyCreateSocket(second)).toBe(second)
        const amulet = item({ slotType: 8, rarityId: 5 })
        expect(applyCreateSocket(amulet)).toBe(amulet)
        expect(getCraftAvailability(amulet, TRANSCEND_CRAFT_CREATE_SOCKET)).toEqual({
            craftId: TRANSCEND_CRAFT_CREATE_SOCKET,
            available: false,
            reason: "socket-none",
        })
        expect(getCraftAvailability(second, TRANSCEND_CRAFT_CREATE_SOCKET).reason).toBe("socket-max")
    })

    it("暗金添加与普通一致：部位 3 可到 2 孔，第三孔按部位上限阻断", () => {
        const unique = item({ slotType: 3, rarityId: 10, kind: "unique", uniqueId: 170001, affixes: [roll(101)] })
        expect(getCraftAvailability(unique, TRANSCEND_CRAFT_CREATE_SOCKET)).toEqual({
            craftId: TRANSCEND_CRAFT_CREATE_SOCKET,
            available: true,
        })
        const first = applyCreateSocket(unique)
        expect(first.socketCount).toBe(1)
        expect(getCraftAvailability(first, TRANSCEND_CRAFT_CREATE_SOCKET).available).toBe(true)
        const second = applyCreateSocket(first)
        expect(second.socketCount).toBe(2)
        expect(getCraftAvailability(second, TRANSCEND_CRAFT_CREATE_SOCKET)).toEqual({
            craftId: TRANSCEND_CRAFT_CREATE_SOCKET,
            available: false,
            reason: "socket-max",
        })
        expect(applyCreateSocket(second)).toBe(second)
        // 已生成 / 归一化得到的 2 孔同样按部位上限阻断，不按暗金特判
        const generated = { ...unique, socketCount: 2 }
        expect(getCraftAvailability(generated, TRANSCEND_CRAFT_CREATE_SOCKET).reason).toBe("socket-max")
        expect(applyCreateSocket(generated)).toBe(generated)
    })

    it("暗金饰品上限 1：0→1 后阻断；无孔部位仍 socket-none", () => {
        const earring = item({ slotType: 5, rarityId: 10, kind: "unique", uniqueId: 170002, affixes: [roll(101)] })
        const once = applyCreateSocket(earring)
        expect(once.socketCount).toBe(1)
        expect(getCraftAvailability(once, TRANSCEND_CRAFT_CREATE_SOCKET).reason).toBe("socket-max")
        expect(applyCreateSocket(once)).toBe(once)
        const charm = item({ slotType: 8, rarityId: 10, kind: "unique", uniqueId: 170003, affixes: [roll(101)] })
        expect(applyCreateSocket(charm)).toBe(charm)
        expect(getCraftAvailability(charm, TRANSCEND_CRAFT_CREATE_SOCKET).reason).toBe("socket-none")
    })

    it("饰品槽位上限 1：普通也按上限阻断添加", () => {
        const earring = item({ slotType: 5, rarityId: 5, affixes: [roll(101)] })
        const once = applyCreateSocket(earring)
        expect(once.socketCount).toBe(1)
        expect(getCraftAvailability(once, TRANSCEND_CRAFT_CREATE_SOCKET).reason).toBe("socket-max")
        expect(applyCreateSocket(once)).toBe(once)
    })

    it("镶嵌只进空孔、同宝石可占多孔、已占用孔位拒绝", () => {
        const opened = applyCreateSocket(applyCreateSocket(goldItem()))
        const one = applyInlay(opened, 7001101)
        expect(one.sockets).toEqual([{ socketIndex: 0, gemId: 7001101 }])
        const two = applyInlay(one, 7001101)
        expect(two.sockets).toEqual([
            { socketIndex: 0, gemId: 7001101 },
            { socketIndex: 1, gemId: 7001101 },
        ])
        expect(applyInlay(two, 7001102)).toBe(two)
        expect(applyInlay(opened, 7001101, 2)).toBe(opened)
        expect(getCraftAvailability(two, TRANSCEND_CRAFT_EQUIP_INLAY).reason).toBe("no-empty-socket")
        expect(getCraftAvailability(opened, TRANSCEND_CRAFT_EQUIP_INLAY).available).toBe(true)
        expect(getCraftAvailability(one, TRANSCEND_CRAFT_UNEQUIP_INLAY).available).toBe(true)
        expect(getCraftAvailability(opened, TRANSCEND_CRAFT_UNEQUIP_INLAY).reason).toBe("no-socketed-gem")
    })

    it("拆取一次清空全部宝石，已开孔数不变", () => {
        const sockets = applyInlay(applyInlay(applyCreateSocket(applyCreateSocket(goldItem())), 7001101), 7001102, 1)
        const detached = applyDetachAll(sockets)
        expect(detached.sockets).toBeUndefined()
        expect(detached.socketCount).toBe(2)
        expect(applyDetachAll(detached)).toBe(detached)
    })

    it("逐孔替换原子性：成功替换保留其余宝石；任一宝石未知 / 不适用整体拒绝", () => {
        const opened = applyCreateSocket(applyCreateSocket(goldItem()))
        const two = applyInlay(applyInlay(opened, 7001101), 7001102, 1)
        expect(two.sockets).toHaveLength(2)
        const replaced = replaceSocketGem(two, 0, 7001103)
        expect(replaced).not.toBe(two)
        expect(replaced.socketCount).toBe(2)
        expect(replaced.sockets).toEqual([
            { socketIndex: 0, gemId: 7001103 },
            { socketIndex: 1, gemId: 7001102 },
        ])
        // 未知目标宝石：不拆取、不丢其余宝石
        expect(replaceSocketGem(two, 0, 999999)).toBe(two)
        // 其余孔含未知宝石：整体拒绝，未知宝石原样保留
        const unknownOther = {
            ...two,
            sockets: [
                { socketIndex: 0, gemId: 7001101 },
                { socketIndex: 1, gemId: 999999 },
            ],
        }
        expect(replaceSocketGem(unknownOther, 0, 7001103)).toBe(unknownOther)
        // 其余宝石在当前数据源下不可解析（不适用）：同样整体拒绝
        const datasets = { inlays: inlayData.filter(inlay => inlay.id !== 7001102) }
        expect(replaceSocketGem(two, 0, 7001103, datasets)).toBe(two)
        // 未开孔 / 无孔槽型拒绝
        const one = applyInlay(applyCreateSocket(goldItem()), 7001101)
        expect(replaceSocketGem(one, 1, 7001103)).toBe(one)
        const amulet = item({ slotType: 8, rarityId: 5, socketCount: 1, sockets: [{ socketIndex: 0, gemId: 7001101 }] })
        expect(replaceSocketGem(amulet, 0, 7001103)).toBe(amulet)
        // 空孔替换等同于直接镶嵌
        const empty = { ...two, sockets: [{ socketIndex: 1, gemId: 7001102 }] }
        expect(replaceSocketGem(empty, 0, 7001103).sockets).toEqual([
            { socketIndex: 0, gemId: 7001103 },
            { socketIndex: 1, gemId: 7001102 },
        ])
    })

    it("空孔直镶不受其他孔未知宝石阻断，且完整保留其余宝石", () => {
        const opened = applyCreateSocket(applyCreateSocket(goldItem()))
        // 目标孔 0 为空、孔 1 是未知宝石：空孔不需要拆取 / 重镶其余宝石，直接镶嵌即可
        const unknownOther = { ...opened, sockets: [{ socketIndex: 1, gemId: 999999 }] }
        const next = replaceSocketGem(unknownOther, 0, 7001103)
        expect(next).not.toBe(unknownOther)
        expect(next.sockets).toEqual([
            { socketIndex: 0, gemId: 7001103 },
            { socketIndex: 1, gemId: 999999 },
        ])
        // 已占用目标孔 + 其他孔未知宝石仍整体拒绝（既有保护不回退）
        const occupied = {
            ...opened,
            sockets: [
                { socketIndex: 0, gemId: 7001101 },
                { socketIndex: 1, gemId: 999999 },
            ],
        }
        expect(replaceSocketGem(occupied, 0, 7001102)).toBe(occupied)
    })
})

describe("归一化 craft 状态", () => {
    it("旧物品（无 craft）按 per-affix 值推导：精锻取最大，最终目标取第一条可生效词条", () => {
        const warnings: string[] = []
        const normalized = normalizeGearItem(
            item({
                slotType: 3,
                affixes: [
                    roll(101, { masterworkLevel: 10 }),
                    roll(1001, { masterworkLevel: 2, finalMasterwork: true }),
                    roll(1002, { masterworkLevel: 4, finalMasterwork: true }),
                ],
            }),
            undefined,
            { warnings }
        )!
        expect(normalized.craft).toEqual({
            masterworkLevel: 10,
            finalMasterworkAffixIndex: normalized.affixes.findIndex(entry => entry.affixId === 1001),
            temperingCount: 0,
            enchantCount: 0,
        })
        expect(normalized.affixes.every(entry => entry.masterworkLevel === 10)).toBe(true)
        expect(normalized.affixes.filter(entry => entry.finalMasterwork)).toHaveLength(1)
        expect(warnings.some(message => message.includes("最终精锻目标有 2 条"))).toBe(true)
    })

    it("craft 索引越界 / 未满级 / 目标无公式时钳制并报告", () => {
        const warnings: string[] = []
        const outOfRange = normalizeGearItem(
            item({
                slotType: 3,
                affixes: [roll(101), roll(1001)],
                craft: { masterworkLevel: 10, finalMasterworkAffixIndex: 9, temperingCount: 0, enchantCount: 0 },
            }),
            undefined,
            { warnings }
        )!
        expect(outOfRange.craft?.finalMasterworkAffixIndex).toBeUndefined()
        expect(warnings.some(message => message.includes("越界"))).toBe(true)

        const notMax = normalizeGearItem(
            item({
                slotType: 3,
                affixes: [roll(101), roll(1001)],
                craft: { masterworkLevel: 3, finalMasterworkAffixIndex: 1, temperingCount: 0, enchantCount: 0 },
            })
        )!
        expect(notMax.craft?.finalMasterworkAffixIndex).toBeUndefined()

        const baseTarget = normalizeGearItem(
            item({
                slotType: 3,
                affixes: [roll(101), roll(1001)],
                craft: { masterworkLevel: 10, finalMasterworkAffixIndex: 0, temperingCount: 0, enchantCount: 0 },
            })
        )!
        expect(baseTarget.craft?.finalMasterworkAffixIndex).toBeUndefined()

        const enchantOnTempering = normalizeGearItem(
            item({
                slotType: 3,
                affixes: [roll(101), roll(1001)],
                craft: { masterworkLevel: 0, temperingAffixIndex: 1, enchantAffixIndex: 1, temperingCount: 2, enchantCount: 3 },
            })
        )!
        expect(enchantOnTempering.craft?.temperingAffixIndex).toBe(1)
        expect(enchantOnTempering.craft?.enchantAffixIndex).toBeUndefined()
        expect(enchantOnTempering.affixes[1].source).toBe("tempering")
        expect(enchantOnTempering.craft?.temperingCount).toBe(2)
        // 目标被清除时次数同步清零（count>0 必有目标）
        expect(enchantOnTempering.craft?.enchantCount).toBe(0)
    })

    it("craft 是权威：per-affix 精锻 / 最终 / 来源按装备级状态重写", () => {
        const normalized = normalizeGearItem(
            item({
                slotType: 3,
                affixes: [
                    roll(101, { masterworkLevel: 0, finalMasterwork: true }),
                    roll(1001, { masterworkLevel: 3, source: "tempering" }),
                    roll(1002, { masterworkLevel: 7, finalMasterwork: true }),
                ],
                craft: { masterworkLevel: 10, finalMasterworkAffixIndex: 2, temperingAffixIndex: 1, temperingCount: 1, enchantCount: 0 },
            })
        )!
        expect(normalized.affixes.map(entry => entry.masterworkLevel)).toEqual([10, 10, 10])
        expect(normalized.affixes.map(entry => entry.finalMasterwork)).toEqual([false, false, true])
        expect(normalized.affixes.map(entry => entry.source)).toEqual(["base", "tempering", "random"])
        expect(normalized.craft?.temperingCount).toBe(1)
    })
})

describe("apply 入口门槛与不可变性", () => {
    it("品质不允许 / 跨赛季时所有 apply 原样返回（no-op）", () => {
        const white = item({ slotType: 1, rarityId: 1, affixes: [roll(101), roll(1001)] })
        expect(applyMasterwork(white)).toBe(white)
        expect(applyFinalMasterwork(white, 1)).toBe(white)
        expect(applyTemper(white, { affixId: 1001 })).toBe(white)
        expect(applyEnchant(white, 1, { affixId: 1024 })).toBe(white)
        expect(applyDetachAll(white)).toBe(white)

        const crossSeason = goldItem({
            seasonId: 99,
            socketCount: 2,
            sockets: [{ socketIndex: 0, gemId: 7001101 }],
        })
        expect(applyMasterwork(crossSeason)).toBe(crossSeason)
        expect(applyFinalMasterwork(crossSeason, 1)).toBe(crossSeason)
        expect(applyTemper(crossSeason, { affixId: 1006 })).toBe(crossSeason)
        expect(applyEnchant(crossSeason, 1, { affixId: 1024 })).toBe(crossSeason)
        expect(applyCreateSocket(crossSeason)).toBe(crossSeason)
        expect(applyInlay(crossSeason, 7001101)).toBe(crossSeason)
        expect(applyDetachAll(crossSeason)).toBe(crossSeason)
    })

    it("apply 不修改入参（原物品无 craft 时仍无 craft，词条 / 数组保持原值）", () => {
        const original = goldItem({
            socketCount: 2,
            sockets: [{ socketIndex: 0, gemId: 7001101 }],
        })
        const snapshot = JSON.parse(JSON.stringify(original))
        setGearMasterworkLevel(original, 3)
        applyMasterwork(original, 3)
        applyFinalMasterwork(original, 1)
        applyTemper(original, { affixId: 1006 })
        applyEnchant(original, 1, { affixId: 1024 })
        applyCreateSocket(original)
        applyInlay(original, 7001101)
        applyDetachAll(original)
        expect(JSON.parse(JSON.stringify(original))).toEqual(snapshot)
        expect(original.craft).toBeUndefined()
        expect(original.affixes.every(entry => entry.masterworkLevel === 0)).toBe(true)
    })
})

describe("附魔候选与最终精锻目标", () => {
    it("新词条只允许槽位随机池内 Plan 2：宝石 / 专属 / Plan 1 基础 / 池外均 no-op", () => {
        const tempered = applyTemper(goldItem(), { affixId: 1006 })
        expect(applyEnchant(tempered, 1, { affixId: 3101 })).toBe(tempered) // 宝石词缀（Plan 4）
        expect(applyEnchant(tempered, 1, { affixId: 2001 })).toBe(tempered) // 专属（Plan 4）
        expect(applyEnchant(tempered, 1, { affixId: 101 })).toBe(tempered) // 基础（Plan 1）
        expect(applyEnchant(tempered, 1, { affixId: 1002 })).toBe(tempered) // Plan 2 但池 202 不在槽位 3
        expect(applyEnchant(tempered, 1, { affixId: 1024 }).craft?.enchantAffixIndex).toBe(1)
    })

    it("替换最终精锻目标：新词条可承载则跟随，不可承载则清空", () => {
        const max = setGearMasterworkLevel(goldItem({ affixes: [roll(101), roll(1001)] }), 10)
        const tempered = applyTemper(max, { affixId: 1006 })
        const withFinal = applyFinalMasterwork(tempered, 1) // 1001
        expect(withFinal.craft?.finalMasterworkAffixIndex).toBe(1)

        const followed = applyEnchant(withFinal, 1, { affixId: 1024 })
        expect(followed.affixes[followed.craft!.finalMasterworkAffixIndex!].affixId).toBe(1024)
        expect(followed.affixes.filter(entry => entry.finalMasterwork)).toHaveLength(1)

        const noMaxDatasets = { affixes: affixData.map(affix => (affix.id === 1024 ? { ...affix, maxAffixUpdateFunc: undefined } : affix)) }
        const cleared = applyEnchant(withFinal, 1, { affixId: 1024 }, noMaxDatasets)
        expect(cleared.craft?.finalMasterworkAffixIndex).toBeUndefined()
        expect(cleared.affixes.some(entry => entry.finalMasterwork)).toBe(false)
    })

    it("淬炼替换最终目标同样复检：可承载跟随、不可承载清空", () => {
        const max = setGearMasterworkLevel(goldItem({ affixes: [roll(101)] }), 10)
        const tempered = applyTemper(max, { affixId: 1006 })
        const withFinal = applyFinalMasterwork(tempered, 1)
        expect(withFinal.craft?.finalMasterworkAffixIndex).toBe(1)

        const followed = applyTemper(withFinal, { affixId: 1024 })
        expect(followed.affixes[followed.craft!.finalMasterworkAffixIndex!].affixId).toBe(1024)

        const noMaxDatasets = { affixes: affixData.map(affix => (affix.id === 1024 ? { ...affix, maxAffixUpdateFunc: undefined } : affix)) }
        const cleared = applyTemper(withFinal, { affixId: 1024 }, noMaxDatasets)
        expect(cleared.craft?.finalMasterworkAffixIndex).toBeUndefined()
        expect(cleared.affixes.some(entry => entry.finalMasterwork)).toBe(false)
    })

    it("getGearCraftState 复检：未满级 / 目标无 MaxAffixUpdateFunc 时丢弃最终目标", () => {
        const notMax = item({
            slotType: 3,
            affixes: [roll(101), roll(1001)],
            craft: { masterworkLevel: 9, finalMasterworkAffixIndex: 1, temperingCount: 0, enchantCount: 0 },
        })
        expect(getGearCraftState(notMax).finalMasterworkAffixIndex).toBeUndefined()

        const baseTarget = item({
            slotType: 3,
            affixes: [roll(101), roll(1001)],
            craft: { masterworkLevel: 10, finalMasterworkAffixIndex: 0, temperingCount: 0, enchantCount: 0 },
        })
        expect(getGearCraftState(baseTarget).finalMasterworkAffixIndex).toBeUndefined()

        const missingTarget = item({
            slotType: 3,
            affixes: [roll(101), roll(1001)],
            craft: { masterworkLevel: 10, finalMasterworkAffixIndex: 9, temperingCount: 0, enchantCount: 0 },
        })
        expect(getGearCraftState(missingTarget).finalMasterworkAffixIndex).toBeUndefined()
        expect(getGearCraftState(null)).toEqual({ masterworkLevel: 0, temperingCount: 0, enchantCount: 0 })
    })
})

describe("镶嵌校验与 null 索引", () => {
    it("未知宝石 / 宝石对该槽型无词缀 / 孔位越界或已占用均 no-op", () => {
        const opened = applyCreateSocket(applyCreateSocket(goldItem()))
        expect(applyInlay(opened, 99999999)).toBe(opened)
        // 注入只含 3101（1/3 号槽）的镶嵌表：槽型 3 的宝石不再解析出词缀
        const slotOnlyDatasets = { inlays: [{ id: 7001101, affixIdsBySlot: { "3102": [2, 4] } }] }
        expect(applyInlay(opened, 7001101, undefined, slotOnlyDatasets)).toBe(opened)
        expect(applyInlay(opened, 7001101, 5)).toBe(opened)
        expect(applyInlay(opened, 7001101, -1)).toBe(opened)
        const one = applyInlay(opened, 7001101, 0)
        expect(applyInlay(one, 7001101, 0)).toBe(one)
    })

    it("craft 目标索引为 null 时按缺省处理（不报错、不产生目标）", () => {
        const raw = {
            masterworkLevel: 10,
            finalMasterworkAffixIndex: null,
            temperingAffixIndex: null,
            enchantAffixIndex: null,
            temperingCount: 2,
            enchantCount: 3,
        }
        const normalized = normalizeGearItem(item({ slotType: 3, affixes: [roll(101), roll(1001)], craft: raw as never }))!
        expect(normalized.craft).toEqual({ masterworkLevel: 10, temperingCount: 0, enchantCount: 0 })
        expect(normalized.affixes.every(entry => !entry.finalMasterwork)).toBe(true)
        expect(getGearCraftState(item({ slotType: 3, affixes: [roll(101)], craft: raw as never }))).toEqual({
            masterworkLevel: 10,
            temperingCount: 0,
            enchantCount: 0,
        })
    })
})

describe("归一化告警与提示词条保留", () => {
    it("重复词条去重 / 随机词条超上限均写 warnings，不静默丢弃", () => {
        const warnings: string[] = []
        const normalized = normalizeGearItem(
            item({
                slotType: 3,
                affixes: [roll(101), roll(1001), roll(1001, { rollLevel: 2 }), roll(1002), roll(1003), roll(1004), roll(1005)],
            }),
            undefined,
            { warnings }
        )!
        expect(normalized.affixes).toHaveLength(5)
        expect(normalized.affixes.some(entry => entry.affixId === 1005)).toBe(false)
        expect(warnings.some(message => message.includes("词条 1001 重复"))).toBe(true)
        expect(warnings.some(message => message.includes("超出随机词条上限"))).toBe(true)
    })

    it("craft 提示的淬炼词条即使超出裁剪顺序也被强制保留", () => {
        const warnings: string[] = []
        const normalized = normalizeGearItem(
            item({
                slotType: 3,
                affixes: [
                    roll(101),
                    roll(1001),
                    roll(1002),
                    roll(1003),
                    roll(1004),
                    roll(1024, { source: "tempering" }),
                    roll(1025, { source: "tempering" }),
                ],
                craft: { masterworkLevel: 0, temperingAffixIndex: 6, temperingCount: 2, enchantCount: 0 },
            }),
            undefined,
            { warnings }
        )!
        expect(normalized.affixes).toHaveLength(6)
        expect(normalized.affixes.some(entry => entry.affixId === 1024)).toBe(false)
        expect(normalized.affixes.filter(entry => entry.source === "tempering").map(entry => entry.affixId)).toEqual([1025])
        expect(normalized.affixes[normalized.craft!.temperingAffixIndex!].affixId).toBe(1025)
        expect(warnings.some(message => message.includes("只保留 1025"))).toBe(true)
    })

    it("多条附魔来源只告警一次；craft 索引越界 / 目标被裁剪写明确告警", () => {
        const enchantWarnings: string[] = []
        const duplicated = normalizeGearItem(
            item({
                slotType: 3,
                affixes: [roll(101), roll(1001, { source: "enchant" }), roll(1002, { source: "enchant" })],
            }),
            undefined,
            { warnings: enchantWarnings }
        )!
        expect(enchantWarnings.filter(message => message.includes("附魔词条有"))).toHaveLength(1)
        expect(duplicated.craft?.enchantAffixIndex).toBe(duplicated.affixes.findIndex(entry => entry.affixId === 1001))

        const indexWarnings: string[] = []
        const outOfRange = normalizeGearItem(
            item({
                slotType: 3,
                affixes: [roll(101), roll(1001)],
                craft: { masterworkLevel: 0, temperingAffixIndex: 9, enchantAffixIndex: -1, temperingCount: 0, enchantCount: 0 },
            }),
            undefined,
            { warnings: indexWarnings }
        )!
        expect(outOfRange.craft?.temperingAffixIndex).toBeUndefined()
        expect(outOfRange.craft?.enchantAffixIndex).toBeUndefined()
        expect(indexWarnings.some(message => message.includes("craft.temperingAffixIndex 下标 9 越界"))).toBe(true)
        expect(indexWarnings.some(message => message.includes("craft.enchantAffixIndex 下标 -1 越界"))).toBe(true)

        const trimmedWarnings: string[] = []
        const trimmed = normalizeGearItem(
            item({
                slotType: 3,
                affixes: [roll(101), roll(1001), roll(1002), roll(1003), roll(1004), roll(1005)],
                craft: { masterworkLevel: 10, finalMasterworkAffixIndex: 5, temperingCount: 0, enchantCount: 0 },
            }),
            undefined,
            { warnings: trimmedWarnings }
        )!
        expect(trimmed.craft?.finalMasterworkAffixIndex).toBeUndefined()
        expect(trimmedWarnings.some(message => message.includes("craft.finalMasterworkAffixIndex 指向的词条 1005 已被裁剪"))).toBe(true)
    })

    it("旧物品非法 final 在 setGearMasterworkLevel 提交时也被清空", () => {
        const legacy = item({
            slotType: 3,
            rarityId: 5,
            affixes: [roll(101, { masterworkLevel: 10, finalMasterwork: true }), roll(1001, { masterworkLevel: 10 })],
        })
        const committed = setGearMasterworkLevel(legacy, 10)
        expect(committed.craft?.finalMasterworkAffixIndex).toBeUndefined()
        expect(committed.affixes.every(entry => entry.finalMasterwork === false)).toBe(true)
    })
})

describe("复检：目标解析一致性与边界", () => {
    it("setGearMasterworkLevel / 精锻对蓝品质（rarity 2/3）与跨赛季 no-op", () => {
        for (const rarityId of [2, 3]) {
            const blue = item({ slotType: 3, rarityId, affixes: [roll(101), roll(1001)] })
            expect(setGearMasterworkLevel(blue, 5)).toBe(blue)
            expect(applyMasterwork(blue)).toBe(blue)
            expect(applyTemper(blue, { affixId: 1006 })).toBe(blue)
            expect(applyEnchant(blue, 1, { affixId: 1024 })).toBe(blue)
        }
        const crossSeason = goldItem({ seasonId: 99 })
        expect(setGearMasterworkLevel(crossSeason, 5)).toBe(crossSeason)
    })

    it("旧物品多条 final：跳过不可承载的前一条，与归一化同样取首条可承载", () => {
        const legacy = item({
            slotType: 3,
            affixes: [
                roll(101, { masterworkLevel: 10, finalMasterwork: true }),
                roll(1001, { masterworkLevel: 10, finalMasterwork: true }),
            ],
        })
        const normalized = normalizeGearItem(legacy)!
        const expected = normalized.affixes.findIndex(entry => entry.affixId === 1001)
        expect(normalized.craft?.finalMasterworkAffixIndex).toBe(expected)
        expect(getGearCraftState(legacy).finalMasterworkAffixIndex).toBe(expected)
    })

    it("未知最终目标：默认判死，preserveUnknown 下与归一化一致保留", () => {
        const unknown = item({
            slotType: 3,
            affixes: [roll(101, { masterworkLevel: 10 }), roll(999999, { masterworkLevel: 10, finalMasterwork: true })],
        })
        expect(normalizeGearItem(unknown)!.craft?.finalMasterworkAffixIndex).toBeUndefined()
        expect(getGearCraftState(unknown).finalMasterworkAffixIndex).toBeUndefined()

        const normalized = normalizeGearItem(unknown, undefined, { preserveUnknown: true })!
        const expected = normalized.affixes.findIndex(entry => entry.affixId === 999999)
        expect(normalized.craft?.finalMasterworkAffixIndex).toBe(expected)
        expect(getGearCraftState(unknown, undefined, { preserveUnknown: true }).finalMasterworkAffixIndex).toBe(expected)
    })

    it("craft 目标指向基础 / 专属时清除目标并归零次数（归一化与规则层同口径）", () => {
        const onBase = item({
            slotType: 3,
            affixes: [roll(101), roll(1001)],
            craft: { masterworkLevel: 0, temperingAffixIndex: 0, enchantAffixIndex: 0, temperingCount: 2, enchantCount: 3 },
        })
        expect(normalizeGearItem(onBase)!.craft).toEqual({ masterworkLevel: 0, temperingCount: 0, enchantCount: 0 })
        expect(getGearCraftState(onBase)).toEqual({ masterworkLevel: 0, temperingCount: 0, enchantCount: 0 })

        const onUnique = item({
            kind: "unique",
            slotType: 3,
            uniqueAffix: roll(2001, { source: "unique" }),
            affixes: [roll(101), roll(2001)],
            craft: { masterworkLevel: 0, temperingAffixIndex: 1, temperingCount: 2, enchantCount: 0 },
        })
        expect(getGearCraftState(onUnique)).toEqual({ masterworkLevel: 0, temperingCount: 0, enchantCount: 0 })
    })

    it("附魔与淬炼同索引：保留淬炼、清空附魔并归零附魔次数", () => {
        const same = item({
            slotType: 3,
            affixes: [roll(101), roll(1006)],
            craft: { masterworkLevel: 0, temperingAffixIndex: 1, enchantAffixIndex: 1, temperingCount: 2, enchantCount: 3 },
        })
        expect(getGearCraftState(same)).toEqual({
            masterworkLevel: 0,
            temperingCount: 2,
            enchantCount: 0,
            temperingAffixIndex: 1,
        })
        expect(normalizeGearItem(same)!.craft).toEqual({
            masterworkLevel: 0,
            temperingCount: 2,
            enchantCount: 0,
            temperingAffixIndex: 1,
        })
    })

    it("applyEnchant 非数字 / NaN 目标下标 no-op", () => {
        const tempered = applyTemper(goldItem(), { affixId: 1006 })
        expect(applyEnchant(tempered, Number.NaN, { affixId: 1024 })).toBe(tempered)
        expect(applyEnchant(tempered, undefined as never, { affixId: 1024 })).toBe(tempered)
    })

    it("已有附魔槽可合法再次附魔（同槽替换、次数累计）", () => {
        const tempered = applyTemper(goldItem(), { affixId: 1006 })
        const enchanted = applyEnchant(tempered, 1, { affixId: 1024 })
        const again = applyEnchant(enchanted, enchanted.craft!.enchantAffixIndex!, { affixId: 1025 })
        expect(again.craft?.enchantCount).toBe(2)
        expect(again.craft?.enchantAffixIndex).toBe(again.affixes.findIndex(entry => entry.affixId === 1025))
    })

    it("applyTemper 命中基础词条专用拒绝分支（注入基础词条带池的数据）", () => {
        const datasets = { affixes: affixData.map(affix => (affix.id === 101 ? { ...affix, pool: 201 } : affix)) }
        const noBase = item({ slotType: 3, rarityId: 5, affixes: [roll(1001)] })
        expect(applyTemper(noBase, { affixId: 101 }, datasets)).toBe(noBase)
    })

    it("flattenEquippedGear：craft.finalMasterworkAffixIndex 为 null 时不再命中第 0 条", () => {
        const nullFinal = item({
            slotType: 3,
            affixes: [roll(101, { masterworkLevel: 10, finalMasterwork: true }), roll(1001, { masterworkLevel: 10 })],
            craft: { masterworkLevel: 10, finalMasterworkAffixIndex: null as never, temperingCount: 0, enchantCount: 0 },
        })
        const entries = flattenEquippedGear([{ slotId: 3, item: nullFinal }]).entries
        expect(entries).toHaveLength(2)
        expect(entries.every(entry => entry.finalMasterwork === false)).toBe(true)
    })
})

describe("未归一化旧物品与归一化同口径", () => {
    it("乱序多条 final：状态与归一化选首条可承载词条", () => {
        const legacy = item({
            slotType: 3,
            affixes: [
                roll(1002, { masterworkLevel: 10, finalMasterwork: true }),
                roll(1001, { masterworkLevel: 10, finalMasterwork: true }),
            ],
        })
        const normalized = normalizeGearItem(legacy)!
        const normalizedFinalId = normalized.affixes[normalized.craft!.finalMasterworkAffixIndex!].affixId
        const state = getGearCraftState(legacy)
        expect(normalizedFinalId).toBe(1002)
        expect(state.masterworkLevel).toBe(normalized.craft!.masterworkLevel)
        expect(legacy.affixes[state.finalMasterworkAffixIndex!].affixId).toBe(normalizedFinalId)
    })

    it("多条淬炼 / 附魔来源：状态与归一化选输入顺序第一条", () => {
        const legacy = item({
            slotType: 3,
            affixes: [
                roll(1002, { source: "tempering" }),
                roll(1001, { source: "tempering" }),
                roll(1005, { source: "enchant" }),
                roll(1004, { source: "enchant" }),
            ],
        })
        const normalized = normalizeGearItem(legacy)!
        const state = getGearCraftState(legacy)
        expect(legacy.affixes[state.temperingAffixIndex!].affixId).toBe(normalized.affixes[normalized.craft!.temperingAffixIndex!].affixId)
        expect(legacy.affixes[state.enchantAffixIndex!].affixId).toBe(normalized.affixes[normalized.craft!.enchantAffixIndex!].affixId)
        expect(legacy.affixes[state.temperingAffixIndex!].affixId).toBe(1002)
        expect(legacy.affixes[state.enchantAffixIndex!].affixId).toBe(1005)
        expect(state.masterworkLevel).toBe(normalized.craft!.masterworkLevel)
    })

    it("超上限旧物品：被裁剪词条上的 final / 精锻不再被状态保留", () => {
        const legacy = item({
            slotType: 3,
            affixes: [
                roll(101),
                roll(1001),
                roll(1002),
                roll(1003),
                roll(1004),
                roll(1005, { masterworkLevel: 10, finalMasterwork: true }),
            ],
        })
        const normalized = normalizeGearItem(legacy)!
        const state = getGearCraftState(legacy)
        expect(normalized.affixes.some(entry => entry.affixId === 1005)).toBe(false)
        expect(normalized.craft!.masterworkLevel).toBe(0)
        expect(normalized.craft!.finalMasterworkAffixIndex).toBeUndefined()
        expect(state.masterworkLevel).toBe(0)
        expect(state.finalMasterworkAffixIndex).toBeUndefined()
    })

    it("craft: [] 按无 craft 处理：状态 / 展平与归一化一致", () => {
        const legacy = item({
            slotType: 3,
            affixes: [roll(101, { masterworkLevel: 10 }), roll(1001, { masterworkLevel: 10, finalMasterwork: true })],
        })
        const arrayCraft = { ...legacy, craft: [] as never }
        const normalized = normalizeGearItem(legacy)!
        expect(getGearCraftState(arrayCraft)).toEqual(normalized.craft)
        const entries = flattenEquippedGear([{ slotId: 3, item: arrayCraft }]).entries
        expect(entries.map(entry => entry.masterworkLevel)).toEqual([10, 10])
        expect(entries.filter(entry => entry.finalMasterwork).map(entry => entry.affixId)).toEqual([1001])
    })

    it("非有限次数（字符串 Infinity / NaN）归零，apply 不返回 Infinity", () => {
        const crafted = item({
            slotType: 3,
            rarityId: 5,
            affixes: [roll(101), roll(1001), roll(1006)],
            craft: {
                masterworkLevel: 0,
                temperingAffixIndex: 2,
                enchantAffixIndex: 1,
                temperingCount: "Infinity" as never,
                enchantCount: Number.NaN,
            },
        })
        const normalized = normalizeGearItem(crafted)!
        const state = getGearCraftState(crafted)
        expect(state.temperingCount).toBe(0)
        expect(state.enchantCount).toBe(0)
        expect(state.temperingAffixIndex).toBe(2)
        expect(state.enchantAffixIndex).toBe(1)
        expect(state).toEqual(normalized.craft)

        const tempered = applyTemper(crafted, { affixId: 1024 })
        expect(tempered.craft?.temperingCount).toBe(1)
        expect(Number.isFinite(tempered.craft?.temperingCount)).toBe(true)
        expect(tempered.craft?.enchantCount).toBe(0)
    })

    it("库存未知最终目标：apply 默认清空，preserveUnknown 透传后保留", () => {
        const inventory = normalizeGearItem(
            item({
                slotType: 3,
                rarityId: 5,
                affixes: [
                    roll(101, { masterworkLevel: 10 }),
                    roll(1001, { masterworkLevel: 10 }),
                    roll(999999, { masterworkLevel: 10, finalMasterwork: true }),
                ],
            }),
            undefined,
            { preserveUnknown: true }
        )!
        expect(inventory.craft?.finalMasterworkAffixIndex).toBe(2)

        const dropped = applyTemper(inventory, { affixId: 1006 })
        expect(dropped.craft?.finalMasterworkAffixIndex).toBeUndefined()
        expect(dropped.affixes.some(entry => entry.finalMasterwork)).toBe(false)

        const kept = applyTemper(inventory, { affixId: 1006 }, undefined, { preserveUnknown: true })
        expect(kept.affixes[kept.craft!.finalMasterworkAffixIndex!].affixId).toBe(999999)
        expect(kept.affixes.filter(entry => entry.finalMasterwork)).toHaveLength(1)
        expect(getGearCraftState(kept, undefined, { preserveUnknown: true }).finalMasterworkAffixIndex).toBe(
            kept.craft!.finalMasterworkAffixIndex
        )

        const enchantedDropped = applyEnchant(inventory, 1, { affixId: 1024 })
        expect(enchantedDropped.craft?.finalMasterworkAffixIndex).toBeUndefined()
        const enchantedKept = applyEnchant(inventory, 1, { affixId: 1024 }, undefined, { preserveUnknown: true })
        expect(enchantedKept.affixes[enchantedKept.craft!.finalMasterworkAffixIndex!].affixId).toBe(999999)
    })

    it("库存未知最终目标：applyFinalMasterwork(null) 默认真正清除，preserveUnknown 同样清除", () => {
        const inventory = normalizeGearItem(
            item({
                slotType: 3,
                rarityId: 5,
                affixes: [
                    roll(101, { masterworkLevel: 10 }),
                    roll(1001, { masterworkLevel: 10 }),
                    roll(999999, { masterworkLevel: 10, finalMasterwork: true }),
                ],
            }),
            undefined,
            { preserveUnknown: true }
        )!
        expect(inventory.craft?.finalMasterworkAffixIndex).toBe(2)

        const cleared = applyFinalMasterwork(inventory, null)
        expect(cleared).not.toBe(inventory)
        expect(cleared.craft?.finalMasterworkAffixIndex).toBeUndefined()
        expect(cleared.affixes.some(entry => entry.finalMasterwork)).toBe(false)
        expect(getGearCraftState(cleared, undefined, { preserveUnknown: true }).finalMasterworkAffixIndex).toBeUndefined()

        const clearedKeep = applyFinalMasterwork(inventory, null, undefined, { preserveUnknown: true })
        expect(clearedKeep.craft?.finalMasterworkAffixIndex).toBeUndefined()
        expect(clearedKeep.affixes.some(entry => entry.finalMasterwork)).toBe(false)
        expect(clearedKeep.affixes.some(entry => entry.affixId === 999999)).toBe(true)
    })

    it("仅 per-affix final 的 legacy 物品：applyFinalMasterwork(null) 默认 / preserveUnknown 都真正清空", () => {
        const legacy = item({
            slotType: 3,
            rarityId: 5,
            affixes: [roll(101, { masterworkLevel: 10 }), roll(1001, { masterworkLevel: 10, finalMasterwork: true })],
        })
        const cleared = applyFinalMasterwork(legacy, null)
        expect(cleared).not.toBe(legacy)
        expect(cleared.craft).toEqual({ masterworkLevel: 10, temperingCount: 0, enchantCount: 0 })
        expect(cleared.affixes.some(entry => entry.finalMasterwork)).toBe(false)
        expect(getGearCraftState(cleared, undefined, { preserveUnknown: true }).finalMasterworkAffixIndex).toBeUndefined()

        const clearedKeep = applyFinalMasterwork(legacy, null, undefined, { preserveUnknown: true })
        expect(clearedKeep.craft?.finalMasterworkAffixIndex).toBeUndefined()
        expect(clearedKeep.affixes.some(entry => entry.finalMasterwork)).toBe(false)

        // 无 rarityId 的 legacy 物品仍被统一品质门槛拒绝（既有模型限制：clear 路径同样不可达）
        const noRarity = item({
            slotType: 3,
            affixes: [roll(101, { masterworkLevel: 10 }), roll(1001, { masterworkLevel: 10, finalMasterwork: true })],
        })
        expect(applyFinalMasterwork(noRarity, null)).toBe(noRarity)
        expect(applyFinalMasterwork(noRarity, null, undefined, { preserveUnknown: true })).toBe(noRarity)
    })

    it("target / availability helper 与 apply 共用 preserveUnknown 口径", () => {
        // 满级 + 仅未知最终目标：没有已知可承载目标，默认口径必须判 no-final-target
        const inventory = normalizeGearItem(
            item({
                slotType: 3,
                rarityId: 5,
                affixes: [roll(101, { masterworkLevel: 10 }), roll(999999, { masterworkLevel: 10, finalMasterwork: true })],
            }),
            undefined,
            { preserveUnknown: true }
        )!
        expect(inventory.craft?.finalMasterworkAffixIndex).toBe(1)
        expect(getGearFinalMasterworkTargets(inventory)).toEqual([])
        expect(getGearFinalMasterworkTargets(inventory, undefined, { preserveUnknown: true })).toEqual([1])
        expect(getGearCraftState(inventory).finalMasterworkAffixIndex).toBeUndefined()
        expect(getGearCraftState(inventory, undefined, { preserveUnknown: true }).finalMasterworkAffixIndex).toBe(1)
        expect(getCraftAvailability(inventory, TRANSCEND_CRAFT_FINAL_MASTERWORK)).toEqual({
            craftId: TRANSCEND_CRAFT_FINAL_MASTERWORK,
            available: false,
            reason: "no-final-target",
        })
        expect(getCraftAvailability(inventory, TRANSCEND_CRAFT_FINAL_MASTERWORK, undefined, { preserveUnknown: true })).toEqual({
            craftId: TRANSCEND_CRAFT_FINAL_MASTERWORK,
            available: true,
        })
        // 附魔目标不受 preserveUnknown 影响（未知最终目标与附魔槽互不干扰的负向对照）
        expect(getGearEnchantTargets(inventory)).toEqual(getGearEnchantTargets(inventory, undefined, { preserveUnknown: true }))
        expect(getGearEnchantTargets(inventory)).toEqual([1])
    })
})

describe("最终精锻真实数据公式", () => {
    const affixById = (affixId: number) => affixData.find(affix => affix.id === affixId)!

    it("Multi 1.1：最终值 = 精锻后 × 1.1（1001）", () => {
        const max = setGearMasterworkLevel(item({ slotType: 3, rarityId: 5, affixes: [roll(101), roll(1001)] }), 10)
        const targeted = applyFinalMasterwork(max, 1)
        const entries = flattenEquippedGear([{ slotId: 3, item: targeted }]).entries
        const entry = entries.find(item => item.affixId === 1001)!
        const value = resolveAffixValue(affixById(1001), entry)
        expect(value.afterMasterwork).toBeCloseTo(value.afterAncient * 1.01 ** 10, 8)
        expect(value.final).toBeCloseTo(value.afterMasterwork * 1.1, 8)
    })

    it("Add 1：精锻不成长（Add 0），最终精锻 +1（1038）", () => {
        const max = setGearMasterworkLevel(item({ slotType: 3, rarityId: 5, affixes: [roll(101), roll(1038)] }), 10)
        const targeted = applyFinalMasterwork(max, 1)
        const entries = flattenEquippedGear([{ slotId: 3, item: targeted }]).entries
        const entry = entries.find(item => item.affixId === 1038)!
        const value = resolveAffixValue(affixById(1038), entry)
        expect(value.afterMasterwork).toBe(value.afterAncient)
        expect(value.final).toBe(value.afterMasterwork + 1)
    })
})

describe("附魔快照与重置", () => {
    /** 金色手套 + 淬炼 1006 + 附魔 1024：被替换的 1001 进入快照 */
    const enchantedItem = (): TranscendGearItemConfig =>
        applyEnchant(applyTemper(goldItem(), { affixId: 1006 }), 1, { affixId: 1024, rollLevel: 5 })

    it("首次附魔保存被替换词条快照，同槽再附魔不覆盖", () => {
        const enchanted = enchantedItem()
        const snapshot = enchanted.craft?.enchantSnapshot
        // 保持词条数组顺序：101 / 1024(附魔，原位替换 1001) / 1006(淬炼)
        expect(enchanted.affixes.map(entry => entry.affixId)).toEqual([101, 1024, 1006])
        expect(enchanted.craft?.enchantAffixIndex).toBe(1)
        expect(snapshot).toMatchObject({
            affixIndex: 1,
            roll: { affixId: 1001, rollLevel: 1, ancient: false, finalMasterwork: false, source: "random" },
        })

        const again = applyEnchant(enchanted, enchanted.craft!.enchantAffixIndex!, { affixId: 1025 })
        expect(again.craft?.enchantCount).toBe(2)
        expect(again.craft?.enchantSnapshot).toEqual(snapshot)
        expect(getGearCraftState(again).enchantSnapshot).toEqual(snapshot)
    })

    it("快照式重置恢复原词条与下标，次数归零、费用复位、幂等且不修改入参", () => {
        const enchanted = enchantedItem()
        const frozen = JSON.parse(JSON.stringify(enchanted))
        const reset = resetEnchant(enchanted)
        expect(reset.affixes.map(entry => entry.affixId)).toEqual([101, 1001, 1006])
        expect(reset.affixes[1]).toMatchObject({ affixId: 1001, rollLevel: 1, source: "random" })
        expect(reset.craft).toEqual({ masterworkLevel: 0, temperingCount: 1, temperingAffixIndex: 2, enchantCount: 0 })
        expect(reset.craft?.enchantSnapshot).toBeUndefined()
        // 附魔费用成长回到基础倍率
        expect(getCraftCosts(TRANSCEND_CRAFT_ENCHANT, enchanted.craft!).multiplier).toBe(2)
        expect(getCraftCosts(TRANSCEND_CRAFT_ENCHANT, reset.craft!).multiplier).toBe(1)
        expect(resetEnchant(reset)).toBe(reset)
        expect(JSON.parse(JSON.stringify(enchanted))).toEqual(frozen)
    })

    it("重置后可重新选择目标附魔，且写入新快照（不继承旧快照）", () => {
        const tempered = applyTemper(goldItem({ affixes: [roll(101), roll(1001), roll(1002)] }), { affixId: 1006 })
        const enchanted = applyEnchant(tempered, 2, { affixId: 1024 }) // 替换 1002
        expect(enchanted.craft?.enchantSnapshot?.roll.affixId).toBe(1002)

        const reset = resetEnchant(enchanted)
        expect(reset.affixes.map(entry => entry.affixId)).toEqual([101, 1001, 1002, 1006])
        expect(getGearEnchantTargets(reset)).toEqual([1, 2])

        const reEnchanted = applyEnchant(reset, 1, { affixId: 1025 }) // 换目标：替换 1001
        expect(reEnchanted.craft?.enchantCount).toBe(1)
        expect(reEnchanted.craft?.enchantSnapshot?.roll.affixId).toBe(1001)
        expect(reEnchanted.affixes.map(entry => entry.affixId)).toEqual([101, 1025, 1002, 1006])
    })

    it("附魔后再淬炼 / 改精锻，快照随 craft 状态透传", () => {
        const enchanted = enchantedItem()
        const temperedAgain = applyTemper(enchanted, { affixId: 1058 })
        expect(temperedAgain.craft?.enchantSnapshot).toEqual(enchanted.craft?.enchantSnapshot)
        expect(temperedAgain.craft?.temperingCount).toBe(2)

        const maxed = setGearMasterworkLevel(enchanted, 10)
        expect(maxed.craft?.enchantSnapshot?.roll).toMatchObject({ affixId: 1001, masterworkLevel: 10 })
        expect(maxed.craft?.enchantSnapshot?.affixIndex).toBe(enchanted.craft?.enchantSnapshot?.affixIndex)
    })

    it("无快照（旧数据 / 手动构造）只清空附魔状态，当前附魔行降级为随机词条", () => {
        const enchanted = enchantedItem()
        const legacy = { ...enchanted, craft: { ...enchanted.craft! } }
        delete (legacy.craft as { enchantSnapshot?: unknown }).enchantSnapshot
        const reset = resetEnchant(legacy)
        expect(reset.affixes.map(entry => [entry.affixId, entry.source])).toEqual([
            [101, undefined],
            [1024, "random"],
            [1006, "tempering"],
        ])
        expect(reset.craft).toEqual({ masterworkLevel: 0, temperingCount: 1, temperingAffixIndex: 2, enchantCount: 0 })
    })

    it("最终精锻目标联动：恢复词条可承载则回到原词条，不可承载则清空", () => {
        const max = setGearMasterworkLevel(goldItem(), 10)
        const tempered = applyTemper(max, { affixId: 1006 })
        const withFinal = applyFinalMasterwork(tempered, 1) // 1001
        expect(withFinal.craft?.finalMasterworkAffixIndex).toBe(1)
        const enchanted = applyEnchant(withFinal, 1, { affixId: 1024 })
        expect(enchanted.craft?.finalMasterworkAffixIndex).toBe(1) // 1024 原位跟随目标

        const reset = resetEnchant(enchanted)
        expect(reset.craft?.finalMasterworkAffixIndex).toBe(1)
        expect(reset.affixes[1]).toMatchObject({ affixId: 1001, finalMasterwork: true })

        const noMax = { affixes: affixData.map(affix => (affix.id === 1001 ? { ...affix, maxAffixUpdateFunc: undefined } : affix)) }
        const cleared = resetEnchant(enchanted, noMax)
        expect(cleared.craft?.finalMasterworkAffixIndex).toBeUndefined()
        expect(cleared.affixes.some(entry => entry.finalMasterwork)).toBe(false)
        expect(cleared.affixes.map(entry => entry.affixId)).toEqual([101, 1001, 1006])
    })

    it("归一化保留合法快照；下标越界 / 词条非法 / 与当前状态矛盾时丢弃并告警", () => {
        const enchanted = enchantedItem()
        expect(normalizeGearItem(enchanted)!.craft?.enchantSnapshot).toEqual(enchanted.craft?.enchantSnapshot)

        const craftWith = (snapshot: unknown) => ({
            masterworkLevel: 0,
            finalMasterworkAffixIndex: undefined,
            temperingAffixIndex: 1,
            temperingCount: 1,
            enchantAffixIndex: 2,
            enchantCount: 1,
            enchantSnapshot: snapshot as never,
        })
        const base = { kind: "normal" as const, slotType: 3, affixes: [roll(101), roll(1006), roll(1024)] }

        const outOfRangeWarnings: string[] = []
        const outOfRange = normalizeGearItem({ ...base, craft: craftWith({ affixIndex: 9, roll: roll(1001) }) }, undefined, {
            warnings: outOfRangeWarnings,
        })!
        expect(outOfRange.craft?.enchantSnapshot).toBeUndefined()
        expect(outOfRangeWarnings.some(message => message.includes("craft.enchantSnapshot 下标 9 越界"))).toBe(true)

        const invalidWarnings: string[] = []
        const invalid = normalizeGearItem({ ...base, craft: craftWith({ affixIndex: 1, roll: roll(999999) }) }, undefined, {
            warnings: invalidWarnings,
        })!
        expect(invalid.craft?.enchantSnapshot).toBeUndefined()
        expect(invalidWarnings.some(message => message.includes("craft.enchantSnapshot 词条非法"))).toBe(true)

        // 快照词条仍在当前数组：矛盾，丢弃（不得伪造为已替换）
        const duplicatedWarnings: string[] = []
        const duplicated = normalizeGearItem({ ...base, craft: craftWith({ affixIndex: 2, roll: roll(1024) }) }, undefined, {
            warnings: duplicatedWarnings,
        })!
        expect(duplicated.craft?.enchantSnapshot).toBeUndefined()
        expect(duplicatedWarnings.some(message => message.includes("与当前状态矛盾"))).toBe(true)

        // 基础词条不可能被附魔替换：同样视为矛盾
        const baseWarnings: string[] = []
        const onBase = normalizeGearItem({ ...base, craft: craftWith({ affixIndex: 0, roll: roll(101) }) }, undefined, {
            warnings: baseWarnings,
        })!
        expect(onBase.craft?.enchantSnapshot).toBeUndefined()
        expect(baseWarnings.some(message => message.includes("与当前状态矛盾"))).toBe(true)

        // 没有附魔词条时快照无效
        const noEnchantWarnings: string[] = []
        const noEnchant = normalizeGearItem(
            { ...base, craft: { ...craftWith({ affixIndex: 1, roll: roll(1001) }), enchantAffixIndex: undefined } },
            undefined,
            { warnings: noEnchantWarnings }
        )!
        expect(noEnchant.craft?.enchantSnapshot).toBeUndefined()
        expect(noEnchantWarnings.some(message => message.includes("没有附魔词条时无效"))).toBe(true)
    })

    it("快照完整数据：档位 7 经 applyEnchant → resetEnchant 与短码往返都不丢", () => {
        const base = goldItem({ affixes: [roll(101), roll(1001, { rollLevel: 7 })] })
        const enchanted = applyEnchant(applyTemper(base, { affixId: 1006 }), 1, { affixId: 1024, rollLevel: 5 })
        expect(enchanted.craft?.enchantSnapshot?.roll).toMatchObject({ affixId: 1001, rollLevel: 7, ancient: false })
        expect(resetEnchant(enchanted).affixes.find(entry => entry.affixId === 1001)).toMatchObject({ rollLevel: 7, ancient: false })

        const code = encodeTranscendGearCode([{ slotId: 3, item: enchanted }], [])
        expect(code.startsWith(TRANSCEND_GEAR_CODE_SNAPSHOT_PREFIX)).toBe(true)
        const decoded = decodeTranscendGearCode(code)
        const decodedItem = (decoded.mainGear[0] as { item: TranscendGearItemConfig }).item
        expect(decodedItem.craft?.enchantSnapshot).toEqual(enchanted.craft?.enchantSnapshot)
        expect(resetEnchant(decodedItem).affixes.find(entry => entry.affixId === 1001)).toMatchObject({ rollLevel: 7, ancient: false })
    })

    it("快照完整数据：太古经 applyEnchant → resetEnchant 与短码往返都不丢", () => {
        const base = goldItem({ affixes: [roll(101), roll(1001, { ancient: true })] })
        const enchanted = applyEnchant(applyTemper(base, { affixId: 1006 }), 1, { affixId: 1024 })
        expect(enchanted.craft?.enchantSnapshot?.roll).toMatchObject({ affixId: 1001, ancient: true })
        expect(resetEnchant(enchanted).affixes.find(entry => entry.affixId === 1001)?.ancient).toBe(true)

        const decodedItem = decodeTranscendGearCode(encodeTranscendGearCode([{ slotId: 3, item: enchanted }], [])).mainGear[0] as {
            item: TranscendGearItemConfig
        }
        expect(decodedItem.item.craft?.enchantSnapshot).toEqual(enchanted.craft?.enchantSnapshot)
        expect(resetEnchant(decodedItem.item).affixes.find(entry => entry.affixId === 1001)?.ancient).toBe(true)
    })

    it("getGearCraftState 在乱序 / 未归一化数组上按排序口径返回快照下标", () => {
        const shuffled: TranscendGearItemConfig = {
            kind: "normal",
            slotType: 3,
            rarityId: 5,
            affixes: [roll(1024, { source: "enchant" }), roll(101), roll(1006, { source: "tempering" })],
            craft: {
                masterworkLevel: 0,
                temperingAffixIndex: 2,
                temperingCount: 1,
                enchantAffixIndex: 0,
                enchantCount: 1,
                enchantSnapshot: { affixIndex: 1, roll: roll(1001) },
            },
        }
        const state = getGearCraftState(shuffled)
        expect(state.enchantAffixIndex).toBe(0)
        expect(state.temperingAffixIndex).toBe(2)
        expect(state.enchantSnapshot).toEqual({
            affixIndex: 1,
            roll: { affixId: 1001, rollLevel: 1, masterworkLevel: 0, ancient: false, finalMasterwork: false, source: "random" },
        })
        expect(normalizeGearItem(shuffled)!.craft?.enchantSnapshot).toEqual(state.enchantSnapshot)

        // 已归一化物品仅重排数组（目标下标随位置重映射）：快照下标仍按排序后数组计算
        const enchanted = enchantedItem()
        const reordered: TranscendGearItemConfig = {
            ...enchanted,
            affixes: [enchanted.affixes[2], enchanted.affixes[0], enchanted.affixes[1]],
            craft: { ...enchanted.craft!, enchantAffixIndex: 0, temperingAffixIndex: 2 },
        }
        expect(getGearCraftState(reordered).enchantSnapshot).toEqual(enchanted.craft?.enchantSnapshot)
    })

    it("淬炼拒绝附魔快照的原词条（isAffixBlockedByEnchantSnapshot），重置后解除", () => {
        const enchanted = enchantedItem()
        expect(isAffixBlockedByEnchantSnapshot(enchanted, 1001)).toBe(true)
        expect(isAffixBlockedByEnchantSnapshot(enchanted, 1006)).toBe(false)
        expect(isAffixBlockedByEnchantSnapshot(enchanted, 1058)).toBe(false)

        const blocked = applyTemper(enchanted, { affixId: 1001 })
        expect(blocked).toBe(enchanted)
        expect(blocked.craft?.enchantSnapshot).toEqual(enchanted.craft?.enchantSnapshot)
        // 其它池内词条不受影响
        expect(applyTemper(enchanted, { affixId: 1058 }).craft?.temperingAffixIndex).toBeDefined()

        // 无快照 / 已重置时同一词条不再阻塞
        expect(isAffixBlockedByEnchantSnapshot(goldItem(), 1001)).toBe(false)
        const reset = resetEnchant(enchanted)
        expect(isAffixBlockedByEnchantSnapshot(reset, 1001)).toBe(false)
        expect(applyTemper(reset, { affixId: 1001 }).craft?.enchantSnapshot).toBeUndefined()
    })

    it("commitGearCraft：有快照但无附魔目标时丢弃快照，有目标时保留", () => {
        const base = goldItem({ affixes: [roll(101), roll(1006), roll(1024)] })
        const state = {
            masterworkLevel: 0,
            temperingCount: 1,
            enchantCount: 1,
            enchantSnapshot: { affixIndex: 1, roll: roll(1001) },
        }
        const kept = commitGearCraft(base, base.affixes, state, { temperingAffixId: 1006, enchantAffixId: 1024 })
        expect(kept.craft?.enchantSnapshot).toMatchObject({ affixIndex: 1, roll: { affixId: 1001 } })
        expect(kept.craft?.enchantCount).toBe(1)

        // 附魔锚点缺省 / 指向不存在的词条：附魔目标不成立，快照与次数一并丢弃
        for (const anchors of [{ temperingAffixId: 1006 }, { temperingAffixId: 1006, enchantAffixId: 9999 }]) {
            const dropped = commitGearCraft(base, base.affixes, state, anchors)
            expect(dropped.craft?.enchantSnapshot).toBeUndefined()
            expect(dropped.craft?.enchantCount).toBe(0)
            expect(dropped.craft?.temperingCount).toBe(1)
        }
    })
})

describe("淬炼重置（数据层）", () => {
    it("删除淬炼来源词条并把次数归零，最终精锻目标联动清除", () => {
        const max = setGearMasterworkLevel(goldItem(), 10)
        const tempered = applyTemper(max, { affixId: 1006 })
        const withFinal = applyFinalMasterwork(tempered, 2)
        expect(withFinal.craft?.finalMasterworkAffixIndex).toBe(2)

        const reset = resetTempering(withFinal)
        expect(reset.affixes.map(entry => entry.affixId)).toEqual([101, 1001])
        expect(reset.craft).toEqual({ masterworkLevel: 10, temperingCount: 0, enchantCount: 0 })
        expect(reset.affixes.some(entry => entry.source === "tempering")).toBe(false)
        expect(resetTempering(reset)).toBe(reset)
    })

    it("保留附魔状态与快照，仅移除淬炼行", () => {
        const enchanted = applyEnchant(applyTemper(goldItem(), { affixId: 1006 }), 1, { affixId: 1024, rollLevel: 5 })
        const frozen = JSON.parse(JSON.stringify(enchanted))
        const reset = resetTempering(enchanted)
        expect(JSON.parse(JSON.stringify(enchanted))).toEqual(frozen)
        expect(reset.affixes.map(entry => entry.affixId)).toEqual([101, 1024])
        expect(reset.craft?.temperingAffixIndex).toBeUndefined()
        expect(reset.craft?.temperingCount).toBe(0)
        expect(reset.craft?.enchantAffixIndex).toBe(1)
        expect(reset.craft?.enchantSnapshot).toEqual(enchanted.craft?.enchantSnapshot)
        expect(reset.craft?.enchantCount).toBe(1)
    })

    it("快照下标在原数组内时，淬炼重置保留快照并按位置恢复", () => {
        // 1025 被原位替换为 1001：快照下标 = 1（被替换行位置），移除淬炼行后仍保留快照
        const enchanted = applyEnchant(applyTemper(goldItem({ affixes: [roll(101), roll(1025)] }), { affixId: 1006 }), 1, {
            affixId: 1001,
        })
        expect(enchanted.affixes.map(entry => entry.affixId)).toEqual([101, 1001, 1006])
        expect(enchanted.craft?.enchantSnapshot).toMatchObject({ affixIndex: 1, roll: { affixId: 1025 } })
        const reset = resetTempering(enchanted)
        expect(reset.craft?.enchantSnapshot).toMatchObject({ affixIndex: 1, roll: { affixId: 1025 } })
        expect(reset.affixes.map(entry => entry.affixId)).toEqual([101, 1001])
        // 再重置附魔：1025 恢复到被替换行下标
        const restored = resetEnchant(reset)
        expect(restored.affixes.map(entry => entry.affixId)).toEqual([101, 1025])
    })

    it("跨赛季 / 低品质物品的 resetEnchant / resetTempering 仍可用（重置不受 craft 门槛限制）", () => {
        const crossSeason = item({
            slotType: 3,
            rarityId: 5,
            seasonId: 99,
            affixes: [roll(101), roll(1006, { source: "tempering" }), roll(1024, { source: "enchant" })],
            craft: {
                masterworkLevel: 0,
                temperingAffixIndex: 1,
                temperingCount: 2,
                enchantAffixIndex: 2,
                enchantCount: 1,
                enchantSnapshot: { affixIndex: 1, roll: roll(1001) },
            },
        })
        // apply 系列仍被门槛拒绝
        expect(applyTemper(crossSeason, { affixId: 1058 })).toBe(crossSeason)
        expect(applyEnchant(crossSeason, 2, { affixId: 1025 })).toBe(crossSeason)
        // 重置永远可用
        expect(resetEnchant(crossSeason).affixes.map(entry => entry.affixId)).toEqual([101, 1006, 1001])
        const tempered = resetTempering(crossSeason)
        expect(tempered.affixes.map(entry => entry.affixId)).toEqual([101, 1024])
        expect(tempered.craft?.enchantSnapshot).toMatchObject({ roll: { affixId: 1001 } })

        const white = item({
            slotType: 1,
            rarityId: 1,
            affixes: [roll(102), roll(1006, { source: "tempering" }), roll(1024, { source: "enchant" })],
            craft: {
                masterworkLevel: 0,
                temperingAffixIndex: 1,
                temperingCount: 1,
                enchantAffixIndex: 2,
                enchantCount: 1,
                enchantSnapshot: { affixIndex: 2, roll: roll(1001) },
            },
        })
        expect(applyTemper(white, { affixId: 1058 })).toBe(white)
        expect(resetEnchant(white).affixes.map(entry => entry.affixId)).toEqual([102, 1006, 1001])
        expect(resetTempering(white).affixes.map(entry => entry.affixId)).toEqual([102, 1024])
    })
})
