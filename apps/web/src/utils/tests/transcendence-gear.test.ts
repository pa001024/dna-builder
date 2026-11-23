import { describe, expect, it } from "vitest"
import { translateGameText } from "@/composables/useGameText"
import { resolveAffixValue } from "@/data"
import type { DnaSeasonAffix, DnaSeasonAffixAttr } from "@/data/d/dnaseasonequip.data"
import { affixes, uniqueEquips } from "@/data/d/dnaseasonequip.data"
import {
    calculateAffixValue,
    collectModeledValues,
    formatAffixDisplayValue,
    formatAffixRange,
    formatModeledAffixValue,
    formatPlainRange,
    getAffixEffectMeta,
    getAffixEffectText,
    getAffixModeledBadge,
    getAffixModeledSummary,
    getAffixModeledValues,
    getAffixSearchText,
    getAffixSlotIds,
    getAffixSummary,
    getAffixSummaryParts,
    getAffixTeammateMeta,
    getAffixUniqueEquips,
    getAffixValueHint,
    getModeledValueName,
    isEffectOnlyAffix,
    type ModeledBuffLike,
} from "@/utils/transcendence-gear"

/** 百分比属性 */
const RATE_ATTR: DnaSeasonAffixAttr = { attr: "攻击", addType: "Rate" }
/** 固定值属性 */
const VALUE_ATTR: DnaSeasonAffixAttr = { attr: "攻击", addType: "Value" }

/** 构造只带摘要相关字段的词条 */
function makeAffix(patch: Partial<DnaSeasonAffix>): DnaSeasonAffix {
    return { id: 999998, plan: 1, minValue: 1, maxValue: 1, totalValueLevel: 1, ...patch }
}

/** 按名称查 BUFF 的注入式查询 */
function lookupBuffs(buffs: Record<string, ModeledBuffLike>): (name: string) => ModeledBuffLike | undefined {
    return name => buffs[name]
}

describe("formatAffixRange 单值折叠", () => {
    it("min === max 时只显示一个值", () => {
        expect(formatAffixRange(RATE_ATTR, 0.5, 0.5)).toBe("+50%")
        expect(formatAffixRange(VALUE_ATTR, 2, 2)).toBe("+2")
        expect(formatAffixRange(VALUE_ATTR, -2, -2)).toBe("-2")
    })

    it("真正的随机属性保留区间", () => {
        expect(formatAffixRange(RATE_ATTR, 0.1, 0.2)).toBe("+10% ~ +20%")
        expect(formatAffixRange(VALUE_ATTR, 2, 5)).toBe("+2 ~ +5")
    })

    it("isPercent 同样按百分比展示", () => {
        expect(formatAffixRange({ ...VALUE_ATTR, isPercent: true }, 0.25, 0.25)).toBe("+25%")
    })

    it("上游 0.5 步进：84.996% 显示 +84.5%（floor + 半格，不是四舍五入到 85.0）", () => {
        expect(formatAffixDisplayValue(RATE_ATTR, 0.84996)).toBe("+84.5%")
        expect(formatAffixDisplayValue(RATE_ATTR, 0.85)).toBe("+85%")
        expect(formatAffixDisplayValue(RATE_ATTR, 0.934956)).toBe("+93%")
        expect(formatAffixDisplayValue(RATE_ATTR, -0.141322)).toBe("-14%")
        expect(formatAffixDisplayValue(VALUE_ATTR, 2.3456)).toBe("+2.35")
    })

    it("区间两端同桶才启用 0.05 细精度，否则 coarse", () => {
        expect(formatAffixRange(RATE_ATTR, 0.1234, 0.1235)).toBe("+12.3% ~ +12.35%")
        expect(formatAffixRange(RATE_ATTR, 0.1234, 0.1289)).toBe("+12% ~ +12.5%")
        expect(formatAffixRange(RATE_ATTR, 0.122, 0.1234)).toBe("+12.2% ~ +12.35%")
    })
})

