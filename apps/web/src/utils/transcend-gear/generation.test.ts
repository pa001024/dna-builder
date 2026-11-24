import { describe, expect, it } from "vitest"
import {
    affixes,
    type DnaSeasonAffix,
    type DnaSeasonRarity,
    decodeTranscendGearCode,
    encodeTranscendGearCode,
    getGearCraftState,
    getGearTemperingAffixPool,
    getSlotMaxInlayCount,
    inlays,
    normalizeGearItem,
    rarities,
    resolveAffixValue,
    resolveInlayAffixId,
    type TranscendGearAffixRoll,
    type TranscendGearItemConfig,
    uniqueEquips,
} from "@/data"
import { getAffixDataUiType } from "@/utils/transcend-build"
import { getAffixCapabilities } from "@/utils/transcendence-gear"
import {
    canUseUniqueRarity,
    composeGearName,
    getBaseNameOptions,
    getCurrentSeasonId,
    getGearDisplayName,
    getGearIconSrc,
    getGearRarityAffixCount,
    getNamePrefix,
    getUniqueEquipOptions,
    isReversedGearNameLocale,
} from "./catalog"
import {
    getAffixStrengthRangeText,
    getGearLineMarkState,
    getItemAffixCounts,
    getItemAffixLines,
    getItemSearchTokens,
    getItemSocketLines,
    hasAncientGearAffix,
    isAncientGearIconLine,
    isAncientGearLine,
} from "./display"
import {
    applyStrengthToAffixes,
    buildGearItem,
    buildQuickGearItem,
    createAffixRoll,
    getAffixRollRange,
    getBaseAffix,
    getFallbackPlanRollRange,
    getGearRandomAffixPool,
    getPlanRollRange,
    getRandomAffixPool,
    getRandomAffixState,
    isAffixAllowedForChar,
    isGearDraftValid,
    normalizeGearForEquipFallback,
    type TranscendGearDraft,
} from "./generation"

const identity = (text: string | undefined | null) => text ?? ""

const item = (patch: Partial<TranscendGearItemConfig> & Pick<TranscendGearItemConfig, "slotType">): TranscendGearItemConfig => ({
    kind: "normal",
    affixes: [],
    ...patch,
})

describe("品质与生成规则", () => {
    it("品质 → 随机词缀条数：0/1/2/3/4/4，暗金 10 为 4 条随机 + 1 条专属", () => {
        expect([1, 2, 3, 4, 5, 10].map(id => getGearRarityAffixCount(id))).toEqual([0, 1, 2, 3, 4, 4])
        expect(getGearRarityAffixCount(6)).toBe(0)
        expect(getGearRarityAffixCount(undefined)).toBe(0)
    })

    it("槽型 10/11 没有唯一装，不能构造暗金", () => {
        for (const slotType of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
            expect(canUseUniqueRarity(slotType)).toBe(getUniqueEquipOptions(slotType).length > 0)
        }
        expect(getUniqueEquipOptions(10)).toHaveLength(0)
        expect(getUniqueEquipOptions(11)).toHaveLength(0)
        expect(canUseUniqueRarity(10)).toBe(false)
        expect(canUseUniqueRarity(11)).toBe(false)
    })

    it("Plan 2 池仅含槽位淬炼池内的随机词缀，排除宝石 / 专属 / Plan 1/3 / 无池词缀", () => {
        const pool = getRandomAffixPool(1)
        expect(pool.length).toBeGreaterThan(0)
        const gemAffixIds = new Set(inlays.flatMap(inlay => Object.keys(inlay.affixIdsBySlot).map(Number)))
        const uniqueAffixIds = new Set(uniqueEquips.map(equip => equip.affixId))
        for (const affix of pool) {
            expect(affix.plan).toBe(2)
            expect([202, 203, 204]).toContain(affix.pool)
            expect(gemAffixIds.has(affix.id)).toBe(false)
            expect(uniqueAffixIds.has(affix.id)).toBe(false)
        }
        expect(pool.some(affix => affix.id === 1030 || affix.id === 1031)).toBe(false)
        expect(pool.some(affix => affix.plan !== 2)).toBe(false)
    })

    it("辅助槽型使用 211 池", () => {
        const pool = getRandomAffixPool(8)
        expect(pool.length).toBeGreaterThan(0)
        expect(pool.every(affix => affix.pool === 211)).toBe(true)
    })

    it("无池随机词条按显式 slotTypes 进入候选：1030 靴子 / 项链 / 戒指，1031 只戒指，且不进淬炼池", () => {
        const seasonSlots = [4, 6, 7]
        for (const slot of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
            const ids = getGearRandomAffixPool(slot).map(affix => affix.id)
            expect(ids.includes(1030), `槽型 ${slot}`).toBe(seasonSlots.includes(slot))
            expect(ids.includes(1031), `槽型 ${slot}`).toBe(slot === 7)
            const temperIds = getGearTemperingAffixPool(slot).map(affix => affix.id)
            expect(temperIds, `槽型 ${slot}`).not.toContain(1030)
            expect(temperIds, `槽型 ${slot}`).not.toContain(1031)
            // Plan 2 语义的旧池（附魔 / 洗练池展示）仍不含无池词条
            expect(
                getRandomAffixPool(slot).some(affix => affix.id === 1030 || affix.id === 1031),
                `槽型 ${slot}`
            ).toBe(false)
        }
        const byId = (id: number) => affixes.find(affix => affix.id === id)!
        const draft = (slotType: number, ids: number[]) => ({
            rarityId: 5,
            equipBaseScore: 50,
            iconId: getBaseNameOptions(slotType)[0].id,
            randomAffixes: ids.map(affixId => createAffixRoll(byId(affixId), "random", 50)),
        })
        for (const slot of seasonSlots) expect(isGearDraftValid(slot, draft(slot, [1030]))).toBe(true)
        expect(isGearDraftValid(7, draft(7, [1031]))).toBe(true)
        for (const slot of [4, 6]) {
            expect(isGearDraftValid(slot, draft(slot, [1031]))).toBe(false)
            expect(isGearDraftValid(slot, draft(slot, [1031]), 0, { allowOutOfPool: true })).toBe(false)
        }
        for (const slot of [1, 3, 9, 11]) {
            expect(isGearDraftValid(slot, draft(slot, [1030]))).toBe(false)
            expect(isGearDraftValid(slot, draft(slot, [1031]))).toBe(false)
            expect(isGearDraftValid(slot, draft(slot, [1031]), 0, { allowOutOfPool: true })).toBe(false)
        }
    })

    it("随机候选池按 slotTypes 追加技能等级词条：只进各自部位", () => {
        const poolOf = (slot: number) => getGearRandomAffixPool(slot).map(affix => affix.id)
        expect(poolOf(3)).toContain(1038)
        expect(poolOf(3)).not.toContain(1510)
        expect(poolOf(3)).not.toContain(1511)
        expect(poolOf(3)).not.toContain(1512)
        expect(poolOf(5)).toContain(1039)
        expect(poolOf(6)).toContain(1040)
        expect(poolOf(8)).toContain(1510)
        expect(poolOf(9)).toContain(1511)
        expect(poolOf(10)).toContain(1512)
        expect(poolOf(1)).not.toContain(1038)
        // 槽型 11（纹饰）无技能等级词条：六条均不出现
        const slot11 = poolOf(11)
        for (const id of [1038, 1039, 1040, 1510, 1511, 1512]) {
            expect(slot11).not.toContain(id)
        }
        // 跨部位负例（正例见上）
        expect(poolOf(5)).not.toContain(1040)
        expect(poolOf(6)).not.toContain(1039)
        expect(poolOf(8)).not.toContain(1511)
        expect(poolOf(9)).not.toContain(1512)
        // 主候选全部是 Plan 2 或命中该槽型的显式 Plan 3
        const assistPool = getGearRandomAffixPool(9)
        expect(assistPool.some(affix => affix.id === 1039)).toBe(false)
        expect(assistPool.every(affix => affix.plan === 2 || affix.slotTypes?.includes(9))).toBe(true)
        // Plan 2 语义的旧池不变（附魔 / 洗练池展示仍用它）
        expect(getRandomAffixPool(9).some(affix => affix.id === 1511)).toBe(false)
        expect(getRandomAffixPool(3).some(affix => affix.id === 1038)).toBe(false)
    })

    it("草稿校验：技能等级词条只接受各自部位", () => {
        const byId = (id: number) => affixes.find(affix => affix.id === id)!
        const draft = (slotType: number, ids: number[]) => ({
            rarityId: 5,
            equipBaseScore: 50,
            iconId: getBaseNameOptions(slotType)[0].id,
            randomAffixes: ids.map(affixId => createAffixRoll(byId(affixId), "random", 50)),
        })
        expect(isGearDraftValid(3, draft(3, [1038]))).toBe(true)
        expect(isGearDraftValid(5, draft(5, [1039]))).toBe(true)
        expect(isGearDraftValid(6, draft(6, [1040]))).toBe(true)
        expect(isGearDraftValid(8, draft(8, [1510]))).toBe(true)
        expect(isGearDraftValid(9, draft(9, [1511]))).toBe(true)
        expect(isGearDraftValid(10, draft(10, [1512]))).toBe(true)
        expect(isGearDraftValid(3, draft(3, [1511]))).toBe(false)
        expect(isGearDraftValid(8, draft(8, [1511]))).toBe(false)
        expect(isGearDraftValid(6, draft(6, [1512]))).toBe(false)
        // allowOutOfPool 不放宽 Plan 3 归属：错部位仍被拒
        expect(isGearDraftValid(9, draft(9, [1511]), 0, { allowOutOfPool: true })).toBe(true)
        expect(isGearDraftValid(3, draft(3, [1511]), 0, { allowOutOfPool: true })).toBe(false)
        expect(isGearDraftValid(3, draft(3, [1039]))).toBe(false)
        expect(isGearDraftValid(1, draft(1, [1039]), 0, { allowOutOfPool: true })).toBe(false)
        // 槽型 11（纹饰）无技能等级词条：无法落草稿，allowOutOfPool 也不越权
        expect(isGearDraftValid(11, draft(11, [1512]))).toBe(false)
        expect(isGearDraftValid(11, draft(11, [1512]), 0, { allowOutOfPool: true })).toBe(false)
    })

    it("buildGearItem 往返保留 Plan 3 技能等级词条与太古", () => {
        const built = buildGearItem(10, {
            rarityId: 5,
            equipBaseScore: 50,
            iconId: getBaseNameOptions(10)[0].id,
            randomAffixes: [{ affixId: 1511, rollLevel: 5, masterworkLevel: 0, ancient: true, finalMasterwork: false, source: "random" }],
            seasonId: getCurrentSeasonId(),
        })
        const normalized = normalizeGearItem(JSON.parse(JSON.stringify(built)))
        expect(normalized?.affixes.find(item => item.affixId === 1511)).toMatchObject({
            rollLevel: 5,
            ancient: true,
            source: "random",
        })
    })

    it("随机词缀：重复 / 满额 / 排斥（双向）", () => {
        const affix1024 = affixes.find(affix => affix.id === 1024)!
        const affix1025 = affixes.find(affix => affix.id === 1025)!
        expect(getRandomAffixState(affix1024, [], 4)).toBe("available")
        expect(getRandomAffixState(affix1024, [1024], 4)).toBe("selected")
        expect(getRandomAffixState(affix1024, [], 0)).toBe("full")
        expect(getRandomAffixState(affix1025, [1024], 4)).toBe("excluded")
        expect(getRandomAffixState(affix1024, [1025], 4)).toBe("excluded")
        expect(getRandomAffixState(affix1024, [1024, 1025, 1026, 1027], 4)).toBe("selected")
    })

    it("roll 范围随强度：Plan 2 = 10p-9..10p，Plan 1 = p，Plan 4 = 1", () => {
        expect(getPlanRollRange(1, 2)).toEqual({ min: 1, max: 10 })
        expect(getPlanRollRange(10, 2)).toEqual({ min: 91, max: 100 })
        expect(getPlanRollRange(50, 2)).toEqual({ min: 491, max: 500 })
        expect(getPlanRollRange(37, 1)).toEqual({ min: 37, max: 37 })
        expect(getPlanRollRange(50, 4)).toEqual({ min: 1, max: 1 })
        expect(getAffixRollRange(affixes.find(affix => affix.id === 1024)!, 10)).toEqual({ min: 91, max: 100 })
    })

    it("强度变化钳制随机词缀 roll 并同步基础词条档位", () => {
        const next = applyStrengthToAffixes(
            [
                { affixId: 102, rollLevel: 1, masterworkLevel: 0, ancient: false, finalMasterwork: false, source: "base" },
                { affixId: 1024, rollLevel: 500, masterworkLevel: 0, ancient: false, finalMasterwork: false, source: "random" },
            ],
            1,
            10
        )
        expect(next.find(roll => roll.affixId === 102)?.rollLevel).toBe(10)
        expect(next.find(roll => roll.affixId === 1024)?.rollLevel).toBe(100)
    })
})

