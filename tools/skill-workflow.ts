#!/usr/bin/env bun
/**
 * @file skill-workflow —— 技能行为数据流水线 CLI。
 *
 * 四个阶段：
 *   ingest  导出器 SkillAssetDoc（单文件 / 按角色分片）→ 归一后的资产文档 JSON
 *   build   资产文档 + packages/data → SkillBehaviorIR manifest + coverage
 *   check   manifest 门禁（引用 / 重复 / --simulated 缺行为）
 *   verify  CharBuild parity fixtures
 *
 * 退出码：0 成功；1 校验 / 门禁失败；2 用法错误。
 * 用法：bun tools/skill-workflow.ts <command> --help
 */

import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import process from "node:process"
import {
    applyOverrides,
    buildSkillBehaviorDoc,
    checkManifest,
    createManifest,
    ingestSkillAsset,
    isStrictFatal,
    loadOverrides,
    loadParityFixtures,
    readManifest,
    serializeCoverage,
    serializeManifest,
    verifyParity,
} from "../packages/skill-sim/src/index.ts"
import { createGameDataIndex } from "../packages/skill-sim/src/pipeline/data-index.ts"
import type { Diagnostic } from "../packages/skill-sim/src/pipeline/types.ts"
import type { U2AuthoredBuff } from "../packages/skill-sim/src/pipeline/u2-adapter.ts"

const VALUE_FLAGS = new Set(["input", "out", "overrides", "simulated", "manifest", "fixtures", "authored-buffs"])
const BOOLEAN_FLAGS = new Set(["json", "strict", "allow-drift", "help"])
const COMMANDS = ["ingest", "build", "check", "verify"] as const
type Command = (typeof COMMANDS)[number]

interface ParsedArgs {
    command?: string
    flags: Map<string, string | boolean>
    errors: string[]
    help: boolean
}

function parseArgs(argv: string[]): ParsedArgs {
    const flags = new Map<string, string | boolean>()
    const errors: string[] = []
    let command: string | undefined
    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index]!
        if (!arg.startsWith("--")) {
            if (!command) command = arg
            else errors.push(`多余的参数：${arg}`)
            continue
        }
        const [rawKey, inlineValue] = arg.slice(2).split("=", 2)
        const key = rawKey!
        if (BOOLEAN_FLAGS.has(key)) {
            if (inlineValue !== undefined) errors.push(`--${key} 不接受值`)
            flags.set(key, true)
            continue
        }
        if (!VALUE_FLAGS.has(key)) {
            errors.push(`未知参数 --${key}`)
            continue
        }
        const value = inlineValue ?? argv[++index]
        if (value === undefined || value.startsWith("--")) {
            errors.push(`--${key} 需要一个值`)
            continue
        }
        flags.set(key, value)
    }
    return { command, flags, errors, help: flags.has("help") }
}

function stringFlag(parsed: ParsedArgs, key: string): string | undefined {
    const value = parsed.flags.get(key)
    return typeof value === "string" ? value : undefined
}

function boolFlag(parsed: ParsedArgs, key: string): boolean {
    return parsed.flags.get(key) === true
}

function usage(): string {
    return [
        "用法：bun tools/skill-workflow.ts <command> [options]",
        "",
        "命令：",
        "  ingest --input <file|dir> [--out <file>] [--overrides <file>] [--authored-buffs <file>]",
        "  build  --input <file|dir> --out <dir> [--overrides <file>] [--authored-buffs <file>] [--strict]",
        "  check  --input <dir|manifest.json> [--simulated <id,...>] [--strict]",
        "  verify --manifest <manifest.json> --fixtures <file> [--allow-drift]",
        "",
        "通用：--json 输出机器可读 JSON；--help 显示本帮助",
        "退出码：0 成功 / 1 校验失败 / 2 用法错误",
    ].join("\n")
}

function emitJson(payload: unknown): void {
    console.log(JSON.stringify(payload, null, 4))
}

function diagnosticLine(item: Diagnostic): string {
    const location = item.path ? `${item.path}: ` : ""
    return `[${item.severity}] ${item.code} ${location}${item.message}`
}

