/**
 * 原始 U2 导出产物直接 ingest/build 的回归。
 *
 * fixture 是从真实 `final/skill-behavior.json` 抽取的子集（角色 1101 E/Q + 助战 110001），
 * 保留 U2 形状：顶置 blueprints/animBPs、`lua.effects[].raw.TaskEffects`、负 branching time。
 */

import { describe, expect, test } from "bun:test"
import { buildSkillBehaviorDoc, ingestSkillAsset } from "../src/index"
import { createGameDataIndex } from "../src/pipeline/data-index"
import { RAW_U2_FIXTURE_PATH } from "./helpers"

const index = createGameDataIndex()

describe("原始 U2 文档 ingest", () => {
    test("顶置蓝图/AnimBP 回挂、TaskEffects 展平、负 branching time 被 clamp", async () => {
        const ingest = await ingestSkillAsset(RAW_U2_FIXTURE_PATH, { index })
        expect(ingest.diagnostics.filter(item => item.severity === "error")).toEqual([])
        expect(ingest.ok).toBe(true)

        const asset = ingest.doc
        const e = asset.skills["110101"]!
        const q = asset.skills["110102"]!
        const assist = asset.skills["110001"]!
        expect(e.slot).toBe("E")
        expect(q.slot).toBe("Q")
        expect(assist.slot).toBe("unknown")

        expect(assist.blueprint?.functions?.length).toBeGreaterThan(0)
        expect(assist.animBP).toBeDefined()

        const effects = e.lua?.effects ?? []
        expect(effects.length).toBeGreaterThan(0)
        expect(effects.every(effect => Array.isArray(effect.TaskEffects))).toBe(true)
        expect(effects.some(effect => (effect.TaskEffects ?? []).length > 0)).toBe(true)
        expect(effects.some(effect => "raw" in effect)).toBe(false)

        const branchTimes = (q.montage?.branchingPoints ?? []).map(point => point.time)
        expect(branchTimes.length).toBeGreaterThan(0)
        expect(branchTimes.every(time => time >= 0)).toBe(true)

        const built = buildSkillBehaviorDoc(asset, index)
        expect(built.ok).toBe(true)
        expect(built.doc.coverage.skillsWithBlueprint).toBeGreaterThan(0)
        expect(built.doc.coverage.skillsWithAnimBP).toBeGreaterThan(0)
    })
})
