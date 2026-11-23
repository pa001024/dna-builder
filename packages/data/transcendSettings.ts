import { affixes, stages, talents } from "./d"
import {
    isEquippedGear,
    normalizeTranscendGearGroups,
    TRANSCEND_SLOT_MAX,
    TRANSCEND_SLOT_MIN,
    TRANSCEND_SLOT_TYPE_MAX,
    TRANSCEND_SLOT_TYPE_MIN,
    type TranscendAffixInfo,
    type TranscendEquippedGear,
    type TranscendGearAffixRoll,
    type TranscendGearCraftState,
    type TranscendGearDatasets,
    type TranscendGearGroup,
    type TranscendLegacyGearGroups,
} from "./transcendGear"

/**
 * 升华（DNASeason）配置模型：总开关 + 天赋（仅主控）+ 主控 / 协战一 / 协战二三组装备 + 装备变体。
 * 本模块是叶子模块，只依赖静态数据 `./d` 与装备物品层 `./transcendGear`，
 * 不得反向依赖 `charSettings` / `CharBuild`。
 */

export type {
    TranscendAffixInfo,
    TranscendEquippedGear,
    TranscendGearAffixRoll,
    TranscendGearDatasets,
    TranscendGearEntry,
    TranscendGearGroup,
    TranscendGearGroupKey,
    TranscendGearItemConfig,
    TranscendGearKind,
    TranscendGearSocket,
    TranscendLegacyGearGroups,
    TranscendSlotGroup,
} from "./transcendGear"
/**
 * 槽位区间、槽位分组、词条条目与物品模型都在 `./transcendGear`；
 * 这里原样再导出，既有调用方无需改 import 路径。
 */
export {
    getTranscendGearGroupKey,
    getTranscendGearGroupKeyOfSlot,
    getTranscendSideGearGroup,
    getTranscendSlotType,
    isEquippedGear,
    isLegacyGearEntry,
    TRANSCEND_ASSIST_SLOT_MAX,
    TRANSCEND_ASSIST_SLOT_MIN,
    TRANSCEND_ASSIST1_SLOT_MAX,
    TRANSCEND_ASSIST1_SLOT_MIN,
    TRANSCEND_ASSIST2_SLOT_MAX,
    TRANSCEND_ASSIST2_SLOT_MIN,
    TRANSCEND_MAIN_SLOT_MAX,
    TRANSCEND_MAIN_SLOT_MIN,
    TRANSCEND_MASTERWORK_MAX,
    TRANSCEND_MAX_AFFIXES_PER_SLOT,
    TRANSCEND_SLOT_MAX,
    TRANSCEND_SLOT_MIN,
    TRANSCEND_SLOT_TYPE_MAX,
    TRANSCEND_SLOT_TYPE_MIN,
} from "./transcendGear"

/** 装备变体字母（与 MOD 变体一致，最多三份） */
export const TRANSCEND_GEAR_VARIANT_LETTERS = ["A", "B", "C"] as const
/** 装备变体数量上限 */
export const TRANSCEND_GEAR_VARIANT_MAX_COUNT = TRANSCEND_GEAR_VARIANT_LETTERS.length
/** 默认装备变体 id */
export const DEFAULT_TRANSCEND_GEAR_VARIANT = "A"

/** 一套装备变体：只包含主控与两个协战的三组装备，不含角色 / 天赋 / 环境 */
export interface TranscendGearVariant {
    /** 变体 id（A/B/C） */
    id: string
    /** 主控装备（槽位 1-8） */
    mainGear: TranscendGearGroup
    /** 协战一装备（槽位 9-12） */
    assist1Gear: TranscendGearGroup
    /** 协战二装备（槽位 13-16） */
    assist2Gear: TranscendGearGroup
}

/** 升华配置：总开关 + 天赋（仅主控）+ 当前变体的三组装备 + 全部装备变体 */
export interface TranscendSettings {
    enabled: boolean
    /** 天赋节点等级 `[talentId, level]`（仅主控生效，协战不吃天赋） */
    talentLevels: [number, number][]
    /** 当前激活变体的主控装备（槽位 1-8）；计算 / 库存只读这里 */
    mainGear: TranscendGearGroup
    /** 当前激活变体的协战一装备（槽位 9-12） */
    assist1Gear: TranscendGearGroup
    /** 当前激活变体的协战二装备（槽位 13-16） */
    assist2Gear: TranscendGearGroup
    /** 全部装备变体（含当前激活项） */
    gearVariants: TranscendGearVariant[]
    /** 当前激活变体 id */
    activeGearVariant: string
}

/**
 * 克隆装备组：变体之间不能共享物品对象，避免切换后一处修改影响另一套。
 * @param group 装备组
 * @returns 深拷贝后的装备组
 */
