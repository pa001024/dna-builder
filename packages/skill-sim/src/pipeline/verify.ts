/**
 * verify：CharBuild parity 契约（U3 只实现运行器 + smoke，U7 填真实基线）。
 *
 * fixture 形状：`{ id, charId, settings, expectedDps, tolerance? }`，settings 原样交给
 * `createCharBuildFromSettings`；计算函数可注入（单测不加载 packages/data）。
 */

import { readFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import type { SkillBehaviorDoc } from "../schema/ir"
import type { Diagnostic, SkillBehaviorManifest } from "./types"

/** 默认容差 0.1%（PLAN §2.4） */
export const DEFAULT_PARITY_TOLERANCE = 0.001

export interface ParityFixture {
    id: string
    charId: number
    /** CharBuildSettingsInput（保持 unknown，避免 verify 与数据包强耦合） */
    settings: unknown
    expectedDps: number
    tolerance?: number
    note?: string
}

export interface ParityResult {
    id: string
    charId: number
    expectedDps: number
    actualDps: number
    /** |actual-expected| / max(|expected|, EPS) */
    drift: number
    tolerance: number
    ok: boolean
    /** allowDrift 放行的失败 */
    allowed: boolean
    note?: string
}

export interface VerifyReport {
    ok: boolean
    results: ParityResult[]
    errors: Diagnostic[]
    warnings: Diagnostic[]
}

export interface VerifyOptions {
    calculate?: (fixture: ParityFixture) => number | Promise<number>
    /** 漂移超阈值时只记录、不判失败（fixture 需显式标注） */
    allowDrift?: boolean
    defaultTolerance?: number
    /** fixture 角色必须出现在 manifest 中（U7 全量基线开启；U3 的合成 manifest 不要求） */
    requireCharacter?: boolean
}

const EPSILON = 1e-12

export async function verifyParity(
    manifest: SkillBehaviorManifest | SkillBehaviorDoc,
    fixtures: readonly ParityFixture[],
    options: VerifyOptions = {}
): Promise<VerifyReport> {
    const errors: Diagnostic[] = []
    const warnings: Diagnostic[] = []
    const results: ParityResult[] = []
    const characterIds = new Set(manifest.characters.map(character => character.id))
    const calculate = options.calculate ?? (await loadDefaultCalculate())

    for (const [index, fixture] of fixtures.entries()) {
        const path = `fixtures[${index}]`
        if (!fixture || typeof fixture.id !== "string" || typeof fixture.charId !== "number") {
            errors.push({ severity: "error", code: "verify.fixture", path, message: "fixture 缺少 id / charId" })
            continue
        }
        if (!characterIds.has(fixture.charId)) {
            const item = {
                severity: options.requireCharacter ? ("error" as const) : ("warn" as const),
                code: "verify.unknown-character",
                path: `${path}.charId`,
                message: `fixture ${fixture.id} 的角色 ${fixture.charId} 不在 manifest 中`,
            }
            if (options.requireCharacter) {
                errors.push(item)
                continue
            }
            warnings.push(item)
        }
        if (typeof fixture.expectedDps !== "number" || !Number.isFinite(fixture.expectedDps)) {
            errors.push({ severity: "error", code: "verify.fixture", path: `${path}.expectedDps`, message: "expectedDps 必须是有限数字" })
            continue
        }
        let actualDps: number
        try {
            actualDps = await calculate(fixture)
        } catch (error) {
            errors.push({ severity: "error", code: "verify.calculate", path: `${path}`, message: `计算失败：${String(error)}` })
            continue
        }
        if (typeof actualDps !== "number" || !Number.isFinite(actualDps)) {
            errors.push({
                severity: "error",
                code: "verify.calculate",
                path: `${path}`,
                message: `calculate() 返回非有限数字：${actualDps}`,
            })
            continue
        }
        const tolerance = fixture.tolerance ?? options.defaultTolerance ?? DEFAULT_PARITY_TOLERANCE
        const drift = Math.abs(actualDps - fixture.expectedDps) / Math.max(Math.abs(fixture.expectedDps), EPSILON)
        const within = drift <= tolerance
        results.push({
            id: fixture.id,
            charId: fixture.charId,
            expectedDps: fixture.expectedDps,
            actualDps,
            drift,
            tolerance,
            ok: within,
            allowed: !within && Boolean(options.allowDrift),
            note: fixture.note,
        })
    }

    const failed = results.filter(result => !result.ok && !result.allowed)
    return { ok: errors.length === 0 && failed.length === 0, results, errors, warnings }
}

async function loadDefaultCalculate(): Promise<(fixture: ParityFixture) => number> {
    const { defaultCalculate } = await import("./parity-calculate")
    return defaultCalculate
}

/** 读取 parity fixtures：JSON（数组 / `{fixtures}`）或 TS/JS 模块（导出 `fixtures` / default） */
export async function loadParityFixtures(file: string): Promise<{ fixtures: ParityFixture[]; diagnostics: Diagnostic[] }> {
    const diagnostics: Diagnostic[] = []
    try {
        if (file.endsWith(".json")) {
            return { fixtures: normalizeFixtures(JSON.parse(await readFile(file, "utf8")), diagnostics), diagnostics }
        }
        const mod = (await import(pathToFileURL(file).href)) as Record<string, unknown>
        return { fixtures: normalizeFixtures(mod.fixtures ?? mod.default, diagnostics), diagnostics }
    } catch (error) {
        diagnostics.push({ severity: "error", code: "verify.fixtures", path: "", message: `读取 fixtures 失败 ${file}: ${String(error)}` })
        return { fixtures: [], diagnostics }
    }
}

function normalizeFixtures(value: unknown, diagnostics: Diagnostic[]): ParityFixture[] {
    const list = Array.isArray(value)
        ? value
        : typeof value === "object" && value !== null && Array.isArray((value as { fixtures?: unknown }).fixtures)
          ? (value as { fixtures: unknown[] }).fixtures
          : undefined
    if (!list) {
        diagnostics.push({ severity: "error", code: "verify.fixtures", path: "", message: "fixtures 必须是数组或 { fixtures: [] }" })
        return []
    }
    return list as ParityFixture[]
}
