#!/usr/bin/env bun
/**
 * @file 冻结 CharBuild parity 基线。
 *
 * 生成 `tests/parity/frozen-baselines.json`（构筑级 DPS）与 `frozen-skill-damage.json`
 * （逐技能字段伤害）。基线一旦提交即视为冻结值：`verify` / 测试只重算并与冻结值比对，
 * 不在测试内用同一次 `calculate()` 现算 expected（避免自比对）。
 *
 * 线上构筑（liseFireBuild / shardBuild1）额外记录作者标注的 publishedExpectedDps；
 * 与当前数据不一致时按 drift 记录原因，不静默改写。
 */

import { writeFile } from "node:fs/promises"
import path from "node:path"
import process from "node:process"
import { type CharBuildSettingsInput, createCharBuildFromSettings } from "dna-builder-data/CharBuildHelper"
import { normalizeCharSettings } from "dna-builder-data/charSettings"
import { charMap } from "dna-builder-data/d"
import { createLiseFireBuild, liseFireBuildSettings } from "dna-builder-data/tests/fixtures/liseFireBuild"
import { createShardBuild1, shardBuild1Settings } from "dna-builder-data/tests/fixtures/shardBuild1"

interface DataSkill {
    id: number
    名称: string
    字段?: { 名称: string; tag?: string[] }[]
}

interface FrozenBuildFixture {
    id: string
    charId: number
    label: string
    settings: CharBuildSettingsInput
    expectedDps: number
    tolerance: number
    /** 线上作者标注值（只有已发表构筑有） */
    publishedExpectedDps?: number
    note?: string
}

interface SkillDamageEntry {
    fixtureId: string
    charId: number
    skillId: number
    skillName: string
    /** CharBuild 的 E/Q 槽位命名空间（避免技能名里的标点破坏表达式解析） */
    slot: "E" | "Q"
    field: string
    tag: string
    expected: number
}

const TOLERANCE = 0.001
const DAMAGE_FIELD_EXCLUDE = /半径|范围|提高|降低|减少|加成|比例|转化|持续|次数|数量|概率/

function damageFields(skill: DataSkill) {
    return (skill.字段 ?? []).filter(field => {
        if (!field.名称.includes("伤害")) return false
        if ((field.tag?.length ?? 0) === 0) return false
        return !DAMAGE_FIELD_EXCLUDE.test(field.名称)
    })
}

function mainSkills(charId: number): DataSkill[] {
    const character = charMap.get(charId)
    if (!character?.技能) return []
    return character.技能 as unknown as DataSkill[]
}

function minimalSettings(baseName: string, targetFunction: string, skillLevel: number) {
    return normalizeCharSettings({
        charLevel: 80,
        baseName,
        targetFunction,
        charSkillLevel: [skillLevel, skillLevel, skillLevel],
        enemyLevel: 80,
        enemyResistance: 0,
    })
}

