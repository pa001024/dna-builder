#!/usr/bin/env bun
/**
 * @file 生成覆盖表（角色 / 技能 / 来源 / 缺口）。
 *
 * 只读 `generated/manifest.json` + `generated/coverage.json` + `packages/data`，产出
 * `coverage-matrix.json`（机器可读）与 `COVERAGE.md`（人读）。分类口径：
 * - simulated：E/Q 至少有 damage / applyBuff / removeBuff 动作；
 * - data-only：没有任何可执行动作（只有字段 / montage / 原生副作用）；
 * - unsupported：有动作但只有 native / resource / select / summon，缺伤害或增益。
 */

import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import process from "node:process"
import { charMap } from "dna-builder-data/d"
import type { Action, SkillBehavior, SkillBehaviorManifest } from "../src/schema/ir.ts"

interface DiagnosticItem {
    severity: string
    code: string
    path: string
    message: string
}

interface CoverageFile {
    coverage: Record<string, unknown>
    diagnostics: { errors: number; warnings: number; items: DiagnosticItem[] }
}

type SkillStatus = "simulated" | "data-only" | "unsupported"
type CharacterStatus = SkillStatus

function usage(): string {
    return "用法：bun packages/skill-sim/scripts/coverage-report.ts [--manifest <path>] [--coverage <path>] [--out-dir <dir>] [--u2-input <U2 skill-behavior.json>]"
}

function parseArgs(argv: string[]) {
    const result = {
        manifest: "packages/skill-sim/generated/manifest.json",
        coverage: "packages/skill-sim/generated/coverage.json",
        outDir: "packages/skill-sim/generated",
        u2Input: undefined as string | undefined,
        help: false,
    }
    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index]!
        if (arg === "--help") result.help = true
        else if (arg === "--manifest") result.manifest = argv[++index]!
        else if (arg === "--coverage") result.coverage = argv[++index]!
        else if (arg === "--out-dir") result.outDir = argv[++index]!
        else if (arg === "--u2-input") result.u2Input = argv[++index]!
        else throw new Error(`未知参数：${arg}`)
    }
    return result
}

function countActions(actions: readonly Action[]): Record<string, number> {
    const counts: Record<string, number> = {}
    for (const action of actions) {
        counts[action.kind] = (counts[action.kind] ?? 0) + 1
        if (action.kind === "branch") {
            for (const [kind, count] of Object.entries(countActions(action.then))) counts[kind] = (counts[kind] ?? 0) + count
            for (const [kind, count] of Object.entries(countActions(action.else ?? []))) counts[kind] = (counts[kind] ?? 0) + count
        }
    }
    return counts
}

interface SkillReport {
    id: number
    name: string
    slot: string
    inData: boolean
    status: SkillStatus
    sources: string[]
    phases: number
    tickPhases: number
    actions: Record<string, number>
    damageActions: number
    buffActions: number
    nativeActions: number
    nativeCallsUnknown: number
    unmatchedNotifies: string[]
    unresolvedDamageRates: string[]
    reasons: string[]
}

function classify(skill: SkillBehavior, inData: boolean, diagnostics: DiagnosticItem[]): SkillReport {
    const actions: Record<string, number> = {}
    let tickPhases = 0
    for (const phase of skill.phases) {
        if (phase.tick) tickPhases++
        for (const [kind, count] of Object.entries(countActions(phase.actions))) actions[kind] = (actions[kind] ?? 0) + count
    }
    const damageActions = actions.damage ?? 0
    const buffActions = (actions.applyBuff ?? 0) + (actions.removeBuff ?? 0)
    const nativeActions = actions.native ?? 0
    const executable = Object.entries(actions)
        .filter(([kind]) => kind !== "native")
        .reduce((sum, [, count]) => sum + count, 0)
    const reasons: string[] = []
    let status: SkillStatus
    if (damageActions > 0 || buffActions > 0) status = "simulated"
    else if (executable > 0) {
        status = "unsupported"
        reasons.push("只有 resource/select/summon 动作，缺伤害/增益语义")
    } else if (nativeActions > 0) {
        status = "unsupported"
        reasons.push("只有 native 副作用，未映射为 IR 动作")
    } else {
        status = "data-only"
        reasons.push("无 montage / SkillEffects / Lua 行为动作")
    }
    if (!inData) reasons.push("packages/data 无对应技能条目")
    if (skill.provenance?.unmatchedNotify?.length) reasons.push(`${skill.provenance.unmatchedNotify.length} 个 notify 未匹配`)
    const unresolvedDamageRates = diagnostics
        .filter(item => item.path === `skills.${skill.id}` && item.message.includes("Damage 倍率"))
        .map(item => item.message)
    if (unresolvedDamageRates.length > 0) reasons.push(`${unresolvedDamageRates.length} 个 Damage 倍率无法解析`)
    return {
        id: skill.id,
        name: "unknown",
        slot: skill.slot,
        inData,
        status,
        sources: skill.sources,
        phases: skill.phases.length,
        tickPhases,
        actions,
        damageActions,
        buffActions,
        nativeActions,
        nativeCallsUnknown: (skill.provenance?.nativeCalls ?? []).filter(call => !call.known).length,
        unmatchedNotifies: skill.provenance?.unmatchedNotify ?? [],
        unresolvedDamageRates,
        reasons,
    }
}

