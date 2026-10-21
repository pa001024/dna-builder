/**
 * 关键词高亮：把文本按关键词命中位置切成「普通片段 / 高亮片段」，供列表与卡片内联高亮复用。
 */

/** 高亮片段：按关键词命中位置切分后的文本块 */
export interface HighlightSegment {
    text: string
    highlighted: boolean
}

/** 命中摘要：截取首个命中附近的上下文 */
export interface HighlightSnippet {
    prefixEllipsis: boolean
    suffixEllipsis: boolean
    segments: HighlightSegment[]
}

/** 摘要向前/向后保留的上下文字符数 */
const SNIPPET_CONTEXT = 16
/** 摘要最大长度 */
const SNIPPET_MAX_LENGTH = 72

/**
 * 找出关键词在文本中的全部命中区间（大小写不敏感）。
 * @param text 待检索文本
 * @param keyword 关键词
 * @returns 闭区间命中范围
 */
export function findKeywordRanges(text: string, keyword: string): [number, number][] {
    if (!keyword) {
        return []
    }

    const lowerText = text.toLowerCase()
    const lowerKeyword = keyword.toLowerCase()
    const ranges: [number, number][] = []
    let startIndex = 0
    while (startIndex < lowerText.length) {
        const hitIndex = lowerText.indexOf(lowerKeyword, startIndex)
        if (hitIndex === -1) {
            break
        }
        ranges.push([hitIndex, hitIndex + lowerKeyword.length - 1])
        startIndex = hitIndex + lowerKeyword.length
    }
    return ranges
}

/**
 * 把文本按命中区间切成高亮片段。
 * @param text 待切分文本
 * @param keyword 关键词
 * @returns 片段列表；未命中时为单段普通文本
 */
export function buildHighlightSegments(text: string, keyword: string): HighlightSegment[] {
    const ranges = findKeywordRanges(text, keyword)
    if (!ranges.length) {
        return text ? [{ text, highlighted: false }] : []
    }

    const segments: HighlightSegment[] = []
    let cursor = 0
    for (const [start, end] of ranges) {
        if (start > cursor) {
            segments.push({ text: text.slice(cursor, start), highlighted: false })
        }
        segments.push({ text: text.slice(start, end + 1), highlighted: true })
        cursor = end + 1
    }
    if (cursor < text.length) {
        segments.push({ text: text.slice(cursor), highlighted: false })
    }
    return segments
}

/**
 * 生成命中摘要：只保留首个命中附近的上下文。
 * @param text 命中文本
 * @param keyword 关键词
 * @returns 命中摘要；文本未命中时返回 null
 */
export function buildKeywordSnippet(text: string, keyword: string): HighlightSnippet | null {
    const ranges = findKeywordRanges(text, keyword)
    if (!ranges.length) {
        return null
    }

    const [firstStart, firstEnd] = ranges[0]
    const snippetStart = Math.max(0, firstStart - SNIPPET_CONTEXT)
    let snippetEnd = Math.min(text.length, firstEnd + 1 + SNIPPET_CONTEXT)
    if (snippetEnd - snippetStart > SNIPPET_MAX_LENGTH) {
        snippetEnd = snippetStart + SNIPPET_MAX_LENGTH
    }

    const segments = buildHighlightSegments(text.slice(snippetStart, snippetEnd), keyword).filter(segment => segment.text !== "")
    if (!segments.length) {
        return null
    }

    return {
        prefixEllipsis: snippetStart > 0,
        suffixEllipsis: snippetEnd < text.length,
        segments,
    }
}

/**
 * 无法高亮字符时（如拼音命中）的纯文本摘要。
 * @param text 命中文本
 * @returns 截断后的摘要
 */
export function buildPlainSnippet(text: string): HighlightSnippet {
    const snippetText = text.slice(0, SNIPPET_MAX_LENGTH)
    return {
        prefixEllipsis: false,
        suffixEllipsis: snippetText.length < text.length,
        segments: [{ text: snippetText, highlighted: false }],
    }
}
