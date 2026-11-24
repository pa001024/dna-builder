import { describe, expect, it } from "vitest"
import { CharBuild } from "../CharBuild"
import { type CharSettings, createDefaultCharSettings, normalizeCharSettings } from "../charSettings"
import { affixes, buffMap, charMap, monsterMap, rebuildStaticIndexes, stages, talents, weaponMap } from "../d"
import type { BuffAttrValue } from "../d/buff.data"
import { LeveledBuff, LeveledChar, LeveledWeapon } from "../leveled"
import { LeveledCharHelper, LeveledWeaponHelper } from "../leveled/LeveledHelpers"
import { isAffixCompatibleWithSlot, resolveGearEffects } from "../transcend"
import { TRANSCEND_BUFFS, UNIQUE_AFFIX_MAP } from "../transcendBuffs"
import {
    buildTranscendTeam,
    compactTranscendBuildSettings,
    createDefaultTranscendBuildSettings,
    createTranscendBuild,
    createTranscendBuildShare,
    getDefaultTranscendCharId,
    getTranscendExtraMasteryOptions,
    normalizeTranscendBuildSettings,
    parseTranscendBuildShare,
    serializeTranscendBuildSettings,
    TRANSCEND_BUILD_SHARE_KIND,
    type TranscendBuildSettings,
} from "../transcendBuild"
import {
    createMaxedReachableTalentLevels,
    createMaxedTranscendTalentLevels,
    getTalentStageWarnings,
    TRANSCEND_MAX_AFFIXES_PER_SLOT,
    type TranscendEquippedGear,
    type TranscendGearEntry,
} from "../transcendSettings"

const gear = (patch: Partial<TranscendGearEntry> & Pick<TranscendGearEntry, "slotId" | "affixId">): TranscendGearEntry => ({
    rollLevel: 1,
    masterworkLevel: 0,
    ancient: false,
    finalMasterwork: false,
    ...patch,
})

describe("U43 手写词条数值零影响", () => {
    const attrOf = (name: string) => TRANSCEND_BUFFS.find(buff => buff.名称 === name)!.attr ?? {}

    interface DpsOptions {
        charName?: string
        meleeWeapon?: number
        rangedWeapon?: number
        baseName: string
        targetFunction: string
    }

    /** 构造一个只带目标 attr 的构筑并取伤害（远程目标用 20201 的真实「射击 / 子弹伤害」） */
    const dps = (attr: Record<string, BuffAttrValue>, options: DpsOptions) => {
        const build = new CharBuild({
            char: new LeveledChar(options.charName ?? "黎瑟"),
            skillLevel: 10,
            hpPercent: 0.5,
            resonanceGain: 0,
            melee: new LeveledWeapon(options.meleeWeapon ?? 10302),
            ranged: new LeveledWeapon(options.rangedWeapon ?? 20201),
            baseName: options.baseName,
            enemyId: 130,
            enemyLevel: 80,
            enemyResistance: 0.5,
            targetFunction: options.targetFunction,
        })
        build.buffs = [new LeveledBuff({ 名称: "u43-回归", 描述: "u43", attr })]
        return build.calculate()
    }

    /** 普通近战面板（10302 自带下落攻击字段） */
    const meleePlunge: DpsOptions = { baseName: "下落攻击", targetFunction: "下落攻击伤害" }
    /** 继承类型=普通的同律武器（字段 tag 含「下落攻击」，攻击走普通面板语义） */
    const inheritPlunge: DpsOptions = { charName: "煜明", meleeWeapon: 10303, baseName: "疑星落", targetFunction: "伤害" }
    /** 真正的同律近战面板（萨麦尔下落攻击字段，tag 含「同律」） */
    const sameLawPlunge: DpsOptions = {
        charName: "莉兹贝尔",
        baseName: "萨麦尔",
        targetFunction: "[萨麦尔]下落攻击伤害",
    }
    /** 真正的远程目标（20201 射击 → 子弹伤害） */
    const rangedShot: DpsOptions = { charName: "赛琪", baseName: "射击", targetFunction: "子弹伤害" }

    it("2001：下落攻击按 ×10 独立乘区计入（官方 FallAttackRateAdd=9）", () => {
        const current = attrOf("升华·螺旋跃击")

        expect(current).toEqual({ 下落独立增伤: 9 })
        // 独立乘区：(1 + 9) = 10 倍，不受增伤池基数影响
        expect(dps(current, meleePlunge) / dps({}, meleePlunge)).toBeCloseTo(10, 6)
        // 加算键会被既有增伤池稀释（{增伤: 1} 下 +900% 只有 5.5 倍），独立键不受池基数影响
        expect(dps({ 增伤: 1, 近战下落增伤: 9 }, meleePlunge) / dps({ 增伤: 1 }, meleePlunge)).toBeCloseTo(5.5, 6)
        expect(dps({ 增伤: 1, 下落独立增伤: 9 }, meleePlunge) / dps({ 增伤: 1 }, meleePlunge)).toBeCloseTo(10, 6)
    })

    it("2001：同律近战/继承型同律面板不翻倍（裸键只计一次）", () => {
        const current = attrOf("升华·螺旋跃击")

        for (const [label, panel] of [
            ["继承型同律（煜明 · 疑星落）", inheritPlunge],
            ["同律近战（贝蕾妮卡 · 伊弥尔）", sameLawPlunge],
        ] as const) {
            const baseline = dps({}, panel)
            // 只计一次：(1 + 9) = 10 倍；双计会变成 19 倍
            expect(dps(current, panel) / baseline, label).toBeCloseTo(10, 6)
        }
    })

    it("2001：真正的远程目标（射击 / 子弹伤害）上不生效", () => {
        const current = attrOf("升华·螺旋跃击")
        const baseline = dps({}, rangedShot)

        expect(baseline).toBeGreaterThan(0)
        expect(dps(current, rangedShot) / baseline).toBeCloseTo(1, 9)
    })

    it("攻击细分键按精确度短路：每个来源只在最精确的一档计一次", () => {
        // 表驱动：普通 / 继承型同律 / 同律 / 远程 × 裸键 / 近战 / 普通近战 / 同律近战（值 1 → 生效为 2 倍）
        const panels = [
            ["普通近战", meleePlunge],
            ["继承型同律", inheritPlunge],
            ["同律近战", sameLawPlunge],
            ["远程", rangedShot],
        ] as const
        const expected: Record<string, Record<string, number>> = {
            普通近战: { 下落增伤: 2, 近战下落增伤: 2, 普通近战下落增伤: 2, 同律近战下落增伤: 1 },
            继承型同律: { 下落增伤: 2, 近战下落增伤: 2, 普通近战下落增伤: 1, 同律近战下落增伤: 2 },
            同律近战: { 下落增伤: 2, 近战下落增伤: 2, 普通近战下落增伤: 1, 同律近战下落增伤: 2 },
            远程: { 下落增伤: 1, 近战下落增伤: 1, 普通近战下落增伤: 1, 同律近战下落增伤: 1 },
        }

        for (const [label, panel] of panels) {
            const baseline = dps({}, panel)
            for (const [key, ratio] of Object.entries(expected[label])) {
                expect(dps({ [key]: 1 }, panel) / baseline, `${label}:${key}`).toBeCloseTo(ratio, 6)
            }
        }
    })

    it("攻击细分键按精确度短路：同一来源命中多层时取最精确一档，不累加", () => {
        const ratio = (attr: Record<string, number>, panel: DpsOptions) => dps(attr, panel) / dps({}, panel)

        // 同律面板：同律近战 > 近战 > 裸键
        expect(ratio({ 同律近战下落增伤: 1, 近战下落增伤: 2, 下落增伤: 3 }, sameLawPlunge)).toBeCloseTo(2, 6)
        expect(ratio({ 近战下落增伤: 2, 下落增伤: 3 }, sameLawPlunge)).toBeCloseTo(3, 6)
        expect(ratio({ 同律近战下落增伤: 1, 下落增伤: 3 }, sameLawPlunge)).toBeCloseTo(2, 6)
        // 普通面板：近战 > 裸键
        expect(ratio({ 近战下落增伤: 2, 下落增伤: 3 }, meleePlunge)).toBeCloseTo(3, 6)
        // 注：`普通近战*` 是普通面板专属的独立因子（U16b 口径，独立增伤单独成因子），
        // 不参与上面这条降级链的短路。
    })

    it("2002：只保留近战普攻 32% 翻倍期望，不再有永久暴击面板", () => {
        const current = attrOf("升华·连击暴击")
        const meleeNormal: DpsOptions = { baseName: "普通攻击", targetFunction: "一段伤害" }

        expect(current).toEqual({ 近战普攻独立增伤: 0.32 })
        // 32% 概率 ×2 折算为 (1 + 0.32) 独立因子
        expect(dps(current, meleeNormal) / dps({}, meleeNormal)).toBeCloseTo(1.32, 6)
        // 真正的远程目标不吃近战普攻细分键
        expect(dps(current, rangedShot) / dps({}, rangedShot)).toBeCloseTo(1, 9)
    })

    it("2009：充盈威力溢出的 11.1% 按武器独立乘区计入", () => {
        const expression = "0.111*max(0,充盈威力-1)"
        const attrs = { 充盈威力: 1, 近战独立增伤: expression, 远程独立增伤: expression }

        expect(dps(attrs, meleePlunge) / dps({ 充盈威力: 1 }, meleePlunge)).toBeCloseTo(1.111, 6)
        expect(dps(attrs, rangedShot) / dps({ 充盈威力: 1 }, rangedShot)).toBeCloseTo(1.111, 6)
    })
})

describe("U83c 手写 BUFF 语义修复", () => {
    const attrOf = (name: string) => TRANSCEND_BUFFS.find(buff => buff.名称 === name)!.attr ?? {}

    it("P0 键位与量纲对齐上游", () => {
        expect(attrOf("升华·螺旋跃击")).toEqual({ 下落独立增伤: 9 })
        expect(attrOf("升华·连击暴击")).toEqual({ 近战普攻独立增伤: 0.32 })
        expect(attrOf("升华·火属性弱点")).toEqual({ 火属性弱点: 0.54 })
        expect(attrOf("升华·充盈转武伤")).toEqual({
            近战独立增伤: "0.111*max(0,充盈威力-1)",
            远程独立增伤: "0.111*max(0,充盈威力-1)",
        })
        expect(attrOf("升华·四属追伤")).toEqual({ 水属性追伤: 1, 火属性追伤: 1, 风属性追伤: 1, 雷属性追伤: 1 })
        expect(attrOf("升华·形神穿透")).toEqual({ 属性穿透: "0.0336*技能威力" })
        expect(attrOf("升华·星河破防")).toEqual({ 无视防御: 1 })
    })

    it("2008 触发 / 持续 / 概率迁入 effect，excluded 只留精确缺口", () => {
        expect(UNIQUE_AFFIX_MAP[2008].coverage).toBeUndefined()
        expect(UNIQUE_AFFIX_MAP[2008].values).toEqual([{ name: "火属性弱点", value: 0.54 }])
        expect(UNIQUE_AFFIX_MAP[2008].included).toEqual(["火属性弱点"])
        expect(UNIQUE_AFFIX_MAP[2008].excluded).toEqual(["目标减益", "覆盖率"])
        expect(UNIQUE_AFFIX_MAP[2008].effect).toEqual({ target: "enemy", trigger: "skill-hit", chance: 0.25, duration: 8 })
    })

    it("320302 不再把 700% 追加伤害伪装成面板追伤，缺口 token 保留", () => {
        expect(UNIQUE_AFFIX_MAP[320302].values).toBeUndefined()
        expect(UNIQUE_AFFIX_MAP[320302].excluded).toEqual(["700% 追加伤害", "火属性紊乱层数"])
    })

    it("四属性追伤 token 已登记，不再排除非匹配元素", () => {
        for (const affixId of [180102, 240103]) {
            expect(UNIQUE_AFFIX_MAP[affixId].included, String(affixId)).toContain("四属性追伤")
            expect(UNIQUE_AFFIX_MAP[affixId].excluded, String(affixId)).not.toContain("非匹配元素分量不计")
        }
    })

    it("仍有计算缺口的条目显式 partial 并给出精确 excluded", () => {
        const required: Array<[number, string[]]> = [
            [2002, ["单次命中暴击率"]],
            [240102, ["队友九针移除"]],
            [420101, ["连击等级 S"]],
            [110201, ["连击点数", "技能效果替换"]],
            [150201, ["雾海安魂"]],
            [150202, ["技能效果替换"]],
            [150203, ["技能效果替换"]],
            [180102, ["四属性领域伤害"]],
            [2040601, ["主弹片最多 3 枚", "武器限定", "技能系数改写未建模"]],
            [320301, ["炮台形态改动"]],
            [2030301, ["武器限定", "每轮 1 弹"]],
        ]
        for (const [affixId, tokens] of required) {
            const mapping = UNIQUE_AFFIX_MAP[affixId]
            expect(mapping.partial, `${affixId}`).toBe(true)
            for (const token of tokens) {
                expect(mapping.excluded, `${affixId}:${token}`).toContain(token)
            }
        }
    })
})

