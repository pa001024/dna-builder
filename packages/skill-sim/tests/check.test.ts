import { beforeAll, describe, expect, test } from "bun:test"
import {
    buildSkillBehaviorDoc,
    checkManifest,
    createManifest,
    ingestSkillAsset,
    isStrictFatal,
    type SkillBehaviorManifest,
} from "../src/index"
import { createGameDataIndex } from "../src/pipeline/data-index"
import { clone, FIXTURE_PATH } from "./helpers"

let manifest: SkillBehaviorManifest

beforeAll(async () => {
    const ingest = await ingestSkillAsset(FIXTURE_PATH)
    const built = buildSkillBehaviorDoc(ingest.doc, createGameDataIndex())
    manifest = createManifest(built.doc, built.diagnostics)
})

describe("checkManifest", () => {
    test("样本 manifest + --simulated 角色 id 展开 → 通过", () => {
        const result = checkManifest(manifest, { simulated: ["4101"], strict: true, index: createGameDataIndex() })
        expect(result.errors).toEqual([])
        expect(result.ok).toBe(true)
        expect(result.stats.simulatedRequested).toBe(3)
        expect(result.stats.simulatedSatisfied).toBe(3)
        expect(result.stats.skillsWithActions).toBe(3)
    })

    test("--simulated 技能缺行为 → gate.missing-behavior", () => {
        const broken = clone(manifest) as SkillBehaviorManifest
        broken.skills["410103"]!.phases = []
        const result = checkManifest(broken, { simulated: ["410103"] })
        expect(result.ok).toBe(false)
        expect(result.errors.some(item => item.code === "gate.missing-behavior" && item.path === "skills.410103")).toBe(true)
    })

    test("未知 buff 引用 → gate.unknown-buff", () => {
        const broken = clone(manifest) as SkillBehaviorManifest
        delete broken.buffs["410121"]
        const result = checkManifest(broken, { index: createGameDataIndex() })
        expect(result.ok).toBe(false)
        expect(result.errors.some(item => item.code === "gate.unknown-buff")).toBe(true)
    })

    test("重复技能 id → gate.duplicate-skill", () => {
        const broken = clone(manifest) as SkillBehaviorManifest
        broken.characters[0]!.skills.push(410101)
        const result = checkManifest(broken)
        expect(result.ok).toBe(false)
        expect(result.errors.some(item => item.code === "gate.duplicate-skill")).toBe(true)
    })

    test("未知角色引用 → gate.unknown-character", () => {
        const broken = clone(manifest) as SkillBehaviorManifest
        broken.characters.push({ id: 999999, nameKey: "phantom", skills: [] })
        const result = checkManifest(broken, { index: createGameDataIndex() })
        expect(result.errors.some(item => item.code === "gate.unknown-character")).toBe(true)
    })

    test("strict 把 ref.* warn 升级；覆盖率 warn 不升级", () => {
        const withWarnings = clone(manifest) as SkillBehaviorManifest
        withWarnings.diagnostics.push(
            { severity: "warn", code: "build.no-actions", path: "skills.1", message: "覆盖提示" },
            { severity: "warn", code: "ref.unknown-field", path: "skills.2", message: "引用问题" }
        )
        const lenient = checkManifest(withWarnings)
        expect(lenient.ok).toBe(true)
        expect(lenient.strictFailures).toEqual([])

        const strict = checkManifest(withWarnings, { strict: true })
        expect(strict.ok).toBe(false)
        expect(strict.strictFailures.map(item => item.code)).toEqual(["ref.unknown-field"])
    })

    test("isStrictFatal 口径", () => {
        expect(isStrictFatal({ severity: "warn", code: "build.no-actions", path: "", message: "" })).toBe(false)
        expect(isStrictFatal({ severity: "warn", code: "schema.unknown-field", path: "", message: "" })).toBe(false)
        expect(isStrictFatal({ severity: "warn", code: "schema.reference", path: "", message: "" })).toBe(true)
        expect(isStrictFatal({ severity: "warn", code: "ref.unknown-buff", path: "", message: "" })).toBe(true)
    })

    test("空 manifest → gate.empty-manifest", () => {
        const empty = clone(manifest) as SkillBehaviorManifest
        empty.skills = {}
        empty.characters = []
        empty.coverage = { ...empty.coverage, skillsTotal: 0, skillsWithBehavior: 0 }
        const result = checkManifest(empty)
        expect(result.errors.some(item => item.code === "gate.empty-manifest")).toBe(true)
    })
})
