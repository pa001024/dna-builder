/**
 * 冻结 CharBuild DPS 回归（不是模拟器 parity；模拟器 parity 见 runtime-parity*.test.ts）。
 * 禁止在测试内用同一次 calculate() 现算 expected。
 */

import { describe, expect, test } from "bun:test"
import { createLiseFireBuild } from "dna-builder-data/tests/fixtures/liseFireBuild"
import type { SkillBehaviorManifest } from "../../src/pipeline/types"
import { type ParityFixture, verifyParity } from "../../src/pipeline/verify"
import baselines from "./frozen-baselines.json"

const fixtures = baselines.fixtures as unknown as ParityFixture[]
const manifest = (await Bun.file(new URL("../../generated/manifest.json", import.meta.url)).json()) as SkillBehaviorManifest

describe("CharBuild 冻结回归（非模拟器 parity）", () => {
    test("冻结 fixture 覆盖 5+ 代表角色且包含线上构筑", () => {
        expect(fixtures.length).toBeGreaterThanOrEqual(5)
        expect(new Set(fixtures.map(fixture => fixture.charId)).size).toBeGreaterThanOrEqual(5)
        expect(fixtures.some(fixture => fixture.id === "lise-fire-4103")).toBe(true)
        expect(fixtures.some(fixture => fixture.id === "lizbel-shard-1501")).toBe(true)
    })

    test("当前 CharBuild 与冻结 DPS 偏差 <= 0.1%", async () => {
        const report = await verifyParity(manifest, fixtures, { requireCharacter: true })
        for (const result of report.results) {
            console.log(
                `[parity] ${result.id} expected=${result.expectedDps.toFixed(3)} actual=${result.actualDps.toFixed(3)} drift=${(result.drift * 100).toFixed(6)}%`
            )
        }
        expect(report.errors).toEqual([])
        expect(report.results.every(result => result.ok)).toBe(true)
        expect(report.ok).toBe(true)
    })

    test("线上作者标注锚点保留为溯源信息（不据此设置门禁）", () => {
        // liseFireBuild 注释记录作者标注 28053254998.1983；当前数据复算值随版本变化。
        // 这里只保留标注值并记录当前漂移，不断言漂移“必须存在”（否则会阻止未来修复）。
        const published = baselines.fixtures.find(fixture => fixture.id === "lise-fire-4103")?.publishedExpectedDps
        expect(published).toBe(28053254998.1983)
        const actual = createLiseFireBuild().calculate()
        const drift = Math.abs(actual - published!) / published!
        console.log(`[parity] liseFire published=${published} actual=${actual} drift=${(drift * 100).toFixed(4)}%`)
        expect(Number.isFinite(drift)).toBe(true)
    })
})
