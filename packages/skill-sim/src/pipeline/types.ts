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
