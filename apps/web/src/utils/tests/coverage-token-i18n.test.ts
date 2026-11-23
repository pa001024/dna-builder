import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { createInstance } from "i18next"
import { describe, expect, it } from "vitest"
import { translationsEn, translationsFr, translationsJa, translationsKo, translationsTc } from "@/data/d/translations.data"
import { UNIQUE_AFFIX_MAP } from "@/data/transcendBuffs"
import { getCoverageTokenKey, resolveCoverageTokenLabel } from "@/utils/transcendence-gear"

/**
 * U70b-fix：覆盖 token 的本地化链路（界面文案键命中 → `$t`；未登记 → `gt` 走数据包对照表），
 * 以及 U72 欠账界面键的六语言存在性。
 */

const I18N_DIR = fileURLToPath(new URL("../../../public/i18n", import.meta.url))
const UI_LOCALES = ["zh-CN", "zh-TW", "en", "ja", "ko", "fr"] as const
type UiLocale = (typeof UI_LOCALES)[number]
/** translation.json 的嵌套对象形态 */
type Bundle = Record<string, unknown>

/** 打包语言 → public/i18n 语言目录 + 数据包对照表 */
const PACK_LOCALES = [
    { ui: "zh-TW", pack: translationsTc },
    { ui: "en", pack: translationsEn },
    { ui: "ja", pack: translationsJa },
    { ui: "ko", pack: translationsKo },
    { ui: "fr", pack: translationsFr },
] as const

/**
 * 读取某语言的界面翻译资源。
 * @param locale 应用语言
 * @returns 翻译资源
 */
function readBundle(locale: UiLocale): Bundle {
    return JSON.parse(readFileSync(`${I18N_DIR}/${locale}/translation.json`, "utf8")) as Bundle
}

/**
 * 按点分路径取译文。
 * @param bundle 语言包
 * @param key 点分键
 * @returns 译文；缺失时 undefined
 */
function valueAt(bundle: Bundle, key: string): unknown {
    return key.split(".").reduce<unknown>((current, part) => {
        return typeof current === "object" && current !== null ? (current as Record<string, unknown>)[part] : undefined
    }, bundle)
}

/**
 * 用 public 界面文案 + 数据包对照表建独立 i18next 实例，复刻组件的 `t` 与 `gt`。
 * @param locale 应用语言
 * @returns 界面文案翻译与游戏原文翻译
 */
async function createResolvers(
    locale: UiLocale
): Promise<{ translate: (key: string, options?: Record<string, unknown>) => string; gameText: (text: string) => string }> {
    const bundle = readBundle(locale)
    const pack = PACK_LOCALES.find(item => item.ui === locale)?.pack ?? {}
    const instance = createInstance()
    await instance.init({
        lng: locale,
        fallbackLng: false,
        initImmediate: false,
        resources: { [locale]: { translation: { ...bundle, ...pack } } },
    })
    return {
        translate: (key, options) => (options ? instance.t(key, options) : instance.t(key)) as string,
        gameText: text => instance.t(text, { keySeparator: false, nsSeparator: false }) as string,
    }
}

describe("追伤覆盖 token 本地化（U70b-fix）", () => {
    /** 手写词缀 2012（暗）/ 180102（四元素）的 included 追伤 token */
    const CHASE_AFFIX_IDS = [2012, 180102] as const

    it("2012 / 180102 的追伤 token 在 5 门打包语言下显示数据包译文", async () => {
        // 只取走数据包对照表的元素追伤名；界面登记的覆盖 token（四属性追伤）由下方用例覆盖
        const tokens = CHASE_AFFIX_IDS.flatMap(id => UNIQUE_AFFIX_MAP[id]?.included ?? []).filter(
            token => token.endsWith("属性追伤") && getCoverageTokenKey(token) === undefined
        )
        expect(new Set(tokens)).toEqual(new Set(["暗属性追伤", "水属性追伤", "火属性追伤", "雷属性追伤", "风属性追伤"]))

        for (const { ui, pack } of PACK_LOCALES) {
            const { translate, gameText } = await createResolvers(ui)

            for (const token of tokens) {
                expect(getCoverageTokenKey(token), `${ui}:${token} 不应登记界面键`).toBeUndefined()

                const label = resolveCoverageTokenLabel(token, translate, gameText)
                expect(label, `${ui}:${token}`).toBe(pack[token])
                expect(label, `${ui}:${token} 不应回退中文原文`).not.toBe(token)

                if (ui === "en" || ui === "fr") {
                    expect(label, `${ui}:${token} 不应含中文`).not.toMatch(/[一-鿿]/)
                }
            }
        }
    })

    it("已登记 coverage token 仍走界面文案表", async () => {
        const { translate, gameText } = await createResolvers("en")
        const expected = valueAt(readBundle("en"), "db-transcendence.gear.coverage.dmg_boost")

        expect(typeof expected).toBe("string")
        expect(resolveCoverageTokenLabel("增伤", translate, gameText)).toBe(expected)
        expect(resolveCoverageTokenLabel("增伤", translate, gameText)).not.toBe("增伤")
    })

    it("界面表与数据包都未收录的 token 原样返回", async () => {
        const { translate, gameText } = await createResolvers("en")
        expect(resolveCoverageTokenLabel("未登记 token", translate, gameText)).toBe("未登记 token")
    })
})

