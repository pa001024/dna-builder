/**
 * AI 卡片（DBAICard）的条目解析。
 *
 * 模型给出的参数是「类型 + id 或名称」这种最简形态，而 `DBLatestItemCard` 需要完整的
 * Char / Weapon / Mod 数据对象，这一层负责把前者补齐成后者，让模型不必（也无法）拼出完整数据：
 * - 类型写法容错：char / weapon / mod，兼收「角色 / 武器 / 魔之楔」这类中文写法；
 * - 定位以 id 为主，其次名称（含角色别名、魔之楔的「系列 + 名称」写法、拼音）；
 * - 名称还接受译文写法：先用 `expandDBAgentKeyword` 反查回游戏原文再匹配，
 *   否则非中文界面下模型给的名字一律落空；
 * - 类型缺失时按 角色 → 武器 → 魔之楔 的顺序找，让模型漏写 kind 时不至于渲染失败。
 */

import type { DBLatestItem } from "@/components/DBLatestItemCard.vue"
import charData from "@/data/d/char.data"
import modData from "@/data/d/mod.data"
import weaponData from "@/data/d/weapon.data"
import type { Char, Mod, Weapon } from "@/data/data-types"
import { pickDBEntryByName, toNumericEntryId } from "@/utils/db-name-match"

/** AI 卡片支持的条目类型 */
export type DBCardKind = "char" | "weapon" | "mod"

/** 类型缺失时按这个顺序逐个尝试 */
const CARD_KIND_ORDER: readonly DBCardKind[] = ["char", "weapon", "mod"]

/** 类型参数的合法写法（小写后比对） */
const CARD_KIND_ALIASES: Record<string, DBCardKind> = {
    char: "char",
    chars: "char",
    character: "char",
    characters: "char",
    角色: "char",
    weapon: "weapon",
    weapons: "weapon",
    武器: "weapon",
    mod: "mod",
    mods: "mod",
    魔之楔: "mod",
}

/**
 * 归一化类型参数。
 * @param raw 模型给的 kind
 * @returns 归一化后的类型；无法识别时返回 undefined
 */
export function normalizeDBCardKind(raw: unknown): DBCardKind | undefined {
    const key = `${raw ?? ""}`.trim().toLowerCase()

    return key ? CARD_KIND_ALIASES[key] : undefined
}

/**
 * 取条目的候选名称：资料库里这条数据可能被写成的各种名字。
 * @param kind 条目类型
 * @param item 条目数据
 * @returns 候选名称列表（空串会被匹配逻辑忽略）
 */
function candidateNames(kind: DBCardKind, item: Char | Weapon | Mod): string[] {
    if (kind === "char") {
        const char = item as Char

        // 别名也是玩家常用的叫法（如「无罪囚徒」）
        return [char.名称, char.别名 ?? ""]
    }

    if (kind === "mod") {
        const mod = item as Mod

        // 魔之楔在界面上常写成「系列 + 名称」，两种写法都要能命中
        return [mod.名称, mod.系列 ? `${mod.系列}${mod.名称}` : ""]
    }

    return [(item as Weapon).名称]
}

/**
 * 按名称在单个模块内定位条目。
 * @param kind 条目类型
 * @param name 模型给的名称
 * @returns 命中的条目（含类型）；没有匹配时返回 undefined
 */
function findByKindAndName(kind: DBCardKind, name: string): DBLatestItem | undefined {
    if (kind === "char") {
        const item = pickDBEntryByName(charData, name, char => candidateNames("char", char))

        return item ? { kind: "char", item } : undefined
    }

    if (kind === "mod") {
        const item = pickDBEntryByName(modData, name, mod => candidateNames("mod", mod))

        return item ? { kind: "mod", item } : undefined
    }

    const item = pickDBEntryByName(weaponData, name, weapon => candidateNames("weapon", weapon))

    return item ? { kind: "weapon", item } : undefined
}
/**
 * 按 id 在单个模块内定位条目。
 * @param kind 条目类型
 * @param id 条目 id
 * @returns 命中的条目（含类型）；没有匹配时返回 undefined
 */
function findByKindAndId(kind: DBCardKind, id: number): DBLatestItem | undefined {
    if (kind === "char") {
        const item = charData.find(char => char.id === id)

        return item ? { kind: "char", item } : undefined
    }

    if (kind === "mod") {
        const item = modData.find(mod => mod.id === id)

        return item ? { kind: "mod", item } : undefined
    }

    const item = weaponData.find(weapon => weapon.id === id)

    return item ? { kind: "weapon", item } : undefined
}

/**
 * 把模型给的简单参数补齐成条目卡片需要的完整数据。
 *
 * 定位顺序是「先 id 后名称」，两类参数都按类型逐个试：id 命中即返回，
 * 避免一次同名不同模块的误判影响 id 的精确性。
 * @param params 模型给的参数（kind / id / name）
 * @returns 完整条目；参数不足或查不到时返回 undefined
 */
export function resolveDBCardEntry(params: { kind?: unknown; id?: unknown; name?: unknown }): DBLatestItem | undefined {
    const kind = normalizeDBCardKind(params.kind)
    const kinds = kind ? [kind] : CARD_KIND_ORDER
    const id = toNumericEntryId(params.id)
    const name = `${params.name ?? ""}`.trim()

    if (id !== undefined) {
        for (const candidate of kinds) {
            const found = findByKindAndId(candidate, id)

            if (found) {
                return found
            }
        }
    }

    if (name) {
        for (const candidate of kinds) {
            const found = findByKindAndName(candidate, name)

            if (found) {
                return found
            }
        }
    }

    return undefined
}
