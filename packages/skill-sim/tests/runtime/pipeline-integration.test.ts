import { describe, expect, test } from "bun:test"
import { buildSkillBehaviorDoc } from "../../src/pipeline/build"
import { ingestSkillAsset } from "../../src/pipeline/ingest"
import type { DataBuff, DataCharacter, DataSkill, SkillDataIndex } from "../../src/pipeline/types"
import { createSkillRuntime } from "../../src/runtime/index"
import { FIXTURE_PATH } from "../helpers"
import { harness } from "./helpers"

/** 合成数据索引：不加载 packages/data（U5 只关心 U3 产物形状） */
function makeIndex(): SkillDataIndex {
    const characters = new Map<number, DataCharacter>([[4101, { id: 4101, name: "黎瑟", skills: [410101, 410102, 410103] }]])
    const skills = new Map<number, DataSkill>([
        [
            410101,
            {
                id: 410101,
                name: "快速出击",
                type: "伤害",
                characterId: 4101,
                cd: 2,
                fields: [{ name: "伤害", values: [1], tag: ["技能", "战技"] }],
            },
        ],
        [410102, { id: 410102, name: "涡旋电场", type: "增益", characterId: 4101, cd: 2, fields: [] }],
        [410103, { id: 410103, name: "战术节能", type: "被动", characterId: 4101, fields: [] }],
    ])
    const buffs = new Map<number, DataBuff>([
        [410111, { id: 410111, name: "电场爆发" }],
        [410121, { id: 410121, name: "正电荷" }],
        [410122, { id: 410122, name: "负电荷" }],
        [410123, { id: 410123, name: "电场爆发移速" }],
    ])
    return {
        getCharacter: id => characters.get(id),
        getSkill: id => skills.get(id),
        getBuff: ref => (typeof ref === "number" ? buffs.get(ref) : undefined),
    }
}

describe("U3 产物 → U5 运行时", () => {
    test("从 skill-asset-sample 构建的 Q 能被运行时完整排程", async () => {
        const ingest = await ingestSkillAsset(FIXTURE_PATH)
        const built = buildSkillBehaviorDoc(ingest.doc, makeIndex())
        expect(built.ok).toBe(true)
        const behavior = built.doc.skills["410102"]
        expect(behavior).toBeDefined()

        const context = harness({ doc: built.doc, config: { duration: 5 } })
        const cast = context.runtime.cast(410102, 0)
        expect(cast.ok).toBe(true)
        expect(cast.invocations).toBeGreaterThan(0)
        const result = context.runtime.run()
        expect(result.events.filter(event => event.kind === "target-select").length).toBeGreaterThan(0)
        expect(result.events.filter(event => event.kind === "buff-apply").length).toBeGreaterThan(0)
    })

    test("E 技能的 unknown native 进入诊断，伤害仍然正常结算", async () => {
        const ingest = await ingestSkillAsset(FIXTURE_PATH)
        const built = buildSkillBehaviorDoc(ingest.doc, makeIndex())
        const context = harness({ doc: built.doc, config: { duration: 3 } })
        const runtimeA = createSkillRuntime({ simulation: context.simulation, doc: built.doc, actorId: "lise" })
        const cast = runtimeA.cast(410101, 0)
        expect(cast.ok).toBe(true)
        expect(cast.sustained).toEqual([])
        const runtime = createSkillRuntime({ simulation: context.simulation, doc: built.doc, actorId: "lise" })
        runtime.cast(410101, 0)
        runtime.run()
        const natives = runtime.diagnostics().filter(item => item.kind === "native")
        // E 的样本同时有「已登记但不建模」(CutToughness) 与「未登记」(K2_PlayUnknownEffect) 调用
        const unknown = natives.find(item => item.kind === "native" && item.fn === "K2_PlayUnknownEffect")
        expect(unknown).toMatchObject({ kind: "native", known: false, mapped: false, severity: "warn" })
        expect(natives.every(item => item.kind === "native")).toBe(true)
        expect(context.simulation.events.some(event => event.kind === "damage")).toBe(true)
    })
})
