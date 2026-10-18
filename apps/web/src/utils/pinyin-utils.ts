/**
 * 拼音搜索工具模块
 * 提供中文拼音搜索功能，支持全拼和首字母匹配（含多音字各读音）
 */

import { pinyin, polyphonic } from "pinyin-pro"

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
 * 补充读音表：pinyin-pro 默认读音与游戏内实际读音不一致的单字。
 * key 为单字，value 为额外读音（不带声调、小写），会与 polyphonic 给出的读音取并集。
 * 例如「茜」默认只给 qian，但「法露茜」读 xi，不补的话 flx 永远搜不到。
 */
const EXTRA_READINGS: Record<string, string[]> = {
    茜: ["xi"],
}

/** 是否为 CJK 汉字（含扩展区），只有汉字才走拼音展开 */
function isHanChar(ch: string): boolean {
    return /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/.test(ch)
}

/** 是否为 ASCII 字母或数字，原样参与拼音匹配 */
function isAsciiWordChar(ch: string): boolean {
    return /[a-zA-Z0-9]/.test(ch)
}

interface PinyinVariants {
    /** 每个有效字符的全部读音（小写、无调）；非汉字为单个原样小写字符 */
    fulls: string[][]
    /** 每个有效字符的全部声母首字母 */
    firsts: string[][]
}

/** 文本 → 多音字读音展开的缓存，避免搜索时每敲一个字母就全量重算 polyphonic */
const variantsCache = new Map<string, PinyinVariants>()
const VARIANTS_CACHE_LIMIT = 5000

/**
 * 取文本的多音字读音展开（每个汉字给出全部可能读音）。
 * 符号、空格、颜文字等直接跳过，使「A·B」也能被「ab」命中。
 * @param text 待匹配文本
 * @returns 每个有效字符的读音列表与首字母列表
 */
function getVariants(text: string): PinyinVariants {
    const cached = variantsCache.get(text)
    if (cached) {
        return cached
    }

    let result: PinyinVariants
    try {
        const chars = Array.from(text)
        const raws = polyphonic(text, { toneType: "none" }) as unknown as string[]
        // polyphonic 按码点返回，与 Array.from 等长；不等则回退到单读音逻辑
        if (!Array.isArray(raws) || raws.length !== chars.length) {
            throw new Error("polyphonic length mismatch")
        }
        const fulls: string[][] = []
        const firsts: string[][] = []
        for (let i = 0; i < chars.length; i++) {
            const ch = chars[i]
            if (isHanChar(ch)) {
                const opts = raws[i]
                    .split(" ")
                    .map(s => s.trim().toLowerCase())
                    .filter(s => s.length > 0)
                const extra = EXTRA_READINGS[ch]
                if (extra) {
                    for (const e of extra) {
                        const v = e.toLowerCase()
                        if (!opts.includes(v)) {
                            opts.push(v)
                        }
                    }
                }
                if (opts.length === 0) {
                    continue
                }
                fulls.push(opts)
                firsts.push([...new Set(opts.map(o => o[0]))])
            } else if (isAsciiWordChar(ch)) {
                const lower = ch.toLowerCase()
                fulls.push([lower])
                firsts.push([lower])
            } else {
            }
        }
        result = { fulls, firsts }
    } catch {
        // 兜底：polyphonic 失败时用单读音展开，保证不抛错
        const fullSingle = getPinyin(text)
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "")
        const firstSingle = getPinyinFirst(text)
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "")
        result = {
            fulls: fullSingle ? [[fullSingle]] : [],
            firsts: firstSingle ? firstSingle.split("").map(c => [c]) : [],
        }
    }

    if (variantsCache.size >= VARIANTS_CACHE_LIMIT) {
        const oldest = variantsCache.keys().next().value
        if (oldest !== undefined) {
            variantsCache.delete(oldest)
        }
    }
    variantsCache.set(text, result)
    return result
}

/**
 * 首字母匹配：查询串的每个字母依次对应连续文本字符的某个首字母。
 * @param firsts 每个字符的候选首字母
 * @param queryNorm 已归一化的小写字母数字查询串
 * @returns 是否命中
 */
function matchFirstVariants(firsts: string[][], queryNorm: string): boolean {
    const n = firsts.length
    const m = queryNorm.length
    if (m === 0 || m > n) {
        return false
    }
    for (let start = 0; start <= n - m; start++) {
        let ok = true
        for (let k = 0; k < m; k++) {
            if (!firsts[start + k].includes(queryNorm[k])) {
                ok = false
                break
            }
        }
        if (ok) {
            return true
        }
    }
    return false
}

/**
 * 全拼匹配：查询串是某段连续字符的读音拼接的任意子串，起止可在读音内部。
 * 用 DFS 处理多音字在字符边界处的分支（如「露」lu/lou、「茜」qian/xi）。
 * @param fulls 每个字符的候选读音
 * @param queryNorm 已归一化的小写字母数字查询串
 * @returns 是否命中
 */
function matchFullVariants(fulls: string[][], queryNorm: string): boolean {
    const n = fulls.length
    const m = queryNorm.length
    if (m === 0 || n === 0) {
        return false
    }

    /**
     * 从指定位置尝试消费完剩余查询串。
     * @param ci 文本字符下标
     * @param variant 当前字符选用的读音
     * @param oi 读音内部偏移
     * @param qi 查询串下标
     * @returns 是否能消费完
     */
    const consume = (ci: number, variant: string, oi: number, qi: number): boolean => {
        let c = ci
        let v = variant
        let o = oi
        let q = qi
        for (;;) {
            while (o < v.length && q < m && v[o] === queryNorm[q]) {
                o++
                q++
            }
            if (q >= m) {
                return true
            }
            if (o < v.length) {
                return false
            }
            c++
            if (c >= n) {
                return false
            }
            // 进入下一字符时分支尝试其全部读音；用循环+递归混合避免重复建栈
            const nexts = fulls[c]
            for (let k = 1; k < nexts.length; k++) {
                if (consume(c, nexts[k], 0, q)) {
                    return true
                }
            }
            v = nexts[0]
            o = 0
        }
    }

    for (let i = 0; i < n; i++) {
        for (const variant of fulls[i]) {
            for (let o = 0; o < variant.length; o++) {
                if (variant[o] === queryNorm[0] && consume(i, variant, o, 0)) {
                    return true
                }
            }
        }
    }
    return false
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

    // 1. 直接匹配（原文包含查询串，英文大小写不敏感）
    if (text.includes(query) || text.toLowerCase().includes(queryLower)) {
        return { match: true, type: "direct" }
    }

    // 拼音匹配只看字母数字，空格/符号不影响（如「fa lu」等同「falu」）
    const queryNorm = queryLower.replace(/[^a-z0-9]/g, "")
    if (!queryNorm) {
        return { match: false, type: "first" }
    }

    const { fulls, firsts } = getVariants(text)

    // 2. 首字母匹配（优先于全拼，因为首字母通常更精确）
    if (matchFirstVariants(firsts, queryNorm)) {
        return { match: true, type: "first" }
    }

    // 3. 全拼匹配（含多音字各读音）
    if (matchFullVariants(fulls, queryNorm)) {
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