describe("新建物品组装", () => {
    it("普通装备：基础词条自动加入（roll=强度、不可太古）；名称 / 图标 / 赛季 / 快照齐全", () => {
        const baseName = getBaseNameOptions(1)[0]
        const built = buildGearItem(1, {
            rarityId: 5,
            equipBaseScore: 37,
            iconId: baseName.id,
            randomAffixes: [{ affixId: 1024, rollLevel: 370, masterworkLevel: 0, ancient: true, finalMasterwork: false }],
        })
        expect(built.kind).toBe("normal")
        expect(built.rarityId).toBe(5)
        expect(built.equipBaseScore).toBe(37)
        expect(built.iconId).toBe(baseName.id)
        expect(built.nameId).toBe(getNamePrefix(1)?.id)
        expect(built.seasonId).toBe(getCurrentSeasonId())
        expect(built.nameSnapshot).toBe(`${getNamePrefix(1)?.name ?? ""}${baseName.name}`)
        const base = built.affixes.find(roll => roll.affixId === getBaseAffix(1)!.id)!
        expect(base).toMatchObject({ rollLevel: 37, ancient: false, source: "base" })
        const random = built.affixes.find(roll => roll.affixId === 1024)!
        expect(random).toMatchObject({ rollLevel: 370, ancient: true, source: "random" })
    })

    it("金色 5 品：基础 1 条 + 随机 4 条全部保留（普通词缀上限 5 条）", () => {
        const pool = getRandomAffixPool(1)
            .filter(affix => affix.pool === 204)
            .slice(0, 4)
        const built = buildGearItem(1, {
            rarityId: 5,
            equipBaseScore: 50,
            iconId: getBaseNameOptions(1)[0].id,
            randomAffixes: pool.map(affix => ({
                affixId: affix.id,
                rollLevel: 500,
                masterworkLevel: 0,
                ancient: false,
                finalMasterwork: false,
            })),
        })
        expect(built.affixes).toHaveLength(5)
        expect(built.affixes.filter(roll => roll.source === "base")).toHaveLength(1)
        expect(built.affixes.filter(roll => roll.source === "random")).toHaveLength(4)
        expect(getItemAffixCounts(built)).toEqual({ base: 1, random: 4, unique: 0 })
    })

    it("暗金：专属词条自动取 uniqueId 的 affixId，固定 1 档 / 不可太古", () => {
        const equip = uniqueEquips.find(entry => entry.slot === 1)!
        const built = buildGearItem(1, { rarityId: 10, equipBaseScore: 50, uniqueId: equip.id, randomAffixes: [] })
        expect(built.kind).toBe("unique")
        expect(built.uniqueId).toBe(equip.id)
        expect(built.uniqueAffix).toMatchObject({ affixId: equip.affixId, rollLevel: 1, ancient: false, source: "unique" })
        expect(built.nameSnapshot).toBe(equip.name)
        expect(built.iconSnapshot).toBe(equip.icon)
    })

    it("唯一装目录 32 件、32 个唯一 affixId（1.8 前遗留行已过滤）", () => {
        expect(uniqueEquips).toHaveLength(32)
        expect(new Set(uniqueEquips.map(entry => entry.affixId)).size).toBe(32)
        expect(uniqueEquips.every(entry => entry.id >= 100000)).toBe(true)
    })

    it("遗留唯一装 id（1.8 前目录已移除）回退名称 / 图标快照", () => {
        const legacy = item({
            kind: "unique",
            slotType: 1,
            uniqueId: 1001,
            nameSnapshot: "泽被万物护符",
            iconSnapshot: "T_BreakRes_Wind02",
            uniqueAffix: { affixId: 2001, rollLevel: 1, masterworkLevel: 0, ancient: false, finalMasterwork: false, source: "unique" },
        })
        expect(getGearDisplayName(legacy, identity, "zh-CN")).toBe("泽被万物护符")
        expect(getGearIconSrc(legacy)).toBe("/imgs/res/T_BreakRes_Wind02.webp")
    })

    it("未知词缀（编辑旧物品）以 unknown 来源保留，不静默丢弃", () => {
        const built = buildGearItem(1, {
            rarityId: 1,
            equipBaseScore: 10,
            randomAffixes: [{ affixId: 999999, rollLevel: 4, masterworkLevel: 2, ancient: true, finalMasterwork: false }],
        })
        expect(built.affixes.find(roll => roll.affixId === 999999)).toMatchObject({
            rollLevel: 4,
            masterworkLevel: 2,
            source: "unknown",
        })
    })

    it("精锻是装备级：草稿等级统一写入 craft 与全部词条，满级才保留最终目标", () => {
        const random = { affixId: 1024, rollLevel: 500, masterworkLevel: 0, ancient: false, finalMasterwork: true }
        const mid = buildGearItem(1, {
            rarityId: 5,
            equipBaseScore: 50,
            iconId: getBaseNameOptions(1)[0].id,
            masterworkLevel: 5,
            randomAffixes: [random],
        })
        expect(mid.craft?.masterworkLevel).toBe(5)
        expect(mid.craft?.finalMasterworkAffixIndex).toBeUndefined()
        expect(mid.affixes.every(roll => roll.masterworkLevel === 5)).toBe(true)
        expect(mid.affixes.every(roll => roll.finalMasterwork === false)).toBe(true)

        const max = buildGearItem(1, {
            rarityId: 5,
            equipBaseScore: 50,
            iconId: getBaseNameOptions(1)[0].id,
            masterworkLevel: 10,
            randomAffixes: [random],
        })
        expect(max.craft?.masterworkLevel).toBe(10)
        expect(max.affixes[max.craft!.finalMasterworkAffixIndex!].affixId).toBe(1024)
        expect(max.affixes.filter(roll => roll.finalMasterwork)).toHaveLength(1)
    })

    it("淬炼词条由草稿组装：来源标记与 craft 下标一致", () => {
        const built = buildGearItem(1, {
            rarityId: 5,
            equipBaseScore: 50,
            iconId: getBaseNameOptions(1)[0].id,
            randomAffixes: [{ affixId: 1024, rollLevel: 500, masterworkLevel: 0, ancient: false, finalMasterwork: false }],
            temperingAffix: { affixId: 1002, rollLevel: 500, masterworkLevel: 0, ancient: false, finalMasterwork: false },
        })
        expect(built.affixes).toHaveLength(3)
        expect(built.affixes[built.craft!.temperingAffixIndex!]).toMatchObject({ affixId: 1002, source: "tempering" })
        expect(built.craft?.temperingCount).toBe(0)
        expect(built.craft?.enchantCount).toBe(0)
    })

    it("最终精锻目标按 craft 规则层过滤：基础词条 / 无 MaxAffixUpdateFunc 的词条不生效", () => {
        const iconId = getBaseNameOptions(1)[0].id
        const baseOnly = buildGearItem(1, {
            rarityId: 5,
            equipBaseScore: 50,
            iconId,
            masterworkLevel: 10,
            randomAffixes: [{ affixId: getBaseAffix(1)!.id, rollLevel: 50, masterworkLevel: 0, ancient: false, finalMasterwork: true }],
        })
        // 基础词条重复被跳过；自动加入的基础词条永远不是最终目标
        expect(baseOnly.affixes.map(roll => roll.affixId)).toEqual([getBaseAffix(1)!.id])
        expect(baseOnly.craft?.finalMasterworkAffixIndex).toBeUndefined()
        expect(baseOnly.affixes.some(roll => roll.finalMasterwork)).toBe(false)

        const noMax = buildGearItem(1, {
            rarityId: 5,
            equipBaseScore: 50,
            iconId,
            masterworkLevel: 10,
            randomAffixes: [
                { affixId: 2001, rollLevel: 1, masterworkLevel: 0, ancient: false, finalMasterwork: true },
                { affixId: 1024, rollLevel: 500, masterworkLevel: 0, ancient: false, finalMasterwork: true },
            ],
        })
        expect(noMax.craft?.finalMasterworkAffixIndex).toBe(noMax.affixes.findIndex(roll => roll.affixId === 1024))
        expect(noMax.affixes.filter(roll => roll.finalMasterwork)).toHaveLength(1)
    })

    it("淬炼草稿词条按 craft 规则层过滤：池外词条不写入", () => {
        const draft = {
            rarityId: 5,
            equipBaseScore: 50,
            iconId: getBaseNameOptions(1)[0].id,
            randomAffixes: [],
        }
        const ignored = buildGearItem(1, {
            ...draft,
            temperingAffix: { affixId: 1001, rollLevel: 500, masterworkLevel: 0, ancient: false, finalMasterwork: false },
        })
        expect(ignored.affixes.some(roll => roll.source === "tempering")).toBe(false)
        expect(ignored.craft?.temperingAffixIndex).toBeUndefined()

        const kept = buildGearItem(1, {
            ...draft,
            temperingAffix: { affixId: 1002, rollLevel: 500, masterworkLevel: 0, ancient: false, finalMasterwork: false },
        })
        expect(kept.affixes[kept.craft!.temperingAffixIndex!].affixId).toBe(1002)
    })

    it("craft 状态由草稿保留：淬炼 / 附魔来源、次数与显式最终目标都写入 item", () => {
        const craftRoll = (affixId: number, source: "random" | "tempering" | "enchant") => ({
            affixId,
            rollLevel: 500,
            masterworkLevel: 0,
            ancient: false,
            finalMasterwork: false,
            source,
        })
        const built = buildGearItem(1, {
            rarityId: 5,
            equipBaseScore: 50,
            iconId: getBaseNameOptions(1)[0].id,
            masterworkLevel: 10,
            finalMasterworkAffixId: 1024,
            temperingCount: 3,
            enchantCount: 2,
            randomAffixes: [craftRoll(1024, "random"), craftRoll(1012, "tempering"), craftRoll(1013, "enchant")],
        })
        expect(built.craft).toMatchObject({ masterworkLevel: 10, temperingCount: 3, enchantCount: 2 })
        expect(built.affixes[built.craft!.finalMasterworkAffixIndex!].affixId).toBe(1024)
        expect(built.affixes[built.craft!.temperingAffixIndex!]).toMatchObject({ affixId: 1012, source: "tempering" })
        expect(built.affixes[built.craft!.enchantAffixIndex!]).toMatchObject({ affixId: 1013, source: "enchant" })
        // 显式目标不可承载（基础 / 专属）时清空，不回退到其它词条
        const invalid = buildGearItem(1, {
            rarityId: 5,
            equipBaseScore: 50,
            iconId: getBaseNameOptions(1)[0].id,
            masterworkLevel: 10,
            finalMasterworkAffixId: getBaseAffix(1)!.id,
            randomAffixes: [craftRoll(1024, "random")],
        })
        expect(invalid.craft?.finalMasterworkAffixIndex).toBeUndefined()
    })

    it("附魔占随机名额：3 随机 + 附魔可提交，满 4 后不可再加随机", () => {
        const craftRoll = (affixId: number, source: "random" | "tempering" | "enchant") => ({
            affixId,
            rollLevel: 500,
            masterworkLevel: 0,
            ancient: false,
            finalMasterwork: false,
            source,
        })
        const iconId = getBaseNameOptions(1)[0].id
        const threePlusEnchant: TranscendGearDraft = {
            rarityId: 5,
            equipBaseScore: 50,
            iconId,
            randomAffixes: [craftRoll(1002, "random"), craftRoll(1003, "random"), craftRoll(1004, "random"), craftRoll(1013, "enchant")],
        }
        expect(isGearDraftValid(1, threePlusEnchant)).toBe(true)
        const built = buildGearItem(1, threePlusEnchant)
        expect(built.affixes.filter(roll => roll.source === "enchant")).toHaveLength(1)

        // 附魔占掉一个名额：再加一条随机（4 随机 + 1 附魔）即超出上限，应判非法
        const overLimit: TranscendGearDraft = {
            ...threePlusEnchant,
            randomAffixes: [...threePlusEnchant.randomAffixes, craftRoll(1024, "random")],
        }
        expect(isGearDraftValid(1, overLimit)).toBe(false)
        expect(
            isGearDraftValid(1, {
                ...threePlusEnchant,
                randomAffixes: [...threePlusEnchant.randomAffixes.slice(0, 3), craftRoll(1024, "random")],
            })
        ).toBe(true)
        // 4 随机 + 附魔（无第三条随机名额）同样非法
        expect(
            isGearDraftValid(1, {
                rarityId: 5,
                equipBaseScore: 50,
                iconId,
                randomAffixes: [
                    craftRoll(1002, "random"),
                    craftRoll(1003, "random"),
                    craftRoll(1004, "random"),
                    craftRoll(1024, "random"),
                    craftRoll(1013, "enchant"),
                ],
            })
        ).toBe(false)
    })

    it("草稿组装：随机 + 淬炼同 id 两行共存，随机之间同 id 仍拒绝", () => {
        const iconId = getBaseNameOptions(1)[0].id
        const craftRoll = (affixId: number, source: "random" | "tempering") => ({
            affixId,
            rollLevel: 500,
            masterworkLevel: 0,
            ancient: false,
            finalMasterwork: false,
            source,
        })
        const twin: TranscendGearDraft = {
            rarityId: 5,
            equipBaseScore: 50,
            iconId,
            randomAffixes: [craftRoll(1002, "random"), craftRoll(1002, "tempering")],
        }
        expect(isGearDraftValid(1, twin)).toBe(true)
        const built = buildGearItem(1, twin)
        expect(built.affixes.map(entry => [entry.affixId, entry.source])).toEqual([
            [102, "base"],
            [1002, "random"],
            [1002, "tempering"],
        ])
        expect(built.craft?.temperingAffixIndex).toBe(2)
        expect(normalizeGearItem(built)).toEqual(built)

        // 随机词条之间的同 id 重复不在本裁定内：校验层仍拒绝，组装层仍跳过
        const duplicated: TranscendGearDraft = {
            rarityId: 5,
            equipBaseScore: 50,
            iconId,
            randomAffixes: [craftRoll(1002, "random"), craftRoll(1002, "random")],
        }
        expect(isGearDraftValid(1, duplicated)).toBe(false)
        expect(buildGearItem(1, duplicated).affixes.filter(entry => entry.affixId === 1002)).toHaveLength(1)
    })

    it("用户截图夹具走 buildGearItem：基础生命 + 随机防御/生命 + 淬炼生命 + 专属，4 词条 + 专属共 5 行", () => {
        const craftRoll = (affixId: number, source: "random" | "tempering") => ({
            affixId,
            rollLevel: 500,
            masterworkLevel: 0,
            ancient: false,
            finalMasterwork: false,
            source,
        })
        const built = buildGearItem(9, {
            rarityId: 10,
            equipBaseScore: 50,
            uniqueId: 210001,
            randomAffixes: [craftRoll(1501, "random"), craftRoll(1502, "random"), craftRoll(1502, "tempering")],
        })
        expect(built.affixes.map(entry => [entry.affixId, entry.source])).toEqual([
            [108, "base"],
            [1501, "random"],
            [1502, "random"],
            [1502, "tempering"],
        ])
        expect(built.craft?.temperingAffixIndex).toBe(3)
        expect(built.uniqueAffix?.affixId).toBe(240101)
        expect(built.rarityId).toBe(10)
        expect(normalizeGearItem(built)).toEqual(built)
    })

    it("草稿校验：两条不同 id 的淬炼行拒绝（单件最多 1 条淬炼）", () => {
        const iconId = getBaseNameOptions(1)[0].id
        const craftRoll = (affixId: number) => ({
            affixId,
            rollLevel: 500,
            masterworkLevel: 0,
            ancient: false,
            finalMasterwork: false,
            source: "tempering" as const,
        })
        const draft: TranscendGearDraft = {
            rarityId: 5,
            equipBaseScore: 50,
            iconId,
            randomAffixes: [craftRoll(1002), craftRoll(1003)],
        }
        expect(isGearDraftValid(1, draft)).toBe(false)
    })

    it("淬炼不占随机名额：4 随机 + 淬炼 + 基础恰好 6 条，归一化不丢词条/次数", () => {
        const craftRoll = (affixId: number, source: "random" | "tempering") => ({
            affixId,
            rollLevel: 500,
            masterworkLevel: 0,
            ancient: false,
            finalMasterwork: false,
            source,
        })
        const iconId = getBaseNameOptions(1)[0].id
        const draft: TranscendGearDraft = {
            rarityId: 5,
            equipBaseScore: 50,
            iconId,
            temperingCount: 2,
            randomAffixes: [
                craftRoll(1002, "random"),
                craftRoll(1003, "random"),
                craftRoll(1004, "random"),
                craftRoll(1024, "random"),
                craftRoll(1012, "tempering"),
            ],
        }
        expect(isGearDraftValid(1, draft)).toBe(true)
        const built = buildGearItem(1, draft)
        expect(built.affixes).toHaveLength(6)
        expect(built.craft?.temperingCount).toBe(2)
        expect(built.affixes[built.craft!.temperingAffixIndex!].affixId).toBe(1012)
        // 草稿组装与归一化同口径：不靠归一化截断也能得到同一结果
        expect(normalizeGearItem(built)).toEqual(built)
    })

    it("总词条上限：其它词条硬上限 4 不依赖品质名额，4 其它 + 淬炼 + 基础合法且归一化等价", () => {
        const iconId = getBaseNameOptions(1)[0].id
        const pool = getRandomAffixPool(1)
        const byId = (id: number) => pool.find(affix => affix.id === id)!
        // 注入合成品质（随机名额 7）验证「其它 4 条」硬上限优先于数据 minAffixCount
        const index = rarities.findIndex(rarity => rarity.id === 5)
        const original = rarities[index]
        const synthetic = { ...original, minAffixCount: [7] } as DnaSeasonRarity
        rarities.splice(index, 1, synthetic)
        try {
            const four = [1002, 1003, 1004, 1061].map(id => createAffixRoll(byId(id), "random", 50))
            const five = [...four, createAffixRoll(byId(1041), "random", 50)]
            const tempering = createAffixRoll(byId(1012), "tempering", 50)
            const draft = (randomAffixes: TranscendGearAffixRoll[]): TranscendGearDraft => ({
                rarityId: 5,
                equipBaseScore: 50,
                iconId,
                randomAffixes,
            })
            // 基础 1 + 其它 4 + 淬炼 1 = 6：合法，且归一化不丢词条
            const legalDraft = draft([...four, tempering])
            expect(isGearDraftValid(1, legalDraft)).toBe(true)
            const built = buildGearItem(1, legalDraft)
            expect(built.affixes).toHaveLength(6)
            expect(normalizeGearItem(built)).toEqual(built)
            // 其它 5 条超过数据层硬上限：即使品质名额 7 也必须非法
            expect(isGearDraftValid(1, draft(five))).toBe(false)
            expect(isGearDraftValid(1, draft([...five, tempering]))).toBe(false)
        } finally {
            rarities.splice(index, 1, original)
        }
    })

    it("合法全量 craft 草稿：buildGearItem 是归一化不动点（顺序 / 目标 / 次数一致）", () => {
        const iconId = getBaseNameOptions(1)[0].id
        const craftRoll = (affixId: number, source: "random" | "tempering" | "enchant", ancient = false) => ({
            affixId,
            rollLevel: 500,
            masterworkLevel: 0,
            ancient,
            finalMasterwork: false,
            source,
        })
        const draft: TranscendGearDraft = {
            rarityId: 5,
            equipBaseScore: 50,
            iconId,
            masterworkLevel: 10,
            finalMasterworkAffixId: 1024,
            temperingCount: 3,
            enchantCount: 2,
            randomAffixes: [
                craftRoll(1024, "random", true),
                craftRoll(1002, "random"),
                craftRoll(1003, "random"),
                craftRoll(1012, "tempering"),
                craftRoll(1013, "enchant"),
            ],
        }
        expect(isGearDraftValid(1, draft)).toBe(true)
        const built = buildGearItem(1, draft)
        expect(built.affixes.map(roll => roll.affixId)).toEqual([102, 1024, 1002, 1003, 1012, 1013])
        expect(built.craft).toMatchObject({ masterworkLevel: 10, temperingCount: 3, enchantCount: 2 })
        expect(built.affixes[built.craft!.finalMasterworkAffixIndex!].affixId).toBe(1024)
        expect(normalizeGearItem(built)).toEqual(built)
    })

    it("编辑保存保留未知最终目标：preserveUnknown 下组装不清空，默认口径仍拒绝", () => {
        const iconId = getBaseNameOptions(1)[0].id
        const roll = (affixId: number, patch: Partial<TranscendGearAffixRoll> = {}): TranscendGearAffixRoll => ({
            affixId,
            rollLevel: 500,
            masterworkLevel: 10,
            ancient: false,
            finalMasterwork: false,
            ...patch,
        })
        const inventory = normalizeGearItem(
            {
                kind: "normal",
                slotType: 1,
                rarityId: 5,
                equipBaseScore: 50,
                iconId,
                affixes: [
                    roll(getBaseAffix(1)!.id, { rollLevel: 50, source: "base" }),
                    roll(1024, { source: "random" }),
                    roll(999999, { source: "unknown", finalMasterwork: true }),
                ],
                craft: { masterworkLevel: 10, finalMasterworkAffixIndex: 2 },
            },
            undefined,
            { preserveUnknown: true }
        )!
        expect(inventory.craft?.finalMasterworkAffixIndex).toBe(2)

        // 与 TranscendGearCreate 编辑路径同口径：初值按 preserveUnknown 读 craft，再按 affixId 组草稿
        const state = getGearCraftState(inventory, undefined, { preserveUnknown: true })
        const baseAffixId = getBaseAffix(1)!.id
        const draft: TranscendGearDraft = {
            rarityId: inventory.rarityId ?? 0,
            equipBaseScore: inventory.equipBaseScore ?? 0,
            iconId: inventory.iconId,
            randomAffixes: inventory.affixes.filter(item => item.affixId !== baseAffixId).map(item => ({ ...item })),
            masterworkLevel: state.masterworkLevel,
            finalMasterworkAffixId: inventory.affixes[state.finalMasterworkAffixIndex!].affixId,
            temperingCount: state.temperingCount,
            enchantCount: state.enchantCount,
        }
        const saved = buildGearItem(1, draft, { preserveUnknown: true })
        const savedIndex = saved.craft?.finalMasterworkAffixIndex
        expect(savedIndex).toBeDefined()
        expect(saved.affixes[savedIndex!].affixId).toBe(999999)
        // 不改动保存 → 库存写入归一化后仍保留未知最终目标，且与组装结果完全等价（未知词条不丢）
        const roundTrip = normalizeGearItem(saved, undefined, { preserveUnknown: true })!
        expect(roundTrip.craft?.finalMasterworkAffixIndex).toBe(savedIndex)
        expect(roundTrip.affixes.filter(item => item.finalMasterwork)).toHaveLength(1)
        expect(roundTrip).toEqual(saved)

        // 新建 / 非库存默认口径不认识未知词条：最终目标被清空
        const strict = buildGearItem(1, draft)
        expect(strict.craft?.finalMasterworkAffixIndex).toBeUndefined()
        expect(strict.affixes.some(item => item.finalMasterwork)).toBe(false)

        // 已知目标路径不回退
        const known = buildGearItem(1, { ...draft, finalMasterworkAffixId: 1024 }, { preserveUnknown: true })
        expect(known.affixes[known.craft!.finalMasterworkAffixIndex!].affixId).toBe(1024)
    })

    it("目标清除时次数归零（草稿路径）", () => {
        const iconId = getBaseNameOptions(1)[0].id
        const randomRoll = (affixId: number) => ({
            affixId,
            rollLevel: 500,
            masterworkLevel: 0,
            ancient: false,
            finalMasterwork: false,
            source: "random" as const,
        })
        const enchantRoll = { ...randomRoll(1013), source: "enchant" as const }
        const base = { rarityId: 5, equipBaseScore: 50, iconId } as const
        const withEnchant = buildGearItem(1, {
            ...base,
            randomAffixes: [randomRoll(1002), randomRoll(1003), randomRoll(1004), enchantRoll],
            temperingCount: 3,
            enchantCount: 2,
        })
        expect(withEnchant.craft?.temperingCount).toBe(0)
        expect(withEnchant.craft?.enchantCount).toBe(2)

        const withoutTargets = buildGearItem(1, {
            ...base,
            randomAffixes: [randomRoll(1002), randomRoll(1003), randomRoll(1004)],
            temperingCount: 3,
            enchantCount: 2,
        })
        expect(withoutTargets.craft?.temperingCount).toBe(0)
        expect(withoutTargets.craft?.enchantCount).toBe(0)

        // 精锻未满级时最终目标不成立
        const below = buildGearItem(1, {
            ...base,
            masterworkLevel: 9,
            finalMasterworkAffixId: 1002,
            randomAffixes: [randomRoll(1002), randomRoll(1003), randomRoll(1004)],
        })
        expect(below.craft?.finalMasterworkAffixIndex).toBeUndefined()
        expect(below.affixes.some(item => item.finalMasterwork)).toBe(false)
    })

    it("入库失败回退只返回归一化物品：无法归一化时为 null，不回退原始物品", () => {
        const valid = buildQuickGearItem(1)!
        expect(normalizeGearForEquipFallback(valid)).toEqual(normalizeGearItem(valid, undefined, { preserveUnknown: true }))
        // 槽型非法 → 归一化失败必须返回 null（Picker 不得装备未归一化原物品）
        const broken = { ...valid, slotType: 999 } as TranscendGearItemConfig
        expect(normalizeGearForEquipFallback(broken)).toBeNull()
    })

    it("强度变化保留淬炼 / 附魔来源并按槽位档位钳制", () => {
        const rolls = applyStrengthToAffixes(
            [
                { affixId: 102, rollLevel: 50, masterworkLevel: 0, ancient: false, finalMasterwork: false, source: "base" },
                { affixId: 1012, rollLevel: 500, masterworkLevel: 0, ancient: false, finalMasterwork: false, source: "tempering" },
                { affixId: 1013, rollLevel: 500, masterworkLevel: 0, ancient: false, finalMasterwork: false, source: "enchant" },
                { affixId: 1024, rollLevel: 500, masterworkLevel: 0, ancient: false, finalMasterwork: false, source: "random" },
            ],
            1,
            20
        )
        expect(rolls.find(roll => roll.affixId === 1012)).toMatchObject({ source: "tempering", rollLevel: 200 })
        expect(rolls.find(roll => roll.affixId === 1013)).toMatchObject({ source: "enchant", rollLevel: 200 })
        expect(rolls.find(roll => roll.affixId === 1024)).toMatchObject({ source: "random", rollLevel: 200 })
    })

    it("新建 craft 状态进入装备短码并可无损往返", () => {
        const iconId = getBaseNameOptions(1)[0].id
        const gemId = inlays.find(inlay => resolveInlayAffixId(inlay.id, 1) !== null)!.id
        const built = buildGearItem(1, {
            rarityId: 5,
            equipBaseScore: 50,
            iconId,
            masterworkLevel: 10,
            finalMasterworkAffixId: 1024,
            temperingCount: 2,
            enchantCount: 1,
            randomAffixes: [
                { affixId: 1024, rollLevel: 500, masterworkLevel: 0, ancient: false, finalMasterwork: false, source: "random" },
                { affixId: 1012, rollLevel: 500, masterworkLevel: 0, ancient: false, finalMasterwork: false, source: "tempering" },
                { affixId: 1013, rollLevel: 500, masterworkLevel: 0, ancient: false, finalMasterwork: false, source: "enchant" },
            ],
            socketCount: 1,
            sockets: [{ socketIndex: 0, gemId }],
        })
        const code = encodeTranscendGearCode([{ slotId: 1, item: built }], [])
        const decoded = decodeTranscendGearCode(code)
        const entry = decoded.mainGear[0]
        expect("item" in entry).toBe(true)
        const roundTrip = (entry as { item: TranscendGearItemConfig }).item
        expect(roundTrip.craft).toMatchObject({ masterworkLevel: 10, temperingCount: 2, enchantCount: 1 })
        expect(roundTrip.affixes[roundTrip.craft!.finalMasterworkAffixIndex!].affixId).toBe(1024)
        expect(roundTrip.affixes[roundTrip.craft!.temperingAffixIndex!].source).toBe("tempering")
        expect(roundTrip.affixes[roundTrip.craft!.enchantAffixIndex!].source).toBe("enchant")
        expect(roundTrip.socketCount).toBe(1)
        expect(roundTrip.sockets?.map(socket => ({ socketIndex: socket.socketIndex, gemId: socket.gemId }))).toEqual([
            { socketIndex: 0, gemId },
        ])
    })

    it("快捷添加：白色品质 + 满强度 + 首个基础名 + 仅基础词条", () => {
        const quick = buildQuickGearItem(1)!
        expect(quick.rarityId).toBe(1)
        expect(quick.equipBaseScore).toBe(50)
        expect(quick.iconId).toBe(getBaseNameOptions(1)[0].id)
        expect(quick.affixes.map(roll => roll.source)).toEqual(["base"])
    })

    it("草稿校验：缺品质 / 缺强度 / 暗金未选均为非法", () => {
        expect(isGearDraftValid(1, { rarityId: 0, equipBaseScore: 50, randomAffixes: [] })).toBe(false)
        expect(isGearDraftValid(1, { rarityId: 1, equipBaseScore: 0, randomAffixes: [] })).toBe(false)
        expect(isGearDraftValid(1, { rarityId: 10, equipBaseScore: 50, randomAffixes: [] })).toBe(false)
        expect(isGearDraftValid(1, { rarityId: 1, equipBaseScore: 50, randomAffixes: [] })).toBe(false)
        expect(isGearDraftValid(1, { rarityId: 6, equipBaseScore: 50, iconId: getBaseNameOptions(1)[0].id, randomAffixes: [] })).toBe(false)
        expect(isGearDraftValid(1, { rarityId: 1, equipBaseScore: 50, iconId: getBaseNameOptions(1)[0].id, randomAffixes: [] })).toBe(true)
        expect(isGearDraftValid(1, { rarityId: 10, equipBaseScore: 50, uniqueId: getUniqueEquipOptions(1)[0].id, randomAffixes: [] })).toBe(
            true
        )
        // 基础名不属于该槽型时也非法
        expect(isGearDraftValid(1, { rarityId: 1, equipBaseScore: 50, iconId: getBaseNameOptions(2)[0].id, randomAffixes: [] })).toBe(false)
    })

    it("草稿校验：角色专属随机词缀按 charId 过滤", () => {
        const charAffix = affixes.find(affix => affix.charIds?.length)
        expect(charAffix).toBeTruthy()
        const allowed = charAffix!.charIds![0]
        const denied = allowed === 1 ? 2 : 1
        expect(isAffixAllowedForChar(charAffix!, allowed)).toBe(true)
        expect(isAffixAllowedForChar(charAffix!, denied)).toBe(false)
        expect(isAffixAllowedForChar(charAffix!, 0)).toBe(true)

        // 当前数据的角色专属词缀都是 Plan 4，构造一条 Plan 2 专属随机词缀验证集成校验
        const poolAffix = getRandomAffixPool(1)[0]
        const synthetic = {
            id: 987654,
            plan: 2,
            pool: poolAffix.pool,
            minValue: 1,
            maxValue: 100,
            totalValueLevel: 100,
            charIds: [allowed],
            addAttrs: [{ attr: "攻击", addType: "Value" }],
        } as DnaSeasonAffix
        affixes.push(synthetic)
        try {
            const draft = {
                rarityId: 5,
                equipBaseScore: 50,
                iconId: getBaseNameOptions(1)[0].id,
                randomAffixes: [createAffixRoll(synthetic, "random", 50)],
            }
            expect(isGearDraftValid(1, draft, allowed)).toBe(true)
            expect(isGearDraftValid(1, draft, denied)).toBe(false)
        } finally {
            affixes.splice(affixes.indexOf(synthetic), 1)
        }
    })

    it("草稿校验：随机词缀条数 / Plan 2 / 池 / 重复 / 排斥 / 未知词条", () => {
        const pool = getRandomAffixPool(1)
        const poolIds = new Set(pool.map(affix => affix.id))
        const iconId = getBaseNameOptions(1)[0].id
        const rolls = (ids: number[]) =>
            ids.map(affixId => {
                const affix = pool.find(item => item.id === affixId) ?? affixes.find(item => item.id === affixId)
                return affix
                    ? createAffixRoll(affix, "random", 50)
                    : { affixId, rollLevel: 1, masterworkLevel: 0, ancient: false, finalMasterwork: false, source: "unknown" as const }
            })
        const draft = (ids: number[]) => ({ rarityId: 5, equipBaseScore: 50, iconId, randomAffixes: rolls(ids) })
        const valid = (ids: number[]) => isGearDraftValid(1, draft(ids))

        const four = pool.slice(0, 4).map(affix => affix.id)
        expect(four).toHaveLength(4)
        expect(valid(four)).toBe(true)
        expect(valid(pool.slice(0, 5).map(affix => affix.id))).toBe(false)
        expect(valid([getBaseAffix(1)!.id])).toBe(false)
        expect(valid([3101])).toBe(false)
        expect(valid([2001])).toBe(false)
        expect(valid([four[0], four[0]])).toBe(false)

        const outOfPool = affixes.find(affix => affix.plan === 2 && !poolIds.has(affix.id))
        expect(outOfPool).toBeTruthy()
        expect(valid([outOfPool!.id])).toBe(false)

        const conflict = affixes
            .flatMap(affix => (affix.exclusionAffixIds ?? []).map(id => [affix.id, id] as const))
            .find(([left, right]) => poolIds.has(left) && poolIds.has(right))
        expect(conflict).toBeTruthy()
        expect(valid([conflict![0], conflict![1]])).toBe(false)

        // 编辑旧物品：未知词条保留，但仍占用条数
        expect(valid([999999, ...pool.slice(0, 3).map(affix => affix.id)])).toBe(true)
        expect(valid([999999, ...pool.slice(0, 4).map(affix => affix.id)])).toBe(false)
    })

    it("草稿校验：allowOutOfPool 仅放宽槽位池，重复 / 超条数仍非法", () => {
        // 背水（1018，pool 201）不在护胸池 [202,203,204]，OCR 导入需要原样保留
        expect(getRandomAffixPool(2).some(affix => affix.id === 1018)).toBe(false)
        const byId = (id: number) => affixes.find(affix => affix.id === id)!
        const roll = (affixId: number) => createAffixRoll(byId(affixId), "random", 50)
        const draft = (ids: number[]) => ({
            rarityId: 5,
            equipBaseScore: 50,
            iconId: getBaseNameOptions(2)[0].id,
            randomAffixes: ids.map(roll),
        })

        expect(isGearDraftValid(2, draft([1018]))).toBe(false)
        expect(isGearDraftValid(2, draft([1018]), 0, { allowOutOfPool: true })).toBe(true)
        // 开关只管池：重复仍然非法
        expect(isGearDraftValid(2, draft([1018, 1018]), 0, { allowOutOfPool: true })).toBe(false)
        // 开关不放开品质名额：4 条池内 + 1 条池外 = 5 > 4
        const fourPool = getRandomAffixPool(2)
            .slice(0, 4)
            .map(affix => affix.id)
        expect(fourPool).toHaveLength(4)
        expect(isGearDraftValid(2, draft([...fourPool, 1018]), 0, { allowOutOfPool: true })).toBe(false)
        // undefined 与原调用方口径一致
        expect(isGearDraftValid(2, draft([1018]), 0, {})).toBe(false)
    })
})

