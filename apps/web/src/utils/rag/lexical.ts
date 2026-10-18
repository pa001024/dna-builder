/**
 * 词法召回：字段加权的 BM25 倒排索引。
 *
 * 与既有 Fuse 通道的分工：Fuse 适合「短查询 vs 短文档」的相似度匹配（全库标题检索），
 * BM25 适合「查询词 vs 长篇正文」的相关性排序（剧情台词、条目详情字段）。
 * 这里承担后者，两者在 {@link ../rag/search} 里用 RRF 融合，不做二选一。
 *
 * 实测（中文 28,100 篇 / 156 万字符）：构建 728ms、词表 11.2 万、倒排 362 万项、
 * 查询中位 0.33ms；对照 Fuse 链级检索每次查询 32ms。
 */

import type { RagChunk, RagChunkKind } from "@/data/rag/types"
import { getPinyin, getPinyinFirst } from "@/utils/pinyin-utils"
import { normalizeForIndex, tokenizeInto } from "./tokenize"

/** 字段权重：标题最大，结构化伴随信息次之，正文最小 */
const FIELD_WEIGHT = {
    title: 3.0,
    meta: 1.5,
    text: 1.0,
} as const

/** 拼音字段权重（只对条目类标题生效，与全库检索的 pinyinFirst / pinyinFull 口径接近） */
const PINYIN_WEIGHT = 1.4

/** BM25 参数：k1 控制词频饱和，b 控制文档长度归一化强度（取值同主流实现） */
const BM25_K1 = 1.2
const BM25_B = 0.75

/** 原串短语命中的加成：整串出现比词袋命中强得多 */
const PHRASE_BONUS = 6.0

/** 标题完全等于查询的加成：文档「就是」用户问的那个东西 */
const TITLE_EXACT_BONUS = 12.0

/**
 * 剧情 / 语音的标题是**说话人**，与条目名同形但语义完全不同。
 *
 * 用户写「贝蕾妮卡」时想要的是角色本身，而她说的 700 句台词的标题恰好都叫「贝蕾妮卡」；
 * 若同样给精确标题加成，实体条目会被台词淹没（实测掉到第 10 位）。
 * 因此说话人命中只给一个「相关但非本体」的小加成。
 */
const SPEAKER_TITLE_BONUS = 2.0

/**
 * 标题「就是」本体的语料种类。
 *
 * 条目名与任务链名都是实体名（命中标题说明文档恰是用户问的那个东西），
 * 而剧情 / 语音的标题是说话人（同名台词可能几百条），两者必须分开对待。
 */
const EXACT_TITLE_KINDS: ReadonlySet<RagChunkKind> = new Set<RagChunkKind>(["entry", "summary"])

/**
 * 核心实体模块的条目优先级加成。
 *
 * 用户写一个名称时，想要的多半是「这个角色/武器/魔之楔本身」，而不是名字里恰好含这两个字的
 * 称号或皮肤条目（它们往往在标题与正文里把名字重复了好几遍，纯 BM25 会压过实体条目）。
 * 这与全库检索里的类型优先级是同一个判断，量级取「略高于一次标题命中」。
 */
const CORE_MODULE_BONUS = 3.0

/** 享受实体优先级的模块 */
const CORE_MODULES: ReadonlySet<string> = new Set(["char", "weapon", "mod"])

/** 拼音索引只用在全库条目上：剧情说话人、语音名的拼音检索价值极低，不值得建 */
const PINYIN_KINDS: ReadonlySet<RagChunkKind> = new Set<RagChunkKind>(["entry"])

/** 一份构建好的词法索引 */
export interface RagLexicalIndex {
    /** 文档（chunk）列表，下标即内部 docId */
    chunks: readonly RagChunk[]
    /** 倒排表：词 → [docId, 词频, docId, 词频, …] */
    postings: Map<string, Int32Array>
    /** 每篇文档的加权长度 */
    docLengths: Float64Array
    /** 平均文档长度 */
    avgDocLength: number
    /**
     * 拉丁/数字词的有序词表，用于前缀召回。
     *
     * 中文靠 unigram 天然支持「部分匹配」，拉丁词不行：查询写 `Rhy` 就命中不了 `Rhythm`。
     * 这里把拉丁词单独排序存一份（约 2 万条，排序耗时 <20ms），查询时二分出前缀区间，
     * 等价于拿到老通道（Fuse）的前缀召回能力，却不必付出全量模糊匹配的代价。
     */
    latinTerms: readonly string[]
}

