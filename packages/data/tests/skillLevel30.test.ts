import { describe, expect, it } from "vitest"
import { CharBuild } from "../CharBuild"
import { createBuffFromSettings, createCharBuildFromSettings, resolveSideEffectiveSkillLevels } from "../CharBuildHelper"
import {
    CHAR_SKILL_LEVEL_MAX,
    CHAR_SKILL_LEVEL_MIN,
    type CharSkillLevels,
    createDefaultAssistSideSettings,
    createDefaultCharSettings,
    normalizeCharSkillLevels,
} from "../charSettings"
import { charMap } from "../d"
import type { DnaSeasonAffix } from "../d/dnaseasonequip.data"
import { LeveledBuff } from "../leveled/LeveledBuff"
import { LeveledSkill } from "../leveled/LeveledSkill"
import {
    getSkillLevelName,
    normalizeSkillLevelBonus,
    resolveEffectiveSkillLevels,
    SKILL_LEVEL_ATTR_KEYS,
    SKILL_TYPE_LEVEL_NAMES,
} from "../skillLevels"
import { resolveTraceOffRoots } from "../traceEffects"
import {
    addTranscendSkillLevels,
    collectTranscendEffects,
    resolveGearEffects,
    resolveTranscendSkillLevelAttrs,
    type TranscendEffects,
} from "../transcend"
import { createDefaultTranscendBuildSettings, createTranscendBuild } from "../transcendBuild"
import type { TranscendGearEntry } from "../transcendGear"

/** 苏乙被动 [蓄势待发]：上游 Char.json 提供 1–30 级真实曲线（值数组第 13–30 项） */
const char = charMap.get(1504)!
const skillData = char.技能.find(skill => skill.名称 === "蓄势待发")!

/** 按等级构造技能并取字段数值 */
function fieldValue(level: number, name = "伤害"): number {
    const skill = new LeveledSkill(skillData, level)
    return skill.字段.find(field => field.名称 === name)!.值
}

const gear = (patch: Partial<TranscendGearEntry> & Pick<TranscendGearEntry, "slotId" | "affixId">): TranscendGearEntry => ({
    rollLevel: 1,
    masterworkLevel: 0,
    ancient: false,
    finalMasterwork: false,
    ...patch,
})

/** 1512「被动技能等级」满值（按部位映射：协战典籍 = 装备位 11/15）：roll 1 + 太古 +2 + 最终精锻 +1 = 8 */
const maxSkillLevelAffix = (slotId: number) => gear({ slotId, affixId: 1512, rollLevel: 1, ancient: true, finalMasterwork: true })

/** 主控家族技能等级满值：1038=E（手套 3）/ 1039=Q（耳环 5）/ 1040=P（项链 6） */
const maxMainSkillLevelAffix = (slotId: number, affixId = 1040) =>
    gear({ slotId, affixId, rollLevel: 1, ancient: true, finalMasterwork: true })

/** 词条解析结果的三键技能等级加成 */
function skillAttrsOf(result: ReturnType<typeof resolveGearEffects>): CharSkillLevels {
    return SKILL_LEVEL_ATTR_KEYS.map(key => result.attrs[key] ?? 0) as unknown as CharSkillLevels
}

/** 已收集升华 / 溯源效果 BUFF 的三键技能等级加成合计 */
function effectsSkillAttrs(effects: TranscendEffects): CharSkillLevels {
    const attrs: CharSkillLevels = [0, 0, 0]
    for (const buff of effects.buffs) {
        for (let index = 0; index < 3; index++) attrs[index] += buff.values[SKILL_LEVEL_ATTR_KEYS[index]] ?? 0
    }
    return attrs
}

describe("技能等级规范名（U123）", () => {
    it("Skill1 / Skill2 / Passive → 官方 TextMap 键，未知类型回退空串", () => {
        expect(SKILL_TYPE_LEVEL_NAMES).toEqual({
            Skill1: "战技技能等级",
            Skill2: "终结技技能等级",
            Passive: "被动技能等级",
        })
        expect(getSkillLevelName("Skill1")).toBe("战技技能等级")
        expect(getSkillLevelName("Skill2")).toBe("终结技技能等级")
        expect(getSkillLevelName("Passive")).toBe("被动技能等级")
        expect(getSkillLevelName("Unknown")).toBe("")
        expect(getSkillLevelName("")).toBe("")
    })
})