function cloneGearGroup(group: TranscendGearGroup): TranscendGearGroup {
    return JSON.parse(JSON.stringify(group)) as TranscendGearGroup
}

/** 读取合法变体 id：只接受 A/B/C，其余视为缺失 */
function normalizeGearVariantId(value: unknown): string | null {
    const text = typeof value === "string" ? value.trim().toUpperCase() : ""
    return (TRANSCEND_GEAR_VARIANT_LETTERS as readonly string[]).includes(text) ? text : null
}

/**
 * 创建一份空的装备变体。
 * @param id 变体 id（缺省 A）
 * @returns 新的变体
 */
export function createDefaultTranscendGearVariant(id: string = DEFAULT_TRANSCEND_GEAR_VARIANT): TranscendGearVariant {
    return { id, mainGear: [], assist1Gear: [], assist2Gear: [] }
}

/**
 * 取当前激活变体；配置缺失或 id 不匹配时回退第一个变体。
 * @param settings 升华配置
 * @returns 激活变体；没有任何变体时为 null
 */
export function getActiveGearVariant(settings: TranscendSettings): TranscendGearVariant | null {
    const variants = Array.isArray(settings.gearVariants) ? settings.gearVariants : []
    return variants.find(variant => variant.id === settings.activeGearVariant) ?? variants[0] ?? null
}

/**
 * 把当前三组装备同步进激活变体（装备编辑后调用，原地修改）。
 * 变体缺失或 active id 非法时回退第一份并写回合法 id，保证后续切换有明确目标。
 * @param settings 升华配置
 */
export function syncActiveGearVariant(settings: TranscendSettings): void {
    const variant = getActiveGearVariant(settings)
    if (!variant) {
        const id = normalizeGearVariantId(settings.activeGearVariant) ?? DEFAULT_TRANSCEND_GEAR_VARIANT
        settings.gearVariants = [
            {
                id,
                mainGear: settings.mainGear,
                assist1Gear: settings.assist1Gear,
                assist2Gear: settings.assist2Gear,
            },
        ]
        settings.activeGearVariant = id
        return
    }
    // getActiveGearVariant 可能回退到第一份：同时修正 active id，避免非法 id 残留
    settings.activeGearVariant = variant.id
    variant.mainGear = settings.mainGear
    variant.assist1Gear = settings.assist1Gear
    variant.assist2Gear = settings.assist2Gear
}

/**
 * 切换装备变体：只替换主控 / 协战一 / 协战二三组装备，角色 / 天赋 / 环境保持不变（原地修改）。
 * @param settings 升华配置
 * @param id 目标变体 id
 * @returns 是否切换成功
 */
export function switchTranscendGearVariant(settings: TranscendSettings, id: string): boolean {
    const variants = Array.isArray(settings.gearVariants) ? settings.gearVariants : []
    const variant = variants.find(item => item.id === id)
    if (!variant) return false
    if (variant.id === settings.activeGearVariant) return true
    // 切换前把当前编辑同步回旧变体，避免未写回的改动丢失
    syncActiveGearVariant(settings)
    settings.activeGearVariant = variant.id
    settings.mainGear = variant.mainGear
    settings.assist1Gear = variant.assist1Gear
    settings.assist2Gear = variant.assist2Gear
    return true
}

/**
 * 追加一份装备变体：以当前装备为模板，自动切换过去（A → A B → A B C，原地修改）。
 * @param settings 升华配置
 * @returns 新变体 id；已达上限时为 null
 */
export function addTranscendGearVariant(settings: TranscendSettings): string | null {
    const variants = Array.isArray(settings.gearVariants) ? settings.gearVariants : []
    if (variants.length >= TRANSCEND_GEAR_VARIANT_MAX_COUNT) return null
    const id = TRANSCEND_GEAR_VARIANT_LETTERS.find(letter => !variants.some(variant => variant.id === letter))
    if (!id) return null
    syncActiveGearVariant(settings)
    const variant: TranscendGearVariant = {
        id,
        mainGear: cloneGearGroup(settings.mainGear),
        assist1Gear: cloneGearGroup(settings.assist1Gear),
        assist2Gear: cloneGearGroup(settings.assist2Gear),
    }
    variants.push(variant)
    settings.gearVariants = variants
    settings.activeGearVariant = id
    settings.mainGear = variant.mainGear
    settings.assist1Gear = variant.assist1Gear
    settings.assist2Gear = variant.assist2Gear
    return id
}

/**
 * 删除装备变体；删除的是当前激活项时回退到相邻变体（原地修改）。
 * @param settings 升华配置
 * @param id 变体 id
 * @returns 是否删除成功（最后一份不允许删除）
 */
