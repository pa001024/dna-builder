import {
    breakdowns,
    type DnaSeasonAffix,
    getCraftAvailability,
    getCraftDef,
    getGearCraftState,
    getGearEnchantTargets,
    getGearFinalMasterworkTargets,
    getGearTemperingAffixPool,
    TRANSCEND_CRAFT_FINAL_MASTERWORK,
    TRANSCEND_CRAFT_MASTERWORK,
    type TranscendCraftUnavailableReason,
    type TranscendGearCraftState,
    type TranscendGearCraftStateOptions,
    type TranscendGearItemConfig,
} from "@/data"
import { conditionsMap } from "@/data/d/condition.data"
import { cleanGameMarkup } from "@/utils/transcendence-display"
import { getAffixById } from "@/utils/transcendence-gear"
import { getAffixRollRange, getRandomAffixPool, isAffixAllowedForChar, isAffixConflicting } from "./generation"

/**
 * 做装 5 tab 的纯辅助：craft 条件原文、随机抽取（附魔候选 / 最终精锻目标）、
 * 附魔流程阶段与回收产出拆分。随机源可注入，便于测试与复现。
 */

/** 可注入随机源：返回 [0, 1) */
export type CraftRng = () => number

/** 从候选池随机抽取 count 个互不相同的元素（部分 Fisher-Yates，不修改入参） */
export function pickDistinct<T>(pool: readonly T[], count: number, rng: CraftRng = Math.random): T[] {
    const size = Math.min(Math.max(0, Math.floor(count)), pool.length)
    const rest = [...pool]
    const picked: T[] = []
    for (let index = 0; index < size; index += 1) {
        const value = Number(rng())
        const normalized = Number.isFinite(value) ? Math.min(Math.max(value, 0), 0.999999999) : 0
        picked.push(rest.splice(Math.floor(normalized * rest.length), 1)[0])
    }
    return picked
}

/** craft 的官方条件原文（29006 / 29011），只展示、不参与可用性判定 */
export function getCraftConditionText(craftId: number, translate: (text: string | undefined | null) => string): string {
    const condition = getCraftDef(craftId)?.condition
    if (!condition) return ""
    return cleanGameMarkup(translate(conditionsMap[condition]?.remark ?? `#${condition}`))
}

/** 不可用原因对应的 i18n 键；可用时为空串 */
export function getCraftGateTextKey(reason: TranscendCraftUnavailableReason | undefined): string {
    return reason ? `transcend-build.craft_gate_${reason.replace(/-/g, "_")}` : ""
}

/**
 * 撤销恢复前复检：按恢复后的物品可用性剪掉非法精锻等级 / 最终目标。
 * @param item 恢复后的物品（用于可用性判定）
 * @param entry 待恢复的撤销点
 * @param options craft 状态选项
 * @returns 可安全恢复的等级与目标
 */
export function clampCraftRestore(
    item: TranscendGearItemConfig,
    entry: { level: number; finalAffixId?: number },
    options?: TranscendGearCraftStateOptions
): { level: number; finalAffixId?: number } {
    if (entry.level <= 0) return { level: 0, finalAffixId: undefined }
    const levelGate = getCraftAvailability(item, TRANSCEND_CRAFT_MASTERWORK, undefined, options)
    // 满级本身是合法终态（craft 1 只是不能再加），只有品质 / 赛季等硬门槛才剪掉
    if (!levelGate.available && levelGate.reason !== "masterwork-max") {
        return { level: 0, finalAffixId: undefined }
    }
    const finalAvailable = getCraftAvailability(item, TRANSCEND_CRAFT_FINAL_MASTERWORK, undefined, options).available
    return { level: entry.level, finalAffixId: finalAvailable ? entry.finalAffixId : undefined }
}

/** 淬炼配方组：始终保留槽型全部池，空组也返回（界面显示空态） */
export function groupTemperPools<T extends { pool?: number }>(
    poolIds: readonly number[],
    affixes: readonly T[]
): Array<{ poolId: number; affixes: T[] }> {
    return poolIds.map(poolId => ({ poolId, affixes: affixes.filter(affix => affix.pool === poolId) }))
}

/**
 * 淬炼候选池：槽位全池（不按 Plan 过滤），排除基础 / 专属词条；
 * 同 `affixId` 的随机 / 附魔词条不排除（淬炼可与随机词条同 id 共存）。
 * 附魔快照原词缀保留在池内由界面禁用，角色限定词条按当前角色过滤。
 * @param item 装备物品
 * @param charId 当前角色 id（0 表示未指定）
 * @param options craft 状态读取选项（preserveUnknown 与库存同口径）
 * @returns 可淬炼词缀
 */
