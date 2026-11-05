/**
 * 逐技能字段 parity：
 * 1. 冻结值 vs 当前 CharBuild `calculateTargetFunction()`；
 * 2. 冻结值 vs core 的 DamageOracle 路径（模拟事件 raw），验证字段/tag 接线。
 *
 * 冻结值来自 `scripts/freeze-parity.ts`，测试内不现算 expected。
 */

import { describe, expect, test } from "bun:test"
import { createSimulation } from "../../src/core/simulation"
import { createParityHarness } from "./charbuild-oracle"
import baselines from "./frozen-baselines.json"
import frozen from "./frozen-skill-damage.json"

interface FrozenBuildFixture {
    id: string
    charId: number
    settings: Record<string, unknown>
}

interface SkillDamageEntry {
    fixtureId: string
    charId: number
    skillId: number
    skillName: string
    slot: "E" | "Q"
    field: string
    tag: string
    expected: number
}

const fixtures = new Map((baselines.fixtures as unknown as FrozenBuildFixture[]).map(fixture => [fixture.id, fixture]))
const entries = frozen.entries as SkillDamageEntry[]
const EPSILON = 1e-9

function drift(actual: number, expected: number): number {
    return Math.abs(actual - expected) / Math.max(Math.abs(expected), EPSILON)
}

describe("逐技能字段 parity — 冻结 CharBuild 值", () => {
    test("冻结条目覆盖 5+ 角色且包含黎瑟/赛琪", () => {
        expect(new Set(entries.map(entry => entry.charId)).size).toBeGreaterThanOrEqual(5)
        expect(entries.some(entry => entry.charId === 4101)).toBe(true)
        expect(entries.some(entry => entry.charId === 5301)).toBe(true)
    })

    test("每个冻结字段的当前 CharBuild 值偏差为 0（float 精确）", () => {
        const harnesses = new Map<number, ReturnType<typeof createParityHarness>>()
        let checked = 0
        for (const entry of entries) {
            const fixture = fixtures.get(entry.fixtureId)
            expect(fixture).toBeDefined()
            let harness = harnesses.get(entry.charId)
            if (!harness) {
                harness = createParityHarness(entry.charId, fixture!.settings as never)
                harnesses.set(entry.charId, harness)
            }
            const actual = harness.damageFor(entry.slot, entry.field)
            expect({ field: entry.field, drift: drift(actual, entry.expected) }).toEqual({ field: entry.field, drift: 0 })
            checked++
        }
        expect(checked).toBe(entries.length)
    })

    test("DamageOracle 路径与冻结值一致", () => {
        const byFixture = new Map<string, SkillDamageEntry[]>()
        for (const entry of entries) byFixture.set(entry.fixtureId, [...(byFixture.get(entry.fixtureId) ?? []), entry])
        for (const [fixtureId, list] of byFixture) {
            const fixture = fixtures.get(fixtureId)!
            const harness = createParityHarness(fixture.charId, fixture.settings as never)
            // 同一 (field, tag) 只发一条命令：oracle 缓存键含 at+field+tag，重复值无法区分。
            const unique = new Map<string, SkillDamageEntry>()
            for (const entry of list) {
                const key = `${entry.field}|${entry.tag}`
                if (!unique.has(key)) unique.set(key, entry)
            }
            const simulation = createSimulation({
                duration: 1,
                dt: 1 / 60,
                seed: 1,
                actors: [{ id: "a", characterId: fixture.charId, resources: {} }],
                enemies: [{ id: "e", hp: 1e15 }],
                oracle: harness.oracle,
            })
            for (const entry of unique.values()) {
                simulation.schedule(0, {
                    kind: "damage",
                    actorId: "a",
                    skillField: entry.field,
                    tag: entry.tag,
                    target: { kind: "primary" },
                })
            }
            const result = simulation.run()
            const damage = result.events.filter(event => event.kind === "damage")
            expect(damage.length).toBe(unique.size)
            for (const event of damage) {
                if (event.kind !== "damage") continue
                const entry = unique.get(`${event.skillField}|${event.tag}`)
                expect(entry).toBeDefined()
                expect({ field: event.skillField, drift: drift(event.raw, entry!.expected) }).toEqual({ field: event.skillField, drift: 0 })
            }
        }
    })
})
