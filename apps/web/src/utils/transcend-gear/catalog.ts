import {
    baseNames,
    type DnaSeasonBaseName,
    type DnaSeasonNamePrefix,
    type DnaSeasonRarity,
    type DnaSeasonUniqueEquip,
    namePrefixes,
    rarities,
    resourceMap,
    seasons,
    type TranscendGearItemConfig,
    uniqueEquips,
} from "@/data"

/**
 * 升华装备目录查询：品质 / 槽型 / 基础名 / 名称前缀 / 暗金 / 宝石资源与展示兜底。
 * 品质只决定随机词缀条数（`minAffixCount`），数据里没有数值倍率，界面不得引入倍率。
 */

/** 名称顺序反序的语言（英文 / 法文：基础名在前、前缀在后） */
const REVERSED_NAME_LANGUAGES = new Set(["en", "fr"])

/**
 * 按品质 id 读取品质数据。
 * @param rarityId 品质 id（1/2/3/4/5/10）
 * @returns 品质数据；缺失时 undefined
 */
export function getGearRarity(rarityId: number | undefined): DnaSeasonRarity | undefined {
    if (!rarityId) return undefined
    return rarities.find(rarity => rarity.id === Math.round(rarityId))
}

/**
 * 品质对应的随机词缀条数（`MinAffixCount[0]`）。
 * @param rarityId 品质 id
 * @returns 随机词缀条数；未知品质为 0
 */
export function getGearRarityAffixCount(rarityId: number | undefined): number {
    const rarity = getGearRarity(rarityId)
    return Math.max(0, Math.round(rarity?.minAffixCount[0] ?? 0))
}

/**
 * 判断品质是否暗金。
 * @param rarityId 品质 id
 * @returns 暗金品质为 true
 */
export function isUniqueRarity(rarityId: number | undefined): boolean {
    return Math.round(Number(rarityId)) === 10
}

/**
 * 品质的展示稀有度（2/3 同为蓝、4/5 同为金、10 为暗金）。
 * @param rarityId 品质 id
 * @returns `ShowRarityId`；未知品质为 0
 */
export function getGearShowRarityId(rarityId: number | undefined): number {
    const rarity = getGearRarity(rarityId)
    return rarity ? rarity.showRarityId : 0
}

/** 升华品质颜色（暗金单独使用金色渐变） */
const SHOW_RARITY_COLORS: Record<number, string> = {
    1: "border-gray-400/50 bg-gray-400/80",
    2: "border-green-500/50 bg-green-500/80",
    3: "border-blue-500/50 bg-blue-500/80",
    4: "border-purple-500/50 bg-purple-500/80",
    5: "border-yellow-500/50 bg-yellow-500/80",
    6: "border-red-500/50 bg-red-500/80",
    10: "border-amber-300/60 bg-gradient-to-br from-amber-200 via-yellow-500 to-amber-800",
}

/**
 * 品质颜色类名（只含颜色，形状由调用方决定）。
 * @param showRarityId 展示稀有度
 * @returns 颜色类名
 */
export function getShowRarityColorClass(showRarityId: number): string {
    return SHOW_RARITY_COLORS[showRarityId] ?? SHOW_RARITY_COLORS[1]
}

/**
 * 品质色块类名（含大小 / 圆角 / 边框）。
 * @param showRarityId 展示稀有度
 * @returns 完整色块类名
 */
export function getShowRarityClass(showRarityId: number): string {
    return `inline-block size-2.5 shrink-0 rounded-xs border ${getShowRarityColorClass(showRarityId)}`
}

/**
 * 取某槽型的基础名候选（每槽 3 个）。
 * @param slotType 槽型 id
 * @returns 基础名列表
 */
export function getBaseNameOptions(slotType: number): DnaSeasonBaseName[] {
    return baseNames.filter(item => item.slot === Math.round(slotType))
}

/**
 * 取某槽型的名称前缀（每槽唯一）。
 * @param slotType 槽型 id
 * @returns 名称前缀；数据缺失时 undefined
 */
export function getNamePrefix(slotType: number): DnaSeasonNamePrefix | undefined {
    return namePrefixes.find(item => item.slot === Math.round(slotType))
}

/**
 * 按 id 读取基础名。
 * @param iconId 基础名 id
 * @returns 基础名；缺失时 undefined
 */
export function getBaseNameById(iconId: number | undefined): DnaSeasonBaseName | undefined {
    if (!iconId) return undefined
    return baseNames.find(item => item.id === Math.round(iconId))
}

/**
 * 取某槽型的暗金候选；槽型 10/11 上游没有唯一装。
 * @param slotType 槽型 id
 * @returns 暗金列表
 */
export function getUniqueEquipOptions(slotType: number): DnaSeasonUniqueEquip[] {
    return uniqueEquips.filter(item => item.slot === Math.round(slotType))
}

