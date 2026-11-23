import {
    affixes,
    type DnaSeasonAffix,
    type DnaSeasonAffixAttr,
    resolveAffixValue,
    slots,
    type TranscendGearAffixRoll,
    type TranscendGearItemConfig,
    uniqueEquips,
} from "@/data"
import { quantizeAffixDisplayValue, quantizeAffixRangeValues } from "@/utils/transcendence-gear"
import { getBaseNameOptions, getCurrentSeasonId, getGearRarity, getGearRarityAffixCount, getNamePrefix } from "./catalog"
import {
    buildGearItem,
    getAffixRollRange,
    getBaseAffix,
    getGearRandomAffixPool,
    getGemAffixIds,
    getUniqueAffixIds,
    isAffixAllowedForChar,
} from "./generation"

/**
 * 升华装备单件详情截图 → `TranscendGearItemConfig` 草稿。
 * OCR 行按 y 分组后做「名称模糊分 + 数值/区间分」双重打分；太古只在无区间且数值命中太古终值时推断，
 * 品质按随机词条条数反推。单件详情卡看不到孔位 / 精锻 / 淬炼 / 附魔，一律 0，由编辑器二次确认。
 */

/** 一行 OCR 结果（与 Tauri ocr_recognize_lines 的 DTO 对齐） */
export interface GearOcrLine {
    text: string
    x: number
    y: number
    width: number
    height: number
    detScore?: number
    recScore?: number
}

export type GearOcrWarningCode =
    | "slot_missing"
    | "strength_missing"
    | "name_missing"
    | "base_affix_missing"
    | "unique_affix_missing"
    | "affix_unmatched"
    | "affix_duplicate"
    | "affix_out_of_pool"
    | "affix_value_uncertain"
    | "ancient_inferred"
    | "rarity_inferred"
    | "text_unparsed"

export interface GearOcrWarning {
    code: GearOcrWarningCode
    /** 原始行 / 细节，供 UI 折叠展示；不得作为界面主文案 */
    detail?: string
}

export interface GearOcrParsedAffix {
    affixId: number
    source: "base" | "random" | "unique"
    rollLevel: number
    ancient: boolean
    /** 解析出的显示值：百分比按数值本身（76 表示 76%），固定值按原值 */
    displayValue: number
    /** 与模型最优档位的误差（百分比点 / 原值单位） */
    error: number
    /** 0..1，名称分与数值分综合 */
    confidence: number
    text: string
}

export interface GearOcrParseResult {
    item: TranscendGearItemConfig | null
    slotType: number | null
    strength: number | null
    rarityId: number | null
    iconId: number | null
    uniqueId: number | null
    affixes: GearOcrParsedAffix[]
    warnings: GearOcrWarning[]
    unmatchedLines: string[]
    /** 本图总卡数（单卡解析恒为 1；多卡结果由 parseGearOcrCards 写入） */
    cardCount: number
    /** 本结果对应的卡下标（0 起，从左到右） */
    cardIndex: number
}

export interface GearOcrParseOptions {
    /** 角色 id：过滤角色专属随机词缀（0 / 缺省不过滤） */
    charId?: number
    /** 游戏原文翻译（UI 传 `gt`，测试可省略；解析同时收录原文与译文别名） */
    translate?: (text: string) => string
}

/** 一行归并后的 OCR 文本 */
interface OcrRow {
    text: string
    raw: string
    x: number
    y: number
    height: number
}

/** 从行内抽出的词条候选 */
interface OcrAffixText {
    name: string
    value: number
    range?: { lower: number; upper: number }
    /** 行首 `*` = 游戏红刺星（太古）的 OCR 痕迹；缺失时不排除太古 */
    starred: boolean
    text: string
}

/** 按 x 切出的装备卡列 */
interface OcrColumn {
    start: number
    end: number
    lines: GearOcrLine[]
}

/** 词条候选的打分结果 */
interface AffixCandidateScore {
    affix: DnaSeasonAffix
    source: "base" | "random" | "unique"
    /** 是否在槽位随机词缀池内（池外只作同分惩罚，不排除） */
    inPool: boolean
    nameScore: number
    valueScore: number
    combined: number
    ancient: boolean
    rollLevel: number
    error: number
}

interface NameMatch {
    kind: "base" | "unique"
    slot: number
    baseNameId?: number
    uniqueId?: number
    score: number
}

/** 预计算好的名称别名（基础名 / 暗金名） */
interface NameAliasOption extends NameMatch {
    alias: string
}

