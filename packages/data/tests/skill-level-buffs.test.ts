import { describe, expect, it } from "vitest"
import { createCharBuildFromSettings } from "../CharBuildHelper"
import { type CharSettings, createDefaultAssistSideSettings, createDefaultCharSettings, normalizeCharSettings } from "../charSettings"
import buffData from "../d/buff.data"
import { withWasmTranscendPayload } from "../transcend-wasm"
import type { TranscendGearEntry } from "../transcendGear"

/** 20 条技能等级 BUFF：名称 → 等级来源 */
const SKILL_LEVEL_BUFFS: Record<string, "E" | "Q" | "P"> = {
    法露茜Q: "Q",
    菲娜Q: "Q",
    "主角-水Q": "Q",
    "主角-水被动": "P",
    "主角-光Q(6溯)": "Q",
    "主角-暗Q": "Q",
    刻舟被动: "P",
    刻舟E: "E",
    止流Q: "Q",
    煜明E: "E",
    煜明被动: "P",
    扶疏被动: "P",
    "扶疏被动(4溯)": "P",
    松露与榛子E: "E",
    奥特赛德Q: "Q",
    奥特赛德被动: "P",
    妮弗尔夫人Q日蚀: "Q",
    海尔法被动: "P",
    幻景Q: "Q",
    赛琪被动: "P",
}

/** 主控/协战共用的基础配置（武器只用于满足构筑装配；本文件验证 U99c 等级来源口径，关闭溯源） */
function createSettings(patch: Partial<CharSettings> = {}): CharSettings {
    return normalizeCharSettings({
        ...createDefaultCharSettings(),
        traceLevel: 0,
        meleeWeapon: 10399,
        rangedWeapon: 20510,
        ...patch,
    })
}

/** 菲娜主控配置：Q 等级可调，带一条菲娜Q */
function feinaSettings(qLevel: number, patch: Partial<CharSettings> = {}): CharSettings {
    return createSettings({ charSkillLevel: [10, qLevel, 10], buffs: [["菲娜Q", 12]], ...patch })
}

const CHASE_KEYS = ["水属性追伤", "火属性追伤", "雷属性追伤", "风属性追伤"] as const

describe("技能等级 BUFF 数据契约（U99c）", () => {
    it("20 条 BUFF 均为技能字段表达式 + 等级来源，且不再有 12 项等级数组", () => {
        for (const [name, source] of Object.entries(SKILL_LEVEL_BUFFS)) {
            const buff = buffData.find(item => item.名称 === name)
            expect(buff, name).toBeTruthy()
            expect(buff!.等级来源, name).toBe(source)
            expect(buff!.mx, name).toBe(30)
            const values = Object.values(buff!.attr ?? {})
            expect(values.length, name).toBeGreaterThan(0)
            for (const value of values) {
                if (Array.isArray(value)) {
                    // 常量部分（6 溯暴击 / 4 溯昂扬）保持单元素数组，任意等级同值
                    expect(value, name).toHaveLength(1)
                } else {
                    expect(typeof value, name).toBe("string")
                }
            }
        }
        const twelve = buffData.filter(buff => Object.values(buff.attr ?? {}).some(value => Array.isArray(value) && value.length === 12))
        expect(twelve.map(buff => buff.名称)).toEqual([])
        expect(buffData.some(buff => "异常数量" in (buff.attr ?? {}))).toBe(false)
    })

    it("菲娜Q 四键引用「下午茶开始了」Q 技能字段", () => {
        const feinaQ = buffData.find(buff => buff.名称 === "菲娜Q")!
        for (const key of CHASE_KEYS) {
            expect(feinaQ.attr?.[key]).toBe("下午茶开始了::追加伤害倍率")
        }
    })
})

