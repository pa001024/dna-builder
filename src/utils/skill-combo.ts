import type { SkillField } from "@/data/data-types"
import type { LeveledSkill } from "@/data/leveled/LeveledSkill"

/** 单个近战技能（一套连段）的汇总：连段时间、倍率与削韧 */
export interface MeleeSkillComboSummary {
    comboTime: number
    totalMultiplier: number
    multiplierPerSecond: number
    totalBossStagger: number
}

/**
 * 按格式表达式计算字段倍率（支持 {%}×2、{%}×2+{%} 等）
 * @param format 格式表达式
 * @param value1 第一个值
 * @param value2 第二个值
 * @returns 计算后的倍率
 */
export function evaluateMultiplierByFormat(format: string, value1: number, value2: number = 0) {
    let count = 0
    let expr = format.replace(/\{%\}|\{\}/g, match => {
        count++
        const value = count % 2 === 1 ? value1 : value2
        return match === "{%}" ? value.toString() : value.toString()
    })
    expr = expr.replace(/×/g, "*")
    try {
        const safeExpr = expr.replace(/[^0-9+\-*/.()\s]/g, "")
        const result = new Function(`return ${safeExpr}`)()
        return Number.isNaN(result) ? value1 : result
    } catch {
        return value1
    }
}

/**
 * 兼容 number / number[] 的字段取值
 * @param value 原始字段值
 * @returns 当前展示值
 */
export function pickSkillFieldValue(value?: number | number[]) {
    if (value === undefined) return undefined
    return Array.isArray(value) ? value[0] : value
}

/**
 * 计算技能字段对应的倍率贡献（优先按格式表达式）
 * @param field 技能字段
 * @returns 当前字段的倍率贡献
 */
export function getSkillFieldMultiplier(field: SkillField) {
    const value = pickSkillFieldValue(field.值) || 0
    const value2 = pickSkillFieldValue(field.值2) || 0
    if (typeof field.格式 === "string") {
        return evaluateMultiplierByFormat(field.格式, value, value2)
    }
    return value
}

/**
 * 计算单个技能的连段汇总（基于取消时间求和）。
 * 字段不足两段、无取消时间或总时长为 0 时返回 undefined，调用方不展示统计行。
 * @param skill 技能实例（武器技能或替换技能均可）
 * @returns 连段汇总，不可汇总时返回 undefined
 */
export function getMeleeSkillComboSummary(skill: LeveledSkill | null | undefined): MeleeSkillComboSummary | undefined {
    if (!skill) return undefined
    const fields = skill.getFieldsWithAttr()
    if (fields.length <= 1) return undefined

    const cancelValues = fields
        .map(field => pickSkillFieldValue((field as SkillField).取消))
        .filter((value): value is number => value !== undefined)
    if (!cancelValues.length) return undefined

    const comboTime = cancelValues.reduce((sum, value) => sum + value, 0)
    if (comboTime <= 0) return undefined

    const totalMultiplier = fields.reduce((sum, field) => sum + getSkillFieldMultiplier(field as SkillField), 0)
    // Boss削韧字段缺失时回退到削韧字段，再求和
    const totalBossStagger = fields.reduce((sum, field) => {
        const fieldData = field as SkillField
        const bossStagger = pickSkillFieldValue(fieldData.Boss削韧)
        const value = bossStagger !== undefined ? bossStagger : pickSkillFieldValue(fieldData.削韧) || 0
        return sum + value
    }, 0)
    return {
        comboTime,
        totalMultiplier,
        multiplierPerSecond: totalMultiplier / comboTime,
        totalBossStagger,
    }
}

/**
 * 批量计算多个技能的连段汇总，按技能名索引，供列表渲染直接取用。
 * @param skills 技能实例列表
 * @returns 技能名到连段汇总的映射
 */
export function getMeleeSkillComboSummaryMap(skills: (LeveledSkill | null | undefined)[]): Record<string, MeleeSkillComboSummary> {
    const result: Record<string, MeleeSkillComboSummary> = {}
    for (const skill of skills) {
        if (!skill) continue
        const summary = getMeleeSkillComboSummary(skill)
        if (summary) result[skill.名称] = summary
    }
    return result
}
