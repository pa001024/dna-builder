import { describe, expect, it, vi } from "vitest"
import {
    type CharBuild,
    type CharBuildInvSnapshot,
    type CharSettings,
    charMap,
    createDefaultCharSettings,
    normalizeCharSettings,
} from "@/data"
import { createCharBuildFromSettings } from "@/data/CharBuildHelper"
import { applyCharTargetPatch, computeCharTeamSnapshot, createAssistTargetSide, createMainTargetSide } from "@/utils/char-team"
import { getSingleParticipatingSide, getSingleParticipatingSkillName } from "@/utils/transcend-build"

const MAIN_ID = 1101
const ASSIST1_ID = 1102
const ASSIST2_ID = 1103
const ASSIST1_WEAPON = 10206
const ASSIST2_WEAPON = 20102

/**
 * 读取角色技能名（数据表的 `Skill.名称` 为可选字段）。
 * @param charId 角色 id
 * @param index 技能索引
 * @returns 技能名称
 */
function charSkillName(charId: number, index = 0): string {
    const name = charMap.get(charId)?.技能?.[index]?.名称
    if (!name) throw new Error(`角色 ${charId} 缺少第 ${index} 个技能`)
    return name
}

/** 基础配置：主控 1101 + 首个技能，两条协战均未配置（关闭溯源，锁定既有数值锚点） */
function createBaseSettings(): CharSettings {
    const settings = createDefaultCharSettings()
    settings.baseName = charSkillName(MAIN_ID)
    settings.charSkillLevel = [10, 10, 10]
    settings.traceLevel = 0
    return normalizeCharSettings(settings)
}

/** 协战 loadout 的可选覆盖项 */
interface AssistOptions {
    /** 单武器 id；传 "-" 表示未配置武器（构建应失败） */
    weapon?: number | "-"
    enabled?: boolean
    charLevel?: number
    targetFunction?: string
    buffs?: [string, number][]
    useGlobal?: boolean
}

/**
 * 给指定协战位写入完整 loadout（角色 id + 单武器 + 首个技能）。
 * @param settings 已有配置
 * @param side 协战位
 * @param options 覆盖项
 * @returns 归一化后的新配置
 */
function withAssist(settings: CharSettings, side: "assist1" | "assist2", options: AssistOptions = {}): CharSettings {
    const charId = side === "assist1" ? ASSIST1_ID : ASSIST2_ID
    const teamKey = side === "assist1" ? "team1" : "team2"
    const weaponKey = side === "assist1" ? "team1Weapon" : "team2Weapon"
    const patch: CharSettings = { ...settings }
    patch[teamKey] = charId
    patch[weaponKey] = options.weapon ?? (side === "assist1" ? ASSIST1_WEAPON : ASSIST2_WEAPON)
    patch[side] = {
        ...settings[side],
        baseName: charSkillName(charId),
        charSkillLevel: [10, 10, 10],
        traceLevel: 0,
        // 显式关闭溯源：清掉归一化后的关闭列表，让 traceLevel 迁移生效
        traceOffRoots: undefined,
        charLevel: options.charLevel ?? settings[side].charLevel,
        targetFunction: options.targetFunction ?? settings[side].targetFunction,
        enabled: options.enabled ?? true,
        buffs: options.buffs ?? settings[side].buffs,
        useGlobal: options.useGlobal ?? settings[side].useGlobal,
    }
    return normalizeCharSettings(patch)
}

/**
 * 屏蔽预期内的构建告警（未知角色构造协战会 `console.warn`）。
 * @param run 被测调用
 * @returns 调用结果
 */
function silenceWarn<T>(run: () => T): T {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
        return run()
    } finally {
        spy.mockRestore()
    }
}