describe("默认设置", () => {
    it("主控默认角色与通用武器、协战未启用、升华关闭", () => {
        const settings = createDefaultTranscendBuildSettings(1101)
        expect(settings.main).toMatchObject({
            charId: 1101,
            charLevel: 80,
            charSkillLevel: [10, 10, 10],
            meleeWeapon: 10206,
            meleeWeaponLevel: 80,
            meleeWeaponRefine: 5,
            rangedWeapon: 20102,
            rangedWeaponLevel: 80,
            rangedWeaponRefine: 5,
            extraMastery: "",
            baseName: "",
            targetFunction: "",
            customVariables: [],
            enabled: true,
        })
        expect(settings.assist1).toMatchObject({ charId: 0, targetFunction: "", customVariables: [], enabled: false })
        expect(settings.assist2).toMatchObject({ charId: 0, targetFunction: "", customVariables: [], enabled: false })
        expect(settings.transcend).toEqual({
            enabled: false,
            talentLevels: [],
            mainGear: [],
            assist1Gear: [],
            assist2Gear: [],
            gearVariants: [{ id: "A", mainGear: [], assist1Gear: [], assist2Gear: [] }],
            activeGearVariant: "A",
        })
        expect(settings.customVariables).toEqual([])
        expect(settings.enemyId).toBe(130)
        expect(settings.enemyLevel).toBe(80)
        expect(settings.hpPercent).toBe(1)
        expect(settings.resonanceGain).toBe(3)
        expect(settings.imbalance).toBe(false)
    })

    it("专武按类型进入对应槽位", () => {
        const signature = [...weaponMap.values()].find(weapon => weapon.类型[0] === "近战" && weapon.id !== 10206)!
        expect(signature).toBeDefined()
        const settings = createDefaultTranscendBuildSettings(1101, { id: signature.id, type: "近战" })
        expect(settings.main.meleeWeapon).toBe(signature.id)
        expect(settings.main.rangedWeapon).toBe(20102)
    })

    it("远程专武进入远程槽位", () => {
        const signature = [...weaponMap.values()].find(weapon => weapon.类型[0] === "远程" && weapon.id !== 20102)!
        expect(signature).toBeDefined()
        const settings = createDefaultTranscendBuildSettings(1101, { id: signature.id, type: "远程" })
        expect(settings.main.meleeWeapon).toBe(10206)
        expect(settings.main.rangedWeapon).toBe(signature.id)
    })

    it("非法角色 id 回退到默认角色，0 表示未选择", () => {
        const fallback = getDefaultTranscendCharId()
        expect(fallback).toBeGreaterThan(0)
        expect(charMap.has(fallback)).toBe(true)
        expect(createDefaultTranscendBuildSettings(999999).main.charId).toBe(fallback)
        expect(createDefaultTranscendBuildSettings(0).main.charId).toBe(0)
    })

    it("缺失 / 非法输入归一化为默认值", () => {
        const settings = normalizeTranscendBuildSettings(undefined)
        expect(settings.main.charId).toBe(0)
        expect(settings.assist1).toMatchObject({ charId: 0, enabled: false })
        expect(settings.transcend.enabled).toBe(false)
    })
})

describe("归一化", () => {
    it("协战未启用或角色无效时关闭", () => {
        const settings = normalizeTranscendBuildSettings({
            assist1: { charId: 1101, enabled: false },
            assist2: { charId: 999999, enabled: true },
        })
        expect(settings.assist1.enabled).toBe(false)
        expect(settings.assist2.charId).toBe(0)
        expect(settings.assist2.enabled).toBe(false)
    })

    it("无效角色/武器清零，等级、技能、精炼钳制", () => {
        const settings = normalizeTranscendBuildSettings({
            main: {
                charId: 999999,
                charLevel: 999,
                charSkillLevel: [99, -5, 3.6],
                meleeWeapon: 999999,
                meleeWeaponLevel: 999,
                meleeWeaponRefine: 99,
                rangedWeapon: 0,
                rangedWeaponLevel: 0,
                rangedWeaponRefine: -3,
                baseName: 42,
                enabled: false,
            },
        })
        expect(settings.main.charId).toBe(0)
        expect(settings.main.charLevel).toBe(80)
        expect(settings.main.charSkillLevel).toEqual([10, 1, 4])
        expect(settings.main.meleeWeapon).toBe(0)
        expect(settings.main.meleeWeaponLevel).toBe(80)
        expect(settings.main.meleeWeaponRefine).toBe(5)
        expect(settings.main.rangedWeapon).toBe(0)
        expect(settings.main.rangedWeaponLevel).toBe(1)
        expect(settings.main.rangedWeaponRefine).toBe(0)
        expect(settings.main.baseName).toBe("")
        // 主控也可禁用：角色被判无效时不参与合计
        expect(settings.main.enabled).toBe(false)
    })

    it("三段都可禁用：主控显式 false 保持禁用，缺 enabled 时默认启用", () => {
        const disabled = normalizeTranscendBuildSettings({ main: { charId: 1101, enabled: false } })
        expect(disabled.main).toMatchObject({ charId: 1101, enabled: false })
        const legacy = normalizeTranscendBuildSettings({ main: { charId: 1101 } })
        expect(legacy.main.enabled).toBe(true)
        const assist = normalizeTranscendBuildSettings({ assist1: { charId: 1101, enabled: false } })
        expect(assist.assist1).toMatchObject({ charId: 1101, enabled: false })
    })

    it("环境参数钳制", () => {
        const settings = normalizeTranscendBuildSettings({
            enemyId: -1,
            enemyLevel: 999,
            enemyResistance: "x",
            hpPercent: 2,
            resonanceGain: -4,
        })
        expect(settings.enemyId).toBe(130)
        expect(settings.enemyLevel).toBe(999)
        expect(normalizeTranscendBuildSettings({ enemyLevel: 5000 }).enemyLevel).toBe(1000)
        expect(settings.enemyResistance).toBe(0)
        expect(settings.hpPercent).toBe(1)
        expect(settings.resonanceGain).toBe(0)
        // 未知怪物 id 会让 LeveledMonster 抛错，回退到默认目标
        expect(normalizeTranscendBuildSettings({ enemyId: 999999 }).enemyId).toBe(130)
    })

    it("装备走升华归一化：v1 词条迁移为物品，每槽最多 1 条基础 + 4 条随机", () => {
        const compatible = affixes.filter(affix => isAffixCompatibleWithSlot(affix.id, 3))
        const baseAffixId = 101
        const randomIds = compatible
            .filter(affix => affix.id !== baseAffixId && affix.plan === 2)
            .slice(0, TRANSCEND_MAX_AFFIXES_PER_SLOT + 1)
            .map(affix => affix.id)
        expect(randomIds.length).toBeGreaterThan(TRANSCEND_MAX_AFFIXES_PER_SLOT)
        const settings = normalizeTranscendBuildSettings({
            transcend: {
                enabled: true,
                talentLevels: [],
                mainGear: [baseAffixId, ...randomIds].map(affixId => gear({ slotId: 3, affixId })),
            },
        })
        expect(settings.transcend.mainGear).toHaveLength(1)
        const equipped = settings.transcend.mainGear[0] as TranscendEquippedGear
        expect(equipped.slotId).toBe(3)
        expect(equipped.item.kind).toBe("normal")
        expect(equipped.item.affixes).toHaveLength(TRANSCEND_MAX_AFFIXES_PER_SLOT + 1)
        expect(equipped.item.affixes.filter(roll => roll.source === "base")).toHaveLength(1)
        expect(equipped.item.affixes.filter(roll => roll.source === "random")).toHaveLength(TRANSCEND_MAX_AFFIXES_PER_SLOT)
    })

    it("脏数据（null / 字符串 / 数组 / main:null / 破损升华 / 数字技能等级）不抛错", () => {
        for (const input of [null, 42, "x", [], { main: null }, { transcend: "broken" }, { customVariables: "x" }, { assist1: [] }]) {
            expect(() => normalizeTranscendBuildSettings(input), JSON.stringify(input)).not.toThrow()
        }
        const normalized = normalizeTranscendBuildSettings({ main: { charSkillLevel: 12 }, transcend: "broken" })
        expect(normalized.main.charSkillLevel).toEqual([10, 10, 10])
        expect(normalized.transcend).toEqual(createDefaultTranscendBuildSettings(0).transcend)
    })

    it("额外精通只保留武器表里的类别，类型错误清空", () => {
        expect(normalizeTranscendBuildSettings({ main: { extraMastery: " 长柄 " } }).main.extraMastery).toBe("长柄")
        expect(normalizeTranscendBuildSettings({ main: { extraMastery: "不存在的武器" } }).main.extraMastery).toBe("")
        expect(normalizeTranscendBuildSettings({ main: { extraMastery: 42 } }).main.extraMastery).toBe("")
        expect(normalizeTranscendBuildSettings({ main: {} }).main.extraMastery).toBe("")
    })

    it("自定义变量只保留非空字符串键值对，旧全局值迁移到三段", () => {
        const settings = normalizeTranscendBuildSettings({
            customVariables: [[" 额外 ", " 2 + 3 "], ["", "1"], ["坏", 5], ["空", "  "], "x", null],
        })
        expect(settings.customVariables).toEqual([["额外", "2 + 3"]])
        for (const side of ["main", "assist1", "assist2"] as const) {
            expect(settings[side].customVariables, side).toEqual([["额外", "2 + 3"]])
        }
    })

    it("安全模式（数据表为空）下注入数据源仍保留配置", () => {
        const settings = normalizeTranscendBuildSettings(
            {
                transcend: {
                    enabled: true,
                    talentLevels: [[100010, 30]],
                    mainGear: [gear({ slotId: 3, affixId: 101, rollLevel: 999 })],
                    assist1Gear: [],
                    assist2Gear: [],
                },
            },
            { affixes: [], talents: [] }
        )
        expect(settings.transcend.enabled).toBe(true)
        expect(settings.transcend.talentLevels).toEqual([[100010, 30]])
        expect(settings.transcend.mainGear).toHaveLength(1)
        expect(settings.transcend.mainGear[0]).toMatchObject({ slotId: 3, affixId: 101, rollLevel: 999 })
    })

    it("混合槽组：按槽位重新分组，跨列表的同槽同词条去重，三组各归其位", () => {
        const settings = normalizeTranscendBuildSettings({
            transcend: {
                enabled: true,
                talentLevels: [],
                mainGear: [gear({ slotId: 3, affixId: 101, rollLevel: 1 }), gear({ slotId: 13, affixId: 1501, rollLevel: 1 })],
                assist1Gear: [gear({ slotId: 3, affixId: 101, rollLevel: 2 }), gear({ slotId: 9, affixId: 1502, rollLevel: 1 })],
                assist2Gear: [gear({ slotId: 16, affixId: 1501, rollLevel: 1 })],
            },
        })
        // 同一 (slotId, affixId) 出现在不同列表时后者覆盖前者，并按装备位归组成物品
        const main = settings.transcend.mainGear[0] as TranscendEquippedGear
        expect(main.slotId).toBe(3)
        expect(main.item.affixes).toEqual([expect.objectContaining({ affixId: 101, rollLevel: 2 })])
        expect(settings.transcend.mainGear).toHaveLength(1)
        expect(settings.transcend.assist1Gear.map(entry => entry.slotId)).toEqual([9])
        expect((settings.transcend.assist1Gear[0] as TranscendEquippedGear).item.affixes[0].affixId).toBe(1502)
        expect(settings.transcend.assist2Gear.map(entry => entry.slotId)).toEqual([13, 16])
    })
})