describe("技能等级上限 30", () => {
    it("归一化接受 13–30，越界钳制到 30", () => {
        expect(CHAR_SKILL_LEVEL_MIN).toBe(1)
        expect(CHAR_SKILL_LEVEL_MAX).toBe(30)
        expect(normalizeCharSkillLevels(18)).toEqual([18, 18, 18])
        expect(normalizeCharSkillLevels([10, 31, 0])).toEqual([10, 30, 1])
        expect(normalizeCharSkillLevels([13, 14, 30])).toEqual([13, 14, 30])
    })

    it("LeveledSkill 按真实曲线取 13–30 级值，11/12 级不变", () => {
        // 11/12 级与旧 12 档输出一致
        expect(fieldValue(11)).toBe(67.41)
        expect(fieldValue(12)).toBe(72.06)
        // 13–30 级为上游真实值（非外推）
        expect(fieldValue(13)).toBe(76.71)
        expect(fieldValue(18)).toBe(99.96)
        expect(fieldValue(21)).toBe(113.91)
        expect(fieldValue(30)).toBe(155.76)
        expect(fieldValue(21, "每层[蓄势]增加伤害倍率")).toBe(4.61)
        expect(fieldValue(30, "每层[蓄势]增加伤害倍率")).toBe(6.32)
    })

    it("超过 30 级钳制到 30", () => {
        const skill = new LeveledSkill(skillData, 31)
        expect(skill.等级).toBe(30)
        expect(fieldValue(31)).toBe(fieldValue(30))
        expect(fieldValue(99)).toBe(fieldValue(30))
    })

    it("派生字段「满层[蓄势]伤害」随 1–30 级曲线扩展且 1–12 不变", () => {
        expect(fieldValue(1, "满层[蓄势]伤害")).toBe(182.91)
        expect(fieldValue(12, "满层[蓄势]伤害")).toBe(652.06)
        expect(fieldValue(13, "满层[蓄势]伤害")).toBe(694.71)
        // 伤害 + 每层倍率 × 200 层
        expect(fieldValue(30, "满层[蓄势]伤害")).toBeCloseTo(155.76 + 6.32 * 200, 6)
    })
})