export function removeTranscendGearVariant(settings: TranscendSettings, id: string): boolean {
    const variants = Array.isArray(settings.gearVariants) ? settings.gearVariants : []
    if (variants.length <= 1) return false
    const index = variants.findIndex(variant => variant.id === id)
    if (index === -1) return false
    const wasActive = settings.activeGearVariant === id
    variants.splice(index, 1)
    settings.gearVariants = variants
    if (wasActive) {
        const next = variants[Math.max(0, index - 1)]
        settings.activeGearVariant = next.id
        settings.mainGear = next.mainGear
        settings.assist1Gear = next.assist1Gear
        settings.assist2Gear = next.assist2Gear
    }
    return true
}

/**
 * 创建一份空的升华配置（总开关关闭、无天赋、变体 A 无装备）。
 * @returns 新的升华配置（每次返回新对象，避免共享引用）
 */
export function createDefaultTranscendSettings(): TranscendSettings {
    return {
        enabled: false,
        talentLevels: [],
        mainGear: [],
        assist1Gear: [],
        assist2Gear: [],
        gearVariants: [createDefaultTranscendGearVariant()],
        activeGearVariant: DEFAULT_TRANSCEND_GEAR_VARIANT,
    }
}

/**
 * 创建「理论全阶段」的天赋等级表：每个节点取 `maxLevel`（含当前版本未开放阶段）。
 * 仅用于显式开启「包含未开放阶段」后的新建 / 重置 / 全部解锁，不迁移已保存的配置。
 * @param dataset 天赋数据源（缺省读静态数据；测试可注入）
 * @returns `[talentId, level]` 列表
 */
export function createMaxedTranscendTalentLevels(dataset?: readonly TranscendTalentInfo[]): [number, number][] {
    const source = dataset ?? talents
    return source.map(talent => [talent.id, Math.max(1, Math.round(talent.maxLevel || 1))])
}

/**
 * 创建「当前版本可达」的天赋等级表：只对 `stages` 中已配置的阶段取满级。
 * 未配置阶段的节点不入表（当前版本游戏内无法进入），避免默认构筑多算不可达加成。
 * @param dataset 天赋数据源（缺省读静态数据；测试可注入）
 * @param stageDataset 阶段数据源（缺省读静态数据；测试可注入）
 * @returns `[talentId, level]` 列表
 */
export function createMaxedReachableTalentLevels(
    dataset?: readonly TranscendTalentInfo[],
    stageDataset?: readonly TranscendTalentStageInfo[]
): [number, number][] {
    const openStageIds = new Set((stageDataset ?? stages).map(stage => stage.id))
    return (dataset ?? talents)
        .filter(talent => typeof talent.stageId === "number" && openStageIds.has(talent.stageId))
        .map(talent => [talent.id, Math.max(1, Math.round(talent.maxLevel || 1))])
}

/** 天赋阶段可达性警告原因：`unreleased` 当前版本未开放；`unreachable` 上一阶段仍有未激活节点 */
export type TranscendTalentStageWarningReason = "unreleased" | "unreachable"

/** 天赋阶段可达性警告（不阻止编辑 / 计算） */
export interface TranscendTalentStageWarning {
    stageId: number
    reason: TranscendTalentStageWarningReason
}

/**
 * 计算非阻塞的阶段可达性警告：只看已投入节点的阶段，两类条件互相独立（可同时命中）。
 * 门禁口径：阶段 N（N > 1）要求上一阶段「在数据集中存在节点且全部 level > 0」才可达；
 * 上一阶段没有任何节点（数据包缺表 / 注入数据为空）同样判 `unreachable`，
 * 不按「空列表 = 全部激活」处理。level ≤ 0 与未知 talent id 一律视为未投入。
 * - 阶段不在 `stages`：当前版本未开放，仅计入本地理论值；
 * - 上一阶段仍有未激活节点或数据集中不存在该阶段：游戏内不可达（需先激活上一阶段全部节点）。
 * @param levels 已投入的 `[talentId, level]` 列表
 * @param dataset 天赋数据源（缺省读静态数据）
 * @param stageDataset 阶段数据源（缺省读静态数据）
 * @returns 按阶段 id 升序的警告列表
 */
