/**
 * IR 运行时 → CharBuild oracle 的逐事件 parity。
 *
 * 对黎瑟 4101 / 赛琪 5301 的 authored E/Q，实际施放并跑 10s；
 * 每条 damage 事件的 raw 伤害必须等于冻结的 CharBuild 字段值（0 漂移）。
 */

import { describe, expect, test } from "bun:test"
import type { BuffApplyEvent, DamageEvent, TargetSelectEvent } from "../../src/core/types"
import { createParityHarness } from "./charbuild-oracle"
import baselines from "./frozen-baselines.json"
import frozen from "./frozen-skill-damage.json"
import { castSkill, characterHarness, loadManifest, mainSlotSkills } from "./helpers"

interface FrozenBuildFixture {
    id: string
    charId: number
    settings: Record<string, unknown>
}

interface SkillDamageEntry {
    fixtureId: string
    charId: number
    skillId: number
    slot: "E" | "Q"
    field: string
    tag: string
    expected: number
}

const manifest = await loadManifest()
const fixtures = baselines.fixtures as unknown as FrozenBuildFixture[]
const entries = frozen.entries as SkillDamageEntry[]

function fixtureFor(charId: number): FrozenBuildFixture {
    const fixture = fixtures.find(item => item.charId === charId && item.id.endsWith("-min"))
    if (!fixture) throw new Error(`缺少角色 ${charId} 的冻结 fixture`)
    return fixture
}

function expectedMap(fixtureId: string): Map<string, number> {
    const result = new Map<string, number>()
    for (const entry of entries.filter(item => item.fixtureId === fixtureId)) {
        result.set(`${entry.slot}|${entry.field}|${entry.tag}`, entry.expected)
    }
    return result
}

function runCharacter(charId: number) {
    const fixture = fixtureFor(charId)
    const parity = createParityHarness(charId, fixture.settings as never)
    const skills = mainSlotSkills(manifest, charId)
    const harness = characterHarness({
        manifest,
        characterId: charId,
        skills: [skills.E, skills.Q].filter((skill): skill is NonNullable<typeof skill> => !!skill),
        duration: 10,
        oracle: parity.oracle,
    })
    castSkill(harness.runtime, skills.E, 0)
    castSkill(harness.runtime, skills.Q, 0)
    const result = harness.runtime.run()
    return { parity, fixture, skills, result }
}

describe("IR 运行时 parity — 黎瑟 4101", () => {
    test("E/Q 的每条伤害事件与冻结 CharBuild 值一致", () => {
        const { parity, fixture, result } = runCharacter(4101)
        const expected = expectedMap(fixture.id)
        const damage = result.events.filter((event): event is DamageEvent => event.kind === "damage")
        expect(damage.length).toBeGreaterThan(0)
        let checked = 0
        for (const event of damage) {
            const resolved = parity.resolve(event.skillField, event.tag)
            if (!resolved) throw new Error(`无法解析 damage 事件：${event.skillField} / ${event.tag}`)
            const baseline = expected.get(`${resolved.slot}|${event.skillField}|${event.tag}`)
            expect(baseline).toBeDefined()
            expect({ field: event.skillField, raw: event.raw }).toEqual({ field: event.skillField, raw: baseline! })
            checked++
        }
        expect(checked).toBe(damage.length)
    })

    test("Q 的电荷循环事件语义保持（10 次选敌 / 正负电荷 / 到期）", () => {
        const { result } = runCharacter(4101)
        const selects = result.events.filter(
            (event): event is TargetSelectEvent => event.kind === "target-select" && event.store === "chargeTarget"
        )
        expect(selects.map(event => Number(event.at.toFixed(3)))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
        const charges = result.events.filter(
            (event): event is BuffApplyEvent => event.kind === "buff-apply" && (event.buffId === 410121 || event.buffId === 410122)
        )
        expect(charges).toHaveLength(10)
        expect(new Set(charges.map(event => event.buffId))).toEqual(new Set([410121, 410122]))
        expect(result.events.some(event => event.kind === "buff-expire" && (event.buffId === 410121 || event.buffId === 410122))).toBe(true)
    })
})

describe("IR 运行时 parity — 赛琪 5301", () => {
    test("E/Q 的每条伤害事件与冻结 CharBuild 值一致", () => {
        const { parity, fixture, result } = runCharacter(5301)
        const expected = expectedMap(fixture.id)
        const damage = result.events.filter((event): event is DamageEvent => event.kind === "damage")
        expect(damage.length).toBeGreaterThan(0)
        for (const event of damage) {
            const resolved = parity.resolve(event.skillField, event.tag)
            if (!resolved) throw new Error(`无法解析 damage 事件：${event.skillField} / ${event.tag}`)
            const baseline = expected.get(`${resolved.slot}|${event.skillField}|${event.tag}`)
            expect(baseline).toBeDefined()
            expect({ field: event.skillField, raw: event.raw }).toEqual({ field: event.skillField, raw: baseline! })
        }
    })

    test("Q 每秒射击与 1.5s 延迟增益", () => {
        const { result } = runCharacter(5301)
        const shots = result.events.filter((event): event is DamageEvent => event.kind === "damage" && event.skillField === "射击伤害")
        expect(shots.map(event => Number(event.at.toFixed(3)))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
        const delayed = result.events.filter((event): event is BuffApplyEvent => event.kind === "buff-apply" && event.buffId === 530101)
        expect(delayed.map(event => Number(event.at.toFixed(3)))).toContain(1.5)
    })
})

describe("黎瑟 / 赛琪 manifest 覆盖", () => {
    test("四个 E/Q 都是 simulated 且带 authored 来源", () => {
        for (const skillId of [410101, 410102, 530101, 530102]) {
            const skill = manifest.skills[String(skillId)]
            expect(skill).toBeDefined()
            expect(skill.sources).toContain("manual")
            const executable = skill.phases.flatMap(phase => phase.actions).filter(action => action.kind !== "native")
            expect(executable.length).toBeGreaterThan(0)
        }
    })
})