const UNIQUE_RARITY_ID = 10
const NAME_MIN_SCORE = 0.5
const NAME_WEIGHT = 0.6
const VALUE_WEIGHT = 0.4
const MIN_COMBINED_SCORE = 0.5
const MIN_SCORE_MARGIN = 0.03
/** 太古只有单个显示值，允许跨小版本数据漂移 */
const ANCIENT_PERCENT_TOLERANCE = 0.6
const ANCIENT_FIXED_TOLERANCE = 0.02
/** 拟合误差超过显示精度的一半即告警（百分比 1 位小数 / 固定值 2 位小数） */
const UNCERTAIN_PERCENT_EPS = 0.06
const UNCERTAIN_FIXED_EPS = 0.01
/** 基础词条在详情卡里按整数显示（262 表示 262%）；仅限整数显示的百分比基础行 */
const BASE_UNCERTAIN_EPS = 0.6
/** 池外词条只作同分惩罚，不得压过明显更优的名称 / 数值 */
const OUT_OF_POOL_PENALTY = 0.02

const NUMBER_TOKEN = "[0-9OolI][0-9OolI.,]*"
const AFFIX_PATTERN = new RegExp(
    `^(.+?)\\s*([+-])\\s*(${NUMBER_TOKEN})\\s*%?\\s*(?:[\\[(]\\s*(${NUMBER_TOKEN})\\s*[-~]\\s*(${NUMBER_TOKEN})\\s*[\\])]\\s*%?)?\\s*$`
)
const RANGE_PATTERN = new RegExp(`^[\\[(]?\\s*(${NUMBER_TOKEN})\\s*[-~]\\s*(${NUMBER_TOKEN})\\s*[\\])]?\\s*%?$`)
const STRENGTH_PATTERN = /强度\s*[:：]?\s*([0-9OolI]{1,3})/
const SLOT_PATTERN = /^升华装备\s*[·•・.-]?\s*(.+)$/
const ANCIENT_MARK_PATTERN = /^[*＊✻✽✳✦★]/
const SYMBOL_PATTERN = /[^\p{L}\p{N}]+/gu
const LEADING_SYMBOL_PATTERN = /^[^\p{L}\p{N}]+/u

/**
 * 文本归一化：全角转半角、折叠空白、统一运算符；数字上下文的 O/o→0、l/I→1 交给 `parseNumberToken`。
 * @param input 原始文本
 * @returns 归一化文本
 */
function normalizeText(input: string): string {
    return input
        .normalize("NFKC")
        .replace(/(?:\u200B|\u200C|\u200D|\u200E|\u200F|\uFEFF)/g, "")
        .replace(/\s+/g, " ")
        .replace(/[－–—−]/g, "-")
        .replace(/[～〜]/g, "~")
        .trim()
}

/**
 * 解析数字 token（OCR 常见混淆 O/o→0、l/I→1、逗号作小数点）。
 * @param token 数字文本
 * @returns 数值；无法解析时 NaN
 */
function parseNumberToken(token: string): number {
    const cleaned = token.replace(/[Oo]/g, "0").replace(/[lI]/g, "1").replace(/,/g, ".")
    const value = Number.parseFloat(cleaned)
    return Number.isFinite(value) ? value : Number.NaN
}

/**
 * 名称比较键：去掉空白与标点，只保留字母 / 数字 / 汉字。
 * @param text 名称文本
 * @returns 比较键
 */
function nameKey(text: string): string {
    return text.normalize("NFKC").toLowerCase().replace(SYMBOL_PATTERN, "")
}

/**
 * 最长公共子序列长度（名称模糊匹配）。
 * @param left 左串
 * @param right 右串
 * @returns LCS 长度
 */
function lcsLength(left: string, right: string): number {
    if (!left.length || !right.length) return 0
    let previous = new Array<number>(right.length + 1).fill(0)
    for (let row = 1; row <= left.length; row++) {
        const current = new Array<number>(right.length + 1).fill(0)
        for (let column = 1; column <= right.length; column++) {
            current[column] =
                left[row - 1] === right[column - 1] ? previous[column - 1] + 1 : Math.max(previous[column], current[column - 1])
        }
        previous = current
    }
    return previous[right.length]
}

/**
 * 名称相似度（`left` 为 OCR 文本）：精确 1，包含关系按长度加权，否则 `2*LCS/(lenA+lenB)`。
 * 中文属性名的中心词在末尾（暴击率 / 暴击伤害 / 攻击力），末两字额外加权，避免「暴伤」与「暴击」同分。
 * @param left OCR 名称
 * @param right 候选别名
 * @returns 0..1
 */
