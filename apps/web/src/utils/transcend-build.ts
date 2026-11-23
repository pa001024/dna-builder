import {
    affixes,
    applyGearEntriesToGroup,
    type Buff,
    buffData,
    type Char,
    charMap,
    createDefaultTranscendBuildSettings,
    createMaxedReachableTalentLevels,
    createMaxedTranscendTalentLevels,
    createTranscendBuild,
    type DnaSeasonAffix,
    flattenEquippedGear,
    getSlotBaseAffixId,
    getTalentStageWarnings,
    getTranscendSideGearGroup,
    getTranscendSlotType,
    inlays,
    isAffixCompatibleWithSlot,
    LeveledChar,
    normalizeTranscendBuildSettings,
    type SignatureWeapon,
    serializeTranscendBuildSettings,
    syncActiveGearVariant,
    TRANSCEND_ASSIST1_SLOT_MAX,
    TRANSCEND_ASSIST1_SLOT_MIN,
    TRANSCEND_ASSIST2_SLOT_MAX,
    TRANSCEND_ASSIST2_SLOT_MIN,
    TRANSCEND_MAIN_SLOT_MAX,
    TRANSCEND_MASTERWORK_MAX,
    TRANSCEND_MAX_AFFIXES_PER_SLOT,
    type TranscendBuildSettings,
    type TranscendGearEntry,
    type TranscendSettings,
    type TranscendSideBuild,
    type TranscendSlotGroup,
    type TranscendTalentStageWarning,
    weaponData,
    weaponMap,
} from "@/data"
import { createBuffSelectContext, isBuffSelectable, isModProvidedBuff, unionBuffSelectContexts } from "@/data/buffFilter"
import { isPetRelatedBuffName } from "@/data/petTrait"
import { getSlotName, type TranscendAffixUiType } from "@/utils/transcendence-gear"

/**
 * 独立升华构筑页的 UI 纯 helper：槽位分组、词条兼容过滤、去重/钳制、三段计算缓存。
 * 计算口径全部复用 `@/data` 的 `createTranscendBuild`，本模块不重写任何公式。
 */

/** 三段构筑的固定顺序（主控在前，协战按编号） */
export const TRANSCEND_BUILD_SIDES: readonly TranscendSlotGroup[] = ["main", "assist1", "assist2"]

/** 结果视图模式：三段之一或合计 */
export type TranscendResultMode = TranscendSlotGroup | "total"

/** 各构筑位的装备位索引区间（主控 1-8、协战一 9-12、协战二 13-16，一人一套） */
const SIDE_SLOT_IDS: Record<TranscendSlotGroup, readonly number[]> = {
    main: Array.from({ length: TRANSCEND_MAIN_SLOT_MAX }, (_, index) => index + 1),
    assist1: Array.from(
        { length: TRANSCEND_ASSIST1_SLOT_MAX - TRANSCEND_ASSIST1_SLOT_MIN + 1 },
        (_, index) => TRANSCEND_ASSIST1_SLOT_MIN + index
    ),
    assist2: Array.from(
        { length: TRANSCEND_ASSIST2_SLOT_MAX - TRANSCEND_ASSIST2_SLOT_MIN + 1 },
        (_, index) => TRANSCEND_ASSIST2_SLOT_MIN + index
    ),
}

/**
 * 取构筑位的装备位索引列表。
 * @param side 构筑位
 * @returns 升序装备位索引
 */
export function getSideSlotIds(side: TranscendSlotGroup): readonly number[] {
    return SIDE_SLOT_IDS[side]
}

/** 装备页展示用的槽位信息 */
export interface TranscendGearSlot {
    slotId: number
    /** 槽型 id（1-11，由装备位映射） */
    slotType: number
    /** 槽型展示名（上游原文，调用方再过 `gt`） */
    name: string
}

/**
 * 取构筑位的槽位信息列表：主控 8 槽、协战一 9-12、协战二 13-16 各 4 槽；8 号位复用戒指槽型。
 * @param side 构筑位
 * @returns 槽位列表
 */
export function getSideGearSlots(side: TranscendSlotGroup): TranscendGearSlot[] {
    return getSideSlotIds(side).map(slotId => {
        const slotType = getTranscendSlotType(slotId)
        return { slotId, slotType, name: getSlotName(slotType) }
    })
}

/**
 * 取构筑位对应的装备组：把 v2 物品展平为词条条目（v1 遗留 UI 的只读视图）。
 * 装备槽持有完整物品配置，写回走 `setSideGear`。
 * @param settings 升华配置
 * @param side 构筑位
 * @returns 该组的词条条目
 */
export function getSideGear(settings: TranscendSettings, side: TranscendSlotGroup): TranscendGearEntry[] {
    const group = getTranscendSideGearGroup(settings, side)
    return flattenEquippedGear(Array.isArray(group) ? group : []).entries
}

/**
 * 用新的词条列表替换构筑位的装备组（v1 风格编辑器的回写适配器）：
 * 按槽位合并，只改写提交过的槽位的普通词条，保留暗金 / 孔位 / 快照。
 * @param settings 升华配置
 * @param side 构筑位
 * @param entries 新条目列表
 */
export function setSideGear(settings: TranscendSettings, side: TranscendSlotGroup, entries: TranscendGearEntry[]): void {
    const group = applyGearEntriesToGroup(getTranscendSideGearGroup(settings, side), entries)
    if (side === "main") settings.mainGear = group
    else if (side === "assist1") settings.assist1Gear = group
    else settings.assist2Gear = group
    // 装备编辑同步进当前激活变体，切换变体后不会丢这次修改
    syncActiveGearVariant(settings)
}

/**
 * 取某个装备位上的条目。
 * @param entries 装备组条目
 * @param slotId 装备位
 * @returns 该槽位的条目列表
 */
export function getSlotEntries(entries: readonly TranscendGearEntry[], slotId: number): TranscendGearEntry[] {
    return entries.filter(entry => entry.slotId === slotId)
}

/**
 * 把某槽位的条目按词条数据分堆：普通 / 孔位宝石 / 数据缺失。
 * 查不到数据的条目不丢弃，交由界面只读展示并提示。
 * @param entries 装备组条目
 * @param slotId 装备位
 * @param affixOf 词条 id → 数据
 * @returns 分类后的条目
 */