/** 构造快照：默认用主控 id 与对应 mainBuild，可覆盖（如主控 build 缺失） */
function snapshotOf(
    settings: CharSettings,
    overrides: { charId?: number; mainBuild?: CharBuild | null; inv?: CharBuildInvSnapshot } = {}
): ReturnType<typeof computeCharTeamSnapshot> {
    const normalized = normalizeCharSettings(settings)
    const charId = overrides.charId ?? MAIN_ID
    const mainBuild =
        overrides.mainBuild !== undefined ? overrides.mainBuild : charId > 0 ? createCharBuildFromSettings(charId, normalized) : null
    return computeCharTeamSnapshot({ settings: normalized, charId, mainBuild, inv: overrides.inv })
}

describe("目标面板三侧状态", () => {
    it("主控状态取 6 个 per-side 字段，启用位来自 mainTargetEnabled", () => {
        const settings = createBaseSettings()
        const side = createMainTargetSide(settings, MAIN_ID)
        expect(side.charId).toBe(MAIN_ID)
        expect(side.baseName).toBe("残光")
        expect(side.targetFunction).toBe("")
        expect(side.customVariables).toEqual([])
        expect(side.dotSettings).toEqual({ skill: 0, melee: 0, ranged: 0, skillweapon: 0, forceOwnAdditionalDamage: false })
        expect(side.enabled).toBe(true)

        const disabled = createMainTargetSide(normalizeCharSettings({ ...settings, mainTargetEnabled: false }), MAIN_ID)
        expect(disabled.enabled).toBe(false)
    })

    it("协战状态取 teamN 的角色 id 与 assistN 的字段", () => {
        const settings = withAssist(createBaseSettings(), "assist1", { targetFunction: "1" })
        const side = createAssistTargetSide(settings, "assist1")
        expect(side.charId).toBe(ASSIST1_ID)
        expect(side.baseName).toBe("风花飞旋")
        expect(side.targetFunction).toBe("1")
        expect(side.enabled).toBe(true)

        const empty = createAssistTargetSide(createBaseSettings(), "assist2")
        expect(empty.charId).toBe(0)
        expect(empty.baseName).toBe("")

        const disabled = createAssistTargetSide(withAssist(createBaseSettings(), "assist1", { enabled: false }), "assist1")
        expect(disabled.enabled).toBe(false)
    })

    it("投影返回独立副本：改动返回值不污染 CharSettings", () => {
        const settings = withAssist(createBaseSettings(), "assist1", { targetFunction: "1" })
        settings.customVariables = [["攻击力", "1"]]
        const main = createMainTargetSide(settings, MAIN_ID)
        const assist = createAssistTargetSide(settings, "assist1")
        main.customVariables[0][1] = "999"
        main.dotSettings.skill = 5
        assist.customVariables.push(["新变量", "1"])
        assist.dotSettings.melee = 5
        expect(settings.customVariables).toEqual([["攻击力", "1"]])
        expect(settings.dotSettings.skill).toBe(0)
        expect(settings.assist1.customVariables).toEqual([])
        expect(settings.assist1.dotSettings.melee).toBe(0)
    })
})

