import { describe, expect, it } from "vitest"
import { createCharBuildFromSettings } from "../CharBuildHelper"
import { getModBuffLvFromSetting, getWBuffLvFromSetting } from "../effectLv"

/**
 * 构造一份基于 createCharBuildFromSettings 的最小角色配置。
 */
function baseSettings(overrides: Record<string, unknown> = {}) {
    return {
        charLevel: 80,
        baseName: "",
        hpPercent: 1,
        resonanceGain: 3,
        enemyId: 130,
        enemyLevel: 80,
        enemyResistance: 0,
        isRouge: false,
        targetFunction: "伤害",
        customVariables: [] as [string, string][],
        charSkillLevel: 10,
        meleeWeapon: 10601,
        meleeWeaponLevel: 80,
        meleeWeaponRefine: 5,
        rangedWeapon: 20101,
        rangedWeaponLevel: 80,
        rangedWeaponRefine: 5,
        auraMod: 31524,
        imbalance: false,
        charMods: Array(8).fill(null) as ([number, number] | null)[],
        meleeMods: Array(8).fill(null) as ([number, number] | null)[],
        rangedMods: Array(8).fill(null) as ([number, number] | null)[],
        skillWeaponMods: Array(4).fill(null) as ([number, number] | null)[],
        buffs: [] as [string, number][],
        customBuff: [] as [string, number][],
        team1: "-",
        team1Weapon: "-" as number | "-",
        team2: "-",
        team2Weapon: "-" as number | "-",
        timelineDPS: false,
        useGlobal: false,
        effectConfig: {} as Record<string, number>,
        actions: { enable: false, i: [], b: [], hp: [], bgs: [] },
        ...overrides,
    }
}

describe("特效等级解析", () => {
    it("effectConfig 缺省时 MOD 特效等级取最大值", () => {
        // 51313 决斗 对应特效无 mx，视为 1（与"全部最大"一致）
        expect(getModBuffLvFromSetting(undefined, 51313)).toBe(1)
        // 41324 雷鸣·燎原 对应特效不存在
        expect(getModBuffLvFromSetting(undefined, 41324)).toBe(1)
    })

    it("effectConfig 显式值时覆盖默认最大", () => {
        expect(getModBuffLvFromSetting({ "m:51313": 0 }, 51313)).toBe(0)
        expect(getModBuffLvFromSetting({ "m:51313": 1 }, 51313)).toBe(1)
        // 未配置的其它 MOD 仍走默认
        expect(getModBuffLvFromSetting({ "m:51313": 0 }, 41324)).toBe(1)
    })

    it("武器特效等级：限定元素不匹配时关闭，匹配时取最大", () => {
        // 10601 红叶一滴 / 20101 剥离 无对应特效 → 默认 1
        expect(getWBuffLvFromSetting(undefined, 10601, "光")).toBe(1)
        // 显式配置生效
        expect(getWBuffLvFromSetting({ "w:10601": 0 }, 10601, "光")).toBe(0)
    })

    it("createCharBuildFromSettings 不勾选使用全局时用 effectConfig", () => {
        const settings = baseSettings({
            charMods: [[51313, 10], ...Array(7).fill(null)],
        })
        const build = createCharBuildFromSettings(4101, settings)
        const mod = build.charMods.find(m => m?.id === 51313)
        expect(mod?.buffLv).toBe(1)
        // 关闭特效后 buffLv 为 0
        const offSettings = baseSettings({
            effectConfig: { "m:51313": 0 },
            charMods: [[51313, 10], ...Array(7).fill(null)],
        })
        const offBuild = createCharBuildFromSettings(4101, offSettings)
        const offMod = offBuild.charMods.find(m => m?.id === 51313)
        expect(offMod?.buffLv).toBe(0)
    })

    it("createCharBuildFromSettings 勾选使用全局时回退到背包快照", () => {
        const settings = baseSettings({
            useGlobal: true,
            charMods: [[51313, 10], ...Array(7).fill(null)],
        })
        const build = createCharBuildFromSettings(4101, settings, {
            buffLv: { 51313: 1 },
        })
        const mod = build.charMods.find(m => m?.id === 51313)
        expect(mod?.buffLv).toBe(1)

        // 快照中未配置时回退 0（旧行为）
        const emptyBuild = createCharBuildFromSettings(4101, settings)
        const emptyMod = emptyBuild.charMods.find(m => m?.id === 51313)
        expect(emptyMod?.buffLv).toBe(0)
    })
})
