import { readdirSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import type { TranscendCraftUnavailableReason } from "@/data"
import { translationsEn, translationsFr, translationsJa, translationsKo, translationsTc } from "@/data/d/translations.data"
import { getCraftGateTextKey } from "@/utils/transcend-gear/craft"

/**
 * U35-fix 的 i18n 键断言：新增的淬炼 / 附魔来源键六语言齐全，
 * 死键已删，EN 专属术语不与暗金物品类型撞词，FR 效果标签带尾空格。
 */

const LOCALES = ["zh-CN", "zh-TW", "en", "ja", "ko", "fr"] as const
type Locale = (typeof LOCALES)[number]
type Bundle = Record<string, unknown>

const i18nDir = fileURLToPath(new URL("../../../public/i18n", import.meta.url))
const bundles = Object.fromEntries(
    LOCALES.map(locale => [locale, JSON.parse(readFileSync(`${i18nDir}/${locale}/translation.json`, "utf8")) as Bundle])
) as Record<Locale, Bundle>

/**
 * 按点号路径取译文。
 * @param bundle 语言包
 * @param key 点号分隔的键路径
 * @returns 译文；缺失时 undefined
 */
function valueAt(bundle: Bundle, key: string): unknown {
    return key.split(".").reduce<unknown>((current, part) => {
        if (!current || typeof current !== "object") return undefined
        return (current as Record<string, unknown>)[part]
    }, bundle)
}

/**
 * 取非空字符串译文。
 * @param locale 语言
 * @param key 键路径
 * @returns 译文
 */
function text(locale: Locale, key: string): string {
    const value = valueAt(bundles[locale], key)

    expect(value, `${locale} 缺少 ${key}`).toBeTypeOf("string")
    expect((value as string).length, `${locale} 的 ${key} 为空`).toBeGreaterThan(0)

    return value as string
}

/**
 * 递归收集目录下的 .vue 文件。
 * @param dir 目录路径
 * @returns .vue 文件路径列表
 */
function vueFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const target = `${dir}/${entry.name}`
        if (entry.isDirectory()) return vueFiles(target)
        return entry.name.endsWith(".vue") ? [target] : []
    })
}

describe("淬炼 / 附魔来源键", () => {
    it("六语言均有 gear_source_tempering / gear_source_enchant", () => {
        for (const locale of LOCALES) {
            expect(text(locale, "transcend-build.gear_source_tempering")).not.toContain("gear_source_")
            expect(text(locale, "transcend-build.gear_source_enchant")).not.toContain("gear_source_")
        }

        expect(text("zh-CN", "transcend-build.gear_source_tempering")).toBe("淬炼")
        expect(text("zh-CN", "transcend-build.gear_source_enchant")).toBe("附魔")
    })
})

describe("死键清理", () => {
    it("gear_type_normal / gear_type_unique 已从六语言删除", () => {
        for (const locale of LOCALES) {
            expect(valueAt(bundles[locale], "transcend-build.gear_type_normal"), locale).toBeUndefined()
            expect(valueAt(bundles[locale], "transcend-build.gear_type_unique"), locale).toBeUndefined()
        }
    })

    it("仍被使用的 gear_type_gem / gear_type_unknown 保留", () => {
        for (const locale of LOCALES) {
            text(locale, "transcend-build.gear_type_gem")
            text(locale, "transcend-build.gear_type_unknown")
        }
    })
})

describe("专属术语与效果标签", () => {
    it("EN gear_mark_unique 与暗金物品类型不撞词", () => {
        expect(text("en", "transcend-build.gear_mark_unique")).toBe("Exclusive affix")
        expect(text("en", "transcend-build.gear_mark_unique")).not.toBe(text("en", "transcend-build.gear_kind_unique"))
    })

    it("六语言 gear_mark_* 键齐全", () => {
        for (const locale of LOCALES) {
            text(locale, "transcend-build.gear_mark_unique")
            text(locale, "transcend-build.gear_mark_final_masterwork")
        }
    })

    it("FR 效果标签带尾空格（官方 {空格} 占位）", () => {
        expect(text("fr", "common.effect_label")).toBe("Effet : ")
        expect(text("fr", "common.effect_label").endsWith(" ")).toBe(true)
        expect(text("en", "common.effect_label")).toBe("Effect: ")
    })
})