describe("原版三人快照", () => {
    it("仅主控：协战为空段，合计等于主控伤害", () => {
        const snapshot = snapshotOf(createBaseSettings())
        expect(snapshot.main?.damage).toBeGreaterThan(0)
        expect(snapshot.assist1).toBeNull()
        expect(snapshot.assist2).toBeNull()
        expect(snapshot.sideStates.main).toMatchObject({ charId: MAIN_ID, state: "ok" })
        expect(snapshot.sideStates.assist1).toMatchObject({ charId: 0, state: "empty" })
        expect(snapshot.sideStates.assist2).toMatchObject({ charId: 0, state: "empty" })
        expect(snapshot.builds.assist1).toBeNull()
        expect(snapshot.builds.assist2).toBeNull()
        expect(snapshot.total).toBe(snapshot.main?.damage)
        expect(snapshot.totalError).toBeNull()
        expect(snapshot.settings.main.charId).toBe(MAIN_ID)
        expect(snapshot.settings.assist1.charId).toBe(0)
    })

    it("仅一段协战：主控禁用后合计等于协战伤害", () => {
        const settings = withAssist(createBaseSettings(), "assist1")
        settings.mainTargetEnabled = false
        const snapshot = snapshotOf(settings)
        expect(snapshot.sideStates.main).toMatchObject({ charId: MAIN_ID, state: "disabled" })
        expect(snapshot.main).toBeNull()
        expect(snapshot.builds.main).toBeNull()
        expect(snapshot.sideStates.assist1.state).toBe("ok")
        expect(snapshot.assist1?.damage).toBeGreaterThan(0)
        expect(snapshot.total).toBe(snapshot.assist1?.damage)
        expect(getSingleParticipatingSide(snapshot)).toBe("assist1")
    })

    it("两段协战：主控禁用时合计为两条协战之和", () => {
        const settings = withAssist(withAssist(createBaseSettings(), "assist1"), "assist2")
        settings.mainTargetEnabled = false
        const snapshot = snapshotOf(settings)
        expect(snapshot.assist1?.damage).toBeGreaterThan(0)
        expect(snapshot.assist2?.damage).toBeGreaterThan(0)
        expect(snapshot.total).toBeCloseTo((snapshot.assist1?.damage ?? 0) + (snapshot.assist2?.damage ?? 0), 6)
    })

    it("三段：合计等于各段 calculate() 之和，builds 与结果共用同一实例", () => {
        const settings = withAssist(withAssist(createBaseSettings(), "assist1"), "assist2")
        const snapshot = snapshotOf(settings)
        expect(snapshot.main).not.toBeNull()
        expect(snapshot.assist1).not.toBeNull()
        expect(snapshot.assist2).not.toBeNull()
        expect(snapshot.builds.main).toBe(snapshot.main?.build)
        expect(snapshot.builds.assist1).toBe(snapshot.assist1?.build)
        expect(snapshot.builds.assist2).toBe(snapshot.assist2?.build)
        // 固定数值锚点（实数，主控 80 级 + 两协战 80 级 / 10 技能）
        expect(snapshot.main?.damage).toBeCloseTo(15366.192, 2)
        expect(snapshot.assist1?.damage).toBeCloseTo(1633.925, 2)
        expect(snapshot.assist2?.damage).toBeCloseTo(5021.212, 2)
        expect(snapshot.total).toBeCloseTo(22021.329, 2)
        const expected =
            (snapshot.main?.build.calculate() ?? 0) +
            (snapshot.assist1?.build.calculate() ?? 0) +
            (snapshot.assist2?.build.calculate() ?? 0)
        expect(snapshot.total).toBeCloseTo(expected, 6)
        expect(snapshot.total).toBeGreaterThan(snapshot.main?.damage ?? 0)
    })

    it("各段使用自己的目标表达式求值", () => {
        const settings = withAssist(createBaseSettings(), "assist1", { targetFunction: "2" })
        settings.targetFunction = "1"
        const snapshot = snapshotOf(settings)
        expect(snapshot.main?.damage).toBe(1)
        expect(snapshot.assist1?.damage).toBe(2)
        expect(snapshot.total).toBe(3)
    })

    it("主控禁用 / 协战禁用：禁用段记为 disabled 且不计入合计", () => {
        const settings = withAssist(createBaseSettings(), "assist1", { enabled: false })
        const snapshot = snapshotOf(settings)
        expect(snapshot.sideStates.assist1).toMatchObject({ charId: ASSIST1_ID, state: "disabled" })
        expect(snapshot.assist1).toBeNull()
        expect(snapshot.builds.assist1).toBeNull()
        expect(snapshot.total).toBe(snapshot.main?.damage)

        const allDisabled = { ...settings, mainTargetEnabled: false }
        const noSide = snapshotOf(allDisabled)
        expect(noSide.sideStates.main.state).toBe("disabled")
        expect(noSide.sideStates.assist1.state).toBe("disabled")
        expect(noSide.total).toBeNull()
        expect(noSide.totalError).toBeNull()
    })

    it("协战无角色 → empty；无武器 → failed 且合计为 null", () => {
        const empty = snapshotOf(createBaseSettings())
        expect(empty.sideStates.assist1.state).toBe("empty")
        expect(empty.total).toBe(empty.main?.damage)

        const noWeapon = snapshotOf(withAssist(createBaseSettings(), "assist1", { weapon: "-" }))
        expect(noWeapon.sideStates.assist1).toMatchObject({ charId: ASSIST1_ID, state: "failed" })
        expect(noWeapon.assist1).toBeNull()
        expect(noWeapon.builds.assist1).toBeNull()
        expect(noWeapon.total).toBeNull()
        // 构建失败不是表达式错误，totalError 保持 null
        expect(noWeapon.totalError).toBeNull()
    })

    it("主控 build 缺失 → failed；主控 id 无效 → empty", () => {
        const missingBuild = snapshotOf(createBaseSettings(), { mainBuild: null })
        expect(missingBuild.sideStates.main).toMatchObject({ charId: MAIN_ID, state: "failed" })
        expect(missingBuild.total).toBeNull()

        const noChar = snapshotOf(createBaseSettings(), { charId: 0 })
        expect(noChar.sideStates.main).toMatchObject({ charId: 0, state: "empty" })
        expect(noChar.total).toBeNull()
    })

    it("目标表达式语法错误 → invalid，total 为 null 且 totalError 为错误原文", () => {
        const mainError = withAssist(createBaseSettings(), "assist1")
        mainError.targetFunction = "1 +"
        const byMain = snapshotOf(mainError)
        expect(byMain.sideStates.main.state).toBe("invalid")
        expect(byMain.main?.damage).toBeNull()
        expect(byMain.main?.error).toBeTruthy()
        expect(byMain.total).toBeNull()
        expect(byMain.totalError).toBe(byMain.main?.error)

        const assistError = snapshotOf(withAssist(createBaseSettings(), "assist1", { targetFunction: "1 +" }))
        expect(assistError.sideStates.assist1.state).toBe("invalid")
        expect(assistError.total).toBeNull()
        expect(assistError.totalError).toContain("操作数")
    })

    it("修改 assist1 的等级 / BUFF 后合计变化（settings 真正参与计算）", () => {
        const base = withAssist(createBaseSettings(), "assist1")
        const snapshot = snapshotOf(base)
        expect(snapshot.total).toBeCloseTo(17000.117, 2)

        const lowLevel = snapshotOf(withAssist(base, "assist1", { charLevel: 1 }))
        expect(lowLevel.assist1?.damage).toBeCloseTo(81.12, 2)
        expect(lowLevel.total).toBeCloseTo(15447.312, 2)

        const buffed = snapshotOf(withAssist(base, "assist1", { buffs: [["激扬寒波", 10]] }))
        expect(buffed.assist1?.damage).toBeCloseTo(1978.123, 2)
        expect(buffed.total).toBeCloseTo(17344.315, 2)
    })

    it("唯一参与段返回该段原始 baseName；两段 / 0 段返回 null", () => {
        const onlyMain = snapshotOf(createBaseSettings())
        expect(getSingleParticipatingSkillName(onlyMain)).toBe("残光")

        const onlyAssist = withAssist(createBaseSettings(), "assist1")
        onlyAssist.mainTargetEnabled = false
        const assistSnapshot = snapshotOf(onlyAssist)
        expect(getSingleParticipatingSide(assistSnapshot)).toBe("assist1")
        expect(getSingleParticipatingSkillName(assistSnapshot)).toBe("风花飞旋")

        const twoSides = snapshotOf(withAssist(createBaseSettings(), "assist1"))
        expect(getSingleParticipatingSide(twoSides)).toBeNull()
        expect(getSingleParticipatingSkillName(twoSides)).toBeNull()

        const noSide = withAssist(createBaseSettings(), "assist1", { enabled: false })
        noSide.mainTargetEnabled = false
        const none = snapshotOf(noSide)
        expect(getSingleParticipatingSide(none)).toBeNull()
        expect(getSingleParticipatingSkillName(none)).toBeNull()
    })

    it("inv 传给协战 build：useGlobal 时武器特效等级取背包快照", () => {
        // 囚鸟的刺羽（10107）特效限定「暗」，对暗属性协战芙罗拉生效
        const settings = withAssist(createBaseSettings(), "assist1", { weapon: 10107, useGlobal: true })
        const noInv = snapshotOf(settings)
        expect(noInv.assist1?.damage).toBeCloseTo(2060.166, 2)

        const lowInv = snapshotOf(settings, { inv: { wLv: { 10107: 1 } } })
        expect(lowInv.assist1?.damage).toBeCloseTo(2075.54, 2)

        const highInv = snapshotOf(settings, { inv: { wLv: { 10107: 5 } } })
        expect(highInv.assist1?.damage).toBeCloseTo(2137.6, 2)
        expect(highInv.total).toBeCloseTo((highInv.main?.damage ?? 0) + 2137.6, 1)
        expect(highInv.assist1?.damage).not.toBeCloseTo(noInv.assist1?.damage as number, 2)
    })

    it("脏输入先归一化：角色名 / 武器名 / partial assist 可计算，未知 id 归属 failed / disabled", () => {
        const dirty = {
            ...createDefaultCharSettings(),
            baseName: "残光",
            charSkillLevel: [10, 10, 10],
            traceLevel: 0,
            team1: "芙罗拉",
            team1Weapon: "枯朽",
            assist1: { baseName: "风花飞旋", traceLevel: 0, traceOffRoots: undefined },
        } as unknown as CharSettings
        const normalized = normalizeCharSettings(dirty)
        const snapshot = computeCharTeamSnapshot({
            settings: dirty,
            charId: MAIN_ID,
            mainBuild: createCharBuildFromSettings(MAIN_ID, normalized),
        })
        expect(snapshot.sideStates.assist1).toMatchObject({ charId: ASSIST1_ID, state: "ok" })
        expect(snapshot.assist1?.damage).toBeCloseTo(1633.925, 2)
        expect(snapshot.settings.assist1.baseName).toBe("风花飞旋")

        // 未知数字 id + 显式 enabled: true → 构造抛错 → failed（构建告警不外泄到测试输出）
        const unknown = { ...dirty, team1: 999999, assist1: { baseName: "风花飞旋", enabled: true } } as unknown as CharSettings
        const unknownSnapshot = silenceWarn(() =>
            computeCharTeamSnapshot({
                settings: unknown,
                charId: MAIN_ID,
                mainBuild: createCharBuildFromSettings(MAIN_ID, normalizeCharSettings(unknown)),
            })
        )
        expect(unknownSnapshot.sideStates.assist1).toMatchObject({ charId: 999999, state: "failed" })
        expect(unknownSnapshot.total).toBeNull()

        // 未知 id + 缺 assist loadout：归一化按 teamN 有效性推断 enabled=false → disabled
        const unknownNoLoadout = { ...dirty, team1: 999999, assist1: undefined } as unknown as CharSettings
        const noLoadout = computeCharTeamSnapshot({
            settings: unknownNoLoadout,
            charId: MAIN_ID,
            mainBuild: createCharBuildFromSettings(MAIN_ID, normalizeCharSettings(unknownNoLoadout)),
        })
        expect(noLoadout.sideStates.assist1).toMatchObject({ charId: 999999, state: "disabled" })

        // 负数 team1 / 非正主控 id → empty
        const negative = { ...dirty, team1: -5 } as unknown as CharSettings
        expect(snapshotOf(negative).sideStates.assist1).toMatchObject({ charId: 0, state: "empty" })
        expect(snapshotOf(createBaseSettings(), { charId: -3 }).sideStates.main).toMatchObject({ charId: 0, state: "empty" })
    })

    it("invalid / failed 段仍算参与（标签返回该段原始 baseName）", () => {
        const invalidMain = createBaseSettings()
        invalidMain.targetFunction = "1 +"
        const invalidSnapshot = snapshotOf(invalidMain)
        expect(getSingleParticipatingSide(invalidSnapshot)).toBe("main")
        expect(getSingleParticipatingSkillName(invalidSnapshot)).toBe("残光")

        const failedAssist = withAssist(createBaseSettings(), "assist1", { weapon: "-" })
        failedAssist.mainTargetEnabled = false
        const failedSnapshot = snapshotOf(failedAssist)
        expect(failedSnapshot.sideStates.assist1.state).toBe("failed")
        expect(getSingleParticipatingSide(failedSnapshot)).toBe("assist1")
        expect(getSingleParticipatingSkillName(failedSnapshot)).toBe("风花飞旋")
    })
})