export function getTalentStageWarnings(
    levels: readonly (readonly [number, number])[],
    dataset?: readonly TranscendTalentInfo[],
    stageDataset?: readonly TranscendTalentStageInfo[]
): TranscendTalentStageWarning[] {
    const source = dataset ?? talents
    const openStageIds = new Set((stageDataset ?? stages).map(stage => stage.id))
    const levelMap = new Map(levels.map(([talentId, level]) => [talentId, level]))
    const allocated = new Set<number>()
    const missing = new Set<number>()
    for (const talent of source) {
        if (typeof talent.stageId !== "number") continue
        if ((levelMap.get(talent.id) ?? 0) > 0) allocated.add(talent.stageId)
        else missing.add(talent.stageId)
    }
    const stageIds = [...new Set(source.map(talent => talent.stageId).filter((id): id is number => typeof id === "number"))].sort(
        (left, right) => left - right
    )
    const stagesWithNodes = new Set(stageIds)
    const warnings: TranscendTalentStageWarning[] = []
    for (const stageId of stageIds) {
        if (!allocated.has(stageId)) continue
        if (!openStageIds.has(stageId)) warnings.push({ stageId, reason: "unreleased" })
        if (stageId > 1 && (!stagesWithNodes.has(stageId - 1) || missing.has(stageId - 1))) {
            warnings.push({ stageId, reason: "unreachable" })
        }
    }
    return warnings
}

/**
 * 判断构筑是否启用升华：只认 `transcend.enabled === true`（用户裁定，§156）。
 * 构筑类型（普通 / 升华）的迁移回填、写入落库、旧数据回退都以此为准，
 * 与 `isEmptyTranscendSettings`（enabled 或含天赋 / 装备）是两套口径，后者仅供其余逻辑使用。
 * @param value 升华配置（可缺失；非对象 / 其它真值一律 false）
 * @returns 是否启用升华
 */
export function isTranscendBuildEnabled(value: TranscendSettings | null | undefined): boolean {
    return value?.enabled === true
}

/**
 * 判断升华配置是否为「未使用」状态（关闭且无天赋、无任何变体装备）。
 * @param value 升华配置
 * @returns 是否未使用
 */
export function isEmptyTranscendSettings(value: TranscendSettings | null | undefined): boolean {
    if (!value || typeof value !== "object") return true
    if (value.enabled) return false
    const gearLists = [value.mainGear, value.assist1Gear, value.assist2Gear]
    for (const variant of Array.isArray(value.gearVariants) ? value.gearVariants : []) {
        gearLists.push(variant.mainGear, variant.assist1Gear, variant.assist2Gear)
    }
    return (value.talentLevels?.length ?? 0) === 0 && gearLists.every(list => (list?.length ?? 0) === 0)
}

/**
 * 序列化升华配置为紧凑载荷（wire format，U96）：
 * - `enabled` 等布尔写 `1|0`；
 * - 天赋等级等于「默认全开」（当前版本可达节点满级，与界面「一键解锁」默认口径一致）时整体省略
 *   （字段缺失即默认全开），显式 `[]` 仍表示一个都不开；
 * - 装备 / 词缀 / craft / 孔位 / 变体改位置数组，尾部为 null 的占位省略；
 * - 派生字段（精锻 / 最终精锻 / 词缀来源）与展示快照（`nameSnapshot` / `iconSnapshot`）不落盘；
 * - 有 `gearVariants` 时省略顶层三组（读时由激活变体恢复）。
 * 解码与归一化见 `decodeTranscendSettingsPayload` / `normalizeTranscendSettings`。
 * @param settings 已归一化的升华配置
 * @param datasets 可选的默认全开判定数据源（缺省 / 空表时用静态数据，与归一化口径一致）
 * @returns 可直接 JSON 序列化的紧凑载荷
 */
export function encodeTranscendSettings(settings: TranscendSettings, datasets?: Pick<TranscendNormalizeDatasets, "talents">): unknown {
    const encoded: Record<string, unknown> = { enabled: settings.enabled ? 1 : 0 }
    if (!isDefaultTalentLevels(settings.talentLevels, datasets?.talents)) encoded.talentLevels = settings.talentLevels
    const variants = Array.isArray(settings.gearVariants) ? settings.gearVariants : []
    if (variants.length) {
        encoded.gearVariants = variants.map(variant => {
            const row: unknown[] = [
                variant.id,
                encodeGearGroup(variant.mainGear),
                encodeGearGroup(variant.assist1Gear),
                encodeGearGroup(variant.assist2Gear),
            ]
            while (row.length > 1 && isEmptyGearGroup(row[row.length - 1])) row.pop()
            return row
        })
        encoded.activeGearVariant = settings.activeGearVariant
    } else {
        encoded.mainGear = encodeGearGroup(settings.mainGear)
        encoded.assist1Gear = encodeGearGroup(settings.assist1Gear)
        encoded.assist2Gear = encodeGearGroup(settings.assist2Gear)
    }
    return encoded
}

/**
 * 解压升华载荷：把位置数组写法的装备 / 词缀 / craft / 变体还原成归一化可读的对象形状。
 * 非压缩形状（v2 对象 / v1 平铺条目 / 缺失字段）原样透传，因此对任意历史输入都可安全调用且幂等。
 * @param value 原始载荷
 * @returns 供 `normalizeTranscendSettings` 读取的对象载荷
 */
