import {
    affixes,
    affixLevels,
    commitGearCraft,
    type DnaSeasonAffix,
    getGearFinalMasterworkTargets,
    getGearTemperingAffixPool,
    getMasterworkMax,
    getSlotMaxInlayCount,
    inlays,
    normalizeGearItem,
    slots,
    TRANSCEND_EQUIP_BASE_SCORE_MAX,
    TRANSCEND_EQUIP_BASE_SCORE_MIN,
    TRANSCEND_MAX_AFFIXES_PER_SLOT,
    TRANSCEND_MAX_ITEM_AFFIXES,
    TRANSCEND_UNIQUE_RARITY_ID,
    type TranscendGearAffixRoll,
    type TranscendGearAffixSource,
    type TranscendGearEnchantSnapshot,
    type TranscendGearItemConfig,
    type TranscendGearSocket,
    uniqueEquips,
} from "@/data"
import {
    getBaseNameById,
    getBaseNameOptions,
    getCurrentSeasonId,
    getGearRarity,
    getGearRarityAffixCount,
    getNamePrefix,
    getUniqueEquipById,
    isUniqueRarity,
    withGearSnapshots,
} from "./catalog"

/**
 * 升华装备生成规则的纯函数：品质 → 随机词缀条数、Plan 2 池过滤、排斥 / 重复 / 条数上限、
 * 强度 → roll 范围、新建物品组装与快捷添加默认值。
 * 规则来源：RESEARCH-GEAR-GENERATION（品质表 / 槽位表 / 词缀档 / 唯一装表），不引入服务端未知权重。
 */

/** 新建 / 编辑物品的表单草稿 */
export interface TranscendGearDraft {
    /** 品质 id；0 表示旧物品未记录（编辑时需显式选择） */
    rarityId: number
    /** 强度 1-50；0 表示旧物品未记录 */
    equipBaseScore: number
    /** 普通装备基础名 id */
    iconId?: number
    /** 暗金 id（品质 10 必填） */
    uniqueId?: number
    /** 随机词缀（source=random；淬炼 / 附魔来源原样保留） */
    randomAffixes: TranscendGearAffixRoll[]
    /** 淬炼词条（模拟器选择；新建时可带一条，来源标记为 tempering） */
    temperingAffix?: TranscendGearAffixRoll
    /** 装备级精锻等级 0..craft 1 上限；缺省取全部词条的最大精锻等级（旧表单兼容） */
    masterworkLevel?: number
    /** 最终精锻目标词条 id；仅在精锻满级且目标可承载时写入 */
    finalMasterworkAffixId?: number
    /** 淬炼累计次数（编辑时保留；缺省 0） */
    temperingCount?: number
    /** 附魔累计次数（编辑时保留；缺省 0） */
    enchantCount?: number
    /** 附魔快照（编辑 / 草稿重建时透传，重置附魔依赖它恢复原词缀） */
    enchantSnapshot?: TranscendGearEnchantSnapshot
    /** 编辑时保留的孔位 */
    sockets?: TranscendGearSocket[]
    /** 已开孔数（含未镶嵌的孔） */
    socketCount?: number
    /** 新建写当前赛季 */
    seasonId?: number
}

/** 单条词缀的 roll 范围 */
export interface AffixRollRange {
    min: number
    max: number
}

/**
 * 按槽型读取槽位数据。
 * @param slotType 槽型 id
 * @returns 槽位数据；缺失时 undefined
 */
export function getGearSlot(slotType: number) {
    return slots.find(slot => slot.id === Math.round(slotType))
}

/**
 * 取槽位基础词条（Plan 1）。
 * @param slotType 槽型 id
 * @returns 基础词条；缺失时 undefined
 */
export function getBaseAffix(slotType: number): DnaSeasonAffix | undefined {
    const baseAffixId = Math.round(Number(getGearSlot(slotType)?.baseAffixId))
    if (!Number.isFinite(baseAffixId) || baseAffixId <= 0) return undefined
    return affixes.find(affix => affix.id === baseAffixId)
}

/** 镶嵌物引用的词缀 id 集合（宝石词缀只能通过镶嵌进入装备） */
let gemAffixIdsCache: { source: readonly unknown[]; ids: Set<number> } | null = null