/**
 * 按 id 读取暗金。
 * @param uniqueId 暗金 id
 * @returns 暗金数据；缺失时 undefined
 */
export function getUniqueEquipById(uniqueId: number | undefined): DnaSeasonUniqueEquip | undefined {
    if (!uniqueId) return undefined
    return uniqueEquips.find(item => item.id === Math.round(uniqueId))
}

/**
 * 该槽型是否可构造暗金。
 * @param slotType 槽型 id
 * @returns 槽型 1-9 且存在唯一装时为 true
 */
export function canUseUniqueRarity(slotType: number): boolean {
    return getUniqueEquipOptions(slotType).length > 0
}

/**
 * 当前赛季 id（数据只有 1.8 赛季）；数据缺失时回退 1。
 * @returns 赛季 id
 */
export function getCurrentSeasonId(): number {
    return seasons[seasons.length - 1]?.id ?? 1
}

/**
 * 判断当前语言是否使用「基础名 + 前缀」的拼接顺序。
 * @param locale i18n 语言
 * @returns 英文 / 法文为 true
 */
export function isReversedGearNameLocale(locale: string): boolean {
    return REVERSED_NAME_LANGUAGES.has(locale.split("-")[0]?.toLowerCase() ?? "")
}

/**
 * 拼接普通装备名称：中文 / 日文 / 韩文为「前缀 + 基础名」，英文 / 法文为「基础名 + 前缀」。
 * 前缀译文自带分隔符（`: ` / `· `），不得额外补空格。
 * @param prefix 已翻译的名称前缀
 * @param base 已翻译的基础名
 * @param locale 当前语言
 * @returns 拼接后的名称
 */
export function composeGearName(prefix: string, base: string, locale: string): string {
    if (!prefix) return base
    if (!base) return prefix
    return isReversedGearNameLocale(locale) ? `${base}${prefix}` : `${prefix}${base}`
}

/**
 * 装备展示名：暗金用唯一装名，普通装备用「前缀 + 基础名」；数据缺失时回退名称快照。
 * @param item 装备物品
 * @param gt 游戏原文翻译函数
 * @param locale 当前语言
 * @returns 展示名
 */
export function getGearDisplayName(item: TranscendGearItemConfig, gt: (text: string | undefined | null) => string, locale: string): string {
    if (item.kind === "unique") {
        const equip = getUniqueEquipById(item.uniqueId)
        return equip ? gt(equip.name) : (item.nameSnapshot ?? "")
    }
    const base = getBaseNameById(item.iconId)
    const prefix = item.nameId ? namePrefixes.find(entry => entry.id === item.nameId) : getNamePrefix(item.slotType)
    if (base) {
        return composeGearName(prefix ? gt(prefix.name) : "", gt(base.name), locale)
    }
    return item.nameSnapshot ?? ""
}

/**
 * 装备图标地址：暗金用唯一装图标，普通装备用基础名图标，最后回退图标快照。
 * @param item 装备物品
 * @returns 图片地址；没有可用图标时为空串
 */
export function getGearIconSrc(item: TranscendGearItemConfig): string {
    const token = item.kind === "unique" ? getUniqueEquipById(item.uniqueId)?.icon : getBaseNameById(item.iconId)?.icon
    const icon = token || item.iconSnapshot
    if (!icon) return ""
    return icon.startsWith("/") ? icon : `/imgs/res/${icon}.webp`
}

/**
 * 复制物品并补全展示快照（库存自包含，安全模式 / 缺包时可离线展示）：
 * 暗金写唯一装名/图标，普通写拼接名（原文口径）与基础名图标，宝石写资源名/图标。
 * @param item 装备物品
 * @returns 带快照的新物品（不修改入参）
 */
export function withGearSnapshots(item: TranscendGearItemConfig): TranscendGearItemConfig {
    const next: TranscendGearItemConfig = { ...item, affixes: item.affixes.map(roll => ({ ...roll })) }
    if (Array.isArray(item.sockets)) next.sockets = item.sockets.map(socket => ({ ...socket }))
    if (item.kind === "unique") {
        const equip = getUniqueEquipById(item.uniqueId)
        if (equip) {
            next.nameSnapshot = equip.name
            next.iconSnapshot = equip.icon
        }
    } else {
        const base = getBaseNameById(item.iconId)
        const prefix = item.nameId ? namePrefixes.find(entry => entry.id === item.nameId) : getNamePrefix(item.slotType)
        if (base) {
            next.nameSnapshot = `${prefix?.name ?? ""}${base.name}`
            next.iconSnapshot = base.icon
        }
    }
    if (next.sockets) {
        next.sockets = next.sockets.map(socket => {
            const resource = resourceMap.get(socket.gemId)
            return resource ? { ...socket, nameSnapshot: resource.name, iconSnapshot: resource.icon } : socket
        })
    }
    return next
}