describe("formatPlainRange 单值折叠", () => {
    it("min === max 时只显示一个值", () => {
        expect(formatPlainRange(3, 3)).toBe("3")
        expect(formatPlainRange(3.456, 3.456)).toBe("3.46")
    })

    it("真正的区间保留上限", () => {
        expect(formatPlainRange(3, 5)).toBe("3 ~ 5")
        expect(formatPlainRange(1.234, 5.678)).toBe("1.23 ~ 5.68")
    })
})

describe("collectModeledValues 手写建模数值展开", () => {
    it("空 buff 列表或 BUFF 无数值表时为空", () => {
        expect(collectModeledValues([], lookupBuffs({}))).toEqual([])
        expect(collectModeledValues(["missing"], lookupBuffs({}))).toEqual([])
        expect(collectModeledValues(["empty"], lookupBuffs({ empty: {} }))).toEqual([])
    })

    it("数组值按 LeveledBuff 默认等级取值", () => {
        const values = lookupBuffs({
            byMax: { attr: { 攻击: [1, 2, 3] }, mx: 3 },
            byDefault: { attr: { 攻击: [1, 2, 3] }, dx: 2, mx: 3 },
            byLx: { attr: { 攻击: [10, 20, 30] }, lx: 2, mx: 3 },
            noLevel: { attr: { 攻击: [1, 2] } },
        })

        expect(collectModeledValues(["byMax"], values)).toEqual([{ name: "攻击", value: 3 }])
        expect(collectModeledValues(["byDefault"], values)).toEqual([{ name: "攻击", value: 2 }])
        expect(collectModeledValues(["byLx"], values)).toEqual([{ name: "攻击", value: 20 }])
        expect(collectModeledValues(["noLevel"], values)).toEqual([{ name: "攻击", value: 1 }])
    })

    it("数组越界时跳过该行", () => {
        expect(collectModeledValues(["empty"], lookupBuffs({ empty: { attr: { 攻击: [] } } }))).toEqual([])
    })

    it("剥掉 @ 前缀并按属性名去重", () => {
        const rows = collectModeledValues(
            ["first", "second"],
            lookupBuffs({
                first: { attr: { "@攻击": 1, 防御: 2 } },
                second: { attr: { 攻击: 9 } },
            })
        )

        expect(rows).toEqual([
            { name: "攻击", value: 1 },
            { name: "防御", value: 2 },
        ])
    })

    it("字符串表达式原样保留", () => {
        const expression = "0.02373*max(0,技能耐久-1)"

        expect(collectModeledValues(["expr"], lookupBuffs({ expr: { attr: { 元素增伤: expression } } }))).toEqual([
            { name: "元素增伤", value: expression },
        ])
    })
})

describe("getAffixModeledValues 真实数据", () => {
    it("手写建模词缀返回权威展示值", () => {
        expect(getAffixModeledValues(2008)).toEqual([{ name: "火属性弱点", value: 0.54, unit: "percent" }])
        expect(getAffixModeledValues(2002)).toEqual([{ name: "近战普攻独立增伤", value: 0.32, unit: "percent" }])
    })

    it("2015 激昂号令返回昂扬 4.3 / 技能速度 0.8", () => {
        expect(getAffixModeledValues(2015)).toEqual([
            { name: "昂扬", value: 4.3, unit: "percent" },
            { name: "技能速度", value: 0.8, unit: "percent" },
        ])
    })

    it("生命回复宝石带 flat 单位", () => {
        expect(getAffixModeledValues(3202)).toEqual([{ name: "生命回复", value: 12, unit: "flat" }])
    })

    it("无映射词缀返回空数组", () => {
        expect(getAffixModeledValues(101)).toEqual([])
    })
})