export function partitionSlotEntries(
    entries: readonly TranscendGearEntry[],
    slotId: number,
    affixOf: (affixId: number) => DnaSeasonAffix | undefined
): { regular: TranscendGearEntry[]; gem: TranscendGearEntry[]; unknown: TranscendGearEntry[] } {
    const regular: TranscendGearEntry[] = []
    const gem: TranscendGearEntry[] = []
    const unknown: TranscendGearEntry[] = []
    for (const entry of getSlotEntries(entries, slotId)) {
        if (!affixOf(entry.affixId)) {
            unknown.push(entry)
        } else if (entry.gemId !== undefined || entry.socketIndex !== undefined) {
            gem.push(entry)
        } else {
            regular.push(entry)
        }
    }
    return { regular, gem, unknown }
}

/**
 * 判断条目是否占用随机词条上限：孔位宝石与暗金专属词条不占上限，槽位基础词条单独计 1 条。
 * @param entry 装备组条目
 * @returns 普通词条时为 true
 */
export function isNormalGearEntry(entry: Pick<TranscendGearEntry, "affixId" | "gemId" | "socketIndex">): boolean {
    if (entry.gemId !== undefined || entry.socketIndex !== undefined) return false
    return getAffixDataUiType(entry.affixId) !== "unique"
}

/**
 * 判断条目是否是所在槽位的基础词条（Plan 1）。
 * @param entry 装备组条目
 * @param slotId 装备位
 * @returns 基础词条为 true
 */
export function isBaseGearEntry(entry: Pick<TranscendGearEntry, "affixId" | "gemId" | "socketIndex">, slotId: number): boolean {
    if (!isNormalGearEntry(entry)) return false
    return getSlotBaseAffixId(getTranscendSlotType(slotId)) === entry.affixId
}

/**
 * 统计某个装备位上已有的随机词条数（基础 / 宝石 / 专属条目不占上限）。
 * @param entries 装备组条目
 * @param slotId 装备位
 * @returns 随机词条数
 */
export function countSlotEntries(entries: readonly TranscendGearEntry[], slotId: number): number {
    return getSlotEntries(entries, slotId).filter(entry => isNormalGearEntry(entry) && !isBaseGearEntry(entry, slotId)).length
}

/** 词条 id → 词条数据的缓存；数据包换入会替换数组，按引用校验后重建 */
let affixMapCache: { source: unknown; map: Map<number, DnaSeasonAffix> } | null = null

/**
 * 取词条 id → 数据的映射（数据包换入后自动重建）。
 * @returns 词条映射
 */
function getAffixMap(): Map<number, DnaSeasonAffix> {
    if (!affixMapCache || affixMapCache.source !== affixes) {
        affixMapCache = { source: affixes, map: new Map(affixes.map(affix => [affix.id, affix])) }
    }
    return affixMapCache.map
}

/**
 * 把条目钳制到合法范围：未知词条保留结构、已知词条按 `totalValueLevel` 钳制档位，
 * 太古 / 最终精锻只在词条配置了对应公式时保留（与 `normalizeTranscendSettings` 同口径）。
 * @param entry 原始条目
 * @returns 钳制后的新条目
 */
export function clampGearEntry(entry: TranscendGearEntry): TranscendGearEntry {
    const slotId = Math.round(Number(entry.slotId))
    const affixId = Math.round(Number(entry.affixId))
    const roll = Number.isFinite(entry.rollLevel) ? Math.round(entry.rollLevel) : 1
    const masterworkLevel = Number.isFinite(entry.masterworkLevel) ? Math.round(entry.masterworkLevel) : 0
    const base = {
        slotId,
        affixId,
        masterworkLevel: Math.max(0, Math.min(TRANSCEND_MASTERWORK_MAX, masterworkLevel)),
    }
    const affix = getAffixMap().get(affixId)
    if (!affix) {
        return { ...base, rollLevel: Math.max(1, roll), ancient: entry.ancient === true, finalMasterwork: entry.finalMasterwork === true }
    }
    const total = Math.max(1, Math.round(affix.totalValueLevel || 1))
    return {
        ...base,
        rollLevel: Math.max(1, Math.min(total, roll)),
        ancient: entry.ancient === true && Boolean(affix.ancientFunc),
        finalMasterwork: entry.finalMasterwork === true && Boolean(affix.maxAffixUpdateFunc),
    }
}

/**
 * 按装备位、词条 id 排序，保证槽位与词条顺序稳定。
 * @param entries 条目列表
 * @returns 排序后的新数组
 */
export function sortGearEntries(entries: readonly TranscendGearEntry[]): TranscendGearEntry[] {
    return [...entries].sort((left, right) => left.slotId - right.slotId || left.affixId - right.affixId)
}

/** 添加词条的结果状态 */
export type GearEntryAddStatus = "added" | "exists" | "full" | "incompatible" | "unknown-affix"

/** 添加词条的结果 */
export interface GearEntryAddResult {
    entries: TranscendGearEntry[]
    status: GearEntryAddStatus
}

/**
 * 向装备组添加一条词条：同槽同词条去重、1 条基础 + 最多 4 条随机、词条必须与槽位兼容。
 * 新条目默认满档（roll = totalValueLevel）、0 精锻。
 * @param entries 现有条目
 * @param slotId 目标装备位
 * @param affixId 词条 id
 * @returns 新条目列表与结果状态
 */
export function addGearEntry(entries: readonly TranscendGearEntry[], slotId: number, affixId: number): GearEntryAddResult {
    const list = Array.isArray(entries) ? entries : []
    const id = Math.round(Number(affixId))
    const affix = getAffixMap().get(id)
    if (!affix) return { entries: [...list], status: "unknown-affix" }
    if (!isAffixCompatibleWithSlot(id, slotId)) return { entries: [...list], status: "incompatible" }
    if (getSlotEntries(list, slotId).some(entry => entry.affixId === id)) return { entries: [...list], status: "exists" }
    const isBase = getSlotBaseAffixId(getTranscendSlotType(slotId)) === id
    if (!isBase && countSlotEntries(list, slotId) >= TRANSCEND_MAX_AFFIXES_PER_SLOT) {
        return { entries: [...list], status: "full" }
    }
    const entry = clampGearEntry({
        slotId,
        affixId: id,
        rollLevel: Math.max(1, Math.round(affix.totalValueLevel || 1)),
        masterworkLevel: 0,
        ancient: false,
        finalMasterwork: false,
    })
    return { entries: sortGearEntries([...list, entry]), status: "added" }
}

/**
 * 更新指定槽位上的词条配置（档位/精锻/太古/最终精锻），写入前统一钳制。
 * @param entries 现有条目
 * @param slotId 装备位
 * @param affixId 词条 id
 * @param patch 需要更新的字段
 * @returns 新条目列表
 */