export function decodeTranscendSettingsPayload(value: unknown): unknown {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value
    const raw = value as Record<string, unknown>
    const decoded: Record<string, unknown> = { ...raw }
    if ("enabled" in raw) decoded.enabled = raw.enabled === 1 || raw.enabled === true
    for (const key of ["mainGear", "assist1Gear", "assist2Gear", "assistGear"] as const) {
        if (Array.isArray(raw[key])) decoded[key] = decodeGearGroup(raw[key] as unknown[])
    }
    if (Array.isArray(raw.gearVariants)) decoded.gearVariants = raw.gearVariants.map(decodeGearVariant)
    return decoded
}

/** 默认全开判定用的天赋表：注入表为空（安全模式 / 缺包）时回退静态数据，避免与恢复后的数据不一致 */
function resolveDefaultTalentDataset(dataset?: readonly TranscendTalentInfo[]): readonly TranscendTalentInfo[] | undefined {
    return dataset && dataset.length > 0 ? dataset : undefined
}

/** 天赋等级是否等于「默认全开」（当前版本可达节点满级；一致时序列化省略该字段，读取时按同口径恢复） */
function isDefaultTalentLevels(levels: readonly (readonly [number, number])[], talentDataset?: readonly TranscendTalentInfo[]): boolean {
    const maxed = createMaxedReachableTalentLevels(resolveDefaultTalentDataset(talentDataset))
    if (levels.length !== maxed.length) return false
    const levelMap = new Map(levels.map(([talentId, level]) => [talentId, level]))
    return maxed.every(([talentId, level]) => levelMap.get(talentId) === level)
}

/** 空装备组（编码时可省略的尾部占位） */
function isEmptyGearGroup(value: unknown): boolean {
    return Array.isArray(value) && value.length === 0
}

/** 编码装备组：v2 物品转位置数组，v1 平铺条目（安全模式残留）原样保留 */
function encodeGearGroup(group: TranscendGearGroup | undefined): unknown[] {
    if (!Array.isArray(group)) return []
    return group.map(entry => (isEquippedGear(entry) ? encodeGearItem(entry) : entry))
}

/** 编码单件装备：`[slotId, kind, slotType, uniqueId, rarityId, baseScore, iconId, nameId, seasonId, uniqueAffixId, affixes, craft, sockets, socketCount, legacyUnique]` */
function encodeGearItem(entry: TranscendEquippedGear): unknown[] {
    const { slotId, item } = entry
    const row: unknown[] = [
        slotId,
        item.kind === "unique" ? 1 : 0,
        item.slotType,
        item.uniqueId ?? null,
        item.rarityId ?? null,
        item.equipBaseScore ?? null,
        item.iconId ?? null,
        item.nameId ?? null,
        item.seasonId ?? null,
        item.uniqueAffix?.affixId ?? null,
        item.affixes.length ? item.affixes.map(encodeAffixRoll) : null,
        encodeCraftState(item.craft),
        item.sockets?.length ? item.sockets.map(socket => [socket.socketIndex, socket.gemId]) : null,
        item.socketCount ?? null,
        item.legacyUnique ? 1 : null,
    ]
    while (row.length && row[row.length - 1] === null) row.pop()
    return row
}

/** 编码词缀：`[affixId, rollLevel?, ancient?]`；rollLevel = 1 与 ancient = 0 可省略 */
function encodeAffixRoll(roll: TranscendGearAffixRoll): unknown[] {
    const row: unknown[] = [roll.affixId, roll.rollLevel]
    if (roll.ancient) row.push(1)
    if (row.length === 2 && row[1] === 1) row.pop()
    return row
}

/** 编码 craft：`[masterworkLevel, temperingCount, enchantCount, finalIdx, temperIdx, enchantIdx, snapshot]`；全默认时省略 */
function encodeCraftState(craft: TranscendGearCraftState | undefined): unknown[] | null {
    if (!craft) return null
    const finalIndex = craft.finalMasterworkAffixIndex
    const temperingIndex = craft.temperingAffixIndex
    const enchantIndex = craft.enchantAffixIndex
    const snapshot = craft.enchantSnapshot
    const idle =
        !craft.masterworkLevel && finalIndex === undefined && temperingIndex === undefined && enchantIndex === undefined && !snapshot
    if (idle) return null
    const row: unknown[] = [
        craft.masterworkLevel,
        temperingIndex === undefined ? null : craft.temperingCount,
        enchantIndex === undefined ? null : craft.enchantCount,
        finalIndex ?? null,
        temperingIndex ?? null,
        enchantIndex ?? null,
        snapshot ? [snapshot.affixIndex, encodeAffixRoll(snapshot.roll)] : null,
    ]
    while (row.length && row[row.length - 1] === null) row.pop()
    return row
}

