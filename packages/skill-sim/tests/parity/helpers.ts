/** U7 parity / smoke 共享：加载生成的 manifest，按角色构造最小 sim 配置。 */

import { createDamageOracle } from "../../src/core/oracle"
import { createSimulation } from "../../src/core/simulation"
import type { SimConfig, SimResult } from "../../src/core/types"
import type { SkillBehaviorManifest } from "../../src/pipeline/types"
import { createSkillRuntime, type SkillRuntime } from "../../src/runtime/index"
import { hasExecutableAction, type SkillBehavior } from "../../src/schema/ir"

export const MANIFEST_PATH = new URL("../../generated/manifest.json", import.meta.url)

export async function loadManifest(): Promise<SkillBehaviorManifest> {
    return (await Bun.file(MANIFEST_PATH).json()) as SkillBehaviorManifest
}

export function fixedOracle(amount = 100) {
    return createDamageOracle(() => ({ damage: amount, kind: "fixed" }))
}

export function resourcesFor(skills: SkillBehavior[]): Record<string, { current: number; max: number }> {
    const resources: Record<string, { current: number; max: number }> = {}
    for (const skill of skills) {
        for (const cost of skill.cast.costs) resources[cost.resource] = { current: 1_000_000, max: 1_000_000 }
    }
    return resources
}

export interface CharacterHarness {
    simulation: ReturnType<typeof createSimulation>
    runtime: SkillRuntime
}

export function characterHarness(options: {
    manifest: SkillBehaviorManifest
    characterId: number
    skills: SkillBehavior[]
    duration?: number
    oracle?: SimConfig["oracle"]
    enemies?: number
}): CharacterHarness {
    const simulation = createSimulation({
        duration: options.duration ?? 5,
        dt: 1 / 60,
        seed: 7,
        actors: [{ id: `char:${options.characterId}`, characterId: options.characterId, resources: resourcesFor(options.skills) }],
        enemies: Array.from({ length: options.enemies ?? 3 }, (_, index) => ({
            id: `e${index + 1}`,
            hp: 1e12,
            position: { x: 2 + index * 2, y: 0 },
        })),
        oracle: options.oracle ?? fixedOracle(),
    })
    const runtime = createSkillRuntime({
        simulation,
        doc: options.manifest,
        actorId: `char:${options.characterId}`,
    })
    return { simulation, runtime }
}

/** 角色的主 E/Q：角色技能表里第一个 E 与第一个 Q（子技能排在主技能之后）。 */
export function mainSlotSkills(manifest: SkillBehaviorManifest, characterId: number): { E?: SkillBehavior; Q?: SkillBehavior } {
    const character = manifest.characters.find(item => item.id === characterId)
    if (!character) return {}
    const skills = character.skills.map(skillId => manifest.skills[String(skillId)]).filter((skill): skill is SkillBehavior => !!skill)
    return {
        E: skills.find(skill => skill.slot === "E"),
        Q: skills.find(skill => skill.slot === "Q"),
    }
}

export function castSkill(runtime: SkillRuntime, skill: SkillBehavior | undefined, at: number): boolean {
    if (!skill) return false
    const result = runtime.cast(skill.id, at)
    if (!result.ok) throw new Error(`施放 ${skill.id} 失败：${result.reason} ${result.message ?? ""}`)
    return true
}

export function runTo(runtime: SkillRuntime): SimResult {
    return runtime.run()
}

/** 生成 manifest 中被判定为 simulated 的角色：主 E/Q 均有可执行动作。 */
export function simulatedCharacters(manifest: SkillBehaviorManifest): number[] {
    return manifest.characters
        .filter(character => {
            const skills = character.skills
                .map(skillId => manifest.skills[String(skillId)])
                .filter((skill): skill is SkillBehavior => !!skill)
            const e = skills.find(skill => skill.slot === "E")
            const q = skills.find(skill => skill.slot === "Q")
            return !!e && !!q && hasExecutableAction(e) && hasExecutableAction(q)
        })
        .map(character => character.id)
}
