import type { DnaSeasonInlay, DnaSeasonSlot } from "./d"
import { affixes, inlays, slots, uniqueEquips } from "./d"

/**
 * 升华装备物品层：物品配置 / 装备槽 / 词条条目、展平适配器与 v1→v2 迁移。
 * 计算入口仍是 `resolveGearEffects`：物品按孔位与词条展平为 `TranscendGearEntry[]`；
 * 数据表为空（安全模式 / 缺包）时保留 v1 平铺条目，等数据恢复后再迁移。草案阶段不写版本号字段。
 */

/**
 * 升华装备槽位索引区间（上游 `CommonConst.DNASeasonEquipSlotIndex` 固定 16 位）：
 * 主控 1-8、协战一 9-12、协战二 13-16（一人一套）。
 */
export const TRANSCEND_SLOT_MIN = 1
export const TRANSCEND_SLOT_MAX = 16
export const TRANSCEND_MAIN_SLOT_MIN = 1
export const TRANSCEND_MAIN_SLOT_MAX = 8
export const TRANSCEND_ASSIST1_SLOT_MIN = 9
export const TRANSCEND_ASSIST1_SLOT_MAX = 12
export const TRANSCEND_ASSIST2_SLOT_MIN = 13
export const TRANSCEND_ASSIST2_SLOT_MAX = 16
/** 两个协战装备位的合计区间（9-16）；分组边界见 ASSIST1 / ASSIST2 常量 */
export const TRANSCEND_ASSIST_SLOT_MIN = TRANSCEND_ASSIST1_SLOT_MIN
export const TRANSCEND_ASSIST_SLOT_MAX = TRANSCEND_ASSIST2_SLOT_MAX

/** 升华精锻次数上限（游戏内 0-10 次，与 craft 1 `maxCount` 一致） */
export const TRANSCEND_MASTERWORK_MAX = 10
/** 单件装备的随机词缀上限（品质 minAffixCount 最大为 4；不含基础词条 / 专属词条 / 淬炼词条） */
export const TRANSCEND_MAX_AFFIXES_PER_SLOT = 4
/**
 * 单件装备的词条上限 7：1 条槽位基础 + 最多 4 条随机 + 1 条暗金专属 + 1 条淬炼；
 * 附魔只替换既有随机词条、不新增。v1 平铺条目曾把专属词条混在同一数组里，按 7 保留。
 */
export const TRANSCEND_MAX_ITEM_AFFIX_ROLLS = 7
/** 单件暗金的专属词缀上限（rarity 10：1 条专属） */
export const TRANSCEND_MAX_UNIQUE_AFFIXES = 1
/** 单件装备 `affixes` 数组（不含单独存放的专属词条）实际上限：基础 1 + 随机 4 + 淬炼 1 */
export const TRANSCEND_MAX_ITEM_AFFIXES = TRANSCEND_MAX_ITEM_AFFIX_ROLLS - TRANSCEND_MAX_UNIQUE_AFFIXES
/** 槽型 id 区间（数据 `slots` 的 11 项） */
export const TRANSCEND_SLOT_TYPE_MIN = 1
export const TRANSCEND_SLOT_TYPE_MAX = 11
/** 装备 hash 前缀：词条行 / 孔位 / 暗金 id / craft 状态的口径变化时升级（tg3 = 装备级精锻 + craft 状态） */
export const TRANSCEND_GEAR_HASH_PREFIX = "tg3"
/** 升华品质 id：2/3 同为蓝色、4/5 同为金色，但随机词缀条数不同；10 为暗金 */
export const TRANSCEND_RARITY_IDS = [1, 2, 3, 4, 5, 10] as const
/** 暗金品质 id（仅槽型 1-9 有唯一装） */
export const TRANSCEND_UNIQUE_RARITY_ID = 10
/** 装备强度 `EquipBaseScore` 区间（游戏无生成表，只能手选） */
export const TRANSCEND_EQUIP_BASE_SCORE_MIN = 1
export const TRANSCEND_EQUIP_BASE_SCORE_MAX = 50

/** 升华装备槽位分组：主控 / 协战一号 / 协战二号（各带一套独立装备） */
export type TranscendSlotGroup = "main" | "assist1" | "assist2"

/** 装备分组键：主控 8 槽 / 协战一 4 槽 / 协战二 4 槽（一人一套，互不共用） */
export type TranscendGearGroupKey = "main" | "assist1" | "assist2"

/**
 * 按槽位索引读取其归属的装备分组：1-8 主控，9-12 协战一，13-16 协战二。
 * @param slotId 槽位索引
 * @returns 装备分组；越界时为 null
 */
export function getTranscendGearGroupKeyOfSlot(slotId: number): TranscendGearGroupKey | null {
    if (!Number.isFinite(slotId)) return null
    const id = Math.round(slotId)
    if (id >= TRANSCEND_MAIN_SLOT_MIN && id <= TRANSCEND_MAIN_SLOT_MAX) return "main"
    if (id >= TRANSCEND_ASSIST1_SLOT_MIN && id <= TRANSCEND_ASSIST1_SLOT_MAX) return "assist1"
    if (id >= TRANSCEND_ASSIST2_SLOT_MIN && id <= TRANSCEND_ASSIST2_SLOT_MAX) return "assist2"
    return null
}

/**
 * 按构筑位读取装备分组：三组与构筑位一一对应。
 * @param side 构筑位
 * @returns 装备分组
 */
export function getTranscendGearGroupKey(side: TranscendSlotGroup): TranscendGearGroupKey {
    return side
}

/** post-U32b 旧形状：`assistGear` 为两个协战共用的 9-12 槽，只作只读兼容别名，不再写入 */
export interface TranscendLegacyGearGroups {
    assistGear?: TranscendGearGroup
}

/**
 * 读取构筑位的装备组：三组一人一套；兼容 post-U32b 存档的 `assistGear` 只读别名
 * （协战一取 `assist1Gear ?? assistGear`，协战二取 `assist2Gear ?? []`，不做数据迁移）。
 * @param settings 含三组装备的设置（可带旧字段）
 * @param side 构筑位
 * @returns 该位装备组；缺失时为空数组
 */
export function getTranscendSideGearGroup(
    settings: (Partial<TranscendGearGroups> & TranscendLegacyGearGroups) | null | undefined,
    side: TranscendSlotGroup
): TranscendGearGroup {
    if (!settings) return []
    if (side === "main") return Array.isArray(settings.mainGear) ? settings.mainGear : []
    if (side === "assist1") {
        if (Array.isArray(settings.assist1Gear)) return settings.assist1Gear
        return Array.isArray(settings.assistGear) ? settings.assistGear : []
    }
    return Array.isArray(settings.assist2Gear) ? settings.assist2Gear : []
}

/** 装备位 → 槽型：8 号位复用戒指槽型，协战一 9-12 / 协战二 13-16 复用护符/晶球/典籍/纹饰（槽型 8-11） */
const SLOT_INDEX_TO_TYPE: Record<number, number> = {
    1: 1,
    2: 2,
    3: 3,
    4: 4,
    5: 5,
    6: 6,
    7: 7,
    8: 7,
    9: 8,
    10: 9,
    11: 10,
    12: 11,
    13: 8,
    14: 9,
    15: 10,
    16: 11,
}

/**
 * 按装备位读取固有槽型。
 * @param slotId 装备位（1-16）
 * @returns 槽型（1-11）；越界时为 0
 */
export function getTranscendSlotType(slotId: number): number {
    return SLOT_INDEX_TO_TYPE[Math.round(slotId)] ?? 0
}

/** 词缀来源：槽位基础 / 随机 / 淬炼 / 附魔 / 暗金专属；旧物品无法推断时为 unknown */
export type TranscendGearAffixSource = "base" | "random" | "unique" | "tempering" | "enchant" | "unknown"

/** 一条词缀的养成状态（物品内的 roll，不含装备位） */
export interface TranscendGearAffixRoll {
    affixId: number
    /** 档位（1..词条 totalValueLevel） */
    rollLevel: number
    /** 精锻次数（0-10）：装备级状态的派生字段，归一化时统一写入，界面不得单独编辑 */
    masterworkLevel: number
    /** 太古：数值改取词条最大值再走太古公式 */
    ancient: boolean
    /** 最终精锻：装备级目标的派生字段，只有 `craft.finalMasterworkAffixIndex` 指向的词条为 true */
    finalMasterwork: boolean
    /** 词缀来源；不参与 hash（基础/随机由槽位基础词条推导，淬炼/附魔由 craft 索引派生） */
    source?: TranscendGearAffixSource
}

/**
 * 附魔快照（模拟器功能，游戏内没有该操作）：首次附魔时保存被替换词条的完整数据与下标，
 * 供 `resetEnchant` 恢复原词条；后续同槽附魔不覆盖，重置后清空。
 */
export interface TranscendGearEnchantSnapshot {
    /** 被替换词条在归一化 `affixes` 数组（保持识别 / 存档顺序）中的位置；该位置越界时快照丢弃 */
    affixIndex: number
    /** 被替换词条的完整数据（精锻 / 最终精锻是装备级派生字段，恢复时重算） */
    roll: TranscendGearAffixRoll
}

/**
 * 装备级 craft 状态（权威）：精锻 / 最终精锻目标 / 淬炼 / 附魔。
 * 索引均基于 `affixes` 数组；`affixes[].masterworkLevel` 与 `affixes[].finalMasterwork`
 * 只是本状态在归一化时写入的派生字段，不单独存储第二种口径。
 */
export interface TranscendGearCraftState {
    /** 精锻等级 0-10：装备级唯一，所有词条统一展开 */
    masterworkLevel: number
    /** 最终精锻目标词条下标（基于 `affixes`）；未最终精锻时缺省 */
    finalMasterworkAffixIndex?: number
    /** 淬炼词条下标（基于 `affixes`）；单件最多一条，未淬炼时缺省 */
    temperingAffixIndex?: number
    /** 淬炼累计次数（上游 `TemperingCount`，只作展示，不改变成本） */
    temperingCount: number
    /** 附魔词条下标（基于 `affixes`）；单件最多一个附魔槽，未附魔时缺省 */
    enchantAffixIndex?: number
    /** 附魔累计次数（上游 `EnchantCount`，决定下一次附魔费用成长） */
    enchantCount: number
    /** 附魔替换前的原词条快照（模拟器功能）；只在附魔中有效，重置附魔时消费 */
    enchantSnapshot?: TranscendGearEnchantSnapshot
}

/** 解析器输入：一条已落到装备位上的词缀（v1 平铺条目与展平结果共用） */
export interface TranscendGearEntry extends TranscendGearAffixRoll {
    slotId: number
    /** 来自镶嵌宝石时记下来源（仅展平结果使用） */
    gemId?: number
    /** 宝石所在孔位（仅展平结果使用） */
    socketIndex?: number
}

/** 装备类型：普通装备 / 暗金（唯一装） */
export type TranscendGearKind = "normal" | "unique"

/** 已镶嵌孔：真源是宝石 id + 孔位，效果由 `(gemId, item.slotType)` 解析 */
export interface TranscendGearSocket {
    /** 0..maxInlayCount-1 */
    socketIndex: number
    /** `DnaSeasonInlay.id`（= Resource.id） */
    gemId: number
    /** 安全模式 / 缺包时的宝石名称快照，不参与 hash */
    nameSnapshot?: string
    /** 宝石图标快照，不参与 hash */
    iconSnapshot?: string
}

/**
 * 完整装备物品配置（持久化与分享的真源）。
 * `slotType` 是物品固有槽型（1-11），与装备位（1-12）无关；展示快照不参与 hash。
 */
export interface TranscendGearItemConfig {
    kind: TranscendGearKind
    slotType: number
    /** 品质 id（1/2/3/4/5/10）；旧物品无值时不显示品质，不猜 */
    rarityId?: number
    /** 强度 `EquipBaseScore`（1-50）；决定基础词条档位与随机词条 roll 范围；旧物品无值时不显示 */
    equipBaseScore?: number
    /** 普通装备基础名 id（`baseNames.id`）；暗金用 `uniqueId` 的图标 */
    iconId?: number
    /** 普通装备名称前缀 id（`namePrefixes.id`，每槽唯一）；旧物品可缺省 */
    nameId?: number
    /** 生成该装备的赛季 id；旧物品可缺省 */
    seasonId?: number
    /** 暗金必填：唯一装以 uniqueId 区分（过滤 1.8 前遗留行后 32 件 / 32 个 affixId） */
    uniqueId?: number
    uniqueAffix?: TranscendGearAffixRoll
    /** 普通词缀（基础 + 随机 + 淬炼/附魔替换），最多 6 条（1 基础 + 4 随机 + 1 淬炼）；专属词条单独存 `uniqueAffix` */
    affixes: TranscendGearAffixRoll[]
    /** 装备级 craft 状态（精锻 / 最终精锻目标 / 淬炼 / 附魔）；归一化后恒存在 */
    craft?: TranscendGearCraftState
    /** 镶嵌孔，按 socketIndex 升序；只记录已镶嵌的孔，空孔由 `socketCount` 表达 */
    sockets?: TranscendGearSocket[]
    /** 已开孔数（0..槽型上限）：包含已镶嵌与未镶嵌的孔；缺省时按已镶嵌数推断 */
    socketCount?: number
    /** 安全模式 / 缺包时的展示快照，不参与 hash */
    nameSnapshot?: string
    iconSnapshot?: string
    /** 1.8 前遗留唯一装 / 跨槽 Plan 4 词条：保留原条目，normal 条目按词条重算，展示优先用快照，不参与 hash */
    legacyUnique?: boolean
    /** v1 迁移时同词条命中多件暗金的候选 id（取最小 id，不参与 hash） */
    legacyAmbiguousUnique?: number[]
}