export function updateGearEntry(
    entries: readonly TranscendGearEntry[],
    slotId: number,
    affixId: number,
    patch: Partial<Omit<TranscendGearEntry, "slotId" | "affixId">>
): TranscendGearEntry[] {
    return sortGearEntries(
        entries.map(entry =>
            entry.slotId === slotId && entry.affixId === affixId ? clampGearEntry({ ...entry, ...patch, slotId, affixId }) : entry
        )
    )
}

/**
 * 从装备组移除一条词条。
 * @param entries 现有条目
 * @param slotId 装备位
 * @param affixId 词条 id
 * @returns 新条目列表
 */
export function removeGearEntry(entries: readonly TranscendGearEntry[], slotId: number, affixId: number): TranscendGearEntry[] {
    return entries.filter(entry => !(entry.slotId === slotId && entry.affixId === affixId))
}

/** 镶嵌物引用的词条 id 集合（宝石词缀的唯一判定来源，不维护 id 白名单） */
let inlayAffixIdsCache: { source: readonly unknown[]; ids: Set<number> } | null = null

/**
 * 取镶嵌物引用的词条 id 集合（数据包换入后自动重建）。
 * @returns 宝石词条 id 集合
 */
function getInlayAffixIds(): Set<number> {
    if (!inlayAffixIdsCache || inlayAffixIdsCache.source !== inlays) {
        const ids = new Set<number>()
        for (const inlay of inlays) {
            for (const key of Object.keys(inlay.affixIdsBySlot)) ids.add(Number(key))
        }
        inlayAffixIdsCache = { source: inlays, ids }
    }
    return inlayAffixIdsCache.ids
}

/**
 * 判断词条是否是宝石词缀：由镶嵌物引用，只能通过孔位进入装备，不能作为普通词条添加。
 * @param affixId 词缀 id
 * @returns 宝石词缀为 true
 */
export function isGemAffix(affixId: number): boolean {
    return getInlayAffixIds().has(Math.round(affixId))
}

/**
 * 由词缀数据本身判定界面分类：镶嵌物引用 → 宝石；其余按 plan 4 → 专属、否则普通。
 * @param affixId 词缀 id
 * @returns 词缀类型；数据缺失时为 unknown
 */
export function getAffixDataUiType(affixId: number): TranscendAffixUiType {
    if (isGemAffix(affixId)) return "gem"
    const affix = affixes.find(item => item.id === Math.round(affixId))
    if (!affix) return "unknown"
    return affix.plan === 4 ? "unique" : "normal"
}

/**
 * 判断词条是否能进入普通词条列表：排除宝石（镶嵌物引用）、专属（plan 4）、
 * 槽位不兼容与角色专属不匹配。
 * @param affix 词条数据
 * @param slotId 装备位
 * @param charId 当前角色 id（0 表示未选，不做角色过滤）
 * @param keyword 搜索关键词（词条描述/池名/属性名/id）
 * @param isGem 宝石判定（默认查镶嵌物数据，测试可注入）
 * @returns 可加入普通词条列表时为 true
 */
export function isCompatibleNormalAffix(
    affix: DnaSeasonAffix,
    slotId: number,
    charId = 0,
    keyword = "",
    isGem: (affixId: number) => boolean = isGemAffix
): boolean {
    if (affix.plan === 4 || isGem(affix.id)) return false
    if (!isAffixCompatibleWithSlot(affix.id, slotId)) return false
    if (charId > 0 && affix.charIds?.length && !affix.charIds.includes(charId)) return false
    const query = keyword.trim().toLowerCase()
    if (!query) return true
    if (String(affix.id).includes(query)) return true
    if ((affix.desc ?? "").toLowerCase().includes(query)) return true
    if ((affix.poolName ?? "").toLowerCase().includes(query)) return true
    return (affix.addAttrs ?? []).some(attr => attr.attr.toLowerCase().includes(query))
}

/**
 * 取某槽位可选的词条：按 `isCompatibleNormalAffix` 过滤。
 * 宝石词缀只通过孔位进入装备、专属词缀只随暗金物品出现，二者都不进入普通词条列表。
 * @param slotId 装备位
 * @param charId 当前角色 id（0 表示未选，不做角色过滤）
 * @param keyword 搜索关键词（词条描述/池名/属性名/id）
 * @returns 兼容词条列表
 */
export function getCompatibleAffixes(slotId: number, charId = 0, keyword = ""): DnaSeasonAffix[] {
    return affixes.filter(affix => isCompatibleNormalAffix(affix, slotId, charId, keyword))
}

/** 构筑位的计算状态 */
export type TranscendSideState = "ok" | "invalid" | "empty" | "disabled" | "failed"

/** 单个构筑位的状态（未启用 / 未选角色 / 无法计算都可见） */
export interface TranscendSideStatus {
    side: TranscendSlotGroup
    charId: number
    state: TranscendSideState
}

/** 单段构筑的计算结果：未启用/无角色/失败时为 null */
export interface TranscendSideResult {
    side: TranscendSlotGroup
    charId: number
    build: TranscendSideBuild
    damage: number | null
    /** 目标表达式在该段上的校验错误 */
    error: string | null
}

/** 三段 + 合计的计算快照 */
export interface TranscendTeamSnapshot {
    /** 归一化后的设置（缓存键与计算共用同一次归一化） */
    settings: TranscendBuildSettings
    main: TranscendSideResult | null
    assist1: TranscendSideResult | null
    assist2: TranscendSideResult | null
    /** 每段的状态（含未启用 / 未选角色与失败原因） */
    sideStates: Record<TranscendSlotGroup, TranscendSideStatus>
    /** 启用且无错误的段伤害之和；启用段里存在错误 / 失败或无有效段时为 null */
    total: number | null
    /** 合计不可用的原因（表达式错误优先） */
    totalError: string | null
    /** 启用段中的目标表达式错误（按主控 → 协战顺序取第一个） */
    targetError: string | null
}

/** 单段计算结果与状态 */
interface ComputedSide {
    result: TranscendSideResult | null
    status: TranscendSideStatus
}

/**
 * 计算单段构筑：无角色 / 未启用时返回空结果并记录状态；
 * 构建失败（未知武器等）与表达式错误分别标记为 failed / invalid。
 * 目标表达式用该构筑位自己的值校验与求值。
 * @param settings 归一化后的设置
 * @param side 构筑位
 * @returns 单段结果与状态
 */