describe("技能等级词条叠加", () => {
    it("单件 1512 满词条 +8：产出 P 三键属性与合成 BUFF，基础 10 级 → 18 级", () => {
        const result = resolveGearEffects([maxSkillLevelAffix(11)], "assist1")
        expect(skillAttrsOf(result)).toEqual([0, 0, 8])
        expect(result.buffs.map(item => item.buff.名称)).toEqual(["升华装备·典籍·技能等级"])
        expect(addTranscendSkillLevels([10, 10, 10], skillAttrsOf(result))).toEqual([10, 10, 18])
        expect(fieldValue(18)).toBe(99.96)
    })

    it("1512 只进典籍槽（槽型 10）：其它协战装备位的 1512 被丢弃", () => {
        const result = resolveGearEffects(
            [maxSkillLevelAffix(9), maxSkillLevelAffix(10), maxSkillLevelAffix(11), maxSkillLevelAffix(12)],
            "assist1"
        )
        expect(skillAttrsOf(result)).toEqual([0, 0, 8])
        expect(result.warnings.join()).toContain("不能装备在装备位 9")
    })

    it("同一词条 skillTypes + skillIds 命中同槽只计一次；每条词条先 round 再求和", () => {
        const affix: DnaSeasonAffix = {
            id: 990130,
            plan: 3,
            minValue: 7.6,
            maxValue: 7.6,
            totalValueLevel: 1,
            // Skill2 与 310202 同属希尔妲 Q 槽：只计一次，7.6 → round 8
            addSkillLevel: { skillTypes: ["Skill2"], skillIds: [310202] },
        }
        const single = resolveGearEffects([gear({ slotId: 3, affixId: 990130 })], "main", {
            tables: { affixes: [affix] },
            charId: 3102,
        })
        expect(skillAttrsOf(single)).toEqual([0, 8, 0])
        // 两件同词条：逐件 round 后相加（8 + 8），不是 round(15.2)
        const twin = resolveGearEffects([gear({ slotId: 3, affixId: 990130 }), gear({ slotId: 5, affixId: 990130 })], "main", {
            tables: { affixes: [affix] },
            charId: 3102,
        })
        expect(skillAttrsOf(twin)).toEqual([0, 16, 0])
    })

    it("多来源增量叠加超过 30 时钳制到 30", () => {
        expect(addTranscendSkillLevels([10, 10, 10], [0, 0, 24])).toEqual([10, 10, 30])
        expect(fieldValue(30)).toBe(155.76)
    })

    it("升华构筑使用叠加后的 30 级真实值并可计算", () => {
        const settings = createDefaultTranscendBuildSettings(1504)
        settings.assist1 = { ...settings.main, charId: 1504, charSkillLevel: [22, 22, 22], baseName: "蓄势待发", enabled: true }
        settings.transcend.enabled = true
        settings.transcend.assist1Gear = [maxSkillLevelAffix(11)]

        const side = createTranscendBuild(settings, "assist1")!
        expect(side).not.toBeNull()
        expect(side.build.getSkillLevel(2)).toBe(30)
        expect(side.build.skills[2].等级).toBe(30)
        expect(side.build.selectedSkill!.字段.find(field => field.名称 === "伤害")!.值).toBe(155.76)
        expect(Number.isFinite(side.build.calculate())).toBe(true)
    })
})

