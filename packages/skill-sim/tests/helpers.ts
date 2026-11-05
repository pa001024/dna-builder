import { fileURLToPath } from "node:url"
import type { SkillAssetDoc } from "../src/schema/asset"
import type { CoverageReport, SkillBehaviorDoc } from "../src/schema/ir"
import { emptyCoverageReport } from "../src/schema/ir"

export const FIXTURE_FILE = new URL("../fixtures/skill-asset-sample.json", import.meta.url)
export const FIXTURE_PATH = fileURLToPath(FIXTURE_FILE)
export const PARITY_FIXTURE_PATH = fileURLToPath(new URL("../fixtures/parity-smoke.ts", import.meta.url))
export const RAW_U2_FIXTURE_PATH = fileURLToPath(new URL("../fixtures/u2-raw-1101.json", import.meta.url))

export async function loadFixtureDoc(): Promise<SkillAssetDoc> {
    return JSON.parse(await Bun.file(FIXTURE_FILE).text()) as SkillAssetDoc
}

export function coverage(overrides: Partial<CoverageReport> = {}): CoverageReport {
    return { ...emptyCoverageReport(), ...overrides }
}

/** 最小合法 IR 文档（一个角色 / 一个技能 / 一个伤害动作） */
export function minimalBehaviorDoc(): SkillBehaviorDoc {
    return {
        schemaVersion: 1,
        gameVersion: "test",
        characters: [{ id: 4101, nameKey: "黎瑟", skills: [100] }],
        skills: {
            "100": {
                id: 100,
                characterId: 4101,
                slot: "E",
                cast: { time: 0, cooldown: 0, costs: [], canMove: false },
                phases: [
                    {
                        at: 0,
                        actions: [
                            {
                                kind: "damage",
                                field: "伤害",
                                tag: "",
                                hits: { count: 1, interval: 0 },
                                target: { kind: "primary" },
                            },
                        ],
                    },
                ],
                sources: ["lua"],
            },
        },
        buffs: {},
        coverage: coverage({ charactersTotal: 1, skillsTotal: 1, skillsWithLua: 1, skillsWithBehavior: 1 }),
    }
}

export function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T
}
