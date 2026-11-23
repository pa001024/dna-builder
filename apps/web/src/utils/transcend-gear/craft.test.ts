import { describe, expect, it } from "vitest"
import {
    applyEnchant,
    getGearCraftState,
    resetEnchant,
    setGearMasterworkLevel,
    type TranscendGearAffixRoll,
    type TranscendGearItemConfig,
} from "@/data"
import {
    clampCraftRestore,
    getCraftConditionText,
    getCraftGateTextKey,
    getEnchantAffixPool,
    getEnchantFlow,
    getGearRecyclePreview,
    getTemperCandidates,
    groupTemperPools,
    pairRecycleItems,
    pickDistinct,
    pickEnchantCandidates,
    pickEnchantRolls,
    pickFinalMasterworkTargetIndex,
    pickRandomEnchantRoll,
    rollAffixLevel,
    shouldPreviewFinalMasterwork,
} from "./craft"
import { buildGearItem, getAffixRollRange, getBaseAffix, getRandomAffixPool, type TranscendGearDraft } from "./generation"

/** 词缀 roll（精锻由 craft 统一写入） */
const roll = (affixId: number, patch: Partial<TranscendGearAffixRoll> = {}): TranscendGearAffixRoll => ({
    affixId,
    rollLevel: 1,
    masterworkLevel: 0,
    ancient: false,
    finalMasterwork: false,
    ...patch,
})

/** 金色品质手套：基础词条 101 + 随机词条 1001（槽 3，淬炼池 201/203/205） */
const goldItem = (patch: Partial<TranscendGearItemConfig> = {}): TranscendGearItemConfig => ({
    kind: "normal",
    slotType: 3,
    rarityId: 5,
    equipBaseScore: 50,
    affixes: [roll(101), roll(1001)],
    ...patch,
})

/** 固定随机源 */
const seeded = (values: number[]): (() => number) => {
    let index = 0
    return () => values[index++ % values.length]
}

describe("随机抽取与附魔候选", () => {
    it("pickDistinct 抽取互不相同的元素，rng 越界不崩", () => {
        expect(pickDistinct([1, 2, 3, 4], 2, seeded([0, 0.99]))).toEqual([1, 4])
        expect(pickDistinct([1, 2], 5, seeded([0]))).toEqual([1, 2])
        expect(pickDistinct([1, 2, 3], 0, seeded([0]))).toEqual([])
        expect(pickDistinct([1, 2, 3], 2, seeded([1, -1]))).toEqual([3, 1])
    })

    it("附魔候选恰好 2 个、互不相同、排除目标 / 现有词缀 / 快照原词缀", () => {
        const candidates = pickEnchantCandidates(
            { slotType: 3, presentAffixIds: [101, 1001], excludeAffixId: 1001, reservedAffixId: 1005, count: 2 },
            seeded([0, 0])
        )
        expect(candidates).toHaveLength(2)
        const ids = candidates.map(affix => affix.id)
        expect(new Set(ids).size).toBe(2)
        expect(ids).not.toContain(101)
        expect(ids).not.toContain(1001)
        expect(ids).not.toContain(1005)
        expect(candidates.every(affix => affix.plan === 2)).toBe(true)
    })

    it("附魔候选排除与现有词缀互斥的词条", () => {
        // 1010 的排斥表包含 1006/1007/1008/1009/1011；现有词缀保留 1010 时这些不能入选
        const candidates = pickEnchantCandidates({ slotType: 3, presentAffixIds: [101, 1010], excludeAffixId: 1005, count: 8 }, seeded([0]))
        expect(candidates.map(affix => affix.id)).not.toContain(1010)
        for (const id of [1006, 1007, 1008, 1009, 1011]) expect(candidates.map(affix => affix.id)).not.toContain(id)
    })

    it("候选池只剩 1 条时返回 1 条，不重复 / 不补位", () => {
        const pool = getRandomAffixPool(3)
        const keep = pool.find(affix => {
            const present = pool.filter(entry => entry.id !== affix.id).map(entry => entry.id)
            return pickEnchantCandidates({ slotType: 3, presentAffixIds: present, count: 2 }, seeded([0])).length === 1
        })
        expect(keep).toBeDefined()
        const present = pool.filter(entry => entry.id !== keep?.id).map(entry => entry.id)
        const candidates = pickEnchantCandidates({ slotType: 3, presentAffixIds: present, count: 2 }, seeded([0]))
        expect(candidates.map(affix => affix.id)).toEqual([keep?.id])
    })

    it("候选池为空时返回 0 条（界面空态分支）", () => {
        const pool = getRandomAffixPool(3)
        const candidates = pickEnchantCandidates({ slotType: 3, presentAffixIds: pool.map(affix => affix.id), count: 2 }, seeded([0]))
        expect(candidates).toEqual([])
    })
})

