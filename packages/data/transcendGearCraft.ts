import {
    type DnaSeasonCraft,
    type DnaSeasonInlay,
    type DnaSeasonRarity,
    type DnaSeasonSlot,
    affixes as defaultAffixes,
    crafts as defaultCrafts,
    inlays as defaultInlays,
    rarities as defaultRarities,
    seasons as defaultSeasons,
    slots as defaultSlots,
} from "./d"
import {
    canGearAffixBeFinal,
    getGearItemSocketCount,
    getSlotBaseAffixId,
    getSlotMaxInlayCount,
    getTranscendAffixDedupeClass,
    resolveCraftTargets,
    resolveEnchantSnapshot,
    resolveInlayAffixId,
    resolveLegacyGearCraftState,
    TRANSCEND_MASTERWORK_MAX,
    TRANSCEND_MAX_ITEM_AFFIXES,
    type TranscendCraftTargetContext,
    type TranscendGearAffixRoll,
    type TranscendGearAffixSource,
    type TranscendGearCraftState,
    type TranscendGearEnchantSnapshot,
    type TranscendGearItemConfig,
} from "./transcendGear"

/**
 * 升华装备 craft 规则层（纯函数）：成本 / 可用性 / 应用操作，全部读 `DnaSeasonCraft` 等数据表，
 * 不写死资源 id / 品质集合 / 次数上限。本地没有资源账户与账号进度，成本与条件只做展示与模拟，
 * 不扣材料、不伪造进度。上游行为口径见 `.docs/transcendence-db/RESEARCH-CRAFT.md`。
 */

/** craft id（上游 `DNASeasonEquipCraft`）：精锻 / 最终精锻 / 淬炼 / 附魔 / 添加镶孔 / 镶嵌 / 拆取 */
export const TRANSCEND_CRAFT_MASTERWORK = 1
export const TRANSCEND_CRAFT_FINAL_MASTERWORK = 2
export const TRANSCEND_CRAFT_TEMPERING = 3
export const TRANSCEND_CRAFT_ENCHANT = 4
export const TRANSCEND_CRAFT_CREATE_SOCKET = 5
export const TRANSCEND_CRAFT_EQUIP_INLAY = 6
export const TRANSCEND_CRAFT_UNEQUIP_INLAY = 7

/** craft 词条的最小信息（可注入，便于测试安全模式） */
export interface TranscendCraftAffixInfo {
    id: number
    plan?: number
    pool?: number
    totalValueLevel?: number
    ancientFunc?: unknown
    maxAffixUpdateFunc?: unknown
}

/** craft 规则数据源：缺省读静态数据表；安全模式（版本门限隐藏 1.8）下为空数组 */
export interface TranscendCraftDatasets {
    crafts?: readonly DnaSeasonCraft[]
    rarities?: readonly Pick<DnaSeasonRarity, "id" | "craftTypes">[]
    slots?: readonly Pick<DnaSeasonSlot, "id" | "baseAffixId" | "maxInlayCount" | "temperAffixPoolIds">[]
    affixes?: readonly TranscendCraftAffixInfo[]
    inlays?: readonly Pick<DnaSeasonInlay, "id" | "affixIdsBySlot">[]
    seasons?: readonly { id: number }[]
}

/** 解析后的 craft 数据源与索引 */
interface ResolvedCraftDatasets {
    crafts: readonly DnaSeasonCraft[]
    rarities: readonly Pick<DnaSeasonRarity, "id" | "craftTypes">[]
    slots: readonly Pick<DnaSeasonSlot, "id" | "baseAffixId" | "maxInlayCount" | "temperAffixPoolIds">[]
    affixes: readonly TranscendCraftAffixInfo[]
    affixMap: Map<number, TranscendCraftAffixInfo>
    inlays: readonly Pick<DnaSeasonInlay, "id" | "affixIdsBySlot">[]
    seasons: readonly { id: number }[]
}

/** 解析数据源（测试可注入空表验证安全模式） */
function resolveCraftDatasets(datasets?: TranscendCraftDatasets): ResolvedCraftDatasets {
    const affixes = datasets?.affixes ?? defaultAffixes
    return {
        crafts: datasets?.crafts ?? defaultCrafts,
        rarities: datasets?.rarities ?? defaultRarities,
        slots: datasets?.slots ?? defaultSlots,
        affixes,
        affixMap: new Map(affixes.map(affix => [affix.id, affix])),
        inlays: datasets?.inlays ?? defaultInlays,
        seasons: datasets?.seasons ?? defaultSeasons,
    }
}

/**
 * 读取 craft 定义。
 * @param craftId craft id
 * @param datasets 注入数据源
 * @returns craft 定义；数据缺失时 undefined
 */
export function getCraftDef(craftId: number, datasets?: TranscendCraftDatasets): DnaSeasonCraft | undefined {
    const id = Math.round(Number(craftId))
    return resolveCraftDatasets(datasets).crafts.find(craft => craft.id === id)
}

/** craft 成本行：材料（`costItems`）或货币（`costPriceId`） */
export interface TranscendCraftCostRow {
    id: number
    count: number
    /** 是否为货币行（`costPriceId`） */
    price: boolean
}

/** craft 成本：成长后的材料 / 货币明细与倍率 */
export interface TranscendCraftCost {
    craftId: number
    /** 附魔次数成长倍率；其它 craft 恒为 1 */
    multiplier: number
    rows: TranscendCraftCostRow[]
}

/** 读取状态里可能存在的附魔次数 */
function enchantCountOf(state?: Pick<TranscendGearCraftState, "enchantCount"> | number): number {
    if (typeof state === "number") return Number.isFinite(state) ? Math.max(0, Math.round(state)) : 0
    const count = state?.enchantCount
    return Number.isFinite(count) ? Math.max(0, Math.round(count as number)) : 0
}

/**
 * 附魔费用成长倍率：下一次（第 `enchantCount + 1` 次）的倍率，
 * `1 + enchantGrowthFactor × min(max(times - 1, 0), enchantGrowthMaxCount)`；
 * 未配置成长字段时为 1（不写死 5 次上限）。上游口径：1×..6×、第 7 次起封顶 6×。
 * @param craft craft 定义
 * @param enchantCount 已完成附魔次数
 * @returns 倍率
 */
export function getCraftCostMultiplier(craft: DnaSeasonCraft, enchantCount: number): number {
    const factor = Number(craft.enchantGrowthFactor)
    const maxCount = Number(craft.enchantGrowthMaxCount)
    if (!Number.isFinite(factor) || factor <= 0 || !Number.isFinite(maxCount) || maxCount <= 0) return 1
    const times = Math.max(1, Math.round(enchantCount) + 1)
    return 1 + factor * Math.min(Math.max(times - 1, 0), maxCount)
}

/**
 * 读取 craft 成本：材料与货币按同一倍率成长，逐行向上取整；craft 6 无材料 / 货币成本。
 * @param craftId craft id
 * @param state 物品 craft 状态（附魔次数决定成长；也可直接传次数）
 * @param datasets 注入数据源
 * @returns 成本明细与倍率
 */
