import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { createInstance } from "i18next"
import i18nextVue from "i18next-vue"
import { beforeAll, describe, expect, it } from "vitest"
import { createSSRApp, defineComponent, h } from "vue"
import { renderToString } from "vue/server-renderer"
import TranscendGearAffixRow from "@/components/transcend-build/TranscendGearAffixRow.vue"
import { affixes, resolveAffixValue, type TranscendGearAffixRoll, type TranscendGearItemConfig, uniqueEquips } from "@/data"
import { translationsEn, translationsTc } from "@/data/d/translations.data"
import { formatModeledAffixValue, getAffixModeledValues } from "@/utils/transcendence-gear"
import { type GearAffixLine, getItemAffixLines, getUniqueAffixDetailRows } from "./display"

/**
 * U103：暗金专属词条的属性键值对行。专属行不再内联裸数值，
 * 非预览时另起一行展示「技能等级规范名 + 等级 / 属性名 + 结算值 / 建模名 + 值」。
 * U123：技能等级名称走数据层规范名 → 官方 TextMap 译名，不再手写「战技 / 终结技 / 被动」。
 */

const translate = (key: string, options?: Record<string, unknown>) => {
    if (key === "db-transcendence.gear.calc_skill_level") return `技能等级 +${options?.value ?? ""}`
    if (key === "db-transcendence.gear.modeled_scope_field") return `字段名限定：${options?.value ?? ""}`
    if (key === "db-transcendence.gear.modeled_scope_tag") return `字段标签限定：${options?.value ?? ""}`

    return key
}
const gameText = (text: string) => text
/** 官方 TextMap 译名夹具：按语言包反查，未收录回退原文 */
const packText = (pack: Record<string, string>) => (text: string) => pack[text] ?? text
const affixById = (id: number) => affixes.find(affix => affix.id === id)!

function roll(affixId: number, patch: Partial<TranscendGearAffixRoll> = {}): TranscendGearAffixRoll {
    return { affixId, rollLevel: 50, masterworkLevel: 0, ancient: false, finalMasterwork: false, ...patch }
}

function resolvedText(affixId: number, patch: Partial<TranscendGearAffixRoll> = {}, slotId = 0): string {
    const entry = roll(affixId, patch)

    return `+${Math.round(resolveAffixValue(affixById(affixId), { slotId, ...entry }).final)}`
}

describe("getUniqueAffixDetailRows：专属判定（Plan 4 ≠ unique）", () => {
    it("宝石 Plan 4 词条（3101 / 3643）即使直接调用也返回空数组", () => {
        for (const id of [3101, 3643]) {
            expect(getUniqueAffixDetailRows(affixById(id), roll(id, { rollLevel: 1 }), 1, translate, gameText), String(id)).toEqual([])
        }
    })

    it("未被 uniqueEquips 引用的 Plan 4 词条（150401）同样视为非专属", () => {
        expect(getUniqueAffixDetailRows(affixById(150401), roll(150401, { rollLevel: 1 }), 1, translate, gameText)).toEqual([])
    })
})

describe("getUniqueAffixDetailRows：建模行作用域标注", () => {
    it("单维 scope：明细行 name 带限定范围，key 仍是原始建模名", () => {
        const rows = getUniqueAffixDetailRows(affixById(2007), roll(2007, { rollLevel: 1 }), 7, translate, gameText)

        expect(rows).toHaveLength(1)
        expect(rows[0].name).toBe("技能无视防御（字段标签限定：召唤物）")
        expect(rows[0].key).toBe("modeled:0:技能无视防御")
    })

    it("双维 scope（field + tag）：组合标注，key 不变", () => {
        // 420101 本体走技能等级分支；去掉 addSkillLevel 后验证同一 scope 的建模行渲染
        const affix = { ...affixById(420101), addSkillLevel: undefined }
        const rows = getUniqueAffixDetailRows(affix, roll(420101, { rollLevel: 1 }), 2, translate, gameText)

        expect(rows).toHaveLength(1)
        expect(rows[0].name).toBe("无视防御（字段名限定：星河寥落 + 字段标签限定：下落攻击）")
        expect(rows[0].key).toBe("modeled:0:无视防御")
    })
})