/** 装备槽：装备位 + 完整物品配置 */
export interface TranscendEquippedGear {
    slotId: number
    item: TranscendGearItemConfig
}

/**
 * 装备组：完整物品列表；数据表不可用时可能暂存 v1 平铺条目（下次加载重试迁移）。
 * 读取方用 `isLegacyGearEntry` 区分两种形状。
 */
export type TranscendGearGroup = (TranscendEquippedGear | TranscendGearEntry)[]

/** 三组装备（`TranscendSettings` 的装备字段子集）：主控 + 协战一 + 协战二各一套 */
export interface TranscendGearGroups {
    mainGear: TranscendGearGroup
    assist1Gear: TranscendGearGroup
    assist2Gear: TranscendGearGroup
}

/** 归一化所需的词条最小信息（可注入，便于测试安全模式） */
export interface TranscendAffixInfo {
    id: number
    plan?: number
    totalValueLevel?: number
    ancientFunc?: unknown
    maxAffixUpdateFunc?: unknown
}

/** 暗金目录最小信息（迁移回填名称 / 图标快照） */
export interface TranscendUniqueEquipInfo {
    id: number
    /** 物品固有槽型 */
    slot: number
    affixId: number
    name?: string
    icon?: string
}

/** 装备数据源：缺省读静态数据表；安全模式（版本门限隐藏 1.8）下为空数组 */
export interface TranscendGearDatasets {
    affixes?: readonly TranscendAffixInfo[]
    slots?: readonly Pick<DnaSeasonSlot, "id" | "maxInlayCount" | "baseAffixId">[]
    inlays?: readonly Pick<DnaSeasonInlay, "id" | "affixIdsBySlot">[]
    uniqueEquips?: readonly TranscendUniqueEquipInfo[]
}

/** 物品归一化选项 */
export interface TranscendGearNormalizeOptions {
    /** 库存写入：未知词条 / 缺失专属词条不得裁剪或降级（库存自包含） */
    preserveUnknown?: boolean
    /** 归一化告警收集：craft 索引越界 / 重复最终目标 / 旧字段推导分歧（调用方决定展示） */
    warnings?: string[]
}

/** 解析后的数据源与查表 */
interface ResolvedGearDatasets {
    affixSource: readonly TranscendAffixInfo[]
    affixMap: Map<number, TranscendAffixInfo>
    hasAffixData: boolean
    slotSource: readonly Pick<DnaSeasonSlot, "id" | "maxInlayCount" | "baseAffixId">[]
    inlaySource: readonly Pick<DnaSeasonInlay, "id" | "affixIdsBySlot">[]
    uniqueSource: readonly TranscendUniqueEquipInfo[]
}

/** 默认词条索引缓存（数据包换入会替换数组，按引用校验后重建） */
let defaultAffixMapCache: { source: readonly TranscendAffixInfo[]; map: Map<number, TranscendAffixInfo> } | null = null

/**
 * 解析数据源（测试可注入空表验证安全模式）。
 * @param datasets 注入的数据源
 * @returns 数据源与词条索引
 */
function resolveDatasets(datasets?: TranscendGearDatasets): ResolvedGearDatasets {
    const affixSource = datasets?.affixes ?? affixes
    let affixMap: Map<number, TranscendAffixInfo>
    if (datasets?.affixes) {
        affixMap = new Map(affixSource.map(affix => [affix.id, affix]))
    } else {
        if (!defaultAffixMapCache || defaultAffixMapCache.source !== affixSource) {
            defaultAffixMapCache = { source: affixSource, map: new Map(affixSource.map(affix => [affix.id, affix])) }
        }
        affixMap = defaultAffixMapCache.map
    }
    return {
        affixSource,
        affixMap,
        hasAffixData: affixSource.length > 0,
        slotSource: datasets?.slots ?? slots,
        inlaySource: datasets?.inlays ?? inlays,
        uniqueSource: datasets?.uniqueEquips ?? uniqueEquips,
    }
}

/**
 * 判断是否是 v1 平铺词条（与 v2 装备槽结构互斥）。
 * @param value 原始值
 * @returns 是否为平铺词条
 */
export function isLegacyGearEntry(value: unknown): value is TranscendGearEntry {
    return !!value && typeof value === "object" && !Array.isArray(value) && "affixId" in value && !("item" in value)
}

/**
 * 判断是否是 v2 装备槽。
 * @param value 原始值
 * @returns 是否为装备槽
 */
export function isEquippedGear(value: unknown): value is TranscendEquippedGear {
    return !!value && typeof value === "object" && !Array.isArray(value) && "item" in value && "slotId" in value
}

/** 读取正整数；非法 / 缺省返回 null */
function toPositiveInt(value: unknown): number | null {
    const id = Math.round(Number(value))
    return Number.isFinite(id) && id > 0 ? id : null
}

/** 读取非负整数；非法 / 缺省返回 null */
function toNonNegativeInt(value: unknown): number | null {
    const id = Math.round(Number(value))
    return Number.isFinite(id) && id >= 0 ? id : null
}

/** 读取词缀来源；非法 / 缺省返回 null */
function toAffixSource(value: unknown): TranscendGearAffixSource | null {
    return value === "base" ||
        value === "random" ||
        value === "unique" ||
        value === "tempering" ||
        value === "enchant" ||
        value === "unknown"
        ? value
        : null
}

/**
 * 词缀去重来源类：淬炼单独一类，基础 / 随机 / 附魔 / 专属 / 缺失 / 非法值同一类（附魔只替换随机行）。
 * 同 id 的随机与淬炼词条可以共存，其余同 id 重复仍按「后者覆盖」去重。
 * 计算层行身份与派生展示共用此口径，不直接信任未归一化的 `source` 原值。
 * @param source 词缀来源
 * @returns 去重来源类
 */
export function getTranscendAffixDedupeClass(source: TranscendGearAffixSource | null | undefined): "tempering" | "other" {
    return source === "tempering" ? "tempering" : "other"
}

/** craft 目标行身份类：淬炼 / 附魔 / 其余（随机 / 基础 / 未知） */
type TranscendCraftTargetClass = "tempering" | "enchant" | "other"

/**
 * craft 目标行身份类：淬炼 / 附魔各自一类，随机 / 基础 / 未知归为 other。
 * 用于同 id 双行时把 craft 下标映射到正确的那一行（与去重类不同：附魔单独一类）。
 * @param source 词缀来源
 * @returns 行身份类
 */
function getCraftTargetClass(source: TranscendGearAffixSource | null | undefined): TranscendCraftTargetClass {
    if (source === "tempering") return "tempering"
    if (source === "enchant") return "enchant"
    return "other"
}

/**
 * 按槽型读取槽位基础词条 id（Plan 1）。
 * @param slotType 槽型 id
 * @param datasets 注入数据源
 * @returns 基础词条 id；槽位数据不可用或该槽型无基础词条时为 null
 */
export function getSlotBaseAffixId(slotType: number, datasets?: TranscendGearDatasets): number | null {
    const source = datasets?.slots ?? slots
    const slot = source.find(item => item.id === Math.round(slotType))
    const id = Math.round(Number(slot?.baseAffixId))
    return Number.isFinite(id) && id > 0 ? id : null
}

/**
 * 解析槽型孔位上限：槽位表存在该槽型时按 `maxInlayCount ?? 0`（0 表示不可镶嵌），
 * 只有整表不可用（安全模式 / 缺包）时才返回 unavailable。
 * @param slotType 槽型 id
 * @param source 槽位数据源
 * @returns 上限与数据是否可用
 */
function resolveInlayLimit(
    slotType: number,
    source: readonly Pick<DnaSeasonSlot, "id" | "maxInlayCount" | "baseAffixId">[]
): { available: boolean; max: number } {
    if (!source.length) return { available: false, max: 0 }
    const slot = source.find(item => item.id === Math.round(slotType))
    return { available: true, max: Math.max(0, Math.round(slot?.maxInlayCount ?? 0)) }
}

/**
 * 按槽型读取镶嵌孔上限（头/胸/手/脚为 2，饰品为 1，护符/印章/典籍/纹饰为 0）。
 * @param slotType 槽型 id
 * @param datasets 注入数据源
 * @returns 孔位上限
 */
export function getSlotMaxInlayCount(slotType: number, datasets?: TranscendGearDatasets): number {
    return resolveInlayLimit(slotType, datasets?.slots ?? slots).max
}

/**
 * 已开孔数：优先读 `socketCount`，缺省按已镶嵌孔的最大下标推断（旧存档 / 分享）。
 * @param item 装备物品（或只含孔位字段的最小结构）
 * @returns 已开孔数
 */
export function getGearItemSocketCount(item: Pick<TranscendGearItemConfig, "sockets" | "socketCount"> | null | undefined): number {
    if (!item || typeof item !== "object") return 0
    const raw = Math.round(Number(item.socketCount))
    const stored = Number.isFinite(raw) && raw > 0 ? raw : 0
    let needed = 0
    for (const socket of Array.isArray(item.sockets) ? item.sockets : []) {
        const index = Math.round(Number(socket?.socketIndex))
        if (Number.isFinite(index) && index >= 0) needed = Math.max(needed, index + 1)
    }
    return Math.max(stored, needed)
}

/**
 * 归一化一条词缀 roll：id 必须为正，档位与精造钳制到合法区间；
 * 安全模式（词条表为空）下保留结构，太古 / 最终精造只在词条配置公式时有效。
 * @param value 原始词缀
 * @param affixMap 词条 id → 词条数据
 * @param hasAffixData 词条表是否可用
 * @returns 归一化后的词缀；id 非法时为 null
 */
export function normalizeGearAffixRoll(
    value: unknown,
    affixMap: ReadonlyMap<number, TranscendAffixInfo>,
    hasAffixData: boolean
): TranscendGearAffixRoll | null {
    if (!value || typeof value !== "object") return null
    const raw = value as Partial<TranscendGearAffixRoll>
    const affixId = toPositiveInt(raw.affixId)
    if (affixId === null) return null
    const rollLevel = Number.isFinite(raw.rollLevel) ? Math.round(raw.rollLevel as number) : 1
    const masterwork = Number.isFinite(raw.masterworkLevel) ? Math.round(raw.masterworkLevel as number) : 0
    const source = toAffixSource(raw.source)
    const base = {
        affixId,
        masterworkLevel: Math.max(0, Math.min(TRANSCEND_MASTERWORK_MAX, masterwork)),
        ...(source ? { source } : {}),
    }
    const affix = affixMap.get(affixId)
    if (!affix) {
        if (hasAffixData) return null
        return { ...base, rollLevel: Math.max(1, rollLevel), ancient: raw.ancient === true, finalMasterwork: raw.finalMasterwork === true }
    }
    const total = Math.max(1, Math.round(affix.totalValueLevel || 1))
    return {
        ...base,
        rollLevel: Math.max(1, Math.min(total, rollLevel)),
        ancient: raw.ancient === true && Boolean(affix.ancientFunc),
        finalMasterwork: raw.finalMasterwork === true && Boolean(affix.maxAffixUpdateFunc),
    }
}

/** 读取升华品质 id；非法 / 缺省返回 undefined（旧物品不猜品质） */
function normalizeRarityId(value: unknown): number | undefined {
    const id = Math.round(Number(value))
    return (TRANSCEND_RARITY_IDS as readonly number[]).includes(id) ? id : undefined
}

/** 读取装备强度：合法时钳制到 1-50；非法 / 缺省返回 undefined */
function normalizeEquipBaseScore(value: unknown): number | undefined {
    if (value === null || value === undefined || value === "") return undefined
    const score = Number(value)
    if (!Number.isFinite(score)) return undefined
    return Math.max(TRANSCEND_EQUIP_BASE_SCORE_MIN, Math.min(TRANSCEND_EQUIP_BASE_SCORE_MAX, Math.round(score)))
}