/**
 * 宝石词缀 id 集合（数据包换入会替换数组，按引用校验后重建）。
 * @returns 宝石词缀 id 集合
 */
export function getGemAffixIds(): Set<number> {
    if (!gemAffixIdsCache || gemAffixIdsCache.source !== inlays) {
        const ids = new Set<number>()
        for (const inlay of inlays) {
            for (const key of Object.keys(inlay.affixIdsBySlot)) ids.add(Number(key))
        }
        gemAffixIdsCache = { source: inlays, ids }
    }
    return gemAffixIdsCache.ids
}

/** 暗金专属词缀 id 集合（只能随唯一装出现） */
let uniqueAffixIdsCache: { source: readonly unknown[]; ids: Set<number> } | null = null

/**
 * 暗金专属词缀 id 集合（数据包换入会替换数组，按引用校验后重建）。
 * @returns 专属词缀 id 集合
 */
export function getUniqueAffixIds(): Set<number> {
    if (!uniqueAffixIdsCache || uniqueAffixIdsCache.source !== uniqueEquips) {
        uniqueAffixIdsCache = { source: uniqueEquips, ids: new Set(uniqueEquips.map(equip => equip.affixId)) }
    }
    return uniqueAffixIdsCache.ids
}

/**
 * 某槽型可用于新建的随机词缀池：仅 Plan 2、有池且池在槽位淬炼池内；
 * 排除宝石、专属、Plan 1/3 与无池词缀（1030/1031 等，按显式 `slotTypes` 另走候选）。
 * @param slotType 槽型 id
 * @returns 按池 / id 排序的词缀
 */
export function getRandomAffixPool(slotType: number): DnaSeasonAffix[] {
    const slot = getGearSlot(slotType)
    const poolIds = new Set(slot?.temperAffixPoolIds ?? [])
    if (!poolIds.size) return []
    const gemIds = getGemAffixIds()
    const uniqueIds = getUniqueAffixIds()
    return affixes
        .filter(affix => {
            if (affix.plan !== 2) return false
            if (affix.pool === undefined || !poolIds.has(affix.pool)) return false
            if (gemIds.has(affix.id) || uniqueIds.has(affix.id)) return false
            return true
        })
        .sort((left, right) => (left.pool ?? 0) - (right.pool ?? 0) || left.id - right.id)
}

/**
 * 某槽型的随机词缀候选（做装 / OCR 用）：`getRandomAffixPool` 的 Plan 2 池 + 带 `slotTypes` 且命中该槽型的
 * Plan 2/3 词条（导入期本地建模：1030/1031 靴子 / 项链 / 戒指，技能等级 1038-1040 / 1510-1512 按已知部位）。
 * 附魔候选与洗练池展示复用 `getRandomAffixPool`。
 * @param slotType 槽型 id
 * @returns 池内词缀（按池 / id）+ 显式槽型词条（按 id）
 */
export function getGearRandomAffixPool(slotType: number): DnaSeasonAffix[] {
    const slot = Math.round(slotType)
    const pool = getRandomAffixPool(slot)
    const poolIds = new Set(pool.map(affix => affix.id))
    const explicit = affixes
        .filter(affix => (affix.plan === 2 || affix.plan === 3) && affix.slotTypes?.includes(slot) && !poolIds.has(affix.id))
        .sort((left, right) => left.id - right.id)
    if (!explicit.length) return pool
    return [...pool, ...explicit]
}

/**
 * 判断词缀是否已选 / 达到条数上限 / 与已选词缀互斥。
 * @param affix 候选词缀
 * @param selectedIds 已选词缀 id
 * @param maxCount 随机词缀条数上限
 * @returns 选择状态
 */
export type RandomAffixState = "available" | "selected" | "full" | "excluded"

export function getRandomAffixState(affix: DnaSeasonAffix, selectedIds: readonly number[], maxCount: number): RandomAffixState {
    const selected = new Set(selectedIds.map(id => Math.round(id)))
    if (selected.has(affix.id)) return "selected"
    if (selectedIds.length >= maxCount) return "full"
    if (isAffixConflicting(affix, selected)) return "excluded"
    return "available"
}