describe("名称与展示", () => {
    it("EN/FR 基础名在前，其余语言前缀在前；前缀译文自带分隔符，不补空格", () => {
        expect(composeGearName("强力", "海蚀头盔", "zh-CN")).toBe("强力海蚀头盔")
        expect(composeGearName(": Powerful", "Tideworn Helm", "en")).toBe("Tideworn Helm: Powerful")
        expect(composeGearName("· Puissance", "Heaume", "fr-FR")).toBe("Heaume· Puissance")
        expect(isReversedGearNameLocale("en-US")).toBe(true)
        expect(isReversedGearNameLocale("fr")).toBe(true)
        expect(isReversedGearNameLocale("ja")).toBe(false)
    })

    it("旧物品缺图标 / 前缀时回退名称快照，不伪造品质 / 强度", () => {
        const legacy = item({ slotType: 1, nameSnapshot: "旧版头盔", iconSnapshot: "T_Season_010101" })
        expect(getGearDisplayName(legacy, identity, "zh-CN")).toBe("旧版头盔")
        expect(getItemAffixLines(legacy)).toEqual([])
        expect(getItemAffixCounts(legacy)).toEqual({ base: 0, random: 0, unique: 0 })
    })

    it("词缀行顺序：基础 → 随机 → 专属；计数正确", () => {
        const equip = uniqueEquips.find(entry => entry.slot === 1)!
        const built = buildGearItem(1, {
            rarityId: 10,
            equipBaseScore: 50,
            uniqueId: equip.id,
            randomAffixes: [{ affixId: 1024, rollLevel: 491, masterworkLevel: 0, ancient: false, finalMasterwork: false }],
        })
        const lines = getItemAffixLines(built, 1)
        expect(lines.map(line => line.source)).toEqual(["base", "random", "unique"])
        expect(getItemAffixCounts(built)).toEqual({ base: 1, random: 1, unique: 1 })
        expect(lines[1].valueText).not.toBe("")
        expect(getItemSearchTokens(built).length).toBeGreaterThan(0)
    })

    it("搜索 token 同时收录原文与逐段译文（非中文界面可按可见词缀搜索）", () => {
        const built = buildGearItem(1, {
            rarityId: 5,
            equipBaseScore: 50,
            iconId: getBaseNameOptions(1)[0].id,
            randomAffixes: [{ affixId: 1024, rollLevel: 500, masterworkLevel: 0, ancient: false, finalMasterwork: false }],
        })
        const line = getItemAffixLines(built).find(entry => entry.roll.affixId === 1024)!
        expect(line.summaryParts.length).toBeGreaterThan(0)
        const tokens = getItemSearchTokens(built, text => (text ? `T:${text}` : ""))
        expect(tokens).toContain(line.summaryParts[0])
        expect(tokens).toContain(`T:${line.summaryParts[0]}`)
    })

    it("太古取词条最大值 × 1.2，roll 不再生效", () => {
        const affix = affixes.find(entry => entry.id === 1024)!
        const normal = resolveAffixValue(affix, {
            slotId: 1,
            affixId: 1024,
            rollLevel: 1,
            masterworkLevel: 0,
            ancient: false,
            finalMasterwork: false,
        })
        const ancient = resolveAffixValue(affix, {
            slotId: 1,
            affixId: 1024,
            rollLevel: 500,
            masterworkLevel: 0,
            ancient: true,
            finalMasterwork: false,
        })
        expect(ancient.final).toBeCloseTo(affix.maxValue * 1.2, 10)
        expect(ancient.final).not.toBe(normal.final)
    })
})