describe("附魔随机档位与随机模式", () => {
    /** 线性同余随机源（确定性，便于分布断言） */
    const lcg =
        (seed: number): (() => number) =>
        () => {
            seed = (seed * 1664525 + 1013904223) >>> 0
            return seed / 4294967296
        }

    const request = { slotType: 3, presentAffixIds: [101, 1001], excludeAffixId: 1001, reservedAffixId: 1005, count: 2 }

    it("rollAffixLevel 落在强度区间内，rng 两端分别取 min / max", () => {
        const affix = getRandomAffixPool(3)[0]
        const range = getAffixRollRange(affix, 50)
        expect(range.max - range.min).toBeGreaterThan(1)
        expect(rollAffixLevel(affix, 50, () => 0)).toBe(range.min)
        expect(rollAffixLevel(affix, 50, () => 0.999999)).toBe(range.max)
        expect(rollAffixLevel(affix, 50, () => Number.NaN)).toBe(range.min)
    })

    it("rollAffixLevel 不恒为上限：确定性随机源采样出现多个档位", () => {
        const affix = getRandomAffixPool(3)[0]
        const range = getAffixRollRange(affix, 50)
        const rng = lcg(20261120)
        const levels = Array.from({ length: 400 }, () => rollAffixLevel(affix, 50, rng))
        const distinct = new Set(levels)
        expect(Math.min(...levels)).toBe(range.min)
        expect(Math.max(...levels)).toBe(range.max)
        expect(distinct.size).toBeGreaterThan(range.max - range.min - 1)
        expect(levels.filter(level => level !== range.max).length).toBeGreaterThan(0)
    })

    it("手动候选 2 条各自 roll：注入 rng 为 0 时全部下限、0.999999 时全部上限", () => {
        const low = pickEnchantRolls(request, 50, seeded([0, 0, 0, 0]))
        expect(low).toHaveLength(2)
        expect(new Set(low.map(item => item.affix.id)).size).toBe(2)
        for (const item of low) {
            const range = getAffixRollRange(item.affix, 50)
            expect(item.rollLevel).toBe(range.min)
        }

        const high = pickEnchantRolls(request, 50, seeded([0, 0, 0.999999, 0.999999]))
        for (const item of high) {
            const range = getAffixRollRange(item.affix, 50)
            expect(item.rollLevel).toBe(range.max)
        }
    })

    it("随机附魔只挑 1 条并 roll，排除已有词缀 / 当前目标 / 快照原词缀", () => {
        const picked = pickRandomEnchantRoll({ ...request, count: 1 }, 50, seeded([0, 0.5]))
        expect(picked).toBeDefined()
        expect(picked?.affix.plan).toBe(2)
        expect([101, 1001, 1005]).not.toContain(picked?.affix.id)
        const range = getAffixRollRange(picked!.affix, 50)
        expect(picked!.rollLevel).toBeGreaterThanOrEqual(range.min)
        expect(picked!.rollLevel).toBeLessThanOrEqual(range.max)
        expect(picked!.rollLevel).not.toBe(range.max)

        const empty = pickRandomEnchantRoll(
            { slotType: 3, presentAffixIds: getRandomAffixPool(3).map(affix => affix.id), count: 1 },
            50,
            seeded([0])
        )
        expect(empty).toBeUndefined()
    })

    it("预览最终精锻只在替换当前最终精锻槽且新词缀可承载时为 true", () => {
        const state = { finalMasterworkAffixIndex: 1 }
        const capable = getRandomAffixPool(3)[0]
        const incapable = getBaseAffix(3)
        expect(capable?.maxAffixUpdateFunc).toBeTruthy()
        expect(incapable?.maxAffixUpdateFunc).toBeFalsy()
        expect(shouldPreviewFinalMasterwork(state, 1, capable)).toBe(true)
        expect(shouldPreviewFinalMasterwork(state, 0, capable)).toBe(false)
        expect(shouldPreviewFinalMasterwork(state, undefined, capable)).toBe(false)
        expect(shouldPreviewFinalMasterwork({}, 1, capable)).toBe(false)
        expect(shouldPreviewFinalMasterwork(state, 1, incapable)).toBe(false)
        expect(shouldPreviewFinalMasterwork(state, 1, undefined)).toBe(false)
    })

    it("可 roll 池与随机 / 自定义共用过滤：排除目标、现有、快照与互斥词条", () => {
        const pool = getEnchantAffixPool(request)
        expect(pool.length).toBeGreaterThan(0)
        for (const affix of pool) {
            expect(affix.plan).toBe(2)
            expect([101, 1001, 1005]).not.toContain(affix.id)
        }
    })
})

