import { describe, expect, test } from "bun:test"
import { validateSkillAssetDoc, validateSkillBehaviorDoc } from "../src/index"
import { clone, loadFixtureDoc, minimalBehaviorDoc } from "./helpers"

describe("validateSkillBehaviorDoc", () => {
    test("最小合法文档通过", () => {
        const result = validateSkillBehaviorDoc(minimalBehaviorDoc())
        expect(result.errors).toEqual([])
        expect(result.ok).toBe(true)
    })

    test("不支持版本：报 schemaVersion 路径", () => {
        const doc = clone(minimalBehaviorDoc()) as unknown as Record<string, unknown>
        doc.schemaVersion = 2
        const result = validateSkillBehaviorDoc(doc)
        expect(result.ok).toBe(false)
        expect(result.errors.some(issue => issue.path === "schemaVersion" && issue.code === "schema.version")).toBe(true)
    })

    test("phase 时间必须升序，错误 path 精确到下标", () => {
        const doc = minimalBehaviorDoc()
        doc.skills["100"]!.phases = [
            { at: 2, actions: [] },
            { at: 1, actions: [] },
        ]
        const result = validateSkillBehaviorDoc(doc)
        const issue = result.errors.find(item => item.code === "schema.order")
        expect(issue?.path).toBe("skills.100.phases[1].at")
    })

    test("damage 缺 field：path 指向 action 字段", () => {
        const doc = clone(minimalBehaviorDoc())
        const action = doc.skills["100"]!.phases[0]!.actions[0] as unknown as Record<string, unknown>
        delete action.field
        const result = validateSkillBehaviorDoc(doc)
        expect(result.errors.some(issue => issue.path === "skills.100.phases[0].actions[0].field")).toBe(true)
    })

    test("未知 action.kind", () => {
        const doc = clone(minimalBehaviorDoc())
        const action = doc.skills["100"]!.phases[0]!.actions[0] as unknown as Record<string, unknown>
        action.kind = "teleport"
        const result = validateSkillBehaviorDoc(doc)
        expect(result.errors.some(issue => issue.path === "skills.100.phases[0].actions[0].kind" && issue.code === "schema.enum")).toBe(
            true
        )
    })

    test("skills 键与 id 不一致", () => {
        const doc = clone(minimalBehaviorDoc())
        doc.skills["100"]!.id = 101
        const result = validateSkillBehaviorDoc(doc)
        expect(result.errors.some(issue => issue.path === "skills.100.id" && issue.code === "schema.key-mismatch")).toBe(true)
    })

    test("applyBuff 引用缺失 buff：warn（check 用数据索引升级）", () => {
        const doc = clone(minimalBehaviorDoc())
        doc.skills["100"]!.phases[0]!.actions = [{ kind: "applyBuff", buffId: 999, target: { kind: "self" } }]
        const result = validateSkillBehaviorDoc(doc)
        expect(result.ok).toBe(true)
        expect(result.warnings.some(issue => issue.code === "schema.reference" && issue.path === "skills.100.phases[0]")).toBe(true)
    })

    test("角色列出的技能必须存在", () => {
        const doc = clone(minimalBehaviorDoc())
        doc.characters[0]!.skills = [100, 200]
        const result = validateSkillBehaviorDoc(doc)
        expect(result.errors.some(issue => issue.path === "characters[0].skills[1]" && issue.code === "schema.reference")).toBe(true)
    })

    test("branch 递归校验 else 分支", () => {
        const doc = clone(minimalBehaviorDoc())
        // biome-ignore lint/suspicious/noThenProperty: BranchAction 的契约字段名就是 then
        doc.skills["100"]!.phases[0]!.actions = [{ kind: "branch", on: "random", then: [], else: [{ kind: "resource" } as never] }]
        const result = validateSkillBehaviorDoc(doc)
        expect(result.errors.some(issue => issue.path === "skills.100.phases[0].actions[0].else[0].resource")).toBe(true)
    })
})

describe("validateSkillAssetDoc", () => {
    test("导出样本通过（含 authored）", async () => {
        const doc = await loadFixtureDoc()
        const result = validateSkillAssetDoc(doc)
        expect(result.errors).toEqual([])
    })

    test("notify 时间类型错误：path 到 notifies 下标", async () => {
        const doc = await loadFixtureDoc()
        const notify = doc.skills["410101"]!.montage!.notifies![0] as unknown as Record<string, unknown>
        notify.time = "1.0"
        const result = validateSkillAssetDoc(doc)
        expect(result.errors.some(issue => issue.path === "skills.410101.montage.notifies[0].time" && issue.code === "schema.type")).toBe(
            true
        )
    })

    test("未知字段只 warn", async () => {
        const doc = (await loadFixtureDoc()) as unknown as Record<string, unknown>
        doc.futureField = { anything: true }
        const result = validateSkillAssetDoc(doc)
        expect(result.ok).toBe(true)
        expect(result.warnings.some(issue => issue.path === "futureField" && issue.code === "schema.unknown-field")).toBe(true)
    })

    test("authored 相位顺序错误", async () => {
        const doc = await loadFixtureDoc()
        const authored = doc.skills["410102"]!.authored!
        authored.phases = [
            { at: 3, actions: [] },
            { at: 1, actions: [] },
        ]
        const result = validateSkillAssetDoc(doc)
        expect(result.errors.some(issue => issue.path === "skills.410102.authored.phases[1].at")).toBe(true)
    })

    test("技能键必须是数字字符串", async () => {
        const doc = (await loadFixtureDoc()) as unknown as Record<string, unknown>
        const skills = doc.skills as Record<string, unknown>
        skills["skill-a"] = skills["410101"]
        const result = validateSkillAssetDoc(doc)
        expect(result.errors.some(issue => issue.path === "skills.skill-a" && issue.code === "schema.key")).toBe(true)
    })
})