function nameSimilarity(left: string, right: string): number {
    if (!left || !right) return 0
    if (left === right) return 1
    const lcs = lcsLength(left, right)
    let base = (2 * lcs) / (left.length + right.length)
    if (left.includes(right) || right.includes(left)) {
        const shorter = Math.min(left.length, right.length)
        const longer = Math.max(left.length, right.length)
        base = Math.max(base, 0.6 + 0.4 * (shorter / longer))
    }
    const suffixLength = Math.min(2, left.length)
    const suffixScore = suffixLength ? lcsLength(left.slice(-suffixLength), right) / suffixLength : 0
    return Math.min(1, base * 0.8 + suffixScore * 0.2)
}

/**
 * 行分组：按 y 排序，y 差小于中位行高 60% 视为同一行，组内按 x 拼接。
 * @param lines OCR 行
 * @returns 归并后的行
 */
function groupLines(lines: readonly GearOcrLine[]): OcrRow[] {
    const prepared = lines
        .map(line => ({
            text: normalizeText(String(line.text ?? "")),
            raw: String(line.text ?? "").trim(),
            x: Number(line.x) || 0,
            y: Number(line.y) || 0,
            height: Math.max(0, Number(line.height) || 0),
        }))
        .filter(line => line.text.length > 0)
        .sort((left, right) => left.y - right.y || left.x - right.x)
    if (!prepared.length) return []
    const heights = prepared
        .map(line => line.height)
        .filter(height => height > 0)
        .sort((left, right) => left - right)
    const medianHeight = heights.length ? heights[Math.floor(heights.length / 2)] : 0
    const threshold = Math.max(1, medianHeight * 0.6)
    const groups: OcrRow[] = []
    for (const line of prepared) {
        const current = groups[groups.length - 1]
        if (current && Math.abs(line.y - current.y) <= threshold) {
            const pieces = current.text ? current.text.split(" ") : []
            pieces.push(line.text)
            current.text = pieces.join(" ")
            current.raw = `${current.raw} ${line.raw}`.trim()
            current.x = Math.min(current.x, line.x)
            current.height = Math.max(current.height, line.height)
        } else {
            groups.push({ text: line.text, raw: line.raw, x: line.x, y: line.y, height: line.height })
        }
    }
    return groups
}

/**
 * 按 x 投影切列：同行多张装备卡时，卡片之间的水平空隙远大于卡内行距。
 * 相邻区间空隙不超过中位行高的 1.5 倍视为同一列；少于 3 行的孤立列并入最近的列（价格 / 状态等装饰行）。
 * @param lines OCR 行
 * @returns 按最左起点排序的列
 */
function splitColumns(lines: readonly GearOcrLine[]): OcrColumn[] {
    const entries = lines
        .map(line => {
            const text = String(line.text ?? "").trim()
            const height = Math.max(0, Number(line.height) || 0)
            const start = Number(line.x) || 0
            const width = Number(line.width) > 0 ? Number(line.width) : Math.max(1, [...text].length) * Math.max(8, height * 0.5)
            return { line, start, end: start + width }
        })
        .filter(entry => entry.line.text?.trim())
        .sort((left, right) => left.start - right.start)
    if (!entries.length) return []
    const heights = entries
        .map(entry => Number(entry.line.height) || 0)
        .filter(height => height > 0)
        .sort((left, right) => left - right)
    const medianHeight = heights.length ? heights[Math.floor(heights.length / 2)] : 0
    const gap = Math.max(12, medianHeight * 1.5)
    let columns: OcrColumn[] = []
    for (const entry of entries) {
        const current = columns[columns.length - 1]
        if (current && entry.start <= current.end + gap) {
            current.lines.push(entry.line)
            current.end = Math.max(current.end, entry.end)
        } else {
            columns.push({ start: entry.start, end: entry.end, lines: [entry.line] })
        }
    }
    while (columns.length > 1) {
        const index = columns.findIndex(column => column.lines.length < 3)
        if (index < 0) break
        const orphan = columns[index]
        let target = 0
        let bestDistance = Number.POSITIVE_INFINITY
        for (const [candidateIndex, candidate] of columns.entries()) {
            if (candidateIndex === index) continue
            const distance =
                orphan.start > candidate.end
                    ? orphan.start - candidate.end
                    : candidate.start > orphan.end
                      ? candidate.start - orphan.end
                      : 0
            if (distance < bestDistance) {
                bestDistance = distance
                target = candidateIndex
            }
        }
        const host = columns[target]
        host.lines.push(...orphan.lines)
        host.start = Math.min(host.start, orphan.start)
        host.end = Math.max(host.end, orphan.end)
        columns = columns.filter((_, candidateIndex) => candidateIndex !== index)
    }
    return columns.sort((left, right) => left.start - right.start)
}

/**
 * 读取词条主属性。
 * @param affix 词缀
 * @returns 主属性；无属性块时 undefined
 */
function getPrimaryAttr(affix: DnaSeasonAffix): DnaSeasonAffixAttr | undefined {
    return affix.addAttrs?.[0]
}