describe("建模数值标记键", () => {
    it("六语言 mapping_handwritten / modeled_tag / modeled_exact 齐全", () => {
        for (const locale of LOCALES) {
            text(locale, "db-transcendence.gear.mapping_handwritten")
            text(locale, "db-transcendence.gear.modeled_tag")
            text(locale, "db-transcendence.gear.modeled_exact")
        }
    })
})

describe("craft UI 键", () => {
    it("87 个 craft_* 与 gear_masterwork_level 六语言齐全且不泄漏键名", () => {
        const section = valueAt(bundles["zh-CN"], "transcend-build")
        expect(section).toBeTypeOf("object")
        const craftKeys = Object.keys(section as Bundle)
            .filter(key => key.startsWith("craft_"))
            .sort()
        expect(craftKeys).toHaveLength(87)
        // U63b：5 tab / 附魔两段式 / §80 精锻与淬炼交互的关键键必须存在
        for (const key of [
            "craft_tab_sell",
            "craft_tab_punch",
            "craft_tab_final_forge",
            "craft_tab_enchant",
            "craft_tab_temper",
            "craft_enchant_no_change",
            "craft_simulator_only",
            "craft_temper_pool",
            "craft_temper_pick_pool",
            "craft_undo",
            "craft_random",
            "craft_final_masterwork_reset",
            "craft_enchant_random_note",
            "craft_enchant_custom",
            "craft_enchant_custom_desc",
            "craft_enchant_target_fixed",
            "craft_enchant_random_hint",
            "craft_initial_sockets_pick",
            "craft_cancel",
            "craft_apply",
            "craft_gate_masterwork_max",
        ]) {
            expect(craftKeys).toContain(key)
        }
        for (const locale of LOCALES) {
            for (const key of craftKeys) {
                const value = text(locale, `transcend-build.${key}`)
                expect(value).not.toContain("transcend-build.")
            }
            text(locale, "transcend-build.gear_masterwork_level")
        }
    })

    it("失效精锻执行键已从六语言删除", () => {
        for (const locale of LOCALES) {
            for (const key of ["craft_refine_execute", "craft_refine_final_execute", "craft_refine_progress"]) {
                expect(valueAt(bundles[locale], `transcend-build.${key}`), `${locale} ${key}`).toBeUndefined()
            }
        }
    })

    it("所有不可用原因都有六语言门槛文案（编译期穷举）", () => {
        const REASON_COVERAGE = {
            "unknown-craft": true,
            "unknown-rarity": true,
            rarity: true,
            "cross-season": true,
            "masterwork-max": true,
            "masterwork-required": true,
            "no-final-target": true,
            "no-tempering-pool": true,
            "no-enchant-target": true,
            "socket-none": true,
            "socket-max": true,
            "no-empty-socket": true,
            "no-socketed-gem": true,
        } as const satisfies Record<TranscendCraftUnavailableReason, true>
        const reasons = Object.keys(REASON_COVERAGE) as TranscendCraftUnavailableReason[]
        for (const reason of reasons) {
            const key = getCraftGateTextKey(reason)
            expect(key, reason).toBe(`transcend-build.craft_gate_${reason.replace(/-/g, "_")}`)
            for (const locale of LOCALES) text(locale, key)
        }
    })
})