describe("词缀能力与宝石", () => {
    it("宝石 / 专属 / 未知分类由数据引用推导，无养成控件", () => {
        // 宝石词缀按镶嵌引用判定（不维护 affixId 白名单）；展平条目带 gemId
        expect(getAffixDataUiType(3101)).toBe("gem")
        expect(getAffixCapabilities({ affixId: 3101, gemId: 7001101, socketIndex: 0 }).type).toBe("gem")
        expect(getAffixCapabilities({ affixId: 3101, gemId: 7001101, socketIndex: 0 }).editable).toBe(false)
        expect(getAffixCapabilities({ affixId: 2001 }).type).toBe("unique")
        expect(getAffixCapabilities({ affixId: 2001 }).editable).toBe(false)
        expect(getAffixCapabilities({ affixId: 999999 }).type).toBe("unknown")
    })

    it("无成长函数的词条只显示固定值，不出现精锻 / 太古控件", () => {
        const synthetic = {
            id: 999998,
            plan: 2,
            minValue: 1,
            maxValue: 1,
            totalValueLevel: 1,
            addAttrs: [{ attr: "攻击", addType: "Value" }],
        } as never
        const capabilities = getAffixCapabilities({ affixId: 999998 }, synthetic)
        expect(capabilities).toMatchObject({
            roll: false,
            masterwork: false,
            ancient: false,
            finalMasterwork: false,
            editable: false,
            fixed: true,
        })
    })

    it("有太古公式才出现太古能力（全部 Plan 2 均有，Plan 4 均无）", () => {
        const plan2 = affixes.filter(affix => affix.plan === 2)
        expect(plan2.every(affix => getAffixCapabilities({ affixId: affix.id }).ancient === Boolean(affix.ancientFunc))).toBe(true)
        expect(affixes.filter(affix => affix.plan === 4).every(affix => !getAffixCapabilities({ affixId: affix.id }).ancient)).toBe(true)
    })
})

