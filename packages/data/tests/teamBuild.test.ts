import { describe, expect, it } from "vitest"
import { createCharBuildFromSettings } from "../CharBuildHelper"
import { type CharSettings, createDefaultCharSettings, createEmptyModVariant, serializeCharSettings } from "../charSettings"
import {
    buildAssistBuild,
    calculateTeamTotal,
    clearTeamBuildCache,
    createTeamBuildCache,
    type TeamBuildQuery,
    type TeamBuildQueryResult,
} from "../teamBuild"

/** 主控配置：协战一位指向 1101 + 近战武器 */
function createMainSettings(patch: Partial<CharSettings> = {}): CharSettings {
    const settings = createDefaultCharSettings()
    settings.baseName = "残光"
    settings.team1 = 1101
    settings.team1Weapon = 10206
    settings.team1Build = "-"
    return Object.assign(settings, patch)
}

/** 关联构筑：带 MOD / BUFF / 魔灵 / 递归字段，用于验证清理与变体应用 */
function createLinkedBuildPayload(charId = 1101) {
    const settings = createDefaultCharSettings()
    settings.baseName = "残光"
    settings.charLevel = 90
    settings.charMods[0] = [31524, 10]
    settings.customBuff = [["攻击", 0.1]]
    settings.buffs = [["自定义BUFF", 1]]
    settings.petId = 4211
    settings.traits = [[1010, 3], null, null, null]
    settings.team1 = 1201
    settings.team1Build = "nested"
    settings.team2Build = "nested2"
    settings.modVariants = [createEmptyModVariant()]
    settings.modVariantIndex = 0
    return { charId, charSettings: serializeCharSettings(settings) }
}

/** 记录调用次数的查询函数 */
function createQuery(result: () => Promise<TeamBuildQueryResult | null>) {
    let calls = 0
    const query: TeamBuildQuery = async () => {
        calls++
        return result()
    }
    return { query, calls: () => calls }
}

describe("协战构筑：合成路径", () => {
    it("无链接时合成最小配置：继承主控等级/敌人环境，清空 MOD/BUFF/魔灵，只带协战武器", async () => {
        const main = createMainSettings()
        main.charLevel = 90
        main.enemyId = 130
        main.enemyLevel = 95
        main.enemyResistance = 0.2
        const result = await buildAssistBuild({ slot: 1, mainSettings: main, cache: createTeamBuildCache() })

        expect(result).not.toBeNull()
        expect(result!.source).toBe("synthesized")
        expect(result!.charId).toBe(1101)
        expect(result!.settings.charLevel).toBe(90)
        expect(result!.settings.enemyLevel).toBe(95)
        expect(result!.settings.enemyResistance).toBe(0.2)
        expect(result!.settings.charMods.every(mod => mod === null)).toBe(true)
        expect(result!.settings.buffs).toEqual([])
        expect(result!.settings.petId).toBe(0)
        expect(result!.settings.traits).toEqual([null, null, null, null])
        expect(result!.settings.meleeWeapon).toBe(10206)
        expect(result!.settings.rangedWeapon).toBe(0)
        expect(result!.warnings.some(warning => warning.includes("未配置"))).toBe(false)
        // 合成口径默认取角色首个技能，伤害非零
        expect(result!.settings.baseName).toBe("残光")
        expect(result!.build.calculate()).toBeGreaterThan(0)
    })

    it("未配置协战角色时返回 null", async () => {
        const main = createDefaultCharSettings()
        expect(await buildAssistBuild({ slot: 1, mainSettings: main, cache: createTeamBuildCache() })).toBeNull()
    })
})

