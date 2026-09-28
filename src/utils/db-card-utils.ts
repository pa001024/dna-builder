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
import { expandDBAgentKeyword, resolveCurrentDBAgentLang } from "@/utils/db-locale"
import { matchPinyin } from "@/utils/pinyin-utils"

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

/** 名称匹配强度：数值越小越优先 */
const MATCH_EXACT = 0
const MATCH_CONTAINS = 1
const MATCH_PINYIN = 2

/**
 * 归一化名称：去掉空白与常见分隔符并统一小写，用于宽松比对。
 * 「不死鸟·炽灼」「不死鸟之炽灼」这类写法差异都会被抹平。
 * @param text 原始名称
 * @returns 归一化后的名称
 */
function normalizeName(text: string): string {
    return text.toLowerCase().replace(/[\s·・:：,，.。\-_/\\()（）[\]「」『』"“”'‘’]/g, "")
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
 * 归一化 id 参数：只接受可转成正整数的写法。
 * @param raw 模型给的 id
 * @returns 数值 id；无法识别时返回 undefined
 */
function toNumericId(raw: unknown): number | undefined {
    if (raw === undefined || raw === null || `${raw}`.trim() === "") {
        return undefined
    }

    const value = Number(raw)

    return Number.isFinite(value) ? value : undefined
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
 * 计算候选名与查询词的匹配强度。
 * @param candidate 候选名（资料库原文）
 * @param query 模型给的名称
 * @returns 强度值；不匹配时返回 undefined
 */
function matchStrength(candidate: string, query: string): number | undefined {
    const left = normalizeName(candidate)
    const right = normalizeName(query)

    if (!left || !right) {
        return undefined
    }

    if (left === right) {
        return MATCH_EXACT
    }

    // 过短的查询用包含匹配会命中一大片（如「之」「a」），只保留拼音兜底
    if (right.length >= 2 && (left.includes(right) || right.includes(left))) {
        return MATCH_CONTAINS
    }

    if (right.length >= 2 && matchPinyin(candidate, query).match) {
        return MATCH_PINYIN
    }

    return undefined
}

/**
 * 在候选条目里挑匹配最强的一个。
 *
 * 同强度下取名称最短的条目：更短的名称通常更贴近用户真正指的那一个
 * （「炽灼」优于「炽灼残响」）。
 * @param items 条目数组
 * @param name 模型给的名称
 * @param namesOf 取某个条目的候选名
 * @returns 命中的条目；没有匹配时返回 undefined
 */
function pickBestByName<T extends { 名称: string }>(items: readonly T[], name: string, namesOf: (item: T) => string[]): T | undefined {
    // 名称可能是译文：先把查询反查成游戏原文，再逐个匹配
    const queries = expandDBAgentKeyword(name, resolveCurrentDBAgentLang())

    if (!queries.length) {
        return undefined
    }

    let best: { item: T; score: number; length: number } | undefined

    for (const item of items) {
        for (const candidate of namesOf(item)) {
            for (const query of queries) {
                const score = matchStrength(candidate, query)

                if (score === undefined) {
                    continue
                }

                const length = candidate.length

                if (!best || score < best.score || (score === best.score && length < best.length)) {
                    best = { item, score, length }
                }
            }
        }
    }

    return best?.item
}

/**
 * 按名称在单个模块内定位条目。
 * @param kind 条目类型
 * @param name 模型给的名称
 * @returns 命中的条目（含类型）；没有匹配时返回 undefined
 */
function findByKindAndName(kind: DBCardKind, name: string): DBLatestItem | undefined {
    if (kind === "char") {
        const item = pickBestByName(charData, name, char => candidateNames("char", char))

        return item ? { kind: "char", item } : undefined
    }

    if (kind === "mod") {
        const item = pickBestByName(modData, name, mod => candidateNames("mod", mod))

        return item ? { kind: "mod", item } : undefined
    }

    const item = pickBestByName(weaponData, name, weapon => candidateNames("weapon", weapon))

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
    const id = toNumericId(params.id)
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