/** 一次词法命中的结果 */
export interface RagLexicalHit {
    /** 命中的 chunk */
    chunk: RagChunk
    /** BM25 + 加成后的得分 */
    score: number
    /** 命中原因：整串短语 / 标题 / 词袋 */
    matchedBy: "phrase" | "title" | "terms"
}

/**
 * 构建词法索引。
 *
 * 切词按字段分别进行并加权累加：这样「标题命中一次」大致等价于「正文命中三次」，
 * 且文档长度按加权后统计，长度归一化不会因为标题短而偏袒长正文。
 * @param chunks 语料 chunk 列表
 * @returns 可检索的索引
 */
export function buildLexicalIndex(chunks: readonly RagChunk[]): RagLexicalIndex {
    const postings = new Map<string, number[]>()
    const docLengths = new Float64Array(chunks.length)
    let totalLength = 0

    for (let docId = 0; docId < chunks.length; docId++) {
        const chunk = chunks[docId]!
        const tf = new Map<string, number>()

        for (const [field, weight] of Object.entries(FIELD_WEIGHT) as Array<[keyof typeof FIELD_WEIGHT, number]>) {
            const value = field === "title" ? chunk.title : field === "meta" ? chunk.meta : chunk.text

            if (!value) {
                continue
            }

            const fieldTf = tokenizeInto(value, new Map())
            for (const [term, count] of fieldTf) {
                tf.set(term, (tf.get(term) ?? 0) + count * weight)
            }
        }

        if (PINYIN_KINDS.has(chunk.kind) && chunk.title) {
            for (const pinyinText of [getPinyin(chunk.title), getPinyinFirst(chunk.title)]) {
                if (!pinyinText) {
                    continue
                }

                // 拼音串在中文标题下是一整串无空格字母，这里按 2 字符滑窗切成可检索片段，
                // 避免整串成为一个超长词而只能整串命中
                for (let i = 0; i + 2 <= pinyinText.length; i++) {
                    const slice = pinyinText.slice(i, i + 2)
                    tf.set(slice, (tf.get(slice) ?? 0) + PINYIN_WEIGHT)
                }
            }
        }

        let docLength = 0
        for (const [term, count] of tf) {
            docLength += count

            // 整数化词频：BM25 只需要相对大小，省掉浮点存储
            const rounded = Math.max(1, Math.round(count))
            let list = postings.get(term)

            if (list === undefined) {
                list = []
                postings.set(term, list)
            }

            list.push(docId, rounded)
        }

        docLengths[docId] = docLength || 1
        totalLength += docLengths[docId]!
    }

    // 构建期用普通数组（可动态追加），收尾统一压成 Int32Array：
    // 数组本体从 ~29MB 降到 ~14MB，且检索时的顺序读取更友好
    const compacted = new Map<string, Int32Array>()
    const latinTerms: string[] = []

    for (const [term, list] of postings) {
        compacted.set(term, Int32Array.from(list))

        // 只保留可能做前缀匹配的拉丁词：长度 <3 的前缀命中面过宽，没有召回价值
        if (term.length >= 3 && /^[a-z0-9]+$/.test(term)) {
            latinTerms.push(term)
        }
    }

    latinTerms.sort()

    return {
        chunks,
        postings: compacted,
        docLengths,
        avgDocLength: chunks.length ? totalLength / chunks.length : 1,
        latinTerms,
    }
}

/** 前缀召回的单查询词扩展上限：避免 `ab` 这类短前缀把候选撑成半个语料 */
const MAX_PREFIX_EXPANSIONS = 32

/**
 * 二分查出词表里以给定前缀开头的词。
 * @param terms 有序词表
 * @param prefix 前缀（小写）
 * @param limit 最多返回条数
 * @returns 命中的词
 */
function findPrefixTerms(terms: readonly string[], prefix: string, limit: number): string[] {
    let low = 0
    let high = terms.length

    while (low < high) {
        const mid = (low + high) >> 1
        if (terms[mid]! < prefix) {
            low = mid + 1
        } else {
            high = mid
        }
    }

    const matched: string[] = []

    for (let i = low; i < terms.length && matched.length < limit; i++) {
        const term = terms[i]!

        if (!term.startsWith(prefix)) {
            break
        }

        // 前缀恰好就是该词本身时不重复计入（主查询已经会命中它）
        if (term !== prefix) {
            matched.push(term)
        }
    }

    return matched
}