/**
 * U83c-fix：官方译名与同概念文案统一。
 *
 * `雾海安魂` 取 `SKILL_150202_NAME`、`螺旋飞跃后 20s` 取 `Guide_UI_SpiralLeap_Mobile`（`bun i18n ref`），
 * 避免日/韩/英/法中文直出或自造译名。
 */
const OFFICIAL_TOKEN_LABELS: Record<string, Record<UiLocale, string>> = {
    雾海安魂: {
        "zh-CN": "雾海安魂",
        "zh-TW": "霧海安魂",
        en: "Misty Sea Requiem",
        ja: "ニヴルヘイムのレクイエム",
        ko: "안개의 바다 진혼",
        fr: "Requiem de la Mer du Silence",
    },
    "螺旋飞跃后 20s": {
        "zh-CN": "螺旋飞跃后 20s",
        "zh-TW": "螺旋飛躍後 20s",
        en: "20s after Helix Leap",
        ja: "スピンジャンプ後 20 秒",
        ko: "스파이럴 점프 후 20초",
        fr: "20 s après Bond Cyclonique",
    },
}

describe("官方译名与同概念统一（U83c-fix）", () => {
    it("官方译名 token 六语言与 TextMap 一致，ja/ko 不直出中文", async () => {
        // token 必须真实挂在对应词条上，避免锁住孤儿文案；2001 的触发/持续已迁入 effect
        expect(UNIQUE_AFFIX_MAP[150201].excluded).toContain("雾海安魂")
        expect(UNIQUE_AFFIX_MAP[150201].excluded).toContain("送葬")
        expect(UNIQUE_AFFIX_MAP[2001].effect).toMatchObject({ trigger: "spiral-leap", duration: 20 })

        for (const locale of UI_LOCALES) {
            const { translate, gameText } = await createResolvers(locale)

            for (const [token, expected] of Object.entries(OFFICIAL_TOKEN_LABELS)) {
                const label = resolveCoverageTokenLabel(token, translate, gameText)

                expect(label, `${locale}:${token}`).toBe(expected[locale])

                if (locale === "en" || locale === "fr" || locale === "ko") {
                    expect(label, `${locale}:${token} 不应含中文`).not.toMatch(/[一-鿿]/)
                }
                if (locale === "ko") {
                    expect(label, `${locale}:${token} 应为韩文`).toMatch(/[가-힣]/)
                }
                if (locale === "ja") {
                    // 日文允许汉字，但不得出现简体专用字（官方写法已在上方精确锁定）
                    expect(label, `${locale}:${token}`).not.toMatch(/[增伤击扬动战]/)
                }
            }
        }
    })

    it("同概念 coverage 文案与属性名一致", async () => {
        for (const locale of UI_LOCALES) {
            const { translate, gameText } = await createResolvers(locale)

            for (const token of ["火属性增伤", "近战独立增伤", "远程独立增伤"]) {
                expect(resolveCoverageTokenLabel(token, translate, gameText), `${locale}:${token}`).toBe(gameText(token))
            }
        }
    })

    it("2008 火属性弱点 coverage token 走界面键，与属性名同文案（U95）", async () => {
        expect(UNIQUE_AFFIX_MAP[2008].included).toEqual(["火属性弱点"])
        const key = getCoverageTokenKey("火属性弱点")

        expect(key).toBe("db-transcendence.gear.coverage.fire_weakness")
        for (const locale of UI_LOCALES) {
            const { translate, gameText } = await createResolvers(locale)
            const label = resolveCoverageTokenLabel("火属性弱点", translate, gameText)

            expect(label, `${locale}:火属性弱点`).toBe(translate("火属性弱点"))
            expect(label.trim().length, `${locale}:火属性弱点`).toBeGreaterThan(0)
            if (locale === "en" || locale === "fr" || locale === "ko") {
                expect(label, `${locale}:火属性弱点 中文回落`).not.toMatch(/[一-鿿]/)
            }
        }
    })
})