/** 专属词条不提供 roll / 精造控件：统一固定为 1 档、0 精造、无太古 / 终造 */
function fixUniqueAffixRoll(roll: TranscendGearAffixRoll): TranscendGearAffixRoll {
    return { affixId: roll.affixId, rollLevel: 1, masterworkLevel: 0, ancient: false, finalMasterwork: false, source: "unique" }
}

/**
 * 按槽位基础词条与数据可用性推断词缀来源：
 * 命中槽位基础 id 为 base；淬炼 / 附魔来源原样保留（由 craft 索引在后续步骤核对）；
 * 表可用但该 id 不存在时为 unknown（库存自包含，不能伪装成 random）；
 * 表不可用时保留显式 base/random，缺省 unknown。
 * @param roll 词缀
 * @param baseAffixId 槽位基础词条 id
 * @param hasAffixData 词条表是否可用
 * @param affixExists 数据表里是否存在该词条
 * @returns 补全来源后的词缀
 */
function withAffixSource(
    roll: TranscendGearAffixRoll,
    baseAffixId: number | null,
    hasAffixData: boolean,
    affixExists: boolean
): TranscendGearAffixRoll {
    if (baseAffixId !== null && roll.affixId === baseAffixId) return { ...roll, source: "base" }
    if (roll.source === "tempering" || roll.source === "enchant") return roll
    if (!hasAffixData) {
        const source = roll.source === "base" || roll.source === "random" ? roll.source : "unknown"
        return { ...roll, source }
    }
    return { ...roll, source: affixExists ? "random" : "unknown" }
}

/** 词条裁剪选项：告警收集 + 权威 craft 指定的淬炼词条（裁剪时必须保留） */
interface TranscendLimitAffixesOptions {
    warnings?: string[]
    /** craft.temperingAffixIndex 指向的词条 id：优先于其它杂散 tempering 标记保留 */
    temperingAffixId?: number
}

/**
 * 按「最多 1 条基础 + 1 条淬炼 + 4 条其他（随机 / 附魔替换）」裁剪词缀并补来源。
 * 词缀表可用时未知 id 标 unknown；表不可用时保留显式 base/random。
 * 有权威 craft 淬炼目标时强制保留该词条（避免旧杂散标记挤掉目标）；丢弃时写入告警。
 * 输出保持入参顺序（与识别 / 编辑数组顺序一致），不按来源或 affixId 重排。
 * @param rolls 词缀列表（已去重）
 * @param baseAffixId 槽位基础词条 id
 * @param hasAffixData 词条表是否可用
 * @param affixExists 词条 id 是否存在
 * @param options 裁剪选项
 * @returns 裁剪后的词缀（保持输入顺序）
 */
function limitItemAffixes(
    rolls: readonly TranscendGearAffixRoll[],
    baseAffixId: number | null,
    hasAffixData: boolean,
    affixExists: (affixId: number) => boolean,
    options: TranscendLimitAffixesOptions = {}
): TranscendGearAffixRoll[] {
    const sourced = rolls.map(roll => withAffixSource(roll, baseAffixId, hasAffixData, affixExists(roll.affixId)))
    const indexed = sourced.map((roll, index) => ({ roll, index }))
    const warnings = options.warnings
    const baseRolls = indexed.filter(entry => entry.roll.source === "base")
    const base = baseRolls.slice(0, 1)
    if (baseRolls.length > 1) warnings?.push(`基础词条有 ${baseRolls.length} 条，只保留 ${base[0].roll.affixId}`)
    const temperingRolls = indexed.filter(entry => entry.roll.source === "tempering")
    const hinted =
        options.temperingAffixId === undefined ? undefined : temperingRolls.find(entry => entry.roll.affixId === options.temperingAffixId)
    const tempering = hinted ? [hinted] : temperingRolls.slice(0, 1)
    const droppedTempering = temperingRolls.filter(entry => entry !== tempering[0])
    if (droppedTempering.length) {
        warnings?.push(`淬炼词条有 ${temperingRolls.length} 条，只保留 ${tempering[0].roll.affixId}`)
    }
    // 附魔只替换既有随机词条、不新增：附魔来源占用随机词条的 4 个名额
    const otherRolls = indexed.filter(entry => entry.roll.source !== "base" && entry.roll.source !== "tempering")
    const others = otherRolls.slice(0, TRANSCEND_MAX_AFFIXES_PER_SLOT)
    for (const dropped of otherRolls.slice(TRANSCEND_MAX_AFFIXES_PER_SLOT)) {
        warnings?.push(`词条 ${dropped.roll.affixId} 超出随机词条上限 ${TRANSCEND_MAX_AFFIXES_PER_SLOT}，已丢弃`)
    }
    const keptIndexes = new Set([...base, ...tempering, ...others].map(entry => entry.index))
    return sourced.filter((_, index) => keptIndexes.has(index))
}

/** 词缀列表去重选项：craft 权威淬炼下标指向的原始行先按淬炼类归类 */
interface TranscendAffixDedupeOptions {
    /** 原始列表中淬炼词条的下标（`craft.temperingAffixIndex`）：去重键按淬炼类计算 */
    temperingIndex?: number
}

/**
 * 归一化词缀列表（有序数组去重）：保持输入顺序，同一「来源类 + affixId」保留首次出现的位置、
 * 后者覆盖其值（保留「后者覆盖」告警），截断到上限时不重排。
 * 淬炼单独一类：同 id 的随机 / 附魔词条不与其互相去重。
 * @param value 原始列表
 * @param limit 数量上限
 * @param datasets 注入数据源
 * @param preserveUnknown 是否保留数据表里不存在的词条（库存写入）
 * @param warnings 告警收集（重复词条 / 超限截断）
 * @param options 去重选项（craft 淬炼下标）
 * @returns 归一化后的词缀（输入顺序）
 */
function normalizeAffixRollList(
    value: unknown,
    limit: number,
    datasets: ResolvedGearDatasets,
    preserveUnknown = false,
    warnings?: string[],
    options: TranscendAffixDedupeOptions = {}
): TranscendGearAffixRoll[] {
    if (!Array.isArray(value)) return []
    const rolls: TranscendGearAffixRoll[] = []
    const indexByKey = new Map<string, number>()
    for (const [position, item] of value.entries()) {
        let roll = normalizeGearAffixRoll(item, datasets.affixMap, preserveUnknown ? false : datasets.hasAffixData)
        if (!roll) continue
        // craft 下标是权威：该行即使没带来源也按淬炼类参与去重，避免同 id 随机行先出现时把它挤掉
        if (position === options.temperingIndex) roll = { ...roll, source: "tempering" }
        const key = `${getTranscendAffixDedupeClass(roll.source)}:${roll.affixId}`
        const existing = indexByKey.get(key)
        if (existing !== undefined) {
            warnings?.push(`词条 ${roll.affixId} 重复，后者覆盖`)
            // 没有 craft 淬炼提示时，无来源的同 id 行无法区分随机 / 淬炼：补一条可操作告警，避免静默丢行
            if (
                options.temperingIndex === undefined &&
                getTranscendAffixDedupeClass(roll.source) === "other" &&
                (roll.source === undefined || rolls[existing].source === undefined)
            ) {
                warnings?.push(
                    `词条 ${roll.affixId} 无来源重复，已按同类去重；若其中一条为淬炼行，持久化必须保留 craft.temperingAffixIndex`
                )
            }
            rolls[existing] = roll
            continue
        }
        indexByKey.set(key, rolls.length)
        rolls.push(roll)
    }
    if (rolls.length > limit) {
        warnings?.push(`词条数量 ${rolls.length} 超过上限 ${limit}，已截断`)
        return rolls.slice(0, limit)
    }
    return rolls
}

/** 归一化后的孔位状态：已镶嵌列表 + 已开孔数 */
interface TranscendNormalizedSocketState {
    sockets?: TranscendGearSocket[]
    socketCount?: number
}

/**
 * 归一化孔位：同一孔位先出现优先，允许不同孔位重复宝石；`socketIndex` 必须在该槽型上限内。
 * 不变量 `0 ≤ sockets.length ≤ socketCount ≤ maxInlayCount`：缺省按已镶嵌数推断，低于已镶嵌所需时抬高，
 * 高于槽型上限时截到上限；8-11 号槽位（上限 0）清空孔位。未知宝石保留 id 交由展平告警。
 * @param value 原始孔位列表
 * @param rawCount 原始已开孔数
 * @param slotType 物品槽型
 * @param datasets 注入数据源
 * @returns 归一化后的孔位状态
 */
function normalizeSocketState(
    value: unknown,
    rawCount: unknown,
    slotType: number,
    datasets: ResolvedGearDatasets
): TranscendNormalizedSocketState {
    const limit = resolveInlayLimit(slotType, datasets.slotSource)
    const byIndex = new Map<number, TranscendGearSocket>()
    for (const item of Array.isArray(value) ? value : []) {
        if (!item || typeof item !== "object") continue
        const raw = item as Partial<TranscendGearSocket>
        const socketIndex = toNonNegativeInt(raw.socketIndex)
        const gemId = toPositiveInt(raw.gemId)
        if (socketIndex === null || gemId === null) continue
        // 槽位表可用时强制裁剪：max=0（护符/印章/典籍/纹饰）表示不能镶嵌任何宝石
        if (limit.available && socketIndex >= limit.max) continue
        if (byIndex.has(socketIndex)) continue
        const socket: TranscendGearSocket = { socketIndex, gemId }
        if (typeof raw.nameSnapshot === "string" && raw.nameSnapshot.trim()) socket.nameSnapshot = raw.nameSnapshot.trim()
        if (typeof raw.iconSnapshot === "string" && raw.iconSnapshot.trim()) socket.iconSnapshot = raw.iconSnapshot.trim()
        byIndex.set(socketIndex, socket)
    }
    const sockets = [...byIndex.values()].sort((left, right) => left.socketIndex - right.socketIndex)
    if (limit.available && limit.max <= 0) return {}
    const filled = sockets.length ? sockets[sockets.length - 1].socketIndex + 1 : 0
    const stored = toNonNegativeInt(rawCount)
    let count = Math.max(stored ?? sockets.length, filled)
    if (limit.available) count = Math.min(count, limit.max)
    // 抬高规则保证 count ≥ filled（槽位表可用时 filled 已被上限过滤），正常路径不会裁孔；
    // 保留过滤只作防御，避免后续改动破坏不变量时静默丢孔
    const kept = sockets.filter(socket => socket.socketIndex < count)
    return {
        ...(kept.length ? { sockets: kept } : {}),
        ...(count > 0 ? { socketCount: count } : {}),
    }
}

/**
 * 归一化单件装备配置：槽型 / 类型 / 词缀上限 / 孔位与已开孔数；普通词条最多 1 条基础 + 4 条随机 + 1 条淬炼，
 * 超出部分截断；暗金缺 `uniqueId` 时降级为普通装备。专属词条的 roll / 精锻固定为 1 档 / 0 次。
 * 装备级 craft 状态是精锻 / 最终精锻 / 淬炼 / 附魔的唯一权威，per-affix 字段在此步骤派生写入。
 * @param value 原始物品
 * @param datasets 注入数据源
 * @param options 归一化选项（库存写入用 preserveUnknown，告警用 warnings）
 * @returns 归一化后的物品；槽型非法时为 null
 */
export function normalizeGearItem(
    value: unknown,
    datasets?: TranscendGearDatasets,
    options?: TranscendGearNormalizeOptions
): TranscendGearItemConfig | null {
    return normalizeGearItemWithDatasets(value, resolveDatasets(datasets), options)
}

/** 持久化词缀：只保留 affixId / 档位 / 太古（精锻 / 最终精锻 / 来源由 craft 重建） */
interface TranscendStoredAffixRoll {
    affixId: number
    rollLevel: number
    ancient?: boolean
}

/** 持久化 craft：装备级状态是派生字段的唯一权威；附魔快照的 roll 同样只留源字段 */
interface TranscendStoredCraftState {
    masterworkLevel: number
    finalMasterworkAffixIndex?: number
    temperingAffixIndex?: number
    temperingCount: number
    enchantAffixIndex?: number
    enchantCount: number
    enchantSnapshot?: { affixIndex: number; roll: TranscendStoredAffixRoll }
}

/** 裁剪词缀为持久化最小形状 */
function toStoredAffixRoll(roll: TranscendGearAffixRoll): TranscendStoredAffixRoll {
    const stored: TranscendStoredAffixRoll = { affixId: Math.round(roll.affixId), rollLevel: Math.round(roll.rollLevel) }
    if (roll.ancient === true) stored.ancient = true
    return stored
}