export function getTemperCandidates(
    item: TranscendGearItemConfig,
    charId: number,
    options?: TranscendGearCraftStateOptions
): DnaSeasonAffix[] {
    const baseAffixId = item.affixes.find(roll => roll.source === "base")?.affixId
    const uniqueAffixId = item.kind === "unique" ? item.uniqueAffix?.affixId : undefined
    const snapshotAffixId = getGearCraftState(item, undefined, options).enchantSnapshot?.roll.affixId
    return getGearTemperingAffixPool(item.slotType)
        .flatMap(entry => {
            const affix = getAffixById(entry.id)
            return affix ? [affix] : []
        })
        .filter(affix => affix.id !== baseAffixId && affix.id !== uniqueAffixId)
        .filter(affix => affix.id === snapshotAffixId || isAffixAllowedForChar(affix, charId))
}

/** 回收分解材料：先按索引配对 id / 数量，再过滤非法 id，避免数量与材料错位 */
export function pairRecycleItems(itemIds: readonly number[], itemCounts: readonly number[]): { itemIds: number[]; itemCounts: number[] } {
    return itemIds
        .map((id, index) => ({
            id: Math.round(Number(id)),
            count: Math.max(1, Math.round(Number(itemCounts[index]) || 1)),
        }))
        .filter(entry => Number.isFinite(entry.id) && entry.id > 0)
        .reduce<{ itemIds: number[]; itemCounts: number[] }>(
            (out, entry) => {
                out.itemIds.push(entry.id)
                out.itemCounts.push(entry.count)
                return out
            },
            { itemIds: [], itemCounts: [] }
        )
}

/** 附魔候选生成参数 */
export interface EnchantCandidateRequest {
    /** 槽型 id（池 = 该槽的 Plan 2 随机词缀池） */
    slotType: number
    /** 当前角色（过滤角色专属词缀） */
    charId?: number
    /** 当前全部词缀 id（含被替换目标） */
    presentAffixIds: readonly number[]
    /** 被替换目标的词缀 id：候选不能与它相同 */
    excludeAffixId?: number
    /** 附魔快照原词缀 id：保留给重置附魔，不能作为候选 */
    reservedAffixId?: number
    /** 候选数量（默认 2；随机入口取 1） */
    count?: number
}

/**
 * 附魔可 roll 词缀池：槽位 Plan 2 池内、排除目标与现有词缀、排除附魔快照原词缀、
 * 角色匹配且不与现有词缀互斥。随机 / 候选 / 自定义共用同一过滤口径。
 * @param request 候选参数
 * @returns 过滤后的词缀
 */
export function getEnchantAffixPool(request: EnchantCandidateRequest): DnaSeasonAffix[] {
    const exclude = request.excludeAffixId === undefined ? undefined : Math.round(request.excludeAffixId)
    const present = new Set(request.presentAffixIds.map(id => Math.round(Number(id))).filter(id => Number.isFinite(id) && id !== exclude))
    const reserved = request.reservedAffixId === undefined ? undefined : Math.round(request.reservedAffixId)
    return getRandomAffixPool(request.slotType).filter(affix => {
        if (affix.id === exclude || affix.id === reserved) return false
        if (present.has(affix.id)) return false
        if (!isAffixAllowedForChar(affix, request.charId ?? 0)) return false
        return !isAffixConflicting(affix, present)
    })
}

/**
 * 生成附魔候选：从可 roll 池随机抽取，两个候选互不相同。
 * @param request 候选参数
 * @param rng 注入随机源
 * @returns 候选词缀（最多 count 个；池不足时少于 2）
 */
export function pickEnchantCandidates(request: EnchantCandidateRequest, rng: CraftRng = Math.random): DnaSeasonAffix[] {
    return pickDistinct(getEnchantAffixPool(request), request.count ?? 2, rng)
}

/**
 * 按强度区间随机 roll 一个档位（区间含两端，不恒为上限）。
 * @param affix 词缀
 * @param equipBaseScore 强度
 * @param rng 注入随机源
 * @returns 档位
 */
export function rollAffixLevel(affix: DnaSeasonAffix, equipBaseScore: number, rng: CraftRng = Math.random): number {
    const range = getAffixRollRange(affix, equipBaseScore)
    const value = Number(rng())
    const normalized = Number.isFinite(value) ? Math.min(Math.max(value, 0), 0.999999) : 0
    return range.min + Math.floor(normalized * (range.max - range.min + 1))
}

/** 附魔候选结果：词缀 + 本次 roll 档位（展示与写入同源） */
export interface EnchantCandidateRoll {
    affix: DnaSeasonAffix
    rollLevel: number
}

/**
 * 生成带随机档位的附魔候选，每条候选各自 roll。
 * @param request 候选参数
 * @param equipBaseScore 强度
 * @param rng 注入随机源
 * @returns 候选结果
 */
export function pickEnchantRolls(
    request: EnchantCandidateRequest,
    equipBaseScore: number,
    rng: CraftRng = Math.random
): EnchantCandidateRoll[] {
    return pickEnchantCandidates(request, rng).map(affix => ({ affix, rollLevel: rollAffixLevel(affix, equipBaseScore, rng) }))
}

