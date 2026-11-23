import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it, vi } from "vitest"
import { affixes, talents, uniqueEquips } from "../d"
import type { DnaSeasonAffix } from "../d/dnaseasonequip.data"
import type { DnaSeasonTalent } from "../d/dnaseasonprogress.data"
import { resetAdditionalDamageWarnings } from "../leveled/additionalDamage"
import {
    addTranscendSkillLevels,
    collectTranscendEffects,
    getAffixSlotTypes,
    getTranscendSlotType,
    isAffixCompatibleWithSlot,
    mapTranscendAttr,
    resetRateZoneWarnings,
    resolveAffixValue,
    resolveGearEffects,
    resolveSignedValue,
    resolveTalentEffects,
    type TranscendAttrMapping,
    type TranscendAttrMeta,
    type TranscendResolveOptions,
} from "../transcend"
import { TRANSCEND_BUFF_MAP, TRANSCEND_BUFFS, TRANSEND_BUFFS, UNIQUE_AFFIX_MAP } from "../transcendBuffs"
import {
    createDefaultTranscendSettings,
    getTranscendGearGroupKey,
    getTranscendGearGroupKeyOfSlot,
    normalizeTranscendSettings,
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

/** 唯一装槽型 → 装备位（1-7 与主控同号；8-11 对应协战一装备位 9-12） */
const slotIdOfType = (slotType: number) => (slotType <= 7 ? slotType : slotType + 1)

describe("升华槽位口径", () => {
    it("装备位 1-8 主控、9-12 协战一、13-16 协战二（一人一套）", () => {
        expect(getTranscendGearGroupKeyOfSlot(1)).toBe("main")
        expect(getTranscendGearGroupKeyOfSlot(8)).toBe("main")
        expect(getTranscendGearGroupKeyOfSlot(9)).toBe("assist1")
        expect(getTranscendGearGroupKeyOfSlot(12)).toBe("assist1")
        expect(getTranscendGearGroupKeyOfSlot(13)).toBe("assist2")
        expect(getTranscendGearGroupKeyOfSlot(16)).toBe("assist2")
        expect(getTranscendGearGroupKeyOfSlot(0)).toBeNull()
        expect(getTranscendGearGroupKeyOfSlot(17)).toBeNull()
        expect(getTranscendGearGroupKey("assist1")).toBe("assist1")
        expect(getTranscendGearGroupKey("assist2")).toBe("assist2")
        expect(getTranscendGearGroupKey("main")).toBe("main")
    })

    it("装备位映射到槽型：8 号位复用戒指，协战两组复用槽型 8-11", () => {
        expect(getTranscendSlotType(7)).toBe(7)
        expect(getTranscendSlotType(8)).toBe(7)
        expect([9, 10, 11, 12].map(getTranscendSlotType)).toEqual([8, 9, 10, 11])
        expect([13, 14, 15, 16].map(getTranscendSlotType)).toEqual([8, 9, 10, 11])
    })

    it("词缀兼容性按槽型判断：基础词条 101 只能进手套（装备位 3）", () => {
        expect(getAffixSlotTypes(101)).toEqual([3])
        expect(isAffixCompatibleWithSlot(101, 3)).toBe(true)
        expect(isAffixCompatibleWithSlot(101, 1)).toBe(false)
        // 1.8.7.1 上游删除了 1510/1511/1512 的 AffixPoolId（客户端无随机词条池字段），
        // 导入期给技能等级词条派生「技能类型 × 家族」部位映射（FEEDBACK §138 补正）：
        // 战技 = 手套(3)/护符(8)，终结技 = 耳环(5)/印章(9)，被动 = 项链(6)/典籍(10)
        expect(affixes.find(item => item.id === 1038)?.slotTypes).toEqual([3])
        expect(affixes.find(item => item.id === 1039)?.slotTypes).toEqual([5])
        expect(affixes.find(item => item.id === 1040)?.slotTypes).toEqual([6])
        expect(affixes.find(item => item.id === 1510)?.slotTypes).toEqual([8])
        expect(affixes.find(item => item.id === 1511)?.slotTypes).toEqual([9])
        expect(affixes.find(item => item.id === 1512)?.slotTypes).toEqual([10])
        expect(getAffixSlotTypes(1511)).toEqual([9])
        // 装备位 1-8 为主控（8 号位复用戒指），协战 9-12 / 13-16 映射槽型 8-11
        expect(isAffixCompatibleWithSlot(1510, 9)).toBe(true)
        expect(isAffixCompatibleWithSlot(1512, 11)).toBe(true)
        expect(isAffixCompatibleWithSlot(1511, 10)).toBe(true)
        expect(isAffixCompatibleWithSlot(1040, 6)).toBe(true)
        expect(isAffixCompatibleWithSlot(1038, 3)).toBe(true)
        expect(isAffixCompatibleWithSlot(1039, 5)).toBe(true)
        expect(isAffixCompatibleWithSlot(1510, 3)).toBe(false)
        expect(isAffixCompatibleWithSlot(1512, 6)).toBe(false)
        expect(isAffixCompatibleWithSlot(1511, 9)).toBe(false)
        expect(isAffixCompatibleWithSlot(1039, 3)).toBe(false)
        // 槽型 11（纹饰）与 1/2/4/7 无技能等级词条：六条词条逐条不越界
        const skillAffixSlots: Record<number, number> = { 1038: 3, 1039: 5, 1040: 6, 1510: 8, 1511: 9, 1512: 10 }
        for (const [id, expected] of Object.entries(skillAffixSlots)) {
            const slots = affixes.find(item => item.id === Number(id))!.slotTypes!
            expect(slots).toEqual([expected])
            for (const absent of [1, 2, 4, 7, 11]) {
                expect(slots).not.toContain(absent)
            }
        }
        // 协战池 211 的其余词条仍只进槽型 8-11（1514 神智回复）
        expect(getAffixSlotTypes(1514)).toEqual([8, 9, 10, 11])
        expect(isAffixCompatibleWithSlot(1514, 9)).toBe(true)
        expect(isAffixCompatibleWithSlot(1514, 3)).toBe(false)
    })

    it("不能装备到槽型的词条被丢弃并给出警告", () => {
        const result = resolveGearEffects([gear({ slotId: 1, affixId: 101 })], "main")
        expect(result.entries).toHaveLength(0)
        expect(result.warnings.join()).toContain("不能装备在装备位 1")
    })
})

describe("R7 算例：词条数值公式", () => {
    it("算例 1：词缀 101 ATK，roll 25 + 精造 10 → 攻击 +193.6387%", () => {
        const result = resolveGearEffects([gear({ slotId: 3, affixId: 101, rollLevel: 25, masterworkLevel: 10 })], "main")
        expect(result.attrs.攻击).toBeCloseTo(1.9363868055, 9)
        expect(result.buffs.map(item => item.buff.名称)).toEqual(["升华装备·手套·攻击"])
        expect(result.buffs[0]).toMatchObject({ id: 101, buff: { id: 101, source: { kind: "gear", id: 101, slotId: 3 } } })
    })

    it("算例 2：词缀 1023 DamageRate，太古 + 精造 5 + 最终 → 增伤 +55.9650%", () => {
        const result = resolveGearEffects(
            [gear({ slotId: 3, affixId: 1023, rollLevel: 1, masterworkLevel: 5, ancient: true, finalMasterwork: true })],
            "main"
        )
        expect(result.attrs.增伤).toBeCloseTo(0.5596502396, 9)
    })

    it("算例 3：词缀 1510 技能等级，太古 + 精造 10 + 最终 → 8 级，基础 10 级叠到 18", () => {
        const result = resolveGearEffects(
            [gear({ slotId: 9, affixId: 1510, rollLevel: 1, masterworkLevel: 10, ancient: true, finalMasterwork: true })],
            "assist1"
        )
        expect(result.attrs.E技能等级).toBe(8)
        expect(result.buffs.map(item => item.buff.名称)).toEqual(["升华装备·护符·技能等级"])
        expect(addTranscendSkillLevels([10, 10, 10], [result.attrs.E技能等级, 0, 0])).toEqual([18, 10, 10])
    })

    it("算例 3b：1511 终结技技能等级太古满档在装备位 10（印章）→ 7 级（5 + 太古 2）", () => {
        const result = resolveGearEffects([gear({ slotId: 10, affixId: 1511, rollLevel: 5, ancient: true })], "assist1")
        expect(result.attrs.Q技能等级).toBe(7)
        expect(result.warnings).toEqual([])
    })

    it("算例 4：太古 1043 原始值（MaxValue×1.2；普通精锻照常作用；最终精锻循环后 ×1）", () => {
        const affix = affixes.find(item => item.id === 1043)!
        const resolve = (masterworkLevel: number, finalMasterwork: boolean) =>
            resolveAffixValue(affix, gear({ slotId: 2, affixId: 1043, rollLevel: 500, masterworkLevel, ancient: true, finalMasterwork }))
        // 上游 DNASeasonAffixValueUtils.CalcValue 的未取整 double（RESEARCH-U92-ANCIENT Worked Example）
        expect(resolve(0, false).final).toBeCloseTo(0.84996, 9)
        expect(resolve(2, false).final).toBeCloseTo(0.867044196, 9)
        expect(resolve(10, false).final).toBeCloseTo(0.938884622, 9)
        expect(resolve(0, true).final).toBeCloseTo(0.934956, 9)
        expect(resolve(2, true).final).toBeCloseTo(0.953748616, 9)
        expect(resolve(10, true).final).toBeCloseTo(1.032773084, 9)
        // RollLevel 不参与太古基数（上游 :50-60），逐段结果同口径
        const low = resolveAffixValue(affix, gear({ slotId: 2, affixId: 1043, rollLevel: 1, ancient: true }))
        expect(low.rolled).toBeCloseTo(0.2476, 9)
        expect(low.afterAncient).toBeCloseTo(0.84996, 9)
        expect(low.afterMasterwork).toBeCloseTo(0.84996, 9)
        expect(low.final).toBeCloseTo(0.84996, 9)
    })

    it("边界：roll=1 / roll=total / roll>total / total==1 / min==max", () => {
        const affix101 = affixes.find(item => item.id === 101)!
        const value = (rollLevel: number) => resolveAffixValue(affix101, gear({ slotId: 3, affixId: 101, rollLevel })).final
        expect(value(1)).toBeCloseTo(0.9171, 9)
        expect(value(50)).toBeCloseTo(2.6237, 9)
        expect(value(999)).toBeCloseTo(2.6237, 9)

        // 固定值词条（Plan 4 镶嵌，totalValueLevel = 1 且 min == max）
        const affix3102 = affixes.find(item => item.id === 3102)!
        expect(resolveAffixValue(affix3102, gear({ slotId: 2, affixId: 3102, rollLevel: 9 })).final).toBeCloseTo(0.12, 9)
    })

    it("边界：精造 0 次与 10 次、无太古/最终公式时按上游取值", () => {
        const affix101 = affixes.find(item => item.id === 101)!
        const none = resolveAffixValue(affix101, gear({ slotId: 3, affixId: 101, rollLevel: 50 }))
        const ten = resolveAffixValue(affix101, gear({ slotId: 3, affixId: 101, rollLevel: 50, masterworkLevel: 10 }))
        expect(none.final).toBeCloseTo(2.6237, 9)
        expect(ten.final).toBeCloseTo(2.6237 * 1.01 ** 10, 9)
        // 101 没有太古 / 最终精造公式：太古基数按上游取 MaxValue（不参与 RollLevel），最终精造仍不生效
        const ancient = resolveAffixValue(affix101, gear({ slotId: 3, affixId: 101, rollLevel: 25, ancient: true, finalMasterwork: true }))
        expect(ancient.afterAncient).toBeCloseTo(affix101.maxValue, 9)
        expect(ancient.final).toBeCloseTo(affix101.maxValue, 9)
        expect(ancient.final).not.toBeCloseTo(resolveAffixValue(affix101, gear({ slotId: 3, affixId: 101, rollLevel: 25 })).final, 9)
        // 普通精锻循环同样作用于太古；上游 Count = floor(MasterworkLevel)
        const refined = resolveAffixValue(affix101, gear({ slotId: 3, affixId: 101, rollLevel: 25, ancient: true, masterworkLevel: 2 }))
        expect(refined.final).toBeCloseTo(affix101.maxValue * 1.01 ** 2, 9)
        const floored = resolveAffixValue(affix101, gear({ slotId: 3, affixId: 101, rollLevel: 25, ancient: true, masterworkLevel: 2.9 }))
        expect(floored.masterworkLevel).toBe(2)
        expect(floored.final).toBeCloseTo(refined.final, 9)
    })

    it("负区间词条（106 受到伤害）取反为减伤", () => {
        const result = resolveGearEffects([gear({ slotId: 7, affixId: 106, rollLevel: 50 })], "main")
        expect(result.attrs.减伤).toBeCloseTo(0.4291, 9)
    })
})

describe("R7 算例：天赋取值", () => {
    it("100010 Lv30：近战暴击/暴伤 + 昂扬 + 技能威力 + 技能效益", () => {
        const result = resolveTalentEffects([[100010, 30]])
        expect(result.attrs.普通近战暴击).toBeCloseTo(1.5, 9)
        expect(result.attrs.普通近战暴伤).toBeCloseTo(1.65, 9)
        expect(result.attrs.昂扬).toBeCloseTo(0.27, 9)
        expect(result.attrs.技能威力).toBeCloseTo(0.6, 9)
        expect(result.attrs.技能效益).toBeCloseTo(0.55, 9)
        // 每个效果一条 BUFF：名称取官方效果名，attr 只含该效果，节点 id 进结构化字段
        expect(result.buffs).toHaveLength(5)
        expect(result.buffs.map(item => item.buff.名称)).toEqual([
            "升华天赋·普通近战暴击",
            "升华天赋·普通近战暴伤",
            "升华天赋·昂扬",
            "升华天赋·技能威力",
            "升华天赋·技能效益",
        ])
        expect(result.buffs.every(item => item.id === 100010 && item.buff.id === 100010)).toBe(true)
        expect(result.buffs.every(item => item.buff.source?.kind === "talent" && item.buff.source.effectIndex !== undefined)).toBe(true)
        expect(Object.keys(result.buffs[0].buff.attr ?? {})).toEqual(["普通近战暴击"])
        expect(result.buffs[3].buff.attr).toEqual({ 技能威力: 0.6 })
        expect(result.buffs.every(item => !item.buff.名称.includes("#"))).toBe(true)
    })

    it("100010 Lv27：unlockLevel 30 的技能效益不计入", () => {
        const result = resolveTalentEffects([[100010, 27]])
        expect(result.attrs.普通近战暴击).toBeCloseTo(1.35, 9)
        expect(result.attrs.技能威力).toBeCloseTo(0.6, 9)
        expect(result.attrs.技能效益).toBeUndefined()
    })

    it("天赋等级 0 或未知节点不产出效果", () => {
        expect(resolveTalentEffects([[100010, 0]]).buffs).toHaveLength(0)
        expect(resolveTalentEffects([[999999, 10]]).buffs).toHaveLength(0)
    })
})

/** 58 个规范属性名（U14 上游导出口径；U70 追伤拆为六元素分量；与生成数据集合必须相等） */
const CANONICAL_ATTR_NAMES = [
    "充盈威力",
    "光属性攻击",
    "光属性增伤",
    "减伤",
    "召唤物伤害",
    "同律近战攻击",
    "同律近战暴伤",
    "同律近战暴击",
    "同律近战触发",
    "同律远程攻击",
    "同律远程暴伤",
    "同律远程暴击",
    "同律远程触发",
    "增伤",
    "属性穿透",
    "技能伤害",
    "技能威力",
    "技能效益",
    "技能耐久",
    "技能范围",
    "护盾",
    "攻击",
    "昂扬",
    "普通近战攻击",
    "普通近战暴伤",
    "普通近战暴击",
    "普通近战触发",
    "普通远程攻击",
    "普通远程暴伤",
    "普通远程暴击",
    "普通远程触发",
    "暗属性攻击",
    "暗属性增伤",
    "水属性攻击",
    "水属性增伤",
    "火属性攻击",
    "火属性增伤",
    "生命",
    "生命回复",
    "生命恢复增幅",
    "神智",
    "神智回复",
    "移动速度",
    "背水",
    "赛季增伤",
    "近战增伤",
    "远程增伤",
    "火属性追伤",
    "水属性追伤",
    "雷属性追伤",
    "风属性追伤",
    "光属性追伤",
    "暗属性追伤",
    "防御",
    "雷属性攻击",
    "雷属性增伤",
    "风属性攻击",
    "风属性增伤",
] as const

/** 六种元素：英文枚举 ↔ 中文名 */
const ELEMENT_PAIRS: Array<[string, string]> = [
    ["Water", "水"],
    ["Fire", "火"],
    ["Wind", "风"],
    ["Thunder", "雷"],
    ["Light", "光"],
    ["Dark", "暗"],
]

/**
 * U14 前旧快照的 raw 引擎名（只看 attr 本身），必须全部仍可映射。
 * 期望只写关键字段，其余字段由 `toMatchObject` 放宽。
 */
const LEGACY_ATTR_CASES: Array<[string, Partial<TranscendAttrMapping>]> = [
    ["ATK", { key: "攻击", status: "exact" }],
    ["DEF", { key: "防御", status: "exact" }],
    ["MaxHp", { key: "生命", status: "exact" }],
    ["MaxES", { key: "护盾", status: "exact" }],
    ["MaxSp", { key: "神智", status: "exact" }],
    ["SkillIntensity", { key: "技能威力", status: "exact" }],
    ["SkillEfficiency", { key: "技能效益", status: "exact" }],
    ["SkillSustain", { key: "技能耐久", status: "exact" }],
    ["SkillRange", { key: "技能范围", status: "exact" }],
    ["StrongValue", { key: "昂扬", status: "exact" }],
    ["EnmityValue", { key: "背水", status: "exact" }],
    ["HyperTriggerRate", { key: "充盈威力", status: "exact" }],
    ["SpRecoverValue", { key: "神智回复", status: "exact" }],
    ["WalkSpeedModifier", { key: "移动速度", status: "handwritten" }],
    ["HpRecoverValue", { key: "生命回复", status: "handwritten" }],
    ["HpRecoverValueModifierRate", { key: "生命恢复增幅", status: "handwritten" }],
    ["DamagedRate", { key: "减伤", status: "exact", negate: true }],
    ["DamageRate", { key: "增伤", status: "exact" }],
    ["DamageRate_Melee_Normal", { key: "近战增伤", status: "exact" }],
    ["DamageRate_Ranged_Normal", { key: "远程增伤", status: "exact" }],
    ["DamageRate_Skill_Normal", { key: "技能伤害", status: "exact" }],
    ["DamageRate_Summon_Normal", { key: "召唤物伤害", status: "exact" }],
    ["DamageRate_Almighty", { key: "属性穿透", status: "exact" }],
    ["DamageRate_NoTag_S0DamageRate", { key: "赛季增伤", status: "exact" }],
    ...ELEMENT_PAIRS.map(
        ([english, element]) =>
            [`ATK_${english}`, { key: `${element}属性攻击`, status: "exact", element }] as [string, Partial<TranscendAttrMapping>]
    ),
    ...ELEMENT_PAIRS.map(
        ([english, element]) =>
            [
                `${english}DamageRate`,
                {
                    key: "元素增伤",
                    status: "handwritten",
                    partial: true,
                    element,
                    note: `${element}属性伤害率按元素增伤计入`,
                },
            ] as [string, Partial<TranscendAttrMapping>]
    ),
    ...ELEMENT_PAIRS.map(
        ([english, element]) =>
            [`BonusDamage_${english}`, { key: `${element}属性追伤`, status: "exact", element }] as [string, Partial<TranscendAttrMapping>]
    ),
]

describe("规范属性名（U14 上游导出）", () => {
    const ELEMENTS: Array<[string, string]> = [
        ["Water", "水"],
        ["Fire", "火"],
        ["Wind", "风"],
        ["Thunder", "雷"],
        ["Light", "光"],
        ["Dark", "暗"],
    ]

    it("canonical 与 legacy 输入落到同一属性键", () => {
        const cases: Array<[string, string]> = [
            ["ATK", "攻击"],
            ["MaxHp", "生命"],
            ["MaxSp", "神智"],
            ["SpRecoverValue", "神智回复"],
            ["HyperTriggerRate", "充盈威力"],
            ["DamageRate_Almighty", "属性穿透"],
            ["DamageRate_Skill_Normal", "技能伤害"],
        ]
        for (const [attr, key] of cases) {
            expect(mapTranscendAttr(attr)).toEqual({ key, status: "exact" })
            expect(mapTranscendAttr(key)).toEqual({ key, status: "exact" })
        }
    })

    it("四类武器作用域规范名直接透传", () => {
        for (const prefix of ["普通近战", "普通远程", "同律近战", "同律远程"]) {
            for (const suffix of ["攻击", "暴击", "暴伤", "触发"]) {
                const key = `${prefix}${suffix}`
                expect(mapTranscendAttr(key)).toEqual({ key, status: "exact" })
            }
        }
    })

    it("元素攻击规范名恢复元素限定", () => {
        for (const [english, element] of ELEMENTS) {
            expect(mapTranscendAttr(`${element}属性攻击`)).toEqual({
                key: `${element}属性攻击`,
                status: "exact",
                element,
            })
            expect(mapTranscendAttr(`ATK_${english}`).element).toBe(element)
        }
    })

    it("元素增伤按 element 字段恢复元素限定（六种元素）", () => {
        for (const [english, element] of ELEMENTS) {
            expect(mapTranscendAttr("元素增伤", { element: english })).toEqual({
                key: "元素增伤",
                status: "handwritten",
                partial: true,
                element,
                note: `${element}属性伤害率按元素增伤计入`,
            })
            // 旧数据：元素写在 raw attr 里
            expect(mapTranscendAttr(`${english}DamageRate`).element).toBe(element)
        }
    })

    it("追加伤害按 type 恢复元素分量（六种元素）", () => {
        for (const [english, element] of ELEMENTS) {
            expect(mapTranscendAttr("追加伤害", { type: english })).toEqual({
                key: `${element}属性追伤`,
                status: "handwritten",
                partial: true,
                element,
                note: `${element}属性追伤按旧口径迁移计入`,
            })
            // 旧数据：元素写在 attr 后缀里
            expect(mapTranscendAttr(`BonusDamage_${english}`)).toEqual({
                key: `${element}属性追伤`,
                status: "exact",
                element,
            })
        }
    })

    it("追伤无元素信息时按自属性追伤兜底，不猜测元素", () => {
        expect(mapTranscendAttr("元素增伤").key).toBe("")
        expect(mapTranscendAttr("追加伤害")).toMatchObject({ key: "自属性追伤", status: "handwritten" })
        expect(mapTranscendAttr("BonusDamage")).toMatchObject({ key: "自属性追伤", status: "handwritten" })
    })

    it("非元素追伤后缀（Normal / Attack）按自属性追伤计入并告警", () => {
        resetAdditionalDamageWarnings()
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
        try {
            for (const attr of ["BonusDamage_Normal", "BonusDamage_Attack"]) {
                const mapping = mapTranscendAttr(attr)
                expect(mapping, attr).toMatchObject({ key: "自属性追伤", status: "handwritten" })
                expect(mapping.note, attr).toContain("非元素后缀")
            }
            expect(warn).toHaveBeenCalledWith(expect.stringContaining("BonusDamage_Normal"))
            expect(warn).toHaveBeenCalledWith(expect.stringContaining("自属性追伤"))
        } finally {
            warn.mockRestore()
        }
    })

    it("减伤规范名与旧名都保留取反语义", () => {
        const expected = { key: "减伤", status: "exact", negate: true }
        expect(mapTranscendAttr("减伤")).toEqual(expected)
        expect(mapTranscendAttr("DamagedRate")).toEqual(expected)
    })

    it("元素弱点：`<Element>DamagedRate` 精确映射为 `<元素>属性弱点`，裸 DamagedRate 仍为减伤（U95）", () => {
        for (const [english, element] of ELEMENTS) {
            expect(mapTranscendAttr(`${english}DamagedRate`)).toEqual({
                key: `${element}属性弱点`,
                status: "exact",
                element,
            })
            expect(mapTranscendAttr(`${element}属性弱点`)).toEqual({ key: `${element}属性弱点`, status: "exact" })
        }
        expect(mapTranscendAttr("全属性弱点")).toEqual({ key: "全属性弱点", status: "exact" })
        expect(mapTranscendAttr("DamagedRate")).toEqual({ key: "减伤", status: "exact", negate: true })
    })

    it("真实数据：元素增伤按元素过滤，元素追伤对任意角色元素都计入（§132）", () => {
        const damageBoost = resolveGearEffects([gear({ slotId: 1, affixId: 1032, rollLevel: 1 })], "main", { charElement: "水" })
        expect(damageBoost.attrs.水属性增伤).toBeCloseTo(0.05, 9)
        expect(damageBoost.attrs.元素增伤).toBeUndefined()
        expect(damageBoost.entries[0].status).toBe("exact")
        const otherElement = resolveGearEffects([gear({ slotId: 1, affixId: 1032, rollLevel: 1 })], "main", { charElement: "火" })
        expect(otherElement.attrs.水属性增伤).toBeUndefined()
        expect(otherElement.entries[0].status).toBe("handwritten")

        // 追伤是 otherMore 全局因子：光 / 火角色同样计入水属性追伤，并照常生成升华装备 BUFF
        expect(mapTranscendAttr("水属性追伤")).toEqual({ key: "水属性追伤", status: "exact" })
        for (const charElement of ["水", "火", "光"]) {
            const bonusDamage = resolveGearEffects([gear({ slotId: 1, affixId: 1024, rollLevel: 1 })], "main", { charElement })
            expect(bonusDamage.attrs.水属性追伤, charElement).toBeCloseTo(0.0834, 9)
            expect(bonusDamage.entries[0].status, charElement).toBe("exact")
            expect(bonusDamage.modelingNotes, charElement).toHaveLength(0)
            expect(
                bonusDamage.buffs.map(item => item.buff.名称),
                charElement
            ).toEqual(["升华装备·头盔·水属性追伤"])
            expect((bonusDamage.buffs[0].buff.attr as Record<string, number>).水属性追伤, charElement).toBeCloseTo(0.0834, 9)
        }
    })

    it("天赋元素追伤对任意角色元素都计入，元素攻击仍按角色元素过滤", () => {
        const chaseTalent: DnaSeasonTalent = {
            id: 990010,
            stageId: 2,
            kind: 1,
            maxLevel: 30,
            name: "测试水追伤",
            desc: "",
            icon: "",
            position: [0, 0],
            effects: [{ index: 0, attr: "水属性追伤", element: "Water", type: "Water", addType: "Value", base: 0.2, unlockLevel: 1 }],
        }
        const tables = { talents: [chaseTalent] }
        for (const charElement of ["水", "光", "火"]) {
            const result = resolveTalentEffects([[990010, 1]], { charElement, tables })
            expect(result.attrs.水属性追伤, charElement).toBeCloseTo(0.2, 9)
            expect(
                result.buffs.map(item => item.buff.名称),
                charElement
            ).toEqual(["升华天赋·水属性追伤"])
        }
        // 元素攻击仍只看角色元素
        expect(resolveGearEffects([gear({ slotId: 3, affixId: 3101 })], "main", { charElement: "水" }).attrs.火属性攻击).toBeUndefined()
    })

    it("真实数据：天赋 100210 Lv30 的风属性增伤只对风属性角色计入", () => {
        expect(resolveTalentEffects([[100210, 30]], { charElement: "风" }).attrs.风属性增伤).toBeCloseTo(0.1, 9)
        expect(resolveTalentEffects([[100210, 30]], { charElement: "水" }).attrs.风属性增伤).toBeUndefined()
    })

    it("58 个规范名全部可映射，且与生成数据的 attr 集合相等", () => {
        const elementLimited = new Set(["元素增伤"])
        const displayOnly = new Set(["生命回复", "生命恢复增幅", "移动速度"])
        for (const name of CANONICAL_ATTR_NAMES) {
            const meta = elementLimited.has(name) ? { element: "Fire" } : undefined
            const mapping = mapTranscendAttr(name, meta)
            expect(mapping.key, name).not.toBe("")
            expect(mapping.status, name).toBe(elementLimited.has(name) || displayOnly.has(name) ? "handwritten" : "exact")
        }
        const fromData = new Set(
            [...affixes.flatMap(affix => affix.addAttrs ?? []), ...talents.flatMap(talent => talent.effects)].map(attr => attr.attr)
        )
        expect(new Set(CANONICAL_ATTR_NAMES)).toEqual(fromData)
    })

    it("全部 legacy raw 名仍可映射（表驱动，含四类武器作用域）", () => {
        for (const [attr, expected] of LEGACY_ATTR_CASES) {
            expect(mapTranscendAttr(attr), attr).toMatchObject(expected)
        }
        for (const scope of ["CMelee", "CRanged", "UMelee", "URanged"]) {
            for (const [raw, suffix] of [
                ["WeaponATKModifierRate", "攻击"],
                ["WeaponCRIModifierRate", "暴击"],
                ["WeaponCRDModifierRate", "暴伤"],
                ["TriggerProbModifierRate", "触发"],
            ]) {
                const key = `${raw}_${scope}`
                const prefix = { CMelee: "普通近战", CRanged: "普通远程", UMelee: "同律近战", URanged: "同律远程" }[scope]
                expect(mapTranscendAttr(key), key).toEqual({ key: `${prefix}${suffix}`, status: "exact" })
            }
        }
    })

    it("canonical display-only 分支：只作展示的属性名", () => {
        for (const key of ["生命回复", "生命恢复增幅", "移动速度"]) {
            expect(mapTranscendAttr(key)).toEqual({ key, status: "handwritten", note: `${key}只作展示，不参与伤害计算` })
        }
    })

    it("元素恢复优先级：element → elementType → type", () => {
        const meta = (patch: TranscendAttrMeta) => ({ type: "Wind", ...patch })
        expect(mapTranscendAttr("元素增伤", meta({ element: "Water", elementType: "Fire", type: "Wind" })).element).toBe("水")
        expect(mapTranscendAttr("元素增伤", meta({ elementType: "Fire", type: "Wind" })).element).toBe("火")
        expect(mapTranscendAttr("元素增伤", meta({ type: "Thunder" })).element).toBe("雷")
        // 单来源：element / elementType / type 任一均可恢复
        expect(mapTranscendAttr("追加伤害", { element: "Dark" }).element).toBe("暗")
        expect(mapTranscendAttr("追加伤害", { elementType: "Light" }).element).toBe("光")
        expect(mapTranscendAttr("追加伤害", { type: "Wind" }).element).toBe("风")
        // 中文元素值也可直接使用
        expect(mapTranscendAttr("元素增伤", { element: "水" }).element).toBe("水")
        // 无法识别时不放大到全元素
        expect(mapTranscendAttr("元素增伤", { element: "Bogus" }).key).toBe("")
    })

    it("真实数据：六元素增伤词条（1032-1037）按独立元素键导出并过滤", () => {
        const cases: Array<[number, string, string]> = [
            [1032, "Water", "水"],
            [1033, "Fire", "火"],
            [1034, "Wind", "风"],
            [1035, "Thunder", "雷"],
            [1036, "Light", "光"],
            [1037, "Dark", "暗"],
        ]
        for (const [affixId, english, element] of cases) {
            const key = `${element}属性增伤`
            const attr = affixes.find(affix => affix.id === affixId)?.addAttrs?.[0]
            expect(attr, `${affixId}`).toMatchObject({ attr: key, element: english })
            const matched = resolveGearEffects([gear({ slotId: 1, affixId, rollLevel: 1 })], "main", { charElement: element })
            expect(matched.attrs[key], `${affixId}`).toBeCloseTo(0.05, 9)
            expect(matched.entries[0].status).toBe("exact")
            const other = resolveGearEffects([gear({ slotId: 1, affixId, rollLevel: 1 })], "main", {
                charElement: element === "火" ? "水" : "火",
            })
            expect(other.attrs[key], `${affixId}`).toBeUndefined()
        }
    })

    it("真实数据：六元素天赋增伤（100210/100230/100250/100280/100290/100300）", () => {
        const cases: Array<[number, string]> = [
            [100210, "风"],
            [100230, "火"],
            [100250, "暗"],
            [100280, "雷"],
            [100290, "水"],
            [100300, "光"],
        ]
        for (const [talentId, element] of cases) {
            const key = `${element}属性增伤`
            const matched = resolveTalentEffects([[talentId, 30]], { charElement: element })
            expect(matched.attrs[key], `${talentId}`).toBeCloseTo(0.1, 9)
            const other = resolveTalentEffects([[talentId, 30]], { charElement: element === "火" ? "水" : "火" })
            expect(other.attrs[key], `${talentId}`).toBeUndefined()
        }
    })

    it("元素专属伤害率按 exact 计入，不产生建模备注；旧 元素增伤 仍为 partial", () => {
        const cases: Array<[number, string]> = [
            [100210, "风"],
            [100230, "火"],
            [100250, "暗"],
            [100280, "雷"],
            [100290, "水"],
            [100300, "光"],
        ]
        for (const [talentId, element] of cases) {
            const result = resolveTalentEffects([[talentId, 30]], { charElement: element })
            expect(result.attrs[`${element}属性增伤`], `${talentId}`).toBeCloseTo(0.1, 9)
            expect(result.modelingNotes, `${talentId}`).toEqual([])
        }
        // 装备路径同口径：独立元素键 exact，无建模备注
        const gearResult = resolveGearEffects([gear({ slotId: 1, affixId: 1032, rollLevel: 1 })], "main", { charElement: "水" })
        expect(gearResult.attrs.水属性增伤).toBeCloseTo(0.05, 9)
        expect(gearResult.modelingNotes).toEqual([])
        // 旧折叠属性（元素增伤 + element）仍为 partial + note
        expect(mapTranscendAttr("元素增伤", { element: "水" })).toMatchObject({
            key: "元素增伤",
            status: "handwritten",
            partial: true,
            note: "水属性伤害率按元素增伤计入",
        })
        // 非 partial 的手写天赋只标 handwritten，不伪造 partial
        expect(resolveTalentEffects([[100010, 30]]).modelingNotes).toEqual([])
    })

    it("593 条生成属性全部映射到非空键", () => {
        const attrs = [...affixes.flatMap(affix => affix.addAttrs ?? []), ...talents.flatMap(talent => talent.effects)]
        expect(attrs).toHaveLength(593)
        for (const attr of attrs) {
            const mapping = mapTranscendAttr(attr.attr, attr)
            expect(mapping.key, attr.attr).not.toBe("")
        }
    })

    it("S0 伤害率映射到独立乘区 赛季增伤", () => {
        expect(mapTranscendAttr("增伤", { rateZone: "S0DamageRate" })).toEqual({ key: "赛季增伤", status: "exact" })
        // 旧 raw 键路径同口径
        expect(mapTranscendAttr("DamageRate_NoTag_S0DamageRate")).toEqual({ key: "赛季增伤", status: "exact" })
        // 上游导出的规范名本身即 赛季增伤
        expect(mapTranscendAttr("赛季增伤", { rateZone: "S0DamageRate" })).toEqual({ key: "赛季增伤", status: "exact" })
        // 无 rateZone 的 canonical 增伤仍为 exact
        expect(mapTranscendAttr("增伤")).toEqual({ key: "增伤", status: "exact" })
        // Almighty 分区归 属性穿透
        expect(mapTranscendAttr("属性穿透", { rateZone: "Almighty" })).toEqual({ key: "属性穿透", status: "exact" })
        // 真实词缀 1030
        const result = resolveGearEffects([gear({ slotId: 1, affixId: 1030, rollLevel: 1 })], "main")
        expect(result.entries[0].status).toBe("exact")
        expect(result.attrs.赛季增伤).toBeCloseTo(0.0625, 9)
        // 不再进普通增伤池
        expect(result.attrs.增伤).toBeUndefined()
        expect(result.modelingNotes).toEqual([])
    })

    it("未知 rateZone 告警并降级为手写 + 部分覆盖，不静默标精确", () => {
        resetRateZoneWarnings()
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
        try {
            const mapping = mapTranscendAttr("增伤", { rateZone: "BogusZone" })
            expect(mapping).toMatchObject({ key: "增伤", status: "handwritten", partial: true })
            expect(mapping.note).toContain("BogusZone")
            expect(warn).toHaveBeenCalledTimes(1)
            expect(String(warn.mock.calls[0][0])).toContain("BogusZone")
            // 同一分区只告警一次
            mapTranscendAttr("增伤", { rateZone: "BogusZone" })
            expect(warn).toHaveBeenCalledTimes(1)
            // 另一个未知分区独立告警
            mapTranscendAttr("增伤", { rateZone: "AnotherZone" })
            expect(warn).toHaveBeenCalledTimes(2)
        } finally {
            warn.mockRestore()
            resetRateZoneWarnings()
        }
    })

    it("空串 rateZone 视为未登记分区：告警且降级可见", () => {
        resetRateZoneWarnings()
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
        try {
            const mapping = mapTranscendAttr("增伤", { rateZone: "" })
            expect(mapping).toMatchObject({ key: "增伤", status: "handwritten", partial: true })
            expect(warn).toHaveBeenCalledTimes(1)
        } finally {
            warn.mockRestore()
            resetRateZoneWarnings()
        }
    })

    it("只读属性不绕过 rateZone 检查：未知分区在展示属性上同样降级可见", () => {
        resetRateZoneWarnings()
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
        try {
            const mapping = mapTranscendAttr("移动速度", { rateZone: "BogusZone" })
            expect(mapping).toMatchObject({ key: "移动速度", status: "handwritten", partial: true })
            // 展示属性自身的说明优先保留
            expect(mapping.note).toContain("只作展示")
            expect(warn).toHaveBeenCalledTimes(1)
        } finally {
            warn.mockRestore()
            resetRateZoneWarnings()
        }
    })

    it("已知 rateZone 不告警；不覆盖元素限定 / 减伤 / 取反语义", () => {
        resetRateZoneWarnings()
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
        try {
            expect(mapTranscendAttr("属性穿透", { rateZone: "Almighty" })).toEqual({ key: "属性穿透", status: "exact" })
            expect(warn).not.toHaveBeenCalled()
            // 元素限定：分区声明被忽略，元素与手写状态保持
            expect(mapTranscendAttr("元素增伤", { rateZone: "S0DamageRate", element: "火" })).toMatchObject({
                key: "元素增伤",
                status: "handwritten",
                partial: true,
                element: "火",
            })
            expect(String(warn.mock.calls[0][0])).toContain("不能覆盖")
            // 减伤：保持取反语义，不得改写成赛季乘区
            expect(mapTranscendAttr("减伤", { rateZone: "S0DamageRate" })).toEqual({ key: "减伤", status: "exact", negate: true })
            // 旧 raw 元素伤害率同样不被覆盖
            expect(mapTranscendAttr("FireDamageRate", { rateZone: "S0DamageRate" })).toMatchObject({
                key: "元素增伤",
                element: "火",
            })
        } finally {
            warn.mockRestore()
            resetRateZoneWarnings()
        }
    })

    it("Plan 4 S0 增伤：运行时落 赛季增伤，状态与派生 exact 一致", () => {
        const affix: DnaSeasonAffix = {
            id: 990130,
            plan: 4,
            addAttrs: [{ attr: "增伤", addType: "Value", rateZone: "S0DamageRate" }],
            minValue: 0.0625,
            maxValue: 0.0625,
            totalValueLevel: 1,
            mappingStatus: "exact",
        }
        const result = resolveGearEffects([gear({ slotId: 1, affixId: 990130 })], "main", { tables: { affixes: [affix] } })
        expect(result.entries[0].status).toBe("exact")
        expect(result.attrs.赛季增伤).toBeCloseTo(0.0625, 9)
        expect(result.attrs.增伤).toBeUndefined()
        expect(result.modelingNotes).toEqual([])
        expect(result.warnings).toEqual([])
    })

    it("减伤 110/1061/1517 与 106 都只取反一次", () => {
        const cases: Array<[number, number]> = [
            [106, 0.4291],
            [110, 0.5149],
            [1061, 0.143],
            [1517, 0.1716],
        ]
        for (const [affixId, expected] of cases) {
            const slotType = getAffixSlotTypes(affixId)[0]
            const slotId = slotType <= 7 ? slotType : slotType + 1
            const side = slotId <= 8 ? "main" : "assist1"
            const result = resolveGearEffects([gear({ slotId, affixId, rollLevel: 500 })], side)
            expect(result.attrs.减伤, `${affixId}`).toBeCloseTo(expected, 9)
            expect(result.warnings, `${affixId}`).toEqual([])
        }
    })

    it("减伤符号守卫：负值取反，正值保留符号", () => {
        expect(resolveSignedValue(-0.2, true)).toBeCloseTo(0.2, 9)
        expect(resolveSignedValue(0.2, true)).toBeCloseTo(0.2, 9)
        expect(resolveSignedValue(0.2, false)).toBeCloseTo(0.2, 9)
    })

    it("legacy 负例：ATK_Physical / 无作用域武器属性不落 exact", () => {
        expect(mapTranscendAttr("ATK_Physical")).toMatchObject({ key: "", status: "handwritten" })
        expect(mapTranscendAttr("WeaponATKModifierRate")).toMatchObject({ key: "", status: "handwritten" })
        expect(mapTranscendAttr("WeaponATKModifierRate_Bogus")).toMatchObject({
            key: "",
            status: "handwritten",
        })
        // DamagedRate 的旧导出只有个体减伤形态，裸键即减伤
        expect(mapTranscendAttr("DamagedRate")).toEqual({ key: "减伤", status: "exact", negate: true })
        // 合法作用域后缀仍精确映射
        expect(mapTranscendAttr("WeaponATKModifierRate_CMelee").key).toBe("普通近战攻击")
    })

    it("原型链键不穿透：constructor / toString 视为未登记", () => {
        for (const key of ["constructor", "toString"]) {
            expect(mapTranscendAttr(key), key).toMatchObject({ key: "", status: "handwritten" })
            expect(mapTranscendAttr("元素增伤", { element: key }).key, key).toBe("")
            const chase = mapTranscendAttr("追加伤害", { element: key })
            expect(chase.element, key).toBeUndefined()
            expect(chase.key, key).toBe("自属性追伤")
        }
    })
})

describe("减伤正值告警", () => {
    const positiveReductionAffix: DnaSeasonAffix = {
        id: 990106,
        plan: 1,
        addAttrs: [{ attr: "减伤", addType: "Rate" }],
        minValue: 0.05,
        maxValue: 0.05,
        totalValueLevel: 1,
    }
    const positiveReductionTalent: DnaSeasonTalent = {
        id: 990001,
        stageId: 1,
        kind: 1,
        maxLevel: 30,
        name: "测试减伤",
        desc: "",
        icon: "",
        position: [0, 0],
        effects: [
            {
                index: 0,
                attr: "减伤",
                addType: "Rate",
                base: 0.06,
                unlockLevel: 1,
            },
        ],
    }

    it("装备路径：正值保持正号并告警", () => {
        const result = resolveGearEffects([gear({ slotId: 7, affixId: 990106 })], "main", {
            tables: { affixes: [positiveReductionAffix] },
        })
        expect(result.attrs.减伤).toBeCloseTo(0.05, 9)
        expect(result.entries[0].note).toBe("减伤数值为正，按原符号计入")
        expect(result.warnings).toHaveLength(1)
        expect(result.warnings[0]).toContain("减伤数值为正")
    })

    it("天赋路径：正值保持正号并告警", () => {
        const result = resolveTalentEffects([[990001, 1]], { tables: { talents: [positiveReductionTalent] } })
        expect(result.attrs.减伤).toBeCloseTo(0.06, 9)
        expect(result.warnings).toHaveLength(1)
        expect(result.warnings[0]).toContain("测试减伤")
        expect(result.warnings[0]).toContain("保留原符号")
    })

    it("collectTranscendEffects 合并天赋与装备 warnings", () => {
        const settings = createDefaultTranscendSettings()
        settings.enabled = true
        settings.talentLevels = [[990001, 1]]
        settings.mainGear = [gear({ slotId: 7, affixId: 990106 })]
        const effects = collectTranscendEffects(settings, "main", {
            tables: { talents: [positiveReductionTalent], affixes: [positiveReductionAffix] },
        })
        expect(effects.warnings).toHaveLength(2)
        expect(effects.warnings.join()).toContain("测试减伤")
        expect(effects.warnings.join()).toContain("词条 990106")
        // 正值不被静默翻转；归因按结构化 id，不解析展示名
        const talentBuff = effects.buffs.find(buff => buff.source?.kind === "talent" && buff.id === 990001)
        expect(talentBuff?.getAttrValue("减伤")).toBeCloseTo(0.06, 9)
        const gearBuff = effects.buffs.find(buff => buff.source?.kind === "gear" && buff.id === 990106)
        expect(gearBuff?.getAttrValue("减伤")).toBeCloseTo(0.05, 9)
    })
})

describe("属性映射", () => {
    it("武器前缀词条按 attr 自带作用域落到四类武器作用域", () => {
        expect(mapTranscendAttr("WeaponATKModifierRate_CMelee").key).toBe("普通近战攻击")
        expect(mapTranscendAttr("WeaponCRIModifierRate_CRanged").key).toBe("普通远程暴击")
        expect(mapTranscendAttr("WeaponCRDModifierRate_UMelee").key).toBe("同律近战暴伤")
        expect(mapTranscendAttr("TriggerProbModifierRate_URanged").key).toBe("同律远程触发")
    })

    it("伤害率、元素攻击、追伤、展示型属性", () => {
        expect(mapTranscendAttr("DamageRate_Almighty")).toEqual({ key: "属性穿透", status: "exact" })
        expect(mapTranscendAttr("DamageRate_Skill_Normal").key).toBe("技能伤害")
        expect(mapTranscendAttr("ATK")).toEqual({ key: "攻击", status: "exact" })
        expect(mapTranscendAttr("ATK_Fire")).toEqual({ key: "火属性攻击", status: "exact", element: "火" })
        expect(mapTranscendAttr("FireDamageRate").status).toBe("handwritten")
        // 旧形状：元素写在 attr 后缀里；裸 BonusDamage 没有元素信息 → 自属性追伤
        expect(mapTranscendAttr("BonusDamage_Fire")).toEqual({ key: "火属性追伤", status: "exact", element: "火" })
        expect(mapTranscendAttr("BonusDamage")).toMatchObject({ key: "自属性追伤", status: "handwritten" })
        // 真实数据：Plan 2 六条元素追伤（1024-1029）精确映射到分量键
        const bonusElements: Record<number, string> = { 1024: "水", 1025: "火", 1026: "风", 1027: "雷", 1028: "光", 1029: "暗" }
        const bonusAffixes = affixes.filter(affix => bonusElements[affix.id])
        expect(bonusAffixes).toHaveLength(6)
        for (const affix of bonusAffixes) {
            const element = bonusElements[affix.id]
            const result = resolveGearEffects([gear({ slotId: 3, affixId: affix.id, rollLevel: 1 })], "main", { charElement: element })
            expect(result.modelingNotes, `${affix.id} ${affix.addAttrs?.[0]?.attr}`).toHaveLength(0)
            expect(result.entries[0].status).toBe("exact")
            expect(result.attrs[`${element}属性追伤`]).toBeCloseTo(0.0834, 9)
        }
        // 展示型属性：原样计入引擎属性名，只作展示、不参与伤害
        expect(mapTranscendAttr("WalkSpeedModifier")).toMatchObject({ key: "移动速度", status: "handwritten" })
        expect(mapTranscendAttr("HpRecoverValue")).toMatchObject({ key: "生命回复", status: "handwritten" })
        expect(mapTranscendAttr("HpRecoverValueModifierRate")).toMatchObject({
            key: "生命恢复增幅",
            status: "handwritten",
        })
    })

    it("神智自然回复（SpRecoverValue）精确映射引擎属性", () => {
        expect(mapTranscendAttr("SpRecoverValue")).toEqual({ key: "神智回复", status: "exact" })
    })

    it("元素专属属性只在同元素角色上计入", () => {
        const fireGear = [gear({ slotId: 3, affixId: 3101 })]
        expect(resolveGearEffects(fireGear, "main", { charElement: "火" }).attrs.火属性攻击).toBeCloseTo(0.01, 9)
        expect(resolveGearEffects(fireGear, "main", { charElement: "水" }).attrs.火属性攻击).toBeUndefined()
    })
})

describe("充盈威力（HyperTriggerRate）精确映射", () => {
    it("属性按正式属性精确累加", () => {
        expect(mapTranscendAttr("HyperTriggerRate")).toEqual({ key: "充盈威力", status: "exact" })
    })

    it("5 条 Plan 4 充盈威力词条（3103/3113/3123/3133/3143）状态 exact 且无手写备注", () => {
        const cases: [number, number][] = [
            [3103, 0.15],
            [3113, 0.3],
            [3123, 0.45],
            [3133, 0.6],
            [3143, 0.75],
        ]
        for (const [affixId, value] of cases) {
            const affix = affixes.find(item => item.id === affixId)!
            expect(affix.mappingStatus, `${affixId} 数据状态`).toBe("exact")
            // 槽型 5/6/7 → 装备位 5
            const result = resolveGearEffects([gear({ slotId: 5, affixId })], "main", { charElement: "雷" })
            expect(result.entries[0].status).toBe("exact")
            expect(result.attrs.充盈威力).toBeCloseTo(value, 9)
            expect(result.modelingNotes).toEqual([])
        }
    })
})

describe("Plan 4 手写词条", () => {
    /** 唯一装引用的 32 条词条（遗留行过滤后 32 件唯一装 affixId 互不重复） */
    const entries = uniqueEquips.map(equip => gear({ slotId: slotIdOfType(equip.slot), affixId: equip.affixId }))

    it("32 件唯一装的词条全部手写计入（handwritten 计数，无未计入）", () => {
        const counts = { exact: 0, handwritten: 0 }
        const warnings: string[] = []
        const byGroup = (group: "main" | "assist1" | "assist2") =>
            entries.filter(entry => getTranscendGearGroupKeyOfSlot(entry.slotId) === group)
        for (const side of ["main", "assist1", "assist2"] as const) {
            const result = resolveGearEffects(byGroup(getTranscendGearGroupKey(side)), side)
            warnings.push(...result.warnings)
            for (const item of result.entries) counts[item.status]++
            expect(result.modelingNotes.every(item => item.status === "handwritten")).toBe(true)
        }
        expect(warnings).toEqual([])
        expect(counts).toEqual({ exact: 0, handwritten: 32 })
    })

    it("协战一 / 协战二各吃本组装备：同一词条两组分别计入、互不串组", () => {
        const shared = (slotId: number) => gear({ slotId, affixId: 1501, rollLevel: 1 })
        const settings = {
            enabled: true,
            talentLevels: [] as [number, number][],
            mainGear: [],
            assist1Gear: [shared(9)],
            assist2Gear: [shared(13)],
            gearVariants: [],
            activeGearVariant: "A",
        }
        const assist1 = collectTranscendEffects(settings, "assist1")
        const assist2 = collectTranscendEffects(settings, "assist2")
        expect(assist1.warnings).toEqual([])
        expect(assist2.warnings).toEqual([])
        expect(assist1.buffs).toHaveLength(1)
        expect(assist2.buffs).toHaveLength(1)
        expect(assist1.buffs[0].source).toMatchObject({ slotId: 9 })
        expect(assist2.buffs[0].source).toMatchObject({ slotId: 13 })

        // 清空协战二不影响协战一，反之亦然
        const onlyAssist1 = collectTranscendEffects({ ...settings, assist2Gear: [] }, "assist1")
        expect(onlyAssist1.buffs).toHaveLength(1)
        const onlyAssist2 = collectTranscendEffects({ ...settings, assist1Gear: [] }, "assist2")
        expect(onlyAssist2.buffs).toHaveLength(1)
        // 把协战一的装备塞给协战二：同域校验会忽略并告警
        const crossed = collectTranscendEffects({ ...settings, assist1Gear: [], assist2Gear: [shared(9)] }, "assist2")
        expect(crossed.buffs).toEqual([])
        expect(crossed.warnings).toEqual(["装备位 9 不属于 assist2 分组，已忽略"])
    })

    it("手写 BUFF 覆盖可映射清单，展示型词条也产出 BUFF", () => {
        const mapped = resolveGearEffects([gear({ slotId: 4, affixId: 2001 })], "main")
        expect(mapped.buffs.map(item => item.buff.名称)).toEqual(["升华·螺旋跃击"])
        expect(mapped.buffs[0]).toMatchObject({ id: 2001, buff: { id: 2001, source: { kind: "gear", id: 2001, slotId: 4 } } })
        expect(mapped.buffs[0].buff.attr).toMatchObject({ 下落独立增伤: 9 })

        const speed = resolveGearEffects([gear({ slotId: 4, affixId: 2013 })], "main")
        expect(speed.buffs.map(item => item.buff.名称)).toEqual(["升华·闪避移速"])
        expect(speed.buffs[0].buff.source).toMatchObject({ kind: "gear", id: 2013, slotId: 4 })
        expect(speed.entries[0]).toMatchObject({ status: "handwritten", included: ["移动速度"] })
        expect(speed.entries[0].partial).toBeUndefined()
    })

    it("310202 手写计入（技能替换说法只适用于 310201）", () => {
        const result = resolveGearEffects([gear({ slotId: 7, affixId: 310202 })], "main", { charId: 3102 })
        expect(result.entries[0].status).toBe("handwritten")
        // 技能等级三键合成 BUFF 走标准属性管线，手写映射 BUFF 保留原文
        expect(result.buffs.map(item => item.buff.名称)).toEqual(["升华装备·戒指·技能等级", "升华·优雅怒意"])
        expect(result.buffs[1].buff.source).toMatchObject({ kind: "gear", id: 310202, slotId: 7 })
    })

    it("1.8.7.1 专属词条按精确技能 id 提升技能等级，技能与其子技能同槽只计一次", () => {
        // 110201 战技 +10，同时保留手写机制说明
        const battle = resolveGearEffects([gear({ slotId: 6, affixId: 110201 })], "main", { charId: 1102 })
        expect(battle.attrs.E技能等级).toBe(10)
        expect(battle.buffs.map(item => item.buff.名称)).toEqual(["升华装备·项链·技能等级", "升华·芙罗拉重奏"])
        // 180101 携带 [180101, 180112]（战技 + 子技能），同属槽位 0 → 只 +10
        const duo = resolveGearEffects([gear({ slotId: 1, affixId: 180101 })], "main", { charId: 1801 })
        expect(duo.attrs.E技能等级).toBe(10)
        // 310201 终结技 +10 → 槽位 1；310202 被动 +10 → 槽位 2
        expect(resolveGearEffects([gear({ slotId: 1, affixId: 310201 })], "main", { charId: 3102 }).attrs.Q技能等级).toBe(10)
        expect(resolveGearEffects([gear({ slotId: 7, affixId: 310202 })], "main", { charId: 3102 }).attrs.P技能等级).toBe(10)
    })

    it("动态属性词条保留表达式，覆盖率不再硬编码", () => {
        const durability = resolveGearEffects([gear({ slotId: 5, affixId: 2004 })], "main")
        expect(durability.buffs[0].buff.attr?.独立增伤).toBe("0.02373*max(0,技能耐久-1)")

        const weakness = resolveGearEffects([gear({ slotId: 8, affixId: 2008 })], "main", { charElement: "火" })
        expect(weakness.buffs[0].coverage).toBeUndefined()
        expect(weakness.buffs[0].buff.attr).toMatchObject({ 火属性弱点: 0.54 })
        // 元素限定被动在不同元素角色上不计入
        const other = resolveGearEffects([gear({ slotId: 8, affixId: 2008 })], "main", { charElement: "水" })
        expect(other.buffs).toHaveLength(0)
        expect(other.entries[0].status).toBe("handwritten")
        expect(other.modelingNotes[0].counted).toBe(false)
    })
})

describe("技能替换（U83b）", () => {
    it("词条生效时收集替换：直接映射 / Buff 间接 / 武器技能", () => {
        const e = resolveGearEffects([gear({ slotId: 1, affixId: 180101 })], "main", { charId: 1801 })
        expect(e.skillReplacements[180101]).toEqual({ id: 180112, 名称: "“在一个暖和的午后”", 类型: "伤害" })
        expect(e.skillReplacements[180101].字段).toBeUndefined()

        const q = resolveGearEffects([gear({ slotId: 5, affixId: 180102 })], "main", { charId: 1801 })
        expect(q.skillReplacements[180102]).toEqual({ id: 180123, 名称: "“下午茶开始了！”", 类型: "增益" })

        // 310201 无 activateSkills：经 PassiveEffect → Buff.ActivateSkills 间接导出，手写兜底伤害
        const buffIndirect = resolveGearEffects([gear({ slotId: 1, affixId: 310201 })], "main", { charId: 3102 })
        expect(buffIndirect.skillReplacements[310201]).toEqual({
            id: 310212,
            名称: "高温清扫",
            类型: "伤害",
            字段改写: { 伤害: { 值: 9.03552 } },
        })

        // 320301：导出只有身份/名称，三种模式倍率无上游依据 → 不写字段
        const kajia = resolveGearEffects([gear({ slotId: 4, affixId: 320301 })], "main", { charId: 3203 })
        expect(kajia.skillReplacements[320302]).toEqual({ id: 320312, 名称: "猫猫头出击！", 类型: "伤害" })

        // 2040601：导出字段与源技能同值（no-op），保留源字段，不做字段覆盖
        const weapon = resolveGearEffects([gear({ slotId: 6, affixId: 2040601 })], "main")
        expect(weapon.skillReplacements[2040601]).toEqual({ id: 2040603, 名称: "射击", 类型: "射击" })
        expect(weapon.skillReplacements[2040601].字段).toBeUndefined()
        expect(weapon.skillReplacements[2040601].字段改写).toBeUndefined()
    })

    it("未装备 / 角色不符 / 槽位不符时既不收集也不计", () => {
        expect(resolveGearEffects([], "main").skillReplacements).toEqual({})
        const wrongChar = resolveGearEffects([gear({ slotId: 1, affixId: 310201 })], "main", { charId: 1801 })
        expect(wrongChar.skillReplacements).toEqual({})
        expect(wrongChar.warnings.join()).toContain("仅适用于角色")
        const wrongSlot = resolveGearEffects([gear({ slotId: 3, affixId: 310201 })], "main", { charId: 3102 })
        expect(wrongSlot.skillReplacements).toEqual({})
        expect(wrongSlot.warnings.join()).toContain("不能装备在装备位 3")
    })

    it("同 source 由后遍历的装备位覆盖并告警", () => {
        const affixes = [
            {
                id: 990201,
                plan: 4,
                minValue: 1,
                maxValue: 1,
                totalValueLevel: 1,
                desc: "",
                skillReplacements: { "310201": { id: 310212, 名称: "低槽", 类型: "伤害" } },
            },
            {
                id: 990202,
                plan: 4,
                minValue: 1,
                maxValue: 1,
                totalValueLevel: 1,
                desc: "",
                skillReplacements: { "310201": { id: 310213, 名称: "高槽", 类型: "伤害" } },
            },
        ] satisfies DnaSeasonAffix[]
        const result = resolveGearEffects([gear({ slotId: 1, affixId: 990201 }), gear({ slotId: 2, affixId: 990202 })], "main", {
            tables: { affixes },
        })
        expect(result.skillReplacements[310201]).toMatchObject({ id: 310213, 名称: "高槽" })
        expect(result.warnings.join()).toContain("技能替换 310201 被词条 990202 覆盖")
    })

    it("collectTranscendEffects 按构筑位隔离", () => {
        const settings = {
            enabled: true,
            talentLevels: [] as [number, number][],
            mainGear: [gear({ slotId: 1, affixId: 310201 })],
            assist1Gear: [],
            assist2Gear: [],
            gearVariants: [],
            activeGearVariant: "A",
        }
        const main = collectTranscendEffects(settings, "main", { charId: 3102 })
        expect(main.skillReplacements[310201]).toMatchObject({ id: 310212 })
        const assist1 = collectTranscendEffects(settings, "assist1", { charId: 3102 })
        expect(assist1.skillReplacements).toEqual({})
    })
})

describe("升华设置归一化", () => {
    it("缺失 / 非法输入时补默认（关闭、无天赋、无装备）", () => {
        const expected = {
            enabled: false,
            talentLevels: [],
            mainGear: [],
            assist1Gear: [],
            assist2Gear: [],
            gearVariants: [{ id: "A", mainGear: [], assist1Gear: [], assist2Gear: [] }],
            activeGearVariant: "A",
        }
        expect(normalizeTranscendSettings(undefined)).toEqual(expected)
        expect(normalizeTranscendSettings(null)).toEqual(expected)
        expect(normalizeTranscendSettings("bad")).toEqual(expected)
    })

    it("按装备位重新分组、去重并钳制档位/精造", () => {
        const settings = normalizeTranscendSettings({
            enabled: true,
            talentLevels: [
                [100010, 99],
                [100010, 12],
                [999999, 5],
            ],
            mainGear: [
                { slotId: 3, affixId: 101, rollLevel: 999, masterworkLevel: 99, ancient: true, finalMasterwork: true },
                { slotId: 3, affixId: 101, rollLevel: 5, masterworkLevel: 3, ancient: false, finalMasterwork: false },
                { slotId: 99, affixId: 101, rollLevel: 1, masterworkLevel: 0, ancient: false, finalMasterwork: false },
                { slotId: 1, affixId: 999999, rollLevel: 1, masterworkLevel: 0, ancient: false, finalMasterwork: false },
            ],
            assist1Gear: [{ slotId: 9, affixId: 1510, rollLevel: 3, masterworkLevel: 0, ancient: false, finalMasterwork: false }],
            assist2Gear: [{ slotId: 13, affixId: 1510, rollLevel: 3, masterworkLevel: 0, ancient: false, finalMasterwork: false }],
        })
        expect(settings.talentLevels).toEqual([[100010, 12]])
        // 同一槽位同一词条只留最后一条；未知槽位/词条被剔除；roll 钳制到 totalValueLevel，精造钳制 0-10
        expect(settings.mainGear).toEqual([
            {
                slotId: 3,
                item: {
                    kind: "normal",
                    slotType: 3,
                    affixes: [{ affixId: 101, rollLevel: 5, masterworkLevel: 3, ancient: false, finalMasterwork: false, source: "base" }],
                    // 装备级 craft 状态由 per-affix 精锻推导（旧数据归一化）
                    craft: { masterworkLevel: 3, temperingCount: 0, enchantCount: 0 },
                },
            },
        ])
        // 按 slotId 重新分组：9-12 协战一、13-16 协战二
        expect(settings.mainGear).toHaveLength(1)
        expect(settings.assist1Gear).toEqual([
            {
                slotId: 9,
                item: {
                    kind: "normal",
                    slotType: 8,
                    affixes: [
                        { affixId: 1510, rollLevel: 3, masterworkLevel: 0, ancient: false, finalMasterwork: false, source: "random" },
                    ],
                    craft: { masterworkLevel: 0, temperingCount: 0, enchantCount: 0 },
                },
            },
        ])
        expect(settings.assist2Gear).toEqual([
            {
                slotId: 13,
                item: {
                    kind: "normal",
                    slotType: 8,
                    affixes: [
                        { affixId: 1510, rollLevel: 3, masterworkLevel: 0, ancient: false, finalMasterwork: false, source: "random" },
                    ],
                    craft: { masterworkLevel: 0, temperingCount: 0, enchantCount: 0 },
                },
            },
        ])
        expect(settings.gearVariants).toHaveLength(1)
        expect(settings.gearVariants[0].mainGear).toEqual(settings.mainGear)
        expect(settings.gearVariants[0].assist1Gear).toEqual(settings.assist1Gear)
        expect(settings.gearVariants[0].assist2Gear).toEqual(settings.assist2Gear)
        expect(settings.activeGearVariant).toBe("A")
    })

    it("太古 / 最终精造只在词条有对应公式时保留", () => {
        const settings = normalizeTranscendSettings({
            enabled: true,
            talentLevels: [],
            mainGear: [{ slotId: 3, affixId: 101, rollLevel: 1, masterworkLevel: 0, ancient: true, finalMasterwork: true }],
            assist1Gear: [],
            assist2Gear: [],
        })
        const item = (settings.mainGear[0] as TranscendEquippedGear).item
        expect(item.affixes[0].ancient).toBe(false)
        expect(item.affixes[0].finalMasterwork).toBe(false)
    })

    it("每槽词条数超限时按 1 基础 + 4 随机截断（异常存档不能撑爆分享体积）", () => {
        const baseAffixId = 101
        const randomIds = affixes
            .filter(affix => isAffixCompatibleWithSlot(affix.id, 3) && affix.id !== baseAffixId && affix.plan === 2)
            .slice(0, TRANSCEND_MAX_AFFIXES_PER_SLOT + 1)
            .map(affix => affix.id)
        expect(randomIds.length).toBeGreaterThan(TRANSCEND_MAX_AFFIXES_PER_SLOT)
        const settings = normalizeTranscendSettings({
            enabled: true,
            talentLevels: [],
            mainGear: [baseAffixId, ...randomIds].map(affixId => gear({ slotId: 3, affixId })),
            assist1Gear: [],
            assist2Gear: [],
        })
        expect(settings.mainGear).toHaveLength(1)
        const affixRolls = (settings.mainGear[0] as TranscendEquippedGear).item.affixes
        expect(affixRolls).toHaveLength(TRANSCEND_MAX_AFFIXES_PER_SLOT + 1)
        expect(affixRolls.filter(roll => roll.source === "base")).toHaveLength(1)
        expect(affixRolls.filter(roll => roll.source === "random")).toHaveLength(TRANSCEND_MAX_AFFIXES_PER_SLOT)
    })

    it("同槽重复词条先去重再计配额：合法词条不被重复条目挤掉", () => {
        const compatible = affixes.filter(affix => isAffixCompatibleWithSlot(affix.id, 3)).map(affix => affix.id)
        const [duplicated, legal] = compatible
        const settings = normalizeTranscendSettings({
            enabled: true,
            talentLevels: [],
            mainGear: [
                ...Array.from({ length: TRANSCEND_MAX_AFFIXES_PER_SLOT }, () => gear({ slotId: 3, affixId: duplicated })),
                gear({ slotId: 3, affixId: legal }),
            ],
            assist1Gear: [],
            assist2Gear: [],
        })
        // 重复条目只算一条，后面的合法词条仍在
        const affixIds = (settings.mainGear[0] as TranscendEquippedGear).item.affixes.map(roll => roll.affixId)
        expect(affixIds.sort()).toEqual([duplicated, legal].sort())
    })

    it("同槽重复条目保留后出现的配置（后者覆盖前者）", () => {
        const compatible = affixes.filter(affix => isAffixCompatibleWithSlot(affix.id, 3)).map(affix => affix.id)
        const [affixId] = compatible
        const settings = normalizeTranscendSettings({
            enabled: true,
            talentLevels: [],
            mainGear: [gear({ slotId: 3, affixId, rollLevel: 1 }), gear({ slotId: 3, affixId, rollLevel: 2 })],
            assist1Gear: [],
            assist2Gear: [],
        })
        expect(settings.mainGear).toHaveLength(1)
        expect((settings.mainGear[0] as TranscendEquippedGear).item.affixes[0].rollLevel).toBe(2)
    })
})

describe("残缺配置守卫", () => {
    it("部分升华配置（只有 enabled）不抛错，按空效果处理", () => {
        const partial = { enabled: true } as unknown as Parameters<typeof collectTranscendEffects>[0]
        const effects = collectTranscendEffects(partial, "main")
        expect(effects.buffs).toEqual([])
        expect(effects.warnings).toEqual([])
    })

    it("关闭时返回空效果", () => {
        const effects = collectTranscendEffects(createDefaultTranscendSettings(), "main")
        expect(effects.buffs).toEqual([])
    })

    it("null / 畸形条目被跳过而不是抛错", () => {
        expect(resolveGearEffects(null as unknown as TranscendGearEntry[], "main").entries).toEqual([])
        expect(
            resolveGearEffects([null, { slotId: 3 }, { slotId: "x", affixId: "y" }] as unknown as TranscendGearEntry[], "main").entries
        ).toEqual([])
        expect(resolveTalentEffects([null, [100010]] as unknown as [number, number][]).buffs).toEqual([])
        expect(resolveTalentEffects(null as unknown as [number, number][]).buffs).toEqual([])
    })

    it("安全模式（数据表为空）下归一化不丢弃配置", () => {
        const normalized = normalizeTranscendSettings(
            {
                enabled: true,
                talentLevels: [[100010, 30]],
                mainGear: [gear({ slotId: 3, affixId: 101, rollLevel: 999 })],
                assist1Gear: [],
                assist2Gear: [],
            },
            { affixes: [], talents: [] }
        )
        expect(normalized.talentLevels).toEqual([[100010, 30]])
        expect(normalized.mainGear).toHaveLength(1)
        expect(normalized.mainGear[0]).toMatchObject({ slotId: 3, affixId: 101, rollLevel: 999 })
    })
})

describe("BUFF 来源标识（名称不含 id）", () => {
    it("同名天赋节点：名称相同，但 id / key 不同仍可区分", () => {
        const buffs = resolveTalentEffects([
            [100001, 1],
            [100026, 1],
        ]).buffs
        expect(buffs.map(item => item.buff.名称)).toEqual(["升华天赋·攻击", "升华天赋·攻击"])
        expect(buffs.map(item => item.id)).toEqual([100001, 100026])
        expect(buffs.map(item => item.buff.id)).toEqual([100001, 100026])
        expect(buffs.map(item => item.buff.source)).toEqual([
            { kind: "talent", id: 100001, effectIndex: 0 },
            { kind: "talent", id: 100026, effectIndex: 0 },
        ])
        expect(new Set(buffs.map(item => item.key)).size).toBe(2)
        expect(buffs.every(item => !item.buff.名称.includes("#"))).toBe(true)
    })

    it("100030 技能范围行只显示「升华天赋·技能范围」", () => {
        const result = resolveTalentEffects([[100030, 30]])
        const rangeBuff = result.buffs.filter(item => item.buff.attr && "技能范围" in item.buff.attr)
        expect(rangeBuff).toHaveLength(1)
        expect(rangeBuff[0].buff.名称).toBe("升华天赋·技能范围")
        expect(rangeBuff[0].buff.attr).toEqual({ 技能范围: 0.45 })
        expect(rangeBuff[0].id).toBe(100030)
        expect(rangeBuff[0].buff.source).toEqual({ kind: "talent", id: 100030, effectIndex: 3 })
        // 节点名「武器暴击率」不再冒充技能范围的来源
        expect(result.buffs.some(item => item.buff.名称.includes("武器暴击率") && item.buff.attr && "技能范围" in item.buff.attr)).toBe(
            false
        )
    })

    it("同节点多效果各自成条，attr 只含该效果", () => {
        const result = resolveTalentEffects([[100010, 30]])
        expect(result.buffs).toHaveLength(5)
        for (const item of result.buffs) {
            expect(Object.keys(item.buff.attr ?? {})).toHaveLength(1)
            expect(item.buff.source?.kind === "talent" && item.buff.source.id === 100010).toBe(true)
        }
        expect(new Set(result.buffs.map(item => item.key)).size).toBe(5)
    })

    it("同词条进两个戒指槽：名称相同，但 slotId 可区分", () => {
        const result = resolveGearEffects([gear({ slotId: 7, affixId: 1024 }), gear({ slotId: 8, affixId: 1024 })], "main", {
            charElement: "水",
        })
        const names = result.buffs.map(item => item.buff.名称)
        expect(names).toEqual(["升华装备·戒指·水属性追伤", "升华装备·戒指·水属性追伤"])
        expect(result.buffs.map(item => item.buff.source)).toEqual([
            { kind: "gear", id: 1024, slotId: 7, socketIndex: undefined, affixSourceClass: "other" },
            { kind: "gear", id: 1024, slotId: 8, socketIndex: undefined, affixSourceClass: "other" },
        ])
        expect(new Set(result.buffs.map(item => item.key)).size).toBe(2)
    })

    it("同一装备位多颗宝石按 socketIndex 区分，名称不含 id", () => {
        const result = resolveGearEffects(
            [gear({ slotId: 7, affixId: 1024, socketIndex: 0 }), gear({ slotId: 7, affixId: 1024, socketIndex: 1 })],
            "main",
            { charElement: "水" }
        )
        expect(result.buffs.map(item => item.buff.名称)).toEqual(["升华装备·戒指·水属性追伤", "升华装备·戒指·水属性追伤"])
        expect(result.buffs.map(item => item.buff.source?.socketIndex)).toEqual([0, 1])
        expect(result.buffs.map(item => item.buff.id)).toEqual([1024, 1024])
        expect(new Set(result.buffs.map(item => item.key)).size).toBe(2)
    })

    it("手写 BUFF 保留原文名称，来源在结构化字段", () => {
        const result = resolveGearEffects([gear({ slotId: 7, affixId: 2007 })], "main", { charElement: "水" })
        expect(result.buffs[0].buff.名称).toBe("升华·召唤破防")
        expect(result.buffs[0].buff.source).toMatchObject({ kind: "gear", id: 2007, slotId: 7 })
        // 同一个词条放进两个同槽型装备位（不同装备位）：名称相同，key / slotId 不同
        const two = resolveGearEffects([gear({ slotId: 7, affixId: 2007 }), gear({ slotId: 8, affixId: 2007 })], "main", {
            charElement: "水",
        })
        expect(two.buffs.map(item => item.buff.名称)).toEqual(["升华·召唤破防", "升华·召唤破防"])
        expect(two.buffs.map(item => item.buff.source?.slotId)).toEqual([7, 8])
        expect(new Set(two.buffs.map(item => item.key)).size).toBe(2)
    })

    it("TRANSEND_BUFFS 旧拼写作为别名仍可用", () => {
        expect(TRANSEND_BUFFS).toBe(TRANSCEND_BUFFS)
    })
})

describe("Plan 4 元素限定", () => {
    it("2007 水 / 2009 风 / 2010 雷：仅同元素角色计入", () => {
        const cases: { affixId: number; slotId: number; side: "main" | "assist1"; element: string; buff: string }[] = [
            { affixId: 2007, slotId: 7, side: "main", element: "水", buff: "升华·召唤破防" },
            { affixId: 2009, slotId: 7, side: "main", element: "风", buff: "升华·充盈转武伤" },
            { affixId: 2010, slotId: 7, side: "main", element: "雷", buff: "升华·雷鸣重复" },
        ]
        for (const item of cases) {
            const matched = resolveGearEffects([gear({ slotId: item.slotId, affixId: item.affixId })], item.side, {
                charElement: item.element,
            })
            expect(matched.buffs.map(buff => buff.buff.名称.startsWith(item.buff))).toEqual([true])
            const other = item.element === "水" ? "雷" : "水"
            const mismatched = resolveGearEffects([gear({ slotId: item.slotId, affixId: item.affixId })], item.side, {
                charElement: other,
            })
            expect(mismatched.buffs).toHaveLength(0)
            expect(mismatched.entries[0].status).toBe("handwritten")
        }
    })
})

describe("Plan 4 二元状态口径", () => {
    const missingBuffs = [
        2003, 2012, 2013, 3202, 3212, 3222, 3232, 3242, 110201, 150201, 150202, 150203, 180101, 180102, 210101, 240101, 240102, 240103,
        310201, 320301, 320302, 420101, 2040601,
    ]

    it("数据/模型层不再出现旧状态与模糊文案", () => {
        const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
        const files = [
            "packages/data/transcend.ts",
            "packages/data/transcendSettings.ts",
            "packages/data/transcendBuild.ts",
            "packages/data/transcendBuffs.ts",
            "packages/data/CharBuildHelper.ts",
            "packages/data/d/dnaseasonequip.data.ts",
            "tools/dnaseason/derive.ts",
        ]
        for (const file of files) {
            const text = readFileSync(path.join(root, file), "utf-8")
            expect(text, file).not.toMatch(/approx/)
            expect(text, file).not.toContain("近似")
        }
    })

    it("每条 handwritten Plan 4 词条都有手写映射，且映射表无多余条目", () => {
        const handwritten = affixes.filter(affix => affix.plan === 4 && affix.mappingStatus === "handwritten")
        expect(handwritten).toHaveLength(38)
        for (const affix of handwritten) {
            expect(UNIQUE_AFFIX_MAP[affix.id], `${affix.id}`).toBeDefined()
            expect(UNIQUE_AFFIX_MAP[affix.id].status, `${affix.id}`).toBe("handwritten")
        }
        expect(
            Object.keys(UNIQUE_AFFIX_MAP)
                .map(Number)
                .sort((left, right) => left - right)
        ).toEqual(handwritten.map(affix => affix.id).sort((left, right) => left - right))
    })

    it("23 条待补词条全部在 UNIQUE_AFFIX_MAP 登记为 handwritten", () => {
        for (const affixId of missingBuffs) {
            expect(UNIQUE_AFFIX_MAP[affixId], `${affixId}`).toBeDefined()
            expect(UNIQUE_AFFIX_MAP[affixId].status, `${affixId}`).toBe("handwritten")
        }
    })

    it("全部 Plan 4 handwriting 条目的 buff 名可解析，且属性词条落到引擎属性名", () => {
        for (const [affixId, mapping] of Object.entries(UNIQUE_AFFIX_MAP)) {
            for (const name of mapping.buffs) {
                expect(TRANSCEND_BUFF_MAP.get(name), `${affixId} → ${name}`).toBeDefined()
            }
        }
        // 属性映射词条（生命回复）不引用手写 BUFF，由 addAttrs 产出
        for (const affixId of [3202, 3212, 3222, 3232, 3242]) {
            expect(UNIQUE_AFFIX_MAP[affixId].buffs).toEqual([])
        }
    })

    it("手写 BUFF 表与映射表一一对应（无孤儿 BUFF、无悬空引用）", () => {
        const referenced = new Set(Object.values(UNIQUE_AFFIX_MAP).flatMap(mapping => mapping.buffs))
        expect(new Set(TRANSCEND_BUFFS.map(buff => buff.名称))).toEqual(referenced)
    })
})

describe("Plan 4 角色限定（上游精确 charIds）", () => {
    it("150401 只对 1504 生效，其他角色整条跳过", () => {
        const own = resolveGearEffects([gear({ slotId: 1, affixId: 150401 })], "main", { charId: 1504 })
        expect(own.entries[0].status).toBe("handwritten")
        expect(own.entries[0].buffs).toEqual(["升华·遨游永续"])

        const other = resolveGearEffects([gear({ slotId: 1, affixId: 150401 })], "main", { charId: 1503 })
        expect(other.entries).toHaveLength(0)
        expect(other.warnings.join()).toContain("仅适用于角色 1504")
    })

    it("150401 手写口径：技能速度精确计入，蓝图缺口登记 partial / excluded", () => {
        const mapping = UNIQUE_AFFIX_MAP[150401]
        expect(mapping.partial).toBe(true)
        expect(mapping.included).toEqual(["技能速度"])
        expect(mapping.excluded).toEqual(["遨游永续", "剑如虹弹药"])
        expect(mapping.values).toEqual([{ name: "技能速度", value: 1.2 }])
        const entry = resolveGearEffects([gear({ slotId: 1, affixId: 150401 })], "main", { charId: 1504 }).entries[0]
        expect(entry).toMatchObject({ status: "handwritten", included: ["技能速度"], partial: true })
        expect(entry.excluded).toEqual(["遨游永续", "剑如虹弹药"])
    })

    it("310202 只对 3102 生效", () => {
        expect(resolveGearEffects([gear({ slotId: 7, affixId: 310202 })], "main", { charId: 3102 }).buffs).toHaveLength(2)
        expect(resolveGearEffects([gear({ slotId: 7, affixId: 310202 })], "main", { charId: 1101 }).buffs).toHaveLength(0)
    })

    it("武器专属词条（无 charIds）不限角色；未提供 charId 时不做角色过滤", () => {
        expect(UNIQUE_AFFIX_MAP[2040601].buffs).toEqual(["升华·切割齿轮"])
        expect(resolveGearEffects([gear({ slotId: 6, affixId: 2040601 })], "main", { charId: 4201 }).buffs).toHaveLength(1)
        expect(resolveGearEffects([gear({ slotId: 6, affixId: 2040601 })], "main").buffs).toHaveLength(1)
        expect(resolveGearEffects([gear({ slotId: 1, affixId: 150401 })], "main").buffs).toHaveLength(1)
    })
})

describe("U93a 权威展示数值与效果事件元数据", () => {
    /** 只有机制、没有可计算数值的 8 条（310201 技能替换；210101 / 320302 的额外一击倍率不是面板属性） */
    const MECH_ONLY = [2003, 110201, 150201, 150202, 240101, 310201, 210101, 320302]

    it("38 条专属词条除 8 条纯机制外都有展示数值", () => {
        const ids = Object.keys(UNIQUE_AFFIX_MAP).map(Number)
        expect(ids).toHaveLength(38)
        for (const id of ids) {
            const values = UNIQUE_AFFIX_MAP[id].values ?? []
            if (MECH_ONLY.includes(id)) {
                expect(values, `${id}`).toEqual([])
                continue
            }
            expect(values.length, `${id}`).toBeGreaterThan(0)
        }
    })

    it("2015 激昂号令：昂扬 4.3 / 技能速度 0.8，仅其他队友、终结技、无限", () => {
        const mapping = UNIQUE_AFFIX_MAP[2015]
        expect(mapping.values).toEqual([
            { name: "昂扬", value: 4.3 },
            { name: "技能速度", value: 0.8 },
        ])
        expect(mapping.team).toEqual({
            target: "other-teammates",
            trigger: "ultimate",
            duration: -1,
            stackScope: "per-source",
            maxStacksPerSource: 1,
        })
        expect(mapping.effect).toEqual({ target: "other-teammates", trigger: "ultimate", duration: -1 })
        expect(mapping.partial).toBeUndefined()
        expect(mapping.excluded).toBeUndefined()
    })

    it("审计表抽查：数值 / 表达式与目标触发", () => {
        expect(UNIQUE_AFFIX_MAP[2004].values).toEqual([{ name: "独立增伤", value: "0.02373*max(0,技能耐久-1)" }])
        expect(UNIQUE_AFFIX_MAP[2007].values).toEqual([{ name: "技能无视防御", value: 0.175, scope: { tag: "召唤物" } }])
        expect(UNIQUE_AFFIX_MAP[2007].effect).toMatchObject({ target: "summon" })
        expect(UNIQUE_AFFIX_MAP[2014].values).toEqual([{ name: "属性穿透", value: 0.75 }])
        expect(UNIQUE_AFFIX_MAP[2014].effect).toEqual({ target: "heal-target", trigger: "heal", duration: 8 })
        expect(UNIQUE_AFFIX_MAP[150401].values).toEqual([{ name: "技能速度", value: 1.2 }])
        expect(UNIQUE_AFFIX_MAP[180102].values).toHaveLength(4)
        expect(UNIQUE_AFFIX_MAP[180102].effect).toMatchObject({ target: "all-teammates" })
        expect(UNIQUE_AFFIX_MAP[240102].values).toEqual([{ name: "属性穿透", value: "0.0336*技能威力" }])
        expect(UNIQUE_AFFIX_MAP[310202].values).toEqual([{ name: "增伤", value: 2 }])
        expect(UNIQUE_AFFIX_MAP[420101].values).toEqual([{ name: "无视防御", value: 1, scope: { field: "星河寥落", tag: "下落攻击" } }])
        expect(UNIQUE_AFFIX_MAP[2030301].values).toEqual([
            { name: "独立增伤", value: "0.0584488560441114*技能威力", scope: { tag: "武器" } },
        ])
    })

    it("条件词条的 values 行带 scope：2007 / 180101 / 150203 / 2030301 / 2040601 / 420101", () => {
        expect(UNIQUE_AFFIX_MAP[2007].values).toEqual([{ name: "技能无视防御", value: 0.175, scope: { tag: "召唤物" } }])
        expect(UNIQUE_AFFIX_MAP[180101].values).toEqual([{ name: "技能独立增伤", value: 0.3, scope: { tag: "战技" } }])
        expect(UNIQUE_AFFIX_MAP[150203].values).toEqual([{ name: "技能伤害", value: 1.5, scope: { field: "月猎" } }])
        expect(UNIQUE_AFFIX_MAP[2030301].values).toEqual([
            { name: "独立增伤", value: "0.0584488560441114*技能威力", scope: { tag: "武器" } },
        ])
        expect(UNIQUE_AFFIX_MAP[2040601].values).toEqual([{ name: "武器伤害", value: 1.2, scope: { field: "子弹伤害" } }])
        expect(UNIQUE_AFFIX_MAP[420101].values).toEqual([{ name: "无视防御", value: 1, scope: { field: "星河寥落", tag: "下落攻击" } }])
    })

    it("scope 只作展示：移除 scope 后 resolveGearEffects 的 buffs / attrs 不变", () => {
        const cases: Array<{ affixId: number; slotId: number; options: TranscendResolveOptions }> = [
            { affixId: 2007, slotId: 7, options: { charElement: "水" } },
            { affixId: 180101, slotId: 1, options: { charId: 1801 } },
            { affixId: 150203, slotId: 2, options: { charId: 1502 } },
            { affixId: 2030301, slotId: 6, options: {} },
            { affixId: 2040601, slotId: 6, options: {} },
            { affixId: 420101, slotId: 2, options: { charId: 4201 } },
        ]

        for (const { affixId, slotId, options } of cases) {
            const saved = UNIQUE_AFFIX_MAP[affixId]
            const resolve = () => resolveGearEffects([gear({ slotId, affixId })], "main", options)
            const before = resolve()

            UNIQUE_AFFIX_MAP[affixId] = {
                ...saved,
                values: saved.values?.map(value => {
                    const clone = { ...value }
                    delete clone.scope
                    return clone
                }),
            }

            try {
                const after = resolve()

                expect(after.buffs, `${affixId}:buffs`).toEqual(before.buffs)
                expect(after.attrs, `${affixId}:attrs`).toEqual(before.attrs)
                expect(after.entries, `${affixId}:entries`).toEqual(before.entries)
            } finally {
                UNIQUE_AFFIX_MAP[affixId] = saved
            }
        }
    })

    it("生命回复宝石用 flat 展示值", () => {
        const cases: Array<[number, number]> = [
            [3202, 12],
            [3212, 24],
            [3222, 36],
            [3232, 48],
            [3242, 60],
        ]
        for (const [affixId, value] of cases) {
            expect(UNIQUE_AFFIX_MAP[affixId].values).toEqual([{ name: "生命回复", value, unit: "flat" }])
        }
    })

    it("事件事实迁入 effect 后不再出现在 excluded；仍有缺口的条目保留精确 token", () => {
        for (const id of [2001, 2004, 2005, 2006, 2009, 2010, 2013]) {
            expect(UNIQUE_AFFIX_MAP[id].partial, `${id}`).toBeUndefined()
        }
        expect(UNIQUE_AFFIX_MAP[2001].excluded).toBeUndefined()
        expect(UNIQUE_AFFIX_MAP[2001].effect).toEqual({ target: "self", trigger: "spiral-leap", duration: 20 })
        expect(UNIQUE_AFFIX_MAP[2008].excluded).toEqual(["目标减益", "覆盖率"])
        expect(UNIQUE_AFFIX_MAP[2008].coverage).toBeUndefined()
        expect(UNIQUE_AFFIX_MAP[2012].effect).toEqual({ target: "self", trigger: "weapon-hit", chance: 0.25, duration: 12, maxLayers: 10 })
        expect(UNIQUE_AFFIX_MAP[2012].excluded).toEqual(["随机属性仅暗", "武器命中覆盖率"])
        expect(UNIQUE_AFFIX_MAP[2013].excluded).toBeUndefined()
        expect(UNIQUE_AFFIX_MAP[420101].excluded).toEqual(["连击等级 S"])
        expect(UNIQUE_AFFIX_MAP[2040601].excluded).toContain("主弹片持续时间")
    })
})

describe("结果透出", () => {
    it("collectTranscendEffects 透出 warnings 与 modelingNotes", () => {
        const settings = createDefaultTranscendSettings()
        settings.enabled = true
        settings.mainGear = [gear({ slotId: 1, affixId: 101 })]
        const effects = collectTranscendEffects(settings, "main")
        expect(effects.warnings.join()).toContain("不能装备在装备位 1")
        expect(effects.modelingNotes).toEqual([])
    })
})

describe("U136 同 id 随机 + 淬炼双行", () => {
    /** 护胸（槽型 2）可装生命词条 1003：双行数值应逐条累加 */
    const lifeRow = (source: "random" | "tempering") => gear({ slotId: 2, affixId: 1003, rollLevel: 1, source })

    it("两条同 id 行都进入 attrs 累加与 BUFF 列表，来源类写入 key", () => {
        const single = resolveGearEffects([lifeRow("random")], "main")
        const twin = resolveGearEffects([lifeRow("random"), lifeRow("tempering")], "main")

        expect(twin.entries).toHaveLength(2)
        expect(twin.entries.map(item => [item.affixId, item.source])).toEqual([
            [1003, "random"],
            [1003, "tempering"],
        ])
        // 同档位同词条：两行之和 = 单行的两倍
        expect(twin.attrs.生命).toBeCloseTo(2 * single.attrs.生命, 12)
        expect(twin.buffs).toHaveLength(2)
        expect(twin.buffs.map(buff => buff.key)).toEqual(["gear:2:-:1003:other", "gear:2:-:1003:tempering"])
        expect(twin.buffs.map(buff => buff.buff.名称)).toEqual(["升华装备·护胸·生命", "升华装备·护胸·生命"])
        expect(twin.buffs.map(buff => buff.buff.source?.affixSourceClass)).toEqual(["other", "tempering"])
    })

    it("同来源重复仍按行身份去重；无来源旧条目保持原有去重", () => {
        expect(resolveGearEffects([lifeRow("random"), lifeRow("random")], "main").entries).toHaveLength(1)
        expect(resolveGearEffects([gear({ slotId: 2, affixId: 1003 }), gear({ slotId: 2, affixId: 1003 })], "main").entries).toHaveLength(1)
        // 孔位仍按 socketIndex 区分
        expect(
            resolveGearEffects(
                [gear({ slotId: 2, affixId: 1003, socketIndex: 0 }), gear({ slotId: 2, affixId: 1003, socketIndex: 1 })],
                "main"
            ).entries
        ).toHaveLength(2)
    })

    it("非归一化输入按来源类归一：无来源 / base / random 同 id 仍只计一次", () => {
        // v1 无来源行 + 同 id 显式 random 行（工厂容错契约：未归一化不得双计）
        expect(
            resolveGearEffects([gear({ slotId: 2, affixId: 1003 }), gear({ slotId: 2, affixId: 1003, source: "random" })], "main").entries
        ).toHaveLength(1)
        // 基础词条 103（护胸基础）+ 同 id 显式 random 行
        expect(
            resolveGearEffects(
                [gear({ slotId: 2, affixId: 103, source: "base" }), gear({ slotId: 2, affixId: 103, source: "random" })],
                "main"
            ).entries
        ).toHaveLength(1)
        // 非法 / 含分隔符的 source 归入 other，不能伪造淬炼身份
        const malformed = gear({ slotId: 2, affixId: 1003 })
        ;(malformed as { source?: unknown }).source = "tempering:gear:2"
        expect(resolveGearEffects([malformed, lifeRow("random")], "main").entries).toHaveLength(1)
        expect(resolveGearEffects([malformed, lifeRow("tempering")], "main").entries).toHaveLength(2)
    })

    it("同 id 跨两个装备位分别计入（装备位仍在行身份里）", () => {
        const result = resolveGearEffects(
            [gear({ slotId: 3, affixId: 1001 }), gear({ slotId: 5, affixId: 1001, source: "random" })],
            "main"
        )
        expect(result.entries.map(item => item.slotId)).toEqual([3, 5])
        expect(result.entries).toHaveLength(2)
    })
})