describe("formatModeledAffixValue 三态", () => {
    it("百分比按比例 ×100，最多 3 位小数并去尾零", () => {
        expect(formatModeledAffixValue({ name: "昂扬", value: 4.3, unit: "percent" })).toBe("+430%")
        expect(formatModeledAffixValue({ name: "属性穿透", value: 0.175, unit: "percent" })).toBe("+17.5%")
        expect(formatModeledAffixValue({ name: "独立增伤", value: 0.02373, unit: "percent" })).toBe("+2.373%")
    })

    it("绝对值去尾零不加百分号", () => {
        expect(formatModeledAffixValue({ name: "生命回复", value: 12, unit: "flat" })).toBe("+12")
        expect(formatModeledAffixValue({ name: "生命回复", value: 12.5, unit: "flat" })).toBe("+12.5")
    })

    it("表达式原样返回；display 优先", () => {
        expect(formatModeledAffixValue({ name: "独立增伤", value: "0.0336*技能威力" })).toBe("0.0336*技能威力")
        expect(formatModeledAffixValue({ name: "生命回复", value: 12, unit: "flat", display: "生命 +12" })).toBe("生命 +12")
    })
})

describe("效果事件元数据", () => {
    it("2015：仅其他队友 / 终结技 / 无限 / 每来源一份", () => {
        expect(getAffixEffectMeta(2015)).toEqual({ target: "other-teammates", trigger: "ultimate", duration: -1 })
        expect(getAffixTeammateMeta(2015)).toEqual({
            target: "other-teammates",
            trigger: "ultimate",
            duration: -1,
            stackScope: "per-source",
            maxStacksPerSource: 1,
        })
    })

    it("事件事实进入 effect（2008 概率 / 持续，2012 概率 / 层数）", () => {
        expect(getAffixEffectMeta(2008)).toEqual({ target: "enemy", trigger: "skill-hit", chance: 0.25, duration: 8 })
        expect(getAffixEffectMeta(2012)).toEqual({ target: "self", trigger: "weapon-hit", chance: 0.25, duration: 12, maxLayers: 10 })
    })

    it("无事件元数据的词缀返回 undefined", () => {
        expect(getAffixEffectMeta(101)).toBeUndefined()
        expect(getAffixTeammateMeta(101)).toBeUndefined()
    })
})

describe("U93a 展示数值抽查（DISPLAY 条目）", () => {
    it("210101 / 310201 / 320301 / 320302 / 2012", () => {
        // 210101 / 320302 的额外一击倍率不是面板属性（U127），只登记 excluded token
        expect(getAffixModeledValues(210101)).toEqual([])
        expect(getAffixModeledValues(310201)).toEqual([])
        expect(getAffixModeledValues(320301)).toEqual([
            { name: "速射模式倍率", value: 3.193, unit: "percent", labelKey: "db-transcendence.gear.mode_rapid" },
            { name: "贯穿模式倍率", value: 4.089, unit: "percent", labelKey: "db-transcendence.gear.mode_pierce" },
            { name: "轰炸模式倍率", value: 5.082, unit: "percent", labelKey: "db-transcendence.gear.mode_bombard" },
        ])
        expect(getAffixModeledValues(320302)).toEqual([])
        expect(getAffixModeledValues(2012)).toEqual([{ name: "暗属性追伤", value: 0.64, unit: "percent" }])
    })
})