describe("归一化：读取保留 / 计算净化", () => {
    /** 模拟安全模式 / 数据包缺失时存档里的高版本 id */
    const unknownRefs = () => ({
        main: { charId: 990001, meleeWeapon: 999001, rangedWeapon: 999002, extraMastery: "长柄" },
        assist1: { charId: 990002, meleeWeapon: 999003, enabled: true },
        enemyId: 990003,
    })

    it("读取 / 持久化路径保留未知 char / weapon / enemy id", () => {
        const preserved = normalizeTranscendBuildSettings(unknownRefs(), undefined, { preserveUnknownIds: true })
        expect(preserved.main.charId).toBe(990001)
        expect(preserved.main.meleeWeapon).toBe(999001)
        expect(preserved.main.rangedWeapon).toBe(999002)
        expect(preserved.assist1.charId).toBe(990002)
        expect(preserved.assist1.meleeWeapon).toBe(999003)
        expect(preserved.assist1.enabled).toBe(true)
        expect(preserved.enemyId).toBe(990003)

        // 本地持久化格式（序列化）同样不做破坏性清零
        const parsed = JSON.parse(serializeTranscendBuildSettings(unknownRefs()))
        expect(parsed.main.charId).toBe(990001)
        expect(parsed.main.meleeWeapon).toBe(999001)
        expect(parsed.assist1.charId).toBe(990002)
        expect(parsed.enemyId).toBe(990003)
    })

    it("计算前严格净化未知 id", () => {
        const strict = normalizeTranscendBuildSettings(unknownRefs())
        expect(strict.main.charId).toBe(0)
        expect(strict.main.meleeWeapon).toBe(0)
        expect(strict.main.rangedWeapon).toBe(0)
        expect(strict.assist1.charId).toBe(0)
        expect(strict.assist1.enabled).toBe(false)
        expect(strict.enemyId).toBe(130)

        const team = buildTranscendTeam(unknownRefs() as unknown as TranscendBuildSettings)
        expect(team.main).toBeNull()
        expect(team.assist1).toBeNull()
        expect(team.total).toBe(0)
    })

    it("数据表为空时任何路径都保留 id", () => {
        charMap.clear()
        weaponMap.clear()
        monsterMap.clear()
        try {
            const strict = normalizeTranscendBuildSettings(unknownRefs())
            expect(strict.main.charId).toBe(990001)
            expect(strict.main.meleeWeapon).toBe(999001)
            expect(strict.main.rangedWeapon).toBe(999002)
            expect(strict.assist1.charId).toBe(990002)
            expect(strict.enemyId).toBe(990003)
            // 角色无法校验时额外精通也保留
            expect(strict.main.extraMastery).toBe("长柄")
            // 但计算仍不会用未知 id 构建
            expect(createTranscendBuild(strict, "main")).toBeNull()
        } finally {
            rebuildStaticIndexes()
        }
    })
})

describe("额外精通：按角色校验", () => {
    it("只接受角色额外精通列表里的类别", () => {
        // 1101 额外精通：长柄 / 重剑 / 双刀 / 太刀
        expect(normalizeTranscendBuildSettings({ main: { charId: 1101, extraMastery: "长柄" } }).main.extraMastery).toBe("长柄")
        // 鞭刃是合法武器类别，但不在 1101 的额外精通里
        expect(normalizeTranscendBuildSettings({ main: { charId: 1101, extraMastery: "鞭刃" } }).main.extraMastery).toBe("")
        // 没有额外精通的角色一律拒绝
        expect(normalizeTranscendBuildSettings({ main: { charId: 1503, extraMastery: "长柄" } }).main.extraMastery).toBe("")
        // 角色未知（数据不可用）时保留合法类别
        expect(normalizeTranscendBuildSettings({ main: { charId: 999999, extraMastery: "长柄" } }).main.extraMastery).toBe("长柄")
    })

    it("协战 1 / 2 的额外精通各自独立生效", () => {
        const settings = createDefaultTranscendBuildSettings(1101)
        settings.main.extraMastery = "长柄"
        settings.assist1 = { ...settings.main, extraMastery: "重剑", meleeWeapon: 10399, enabled: true }
        settings.assist2 = { ...settings.main, extraMastery: "", meleeWeapon: 10399, enabled: true }

        const main = createTranscendBuild(settings, "main")!.build
        const assist1 = createTranscendBuild(settings, "assist1")!.build
        const assist2 = createTranscendBuild(settings, "assist2")!.build
        expect([main.extraMastery, assist1.extraMastery, assist2.extraMastery]).toEqual(["长柄", "重剑", ""])
        expect(main.isWeaponCategoryMastered({ 类别: "长柄" })).toBe(true)
        expect(main.isWeaponCategoryMastered({ 类别: "重剑" })).toBe(false)
        expect(assist1.isWeaponCategoryMastered({ 类别: "重剑" })).toBe(true)
        expect(assist1.isWeaponCategoryMastered({ 类别: "长柄" })).toBe(false)
        expect(assist2.isWeaponCategoryMastered({ 类别: "长柄" })).toBe(false)
        // 重剑熔炼武器只在协战 1 侧生效
        expect(assist1.meleeWeapon.forgeEffective).toBe(true)
        expect(assist2.meleeWeapon.forgeEffective).toBe(false)

        const normalized = normalizeTranscendBuildSettings(settings)
        expect(normalized.assist1.extraMastery).toBe("重剑")
        expect(normalized.assist2.extraMastery).toBe("")
    })

    it("UI 选项按角色的额外精通返回，并过滤无武器的类别", () => {
        expect(getTranscendExtraMasteryOptions(1101)).toEqual(["长柄", "重剑", "双刀", "太刀"])
        expect(getTranscendExtraMasteryOptions(1503)).toEqual([])
        expect(getTranscendExtraMasteryOptions(999999)).toEqual([])
    })
})

describe("升华配置归属 CharSettings（U91a）", () => {
    it("旧配置里的 transcend 字段保留并归一化，不再被丢弃", () => {
        const legacy = { ...createDefaultCharSettings(), transcend: { enabled: true, talentLevels: [[100010, 30]] } }
        const normalized = normalizeCharSettings(legacy as unknown as CharSettings)
        expect(normalized.transcend.enabled).toBe(true)
        expect(normalized.transcend.talentLevels).toEqual([[100010, 30]])
        expect(normalized.charLevel).toBe(80)
    })
})

