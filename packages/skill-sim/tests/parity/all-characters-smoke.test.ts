/**
 * 全角色 5s 施放 smoke：34 角色 × E/Q，断言不崩溃、产生 cast 事件、manifest 有覆盖记录。
 *
 * 使用固定伤害 oracle，专门度量「IR 调度 + core」的性能，不含 CharBuild 冷启动。
 */

import { describe, expect, test } from "bun:test"
import type { CastEvent } from "../../src/core/types"
import { castSkill, characterHarness, loadManifest, mainSlotSkills, simulatedCharacters } from "./helpers"

const manifest = await loadManifest()
const simulated = new Set(simulatedCharacters(manifest))

describe("全角色 5s 施放 smoke", () => {
    test("34 角色 / 169 个主技能：E/Q 全部可施放且无崩溃", () => {
        expect(manifest.characters).toHaveLength(34)
        expect(manifest.characters.reduce((sum, character) => sum + character.skills.length, 0)).toBe(169)
        const started = performance.now()
        const failures: string[] = []
        const results: string[] = []
        for (const character of manifest.characters) {
            const skills = mainSlotSkills(manifest, character.id)
            const skillList = [skills.E, skills.Q].filter((skill): skill is NonNullable<typeof skill> => !!skill)
            const harness = characterHarness({ manifest, characterId: character.id, skills: skillList, duration: 5 })
            const attempted: number[] = []
            try {
                if (skills.E) {
                    castSkill(harness.runtime, skills.E, 0)
                    attempted.push(skills.E.id)
                }
                if (skills.Q) {
                    castSkill(harness.runtime, skills.Q, 0)
                    attempted.push(skills.Q.id)
                }
                const result = harness.runtime.run()
                const casts = result.events.filter((event): event is CastEvent => event.kind === "cast")
                const castIds = new Set(casts.map(event => Number(event.skillId)))
                const missing = attempted.filter(id => !castIds.has(id))
                if (missing.length > 0) failures.push(`${character.id}: 缺少 cast 事件 ${missing.join(",")}`)
                if (simulated.has(character.id)) {
                    const nonCast = result.events.filter(event => event.kind !== "cast")
                    if (nonCast.length === 0) failures.push(`${character.id}: simulated 角色没有非 cast 事件`)
                }
                for (const skill of skillList) {
                    const entry = manifest.skills[String(skill.id)]
                    if (!entry) failures.push(`${character.id}: manifest 缺少技能 ${skill.id}`)
                }
                results.push(
                    `${character.id}(${skills.E?.id ?? "-"}/${skills.Q?.id ?? "-"}) casts=${casts.length} events=${result.events.length}`
                )
            } catch (error) {
                failures.push(`${character.id}: ${String(error)}`)
            }
        }
        const elapsed = performance.now() - started
        console.log(`[smoke] 34 角色 × 5s: ${elapsed.toFixed(1)}ms`)
        for (const line of results) console.log(`[smoke] ${line}`)
        expect(failures).toEqual([])
        expect(results).toHaveLength(manifest.characters.length)
        expect(elapsed).toBeLessThan(2000)
    })
})