describe("建模徽章与展示名", () => {
    it("exact 条目为 modeled_exact，partial 条目为 partial，无建模值不显示", () => {
        expect(getAffixModeledBadge(2001)).toBe("exact")
        expect(getAffixModeledBadge(150401)).toBe("partial")
        expect(getAffixModeledBadge(2015)).toBe("exact")
        expect(getAffixModeledBadge(240101)).toBeNull()
        expect(getAffixModeledBadge(101)).toBeNull()
    })

    it("labelKey 优先于 name；无 labelKey 走游戏原文", () => {
        const translate = (key: string) => `T:${key}`
        const gameText = (text: string) => `G:${text}`

        expect(getModeledValueName({ name: "速射模式倍率", value: 3.193, labelKey: "mode.rapid" }, translate, gameText)).toBe(
            "T:mode.rapid"
        )
        expect(getModeledValueName({ name: "昂扬", value: 4.3 }, translate, gameText)).toBe("G:昂扬")
    })

    it("建模摘要：无属性词条用 labelKey 本地化，有属性词条返回空串", () => {
        const translate = (key: string) =>
            ({
                "db-transcendence.gear.mode_rapid": "Rapid",
                "db-transcendence.gear.mode_pierce": "Pierce",
                "db-transcendence.gear.mode_bombard": "Bombard",
            })[key] ?? key
        const gameText = (text: string) => text
        const byId = (id: number) => affixes.find(affix => affix.id === id)!

        expect(getAffixModeledSummary(byId(320301), translate, gameText)).toBe("Rapid · Pierce · Bombard")
        expect(getAffixModeledSummary(byId(2008), translate, gameText)).toBe("火属性弱点")
        expect(getAffixModeledSummary(byId(3202), translate, gameText)).toBe("")
    })
})

describe("values 行作用域标注（字段 / 标签限定）", () => {
    const byId = (id: number) => affixes.find(affix => affix.id === id)!
    /** 作用域文案替身：验证 key 分支与插值参数 */
    const translate = (key: string, options?: Record<string, unknown>) => {
        if (key === "db-transcendence.gear.modeled_scope_field") return `FieldLimit(${options?.value})`
        if (key === "db-transcendence.gear.modeled_scope_tag") return `TagLimit(${options?.value})`
        return key
    }
    const gameText = (text: string) => text

    it("六条条件词条的展示行带 scope，数值不变", () => {
        expect(getAffixModeledValues(2007)).toEqual([{ name: "技能无视防御", value: 0.175, unit: "percent", scope: { tag: "召唤物" } }])
        expect(getAffixModeledValues(180101)).toEqual([{ name: "技能独立增伤", value: 0.3, unit: "percent", scope: { tag: "战技" } }])
        expect(getAffixModeledValues(150203)).toEqual([{ name: "技能伤害", value: 1.5, unit: "percent", scope: { field: "月猎" } }])
        expect(getAffixModeledValues(2030301)).toEqual([
            {
                name: "独立增伤",
                value: "0.0584488560441114*技能威力",
                unit: "percent",
                scope: { tag: "武器" },
            },
        ])
        expect(getAffixModeledValues(2040601)).toEqual([{ name: "武器伤害", value: 1.2, unit: "percent", scope: { field: "子弹伤害" } }])
        expect(getAffixModeledValues(420101)).toEqual([
            { name: "无视防御", value: 1, unit: "percent", scope: { field: "星河寥落", tag: "下落攻击" } },
        ])
    })

    it("展示名 / 摘要 / 列表数值提示都带限定范围", () => {
        const item = getAffixModeledValues(150203)[0]

        expect(getModeledValueName(item, translate, gameText)).toBe("技能伤害（FieldLimit(月猎)）")
        expect(getAffixModeledSummary(byId(150203), translate, gameText)).toBe("技能伤害（FieldLimit(月猎)）")
        expect(getAffixValueHint(byId(150203), translate, gameText)).toBe("技能伤害（FieldLimit(月猎)） +150%")
        expect(getAffixValueHint(byId(2030301), translate, gameText)).toBe("独立增伤（TagLimit(武器)） 0.0584488560441114*技能威力")
    })

    it("双维 scope（field + tag）组合展示", () => {
        const item = getAffixModeledValues(420101)[0]

        expect(getModeledValueName(item, translate, gameText)).toBe("无视防御（FieldLimit(星河寥落) + TagLimit(下落攻击)）")
        expect(getAffixValueHint(byId(420101), translate, gameText)).toBe("无视防御（FieldLimit(星河寥落) + TagLimit(下落攻击)） +100%")
    })

    it("不传翻译函数时数值提示保持旧口径（scope 不泄漏中文）", () => {
        expect(getAffixValueHint(byId(150203))).toBe("+150%")
        expect(getAffixValueHint(byId(2030301))).toBe("0.0584488560441114*技能威力")
        expect(getAffixValueHint(byId(420101))).toBe("+100%")
    })
})