describe("单段构建", () => {
    /** 与 createTranscendBuild 同参的直接构筑，用于验证「关闭升华 = 无升华构筑」 */
    const createPlainBuild = (settings: ReturnType<typeof createDefaultTranscendBuildSettings>) =>
        new CharBuild({
            char: LeveledCharHelper.fromId(settings.main.charId, settings.main.charLevel),
            melee: LeveledWeaponHelper.fromId(settings.main.meleeWeapon, settings.main.meleeWeaponRefine, settings.main.meleeWeaponLevel),
            ranged: LeveledWeaponHelper.fromId(
                settings.main.rangedWeapon,
                settings.main.rangedWeaponRefine,
                settings.main.rangedWeaponLevel
            ),
            skillLevel: settings.main.charSkillLevel,
            buffs: [],
            baseName: settings.main.baseName,
            extraMastery: settings.main.extraMastery,
            customVariables: settings.customVariables,
            imbalance: settings.imbalance,
            hpPercent: settings.hpPercent,
            resonanceGain: settings.resonanceGain,
            enemyId: settings.enemyId,
            enemyLevel: settings.enemyLevel,
            enemyResistance: settings.enemyResistance,
            targetFunction: settings.targetFunction,
        })

    /** 关闭溯源：这些用例验证升华口径本身，避免默认满溯的派生 BUFF 干扰断言 */
    const withoutTrace = (settings: TranscendBuildSettings) => {
        settings.main.traceLevel = 0
        settings.assist1.traceLevel = 0
        settings.assist2.traceLevel = 0
        return settings
    }

    it("关闭 / 空配置时与无升华构筑的伤害一致", () => {
        const settings = withoutTrace(createDefaultTranscendBuildSettings(1101))
        settings.main.baseName = "残光"
        const { build } = createTranscendBuild(settings, "main")!
        const plain = createPlainBuild(settings)
        expect(build.buffs).toEqual([])
        expect(build.calculate()).toBeCloseTo(plain.calculate(), 6)
        expect(build.calculateAttributes().攻击).toBeCloseTo(plain.calculateAttributes().攻击, 6)
    })

    it("开启后天赋与装备进入 BUFF 列表并抬升属性", () => {
        const settings = createDefaultTranscendBuildSettings(1101)
        settings.main.baseName = "残光"
        const off = createTranscendBuild(settings, "main")!.build

        settings.transcend.enabled = true
        settings.transcend.talentLevels = [[100010, 30]]
        settings.transcend.mainGear = [gear({ slotId: 3, affixId: 101, rollLevel: 50 })]
        const on = createTranscendBuild(settings, "main")!.build

        // 天赋按效果拆分：名称用规范属性名，节点 id 只进结构化字段
        expect(on.buffs.some(buff => buff.名称 === "升华天赋·普通近战暴击" && buff.id === 100010)).toBe(true)
        expect(on.buffs.every(buff => !buff.名称.includes("#"))).toBe(true)
        expect(on.buffs.some(buff => buff.名称 === "升华装备·手套·攻击" && buff.source?.slotId === 3)).toBe(true)
        expect(on.calculateAttributes().攻击).toBeGreaterThan(off.calculateAttributes().攻击)
    })

    it("额外精通让跨精通武器生效锻造 / 潜质，面板与直接构筑一致", () => {
        const char = charMap.get(1101)!
        const forgeWeapon = [...weaponMap.values()].find(
            weapon =>
                weapon.类型[0] === "近战" && LeveledWeaponHelper.fromId(weapon.id, 5, 80).hasForge && !char.精通.includes(weapon.类型[1])
        )
        expect(forgeWeapon).toBeDefined()
        const category = forgeWeapon!.类型[1]
        const mk = (extraMastery: string) => {
            const settings = withoutTrace(createDefaultTranscendBuildSettings(1101))
            settings.main.baseName = "残光"
            settings.main.meleeWeapon = forgeWeapon!.id
            settings.main.extraMastery = extraMastery
            return settings
        }
        const off = createTranscendBuild(mk(""), "main")!.build
        const on = createTranscendBuild(mk(category), "main")!.build
        expect(off.meleeWeapon.forgeEffective).toBe(false)
        expect(on.meleeWeapon.forgeEffective).toBe(true)
        expect(on.calculateAttributes().攻击).toBeGreaterThan(off.calculateAttributes().攻击)
        expect(on.calculateAttributes()).toEqual(createPlainBuild(mk(category)).calculateAttributes())
    })

    it("自定义变量透传给 CharBuild 并可求值", () => {
        const settings = createDefaultTranscendBuildSettings(1101)
        settings.main.baseName = "残光"
        settings.main.customVariables = [["额外", "2 + 3"]]
        settings.main.targetFunction = "额外"
        const { build } = createTranscendBuild(settings, "main")!
        expect(build.customVariables).toEqual([["额外", "2 + 3"]])
        expect(build.validateAST("额外")).toBeUndefined()
        expect(build.calculate()).toBeCloseTo(5, 9)
    })

    it("协战不吃天赋，只用自己组的装备", () => {
        const settings = withoutTrace(createDefaultTranscendBuildSettings(1101))
        settings.transcend.enabled = true
        settings.transcend.talentLevels = [[100010, 30]]
        settings.transcend.mainGear = [gear({ slotId: 3, affixId: 101, rollLevel: 50 })]
        settings.transcend.assist1Gear = [gear({ slotId: 9, affixId: 1510, rollLevel: 5 })]
        settings.assist1 = { ...settings.main, enabled: true }

        const assist = createTranscendBuild(settings, "assist1")!.build
        expect(assist.buffs.some(buff => buff.名称.startsWith("升华天赋"))).toBe(false)
        // 协战只吃自己组装备：主控装备（手套·攻击）不进入
        expect(assist.buffs.some(buff => buff.名称 === "升华装备·手套·攻击")).toBe(false)
        expect(assist.skillLevel).toEqual([15, 10, 10])
    })

    it("1.8.7.1 专属词条按技能 id 提升主控技能等级（110201 → 战技 +10）", () => {
        const settings = withoutTrace(createDefaultTranscendBuildSettings(1102))
        settings.transcend.enabled = true
        settings.transcend.mainGear = [gear({ slotId: 6, affixId: 110201 })]
        const { build } = createTranscendBuild(settings, "main")!
        expect(build.skillLevel).toEqual([20, 10, 10])
    })

    it("技能替换透传给 CharBuild：角色技能字段改写 + 武器技能身份替换", () => {
        const settings = createDefaultTranscendBuildSettings(3102)
        settings.transcend.enabled = true
        settings.transcend.mainGear = [gear({ slotId: 1, affixId: 310201 }), gear({ slotId: 6, affixId: 2040601 })]
        settings.main.baseName = "高温清扫"
        settings.main.rangedWeapon = 20406
        const { build } = createTranscendBuild(settings, "main")!

        expect(build.skillReplacements[310201]).toMatchObject({ id: 310212 })
        const charSkill = build.charSkills.find(item => item.名称 === "高温清扫")!
        expect(charSkill.id).toBe(310212)
        expect(charSkill.字段.find(field => field.名称 === "伤害")?.值).toBeCloseTo(9.03552, 9)

        const weaponSkill = build.rangedWeaponSkills.find(item => item.id === 2040603)!
        expect(weaponSkill.名称).toBe("射击")
        expect(weaponSkill.字段.map(field => field.名称)).toEqual(["射击伤害", "子弹伤害"])
    })

    it("协战一装备产生属性 BUFF", () => {
        const settings = withoutTrace(createDefaultTranscendBuildSettings(1101))
        settings.main.baseName = "残光"
        settings.transcend.enabled = true
        settings.transcend.assist1Gear = [gear({ slotId: 9, affixId: 1501, rollLevel: 1 })]
        settings.assist1 = { ...settings.main, enabled: true }
        const withGear = createTranscendBuild(settings, "assist1")!.build
        const without = createTranscendBuild({ ...settings, transcend: { ...settings.transcend, assist1Gear: [] } }, "assist1")!.build
        expect(withGear.buffs.map(buff => buff.名称)).toEqual(["升华装备·护符·防御"])
        expect(withGear.calculateAttributes().防御).toBeGreaterThan(without.calculateAttributes().防御)
    })

    it("两个协战各吃自己的装备：一人一套，互不共享", () => {
        const settings = withoutTrace(createDefaultTranscendBuildSettings(1101))
        settings.main.baseName = "残光"
        settings.transcend.enabled = true
        settings.transcend.assist1Gear = [gear({ slotId: 9, affixId: 1501, rollLevel: 1 })]
        settings.transcend.assist2Gear = [gear({ slotId: 13, affixId: 1501, rollLevel: 1 })]
        settings.assist1 = { ...settings.main, enabled: true }
        settings.assist2 = { ...settings.main, enabled: true }
        for (const side of ["assist1", "assist2"] as const) {
            const build = createTranscendBuild(settings, side)!.build
            expect(
                build.buffs.map(buff => buff.名称),
                side
            ).toEqual(["升华装备·护符·防御"])
        }
        const normalized = normalizeTranscendBuildSettings(settings).transcend
        expect((normalized.assist1Gear[0] as TranscendEquippedGear).slotId).toBe(9)
        expect((normalized.assist2Gear[0] as TranscendEquippedGear).slotId).toBe(13)

        // 只清空协战二：协战一仍吃自己的装备，协战二失去加成
        const cleared = normalizeTranscendBuildSettings({ ...settings, transcend: { ...settings.transcend, assist2Gear: [] } })
        expect(createTranscendBuild(cleared, "assist1")!.build.buffs).toHaveLength(1)
        expect(createTranscendBuild(cleared, "assist2")!.build.buffs).toEqual([])
    })

    it("限定词条按各构筑位角色过滤（协战一 / 协战二各读本组槽位）", () => {
        const own = resolveGearEffects([gear({ slotId: 9, affixId: 150401, rollLevel: 1 })], "assist1", { charId: 1504 })
        const other = resolveGearEffects([gear({ slotId: 13, affixId: 150401, rollLevel: 1 })], "assist2", { charId: 2401 })
        expect(own.entries).toHaveLength(1)
        expect(other.entries).toHaveLength(0)
        expect(other.warnings.some(text => text.includes("仅适用于角色"))).toBe(true)
    })

    it("装备按组生效：主控装备不进入协战位", () => {
        const settings = withoutTrace(createDefaultTranscendBuildSettings(1101))
        settings.transcend.enabled = true
        settings.transcend.mainGear = [gear({ slotId: 3, affixId: 101, rollLevel: 50 })]
        settings.assist1 = { ...settings.main, enabled: true }
        const assist = createTranscendBuild(settings, "assist1")!.build
        expect(assist.buffs).toEqual([])
    })

    it("charIds 过滤：150401 只进入 1504 的构筑", () => {
        const own = createDefaultTranscendBuildSettings(1504)
        own.transcend.enabled = true
        own.transcend.mainGear = [gear({ slotId: 1, affixId: 150401 })]
        expect(createTranscendBuild(own, "main")!.build.buffs.some(buff => buff.名称.startsWith("升华·遨游永续"))).toBe(true)

        const other = createDefaultTranscendBuildSettings(1503)
        other.transcend = own.transcend
        expect(createTranscendBuild(other, "main")!.build.buffs.some(buff => buff.名称.startsWith("升华"))).toBe(false)
    })

    it("warnings / modelingNotes 透出给 UI", () => {
        const settings = createDefaultTranscendBuildSettings(1101)
        settings.transcend.enabled = true
        settings.transcend.mainGear = [gear({ slotId: 1, affixId: 101 }), gear({ slotId: 4, affixId: 2001 })]
        const result = createTranscendBuild(settings, "main")!
        expect(result.warnings.join()).toContain("不能装备在装备位 1")
        expect(result.modelingNotes.some(note => note.id === 2001)).toBe(true)
    })

    it("神智回复词条精确进入角色属性", () => {
        const base = createDefaultTranscendBuildSettings(1101)
        base.main.baseName = "残光"
        base.transcend.enabled = true
        const baseRegen = createTranscendBuild(base, "main")!.build.calculateAttributes().神智回复
        for (const [affixId, value] of [
            [3302, 1],
            [3312, 2],
            [3322, 3],
            [3332, 4],
            [3342, 5],
        ] as const) {
            const settings = createDefaultTranscendBuildSettings(1101)
            settings.main.baseName = "残光"
            settings.transcend.enabled = true
            settings.transcend.mainGear = [gear({ slotId: 2, affixId })]
            expect(createTranscendBuild(settings, "main")!.build.calculateAttributes().神智回复, `${affixId}`).toBeCloseTo(
                baseRegen + value,
                9
            )
        }
    })

    it("默认不注入 MOD / 魔灵 / 自定义 BUFF / 原始配置；joint 字段设置后只挂主控", () => {
        const defaults = createTranscendBuild(createDefaultTranscendBuildSettings(1101), "main")!
        expect(defaults.build.mods).toEqual([])
        expect(defaults.build.charMods).toEqual([])
        expect(defaults.build.meleeMods).toEqual([])
        expect(defaults.build.rangedMods).toEqual([])
        expect(defaults.build.skillMods).toEqual([])
        expect(defaults.build.auraMod).toBeUndefined()
        expect(defaults.build.customBuff).toEqual([])
        expect(defaults.build.petBaseCd).toBe(0)
        expect(defaults.build.settings).toBeUndefined()
        expect(defaults.build.timeline).toBeUndefined()

        const settings = createDefaultTranscendBuildSettings(1101)
        settings.main.baseName = "残光"
        settings.petId = 4013
        settings.traits = [[1010, 2], null, null, null]
        settings.customBuff = [["攻击", 0.2]]
        settings.buffs = [["自定义BUFF", 1]]
        settings.assist1 = { ...settings.assist1, charId: 1102, enabled: true, baseName: "芙罗拉Q" }

        const main = createTranscendBuild(settings, "main")!
        const mainNames = main.build.buffs.map(buff => buff.名称)
        expect(mainNames).toContain("闪亮紫纱黑云")
        expect(mainNames).toContain("魔灵潜质:凶猛")
        expect(mainNames).toContain("自定义BUFF")
        expect(main.build.customBuff.map(buff => buff.名称)).toEqual(["自定义BUFF"])
        // 主控与潜质各自只注入一次（迁移后 BUFF 列表不再保留潜质条目）
        expect(mainNames.filter(name => name === "魔灵潜质:凶猛")).toHaveLength(1)

        const assist = createTranscendBuild(settings, "assist1")!
        const assistNames = assist.build.buffs.map(buff => buff.名称)
        expect(assistNames).not.toContain("闪亮紫纱黑云")
        expect(assistNames).not.toContain("魔灵潜质:凶猛")
        expect(assistNames).not.toContain("自定义BUFF")
        expect(assist.build.customBuff).toEqual([])
    })

    it("角色无效时 createTranscendBuild 返回 null，合计按未启用处理", () => {
        const settings = createDefaultTranscendBuildSettings(1101)
        settings.main.charId = 999999
        expect(createTranscendBuild(settings, "main")).toBeNull()
        const team = buildTranscendTeam(settings)
        expect(team.main).toBeNull()
        expect(team.total).toBe(0)
    })

    it("未知 / 非法武器 id 返回 null（含协战位）", () => {
        const melee = createDefaultTranscendBuildSettings(1101)
        melee.main.meleeWeapon = 999001
        expect(createTranscendBuild(melee, "main")).toBeNull()

        const ranged = createDefaultTranscendBuildSettings(1101)
        ranged.main.rangedWeapon = 999002
        expect(createTranscendBuild(ranged, "main")).toBeNull()

        const assist = createDefaultTranscendBuildSettings(1101)
        assist.assist1 = { ...assist.main, meleeWeapon: 999001, enabled: true }
        expect(createTranscendBuild(assist, "assist1")).toBeNull()
    })

    it("未归一化 / 残缺输入不抛错", () => {
        const settings = createDefaultTranscendBuildSettings(1101)
        const dirty = settings as unknown as Record<string, unknown>
        dirty.customVariables = "x"
        dirty.targetFunction = 42
        dirty.enemyId = 999999
        dirty.hpPercent = 5
        expect(() => createTranscendBuild(settings, "main")).not.toThrow()
        const { build } = createTranscendBuild(settings, "main")!
        expect(build.customVariables).toEqual([])
        expect(build.targetFunction).toBe("伤害")
        expect(build.enemyId).toBe(130)
        expect(build.hpPercent).toBe(1)

        expect(createTranscendBuild(null, "main")).toBeNull()
        expect(createTranscendBuild(undefined, "main")).toBeNull()
        expect(createTranscendBuild({} as TranscendBuildSettings, "main")).toBeNull()
    })

    it("构建与合计不修改入参", () => {
        const settings = createDefaultTranscendBuildSettings(1101)
        settings.main.baseName = "残光"
        settings.transcend.enabled = true
        settings.transcend.talentLevels = [[100010, 30]]
        settings.transcend.mainGear = [gear({ slotId: 3, affixId: 101, rollLevel: 50 })]
        settings.customVariables = [["额外", "2 + 3"]]
        settings.assist1 = { ...settings.main, enabled: true }
        const before = JSON.stringify(settings)
        createTranscendBuild(settings, "main")
        buildTranscendTeam(settings)
        expect(JSON.stringify(settings)).toBe(before)
    })
})

describe("合计", () => {
    it("未启用的协战不参与，合计等于主控", () => {
        const settings = createDefaultTranscendBuildSettings(1101)
        settings.main.baseName = "残光"
        const team = buildTranscendTeam(settings)
        expect(team.main).not.toBeNull()
        expect(team.assist1).toBeNull()
        expect(team.assist2).toBeNull()
        expect(team.total).toBeCloseTo(team.main!.build.calculate(), 6)
    })

    it("启用协战 1/2 后合计为有效段之和", () => {
        const settings = createDefaultTranscendBuildSettings(1101)
        settings.main.baseName = "残光"
        settings.assist1 = { ...settings.main, enabled: true }
        settings.assist2 = { ...settings.main, enabled: true }
        const team = buildTranscendTeam(settings)
        expect(team.assist1).not.toBeNull()
        expect(team.assist2).not.toBeNull()
        const expected = team.main!.build.calculate() + team.assist1!.build.calculate() + team.assist2!.build.calculate()
        expect(team.total).toBeCloseTo(expected, 6)
    })

    it("启用但角色无效的协战不参与", () => {
        const settings = createDefaultTranscendBuildSettings(1101)
        settings.main.baseName = "残光"
        settings.assist1 = { ...settings.main, charId: 0, enabled: true }
        const team = buildTranscendTeam(settings)
        expect(team.assist1).toBeNull()
        expect(team.total).toBeCloseTo(team.main!.build.calculate(), 6)
    })

    it("主控角色无效时返回空主控与 0 合计", () => {
        const team = buildTranscendTeam(createDefaultTranscendBuildSettings(0))
        expect(team.main).toBeNull()
        expect(team.assist1).toBeNull()
        expect(team.assist2).toBeNull()
        expect(team.total).toBe(0)
    })

    it("仅启用协战二时合计只含主控与协战二", () => {
        const settings = createDefaultTranscendBuildSettings(1101)
        settings.main.baseName = "残光"
        settings.assist2 = { ...settings.main, enabled: true }
        const team = buildTranscendTeam(settings)
        expect(team.assist1).toBeNull()
        expect(team.assist2).not.toBeNull()
        expect(team.total).toBeCloseTo(team.main!.build.calculate() + team.assist2!.build.calculate(), 6)
    })
})