/**
 * 词条是否按百分比展示。
 * @param affix 词缀
 * @returns 百分比为 true
 */
function isPercentAffix(affix: DnaSeasonAffix): boolean {
    const attr = getPrimaryAttr(affix)
    return Boolean(attr && (attr.addType === "Rate" || attr.isPercent))
}

/**
 * 词条在警告 detail 里的池标签：属性名 / 池名（都是数据侧原文，不是 UI 文案）。
 * @param affix 词缀
 * @returns 池标签
 */
function getAffixPoolLabel(affix: DnaSeasonAffix): string {
    const name = affix.addAttrs?.[0]?.attr ?? affix.poolName ?? `${affix.id}`
    return `${name} / ${affix.poolName ?? affix.pool ?? ""}`
}

/**
 * 词条在指定档位 / 太古下的显示值（上游 `FormatAffixAttrUnsignedValue`）：
 * 百分比 0.5 步进（`fine` 时 0.05，对应上游 `NeedsFineAffixPrecision`），固定值保留 2 位。
 * @param affix 词缀
 * @param rollLevel 档位
 * @param ancient 是否太古（太古无区间，恒 coarse）
 * @param fine 是否启用 0.05 细精度
 * @returns 显示值
 */
function getDisplayValue(affix: DnaSeasonAffix, rollLevel: number, ancient: boolean, fine = false): number {
    const result = resolveAffixValue(affix, {
        affixId: affix.id,
        slotId: 0,
        rollLevel,
        masterworkLevel: 0,
        ancient,
        finalMasterwork: false,
    })
    const attr = getPrimaryAttr(affix)
    if (!attr) return Math.round(result.final)

    return quantizeAffixDisplayValue(attr, result.final, { fine })
}

/**
 * 该词条在当前强度下的区间两端是否需要 0.05 细精度（上游 `NeedsFineAffixPrecision`）：
 * 仅百分比且两端 coarse 文本相同；命中时当前值同样按细精度显示（`FormatAffixAddAttrs`）。
 * @param affix 词缀
 * @param strength 强度
 * @returns 需要细精度为 true
 */
function needsFineDisplay(affix: DnaSeasonAffix, strength: number): boolean {
    const attr = getPrimaryAttr(affix)
    if (!attr) return false
    const range = getAffixRollRange(affix, strength)
    const entry = { affixId: affix.id, slotId: 0, masterworkLevel: 0, ancient: false, finalMasterwork: false }
    const lower = resolveAffixValue(affix, { ...entry, rollLevel: range.min }).final
    const upper = resolveAffixValue(affix, { ...entry, rollLevel: range.max }).final

    return quantizeAffixRangeValues(attr, lower, upper).fine
}

/**
 * 词条名称别名：属性名 / 描述原文及各自译文。
 * @param affix 词缀
 * @param translate 译文函数
 * @returns 别名列表
 */
function getAffixAliases(affix: DnaSeasonAffix, translate: (text: string) => string): string[] {
    const parts = new Set<string>()
    for (const attr of affix.addAttrs ?? []) parts.add(attr.attr)
    if (!parts.size && affix.desc) parts.add(affix.desc)
    const aliases: string[] = []
    for (const part of parts) {
        aliases.push(part)
        const translated = translate(part)
        if (translated && translated !== part) aliases.push(translated)
    }
    return aliases
}

/**
 * 构造普通装备名称别名（基础名 / 前缀+基础名及译文）。
 * @param name 基础名
 * @param slot 槽型
 * @param translate 译文函数
 * @returns 别名列表
 */
function getBaseNameAliases(name: string, slot: number, translate: (text: string) => string): string[] {
    const aliases = new Set<string>([name])
    const translatedName = translate(name)
    if (translatedName) aliases.add(translatedName)
    const prefix = getNamePrefix(slot)
    if (prefix) {
        aliases.add(`${prefix.name}${name}`)
        const translatedPrefix = translate(prefix.name)
        if (translatedPrefix) aliases.add(`${translatedPrefix}${translatedName || name}`)
    }
    return [...aliases]
}

/**
 * 预计算装备名称别名（基础名 / 暗金名 + 译文）。
 * @param translate 译文函数
 * @returns 名称别名选项
 */
function buildNameOptions(translate: (text: string) => string): NameAliasOption[] {
    const options: NameAliasOption[] = []
    for (const slot of slots) {
        for (const baseName of getBaseNameOptions(slot.id)) {
            for (const alias of getBaseNameAliases(baseName.name, slot.id, translate)) {
                options.push({ kind: "base", slot: slot.id, baseNameId: baseName.id, score: 0, alias: nameKey(alias) })
            }
        }
    }
    for (const unique of uniqueEquips) {
        for (const alias of new Set([unique.name, translate(unique.name)])) {
            options.push({ kind: "unique", slot: unique.slot, uniqueId: unique.id, score: 0, alias: nameKey(alias) })
        }
    }
    return options
}