/** 裁剪 craft 为持久化最小形状；结构不合法时返回 null */
function toStoredCraftState(craft: TranscendGearCraftState | undefined): TranscendStoredCraftState | null {
    if (!craft || typeof craft !== "object" || Array.isArray(craft)) return null
    const stored: TranscendStoredCraftState = {
        masterworkLevel: clampMasterwork(craft.masterworkLevel),
        temperingCount: toNonNegativeInt(craft.temperingCount) ?? 0,
        enchantCount: toNonNegativeInt(craft.enchantCount) ?? 0,
    }
    const finalIndex = toCraftIndex(craft.finalMasterworkAffixIndex)
    if (finalIndex !== undefined) stored.finalMasterworkAffixIndex = finalIndex
    const temperingIndex = toCraftIndex(craft.temperingAffixIndex)
    if (temperingIndex !== undefined) stored.temperingAffixIndex = temperingIndex
    const enchantIndex = toCraftIndex(craft.enchantAffixIndex)
    if (enchantIndex !== undefined) stored.enchantAffixIndex = enchantIndex
    const snapshot = craft.enchantSnapshot
    if (snapshot && typeof snapshot === "object" && snapshot.roll && typeof snapshot.roll === "object") {
        const affixIndex = toCraftIndex(snapshot.affixIndex)
        if (affixIndex !== undefined) stored.enchantSnapshot = { affixIndex, roll: toStoredAffixRoll(snapshot.roll) }
    }
    return stored
}

/**
 * 裁剪为持久化最小形状：只保留复现所需的语义源字段（纯结构白名单，不查数据表）。
 * 展示快照（名称 / 图标）与可从 craft 重算的派生字段（每词条精锻 / 最终精锻 / 来源）一律丢弃，
 * 读取时由 `hydrateStoredGearItem` 按当前数据与 craft 重建，避免跨版本复原时数据漂移。
 * @param item 归一化后的装备物品
 * @returns 只含源字段的物品（结构上等价于 `TranscendGearItemConfig`，派生字段缺省）
 */
export function toStoredGearItem(item: TranscendGearItemConfig): TranscendGearItemConfig {
    const stored: Record<string, unknown> = {
        kind: item.kind === "unique" ? "unique" : "normal",
        slotType: Math.round(item.slotType),
        affixes: (Array.isArray(item.affixes) ? item.affixes : []).map(toStoredAffixRoll),
    }
    for (const key of ["rarityId", "equipBaseScore", "iconId", "nameId", "seasonId", "uniqueId", "socketCount"] as const) {
        const value = item[key]
        if (typeof value === "number" && Number.isFinite(value)) stored[key] = Math.round(value)
    }
    if (item.uniqueAffix) stored.uniqueAffix = toStoredAffixRoll(item.uniqueAffix)
    const craft = toStoredCraftState(item.craft)
    if (craft) stored.craft = craft
    const sockets = (Array.isArray(item.sockets) ? item.sockets : [])
        .filter(socket => Number.isFinite(socket?.socketIndex) && Number.isFinite(socket?.gemId))
        .map(socket => ({ socketIndex: Math.round(socket.socketIndex), gemId: Math.round(socket.gemId) }))
    if (sockets.length) stored.sockets = sockets
    if (item.legacyUnique === true) stored.legacyUnique = true
    if (Array.isArray(item.legacyAmbiguousUnique)) {
        const legacy = [
            ...new Set(item.legacyAmbiguousUnique.filter(id => typeof id === "number" && Number.isFinite(id)).map(id => Math.round(id))),
        ].sort((left, right) => left - right)
        if (legacy.length) stored.legacyAmbiguousUnique = legacy
    }
    return stored as unknown as TranscendGearItemConfig
}

/**
 * 由持久化最小形状还原完整物品：按当前数据与 `craft` 重算词条来源 / 精锻 / 最终精锻等派生字段。
 * 兼容带展示快照的旧行（快照原样保留，新写入不再产生）。
 * @param item 持久化物品
 * @returns 完整物品；结构非法时为 null
 */
export function hydrateStoredGearItem(item: TranscendGearItemConfig): TranscendGearItemConfig | null {
    return normalizeGearItem(item, undefined, { preserveUnknown: true })
}

/** 精锻等级钳制到 0-10 */
function clampMasterwork(value: unknown): number {
    const level = Number.isFinite(value) ? Math.round(Number(value)) : 0
    return Math.max(0, Math.min(TRANSCEND_MASTERWORK_MAX, level))
}

/**
 * 把原始 craft 下标映射到归一化后的词条下标：按下标行 id 查找；
 * 给了期望行身份类（淬炼 / 附魔 / 随机）时优先命中同类行，避免同 id 随机行排在前面时指错。
 * 越界 / 指向非法词条 / 词条已被裁剪时返回 undefined 并写入告警。
 * @param value 原始 craft 下标
 * @param rawAffixes 原始词条数组（下标基准）
 * @param affixes 归一化后的词条列表
 * @param label 告警中的字段名
 * @param warnings 告警收集
 * @param preferredClass 期望行身份类（淬炼 / 附魔 / 其余）
 * @returns 归一化后的下标；越界 / 目标被裁剪时为 undefined
 */
function resolveCraftAffixIndex(
    value: unknown,
    rawAffixes: readonly unknown[],
    affixes: readonly TranscendGearAffixRoll[],
    label: string,
    warnings?: string[],
    preferredClass?: TranscendCraftTargetClass
): number | undefined {
    if (value === undefined || value === null) return undefined
    const index = Math.round(Number(value))
    if (!Number.isFinite(index) || index < 0 || index >= rawAffixes.length) {
        warnings?.push(`craft.${label} 下标 ${String(value)} 越界，已忽略`)
        return undefined
    }
    const raw = rawAffixes[index]
    const affixId = raw && typeof raw === "object" ? toPositiveInt((raw as { affixId?: unknown }).affixId) : null
    if (affixId === null) {
        warnings?.push(`craft.${label} 指向的词条不存在，已忽略`)
        return undefined
    }
    const preferred =
        preferredClass === undefined
            ? -1
            : affixes.findIndex(roll => roll.affixId === affixId && getCraftTargetClass(roll.source) === preferredClass)
    const mapped = preferred >= 0 ? preferred : affixes.findIndex(roll => roll.affixId === affixId)
    if (mapped < 0) {
        warnings?.push(`craft.${label} 指向的词条 ${affixId} 已被裁剪，已忽略`)
        return undefined
    }
    return mapped
}

/**
 * 最终精锻目标的期望行身份类：craft 下标与淬炼 / 附魔指向同一行时取该类；
 * 否则原始行带来源时取该来源类；无来源（持久化形状）时取 other（该下标不是淬炼 / 附魔行）。
 * @param rawCraft 原始装备级状态
 * @param rawAffixes 原始词条数组（下标基准）
 * @returns 行身份类；最终目标下标缺失时 undefined
 */
function resolveFinalMasterworkClass(
    rawCraft: Partial<TranscendGearCraftState>,
    rawAffixes: readonly unknown[]
): TranscendCraftTargetClass | undefined {
    const finalIndex = toCraftIndex(rawCraft.finalMasterworkAffixIndex)
    if (finalIndex === undefined) return undefined
    if (finalIndex === toCraftIndex(rawCraft.temperingAffixIndex)) return "tempering"
    if (finalIndex === toCraftIndex(rawCraft.enchantAffixIndex)) return "enchant"
    const raw = rawAffixes[finalIndex]
    const source = raw && typeof raw === "object" ? toAffixSource((raw as { source?: unknown }).source) : null
    return source === null ? "other" : getCraftTargetClass(source)
}

/** craft 词条目标的最小数据信息 */
export interface TranscendCraftTargetAffixInfo {
    maxAffixUpdateFunc?: unknown
}

/** 共享 craft 目标解析上下文：归一化 / 规则层 / 展平同口径 */
export interface TranscendCraftTargetContext {
    /** 词条 id → 最小信息；缺省视为没有词条数据 */
    affixMap?: ReadonlyMap<number, TranscendCraftTargetAffixInfo>
    /** 是否有词条数据；无数据时未知词条不判死 */
    hasAffixData?: boolean
    /** 保留未知词条（库存写入）时未知最终目标不判死 */
    preserveUnknown?: boolean
    baseAffixId?: number | null
    uniqueAffixId?: number
    /** 精锻上限；缺省 `TRANSCEND_MASTERWORK_MAX` */
    maxMasterwork?: number
    warnings?: string[]
}

/** 共享 craft 目标选择输入 */
export interface TranscendCraftTargetSelection {
    masterworkLevel: number
    /** 显式最终目标下标；null / undefined 表示缺省（craft 路径） */
    finalMasterworkAffixIndex?: number | null
    /** 旧物品的 final 标记下标；给出时按「首条可承载」选择 */
    finalMasterworkCandidates?: readonly number[]
    temperingAffixIndex?: number | null
    enchantAffixIndex?: number | null
}

/** 共享 craft 目标解析结果 */
export interface TranscendCraftTargets {
    finalMasterworkAffixIndex?: number
    temperingAffixIndex?: number
    enchantAffixIndex?: number
}

/** 下标是否可用（排除 null / undefined / 非有限值 / 负数） */
function toCraftIndex(value: unknown): number | undefined {
    if (value === undefined || value === null) return undefined
    const index = Math.round(Number(value))
    return Number.isFinite(index) && index >= 0 ? index : undefined
}

/**
 * 词条能否承载最终精锻：有数据时必须有 `MaxAffixUpdateFunc`；
 * 无词条数据或保留未知词条模式下，未知词条不判死。
 * @param affixId 词条 id
 * @param context 数据上下文
 * @returns 可承载为 true
 */
export function canGearAffixBeFinal(
    affixId: number,
    context: Pick<TranscendCraftTargetContext, "affixMap" | "hasAffixData" | "preserveUnknown"> = {}
): boolean {
    const affix = context.affixMap?.get(Math.round(Number(affixId)))
    if (!affix) return context.hasAffixData === false || context.preserveUnknown === true
    return Boolean(affix.maxAffixUpdateFunc)
}

/**
 * 共享 craft 目标解析：最终精锻（显式目标或旧物品多条标记取首条可承载）、淬炼、附魔。
 * 统一排除基础 / 专属词条，附魔与淬炼不能同一词条；目标被清除时不返回该下标。
 * @param rolls 已归一化词条
 * @param selection 目标选择
 * @param context 数据上下文与告警
 * @returns 合法目标下标
 */
export function resolveCraftTargets(
    rolls: readonly TranscendGearAffixRoll[],
    selection: TranscendCraftTargetSelection,
    context: TranscendCraftTargetContext = {}
): TranscendCraftTargets {
    const warnings = context.warnings
    const maxMasterwork = context.maxMasterwork ?? TRANSCEND_MASTERWORK_MAX
    const inRange = (value: unknown): number | undefined => {
        const index = toCraftIndex(value)
        return index !== undefined && index < rolls.length ? index : undefined
    }
    let finalIndex: number | undefined
    if (selection.finalMasterworkCandidates) {
        const candidates = selection.finalMasterworkCandidates.filter(index => index >= 0 && index < rolls.length)
        if (candidates.length > 1) warnings?.push(`最终精锻目标有 ${candidates.length} 条，取第一条可生效词条`)
        finalIndex = candidates.find(index => canGearAffixBeFinal(rolls[index].affixId, context))
        if (candidates.length && finalIndex === undefined) {
            warnings?.push("最终精锻目标词条没有 MaxAffixUpdateFunc，已忽略")
        }
    } else {
        finalIndex = inRange(selection.finalMasterworkAffixIndex)
        if (finalIndex !== undefined && !canGearAffixBeFinal(rolls[finalIndex].affixId, context)) {
            warnings?.push(`最终精锻目标词条 ${rolls[finalIndex].affixId} 没有 MaxAffixUpdateFunc，已忽略`)
            finalIndex = undefined
        }
    }
    if (finalIndex !== undefined && selection.masterworkLevel < maxMasterwork) {
        warnings?.push(`精锻等级 ${selection.masterworkLevel} 未满 ${maxMasterwork}，最终精锻目标已忽略`)
        finalIndex = undefined
    }

    let temperingIndex = inRange(selection.temperingAffixIndex)
    if (temperingIndex !== undefined) {
        const affixId = rolls[temperingIndex].affixId
        if (affixId === context.baseAffixId || affixId === context.uniqueAffixId) {
            warnings?.push(`淬炼词条不能是基础 / 专属词条 ${affixId}，已忽略`)
            temperingIndex = undefined
        }
    }
    let enchantIndex = inRange(selection.enchantAffixIndex)
    if (enchantIndex !== undefined) {
        const affixId = rolls[enchantIndex].affixId
        if (affixId === context.baseAffixId || affixId === context.uniqueAffixId) {
            warnings?.push(`附魔词条不能是基础 / 专属词条 ${affixId}，已忽略`)
            enchantIndex = undefined
        } else if (enchantIndex === temperingIndex) {
            warnings?.push("附魔词条不能是淬炼词条，已忽略")
            enchantIndex = undefined
        }
    }

    const targets: TranscendCraftTargets = {}
    if (finalIndex !== undefined) targets.finalMasterworkAffixIndex = finalIndex
    if (temperingIndex !== undefined) targets.temperingAffixIndex = temperingIndex
    if (enchantIndex !== undefined) targets.enchantAffixIndex = enchantIndex
    return targets
}