describe("U139 列表数值提示补属性名（key + value）", () => {
    const byId = (id: number) => affixes.find(affix => affix.id === id)!
    /** zh-CN 真实口径的作用域文案：与 translation.json 一致 */
    const translate = (key: string, options?: Record<string, unknown>) => {
        if (key === "db-transcendence.gear.modeled_scope_field") return `字段名限定：${options?.value}`
        if (key === "db-transcendence.gear.modeled_scope_tag") return `字段标签限定：${options?.value}`

        return key
    }
    const gameText = (text: string) => text

    it("无 scope：属性名 + 数值（2002）", () => {
        expect(getAffixValueHint(byId(2002), translate, gameText)).toBe("近战普攻独立增伤 +32%")
    })

    it("单维 scope：属性名带字段标签限定（180101）", () => {
        expect(getAffixValueHint(byId(180101), translate, gameText)).toBe("技能独立增伤（字段标签限定：战技） +30%")
    })

    it("双维 scope：属性名带字段名 + 字段标签限定（420101）", () => {
        expect(getAffixValueHint(byId(420101), translate, gameText)).toBe(
            "无视防御（字段名限定：星河寥落 + 字段标签限定：下落攻击） +100%"
        )
    })

    it("多项仍用 ` · ` 连接（2015）", () => {
        expect(getAffixValueHint(byId(2015), translate, gameText)).toBe("昂扬 +430% · 技能速度 +80%")
    })

    it("labelKey 词条名称走界面文案（320301）", () => {
        const labelTranslate = (key: string) =>
            ({
                "db-transcendence.gear.mode_rapid": "速射模式",
                "db-transcendence.gear.mode_pierce": "贯穿模式",
                "db-transcendence.gear.mode_bombard": "轰炸模式",
            })[key] ?? key

        expect(getAffixValueHint(byId(320301), labelTranslate, gameText)).toBe(
            "速射模式 +319.3% · 贯穿模式 +408.9% · 轰炸模式 +508.2%"
        )
    })

    it("无翻译函数保持旧纯数值口径", () => {
        expect(getAffixValueHint(byId(2002))).toBe("+32%")
        expect(getAffixValueHint(byId(180101))).toBe("+30%")
        expect(getAffixValueHint(byId(420101))).toBe("+100%")
    })

    it("非对称契约：只给 translate 或只给 gameText 时回退纯数值", () => {
        expect(getAffixValueHint(byId(420101), translate)).toBe("+100%")
        expect(getAffixValueHint(byId(420101), undefined, gameText)).toBe("+100%")
    })
})