describe("协战构筑：链接路径", () => {
    it("复用关联构筑：应用变体、清空递归字段与魔灵、覆盖武器", async () => {
        const main = createMainSettings({ team1Build: "build-1" })
        main.team1BuildVariant = "B"
        const payload = createLinkedBuildPayload(1201)
        const { query } = createQuery(async () => payload)

        const result = await buildAssistBuild({ slot: 1, mainSettings: main, query, cache: createTeamBuildCache() })

        expect(result!.source).toBe("linked")
        expect(result!.charId).toBe(1201)
        // 变体 B 被应用
        expect(result!.settings.modVariantIndex).toBe(1)
        // 递归字段与魔灵被清空，MOD/BUFF 保留（链接构筑是完整 loadout）
        expect(result!.settings.team1Build).toBe("-")
        expect(result!.settings.team2Build).toBe("-")
        expect(result!.settings.team1).toBe("-")
        expect(result!.settings.petId).toBe(0)
        expect(result!.settings.traits).toEqual([null, null, null, null])
        expect(result!.settings.charMods[0]).toEqual([31524, 10])
        expect(result!.settings.charLevel).toBe(90)
        // 协战武器按类型放入对应槽位（另一槽置空）
        expect(result!.settings.meleeWeapon).toBe(10206)
        expect(result!.settings.rangedWeapon).toBe(0)
        expect(result!.warnings).toEqual([])
    })

    it("升华配置以当前页为准：linked 自带的 transcend 不采纳，协战只吃自己组装备", async () => {
        const gear = (slotId: number) => ({
            slotId,
            affixId: 1506,
            rollLevel: 1,
            masterworkLevel: 0,
            ancient: false,
            finalMasterwork: false,
        })
        const main = createMainSettings({ team1Build: "build-transcend" })
        main.transcend = {
            ...main.transcend,
            enabled: true,
            talentLevels: [[100001, 1] as [number, number]],
            assist1Gear: [gear(9)],
        }
        const linkedSettings = createDefaultCharSettings()
        linkedSettings.transcend = {
            ...linkedSettings.transcend,
            enabled: true,
            talentLevels: [[100001, 1] as [number, number]],
            mainGear: [gear(3)],
            assist1Gear: [],
        }
        const payload = { charId: 1101, charSettings: serializeCharSettings(linkedSettings) }
        const { query } = createQuery(async () => payload)

        const result = await buildAssistBuild({ slot: 1, mainSettings: main, query, cache: createTeamBuildCache() })
        const baseline = await buildAssistBuild({
            slot: 1,
            mainSettings: { ...main, transcend: { ...main.transcend, assist1Gear: [] } },
            query,
            cache: createTeamBuildCache(),
        })

        expect(result!.source).toBe("linked")
        // 链接构筑自带的主控装备不进入协战；当前页的协战装备生效
        expect(result!.settings.transcend.mainGear).toEqual([])
        expect(result!.settings.transcend.assist1Gear).toHaveLength(1)
        // 天赋只给主控：协战技能等级不变
        expect(result!.build.skillLevel).toEqual([10, 10, 10])
        expect(result!.build.calculateAttributes().技能威力).toBeGreaterThan(baseline!.build.calculateAttributes().技能威力)
    })

    it("请求的变体不存在时回落到 A 并给出警告", async () => {
        const main = createMainSettings({ team1Build: "build-2" })
        main.team1BuildVariant = "C"
        const payload = createLinkedBuildPayload()
        const { query } = createQuery(async () => payload)

        const result = await buildAssistBuild({ slot: 1, mainSettings: main, query, cache: createTeamBuildCache() })
        expect(result!.settings.modVariantIndex).toBe(0)
        expect(result!.warnings.join()).toContain("回落")
    })

    it("加载失败时降级为合成配置，不抛异常", async () => {
        const main = createMainSettings({ team1Build: "build-3" })
        const { query } = createQuery(async () => {
            throw new Error("network down")
        })
        const result = await buildAssistBuild({ slot: 1, mainSettings: main, query, cache: createTeamBuildCache() })
        expect(result).not.toBeNull()
        expect(result!.source).toBe("synthesized")
        expect(result!.warnings.join()).toContain("加载失败")
    })

    it("builder 返回空配置时同样降级", async () => {
        const main = createMainSettings({ team1Build: "build-4" })
        const { query } = createQuery(async () => ({ charId: 1101, charSettings: null }))
        const result = await buildAssistBuild({ slot: 1, mainSettings: main, query, cache: createTeamBuildCache() })
        expect(result!.source).toBe("synthesized")
        expect(result!.warnings.join()).toContain("加载失败")
    })

    it("同一构筑 id 只拉取一次（缓存命中）", async () => {
        const cache = createTeamBuildCache()
        const main = createMainSettings({ team1Build: "build-5" })
        const payload = createLinkedBuildPayload()
        const { query, calls } = createQuery(async () => payload)
        await buildAssistBuild({ slot: 1, mainSettings: main, query, cache })
        await buildAssistBuild({ slot: 1, mainSettings: main, query, cache })
        expect(calls()).toBe(1)
    })

    it("clearTeamBuildCache 让默认缓存失效", async () => {
        const main = createMainSettings({ team1Build: "build-6" })
        const payload = createLinkedBuildPayload()
        const { query, calls } = createQuery(async () => payload)
        clearTeamBuildCache()
        await buildAssistBuild({ slot: 1, mainSettings: main, query })
        clearTeamBuildCache()
        await buildAssistBuild({ slot: 1, mainSettings: main, query })
        expect(calls()).toBe(2)
    })
})