describe("附魔流程与快照", () => {
    it("首次附魔需要确认；附魔后目标固定且不再需要首次确认；重置后回到首次阶段", () => {
        const source = goldItem({ affixes: [roll(101), roll(1001), roll(1017)] })
        const first = getEnchantFlow(source)
        expect(first.stage).toBe("first")
        expect(first.needsFirstConfirm).toBe(true)
        expect(first.targets.length).toBeGreaterThan(1)

        const enchanted = applyEnchant(source, 1, { affixId: 1018 })
        const replace = getEnchantFlow(enchanted)
        expect(replace.stage).toBe("replace")
        expect(replace.needsFirstConfirm).toBe(false)
        expect(replace.targets).toHaveLength(1)
        expect(replace.targets[0]).toBe(getGearCraftState(enchanted).enchantAffixIndex)

        const reset = resetEnchant(enchanted)
        const again = getEnchantFlow(reset)
        expect(again.stage).toBe("first")
        expect(again.needsFirstConfirm).toBe(true)
        expect(again.targets.length).toBeGreaterThan(1)
    })

    it("buildGearItem 透传附魔快照：草稿重建后仍可重置回原词缀", () => {
        const enchanted = applyEnchant(goldItem(), 1, { affixId: 1005 })
        const state = getGearCraftState(enchanted)
        expect(state.enchantSnapshot?.roll.affixId).toBe(1001)

        const draft: TranscendGearDraft = {
            rarityId: 5,
            equipBaseScore: 50,
            randomAffixes: enchanted.affixes.filter(item => item.affixId !== 101).map(item => ({ ...item })),
            masterworkLevel: state.masterworkLevel,
            temperingCount: state.temperingCount,
            enchantCount: state.enchantCount,
            enchantSnapshot: state.enchantSnapshot,
        }
        const rebuilt = buildGearItem(3, draft, { preserveUnknown: true })
        const rebuiltState = getGearCraftState(rebuilt)
        expect(rebuiltState.enchantSnapshot?.roll.affixId).toBe(1001)
        expect(rebuiltState.enchantCount).toBe(1)

        const reset = resetEnchant(rebuilt)
        const resetState = getGearCraftState(reset)
        expect(resetState.enchantAffixIndex).toBeUndefined()
        expect(resetState.enchantCount).toBe(0)
        expect(reset.affixes.map(item => item.affixId)).toContain(1001)
        expect(reset.affixes.map(item => item.affixId)).not.toContain(1005)
    })
})

describe("品质切换后的撤销复检", () => {
    it("白色 / 蓝色品质不可用的精锻等级与最终目标被剪掉，金色保持可恢复", () => {
        const draft = (rarityId: number): TranscendGearDraft => ({
            rarityId,
            equipBaseScore: 50,
            randomAffixes: [roll(1001)],
            masterworkLevel: 10,
            finalMasterworkAffixId: 1001,
        })
        const white = buildGearItem(3, draft(1), { preserveUnknown: true })
        expect(getGearCraftState(white).masterworkLevel).toBe(10)
        expect(clampCraftRestore(white, { level: 10, finalAffixId: 1001 })).toEqual({ level: 0, finalAffixId: undefined })

        for (const rarityId of [2, 3]) {
            const blue = buildGearItem(3, draft(rarityId), { preserveUnknown: true })
            expect(getGearCraftState(blue).masterworkLevel, `rarity ${rarityId}`).toBe(10)
            expect(clampCraftRestore(blue, { level: 10, finalAffixId: 1001 }), `rarity ${rarityId}`).toEqual({
                level: 0,
                finalAffixId: undefined,
            })
        }

        const whiteLow = buildGearItem(3, { ...draft(1), masterworkLevel: 0, finalMasterworkAffixId: undefined }, { preserveUnknown: true })
        expect(clampCraftRestore(whiteLow, { level: 0 })).toEqual({ level: 0, finalAffixId: undefined })

        const gold = buildGearItem(3, draft(5), { preserveUnknown: true })
        expect(clampCraftRestore(gold, { level: 10, finalAffixId: 1001 })).toEqual({ level: 10, finalAffixId: 1001 })

        const unknownDraft: TranscendGearDraft = {
            rarityId: 5,
            equipBaseScore: 50,
            randomAffixes: [roll(999999)],
            masterworkLevel: 10,
            finalMasterworkAffixId: 999999,
        }
        const unknown = buildGearItem(3, unknownDraft, { preserveUnknown: true })
        expect(clampCraftRestore(unknown, { level: 10, finalAffixId: 999999 }, { preserveUnknown: true })).toEqual({
            level: 10,
            finalAffixId: 999999,
        })
        expect(clampCraftRestore(unknown, { level: 10, finalAffixId: 999999 })).toEqual({ level: 10, finalAffixId: undefined })
    })
})