describe("E/Q/P 技能等级加成属性（标准 attr）", () => {
    /**
     * 苏乙（1504）单构筑配置：E/Q/P 取指定等级。
     * @param levels 技能等级三元组
     * @returns 已填入技能等级的默认配置
     */
    function createSettings(levels: [number, number, number]) {
        const settings = createDefaultCharSettings()
        settings.baseName = char.技能[0].名称!
        settings.charSkillLevel = levels
        settings.meleeWeapon = 10302
        settings.targetFunction = "伤害"
        // 关闭溯源：本组用例只验证技能等级词条口径（U114 起非菲娜 3/5 根源也会提供等级增量）
        settings.traceOffRoots = resolveTraceOffRoots(undefined, 0, char.id)
        return settings
    }

    it("无升华来源时三键加成 = 0，最终等级仍按基础三元组装配", () => {
        const build = createCharBuildFromSettings(1504, createSettings([12, 9, 7]))!
        expect(build.baseSkillLevel).toEqual([12, 9, 7])
        expect(build.skillLevel).toEqual([12, 9, 7])
        const attrs = build.calculateAttributes()
        expect(attrs.E技能等级).toBe(0)
        expect(attrs.Q技能等级).toBe(0)
        expect(attrs.P技能等级).toBe(0)
        expect(build.getSkillLevel(0)).toBe(12)
        expect(build.getSkillLevel(1)).toBe(9)
        expect(build.getSkillLevel(2)).toBe(7)
    })

    it("升华被动等级词条（主控家族 1040）：属性 P = +8，最终等级 = 基础 + 8", () => {
        const settings = createSettings([10, 10, 10])
        settings.transcend = { ...settings.transcend, enabled: true, mainGear: [maxMainSkillLevelAffix(6)] }
        const build = createCharBuildFromSettings(1504, settings)!
        // 词条产出三键属性与合成 BUFF（属性面板 / 引擎同源）
        expect(build.buffs.some(buff => buff.名称 === "升华装备·项链·技能等级")).toBe(true)
        expect(build.skillLevel).toEqual([10, 10, 18])
        const attrs = build.calculateAttributes()
        expect(attrs.E技能等级).toBe(0)
        expect(attrs.Q技能等级).toBe(0)
        expect(attrs.P技能等级).toBe(8)
        expect(build.getSkillLevel(2)).toBe(18)
    })

    it("最终等级钳 30 时加成仍保留原值（+8）", () => {
        const settings = createSettings([22, 22, 22])
        settings.transcend = {
            ...settings.transcend,
            enabled: true,
            mainGear: [maxMainSkillLevelAffix(6)],
        }
        const build = createCharBuildFromSettings(1504, settings)!
        expect(build.skillLevel).toEqual([22, 22, 30])
        expect(build.calculateAttributes().P技能等级).toBe(8)
    })

    it("BUFF 提供三键属性：进入属性池并驱动技能等级重建", () => {
        const build = createCharBuildFromSettings(1504, createSettings([12, 9, 7]))!
        build.buffs.push(createBuffFromSettings("自定义BUFF", 1, [["Q技能等级", 5]])!)
        expect(build.calculateAttributes().Q技能等级).toBe(5)
        expect(build.getSkillLevel(1)).toBe(14)
        expect(build.skills[1].等级).toBe(14)
    })

    it("字符串表达式三键只进属性池，不驱动技能等级", () => {
        const build = createCharBuildFromSettings(1504, createSettings([10, 10, 10]))!
        build.buffs.push(new LeveledBuff({ 名称: "表达式等级", attr: { Q技能等级: "5" } }, 1))
        expect(build.calculateAttributes().Q技能等级).toBe(5)
        // 表达式求值结果回写 values 后仍不参与等级聚合（只支持静态数值）
        expect(build.calculateAttributes().Q技能等级).toBe(5)
        expect(build.getSkillLevel(1)).toBe(10)
        expect(build.skills[1].等级).toBe(10)
    })

    it("协战侧独立解析：装备加成只作用于该协战位", () => {
        const settings = createSettings([10, 10, 10])
        settings.transcend = {
            ...settings.transcend,
            enabled: true,
            assist1Gear: [gear({ slotId: 11, affixId: 1512, ancient: true, finalMasterwork: true })],
        }
        const build = createCharBuildFromSettings(1504, settings)!
        // 主控不吃协战装备
        expect(build.baseSkillLevel).toEqual([10, 10, 10])
        expect(build.skillLevel).toEqual([10, 10, 10])
        const assistBonus = resolveTranscendSkillLevelAttrs(settings.transcend, "assist1", { charId: 1504, charElement: char.属性 })
        expect(assistBonus).toEqual([0, 0, 8])
        expect(resolveEffectiveSkillLevels([10, 10, 10], assistBonus)).toEqual([10, 10, 18])
    })

    it("解析层：多来源先加总再一次 round + 钳 1-30", () => {
        expect(resolveEffectiveSkillLevels([10, 10, 10], [2, 0, 0], [0, 3, 0])).toEqual([12, 13, 10])
        expect(resolveEffectiveSkillLevels([28, 29, 1], [8, 8, -8])).toEqual([30, 30, 1])
        expect(resolveEffectiveSkillLevels([10, 10, 10], undefined, [0.4, 0.6, -0.6])).toEqual([10, 11, 9])
        expect(normalizeSkillLevelBonus(undefined)).toEqual([0, 0, 0])
        expect(normalizeSkillLevelBonus([1, Number.NaN, 2])).toEqual([1, 0, 2])
    })

    it("先加总后一次 round：逐源 round 会得到 12", () => {
        // 0.6 + 0.6 = 1.2 → 一次 round 为 11；逐源 round(0.6)+round(0.6) = 12
        expect(resolveEffectiveSkillLevels([10, 10, 10], [0.6, 0, 0], [0.6, 0, 0])).toEqual([11, 10, 10])
        // 三条来源正负抵消后仍按总和取整
        expect(resolveEffectiveSkillLevels([10, 10, 10], [0.5, 0.6, -0.5], [-0.5, -0.6, -0.5])).toEqual([10, 10, 9])
        // 负加成越过下限时钳 1
        expect(resolveEffectiveSkillLevels([2, 1, 3], [0.4, -0.6, -3])).toEqual([2, 1, 1])
    })

    it("二路解析同值：resolveTranscendSkillLevelAttrs === 效果 BUFF 三键合计", () => {
        // 希尔妲（3102）：普通属性词条 + 主控家族 E/P 技能等级 + 专属技能替换词条（310201 → Q+10）混合同侧
        const char3102 = charMap.get(3102)!
        const settings = createDefaultCharSettings()
        settings.baseName = char3102.技能[0].名称!
        settings.charSkillLevel = [10, 10, 10]
        settings.meleeWeapon = 10302
        settings.transcend = {
            ...settings.transcend,
            enabled: true,
            mainGear: [
                gear({ slotId: 1, affixId: 310201 }),
                gear({ slotId: 3, affixId: 1038, ancient: true, finalMasterwork: true }),
                gear({ slotId: 3, affixId: 101 }),
                gear({ slotId: 6, affixId: 1040, ancient: true, finalMasterwork: true }),
            ],
            assist1Gear: [maxSkillLevelAffix(11)],
        }
        const options = { charId: 3102, charElement: char3102.属性 }
        expect(effectsSkillAttrs(collectTranscendEffects(settings.transcend, "main", options))).toEqual([8, 10, 8])
        expect(Object.keys(collectTranscendEffects(settings.transcend, "main", options).skillReplacements)).toEqual(["310201"])
        for (const side of ["main", "assist1"] as const) {
            expect(resolveTranscendSkillLevelAttrs(settings.transcend, side, options)).toEqual(
                effectsSkillAttrs(collectTranscendEffects(settings.transcend, side, options))
            )
        }
    })

    it("BUFF 负加成驱动技能等级：最终等级 = 基础 - 3", () => {
        const build = createCharBuildFromSettings(1504, createSettings([10, 10, 10]))!
        build.buffs.push(createBuffFromSettings("自定义BUFF", 1, [["Q技能等级", -3]])!)
        expect(build.calculateAttributes().Q技能等级).toBe(-3)
        expect(build.getSkillLevel(1)).toBe(7)
        expect(build.skills[1].等级).toBe(7)
    })

    it("负加成端到端：最终等级钳 1，技能按钳后等级装配", () => {
        const build = createCharBuildFromSettings(1504, createSettings([10, 10, 10]))!
        build.buffs.push(createBuffFromSettings("自定义BUFF", 1, [["Q技能等级", -20]])!)
        const attrs = build.calculateAttributes()
        expect(build.getSkillLevel(1)).toBe(1)
        expect(build.skills[1].等级).toBe(1)
        expect(attrs.Q技能等级).toBe(-20)
        expect(attrs.E技能等级).toBe(0)
    })

    it("三键 BUFF 增删后等级与面板同步重建（属性表缓存失效）", () => {
        const build = createCharBuildFromSettings(1504, createSettings([10, 10, 10]))!
        expect(build.calculateAttributes().P技能等级).toBe(0)
        build.buffs.push(createBuffFromSettings("自定义BUFF", 1, [["P技能等级", 8]])!)
        expect(build.calculateAttributes().P技能等级).toBe(8)
        expect(build.getSkillLevel(2)).toBe(18)
        build.buffs.pop()
        expect(build.calculateAttributes().P技能等级).toBe(0)
        expect(build.getSkillLevel(2)).toBe(10)
    })
})