describe("U93a 精确缺口 token 与展示键", () => {
    /** U93a-fix 新增的精确缺口 token（U122 起 180101 改为 tag「战技」字段限定，不再有「Skill1 限定」缺口） */
    const TOKENS = ["随机属性仅暗", "武器命中覆盖率", "召唤物攻击频率覆盖率", "12000% 水属性伤害", "700% 追加伤害"] as const
    /** U93a 新增的触发文案键 */
    const TRIGGER_KEYS = [
        "trigger_ultimate",
        "trigger_spiral_leap",
        "trigger_dodge",
        "trigger_skill_hit",
        "trigger_weapon_hit",
        "trigger_heal",
        "trigger_disorder",
        "trigger_combo",
        "trigger_passive",
        "trigger_none",
    ] as const

    it("新 token 挂在对应词条且已登记界面键", () => {
        expect(UNIQUE_AFFIX_MAP[2012].excluded).toEqual(["随机属性仅暗", "武器命中覆盖率"])
        expect(UNIQUE_AFFIX_MAP[210101].excluded).toEqual(["12000% 水属性伤害", "召唤物攻击频率覆盖率"])
        expect(UNIQUE_AFFIX_MAP[180101].excluded).toEqual(["弹药消耗", "夜莺重复"])

        for (const token of TOKENS) {
            expect(getCoverageTokenKey(token), token).toBeTruthy()
        }
    })

    it("新 token 六语言非空，en/fr 不回落中文", async () => {
        for (const locale of UI_LOCALES) {
            const { translate, gameText } = await createResolvers(locale)

            for (const token of TOKENS) {
                const label = resolveCoverageTokenLabel(token, translate, gameText)

                expect(label.trim().length, `${locale}:${token}`).toBeGreaterThan(0)
                expect(label, `${locale}:${token} 泄漏键名`).not.toBe(getCoverageTokenKey(token))
                if (locale === "en" || locale === "fr") {
                    expect(label, `${locale}:${token} 中文回落`).not.toMatch(/[一-鿿]/)
                }
            }
        }
    })

    it("U93a trigger 键六语言非空，en/fr 不回落中文", () => {
        for (const locale of UI_LOCALES) {
            const bundle = readBundle(locale)

            for (const key of TRIGGER_KEYS) {
                const path = `db-transcendence.gear.${key}`
                const label = valueAt(bundle, path)

                expect(typeof label, `${locale}:${key}`).toBe("string")
                expect((label as string).trim().length, `${locale}:${key}`).toBeGreaterThan(0)
                if (locale === "en" || locale === "fr") {
                    expect(label, `${locale}:${key} 中文回落`).not.toMatch(/[一-鿿]/)
                }
            }
        }
    })

    it("values[].name 非空；labelKey 六语言存在且非键名", () => {
        for (const mapping of Object.values(UNIQUE_AFFIX_MAP)) {
            for (const value of mapping.values ?? []) {
                expect(value.name.trim().length).toBeGreaterThan(0)
            }
        }

        const bundles = new Map(UI_LOCALES.map(locale => [locale, readBundle(locale)]))
        for (const mapping of Object.values(UNIQUE_AFFIX_MAP)) {
            for (const value of mapping.values ?? []) {
                if (!value.labelKey) continue
                for (const locale of UI_LOCALES) {
                    const label = valueAt(bundles.get(locale) as Bundle, value.labelKey)

                    expect(typeof label, `${locale}:${value.labelKey}`).toBe("string")
                    expect((label as string).trim().length, `${locale}:${value.labelKey}`).toBeGreaterThan(0)
                    expect(label, `${locale}:${value.labelKey} 泄漏键名`).not.toBe(value.labelKey)
                    if (locale === "en" || locale === "fr") {
                        expect(label, `${locale}:${value.labelKey} 中文回落`).not.toMatch(/[一-鿿]/)
                    }
                }
            }
        }
    })
})