/** 解码装备组：位置数组转物品对象，v2 / v1 对象条目原样保留；非法压缩行丢弃（不伪造空装备） */
function decodeGearGroup(group: readonly unknown[]): unknown[] {
    const entries: unknown[] = []
    for (const entry of group) {
        if (!Array.isArray(entry)) {
            entries.push(entry)
            continue
        }
        const decoded = decodeGearItem(entry)
        if (decoded) entries.push(decoded)
    }
    return entries
}

/** 解码装备变体：`[id, main, assist1, assist2]` 或旧对象形状 */
function decodeGearVariant(value: unknown): unknown {
    if (!Array.isArray(value)) {
        if (!value || typeof value !== "object") return value
        const raw = value as Record<string, unknown>
        const decoded: Record<string, unknown> = { ...raw }
        for (const key of ["mainGear", "assist1Gear", "assist2Gear", "assistGear"] as const) {
            if (Array.isArray(raw[key])) decoded[key] = decodeGearGroup(raw[key] as unknown[])
        }
        return decoded
    }
    const [id, mainGear, assist1Gear, assist2Gear] = value
    return {
        id,
        mainGear: Array.isArray(mainGear) ? decodeGearGroup(mainGear) : [],
        assist1Gear: Array.isArray(assist1Gear) ? decodeGearGroup(assist1Gear) : [],
        assist2Gear: Array.isArray(assist2Gear) ? decodeGearGroup(assist2Gear) : [],
    }
}

/**
 * 解码单件装备：位置数组 → `{slotId, item}`。
 * 要求至少 3 个元素且槽位 / 类型 / 槽型合法；截断或畸形行返回 null（由调用方丢弃，不伪造空装备）。
 */
function decodeGearItem(value: readonly unknown[]): unknown {
    if (value.length < 3) return null
    const [
        slotIdRaw,
        kind,
        slotType,
        uniqueId,
        rarityId,
        equipBaseScore,
        iconId,
        nameId,
        seasonId,
        uniqueAffixId,
        affixes,
        craft,
        sockets,
        socketCount,
        legacyUnique,
    ] = value
    const slotId = Math.round(Number(slotIdRaw))
    const slotTypeValue = Math.round(Number(slotType))
    if (!Number.isFinite(Number(slotIdRaw)) || slotId < TRANSCEND_SLOT_MIN || slotId > TRANSCEND_SLOT_MAX) return null
    if (kind !== 0 && kind !== 1) return null
    if (!Number.isFinite(Number(slotType)) || slotTypeValue < TRANSCEND_SLOT_TYPE_MIN || slotTypeValue > TRANSCEND_SLOT_TYPE_MAX)
        return null
    const item: Record<string, unknown> = {
        kind: kind === 1 ? "unique" : "normal",
        slotType: slotTypeValue,
        affixes: decodeAffixRollList(affixes),
    }
    if (craft !== null && craft !== undefined) item.craft = decodeCraftState(craft)
    if (uniqueId !== null && uniqueId !== undefined) item.uniqueId = uniqueId
    if (rarityId !== null && rarityId !== undefined) item.rarityId = rarityId
    if (equipBaseScore !== null && equipBaseScore !== undefined) item.equipBaseScore = equipBaseScore
    if (iconId !== null && iconId !== undefined) item.iconId = iconId
    if (nameId !== null && nameId !== undefined) item.nameId = nameId
    if (seasonId !== null && seasonId !== undefined) item.seasonId = seasonId
    // 专属词条固定 1 档 / 0 精锻 / 无太古，解码时补全（归一化会再次校正）
    if (uniqueAffixId !== null && uniqueAffixId !== undefined) {
        item.uniqueAffix = {
            affixId: uniqueAffixId,
            rollLevel: 1,
            masterworkLevel: 0,
            ancient: false,
            finalMasterwork: false,
            source: "unique",
        }
    }
    if (Array.isArray(sockets)) {
        item.sockets = sockets
            .filter((socket): socket is readonly unknown[] => Array.isArray(socket))
            .map(socket => ({ socketIndex: socket[0], gemId: socket[1] }))
    }
    if (socketCount !== null && socketCount !== undefined) item.socketCount = socketCount
    if (legacyUnique === 1) item.legacyUnique = true
    return { slotId, item }
}