function characterStatus(skills: SkillReport[]): CharacterStatus {
    // 只取角色技能表前两项（E/Q）；子技能排在主技能之后，不能参与角色级判定。
    const main = skills.slice(0, 2)
    if (main.length === 0) return "data-only"
    if (main.every(skill => skill.status === "simulated")) return "simulated"
    if (main.some(skill => skill.status !== "data-only")) return "unsupported"
    return "data-only"
}

async function main(): Promise<number> {
    const args = parseArgs(process.argv.slice(2))
    if (args.help) {
        console.log(usage())
        return 0
    }
    const manifest = JSON.parse(await readFile(args.manifest, "utf8")) as SkillBehaviorManifest
    const coverageFile = JSON.parse(await readFile(args.coverage, "utf8")) as CoverageFile
    const diagnostics = coverageFile.diagnostics.items
    const u2 = args.u2Input
        ? (JSON.parse(await readFile(args.u2Input, "utf8")) as { coverage?: Record<string, unknown>; exporter?: Record<string, unknown> })
        : undefined
    const dataIndexIds = new Set<number>()
    for (const [, character] of charMap) {
        for (const skill of character.技能 ?? []) {
            if (typeof skill.id === "number") dataIndexIds.add(skill.id)
            for (const sub of skill.子技能 ?? []) if (typeof sub.id === "number") dataIndexIds.add(sub.id)
        }
    }

    const skillReports = new Map<number, SkillReport>()
    for (const [key, skill] of Object.entries(manifest.skills)) {
        const report = classify(skill, dataIndexIds.has(Number(key)), diagnostics)
        const dataSkill = (charMap.get(skill.characterId)?.技能 ?? []).find(item => item.id === skill.id)
        report.name = dataSkill?.名称 ?? `技能 ${skill.id}`
        skillReports.set(skill.id, report)
    }

    const characterReports = manifest.characters.map(character => {
        const skills = character.skills.map(id => skillReports.get(id)).filter((skill): skill is SkillReport => !!skill)
        const dataCharacter = charMap.get(character.id)
        return {
            id: character.id,
            name: dataCharacter?.名称 ?? String(character.id),
            status: characterStatus(skills),
            mainSkills: skills.slice(0, 3).map(skill => skill.id),
            skillCount: skills.length,
            skills,
        }
    })

    const summary = {
        characters: {
            total: characterReports.length,
            simulated: characterReports.filter(character => character.status === "simulated").length,
            "data-only": characterReports.filter(character => character.status === "data-only").length,
            unsupported: characterReports.filter(character => character.status === "unsupported").length,
        },
        skills: {
            total: skillReports.size,
            simulated: [...skillReports.values()].filter(skill => skill.status === "simulated").length,
            "data-only": [...skillReports.values()].filter(skill => skill.status === "data-only").length,
            unsupported: [...skillReports.values()].filter(skill => skill.status === "unsupported").length,
        },
        manifestCoverage: manifest.coverage,
        u2Coverage: u2?.coverage,
        u2Exporter: u2?.exporter,
    }

    const payload = {
        schemaVersion: 1,
        generatedAt: "2026-11-05",
        gameVersion: manifest.gameVersion,
        classification: {
            simulated: "E/Q 至少有一条 damage / applyBuff / removeBuff 动作",
            "data-only": "没有任何可执行动作（只有字段 / montage / native 副作用）",
            unsupported: "有动作但只有 native / resource / select / summon，缺伤害或增益",
        },
        summary,
        characters: characterReports,
    }
    const matrixPath = path.join(args.outDir, "coverage-matrix.json")
    await mkdir(args.outDir, { recursive: true })
    await writeFile(matrixPath, `${JSON.stringify(payload, null, 4)}\n`, "utf8")

    const lines: string[] = []
    lines.push("# 全角色覆盖表", "")
    lines.push(`- 游戏版本：\`${manifest.gameVersion}\``)
    lines.push(
        `- 角色：${summary.characters.total}（simulated ${summary.characters.simulated} / data-only ${summary.characters["data-only"]} / unsupported ${summary.characters.unsupported}）`
    )
    lines.push(
        `- 技能：${summary.skills.total}（simulated ${summary.skills.simulated} / data-only ${summary.skills["data-only"]} / unsupported ${summary.skills.unsupported}）`
    )
    lines.push("")
    lines.push("## 角色")
    lines.push("")
    lines.push("| 角色 | id | 状态 | 主 E/Q | 技能数 | 缺口 |")
    lines.push("|---|---|---|---|---|---|")
    for (const character of characterReports) {
        const main = character.skills
            .slice(0, 3)
            .map(skill => `${skill.id}:${skill.status}`)
            .join("<br>")
        const gaps = character.skills
            .filter(skill => skill.status !== "simulated")
            .flatMap(skill => skill.reasons.map(reason => `${skill.id} ${reason}`))
        lines.push(
            `| ${character.name} | ${character.id} | ${character.status} | ${main || "-"} | ${character.skillCount} | ${gaps.slice(0, 3).join("<br>") || "-"} |`
        )
    }
    lines.push("")
    lines.push("## 技能明细")
    lines.push("")
    lines.push("| 技能 | id | 槽 | 状态 | 来源 | phases | 动作 | 未知 native | 未匹配 notify | 缺口 |")
    lines.push("|---|---|---|---|---|---|---|---|---|---|")
    for (const skill of [...skillReports.values()].sort((a, b) => a.id - b.id)) {
        const actions = Object.entries(skill.actions)
            .map(([kind, count]) => `${kind}×${count}`)
            .join(" ")
        lines.push(
            `| ${skill.name} | ${skill.id} | ${skill.slot} | ${skill.status} | ${skill.sources.join("/") || "-"} | ${skill.phases}${skill.tickPhases ? ` (tick×${skill.tickPhases})` : ""} | ${actions || "-"} | ${skill.nativeCallsUnknown} | ${skill.unmatchedNotifies.length} | ${skill.reasons.slice(0, 2).join("；") || "-"} |`
        )
    }
    lines.push("")
    lines.push("## U2 覆盖率对照")
    lines.push("")
    const u2Coverage = (u2?.coverage ?? {}) as Record<string, unknown>
    const u2Summary = {
        skillsTotal: u2Coverage.skillsTotal,
        skillsWithMontage: u2Coverage.skillsWithMontage,
        skillsWithBlueprint: u2Coverage.skillsWithBlueprint,
        skillsWithAnimBP: u2Coverage.skillsWithAnimBP,
        skillsWithLuaOnly: u2Coverage.skillsWithLuaOnly,
        montagesResolved: u2Coverage.montagesResolved,
        montagesMissing: Array.isArray(u2Coverage.montagesMissing) ? u2Coverage.montagesMissing.length : undefined,
        blueprintsTotal: u2Coverage.blueprintsTotal,
        animBPsTotal: u2Coverage.animBPsTotal,
    }
    lines.push(`- U2 exporter：\`${JSON.stringify(u2?.exporter ?? null)}\``)
    lines.push(`- U2 coverage（摘要，完整数据见 coverage-matrix.json）：\`${JSON.stringify(u2Summary)}\``)
    lines.push(
        `- manifest coverage：skills ${manifest.coverage.skillsTotal} / montage ${manifest.coverage.skillsWithMontage} / blueprint ${manifest.coverage.skillsWithBlueprint} / animBP ${manifest.coverage.skillsWithAnimBP} / behavior ${manifest.coverage.skillsWithBehavior} / native unknown ${manifest.coverage.nativeCallsUnknown.length}`
    )
    lines.push("- U2 产物没有 `nativeCallsUnknown` 字段，未知 native 计数只能以 manifest 为准。")
    lines.push("")
    await writeFile(path.join(args.outDir, "COVERAGE.md"), `${lines.join("\n")}\n`, "utf8")

    console.log(`[coverage] ${matrixPath}`)
    console.log(`[coverage] ${path.join(args.outDir, "COVERAGE.md")}`)
    console.log(`[coverage] characters=${JSON.stringify(summary.characters)}`)
    console.log(`[coverage] skills=${JSON.stringify(summary.skills)}`)
    return 0
}

process.exit(await main())