export function getCraftCosts(
    craftId: number,
    state?: Pick<TranscendGearCraftState, "enchantCount"> | number,
    datasets?: TranscendCraftDatasets
): TranscendCraftCost {
    const craft = getCraftDef(craftId, datasets)
    if (!craft) return { craftId: Math.round(Number(craftId)), multiplier: 1, rows: [] }
    const multiplier = getCraftCostMultiplier(craft, enchantCountOf(state))
    const rows: TranscendCraftCostRow[] = []
    for (const [rawId, rawCount] of Object.entries(craft.costItems ?? {})) {
        const id = Math.round(Number(rawId))
        const count = Math.round(Number(rawCount))
        if (!Number.isFinite(id) || id <= 0 || !Number.isFinite(count) || count <= 0) continue
        rows.push({ id, count: Math.ceil(count * multiplier), price: false })
    }
    const priceId = Math.round(Number(craft.costPriceId))
    const priceCount = Math.round(Number(craft.costPriceCount))
    if (Number.isFinite(priceId) && priceId > 0 && Number.isFinite(priceCount) && priceCount > 0) {
        rows.push({ id: priceId, count: Math.ceil(priceCount * multiplier), price: true })
    }
    return { craftId: craft.id, multiplier, rows }
}

/** craft 不可用原因（界面按此渲染门槛说明，不在此层拼文案） */
export type TranscendCraftUnavailableReason =
    | "unknown-craft"
    | "unknown-rarity"
    | "rarity"
    | "cross-season"
    | "masterwork-max"
    | "masterwork-required"
    | "no-final-target"
    | "no-tempering-pool"
    | "no-enchant-target"
    | "socket-none"
    | "socket-max"
    | "no-empty-socket"
    | "no-socketed-gem"

/** craft 可用性 */
export interface TranscendCraftAvailability {
    craftId: number
    available: boolean
    /** 不可用原因；可用时缺省 */
    reason?: TranscendCraftUnavailableReason
}

/** 精锻上限：craft 1 的 `maxCount`（数据缺失时回退 `TRANSCEND_MASTERWORK_MAX`） */
export function getMasterworkMax(datasets?: TranscendCraftDatasets): number {
    const max = Math.round(Number(getCraftDef(TRANSCEND_CRAFT_MASTERWORK, datasets)?.maxCount))
    return Number.isFinite(max) && max > 0 ? max : TRANSCEND_MASTERWORK_MAX
}

/** 读取槽位数据 */
function getSlotOf(
    slotType: number,
    datasets: ResolvedCraftDatasets
): Pick<DnaSeasonSlot, "id" | "baseAffixId" | "maxInlayCount" | "temperAffixPoolIds"> | undefined {
    return datasets.slots.find(slot => slot.id === Math.round(Number(slotType)))
}

/**
 * 槽型的淬炼词条池：槽位 `temperAffixPoolIds` 命中的全部词条（不按 Plan 过滤；
 * 宝石 / 专属词条没有 pool，自然不会进入）。
 * @param slotType 槽型 id
 * @param datasets 注入数据源
 * @returns 按池 / id 排序的词条
 */
export function getGearTemperingAffixPool(slotType: number, datasets?: TranscendCraftDatasets): TranscendCraftAffixInfo[] {
    const resolved = resolveCraftDatasets(datasets)
    const slot = getSlotOf(slotType, resolved)
    const poolIds = new Set(slot?.temperAffixPoolIds ?? [])
    if (!poolIds.size) return []
    return resolved.affixes
        .filter(affix => affix.pool !== undefined && poolIds.has(affix.pool))
        .sort((left, right) => (left.pool ?? 0) - (right.pool ?? 0) || left.id - right.id)
}

/** 读取装备级 craft 状态的选项 */
export interface TranscendGearCraftStateOptions {
    /** 保留未知词条（库存写入）时未知最终目标不判死 */
    preserveUnknown?: boolean
}

/** 非负整数计数：非有限值 / 负数归零（与归一化 `toNonNegativeInt` 同口径） */
function toCraftCount(value: unknown): number {
    const count = Math.round(Number(value))
    return Number.isFinite(count) && count > 0 ? count : 0
}

/**
 * 读取物品当前的装备级 craft 状态；缺省时按 per-affix 派生字段推导（不写回）。
 * 与归一化共享 `resolveCraftTargets`：满级 + `MaxAffixUpdateFunc`、旧物品多条 final 取首条可承载、
 * 淬炼 / 附魔排除基础 / 专属且互不同槽；目标被清除时对应次数归零（count>0 必有目标）。
 * 未归一化旧物品先按归一化同口径去重 / 裁剪（保持数组顺序），再解析目标（下标按同一数组位置映射）；
 * `craft: []` 与缺省同样按「无 craft」处理。附魔快照下标基于当前词条数组位置，
 * 与归一化 / `commitGearCraft` 同口径。
 * @param item 装备物品
 * @param datasets 注入数据源
 * @param options 读取选项
 * @returns craft 状态
 */
export function getGearCraftState(
    item:
        | (Pick<TranscendGearItemConfig, "affixes" | "craft"> &
              Partial<Pick<TranscendGearItemConfig, "slotType" | "kind" | "uniqueId" | "uniqueAffix">>)
        | null
        | undefined,
    datasets?: TranscendCraftDatasets,
    options?: TranscendGearCraftStateOptions
): TranscendGearCraftState {
    const resolved = resolveCraftDatasets(datasets)
    const craft = item?.craft
    if (craft && typeof craft === "object" && !Array.isArray(craft)) {
        const rolls = Array.isArray(item?.affixes) ? item.affixes : []
        const baseAffixId = item?.slotType === undefined ? null : getSlotBaseAffixId(item.slotType, { slots: resolved.slots })
        const uniqueAffixId = item?.kind === "unique" ? item.uniqueAffix?.affixId : undefined
        const context: TranscendCraftTargetContext = {
            affixMap: resolved.affixMap,
            hasAffixData: resolved.affixMap.size > 0,
            preserveUnknown: options?.preserveUnknown === true,
            baseAffixId,
            uniqueAffixId,
            maxMasterwork: getMasterworkMax(datasets),
        }
        const masterworkLevel = clampMasterwork(craft.masterworkLevel)
        const targets = resolveCraftTargets(
            rolls,
            {
                masterworkLevel,
                finalMasterworkAffixIndex: craft.finalMasterworkAffixIndex,
                temperingAffixIndex: craft.temperingAffixIndex,
                enchantAffixIndex: craft.enchantAffixIndex,
            },
            context
        )
        const enchantSnapshot =
            targets.enchantAffixIndex === undefined || craft.enchantSnapshot === undefined
                ? undefined
                : resolveEnchantSnapshot(craft.enchantSnapshot, rolls, {
                      affixMap: resolved.affixMap,
                      hasAffixData: resolved.affixMap.size > 0,
                      preserveUnknown: options?.preserveUnknown === true,
                      baseAffixId,
                      uniqueAffixId,
                      masterworkLevel,
                      rawAffixCount: rolls.length,
                  })
        return {
            masterworkLevel,
            temperingCount: targets.temperingAffixIndex === undefined ? 0 : toCraftCount(craft.temperingCount),
            enchantCount: targets.enchantAffixIndex === undefined ? 0 : toCraftCount(craft.enchantCount),
            ...targets,
            ...(enchantSnapshot ? { enchantSnapshot } : {}),
        }
    }
    return {
        ...resolveLegacyGearCraftState(
            item,
            { affixes: resolved.affixes, slots: resolved.slots, inlays: resolved.inlays },
            { preserveUnknown: options?.preserveUnknown === true }
        ),
        temperingCount: 0,
        enchantCount: 0,
    }
}

