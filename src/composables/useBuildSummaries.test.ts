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
})