describe("孔位", () => {
    it("孔位上限：1-4 双孔、5-7 单孔、8-11 无孔", () => {
        for (const slotType of [1, 2, 3, 4]) expect(getSlotMaxInlayCount(slotType)).toBe(2)
        for (const slotType of [5, 6, 7]) expect(getSlotMaxInlayCount(slotType)).toBe(1)
        for (const slotType of [8, 9, 10, 11]) expect(getSlotMaxInlayCount(slotType)).toBe(0)
    })

    it("同一宝石按槽型解析不同词缀；拆除后词缀行消失", () => {
        expect(resolveInlayAffixId(7001101, 1)).toBe(3101)
        expect(resolveInlayAffixId(7001101, 2)).toBe(3102)
        expect(resolveInlayAffixId(7001101, 5)).toBe(3103)
        const withGem = item({ slotType: 1, sockets: [{ socketIndex: 0, gemId: 7001101 }] })
        const gemLines = getItemSocketLines(withGem)
        expect(gemLines).toHaveLength(1)
        expect(gemLines[0].affixId).toBe(3101)
        expect(gemLines[0].valueText).not.toBe("")
        const removed = { ...withGem, sockets: undefined }
        expect(getItemSocketLines(removed)).toEqual([])
    })

    it("新建默认 0 孔；草稿低于已镶嵌所需时抬高，超上限钳制", () => {
        const draft = { rarityId: 1, equipBaseScore: 50, iconId: getBaseNameOptions(1)[0].id, randomAffixes: [] }
        expect(buildGearItem(1, draft).socketCount).toBeUndefined()

        const opened = buildGearItem(1, { ...draft, socketCount: 2, sockets: [{ socketIndex: 0, gemId: 7001101 }] })
        expect(opened.socketCount).toBe(2)
        expect(opened.sockets).toEqual([
            { socketIndex: 0, gemId: 7001101, nameSnapshot: expect.any(String), iconSnapshot: expect.any(String) },
        ])

        // 草稿显式 1 孔、但宝石占 1 号孔：抬到 2，不丢宝石（与归一化同口径）
        const raised = buildGearItem(1, { ...draft, socketCount: 1, sockets: [{ socketIndex: 1, gemId: 7001101 }] })
        expect(raised.socketCount).toBe(2)
        expect(raised.sockets).toEqual([
            { socketIndex: 1, gemId: 7001101, nameSnapshot: expect.any(String), iconSnapshot: expect.any(String) },
        ])

        const clamped = buildGearItem(7, { ...draft, socketCount: 2 })
        expect(clamped.socketCount).toBe(1)
    })
})

