import type { LeveledBuff } from "@/data"
import { matchPinyin } from "./pinyin-utils"

export interface BuffEditorOption {
    label: string
    value: LeveledBuff
}

export interface ParsedBuffEntry {
    name: string
    level: number | undefined
}

type DisplayBuff = Pick<LeveledBuff, "名称" | "等级" | "getProperties">

const summaryNumKeys = new Set([
    "有效生命",
    "基础攻击",
    "基础生命",
    "基础护盾",
    "基础防御",
    "攻击范围",
    "固定攻击",
    "神智回复",
    "异常数量",
    "神智消耗",
    "最大耐受",
    "基础装填",
    "基础弹匣",
    "连击持续时间",
    "子弹爆炸范围",
])

/**
 * 格式化自定义 BUFF 摘要中的数值。
 * @param prop 属性名
 * @param value 属性值
 * @returns 格式化后的文本
 */
function formatSummaryValue(prop: string, value: number) {
    if (summaryNumKeys.has(prop)) {
        return value > 0 && !prop.startsWith("基础") ? `+${+value.toFixed(2)}` : `${+value.toFixed(2)}`
    }
    const percent = value * 100
    return `${percent >= 0 ? "+" : ""}${percent % 1 === 0 ? percent.toFixed(0) : percent.toFixed(1)}%`
}

/**
 * 格式化自定义 BUFF 的附加摘要。
 * @param buff BUFF 实例
 * @returns 形如“(攻击+100%)”的摘要；没有有效属性时返回空字符串
 */
export function formatCustomBuffSummary(buff: DisplayBuff): string {
    const parts = Object.entries(buff.getProperties())
        .filter(([, value]) => value !== 0)
        .map(([prop, value]) => `${prop}${formatSummaryValue(prop, value)}`)
    return parts.length > 0 ? `(${parts.join(", ")})` : ""
}

/**
 * 格式化 BUFF 的展示名称。
 * @param buff BUFF 实例
 * @returns 用于列表、复制等场景的名称
 */
export function formatBuffDisplayName(buff: DisplayBuff): string {
    if (buff.名称 !== "自定义BUFF") {
        return buff.名称
    }
    return `${buff.名称}${formatCustomBuffSummary(buff)}`
}

/**
 * 按 BUFF 语法切分剪贴板文本，忽略自定义 BUFF 摘要中的逗号。
 * @param text 剪贴板文本
 * @returns 片段列表
 */
export function splitBuffClipboardTokens(text: string): string[] {
    const tokens: string[] = []
    let current = ""
    let depth = 0

    for (let index = 0; index < text.length; index += 1) {
        const char = text[index]
        if (char === "(") {
            depth += 1
            current += char
            continue
        }
        if (char === ")") {
            depth = Math.max(0, depth - 1)
            current += char
            continue
        }
        if (depth === 0 && (char === "," || char === "\n" || char === "\r" || char === "，")) {
            const trimmed = current.trim()
            if (trimmed) {
                tokens.push(trimmed)
            }
            current = ""
            continue
        }
        current += char
    }

    const trimmed = current.trim()
    if (trimmed) {
        tokens.push(trimmed)
    }

    return tokens
}

/**
 * 从自定义 BUFF 文本中解析属性列表。
 * @param token 单个自定义 BUFF 文本片段
 * @returns 属性列表；无法解析时返回 null
 */
export function parseCustomBuffSummary(token: string): [string, number][] | null {
    const normalized = token.replace(/\s+/g, "")
    const match = normalized.match(/^自定义BUFF(?:\((.*)\))?(?:\*(\d+))?$/)
    if (!match) {
        return null
    }

    const summary = match[1]
    if (!summary) {
        return []
    }

    return summary
        .split(/[,\n，]+/g)
        .map(part => part.trim())
        .filter(Boolean)
        .map(part => {
            const propertyMatch = part.match(/^(.+?)([+-]?\d+(?:\.\d+)?)(%)?$/)
            if (!propertyMatch) return null
            const property = propertyMatch[1]
            const value = Number(propertyMatch[2])
            if (Number.isNaN(value)) return null
            return [property, propertyMatch[3] ? value / 100 : value] as [string, number]
        })
        .filter((item): item is [string, number] => item !== null)
}

/**
 * 将 BUFF 列表格式化为剪贴板文本。
 * @param buffs 当前选中的 BUFF 列表
 * @param buffOptions BUFF 选项列表
 * @returns 逗号分隔的 BUFF 文本
 */
export function formatBuffClipboardText(buffs: Pick<LeveledBuff, "名称" | "等级">[], buffOptions: BuffEditorOption[]): string {
    const optionMap = new Map(buffOptions.map(option => [option.label, option]))
    return buffs
        .map(buff => {
            const option = optionMap.get(buff.名称)
            const defaultLevel = option?.value.等级
            const displayName = option?.label === "自定义BUFF" ? formatBuffDisplayName(option.value) : buff.名称
            if (defaultLevel === undefined || buff.等级 !== defaultLevel) {
                return `${displayName}*${buff.等级}`
            }
            return displayName
        })
        .join(", ")
}

/**
 * 解析剪贴板中的 BUFF 文本。
 * @param text 剪贴板文本
 * @returns 解析后的 BUFF 条目
 */
export function parseBuffClipboardText(text: string): ParsedBuffEntry[] {
    return splitBuffClipboardTokens(text)
        .filter(Boolean)
        .map<ParsedBuffEntry | null>(token => {
            const normalized = token.replace(/\s+/g, "")
            const customMatch = normalized.match(/^自定义BUFF(?:\([^)]*\))?(?:\*(\d+))?$/)
            if (customMatch) {
                return {
                    name: "自定义BUFF",
                    level: customMatch[1] ? Number(customMatch[1]) : undefined,
                }
            }
            const match = normalized.match(/^(.+?)(?:\*(\d+))?$/)
            if (!match) return null
            return {
                name: match[1],
                level: match[2] ? Number(match[2]) : undefined,
            }
        })
        .filter((item): item is ParsedBuffEntry => item !== null)
}

/**
 * 判断 BUFF 是否匹配搜索词。
 * @param option BUFF 选项
 * @param query 搜索词
 * @returns 是否匹配
 */
export function matchBuffOptionQuery(option: BuffEditorOption, query: string): boolean {
    const normalizedQuery = query.trim()
    if (!normalizedQuery) return true
    if (option.label.includes(normalizedQuery)) return true
    if (option.value.描述?.includes(normalizedQuery)) return true
    if (matchPinyin(option.label, normalizedQuery).match) return true
    if (option.value.描述 && matchPinyin(option.value.描述, normalizedQuery).match) return true
    return false
}
