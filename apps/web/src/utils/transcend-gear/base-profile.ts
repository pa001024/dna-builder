import {
    type DnaSeasonAffix,
    type DnaSeasonBaseName,
    type DnaSeasonSlot,
    resolveAffixValue,
    TRANSCEND_EQUIP_BASE_SCORE_MAX,
    TRANSCEND_EQUIP_BASE_SCORE_MIN,
} from "@/data"
import { getBaseNameById, getGearRarityAffixCount } from "./catalog"
import { type AffixRollRange, getBaseAffix, getGearSlot, getPlanRollRange, getRandomAffixPool, isAffixConflicting } from "./generation"

/**
 * 基础名词条画像：槽位固定词条（Plan 1）+ 洗练池随机词条（Plan 2）+ 强度 / 品质口径。
 * 固定词条恒 1 条、不参与太古；随机条数取品质 `MinAffixCount`（上限，允许更少），强度只改数值。
 */

/** 一条词条的精确排斥关系 */
export interface BaseNameExclusionRelation {
    /** 词条 id */
    affixId: number
    /** 池内不可与之共存的词条 id（升序） */
    excludedAffixIds: number[]
}

/** 一个洗练池内的随机词条与排斥结构 */
export interface BaseNamePoolGroup {
    poolId: number
    /** 池内随机词条（槽位洗练池口径，Plan 2） */
    affixes: DnaSeasonAffix[]
    /** 池内成对排斥（[小 id, 大 id]，排序去重；不推断传递关系） */
    exclusionPairs: [number, number][]
    /** 按词条聚合的排斥关系（仅含有排斥的词条，按 id 升序） */
    exclusionRelations: BaseNameExclusionRelation[]
}

/** 基础名详情页使用的词条画像 */
export interface BaseNameAffixProfile {
    baseName: DnaSeasonBaseName
    slot: DnaSeasonSlot
    /** 槽位固定词条（`BaseAffixId`，Plan 1）；数据缺失时 null */
    baseAffix: DnaSeasonAffix | null
    poolGroups: BaseNamePoolGroup[]
    /** 固定词条在指定强度下的最终数值（单值，不参与太古） */
    fixedAt(power: number): number | null
    /** Plan 2 随机词条在指定强度下的档位范围 */
    plan2RangeAt(power: number): AffixRollRange
    /** 品质 id（1–5）→ 随机词条条数 */
    randomCountByRarity: Record<number, number>
}

/** 品质 1–5：随机条数由 `MinAffixCount` 决定，2/3 同蓝、4/5 同金也必须按 RarityId 区分 */
const RARITY_IDS = [1, 2, 3, 4, 5] as const

/**
 * 池内精确成对排斥：复用生成规则的 `isAffixConflicting`（数据只保证单向声明，读取时双向判定），
 * 归一化为 `[小 id, 大 id]` 并排序；不把传递关系包装成「互斥组」。
 * @param list 同一洗练池内的词条
 * @returns 排斥对（排序去重）
 */
function buildExclusionPairs(list: readonly DnaSeasonAffix[]): [number, number][] {
    const pairs: [number, number][] = []
    for (let left = 0; left < list.length; left += 1) {
        for (let right = left + 1; right < list.length; right += 1) {
            const current = list[left]
            const other = list[right]
            if (!isAffixConflicting(current, new Set([other.id]))) continue
            pairs.push(current.id < other.id ? [current.id, other.id] : [other.id, current.id])
        }
    }
    return pairs.sort((left, right) => left[0] - right[0] || left[1] - right[1])
}

/**
 * 按词条聚合排斥对：每个词条列出池内不可共存的词条 id。
 * @param pairs 排斥对
 * @returns 排斥关系（仅含有排斥的词条，按 id 升序）
 */
function buildExclusionRelations(pairs: readonly (readonly [number, number])[]): BaseNameExclusionRelation[] {
    const relations = new Map<number, Set<number>>()
    const add = (affixId: number, excludedId: number) => {
        const ids = relations.get(affixId) ?? new Set<number>()
        ids.add(excludedId)
        relations.set(affixId, ids)
    }
    for (const [left, right] of pairs) {
        add(left, right)
        add(right, left)
    }
    return [...relations.entries()]
        .sort(([left], [right]) => left - right)
        .map(([affixId, excluded]) => ({ affixId, excludedAffixIds: [...excluded].sort((left, right) => left - right) }))
}

/**
 * 组装基础名词条画像：固定词条取槽位 `BaseAffixId`，随机池取槽位 `TemperAffixPoolIds`，
 * 不复制过滤 / 条数逻辑，全部复用生成规则函数。
 * @param iconId 基础名 id
 * @returns 词条画像；基础名 / 槽位缺失时为 null
 */
export function getBaseNameAffixProfile(iconId: number | undefined): BaseNameAffixProfile | null {
    const baseName = getBaseNameById(iconId)
    if (!baseName) return null
    const slot = getGearSlot(baseName.slot)
    if (!slot) return null
    const baseAffix = getBaseAffix(slot.id) ?? null
    const randomPool = getRandomAffixPool(slot.id)
    const poolGroups = (slot.temperAffixPoolIds ?? [])
        .map(poolId => {
            const poolAffixes = randomPool.filter(affix => affix.pool === poolId)
            const exclusionPairs = buildExclusionPairs(poolAffixes)
            return { poolId, affixes: poolAffixes, exclusionPairs, exclusionRelations: buildExclusionRelations(exclusionPairs) }
        })
        .filter(group => group.affixes.length > 0)
    const randomCountByRarity: Record<number, number> = {}
    for (const rarityId of RARITY_IDS) randomCountByRarity[rarityId] = getGearRarityAffixCount(rarityId)
    const clampPower = (power: number) =>
        Math.max(TRANSCEND_EQUIP_BASE_SCORE_MIN, Math.min(TRANSCEND_EQUIP_BASE_SCORE_MAX, Math.round(power)))
    return {
        baseName,
        slot,
        baseAffix,
        poolGroups,
        fixedAt(power) {
            if (!baseAffix) return null
            const result = resolveAffixValue(baseAffix, {
                affixId: baseAffix.id,
                slotId: slot.id,
                rollLevel: clampPower(power),
                masterworkLevel: 0,
                ancient: false,
                finalMasterwork: false,
            })
            return result.final
        },
        plan2RangeAt(power) {
            return getPlanRollRange(clampPower(power), 2)
        },
        randomCountByRarity,
    }
}