function computeSide(settings: TranscendBuildSettings, side: TranscendSlotGroup): ComputedSide {
    const loadout = settings[side]
    if (loadout.charId <= 0) return { result: null, status: { side, charId: 0, state: "empty" } }
    if (!loadout.enabled) {
        return { result: null, status: { side, charId: loadout.charId, state: "disabled" } }
    }
    try {
        const build = createTranscendBuild(settings, side)
        if (!build) return { result: null, status: { side, charId: loadout.charId, state: "failed" } }
        const error = build.build.validateAST(loadout.targetFunction) || null
        const damage = error ? null : build.build.calculate()
        if (!error && !Number.isFinite(damage)) {
            return { result: null, status: { side, charId: loadout.charId, state: "failed" } }
        }
        return {
            result: { side, charId: loadout.charId, build, damage: error ? null : damage, error },
            status: { side, charId: loadout.charId, state: error ? "invalid" : "ok" },
        }
    } catch (cause) {
        console.warn(`升华构筑 ${side} 计算失败`, cause)
        return { result: null, status: { side, charId: loadout.charId, state: "failed" } }
    }
}

/**
 * 计算三段结果与合计（主线程）。
 * 未选角色 / 已禁用的段不参与合计与错误判定；启用的段里任一表达式无效或构建失败时合计为 null，
 * 避免把「缺一段」的伤害当成合计。
 * @param settings 构筑设置（可含脏数据，内部先归一化）
 * @returns 计算快照
 */
export function computeTranscendTeamSnapshot(settings: TranscendBuildSettings): TranscendTeamSnapshot {
    const normalized = normalizeTranscendBuildSettings(settings)
    const main = computeSide(normalized, "main")
    const assist1 = computeSide(normalized, "assist1")
    const assist2 = computeSide(normalized, "assist2")
    const sides = [main, assist1, assist2]
    const activeSides = sides.filter(side => side.status.state !== "empty" && side.status.state !== "disabled")
    const activeResults = activeSides.map(side => side.result).filter((result): result is TranscendSideResult => !!result)
    const targetError = activeResults.find(result => result.error)?.error ?? null
    const blocked = activeSides.some(side => side.status.state === "invalid" || side.status.state === "failed")
    let total: number | null = blocked ? null : activeResults.reduce((sum, result) => sum + (result.damage ?? 0), 0)
    if (!blocked && activeResults.length === 0) total = null
    return {
        settings: normalized,
        main: main.result,
        assist1: assist1.result,
        assist2: assist2.result,
        sideStates: { main: main.status, assist1: assist1.status, assist2: assist2.status },
        total,
        totalError: blocked ? targetError : null,
        targetError,
    }
}

/** 计算快照的构造器（测试可注入以验证缓存行为） */
export type TranscendTeamBuilder = (settings: TranscendBuildSettings) => TranscendTeamSnapshot

/** 按设置序列化缓存的计算器 */
export interface TranscendTeamCache {
    /**
     * 取设置对应的计算快照；序列化结果未变化时直接复用上次快照。
     * @param settings 构筑设置
     * @returns 计算快照
     */
    get(settings: TranscendBuildSettings): TranscendTeamSnapshot
    /** 清空缓存（重置构筑后调用） */
    clear(): void
}

/**
 * 创建三段计算缓存：设置未变时复用快照，切换结果模式不触发重算。
 * @param build 快照构造器（缺省为真实计算）
 * @returns 缓存实例
 */
export function createTranscendTeamCache(build: TranscendTeamBuilder = computeTranscendTeamSnapshot): TranscendTeamCache {
    let cacheKey = ""
    let cached: TranscendTeamSnapshot | null = null
    return {
        get(settings: TranscendBuildSettings): TranscendTeamSnapshot {
            const nextKey = serializeTranscendBuildSettings(settings)
            if (cached && nextKey === cacheKey) return cached
            cacheKey = nextKey
            cached = build(settings)
            return cached
        },
        clear() {
            cacheKey = ""
            cached = null
        },
    }
}

/** 结果视图的单段展示数据 */
export interface TranscendModeResult {
    mode: TranscendResultMode
    /** 是否有有效段（该段已启用并构建成功；合计模式为任一有效段） */
    active: boolean
    damage: number | null
    error: string | null
    /** 当前模式的状态（合计模式为 total_unavailable 时表示存在无效段） */
    state: TranscendSideState
}

/**
 * 按结果模式取伤害与可用状态；合计模式在存在无效 / 失败段时返回 null 伤害。
 * 没有有效结果时区分「启用段全部无法计算」（failed）与「没有启用段」（empty），
 * 避免 failed-only 被当成未启用展示。
 * @param snapshot 计算快照
 * @param mode 结果模式
 * @returns 当前模式的展示数据
 */
export function getModeResult(snapshot: TranscendTeamSnapshot, mode: TranscendResultMode): TranscendModeResult {
    if (mode === "total") {
        // 主控可禁用：任一段有效即可展示合计
        const active = Boolean(snapshot.main || snapshot.assist1 || snapshot.assist2)
        // 存在启用段（有角色且未禁用）但没有任何有效结果 → 这些段都是 failed
        const hasEnabledSide = (["main", "assist1", "assist2"] as const).some(side => {
            const status = snapshot.sideStates[side]
            return status.charId > 0 && status.state !== "disabled"
        })
        const state: TranscendSideState =
            snapshot.total !== null ? "ok" : snapshot.totalError ? "invalid" : hasEnabledSide ? "failed" : "empty"
        return {
            mode,
            active,
            damage: snapshot.total,
            error: snapshot.total === null ? (snapshot.totalError ?? null) : null,
            state,
        }
    }
    const side = snapshot[mode]
    return { mode, active: Boolean(side), damage: side?.damage ?? null, error: side?.error ?? null, state: snapshot.sideStates[mode].state }
}

/**
 * 结果行标签所需的最小快照结构：升华三段快照（`TranscendTeamSnapshot`）与原版三人快照
 * （`CharTeamSnapshot`）都结构兼容，两侧共用同一对标签纯函数。
 */
export interface TeamSnapshotLike {
    sideStates: Record<TranscendSlotGroup, { state: TranscendSideState }>
    settings: Record<TranscendSlotGroup, { baseName: string }>
}

