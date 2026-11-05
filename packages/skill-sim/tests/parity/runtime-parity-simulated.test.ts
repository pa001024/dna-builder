/**
 * 全部 simulated 角色的 IR 运行时 → CharBuild 逐事件/总伤害 parity。
 *
 * 与 `baselines.test.ts` 的冻结 CharBuild 回归不同：这里实际施放 manifest 里的 E/Q，
 * 逐条 damage 事件用 CharBuild 现场计算（`calculateTargetFunction`）比对，并核对总伤害。
 * 有 6 个 simulated 角色只有 buff 类可执行动作、不产生 damage 事件；对其断言运行时确实产生
 * 非 cast 事件（结构性 parity），而不是用 0 伤害冒充数值 parity。
 */

import { describe, expect, test } from "bun:test"
import type { DamageEvent } from "../../src/core/types"
import { createParityHarness, minimalParitySettings } from "./charbuild-oracle"
import { castSkill, characterHarness, loadManifest, mainSlotSkills, simulatedCharacters } from "./helpers"

const EXPECTED_SIMULATED = [1101, 1201, 1501, 1504, 3103, 3201, 4101, 4102, 4103, 5301, 5401]
const manifest = await loadManifest()
const simulated = simulatedCharacters(manifest)

describe("IR 运行时 parity — 全部 simulated 角色", () => {
    test("simulated 角色集合与冻结清单一致（11 个）", () => {
        expect(simulated).toEqual(EXPECTED_SIMULATED)
    })

    for (const charId of simulated) {
        test(`${charId}：E/Q 逐事件与总伤害对 CharBuild`, () => {
            const parity = createParityHarness(charId, minimalParitySettings(charId))
            const skills = mainSlotSkills(manifest, charId)
            const harness = characterHarness({
                manifest,
                characterId: charId,
                skills: [skills.E, skills.Q].filter((skill): skill is NonNullable<typeof skill> => !!skill),
                duration: 10,
                oracle: parity.oracle,
            })
            expect(castSkill(harness.runtime, skills.E, 0)).toBe(true)
            expect(castSkill(harness.runtime, skills.Q, 0)).toBe(true)
            const result = harness.runtime.run()
            const damage = result.events.filter((event): event is DamageEvent => event.kind === "damage")

            let expectedTotal = 0
            for (const event of damage) {
                const resolved = parity.resolve(event.skillField, event.tag)
                if (!resolved) throw new Error(`${charId} 无法解析 damage 事件：${event.skillField} / ${event.tag}`)
                const expected = parity.damageFor(resolved.slot, resolved.field)
                expectedTotal += expected
                expect({ field: event.skillField, raw: event.raw }).toEqual({ field: event.skillField, raw: expected })
            }
            const actualTotal = damage.reduce((sum, event) => sum + event.raw, 0)
            expect(actualTotal).toBe(expectedTotal)

            if (damage.length === 0) {
                // buff-only 角色：没有伤害可对，但必须真的执行了非 cast 动作。
                const nonCast = result.events.filter(event => event.kind !== "cast")
                expect(nonCast.length).toBeGreaterThan(0)
            } else {
                expect(damage.length).toBeGreaterThan(0)
            }
            console.log(`[runtime-parity] ${charId} damage=${damage.length} total=${actualTotal}`)
        })
    }
})