describe("Plan 3 回退与强度区间", () => {
    it("缺行回退：Plan 3 = [max(1,⌊p/10⌋), min(5,⌊p/10⌋+1)]，p=10/11 与数据行一致", () => {
        expect(getFallbackPlanRollRange(1, 3)).toEqual({ min: 1, max: 1 })
        expect(getFallbackPlanRollRange(9, 3)).toEqual({ min: 1, max: 1 })
        expect(getFallbackPlanRollRange(10, 3)).toEqual({ min: 1, max: 2 })
        expect(getFallbackPlanRollRange(11, 3)).toEqual({ min: 1, max: 2 })
        expect(getFallbackPlanRollRange(19, 3)).toEqual({ min: 1, max: 2 })
        expect(getFallbackPlanRollRange(20, 3)).toEqual({ min: 2, max: 3 })
        expect(getFallbackPlanRollRange(50, 3)).toEqual({ min: 5, max: 5 })
        expect(getFallbackPlanRollRange(50, 4)).toEqual({ min: 1, max: 1 })
        // 回退公式与上游档位表一致
        expect(getPlanRollRange(10, 3, 5)).toEqual(getFallbackPlanRollRange(10, 3))
        expect(getPlanRollRange(11, 3, 5)).toEqual(getFallbackPlanRollRange(11, 3))
        expect(getPlanRollRange(20, 3, 5)).toEqual(getFallbackPlanRollRange(20, 3))
    })

    it("totalValueLevel 截断：total=3 时 p=50 的 Plan 2 钳到 3", () => {
        expect(getPlanRollRange(50, 2, 3)).toEqual({ min: 3, max: 3 })
        const synthetic = { id: 987650, plan: 2, totalValueLevel: 3, minValue: 0, maxValue: 1 } as DnaSeasonAffix
        expect(getAffixRollRange(synthetic, 50)).toEqual({ min: 3, max: 3 })
    })

    it("随机行显示当前强度区间；基础 / 专属 / 太古行不显示", () => {
        const iconId = getBaseNameOptions(1)[0].id
        const roll = (affixId: number, ancient = false) => ({
            affixId,
            rollLevel: 500,
            masterworkLevel: 0,
            ancient,
            finalMasterwork: false,
        })
        const built = buildGearItem(1, {
            rarityId: 5,
            equipBaseScore: 50,
            iconId,
            randomAffixes: [roll(1043), roll(1042, true)],
        })
        const lines = getItemAffixLines(built)
        const randomLine = lines.find(line => line.roll.affixId === 1043)!
        expect(randomLine.rangeText).toBe("[69.5~70.5]%")
        expect(randomLine.rangeText).toBe(getAffixStrengthRangeText(affixes.find(affix => affix.id === 1043)!, 50))
        expect(lines.find(line => line.source === "base")!.rangeText).toBe("")
        expect(lines.find(line => line.roll.affixId === 1042)!.rangeText).toBe("")

        const uniqueEquip = uniqueEquips[0]
        const uniqueItem = buildGearItem(uniqueEquip.slot, {
            rarityId: 10,
            equipBaseScore: 50,
            uniqueId: uniqueEquip.id,
            randomAffixes: [roll(1043)],
        })
        expect(getItemAffixLines(uniqueItem).find(line => line.source === "unique")!.rangeText).toBe("")
        expect(getAffixStrengthRangeText(affixes.find(affix => affix.id === 1043)!, 0)).toBe("")
    })

    it("旧物品缺强度：随机行不显示区间", () => {
        const legacy: TranscendGearItemConfig = {
            kind: "normal",
            slotType: 1,
            affixes: [{ affixId: 1043, rollLevel: 500, masterworkLevel: 0, ancient: false, finalMasterwork: false, source: "random" }],
        }
        expect(getItemAffixLines(legacy).find(line => line.roll.affixId === 1043)!.rangeText).toBe("")
        expect(getAffixStrengthRangeText(affixes.find(affix => affix.id === 1043)!, undefined)).toBe("")
    })

    it("区间格式：非百分比两位小数、负值不带 +、技能等级取整", () => {
        const byId = (id: number) => affixes.find(affix => affix.id === id)!
        expect(getAffixStrengthRangeText(byId(1059), 50)).toBe("[141.36~143.04]")
        expect(getAffixStrengthRangeText(byId(1061), 50)).toBe("[-14.15~-14.3]%")
        expect(getAffixStrengthRangeText(byId(1512), 10)).toBe("[1~2]")
        expect(getAffixStrengthRangeText(byId(1512), 50)).toBe("")
    })
})

