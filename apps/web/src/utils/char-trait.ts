import charData from "@/data/d/char.data"
import type { Char } from "@/data/data-types"

/** 派遣标签的配色分组（与 DBCharDetailItem 内镜像的游戏分组保持一致） */
export type CharTraitColorGroup = "Red" | "Blue" | "Green" | "Special"

/** 特质图标的配色（底板 / 字 / 流光） */
export interface CharTraitColorStyle {
    /** 底板：非 Special 组为纯色，Special 组为金色渐变 */
    plate: string
    /** 图标字色（图标贴图是白色带 alpha 的形状，靠遮罩着色） */
    glyph: string
    /** 流光色（仅 Special 组有） */
    glow?: string
}

/**
 * 派遣标签 → 配色分组。
 * 游戏里颜色不来自数据表，而是界面按标签的功能分组硬编码，
 * 这里与 DBCharDetailItem 保持同一张表。
 */
export const CHAR_TRAIT_COLOR_GROUP: Record<string, CharTraitColorGroup> = {
    Battle: "Red",
    Collect: "Blue",
    Mine: "Blue",
    Fish: "Blue",
    Pet: "Blue",
    Benefit: "Green",
    Morality: "Green",
    Wisdom: "Green",
    Empathy: "Green",
    Chaos: "Green",
    Workaholic: "Special",
    Rigorous: "Special",
    Skilled: "Special",
    Lucky: "Special",
}

/** 各配色分组的实际取值（取自游戏控件首帧） */
export const CHAR_TRAIT_GROUP_STYLE: Record<CharTraitColorGroup, CharTraitColorStyle> = {
    Red: { plate: "#dd5871", glyph: "#ffffff" },
    Blue: { plate: "#6f93f5", glyph: "#ffffff" },
    Green: { plate: "#27a16e", glyph: "#ffffff" },
    Special: { plate: "linear-gradient(150deg, #fbe3b0, #fdf5dc)", glyph: "#66351f", glow: "#ffddaf" },
}

/** 标签表里查不到时的兜底配色 */
export const CHAR_TRAIT_FALLBACK_STYLE: CharTraitColorStyle = {
    plate: "color-mix(in oklab, var(--color-base-content) 22%, transparent)",
    glyph: "#ffffff",
}

/**
 * 特质图标地址（icon 已是完整贴图名，如 T_Dispatch_A09）。
 * @param icon 图标贴图名
 * @returns 图标地址
 */
export function getCharTraitIconUrl(icon: string): string {
    return `/imgs/webp/${icon}.webp`
}

/**
 * 根据标签 key 取配色。
 * @param tag 标签 key（如 Battle / Lucky）
 * @returns 配色，未知标签返回兜底
 */
export function getCharTraitStyle(tag: string): CharTraitColorStyle {
    const group = CHAR_TRAIT_COLOR_GROUP[tag]
    return group ? CHAR_TRAIT_GROUP_STYLE[group] : CHAR_TRAIT_FALLBACK_STYLE
}

/**
 * 根据标签 key 取配色分组名。
 * @param tag 标签 key
 * @returns 分组名，未知标签返回 Other
 */
export function getCharTraitGroupName(tag: string): CharTraitColorGroup | "Other" {
    return CHAR_TRAIT_COLOR_GROUP[tag] ?? "Other"
}

/** 某个角色持有的特质槽位 */
export interface CharTraitOwner {
    /** 角色 id */
    charId: number
    /** 角色名 */
    charName: string
    /** 该特质占用的派遣槽位数 */
    level: number
    /** 各级解锁所需的突破阶段（0 表示初始解锁） */
    unlock: number[]
}

/** 归纳后的单个特质条目：同名特质合并，owners 即反向查询到的所属角色 */
export interface CharTraitEntry {
    /** 特质名（如「冒险家」） */
    name: string
    /** 特质说明 */
    desc: string
    /** 图标贴图名 */
    icon: string
    /** 标签 key（如 Battle） */
    tag: string
    /** 持有该特质的角色（按角色 id 升序） */
    owners: CharTraitOwner[]
}

/**
 * 把角色表的特质按名称归纳：同名特质合并为一条，owners 记录所属角色。
 * @param chars 角色列表，默认全量 char.data
 * @returns 按特质名排序的归纳结果
 */
export function buildCharTraitDirectory(chars: readonly Char[] = charData): CharTraitEntry[] {
    const map = new Map<string, CharTraitEntry>()
    for (const char of chars) {
        for (const trait of char.特质 ?? []) {
            const existing = map.get(trait.名称)
            const owner: CharTraitOwner = {
                charId: char.id,
                charName: char.名称,
                level: trait.等级,
                unlock: [...trait.解锁],
            }
            if (existing) {
                existing.owners.push(owner)
            } else {
                map.set(trait.名称, {
                    name: trait.名称,
                    desc: trait.描述,
                    icon: trait.icon,
                    tag: trait.标签,
                    owners: [owner],
                })
            }
        }
    }
    const entries = [...map.values()]
    for (const entry of entries) {
        entry.owners.sort((a, b) => a.charId - b.charId)
    }
    entries.sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"))
    return entries
}

/** 全量特质目录（模块求值期即归纳；char.data 为空时为空数组，支持无数据包降级） */
export const charTraitEntries: CharTraitEntry[] = buildCharTraitDirectory()

/** 特质名 → 条目索引 */
export const charTraitMap = new Map<string, CharTraitEntry>(charTraitEntries.map(entry => [entry.name, entry]))

/**
 * 按特质名取归纳条目。
 * @param name 特质名
 * @returns 条目，不存在时返回 null
 */
export function getCharTraitByName(name: string): CharTraitEntry | null {
    return charTraitMap.get(name) ?? null
}

/**
 * 反向查询：持有指定特质的角色列表。
 * @param name 特质名
 * @returns 所属角色，按角色 id 升序；特质不存在时返回空数组
 */
export function getCharsByTraitName(name: string): CharTraitOwner[] {
    return charTraitMap.get(name)?.owners ?? []
}