describe("目标面板写回 applyCharTargetPatch", () => {
    it("主控：enabled → mainTargetEnabled，其余三字段写顶层，忽略 charId / baseName", () => {
        const settings = createBaseSettings()
        applyCharTargetPatch(settings, "main", {
            charId: 9999,
            baseName: "被忽略",
            targetFunction: "攻击*2",
            customVariables: [["攻击力", "1"]],
            dotSettings: { skill: 2, melee: 0, ranged: 0, skillweapon: 0, forceOwnAdditionalDamage: true },
            enabled: false,
        })
        expect(settings.targetFunction).toBe("攻击*2")
        expect(settings.customVariables).toEqual([["攻击力", "1"]])
        expect(settings.dotSettings).toMatchObject({ skill: 2, forceOwnAdditionalDamage: true })
        expect(settings.mainTargetEnabled).toBe(false)
        expect(settings.baseName).toBe("残光")
        expect(settings.assist1.targetFunction).toBe("")
        expect(settings.assist1.enabled).toBe(true)
    })

    it("协战：四字段写 assistN，主控字段不动，忽略 charId / baseName", () => {
        const settings = withAssist(createBaseSettings(), "assist2")
        const before = { targetFunction: settings.targetFunction, enabled: settings.mainTargetEnabled, variables: settings.customVariables }
        applyCharTargetPatch(settings, "assist2", {
            charId: 1,
            baseName: "被忽略",
            targetFunction: "1",
            customVariables: [["x", "2"]],
            dotSettings: { skill: 0, melee: 1, ranged: 0, skillweapon: 0, forceOwnAdditionalDamage: false },
            enabled: false,
        })
        expect(settings.assist2.targetFunction).toBe("1")
        expect(settings.assist2.customVariables).toEqual([["x", "2"]])
        expect(settings.assist2.dotSettings.melee).toBe(1)
        expect(settings.assist2.enabled).toBe(false)
        expect(settings.assist2.baseName).toBe("宣叙调")
        expect(settings.assist1.targetFunction).toBe("")
        expect(settings.targetFunction).toBe(before.targetFunction)
        expect(settings.mainTargetEnabled).toBe(before.enabled)
        expect(settings.customVariables).toBe(before.variables)
        expect(settings.team2).toBe(ASSIST2_ID)
    })

    it("写入副本：后续改动补丁对象不影响已写回的设置", () => {
        const settings = createBaseSettings()
        const variables: [string, string][] = [["攻击力", "1"]]
        const dotSettings = { skill: 1, melee: 0, ranged: 0, skillweapon: 0, forceOwnAdditionalDamage: false }
        applyCharTargetPatch(settings, "main", { customVariables: variables, dotSettings })
        variables[0][1] = "999"
        dotSettings.skill = 9
        expect(settings.customVariables).toEqual([["攻击力", "1"]])
        expect(settings.dotSettings.skill).toBe(1)
    })
})