/** 附魔快照解析上下文：归一化 / 规则层 / 提交共用 */
export interface TranscendEnchantSnapshotContext {
    /** 词条 id → 最小信息；缺省视为没有词条数据 */
    affixMap?: ReadonlyMap<number, TranscendAffixInfo>
    /** 是否有词条数据；无数据时未知词条不判死 */
    hasAffixData: boolean
    /** 保留未知词条（库存写入）时未知快照词条不判死 */
    preserveUnknown?: boolean
    baseAffixId?: number | null
    uniqueAffixId?: number
    /** 当前精锻等级：快照精锻字段统一写入该值（装备级派生，不单独存储） */
    masterworkLevel: number
    /** 原始词条数组长度；快照下标必须落在 `[0, count)` 内 */
    rawAffixCount?: number
    warnings?: string[]
}

/**
 * 解析附魔快照：校验下标与词条，下标必须指向当前 `affixes` 数组中真实存在的行。
 * 下标越界（含目标行已被去重 / 裁剪） / 词条非法 / 与当前状态矛盾（词条仍在数组、基础 / 专属词条）时
 * 丢弃快照并告警，不钳到其它行、不自行编造词缀；快照只描述被替换行，不参与计算。
 * @param value 原始快照
 * @param affixes 当前已归一化词条（与存档同序）
 * @param context 数据上下文与告警
 * @returns 归一化后的快照；不可用时 undefined
 */
export function resolveEnchantSnapshot(
    value: unknown,
    affixes: readonly TranscendGearAffixRoll[],
    context: TranscendEnchantSnapshotContext
): TranscendGearEnchantSnapshot | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
    const raw = value as Partial<TranscendGearEnchantSnapshot>
    const warnings = context.warnings
    const rawIndex = raw.affixIndex
    if (rawIndex === undefined || rawIndex === null) {
        warnings?.push("craft.enchantSnapshot 缺少下标，已忽略")
        return undefined
    }
    const index = Math.round(Number(rawIndex))
    const limit = context.rawAffixCount
    if (!Number.isFinite(index) || index < 0 || (limit !== undefined && index >= limit)) {
        warnings?.push(`craft.enchantSnapshot 下标 ${String(rawIndex)} 越界，已忽略`)
        return undefined
    }
    // 去重 / 裁剪后目标行可能已不存在：位置语义下不得钳到其它行
    if (index >= affixes.length) {
        warnings?.push(`craft.enchantSnapshot 下标 ${index} 指向的词条行已不存在，已忽略`)
        return undefined
    }
    const roll = normalizeGearAffixRoll(
        raw.roll,
        context.affixMap ?? new Map(),
        context.preserveUnknown === true ? false : context.hasAffixData
    )
    if (!roll) {
        warnings?.push("craft.enchantSnapshot 词条非法，已忽略")
        return undefined
    }
    const baseAffixId = context.baseAffixId ?? null
    const affixExists = context.affixMap?.has(roll.affixId) ?? false
    if (roll.affixId === baseAffixId || roll.affixId === context.uniqueAffixId || affixes.some(entry => entry.affixId === roll.affixId)) {
        warnings?.push(`craft.enchantSnapshot 词条 ${roll.affixId} 与当前状态矛盾，已忽略`)
        return undefined
    }
    const sourced = withAffixSource(roll, baseAffixId, context.hasAffixData, affixExists)
    return {
        affixIndex: index,
        roll: { ...sourced, masterworkLevel: context.masterworkLevel, finalMasterwork: false },
    }
}

/**
 * 旧物品（无权威 craft）按 per-affix 派生字段选择目标：精锻取最大等级、最终目标取首条可承载词条、
 * 淬炼 / 附魔按来源标记取第一条；与归一化共用 `resolveCraftTargets`。
 * @param affixes 已归一化 / 裁剪的词条
 * @param context 数据上下文与告警
 * @returns 精锻等级与目标下标（基于传入词条）
 */
function deriveLegacyCraftTargets(
    affixes: readonly TranscendGearAffixRoll[],
    context: TranscendCraftTargetContext
): { masterworkLevel: number; targets: TranscendCraftTargets } {
    let masterworkLevel = 0
    for (const roll of affixes) masterworkLevel = Math.max(masterworkLevel, clampMasterwork(roll.masterworkLevel))
    const finals = affixes.flatMap((roll, index) => (roll.finalMasterwork === true ? [index] : []))
    const sourceTempering = affixes.findIndex(roll => roll.source === "tempering")
    const sourceEnchant = affixes.findIndex(roll => roll.source === "enchant")
    const targets = resolveCraftTargets(
        affixes,
        {
            masterworkLevel,
            finalMasterworkCandidates: finals,
            temperingAffixIndex: sourceTempering >= 0 ? sourceTempering : undefined,
            enchantAffixIndex: sourceEnchant >= 0 ? sourceEnchant : undefined,
        },
        context
    )
    return { masterworkLevel, targets }
}

/** 未归一化旧物品的 craft 推导结果：目标下标已映射回入参词条数组 */
export interface TranscendLegacyGearCraftState {
    masterworkLevel: number
    finalMasterworkAffixIndex?: number
    temperingAffixIndex?: number
    enchantAffixIndex?: number
}

/**
 * 未归一化旧物品（无权威 craft）的 craft 状态：先按 `normalizeGearItem` 同口径整理词条
 * （顺序数组去重、1 基础 + 4 随机 + 1 淬炼裁剪，保持输入顺序），再按 per-affix 派生字段选目标；
 * 目标按「affixId + 原始来源类」映射回入参词条数组（无同类行时回退首个同 id）。
 * @param item 装备物品
 * @param datasets 注入数据源
 * @param options 归一化选项（preserveUnknown / warnings）
 * @returns 精锻等级与目标下标
 */
export function resolveLegacyGearCraftState(
    item:
        | (Pick<TranscendGearItemConfig, "affixes"> &
              Partial<Pick<TranscendGearItemConfig, "slotType" | "kind" | "uniqueId" | "uniqueAffix">>)
        | null
        | undefined,
    datasets?: TranscendGearDatasets,
    options?: TranscendGearNormalizeOptions
): TranscendLegacyGearCraftState {
    const resolved = resolveDatasets(datasets)
    const preserveUnknown = options?.preserveUnknown === true
    const warnings = options?.warnings
    const rawAffixes = Array.isArray(item?.affixes) ? item.affixes : []
    const slotType = Math.round(Number(item?.slotType))
    const baseAffixId = Number.isFinite(slotType) ? getSlotBaseAffixId(slotType, { slots: resolved.slotSource }) : null
    const parsedUnique = normalizeGearAffixRoll(item?.uniqueAffix, resolved.affixMap, preserveUnknown ? false : resolved.hasAffixData)
    const uniqueAffixId =
        item?.kind === "unique" && toPositiveInt(item.uniqueId) !== null && parsedUnique ? parsedUnique.affixId : undefined
    let affixes = normalizeAffixRollList(rawAffixes, Number.POSITIVE_INFINITY, resolved, preserveUnknown, warnings)
    if (uniqueAffixId !== undefined) affixes = affixes.filter(roll => roll.affixId !== uniqueAffixId)
    affixes = limitItemAffixes(affixes, baseAffixId, resolved.hasAffixData, affixId => resolved.affixMap.has(affixId), {
        warnings,
    })
    const { masterworkLevel, targets } = deriveLegacyCraftTargets(affixes, {
        affixMap: resolved.affixMap,
        hasAffixData: resolved.hasAffixData,
        preserveUnknown,
        baseAffixId,
        uniqueAffixId,
        maxMasterwork: TRANSCEND_MASTERWORK_MAX,
        warnings,
    })
    // 同 id 可跨来源类共存：优先匹配「id + 原始来源类」，没有同类行时回退首个同 id
    const rawIndexOf = (index: number | undefined): number | undefined => {
        if (index === undefined) return undefined
        const target = affixes[index]
        if (!target) return undefined
        const affixId = target.affixId
        const targetClass = getTranscendAffixDedupeClass(target.source)
        let fallback: number | undefined
        for (let position = 0; position < rawAffixes.length; position += 1) {
            const candidate = rawAffixes[position]
            if (!candidate || typeof candidate !== "object") continue
            if (toPositiveInt((candidate as { affixId?: unknown }).affixId) !== affixId) continue
            if (fallback === undefined) fallback = position
            const source = toAffixSource((candidate as { source?: unknown }).source)
            if (getTranscendAffixDedupeClass(source) === targetClass) return position
        }
        return fallback
    }
    const state: TranscendLegacyGearCraftState = { masterworkLevel }
    const finalIndex = rawIndexOf(targets.finalMasterworkAffixIndex)
    const temperingIndex = rawIndexOf(targets.temperingAffixIndex)
    const enchantIndex = rawIndexOf(targets.enchantAffixIndex)
    if (finalIndex !== undefined) state.finalMasterworkAffixIndex = finalIndex
    if (temperingIndex !== undefined) state.temperingAffixIndex = temperingIndex
    if (enchantIndex !== undefined) state.enchantAffixIndex = enchantIndex
    return state
}

/** 归一化后的装备级 craft 状态与其派生词条 */
interface TranscendResolvedCraft {
    craft: TranscendGearCraftState
    affixes: TranscendGearAffixRoll[]
}

/**
 * 解析装备级 craft 状态并派生词条字段：
 * 有 `raw.craft` 时以其为权威（索引按 affixId 映射）；旧物品按 per-affix 值推导
 * （精锻取最大等级，最终目标取第一条 true）。最终精锻要求精锻满级且词条有 `MaxAffixUpdateFunc`；
 * 淬炼不能是基础词条，附魔不能是基础 / 淬炼 / 专属词条，单件各最多一条。
 * @param rawCraft 原始装备级状态
 * @param rawAffixes 原始词条数组（craft 下标的基准）
 * @param affixes 已归一化的词条列表
 * @param baseAffixId 槽位基础词条 id
 * @param uniqueAffixId 暗金专属词条 id
 * @param resolved 解析后的数据源
 * @param preserveUnknown 是否保留未知词条
 * @param warnings 告警收集
 * @returns craft 状态与派生后的词条
 */