async function main(): Promise<number> {
    const outDir = path.resolve(process.argv[2] ?? "packages/skill-sim/tests/parity")
    const gameVersion = "v1.7.227.1"

    const definitions: { fixture: Omit<FrozenBuildFixture, "expectedDps">; builder: () => { calculate(): number } }[] = [
        {
            fixture: {
                id: "lise-fire-4103",
                charId: 4103,
                label: "黎瑟·浴火 线上推荐构筑（liseFireBuild）",
                settings: liseFireBuildSettings,
                publishedExpectedDps: 28053254998.1983,
                tolerance: TOLERANCE,
                note: "线上作者标注 28053254998.1983；当前仓库数据复算值见 expectedDps，漂移按数据版本变化记录。",
            },
            builder: () => createLiseFireBuild(),
        },
        {
            fixture: {
                id: "lizbel-shard-1501",
                charId: 1501,
                label: "莉兹贝尔 线上构筑（shardBuild1）",
                settings: shardBuild1Settings,
                tolerance: TOLERANCE,
                note: "线上真实构筑快照；expectedDps 为 U7 冻结值。",
            },
            builder: () => createShardBuild1(),
        },
        {
            fixture: {
                id: "lise-4101-min",
                charId: 4101,
                label: "黎瑟 最小合法构筑（涡旋电场::伤害）",
                settings: minimalSettings("涡旋电场", "涡旋电场::伤害", 12),
                tolerance: TOLERANCE,
                note: "最小合法 charSettings；用于 IR 运行时逐事件 parity。",
            },
            builder: () => createCharBuildFromSettings(4101, minimalSettings("涡旋电场", "涡旋电场::伤害", 12)),
        },
        {
            fixture: {
                id: "saiqi-5301-min",
                charId: 5301,
                label: "赛琪 最小合法构筑（抽茧成梦::[幻象]伤害）",
                settings: minimalSettings("抽茧成梦", "抽茧成梦::[幻象]伤害", 12),
                tolerance: TOLERANCE,
                note: "最小合法 charSettings；用于 IR 运行时逐事件 parity。",
            },
            builder: () => createCharBuildFromSettings(5301, minimalSettings("抽茧成梦", "抽茧成梦::[幻象]伤害", 12)),
        },
        {
            fixture: {
                id: "falu-3104-min",
                charId: 3104,
                label: "法露茜 最小合法构筑（坠入黑渊::伤害）",
                settings: minimalSettings("坠入黑渊", "坠入黑渊::伤害", 12),
                tolerance: TOLERANCE,
                note: "复杂资源型角色代表；最小合法 charSettings。",
            },
            builder: () => createCharBuildFromSettings(3104, minimalSettings("坠入黑渊", "坠入黑渊::伤害", 12)),
        },
        {
            fixture: {
                id: "bern-1101-min",
                charId: 1101,
                label: "贝蕾妮卡 最小合法构筑（残光::伤害）",
                settings: minimalSettings("残光", "残光::伤害", 12),
                tolerance: TOLERANCE,
                note: "标准角色代表；最小合法 charSettings。",
            },
            builder: () => createCharBuildFromSettings(1101, minimalSettings("残光", "残光::伤害", 12)),
        },
    ]

    const fixtures: FrozenBuildFixture[] = []
    const skillDamage: SkillDamageEntry[] = []
    for (const { fixture, builder } of definitions) {
        const build = builder()
        const expectedDps = build.calculate()
        fixtures.push({ ...fixture, expectedDps })
        const attrs = (build as unknown as { calculateWeaponAttributes(): unknown }).calculateWeaponAttributes()
        const slots = ["E", "Q"] as const
        for (const [index, skill] of mainSkills(fixture.charId).slice(0, 2).entries()) {
            const slot = slots[index]!
            for (const field of damageFields(skill)) {
                const expected = (
                    build as unknown as { calculateTargetFunction(attrs: unknown, expr: string): number }
                ).calculateTargetFunction(attrs, `${slot}::${field.名称}`)
                if (!Number.isFinite(expected) || expected <= 0) continue
                skillDamage.push({
                    fixtureId: fixture.id,
                    charId: fixture.charId,
                    skillId: skill.id,
                    skillName: skill.名称,
                    slot,
                    field: field.名称,
                    tag: (field.tag ?? []).join(","),
                    expected,
                })
            }
        }
        console.log(`[freeze] ${fixture.id} expectedDps=${expectedDps}`)
    }

    const baselinePayload = {
        schemaVersion: 1,
        generatedAt: "2026-11-05",
        gameVersion,
        generator: "packages/skill-sim/scripts/freeze-parity.ts",
        fixtures,
    }
    const damagePayload = {
        schemaVersion: 1,
        generatedAt: "2026-11-05",
        gameVersion,
        generator: "packages/skill-sim/scripts/freeze-parity.ts",
        entries: skillDamage,
    }
    await writeFile(path.join(outDir, "frozen-baselines.json"), `${JSON.stringify(baselinePayload, null, 4)}\n`, "utf8")
    await writeFile(path.join(outDir, "frozen-skill-damage.json"), `${JSON.stringify(damagePayload, null, 4)}\n`, "utf8")
    const baselineFile = path.join(outDir, "frozen-baselines.json")
    const damageFile = path.join(outDir, "frozen-skill-damage.json")
    const formatted = Bun.spawnSync(
        [process.execPath, "x", "biome", "format", "--write", "--no-errors-on-unmatched", baselineFile, damageFile],
        {
            stdout: "inherit",
            stderr: "inherit",
        }
    )
    if (formatted.exitCode !== 0) throw new Error("biome format 冻结基线失败")
    console.log(`[freeze] ${fixtures.length} fixtures / ${skillDamage.length} skill-damage entries -> ${outDir}`)
    return 0
}

process.exit(await main())