/**
 * 判断词缀与已选词缀是否互斥（双向检查，数据只保证单向声明）。
 * @param affix 候选词缀
 * @param selectedIds 已选词缀 id
 * @returns 互斥为 true
 */
export function isAffixConflicting(affix: DnaSeasonAffix, selectedIds: ReadonlySet<number>): boolean {
    if ((affix.exclusionAffixIds ?? []).some(id => selectedIds.has(id))) return true
    for (const id of selectedIds) {
        const selected = affixes.find(item => item.id === id)
        if (selected?.exclusionAffixIds?.includes(affix.id)) return true
    }
    return false
}

/**
 * 缺行时的档位回退公式（与上游 `DNASeasonAffixLevel` 一致）：
 * Plan 1 = `[p, p]`；Plan 2 = `[10p-9, 10p]`；Plan 3 = `[max(1,⌊p/10⌋), min(5,⌊p/10⌋+1)]`；Plan 4 = `[1, 1]`。
 * @param equipBaseScore 强度 1-50
 * @param planId 词缀方案 id
 * @returns roll 范围
 */
export function getFallbackPlanRollRange(equipBaseScore: number, planId: number): AffixRollRange {
    const power = Math.max(TRANSCEND_EQUIP_BASE_SCORE_MIN, Math.min(TRANSCEND_EQUIP_BASE_SCORE_MAX, Math.round(equipBaseScore)))
    if (planId === 1) return { min: power, max: power }
    if (planId === 2) return { min: power * 10 - 9, max: power * 10 }
    if (planId === 3) {
        const tier = Math.floor(power / 10)
        return { min: Math.max(1, tier), max: Math.min(5, tier + 1) }
    }
    return { min: 1, max: 1 }
}

/**
 * 强度对应的词缀档位范围：优先读 `affixLevels`，缺行时按上游公式回退（见 `getFallbackPlanRollRange`）。
 * @param equipBaseScore 强度 1-50
 * @param planId 词缀方案 id
 * @param totalLevel 词条总档位（用于上限保护）
 * @returns roll 范围
 */
export function getPlanRollRange(equipBaseScore: number, planId: number, totalLevel = Number.POSITIVE_INFINITY): AffixRollRange {
    const power = Math.max(TRANSCEND_EQUIP_BASE_SCORE_MIN, Math.min(TRANSCEND_EQUIP_BASE_SCORE_MAX, Math.round(equipBaseScore)))
    const row = affixLevels.find(item => item.power === power)
    const plan = row?.plans.find(item => item.planId === planId)
    const fallback = getFallbackPlanRollRange(power, planId)
    let min = fallback.min
    let max = fallback.max
    if (plan) {
        min = plan.minRollLevel
        max = plan.maxRollLevel
    }
    return {
        min: Math.max(1, Math.min(min, totalLevel)),
        max: Math.max(1, Math.min(max, totalLevel)),
    }
}

/**
 * 一条词缀在指定强度下的 roll 范围。
 * @param affix 词缀
 * @param equipBaseScore 强度
 * @returns roll 范围
 */
export function getAffixRollRange(affix: DnaSeasonAffix, equipBaseScore: number): AffixRollRange {
    return getPlanRollRange(equipBaseScore, affix.plan, Math.max(1, Math.round(affix.totalValueLevel || 1)))
}

/**
 * 把 roll 钳制到强度对应的范围。
 * @param affix 词缀
 * @param equipBaseScore 强度
 * @param rollLevel 原始档位
 * @returns 钳制后的档位
 */
export function clampAffixRoll(affix: DnaSeasonAffix, equipBaseScore: number, rollLevel: number): number {
    const range = getAffixRollRange(affix, equipBaseScore)
    const value = Math.round(Number(rollLevel) || range.max)
    return Math.max(range.min, Math.min(range.max, value))
}

/**
 * 判断词缀是否拥有太古公式（没有公式的词条不出现太古控件）。
 * @param affix 词缀
 * @returns 支持太古为 true
 */
export function canAffixBeAncient(affix: DnaSeasonAffix | undefined): boolean {
    return Boolean(affix?.ancientFunc)
}

