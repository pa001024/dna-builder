#!/usr/bin/env bun
/**
 * @file U2 导出产物适配器（CLI 薄包装）。
 *
 * 归一逻辑在 `src/pipeline/u2-adapter.ts`，`tools/skill-workflow.ts ingest/build` 也直接使用它，
 * 因此 `build --input <U2>/final/skill-behavior.json` 无需先跑本脚本。
 * 本脚本用于需要落盘 `SkillAssetDoc` 调试/审阅的场景。
 */

import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import process from "node:process"
import { createGameDataIndex } from "../src/pipeline/data-index.ts"
import { normalizeU2Document, type U2AuthoredBuff } from "../src/pipeline/u2-adapter.ts"

function usage(): string {
    return [
        "用法：bun packages/skill-sim/scripts/adapt-u2.ts --input <final/skill-behavior.json> --out <asset.json> [--authored-buffs <file>]",
        "",
        "把 U2 导出器产物归一成 U3 `SkillAssetDoc`；不写游戏语义，不修改导出数据。",
    ].join("\n")
}

function parseArgs(argv: string[]): { input?: string; out?: string; authoredBuffs?: string; help: boolean } {
    const result: { input?: string; out?: string; authoredBuffs?: string; help: boolean } = { help: false }
    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index]!
        if (arg === "--help" || arg === "-h") result.help = true
        else if (arg === "--input") result.input = argv[++index]
        else if (arg === "--out") result.out = argv[++index]
        else if (arg === "--authored-buffs") result.authoredBuffs = argv[++index]
        else throw new Error(`未知参数：${arg}`)
    }
    return result
}

async function main(): Promise<number> {
    const args = parseArgs(process.argv.slice(2))
    if (args.help || !args.input || !args.out) {
        console.log(usage())
        return args.help ? 0 : 2
    }
    const source = JSON.parse(await readFile(args.input, "utf8")) as unknown
    const authoredBuffs = args.authoredBuffs ? ((await readFile(args.authoredBuffs, "utf8").then(JSON.parse)) as U2AuthoredBuff[]) : []
    const { doc, diagnostics } = normalizeU2Document(source, { index: createGameDataIndex(), authoredBuffs })
    const errors = diagnostics.filter(item => item.severity === "error")
    if (errors.length > 0) {
        for (const item of errors) console.error(`[adapt-u2] ${item.code} ${item.path}: ${item.message}`)
        return 1
    }
    await mkdir(path.dirname(path.resolve(args.out)), { recursive: true })
    await writeFile(args.out, `${JSON.stringify(doc)}\n`, "utf8")
    console.log(`[adapt-u2] ${args.out}`)
    console.log(
        `  ${JSON.stringify({
            characters: doc.characters?.length ?? 0,
            skills: Object.keys(doc.skills).length,
            linkedBlueprints: Object.values(doc.skills).filter(skill => skill.blueprint).length,
            linkedAnimBPs: Object.values(doc.skills).filter(skill => skill.animBP).length,
            buffs: Object.keys(doc.buffs ?? {}).length,
        })}`
    )
    return 0
}

process.exit(await main())