/** 精锻等级钳制到 0-10 */
function clampMasterwork(value: unknown): number {
    const level = Number.isFinite(value) ? Math.round(Number(value)) : 0
    return Math.max(0, Math.min(TRANSCEND_MASTERWORK_MAX, level))
}

/** 物品某下标对应的词条 id（越界为 undefined） */
function affixIdAt(rolls: readonly TranscendGearAffixRoll[], index: number | undefined): number | undefined {
    if (index === undefined || !Number.isFinite(index)) return undefined
    return rolls[index]?.affixId
}

/** 读取词条最小信息 */
function getAffixOf(affixId: number, datasets: ResolvedCraftDatasets): TranscendCraftAffixInfo | undefined {
    return datasets.affixMap.get(Math.round(Number(affixId)))
}

/** 词条是否可承载最终精锻（与归一化共享口径；未知词条在无数据 / preserveUnknown 时不判死） */
function canAffixBeFinal(affixId: number, datasets: ResolvedCraftDatasets, preserveUnknown = false): boolean {
    return canGearAffixBeFinal(affixId, {
        affixMap: datasets.affixMap,
        hasAffixData: datasets.affixMap.size > 0,
        preserveUnknown,
    })
}

/**
 * 最终精锻可选目标词条下标（有 `MaxAffixUpdateFunc` 的词条；基础 / 专属词条不在其中）。
 * @param item 装备物品
 * @param datasets 注入数据源
 * @param options 读取选项（preserveUnknown 时未知词条可承载最终精锻，与 apply 同口径）
 * @returns 下标列表
 */
export function getGearFinalMasterworkTargets(
    item: TranscendGearItemConfig,
    datasets?: TranscendCraftDatasets,
    options?: TranscendGearCraftStateOptions
): number[] {
    const resolved = resolveCraftDatasets(datasets)
    return (Array.isArray(item.affixes) ? item.affixes : []).flatMap((roll, index) =>
        canAffixBeFinal(roll.affixId, resolved, options?.preserveUnknown === true) ? [index] : []
    )
}

/**
 * 附魔可替换词条下标：不能是基础词条、淬炼词条、暗金专属词条；
 * 已有附魔词条时只能继续替换该条（上游 `EnchantAffixIdIndex` 单槽）。
 * @param item 装备物品
 * @param datasets 注入数据源
 * @param options 读取选项（preserveUnknown 与 apply 同口径）
 * @returns 下标列表
 */
export function getGearEnchantTargets(
    item: TranscendGearItemConfig,
    datasets?: TranscendCraftDatasets,
    options?: TranscendGearCraftStateOptions
): number[] {
    const resolved = resolveCraftDatasets(datasets)
    const craft = getGearCraftState(item, datasets, options)
    if (craft.enchantAffixIndex !== undefined) return [craft.enchantAffixIndex]
    const baseAffixId = Math.round(Number(getSlotOf(item.slotType, resolved)?.baseAffixId))
    const hasBase = Number.isFinite(baseAffixId) && baseAffixId > 0
    const uniqueAffixId = item.kind === "unique" ? item.uniqueAffix?.affixId : undefined
    const rolls = Array.isArray(item.affixes) ? item.affixes : []
    return rolls.flatMap((roll, index) => {
        if (hasBase && roll.affixId === baseAffixId) return []
        if (roll.affixId === uniqueAffixId) return []
        if (index === craft.temperingAffixIndex) return []
        return [index]
    })
}

/**
 * 词条是否因附魔快照而被禁止淬炼：快照记录的是被附魔替换的原词条，淬炼选回同一 id
 * 会让归一化判定「快照词条仍在数组中」而丢弃快照，重置附魔随之失去恢复能力；
 * 因此在选词阶段就拒绝，界面可用本函数禁用候选并展示原因。
 * @param item 装备物品
 * @param affixId 候选词条 id
 * @param datasets 注入数据源
 * @param options 读取选项（preserveUnknown 与 apply 同口径）
 * @returns 被快照阻塞时为 true
 */
export function isAffixBlockedByEnchantSnapshot(
    item: TranscendGearItemConfig,
    affixId: number,
    datasets?: TranscendCraftDatasets,
    options?: TranscendGearCraftStateOptions
): boolean {
    const id = Math.round(Number(affixId))
    if (!Number.isFinite(id)) return false
    return getGearCraftState(item, datasets, options).enchantSnapshot?.roll.affixId === id
}

/** 已开孔中的空孔下标（按升序，且不超过槽型上限） */
function getEmptySocketIndices(item: TranscendGearItemConfig, max: number): number[] {
    const opened = Math.min(getGearItemSocketCount(item), Math.max(0, max))
    const occupied = new Set((Array.isArray(item.sockets) ? item.sockets : []).map(socket => Math.round(Number(socket.socketIndex))))
    const empty: number[] = []
    for (let index = 0; index < opened; index += 1) if (!occupied.has(index)) empty.push(index)
    return empty
}

/** 全局 craft 门槛：craft 存在 + 品质数据可用 + 非跨赛季 + 品质 `craftTypes` 允许 */
type TranscendCraftGate = { ok: true; craft: DnaSeasonCraft } | { ok: false; reason: TranscendCraftUnavailableReason }

/**
 * 判定与具体 craft 状态无关的全局门槛（品质 / 跨赛季 / craft 是否定义）。
 * @param item 装备物品
 * @param craftId craft id
 * @param resolved 解析后的数据源
 * @returns 门槛结果
 */
function checkCraftGate(item: TranscendGearItemConfig, craftId: number, resolved: ResolvedCraftDatasets): TranscendCraftGate {
    const id = Math.round(Number(craftId))
    const craft = resolved.crafts.find(entry => entry.id === id)
    if (!craft) return { ok: false, reason: "unknown-craft" }
    const rarity = resolved.rarities.find(entry => entry.id === Math.round(Number(item.rarityId)))
    if (!rarity) return { ok: false, reason: "unknown-rarity" }
    const currentSeason = Number(resolved.seasons[resolved.seasons.length - 1]?.id)
    const itemSeason = Math.round(Number(item.seasonId))
    if (
        Number.isFinite(itemSeason) &&
        itemSeason > 0 &&
        Number.isFinite(currentSeason) &&
        currentSeason > 0 &&
        itemSeason !== currentSeason
    ) {
        return { ok: false, reason: "cross-season" }
    }
    if (!rarity.craftTypes.map(Number).includes(id)) return { ok: false, reason: "rarity" }
    return { ok: true, craft }
}

/**
 * 判断物品是否通过 craft 的全局门槛（品质 `craftTypes` / 跨赛季 / craft 是否定义）。
 * apply 系列入口在改写前统一调用；层数条件与 make 可用性（孔上限 / 目标存在）不在此判定。
 * @param item 装备物品
 * @param craftId craft id
 * @param datasets 注入数据源
 * @returns 允许为 true
 */
export function isCraftAllowed(item: TranscendGearItemConfig, craftId: number, datasets?: TranscendCraftDatasets): boolean {
    return checkCraftGate(item, craftId, resolveCraftDatasets(datasets)).ok
}

/**
 * 判断 craft 是否可用：品质 `craftTypes` 门槛、跨赛季、精锻满级才能最终精锻、最终目标存在、
 * 淬炼池非空、附魔可替换目标存在、孔位上限 / 空孔 / 已镶宝石。
 * 层数条件（29006 / 29011）不在此判定：本地没有账号进度，界面只展示官方条件原文。
 * @param item 装备物品
 * @param craftId craft id
 * @param datasets 注入数据源
 * @param options 读取选项（preserveUnknown 与 apply 同口径）
 * @returns 可用性与不可用原因
 */