/** 解码词缀列表：`[affixId, rollLevel?, ancient?]` 转对象，旧对象条目原样保留 */
function decodeAffixRollList(value: unknown): unknown[] {
    if (!Array.isArray(value)) return []
    return value.map(entry => {
        if (!Array.isArray(entry)) return entry
        const [affixId, rollLevel, ancient] = entry
        return { affixId, rollLevel: rollLevel ?? 1, ancient: ancient === 1 || ancient === true }
    })
}

/** 解码 craft：位置数组 → 装备级对象；tempering / enchant 次数只在对应词条存在时有意义 */
function decodeCraftState(value: unknown): unknown {
    if (!Array.isArray(value)) return value
    const [masterworkLevel, temperingCount, enchantCount, finalIndex, temperingIndex, enchantIndex, snapshot] = value
    const craft: Record<string, unknown> = {
        masterworkLevel: Number.isFinite(Number(masterworkLevel)) ? Number(masterworkLevel) : 0,
        temperingCount: Number.isFinite(Number(temperingCount)) ? Number(temperingCount) : 0,
        enchantCount: Number.isFinite(Number(enchantCount)) ? Number(enchantCount) : 0,
    }
    if (finalIndex !== null && finalIndex !== undefined) craft.finalMasterworkAffixIndex = finalIndex
    if (temperingIndex !== null && temperingIndex !== undefined) craft.temperingAffixIndex = temperingIndex
    if (enchantIndex !== null && enchantIndex !== undefined) craft.enchantAffixIndex = enchantIndex
    if (Array.isArray(snapshot)) {
        const [affixIndex, roll] = snapshot
        const [decodedRoll] = decodeAffixRollList(Array.isArray(roll) ? [roll] : [])
        if (decodedRoll) craft.enchantSnapshot = { affixIndex, roll: decodedRoll }
    }
    return craft
}

/** 归一化所需的天赋最小信息（可注入，便于测试安全模式） */
export interface TranscendTalentInfo {
    id: number
    maxLevel?: number
    /** 所属升华阶段（节点数据中的 `TalentTree`） */
    stageId?: number
}

/** 阶段最小信息（可注入，便于测试阶段可达性） */
export interface TranscendTalentStageInfo {
    id: number
}

/** 归一化数据源：缺省读静态数据表；安全模式（版本门限隐藏 1.8）下为空数组 */
export interface TranscendNormalizeDatasets {
    affixes: readonly TranscendAffixInfo[]
    talents: readonly TranscendTalentInfo[]
    /** 装备层数据源（槽型 / 宝石 / 暗金目录）；缺省读静态数据 */
    gear?: TranscendGearDatasets
}

/**
 * 归一化升华配置：补齐缺省字段、剔除未知天赋、钳制等级，并归一化三组装备与全部装备变体。
 * 旧存档没有该字段时返回关闭状态的默认配置，运行时永远拿到可用结构。
 * post-U32b 的 `assistGear`（两组共用）只作只读兼容别名：协战一取 `assist1Gear ?? assistGear`，协战二取 `assist2Gear ?? []`。
 * @param value 原始升华配置
 * @param datasets 数据源（缺省为静态数据；测试可注入空表验证安全模式）
 * @returns 结构完整的升华配置
 */
