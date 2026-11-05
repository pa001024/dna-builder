/** manifest 组装 / 序列化 / 读取：manifest.json 是可运行 IR 的完整快照。 */

import type { SkillBehaviorDoc } from "../schema/ir"
import { checkSchemaVersion } from "../schema/versions"
import { type Diagnostic, diagnostic, type SkillBehaviorManifest } from "./types"

export const SKILL_SIM_GENERATOR = { name: "dna-builder-skill-sim", version: "0.1.0" } as const

export function createManifest(doc: SkillBehaviorDoc, diagnostics: readonly Diagnostic[]): SkillBehaviorManifest {
    return {
        ...doc,
        characters: [...doc.characters].sort((a, b) => a.id - b.id),
        skills: sortRecord(doc.skills, key => Number(key)),
        buffs: sortRecord(doc.buffs, key => (/^\d+$/.test(key) ? Number(key) : Number.POSITIVE_INFINITY)),
        generator: { ...SKILL_SIM_GENERATOR },
        diagnostics: [...diagnostics].sort((a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code)),
    }
}

export function serializeManifest(manifest: SkillBehaviorManifest): string {
    return `${JSON.stringify(manifest, null, 4)}\n`
}

export function serializeCoverage(manifest: SkillBehaviorManifest, diagnostics: readonly Diagnostic[] = []): string {
    const errors = diagnostics.filter(item => item.severity === "error")
    const warnings = diagnostics.filter(item => item.severity === "warn")
    const payload = {
        coverage: manifest.coverage,
        diagnostics: {
            errors: errors.length,
            warnings: warnings.length,
            items: [...diagnostics].sort((a, b) => a.path.localeCompare(b.path)),
        },
    }
    return `${JSON.stringify(payload, null, 4)}\n`
}

export interface ReadManifestResult {
    manifest?: SkillBehaviorManifest
    diagnostics: Diagnostic[]
}

export function readManifest(value: unknown): ReadManifestResult {
    const diagnostics: Diagnostic[] = []
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        diagnostics.push(diagnostic("error", "manifest.type", "", "manifest 必须是 JSON 对象"))
        return { diagnostics }
    }
    const record = value as Record<string, unknown>
    const version = checkSchemaVersion(record.schemaVersion, "behavior")
    if (!version.ok) {
        diagnostics.push(diagnostic("error", "manifest.version", "schemaVersion", version.message ?? "不支持的 manifest 版本"))
        return { diagnostics }
    }
    if (typeof record.generator !== "object" || record.generator === null) {
        diagnostics.push(diagnostic("warn", "manifest.generator", "generator", "manifest 缺少 generator 信息（可能不是 build 产物）"))
    }
    return { manifest: value as SkillBehaviorManifest, diagnostics }
}

function sortRecord<T>(record: Record<string, T>, keyOf: (key: string) => number): Record<string, T> {
    const result: Record<string, T> = {}
    for (const [key, value] of Object.entries(record).sort((a, b) => keyOf(a[0]) - keyOf(b[0]) || a[0].localeCompare(b[0]))) {
        result[key] = value
    }
    return result
}