describe("协战构筑：重复调用与共享构筑", () => {
    it("重复调用返回独立配置：后一次的环境覆盖不改写前一次结果", async () => {
        const cache = createTeamBuildCache()
        const payload = createLinkedBuildPayload()
        const { query, calls } = createQuery(async () => payload)

        const first = createMainSettings({ team1Build: "shared-1" })
        first.enemyLevel = 95
        const firstResult = await buildAssistBuild({ slot: 1, mainSettings: first, query, cache })

        const second = createMainSettings({ team1Build: "shared-1" })
        second.enemyLevel = 80
        const secondResult = await buildAssistBuild({ slot: 1, mainSettings: second, query, cache })

        expect(calls()).toBe(1)
        expect(firstResult!.settings).not.toBe(secondResult!.settings)
        expect(firstResult!.settings.enemyLevel).toBe(95)
        expect(secondResult!.settings.enemyLevel).toBe(80)
        // 前一次返回的构筑实例也不受后一次调用影响
        expect(firstResult!.build.enemy.等级).toBe(95)
    })

    it("两个协战槽链接同一构筑时各自独立（变体/环境互不影响）", async () => {
        const cache = createTeamBuildCache()
        const payload = createLinkedBuildPayload()
        const { query, calls } = createQuery(async () => payload)

        const main = createMainSettings({ team1Build: "shared-2" })
        main.team1BuildVariant = "B"
        main.team2 = 1201
        main.team2Weapon = 20102
        main.team2Build = "shared-2"
        main.team2BuildVariant = "A"

        const slot1 = await buildAssistBuild({ slot: 1, mainSettings: main, query, cache })
        const slot2 = await buildAssistBuild({ slot: 2, mainSettings: main, query, cache })

        expect(calls()).toBe(1)
        expect(slot1!.settings).not.toBe(slot2!.settings)
        expect(slot1!.settings.modVariantIndex).toBe(1)
        expect(slot2!.settings.modVariantIndex).toBe(0)
        // 槽 1 的递归字段清空不被槽 2 覆盖
        expect(slot1!.settings.team2Build).toBe("-")
        expect(slot2!.settings.team2Build).toBe("-")
    })
})

describe("协战构筑：合计", () => {
    it("合计 = 主控 + 协战 1 + 协战 2 的 calculate() 之和", async () => {
        const main = createMainSettings()
        main.team2 = 1201
        main.team2Weapon = 20102
        const mainBuild = createCharBuildFromSettings(1101, main)
        const assist1 = await buildAssistBuild({ slot: 1, mainSettings: main, cache: createTeamBuildCache() })
        const assist2 = await buildAssistBuild({ slot: 2, mainSettings: main, cache: createTeamBuildCache() })

        expect(assist2!.source).toBe("synthesized")

        const expected = mainBuild.calculate() + assist1!.build.calculate() + assist2!.build.calculate()
        expect(calculateTeamTotal([mainBuild, assist1!.build, assist2!.build])).toBeCloseTo(expected, 6)
        // null 与未配置位不参与合计
        expect(calculateTeamTotal([mainBuild, null, undefined])).toBeCloseTo(mainBuild.calculate(), 6)
    })
})