describe("太古红星", () => {
    const roll = (affixId: number, source: "base" | "random" | "unique" | "unknown", ancient: boolean) => ({
        affixId,
        rollLevel: 50,
        masterworkLevel: 0,
        ancient,
        finalMasterwork: false,
        source,
    })

    it("词条行：太古随机行显示；基础行即使标记太古也不显示", () => {
        const lines = getItemAffixLines({
            kind: "normal",
            slotType: 1,
            affixes: [roll(102, "base", true), roll(1024, "random", true), roll(1025, "random", false)],
        })
        expect(lines.filter(isAncientGearLine).map(line => line.roll.affixId)).toEqual([1024])
    })

    it("装备图标：任意非基础词条太古即显示；专属与未知来源同样计入", () => {
        const randomAncient: TranscendGearItemConfig = {
            kind: "normal",
            slotType: 1,
            affixes: [roll(102, "base", false), roll(1024, "random", true)],
        }
        expect(hasAncientGearAffix(randomAncient)).toBe(true)

        const baseOnly: TranscendGearItemConfig = { kind: "normal", slotType: 1, affixes: [roll(102, "base", true)] }
        expect(hasAncientGearAffix(baseOnly)).toBe(false)

        // 专属词条：图标计入；词条行同样命中太古（上游只排除 base），Forge 叠图画太古层
        const uniqueEquip = uniqueEquips[0]
        const uniqueItem: TranscendGearItemConfig = {
            kind: "unique",
            slotType: uniqueEquip.slot,
            affixes: [],
            uniqueAffix: { ...roll(uniqueEquip.affixId, "unique", true) },
        }
        expect(hasAncientGearAffix(uniqueItem)).toBe(true)
        const uniqueLine = getItemAffixLines(uniqueItem)[0]
        expect(isAncientGearLine(uniqueLine)).toBe(true)
        expect(getGearLineMarkState(uniqueLine)).toMatchObject({ ancient: true, forge: true, pointStyle: 1 })

        // 未知来源（旧数据）：图标计入，且不显示随机区间
        const unknownAncient: TranscendGearItemConfig = {
            kind: "normal",
            slotType: 1,
            affixes: [{ ...roll(999999, "unknown", true), rollLevel: 5 }],
        }
        const unknownLine = getItemAffixLines(unknownAncient)[0]
        expect(isAncientGearIconLine(unknownLine)).toBe(true)
        expect(isAncientGearLine(unknownLine)).toBe(true)
        expect(unknownLine.rangeText).toBe("")
        expect(hasAncientGearAffix(unknownAncient)).toBe(true)
    })
})