function printDiagnostics(diagnostics: readonly Diagnostic[], limit = 20): void {
    for (const item of diagnostics.slice(0, limit)) console.log(`  ${diagnosticLine(item)}`)
    if (diagnostics.length > limit) console.log(`  … 另有 ${diagnostics.length - limit} 条`)
}

function countBySeverity(diagnostics: readonly Diagnostic[]): { errors: number; warnings: number } {
    return {
        errors: diagnostics.filter(item => item.severity === "error").length,
        warnings: diagnostics.filter(item => item.severity === "warn").length,
    }
}

async function resolveManifestPath(input: string): Promise<string> {
    const info = await stat(input)
    return info.isDirectory() ? path.join(input, "manifest.json") : input
}

async function readJsonFile(file: string): Promise<unknown> {
    return JSON.parse(await readFile(file, "utf8"))
}

function parseSimulated(value: string | undefined): (number | string)[] {
    if (!value) return []
    return value
        .split(",")
        .map(item => item.trim())
        .filter(Boolean)
        .map(item => (/^-?\d+$/.test(item) ? Number(item) : item))
}

async function readAuthoredBuffs(file: string | undefined): Promise<U2AuthoredBuff[]> {
    if (!file) return []
    return (await readJsonFile(file)) as U2AuthoredBuff[]
}

async function commandIngest(parsed: ParsedArgs): Promise<number> {
    const input = stringFlag(parsed, "input")
    if (!input) return usageError("ingest 需要 --input")
    const out = stringFlag(parsed, "out")
    const overridesFile = stringFlag(parsed, "overrides")
    const result = await ingestSkillAsset(input, {
        index: createGameDataIndex(),
        authoredBuffs: await readAuthoredBuffs(stringFlag(parsed, "authored-buffs")),
    })
    const diagnostics = [...result.diagnostics]
    if (overridesFile) {
        const loaded = await loadOverrides(overridesFile)
        diagnostics.push(...loaded.diagnostics)
        if (Object.keys(loaded.overrides).length > 0) applyOverrides(result.doc, loaded.overrides, diagnostics)
    }
    const counts = {
        characters: result.doc.characters?.length ?? 0,
        skills: Object.keys(result.doc.skills).length,
        buffs: Object.keys(result.doc.buffs ?? {}).length,
    }
    const ok = !diagnostics.some(item => item.severity === "error")
    if (out && ok) {
        await mkdir(path.dirname(path.resolve(out)), { recursive: true })
        await writeFile(out, `${JSON.stringify(result.doc, null, 4)}\n`, "utf8")
    }
    const severity = countBySeverity(diagnostics)
    if (boolFlag(parsed, "json")) {
        emitJson({ command: "ingest", ok, input, out: out ?? null, files: result.files, counts, diagnostics })
    } else {
        console.log(`[skill-workflow] ingest ${ok ? "✔" : "✘"}`)
        console.log(`  input    ${input}`)
        console.log(`  files    ${result.files.length}`)
        console.log(`  content  characters ${counts.characters} / skills ${counts.skills} / buffs ${counts.buffs}`)
        if (out) console.log(`  output   ${out}`)
        console.log(`  diagnostics  errors ${severity.errors} / warnings ${severity.warnings}`)
        printDiagnostics(diagnostics)
    }
    return ok ? 0 : 1
}