export function normalizeTranscendSettings(value: unknown, datasets?: TranscendNormalizeDatasets): TranscendSettings {
    const normalized = createDefaultTranscendSettings()
    const payload = decodeTranscendSettingsPayload(value)
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return normalized
    const raw = payload as Partial<TranscendSettings> & TranscendLegacyGearGroups
    const rawEnabled = (raw as { enabled?: unknown }).enabled
    normalized.enabled = rawEnabled === true || rawEnabled === 1
    const hasTalents = Array.isArray(raw.talentLevels) && raw.talentLevels.length > 0
    // 压缩格式：字段缺失 = 默认全开；显式 [] 仍表示一个都不开
    const rawTalentLevels = (raw as { talentLevels?: unknown }).talentLevels
    const implicitMaxTalents = rawTalentLevels === undefined || rawTalentLevels === null
    // 兼容读取（不是迁移）：三组字段优先，缺失时回落到 post-U32b 的 assistGear 别名
    const rawMainGear = raw.mainGear
    const rawAssist1Gear = raw.assist1Gear ?? raw.assistGear
    const rawAssist2Gear = raw.assist2Gear
    const hasGear =
        [rawMainGear, rawAssist1Gear, rawAssist2Gear].some(list => Array.isArray(list) && list.length > 0) ||
        (Array.isArray(raw.gearVariants) && raw.gearVariants.length > 0)
    // 未使用升华的旧存档（绝大多数）直接返回默认值，避免每次载入都建天赋/词条索引；
    // 缺天赋字段但已启用 / 已有装备 = 压缩格式，按默认全开恢复
    if (!hasTalents && !hasGear && !(implicitMaxTalents && normalized.enabled)) return normalized

    if (implicitMaxTalents) {
        // 「默认全开」= 当前版本可达节点满级（与界面「一键解锁」默认口径一致，未开放阶段不自动开启）；
        // 安全模式（注入空表）回退静态数据，避免全开被固化成显式 [] 后数据恢复仍为 0 天赋
        normalized.talentLevels = createMaxedReachableTalentLevels(resolveDefaultTalentDataset(datasets?.talents)).sort(
            (left, right) => left[0] - right[0]
        )
    } else {
        const talentSource = datasets?.talents ?? talents
        const hasTalentData = talentSource.length > 0
        const talentMap = new Map<number, TranscendTalentInfo>(
            hasTalents && hasTalentData ? talentSource.map(talent => [talent.id, talent]) : []
        )
        const levels = new Map<number, number>()
        if (Array.isArray(raw.talentLevels)) {
            for (const item of raw.talentLevels) {
                if (!Array.isArray(item)) continue
                const [rawId, rawLevel] = item as unknown[]
                const talentId = Math.round(Number(rawId))
                if (!Number.isFinite(talentId) || talentId <= 0 || !Number.isFinite(rawLevel)) continue
                const talent = talentMap.get(talentId)
                // 安全模式（天赋表为空）下保留条目，等级只做基本钳制
                if (!talent) {
                    if (hasTalentData) continue
                    levels.set(talentId, Math.max(1, Math.min(1000, Math.round(rawLevel as number))))
                    continue
                }
                const maxLevel = Math.max(1, Math.round(talent.maxLevel || 1))
                levels.set(talent.id, Math.max(1, Math.min(maxLevel, Math.round(rawLevel as number))))
            }
        }
        normalized.talentLevels = [...levels.entries()].sort((a, b) => a[0] - b[0])
    }

    // 装备与天赋共用词条数据源：安全模式下词条表为空时保留未知词条结构
    const gearDatasets: TranscendGearDatasets = {
        ...datasets?.gear,
        affixes: datasets?.affixes ?? datasets?.gear?.affixes ?? affixes,
    }
    const activeGroups = normalizeTranscendGearGroups([rawMainGear, rawAssist1Gear, rawAssist2Gear], gearDatasets)
    normalized.mainGear = activeGroups.mainGear
    normalized.assist1Gear = activeGroups.assist1Gear
    normalized.assist2Gear = activeGroups.assist2Gear

    // 装备变体：只保留合法字母、去重、最多三份；缺省时用当前装备建成变体 A
    const variants: TranscendGearVariant[] = []
    for (const rawVariant of Array.isArray(raw.gearVariants) ? raw.gearVariants : []) {
        if (variants.length >= TRANSCEND_GEAR_VARIANT_MAX_COUNT) break
        if (!rawVariant || typeof rawVariant !== "object" || Array.isArray(rawVariant)) continue
        const candidate = rawVariant as Partial<TranscendGearVariant> & TranscendLegacyGearGroups
        const id = normalizeGearVariantId(candidate.id) ?? TRANSCEND_GEAR_VARIANT_LETTERS[variants.length]
        if (variants.some(variant => variant.id === id)) continue
        variants.push({
            id,
            ...normalizeTranscendGearGroups(
                [candidate.mainGear, candidate.assist1Gear ?? candidate.assistGear, candidate.assist2Gear],
                gearDatasets
            ),
        })
    }
    if (!variants.length) {
        normalized.activeGearVariant = DEFAULT_TRANSCEND_GEAR_VARIANT
        variants.push({ id: DEFAULT_TRANSCEND_GEAR_VARIANT, ...activeGroups })
    } else {
        const requestedId = normalizeGearVariantId(raw.activeGearVariant)
        const activeVariant = variants.find(variant => variant.id === requestedId) ?? variants[0]
        normalized.activeGearVariant = activeVariant.id
        // 按组非空优先：顶层组非空时顶层权威，为空时采用激活变体同组；
        // 最后把两边同步成同一份，避免「顶层只有 mainGear、变体另有协战装备」时丢装备
        normalized.mainGear = activeGroups.mainGear.length > 0 ? activeGroups.mainGear : activeVariant.mainGear
        normalized.assist1Gear = activeGroups.assist1Gear.length > 0 ? activeGroups.assist1Gear : activeVariant.assist1Gear
        normalized.assist2Gear = activeGroups.assist2Gear.length > 0 ? activeGroups.assist2Gear : activeVariant.assist2Gear
        activeVariant.mainGear = normalized.mainGear
        activeVariant.assist1Gear = normalized.assist1Gear
        activeVariant.assist2Gear = normalized.assist2Gear
    }
    normalized.gearVariants = variants
    return normalized
}