/**
 * 生成一条词缀 roll：基础词条 roll=强度、专属固定 1、随机词条取范围上限（新添加时的默认满 roll）。
 * @param affix 词缀
 * @param source 来源
 * @param equipBaseScore 强度
 * @returns 词缀 roll
 */
export function createAffixRoll(affix: DnaSeasonAffix, source: TranscendGearAffixSource, equipBaseScore: number): TranscendGearAffixRoll {
    let rollLevel = 1
    if (source === "base") rollLevel = Math.max(1, Math.round(equipBaseScore))
    else if (source === "random") rollLevel = getAffixRollRange(affix, equipBaseScore).max
    return {
        affixId: affix.id,
        rollLevel,
        masterworkLevel: 0,
        ancient: false,
        finalMasterwork: false,
        source,
    }
}

/**
 * 强度变化后把所有随机词缀的 roll 钳制到新范围；基础词条档位同步为强度。
 * 淬炼 / 附魔来源保持不变（不得被降级为 random），同样按槽位档位钳制。
 * @param affixesIn 当前词缀
 * @param slotType 槽型
 * @param equipBaseScore 新强度
 * @returns 新词缀列表
 */
export function applyStrengthToAffixes(
    affixesIn: readonly TranscendGearAffixRoll[],
    slotType: number,
    equipBaseScore: number
): TranscendGearAffixRoll[] {
    const baseAffix = getBaseAffix(slotType)
    return affixesIn.map(roll => {
        const affix = affixes.find(item => item.id === roll.affixId)
        if (!affix) return { ...roll }
        if (baseAffix && affix.id === baseAffix.id) {
            return { ...roll, rollLevel: Math.max(1, Math.round(equipBaseScore)), source: "base" }
        }
        if (roll.source === "tempering" || roll.source === "enchant") {
            return { ...roll, rollLevel: clampAffixRoll(affix, equipBaseScore, roll.rollLevel) }
        }
        if (affix.plan === 2) {
            return { ...roll, rollLevel: clampAffixRoll(affix, equipBaseScore, roll.rollLevel), source: "random" }
        }
        return { ...roll }
    })
}

/** 草稿组装选项 */
export interface TranscendGearDraftBuildOptions {
    /** 编辑库存物品：未知词条的最终目标不判死（与库存写入 / apply 同口径） */
    preserveUnknown?: boolean
}

/** 草稿词缀去重来源类：淬炼单独一类，其余（随机 / 附魔 / 未知）同一类；同 id 跨类可共存 */
function draftAffixClass(source: TranscendGearAffixSource | undefined): "tempering" | "other" {
    return source === "tempering" ? "tempering" : "other"
}

/**
 * 由表单草稿组装完整物品：基础词条自动加入（roll=强度、不可太古），
 * 随机词条按强度钳制，暗金自动带专属词条（roll=1、不可太古）；新建不带孔位与已开孔。
 * 精锻是装备级状态：取草稿显式等级或全部词条最大值，上限与 UI 同源（craft 1 `maxCount`）；
 * 最终精锻锚点与 per-affix 派生统一交给数据层 `commitGearCraft`（与 apply / 归一化同口径）。
 * @param slotType 槽型 id
 * @param draft 表单草稿
 * @param options 组装选项（编辑库存物品时 preserveUnknown）
 * @returns 装备物品（含展示快照与 craft 状态）
 */