describe("按构筑位独立的目标表达式 / 自定义变量", () => {
    /** 三段同角色、可分别设置目标表达式的基础设置 */
    const teamSettings = () => {
        const settings = createDefaultTranscendBuildSettings(1101)
        settings.main.baseName = "残光"
        settings.assist1 = { ...settings.main, enabled: true }
        settings.assist2 = { ...settings.main, enabled: true }
        return settings
    }
    /** 旧版（无 per-side 表达式字段）loadout */
    const legacyLoadout = (charId: number, enabled: boolean) => ({
        charId,
        charLevel: 80,
        charSkillLevel: [10, 10, 10],
        meleeWeapon: 10206,
        meleeWeaponLevel: 80,
        meleeWeaponRefine: 5,
        rangedWeapon: 20102,
        rangedWeaponLevel: 80,
        rangedWeaponRefine: 5,
        extraMastery: "",
        baseName: "残光",
        enabled,
    })

    it("三段各用自己 loadout 的表达式构建，产生不同伤害", () => {
        const settings = teamSettings()
        settings.main.targetFunction = "攻击!"
        settings.assist1.targetFunction = "防御!"
        settings.assist2.targetFunction = "生命!"
        const team = buildTranscendTeam(settings)
        expect(team.main!.build.targetFunction).toBe("攻击!")
        expect(team.assist1!.build.targetFunction).toBe("防御!")
        expect(team.assist2!.build.targetFunction).toBe("生命!")
        expect(team.main!.build.calculate()).toBeCloseTo(team.main!.build.calculateAttributes().攻击, 6)
        expect(team.assist1!.build.calculate()).toBeCloseTo(team.assist1!.build.calculateAttributes().防御, 6)
        expect(team.assist2!.build.calculate()).toBeCloseTo(team.assist2!.build.calculateAttributes().生命, 6)
        const mainDamage = team.main!.build.calculate()
        const assist1Damage = team.assist1!.build.calculate()
        expect(mainDamage).not.toBeCloseTo(assist1Damage, 3)
        expect(team.total).toBeCloseTo(mainDamage + assist1Damage + team.assist2!.build.calculate(), 6)
    })

    it("自定义变量只在该段可解析", () => {
        const settings = teamSettings()
        settings.main.customVariables = [["额外", "2 + 3"]]
        settings.main.targetFunction = "额外"
        settings.assist1.targetFunction = "额外"
        const main = createTranscendBuild(settings, "main")!
        const assist = createTranscendBuild(settings, "assist1")!
        expect(main.build.customVariables).toEqual([["额外", "2 + 3"]])
        expect(main.build.validateAST(main.build.targetFunction)).toBeUndefined()
        expect(main.build.calculate()).toBeCloseTo(5, 9)
        expect(assist.build.customVariables).toEqual([])
        expect(assist.build.validateAST(assist.build.targetFunction)).toBeTruthy()
    })

    it("主控 / 协战禁用后不计入合计", () => {
        const settings = teamSettings()
        settings.main.enabled = false
        let team = buildTranscendTeam(settings)
        expect(team.main).toBeNull()
        expect(team.assist1).not.toBeNull()
        expect(team.assist2).not.toBeNull()
        expect(team.total).toBeCloseTo(team.assist1!.build.calculate() + team.assist2!.build.calculate(), 6)

        settings.main.enabled = true
        settings.assist1.enabled = false
        team = buildTranscendTeam(settings)
        expect(team.main).not.toBeNull()
        expect(team.assist1).toBeNull()
        expect(team.assist2).not.toBeNull()
        expect(team.total).toBeCloseTo(team.main!.build.calculate() + team.assist2!.build.calculate(), 6)
    })

    it("旧设置（无 per-side 字段）三段沿用旧全局表达式与变量", () => {
        const legacy = {
            main: legacyLoadout(1101, true),
            assist1: legacyLoadout(1101, true),
            assist2: legacyLoadout(1101, true),
            targetFunction: "攻击!",
            customVariables: [["额外", "2 + 3"]],
        }
        const normalized = normalizeTranscendBuildSettings(legacy)
        for (const side of ["main", "assist1", "assist2"] as const) {
            expect(normalized[side].targetFunction, side).toBe("攻击!")
            expect(normalized[side].customVariables, side).toEqual([["额外", "2 + 3"]])
        }
        // 顶层镜像主控，旧读者仍读到旧值
        expect(normalized.targetFunction).toBe("攻击!")
        expect(normalized.customVariables).toEqual([["额外", "2 + 3"]])

        // 未归一化输入直接构建时同样按 legacy 回退
        const built = createTranscendBuild(legacy as unknown as TranscendBuildSettings, "assist1")!
        expect(built.build.targetFunction).toBe("攻击!")
        expect(built.build.customVariables).toEqual([["额外", "2 + 3"]])
    })

    it("归一化后顶层镜像主控，三段保留各自的值", () => {
        const settings = teamSettings()
        settings.main.targetFunction = "攻击!"
        settings.main.customVariables = [["主", "1"]]
        settings.assist1.targetFunction = "防御!"
        settings.assist1.customVariables = [["协一", "2"]]
        settings.assist2.targetFunction = "生命!"
        settings.assist2.customVariables = [["协二", "3"]]
        const normalized = normalizeTranscendBuildSettings(settings)
        expect([normalized.main.targetFunction, normalized.assist1.targetFunction, normalized.assist2.targetFunction]).toEqual([
            "攻击!",
            "防御!",
            "生命!",
        ])
        expect(normalized.main.customVariables).toEqual([["主", "1"]])
        expect(normalized.assist1.customVariables).toEqual([["协一", "2"]])
        expect(normalized.assist2.customVariables).toEqual([["协二", "3"]])
        expect(normalized.targetFunction).toBe("攻击!")
        expect(normalized.customVariables).toEqual([["主", "1"]])
    })

    it("序列化 / 分享往返保留三段值，顶层镜像主控", () => {
        const settings = teamSettings()
        settings.main.targetFunction = "攻击!"
        settings.main.customVariables = [["主", "1"]]
        settings.assist1.targetFunction = "防御!"
        settings.assist1.customVariables = [["协一", "2"]]
        settings.assist2.targetFunction = "生命!"
        settings.assist2.customVariables = [["协二", "3"]]
        // 三段各带不同的非零 DOT 设置，验证按位往返且互不串值
        settings.main.dotSettings = { skill: 1.5, melee: 0.5, ranged: 0, skillweapon: 0, forceOwnAdditionalDamage: true }
        settings.assist1.dotSettings = { skill: 0, melee: 2, ranged: 0.25, skillweapon: 0, forceOwnAdditionalDamage: false }
        const zeroDot = { skill: 0, melee: 0, ranged: 0, skillweapon: 0, forceOwnAdditionalDamage: false }

        const round = normalizeTranscendBuildSettings(JSON.parse(serializeTranscendBuildSettings(settings)), undefined, {
            preserveUnknownIds: true,
        })
        expect([round.main.targetFunction, round.assist1.targetFunction, round.assist2.targetFunction]).toEqual(["攻击!", "防御!", "生命!"])
        expect(round.assist1.customVariables).toEqual([["协一", "2"]])
        expect(round.assist2.customVariables).toEqual([["协二", "3"]])
        expect(round.targetFunction).toBe("攻击!")
        expect(round.customVariables).toEqual([["主", "1"]])
        expect(round.main.dotSettings).toEqual(settings.main.dotSettings)
        expect(round.assist1.dotSettings).toEqual(settings.assist1.dotSettings)
        expect(round.assist2.dotSettings).toEqual(zeroDot)

        const text = createTranscendBuildShare(settings)
        expect(text).toContain('"dotSettings"')
        const payload = JSON.parse(text)
        expect(payload.settings.assist2.targetFunction).toBe("生命!")
        expect(payload.settings.assist2.customVariables).toEqual([["协二", "3"]])
        expect(payload.settings.targetFunction).toBe("攻击!")
        expect(payload.settings.customVariables).toEqual([["主", "1"]])
        expect(payload.settings.main.dotSettings).toEqual(settings.main.dotSettings)
        expect(payload.settings.assist1.dotSettings).toEqual(settings.assist1.dotSettings)
        expect(payload.settings.assist2.dotSettings).toEqual(zeroDot)

        const parsed = parseTranscendBuildShare(text)!
        expect([
            parsed.settings.main.targetFunction,
            parsed.settings.assist1.targetFunction,
            parsed.settings.assist2.targetFunction,
        ]).toEqual(["攻击!", "防御!", "生命!"])
        expect(parsed.settings.main.dotSettings).toEqual(settings.main.dotSettings)
        expect(parsed.settings.assist1.dotSettings).toEqual(settings.assist1.dotSettings)
        expect(parsed.settings.assist2.dotSettings).toEqual(zeroDot)
        // 解析结果再次序列化与原始一致（DOT 参与归一化形状）
        expect(serializeTranscendBuildSettings(parsed.settings)).toBe(serializeTranscendBuildSettings(settings))
        // 分享页复现作者伤害：往返后的设置按各段自己的表达式计算
        expect(createTranscendBuild(parsed.settings, "assist1")!.build.calculate()).toBeCloseTo(
            createTranscendBuild(settings, "assist1")!.build.calculate(),
            9
        )
    })

    it("旧分享（无 per-side 字段）导入后三段沿用旧全局值", () => {
        const text = JSON.stringify({
            kind: TRANSCEND_BUILD_SHARE_KIND,
            charId: 1101,
            settings: {
                main: legacyLoadout(1101, true),
                assist1: legacyLoadout(1101, true),
                targetFunction: "攻击!",
                customVariables: [["额外", "2 + 3"]],
            },
        })
        const parsed = parseTranscendBuildShare(text)!
        for (const side of ["main", "assist1", "assist2"] as const) {
            expect(parsed.settings[side].targetFunction, side).toBe("攻击!")
            expect(parsed.settings[side].customVariables, side).toEqual([["额外", "2 + 3"]])
        }
    })

    it("混合格式迁移：自带字段的段保留，缺字段的段回退旧全局值", () => {
        const legacy = {
            main: { ...legacyLoadout(1101, true), targetFunction: "攻击!", customVariables: [["主", "1"]] },
            assist1: legacyLoadout(1101, true),
            assist2: { ...legacyLoadout(1101, true), targetFunction: "生命!" },
            targetFunction: "旧全局",
            customVariables: [["旧", "2"]],
        }
        const normalized = normalizeTranscendBuildSettings(legacy)
        expect(normalized.main.targetFunction).toBe("攻击!")
        expect(normalized.main.customVariables).toEqual([["主", "1"]])
        expect(normalized.assist1.targetFunction).toBe("旧全局")
        expect(normalized.assist1.customVariables).toEqual([["旧", "2"]])
        expect(normalized.assist2.targetFunction).toBe("生命!")
        expect(normalized.assist2.customVariables).toEqual([["旧", "2"]])
    })

    it("customVariables 四份数组互不共享，修改一段不影响其它段", () => {
        const legacy = {
            main: legacyLoadout(1101, true),
            assist1: legacyLoadout(1101, true),
            assist2: legacyLoadout(1101, true),
            targetFunction: "攻击!",
            customVariables: [["额外", "2 + 3"]],
        }
        const normalized = normalizeTranscendBuildSettings(legacy)
        normalized.main.customVariables[0][1] = "9"
        normalized.main.customVariables.push(["新", "1"])
        expect(normalized.assist1.customVariables).toEqual([["额外", "2 + 3"]])
        expect(normalized.assist2.customVariables).toEqual([["额外", "2 + 3"]])
        // 顶层镜像独立于主控位：改主控的数组不改变顶层副本
        expect(normalized.customVariables).toEqual([["额外", "2 + 3"]])
    })

    it("enabled 经序列化 / 分享往返保持不变（主控可禁用）", () => {
        const settings = teamSettings()
        settings.main.enabled = false
        settings.assist1.enabled = true
        settings.assist2.enabled = false
        const round = normalizeTranscendBuildSettings(JSON.parse(serializeTranscendBuildSettings(settings)), undefined, {
            preserveUnknownIds: true,
        })
        expect([round.main.enabled, round.assist1.enabled, round.assist2.enabled]).toEqual([false, true, false])
        const parsed = parseTranscendBuildShare(createTranscendBuildShare(settings))!
        expect([parsed.settings.main.enabled, parsed.settings.assist1.enabled, parsed.settings.assist2.enabled]).toEqual([
            false,
            true,
            false,
        ])
    })

    it("per-side 字段类型非法时回退旧全局值", () => {
        const legacy = {
            main: { ...legacyLoadout(1101, true), targetFunction: 42 },
            assist1: { ...legacyLoadout(1101, true), targetFunction: 42, customVariables: "x" },
            assist2: { ...legacyLoadout(1101, true), targetFunction: null, customVariables: "x" },
            targetFunction: "旧全局",
            customVariables: [["旧", "2"]],
        }
        const normalized = normalizeTranscendBuildSettings(legacy)
        expect(normalized.main.targetFunction).toBe("旧全局")
        expect(normalized.assist1.targetFunction).toBe("旧全局")
        expect(normalized.assist1.customVariables).toEqual([["旧", "2"]])
        expect(normalized.assist2.targetFunction).toBe("旧全局")
        expect(normalized.assist2.customVariables).toEqual([["旧", "2"]])
    })
})