export function getCraftAvailability(
    item: TranscendGearItemConfig,
    craftId: number,
    datasets?: TranscendCraftDatasets,
    options?: TranscendGearCraftStateOptions
): TranscendCraftAvailability {
    const id = Math.round(Number(craftId))
    const resolved = resolveCraftDatasets(datasets)
    const gate = checkCraftGate(item, id, resolved)
    if (!gate.ok) return { craftId: id, available: false, reason: gate.reason }
    const state = getGearCraftState(item, datasets, options)
    const maxInlay = getSlotMaxInlayCount(item.slotType, { slots: resolved.slots })
    if (id === TRANSCEND_CRAFT_MASTERWORK) {
        const max = getMasterworkMax(datasets)
        if (state.masterworkLevel >= max) return { craftId: id, available: false, reason: "masterwork-max" }
        return { craftId: id, available: true }
    }
    if (id === TRANSCEND_CRAFT_FINAL_MASTERWORK) {
        const max = getMasterworkMax(datasets)
        if (state.masterworkLevel < max) return { craftId: id, available: false, reason: "masterwork-required" }
        if (!getGearFinalMasterworkTargets(item, datasets, options).length) {
            return { craftId: id, available: false, reason: "no-final-target" }
        }
        return { craftId: id, available: true }
    }
    if (id === TRANSCEND_CRAFT_TEMPERING) {
        if (!getGearTemperingAffixPool(item.slotType, datasets).length) {
            return { craftId: id, available: false, reason: "no-tempering-pool" }
        }
        return { craftId: id, available: true }
    }
    if (id === TRANSCEND_CRAFT_ENCHANT) {
        if (!getGearEnchantTargets(item, datasets, options).length) return { craftId: id, available: false, reason: "no-enchant-target" }
        return { craftId: id, available: true }
    }
    if (id === TRANSCEND_CRAFT_CREATE_SOCKET) {
        if (maxInlay <= 0) return { craftId: id, available: false, reason: "socket-none" }
        // 孔位数量只由部位 MaxInlayCount 决定，与品质 / 暗金无关
        if (getGearItemSocketCount(item) >= maxInlay) return { craftId: id, available: false, reason: "socket-max" }
        return { craftId: id, available: true }
    }
    if (id === TRANSCEND_CRAFT_EQUIP_INLAY) {
        if (maxInlay <= 0) return { craftId: id, available: false, reason: "socket-none" }
        if (!getEmptySocketIndices(item, maxInlay).length) return { craftId: id, available: false, reason: "no-empty-socket" }
        return { craftId: id, available: true }
    }
    if (id === TRANSCEND_CRAFT_UNEQUIP_INLAY) {
        if (!(Array.isArray(item.sockets) ? item.sockets : []).length) {
            return { craftId: id, available: false, reason: "no-socketed-gem" }
        }
        return { craftId: id, available: true }
    }
    return { craftId: id, available: false, reason: "unknown-craft" }
}

/** `commitGearCraft` 的目标锚点：id 锚点向后兼容；apply 入口已知位置时可直接给下标（同 id 孪生不指错行） */
export interface TranscendGearCraftAnchors {
    finalMasterworkAffixId?: number
    temperingAffixId?: number
    enchantAffixId?: number
    /** 目标词条在 `affixes` 中的直接下标（优先于 id 锚点；越界时回退 id） */
    finalMasterworkAffixIndex?: number
    temperingAffixIndex?: number
    enchantAffixIndex?: number
}

/**
 * 提交新的 craft 状态：词条保持入参数组顺序，索引由目标锚点重算，per-affix 精锻 / 最终精锻 /
 * 淬炼 / 附魔来源全部按装备级状态派生写入。最终目标在此复检（满级 + `MaxAffixUpdateFunc`），
 * 不合法时清空，避免写出下次归一化会被丢弃的状态。
 * 附魔快照随状态透传并按当前数组位置核对；没有附魔目标时丢弃，保证「有快照必有附魔词条」。
 * 草稿组装（Web `buildGearItem`）与所有 apply 共用本函数，避免另建第二套 craft 推导。
 * @param item 原物品（不修改）
 * @param affixes 新词条列表
 * @param state 新的精锻等级、次数与附魔快照
 * @param anchors 目标锚点（直接下标优先；缺省表示没有该状态）
 * @param datasets 注入数据源
 * @param options 提交选项（preserveUnknown 时未知最终目标不判死）
 * @returns 新物品
 */
export function commitGearCraft(
    item: TranscendGearItemConfig,
    affixes: readonly TranscendGearAffixRoll[],
    state: Pick<TranscendGearCraftState, "masterworkLevel" | "temperingCount" | "enchantCount" | "enchantSnapshot">,
    anchors: TranscendGearCraftAnchors,
    datasets?: TranscendCraftDatasets,
    options?: TranscendGearCraftStateOptions
): TranscendGearItemConfig {
    const resolved = resolveCraftDatasets(datasets)
    const indexOf = (affixId: number | undefined, preferredSource?: TranscendGearAffixSource): number | undefined => {
        if (affixId === undefined) return undefined
        // 同 id 的随机与淬炼可共存：锚点优先命中期望来源行，避免随机行排在前面时指错
        if (preferredSource !== undefined) {
            const preferred = affixes.findIndex(roll => roll.affixId === affixId && roll.source === preferredSource)
            if (preferred >= 0) return preferred
        }
        const index = affixes.findIndex(roll => roll.affixId === affixId)
        return index >= 0 ? index : undefined
    }
    // 直接下标优先：apply 入口知道行位置时不受「行上缺 source + 同 id 孪生」影响
    const pickIndex = (
        direct: number | undefined,
        affixId: number | undefined,
        preferredSource?: TranscendGearAffixSource
    ): number | undefined => {
        if (direct !== undefined && Number.isFinite(direct)) {
            const index = Math.round(direct)
            if (index >= 0 && index < affixes.length) return index
        }
        return indexOf(affixId, preferredSource)
    }
    const masterworkLevel = clampMasterwork(state.masterworkLevel)
    const baseAffixId = getSlotBaseAffixId(item.slotType, { slots: resolved.slots })
    const uniqueAffixId = item.kind === "unique" ? item.uniqueAffix?.affixId : undefined
    // 与归一化共享目标解析：满级 + MaxAffixUpdateFunc、基础 / 专属排除、淬炼 ≠ 附魔
    const targets = resolveCraftTargets(
        affixes,
        {
            masterworkLevel,
            finalMasterworkAffixIndex: pickIndex(anchors.finalMasterworkAffixIndex, anchors.finalMasterworkAffixId),
            temperingAffixIndex: pickIndex(anchors.temperingAffixIndex, anchors.temperingAffixId, "tempering"),
            enchantAffixIndex: pickIndex(anchors.enchantAffixIndex, anchors.enchantAffixId, "enchant"),
        },
        {
            affixMap: resolved.affixMap,
            hasAffixData: resolved.affixMap.size > 0,
            preserveUnknown: options?.preserveUnknown === true,
            baseAffixId,
            uniqueAffixId,
            maxMasterwork: getMasterworkMax(datasets),
        }
    )
    const enchantSnapshot =
        targets.enchantAffixIndex === undefined
            ? undefined
            : resolveEnchantSnapshot(state.enchantSnapshot, affixes, {
                  affixMap: resolved.affixMap,
                  hasAffixData: resolved.affixMap.size > 0,
                  preserveUnknown: options?.preserveUnknown === true,
                  baseAffixId,
                  uniqueAffixId,
                  masterworkLevel,
              })
    const craft: TranscendGearCraftState = {
        masterworkLevel,
        temperingCount: targets.temperingAffixIndex === undefined ? 0 : toCraftCount(state.temperingCount),
        enchantCount: targets.enchantAffixIndex === undefined ? 0 : toCraftCount(state.enchantCount),
    }
    if (targets.finalMasterworkAffixIndex !== undefined) craft.finalMasterworkAffixIndex = targets.finalMasterworkAffixIndex
    if (targets.temperingAffixIndex !== undefined) craft.temperingAffixIndex = targets.temperingAffixIndex
    if (targets.enchantAffixIndex !== undefined) craft.enchantAffixIndex = targets.enchantAffixIndex
    if (enchantSnapshot) craft.enchantSnapshot = enchantSnapshot
    const derived = affixes.map((roll, index) => {
        let source = roll.source
        if (index === craft.temperingAffixIndex) source = "tempering"
        else if (index === craft.enchantAffixIndex) source = "enchant"
        else if (source === "tempering" || source === "enchant") source = "random"
        return {
            ...roll,
            masterworkLevel: craft.masterworkLevel,
            finalMasterwork: index === craft.finalMasterworkAffixIndex,
            ...(source ? { source } : {}),
        }
    })
    return { ...item, affixes: derived, craft }
}