export function buildGearItem(
    slotType: number,
    draft: TranscendGearDraft,
    options?: TranscendGearDraftBuildOptions
): TranscendGearItemConfig {
    const slot = Math.round(slotType)
    const strength = draft.equipBaseScore > 0 ? Math.round(draft.equipBaseScore) : 0
    const rarityId = draft.rarityId > 0 ? Math.round(draft.rarityId) : 0
    const preserveUnknown = options?.preserveUnknown === true
    const unique = rarityId === TRANSCEND_UNIQUE_RARITY_ID && draft.uniqueId ? getUniqueEquipById(draft.uniqueId) : undefined
    const kind = unique ? "unique" : "normal"
    const affixRolls: TranscendGearAffixRoll[] = []
    const baseAffix = getBaseAffix(slot)
    if (baseAffix) {
        affixRolls.push({
            affixId: baseAffix.id,
            rollLevel: strength || 1,
            masterworkLevel: 0,
            ancient: false,
            finalMasterwork: false,
            source: "base",
        })
    }
    for (const roll of draft.randomAffixes) {
        // 同 id 的淬炼行与随机行可共存：只跳过同来源类的重复（随机之间仍拒绝）
        const sourceClass = draftAffixClass(roll.source)
        if (affixRolls.some(item => item.affixId === roll.affixId && draftAffixClass(item.source) === sourceClass)) continue
        const affix = affixes.find(item => item.id === roll.affixId)
        const source: TranscendGearAffixSource =
            roll.source === "tempering" || roll.source === "enchant" ? roll.source : affix ? "random" : "unknown"
        // 编辑旧物品：数据缺失的词条不得静默丢弃，保留原 roll 并标为 unknown
        affixRolls.push({
            affixId: Math.max(1, Math.round(roll.affixId)),
            rollLevel: affix && strength ? clampAffixRoll(affix, strength, roll.rollLevel) : Math.max(1, Math.round(roll.rollLevel || 1)),
            masterworkLevel: Math.max(0, Math.round(roll.masterworkLevel)),
            ancient: roll.ancient === true && (!affix || canAffixBeAncient(affix)),
            finalMasterwork: roll.finalMasterwork === true,
            source,
        })
    }
    const tempering = draft.temperingAffix
    const temperingPoolIds = new Set(getGearTemperingAffixPool(slot).map(affix => affix.id))
    if (
        tempering &&
        temperingPoolIds.has(Math.round(tempering.affixId)) &&
        !affixRolls.some(item => item.affixId === tempering.affixId && item.source === "tempering")
    ) {
        const affix = affixes.find(item => item.id === tempering.affixId)
        affixRolls.push({
            affixId: Math.max(1, Math.round(tempering.affixId)),
            rollLevel: Math.max(1, Math.round(tempering.rollLevel || affix?.totalValueLevel || 1)),
            masterworkLevel: Math.max(0, Math.round(tempering.masterworkLevel)),
            ancient: tempering.ancient === true && (!affix || canAffixBeAncient(affix)),
            finalMasterwork: false,
            source: "tempering",
        })
    }
    const requestedMasterwork = Number.isFinite(draft.masterworkLevel) ? Math.round(draft.masterworkLevel as number) : undefined
    const masterworkLevel = Math.max(
        0,
        Math.min(
            getMasterworkMax(),
            requestedMasterwork ?? affixRolls.reduce((max, roll) => Math.max(max, Math.round(roll.masterworkLevel)), 0)
        )
    )
    const item: TranscendGearItemConfig = { kind, slotType: slot, affixes: affixRolls }
    if (rarityId) item.rarityId = rarityId
    if (strength) item.equipBaseScore = strength
    if (kind === "normal") {
        if (draft.iconId) item.iconId = Math.round(draft.iconId)
        const nameId = getNamePrefix(slot)?.id
        if (nameId) item.nameId = nameId
    }
    if (unique) {
        item.uniqueId = unique.id
        item.uniqueAffix = {
            affixId: unique.affixId,
            rollLevel: 1,
            masterworkLevel: 0,
            ancient: false,
            finalMasterwork: false,
            source: "unique",
        }
    }
    const seasonId = draft.seasonId ?? getCurrentSeasonId()
    if (seasonId) item.seasonId = seasonId
    const sockets = (draft.sockets ?? []).map(socket => ({ ...socket }))
    const maxInlay = getSlotMaxInlayCount(slot)
    const filled = sockets.reduce((max, socket) => Math.max(max, Math.round(Number(socket.socketIndex)) + 1), 0)
    const requested = Math.max(0, Math.round(Number(draft.socketCount ?? filled) || 0))
    // 与归一化同口径：显式已开孔数低于已镶嵌所需时抬高，不因草稿字段静默丢宝石
    const opened = Math.min(maxInlay, Math.max(requested, filled))
    const keptSockets = sockets.filter(socket => socket.socketIndex < opened)
    if (opened > 0) item.socketCount = opened
    if (keptSockets.length) item.sockets = keptSockets
    // 最终目标锚点：显式 id 优先；旧表单回退「带 final 标记且可承载」的第一条
    const requestedFinalAffixId = Number(draft.finalMasterworkAffixId)
    let finalAffixId =
        draft.finalMasterworkAffixId !== undefined && Number.isFinite(requestedFinalAffixId) ? Math.round(requestedFinalAffixId) : undefined
    if (finalAffixId === undefined) {
        const candidates = new Set(getGearFinalMasterworkTargets(item, undefined, { preserveUnknown }))
        finalAffixId = affixRolls.find((roll, index) => roll.finalMasterwork === true && candidates.has(index))?.affixId
    }
    const temperingAffixId = affixRolls.find(roll => roll.source === "tempering")?.affixId
    const enchantAffixId = affixRolls.find(roll => roll.source === "enchant")?.affixId
    // 同 id 孪生按草稿行位置锚定（commitGearCraft 直接下标优先）
    const temperingAffixIndex = affixRolls.findIndex(roll => roll.source === "tempering")
    const enchantAffixIndex = affixRolls.findIndex(roll => roll.source === "enchant")
    // 与 apply / 归一化共用同一提交路径：顺序保持、目标复检、per-affix 派生、目标清除时次数归零
    const committed = commitGearCraft(
        item,
        affixRolls,
        {
            masterworkLevel,
            temperingCount: Math.max(0, Math.round(Number(draft.temperingCount) || 0)),
            enchantCount: Math.max(0, Math.round(Number(draft.enchantCount) || 0)),
            enchantSnapshot: draft.enchantSnapshot,
        },
        {
            finalMasterworkAffixId: finalAffixId,
            temperingAffixId,
            temperingAffixIndex: temperingAffixIndex >= 0 ? temperingAffixIndex : undefined,
            enchantAffixId,
            enchantAffixIndex: enchantAffixIndex >= 0 ? enchantAffixIndex : undefined,
        },
        undefined,
        { preserveUnknown }
    )
    return withGearSnapshots(committed)
}