describe("U85 每构筑位 DOT 设置", () => {
    const ZERO_DOT = { skill: 0, melee: 0, ranged: 0, skillweapon: 0, forceOwnAdditionalDamage: false }

    it("默认三段 DOT 全 0 且互不共享对象", () => {
        const settings = createDefaultTranscendBuildSettings(1101)
        expect(settings.main.dotSettings).toEqual(ZERO_DOT)
        expect(settings.assist1.dotSettings).toEqual(ZERO_DOT)
        expect(settings.assist2.dotSettings).toEqual(ZERO_DOT)
        settings.main.dotSettings.melee = 1.5
        expect(settings.assist1.dotSettings.melee).toBe(0)
        expect(settings.assist2.dotSettings.melee).toBe(0)
        expect(createDefaultTranscendBuildSettings(1101).main.dotSettings).toEqual(ZERO_DOT)
    })

    it("缺字段 / 负数 / NaN / 非数值 / 非布尔 flag 归一化为 0 / false", () => {
        const missing = normalizeTranscendBuildSettings({ main: { charId: 1101 } })
        expect(missing.main.dotSettings).toEqual(ZERO_DOT)
        const dirty = normalizeTranscendBuildSettings({
            main: {
                charId: 1101,
                dotSettings: { skill: -2, melee: Number.NaN, ranged: "3", skillweapon: 1.25, forceOwnAdditionalDamage: "yes" },
            },
            assist1: { charId: 1101, dotSettings: null },
            assist2: { charId: 1101, dotSettings: { skill: Number.POSITIVE_INFINITY, forceOwnAdditionalDamage: true } },
        })
        expect(dirty.main.dotSettings).toEqual({ skill: 0, melee: 0, ranged: 0, skillweapon: 1.25, forceOwnAdditionalDamage: false })
        expect(dirty.assist1.dotSettings).toEqual(ZERO_DOT)
        expect(dirty.assist2.dotSettings).toEqual({ ...ZERO_DOT, forceOwnAdditionalDamage: true })
        // 三段互不影响
        expect(dirty.main.dotSettings.skillweapon).toBe(1.25)
        expect(dirty.assist1.dotSettings.skillweapon).toBe(0)
    })

    it("三段的 DOT 设置各自透传给 CharBuild，并影响 DOT 伤害", () => {
        const settings = createDefaultTranscendBuildSettings(1101)
        settings.main.baseName = "残光"
        settings.main.dotSettings = { ...settings.main.dotSettings, melee: 0.5 }
        settings.assist1 = {
            ...settings.main,
            enabled: true,
            dotSettings: { ...settings.main.dotSettings, melee: 0, ranged: 1, forceOwnAdditionalDamage: true },
        }
        const main = createTranscendBuild(settings, "main")!.build
        const assist = createTranscendBuild(settings, "assist1")!.build
        expect(main.dotSettings).toEqual({ ...ZERO_DOT, melee: 0.5 })
        expect(assist.dotSettings).toEqual({ ...ZERO_DOT, ranged: 1, forceOwnAdditionalDamage: true })
        // 构造时已展开为独立副本：改设置不污染已构建的实例
        settings.main.dotSettings.melee = 9
        expect(main.dotSettings.melee).toBe(0.5)
        expect(main.calculateDotDamage()).toBeGreaterThan(0)
        expect(assist.calculateDotDamage()).toBeGreaterThan(0)
        // 默认为全 0 时 DOT 伤害为 0
        const plain = createTranscendBuild(createDefaultTranscendBuildSettings(1101), "main")!.build
        expect(plain.calculateDotDamage()).toBe(0)
    })

    it("脏原始设置直接构建：sanitize 清零且 DOT 伤害为 0", () => {
        // 刻意不先 normalize：createTranscendBuild 内部走 sanitizeSideLoadout
        const dirtyValues: [string, unknown][] = [
            ["缺失", undefined],
            ["null", null],
            [
                "Infinity / NaN / 负数 / 字符串",
                { skill: Number.POSITIVE_INFINITY, melee: Number.NaN, ranged: "3", skillweapon: -2, forceOwnAdditionalDamage: "yes" },
            ],
            ["非对象", "broken"],
        ]
        for (const [label, dirty] of dirtyValues) {
            const settings = createDefaultTranscendBuildSettings(1101)
            settings.main.baseName = "残光"
            const main: Record<string, unknown> = { ...settings.main }
            if (dirty === undefined) delete main.dotSettings
            else main.dotSettings = dirty
            const raw = { ...settings, main } as unknown as TranscendBuildSettings
            const build = createTranscendBuild(raw, "main")
            expect(build, label).not.toBeNull()
            expect(build!.build.dotSettings, label).toEqual(ZERO_DOT)
            expect(build!.build.calculateDotDamage(), label).toBe(0)
        }
    })

    it("序列化包含 dotSettings：DOT 频率变化时缓存键不同", () => {
        const settings = createDefaultTranscendBuildSettings(1101)
        const base = serializeTranscendBuildSettings(settings)
        expect(JSON.parse(base).main.dotSettings).toEqual(ZERO_DOT)
        settings.main.dotSettings.melee = 0.75
        const changed = serializeTranscendBuildSettings(settings)
        expect(changed).not.toBe(base)
        expect(JSON.parse(changed).main.dotSettings).toEqual({ ...ZERO_DOT, melee: 0.75 })
        // 只有主控变化，协战段仍是全 0
        expect(JSON.parse(changed).assist1.dotSettings).toEqual(ZERO_DOT)
        // 归一化往返保留 DOT 设置
        const restored = normalizeTranscendBuildSettings(JSON.parse(changed))
        expect(restored.main.dotSettings).toEqual({ ...ZERO_DOT, melee: 0.75 })
    })
})

describe("序列化", () => {
    it("紧凑形状可逆：顶层装备置空，读取时由激活变体恢复三组装备", () => {
        const settings = createDefaultTranscendBuildSettings(1101)
        settings.transcend.enabled = true
        settings.transcend.mainGear = [gear({ slotId: 3, affixId: 101, rollLevel: 50 })]
        settings.transcend.assist1Gear = [gear({ slotId: 9, affixId: 1501, rollLevel: 1 })]
        settings.transcend.assist2Gear = [gear({ slotId: 13, affixId: 1501, rollLevel: 1 })]
        const compact = compactTranscendBuildSettings(settings)
        expect(compact.transcend.mainGear).toEqual([])
        expect(compact.transcend.assist1Gear).toEqual([])
        expect(compact.transcend.assist2Gear).toEqual([])
        const restored = normalizeTranscendBuildSettings(JSON.parse(JSON.stringify(compact)))
        expect(restored.transcend.mainGear).toEqual(normalizeTranscendBuildSettings(settings).transcend.mainGear)
        expect(restored.transcend.assist1Gear).toEqual(normalizeTranscendBuildSettings(settings).transcend.assist1Gear)
        expect(restored.transcend.assist2Gear).toEqual(normalizeTranscendBuildSettings(settings).transcend.assist2Gear)
    })

    it("字段显式可读：版本 / 角色 / 武器 / 额外精通 / 天赋 / 装备 / 自定义变量", () => {
        const settings = createDefaultTranscendBuildSettings(1101)
        settings.main.extraMastery = "长柄"
        settings.main.customVariables = [["额外", "2 + 3"]]
        settings.transcend.enabled = true
        settings.transcend.talentLevels = [[100010, 30]]
        settings.transcend.mainGear = [gear({ slotId: 3, affixId: 101, rollLevel: 50, masterworkLevel: 10 })]
        settings.assist1 = { ...settings.main, enabled: true }
        const parsed = JSON.parse(serializeTranscendBuildSettings(settings))
        expect(parsed.main.charId).toBe(1101)
        expect(parsed.main.meleeWeapon).toBe(10206)
        expect(parsed.main.rangedWeapon).toBe(20102)
        expect(parsed.main.extraMastery).toBe("长柄")
        expect(parsed.assist1.enabled).toBe(true)
        // per-side 字段原样保留；顶层镜像主控，旧读者仍能读到
        expect(parsed.main.customVariables).toEqual([["额外", "2 + 3"]])
        expect(parsed.assist1.customVariables).toEqual([["额外", "2 + 3"]])
        expect(parsed.customVariables).toEqual([["额外", "2 + 3"]])
        expect(parsed.transcend.enabled).toBe(true)
        expect(parsed.transcend.talentLevels).toEqual([[100010, 30]])
        // 顶层装备组由激活变体恢复（序列化省略重复副本）
        expect(normalizeTranscendBuildSettings(parsed).transcend.mainGear).toEqual([
            {
                slotId: 3,
                item: {
                    kind: "normal",
                    slotType: 3,
                    affixes: [{ affixId: 101, rollLevel: 50, masterworkLevel: 10, ancient: false, finalMasterwork: false, source: "base" }],
                    craft: { masterworkLevel: 10, temperingCount: 0, enchantCount: 0 },
                },
            },
        ])
    })

    it("v2 物品往返：暗金 / 专属词条 / 孔位保留，快照与派生字段不落盘，且不写版本号字段", () => {
        const settings = createDefaultTranscendBuildSettings(1101)
        settings.transcend.enabled = true
        settings.transcend.mainGear = [
            {
                slotId: 1,
                item: {
                    kind: "unique",
                    slotType: 1,
                    uniqueId: 1001,
                    uniqueAffix: {
                        affixId: 2001,
                        rollLevel: 1,
                        masterworkLevel: 0,
                        ancient: false,
                        finalMasterwork: false,
                        source: "unique",
                    },
                    affixes: [{ affixId: 101, rollLevel: 5, masterworkLevel: 2, ancient: false, finalMasterwork: false, source: "random" }],
                    sockets: [{ socketIndex: 0, gemId: 7001101 }],
                    socketCount: 1,
                    nameSnapshot: "某暗金",
                    iconSnapshot: "icon_a",
                },
            },
        ]
        const text = serializeTranscendBuildSettings(settings)
        const parsed = JSON.parse(text)
        expect(parsed.version).toBeUndefined()
        // 只存可复现源字段：展示快照与 per-affix 派生字段（精锻 / 最终精锻 / 来源）不落盘
        const expected = [
            {
                slotId: 1,
                item: {
                    kind: "unique",
                    slotType: 1,
                    uniqueId: 1001,
                    uniqueAffix: { affixId: 2001, rollLevel: 1 },
                    affixes: [{ affixId: 101, rollLevel: 5 }],
                    craft: { masterworkLevel: 2, temperingCount: 0, enchantCount: 0 },
                    sockets: [{ socketIndex: 0, gemId: 7001101 }],
                    socketCount: 1,
                    legacyUnique: true,
                },
            },
        ]
        expect(parsed.transcend.gearVariants[0].mainGear).toEqual(expected)
        const round = normalizeTranscendBuildSettings(parsed)
        expect(round.transcend.mainGear).toEqual([
            {
                slotId: 1,
                item: {
                    kind: "unique",
                    slotType: 1,
                    uniqueId: 1001,
                    uniqueAffix: {
                        affixId: 2001,
                        rollLevel: 1,
                        masterworkLevel: 0,
                        ancient: false,
                        finalMasterwork: false,
                        source: "unique",
                    },
                    affixes: [{ affixId: 101, rollLevel: 5, masterworkLevel: 2, ancient: false, finalMasterwork: false, source: "random" }],
                    craft: { masterworkLevel: 2, temperingCount: 0, enchantCount: 0 },
                    sockets: [{ socketIndex: 0, gemId: 7001101 }],
                    socketCount: 1,
                    legacyUnique: true,
                },
            },
        ])
    })

    it("极端满配（300 天赋 + 16 槽 × 5 词条 + 3 变体）长度可控", () => {
        const slotIds = Array.from({ length: 16 }, (_, index) => index + 1)
        const perSlot = (slotId: number) =>
            affixes
                .filter(affix => isAffixCompatibleWithSlot(affix.id, slotId))
                .slice(0, TRANSCEND_MAX_AFFIXES_PER_SLOT)
                .map(affix =>
                    gear({ slotId, affixId: affix.id, rollLevel: 500, masterworkLevel: 10, ancient: true, finalMasterwork: true })
                )
        const settings = createDefaultTranscendBuildSettings(1101)
        settings.transcend.enabled = true
        settings.transcend.talentLevels = talents.map(talent => [talent.id, talent.maxLevel])
        settings.transcend.mainGear = slotIds.slice(0, 8).flatMap(perSlot)
        settings.transcend.assist1Gear = slotIds.slice(8, 12).flatMap(perSlot)
        settings.transcend.assist2Gear = slotIds.slice(12, 16).flatMap(perSlot)
        settings.transcend.gearVariants = ["A", "B", "C"].map(id => ({
            id,
            mainGear: settings.transcend.mainGear,
            assist1Gear: settings.transcend.assist1Gear,
            assist2Gear: settings.transcend.assist2Gear,
        }))

        const text = serializeTranscendBuildSettings(settings)
        const restored = normalizeTranscendBuildSettings(JSON.parse(text), undefined, { preserveUnknownIds: true })
        expect(restored.transcend.talentLevels).toHaveLength(300)
        // 序列化省略顶层重复组（由激活变体恢复），读取后三组装备完整
        expect(JSON.parse(text).transcend.mainGear).toEqual([])
        const groups = [restored.transcend.mainGear, restored.transcend.assist1Gear, restored.transcend.assist2Gear]
        expect(restored.transcend.gearVariants).toHaveLength(3)
        // 每个装备位一件物品（8 + 4 + 4），每件 4 条随机词条（不含基础词条）
        const equippedGroups = groups.flat() as TranscendEquippedGear[]
        expect(equippedGroups).toHaveLength(16)
        const rolls = equippedGroups.reduce((sum, equipped) => sum + equipped.item.affixes.length + (equipped.item.uniqueAffix ? 1 : 0), 0)
        expect(rolls).toBe(64)
        expect(text.length).toBeLessThan(40000)
    })
})