describe("U72 欠账界面键六语言", () => {
    const KEYS = [
        "ast-help.readonly_aggregate_title",
        "ast-help.readonly_aggregate_note",
        "ast-help.readonly_aggregate_hint",
        "db-damage.chase_approximation_note",
    ] as const

    it("六语言均非空且不泄漏键名", () => {
        for (const locale of UI_LOCALES) {
            const bundle = readBundle(locale)

            for (const key of KEYS) {
                const text = valueAt(bundle, key)
                expect(typeof text, `${locale}:${key}`).toBe("string")
                expect((text as string).trim().length, `${locale}:${key} 为空`).toBeGreaterThan(0)
                expect(text, `${locale}:${key} 泄漏键名`).not.toBe(key)

                if (locale === "en" || locale === "fr") {
                    expect(text, `${locale}:${key} 中文回落`).not.toMatch(/[一-鿿]/)
                }
                if (locale === "ko") {
                    expect(text, `${locale}:${key} 非韩文`).toMatch(/[가-힣]/)
                }
            }
        }
    })

    it("zh-CN 文案与代码侧一致", () => {
        const bundle = readBundle("zh-CN")

        expect(valueAt(bundle, "ast-help.readonly_aggregate_title")).toBe("只读聚合")
        expect(valueAt(bundle, "ast-help.readonly_aggregate_note")).toBe("Σ 七分量（只读聚合）")
        expect(valueAt(bundle, "db-damage.chase_approximation_note")).toBe("额外造成一段可触发额外效果的属性伤害。")
    })
})

describe("U101c 追伤覆盖口径", () => {
    it("四属性追伤 token 已登记且六语言非空", async () => {
        const token = "四属性追伤"

        expect(getCoverageTokenKey(token)).toBe("db-transcendence.gear.coverage.four_element_chase")
        expect(UNIQUE_AFFIX_MAP[180102].included).toContain(token)
        expect(UNIQUE_AFFIX_MAP[240103].included).toContain(token)

        for (const locale of UI_LOCALES) {
            const { translate, gameText } = await createResolvers(locale)
            const label = resolveCoverageTokenLabel(token, translate, gameText)

            expect(label.trim().length, locale).toBeGreaterThan(0)
            expect(label, `${locale} 泄漏键名`).not.toBe(getCoverageTokenKey(token))
            if (locale === "en" || locale === "fr") {
                expect(label, `${locale} 中文回落`).not.toMatch(/[一-鿿]/)
            }
        }
    })

    it("旧「非匹配元素分量不计」已从数据与映射移除", () => {
        expect(getCoverageTokenKey("非匹配元素分量不计")).toBeUndefined()
        expect(UNIQUE_AFFIX_MAP[180102].excluded).not.toContain("非匹配元素分量不计")
        expect(UNIQUE_AFFIX_MAP[240103].excluded).not.toContain("非匹配元素分量不计")
    })
})

describe("U129-fix 作用域标注界面键", () => {
    const SCOPE_KEYS = ["db-transcendence.gear.modeled_scope_field", "db-transcendence.gear.modeled_scope_tag"] as const

    it("六语言存在、含 {{value}} 占位符，插值后保留名字", async () => {
        for (const locale of UI_LOCALES) {
            const rawBundle = readBundle(locale)
            const { translate } = await createResolvers(locale)

            for (const key of SCOPE_KEYS) {
                const raw = valueAt(rawBundle, key)

                expect(typeof raw, `${locale}:${key}`).toBe("string")
                expect(raw, `${locale}:${key} 占位符`).toContain("{{value}}")
                if (locale === "en" || locale === "fr") {
                    expect(raw, `${locale}:${key} 中文回落`).not.toMatch(/[一-鿿]/)
                }

                const rendered = translate(key, { value: "SCOPE_NAME" })

                expect(rendered, `${locale}:${key} 插值`).toContain("SCOPE_NAME")
                expect(rendered, `${locale}:${key} 未插值`).not.toContain("{{value}}")
            }
        }
    })
})