describe("getAffixSummaryParts 摘要分段", () => {
    it("属性词缀逐条返回属性名", () => {
        const affix = affixes.find(item => item.id === 101)

        expect(affix).toBeDefined()
        expect(getAffixSummaryParts(affix!)).toEqual(["攻击"])
        expect(getAffixSummary(affix!)).toBe("攻击")
    })

    it("多属性词缀返回多段，由调用方逐条翻译", () => {
        const affix = makeAffix({
            addAttrs: [
                { attr: "攻击", addType: "Rate" },
                { attr: "防御", addType: "Value" },
            ],
        })
        const calls: string[] = []
        const t = (key: string) => {
            calls.push(key)
            return `[${key}]`
        }

        expect(getAffixSummaryParts(affix)).toEqual(["攻击", "防御"])
        expect(
            getAffixSummaryParts(affix)
                .map(part => translateGameText(t, part))
                .join(" · ")
        ).toBe("[攻击] · [防御]")
        expect(calls).toEqual(["攻击", "防御"])
    })

    it("手写建模词缀返回建模属性名，多属性逐条返回", () => {
        expect(getAffixSummaryParts({ id: 2008 } as DnaSeasonAffix)).toEqual(["火属性弱点"])
        expect(getAffixSummaryParts({ id: 2002 } as DnaSeasonAffix)).toEqual(["近战普攻独立增伤"])
    })

    it("无属性块时回退描述，空描述返回空数组", () => {
        const affix = affixes.find(item => item.id === 1038)

        expect(affix).toBeDefined()
        expect(getAffixSummaryParts(affix!)).toEqual(["战技技能等级"])
        expect(getAffixSummaryParts(makeAffix({ id: 999999 }))).toEqual([])
    })

    it("getAffixSummary 用 · 连接分段", () => {
        const affix = makeAffix({
            addAttrs: [
                { attr: "攻击", addType: "Rate" },
                { attr: "防御", addType: "Value" },
            ],
        })

        expect(getAffixSummary(affix)).toBe("攻击 · 防御")
    })
})

describe("专属 desc-only 效果文本", () => {
    const byId = (id: number) => affixes.find(affix => affix.id === id)!

    it("Plan 4 有描述、无属性块 → 效果词条（2001/2003/2008/240101）", () => {
        for (const id of [2001, 2003, 2008, 240101]) {
            expect(isEffectOnlyAffix(byId(id))).toBe(true)
            expect(getAffixEffectText(byId(id))).not.toBe("")
        }
    })

    it("Plan 4 有属性、无描述（3101）不是效果词条，属性摘要保持不变", () => {
        const affix = byId(3101)

        expect(isEffectOnlyAffix(affix)).toBe(false)
        expect(getAffixEffectText(affix)).toBe("")
        expect(getAffixSummaryParts(affix)).toEqual(["火属性攻击"])
    })

    it("普通词条不是效果词条", () => {
        expect(isEffectOnlyAffix(byId(101))).toBe(false)
        expect(getAffixEffectText(byId(101))).toBe("")
    })

    it("效果文本先翻译再剥 <H> 样式标签", () => {
        const affix = byId(240101)
        const translate = (text: string | undefined | null) => `[${text ?? ""}]`

        expect(isEffectOnlyAffix(affix)).toBe(true)
        expect(getAffixEffectText(affix)).toBe("扶疏终结技等级+10，[九针治未]提供的技能威力提高移除上限。")
        expect(getAffixEffectText(affix, translate)).toBe("[扶疏终结技等级+10，[九针治未]提供的技能威力提高移除上限。]")
    })

    it("先翻译再剥标签：translate 收到的是带 <H> 的原始 desc", () => {
        const affix = byId(240101)
        const received: string[] = []
        const translate = (text: string | undefined | null) => {
            received.push(text ?? "")
            return text ?? ""
        }
        const text = getAffixEffectText(affix, translate)

        expect(received).toEqual([affix.desc])
        expect(received[0]).toContain("<H>")
        expect(text).not.toContain("<H>")
        expect(text).toBe("扶疏终结技等级+10，[九针治未]提供的技能威力提高移除上限。")
    })
})