/**
 * 取唯一参与合计的构筑位：已选角色且未禁用的段恰好一段时返回该段，否则返回 null。
 * 表达式无效 / 构建失败仍算参与（与合计统计口径一致），仅用于结果行标签。
 * @param snapshot 计算快照（升华或原版三人快照）
 * @returns 唯一参与的构筑位；0 段或多段时为 null
 */
export function getSingleParticipatingSide(snapshot: TeamSnapshotLike): TranscendSlotGroup | null {
    let found: TranscendSlotGroup | null = null
    for (const side of TRANSCEND_BUILD_SIDES) {
        const state = snapshot.sideStates[side].state
        if (state === "empty" || state === "disabled") continue
        if (found) return null
        found = side
    }
    return found
}

/**
 * 取唯一参与段的所选技能名（原始 baseName，调用方决定是否本地化）：
 * 恰好一段参与且该段 baseName 非空时返回，否则 null（调用方显示「合计」）。
 * @param snapshot 计算快照（升华或原版三人快照）
 * @returns 技能名；多段 / 0 段 / 空 baseName 时为 null
 */
export function getSingleParticipatingSkillName(snapshot: TeamSnapshotLike): string | null {
    const side = getSingleParticipatingSide(snapshot)
    if (!side) return null
    return snapshot.settings[side].baseName || null
}

/**
 * 构筑位的界面文案键。
 * @param side 构筑位
 * @returns i18n 键
 */
export function getTranscendSideLabelKey(side: TranscendSlotGroup): string {
    if (side === "main") return "transcend-build.mode_main"
    return side === "assist1" ? "transcend-build.mode_assist1" : "transcend-build.mode_assist2"
}

/**
 * 构筑位状态对应的界面文案键。
 * @param state 构筑位状态
 * @returns i18n 键
 */
export function getTranscendSideStateLabelKey(state: TranscendSideState): string {
    if (state === "ok") return "transcend-build.state_ok"
    if (state === "invalid") return "transcend-build.state_invalid"
    if (state === "empty") return "transcend-build.state_empty"
    if (state === "disabled") return "transcend-build.state_disabled"
    return "transcend-build.state_failed"
}

/** 协战角色候选项（与原构筑页一致，按元素分组的原始条目） */
export interface TranscendTeamCharOption {
    value: number
    label: string
    elm: string
    icon: string
}

/**
 * 构造协战角色候选。
 *
 * 必须以角色条目数组为源：`charMap` 同时按名称与 id 建键，遍历其 values() 会让每个角色重复两次。
 * @param chars 角色条目表（传数据层 `charData`）
 * @returns 每个角色一条的候选项
 */
export function buildTeamCharOptions(chars: readonly Char[]): TranscendTeamCharOption[] {
    return chars
        .filter(char => char.id > 0)
        .map(char => ({ value: char.id, label: char.名称, elm: char.属性, icon: LeveledChar.url(char.icon) }))
}

/** 三侧 BUFF 过滤上下文 */
export interface TranscendBuffContexts {
    /** 列出全部可用 BUFF 的合并上下文（任一构筑位可选即可选） */
    selectable: ReturnType<typeof createBuffSelectContext>
    /** 各构筑位的上下文（本位角色/武器 → `mainIds`，其他位 → `phantomIds`） */
    sides: Record<TranscendSlotGroup, ReturnType<typeof createBuffSelectContext>>
    /** 主控自身（不含协战来源）的上下文：用于区分手动选择与协战派生 BUFF */
    mainOwn: ReturnType<typeof createBuffSelectContext>
}

/**
 * 从升华构筑设置构建 BUFF 过滤上下文（协战也参与：限定 BUFF 不再只认主控）。
 * @param settings 构筑设置
 * @returns 合并上下文、逐位上下文与主控自身上下文
 */
export function createTranscendBuffContexts(settings: TranscendBuildSettings): TranscendBuffContexts {
    const loadouts = TRANSCEND_BUILD_SIDES.map(side => {
        const loadout = settings[side]
        const char = charMap.get(loadout.charId)
        return {
            side,
            ids: [loadout.charId, loadout.meleeWeapon, loadout.rangedWeapon].filter(id => id > 0),
            elm: char?.属性 ?? "",
        }
    })
    const sides = {} as TranscendBuffContexts["sides"]
    for (const current of loadouts) {
        const others = loadouts.filter(item => item.side !== current.side)
        sides[current.side] = createBuffSelectContext({
            charElm: current.elm,
            mainIds: current.ids,
            // 与数据层注入同口径：只有主控接收队友来源的 BUFF，协战不重复叠加
            phantomIds: current.side === "main" ? others.flatMap(item => item.ids) : [],
            elements: [current.elm],
        })
    }
    const main = loadouts.find(item => item.side === "main")
    const mainOwn = createBuffSelectContext({
        charElm: main?.elm ?? "",
        mainIds: main?.ids ?? [],
        phantomIds: [],
        elements: [main?.elm ?? ""],
    })
    return { selectable: unionBuffSelectContexts(loadouts.map(item => sides[item.side])), sides, mainOwn }
}

/** 升华构筑可选的 BUFF 选项 */
export interface TranscendBuffOption {
    name: string
    buff: Buff
    /** 已配置（或默认）的等级 */
    lv: number
    /** 已配置的覆盖率（0-1） */
    coverage: number
    limit?: string | number
    description?: string
}

/** 是否是可进入选择器的手动 BUFF（排除魔灵 / 潜质相关与魔之楔提供） */
function isSelectableBuffData(buff: Buff): boolean {
    return !isPetRelatedBuffName(buff.名称) && !isModProvidedBuff(buff)
}

/**
 * 构造 BUFF 选项（等级 / 覆盖率取自已保存的选择）。
 * @param buff BUFF 数据
 * @param selected 已保存的选择
 * @returns 选项
 */
function toBuffOption(buff: Buff, selected: Map<string, [string, number, number?]>): TranscendBuffOption {
    const saved = selected.get(buff.名称)
    return {
        name: buff.名称,
        buff,
        lv: saved?.[1] ?? Math.max(1, Math.round(buff.mx || 1)),
        coverage: saved?.[2] ?? 1,
        limit: buff.限定,
        description: buff.描述,
    }
}

/** 已保存 BUFF 的查询表 */
function getSelectedBuffMap(settings: TranscendBuildSettings): Map<string, [string, number, number?]> {
    return new Map(normalizeBuffSelections(settings.buffs).map(item => [item[0], item]))
}

