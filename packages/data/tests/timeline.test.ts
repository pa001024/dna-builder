import { describe, expect, it } from "vitest"
import { CharBuild, type CharBuildOptions, CharBuildTimeline } from "../CharBuild"
import { createBuffFromSettings, hydrateCharBuildTimeline } from "../CharBuildHelper"
import type { Weapon } from "../data-types"
import { type LeveledBuff, LeveledChar, LeveledWeapon } from "../leveled"

function mkWeapon(name: string): LeveledWeapon {
    const data: Weapon = {
        id: 99999,
        名称: name,
        类型: ["近战", "长柄"],
        伤害类型: "切割",
        攻击: 100,
        暴击: 0.05,
        暴伤: 1.5,
        触发: 1,
        描述: "",
        加成: {},
        熔炼: "",
        技能: [],
    }
    return new LeveledWeapon(data)
}

function createTimelineBuild(
    charName: string,
    baseName: string,
    items: Parameters<typeof mkTimeline>[0],
    overrides: Partial<CharBuildOptions> = {}
) {
    const char = new LeveledChar(charName)
    const options: CharBuildOptions = {
        char,
        skillLevel: 10,
        hpPercent: 1,
        resonanceGain: 3,
        charMods: [],
        buffs: [],
        melee: mkWeapon("测试近战"),
        ranged: mkWeapon("测试远程"),
        baseName,
        enemyId: 130,
        enemyLevel: 80,
        enemyResistance: 0,
        targetFunction: "伤害",
        timeline: mkTimeline(items),
        ...overrides,
    }
    return new CharBuild(options)
}

function mkTimeline(items: { track: number; name: string; time: number; duration: number; lv?: number; buff?: LeveledBuff }[]) {
    return new CharBuildTimeline("测试轴", items)
}

const SUMMON_CHAR = "丽蓓卡"
const SUMMON_SKILL = "缠绵之触"

describe("时间线结算", () => {
    describe("多事件累计", () => {
        it("多个召唤物事件按各自次数累加，而不是把已有累计值整体再乘次数", () => {
            const single = createTimelineBuild(SUMMON_CHAR, SUMMON_SKILL, [{ track: 0, name: SUMMON_SKILL, time: 0, duration: 8 }])
            const perEvent = createTimelineBuild(SUMMON_CHAR, SUMMON_SKILL, [
                { track: 0, name: SUMMON_SKILL, time: 0, duration: 4 },
            ]).calculate()
            const double = createTimelineBuild(SUMMON_CHAR, SUMMON_SKILL, [
                { track: 0, name: SUMMON_SKILL, time: 0, duration: 6 },
                { track: 1, name: SUMMON_SKILL, time: 6, duration: 6 },
            ])

            // 召唤物持续时间 14s、延迟 2s、间隔 1.8s：8s 事件 3 次，6s 事件各 2 次
            expect(single.calculate()).toBeCloseTo(perEvent * 3, 4)
            expect(double.calculate()).toBeCloseTo(perEvent * 4, 4)
        })

        it("无召唤物的普通技能多事件线性累加", () => {
            const fake = createTimelineBuild("黎瑟", "快速出击", [{ track: 0, name: "快速出击", time: 0, duration: 1 }]).calculate()
            const double = createTimelineBuild("黎瑟", "快速出击", [
                { track: 0, name: "快速出击", time: 0, duration: 1 },
                { track: 1, name: "快速出击", time: 1, duration: 1 },
            ]).calculate()
            expect(fake).toBeGreaterThan(0)
            expect(double).toBeCloseTo(fake * 2, 6)
        })
    })

    describe("时间线 BUFF 附加", () => {
        it("按事件生效区间把时间线 BUFF 加入构筑", () => {
            const skillName = "快速出击"
            const raw = mkTimeline([
                { track: 0, name: skillName, time: 0, duration: 1, lv: 1, buff: createBuffFromSettings("连击蓄力攻击加成", 5, []) },
            ])
            const withBuff = createTimelineBuild("黎瑟", skillName, [], { timeline: hydrateCharBuildTimeline(raw) })
            const without = createTimelineBuild("黎瑟", skillName, [{ track: 0, name: skillName, time: 0, duration: 1 }])
            expect(withBuff.calculate()).not.toBeCloseTo(without.calculate(), 6)
        })

        it("新 BUFF 会被加入列表", () => {
            const build = createTimelineBuild("黎瑟", "快速出击", [])
            build.applyBuffs([createBuffFromSettings("连击蓄力攻击加成", 1, [])])
            expect(build.buffs.some(b => b.名称 === "连击蓄力攻击加成")).toBe(true)
        })

        it("同名 BUFF 叠加等级，不重复入列", () => {
            const build = createTimelineBuild("黎瑟", "快速出击", [], {
                buffs: [createBuffFromSettings("连击蓄力攻击加成", 1, [])],
            })
            const before = build.buffs.length
            build.applyBuffs([createBuffFromSettings("连击蓄力攻击加成", 1, [])])
            expect(build.buffs.length).toBe(before)
            expect(build.buffs.find(b => b.名称 === "连击蓄力攻击加成")!.等级).toBe(2)
        })

        it("复合 BUFF 同时进入普通槽位与 code 槽位", () => {
            const build = createTimelineBuild("黎瑟", "快速出击", [])
            const buff = createBuffFromSettings("伊薇4溯", 1, [])
            expect(buff.code).toBeTruthy()
            build.applyBuffs([buff])
            expect(build.buffs.some(b => b.名称 === "伊薇4溯")).toBe(true)
            expect(build.dynamicBuffs.some(b => b.名称 === "伊薇4溯")).toBe(true)
        })
    })

    describe("时间线 DPS", () => {
        it("timelineDPS 开启时按总时长折算", () => {
            const items = [{ track: 0, name: "快速出击", time: 0, duration: 2 }]
            const total = createTimelineBuild("黎瑟", "快速出击", items).calculate()
            const dps = createTimelineBuild("黎瑟", "快速出击", items, { timelineDPS: true }).calculate()
            expect(total).toBeGreaterThan(0)
            expect(dps).toBeCloseTo(total / 2, 6)
        })

        it("总时长为 0 时返回 0 而不是 Infinity/NaN", () => {
            const value = createTimelineBuild("黎瑟", "快速出击", [], { timelineDPS: true }).calculate()
            expect(Number.isFinite(value)).toBe(true)
            expect(value).toBe(0)
        })
    })
})
