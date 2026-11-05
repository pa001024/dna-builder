#!/usr/bin/env bun
/**
 * @file 一键生成 `generated/`：U2 产物 → 归一 asset → workflow build → 覆盖表。
 *
 * 中间 asset 写在 `.tmp/skill-sim-u7/`（不提交）；`generated/` 只保留
 * manifest.json / coverage.json / coverage-matrix.json / COVERAGE.md。
 */

import path from "node:path"
import process from "node:process"

interface Args {
    input?: string
    outDir: string
    help: boolean
}

function parseArgs(argv: string[]): Args {
    const result: Args = { outDir: "packages/skill-sim/generated", help: false }
    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index]!
        if (arg === "--help") result.help = true
        else if (arg === "--input") result.input = argv[++index]
        else if (arg === "--out") result.outDir = argv[++index]!
        else throw new Error(`未知参数：${arg}`)
    }
    return result
}

function run(command: string[]): void {
    const result = Bun.spawnSync(command, { stdout: "inherit", stderr: "inherit" })
    if (result.exitCode !== 0) throw new Error(`命令失败（${result.exitCode}）：${command.join(" ")}`)
}

const args = parseArgs(process.argv.slice(2))
if (args.help) {
    console.log("用法：bun packages/skill-sim/scripts/build-generated.ts --input <U2/skill-behavior.json> [--out <dir>]")
    process.exit(0)
}
const input = args.input ?? process.env.SKILL_BEHAVIOR_INPUT
if (!input) {
    console.error("缺少 U2 产物路径：--input <final/skill-behavior.json> 或 SKILL_BEHAVIOR_INPUT")
    process.exit(2)
}

const tempDir = path.resolve(".tmp/skill-sim-u7")
const assetPath = path.join(tempDir, "asset.json")
run([
    "bun",
    "packages/skill-sim/scripts/adapt-u2.ts",
    "--input",
    input,
    "--out",
    assetPath,
    "--authored-buffs",
    "packages/skill-sim/fixtures/overrides/authored-buffs.json",
])
run([
    "bun",
    "tools/skill-workflow.ts",
    "build",
    "--input",
    assetPath,
    "--out",
    args.outDir,
    "--overrides",
    "packages/skill-sim/fixtures/overrides/lise-saiqi.json",
])
run(["bun", "packages/skill-sim/scripts/coverage-report.ts", "--out-dir", args.outDir, "--u2-input", input])
// 生成物统一按仓库 Biome 规则格式化，保证 `biome check packages/skill-sim` 通过且可重复。
run([
    process.execPath,
    "x",
    "biome",
    "format",
    "--write",
    "--no-errors-on-unmatched",
    path.join(args.outDir, "manifest.json"),
    path.join(args.outDir, "coverage.json"),
    path.join(args.outDir, "coverage-matrix.json"),
])
console.log(`[build-generated] done -> ${args.outDir}`)