/**
 * 列出升华构筑可选的 BUFF：排除魔灵 / 潜质相关与魔之楔提供（如「全盛·振奋」），
 * 并按三侧角色/武器上下文取并集（任一构筑位可选即可选）；自定义 BUFF 与其他 BUFF 同等可选。
 * @param settings 构筑设置
 * @returns 可选项
 */
export function getTranscendBuffOptions(settings: TranscendBuildSettings): TranscendBuffOption[] {
    const contexts = createTranscendBuffContexts(settings)
    const selected = getSelectedBuffMap(settings)
    return buffData
        .filter(isSelectableBuffData)
        .filter(buff => isBuffSelectable(buff, contexts.selectable))
        .map(buff => toBuffOption(buff, selected))
}

/** 协战来源 BUFF 及其归属协战位 */
export interface TranscendAssistBuffSource {
    option: TranscendBuffOption
    /** 持有来源角色/武器的协战位；来源无法定位时为空（仍按只读来源处理） */
    sides: TranscendSlotGroup[]
}

/**
 * 取 BUFF 来源的协战位：限定角色 / 元素或来源角色 / 武器 id 落在该协战位上。
 * @param buff BUFF 数据
 * @param settings 构筑设置
 * @returns 归属的协战位（可能为空）
 */
function getAssistBuffSourceSides(buff: Buff, settings: TranscendBuildSettings): TranscendSlotGroup[] {
    const sides: TranscendSlotGroup[] = []
    for (const side of ["assist1", "assist2"] as const) {
        const loadout = settings[side]
        const char = charMap.get(loadout.charId)
        if (buff.限定) {
            if (typeof buff.限定 === "number") {
                if (loadout.charId === buff.限定) sides.push(side)
                continue
            }
            const limitChar = charMap.get(buff.限定)
            if (limitChar ? loadout.charId === limitChar.id : char?.属性 === buff.限定) sides.push(side)
            continue
        }
        if (buff.id === undefined) continue
        if ([loadout.charId, loadout.meleeWeapon, loadout.rangedWeapon].includes(buff.id)) sides.push(side)
    }
    return sides
}

/**
 * 判断 BUFF 是否由协战派生：主控自身可选的不算；
 * 必须能在主控（含协战 phantom）或该协战本位上下文中命中，且来源确实落在协战位上。
 * @param buff BUFF 数据
 * @param contexts 三侧上下文
 * @param sides 该 BUFF 归属的协战位
 * @returns 协战来源时为 true
 */
function isAssistProvidedBuff(buff: Buff, contexts: TranscendBuffContexts, sides: readonly TranscendSlotGroup[]): boolean {
    if (!sides.length || isBuffSelectable(buff, contexts.mainOwn)) return false
    if (isBuffSelectable(buff, contexts.sides.main)) return true
    return sides.some(side => isBuffSelectable(buff, contexts.sides[side]))
}

/**
 * 列出协战来源 BUFF：由协战角色 / 武器派生、主控自身不可选，
 * 并标注持有来源的协战位。分享页据此标注「协战来源」，队伍变化时据此增删。
 * @param settings 构筑设置
 * @returns 来源选项与归属协战位
 */
export function getTranscendAssistBuffSources(settings: TranscendBuildSettings): TranscendAssistBuffSource[] {
    const contexts = createTranscendBuffContexts(settings)
    const selected = getSelectedBuffMap(settings)
    return buffData.filter(isSelectableBuffData).flatMap(buff => {
        const sides = getAssistBuffSourceSides(buff, settings)
        return isAssistProvidedBuff(buff, contexts, sides) ? [{ option: toBuffOption(buff, selected), sides }] : []
    })
}

/**
 * 取协战来源 id（协战角色 / 武器）：队伍来源集合变化时用于增删派生 BUFF。
 * @param settings 构筑设置
 * @returns 去重后的来源 id
 */
export function getTranscendTeamBuffSourceIds(settings: TranscendBuildSettings): number[] {
    const ids = new Set<number>()
    for (const side of ["assist1", "assist2"] as const) {
        const loadout = settings[side]
        for (const id of [loadout.charId, loadout.meleeWeapon, loadout.rangedWeapon]) {
            if (Number.isFinite(id) && id > 0) ids.add(Math.round(id))
        }
    }
    return [...ids]
}

/**
 * 由协战来源 id 推导助战 BUFF（默认满级）：BUFF 数据 `id` 命中来源角色 / 武器，
 * 剔除魔灵 / 潜质相关与魔之楔提供的条目（与构筑页手动选择的候选口径一致）。
 * @param ids 协战角色 / 武器 id
 * @returns 助战 BUFF 条目
 */
export function deriveTranscendTeamBuffs(ids: readonly unknown[]): [string, number][] {
    const idSet = new Set(ids.filter((id): id is number => typeof id === "number" && id > 0))
    if (idSet.size === 0) return []
    const result: [string, number][] = []
    const seen = new Set<string>()
    for (const buff of buffData) {
        if (typeof buff.id !== "number" || !idSet.has(buff.id)) continue
        if (!isSelectableBuffData(buff) || seen.has(buff.名称)) continue
        const level = Math.max(1, Math.round(buff.mx || 1))
        seen.add(buff.名称)
        result.push([buff.名称, level])
    }
    return result
}

/**
 * 队伍来源集合变化时同步协战来源 BUFF：移除旧来源独有的条目，追加新来源条目，
 * 同名条目保留现有等级（用户可随后手动改级 / 移除，与原构筑页一致）。
 * @param buffs 当前 BUFF 列表
 * @param previousIds 变更前的协战来源 id
 * @param nextIds 变更后的协战来源 id
 * @returns 同步后的 BUFF 列表
 */
export function reconcileTranscendTeamBuffs(
    buffs: readonly [string, number, number?][],
    previousIds: readonly unknown[],
    nextIds: readonly unknown[]
): [string, number, number?][] {
    const previousNames = new Set(deriveTranscendTeamBuffs(previousIds).map(([name]) => name))
    const nextEntries = deriveTranscendTeamBuffs(nextIds)
    const nextNames = new Set(nextEntries.map(([name]) => name))
    const result = buffs
        .filter(([name]) => !previousNames.has(name) || nextNames.has(name))
        .map(buff => [...buff] as [string, number, number?])
    const existing = new Set(result.map(([name]) => name))
    for (const [name, level] of nextEntries) {
        if (existing.has(name)) continue
        existing.add(name)
        result.push([name, level])
    }
    return result
}

/**
 * 手动 BUFF 选择的轻量归一化（UI 侧去重与等级/覆盖率钳制，与数据层注入保持同一口径）。
 * @param value 原始列表
 * @returns 归一化后的列表
 */
