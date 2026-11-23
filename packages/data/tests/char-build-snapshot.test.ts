import { describe, expect, it, vi } from "vitest"
import { createAssistBuildFromSettings, createBuffFromSettings, createCharBuildFromSettings } from "../CharBuildHelper"
import { type CharBuildWorkerSnapshot, createBuildFromSnapshot, createWorkerSnapshot } from "../CharBuildSnapshot"
import { createDefaultCharSettings, normalizeCharSettings } from "../charSettings"
import { charMap } from "../d"
import { resolveTraceOffRoots } from "../traceEffects"

const MAIN_CHAR = "黎瑟"
const ASSIST_CHAR = "扶疏"
const MAIN_ID = charMap.get(MAIN_CHAR)!.id
const ASSIST_ID = charMap.get(ASSIST_CHAR)!.id

/**
 * 读取角色技能名（数据表的 `Skill.名称` 为可选字段）。
 * @param charId 角色 id
 * @param index 技能索引
 * @returns 技能名称
 */
function charSkillName(charId: number, index = 0) {
    const name = charMap.get(charId)?.技能?.[index]?.名称
    if (!name) throw new Error(`角色 ${charId} 缺少第 ${index} 个技能`)
    return name
}

/**
 * 主控 + 1 号协战（等级 70）配置：用于验证 worker 快照往返后跨角色表达式仍按协战面板求值。
 * @returns 已归一化的角色配置
 */
function createTeamSettings() {
    const settings = createDefaultCharSettings()
    settings.baseName = charSkillName(MAIN_ID, 1)
    settings.charLevel = 80
    settings.charSkillLevel = [10, 10, 10]
    settings.team1 = ASSIST_ID
    settings.team1Weapon = 10302
    settings.assist1 = {
        ...settings.assist1,
        charLevel: 70,
        charSkillLevel: [10, 10, 10],
        baseName: charSkillName(ASSIST_ID),
        charMods: [[41001, 10], null, null, null, null, null, null, null],
        buffs: [["菲娜4溯", 10]],
        customBuff: [["技能威力", 0.6]],
    }
    settings.targetFunction = `${ASSIST_CHAR}::技能威力*0.7`
    return normalizeCharSettings(settings)
}

describe("worker 快照的跨角色表达式往返", () => {
    it("快照保留 assist1/team1，重建后目标值与主线程一致", () => {
        const settings = createTeamSettings()
        const build = createCharBuildFromSettings(MAIN_ID, settings)
        const snapshot = createWorkerSnapshot(build)

        // 协战完整 loadout 必须随快照下发，否则 worker 侧跨角色表达式会静默算成 0
        expect(snapshot.settings?.team1).toBe(ASSIST_ID)
        expect(snapshot.settings?.assist1?.charLevel).toBe(70)

        const restored = createBuildFromSnapshot(snapshot)
        const assist = createAssistBuildFromSettings(settings, "assist1")
        expect(assist).toBeDefined()
        const expected = assist!.calculateAttributes().技能威力 * 0.7
        expect(expected).toBeGreaterThan(0)
        expect(build.calculate()).toBeCloseTo(expected, 6)
        expect(restored.calculate()).toBeCloseTo(expected, 6)
        expect(restored.settings?.assist1?.charLevel).toBe(70)
    })

    it("协战缺武器：查询为 0 且不打印命名空间错误（快照往返一致）", () => {
        const settings = createTeamSettings()
        settings.team1Weapon = "-"
        const normalized = normalizeCharSettings(settings)
        const build = createCharBuildFromSettings(MAIN_ID, normalized)
        const restored = createBuildFromSnapshot(createWorkerSnapshot(build))
        expect(createAssistBuildFromSettings(normalized, "assist1")).toBeUndefined()
        const error = vi.spyOn(console, "error").mockImplementation(() => {})
        try {
            expect(build.evaluateAST(`${ASSIST_CHAR}::技能威力`)).toBe(0)
            expect(restored.evaluateAST(`${ASSIST_CHAR}::技能威力`)).toBe(0)
            expect(error).not.toHaveBeenCalled()
        } finally {
            error.mockRestore()
        }
    })

    it("完全未配置协战的快照：表达式为 0，不抛异常", () => {
        const settings = normalizeCharSettings(createDefaultCharSettings())
        settings.targetFunction = `${ASSIST_CHAR}::技能威力`
        const build = createCharBuildFromSettings(MAIN_ID, settings)
        const restored = createBuildFromSnapshot(createWorkerSnapshot(build))
        const error = vi.spyOn(console, "error").mockImplementation(() => {})
        try {
            expect(build.calculate()).toBe(0)
            expect(restored.calculate()).toBe(0)
        } finally {
            error.mockRestore()
        }
    })
})