/**
 * 从名称行匹配基础名 / 暗金名（名称行 = 得分最高且字号较大的行）。
 * @param rows 归并行
 * @param options 名称别名选项
 * @returns 最佳名称匹配与行下标；未命中时 null
 */
function matchGearName(rows: readonly OcrRow[], options: readonly NameAliasOption[]): { match: NameMatch; rowIndex: number } | null {
    // 名称 = 大字号行：先按行高过滤（≥ 最大行高 80%），再打分，避免小字号装饰行抢名称
    const maxHeight = rows.reduce((max, row) => Math.max(max, row.height), 0)
    const minHeight = maxHeight > 0 ? maxHeight * 0.8 : 0
    let best: { match: NameMatch; rowIndex: number; height: number } | null = null
    for (const [rowIndex, row] of rows.entries()) {
        if (minHeight > 0 && row.height < minHeight) continue
        const key = nameKey(row.text)
        if (!key) continue
        if (SLOT_PATTERN.test(row.text) || STRENGTH_PATTERN.test(row.text) || AFFIX_PATTERN.test(row.text)) continue
        for (const option of options) {
            const score = nameSimilarity(key, option.alias)
            if (!best || score > best.match.score || (score === best.match.score && row.height > best.height)) {
                best = {
                    match: {
                        kind: option.kind,
                        slot: option.slot,
                        baseNameId: option.baseNameId,
                        uniqueId: option.uniqueId,
                        score,
                    },
                    rowIndex,
                    height: row.height,
                }
            }
        }
    }
    if (!best || best.match.score < NAME_MIN_SCORE) return null
    return { match: best.match, rowIndex: best.rowIndex }
}

/**
 * 计算词条候选的综合打分（名称分 + 显示值 / 区间分）。
 * @param affix 词缀
 * @param source 来源
 * @param entry OCR 词条文本
 * @param strength 强度
 * @param translate 译文函数
 * @returns 打分；数值不可解析时 null
 */
function scoreAffixCandidate(
    affix: DnaSeasonAffix,
    source: "base" | "random" | "unique",
    inPool: boolean,
    entry: OcrAffixText,
    strength: number,
    translate: (text: string) => string
): AffixCandidateScore | null {
    const key = nameKey(entry.name)
    let nameScore = 0
    for (const alias of getAffixAliases(affix, translate)) nameScore = Math.max(nameScore, nameSimilarity(key, nameKey(alias)))
    const percent = isPercentAffix(affix)
    const tolerance = percent ? ANCIENT_PERCENT_TOLERANCE : ANCIENT_FIXED_TOLERANCE
    const range = getAffixRollRange(affix, strength)
    // 随机词条在游戏中带强度区间：两端同桶时当前值也走 0.05 细精度；基础 / 专属 / 太古无区间
    const fine = source === "random" && needsFineDisplay(affix, strength)
    let bestRoll = range.min
    let bestError = Number.POSITIVE_INFINITY
    if (source === "base") {
        bestRoll = Math.max(1, Math.min(Math.round(strength), Math.max(1, affix.totalValueLevel || 1)))
        bestError = Math.abs(getDisplayValue(affix, bestRoll, false) - entry.value)
    } else {
        for (let roll = range.min; roll <= range.max; roll++) {
            const error = Math.abs(getDisplayValue(affix, roll, false, fine) - entry.value)
            if (error < bestError) {
                bestError = error
                bestRoll = roll
            }
        }
    }
    let ancient = false
    let error = bestError
    if (source === "random" && !entry.range && affix.ancientFunc) {
        const ancientError = Math.abs(getDisplayValue(affix, range.max, true) - entry.value)
        const displayEps = percent ? UNCERTAIN_PERCENT_EPS : UNCERTAIN_FIXED_EPS
        // `*` 只在太古误差与非太古最优误差打平（显示精度内）时作 tie-break，不得绕过数值门槛
        const tied = Math.abs(ancientError - bestError) <= displayEps
        if (ancientError <= bestError || (entry.starred && tied)) {
            ancient = true
            error = ancientError
            bestRoll = range.max
        }
    }
    const displayScore = 1 / (1 + (error / tolerance) ** 2)
    let valueScore = displayScore
    if (entry.range && source !== "base" && range.max > range.min) {
        const lower = getDisplayValue(affix, range.min, false, fine)
        const upper = getDisplayValue(affix, range.max, false, fine)
        const rangeError = (Math.abs(lower - entry.range.lower) + Math.abs(upper - entry.range.upper)) / 2
        const rangeScore = 1 / (1 + (rangeError / (tolerance * 1.5)) ** 2)
        valueScore = displayScore * 0.5 + rangeScore * 0.5
    }
    return {
        affix,
        source,
        inPool,
        nameScore,
        valueScore,
        combined: NAME_WEIGHT * nameScore + VALUE_WEIGHT * valueScore - (inPool ? 0 : OUT_OF_POOL_PENALTY),
        ancient,
        rollLevel: bestRoll,
        error,
    }
}