/**
 * 随机附魔结果：池内随机挑 1 条并随机 roll（不先生成 2 条再挑）。
 * @param request 候选参数
 * @param equipBaseScore 强度
 * @param rng 注入随机源
 * @returns 单条结果；池为空时 undefined
 */
export function pickRandomEnchantRoll(
    request: EnchantCandidateRequest,
    equipBaseScore: number,
    rng: CraftRng = Math.random
): EnchantCandidateRoll | undefined {
    const affix = pickEnchantCandidates({ ...request, count: 1 }, rng)[0]
    return affix ? { affix, rollLevel: rollAffixLevel(affix, equipBaseScore, rng) } : undefined
}

/**
 * 预览最终值是否计入最终精锻：被替换目标正是当前最终精锻槽，且新词缀可承载最终精锻
 * （与 `applyEnchant` 落盘口径一致）。
 * @param state craft 状态
 * @param targetIndex 被替换词缀下标
 * @param affix 新词缀
 * @returns 计入最终精锻为 true
 */
export function shouldPreviewFinalMasterwork(
    state: Pick<TranscendGearCraftState, "finalMasterworkAffixIndex">,
    targetIndex: number | undefined,
    affix: DnaSeasonAffix | undefined
): boolean {
    if (!affix || targetIndex === undefined) return false
    if (state.finalMasterworkAffixIndex !== targetIndex) return false
    return Boolean(affix.maxAffixUpdateFunc)
}

/** 附魔流程阶段 */
export type EnchantStage = "first" | "replace"

/** 附魔流程状态：首次附魔需官方确认弹窗，已附魔时目标槽固定 */
export interface EnchantFlow {
    stage: EnchantStage
    /** 可替换词缀下标 */
    targets: number[]
    /** 当前附魔词条下标 */
    enchantAffixIndex?: number
    /** 首次附魔（发送请求前须确认） */
    needsFirstConfirm: boolean
}

/**
 * 读取附魔流程状态。
 * @param item 装备物品
 * @param options craft 状态选项（编辑库存时 preserveUnknown）
 * @returns 阶段 / 可替换目标 / 是否需首次确认
 */
export function getEnchantFlow(item: TranscendGearItemConfig, options?: TranscendGearCraftStateOptions): EnchantFlow {
    const state = getGearCraftState(item, undefined, options)
    const targets = getGearEnchantTargets(item, undefined, options)
    const stage: EnchantStage = state.enchantAffixIndex === undefined ? "first" : "replace"
    return {
        stage,
        targets,
        enchantAffixIndex: state.enchantAffixIndex,
        needsFirstConfirm: stage === "first",
    }
}

/**
 * 随机抽取最终精锻目标下标（游戏内由服务端随机；本地注入随机源模拟）。
 * @param item 装备物品
 * @param options craft 状态选项
 * @param rng 注入随机源
 * @returns 目标下标；没有可承载词缀时 undefined
 */
export function pickFinalMasterworkTargetIndex(
    item: TranscendGearItemConfig,
    options?: TranscendGearCraftStateOptions,
    rng: CraftRng = Math.random
): number | undefined {
    // 只有 craft 2 当前可用（精锻满级 / 品质 / 赛季门槛均满足）时才抽取目标
    if (!getCraftAvailability(item, TRANSCEND_CRAFT_FINAL_MASTERWORK, undefined, options).available) return undefined
    const targets = getGearFinalMasterworkTargets(item, undefined, options)
    return pickDistinct(targets, 1, rng)[0]
}

/** 回收产出预览：出售与分解分开（出售价 = breakdown 的 priceId/price） */
export interface GearRecyclePreview {
    rarityId: number
    /** 出售：货币 id 与数量 */
    sell?: { priceId: number; price: number }
    /** 分解：材料 id 与数量（同一配置的两个平行数组） */
    breakdown?: { itemIds: number[]; itemCounts: number[] }
}

/**
 * 读取某品质的回收产出；没有配置时返回 null（界面显示空态）。
 * @param rarityId 品质 id
 * @returns 出售 / 分解两组产出
 */
export function getGearRecyclePreview(rarityId: number): GearRecyclePreview | null {
    const rarity = Math.round(Number(rarityId))
    if (!Number.isFinite(rarity) || rarity <= 0) return null
    const row = breakdowns.find(entry => entry.rarity === rarity)
    if (!row) return null
    const breakdown = pairRecycleItems(row.itemIds, row.itemCounts)
    const priceId = Math.round(Number(row.priceId))
    const price = Math.round(Number(row.price))
    return {
        rarityId: rarity,
        ...(priceId > 0 && price > 0 ? { sell: { priceId, price } } : {}),
        ...(breakdown.itemIds.length ? { breakdown } : {}),
    }
}