/**
 * 设置装备级精锻等级（钳制 0-上限）：低于上限时清除最终精锻目标；不满足品质 / 跨赛季门槛时原样返回。
 * @param item 装备物品
 * @param level 目标等级
 * @param datasets 注入数据源
 * @param options 状态选项（preserveUnknown 时未知最终目标不判死）
 * @returns 新物品；无变化时返回原物品
 */
export function setGearMasterworkLevel(
    item: TranscendGearItemConfig,
    level: number,
    datasets?: TranscendCraftDatasets,
    options?: TranscendGearCraftStateOptions
): TranscendGearItemConfig {
    const resolved = resolveCraftDatasets(datasets)
    if (!checkCraftGate(item, TRANSCEND_CRAFT_MASTERWORK, resolved).ok) return item
    const max = getMasterworkMax(datasets)
    const next = Math.max(0, Math.min(max, Math.round(Number(level) || 0)))
    const state = getGearCraftState(item, datasets, options)
    const rolls = Array.isArray(item.affixes) ? item.affixes : []
    const currentFinalAffixId = affixIdAt(rolls, state.finalMasterworkAffixIndex)
    // 精锻不满级时最终精锻目标不成立
    const finalAffixId = next >= max ? currentFinalAffixId : undefined
    const temperingAffixId = affixIdAt(rolls, state.temperingAffixIndex)
    const enchantAffixId = affixIdAt(rolls, state.enchantAffixIndex)
    const unchanged =
        state.masterworkLevel === next &&
        rolls.every(roll => roll.masterworkLevel === next && roll.finalMasterwork === (roll.affixId === finalAffixId))
    if (unchanged) return item
    return commitGearCraft(
        item,
        rolls,
        { ...state, masterworkLevel: next },
        {
            finalMasterworkAffixId: finalAffixId,
            finalMasterworkAffixIndex: finalAffixId === undefined ? undefined : state.finalMasterworkAffixIndex,
            temperingAffixId,
            temperingAffixIndex: state.temperingAffixIndex,
            enchantAffixId,
            enchantAffixIndex: state.enchantAffixIndex,
        },
        datasets,
        options
    )
}

/**
 * 精锻一次或多次（每次 +1，不超过 craft 1 `maxCount`）；不满足品质 / 跨赛季门槛时原样返回。
 * @param item 装备物品
 * @param times 精锻次数（缺省 1）
 * @param datasets 注入数据源
 * @param options 状态选项（preserveUnknown 时未知最终目标不判死）
 * @returns 新物品
 */
export function applyMasterwork(
    item: TranscendGearItemConfig,
    times = 1,
    datasets?: TranscendCraftDatasets,
    options?: TranscendGearCraftStateOptions
): TranscendGearItemConfig {
    if (!isCraftAllowed(item, TRANSCEND_CRAFT_MASTERWORK, datasets)) return item
    const state = getGearCraftState(item, datasets, options)
    const max = getMasterworkMax(datasets)
    const steps = Math.max(1, Math.round(Number(times) || 1))
    const next = Math.min(max, state.masterworkLevel + steps)
    if (next === state.masterworkLevel) return item
    return setGearMasterworkLevel(item, next, datasets, options)
}

/**
 * 设置最终精锻目标词条：必须精锻满级，目标词条必须存在且有 `MaxAffixUpdateFunc`。
 * `null` 表示清除目标（降低精锻等级时使用）；不满足品质 / 跨赛季门槛时原样返回。
 * @param item 装备物品
 * @param affixIndex 目标词条下标（基于 `affixes`）
 * @param datasets 注入数据源
 * @param options 状态选项（preserveUnknown 时未知词条可承载最终精锻）
 * @returns 新物品；不满足条件时返回原物品
 */
export function applyFinalMasterwork(
    item: TranscendGearItemConfig,
    affixIndex: number | null,
    datasets?: TranscendCraftDatasets,
    options?: TranscendGearCraftStateOptions
): TranscendGearItemConfig {
    if (!isCraftAllowed(item, TRANSCEND_CRAFT_FINAL_MASTERWORK, datasets)) return item
    const state = getGearCraftState(item, datasets, options)
    const rolls = Array.isArray(item.affixes) ? item.affixes : []
    const temperingAffixId = affixIdAt(rolls, state.temperingAffixIndex)
    const enchantAffixId = affixIdAt(rolls, state.enchantAffixIndex)
    if (affixIndex === null) {
        const rawCraft = item.craft && typeof item.craft === "object" && !Array.isArray(item.craft) ? item.craft : undefined
        const hasRawFinal = rawCraft?.finalMasterworkAffixIndex !== undefined && rawCraft.finalMasterworkAffixIndex !== null
        const hasLegacyFinal = rolls.some(roll => roll.finalMasterwork === true)
        // 显式清除：即使未知最终目标在默认口径下已被判死，也要把它从物品上真正清掉
        if (state.finalMasterworkAffixIndex === undefined && !hasRawFinal && !hasLegacyFinal) return item
        return commitGearCraft(
            item,
            rolls,
            state,
            {
                temperingAffixId,
                temperingAffixIndex: state.temperingAffixIndex,
                enchantAffixId,
                enchantAffixIndex: state.enchantAffixIndex,
            },
            datasets,
            options
        )
    }
    if (state.masterworkLevel < getMasterworkMax(datasets)) return item
    const resolved = resolveCraftDatasets(datasets)
    const targetIndex = Math.round(Number(affixIndex))
    const target = rolls[targetIndex]
    if (!target || !canAffixBeFinal(target.affixId, resolved, options?.preserveUnknown === true)) return item
    return commitGearCraft(
        item,
        rolls,
        state,
        {
            finalMasterworkAffixId: target.affixId,
            finalMasterworkAffixIndex: targetIndex,
            temperingAffixId,
            temperingAffixIndex: state.temperingAffixIndex,
            enchantAffixId,
            enchantAffixIndex: state.enchantAffixIndex,
        },
        datasets,
        options
    )
}