function resolveGearCraftState(
    rawCraft: Partial<TranscendGearCraftState> | undefined,
    rawAffixes: readonly unknown[],
    affixes: readonly TranscendGearAffixRoll[],
    baseAffixId: number | null,
    uniqueAffixId: number | undefined,
    resolved: ResolvedGearDatasets,
    preserveUnknown: boolean,
    warnings?: string[]
): TranscendResolvedCraft {
    const targetContext: TranscendCraftTargetContext = {
        affixMap: resolved.affixMap,
        hasAffixData: resolved.hasAffixData,
        preserveUnknown,
        baseAffixId,
        uniqueAffixId,
        maxMasterwork: TRANSCEND_MASTERWORK_MAX,
        warnings,
    }
    let masterworkLevel = 0
    let targets: TranscendCraftTargets
    if (rawCraft) {
        masterworkLevel = clampMasterwork(rawCraft.masterworkLevel)
        targets = resolveCraftTargets(
            affixes,
            {
                masterworkLevel,
                finalMasterworkAffixIndex: resolveCraftAffixIndex(
                    rawCraft.finalMasterworkAffixIndex,
                    rawAffixes,
                    affixes,
                    "finalMasterworkAffixIndex",
                    warnings,
                    resolveFinalMasterworkClass(rawCraft, rawAffixes)
                ),
                temperingAffixIndex: resolveCraftAffixIndex(
                    rawCraft.temperingAffixIndex,
                    rawAffixes,
                    affixes,
                    "temperingAffixIndex",
                    warnings,
                    "tempering"
                ),
                enchantAffixIndex: resolveCraftAffixIndex(
                    rawCraft.enchantAffixIndex,
                    rawAffixes,
                    affixes,
                    "enchantAffixIndex",
                    warnings,
                    "enchant"
                ),
            },
            targetContext
        )
    } else {
        const derived = deriveLegacyCraftTargets(affixes, targetContext)
        masterworkLevel = derived.masterworkLevel
        targets = derived.targets
    }
    const finalIndex = targets.finalMasterworkAffixIndex
    const temperingIndex = targets.temperingAffixIndex
    const enchantIndex = targets.enchantAffixIndex
    const enchantSnapshot =
        enchantIndex === undefined
            ? undefined
            : resolveEnchantSnapshot(rawCraft?.enchantSnapshot, affixes, {
                  affixMap: resolved.affixMap,
                  hasAffixData: resolved.hasAffixData,
                  preserveUnknown,
                  baseAffixId,
                  uniqueAffixId,
                  masterworkLevel,
                  rawAffixCount: rawAffixes.length,
                  warnings,
              })
    if (rawCraft?.enchantSnapshot !== undefined && rawCraft.enchantSnapshot !== null && enchantIndex === undefined) {
        warnings?.push("craft.enchantSnapshot 在没有附魔词条时无效，已忽略")
    }

    const crafted = affixes.map((roll, index) => {
        let source = roll.source
        if (roll.affixId === baseAffixId) source = "base"
        else if (index === temperingIndex) source = "tempering"
        else if (index === enchantIndex) source = "enchant"
        else if (source === "tempering" || source === "enchant" || source === "unique") {
            // 没有 craft 索引的淬炼 / 附魔来源不成立：回退为随机 / 未知
            source = resolved.hasAffixData ? (resolved.affixMap.has(roll.affixId) ? "random" : "unknown") : "unknown"
        }
        return {
            ...roll,
            masterworkLevel,
            finalMasterwork: index === finalIndex,
            ...(source ? { source } : {}),
        }
    })
    const craft: TranscendGearCraftState = {
        masterworkLevel,
        // 统一不变量：目标被清除时次数同步清零，状态始终可编码（count>0 必有目标）
        temperingCount: temperingIndex === undefined ? 0 : rawCraft ? (toNonNegativeInt(rawCraft.temperingCount) ?? 0) : 0,
        enchantCount: enchantIndex === undefined ? 0 : rawCraft ? (toNonNegativeInt(rawCraft.enchantCount) ?? 0) : 0,
    }
    if (finalIndex !== undefined) craft.finalMasterworkAffixIndex = finalIndex
    if (temperingIndex !== undefined) craft.temperingAffixIndex = temperingIndex
    if (enchantIndex !== undefined) craft.enchantAffixIndex = enchantIndex
    if (enchantSnapshot) craft.enchantSnapshot = enchantSnapshot
    return { craft, affixes: crafted }
}

/**
 * 判断普通词条里是否保留了「现行唯一装只在其它槽型」的 Plan 4 遗留词条；
 * v1 迁移写入的 `legacyUnique` 在归一化 / 序列化重入时按同一判据重算，保证幂等。
 * @param rolls 归一化后的普通词条
 * @param slotType 物品槽型
 * @param resolved 解析后的数据源（唯一装目录必须完整）
 * @returns 是否应标记 legacyUnique
 */
function hasCrossSlotLegacyAffix(rolls: readonly TranscendGearAffixRoll[], slotType: number, resolved: ResolvedGearDatasets): boolean {
    return rolls.some(roll => {
        if (resolved.affixMap.get(roll.affixId)?.plan !== 4) return false
        const owners = resolved.uniqueSource.filter(equip => equip.affixId === roll.affixId)
        return owners.length > 0 && owners.every(equip => equip.slot !== slotType)
    })
}

/**
 * 归一化单件装备配置（数据源已解析，批量归一化时复用索引）。
 * @param value 原始物品
 * @param resolved 解析后的数据源
 * @param options 归一化选项
 * @returns 归一化后的物品；槽型非法时为 null
 */
function normalizeGearItemWithDatasets(
    value: unknown,
    resolved: ResolvedGearDatasets,
    options?: TranscendGearNormalizeOptions
): TranscendGearItemConfig | null {
    const preserveUnknown = options?.preserveUnknown === true
    if (!value || typeof value !== "object" || Array.isArray(value)) return null
    const raw = value as Partial<TranscendGearItemConfig>
    const slotType = Math.round(Number(raw.slotType))
    if (!Number.isFinite(slotType) || slotType < TRANSCEND_SLOT_TYPE_MIN || slotType > TRANSCEND_SLOT_TYPE_MAX) return null
    let uniqueId = toPositiveInt(raw.uniqueId) ?? undefined
    const parsedUnique = normalizeGearAffixRoll(raw.uniqueAffix, resolved.affixMap, preserveUnknown ? false : resolved.hasAffixData)
    let uniqueAffix = parsedUnique ? fixUniqueAffixRoll(parsedUnique) : undefined
    const wantUnique = raw.kind === "unique" && uniqueId !== undefined
    // 库存写入保留「暗金缺专属词条」的半成品；升华配置严格口径下降级为普通装备
    const kind: TranscendGearKind = wantUnique && (uniqueAffix || preserveUnknown) ? "unique" : "normal"
    if (kind !== "unique") {
        uniqueId = undefined
        uniqueAffix = undefined
    }
    const baseAffixId = getSlotBaseAffixId(slotType, { slots: resolved.slotSource })
    const rawAffixes = Array.isArray(raw.affixes) ? raw.affixes : []
    const rawCraft =
        raw.craft && typeof raw.craft === "object" && !Array.isArray(raw.craft)
            ? (raw.craft as Partial<TranscendGearCraftState>)
            : undefined
    // 裁剪前先按 craft 下标标出淬炼词条：否则「1 基础 + 4 随机 + 1 淬炼」会被当成 5 条随机裁掉一条；
    // 去重时同样按淬炼类归类，同 id 的随机行不会把它挤掉（淬炼与随机词条可共存）
    const rawTemperingIndex = Math.round(Number(rawCraft?.temperingAffixIndex))
    const hasTemperingIndex =
        rawCraft?.temperingAffixIndex !== undefined &&
        rawCraft.temperingAffixIndex !== null &&
        Number.isFinite(rawTemperingIndex) &&
        rawTemperingIndex >= 0 &&
        rawTemperingIndex < rawAffixes.length
    const hintedTemperingAffixId = hasTemperingIndex
        ? toPositiveInt((rawAffixes[rawTemperingIndex] as { affixId?: unknown } | null)?.affixId)
        : null
    // 先完整去重再按「1 基础 + 4 随机 + 1 淬炼」裁剪：基础词条 id 可能排在列表后部，提前截断会误删基础
    let affixList = normalizeAffixRollList(rawAffixes, Number.POSITIVE_INFINITY, resolved, preserveUnknown, options?.warnings, {
        temperingIndex: hasTemperingIndex ? rawTemperingIndex : undefined,
    })
    if (uniqueAffix) affixList = affixList.filter(roll => roll.affixId !== uniqueAffix!.affixId)
    if (hintedTemperingAffixId === null && !rawCraft) {
        // 旧物品（无 craft）按来源推导：单件最多一个附魔词条（淬炼由 limitItemAffixes 统一告警）
        const enchantCount = affixList.filter(roll => roll.source === "enchant").length
        if (enchantCount > 1) options?.warnings?.push(`附魔词条有 ${enchantCount} 条，只保留第一条`)
    }
    affixList = limitItemAffixes(affixList, baseAffixId, resolved.hasAffixData, affixId => resolved.affixMap.has(affixId), {
        warnings: options?.warnings,
        temperingAffixId: hintedTemperingAffixId ?? undefined,
    })
    const resolvedCraft = resolveGearCraftState(
        rawCraft,
        rawAffixes,
        affixList,
        baseAffixId,
        uniqueAffix?.affixId,
        resolved,
        preserveUnknown,
        options?.warnings
    )
    affixList = resolvedCraft.affixes
    const socketState = normalizeSocketState(raw.sockets, raw.socketCount, slotType, resolved)
    const item: TranscendGearItemConfig = {
        kind,
        slotType,
        affixes: affixList,
        craft: resolvedCraft.craft,
    }
    const rarityId = normalizeRarityId(raw.rarityId)
    if (rarityId !== undefined) item.rarityId = rarityId
    const equipBaseScore = normalizeEquipBaseScore(raw.equipBaseScore)
    if (equipBaseScore !== undefined) item.equipBaseScore = equipBaseScore
    const iconId = toPositiveInt(raw.iconId)
    if (iconId !== null) item.iconId = iconId
    const nameId = toPositiveInt(raw.nameId)
    if (nameId !== null) item.nameId = nameId
    const seasonId = toPositiveInt(raw.seasonId)
    if (seasonId !== null) item.seasonId = seasonId
    if (uniqueId !== undefined) item.uniqueId = uniqueId
    if (uniqueAffix) item.uniqueAffix = uniqueAffix
    if (socketState.sockets) item.sockets = socketState.sockets
    if (socketState.socketCount) item.socketCount = socketState.socketCount
    if (typeof raw.nameSnapshot === "string" && raw.nameSnapshot.trim()) item.nameSnapshot = raw.nameSnapshot.trim()
    if (typeof raw.iconSnapshot === "string" && raw.iconSnapshot.trim()) item.iconSnapshot = raw.iconSnapshot.trim()
    if (Array.isArray(raw.legacyAmbiguousUnique)) {
        const legacy = [
            ...new Set(raw.legacyAmbiguousUnique.map(item => toPositiveInt(item)).filter((id): id is number => id !== null)),
        ].sort((left, right) => left - right)
        if (legacy.length) item.legacyAmbiguousUnique = legacy
    }
    // 旧存档可能保存了已过滤的 1.8 前唯一装 id：保留条目与快照，标记 legacy 而非丢弃或抛错。
    // 判定要求词条表与唯一装目录同时可用，否则旧包 / 空目录会把现行暗金误标为遗留行
    const hasUniqueCatalog = resolved.hasAffixData && resolved.uniqueSource.length > 0
    if (kind === "unique" && uniqueId !== undefined) {
        const known = resolved.uniqueSource.some(equip => equip.id === uniqueId)
        if (!known && hasUniqueCatalog) {
            item.legacyUnique = true
            options?.warnings?.push(`暗金 ${uniqueId} 不在唯一装目录（1.8 前遗留行），已保留条目并标记 legacy`)
        } else if (!known && raw.legacyUnique === true) {
            item.legacyUnique = true
        }
    } else if (!hasUniqueCatalog) {
        // 安全模式 / 缺包：无法重算，沿用已落盘的标记
        if (raw.legacyUnique === true) item.legacyUnique = true
    } else if (hasCrossSlotLegacyAffix(affixList, slotType, resolved)) {
        // 普通装备保留的跨槽 Plan 4 词条：按词条判定，重入后仍成立
        item.legacyUnique = true
    }
    return item
}

/**
 * 归一化单个装备槽：装备位合法且物品槽型与装备位一致时才保留。
 * @param value 原始装备槽
 * @param datasets 注入数据源
 * @param options 归一化选项（告警收集）
 * @returns 归一化后的装备槽；非法或槽型不一致时为 null
 */
export function normalizeEquippedGear(
    value: unknown,
    datasets?: TranscendGearDatasets,
    options?: TranscendGearNormalizeOptions
): TranscendEquippedGear | null {
    return normalizeEquippedGearWithDatasets(value, resolveDatasets(datasets), options)
}

/**
 * 归一化单个装备槽（数据源已解析）。
 * @param value 原始装备槽
 * @param resolved 解析后的数据源
 * @param options 归一化选项
 * @returns 归一化后的装备槽；非法或槽型不一致时为 null
 */
function normalizeEquippedGearWithDatasets(
    value: unknown,
    resolved: ResolvedGearDatasets,
    options?: TranscendGearNormalizeOptions
): TranscendEquippedGear | null {
    if (!isEquippedGear(value)) return null
    const slotId = Math.round(Number(value.slotId))
    if (!Number.isFinite(slotId) || !getTranscendGearGroupKeyOfSlot(slotId)) return null
    const item = normalizeGearItemWithDatasets(value.item, resolved, options)
    if (!item || item.slotType !== getTranscendSlotType(slotId)) return null
    return { slotId, item }
}

/**
 * 归一化 v1 平铺词条：槽位 / 词条 id 必须合法，档位与精造次数钳制到合法区间。
 * @param value 原始词条
 * @param datasets 注入数据源
 * @returns 归一化后的词条；非法时为 null
 */
export function normalizeGearEntry(value: unknown, datasets?: TranscendGearDatasets): TranscendGearEntry | null {
    return normalizeGearEntryWithDatasets(value, resolveDatasets(datasets))
}

/**
 * 归一化 v1 平铺词条（数据源已解析）。
 * @param value 原始词条
 * @param resolved 解析后的数据源
 * @returns 归一化后的词条；非法时为 null
 */
