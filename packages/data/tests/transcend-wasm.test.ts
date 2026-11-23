import { describe, expect, it } from "vitest"
import { buildWasmAutobuildRequest, buildWasmIncomeRequest } from "../CalcWasm"
import { type CharSettings, createDefaultCharSettings, normalizeCharSettings } from "../charSettings"
import { charMap } from "../d"
import { buildWasmTranscendPayload, withWasmTranscendPayload } from "../transcend-wasm"
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

/**
 * 主控 + 一号协战的完整配置（升华默认关闭）。
 * @returns 已归一化的配置
 */
function createTeamSettings(): CharSettings {
    const settings = createDefaultCharSettings()
    settings.baseName = charSkillName(MAIN_ID, 1)
    settings.charSkillLevel = [10, 10, 10]
    // 本文件只验证升华载荷口径：关闭溯源，避免默认满溯的派生 BUFF 混淆计数
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

/** 启用升华并写入天赋 + 三组装备 */
function createTranscendSettings(patch: Partial<TranscendSettings> = {}): CharSettings {
    const settings = createTeamSettings()
    settings.transcend = {
        ...settings.transcend,
        enabled: true,
        talentLevels: [[100001, 1]],
        mainGear: [gear({ slotId: 3, affixId: 101 }), gear({ slotId: 3, affixId: 1038 }), gear({ slotId: 1, affixId: 310201 })],
        assist1Gear: [gear({ slotId: 9, affixId: 1506 })],
        ...patch,
    }
    return settings
}

describe("升华 wasm 载荷（U91e）", () => {
    it("总开关关闭 / 缺省：不生成载荷", () => {
        expect(buildWasmTranscendPayload(MAIN_ID, createTeamSettings())).toBeUndefined()
        expect(buildWasmTranscendPayload(MAIN_ID, { ...createTeamSettings(), transcend: null } as unknown as CharSettings)).toBeUndefined()
        expect(withWasmTranscendPayload(MAIN_ID, createTeamSettings())).not.toHaveProperty("transcendEffects")
    })

    it("三侧内容：主控 = 天赋 + 主控装备；协战只有本组装备", () => {
        const payload = buildWasmTranscendPayload(MAIN_ID, createTranscendSettings())!
        expect(payload.main.buffs.map(buff => buff.data.名称)).toEqual([
            "升华天赋·攻击",
            "升华装备·手套·攻击",
            "升华装备·手套·技能等级",
            "升华装备·头盔·技能等级",
            "升华·高温清扫",
        ])
        expect(payload.assist1?.buffs.map(buff => buff.data.名称)).toEqual(["升华装备·护符·技能威力"])
        // 未配置协战二 → 该侧缺席
        expect(payload.assist2).toBeUndefined()
    })

    it("载荷携带技能等级三键与技能替换（源技能 id → 载荷）", () => {
        const payload = buildWasmTranscendPayload(MAIN_ID, createTranscendSettings())!
        // U126b：三键随 BUFF 原样下发，Rust 汇总属性池后二次装配等级（不再有专用字段）
        expect(payload.main).not.toHaveProperty("skillLevelBonus")
        const skillBuffs = payload.main.buffs.filter(buff => buff.data.名称.endsWith("技能等级"))
        expect(skillBuffs).toHaveLength(2)
        const totals: [number, number, number] = [0, 0, 0]
        const keys = ["E技能等级", "Q技能等级", "P技能等级"] as const
        for (const buff of skillBuffs) {
            for (let index = 0; index < keys.length; index++) {
                const value = buff.data.attr?.[keys[index]]
                if (typeof value === "number") totals[index] += value
            }
        }
        expect(totals).toEqual([1, 10, 0])
        expect(payload.main.skillReplacements[310201]).toMatchObject({
            id: 310212,
            名称: "高温清扫",
            字段改写: { 伤害: { 值: 9.03552 } },
        })
        // 协战不吃天赋 / 主控装备
        expect(payload.assist1?.buffs.map(buff => buff.data.名称)).toEqual(["升华装备·护符·技能威力"])
        expect(payload.assist1?.skillReplacements).toEqual({})
    })

    it("BUFF 载荷保留原始记录与等级；覆盖率为 1 时省略", () => {
        const payload = buildWasmTranscendPayload(MAIN_ID, createTranscendSettings())!
        const talent = payload.main.buffs[0]
        expect(talent.level).toBe(1)
        expect(talent.coverage).toBeUndefined()
        expect(talent.data.attr).toEqual({ 攻击: 0.3 })
        // 空效果也必须是可序列化结构
        expect(JSON.parse(JSON.stringify(payload)).main.buffs).toHaveLength(5)
    })

    it("withWasmTranscendPayload：附加主控侧标，不修改原配置", () => {
        const settings = createTranscendSettings()
        const requestSettings = withWasmTranscendPayload(MAIN_ID, settings)
        expect(requestSettings.transcendSide).toBe("main")
        expect(requestSettings.transcendEffects?.main.buffs.length).toBe(5)
        expect(settings).not.toHaveProperty("transcendEffects")
        expect(settings).not.toHaveProperty("transcendSide")
    })

    it("withWasmTranscendPayload 可显式指定装配侧（协战位请求通道）", () => {
        const requestSettings = withWasmTranscendPayload(MAIN_ID, createTranscendSettings(), "assist1")
        expect(requestSettings.transcendSide).toBe("assist1")
        // 载荷仍是完整三侧，仅装配侧标不同
        expect(requestSettings.transcendEffects?.main.buffs.length).toBe(5)
        expect(requestSettings.transcendEffects?.assist1?.buffs.length).toBe(1)
    })

    it("协战 id 先取整再判正数：team1 = 0.4 / 负数 / NaN 不产生 assist1 载荷", () => {
        const settings = createTranscendSettings()
        settings.team1 = 0.4
        expect(buildWasmTranscendPayload(MAIN_ID, settings)?.assist1).toBeUndefined()
        settings.team1 = -3
        expect(buildWasmTranscendPayload(MAIN_ID, settings)?.assist1).toBeUndefined()
        settings.team1 = Number.NaN
        expect(buildWasmTranscendPayload(MAIN_ID, settings)?.assist1).toBeUndefined()
        // 0.6 取整为 1：与 createAssistBuildFromSettings 同序，仍生成该侧载荷
        settings.team1 = 0.6
        expect(buildWasmTranscendPayload(MAIN_ID, settings)?.assist1).toBeDefined()
    })

    it("charId 缺失不抛错：天赋 / 装备效果照常生成", () => {
        const payload = buildWasmTranscendPayload(undefined, createTranscendSettings())
        expect(payload?.main.buffs.length).toBe(5)
    })

    it("自动配装请求：启用时 base.settings 携带载荷，关闭时不携带", () => {
        const enabled = JSON.parse(
            buildWasmAutobuildRequest({
                charId: MAIN_ID,
                settings: createTranscendSettings(),
                includeTypes: [],
                preserveTypes: [],
                fixedMelee: false,
                fixedRanged: false,
                modOptions: [],
                meleeOptions: [],
                rangedOptions: [],
            })
        )
        expect(enabled.base.settings.transcendSide).toBe("main")
        expect(enabled.base.settings.transcendEffects.main.buffs).toHaveLength(5)

        const disabled = JSON.parse(
            buildWasmAutobuildRequest({
                charId: MAIN_ID,
                settings: createTeamSettings(),
                includeTypes: [],
                preserveTypes: [],
                fixedMelee: false,
                fixedRanged: false,
                modOptions: [],
                meleeOptions: [],
                rangedOptions: [],
            })
        )
        expect(disabled.base.settings).not.toHaveProperty("transcendEffects")
        expect(disabled.base.settings).not.toHaveProperty("transcendSide")
    })

    it("收益请求：base 与每条 target 各自携带载荷，非 target 条目不带 settings", () => {
        const settings = createTranscendSettings()
        const enabled = JSON.parse(
            buildWasmIncomeRequest({
                charId: MAIN_ID,
                settings,
                items: [
                    { key: "b", kind: "buff_remove", name: "测试" },
                    { key: "t", kind: "target", charId: MAIN_ID, settings },
                ],
            })
        )
        expect(enabled.base.settings.transcendEffects.main.buffs).toHaveLength(5)
        expect(enabled.items[0]).not.toHaveProperty("settings")
        expect(enabled.items[1].settings.transcendEffects.main.buffs).toHaveLength(5)
        expect(enabled.items[1].settings.transcendSide).toBe("main")

        const disabledSettings = createTeamSettings()
        const disabled = JSON.parse(
            buildWasmIncomeRequest({
                charId: MAIN_ID,
                settings: disabledSettings,
                items: [{ key: "t", kind: "target", charId: MAIN_ID, settings: disabledSettings }],
            })
        )
        expect(disabled.base.settings).not.toHaveProperty("transcendEffects")
        expect(disabled.items[0].settings).not.toHaveProperty("transcendEffects")
    })

    it("U93b 队友限定 BUFF：三侧载荷各含应得条目，来源侧自身不含", () => {
        const settings = createTranscendSettings({
            assist1Gear: [gear({ slotId: 9, affixId: 2015 })],
            assist2Gear: [gear({ slotId: 13, affixId: 2015 })],
        })
        const ASSIST2_ID = charMap.get("刻舟")!.id
        settings.team2 = ASSIST2_ID
        settings.team2Weapon = 10302
        settings.assist2 = {
            ...settings.assist2,
            charLevel: 80,
            charSkillLevel: [10, 10, 10],
            baseName: charSkillName(ASSIST2_ID, 0),
            enabled: true,
        }
        const teamBuffSources = (side: { buffs: { data: { 名称: string; source?: { ownerSide?: string } } }[] } | undefined) =>
            (side?.buffs ?? []).filter(buff => buff.data.名称 === "升华·激昂号令").map(buff => buff.data.source?.ownerSide)

        const payload = buildWasmTranscendPayload(MAIN_ID, settings)!
        // 主控吃两名协战各一份；协战只吃另一名协战的一份，不吃自己的
        expect(teamBuffSources(payload.main)).toEqual(["assist1", "assist2"])
        expect(teamBuffSources(payload.assist1)).toEqual(["assist2"])
        expect(teamBuffSources(payload.assist2)).toEqual(["assist1"])
        // 载荷可序列化，且不写入持久化设置
        const roundTrip = JSON.parse(JSON.stringify(payload))
        expect(roundTrip.main.buffs.filter((buff: { data: { 名称: string } }) => buff.data.名称 === "升华·激昂号令")).toHaveLength(2)
        expect(settings).not.toHaveProperty("transcendEffects")
        expect(settings.transcend.assist1Gear).toHaveLength(1)
    })

    it("U93b 协战停用：该侧载荷不含任何队友限定 BUFF（既非来源也非受益方）", () => {
        const settings = createTranscendSettings({ assist1Gear: [gear({ slotId: 9, affixId: 2015 })] })
        settings.assist1.enabled = false
        const payload = buildWasmTranscendPayload(MAIN_ID, settings)!
        const hasTeamBuff = (side: { buffs: { data: { 名称: string } }[] } | undefined) =>
            (side?.buffs ?? []).some(buff => buff.data.名称 === "升华·激昂号令")
        expect(hasTeamBuff(payload.main)).toBe(false)
        expect(hasTeamBuff(payload.assist1)).toBe(false)
    })
})