describe("手动 BUFF", () => {
    it("归一化：丢弃非法条目、按名称去重、等级钳制到上限、覆盖率为 1 时省略第三项", () => {
        const settings = normalizeTranscendBuildSettings({
            buffs: [
                ["菲娜Q", 999],
                [" 助战50攻 ", 0],
                ["助战50攻", 2, 0.5],
                ["助战50攻", 1, 1],
                ["", 1],
                ["坏等级", Number.NaN],
                "x",
                null,
            ],
        })
        const faina = buffMap.get("菲娜Q")!
        expect(settings.buffs).toEqual([
            ["菲娜Q", faina.mx],
            // 后者覆盖前者，满覆盖回退成两元素
            ["助战50攻", 1],
        ])
        expect(createDefaultTranscendBuildSettings(1101).buffs).toEqual([])
    })

    it("注入时排除魔之楔提供；自定义 BUFF 生效；魔灵 / 潜质 BUFF 由 joint 字段接管、不重复计入", () => {
        const petName = "魔灵潜质:凶猛"
        const settings = createDefaultTranscendBuildSettings(1801)
        settings.main.baseName = charMap.get(1801)?.技能[0].名称 ?? ""
        settings.customBuff = [["攻击", 0.1]]
        settings.buffs = [
            ["菲娜Q", 1],
            ["助战50攻", 1],
            ["全盛·振奋", 1],
            [petName, 1],
            ["自定义BUFF", 1],
        ]
        const raw = createTranscendBuild(settings, "main")!
        const names = raw.build.buffs.map(buff => buff.名称)
        expect(names).toContain("菲娜Q")
        expect(names).toContain("助战50攻")
        expect(names).not.toContain("全盛·振奋")
        expect(names).toContain("自定义BUFF")
        expect(raw.build.buffs.find(buff => buff.名称 === "自定义BUFF")!.getProperties().攻击).toBe(0.1)
        // 未归一化时魔灵相关 BUFF 由 joint 字段接管，不按普通 BUFF 注入
        expect(names).not.toContain(petName)

        // 归一化会把旧 BUFF 列表里的潜质搬进 traits，注入结果只有一条
        const normalized = normalizeTranscendBuildSettings(settings)
        expect(normalized.buffs.some(([name]) => name === petName)).toBe(false)
        expect(normalized.traits).toContainEqual([1010, 1])
        const migrated = createTranscendBuild(normalized, "main")!
        expect(migrated.build.buffs.filter(buff => buff.名称 === petName)).toHaveLength(1)
    })

    it("角色来源 BUFF 只进对应构筑位；主控额外接收队友来源，协战不重复叠加", () => {
        const settings = createDefaultTranscendBuildSettings(1801)
        settings.main.baseName = charMap.get(1801)?.技能[0].名称 ?? ""
        settings.assist1 = {
            ...settings.main,
            charId: 5101,
            baseName: charMap.get(5101)?.技能[0].名称 ?? "",
            enabled: true,
        }
        settings.assist2 = {
            ...settings.main,
            charId: 1101,
            baseName: charMap.get(1101)?.技能[0].名称 ?? "",
            enabled: true,
        }
        settings.buffs = [["榛子大冲击", 1]]
        const mainNames = createTranscendBuild(settings, "main")!.build.buffs.map(buff => buff.名称)
        const assist1Names = createTranscendBuild(settings, "assist1")!.build.buffs.map(buff => buff.名称)
        const assist2Names = createTranscendBuild(settings, "assist2")!.build.buffs.map(buff => buff.名称)
        // 主控：队友（协战一）来源计入
        expect(mainNames).toContain("榛子大冲击")
        // 协战一：自己的角色来源计入
        expect(assist1Names).toContain("榛子大冲击")
        // 协战二：与松露与榛子无关，不因队友而叠加
        expect(assist2Names).not.toContain("榛子大冲击")
    })

    it("「(队友)」武器 BUFF 计入主控，不计入持有武器的协战本体", () => {
        const settings = createDefaultTranscendBuildSettings(1801)
        settings.main.baseName = charMap.get(1801)?.技能[0].名称 ?? ""
        settings.assist1 = {
            ...settings.main,
            charId: 1101,
            baseName: charMap.get(1101)?.技能[0].名称 ?? "",
            meleeWeapon: 10502,
            enabled: true,
        }
        settings.buffs = [["泽世的慈雨(队友)", 1]]
        expect(createTranscendBuild(settings, "main")!.build.buffs.map(buff => buff.名称)).toContain("泽世的慈雨(队友)")
        expect(createTranscendBuild(settings, "assist1")!.build.buffs.map(buff => buff.名称)).not.toContain("泽世的慈雨(队友)")
    })
})

describe("joint 字段（魔灵 / 潜质 / 自定义 BUFF）", () => {
    /** 主控基准设置 */
    const baseSettings = () => {
        const settings = createDefaultTranscendBuildSettings(1101)
        settings.main.baseName = "残光"
        return settings
    }
    /** 主控伤害 */
    const damageOf = (settings: TranscendBuildSettings) => createTranscendBuild(settings, "main")!.build.calculate()

    it("归一化：钳制等级 / 覆盖率，潜质 4 槽去重，自定义 BUFF 取有限值且同名后者覆盖", () => {
        const settings = normalizeTranscendBuildSettings({
            petId: 4013,
            petLevel: 9,
            petCoverage: 1.5,
            petAutoCoverage: false,
            traits: [
                [1010, 2],
                [1010, 3],
                [999999, 1],
                [1011, 1],
                [1012, 1],
                [1013, 1],
            ],
            customBuff: [
                ["攻击", 0.2],
                ["攻击", 0.3],
                ["", 1],
                ["生命", Number.NaN],
            ],
        })
        expect(settings.petId).toBe(4013)
        expect(settings.petLevel).toBe(3)
        expect(settings.petCoverage).toBe(1)
        expect(settings.petAutoCoverage).toBe(false)
        expect(settings.traits).toEqual([
            [1010, 2],
            [1011, 1],
            [1012, 1],
            [1013, 1],
        ])
        expect(settings.customBuff).toEqual([["攻击", 0.3]])
        expect(createDefaultTranscendBuildSettings(1101)).toMatchObject({
            petId: 0,
            petLevel: 3,
            petCoverage: 1,
            petAutoCoverage: true,
            traits: [null, null, null, null],
            customBuff: [],
        })
    })

    it("旧存档迁移：BUFF 列表里的潜质 / 魔灵搬进 joint 字段并从列表移除", () => {
        const settings = normalizeTranscendBuildSettings({
            main: { charId: 1101 },
            buffs: [
                ["魔灵潜质:凶猛", 2],
                ["闪亮雨衣水滴", 3],
                ["闪亮雨衣水滴(主动)", 3, 0.5],
                ["助战50攻", 1],
            ],
        })
        expect(settings.traits).toContainEqual([1010, 2])
        expect(settings.petId).toBe(4023)
        expect(settings.petLevel).toBe(3)
        expect(settings.petCoverage).toBe(0.5)
        expect(settings.buffs).toEqual([["助战50攻", 1]])
    })

    it("序列化 / 分享往返保留 joint 字段", () => {
        const settings = baseSettings()
        settings.petId = 4013
        settings.petLevel = 2
        settings.petCoverage = 0.4
        settings.petAutoCoverage = false
        settings.traits = [[1010, 2], [1011, 1], null, null]
        settings.customBuff = [["攻击", 0.15]]
        settings.buffs = [["自定义BUFF", 1]]

        const restored = normalizeTranscendBuildSettings(JSON.parse(serializeTranscendBuildSettings(settings)), undefined, {
            preserveUnknownIds: true,
        })
        expect(restored.petId).toBe(4013)
        expect(restored.petLevel).toBe(2)
        expect(restored.petCoverage).toBe(0.4)
        expect(restored.petAutoCoverage).toBe(false)
        expect(restored.traits).toEqual([[1010, 2], [1011, 1], null, null])
        expect(restored.customBuff).toEqual([["攻击", 0.15]])

        const parsed = parseTranscendBuildShare(createTranscendBuildShare(settings))!
        expect(parsed.charId).toBe(1101)
        expect(parsed.settings).toMatchObject({
            petId: 4013,
            petLevel: 2,
            petCoverage: 0.4,
            petAutoCoverage: false,
            traits: [[1010, 2], [1011, 1], null, null],
            customBuff: [["攻击", 0.15]],
        })
        // 分享页复现作者伤害：往返后的设置与原始设置计算一致
        expect(damageOf(parsed.settings)).toBeCloseTo(damageOf(settings), 9)
    })

    it("魔灵 / 潜质 / 自定义 BUFF 参与伤害计算，魔灵 CD 进入角色属性", () => {
        const base = damageOf(baseSettings())
        const withTrait = baseSettings()
        withTrait.traits = [[1010, 3], null, null, null]
        expect(damageOf(withTrait)).toBeGreaterThan(base)

        const withCustom = baseSettings()
        withCustom.customBuff = [["攻击", 0.2]]
        withCustom.buffs = [["自定义BUFF", 1]]
        expect(damageOf(withCustom)).toBeGreaterThan(base)

        const withPet = baseSettings()
        withPet.petId = 4023
        withPet.petLevel = 3
        const petBuild = createTranscendBuild(withPet, "main")!.build
        expect(petBuild.petBaseCd).toBe(20)
        expect(petBuild.calculateAttributes().魔灵CD).toBeCloseTo(20, 6)
        expect(damageOf(withPet)).not.toBe(base)
    })
})

