import { describe, expect, it } from "vitest"
import { createAssistBuildFromSettings, createCharBuildFromSettings, resolveTranscendEffectsForSettings } from "../CharBuildHelper"
import { createBuildFromSnapshot, createWorkerSnapshot } from "../CharBuildSnapshot"
import { type CharSettings, createDefaultCharSettings, normalizeCharSettings } from "../charSettings"
import { charMap } from "../d"
import type { TranscendGearEntry, TranscendSettings } from "../transcendSettings"

const MAIN_CHAR = "希尔妲"
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

/** 构造一条升华装备词条（默认最低档位） */
function gear(patch: Partial<TranscendGearEntry> & Pick<TranscendGearEntry, "slotId" | "affixId">): TranscendGearEntry {
    return {
        rollLevel: 1,
        masterworkLevel: 0,
        ancient: false,
        finalMasterwork: false,
        ...patch,
    }
}

/** 主控 + 一号协战的完整配置（升华默认关闭），用例按需替换 `transcend` */
function createTeamSettings(): CharSettings {
    const settings = createDefaultCharSettings()
    settings.baseName = charSkillName(MAIN_ID, 1)
    settings.charSkillLevel = [10, 10, 10]
    // 本文件只验证升华注入口径：关闭溯源，避免默认满溯的派生 BUFF 混淆断言
    settings.traceLevel = 0
    settings.meleeWeapon = 10302
    settings.rangedWeapon = 20601
    settings.team1 = ASSIST_ID
    settings.team1Weapon = 10302
    settings.assist1 = {
        ...settings.assist1,
        charLevel: 80,
        charSkillLevel: [10, 10, 10],
        traceLevel: 0,
        baseName: charSkillName(ASSIST_ID),
    }
    settings.targetFunction = "伤害"
    return normalizeCharSettings(settings)
}

/**
 * 覆写升华配置并启用总开关。
 * @param settings 角色配置（原地修改）
 * @param patch 升华配置覆盖项
 * @returns 同一份配置
 */
function enableTranscend(settings: CharSettings, patch: Partial<TranscendSettings> = {}) {
    settings.transcend = { ...settings.transcend, enabled: true, ...patch }
    return settings
}