describe("U63b-fix：transcend-build 内不得出现 CJK 字面量 $t()", () => {
    const componentRoot = fileURLToPath(new URL("../../components/transcend-build", import.meta.url))
    const files = vueFiles(componentRoot)

    it('$t("中文…") 一律不得出现在本单元目录中', () => {
        const cjkKey = /\$t\(\s*(["'`])([^"'`]*?[぀-ヿ㐀-鿿가-힯][^"'`]*?)\1\s*\)/g
        const violations: string[] = []
        for (const file of files) {
            const source = readFileSync(file, "utf8")
            for (const match of source.matchAll(cjkKey)) {
                // 数据驱动的模板键（含 ${} 插值）不是固定字面量，不在此规则范围
                if (match[1] === "`" && match[2].includes("${")) continue
                violations.push(`${file}: $t(${match[2]})`)
            }
        }
        expect(violations, violations.join("\n")).toEqual([])
    })
})

describe("DB craft 费用成长文案", () => {
    /** 各语言旧口径：把费用成长封顶写成附魔次数上限 */
    const LEGACY_GROWTH: Record<Locale, RegExp> = {
        "zh-CN": /最多 \{\{count\}\} 次/,
        "zh-TW": /最多 \{\{count\}\} 次/,
        en: /up to \{\{count\}\} times/,
        ja: /最大 \{\{count\}\} 回/,
        ko: /최대 \{\{count\}\}회/,
        fr: /\{\{count\}\} fois max/,
    }

    /** 各语言必须出现的「费用成长」语义 */
    const GROWTH_MARKER: Record<Locale, string> = {
        "zh-CN": "费用成长",
        "zh-TW": "費用成長",
        en: "cost growth",
        ja: "費用の成長",
        ko: "비용 성장",
        fr: "coût d'enchantement",
    }

    /**
     * 渲染 i18next 双花括号占位符。
     * @param template 译文模板
     * @param vars 变量
     * @returns 渲染后的文本
     */
    function renderCopy(template: string, vars: Record<string, string | number>): string {
        return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(vars[key] ?? ""))
    }

    it("六语言 craft_growth / craft_growth_note / craft_limit 齐全", () => {
        for (const locale of LOCALES) {
            text(locale, "db-transcendence.overview.craft_growth")
            text(locale, "db-transcendence.overview.craft_growth_note")
            text(locale, "db-transcendence.overview.craft_limit")
        }
        expect(text("zh-CN", "db-transcendence.overview.craft_growth_note")).toBe("数据推导")
    })

    it("craft_growth 不再使用次数占位符，也不含旧「最多 N 次」口径", () => {
        for (const locale of LOCALES) {
            const template = text(locale, "db-transcendence.overview.craft_growth")

            expect(template, locale).not.toContain("{{count}}")
            expect(template, locale).not.toMatch(LEGACY_GROWTH[locale])
            expect(template, locale).toContain(GROWTH_MARKER[locale])
        }
    })

    it("封顶倍率与次数从数据渲染（1/5 → ×6、第 6 次），换数据后同步变化", () => {
        const vars = { first: 1, factor: 1, cap: 6, capAt: 6 }
        const alt = { first: 1, factor: 2, cap: 7, capAt: 4 }

        for (const locale of LOCALES) {
            const template = text(locale, "db-transcendence.overview.craft_growth")
            const rendered = renderCopy(template, vars)
            const changed = renderCopy(template, alt)

            expect(rendered, locale).toContain("×6")
            expect(rendered, locale).not.toContain("最多 5 次")
            expect(rendered, locale).not.toContain("上限 5 次")
            expect(changed, locale).toContain("×7")
            expect(changed, locale).not.toContain("×6")
        }
    })

    it("craft_limit 保留真实使用次数上限并渲染数据值", () => {
        for (const locale of LOCALES) {
            const template = text(locale, "db-transcendence.overview.craft_limit")

            expect(template, locale).toContain("{{count}}")
            expect(renderCopy(template, { count: 10 }), locale).toContain("10")
        }
        expect(text("zh-CN", "db-transcendence.overview.craft_limit")).toBe("使用次数上限 {{count}} 次")
    })
})

describe("U64 术语对齐（审计落值）", () => {
    /** 升华相关命名空间：百科「词条」等旧口径不应出现在这里的值中 */
    const inTermScope = (key: string) =>
        key.startsWith("db-transcendence.") || key.startsWith("transcend-build.") || key.startsWith("search.transcendence.")

    /** 展平语言包为点号键 */
    function flatten(bundle: Bundle, prefix = "", out: Record<string, unknown> = {}): Record<string, unknown> {
        for (const [key, value] of Object.entries(bundle)) {
            const path = prefix ? `${prefix}.${key}` : key
            if (value && typeof value === "object") flatten(value as Bundle, path, out)
            else out[path] = value
        }

        return out
    }

    it("唯一装 / 难度阶 / 词条 / 槽型 在升华命名空间无残留", () => {
        const banned = ["唯一装", "唯一裝", "难度阶", "難度階", "词条", "詞條", "詞条", "槽型"]

        for (const locale of LOCALES) {
            for (const [key, value] of Object.entries(flatten(bundles[locale]))) {
                if (!inTermScope(key) || typeof value !== "string") continue
                for (const term of banned) {
                    expect(value, `${locale} ${key}`).not.toContain(term)
                }
            }
        }
    })

    it("官方术语落值（P0/P1）", () => {
        expect(text("zh-CN", "db-transcendence.gear.sub_unique")).toBe("暗金装备")
        expect(text("zh-CN", "db-transcendence.overview.tiers")).toBe("难度")
        expect(text("zh-CN", "db-transcendence.overview.buffs")).toBe("旅程增益")
        expect(text("en", "transcend-build.gear_kind_unique")).toBe("Dark Golden")
        expect(text("en", "db-transcendence.nest.title")).toBe("Nocturnal Labyrinth")
        expect(text("en", "db-transcendence.craft.masterwork")).toBe("Masterworking")
        expect(text("en", "transcend-build.gear_strength")).toBe("Power")
        expect(text("en", "transcend-build.craft_section")).toBe("Equipment Modification")
    })
})

describe("U97 空孔占位文案（上游 UI_DNASeasonEquip_EmptyGroove）", () => {
    it("六语言 gear_socket_empty 均为官方「镶孔」译名", () => {
        expect(text("zh-CN", "transcend-build.gear_socket_empty")).toBe("镶孔")
        expect(text("zh-TW", "transcend-build.gear_socket_empty")).toBe("鑲孔")
        expect(text("en", "transcend-build.gear_socket_empty")).toBe("Socket")
        expect(text("ja", "transcend-build.gear_socket_empty")).toBe("ソケット")
        expect(text("ko", "transcend-build.gear_socket_empty")).toBe("소켓")
        expect(text("fr", "transcend-build.gear_socket_empty")).toBe("Châsse")
    })
})

describe("赛季增伤属性文案（导入器产物）", () => {
    /** 官方 TextMap 文案：Attr_DamageRate_NoTag_S0DamageRate_Name */
    const SEASON_DAMAGE_PACK: Record<"tc" | "en" | "jp" | "kr" | "fr", string> = {
        tc: "造成傷害（步入夢鄉）",
        en: "Damage Dealt (Into Slumber)",
        jp: "与ダメージ（夢見る世界）",
        kr: "입히는 대미지(꿈의 세계로)",
        fr: "Dégâts infligés (Au pays des rêves)",
    }

    it("zh-CN 根键为官方文案「造成伤害（步入梦乡）」", () => {
        expect(text("zh-CN", "赛季增伤")).toBe("造成伤害（步入梦乡）")
    })

    it("其余五语言由导入器写入数据包，public/i18n 不再手写该键", () => {
        for (const locale of ["zh-TW", "en", "ja", "ko", "fr"] as const) {
            expect(valueAt(bundles[locale], "赛季增伤"), locale).toBeUndefined()
        }
        const pack = {
            tc: translationsTc,
            en: translationsEn,
            jp: translationsJa,
            kr: translationsKo,
            fr: translationsFr,
        }
        for (const [locale, expected] of Object.entries(SEASON_DAMAGE_PACK)) {
            expect(pack[locale as keyof typeof pack].赛季增伤, locale).toBe(expected)
        }
    })

    it("元素专属伤害率使用官方 TextMap 译名（六语言）", () => {
        const cases: Array<[string, Record<"tc" | "en" | "jp" | "kr" | "fr", string>, string]> = [
            [
                "火属性增伤",
                {
                    tc: "火屬性傷害提升",
                    en: "Pyro Damage Boost",
                    jp: "火属性ダメージアップ",
                    kr: "불 속성 대미지 상승",
                    fr: "Bonus de Dégâts Pyro",
                },
                "火属性伤害提升",
            ],
            [
                "水属性增伤",
                {
                    tc: "水屬性傷害提升",
                    en: "Hydro Damage Boost",
                    jp: "水属性ダメージアップ",
                    kr: "물 속성 대미지 상승",
                    fr: "Bonus de Dégâts Hydro",
                },
                "水属性伤害提升",
            ],
            [
                "雷属性增伤",
                {
                    tc: "雷屬性傷害提升",
                    en: "Electro Damage Boost",
                    jp: "雷属性ダメージアップ",
                    kr: "번개 속성 대미지 상승",
                    fr: "Bonus de Dégâts Électro",
                },
                "雷属性伤害提升",
            ],
            [
                "风属性增伤",
                {
                    tc: "風屬性傷害提升",
                    en: "Anemo Damage Boost",
                    jp: "風属性ダメージアップ",
                    kr: "바람 속성 대미지 상승",
                    fr: "Bonus de Dégâts Anémo",
                },
                "风属性伤害提升",
            ],
            [
                "光属性增伤",
                {
                    tc: "光屬性傷害提升",
                    en: "Lumino Damage Boost",
                    jp: "光属性ダメージアップ",
                    kr: "빛 속성 대미지 상승",
                    fr: "Bonus de Dégâts Lumino",
                },
                "光属性伤害提升",
            ],
            [
                "暗属性增伤",
                {
                    tc: "暗屬性傷害提升",
                    en: "Umbro Damage Boost",
                    jp: "闇属性ダメージアップ",
                    kr: "어둠 속성 대미지 상승",
                    fr: "Bonus de Dégâts Umbro",
                },
                "暗属性伤害提升",
            ],
        ]
        const pack = {
            tc: translationsTc,
            en: translationsEn,
            jp: translationsJa,
            kr: translationsKo,
            fr: translationsFr,
        }
        for (const [key, expected, zh] of cases) {
            expect(text("zh-CN", key), key).toBe(zh)
            for (const [locale, value] of Object.entries(expected)) {
                expect(pack[locale as keyof typeof pack][key], `${key}@${locale}`).toBe(value)
            }
        }
    })
})

describe("U28-fix-2 基础名条数 / 排斥关系键", () => {
    /** 旧精确总数写法（随机上限被当成精确总数），六语言逐个禁止 */
    const LEGACY_EXACT_TOTAL: Record<Locale, string> = {
        "zh-CN": "含固定共 {{total}} 条",
        "zh-TW": "含固定共 {{total}} 條",
        en: "{{total}} total including the fixed affix",
        ja: "固定込みで {{total}} 本",
        ko: "고정 포함 {{total}}개",
        fr: "{{total}} au total, affixe fixe inclus",
    }

    /** 新区间 / 上限总数写法：total 必须带上限词，random 必须是 0–上限区间 */
    const TOTAL_BOUND: Record<Locale, string> = {
        "zh-CN": "最多共 {{total}}",
        "zh-TW": "最多共 {{total}}",
        en: "up to {{total}}",
        ja: "最大 {{total}}",
        ko: "최대 {{total}}",
        fr: "jusqu'à {{total}}",
    }

    /**
     * 渲染 i18next 双花括号占位符。
     * @param template 译文模板
     * @param vars 变量
     * @returns 渲染后的文本
     */
    function render(template: string, vars: Record<string, string | number>): string {
        return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(vars[key] ?? ""))
    }

    it("废弃的 exclusive_groups / exclusive_hint 已从六语言删除，exclusion_* 齐全", () => {
        for (const locale of LOCALES) {
            expect(valueAt(bundles[locale], "db-transcendence.gear.exclusive_groups"), locale).toBeUndefined()
            expect(valueAt(bundles[locale], "db-transcendence.gear.exclusive_hint"), locale).toBeUndefined()
            text(locale, "db-transcendence.gear.exclusion_relations")
            text(locale, "db-transcendence.gear.exclusion_hint")
        }
    })

    it("base_count_selected 不再把随机上限当精确总数", () => {
        const vars = { rarity: "R", random: 4, total: 5 }
        for (const locale of LOCALES) {
            const template = text(locale, "db-transcendence.gear.base_count_selected")

            expect(template, locale).not.toContain(LEGACY_EXACT_TOTAL[locale])
            expect(template, locale).toContain(TOTAL_BOUND[locale])
            expect(template, locale).toContain("0–{{random}}")

            const rendered = render(template, vars)
            expect(rendered, locale).toContain(String(vars.total))
            expect(rendered, locale).not.toContain(LEGACY_EXACT_TOTAL[locale].replace(/\{\{\w+\}\}/g, String(vars.total)))
        }

        expect(render(text("zh-CN", "db-transcendence.gear.base_count_selected"), vars)).toBe(
            "品质 R · 最多共 5 条（固定 1 条 + 随机 0–4 条）"
        )
    })
})
