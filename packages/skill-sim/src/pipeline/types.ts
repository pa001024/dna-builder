/** 流水线公共类型：诊断、数据索引、阶段结果。 */

import type { CoverageReport, SkillBehaviorDoc } from "../schema/ir"

export type DiagnosticSeverity = "error" | "warn" | "info"

export interface Diagnostic {
    severity: DiagnosticSeverity
    /** 稳定的机器可读码，如 `ref.unknown-buff`、`gate.missing-behavior` */
    code: string
    path: string
    message: string
}

export function diagnostic(severity: DiagnosticSeverity, code: string, path: string, message: string): Diagnostic {
    return { severity, code, path, message }
}

export function countDiagnostics(diagnostics: readonly Diagnostic[]): { errors: number; warnings: number; infos: number } {
    let errors = 0
    let warnings = 0
    let infos = 0
    for (const d of diagnostics) {
        if (d.severity === "error") errors++
        else if (d.severity === "warn") warnings++
        else infos++
    }
    return { errors, warnings, infos }
}

export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
    return diagnostics.some(d => d.severity === "error")
}

/** packages/data 侧的最小读取面（便于测试注入合成索引，不 mock 真实类型逻辑） */
export interface SkillDataIndex {
    getCharacter(id: number): DataCharacter | undefined
    /** 角色技能、武器技能、（可选）MOD/魔灵技能；找不到即 undefined */
    getSkill(id: number): DataSkill | undefined
    /** 按数字 id 或名称查 buff / effect */
    getBuff(ref: number | string): DataBuff | undefined
    /** 已知施法资源 token（神智/沉浸度/…）；用于校验 parseCosts 归一结果 */
    getKnownResources?(): readonly string[]
}

/** 与 packages/data 字段口径一致的施法资源 token（长词优先匹配） */
export const KNOWN_SKILL_RESOURCES = ["天工源能", "沉浸度", "觉醒值", "神智", "电能", "生命"] as const

/** 从 `[X]神智消耗` / `最低神智消耗` / `每秒神智消耗` 中提取已知资源 token */
export function resolveResourceToken(name: string): string | undefined {
    return KNOWN_SKILL_RESOURCES.find(token => name.includes(token))
}

export interface DataCharacter {
    id: number
    name: string
    /** 原始技能顺序：按 CharBuild 口径 [E, Q, P, …] */
    skills: number[]
}

export interface DataSkill {
    id: number
    name: string
    type: string
    /** 武器 / MOD 技能没有 characterId */
    characterId?: number
    cd?: number
    fields: DataSkillField[]
}

export interface DataSkillField {
    name: string
    values: number | number[]
    tag?: string[]
    /** 影响（技能威力 / 技能效益 …），用于识别消耗字段 */
    impact?: string
}

export interface DataBuff {
    id?: number
    name: string
}

export interface SkillBehaviorManifest extends SkillBehaviorDoc {
    generator: {
        name: "dna-builder-skill-sim"
        version: string
    }
    /** ingest / resolve / build 全过程的诊断（check 以此为门禁输入） */
    diagnostics: Diagnostic[]
}

export interface CoverageSummary extends CoverageReport {
    /** 便捷派生：有行为阶段的技能占比 */
    behaviorRatio: number
}
