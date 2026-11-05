import { describe, expect, test } from "bun:test"
import { createManifest, loadParityFixtures, type ParityFixture, verifyParity } from "../src/index"
import { minimalBehaviorDoc, PARITY_FIXTURE_PATH } from "./helpers"

const manifest = createManifest(minimalBehaviorDoc(), [])

function fixture(overrides: Partial<ParityFixture> = {}): ParityFixture {
    return {
        id: "case",
        charId: 4101,
        settings: {},
        expectedDps: 100,
        ...overrides,
    }
}

describe("verifyParity", () => {
    test("漂移 0 → 通过", async () => {
        const report = await verifyParity(manifest, [fixture()], { calculate: () => 100 })
        expect(report.ok).toBe(true)
        expect(report.results[0]?.drift).toBe(0)
        expect(report.errors).toEqual([])
    })

    test("超过 0.1% → 失败", async () => {
        const report = await verifyParity(manifest, [fixture()], { calculate: () => 101 })
        expect(report.ok).toBe(false)
        expect(report.results[0]?.ok).toBe(false)
        expect(report.results[0]?.allowed).toBe(false)
    })

    test("容差内 → 通过（0.05%）", async () => {
        const report = await verifyParity(manifest, [fixture()], { calculate: () => 100.05 })
        expect(report.ok).toBe(true)
    })

    test("--allow-drift 放行但记录", async () => {
        const report = await verifyParity(manifest, [fixture()], { calculate: () => 120, allowDrift: true })
        expect(report.ok).toBe(true)
        expect(report.results[0]?.ok).toBe(false)
        expect(report.results[0]?.allowed).toBe(true)
    })

    test("fixture 角色不在 manifest：默认只 warn", async () => {
        const report = await verifyParity(manifest, [fixture({ charId: 9999 })], { calculate: () => 100 })
        expect(report.ok).toBe(true)
        expect(report.warnings.some(item => item.code === "verify.unknown-character")).toBe(true)
    })

    test("requireCharacter → error 并跳过", async () => {
        const report = await verifyParity(manifest, [fixture({ charId: 9999 })], { calculate: () => 100, requireCharacter: true })
        expect(report.ok).toBe(false)
        expect(report.errors.some(item => item.code === "verify.unknown-character")).toBe(true)
        expect(report.results).toEqual([])
    })

    test("calculate 抛错 → error", async () => {
        const report = await verifyParity(manifest, [fixture()], {
            calculate: () => {
                throw new Error("boom")
            },
        })
        expect(report.ok).toBe(false)
        expect(report.errors[0]?.code).toBe("verify.calculate")
    })

    test("fixture 形状非法 → error", async () => {
        const report = await verifyParity(manifest, [{ id: "bad" } as ParityFixture], { calculate: () => 1 })
        expect(report.ok).toBe(false)
        expect(report.errors[0]?.code).toBe("verify.fixture")
    })

    test("smoke：packages/data 线上夹具自比对（默认 calculate）", async () => {
        const loaded = await loadParityFixtures(PARITY_FIXTURE_PATH)
        expect(loaded.diagnostics).toEqual([])
        const report = await verifyParity(manifest, loaded.fixtures)
        expect(report.results.length).toBe(1)
        expect(report.results[0]?.ok).toBe(true)
        expect(report.results[0]?.drift).toBe(0)
        expect(report.ok).toBe(true)
    })
})