/**
 * 淬炼：新增或替换单条淬炼词条（词条必须属于槽位淬炼池，不能是基础 / 专属词条，
 * 也不能是附魔快照记录的原词条）。服务端会生成档位 / 太古；本地选择仅用于模拟。
 * 允许与已存在的随机 / 附魔词条同 `affixId` 共存（单件仍最多 1 条淬炼），只拒绝另一条淬炼行。
 * 每次淬炼累计 `temperingCount`。不满足品质 / 跨赛季门槛时原样返回。
 * @param item 装备物品
 * @param roll 目标词条与模拟档位（档位缺省取词条满档）
 * @param datasets 注入数据源
 * @param options 状态选项（preserveUnknown 透传到目标解析）
 * @returns 新物品；词条不合法或命中附魔快照原词条时返回原物品
 */
export function applyTemper(
    item: TranscendGearItemConfig,
    roll: { affixId: number; rollLevel?: number; ancient?: boolean },
    datasets?: TranscendCraftDatasets,
    options?: TranscendGearCraftStateOptions
): TranscendGearItemConfig {
    const resolved = resolveCraftDatasets(datasets)
    if (!checkCraftGate(item, TRANSCEND_CRAFT_TEMPERING, resolved).ok) return item
    const affixId = Math.round(Number(roll?.affixId))
    const affix = getAffixOf(affixId, resolved)
    if (!affix) return item
    const slot = getSlotOf(item.slotType, resolved)
    const poolIds = new Set(slot?.temperAffixPoolIds ?? [])
    if (affix.pool === undefined || !poolIds.has(affix.pool)) return item
    const baseAffixId = getSlotBaseAffixId(item.slotType, { slots: resolved.slots })
    if (baseAffixId !== null && affixId === baseAffixId) return item
    if (item.kind === "unique" && affixId === item.uniqueAffix?.affixId) return item
    const state = getGearCraftState(item, datasets, options)
    // 淬炼不得选回附魔快照的原词条：归一化会把「快照词条仍在数组中」判为矛盾并静默丢弃快照
    if (state.enchantSnapshot?.roll.affixId === affixId) return item
    const rolls = Array.isArray(item.affixes) ? item.affixes : []
    const existingIndex = state.temperingAffixIndex
    // 只拒绝另一条淬炼行：同 id 的随机 / 附魔行按用户反馈可以与淬炼共存
    const duplicate = rolls.some((entry, index) => entry.affixId === affixId && index !== existingIndex && entry.source === "tempering")
    if (duplicate) return item
    if (existingIndex === undefined && rolls.length >= TRANSCEND_MAX_ITEM_AFFIXES) return item
    const total = Math.max(1, Math.round(affix.totalValueLevel || 1))
    const rollLevel = Math.max(1, Math.min(total, Math.round(Number(roll.rollLevel ?? total) || total)))
    const nextRoll: TranscendGearAffixRoll = {
        affixId,
        rollLevel,
        masterworkLevel: state.masterworkLevel,
        ancient: roll.ancient === true && Boolean(affix.ancientFunc),
        finalMasterwork: false,
        source: "tempering",
    }
    const nextAffixes =
        existingIndex === undefined ? [...rolls, nextRoll] : rolls.map((entry, index) => (index === existingIndex ? nextRoll : entry))
    // 替换的若正好是最终精锻目标，目标按位置跟到新词条；新词条不可承载最终精锻时清空
    const finalFollowsTempering = existingIndex !== undefined && state.finalMasterworkAffixIndex === existingIndex
    const finalAffixId = finalFollowsTempering
        ? canAffixBeFinal(affixId, resolved, options?.preserveUnknown === true)
            ? affixId
            : undefined
        : affixIdAt(rolls, state.finalMasterworkAffixIndex)
    return commitGearCraft(
        item,
        nextAffixes,
        { ...state, temperingCount: state.temperingCount + 1 },
        {
            finalMasterworkAffixId: finalAffixId,
            finalMasterworkAffixIndex:
                finalAffixId === undefined ? undefined : finalFollowsTempering ? existingIndex : state.finalMasterworkAffixIndex,
            temperingAffixId: affixId,
            temperingAffixIndex: existingIndex ?? nextAffixes.length - 1,
            enchantAffixId: affixIdAt(rolls, state.enchantAffixIndex),
            enchantAffixIndex: state.enchantAffixIndex,
        },
        datasets,
        options
    )
}

/**
 * 设置当前淬炼词条的太古标记（模拟器手动选择，游戏内为随机）：只改该 roll 的 `ancient`，
 * 不增加淬炼次数，档位 / 精锻 / 最终精锻 / 附魔状态原样保留。词条没有太古公式时原样返回。
 * @param item 装备物品
 * @param ancient 是否太古
 * @param datasets 注入数据源
 * @param options 状态选项（preserveUnknown 透传到目标解析）
 * @returns 新物品；没有淬炼行 / 不可太古 / 标记未变化时返回原物品
 */
export function setTemperingAncient(
    item: TranscendGearItemConfig,
    ancient: boolean,
    datasets?: TranscendCraftDatasets,
    options?: TranscendGearCraftStateOptions
): TranscendGearItemConfig {
    const state = getGearCraftState(item, datasets, options)
    const index = state.temperingAffixIndex
    if (index === undefined) return item
    const rolls = Array.isArray(item.affixes) ? item.affixes : []
    const target = rolls[index]
    if (!target) return item
    const resolved = resolveCraftDatasets(datasets)
    const nextAncient = ancient === true && Boolean(getAffixOf(target.affixId, resolved)?.ancientFunc)
    if (nextAncient === (target.ancient === true)) return item
    const nextAffixes = rolls.map((roll, position) => (position === index ? { ...roll, ancient: nextAncient } : roll))
    return commitGearCraft(
        item,
        nextAffixes,
        state,
        {
            finalMasterworkAffixId: affixIdAt(rolls, state.finalMasterworkAffixIndex),
            finalMasterworkAffixIndex: state.finalMasterworkAffixIndex,
            temperingAffixId: target.affixId,
            temperingAffixIndex: index,
            enchantAffixId: affixIdAt(rolls, state.enchantAffixIndex),
            enchantAffixIndex: state.enchantAffixIndex,
        },
        datasets,
        options
    )
}

/**
 * 附魔：用新词条替换一条可替换词条（不能是基础 / 淬炼 / 专属词条；已有附魔时只能替换该条）。
 * 新词条只允许槽位随机池内的 Plan 2 词条（排除宝石 / 专属 / 任意槽基础词条）；
 * 与已存在的淬炼行同 id 允许共存（附魔 / 淬炼占不同词条位，计算层双计），同 id 只与随机类行互斥；
 * 替换最终精锻目标时，新词条可承载最终精锻才跟随，否则清空目标。
 * 游戏内由服务端生成 2 个候选供 2 选 1；本地直接指定替换结果仅用于模拟。每次累计 `enchantCount`。
 * @param item 装备物品
 * @param targetIndex 被替换词条下标（基于 `affixes`）
 * @param roll 新词条与模拟档位（档位缺省取词条满档）
 * @param datasets 注入数据源
 * @param options 状态选项（preserveUnknown 透传到目标解析）
 * @returns 新物品；替换不合法时返回原物品
 */
