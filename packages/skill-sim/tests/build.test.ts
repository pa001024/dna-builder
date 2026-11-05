import { beforeAll, describe, expect, test } from "bun:test"
import { buildSkillBehaviorDoc, ingestSkillAsset, mapNativeCall, parseLuaBehavior } from "../src/index"
import { createGameDataIndex } from "../src/pipeline/data-index"
import type { SkillAssetDoc } from "../src/schema/asset"
import type { SkillBehaviorDoc } from "../src/schema/ir"
import { FIXTURE_PATH } from "./helpers"

let doc: SkillBehaviorDoc

beforeAll(async () => {
    const ingest = await ingestSkillAsset(FIXTURE_PATH)
    const built = buildSkillBehaviorDoc(ingest.doc, createGameDataIndex())
    expect(built.ok).toBe(true)
    doc = built.doc
})

function skill(id: number) {
    const value = doc.skills[String(id)]
    if (!value) throw new Error(`missing skill ${id}`)
    return value
}

describe("buildSkillBehaviorDoc — 样本", () => {
    test("coverage：未知 native / 未映射 notify 不丢失", () => {
        expect(doc.coverage.skillsTotal).toBe(3)
        expect(doc.coverage.skillsWithBehavior).toBe(3)
        expect(doc.coverage.skillsWithMontage).toBe(2)
        expect(doc.coverage.skillsWithBlueprint).toBe(1)
        expect(doc.coverage.skillsAuthored).toBe(1)
        expect(doc.coverage.nativeCallsUnknown).toEqual(["K2_PlayUnknownEffect"])
        expect(doc.coverage.unmatchedNotifies).toEqual(["BP_UnmappedNotify_C"])
    })

    test("E：montage notify → damage + 不建模 native；蓝图 → applyBuff + 未知 native", () => {
        const e = skill(410101)
        expect(e.slot).toBe("E")
        expect(e.cast.time).toBe(0.35)
        expect(e.cast.canMove).toBe(true)
        expect(e.cast.costs).toEqual([{ resource: "神智", amount: 20 }])

        const montagePhase = e.phases.find(phase => phase.source === "montage")
        expect(montagePhase?.at).toBe(0.35)
        expect(montagePhase?.until).toBe(1.2)
        expect(montagePhase?.actions.some(action => action.kind === "damage" && action.field === "伤害")).toBe(true)
        expect(montagePhase?.actions.some(action => action.kind === "native" && action.fn === "CutToughness")).toBe(true)

        const blueprintPhase = e.phases.find(phase => phase.source === "blueprint")
        const buff = blueprintPhase?.actions.find(action => action.kind === "applyBuff")
        expect(buff).toMatchObject({ kind: "applyBuff", buffId: 410112, level: 1, duration: 1.1 })
        expect(blueprintPhase?.actions.some(action => action.kind === "native" && action.fn === "K2_PlayUnknownEffect")).toBe(true)

        expect(e.sources).toContain("montage")
        expect(e.sources).toContain("blueprint")
        expect(e.sources).toContain("hybrid")
        expect(e.provenance?.inertNotifies).toContain("BP_SkillCancel_C")
        expect(e.provenance?.unmatchedNotify).toContain("BP_UnmappedNotify_C")
        const unknown = e.provenance?.nativeCalls.find(call => call.fn === "K2_PlayUnknownEffect")
        expect(unknown?.known).toBe(false)
        expect(unknown?.mapped).toBe(false)
    })

    test("Q：authored 覆盖派生相位（tick + select + branch applyBuff）", () => {
        const q = skill(410102)
        expect(q.sources).toContain("manual")
        expect(q.sources).toContain("hybrid")
        expect(q.cast.time).toBe(0.45)
        expect(q.cast.cooldown).toBe(2)
        expect(q.cast.costs).toEqual([
            { resource: "神智", amount: 10 },
            { resource: "神智", amount: 20, perSecond: true },
        ])
        expect(q.phases.length).toBe(2)

        const tickPhase = q.phases[1]!
        expect(tickPhase.at).toBe(0.9)
        expect(tickPhase.until).toBe(3.9)
        expect(tickPhase.tick).toEqual({ interval: 1 })
        expect(tickPhase.condition).toEqual({ kind: "hasBuff", buffId: 410111 })
        expect(tickPhase.actions.some(action => action.kind === "select" && action.store === "chargeTarget")).toBe(true)
        const branch = tickPhase.actions.find(action => action.kind === "branch")
        expect(branch).toMatchObject({ kind: "branch", on: "random" })
        if (branch?.kind === "branch") {
            expect(branch.then[0]).toMatchObject({ kind: "applyBuff", buffId: 410121 })
            expect(branch.else?.[0]).toMatchObject({ kind: "applyBuff", buffId: 410122 })
        }
        expect(tickPhase.actions.some(action => action.kind === "resource" && action.resource === "神智" && action.delta === -20)).toBe(
            true
        )

        // 派生证据仍然保留在 provenance（authored 只替换 phases）
        expect(q.provenance?.nativeCalls.some(call => call.fn === "AddBuff" && call.mapped)).toBe(true)
    })

    test("P：仅 lua 证据 → applyBuff 兜底", () => {
        const p = skill(410103)
        expect(p.sources).toEqual(["lua"])
        expect(p.cast.time).toBe(0)
        expect(p.phases.length).toBe(1)
        expect(p.phases[0]?.actions[0]).toMatchObject({ kind: "applyBuff", buffId: 410131, duration: 2 })
        expect(p.provenance?.unparsedLua).toBeUndefined()
    })
})