describe("属性化边界与预解析（U126a-fix）", () => {
    /** 苏乙（1504）基础配置：关闭溯源，避免默认满溯的等级增量干扰断言 */
    function createBaseSettings(skillLevels: [number, number, number] = [10, 10, 10]) {
        const settings = createDefaultCharSettings()
        settings.baseName = char.技能[0].名称!
        settings.charSkillLevel = skillLevels
        settings.meleeWeapon = 10302
        settings.rangedWeapon = 20601
        settings.auraMod = 0
        settings.targetFunction = "伤害"
        settings.traceOffRoots = resolveTraceOffRoots(undefined, 0, char.id)
        return settings
    }

    it("字段条件 BUFF（技能 / tag 限定）提供三键时不驱动全局等级", () => {
        const build = createCharBuildFromSettings(1504, createBaseSettings())!
        build.buffs.push(new LeveledBuff({ 名称: "条件技能等级", 技能: "蓄势待发", attr: { Q技能等级: 9 } }, 1))
        expect(build.calculateAttributes().Q技能等级).toBe(0)
        expect(build.getSkillLevel(1)).toBe(10)
        build.buffs.push(new LeveledBuff({ 名称: "条件tag等级", tag: ["战技"], attr: { Q技能等级: 9 } }, 1))
        expect(build.calculateAttributes().Q技能等级).toBe(0)
        expect(build.getSkillLevel(1)).toBe(10)
    })

    it("clone / 对比重建在已加成等级下不双计（只传基础等级 + 含三键 BUFF）", () => {
        const settings = createBaseSettings()
        settings.transcend = { ...settings.transcend, enabled: true, mainGear: [maxMainSkillLevelAffix(6)] }
        const build = createCharBuildFromSettings(1504, settings)!
        expect(build.baseSkillLevel).toEqual([10, 10, 10])
        expect(build.skillLevel).toEqual([10, 10, 18])

        const clone = build.clone()
        expect(clone.baseSkillLevel).toEqual([10, 10, 10])
        expect(clone.skillLevel).toEqual([10, 10, 18])
        expect(clone.calculateAttributes().P技能等级).toBe(8)

        // CharBuildCompare 的「基础构筑 + 附加 MOD / BUFF」口径：复用基础等级与已有 BUFF
        const compared = new CharBuild({
            char: build.char,
            melee: build.meleeWeapon,
            ranged: build.rangedWeapon,
            charMods: [...build.charMods],
            meleeMods: [...build.meleeMods],
            rangedMods: [...build.rangedMods],
            skillMods: [...build.skillMods],
            skillLevel: build.baseSkillLevel,
            buffs: [...build.buffs],
            baseName: build.baseName,
            hpPercent: build.hpPercent,
            resonanceGain: build.resonanceGain,
            enemyId: build.enemyId,
            enemyLevel: build.enemyLevel,
            enemyResistance: build.enemyResistance,
            targetFunction: build.targetFunction,
            teamWeaponCategories: [...build.teamWeaponCategories],
        })
        expect(compared.skillLevel).toEqual([10, 10, 18])
        expect(compared.calculateAttributes().P技能等级).toBe(8)
    })

    it("同律武器技能等级跟随加成后的角色等级", () => {
        // 芙罗拉（1102）同律武器按 E（技能索引 0）同步
        const char1102 = charMap.get(1102)!
        const settings = createDefaultCharSettings()
        settings.baseName = char1102.技能[0].名称!
        settings.charSkillLevel = [10, 10, 10]
        settings.meleeWeapon = 10302
        settings.rangedWeapon = 20601
        settings.auraMod = 0
        settings.traceOffRoots = resolveTraceOffRoots(undefined, 0, 1102)
        const build = createCharBuildFromSettings(1102, settings)!
        expect(build.skillWeapon?.技能等级).toBe(10)
        build.buffs.push(createBuffFromSettings("自定义BUFF", 1, [["E技能等级", 1]])!)
        expect(build.getSkillLevel(0)).toBe(11)
        expect(build.skillWeapon!.技能等级).toBe(11)
    })

    it("自定义 BUFF 静态三键计入预解析（主控 / 协战各读自己的列表）", () => {
        const settings = createBaseSettings()
        settings.buffs = [["自定义BUFF", 1]]
        settings.customBuff = [["Q技能等级", 5]]
        expect(resolveSideEffectiveSkillLevels(settings, "main", char.id)).toEqual([10, 15, 10])
        // 引擎同值：自定义 BUFF 驱动最终等级
        expect(createCharBuildFromSettings(1504, settings)!.getSkillLevel(1)).toBe(15)

        settings.team1 = 1504
        settings.assist1 = {
            ...createDefaultAssistSideSettings(),
            charSkillLevel: [10, 10, 10],
            buffs: [["自定义BUFF", 1]],
            customBuff: [["E技能等级", 2]],
            traceLevel: 0,
        }
        expect(resolveSideEffectiveSkillLevels(settings, "assist1", 1504)).toEqual([12, 10, 10])
    })
})
