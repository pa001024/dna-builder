import { fileURLToPath } from "node:url"
import type { DamageRequest } from "../../src/core/oracle"
import { createDamageOracle } from "../../src/core/oracle"
import { createSimulation } from "../../src/core/simulation"
import type { SimConfig } from "../../src/core/types"
import { createSkillRuntime, type SkillRuntime, type SkillRuntimeOptions } from "../../src/runtime/index"
import type { BuffBehavior, CoverageReport, Phase, SkillBehavior, SkillBehaviorDoc } from "../../src/schema/ir"
import { emptyCoverageReport } from "../../src/schema/ir"

export const LISE_FIXTURE = fileURLToPath(new URL("../../fixtures/lise-q-behavior.json", import.meta.url))

export async function loadLiseDoc(): Promise<SkillBehaviorDoc> {
    return (await Bun.file(LISE_FIXTURE).json()) as SkillBehaviorDoc
}

export function coverage(overrides: Partial<CoverageReport> = {}): CoverageReport {
    return { ...emptyCoverageReport(), charactersTotal: 1, skillsTotal: 1, skillsWithBehavior: 1, ...overrides }
}

export function skill(id: number, phases: Phase[], overrides: Partial<SkillBehavior> = {}): SkillBehavior {
    return {
        id,
        characterId: 4101,
        slot: "Q",
        cast: { time: 0, cooldown: 0, costs: [], canMove: true },
        phases,
        sources: ["manual"],
        ...overrides,
    }
}

export function doc(skills: SkillBehavior[], buffs: Record<string, BuffBehavior> = {}): SkillBehaviorDoc {
    const map: Record<string, SkillBehavior> = {}
    for (const item of skills) map[String(item.id)] = item
    return {
        schemaVersion: 1,
        gameVersion: "test",
        characters: [{ id: 4101, nameKey: "黎瑟", skills: skills.map(item => item.id) }],
        skills: map,
        buffs,
        coverage: coverage({ skillsTotal: skills.length }),
    }
}

/** 每个技能字段固定伤害的 oracle：让断言只依赖事件顺序而非数值模型 */
export function fixedOracle(amount = 100) {
    return createDamageOracle((req: DamageRequest) => ({ damage: amount, kind: `fixed:${req.skillField}` }))
}

export interface Harness {
    simulation: ReturnType<typeof createSimulation>
    runtime: SkillRuntime
}

export function harness(options: {
    doc: SkillBehaviorDoc
    config?: Partial<SimConfig>
    runtime?: Partial<Pick<SkillRuntimeOptions, "recastPolicy" | "onDiagnostic">>
}): Harness {
    const simulation = createSimulation({
        duration: 10,
        dt: 1 / 60,
        seed: 7,
        actors: [{ id: "lise", characterId: 4101, resources: { 神智: { current: 240, max: 240 } } }],
        enemies: [
            { id: "e1", hp: 1_000_000, position: { x: 2, y: 0 } },
            { id: "e2", hp: 1_000_000, position: { x: 4, y: 0 } },
            { id: "e3", hp: 1_000_000, position: { x: 6, y: 0 } },
        ],
        oracle: fixedOracle(),
        ...options.config,
    })
    const runtime = createSkillRuntime({
        simulation,
        doc: options.doc,
        actorId: "lise",
        ...options.runtime,
    })
    return { simulation, runtime }
}

/** 事件摘要：只保留断言关心的字段，避免测试依赖整条事件 */
export function summarize(events: readonly { at: number; kind: string }[]): string[] {
    return events.map(event => `${event.at.toFixed(3)}:${event.kind}`)
}

export function eventsOfKind<T extends { kind: string }>(events: readonly T[], kind: T["kind"]): T[] {
    return events.filter((event): event is T => event.kind === kind)
}