describe("列表数值提示：数据属性优先，手写词条回退展示值", () => {
    const byId = (id: number) => affixes.find(affix => affix.id === id)!

    it("效果词条展示权威建模值（2008）", () => {
        expect(isEffectOnlyAffix(byId(2008))).toBe(true)
        expect(getAffixValueHint(byId(2008))).toBe("+54%")
        expect(getAffixModeledValues(2008)).toEqual([{ name: "火属性弱点", value: 0.54, unit: "percent" }])
        expect(getAffixSummaryParts(byId(2008))).toEqual(["火属性弱点"])
    })

    it("2015 列表摘要含 +430% 与 +80%", () => {
        expect(getAffixValueHint(byId(2015))).toBe("+430% · +80%")
    })

    it("效果词条没有建模值时数值与徽章都没有（240101）", () => {
        expect(isEffectOnlyAffix(byId(240101))).toBe(true)
        expect(getAffixValueHint(byId(240101))).toBe("")
        expect(getAffixModeledValues(240101)).toEqual([])
    })

    it("attr-only 专属词条仍是 exact 数值（3101）", () => {
        expect(isEffectOnlyAffix(byId(3101))).toBe(false)
        expect(getAffixValueHint(byId(3101))).not.toBe("")
    })

    it("普通数据词条的区间不被误伤（101）", () => {
        expect(getAffixValueHint(byId(101))).toBe("+91.5% ~ +262%")
    })

    it("镶嵌宝石的数据属性数值保留（3202）", () => {
        expect(getAffixValueHint(byId(3202))).toBe("+12")
    })

    it("非百分比区间沿用 2 位小数（1059 生命回复）", () => {
        expect(getAffixValueHint(byId(1059))).toBe("+50 ~ +143.04")
    })

    it("320301 三种模式倍率合并展示", () => {
        expect(getAffixValueHint(byId(320301))).toBe("+319.3% · +408.9% · +508.2%")
    })
})

describe("getAffixSearchText 检索正文", () => {
    it("属性词缀包含属性名与属性键", () => {
        const affix = makeAffix({ addAttrs: [{ attr: "攻击", addType: "Rate" }] })

        expect(getAffixSearchText(affix)).toContain("攻击")
    })

    it("效果词条包含原始描述与建模属性名", () => {
        const affix = affixes.find(item => item.id === 2008)!

        expect(getAffixSearchText(affix)).toContain("火属性弱点")
        expect(getAffixSearchText(affix)).not.toContain("火属性增伤")
    })

    it("手写建模词缀包含建模属性名", () => {
        const affix = affixes.find(item => item.id === 2008)!

        expect(getAffixSearchText(affix)).toContain("火属性弱点")
    })

    it("空词条返回空串", () => {
        expect(getAffixSearchText(makeAffix({ id: 999999 }))).toBe("")
    })
})

describe("getAffixSearchText 译名检索", () => {
    /** 只翻译「同律近战暴伤」的假翻译函数，模拟界面 gt */
    function translateOfficialName(text: string): string {
        return text === "同律近战暴伤" ? "同律近战武器暴击伤害" : text
    }

    it("缺省只收原文，不收译名", () => {
        const affix = makeAffix({ addAttrs: [{ attr: "同律近战暴伤", addType: "Rate" }] })

        expect(getAffixSearchText(affix)).toContain("同律近战暴伤")
        expect(getAffixSearchText(affix)).not.toContain("同律近战武器暴击伤害")
    })

    it("传入翻译函数后原文与官方译名都进检索正文", () => {
        const affix = makeAffix({ addAttrs: [{ attr: "同律近战暴伤", addType: "Rate" }] })
        const searchText = getAffixSearchText(affix, translateOfficialName)

        expect(searchText).toContain("同律近战暴伤")
        expect(searchText).toContain("同律近战武器暴击伤害")
    })

    it("效果描述译名剥掉样式标签后参与匹配", () => {
        const affix = makeAffix({ plan: 4, desc: "原始效果" })
        const searchText = getAffixSearchText(affix, text => (text === "原始效果" ? "<H>本地化效果</H>" : text))

        expect(searchText).toContain("本地化效果")
    })

    it("建模属性名同样收译名", () => {
        const affix = affixes.find(item => item.id === 2008)!
        const searchText = getAffixSearchText(affix, text => (text === "火属性弱点" ? "Pyro Damage Taken increased" : text))

        expect(searchText).toContain("火属性弱点")
        expect(searchText).toContain("Pyro Damage Taken increased")
    })

    it("320301 模式名按 labelKey 译文可检索，中文原名仍可命中", () => {
        const affix = affixes.find(item => item.id === 320301)!
        const modes: Record<string, string> = {
            "db-transcendence.gear.mode_rapid": "Rapid Fire mode",
            "db-transcendence.gear.mode_pierce": "Piercing mode",
            "db-transcendence.gear.mode_bombard": "Bombardment mode",
        }
        const en = getAffixSearchText(affix, undefined, key => modes[key] ?? key)

        expect(en).toContain("Rapid Fire mode")
        expect(en).toContain("Piercing mode")
        expect(en).toContain("Bombardment mode")
        expect(en).toContain("速射模式倍率")
        expect(getAffixSearchText(affix)).toContain("轰炸模式倍率")
    })
})