describe("getUniqueAffixDetailRows：技能等级专属", () => {
    it("180101（菲娜战技专属）：单行「战技技能等级 +N」，与 resolve 值一致（本词条无太古公式，正确值 +10）", () => {
        const rows = getUniqueAffixDetailRows(affixById(180101), roll(180101, { rollLevel: 1 }), 2, translate, gameText)

        expect(rows).toHaveLength(1)
        expect(rows[0].name).toBe("战技技能等级")
        expect(rows[0].value).toBe(resolvedText(180101, { rollLevel: 1 }, 2))
        expect(rows[0].value).toBe("+10")
    })

    it("180102（菲娜终结技专属）：name 为「终结技技能等级」；skillIds 同槽归并不重复成行", () => {
        const rows = getUniqueAffixDetailRows(affixById(180102), roll(180102, { rollLevel: 1 }), 2, translate, gameText)

        expect(rows).toHaveLength(1)
        expect(rows[0].name).toBe("终结技技能等级")
        expect(rows[0].value).toBe("+10")
    })

    it("多技能类型 → 多行（合成 skillTypes：Skill1 + Skill2）", () => {
        const multi = { ...affixById(180101), addSkillLevel: { skillTypes: ["Skill1", "Skill2"] } }
        const rows = getUniqueAffixDetailRows(multi, roll(180101, { rollLevel: 1 }), 2, translate, gameText)

        expect(rows.map(row => row.name)).toEqual(["战技技能等级", "终结技技能等级"])
    })

    it("技能等级名称取官方 TextMap 译名：zh-CN / zh-TW / en 与官方一致，不手写「战技」标签", () => {
        const zh = getUniqueAffixDetailRows(affixById(180101), roll(180101, { rollLevel: 1 }), 2, translate, gameText)
        expect(zh[0].name).toBe("战技技能等级")
        expect(zh[0].name).not.toBe("战技")

        const tw = getUniqueAffixDetailRows(affixById(180101), roll(180101, { rollLevel: 1 }), 2, translate, packText(translationsTc))
        expect(tw[0].name).toBe("戰技技能等級")

        const en = getUniqueAffixDetailRows(affixById(180102), roll(180102, { rollLevel: 1 }), 2, translate, packText(translationsEn))
        expect(en[0].name).toBe("Ultimate Skill Level")

        const passive = { ...affixById(180101), addSkillLevel: { skillTypes: ["Passive"] } }
        const enPassive = getUniqueAffixDetailRows(passive, roll(180101, { rollLevel: 1 }), 2, translate, packText(translationsEn))
        expect(enPassive[0].name).toBe("Passive Skill Level")
    })

    it("未知技能类型回退原始类型名（不走手写标签）", () => {
        const unknown = { ...affixById(180101), addSkillLevel: { skillTypes: ["Unknown"] } }
        const rows = getUniqueAffixDetailRows(unknown, roll(180101, { rollLevel: 1 }), 2, translate, gameText)

        expect(rows[0].name).toBe("Unknown")
    })

    it("skillIds 全部无法映射：输出「技能等级 +N」兜底行，不静默丢值", () => {
        const unresolved = { ...affixById(180101), addSkillLevel: { skillIds: [999999] } }
        const rows = getUniqueAffixDetailRows(unresolved, roll(180101, { rollLevel: 1 }), 2, translate, gameText)

        expect(rows).toEqual([{ key: "skill:unresolved", name: "技能等级 +10", value: "" }])
    })

    it("技能等级优先于手写建模值：180101 不再输出「技能独立增伤」建模行", () => {
        const rows = getUniqueAffixDetailRows(affixById(180101), roll(180101, { rollLevel: 1 }), 2, translate, gameText)

        expect(rows.map(row => row.name)).not.toContain("技能独立增伤")
    })
})

describe("getUniqueAffixDetailRows：数据属性分支（合成自真实专属 2008）", () => {
    // 真实 32 条专属词条均无 addAttrs（属性分支对当前数据不可达）：
    // 以独一无二词条 2008 的 id（通过专属判定）为底，合成属性与数值验证分支本身
    function withAttrs(attrs: { attr: string; addType: "Rate" | "Value" }[]) {
        return { ...affixById(2008), minValue: 0.54, maxValue: 0.54, addAttrs: attrs }
    }

    it("单属性：属性名 + 百分比结算值", () => {
        const rows = getUniqueAffixDetailRows(
            withAttrs([{ attr: "火属性弱点", addType: "Rate" }]),
            roll(2008, { rollLevel: 1 }),
            1,
            translate,
            gameText
        )

        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({ name: "火属性弱点", value: "+54%" })
    })

    it("多属性逐属性一行，key 唯一", () => {
        const rows = getUniqueAffixDetailRows(
            withAttrs([
                { attr: "火属性弱点", addType: "Rate" },
                { attr: "生命", addType: "Rate" },
            ]),
            roll(2008, { rollLevel: 1 }),
            1,
            translate,
            gameText
        )

        expect(rows.map(row => row.name)).toEqual(["火属性弱点", "生命"])
        expect(new Set(rows.map(row => row.key)).size).toBe(2)
        expect(rows.every(row => row.value.endsWith("%"))).toBe(true)
    })
})