export function applyEnchant(
    item: TranscendGearItemConfig,
    targetIndex: number,
    roll: { affixId: number; rollLevel?: number; ancient?: boolean },
    datasets?: TranscendCraftDatasets,
    options?: TranscendGearCraftStateOptions
): TranscendGearItemConfig {
    const resolved = resolveCraftDatasets(datasets)
    if (!checkCraftGate(item, TRANSCEND_CRAFT_ENCHANT, resolved).ok) return item
    const rolls = Array.isArray(item.affixes) ? item.affixes : []
    const index = Math.round(Number(targetIndex))
    if (!Number.isFinite(index) || index < 0 || index >= rolls.length) return item
    const affixId = Math.round(Number(roll?.affixId))
    const affix = getAffixOf(affixId, resolved)
    if (!affix) return item
    // 新词条必须是槽位随机池内的 Plan 2（排除宝石 / Plan 4 专属 / Plan 1 基础 / 池外词条）
    const slot = getSlotOf(item.slotType, resolved)
    const poolIds = new Set(slot?.temperAffixPoolIds ?? [])
    if (affix.plan !== 2 || affix.pool === undefined || !poolIds.has(affix.pool)) return item
    const state = getGearCraftState(item, datasets, options)
    if (state.enchantAffixIndex !== undefined && state.enchantAffixIndex !== index) return item
    const baseAffixId = getSlotBaseAffixId(item.slotType, { slots: resolved.slots })
    const targetAffixId = rolls[index].affixId
    if (baseAffixId !== null && (targetAffixId === baseAffixId || affixId === baseAffixId)) return item
    if (item.kind === "unique" && (targetAffixId === item.uniqueAffix?.affixId || affixId === item.uniqueAffix?.affixId)) return item
    // 目标不能是淬炼行本身；新词条与淬炼行同 id 允许共存（与淬炼 / 附魔占不同词条位，双计）
    if (index === state.temperingAffixIndex) return item
    // 同 id 只与随机类行冲突：基础 / 专属 / 淬炼行各自有独立校验，不受此限
    const duplicate = rolls.some(
        (entry, position) => position !== index && entry.affixId === affixId && getTranscendAffixDedupeClass(entry.source) === "other"
    )
    if (duplicate) return item
    const total = Math.max(1, Math.round(affix.totalValueLevel || 1))
    const rollLevel = Math.max(1, Math.min(total, Math.round(Number(roll.rollLevel ?? total) || total)))
    const nextRoll: TranscendGearAffixRoll = {
        affixId,
        rollLevel,
        masterworkLevel: state.masterworkLevel,
        ancient: roll.ancient === true && Boolean(affix.ancientFunc),
        finalMasterwork: false,
        source: "enchant",
    }
    const nextAffixes = rolls.map((entry, position) => (position === index ? nextRoll : entry))
    // 首次附魔（附魔槽从无到有）保存被替换词条快照；同槽再附魔保留原快照，不覆盖
    const enchantSnapshot: TranscendGearEnchantSnapshot | undefined =
        state.enchantAffixIndex === undefined ? { affixIndex: index, roll: { ...rolls[index] } } : state.enchantSnapshot
    // 替换的若正好是最终精锻目标：新词条可承载最终精锻才按下标跟随，否则清空
    const finalAffixId =
        state.finalMasterworkAffixIndex === index
            ? canAffixBeFinal(affixId, resolved, options?.preserveUnknown === true)
                ? affixId
                : undefined
            : affixIdAt(rolls, state.finalMasterworkAffixIndex)
    return commitGearCraft(
        item,
        nextAffixes,
        { ...state, enchantCount: state.enchantCount + 1, enchantSnapshot },
        {
            finalMasterworkAffixId: finalAffixId,
            finalMasterworkAffixIndex: finalAffixId === undefined ? undefined : state.finalMasterworkAffixIndex,
            temperingAffixId: affixIdAt(rolls, state.temperingAffixIndex),
            temperingAffixIndex: state.temperingAffixIndex,
            enchantAffixId: affixId,
            enchantAffixIndex: index,
        },
        datasets,
        options
    )
}

/**
 * 重置附魔（模拟器功能，游戏内没有该操作，不扣除任何消耗）：有快照时把被替换词条恢复到原下标，
 * 清空附魔目标 / 次数 / 快照；无快照（旧数据 / 手动构造）时只清空附魔状态，当前附魔行由
 * `commitGearCraft` 降级为随机词条，不伪造原词缀。重置后可重新选择任一合法目标再次附魔；
 * 次数归零后附魔费用回到基础倍率。不修改入参。
 * @param item 装备物品
 * @param datasets 注入数据源
 * @param options 状态选项（preserveUnknown 透传到目标解析）
 * @returns 新物品；没有附魔状态时原样返回
 */
export function resetEnchant(
    item: TranscendGearItemConfig,
    datasets?: TranscendCraftDatasets,
    options?: TranscendGearCraftStateOptions
): TranscendGearItemConfig {
    const state = getGearCraftState(item, datasets, options)
    const enchantIndex = state.enchantAffixIndex
    if (enchantIndex === undefined) return item
    const rolls = Array.isArray(item.affixes) ? item.affixes : []
    const snapshot = state.enchantSnapshot
    let finalAffixId = affixIdAt(rolls, state.finalMasterworkAffixIndex)
    let nextAffixes: TranscendGearAffixRoll[] = rolls
    if (snapshot) {
        const restored = snapshot.roll
        nextAffixes = rolls.map((roll, index) => (index === enchantIndex ? { ...restored } : roll))
        // 附魔行正好是最终精锻目标：恢复词条可承载则目标回到原词条，否则清空
        if (state.finalMasterworkAffixIndex === enchantIndex) {
            const resolved = resolveCraftDatasets(datasets)
            finalAffixId = canAffixBeFinal(restored.affixId, resolved, options?.preserveUnknown === true) ? restored.affixId : undefined
        }
    }
    return commitGearCraft(
        item,
        nextAffixes,
        { ...state, enchantCount: 0, enchantSnapshot: undefined },
        {
            finalMasterworkAffixId: finalAffixId,
            finalMasterworkAffixIndex: finalAffixId === undefined ? undefined : state.finalMasterworkAffixIndex,
            temperingAffixId: affixIdAt(rolls, state.temperingAffixIndex),
            temperingAffixIndex: state.temperingAffixIndex,
        },
        datasets,
        options
    )
}

/**
 * 重置淬炼（模拟器功能，与做装界面现有语义一致）：删除淬炼来源词条与权威淬炼目标、次数归零，
 * 由 `commitGearCraft` 复检最终精锻目标等联动；词条 / 孔位 / 附魔快照不受影响。
 * @param item 装备物品
 * @param datasets 注入数据源
 * @param options 状态选项（preserveUnknown 透传到目标解析）
 * @returns 新物品；没有淬炼状态时原样返回
 */