describe("DB 计算器与 resolveAffixValue 同口径", () => {
    it("太古缺 ancientFunc：基数取 MaxValue（不回退 rolled）", () => {
        const affix = affixes.find(item => item.id === 101)!
        const result = calculateAffixValue(affix, { rollLevel: 25, masterworkLevel: 2, ancient: true, finalMasterwork: false })
        expect(result.ancientApplied).toBe(true)
        expect(result.afterAncient).toBeCloseTo(affix.maxValue, 9)
        expect(result.final).toBeCloseTo(affix.maxValue * 1.01 ** 2, 9)
    })

    it("1043 太古 + 精锻 10 + 最终：与数据层逐段一致", () => {
        const affix = affixes.find(item => item.id === 1043)!
        const calc = calculateAffixValue(affix, { rollLevel: 500, masterworkLevel: 10, ancient: true, finalMasterwork: true })
        const data = resolveAffixValue(affix, {
            affixId: 1043,
            slotId: 0,
            rollLevel: 500,
            masterworkLevel: 10,
            ancient: true,
            finalMasterwork: true,
        })
        expect(calc.rolled).toBeCloseTo(data.rolled, 12)
        expect(calc.afterAncient).toBeCloseTo(data.afterAncient, 12)
        expect(calc.afterMasterwork).toBeCloseTo(data.afterMasterwork, 12)
        expect(calc.final).toBeCloseTo(data.final, 12)
    })
})

describe("唯一装所属反查（1.8 前遗留行已过滤）", () => {
    it("词缀 2001 的唯一装只有 140002，适用槽型只有 4", () => {
        expect(getAffixUniqueEquips(2001).map(equip => equip.id)).toEqual([140002])
        expect(getAffixSlotIds(affixes.find(affix => affix.id === 2001)!)).toEqual([4])
    })

    it("技能等级词条按显式 slotTypes 显示已知部位", () => {
        expect(getAffixSlotIds(affixes.find(affix => affix.id === 1038)!)).toEqual([3])
        expect(getAffixSlotIds(affixes.find(affix => affix.id === 1039)!)).toEqual([5])
        expect(getAffixSlotIds(affixes.find(affix => affix.id === 1040)!)).toEqual([6])
        expect(getAffixSlotIds(affixes.find(affix => affix.id === 1510)!)).toEqual([8])
        expect(getAffixSlotIds(affixes.find(affix => affix.id === 1511)!)).toEqual([9])
        expect(getAffixSlotIds(affixes.find(affix => affix.id === 1512)!)).toEqual([10])
    })

    it("词缀 240101 的唯一装只有 210001", () => {
        expect(getAffixUniqueEquips(240101).map(equip => equip.id)).toEqual([210001])
    })

    it("唯一装目录只含 32 件现行装备，无 1001–3003 遗留 id", () => {
        expect(uniqueEquips).toHaveLength(32)
        expect(uniqueEquips.some(equip => equip.id === 1001)).toBe(false)
        expect(uniqueEquips.some(equip => equip.name === "泽被万物护符" && equip.slot === 1)).toBe(false)
    })
})