/**
 * 库存写入失败时的本地回退：按库存口径（preserveUnknown）归一化新建物品。
 * 归一化失败返回 null，调用方不得回退到原始物品（未归一化物品会与库存行 hash / 状态分叉）。
 * @param item 新建物品
 * @returns 归一化物品；槽型非法等无法归一化时为 null
 */
export function normalizeGearForEquipFallback(item: TranscendGearItemConfig): TranscendGearItemConfig | null {
    return normalizeGearItem(item, undefined, { preserveUnknown: true })
}

/**
 * 快捷添加的默认物品：白色品质、满强度、槽位第一个基础名、仅基础词条。
 * 游戏没有生成权重表，这只是本地规划的便捷默认值，用户可在库存里继续编辑。
 * @param slotType 槽型 id
 * @returns 装备物品；数据缺失（无基础名）时为 null
 */
export function buildQuickGearItem(slotType: number): TranscendGearItemConfig | null {
    const firstBaseName = getBaseNameOptions(slotType)[0]
    if (!firstBaseName) return null
    return buildGearItem(slotType, {
        rarityId: 1,
        equipBaseScore: TRANSCEND_EQUIP_BASE_SCORE_MAX,
        iconId: firstBaseName.id,
        randomAffixes: [],
        seasonId: getCurrentSeasonId(),
    })
}

/**
 * 判断词缀是否允许当前角色使用：无角色限制 / 未指定角色时放行，否则 charIds 必须命中。
 * @param affix 词缀
 * @param charId 当前角色 id（0 表示未指定）
 * @returns 允许为 true
 */
export function isAffixAllowedForChar(affix: DnaSeasonAffix, charId: number): boolean {
    return charId <= 0 || !affix.charIds?.length || affix.charIds.includes(charId)
}