export function normalizeBuffSelections(value: unknown): [string, number, number?][] {
    if (!Array.isArray(value)) return []
    const map = new Map<string, [string, number, number?]>()
    for (const item of value) {
        if (!Array.isArray(item) || item.length < 2) continue
        const name = typeof item[0] === "string" ? item[0].trim() : ""
        const level = Math.round(Number(item[1]))
        if (!name || !Number.isFinite(level) || level <= 0) continue
        const rawCoverage = Number(item[2])
        map.set(name, Number.isFinite(rawCoverage) && rawCoverage < 1 ? [name, level, +Math.max(0, rawCoverage).toFixed(6)] : [name, level])
    }
    return [...map.values()]
}

/** 协战单槽选择的写入结果 */
export interface SingleWeaponSelection {
    meleeWeapon: number
    rangedWeapon: number
}

/**
 * 解析协战单槽的武器选择：按弹窗内最后改动的槽位取值，武器类型决定写入近战还是远程槽，另一槽清空。
 * @param lastChangedSlot 最后改动的槽位（空串表示未改动，取第一个非空草稿）
 * @param pendingMelee 近战槽草稿
 * @param pendingRanged 远程槽草稿
 * @returns 写回 loadout 的两个武器字段
 */
export function resolveSingleWeaponSelection(
    lastChangedSlot: "" | "melee" | "ranged",
    pendingMelee: number,
    pendingRanged: number
): SingleWeaponSelection {
    const weaponId =
        lastChangedSlot === "melee" ? pendingMelee : lastChangedSlot === "ranged" ? pendingRanged : pendingMelee || pendingRanged
    if (weaponId <= 0) return { meleeWeapon: 0, rangedWeapon: 0 }
    const isMelee = weaponMap.get(weaponId)?.类型.includes("近战") ?? false
    return isMelee ? { meleeWeapon: weaponId, rangedWeapon: 0 } : { meleeWeapon: 0, rangedWeapon: weaponId }
}

/** 动态 BUFF 与武器基础属性的对应关系（与老构筑页 `WeaponTab` 同口径） */
const DYNAMIC_BASE_ATTRIBUTE_MAP: Record<string, string> = {
    攻击: "基础攻击",
    暴击: "基础暴击",
    暴伤: "基础暴伤",
    触发: "基础触发",
    攻速: "射速",
    装填: "基础装填",
    弹匣: "基础弹匣",
    弹药: "基础弹药",
}

/**
 * 把动态 BUFF 造成的武器面板差值归一化为等效加成比例：基础攻击等平值除以基础值，比例值原样返回。
 * @param weapon 武器基础数据
 * @param key 武器属性键名
 * @param value 动态 BUFF 造成的面板差值
 * @returns 用于 tooltip 展示的等效加成
 */
export function getDynamicWeaponDisplayValue(weapon: Record<string, unknown> | null | undefined, key: string, value: number): number {
    const baseAttribute = DYNAMIC_BASE_ATTRIBUTE_MAP[key]
    const baseValue = baseAttribute ? weapon?.[baseAttribute] : undefined
    return typeof baseValue === "number" && baseValue !== 0 ? value / baseValue : value
}

/** 数据层告警模板（`packages/data/transcend.ts` 的中文原文）→ i18n 键与参数 */
const WARNING_PATTERNS: { pattern: RegExp; key: string; params: (match: RegExpMatchArray) => Record<string, string> }[] = [
    {
        pattern: /^天赋「(.+)」\((\d+)\) 的减伤数值为正（(.+)），保留原符号$/,
        key: "transcend-build.warn_talent_negate",
        params: match => ({ name: match[1], id: match[2], value: match[3] }),
    },
    {
        pattern: /^装备位 (\d+) 不属于 (\w+) 分组，已忽略$/,
        key: "transcend-build.warn_slot_group",
        params: match => ({ slot: match[1], side: match[2] }),
    },
    { pattern: /^词条 (\d+) 不存在，已忽略$/, key: "transcend-build.warn_affix_missing", params: match => ({ id: match[1] }) },
    {
        pattern: /^词条 (\d+) 不能装备在装备位 (\d+)（槽型 (\d+)），已忽略$/,
        key: "transcend-build.warn_slot_incompatible",
        params: match => ({ id: match[1], slot: match[2], slotType: match[3] }),
    },
    {
        pattern: /^词条 (\d+) 仅适用于角色 (.+)，当前角色 (\d+) 已忽略$/,
        key: "transcend-build.warn_char_only",
        params: match => ({ id: match[1], chars: match[2], charId: match[3] }),
    },
    {
        pattern: /^词条 (\d+) 的减伤数值为正（(.+)），保留原符号$/,
        key: "transcend-build.warn_affix_negate",
        params: match => ({ id: match[1], value: match[2] }),
    },
    {
        pattern: /^专属词缀 (\d+) 缺少手写映射（UNIQUE_AFFIX_MAP），未计入$/,
        key: "transcend-build.warn_missing_mapping",
        params: match => ({ id: match[1] }),
    },
    {
        pattern: /^手写 BUFF「(.+)」不存在（词条 (\d+)）$/,
        key: "transcend-build.warn_missing_buff",
        params: match => ({ name: match[1], id: match[2] }),
    },
    { pattern: /^词条 (\d+) 没有可计算的属性$/, key: "transcend-build.warn_no_attrs", params: match => ({ id: match[1] }) },
]

/**
 * 把数据层的中文告警本地化：已知模板走 i18n，其余原文返回（调用方可再过 `gt`）。
 * @param text 数据层告警原文
 * @param t i18n 翻译函数
 * @returns 本地化后的文案
 */
export function localizeTranscendWarning(text: string, t: (key: string, options?: Record<string, string>) => string): string {
    for (const item of WARNING_PATTERNS) {
        const match = text.match(item.pattern)
        if (match) return t(item.key, item.params(match))
    }
    return text
}

/**
 * 独立升华构筑的本地存储键。
 * @param charId 主控角色 id
 * @returns 存储键
 */
export function getTranscendBuildStorageKey(charId: number): string {
    return `transcendBuild.${charId}`
}

/**
 * 解析角色专武：页面注入与默认值共用的唯一实现（只认近战/远程）。
 * @param charId 角色 id
 * @returns 专武信息；无专武时为 null
 */
