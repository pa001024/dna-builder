import { describe, expect, test } from "bun:test"
import { resolveAssetReferences } from "../src/index"
import type { DataBuff, DataCharacter, DataSkill, SkillDataIndex } from "../src/pipeline/types"
import type { SkillAssetDoc } from "../src/schema/asset"

function makeIndex(options: { characters?: DataCharacter[]; skills?: DataSkill[]; buffs?: DataBuff[] }): SkillDataIndex {
    const characters = new Map((options.characters ?? []).map(character => [character.id, character]))
    const skills = new Map((options.skills ?? []).map(skill => [skill.id, skill]))
    const buffs = new Map<number, DataBuff>()
    const buffsByName = new Map<string, DataBuff>()
    for (const buff of options.buffs ?? []) {
        if (buff.id !== undefined) buffs.set(buff.id, buff)
        buffsByName.set(buff.name, buff)
    }
    return {
        getCharacter: id => characters.get(id),
        getSkill: id => skills.get(id),
        getBuff: ref => (typeof ref === "number" ? buffs.get(ref) : buffsByName.get(ref)),
    }
}

function baseIndex(): SkillDataIndex {
    return makeIndex({
        characters: [{ id: 1, name: "测试角色", skills: [100, 101, 102] }],
        skills: [
            { id: 100, name: "技能A", type: "伤害", characterId: 1, cd: 2, fields: [{ name: "伤害", values: [1] }] },
            { id: 101, name: "技能B", type: "增益", characterId: 1, fields: [] },
        ],
        buffs: [{ id: 200, name: "已知BUFF" }],
    })
}

function asset(overrides: Partial<SkillAssetDoc> = {}): SkillAssetDoc {
    return {
        schemaVersion: 1,
        characters: [{ id: 1, nameKey: "测试角色", skills: [100] }],
        skills: { "100": { id: 100, characterId: 1, slot: "E" } },
        buffs: {},
        ...overrides,
    }
}

describe("resolveAssetReferences", () => {
    test("正常解析并派生 slot", () => {
        const result = resolveAssetReferences(asset(), baseIndex())
        expect(result.diagnostics).toEqual([])
        expect(result.skills[0]?.slot).toBe("E")
        expect(result.skills[0]?.data?.name).toBe("技能A")
    })

    test("未知角色 / 技能 → error", () => {
        const doc = asset({
            characters: [{ id: 99, nameKey: "未知", skills: [200] }],
            skills: { "200": { id: 200, characterId: 99 } },
        })
        const result = resolveAssetReferences(doc, baseIndex())
        expect(result.diagnostics.some(item => item.code === "ref.unknown-character" && item.path === "characters.99")).toBe(true)
        expect(result.diagnostics.some(item => item.code === "ref.unknown-skill" && item.path === "skills.200")).toBe(true)
    })

    test("技能归属角色不一致 → error", () => {
        const index = makeIndex({
            characters: [
                { id: 1, name: "角色1", skills: [100] },
                { id: 2, name: "角色2", skills: [] },
            ],
            skills: [{ id: 100, name: "技能A", type: "伤害", characterId: 2, fields: [] }],
        })
        const doc = asset({ characters: [{ id: 1, nameKey: "角色1", skills: [100] }] })
        const result = resolveAssetReferences(doc, index)
        expect(
            result.diagnostics.some(item => item.code === "ref.skill-character-mismatch" && item.path === "skills.100.characterId")
        ).toBe(true)
    })

    test("角色列表里缺资产 → warn", () => {
        const doc = asset({ characters: [{ id: 1, nameKey: "测试角色", skills: [100, 101, 102] }] })
        const result = resolveAssetReferences(doc, baseIndex())
        const missing = result.diagnostics.filter(item => item.code === "ref.missing-asset-skill")
        expect(missing.length).toBe(2)
        expect(missing[0]?.severity).toBe("warn")
    })

    test("slot 与数据顺序不一致 → warn", () => {
        const doc = asset({ skills: { "100": { id: 100, characterId: 1, slot: "Q" } } })
        const result = resolveAssetReferences(doc, baseIndex())
        expect(result.diagnostics.some(item => item.code === "ref.slot-mismatch" && item.severity === "warn")).toBe(true)
        expect(result.skills[0]?.slot).toBe("Q")
    })

    test("结构化 buff 引用未知 → error；Lua 行为里的 id 只 warn", () => {
        const doc = asset({
            skills: {
                "100": {
                    id: 100,
                    characterId: 1,
                    lua: { buffIds: [200, 888], behavior: "附加增益(777)" },
                },
            },
        })
        const result = resolveAssetReferences(doc, baseIndex())
        const error = result.diagnostics.find(item => item.code === "ref.unknown-buff")
        expect(error?.severity).toBe("error")
        expect(error?.path).toBe("skills.100.lua.buffIds[1]")
        expect(result.diagnostics.some(item => item.code === "ref.unverified-buff" && item.severity === "warn")).toBe(true)
    })

    test("notify EffectId 不在 effects → warn", () => {
        const doc = asset({
            skills: {
                "100": {
                    id: 100,
                    characterId: 1,
                    lua: { effects: [{ TaskId: 1, TaskEffects: [] }] },
                    montage: { notifies: [{ name: "BP_SkillEffect_C", time: 1, payload: { EffectId: 2 } }] },
                },
            },
        })
        const result = resolveAssetReferences(doc, baseIndex())
        expect(result.diagnostics.some(item => item.code === "ref.unknown-effect" && item.severity === "warn")).toBe(true)
    })

    test("authored 伤害字段不在数据字段 → warn", () => {
        const doc = asset({
            skills: {
                "100": {
                    id: 100,
                    characterId: 1,
                    authored: {
                        phases: [
                            {
                                at: 0,
                                actions: [
                                    {
                                        kind: "damage",
                                        field: "不存在的字段",
                                        tag: "",
                                        hits: { count: 1, interval: 0 },
                                        target: { kind: "primary" },
                                    },
                                ],
                            },
                        ],
                    },
                },
            },
        })
        const result = resolveAssetReferences(doc, baseIndex())
        const warning = result.diagnostics.find(item => item.code === "ref.unknown-field")
        expect(warning?.severity).toBe("warn")
        expect(warning?.path).toBe("skills.100.authored.phases[0].actions[0].field")
    })

    test("非角色技能（characterId=0）找不到数据只 warn", () => {
        const doc = asset({
            characters: [],
            skills: { "999": { id: 999, characterId: 0 } },
        })
        const result = resolveAssetReferences(doc, baseIndex())
        const issue = result.diagnostics.find(item => item.code === "ref.unknown-skill")
        expect(issue?.severity).toBe("warn")
    })
})
