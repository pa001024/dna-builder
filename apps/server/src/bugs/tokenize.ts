/**
 * 判重索引的切词与归一化，移植自 `apps/web/src/utils/rag/tokenize.ts`。
 *
 * CJK 用 bigram + unigram，拉丁与数字走词切分；归一化只做无歧义的全角转半角、
 * 零宽字符剥离与小写。服务端不引入分词词典。
 */

const CJK_PATTERN = /[぀-ヿ㐀-䶿一-鿿豈-﫿가-힯]/

const LATIN_PATTERN = /[0-9a-z]/

const ZERO_WIDTH_CODES = new Set([0x200b, 0x200c, 0x200d, 0xfeff])

/**
 * @description 归一化文本：全角转半角、全角空格转普通空格、去零宽字符、统一小写。
 * @param text 原始文本
 * @returns 归一化后的文本
 */
export function normalizeForIndex(text: string): string {
    let out = ""

    for (const char of text) {
        const code = char.codePointAt(0) ?? 0

        if (ZERO_WIDTH_CODES.has(code)) {
            continue
        }

        if (code >= 0xff01 && code <= 0xff5e) {
            out += String.fromCharCode(code - 0xfee0)
            continue
        }

        if (code === 0x3000) {
            out += " "
            continue
        }

        out += char
    }

    return out.toLowerCase()
}

/**
 * @description 把文本切成词并累加到词频表。
 * @param text 原始文本（内部会先归一化）
 * @param tf 输出词频表（调用方可传入已有表以累加多个字段）
 * @returns 传入的词频表
 */
export function tokenizeInto(text: string, tf: Map<string, number>): Map<string, number> {
    const normalized = normalizeForIndex(text)
    const length = normalized.length
    let cursor = 0

    while (cursor < length) {
        const char = normalized[cursor]!

        if (CJK_PATTERN.test(char)) {
            tf.set(char, (tf.get(char) ?? 0) + 1)

            const next = normalized[cursor + 1]
            if (next !== undefined && CJK_PATTERN.test(next)) {
                const bigram = normalized.slice(cursor, cursor + 2)
                tf.set(bigram, (tf.get(bigram) ?? 0) + 1)
            }

            cursor++
            continue
        }

        if (LATIN_PATTERN.test(char)) {
            let end = cursor
            while (end < length && LATIN_PATTERN.test(normalized[end]!)) {
                end++
            }

            const word = normalized.slice(cursor, end)

            if (word.length >= 2 || /^\d+$/.test(word)) {
                tf.set(word, (tf.get(word) ?? 0) + 1)
            }

            cursor = end
            continue
        }

        cursor++
    }

    return tf
}

/**
 * @description 把文本切成词频表。
 * @param text 原始文本
 * @returns 词频表（空文本返回空表）
 */
export function tokenizeText(text: string): Map<string, number> {
    return tokenizeInto(text, new Map())
}

/**
 * @description 切出查询词列表，保留查询中的重复词用于统计命中词数。
 * @param query 查询文本
 * @returns 去重后的查询词数组
 */
export function tokenizeQuery(query: string): string[] {
    return [...tokenizeText(query).keys()]
}