describe("buildSkillBehaviorDoc — Buff DotDatas → tick 相位", () => {
    test("blueprint applyBuff 触发 buff 的 SpChange 持续消耗", () => {
        const asset: SkillAssetDoc = {
            schemaVersion: 1,
            exporter: { gameVersion: "test" },
            characters: [{ id: 4101, nameKey: "黎瑟", skills: [410101] }],
            skills: {
                "410101": {
                    id: 410101,
                    characterId: 4101,
                    slot: "E",
                    sources: { bpPackages: ["EM/BP_Test"] },
                    blueprint: {
                        functions: [
                            {
                                name: "ExecuteUbergraph_BP_Test",
                                body: [
                                    {
                                        op: "CallMath",
                                        fn: "AddBuffToTarget",
                                        args: [{ op: "IntConst", value: 410111 }],
                                    },
                                ],
                            },
                        ],
                    },
                },
            },
            buffs: {
                "410111": {
                    id: 410111,
                    props: { DotDatas: [{ DotDelay: 2, Interval: 1, Type: "SpChange", Value: -20 }] },
                },
            },
        }
        const built = buildSkillBehaviorDoc(asset, createGameDataIndex())
        expect(built.ok).toBe(true)
        const phases = built.doc.skills["410101"]!.phases
        const tickPhase = phases.find(phase => phase.tick)
        expect(tickPhase?.at).toBe(2)
        expect(tickPhase?.tick).toEqual({ interval: 1 })
        expect(tickPhase?.condition).toEqual({ kind: "hasBuff", buffId: 410111 })
        expect(tickPhase?.actions[0]).toMatchObject({ kind: "resource", resource: "神智", delta: -20 })
        expect(built.doc.buffs["410111"]?.dots).toEqual([{ delay: 2, interval: 1, resource: "神智", delta: -20 }])
    })
})

describe("native-map / lua 单元", () => {
    test("未知 native 保留为 native 动作", () => {
        const result = mapNativeCall("K2_Whatever", [{ op: "IntConst", value: 3 }], { fields: [] })
        expect(result.known).toBe(false)
        expect(result.mapped).toBe(false)
        expect(result.actions).toEqual([
            { kind: "native", fn: "K2_Whatever", args: [{ op: "IntConst", value: 3 }], origin: "native:K2_Whatever" },
        ])
    })

    test("已登记但 IR 不建模的 native（削韧）标记 known 且保留", () => {
        const result = mapNativeCall("CutToughness", [33], { fields: [] })
        expect(result.known).toBe(true)
        expect(result.mapped).toBe(false)
        expect(result.actions[0]).toMatchObject({ kind: "native", fn: "CutToughness" })
    })

    test("Lua 造成伤害按倍率匹配字段", () => {
        const parsed = parseLuaBehavior("造成角色攻击413.0%的伤害(技能/终结技)", {
            fields: [{ name: "伤害", values: 4.13, tag: ["技能", "终结技"] }],
            effects: [],
            buffProps: new Map(),
        })
        const action = parsed.phases[0]?.actions[0]
        expect(action).toMatchObject({ kind: "damage", field: "伤害", tag: "技能,终结技" })
    })

    test("Lua 附加增益的每 N 秒消耗 → tick 相位", () => {
        const parsed = parseLuaBehavior("附加增益(410111)[每1秒消耗20神智, 持续3秒]", {
            fields: [],
            effects: [],
            buffProps: new Map(),
        })
        expect(parsed.phases.length).toBe(2)
        const apply = parsed.phases.find(phase => phase.actions.some(action => action.kind === "applyBuff"))
        expect(apply?.actions[0]).toMatchObject({ kind: "applyBuff", buffId: 410111, duration: 3 })
        const tick = parsed.phases.find(phase => phase.tick)
        expect(tick).toMatchObject({ at: 0, tick: { interval: 1 }, condition: { kind: "hasBuff", buffId: 410111 } })
        expect(tick?.actions[0]).toMatchObject({ kind: "resource", resource: "神智", delta: -20 })
    })

    test("无法解析的 Lua 语句进入 unparsedLua", () => {
        const parsed = parseLuaBehavior("这是一句无法识别的行为", { fields: [], effects: [], buffProps: new Map() })
        expect(parsed.phases).toEqual([])
        expect(parsed.unparsed).toEqual(["这是一句无法识别的行为"])
    })
})