/**
 * 对一条 OCR 词条行给候选池打分并排序。
 * @param entry OCR 词条文本
 * @param candidates 候选池
 * @param strength 强度
 * @param translate 译文函数
 * @returns 按综合分降序的候选
 */
function rankAffixCandidates(
    entry: OcrAffixText,
    candidates: ReadonlyArray<{ affix: DnaSeasonAffix; source: "base" | "random" | "unique"; inPool: boolean }>,
    strength: number,
    translate: (text: string) => string
): AffixCandidateScore[] {
    const scores: AffixCandidateScore[] = []
    for (const candidate of candidates) {
        const score = scoreAffixCandidate(candidate.affix, candidate.source, candidate.inPool, entry, strength, translate)
        if (score) scores.push(score)
    }
    return scores.sort(
        (left, right) =>
            right.combined - left.combined ||
            right.nameScore - left.nameScore ||
            right.valueScore - left.valueScore ||
            left.affix.id - right.affix.id
    )
}

/**
 * 判断候选排序是否可信：名称分 / 综合分达阈值，且与次优分差足够。
 * @param scores 已排序候选
 * @returns 可信为 true
 */
function isConfidentAffixMatch(scores: readonly AffixCandidateScore[]): boolean {
    const best = scores[0]
    if (!best || best.nameScore < NAME_MIN_SCORE || best.combined < MIN_COMBINED_SCORE) return false
    const second = scores.find(score => score.affix.id !== best.affix.id)
    return !second || best.combined - second.combined >= MIN_SCORE_MARGIN
}

/**
 * 单卡解析：名称 / 部位 / 强度 / 基础词条 / 随机词条 / 太古 / 品质 / 警告。
 * @param rows 本卡已按 y 归并的行
 * @param options 解析选项
 * @param cardCount 本图总卡数
 * @param cardIndex 本卡下标（0 起）
 * @returns 本卡解析结果（缺部位 / 强度 / 名称时不猜，`item` 为 null）
 */