async function commandBuild(parsed: ParsedArgs): Promise<number> {
    const input = stringFlag(parsed, "input")
    const out = stringFlag(parsed, "out")
    if (!input) return usageError("build 需要 --input")
    if (!out) return usageError("build 需要 --out <dir>")
    const overridesFile = stringFlag(parsed, "overrides")
    const index = createGameDataIndex()
    const ingest = await ingestSkillAsset(input, {
        index,
        authoredBuffs: await readAuthoredBuffs(stringFlag(parsed, "authored-buffs")),
    })
    const diagnostics: Diagnostic[] = [...ingest.diagnostics]
    if (overridesFile) {
        const loaded = await loadOverrides(overridesFile)
        diagnostics.push(...loaded.diagnostics)
        if (Object.keys(loaded.overrides).length > 0) applyOverrides(ingest.doc, loaded.overrides, diagnostics)
    }
    const built = buildSkillBehaviorDoc(ingest.doc, index)
    diagnostics.push(...built.diagnostics)
    const manifest = createManifest(built.doc, diagnostics)
    const severity = countBySeverity(diagnostics)
    const strictFailures = boolFlag(parsed, "strict") ? diagnostics.filter(isStrictFatal) : []
    const ok = severity.errors === 0 && strictFailures.length === 0

    await mkdir(out, { recursive: true })
    const manifestPath = path.join(out, "manifest.json")
    const coveragePath = path.join(out, "coverage.json")
    await writeFile(manifestPath, serializeManifest(manifest), "utf8")
    await writeFile(coveragePath, serializeCoverage(manifest, diagnostics), "utf8")

    if (boolFlag(parsed, "json")) {
        emitJson({
            command: "build",
            ok,
            input,
            files: ingest.files,
            out,
            manifest: manifestPath,
            coverage: coveragePath,
            coverageReport: manifest.coverage,
            diagnostics,
            strictFailures,
        })
    } else {
        const coverage = manifest.coverage
        console.log(`[skill-workflow] build ${ok ? "✔" : "✘"}`)
        console.log(`  input    ${input} (${ingest.files.length} file${ingest.files.length === 1 ? "" : "s"})`)
        console.log(`  output   ${manifestPath}`)
        console.log(`           ${coveragePath}`)
        console.log(
            `  skills   ${coverage.skillsWithBehavior}/${coverage.skillsTotal} with behavior` +
                ` (montage ${coverage.skillsWithMontage}, blueprint ${coverage.skillsWithBlueprint}, lua ${coverage.skillsWithLua}, authored ${coverage.skillsAuthored})`
        )
        console.log(`  native   ${coverage.nativeCallsTotal} calls, unknown ${coverage.nativeCallsUnknown.length}`)
        if (coverage.nativeCallsUnknown.length > 0) console.log(`           ${coverage.nativeCallsUnknown.join(", ")}`)
        if (coverage.unmatchedNotifies.length > 0) console.log(`  notify   unmatched: ${coverage.unmatchedNotifies.join(", ")}`)
        if (coverage.unknownTaskFunctions.length > 0) console.log(`  lua      unknown: ${coverage.unknownTaskFunctions.join(", ")}`)
        console.log(`  diagnostics  errors ${severity.errors} / warnings ${severity.warnings}`)
        printDiagnostics(diagnostics)
        if (strictFailures.length > 0) console.log(`  --strict 失败：${strictFailures.length} 条 warn 被升级`)
    }
    return ok ? 0 : 1
}

async function commandCheck(parsed: ParsedArgs): Promise<number> {
    const input = stringFlag(parsed, "input")
    if (!input) return usageError("check 需要 --input <dir|manifest.json>")
    const manifestPath = await resolveManifestPath(input).catch(() => undefined)
    if (!manifestPath) return usageError(`找不到 ${input}`)
    let raw: unknown
    try {
        raw = await readJsonFile(manifestPath)
    } catch (error) {
        console.error(`[skill-workflow] 读取 manifest 失败：${String(error)}`)
        return 1
    }
    const read = readManifest(raw)
    if (!read.manifest) {
        if (boolFlag(parsed, "json")) emitJson({ command: "check", ok: false, input, diagnostics: read.diagnostics })
        else printDiagnostics(read.diagnostics)
        return 1
    }
    const result = checkManifest(read.manifest, {
        simulated: parseSimulated(stringFlag(parsed, "simulated")),
        strict: boolFlag(parsed, "strict"),
        index: createGameDataIndex(),
    })
    if (boolFlag(parsed, "json")) {
        emitJson({
            command: "check",
            ok: result.ok,
            input,
            manifest: manifestPath,
            coverage: result.coverage,
            stats: result.stats,
            errors: result.errors,
            warnings: result.warnings,
            strictFailures: result.strictFailures,
            diagnostics: read.diagnostics,
        })
    } else {
        const coverage = result.coverage
        console.log(`[skill-workflow] check ${result.ok ? "✔" : "✘"}`)
        console.log(`  manifest ${manifestPath}`)
        console.log(
            `  skills   ${result.stats.skillsWithActions}/${result.stats.skillsTotal} with actions` +
                ` (without ${result.stats.skillsWithoutActions})`
        )
        console.log(
            `  coverage montage ${coverage.skillsWithMontage} / blueprint ${coverage.skillsWithBlueprint} / lua ${coverage.skillsWithLua}`
        )
        if (result.stats.simulatedRequested > 0) {
            console.log(`  simulated ${result.stats.simulatedSatisfied}/${result.stats.simulatedRequested} satisfied`)
        }
        console.log(`  errors   ${result.errors.length} / warnings ${result.warnings.length}`)
        printDiagnostics([...result.errors, ...result.warnings])
        if (result.strictFailures.length > 0) console.log(`  --strict 失败：${result.strictFailures.length} 条`)
    }
    return result.ok ? 0 : 1
}

