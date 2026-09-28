/**
 * 资料库条目名称匹配。
 *
 * AI 卡片（`db-card-utils`）与 AI 地图跳转（`db-map-utils`）都要把模型给的名称
 * 对上真实条目，匹配口径必须完全一致：**精确 > 包含 > 拼音**，同强度取名称更短的条目
 * （「炽灼」优于「炽灼残响」）。
 *
 * 名称可能是译文，所以一律先用 `expandDBAgentKeyword` 反查回游戏原文再比，
 * 否则非中文界面下模型给的名字一律落空。
 */

import { expandDBAgentKeyword, resolveCurrentDBAgentLang } from "@/utils/db-locale"
import { matchPinyin } from "@/utils/pinyin-utils"

/** 名称匹配强度：数值越小越优先 */
export const MATCH_EXACT = 0
export const MATCH_CONTAINS = 1
export const MATCH_PINYIN = 2

/**
 * 归一化名称：去掉空白与常见分隔符并统一小写，用于宽松比对。
 * 「不死鸟·炽灼」「不死鸟之炽灼」这类写法差异都会被抹平。
 * @param text 原始名称
 * @returns 归一化后的名称
 */
export function normalizeDBEntryName(text: string): string {
    return text.toLowerCase().replace(/[\s·・:：,，.。\-_/\\()（）[\]「」『』"“”'‘’]/g, "")
}

/**
 * 计算候选名与查询词的匹配强度。
 * @param candidate 候选名（资料库原文）
 * @param query 模型给的名称
 * @returns 强度值；不匹配时返回 undefined
 */
export function matchDBEntryStrength(candidate: string, query: string): number | undefined {
    const left = normalizeDBEntryName(candidate)
    const right = normalizeDBEntryName(query)

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
 * 在候选条目里挑匹配最强的一个，同强度取名称更短的条目。
 * @param items 条目数组
 * @param name 模型给的名称（可为译文）
 * @param namesOf 取某个条目的候选名（资料库里这条数据可能被写成的各种叫法）
 * @returns 命中的条目；没有匹配时返回 undefined
 */
export function pickDBEntryByName<T>(items: readonly T[], name: string, namesOf: (item: T) => string[]): T | undefined {
    const queries = expandDBAgentKeyword(name, resolveCurrentDBAgentLang())

    if (!queries.length) {
        return undefined
    }

    let best: { item: T; score: number; length: number } | undefined

    for (const item of items) {
        for (const candidate of namesOf(item)) {
            for (const query of queries) {
                const score = matchDBEntryStrength(candidate, query)

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
 * 归一化条目 id 参数：只接受可转成有限数值的写法。
 * @param raw 模型给的 id
 * @returns 数值 id；无法识别时返回 undefined
 */
export function toNumericEntryId(raw: unknown): number | undefined {
    if (raw === undefined || raw === null || `${raw}`.trim() === "") {
        return undefined
    }

    const value = Number(raw)

    return Number.isFinite(value) ? value : undefined
}