export function getSignatureWeaponForChar(charId: number): SignatureWeapon | null {
    const char = charMap.get(charId)
    if (!char?.专武) return null
    const weapon = weaponData.find(item => item.id === char.专武)
    const type = weapon?.类型[0]
    if (type !== "近战" && type !== "远程") return null
    return { id: char.专武, type }
}

/** 页面默认构筑选项 */
export interface TranscendPageDefaultOptions {
    /** 「包含未开放阶段（理论值）」：true 时天赋默认取 300 节点，否则只取当前版本可达阶段 */
    includeUnreleasedStages?: boolean
    /** 专武解析回调（页面可注入）；缺省使用本模块内置口径 */
    getSignatureWeapon?: (charId: number) => SignatureWeapon | null
}

/**
 * 页面口径的默认构筑：主控专武 + 首个角色技能 + 天赋默认值。
 * 新建 / 重置 / 列表比较共用这一份实现；天赋只开当前版本可达阶段，
 * 显式开启理论阶段时才包含未开放阶段（300 节点）。
 * @param charId 角色 id
 * @param options 理论阶段开关与专武解析回调
 * @returns 默认构筑设置
 */
export function getDefaultTranscendBuildSettings(charId: number, options: TranscendPageDefaultOptions = {}): TranscendBuildSettings {
    const signatureWeapon = options.getSignatureWeapon ? options.getSignatureWeapon(charId) : getSignatureWeaponForChar(charId)
    const settings = createDefaultTranscendBuildSettings(charId, signatureWeapon)
    const firstName = charMap.get(charId)?.技能?.[0]?.名称
    if (firstName) settings.main.baseName = firstName
    const talentLevels = options.includeUnreleasedStages ? createMaxedTranscendTalentLevels() : createMaxedReachableTalentLevels()
    if (talentLevels.length) {
        settings.transcend.enabled = true
        settings.transcend.talentLevels = talentLevels
    }
    return settings
}

/**
 * 「全部解锁」的合并口径：把目标满级表并到当前等级上，保留其它阶段已有投入。
 * @param current 当前天赋等级表
 * @param maxed 目标满级表（可达口径或理论口径）
 * @returns 按节点 id 升序的合并等级表
 */
export function mergeUnlockedTalentLevels(current: readonly [number, number][], maxed: readonly [number, number][]): [number, number][] {
    const merged = new Map(current.map(([talentId, level]) => [talentId, level] as const))
    for (const [talentId, level] of maxed) merged.set(talentId, level)
    return [...merged.entries()].sort((left, right) => left[0] - right[0])
}

/**
 * 「全部解锁」使用的天赋等级表：按理论开关选择可达 / 理论满级口径，并保留当前其它阶段投入。
 * @param current 当前天赋等级表
 * @param includeUnreleasedStages 是否包含未开放阶段（理论值）
 * @returns 合并后的等级表
 */
export function getUnlockAllTalentLevels(current: readonly [number, number][], includeUnreleasedStages: boolean): [number, number][] {
    const maxed = includeUnreleasedStages ? createMaxedTranscendTalentLevels() : createMaxedReachableTalentLevels()
    return mergeUnlockedTalentLevels(current, maxed)
}

/**
 * 目标满级表：理论开关开启时取全部节点满级，否则只取当前版本可达阶段满级。
 * @param includeUnreleasedStages 是否包含未开放阶段（理论值）
 * @returns 目标 `[talentId, level]` 满级表
 */
function getTargetTalentMaxLevels(includeUnreleasedStages: boolean): [number, number][] {
    return includeUnreleasedStages ? createMaxedTranscendTalentLevels() : createMaxedReachableTalentLevels()
}

/**
 * 判断目标满级表是否已全部达到：目标非空且每个目标节点等级等于 maxLevel；
 * 目标之外的额外投入不影响判定（仍视为已满级）。
 * @param levels 当前天赋等级表
 * @param includeUnreleasedStages 是否包含未开放阶段（理论值）
 * @returns 目标表为空或任一节点未满级时为 false
 */
export function areAllTargetTalentsMaxed(levels: readonly [number, number][], includeUnreleasedStages: boolean): boolean {
    const target = getTargetTalentMaxLevels(includeUnreleasedStages)
    if (!target.length) return false
    const levelMap = new Map(levels)
    return target.every(([talentId, level]) => (levelMap.get(talentId) ?? 0) === level)
}

/**
 * 「全部解锁 / 清空全部」开关：目标已满级 → 清空所有等级（含目标外阶段投入）；
 * 否则补满目标并保留目标外投入。目标表为空时不清空，按合并口径返回当前等级表。
 * @param levels 当前天赋等级表
 * @param includeUnreleasedStages 是否包含未开放阶段（理论值）
 * @returns 切换后的等级表（按节点 id 升序）
 */
export function toggleAllTalentLevels(
    levels: readonly [number, number][],
    includeUnreleasedStages: boolean
): [number, number][] {
    return areAllTargetTalentsMaxed(levels, includeUnreleasedStages) ? [] : getUnlockAllTalentLevels(levels, includeUnreleasedStages)
}

/**
 * 构建页展示的阶段警告：过滤当前查看阶段的 `unreleased`（该阶段由 `talent_stage_locked` 静态说明替代），
 * `unreachable` 一律保留。
 * @param levels 已投入的天赋等级表
 * @param activeStageId 当前查看的阶段 id
 * @returns 需要展示的警告列表
 */
export function getVisibleTalentStageWarnings(
    levels: readonly (readonly [number, number])[],
    activeStageId: number
): TranscendTalentStageWarning[] {
    return getTalentStageWarnings(levels).filter(warning => !(warning.reason === "unreleased" && warning.stageId === activeStageId))
}

/**
 * 判断本地是否已保存该角色的升华构筑（与默认状态相同视为未保存）。
 * 比较基线固定为「可达口径」默认构筑：理论偏好（localStorage 开关）只影响新建 / 重置，
 * 因此理论口径下重置持久化的 300 节点会与基线不同、在列表中显示为「已保存」——属预期口径差异。
 * @param charId 主控角色 id
 * @returns 存在有效自定义为 true；非浏览器环境或解析失败为 false
 */
export function hasSavedTranscendBuild(charId: number): boolean {
    if (typeof localStorage === "undefined") return false
    try {
        const raw = localStorage.getItem(getTranscendBuildStorageKey(charId))
        if (raw === null) return false
        const stored = serializeTranscendBuildSettings(JSON.parse(raw))
        return stored !== serializeTranscendBuildSettings(getDefaultTranscendBuildSettings(charId))
    } catch {
        return false
    }
}