function normalizeGearEntryWithDatasets(value: unknown, resolved: ResolvedGearDatasets): TranscendGearEntry | null {
    if (!value || typeof value !== "object") return null
    const raw = value as Partial<TranscendGearEntry>
    const slotId = Math.round(Number(raw.slotId))
    if (!Number.isFinite(slotId) || !getTranscendGearGroupKeyOfSlot(slotId)) return null
    const roll = normalizeGearAffixRoll(raw, resolved.affixMap, resolved.hasAffixData)
    if (!roll) return null
    return { slotId, ...roll }
}

/**
 * 由词条列表推导装备级 craft 状态（v1 平铺条目迁移 / 按槽位回写等非归一化路径）：
 * 精锻取最大等级并统一写入；最终目标取第一条 true 且精锻满级、词条可承载最终精锻；
 * 淬炼 / 附魔按来源标记取第一条（下标按来源定位，同 id 随机行不算命中）。
 * craft 下标保持 `rolls` 输入顺序计算，不重排词条。
 * @param rolls 词条列表
 * @param canFinal 词条是否可承载最终精锻
 * @returns craft 状态与派生后的词条（输入顺序）
 */
function deriveGearCraftFromRolls(
    rolls: readonly TranscendGearAffixRoll[],
    canFinal: (affixId: number) => boolean
): { craft: TranscendGearCraftState; affixes: TranscendGearAffixRoll[] } {
    let masterworkLevel = 0
    for (const roll of rolls) masterworkLevel = Math.max(masterworkLevel, clampMasterwork(roll.masterworkLevel))
    const finalAffixId =
        masterworkLevel >= TRANSCEND_MASTERWORK_MAX
            ? rolls.find(roll => roll.finalMasterwork === true && canFinal(roll.affixId))?.affixId
            : undefined
    const sourceIndexOf = (source: TranscendGearAffixSource): number | undefined => {
        const index = rolls.findIndex(roll => roll.source === source)
        return index >= 0 ? index : undefined
    }
    const indexOf = (affixId: number | undefined): number | undefined => {
        if (affixId === undefined) return undefined
        const index = rolls.findIndex(roll => roll.affixId === affixId)
        return index >= 0 ? index : undefined
    }
    const finalIndex = indexOf(finalAffixId)
    const temperingIndex = sourceIndexOf("tempering")
    const enchantIndex = sourceIndexOf("enchant")
    const craft: TranscendGearCraftState = { masterworkLevel, temperingCount: 0, enchantCount: 0 }
    if (finalIndex !== undefined) craft.finalMasterworkAffixIndex = finalIndex
    if (temperingIndex !== undefined) craft.temperingAffixIndex = temperingIndex
    if (enchantIndex !== undefined) craft.enchantAffixIndex = enchantIndex
    const affixes = rolls.map((roll, index) => ({
        ...roll,
        masterworkLevel,
        finalMasterwork: index === finalIndex,
    }))
    return { craft, affixes }
}

/**
 * 把 v1 平铺词条按装备位分组合成为物品：Plan 4 词条尝试匹配暗金目录
 * （唯一命中 → 暗金；多命中取最小 id 并记录候选；无命中保留为普通词条）。
 * @param entries 归一化后的平铺词条
 * @param datasets 解析后的数据源
 * @returns 装备槽列表
 */
function legacyEntriesToEquippedGear(entries: readonly TranscendGearEntry[], datasets: ResolvedGearDatasets): TranscendEquippedGear[] {
    const bySlot = new Map<number, Map<number, TranscendGearEntry>>()
    for (const entry of entries) {
        // 先按 (slotId, affixId) 去重（后者覆盖），避免同 id 同时成为专属与普通词条
        const bucket = bySlot.get(entry.slotId) ?? new Map<number, TranscendGearEntry>()
        bucket.set(entry.affixId, entry)
        bySlot.set(entry.slotId, bucket)
    }
    const result: TranscendEquippedGear[] = []
    for (const [slotId, bucket] of [...bySlot.entries()].sort((left, right) => left[0] - right[0])) {
        const slotType = getTranscendSlotType(slotId)
        const remaining = new Map<number, TranscendGearAffixRoll>()
        let uniqueId: number | undefined
        let uniqueAffix: TranscendGearAffixRoll | undefined
        let ambiguous: number[] | undefined
        let legacyAffixRetained = false
        for (const entry of bucket.values()) {
            const { slotId: _slotId, gemId: _gemId, socketIndex: _socketIndex, ...roll } = entry
            if (uniqueAffix) {
                remaining.set(roll.affixId, roll)
                continue
            }
            const affix = datasets.affixMap.get(roll.affixId)
            const candidates =
                affix?.plan === 4 ? datasets.uniqueSource.filter(equip => equip.affixId === roll.affixId && equip.slot === slotType) : []
            if (!candidates.length) {
                // 同词条的现行唯一装只在别的槽型：该条目来自已过滤的 1.8 前遗留行，保留词条并记录来源
                if (affix?.plan === 4 && datasets.uniqueSource.some(equip => equip.affixId === roll.affixId)) {
                    legacyAffixRetained = true
                }
                remaining.set(roll.affixId, roll)
                continue
            }
            const chosen = candidates.reduce((min, item) => (item.id < min.id ? item : min), candidates[0])
            uniqueId = chosen.id
            uniqueAffix = fixUniqueAffixRoll(roll)
            if (candidates.length > 1) ambiguous = candidates.map(item => item.id).sort((left, right) => left - right)
        }
        const baseAffixId = getSlotBaseAffixId(slotType, { slots: datasets.slotSource })
        const derived = deriveGearCraftFromRolls(
            limitItemAffixes([...remaining.values()], baseAffixId, datasets.hasAffixData, affixId => datasets.affixMap.has(affixId)),
            affixId => Boolean(datasets.affixMap.get(affixId)?.maxAffixUpdateFunc)
        )
        const item: TranscendGearItemConfig = {
            kind: uniqueAffix && uniqueId !== undefined ? "unique" : "normal",
            slotType,
            affixes: derived.affixes,
            craft: derived.craft,
        }
        if (uniqueAffix && uniqueId !== undefined) {
            item.uniqueId = uniqueId
            item.uniqueAffix = uniqueAffix
            const source = datasets.uniqueSource.find(equip => equip.id === uniqueId)
            if (source?.name) item.nameSnapshot = source.name
            if (source?.icon) item.iconSnapshot = source.icon
        }
        if (ambiguous) item.legacyAmbiguousUnique = ambiguous
        // 同槽「遗留词条 + 现行暗金」保持现行暗金无标记：只有落成普通装备的槽位才标记 legacy
        if (item.kind === "normal" && legacyAffixRetained) item.legacyUnique = true
        result.push({ slotId, item })
    }
    return result
}

/**
 * 归一化三组装备：v2 物品按装备位去重（后者覆盖），槽位与物品槽型必须一致；
 * 含 v1 平铺条目时，数据表可用则迁移为物品，数据表为空则原样保留平铺条目（下次加载重试迁移）。
 * @param lists 三组原始装备（按主控 / 协战一 / 协战二顺序；缺少的组按空处理）
 * @param datasets 注入数据源
 * @param options 归一化选项（告警收集）
 * @returns 归一化后的三组装备
 */
export function normalizeTranscendGearGroups(
    lists: readonly unknown[],
    datasets?: TranscendGearDatasets,
    options?: TranscendGearNormalizeOptions
): TranscendGearGroups {
    const resolved = resolveDatasets(datasets)
    const legacyEntries: TranscendGearEntry[] = []
    const itemEntries: TranscendEquippedGear[] = []
    for (const list of lists) {
        if (!Array.isArray(list)) continue
        for (const raw of list) {
            if (isLegacyGearEntry(raw)) {
                const entry = normalizeGearEntryWithDatasets(raw, resolved)
                if (entry) legacyEntries.push(entry)
                continue
            }
            // 槽型与装备位不一致的物品无法装备：归一化阶段直接剔除，避免展示与计算口径分叉
            const equipped = normalizeEquippedGearWithDatasets(raw, resolved, options)
            if (equipped) itemEntries.push(equipped)
        }
    }

    // 数据表为空（安全模式 / 缺包）时不迁移：v1 条目原样留在装备组里，数据恢复后再次归一化即可迁移
    const migrated = legacyEntries.length && resolved.hasAffixData ? legacyEntriesToEquippedGear(legacyEntries, resolved) : []
    const merged = new Map<number, TranscendEquippedGear>()
    for (const equipped of migrated) merged.set(equipped.slotId, equipped)
    // 显式物品优先于迁移结果（同一槽位以 v2 物品为准）
    for (const equipped of itemEntries) merged.set(equipped.slotId, equipped)

    // 未迁移的 v1 条目按槽位归组（去重 / 词缀上限与物品口径一致）；已有物品的槽位不重复保留
    const legacyBySlot = new Map<number, Map<number, TranscendGearEntry>>()
    if (!resolved.hasAffixData) {
        for (const entry of legacyEntries) {
            if (merged.has(entry.slotId)) continue
            const bucket = legacyBySlot.get(entry.slotId) ?? new Map<number, TranscendGearEntry>()
            bucket.set(entry.affixId, entry)
            legacyBySlot.set(entry.slotId, bucket)
        }
    }

    const groups: TranscendGearGroups = { mainGear: [], assist1Gear: [], assist2Gear: [] }
    const groupKeyOf = (slotId: number): keyof TranscendGearGroups | null => {
        const group = getTranscendGearGroupKeyOfSlot(slotId)
        if (group === "main") return "mainGear"
        if (group === "assist1") return "assist1Gear"
        if (group === "assist2") return "assist2Gear"
        return null
    }
    for (const [slotId, bucket] of legacyBySlot) {
        const key = groupKeyOf(slotId)
        if (!key) continue
        const list = [...bucket.values()].slice(0, TRANSCEND_MAX_ITEM_AFFIX_ROLLS)
        ;(groups[key] as TranscendGearEntry[]).push(...list)
    }
    for (const equipped of merged.values()) {
        const key = groupKeyOf(equipped.slotId)
        if (!key) continue
        ;(groups[key] as TranscendEquippedGear[]).push(equipped)
    }
    for (const key of ["mainGear", "assist1Gear", "assist2Gear"] as const) {
        ;(groups[key] as TranscendGearGroup).sort((left, right) => left.slotId - right.slotId)
    }
    return groups
}

/**
 * v1→v2 迁移：按装备位把平铺词条合成为完整物品，Plan 4 词条匹配暗金目录。
 * 数据表为空（安全模式 / 缺包）时不做迁移并原样返回；对已迁移结果再次调用结果一致。
 * @param settings 含三组装备的设置
 * @param datasets 注入数据源
 * @returns 迁移后的设置（无变化时返回入参本身）
 */
export function migrateV1GearToV2<T extends TranscendGearGroups>(settings: T, datasets?: TranscendGearDatasets): T {
    if (!settings || typeof settings !== "object") return settings
    const lists = [settings.mainGear, settings.assist1Gear, settings.assist2Gear]
    const hasLegacy = lists.some(list => Array.isArray(list) && list.some(item => isLegacyGearEntry(item)))
    if (!hasLegacy) return settings
    const resolved = resolveDatasets(datasets)
    if (!resolved.hasAffixData) return settings
    return { ...settings, ...normalizeTranscendGearGroups(lists, datasets) }
}

/**
 * 按槽型解析宝石对应的词缀 id（同一宝石在不同槽型上效果不同）。
 * @param gemId 宝石 id（`DnaSeasonInlay.id`）
 * @param slotType 物品槽型
 * @param datasets 注入数据源
 * @returns 词缀 id；宝石不存在或对该槽型无词缀时为 null
 */
export function resolveInlayAffixId(gemId: number, slotType: number, datasets?: TranscendGearDatasets): number | null {
    const source = datasets?.inlays ?? inlays
    const gem = source.find(item => item.id === Math.round(gemId))
    if (!gem) return null
    for (const [affixId, slotTypes] of Object.entries(gem.affixIdsBySlot)) {
        if (slotTypes.includes(slotType)) return Number(affixId)
    }
    return null
}

/** 展平结果：解析器条目 + 无法解析的宝石 / 槽型告警 */
export interface TranscendFlattenedGear {
    entries: TranscendGearEntry[]
    warnings: string[]
}

/**
 * 把装备组展平成 `resolveGearEffects` 的输入：专属词缀 + 普通词缀 + 每个孔位按槽型解析出的宝石词缀。
 * v1 平铺条目原样透传（显式 `source` 一并保留，归一化前的旧条目通常没有该字段）；
 * 宝石无法解析时保留物品上的 `gemId` 并告警，不删除。
 * 有装备级 craft 状态时，精锻等级与最终精锻目标以 craft 为准（per-affix 字段仅是派生快照）。
 * @param items 装备组（v2 物品或未迁移的 v1 条目）
 * @param datasets 注入数据源
 * @returns 词条条目与告警
 */