function parseCard(rows: readonly OcrRow[], options: GearOcrParseOptions, cardCount: number, cardIndex: number): GearOcrParseResult {
    const warnings: GearOcrWarning[] = []
    const unmatchedLines: string[] = []
    const parsedAffixes: GearOcrParsedAffix[] = []
    const translate = (text: string): string => {
        try {
            return options.translate?.(text) || text
        } catch {
            return text
        }
    }
    const nameOptions = buildNameOptions(translate)
    const consumedRows = new Set<number>()

    let strength: number | null = null
    let slotLineValue: number | null = null
    let slotLineRow = -1
    for (const [index, row] of rows.entries()) {
        const strengthMatch = STRENGTH_PATTERN.exec(row.text)
        if (strengthMatch && strength === null) {
            const value = Math.round(parseNumberToken(strengthMatch[1]))
            if (Number.isFinite(value) && value >= 1 && value <= 50) {
                strength = value
                consumedRows.add(index)
            }
        }
        const slotMatch = SLOT_PATTERN.exec(row.text)
        if (slotMatch && slotLineValue === null) {
            const rest = slotMatch[1].replace(/\s+/g, "")
            const slot = slots.find(item => rest.includes(item.name))
            if (slot) {
                slotLineValue = slot.id
                slotLineRow = index
                consumedRows.add(index)
            }
        }
    }

    const nameResult = matchGearName(rows, nameOptions)
    const nameMatch = nameResult?.match ?? null
    if (nameResult) consumedRows.add(nameResult.rowIndex)
    const slotType = nameMatch?.slot ?? slotLineValue
    if (nameMatch && slotLineValue !== null && nameMatch.slot !== slotLineValue && slotLineRow >= 0) {
        warnings.push({ code: "text_unparsed", detail: rows[slotLineRow]?.raw })
    }
    if (slotType === null) warnings.push({ code: "slot_missing" })
    if (strength === null) warnings.push({ code: "strength_missing" })
    if (!nameMatch) warnings.push({ code: "name_missing" })

    if (!nameMatch || slotType === null || strength === null) {
        for (const [index, row] of rows.entries()) {
            if (consumedRows.has(index)) continue
            unmatchedLines.push(row.raw)
        }
        if (unmatchedLines.length) warnings.push({ code: "text_unparsed", detail: unmatchedLines.join(" | ") })
        return {
            item: null,
            slotType,
            strength,
            rarityId: null,
            iconId: null,
            uniqueId: nameMatch?.uniqueId ?? null,
            affixes: [],
            warnings,
            unmatchedLines,
            cardCount,
            cardIndex,
        }
    }

    const slot = Math.round(slotType)
    const baseAffix = getBaseAffix(slot)
    const unique = nameMatch.kind === "unique" ? uniqueEquips.find(item => item.id === nameMatch.uniqueId) : undefined
    const uniqueAffix = unique ? affixes.find(item => item.id === unique.affixId) : undefined
    const candidateMap = new Map<number, { affix: DnaSeasonAffix; source: "base" | "random" | "unique"; inPool: boolean }>()
    const inPoolAffixes = getGearRandomAffixPool(slot)
    for (const affix of inPoolAffixes) {
        if (!isAffixAllowedForChar(affix, options.charId ?? 0)) continue
        candidateMap.set(affix.id, { affix, source: "random", inPool: true })
    }
    // 基础词条同名（如「生命」）时来源以槽位基础词条为准，不因池内同名条目误判为随机
    if (baseAffix) candidateMap.set(baseAffix.id, { affix: baseAffix, source: "base", inPool: true })
    if (uniqueAffix) candidateMap.set(uniqueAffix.id, { affix: uniqueAffix, source: "unique", inPool: true })
    const candidates = [...candidateMap.values()]
    // 单件详情卡的实测词条可能跨出本地「槽位淬炼池」映射（如护胸出现背水）；
    // 仅在主候选池无法可信匹配时，回退到全部有池的 Plan 2 词条再试一次，避免静默丢词条。
    // 技能等级词条按已知部位映射（手套/护符=战技、耳环/印章=终结技、项链/典籍=被动），
    // 经 `getGearRandomAffixPool` 的 `slotTypes` 候选进入主池，不从 fallback 跨槽回退
    // （1039 / 1511 描述相同但不互为跨部位候选）。
    const gemAffixIds = getGemAffixIds()
    const uniqueAffixIds = getUniqueAffixIds()
    const fallbackCandidates = affixes
        .filter(
            affix =>
                affix.plan === 2 &&
                affix.pool !== undefined &&
                !candidateMap.has(affix.id) &&
                !gemAffixIds.has(affix.id) &&
                !uniqueAffixIds.has(affix.id) &&
                isAffixAllowedForChar(affix, options.charId ?? 0)
        )
        .map(affix => ({ affix, source: "random" as const, inPool: false }))

    const affixEntries: OcrAffixText[] = []
    let pendingEntry: OcrAffixText | null = null
    for (const [index, row] of rows.entries()) {
        if (consumedRows.has(index)) continue
        const continuation = RANGE_PATTERN.exec(row.text)
        if (continuation && pendingEntry && !pendingEntry.range) {
            const lower = parseNumberToken(continuation[1])
            const upper = parseNumberToken(continuation[2])
            if (Number.isFinite(lower) && Number.isFinite(upper)) {
                pendingEntry.range = { lower, upper }
                consumedRows.add(index)
                pendingEntry = null
                continue
            }
        }
        const match = AFFIX_PATTERN.exec(row.text)
        if (!match) {
            pendingEntry = null
            continue
        }
        const sign = match[2] === "-" ? -1 : 1
        const value = sign * parseNumberToken(match[3])
        if (!Number.isFinite(value)) continue
        const name = match[1].replace(LEADING_SYMBOL_PATTERN, "").trim()
        if (!name) continue
        const lower = match[4] === undefined ? Number.NaN : parseNumberToken(match[4])
        const upper = match[5] === undefined ? Number.NaN : parseNumberToken(match[5])
        const entry: OcrAffixText = {
            name,
            value,
            range: Number.isFinite(lower) && Number.isFinite(upper) ? { lower, upper } : undefined,
            starred: ANCIENT_MARK_PATTERN.test(row.raw.trimStart()),
            text: row.raw,
        }
        affixEntries.push(entry)
        consumedRows.add(index)
        pendingEntry = entry.range ? null : entry
    }

    const usedAffixIds = new Set<number>()
    const randomRolls: TranscendGearAffixRoll[] = []
    let baseParsed = false
    let uniqueParsed = false
    for (const entry of affixEntries) {
        let scores = rankAffixCandidates(entry, candidates, strength, translate)
        if (!isConfidentAffixMatch(scores) && fallbackCandidates.length) {
            scores = rankAffixCandidates(entry, [...candidates, ...fallbackCandidates], strength, translate)
        }
        if (!isConfidentAffixMatch(scores)) {
            warnings.push({ code: "affix_unmatched", detail: entry.text })
            unmatchedLines.push(entry.text)
            continue
        }
        const best = scores[0]
        if (usedAffixIds.has(best.affix.id)) {
            warnings.push({ code: "affix_duplicate", detail: entry.text })
            continue
        }
        usedAffixIds.add(best.affix.id)
        const percent = isPercentAffix(best.affix)
        if (best.source === "random" && !best.inPool) {
            warnings.push({ code: "affix_out_of_pool", detail: getAffixPoolLabel(best.affix) })
        }
        const integerPercentBase = best.source === "base" && percent && Number.isInteger(entry.value)
        const uncertainEps = integerPercentBase ? BASE_UNCERTAIN_EPS : percent ? UNCERTAIN_PERCENT_EPS : UNCERTAIN_FIXED_EPS
        if (best.error > uncertainEps) warnings.push({ code: "affix_value_uncertain", detail: `${entry.text} -> ${best.affix.id}` })
        if (best.ancient) warnings.push({ code: "ancient_inferred", detail: entry.text })
        parsedAffixes.push({
            affixId: best.affix.id,
            source: best.source,
            rollLevel: best.rollLevel,
            ancient: best.ancient,
            displayValue: entry.value,
            error: best.error,
            confidence: best.combined,
            text: entry.text,
        })
        if (best.source === "base") {
            baseParsed = true
        } else if (best.source === "unique") {
            uniqueParsed = true
        } else {
            randomRolls.push({
                affixId: best.affix.id,
                rollLevel: best.rollLevel,
                masterworkLevel: 0,
                ancient: best.ancient,
                finalMasterwork: false,
                source: "random",
            })
        }
    }

    if (!baseParsed && baseAffix) warnings.push({ code: "base_affix_missing" })
    if (unique && !uniqueParsed) warnings.push({ code: "unique_affix_missing" })

    let rarityId: number
    if (unique) {
        rarityId = UNIQUE_RARITY_ID
    } else {
        const normalRarities = [1, 2, 3, 4, 5].filter(id => getGearRarity(id))
        const exact = normalRarities.find(id => getGearRarityAffixCount(id) === randomRolls.length)
        if (exact !== undefined) {
            rarityId = exact
        } else {
            rarityId = normalRarities.reduce((best, id) => {
                const bestDiff = Math.abs(getGearRarityAffixCount(best) - randomRolls.length)
                const diff = Math.abs(getGearRarityAffixCount(id) - randomRolls.length)
                return diff < bestDiff ? id : best
            }, normalRarities[0] ?? 1)
            warnings.push({ code: "rarity_inferred", detail: `${randomRolls.length}` })
        }
    }

    for (const [index, row] of rows.entries()) {
        if (consumedRows.has(index)) continue
        unmatchedLines.push(row.raw)
    }
    if (unmatchedLines.length) warnings.push({ code: "text_unparsed", detail: unmatchedLines.join(" | ") })

    const item = buildGearItem(slot, {
        rarityId,
        equipBaseScore: strength,
        iconId: nameMatch.baseNameId,
        uniqueId: nameMatch.uniqueId,
        randomAffixes: randomRolls,
        seasonId: getCurrentSeasonId(),
    })
    return {
        item,
        slotType: slot,
        strength,
        rarityId,
        iconId: item.iconId ?? null,
        uniqueId: item.uniqueId ?? null,
        affixes: parsedAffixes,
        warnings,
        unmatchedLines,
        cardCount,
        cardIndex,
    }
}

/**
 * 单卡解析入口：调用方传入**一张卡**的 OCR 行（不做分列），`cardCount = 1`、`cardIndex = 0`。
 * 多卡截图请用 `parseGearOcrCards`。
 * @param lines 单卡 OCR 行
 * @param options 解析选项
 * @returns 单卡解析结果
 */
export function parseGearOcrLines(lines: readonly GearOcrLine[], options: GearOcrParseOptions = {}): GearOcrParseResult {
    return parseCard(groupLines(lines), options, 1, 0)
}

/**
 * 多卡解析：按 x 投影切列，左右并排的每张卡各产出一个独立结果（从左到右）。
 * `cardCount` 为总卡数，`cardIndex` 为当前卡下标；每卡的 `unmatchedLines` 只归属本卡。
 * @param lines 整张截图的 OCR 行
 * @param options 解析选项
 * @returns 每卡一个结果，按从左到右排序；无有效行时为空数组
 */
export function parseGearOcrCards(lines: readonly GearOcrLine[], options: GearOcrParseOptions = {}): GearOcrParseResult[] {
    const columns = splitColumns(lines)
    return columns.map((column, index) => parseCard(groupLines(column.lines), options, columns.length, index))
}
