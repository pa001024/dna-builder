import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ requestBuildTargetValues: vi.fn() }))

vi.mock("@/composables/useBuildIncomeWorker", () => ({
    requestBuildTargetValues: mocks.requestBuildTargetValues,
}))

import { charData, weaponMap } from "@/data"
import { createCharBuildFromSettings } from "@/data/CharBuildHelper"
import { createBuildFromSnapshot } from "@/data/CharBuildSnapshot"
import { createDefaultCharSettings, normalizeCharSettings, serializeCharSettings } from "@/data/charSettings"
import petData from "@/data/d/pet.data"
import { useBuildSummaries } from "./useBuildSummaries"

const charId = charData[0].id
const mateIds = [charData[1].id, charData[2].id]

function sampleJson() {
    const settings = createDefaultCharSettings()
    settings.team1 = mateIds[0]
    settings.team1Weapon = settings.meleeWeapon
    settings.team2 = mateIds[1]
    return { settings, json: serializeCharSettings(settings) }
}

describe("useBuildSummaries", () => {
    beforeEach(() => {
        mocks.requestBuildTargetValues.mockReset()
    })

    it("从 charSettings 解析武器与协战角色，并用 worker 回填目标值", async () => {
        const { settings, json } = sampleJson()
        mocks.requestBuildTargetValues.mockResolvedValue({ b1: 1234.5 })

        const { summaries, refresh } = useBuildSummaries()
        await refresh([{ key: "b1", charId, charSettings: json }])

        const summary = summaries.value.b1
        expect(summary.melee?.name).toBe(weaponMap.get(settings.meleeWeapon)?.名称)
        expect(summary.ranged?.id).toBe(settings.rangedWeapon)
        expect(summary.melee?.weapon.等级).toBe(settings.meleeWeaponLevel)
        expect(summary.ranged?.weapon.id).toBe(settings.rangedWeapon)
        expect(summary.team.map(char => char.id)).toEqual(mateIds)
        expect(summary.team.every(char => char.icon.length > 0)).toBe(true)
        expect(summary.team.every(char => char.char.等级 === settings.charLevel)).toBe(true)
        expect(summary.team[0].weapon?.id).toBe(settings.team1Weapon)
        expect(summary.team[1].weapon).toBeNull()
        expect(summary.targetFunction).toBe(settings.targetFunction)
        expect(summary.baseName).toBe(settings.baseName)
        expect(summary.targetValue).toBe(1234.5)

        const items = mocks.requestBuildTargetValues.mock.calls[0][0]
        expect(items).toHaveLength(1)
        expect(items[0].key).toBe("b1")
        expect(items[0].build.char.data.id).toBe(charId)
    })

    it("配置无法解析时不请求 worker，概要保持空值", async () => {
        const { summaries, refresh } = useBuildSummaries()
        await refresh([{ key: "bad", charId, charSettings: "{not json}" }])

        expect(summaries.value.bad).toEqual({
            buildType: "normal",
            targetValue: null,
            baseName: "",
            targetFunction: "",
            melee: null,
            ranged: null,
            team: [],
        })
        expect(mocks.requestBuildTargetValues).not.toHaveBeenCalled()
    })

    it("分页追加时只刷新新增条目，已算出的目标值保留", async () => {
        const { json } = sampleJson()
        mocks.requestBuildTargetValues.mockResolvedValueOnce({ b1: 10 })

        const { summaries, refresh } = useBuildSummaries()
        await refresh([{ key: "b1", charId, charSettings: json }])

        mocks.requestBuildTargetValues.mockResolvedValueOnce({ b2: 20 })
        await refresh([{ key: "b2", charId, charSettings: json }])

        expect(summaries.value.b1.targetValue).toBe(10)
        expect(summaries.value.b2.targetValue).toBe(20)
        expect(mocks.requestBuildTargetValues.mock.calls[1][0]).toHaveLength(1)
    })

    it("交给 worker 的快照恢复后算出的值与主线程构筑一致", async () => {
        const { settings, json } = sampleJson()
        mocks.requestBuildTargetValues.mockResolvedValue({})

        const { refresh } = useBuildSummaries()
        await refresh([{ key: "b1", charId, charSettings: json }])

        const [{ build }] = mocks.requestBuildTargetValues.mock.calls[0][0]
        const expected = createCharBuildFromSettings(charId, normalizeCharSettings(settings)).calculate()
        expect(Number.isFinite(expected)).toBe(true)
        expect(createBuildFromSnapshot(build).calculate()).toBeCloseTo(expected, 6)
    })

    it("带魔灵时快照需保留魔灵CD基数，否则 worker 侧计算口径与主线程不一致", async () => {
        const { settings } = sampleJson()
        settings.petId = petData[0].id
        const normalized = normalizeCharSettings(settings)
        expect(normalized.petId).toBe(petData[0].id)

        mocks.requestBuildTargetValues.mockResolvedValue({})
        const { refresh } = useBuildSummaries()
        await refresh([{ key: "b1", charId, charSettings: serializeCharSettings(normalized) }])

        const [{ build }] = mocks.requestBuildTargetValues.mock.calls[0][0]
        const direct = createCharBuildFromSettings(charId, normalized)
        expect(direct.petBaseCd).toBeGreaterThan(0)
        expect(build.petBaseCd).toBe(direct.petBaseCd)
        expect(createBuildFromSnapshot(build).calculate()).toBeCloseTo(direct.calculate(), 6)
    })

    it("协战等级读 assistN：主控 60 / assist1 70 分别展示，assist2 缺失时回退主控等级", async () => {
        const settings = createDefaultCharSettings()
        settings.charLevel = 60
        settings.team1 = mateIds[0]
        settings.team1Weapon = settings.meleeWeapon
        settings.assist1 = { ...settings.assist1, charLevel: 70, weaponLevel: 70 }
        // 2 号协战只有 id（旧存档形态：没有 assist2 loadout）
        settings.team2 = mateIds[1]
        settings.team2Weapon = settings.rangedWeapon
        const json = JSON.stringify({ ...settings, assist2: undefined })

        mocks.requestBuildTargetValues.mockResolvedValue({})
        const { summaries, refresh } = useBuildSummaries()
        await refresh([{ key: "levels", charId, charSettings: json }])

        const team = summaries.value.levels.team
        expect(team).toHaveLength(2)
        expect(team[0].id).toBe(mateIds[0])
        expect(team[0].char.等级).toBe(70)
        expect(team[0].weapon?.weapon.等级).toBe(70)
        // 未保存 assist2：沿用列表原有口径回退主控等级
        expect(team[1].id).toBe(mateIds[1])
        expect(team[1].char.等级).toBe(60)
    })

    it("构筑类型优先后端 info（即使本地配置不含升华）", async () => {
        const { json } = sampleJson()
        mocks.requestBuildTargetValues.mockResolvedValue({})

        const { summaries, refresh } = useBuildSummaries()
        await refresh([{ key: "typed", charId, charSettings: json, buildType: "transcend" }])

        expect(summaries.value.typed.buildType).toBe("transcend")
    })

    it("配置解析失败时仍保留后端 buildType", async () => {
        const { summaries, refresh } = useBuildSummaries()
        await refresh([{ key: "broken", charId, charSettings: "{not json}", buildType: "transcend" }])

        expect(summaries.value.broken.buildType).toBe("transcend")
        expect(summaries.value.broken.targetValue).toBeNull()
        expect(mocks.requestBuildTargetValues).not.toHaveBeenCalled()
    })

    it("后端 normal 优先于本地开启升华的配置", async () => {
        const settings = createDefaultCharSettings()
        settings.transcend = { ...settings.transcend, enabled: true }
        mocks.requestBuildTargetValues.mockResolvedValue({})

        const { summaries, refresh } = useBuildSummaries()
        await refresh([{ key: "stored", charId, charSettings: serializeCharSettings(settings), buildType: "normal" }])

        expect(summaries.value.stored.buildType).toBe("normal")
    })

    it("旧服务端无 info 时按 charSettings 本地回退（只认 enabled）", async () => {
        const ascended = createDefaultCharSettings()
        ascended.transcend = { ...ascended.transcend, enabled: true }
        // 关闭总开关但保留天赋 / 装备：按 enabled-only 口径是普通（U140-fix §156）
        const disabled = createDefaultCharSettings()
        disabled.transcend = { ...disabled.transcend, enabled: false, talentLevels: [[1, 1]] }
        mocks.requestBuildTargetValues.mockResolvedValue({})

        const { summaries, refresh } = useBuildSummaries()
        await refresh([
            { key: "ascended", charId, charSettings: serializeCharSettings(ascended) },
            { key: "disabled", charId, charSettings: serializeCharSettings(disabled) },
            { key: "plain", charId, charSettings: serializeCharSettings(createDefaultCharSettings()) },
        ])

        expect(summaries.value.ascended.buildType).toBe("transcend")
        expect(summaries.value.disabled.buildType).toBe("normal")
        expect(summaries.value.plain.buildType).toBe("normal")
    })

    it("assist2 保存了 loadout 时同样读自己的等级", async () => {
        const settings = createDefaultCharSettings()
        settings.charLevel = 60
        settings.team2 = mateIds[1]
        settings.team2Weapon = settings.rangedWeapon
        settings.assist2 = { ...settings.assist2, charLevel: 75, weaponLevel: 75 }

        mocks.requestBuildTargetValues.mockResolvedValue({})
        const { summaries, refresh } = useBuildSummaries()
        await refresh([{ key: "a2", charId, charSettings: serializeCharSettings(settings) }])

        const second = summaries.value.a2.team[0]
        expect(second.id).toBe(mateIds[1])
        expect(second.char.等级).toBe(75)
        expect(second.weapon?.weapon.等级).toBe(75)
    })
})
