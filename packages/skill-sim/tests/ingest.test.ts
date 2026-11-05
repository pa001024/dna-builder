import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { applyOverrides, type Diagnostic, ingestSkillAsset, loadOverrides, normalizeShard } from "../src/index"
import type { SkillAssetDoc } from "../src/schema/asset"
import { FIXTURE_PATH } from "./helpers"

const TMP_ROOT = path.resolve(import.meta.dir, "../../../.tmp/skill-sim-tests")
let workDir: string

beforeAll(async () => {
    await mkdir(TMP_ROOT, { recursive: true })
    workDir = await mkdtemp(path.join(TMP_ROOT, "ingest-"))
})

afterAll(async () => {
    await rm(workDir, { recursive: true, force: true })
})

function shard(charId: number, skillId: number): SkillAssetDoc {
    return {
        schemaVersion: 1,
        exporter: { gameVersion: "test" },
        characters: [{ id: charId, nameKey: `char-${charId}`, skills: [skillId] }],
        skills: {
            [String(skillId)]: {
                id: skillId,
                characterId: charId,
                lua: { behavior: "" },
            },
        },
        buffs: {},
    }
}

async function writeShard(name: string, doc: unknown): Promise<string> {
    const file = path.join(workDir, name)
    await writeFile(file, JSON.stringify(doc), "utf8")
    return file
}

describe("ingestSkillAsset", () => {
    test("读取单文件样本", async () => {
        const result = await ingestSkillAsset(FIXTURE_PATH)
        expect(result.ok).toBe(true)
        expect(result.files.length).toBe(1)
        expect(Object.keys(result.doc.skills).length).toBe(3)
        expect(Object.keys(result.doc.buffs ?? {}).length).toBe(7)
        expect(result.doc.characters?.[0]?.id).toBe(4101)
    })

    test("读取目录分片并合并角色", async () => {
        const dir = await mkdtemp(path.join(workDir, "shards-"))
        await writeFile(path.join(dir, "1101.json"), JSON.stringify(shard(1101, 110101)), "utf8")
        await writeFile(path.join(dir, "1102.json"), JSON.stringify(shard(1102, 110201)), "utf8")
        const result = await ingestSkillAsset(dir)
        expect(result.ok).toBe(true)
        expect(result.files.length).toBe(2)
        expect(result.doc.characters?.map(character => character.id)).toEqual([1101, 1102])
        expect(Object.keys(result.doc.skills).sort()).toEqual(["110101", "110201"])
    })

    test("分片重复技能 id → error", async () => {
        const dir = await mkdtemp(path.join(workDir, "duplicate-"))
        await writeFile(path.join(dir, "a.json"), JSON.stringify(shard(1101, 110101)), "utf8")
        await writeFile(path.join(dir, "b.json"), JSON.stringify(shard(1101, 110101)), "utf8")
        const result = await ingestSkillAsset(dir)
        expect(result.ok).toBe(false)
        expect(result.diagnostics.some(item => item.code === "ingest.duplicate-skill" && item.severity === "error")).toBe(true)
    })

    test("未知 schemaVersion 的 shard 被跳过并报错", async () => {
        const dir = await mkdtemp(path.join(workDir, "version-"))
        await writeFile(path.join(dir, "bad.json"), JSON.stringify({ schemaVersion: 99, skills: {} }), "utf8")
        await writeFile(path.join(dir, "good.json"), JSON.stringify(shard(1101, 110101)), "utf8")
        const result = await ingestSkillAsset(dir)
        expect(result.ok).toBe(false)
        expect(result.diagnostics.some(item => item.code === "ingest.version" && item.path === "schemaVersion")).toBe(true)
        expect(Object.keys(result.doc.skills)).toEqual(["110101"])
    })

    test("目录扫描跳过 overrides 文件", async () => {
        const dir = await mkdtemp(path.join(workDir, "overrides-scan-"))
        await writeFile(path.join(dir, "1101.json"), JSON.stringify(shard(1101, 110101)), "utf8")
        await writeFile(path.join(dir, "skill-overrides.json"), JSON.stringify({ schemaVersion: 1, skills: {} }), "utf8")
        const result = await ingestSkillAsset(dir)
        expect(result.files.length).toBe(1)
        expect(result.ok).toBe(true)
    })

    test("不存在的输入 → error", async () => {
        const result = await ingestSkillAsset(path.join(workDir, "missing.json"))
        expect(result.ok).toBe(false)
        expect(result.diagnostics[0]?.code).toBe("ingest.missing-input")
    })
})

describe("overrides", () => {
    test("loadOverrides + applyOverrides 写入 authored", async () => {
        const file = await writeShard("skill-overrides.json", {
            schemaVersion: 1,
            skills: { "410101": { note: "手工覆盖", cast: { time: 1.5 } } },
        })
        const loaded = await loadOverrides(file)
        expect(loaded.diagnostics).toEqual([])
        const doc = await ingestSkillAsset(FIXTURE_PATH)
        applyOverrides(doc.doc, loaded.overrides, [])
        expect(doc.doc.skills["410101"]?.authored?.cast?.time).toBe(1.5)
        expect(doc.doc.skills["410101"]?.authored?.note).toBe("手工覆盖")
    })

    test("orphan override 只 warn", async () => {
        const doc = await ingestSkillAsset(FIXTURE_PATH)
        const diagnostics: Diagnostic[] = []
        applyOverrides(doc.doc, { "999999": { note: "x" } }, diagnostics)
        expect(diagnostics[0]?.severity).toBe("warn")
        expect(diagnostics[0]?.code).toBe("ingest.orphan-override")
    })
})

describe("normalizeShard 别名归一", () => {
    test("fmodel 风格 NotifyName / LinkValue / BranchingPointMarkers", () => {
        const diagnostics: Diagnostic[] = []
        const doc = normalizeShard(
            {
                schemaVersion: 1,
                skills: {
                    "1": {
                        id: 1,
                        characterId: 0,
                        montage: {
                            SequenceLength: 2,
                            Notifies: [{ NotifyName: "BP_SkillEffect_C", LinkValue: 0.5 }],
                            BranchingPointMarkers: [{ NotifyName: "BP_SkillEffect_C", LinkValue: 0.5, BranchingPointType: "Begin" }],
                        },
                    },
                },
            },
            "inline",
            diagnostics
        )
        expect(doc?.skills["1"]?.montage?.length).toBe(2)
        expect(doc?.skills["1"]?.montage?.notifies?.[0]?.name).toBe("BP_SkillEffect_C")
        expect(doc?.skills["1"]?.montage?.notifies?.[0]?.time).toBe(0.5)
        expect(doc?.skills["1"]?.montage?.branchingPoints?.[0]?.type).toBe("Begin")
    })
})