describe("淬炼配方组", () => {
    it("按池 id 顺序返回全部组，空组保留", () => {
        const groups = groupTemperPools([201, 202, 203], [{ pool: 201 }, { pool: 203 }])
        expect(groups.map(group => group.poolId)).toEqual([201, 202, 203])
        expect(groups.map(group => group.affixes.length)).toEqual([1, 0, 1])
    })
})

describe("淬炼候选池", () => {
    it("同 id 的随机词条不再排除；基础 / 专属词条仍排除", () => {
        const ids = getTemperCandidates(goldItem(), 0).map(affix => affix.id)
        expect(ids).toContain(1001)
        expect(ids).not.toContain(101)

        const unique = goldItem({ kind: "unique", uniqueAffix: roll(1001) })
        expect(getTemperCandidates(unique, 0).map(affix => affix.id)).not.toContain(1001)
    })

    it("附魔快照原词缀保留在池内（界面禁用），不因同 id 排除丢失", () => {
        const enchanted = goldItem({
            affixes: [roll(101), roll(1024, { source: "enchant" })],
            craft: {
                masterworkLevel: 0,
                temperingCount: 0,
                enchantAffixIndex: 1,
                enchantCount: 1,
                enchantSnapshot: { affixIndex: 1, roll: roll(1001) },
            },
        })
        expect(getTemperCandidates(enchanted, 0).map(affix => affix.id)).toContain(1001)
    })
})

describe("最终精锻随机目标", () => {
    it("只在可承载最终精锻的词缀中抽取，可重复抽取", () => {
        const maxed = setGearMasterworkLevel(goldItem({ affixes: [roll(101), roll(1001), roll(1017)] }), 10)
        const low = pickFinalMasterworkTargetIndex(maxed, undefined, seeded([0]))
        const high = pickFinalMasterworkTargetIndex(maxed, undefined, seeded([0.999]))
        expect(new Set([low, high]).size).toBe(2)
        for (const index of [low, high]) {
            expect(index).toBeDefined()
            expect([1, 2]).toContain(index)
        }
        const notMaxed = pickFinalMasterworkTargetIndex(goldItem(), undefined, seeded([0]))
        expect(notMaxed).toBeUndefined()
    })
})

describe("回收产出拆分", () => {
    it("出售价与分解材料分开返回，不合并", () => {
        const white = getGearRecyclePreview(1)
        expect(white?.sell).toEqual({ priceId: 7000101, price: 20 })
        expect(white?.breakdown).toEqual({ itemIds: [7000102], itemCounts: [1] })

        const unique = getGearRecyclePreview(10)
        expect(unique?.sell?.price).toBe(100000)
        expect(unique?.breakdown?.itemIds).toEqual([7000102, 7000103])
        expect(unique?.breakdown?.itemCounts).toEqual([5, 5])
    })

    it("没有该品质配置时返回 null（界面空态）", () => {
        expect(getGearRecyclePreview(6)).toBeNull()
        expect(getGearRecyclePreview(0)).toBeNull()
    })

    it("非法 id 先配对再过滤，材料与数量不错位", () => {
        expect(pairRecycleItems([0, 7000102, -1, 7000103], [9, 5, 7, 0])).toEqual({
            itemIds: [7000102, 7000103],
            itemCounts: [5, 1],
        })
        expect(pairRecycleItems([], [])).toEqual({ itemIds: [], itemCounts: [] })
    })
})

describe("craft 条件与门槛文案键", () => {
    it("条件读上游原文（仅展示），门槛原因映射 i18n 键", () => {
        const translate = (text: string | undefined | null) => text ?? ""
        expect(getCraftConditionText(1, translate)).not.toBe("")
        expect(getCraftConditionText(5, translate)).toBe("")
        expect(getCraftGateTextKey("no-empty-socket")).toBe("transcend-build.craft_gate_no_empty_socket")
        expect(getCraftGateTextKey(undefined)).toBe("")
    })
})