describe("getUniqueAffixDetailRows：手写建模专属", () => {
    it("2008：无数据属性时输出建模行名称 + 格式化值", () => {
        const affix = affixById(2008)
        const modeled = getAffixModeledValues(2008)
        const rows = getUniqueAffixDetailRows(affix, roll(2008, { rollLevel: 1 }), 1, translate, gameText)

        expect(rows).toHaveLength(modeled.length)
        expect(rows[0]).toMatchObject({ name: "火属性弱点", value: formatModeledAffixValue(modeled[0]) })
        expect(rows[0].value).toBe("+54%")
    })

    it("2001：建模值 9（Normal 增伤池口径）按既有格式化输出", () => {
        const modeled = getAffixModeledValues(2001)
        const rows = getUniqueAffixDetailRows(affixById(2001), roll(2001, { rollLevel: 1 }), 1, translate, gameText)

        expect(rows[0]).toMatchObject({ name: "下落增伤", value: formatModeledAffixValue(modeled[0]) })
    })
})

describe("getUniqueAffixDetailRows：空值与非专属", () => {
    it("专属但无技能 / 属性 / 建模值：返回空数组", () => {
        expect(getUniqueAffixDetailRows(affixById(2003), roll(2003, { rollLevel: 1 }), 1, translate, gameText)).toEqual([])
    })

    it("非 Plan 4 词条（基础 / Plan 3）一律返回空数组", () => {
        for (const id of [102, 1038, 1510]) {
            expect(getUniqueAffixDetailRows(affixById(id), roll(id, { rollLevel: 1 }), 1, translate, gameText), String(id)).toEqual([])
        }
    })
})

describe("TranscendGearAffixRow：专属行行为级断言（SSR 挂载）", () => {
    let i18n: ReturnType<typeof createInstance>

    beforeAll(async () => {
        i18n = createInstance()
        await i18n.init({
            lng: "zh-CN",
            fallbackLng: false,
            resources: {
                "zh-CN": {
                    translation: {
                        common: { effect_label: "效果:" },
                        "transcend-build": {
                            gear_unknown: "未知词条",
                            gear_roll_short: "档位",
                            gear_ancient: "升华词缀",
                            gear_mark_unique: "专属",
                            gear_mark_final_masterwork: "最终精锻",
                            gear_source_random: "随机",
                            gear_source_tempering: "淬炼",
                            gear_source_enchant: "附魔",
                            gear_source_unknown: "来源未知",
                            gear_socket_empty: "空孔",
                            gear_type_gem: "宝石",
                            gear_unknown_gem: "未知宝石",
                        },
                        "db-transcendence": {
                            gear: {
                                skill_type_skill1: "战技",
                                skill_type_skill2: "终结技",
                                skill_type_passive: "被动",
                                calc_skill_level: "技能等级 +{{value}}",
                            },
                        },
                    },
                },
            },
        })
    })

    async function renderRow(line: GearAffixLine, preview = false, showUniqueDetails = false): Promise<string> {
        const app = createSSRApp(
            defineComponent({ render: () => h(TranscendGearAffixRow, { line, preview, slotId: 2, showUniqueDetails }) })
        )
        app.use(i18nextVue, { i18next: i18n })

        return renderToString(app)
    }

    function uniqueLine(affixId: number): GearAffixLine {
        const equip = uniqueEquips.find(entry => entry.affixId === affixId)!
        const item: TranscendGearItemConfig = {
            kind: "unique",
            slotType: equip.slot,
            affixes: [],
            uniqueAffix: roll(affixId, { source: "unique", rollLevel: 1 }),
        }

        return getItemAffixLines(item, 2)[0]
    }

    it("非预览专属行：无 data-affix-value，且有属性键值行", async () => {
        const html = await renderRow(uniqueLine(180101))

        expect(html).toContain("data-affix-detail-row")
        expect(html).toContain('data-affix-detail-name="战技技能等级"')
        expect(html).toContain('data-affix-detail-value="+10"')
        expect(html).not.toContain("data-affix-value=")
        expect(html).toContain("data-affix-title")
    })

    it("预览专属行：既不显示裸数值也不显示属性行", async () => {
        const html = await renderRow(uniqueLine(180101), true)

        expect(html).not.toContain("data-affix-detail-row")
        expect(html).not.toContain("data-affix-value=")
        expect(html).toContain("data-affix-title")
    })

    it("预览专属行按住 Shift（showUniqueDetails）：展开属性键值行，仍不显示裸数值", async () => {
        const html = await renderRow(uniqueLine(180101), true, true)

        expect(html).toContain("data-affix-detail-row")
        expect(html).toContain('data-affix-detail-name="战技技能等级"')
        expect(html).toContain('data-affix-detail-value="+10"')
        expect(html).not.toContain("data-affix-value=")
        expect(html).toContain("data-affix-title")
    })

    it("非专属行不受影响：仍渲染 data-affix-value，无 detail 行", async () => {
        const item: TranscendGearItemConfig = { kind: "normal", slotType: 3, affixes: [roll(1038, { rollLevel: 1, source: "random" })] }
        const html = await renderRow(getItemAffixLines(item, 1)[0])

        expect(html).toContain("data-affix-value=")
        expect(html).not.toContain("data-affix-detail-row")
    })
})