describe("worker 快照的升华配置往返（U91a）", () => {
    it("保留 settings.transcend、升华效果 BUFF 与技能替换，重建数值一致", () => {
        const charId = charMap.get("希尔妲")!.id
        const settings = normalizeCharSettings({
            baseName: charSkillName(charId, 1),
            charSkillLevel: [10, 10, 10],
            meleeWeapon: 10302,
            rangedWeapon: 20601,
            transcend: {
                enabled: true,
                talentLevels: [[100001, 1]],
                mainGear: [
                    { slotId: 1, affixId: 310201, rollLevel: 1, masterworkLevel: 0, ancient: false, finalMasterwork: false },
                    { slotId: 3, affixId: 101, rollLevel: 1, masterworkLevel: 0, ancient: false, finalMasterwork: false },
                ],
            },
        })
        const build = createCharBuildFromSettings(charId, settings)
        const snapshot = createWorkerSnapshot(build)

        expect(snapshot.settings?.transcend.enabled).toBe(true)
        expect(snapshot.settings?.transcend.talentLevels).toEqual([[100001, 1]])
        expect(snapshot.settings?.transcend.mainGear).toHaveLength(2)
        expect(snapshot.skillReplacements?.[310201]).toMatchObject({ id: 310212 })
        expect(snapshot.buffs.some(buff => buff.data.名称 === "升华天赋·攻击")).toBe(true)

        const restored = createBuildFromSnapshot(snapshot)
        expect(restored.skillLevel).toEqual(build.skillLevel)
        expect(restored.charSkills.find(skill => skill.id === 310212)).toBeDefined()
        expect(restored.calculate()).toBeCloseTo(build.calculate(), 6)
    })

    it("技能等级加成随快照往返：baseSkillLevel + 三键属性一致", () => {
        const charId = charMap.get("希尔妲")!.id
        // 直接写已归一化配置：`normalizeCharSettings` 会把平铺词条转成物品式并丢 finalMasterwork
        const settings = createDefaultCharSettings()
        settings.baseName = charSkillName(charId, 1)
        settings.charSkillLevel = [10, 10, 10]
        settings.meleeWeapon = 10302
        // 关闭溯源：本用例只验证技能等级加成随快照往返（U114 起非菲娜 3/5 根源也会提供等级增量）
        settings.traceOffRoots = resolveTraceOffRoots(undefined, 0, charId)
        settings.transcend = {
            ...settings.transcend,
            enabled: true,
            mainGear: [{ slotId: 6, affixId: 1040, rollLevel: 1, masterworkLevel: 0, ancient: true, finalMasterwork: true }],
        }
        const build = createCharBuildFromSettings(charId, settings)!
        expect(build.baseSkillLevel).toEqual([10, 10, 10])
        expect(build.skillLevel).toEqual([10, 10, 18])
        expect(build.calculateAttributes().P技能等级).toBe(8)

        const snapshot = createWorkerSnapshot(build)
        expect(snapshot.baseSkillLevel).toEqual([10, 10, 10])
        expect(snapshot.skillLevel).toEqual([10, 10, 18])
        expect(snapshot).not.toHaveProperty("skillLevelBonus")

        const restored = createBuildFromSnapshot(snapshot)
        expect(restored.baseSkillLevel).toEqual([10, 10, 10])
        expect(restored.skillLevel).toEqual([10, 10, 18])
        expect(restored.getSkillLevel(2)).toBe(18)
        // 面板读数来自随快照保留的合成 BUFF 三键属性，不再靠专用字段
        expect(restored.calculateAttributes().P技能等级).toBe(8)
        expect(restored.calculateAttributes().E技能等级).toBe(0)
        expect(restored.buffs.some(buff => buff.名称 === "升华装备·项链·技能等级")).toBe(true)
    })

    it("旧快照（最终等级 + skillLevelBonus）反推基础值并补合成 BUFF", () => {
        const charId = charMap.get("希尔妲")!.id
        const settings = createDefaultCharSettings()
        settings.baseName = charSkillName(charId, 1)
        settings.charSkillLevel = [10, 10, 10]
        settings.meleeWeapon = 10302
        settings.traceOffRoots = resolveTraceOffRoots(undefined, 0, charId)
        settings.transcend = {
            ...settings.transcend,
            enabled: true,
            mainGear: [{ slotId: 6, affixId: 1040, rollLevel: 1, masterworkLevel: 0, ancient: true, finalMasterwork: true }],
        }
        const snapshot = JSON.parse(
            JSON.stringify(createWorkerSnapshot(createCharBuildFromSettings(charId, settings)!))
        ) as CharBuildWorkerSnapshot
        // 还原旧快照形状：无 baseSkillLevel / 有 skillLevelBonus / 目标合成 BUFF 尚未存在
        snapshot.baseSkillLevel = undefined
        snapshot.skillLevel = [10, 10, 18]
        snapshot.skillLevelBonus = [0, 0, 8]
        snapshot.buffs = snapshot.buffs.filter(buff => !buff.data.名称.endsWith("技能等级"))

        const restored = createBuildFromSnapshot(snapshot)
        expect(restored.baseSkillLevel).toEqual([10, 10, 10])
        expect(restored.skillLevel).toEqual([10, 10, 18])
        expect(restored.getSkillLevel(2)).toBe(18)
        expect(restored.calculateAttributes().P技能等级).toBe(8)
        expect(restored.buffs.some(buff => buff.名称 === "旧快照技能等级加成")).toBe(true)
    })

    it("新快照兼容字段取有效值：原地加三键 BUFF 后未计算也不陈旧", () => {
        const charId = charMap.get("希尔妲")!.id
        const settings = createDefaultCharSettings()
        settings.baseName = charSkillName(charId, 1)
        settings.charSkillLevel = [10, 10, 10]
        settings.meleeWeapon = 10302
        settings.traceOffRoots = resolveTraceOffRoots(undefined, 0, charId)
        const build = createCharBuildFromSettings(charId, settings)!
        expect(build.skillLevel).toEqual([10, 10, 10])
        // 原地加三键 BUFF：不调用 calculate / getSkillLevel，快照仍应写有效值
        build.buffs.push(createBuffFromSettings("自定义BUFF", 1, [["P技能等级", 8]])!)
        const snapshot = createWorkerSnapshot(build)
        expect(snapshot.baseSkillLevel).toEqual([10, 10, 10])
        expect(snapshot.skillLevel).toEqual([10, 10, 18])
        // 新读取方仍只用 baseSkillLevel + buffs 重建
        expect(createBuildFromSnapshot(snapshot).skillLevel).toEqual([10, 10, 18])
    })
})

