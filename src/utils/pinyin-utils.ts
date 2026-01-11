/**
 * 拼音搜索工具模块
 * 提供中文拼音搜索功能，支持全拼和首字母匹配
 */

import { pinyin } from "pinyin-pro"

/**
 * 拼音匹配结果
 */
export interface PinyinMatchResult {
    /**
     * 是否匹配
     */
    match: boolean
    /**
     * 匹配类型：full（全拼）或 first（首字母）或 direct（直接匹配）
     */
    type: "full" | "first" | "direct"
    /**
     * 高亮信息
     */
    highlights?: {
        /**
         * 匹配到的中文字符索引范围
         */
        charRanges: [number, number][]
    }
}

/**
 * 获取字符串的完整拼音
 * @param text 输入文本
 * @returns 拼音字符串（不带声调）
 */
export function getPinyin(text: string): string {
    return pinyin(text, { toneType: "none", type: "array" }).join("")
}

/**
 * 获取字符串的首字母
 * @param text 输入文本
 * @returns 首字母字符串
 */
export function getPinyinFirst(text: string): string {
    return pinyin(text, { pattern: "first", toneType: "none", type: "array" }).join("")
}

/**
 * 检查文本是否匹配拼音查询
 * @param text 待匹配的中文文本
 * @param query 拼音查询（可以是全拼、首字母或部分拼音）
 * @returns 匹配结果
 */
export function matchPinyin(text: string, query: string): PinyinMatchResult {
    if (!text || !query) {
        return { match: false, type: "first" }
    }

    const queryLower = query.toLowerCase()

    // 1. 直接匹配（包含中文字符）
    if (text.includes(query)) {
        return { match: true, type: "direct" }
    }

    // 2. 首字母匹配（优先于全拼，因为首字母通常更精确）
    const firstPinyin = getPinyinFirst(text).toLowerCase()
    if (firstPinyin.includes(queryLower)) {
        return { match: true, type: "first" }
    }

    // 3. 全拼匹配
    const fullPinyin = getPinyin(text).toLowerCase()
    if (fullPinyin.includes(queryLower)) {
        return { match: true, type: "full" }
    }

    return { match: false, type: "first" }
}

/**
 * 对数组进行拼音过滤
 * @param items 待过滤的数组
 * @param query 查询字符串
 * @param getTextFn 获取每个项的文本的函数
 * @returns 过滤后的数组
 */
export function filterByPinyin<T>(items: T[], query: string, getTextFn: (item: T) => string): T[] {
    if (!query) {
        return items
    }

    return items.filter(item => {
        const text = getTextFn(item)
        const result = matchPinyin(text, query)
        return result.match
    })
}

/**
 * 对数组进行拼音搜索并返回匹配信息
 * @param items 待搜索的数组
 * @param query 查询字符串
 * @param getTextFn 获取每个项的文本的函数
 * @returns 包含项和匹配信息的数组
 */
export function searchByPinyin<T>(items: T[], query: string, getTextFn: (item: T) => string): { item: T; match: PinyinMatchResult }[] {
    if (!query) {
        return items.map(item => ({
            item,
            match: { match: true, type: "direct" },
        }))
    }

    const results: { item: T; match: PinyinMatchResult }[] = []

    for (const item of items) {
        const text = getTextFn(item)
        const matchResult = matchPinyin(text, query)

        if (matchResult.match) {
            results.push({ item, match: matchResult })
        }
    }

    return results
}

/**
 * 判断是否为拼音输入（只包含字母）
 * @param text 输入文本
 * @returns 是否为拼音
 */
export function isPinyinInput(text: string): boolean {
    return /^[a-zA-Z]+$/.test(text)
}