describe("TranscendGearAffixRow：专属行渲染契约（静态断言）", () => {
    const source = readFileSync(
        fileURLToPath(new URL("../../components/transcend-build/TranscendGearAffixRow.vue", import.meta.url)),
        "utf8"
    )
    const template = source.slice(source.indexOf("<template>"))

    it("专属行不再内联 line.valueText，其余行保持 data-affix-value", () => {
        expect(template).toContain('v-if="!isUnique && line.valueText"')
        expect(template.match(/data-affix-value="/g)).toHaveLength(1)
    })

    it("非预览时另起一行渲染属性键值对锚点；空值兜底行不渲染 value span", () => {
        expect(template).toContain('v-if="detailRows.length"')
        expect(template).toContain("data-affix-detail-row")
        expect(template).toContain("data-affix-detail-name")
        expect(template).toContain('v-if="view.row.value"')
        expect(template).toContain("data-affix-detail-value")
        expect(template).toContain("font-orbitron")
    })

    it("明细行纵向一行一个（U130）：容器 flex-col，逐行独立元素", () => {
        expect(template).toContain("flex flex-col")
        expect(template).toContain('v-for="view in detailRowViews"')
        expect(template).toContain(':data-affix-detail-key="view.row.key"')
        expect(template).not.toContain("flex flex-wrap")
    })

    it("预览模式默认不产出属性行；宿主按住 Shift 透传 showUniqueDetails 时展开", () => {
        expect(source).toContain("if (!isUnique.value || !props.line.affix) return []")
        expect(source).toContain("if (props.preview && !props.showUniqueDetails) return []")
        expect(source).toContain("getUniqueAffixDetailRows(props.line.affix, props.line.roll, props.slotId, t, gt)")
    })

    it("ItemCard 订阅 Shift 状态并透传 show-unique-details（全部预览宿主的统一入口）", () => {
        const card = readFileSync(
            fileURLToPath(new URL("../../components/transcend-build/TranscendGearItemCard.vue", import.meta.url)),
            "utf8"
        )
        expect(card).toContain("useShiftHeld")
        expect(card).toContain("const showUniqueDetails = computed(() => !props.preview || shiftHeld.value)")
        expect(card).toContain(':show-unique-details="showUniqueDetails"')
    })

    it("slotId 由宿主传入（ItemCard / 做装编辑器 / 三个 craft tab）", () => {
        for (const name of [
            "TranscendGearItemCard.vue",
            "TranscendGearCreate.vue",
            "craft/TranscendCraftForgeTab.vue",
            "craft/TranscendCraftEnchantTab.vue",
            "craft/TranscendCraftTemperTab.vue",
        ]) {
            const host = readFileSync(fileURLToPath(new URL(`../../components/transcend-build/${name}`, import.meta.url)), "utf8")
            expect(host, name).toContain(':slot-id="slotId"')
        }
    })
})