async function commandVerify(parsed: ParsedArgs): Promise<number> {
    const manifestFile = stringFlag(parsed, "manifest")
    const fixturesFile = stringFlag(parsed, "fixtures")
    if (!manifestFile) return usageError("verify 需要 --manifest")
    if (!fixturesFile) return usageError("verify 需要 --fixtures")
    const read = readManifest(await readJsonFile(manifestFile))
    if (!read.manifest) {
        printDiagnostics(read.diagnostics)
        return 1
    }
    const loaded = await loadParityFixtures(fixturesFile)
    if (loaded.diagnostics.some(item => item.severity === "error")) {
        printDiagnostics(loaded.diagnostics)
        return 1
    }
    const report = await verifyParity(read.manifest, loaded.fixtures, { allowDrift: boolFlag(parsed, "allow-drift") })
    const reportDiagnostics = [...report.errors, ...report.warnings]
    if (boolFlag(parsed, "json")) {
        emitJson({
            command: "verify",
            ok: report.ok,
            manifest: manifestFile,
            fixtures: fixturesFile,
            results: report.results,
            diagnostics: reportDiagnostics,
        })
    } else {
        console.log(`[skill-workflow] verify ${report.ok ? "✔" : "✘"}`)
        for (const result of report.results) {
            const percent = (result.drift * 100).toFixed(4)
            const state = result.ok ? "ok" : result.allowed ? "drift(allowed)" : "FAIL"
            console.log(
                `  ${result.id.padEnd(20)} expected ${result.expectedDps.toFixed(3)} actual ${result.actualDps.toFixed(3)}` +
                    ` drift ${percent}% (tol ${(result.tolerance * 100).toFixed(2)}%) ${state}`
            )
        }
        printDiagnostics(reportDiagnostics)
    }
    return report.ok ? 0 : 1
}

function usageError(message: string): number {
    console.error(`[skill-workflow] ${message}`)
    console.error(usage())
    return 2
}

async function main(): Promise<number> {
    const parsed = parseArgs(process.argv.slice(2))
    if (parsed.help || (!parsed.command && parsed.errors.length === 0)) {
        console.log(usage())
        return parsed.command || parsed.help ? 0 : 2
    }
    if (parsed.errors.length > 0) return usageError(parsed.errors.join("；"))
    if (!parsed.command || !COMMANDS.includes(parsed.command as Command)) {
        return usageError(parsed.command ? `未知命令：${parsed.command}` : "缺少命令")
    }
    try {
        switch (parsed.command as Command) {
            case "ingest":
                return await commandIngest(parsed)
            case "build":
                return await commandBuild(parsed)
            case "check":
                return await commandCheck(parsed)
            case "verify":
                return await commandVerify(parsed)
        }
    } catch (error) {
        console.error(`[skill-workflow] 执行失败：${String(error)}`)
        return 1
    }
}

process.exit(await main())