export function resetTempering(
    item: TranscendGearItemConfig,
    datasets?: TranscendCraftDatasets,
    options?: TranscendGearCraftStateOptions
): TranscendGearItemConfig {
    const state = getGearCraftState(item, datasets, options)
    const rolls = Array.isArray(item.affixes) ? item.affixes : []
    const temperingIndex = state.temperingAffixIndex
    const nextAffixes = rolls.filter((roll, index) => roll.source !== "tempering" && index !== temperingIndex)
    if (nextAffixes.length === rolls.length && state.temperingCount === 0) return item
    // 删除行会移动下标：最终目标 / 附魔行按对象引用重算新位置；最终目标若正是被删的淬炼行则一并清除
    const finalRoll = state.finalMasterworkAffixIndex === undefined ? undefined : rolls[state.finalMasterworkAffixIndex]
    const enchantRoll = state.enchantAffixIndex === undefined ? undefined : rolls[state.enchantAffixIndex]
    const nextFinalIndex = finalRoll === undefined ? undefined : nextAffixes.indexOf(finalRoll)
    const nextEnchantIndex = enchantRoll === undefined ? undefined : nextAffixes.indexOf(enchantRoll)
    const finalRemoved = nextFinalIndex === -1
    return commitGearCraft(
        item,
        nextAffixes,
        { ...state, temperingCount: 0 },
        {
            finalMasterworkAffixId: finalRemoved ? undefined : affixIdAt(rolls, state.finalMasterworkAffixIndex),
            finalMasterworkAffixIndex: finalRemoved ? undefined : nextFinalIndex,
            enchantAffixId: affixIdAt(rolls, state.enchantAffixIndex),
            enchantAffixIndex: nextEnchantIndex === -1 ? undefined : nextEnchantIndex,
        },
        datasets,
        options
    )
}

/**
 * 添加镶孔：已开孔数 +1（不超过槽型上限；护符 / 印章 / 典籍 / 纹饰上限 0）。
 * 孔位数量只由部位 `MaxInlayCount` 决定，与品质 / 暗金无关。
 * @param item 装备物品
 * @param datasets 注入数据源
 * @returns 新物品；已达上限或不满足品质 / 跨赛季门槛时返回原物品
 */
export function applyCreateSocket(item: TranscendGearItemConfig, datasets?: TranscendCraftDatasets): TranscendGearItemConfig {
    const resolved = resolveCraftDatasets(datasets)
    if (!checkCraftGate(item, TRANSCEND_CRAFT_CREATE_SOCKET, resolved).ok) return item
    const max = getSlotMaxInlayCount(item.slotType, { slots: resolved.slots })
    const opened = Math.min(getGearItemSocketCount(item), max)
    if (max <= 0 || opened >= max) return item
    return { ...item, socketCount: opened + 1 }
}

/**
 * 镶嵌：把宝石放进一个空孔；同宝石可占多个孔，无同色 / 同组互斥。
 * 宝石必须存在且对该槽型有词缀；孔位必须已开且未占用。
 * @param item 装备物品
 * @param gemId 宝石 id（`DnaSeasonInlay.id`）
 * @param socketIndex 目标孔位；缺省取第一个空孔
 * @param datasets 注入数据源
 * @returns 新物品；没有可用空孔 / 宝石或孔位不合法时返回原物品
 */
export function applyInlay(
    item: TranscendGearItemConfig,
    gemId: number,
    socketIndex?: number,
    datasets?: TranscendCraftDatasets
): TranscendGearItemConfig {
    const resolved = resolveCraftDatasets(datasets)
    if (!checkCraftGate(item, TRANSCEND_CRAFT_EQUIP_INLAY, resolved).ok) return item
    const gem = Math.round(Number(gemId))
    if (!Number.isFinite(gem) || gem <= 0) return item
    if (resolveInlayAffixId(gem, item.slotType, { inlays: resolved.inlays }) === null) return item
    const max = getSlotMaxInlayCount(item.slotType, { slots: resolved.slots })
    const empty = getEmptySocketIndices(item, max)
    const index = socketIndex === undefined ? empty[0] : Math.round(Number(socketIndex))
    if (index === undefined || !empty.includes(index)) return item
    const sockets = [...(Array.isArray(item.sockets) ? item.sockets : []), { socketIndex: index, gemId: gem }].sort(
        (left, right) => left.socketIndex - right.socketIndex
    )
    return { ...item, sockets }
}

/**
 * 逐孔替换宝石（craft 6）：目标孔为空时等价于直接镶嵌（不拆取、不受其它孔未知宝石影响）；
 * 目标孔已占用时先校验其余待重镶宝石对当前槽型可用，再按「拆取全部 → 重镶其余宝石 → 写入目标宝石」
 * 模拟；上游没有单独拆一颗的入口。任一校验或写入失败整体不提交（返回原物品），
 * 不会留下拆空状态或静默丢宝石。
 * @param item 装备物品
 * @param socketIndex 目标孔位（必须已开）
 * @param gemId 新宝石 id
 * @param datasets 注入数据源
 * @returns 新物品；失败时返回原物品
 */
export function replaceSocketGem(
    item: TranscendGearItemConfig,
    socketIndex: number,
    gemId: number,
    datasets?: TranscendCraftDatasets
): TranscendGearItemConfig {
    const resolved = resolveCraftDatasets(datasets)
    if (!checkCraftGate(item, TRANSCEND_CRAFT_EQUIP_INLAY, resolved).ok) return item
    const index = Math.round(Number(socketIndex))
    const gem = Math.round(Number(gemId))
    if (!Number.isFinite(index) || index < 0 || !Number.isFinite(gem) || gem <= 0) return item
    const max = getSlotMaxInlayCount(item.slotType, { slots: resolved.slots })
    if (index >= max || index >= getGearItemSocketCount(item)) return item
    if (resolveInlayAffixId(gem, item.slotType, { inlays: resolved.inlays }) === null) return item
    const sockets = Array.isArray(item.sockets) ? item.sockets : []
    // 目标孔为空：不需要拆取 / 重镶其余宝石，直接镶嵌（其余孔宝石原样保留，含未知宝石）
    if (!sockets.some(socket => Math.round(Number(socket.socketIndex)) === index)) {
        return applyInlay(item, gem, index, datasets)
    }
    const others = sockets.filter(socket => Math.round(Number(socket.socketIndex)) !== index)
    // 其余孔必须能原样重镶：未知 / 不适用的宝石直接拒绝整体替换（避免拆取后丢失）
    const restorable = others.every(socket => resolveInlayAffixId(socket.gemId, item.slotType, { inlays: resolved.inlays }) !== null)
    if (!restorable) return item
    const detached = applyDetachAll(item, datasets)
    if (detached === item) return item
    let next = detached
    for (const socket of others) {
        const step = applyInlay(next, socket.gemId, Math.round(Number(socket.socketIndex)), datasets)
        if (step === next) return item
        next = step
    }
    const replaced = applyInlay(next, gem, index, datasets)
    return replaced === next ? item : replaced
}

/**
 * 拆取（craft 7）：一次清空全部已镶宝石，已开孔数不变；没有单独拆取一颗的官方入口。
 * @param item 装备物品
 * @param datasets 注入数据源
 * @returns 新物品；没有宝石或不满足品质 / 跨赛季门槛时返回原物品
 */
export function applyDetachAll(item: TranscendGearItemConfig, datasets?: TranscendCraftDatasets): TranscendGearItemConfig {
    if (!isCraftAllowed(item, TRANSCEND_CRAFT_UNEQUIP_INLAY, datasets)) return item
    const sockets = Array.isArray(item.sockets) ? item.sockets : []
    if (!sockets.length) return item
    const next: TranscendGearItemConfig = { ...item }
    delete next.sockets
    return next
}
