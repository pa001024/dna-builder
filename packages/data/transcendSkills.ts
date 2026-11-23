import type { Skill, SkillField } from "./leveled/LeveledSkill"

/**
 * 升华词条技能替换载荷（`Skill` 口径）：角色 E/Q 与武器技能共用。
 *
 * 上游 `DnaSeasonAffix.skillReplacements` 提供身份/名称与可解析字段；
 * 手写表只在导出没有可用字段时补 `字段` / `字段改写` / `移除字段`，未覆盖的源字段原样保留。
 */
export interface TranscendSkillReplacement {
    /** 目标技能 id（缺省保留源技能 id） */
    id?: number
    名称?: string
    类型?: string
    描述?: string
    /** 完整替换字段；缺省时保留源技能字段 */
    字段?: SkillField[]
    /** 按字段名覆盖（未列出的源字段保留） */
    字段改写?: Record<string, Partial<SkillField>>
    /** 移除的源字段名 */
    移除字段?: string[]
    /** 导出字段只是源技能原值、不能表达词条改写时，保留源技能字段而不应用导出 `字段` */
    保留源字段?: boolean
}

/**
 * 手写技能替换兜底：`affixId → 源技能 id → 载荷`。
 *
 * - `310201`：目标技能 310212 无导出字段，伤害取上游 `SkillEffects 310234` 的 `Rate=9.03552`（903.552%）；
 *   自动射击 0.2 秒间隔与命中频率未建模。
 * - `2040601`：导出字段与源技能同值（0.05 / 0.17），不能表达官方 +120% 子弹倍率，保留源技能字段。
 * - `180101 / 180102 / 320301`：导出只有身份/名称，不加字段兜底；`420101` 无导出映射，保持未建模。
 */
export const TRANSCEND_SKILL_REPLACEMENTS: Record<number, Record<string, TranscendSkillReplacement>> = {
    310201: {
        "310201": {
            字段改写: { 伤害: { 值: 9.03552 } },
        },
    },
    2040601: {
        "2040601": {
            保留源字段: true,
        },
    },
}

/**
 * 合并导出载荷与手写兜底：导出为身份/名称权威；手写字段只在导出没有可用字段时叠加。
 * @param affixId 词条 id
 * @param sourceSkillId 源技能 id
 * @param exported 上游导出的替换载荷
 * @returns 合并结果；两侧都没有时返回 undefined
 */
export function mergeTranscendSkillReplacement(
    affixId: number,
    sourceSkillId: number | string,
    exported?: TranscendSkillReplacement
): TranscendSkillReplacement | undefined {
    const manual = TRANSCEND_SKILL_REPLACEMENTS[affixId]?.[String(sourceSkillId)]
    if (!exported && !manual) return undefined

    const merged: TranscendSkillReplacement = {}
    const id = exported?.id ?? manual?.id
    const name = exported?.名称 ?? manual?.名称
    const type = exported?.类型 ?? manual?.类型
    const description = exported?.描述 ?? manual?.描述
    if (id !== undefined) merged.id = id
    if (name !== undefined) merged.名称 = name
    if (type !== undefined) merged.类型 = type
    if (description !== undefined) merged.描述 = description

    const exportedFields = Array.isArray(exported?.字段) && exported.字段.length > 0 ? exported.字段 : undefined
    if (manual?.保留源字段) return merged
    if (exportedFields) {
        merged.字段 = exportedFields
        return merged
    }
    if (manual?.字段?.length) merged.字段 = manual.字段
    else {
        if (manual?.字段改写) merged.字段改写 = manual.字段改写
        if (manual?.移除字段?.length) merged.移除字段 = manual.移除字段
    }
    return merged
}

/**
 * 把替换载荷应用到源技能：名称/类型/描述缺省回落，字段按 `字段` 完整替换或 `移除字段` + `字段改写` 叠加。
 * @param source 源技能
 * @param replacement 替换载荷
 * @returns 保留未覆盖键（实体 / 召唤物 / 升级 / 子技能…）的新技能数据
 */
export function applyTranscendSkillReplacement(source: Skill, replacement: TranscendSkillReplacement): Skill {
    return {
        ...source,
        id: replacement.id ?? source.id,
        名称: replacement.名称 ?? source.名称,
        类型: replacement.类型 ?? source.类型,
        描述: replacement.描述 ?? source.描述,
        字段: replacement.字段 ?? applySkillFieldEdits(source.字段 ?? [], replacement),
    }
}

/**
 * 按字段名移除 / 改写源技能字段；`字段改写` 中源技能不存在的名字按新增字段处理（需带 `值`）。
 * @param fields 源技能字段
 * @param replacement 替换载荷
 * @returns 改写后的字段列表
 */
function applySkillFieldEdits(fields: SkillField[], replacement: TranscendSkillReplacement): SkillField[] {
    const removed = new Set(replacement.移除字段 ?? [])
    const rewrites = replacement.字段改写 ?? {}
    const result = fields
        .filter(field => !removed.has(field.名称))
        .map(field => {
            const patch = rewrites[field.名称]
            return patch ? { ...field, ...patch, 名称: field.名称 } : field
        })
    const existing = new Set(result.map(field => field.名称))
    for (const [name, patch] of Object.entries(rewrites)) {
        if (existing.has(name) || patch.值 === undefined) continue
        result.push({ ...patch, 名称: name } as SkillField)
    }
    return result
}

/** 已告警的 MOD / 词条同源冲突：同一技能只告警一次，避免 getter 热路径刷屏 */
const warnedConflicts = new Set<number>()

/**
 * 记录一次 MOD 与升华词条替换同一技能时的冲突告警（MOD 优先）。
 * @param sourceSkillId 冲突的源技能 id
 */
export function warnSkillReplacementConflict(sourceSkillId: number): void {
    if (warnedConflicts.has(sourceSkillId)) return
    warnedConflicts.add(sourceSkillId)
    console.warn(`[升华] 技能 ${sourceSkillId} 同时被 MOD 与升华词条替换，按 MOD 优先`)
}

/** 清空冲突告警去重缓存（测试用） */
export function resetSkillReplacementWarnings(): void {
    warnedConflicts.clear()
}