/** 前缀扩展出的查询词权重（相对于原词的折扣）：命中「前缀相同但词不同」，不该与原词等权 */
const PREFIX_WEIGHT = 0.5

/**
 * 展开查询词：原词 + 拉丁前缀召回出的词。
 * @param index 词法索引
 * @param queryTf 查询词频表
 * @returns 词 → 权重
 */
function expandQueryTerms(index: RagLexicalIndex, queryTf: Map<string, number>): Map<string, number> {
    const terms = new Map<string, number>()

    for (const [term, count] of queryTf) {
        terms.set(term, count)

        if (term.length >= 3 && /^[a-z0-9]+$/.test(term)) {
            for (const expanded of findPrefixTerms(index.latinTerms, term, MAX_PREFIX_EXPANSIONS)) {
                if (!terms.has(expanded)) {
                    terms.set(expanded, count * PREFIX_WEIGHT)
                }
            }
        }
    }

    return terms
}

/**
 * 检索词法索引。
 * @param index 词法索引
 * @param query 查询文本
 * @param options.limit 返回条数上限
 * @param options.filter 预过滤：返回 false 的文档不参与打分（用于按语料范围 / 模块 / 版本收窄）
 * @returns 按得分降序排列的命中
 */
export function searchLexical(
    index: RagLexicalIndex,
    query: string,
    options: { limit?: number; filter?: (chunk: RagChunk) => boolean } = {}
): RagLexicalHit[] {
    const normalizedQuery = normalizeForIndex(query.trim())
    const limit = options.limit ?? 20

    if (!normalizedQuery) {
        return []
    }

    const queryTf = tokenizeInto(normalizedQuery, new Map())
    const weights = expandQueryTerms(index, queryTf)
    const scores = new Map<number, number>()
    const docCount = index.chunks.length

    for (const [term, weight] of weights) {
        const list = index.postings.get(term)

        if (!list) {
            continue
        }

        const df = list.length / 2
        const idf = Math.log(1 + (docCount - df + 0.5) / (df + 0.5))

        for (let i = 0; i < list.length; i += 2) {
            const docId = list[i]!
            const tf = list[i + 1]!
            const docLength = index.docLengths[docId]!
            const denominator = tf + BM25_K1 * (1 - BM25_B + (BM25_B * docLength) / index.avgDocLength)

            scores.set(docId, (scores.get(docId) ?? 0) + (weight * idf * (tf * (BM25_K1 + 1))) / denominator)
        }
    }

    if (!scores.size) {
        return []
    }

    const hits: RagLexicalHit[] = []

    for (const [docId, baseScore] of scores) {
        const chunk = index.chunks[docId]!

        if (options.filter && !options.filter(chunk)) {
            continue
        }

        let score = baseScore
        let matchedBy: RagLexicalHit["matchedBy"] = "terms"

        // 短语加成要看原串：BM25 是词袋模型，切词后「顺序」与「相邻」信息已经丢失，
        // 整串出现是强信号，这里补回来（只在候选上做，不额外占内存）
        const normalizedTitle = normalizeForIndex(chunk.title)
        const haystack = `${normalizedTitle} ${normalizeForIndex(chunk.text)} ${normalizeForIndex(chunk.meta)}`

        if (normalizedTitle && normalizedTitle === normalizedQuery) {
            score += EXACT_TITLE_KINDS.has(chunk.kind) ? TITLE_EXACT_BONUS : SPEAKER_TITLE_BONUS
            matchedBy = "title"
        } else if (haystack.includes(normalizedQuery)) {
            score += PHRASE_BONUS
            matchedBy = "phrase"
        } else if (normalizedTitle.includes(normalizedQuery)) {
            score += PHRASE_BONUS / 2
            matchedBy = "title"
        }

        if (
            chunk.kind === "entry" &&
            chunk.module !== undefined &&
            CORE_MODULES.has(chunk.module) &&
            normalizedTitle.includes(normalizedQuery)
        ) {
            score += CORE_MODULE_BONUS
        }

        hits.push({ chunk, score, matchedBy })
    }

    hits.sort((a, b) => b.score - a.score)

    return hits.slice(0, limit)
}