describe("升华效果注入（U91a）", () => {
    it("总开关关闭：效果为空，构建与未配置升华逐值一致", () => {
        const plain = createTeamSettings()
        const configured = createTeamSettings()
        configured.transcend = {
            ...configured.transcend,
            talentLevels: [[100001, 1]],
            mainGear: [gear({ slotId: 3, affixId: 101 })],
        }
        const base = createCharBuildFromSettings(MAIN_ID, plain)
        const build = createCharBuildFromSettings(MAIN_ID, configured)

        expect(resolveTranscendEffectsForSettings(configured, "main", { charId: MAIN_ID }).buffs).toEqual([])
        expect(build.skillLevel).toEqual(base.skillLevel)
        expect(build.skillReplacements).toEqual({})
        expect(build.buffs).toHaveLength(base.buffs.length)
        expect(build.calculate()).toBeCloseTo(base.calculate(), 9)
        expect(build.calculateAttributes()).toEqual(base.calculateAttributes())
    })

    it("主控注入天赋 + 主控装备；技能等级增量叠加并钳制 1-30", () => {
        const plain = createTeamSettings()
        const settings = enableTranscend(createTeamSettings(), {
            talentLevels: [[100001, 1]],
            mainGear: [gear({ slotId: 3, affixId: 101 }), gear({ slotId: 3, affixId: 1038 })],
        })
        const base = createCharBuildFromSettings(MAIN_ID, plain)
        const build = createCharBuildFromSettings(MAIN_ID, settings)

        expect(build.calculateAttributes().攻击).toBeGreaterThan(base.calculateAttributes().攻击)
        expect(build.skillLevel).toEqual([11, 10, 10])

        // 满级后增量被钳制，不会超过 30
        const capped = enableTranscend(createTeamSettings(), { mainGear: [gear({ slotId: 3, affixId: 1038 })] })
        capped.charSkillLevel = [30, 30, 30]
        expect(createCharBuildFromSettings(MAIN_ID, capped).skillLevel).toEqual([30, 30, 30])
    })

    it("协战只吃自己组装备：不吃天赋，也不吃主控 / 另一协战的装备", () => {
        const settings = enableTranscend(createTeamSettings(), {
            talentLevels: [[100001, 1]],
            mainGear: [gear({ slotId: 3, affixId: 101 })],
            assist1Gear: [gear({ slotId: 9, affixId: 1506 })],
            assist2Gear: [gear({ slotId: 13, affixId: 1506 })],
        })
        const assist = createAssistBuildFromSettings(settings, "assist1")!
        const assistNoGear = createAssistBuildFromSettings(
            { ...settings, transcend: { ...settings.transcend, assist1Gear: [] } },
            "assist1"
        )!
        const main = createCharBuildFromSettings(MAIN_ID, settings)
        const mainNoAssistGear = createCharBuildFromSettings(MAIN_ID, {
            ...settings,
            transcend: { ...settings.transcend, assist1Gear: [], assist2Gear: [] },
        })

        expect(assist.calculateAttributes().技能威力).toBeGreaterThan(assistNoGear.calculateAttributes().技能威力)
        // 天赋与主控装备都不进入协战面板
        expect(assist.calculateAttributes().攻击).toBeCloseTo(assistNoGear.calculateAttributes().攻击, 9)
        expect(assist.skillLevel).toEqual([10, 10, 10])
        // 协战装备也不进入主控面板
        expect(main.calculateAttributes()).toEqual(mainNoAssistGear.calculateAttributes())
    })

    it("skillReplacements 进入角色技能（希尔妲 310201 → 310212）", () => {
        const settings = enableTranscend(createTeamSettings(), { mainGear: [gear({ slotId: 1, affixId: 310201 })] })
        const build = createCharBuildFromSettings(MAIN_ID, settings)

        expect(build.skillReplacements[310201]).toMatchObject({ id: 310212 })
        const skill = build.charSkills.find(item => item.id === 310212)
        expect(skill?.名称).toBe("高温清扫")
        expect(build.charSkills.some(item => item.id === 310201)).toBe(false)
    })

    it("skillReplacements 进入同律武器技能（2040601 → 2040603）", () => {
        const settings = enableTranscend(createTeamSettings(), { mainGear: [gear({ slotId: 6, affixId: 2040601 })] })
        settings.rangedWeapon = 20406
        const build = createCharBuildFromSettings(MAIN_ID, settings)

        const skill = build.rangedWeaponSkills.find(item => item.id === 2040603)
        expect(skill?.名称).toBe("射击")
        expect(skill?.武器名).toBe("切割齿轮")
    })

    it("主控 角色名::属性 查询到协战自己的升华装备", () => {
        const settings = createTeamSettings()
        settings.targetFunction = `${ASSIST_CHAR}::技能威力`
        const plainAssist = createAssistBuildFromSettings(settings, "assist1")!
        enableTranscend(settings, { assist1Gear: [gear({ slotId: 9, affixId: 1506 })] })
        const build = createCharBuildFromSettings(MAIN_ID, settings)
        const assist = createAssistBuildFromSettings(settings, "assist1")!

        const assistAttr = assist.calculateAttributes().技能威力
        expect(assistAttr).toBeGreaterThan(plainAssist.calculateAttributes().技能威力)
        expect(build.evaluateAST(`${ASSIST_CHAR}::技能威力`)).toBeCloseTo(assistAttr, 6)
    })

    it("worker 快照往返保留 transcend、效果 BUFF 与技能替换，数值不变", () => {
        const settings = enableTranscend(createTeamSettings(), {
            talentLevels: [[100001, 1]],
            mainGear: [gear({ slotId: 3, affixId: 101 }), gear({ slotId: 1, affixId: 310201 }), gear({ slotId: 6, affixId: 1040 })],
        })
        const build = createCharBuildFromSettings(MAIN_ID, settings)
        const snapshot = createWorkerSnapshot(build)

        expect(snapshot.settings?.transcend.enabled).toBe(true)
        expect(snapshot.settings?.transcend.talentLevels).toEqual([[100001, 1]])
        expect(snapshot.settings?.transcend.mainGear).toHaveLength(3)
        expect(snapshot.skillReplacements?.[310201]).toMatchObject({ id: 310212 })

        const restored = createBuildFromSnapshot(snapshot)
        expect(restored.skillLevel).toEqual(build.skillLevel)
        expect(restored.charSkills.find(item => item.id === 310212)).toBeDefined()
        expect(restored.calculate()).toBeCloseTo(build.calculate(), 9)
    })

    it("resolveTranscendEffectsForSettings：省略构筑位按主控，协战位不吃天赋", () => {
        const settings = enableTranscend(createTeamSettings(), {
            talentLevels: [[100001, 1]],
            mainGear: [gear({ slotId: 3, affixId: 101 })],
        })
        const main = resolveTranscendEffectsForSettings(settings, "main", { charId: MAIN_ID })
        const assist = resolveTranscendEffectsForSettings(settings, "assist1", { charId: ASSIST_ID })

        expect(main.buffs.map(buff => buff.名称)).toContain("升华天赋·攻击")
        expect(assist.buffs.map(buff => buff.名称)).not.toContain("升华天赋·攻击")
        expect(main.buffs.length).toBeGreaterThan(assist.buffs.length)
    })
})