describe("等级来源联动（主控 / 协战）", () => {
    it("主控菲娜 Q=10/12/30 → 四元素 0.15/0.172/0.37，BUFF 等级同步", () => {
        for (const [qLevel, expected] of [
            [10, 0.15],
            [12, 0.172],
            [30, 0.37],
        ] as const) {
            const build = createCharBuildFromSettings(1801, feinaSettings(qLevel))
            const panel = build.calculateWeaponAttributes(build.meleeWeapon).weapon!
            for (const key of CHASE_KEYS) expect(panel[key], `${key} Q=${qLevel}`).toBeCloseTo(expected, 9)
            expect(build.buffs.find(buff => buff.名称 === "菲娜Q")!.等级).toBe(qLevel)
        }
    })

    it("协战菲娜按来源侧有效 Q 等级求值，主控收到的值与等级同步，存档等级不被改写", () => {
        const settings = createSettings({
            buffs: [["菲娜Q", 12]],
            team1: 1801,
            team1Weapon: 20509,
            assist1: { ...createDefaultAssistSideSettings(), traceLevel: 0, charSkillLevel: [10, 10, 10] },
        })
        const q10 = createCharBuildFromSettings(1501, settings)
        expect(q10.calculateWeaponAttributes(q10.meleeWeapon).weapon!.水属性追伤).toBeCloseTo(0.15, 9)
        expect(q10.buffs.find(buff => buff.名称 === "菲娜Q")!.等级).toBe(10)

        const raised = normalizeCharSettings({ ...settings, assist1: { ...settings.assist1, charSkillLevel: [10, 20, 10] } })
        const q20 = createCharBuildFromSettings(1501, raised)
        expect(q20.calculateWeaponAttributes(q20.meleeWeapon).weapon!.水属性追伤).toBeCloseTo(0.26, 9)
        expect(q20.buffs.find(buff => buff.名称 === "菲娜Q")!.等级).toBe(20)
        expect(raised.buffs[0]).toEqual(["菲娜Q", 12])
    })

    it("升华技能等级词条让有效 Q +7：BUFF 值与等级同步（主控 10 → 17）", () => {
        const gear = (affixId: number): TranscendGearEntry => ({
            slotId: 5,
            affixId,
            rollLevel: 1,
            masterworkLevel: 0,
            ancient: true,
            finalMasterwork: false,
        })
        const settings = feinaSettings(10, { transcend: { enabled: true, mainGear: [gear(1039)] } as CharSettings["transcend"] })
        const build = createCharBuildFromSettings(1801, settings)
        expect(build.getSkillLevel(1)).toBe(17)
        expect(build.calculateWeaponAttributes(build.meleeWeapon).weapon!.水属性追伤).toBeCloseTo(0.227, 9)
        expect(build.buffs.find(buff => buff.名称 === "菲娜Q")!.等级).toBe(17)
    })

    it("自定义 BUFF 静态三键计入等级来源预解析：Q+5 → 菲娜Q 15 级", () => {
        // 「自定义BUFF」条目 + customBuff 同时存在时引擎与预解析都应计入 Q+5
        const settings = feinaSettings(10, {
            buffs: [
                ["菲娜Q", 12],
                ["自定义BUFF", 1],
            ],
            customBuff: [["Q技能等级", 5]],
        })
        const build = createCharBuildFromSettings(1801, settings)
        expect(build.getSkillLevel(1)).toBe(15)
        expect(build.buffs.find(buff => buff.名称 === "菲娜Q")!.等级).toBe(15)
    })
})

describe("wasm 请求副本", () => {
    it("请求副本按来源侧有效等级写入 BUFF 等级，且不改写存档", () => {
        const gear = (affixId: number): TranscendGearEntry => ({
            slotId: 5,
            affixId,
            rollLevel: 1,
            masterworkLevel: 0,
            ancient: true,
            finalMasterwork: false,
        })
        // 主控菲娜 + Q 词条：请求副本 12 → 17；存档保持 12
        const mainSettings = feinaSettings(10, { transcend: { enabled: true, mainGear: [gear(1039)] } as CharSettings["transcend"] })
        const mainRequest = withWasmTranscendPayload(1801, mainSettings)
        expect(mainRequest.buffs[0]?.slice(0, 2)).toEqual(["菲娜Q", 17])
        expect(mainSettings.buffs[0]?.slice(0, 2)).toEqual(["菲娜Q", 12])

        // 协战菲娜：主控 buff 等级取协战侧有效 Q（10），协战自身 buff 同步
        const assistSettings = createSettings({
            buffs: [["菲娜Q", 12]],
            team1: 1801,
            team1Weapon: 20509,
            assist1: { ...createDefaultAssistSideSettings(), traceLevel: 0, charSkillLevel: [10, 20, 10], buffs: [["菲娜被动(自身)", 1]] },
        })
        const assistRequest = withWasmTranscendPayload(1501, assistSettings)
        expect(assistRequest.buffs[0]?.slice(0, 2)).toEqual(["菲娜Q", 20])
        expect(assistRequest.assist1?.buffs[0]?.slice(0, 2)).toEqual(["菲娜被动(自身)", 10])
        expect(assistSettings.buffs[0]?.slice(0, 2)).toEqual(["菲娜Q", 12])
        expect(assistSettings.assist1.buffs[0]?.slice(0, 2)).toEqual(["菲娜被动(自身)", 1])
    })
})