export function flattenEquippedGear(
    items: readonly unknown[] | null | undefined,
    datasets?: TranscendGearDatasets
): TranscendFlattenedGear {
    const entries: TranscendGearEntry[] = []
    const warnings: string[] = []
    const list = Array.isArray(items) ? items : []
    for (const raw of list) {
        if (isLegacyGearEntry(raw)) {
            const slotId = Math.round(Number(raw.slotId))
            const affixId = Math.round(Number(raw.affixId))
            if (!Number.isFinite(slotId) || !Number.isFinite(affixId)) continue
            entries.push({
                slotId,
                affixId,
                rollLevel: Number.isFinite(raw.rollLevel) ? Math.round(raw.rollLevel) : 1,
                masterworkLevel: Number.isFinite(raw.masterworkLevel) ? Math.round(raw.masterworkLevel) : 0,
                ancient: raw.ancient === true,
                finalMasterwork: raw.finalMasterwork === true,
                ...(raw.source ? { source: raw.source } : {}),
            })
            continue
        }
        if (!isEquippedGear(raw) || !raw.item || typeof raw.item !== "object") continue
        const slotId = Math.round(Number(raw.slotId))
        if (!Number.isFinite(slotId) || !getTranscendGearGroupKeyOfSlot(slotId)) continue
        const item = raw.item
        const expected = getTranscendSlotType(slotId)
        const itemSlotType = Math.round(Number(item.slotType))
        if (!Number.isFinite(itemSlotType) || itemSlotType !== expected) {
            warnings.push(`装备位 ${slotId} 的物品槽型 ${itemSlotType} 与槽位槽型 ${expected} 不一致，已忽略`)
            continue
        }
        const craft = item.craft && typeof item.craft === "object" && !Array.isArray(item.craft) ? item.craft : undefined
        const craftFinalIndex = craft ? toCraftIndex(craft.finalMasterworkAffixIndex) : undefined
        /** 普通词条按 craft 展开；专属词条（无下标）保持自身固定值 */
        const pushRoll = (roll: TranscendGearAffixRoll | undefined, index?: number) => {
            if (!roll || typeof roll !== "object") return
            const affixId = Math.round(Number(roll.affixId))
            if (!Number.isFinite(affixId) || affixId <= 0) return
            const useCraft = craft !== undefined && index !== undefined
            const source = roll.source
            entries.push({
                slotId,
                affixId,
                rollLevel: Number.isFinite(roll.rollLevel) ? Math.round(roll.rollLevel) : 1,
                masterworkLevel: useCraft
                    ? clampMasterwork(craft.masterworkLevel)
                    : Number.isFinite(roll.masterworkLevel)
                      ? Math.round(roll.masterworkLevel)
                      : 0,
                ancient: roll.ancient === true,
                finalMasterwork: useCraft ? index === craftFinalIndex : roll.finalMasterwork === true,
                ...(source ? { source } : {}),
            })
        }
        if (item.kind === "unique") pushRoll(item.uniqueAffix)
        ;(Array.isArray(item.affixes) ? item.affixes : []).forEach((roll, index) => pushRoll(roll, index))
        for (const socket of Array.isArray(item.sockets) ? item.sockets : []) {
            if (!socket || typeof socket !== "object") continue
            const socketIndex = Math.round(Number(socket.socketIndex))
            const gemId = Math.round(Number(socket.gemId))
            if (!Number.isFinite(socketIndex) || !Number.isFinite(gemId) || gemId <= 0) continue
            const affixId = resolveInlayAffixId(gemId, itemSlotType, datasets)
            if (affixId === null) {
                warnings.push(
                    `宝石 ${gemId} 在槽型 ${itemSlotType} 没有可用词缀（装备位 ${slotId} 第 ${socketIndex + 1} 孔），已保留未计入`
                )
                continue
            }
            entries.push({ slotId, affixId, rollLevel: 1, masterworkLevel: 0, ancient: false, finalMasterwork: false, gemId, socketIndex })
        }
    }
    return { entries, warnings }
}

/** 由平铺词条生成普通物品（同词条去重、按 1 基础 + 4 随机 + 1 淬炼裁剪、补词缀来源、推导 craft） */
function createNormalItem(slotId: number, rolls: readonly TranscendGearAffixRoll[]): TranscendEquippedGear {
    const map = new Map<number, TranscendGearAffixRoll>()
    for (const roll of rolls) map.set(roll.affixId, roll)
    const slotType = getTranscendSlotType(slotId)
    const baseAffixId = getSlotBaseAffixId(slotType)
    const knownIds = new Set(affixes.map(affix => affix.id))
    const finalCapableIds = new Set(affixes.filter(affix => affix.maxAffixUpdateFunc).map(affix => affix.id))
    const limited = limitItemAffixes([...map.values()], baseAffixId, affixes.length > 0, affixId => knownIds.has(affixId))
    const derived = deriveGearCraftFromRolls(limited, affixId => finalCapableIds.has(affixId))
    return {
        slotId,
        item: {
            kind: "normal",
            slotType,
            affixes: derived.affixes,
            craft: derived.craft,
        },
    }
}

/**
 * 把 v1 风格编辑器的平铺词条按槽位合并回装备组：
 * 只改写本次涉及的槽位的普通词条，保留既有物品的 kind / uniqueId / uniqueAffix / sockets / 快照；
 * 零贡献物品（只有专属词条或只有孔位）不会被删除；清空某槽全部词条则卸下该槽物品。
 * @param group 现有装备组
 * @param entries 编辑器提交的平铺词条
 * @returns 合并后的新装备组
 */
export function applyGearEntriesToGroup(group: unknown, entries: readonly TranscendGearEntry[]): TranscendEquippedGear[] {
    const existing = new Map<number, TranscendEquippedGear>()
    for (const raw of Array.isArray(group) ? group : []) {
        if (!isEquippedGear(raw)) continue
        const slotId = Math.round(Number(raw.slotId))
        if (!Number.isFinite(slotId) || !getTranscendGearGroupKeyOfSlot(slotId)) continue
        existing.set(slotId, raw)
    }
    const incoming = new Map<number, TranscendGearEntry[]>()
    for (const entry of Array.isArray(entries) ? entries : []) {
        if (!entry || typeof entry !== "object") continue
        const slotId = Math.round(Number(entry.slotId))
        if (!Number.isFinite(slotId) || !getTranscendGearGroupKeyOfSlot(slotId)) continue
        const list = incoming.get(slotId) ?? []
        list.push(entry)
        incoming.set(slotId, list)
    }

    const result: TranscendEquippedGear[] = []
    for (const [slotId, current] of existing) {
        const list = incoming.get(slotId)
        if (!list) {
            // 该槽没有任何提交：零普通词条的物品（只有专属词条 / 只有孔位）保留；
            // 有普通词条的物品视为用户清空该槽并卸下
            if (!current.item.affixes.length) result.push(current)
            continue
        }
        const uniqueAffixId = current.item.kind === "unique" ? current.item.uniqueAffix?.affixId : undefined
        const affixes = list
            .filter(entry => entry.gemId === undefined && entry.affixId !== uniqueAffixId)
            .map(entry => ({
                affixId: Math.round(Number(entry.affixId)),
                rollLevel: Number.isFinite(entry.rollLevel) ? Math.round(entry.rollLevel) : 1,
                masterworkLevel: Number.isFinite(entry.masterworkLevel) ? Math.round(entry.masterworkLevel) : 0,
                ancient: entry.ancient === true,
                finalMasterwork: entry.finalMasterwork === true,
            }))
        const merged = createNormalItem(slotId, affixes)
        // craft 状态随词条重算：旧索引可能指向被替换 / 删除的词条，不能原样保留
        result.push({ slotId, item: { ...current.item, affixes: merged.item.affixes, craft: merged.item.craft } })
    }
    for (const [slotId, list] of incoming) {
        if (existing.has(slotId) || !list.length) continue
        const created = createNormalItem(
            slotId,
            list
                .filter(entry => entry.gemId === undefined)
                .map(entry => ({
                    affixId: Math.round(Number(entry.affixId)),
                    rollLevel: Number.isFinite(entry.rollLevel) ? Math.round(entry.rollLevel) : 1,
                    masterworkLevel: Number.isFinite(entry.masterworkLevel) ? Math.round(entry.masterworkLevel) : 0,
                    ancient: entry.ancient === true,
                    finalMasterwork: entry.finalMasterwork === true,
                }))
        )
        if (created.item.affixes.length) result.push(created)
    }
    return result.sort((left, right) => left.slotId - right.slotId)
}

/** 词缀 roll 的规范化 token（角色 u=专属 / n=普通） */
function affixRollToken(role: "u" | "n", roll: TranscendGearAffixRoll): string {
    return [
        role,
        Math.round(roll.affixId),
        Math.round(roll.rollLevel),
        Math.round(roll.masterworkLevel),
        roll.ancient ? 1 : 0,
        roll.finalMasterwork ? 1 : 0,
    ].join(":")
}

/** 词缀行排序：先 affixId，再档位 / 精造 / 太古 / 终造，保证与输入顺序无关 */
function compareAffixRoll(left: TranscendGearAffixRoll, right: TranscendGearAffixRoll): number {
    return (
        left.affixId - right.affixId ||
        left.rollLevel - right.rollLevel ||
        left.masterworkLevel - right.masterworkLevel ||
        Number(left.ancient) - Number(right.ancient) ||
        Number(left.finalMasterwork) - Number(right.finalMasterwork)
    )
}

/**
 * 装备级 craft 状态的规范化 token：精锻等级 + 最终 / 淬炼 / 附魔目标词条 id + 次数（与词条顺序无关）。
 * 附魔快照段是刻意的例外：仅当存在快照时追加「下标:词条 id:档位:太古」，无快照不追加任何段，
 * 因此既有装备的 `tg3` 字节完全不变，只有带快照的装备 hash 能区分快照内容。
 */
function craftStateToken(item: TranscendGearItemConfig): string {
    const craft = item.craft && typeof item.craft === "object" && !Array.isArray(item.craft) ? item.craft : undefined
    const rolls = Array.isArray(item.affixes) ? item.affixes : []
    /** 下标 → 词条 id（null / 越界 / 缺省为 0） */
    const targetId = (index: unknown): number => {
        const value = toCraftIndex(index)
        if (value === undefined) return 0
        const roll = rolls[value]
        return roll ? Math.round(roll.affixId) : 0
    }
    const parts = [
        "c",
        clampMasterwork(craft?.masterworkLevel),
        targetId(craft?.finalMasterworkAffixIndex),
        targetId(craft?.temperingAffixIndex),
        toNonNegativeInt(craft?.temperingCount) ?? 0,
        targetId(craft?.enchantAffixIndex),
        toNonNegativeInt(craft?.enchantCount) ?? 0,
    ]
    const snapshot = craft?.enchantSnapshot
    if (snapshot && typeof snapshot === "object" && snapshot.roll) {
        parts.push(
            [
                Math.round(Number(snapshot.affixIndex)),
                Math.round(Number(snapshot.roll.affixId)),
                Math.round(Number(snapshot.roll.rollLevel)),
                snapshot.roll.ancient === true ? 1 : 0,
            ].join(":")
        )
    }
    return parts.join(":")
}

/**
 * 生成物品的规范化字符串（hash 的输入，`tg3`）。
 * 计入类型 / 槽型 / 暗金 id / 排序词条行 / 排序孔位 / 装备级 craft 状态（有附魔快照时含快照行）；
 * 排除装备位、角色、库存行 id、时间戳、展示快照，以及品质 / 强度 / 基础名 / 前缀 / 赛季 / 已开孔数与词缀来源——
 * 这些元数据不改变计算结果。
 * @param item 装备物品
 * @returns 规范化字符串
 */
export function canonicalGearString(item: TranscendGearItemConfig): string {
    const uniqueToken = item.kind === "unique" && item.uniqueAffix ? affixRollToken("u", item.uniqueAffix) : ""
    const affixTokens = [...(Array.isArray(item.affixes) ? item.affixes : [])].sort(compareAffixRoll).map(roll => affixRollToken("n", roll))
    const socketTokens = [...(Array.isArray(item.sockets) ? item.sockets : [])]
        .sort((left, right) => left.socketIndex - right.socketIndex || left.gemId - right.gemId)
        .map(socket => `${Math.round(socket.socketIndex)}:${Math.round(socket.gemId)}`)
    return [
        TRANSCEND_GEAR_HASH_PREFIX,
        item.kind === "unique" ? "unique" : "normal",
        Math.round(item.slotType),
        Math.round(item.uniqueId ?? 0),
        uniqueToken,
        affixTokens.join("|"),
        socketTokens.join("|"),
        craftStateToken(item),
    ].join("#")
}