describe("天赋默认全开", () => {
    it("createMaxedTranscendTalentLevels 为每个节点取 maxLevel", () => {
        const levels = createMaxedTranscendTalentLevels()
        expect(levels).toHaveLength(talents.length)
        for (const [id, level] of levels) {
            const talent = talents.find(item => item.id === id)!
            expect(level).toBe(Math.max(1, Math.round(talent.maxLevel || 1)))
        }
    })

    it("支持注入数据源（安全模式空表返回空列表）", () => {
        expect(createMaxedTranscendTalentLevels([])).toEqual([])
        expect(createMaxedTranscendTalentLevels([{ id: 1, maxLevel: 5 }])).toEqual([[1, 5]])
    })
})

describe("天赋阶段可达性", () => {
    it("可达口径只包含当前开放阶段（阶段一 100 节点）", () => {
        const levels = createMaxedReachableTalentLevels()
        expect(levels).toHaveLength(100)
        const stageIds = new Set(levels.map(([id]) => talents.find(talent => talent.id === id)!.stageId))
        expect(stageIds).toEqual(new Set(stages.map(stage => stage.id)))
    })

    it("理论口径仍包含全部 300 节点", () => {
        expect(talents).toHaveLength(300)
        expect(createMaxedTranscendTalentLevels()).toHaveLength(300)
    })

    it("阶段集合变化时按 stages 过滤，未知阶段一律排除", () => {
        const dataset = [
            { id: 1, stageId: 1, maxLevel: 2 },
            { id: 2, stageId: 2, maxLevel: 3 },
            { id: 3, maxLevel: 1 },
        ]
        expect(createMaxedReachableTalentLevels(dataset, [{ id: 1 }, { id: 2 }])).toEqual([
            [1, 2],
            [2, 3],
        ])
        expect(createMaxedReachableTalentLevels(dataset, [])).toEqual([])
    })

    it("上一阶段仍有未激活节点 → unreachable；全部激活后无警告", () => {
        const dataset = [
            { id: 1, stageId: 1, maxLevel: 1 },
            { id: 2, stageId: 1, maxLevel: 1 },
            { id: 3, stageId: 2, maxLevel: 1 },
        ]
        const stageDataset = [{ id: 1 }, { id: 2 }]
        expect(
            getTalentStageWarnings(
                [
                    [1, 1],
                    [3, 1],
                ],
                dataset,
                stageDataset
            )
        ).toEqual([{ stageId: 2, reason: "unreachable" }])
        expect(
            getTalentStageWarnings(
                [
                    [1, 1],
                    [2, 1],
                    [3, 1],
                ],
                dataset,
                stageDataset
            )
        ).toEqual([])
        expect(getTalentStageWarnings([[1, 1]], dataset, stageDataset)).toEqual([])
    })

    it("未开放阶段已投入 → unreleased；上一阶段无节点头也判 unreachable", () => {
        const dataset = [
            { id: 1, stageId: 1, maxLevel: 1 },
            { id: 3, stageId: 3, maxLevel: 1 },
        ]
        expect(getTalentStageWarnings([[3, 1]], dataset, [{ id: 1 }])).toEqual([
            { stageId: 3, reason: "unreleased" },
            { stageId: 3, reason: "unreachable" },
        ])
        expect(getTalentStageWarnings(createMaxedReachableTalentLevels())).toEqual([])
        expect(getTalentStageWarnings(createMaxedTranscendTalentLevels())).toEqual([
            { stageId: 2, reason: "unreleased" },
            { stageId: 3, reason: "unreleased" },
        ])
    })

    it("边界：level 0 / 负数视为未激活，未知节点忽略，当前阶段无节点不报错", () => {
        const dataset = [
            { id: 1, stageId: 1, maxLevel: 2 },
            { id: 2, stageId: 1, maxLevel: 2 },
            { id: 3, stageId: 2, maxLevel: 2 },
        ]
        const stageDataset = [{ id: 1 }, { id: 2 }]
        expect(
            getTalentStageWarnings(
                [
                    [1, 0],
                    [2, -3],
                    [3, 1],
                ],
                dataset,
                stageDataset
            )
        ).toEqual([{ stageId: 2, reason: "unreachable" }])
        // 未知 talent id 与未知阶段不会凭空产生警告
        expect(getTalentStageWarnings([[999, 5]], dataset, stageDataset)).toEqual([])
        // 当前阶段（阶段二）在数据集中没有节点：只投入阶段一时无警告
        expect(
            getTalentStageWarnings(
                [
                    [1, 1],
                    [2, 1],
                ],
                [
                    { id: 1, stageId: 1, maxLevel: 1 },
                    { id: 2, stageId: 1, maxLevel: 1 },
                ],
                stageDataset
            )
        ).toEqual([])
    })

    it("上一阶段在数据集中完全没有节点 → 该阶段判 unreachable（不按空列表 = 全部激活）", () => {
        const dataset = [
            { id: 1, stageId: 1, maxLevel: 1 },
            { id: 3, stageId: 3, maxLevel: 1 },
        ]
        // 阶段集合完整（3 已开放），仅阶段二节点缺失：只剩 unreachable
        expect(getTalentStageWarnings([[3, 1]], dataset, [{ id: 1 }, { id: 2 }, { id: 3 }])).toEqual([
            { stageId: 3, reason: "unreachable" },
        ])
        // 阶段一在数据集中没有节点：已投入的阶段二判不可达
        expect(
            getTalentStageWarnings(
                [[2, 1]],
                [
                    { id: 2, stageId: 2, maxLevel: 1 },
                    { id: 3, stageId: 3, maxLevel: 1 },
                ],
                [{ id: 1 }, { id: 2 }, { id: 3 }]
            )
        ).toEqual([{ stageId: 2, reason: "unreachable" }])
        // 中间阶段全部激活后不再误报
        expect(
            getTalentStageWarnings(
                [
                    [1, 1],
                    [2, 1],
                    [3, 1],
                ],
                [
                    { id: 1, stageId: 1, maxLevel: 1 },
                    { id: 2, stageId: 2, maxLevel: 1 },
                    { id: 3, stageId: 3, maxLevel: 1 },
                ],
                [{ id: 1 }, { id: 2 }, { id: 3 }]
            )
        ).toEqual([])
    })

    it("未开放阶段且上一阶段未满时两类警告同时命中", () => {
        const dataset = [
            { id: 1, stageId: 1, maxLevel: 1 },
            { id: 2, stageId: 1, maxLevel: 1 },
            { id: 3, stageId: 2, maxLevel: 1 },
        ]
        expect(
            getTalentStageWarnings(
                [
                    [1, 1],
                    [3, 1],
                ],
                dataset,
                [{ id: 1 }]
            )
        ).toEqual([
            { stageId: 2, reason: "unreleased" },
            { stageId: 2, reason: "unreachable" },
        ])
    })

    it("默认可达构筑与手动只点阶段一完全一致，理论口径会高估", () => {
        const reachable = createMaxedReachableTalentLevels()
        const manualStage1 = talents
            .filter(talent => talent.stageId === 1)
            .map(talent => [talent.id, Math.max(1, Math.round(talent.maxLevel || 1))] as [number, number])
        expect(reachable).toEqual(manualStage1)

        const calculate = (levels: [number, number][]) => {
            const settings = createDefaultTranscendBuildSettings(1101)
            settings.main.baseName = charMap.get(1101)?.技能[0].名称 ?? ""
            settings.transcend.enabled = true
            settings.transcend.talentLevels = levels
            return createTranscendBuild(settings, "main")!.build.calculate()
        }
        const reachableDamage = calculate(reachable)
        expect(calculate(manualStage1)).toBeCloseTo(reachableDamage, 9)
        expect(calculate(createMaxedTranscendTalentLevels())).toBeGreaterThan(reachableDamage)
    })
})

describe("分享 JSON", () => {
    it("导出带类型标记，导入可完整还原（含 buffs / 天赋 / 装备）", () => {
        const settings = createDefaultTranscendBuildSettings(1101)
        settings.main.baseName = "残光"
        settings.buffs = [["助战50攻", 2, 0.5]]
        settings.transcend.enabled = true
        settings.transcend.talentLevels = [[100010, 3]]
        const text = createTranscendBuildShare(settings)
        const payload = JSON.parse(text)
        expect(payload.kind).toBe(TRANSCEND_BUILD_SHARE_KIND)
        expect(payload.charId).toBe(1101)
        const parsed = parseTranscendBuildShare(text)!
        expect(parsed.charId).toBe(1101)
        expect(parsed.settings.buffs).toEqual([["助战50攻", 2, 0.5]])
        expect(parsed.settings.transcend.talentLevels).toEqual([[100010, 3]])
        expect(serializeTranscendBuildSettings(parsed.settings)).toBe(serializeTranscendBuildSettings(settings))
    })

    it("v1 分享 JSON 导入时自动迁移为物品", () => {
        const v1 = {
            main: { charId: 1101 },
            transcend: {
                enabled: true,
                talentLevels: [],
                mainGear: [{ slotId: 3, affixId: 101, rollLevel: 5, masterworkLevel: 0, ancient: false, finalMasterwork: false }],
                assistGear: [],
            },
        }
        const parsed = parseTranscendBuildShare(JSON.stringify({ kind: TRANSCEND_BUILD_SHARE_KIND, settings: v1 }))!
        const equipped = parsed.settings.transcend.mainGear[0] as TranscendEquippedGear
        expect(equipped.slotId).toBe(3)
        expect(equipped.item.slotType).toBe(3)
        expect(equipped.item.affixes[0].affixId).toBe(101)
    })

    it("兼容裸构筑设置；非法内容返回 null", () => {
        const raw = createDefaultTranscendBuildSettings(1101)
        expect(parseTranscendBuildShare(JSON.stringify(raw))?.settings.main.charId).toBe(1101)
        expect(parseTranscendBuildShare("null")).toBeNull()
        expect(parseTranscendBuildShare("{}")).toBeNull()
        expect(parseTranscendBuildShare("not json")).toBeNull()
        expect(parseTranscendBuildShare("")).toBeNull()
        expect(parseTranscendBuildShare(JSON.stringify({ kind: TRANSCEND_BUILD_SHARE_KIND, settings: 42 }))).toBeNull()
    })

    it("导入保留数据表里不存在的 id（跨版本 / 安全模式）", () => {
        const settings = createDefaultTranscendBuildSettings(1101)
        settings.main.charId = 999999
        settings.main.meleeWeapon = 888888
        const parsed = parseTranscendBuildShare(createTranscendBuildShare(settings))!
        expect(parsed.settings.main.charId).toBe(999999)
        expect(parsed.settings.main.meleeWeapon).toBe(888888)
    })
})

describe("溯源关闭列表（U113）", () => {
    const FEINA_ID = 1801

    it("归一化：旧字段迁移为关闭列表并同步溯级", () => {
        const settings = normalizeTranscendBuildSettings({
            main: { charId: FEINA_ID, traceLevel: 4 },
            assist1: { charId: FEINA_ID, traceOffRoots: [1] },
        })
        expect(settings.main.traceOffRoots).toEqual([5, 6])
        expect(settings.main.traceLevel).toBe(4)
        expect(settings.assist1.traceOffRoots).toEqual([1])
        expect(settings.assist1.traceLevel).toBe(6)
    })

    it("紧凑序列化往返携带关闭列表", () => {
        const settings = normalizeTranscendBuildSettings({
            main: { charId: FEINA_ID, traceOffRoots: [2] },
            assist1: { charId: FEINA_ID, traceOffRoots: [1] },
        })
        const serialized = JSON.parse(serializeTranscendBuildSettings(settings))
        expect(serialized.main.traceOffRoots).toEqual([2])
        expect(serialized.assist1.traceOffRoots).toEqual([1])
        const restored = normalizeTranscendBuildSettings(serialized)
        expect(restored.main.traceOffRoots).toEqual([2])
        expect(restored.assist1.traceOffRoots).toEqual([1])
    })

    it("未归一化设置直接构建：关闭列表生效（sanitizeSideLoadout 口径）", () => {
        const raw = createDefaultTranscendBuildSettings(FEINA_ID)
        raw.buffs = [["菲娜Q", 10]]
        const open = createTranscendBuild(raw, "main")!
        expect(open.build.buffs.some(buff => buff.名称 === "菲娜1溯")).toBe(true)
        const closed = createTranscendBuild({ ...raw, main: { ...raw.main, traceOffRoots: [1] } }, "main")!
        expect(closed.build.buffs.some(buff => buff.名称 === "菲娜1溯")).toBe(false)
    })
})