/**
 * 判断随机词缀是否合法：条数不超过品质上限、Plan 2 且在槽位池内（或带 `slotTypes` 命中该槽型的 Plan 2/3）、
 * 角色专属词缀匹配当前角色、无重复、无排斥。淬炼不占随机条数；附魔替换随机词条，因此占用随机名额并计入总词条上限
 * （基础 + 其它 + 淬炼 ≤ `TRANSCEND_MAX_ITEM_AFFIXES`，与归一化裁剪口径一致）。
 * 「其它」词条另受数据层单件 4 条硬上限约束，不依赖品质 `minAffixCount`，避免归一化静默截断。
 * 数据表缺失的未知词条允许保留（编辑旧物品），但仍占用随机条数。
 * `allowOutOfPool` 只放宽 Plan 2 的「必须在槽位池」一条（OCR 导入的池外词缀按截图保留），
 * 不放宽显式 `slotTypes` 归属（未命中 `slotTypes` 的 Plan 2/3 仍被拒），其余规则不变。
 * @param slotType 槽型 id
 * @param rolls 随机词缀
 * @param maxRandom 条数上限
 * @param charId 当前角色 id（0 表示未指定，不做角色过滤）
 * @param allowOutOfPool 是否允许池外 Plan 2 词缀
 * @returns 是否合法
 */
function isValidRandomAffixes(
    slotType: number,
    rolls: readonly TranscendGearAffixRoll[],
    maxRandom: number,
    charId = 0,
    allowOutOfPool = false
): boolean {
    const plain = rolls.filter(roll => roll.source !== "tempering")
    if (plain.length > maxRandom) return false
    // 数据层每条最多 4 条其它词条（含附魔 / 未知）：品质名额再高也不能突破
    if (plain.length > TRANSCEND_MAX_AFFIXES_PER_SLOT) return false
    const baseCount = getBaseAffix(slotType) ? 1 : 0
    // 单件最多 1 条淬炼：两条不同 id 的淬炼行同样拒绝（数据层只保留一条，不能静默降级）
    const temperingCount = rolls.filter(roll => roll.source === "tempering").length
    if (temperingCount > 1) return false
    if (baseCount + plain.length + temperingCount > TRANSCEND_MAX_ITEM_AFFIXES) return false
    const poolIds = new Set(getGearRandomAffixPool(slotType).map(affix => affix.id))
    const slot = Math.round(slotType)
    const ids = plain.map(roll => Math.round(roll.affixId))
    if (new Set(ids).size !== ids.length) return false
    for (const id of ids) {
        const affix = affixes.find(item => item.id === id)
        if (!affix) continue
        if (affix.slotTypes?.length) {
            if (affix.plan !== 2 && affix.plan !== 3) return false
            if (!affix.slotTypes.includes(slot)) return false
        } else {
            if (affix.plan !== 2) return false
            if (!allowOutOfPool && !poolIds.has(id)) return false
        }
        if (!isAffixAllowedForChar(affix, charId)) return false
        const others = new Set(ids.filter(other => other !== id))
        if (isAffixConflicting(affix, others)) return false
    }
    return true
}

/**
 * 判断草稿是否可提交：品质 / 强度已选；随机词缀符合品质上限、Plan 2 池 / `slotTypes` 技能等级与角色专属规则；
 * 普通装备有基础名；暗金有唯一装 id。
 * @param slotType 槽型 id
 * @param draft 表单草稿
 * @param charId 当前角色 id（0 表示未指定）
 * @param options `allowOutOfPool` 为 true 时允许池外 Plan 2 词缀（OCR 导入），其余校验不变
 * @returns 是否合法
 */
export function isGearDraftValid(
    slotType: number,
    draft: TranscendGearDraft,
    charId = 0,
    options: { allowOutOfPool?: boolean } = {}
): boolean {
    const slot = Math.round(slotType)
    if (!getGearRarity(draft.rarityId)) return false
    const strength = Math.round(draft.equipBaseScore)
    if (strength < TRANSCEND_EQUIP_BASE_SCORE_MIN || strength > TRANSCEND_EQUIP_BASE_SCORE_MAX) return false
    if (
        !isValidRandomAffixes(slot, draft.randomAffixes, getGearRarityAffixCount(draft.rarityId), charId, options.allowOutOfPool === true)
    ) {
        return false
    }
    if (isUniqueRarity(draft.rarityId)) return Boolean(draft.uniqueId && getUniqueEquipById(draft.uniqueId)?.slot === slot)
    if (!draft.iconId) return false
    return getBaseNameById(draft.iconId)?.slot === slot
}