describe("共享蓝图归因", () => {
    test("只取事件入口可达函数，过滤纯表达式调用并去重", () => {
        const blueprint = {
            events: [{ name: "ReceiveBeginPlay", target: "ExecuteUbergraph_BP_Shared" }],
            functions: [
                {
                    name: "ExecuteUbergraph_BP_Shared",
                    body: [
                        {
                            op: "Let",
                            target: "A",
                            value: {
                                op: "CallMath",
                                fn: "AddBuffToTarget",
                                args: [
                                    { op: "IntConst", value: 410112 },
                                    { op: "IntConst", value: 1 },
                                    { op: "FloatConst", value: 1.1 },
                                ],
                            },
                        },
                        {
                            op: "Let",
                            target: "B",
                            value: {
                                op: "CallMath",
                                fn: "Add_IntInt",
                                args: [
                                    { op: "IntConst", value: 1 },
                                    { op: "IntConst", value: 2 },
                                ],
                            },
                        },
                        {
                            op: "Let",
                            target: "C",
                            value: { op: "CallMath", fn: "SpawnActor", args: [{ op: "IntConst", value: 99 }] },
                        },
                    ],
                },
                {
                    name: "ExecuteUbergraph_BP_Unrelated",
                    body: [
                        {
                            op: "Let",
                            target: "D",
                            value: { op: "CallMath", fn: "SpawnActor", args: [{ op: "IntConst", value: 100 }] },
                        },
                    ],
                },
            ],
        }
        const shared = (id: number, slot: "E" | "Q") => ({
            id,
            characterId: 4101,
            slot,
            lua: { behavior: "", fields: [], effects: [], buffIds: [] },
            sources: {},
            blueprint,
        })
        const asset = {
            schemaVersion: 1,
            gameVersion: "test",
            characters: [{ id: 4101, nameKey: "黎瑟", skills: [410101, 410102] }],
            skills: { "410101": shared(410101, "E"), "410102": shared(410102, "Q") },
            buffs: {},
        } as SkillAssetDoc
        const built = buildSkillBehaviorDoc(asset, createGameDataIndex())
        expect(built.ok).toBe(true)
        for (const id of [410101, 410102]) {
            const phases = built.doc.skills[String(id)]!.phases.filter(phase => phase.source === "blueprint")
            const actions = phases.flatMap(phase => phase.actions)
            expect(actions.filter(action => action.kind === "applyBuff")).toHaveLength(1)
            expect(actions.some(action => action.kind === "native" && action.fn === "Add_IntInt")).toBe(false)
            // 不可达函数里的调用不归因到共享该蓝图的技能。
            expect(actions.some(action => action.kind === "native" && action.fn === "SpawnActor")).toBe(false)
        }
    })
})

describe("资源消耗解析", () => {
    test("[X]神智消耗 / 最低神智消耗 / 每秒神智消耗 归一为已知资源", () => {
        const fields = [
            { 名称: "[小步]神智消耗", 值: [20, 20] },
            { 名称: "最低神智消耗", 值: [5, 5] },
            { 名称: "[蹄蹄大冲撞]每秒神智消耗", 值: [3, 3] },
            { 名称: "生命消耗", 值: [10, 10] },
            { 名称: "未知能量消耗", 值: [99, 99] },
        ]
        const asset = {
            schemaVersion: 1,
            gameVersion: "test",
            characters: [],
            skills: {
                "999901": {
                    id: 999901,
                    characterId: 0,
                    slot: "unknown",
                    lua: { behavior: "", fields, effects: [], buffIds: [] },
                    sources: { bpPackages: ["BP_Test"] },
                },
            },
            buffs: {},
        } as SkillAssetDoc
        const built = buildSkillBehaviorDoc(asset, createGameDataIndex())
        expect(built.ok).toBe(true)
        expect(built.doc.skills["999901"]!.cast.costs).toEqual([
            { resource: "神智", amount: 20 },
            { resource: "神智", amount: 5 },
            { resource: "神智", amount: 3, perSecond: true },
            { resource: "生命", amount: 10 },
        ])
    })
})

describe("native-only 技能", () => {
    test("不计入 skillsWithBehavior，并记录 build.no-actions", () => {
        const asset = {
            schemaVersion: 1,
            gameVersion: "test",
            characters: [],
            skills: {
                "999902": {
                    id: 999902,
                    characterId: 0,
                    slot: "unknown",
                    lua: { behavior: "", fields: [], effects: [], buffIds: [] },
                    sources: { bpPackages: ["BP_Test"] },
                    blueprint: {
                        functions: [
                            {
                                name: "ExecuteUbergraph_BP_Test",
                                body: [{ op: "CallMath", fn: "K2_PlayUnknownEffect", args: [] }],
                            },
                        ],
                    },
                },
            },
            buffs: {},
        } as SkillAssetDoc
        const built = buildSkillBehaviorDoc(asset, createGameDataIndex())
        expect(built.ok).toBe(true)
        expect(built.doc.skills["999902"]!.phases.flatMap(phase => phase.actions).some(action => action.kind === "native")).toBe(true)
        expect(built.doc.coverage.skillsWithBehavior).toBe(0)
        expect(built.diagnostics.some(item => item.code === "build.no-actions" && item.path === "skills.999902")).toBe(true)
    })
})