describe("worker 快照的溯源关闭列表（U113）", () => {
    const FEINA_ID = charMap.get("菲娜")!.id

    /** 菲娜主控配置：带 Q 追加伤害，可指定关闭的根源 */
    function feinaSettings(traceOffRoots: number[]) {
        return normalizeCharSettings({
            ...createDefaultCharSettings(),
            meleeWeapon: 10206,
            rangedWeapon: 20102,
            auraMod: 0,
            baseName: charSkillName(FEINA_ID, 1),
            buffs: [["菲娜Q", 10]],
            traceOffRoots,
        })
    }

    it("快照携带 traceOffRoots 且 traceLevel 同步为最高激活根源，重建数值一致", () => {
        const settings = feinaSettings([2])
        const build = createCharBuildFromSettings(FEINA_ID, settings)
        const snapshot = createWorkerSnapshot(build)

        expect(snapshot.settings?.traceOffRoots).toEqual([2])
        expect(snapshot.settings?.traceLevel).toBe(6)

        const restored = createBuildFromSnapshot(snapshot)
        expect(restored.calculate()).toBeCloseTo(build.calculate(), 6)
        // 2 根源关闭：4 根源回到 30 层（0.02×30 / 0.01×30）
        const layerBuff = restored.buffs.find(buff => buff.名称 === "菲娜4溯")!
        expect(layerBuff.values.技能威力).toBeCloseTo(0.6, 10)
        expect(layerBuff.values.技能范围).toBeCloseTo(0.3, 10)
    })

    it("关闭 3 根源后快照重建不产生技能等级增量", () => {
        const settings = feinaSettings([3])
        const build = createCharBuildFromSettings(FEINA_ID, settings)
        expect(build.calculateAttributes().Q技能等级).toBe(2)
        const restored = createBuildFromSnapshot(createWorkerSnapshot(build))
        expect(restored.calculateAttributes().Q技能等级).toBe(2)
        expect(restored.skillLevel).toEqual(build.skillLevel)
    })

    it("快照携带 traceStacks：覆盖率 / 等级随重建生效（U115）", () => {
        const settings = normalizeCharSettings({
            ...createDefaultCharSettings(),
            meleeWeapon: 10206,
            rangedWeapon: 20102,
            auraMod: 0,
            baseName: charSkillName(FEINA_ID, 1),
            buffs: [["菲娜Q", 10]],
            traceStacks: [[1, 1, 0.5]],
        })
        const build = createCharBuildFromSettings(FEINA_ID, settings)
        const snapshot = createWorkerSnapshot(build)
        expect(snapshot.settings?.traceStacks).toEqual([[1, 1, 0.5]])

        const restored = createBuildFromSnapshot(snapshot)
        expect(restored.calculate()).toBeCloseTo(build.calculate(), 6)
        expect(restored.buffs.find(buff => buff.名称 === "菲娜1溯")!.values.属性穿透).toBeCloseTo(0.12, 10)
    })
})
