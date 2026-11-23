import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { createInstance, type i18n as I18n } from "i18next"
import i18nextVue from "i18next-vue"
import { beforeAll, describe, expect, it } from "vitest"
import { createSSRApp, defineComponent, h } from "vue"
import { renderToString } from "vue/server-renderer"
import CharCalamityWeaponShow from "@/components/CharCalamityWeaponShow.vue"
import { LeveledWeapon } from "@/data"
import weaponData from "@/data/d/weapon.data"
import type { Weapon } from "@/data/data-types"
import { formatProp } from "@/util"

/**
 * U133：构筑页「角色详情 → 灾厄武器」子区 SSR。
 * 只展示熔炉内各层级效果（Lv / 技能名 / 描述 / 加成），不展示任何解锁材料。
 */

const LOCALES = ["zh-CN", "zh-TW", "en", "ja", "ko", "fr"] as const

const i18nDir = fileURLToPath(new URL("../../../public/i18n", import.meta.url))

/** 读取语言包 */
function loadBundle(locale: string): Record<string, unknown> {
    return JSON.parse(readFileSync(`${i18nDir}/${locale}/translation.json`, "utf8")) as Record<string, unknown>
}

/**
 * 含 ASCII `.` 与 `:` 的描述原文：只有 `gt`（关闭 keySeparator / nsSeparator）能命中译文，
 * `$t` 会按嵌套路径 / 命名空间解析而取不到。
 */
const GT_SOURCE = "效果:获得1.0层[羽化]。"
const GT_TEXT = "描述译文·羽化"
const zhTranslation = loadBundle("zh-CN")
zhTranslation[GT_SOURCE] = GT_TEXT

let i18nZh: I18n
let i18nEn: I18n
beforeAll(async () => {
    i18nZh = createInstance()
    await i18nZh.init({ lng: "zh-CN", fallbackLng: false, resources: { "zh-CN": { translation: zhTranslation } } })
    i18nEn = createInstance()
    await i18nEn.init({ lng: "en", fallbackLng: false, resources: { en: { translation: loadBundle("en") } } })
})

/** 灾厄武器测试数据：三档熔炉（含一级 / 二级解锁材料、空 icon、非空 icon、同级双效果） */
function forgeWeapon(patch: Partial<Weapon> = {}): LeveledWeapon {
    const data: Weapon = {
        id: 9001,
        名称: "测试灾厄武器",
        类型: ["近战", "单手剑"],
        伤害类型: "切割",
        攻击: 100,
        暴击: 0,
        暴伤: 0,
        触发: 0,
        熔炉: [
            {
                lv: 0,
                技能: [{ id: 91001, 名称: "无解·沉思", icon: "", 描述: "测试描述甲。\n第二行文本。" }],
            },
            {
                lv: 1,
                解锁: { 测试材料·甲: 3, 测试材料·乙: 2 },
                技能: [
                    {
                        id: 91002,
                        名称: "无解·渴求",
                        icon: "",
                        描述: "测试描述乙。",
                        加成: { 技能威力: 0.45 },
                        解锁: { 二级材料·丙: 1 },
                    },
                ],
            },
            {
                lv: 2,
                技能: [
                    { id: 91003, 名称: "血染·触发", icon: "T_Skill_Test", 描述: GT_SOURCE, 加成: { 触发概率: 1.8 } },
                    { id: 91004, 名称: "织羽·精炼", icon: "", 描述: "测试描述丁。", 加成: { 造成技能伤害: 0.45 } },
                ],
            },
        ],
        ...patch,
    }
    return new LeveledWeapon(data)
}

/** 熔炉档位缺失 / 空技能数组的灾厄武器 */
function emptySkillWeapon(): LeveledWeapon {
    const data: Weapon = {
        id: 9003,
        名称: "无效果灾厄武器",
        类型: ["远程", "弓"],
        伤害类型: "贯穿",
        攻击: 100,
        暴击: 0,
        暴伤: 0,
        触发: 0,
        熔炉: [{ lv: 0 }, { lv: 1, 技能: [] }],
    }
    return new LeveledWeapon(data)
}

/** 非灾厄武器（无熔炉） */
const normalWeapon = new LeveledWeapon({
    id: 9004,
    名称: "测试普通武器",
    类型: ["近战", "单手剑"],
    伤害类型: "切割",
    攻击: 100,
    暴击: 0,
    暴伤: 0,
    触发: 0,
})

const SectionHeaderStub = defineComponent({
    props: { noAnimate: Boolean, compact: Boolean, kicker: String, title: String },
    setup:
        (props, { slots }) =>
        () =>
            h("section", [props.title ?? "", slots.trailing?.()]),
})
const ImageFallbackStub = defineComponent({
    props: { src: { type: String, default: "" }, alt: { type: String, default: "" } },
    setup: props => () => (props.src ? h("img", { src: props.src, alt: props.alt }) : null),
})
/** 若组件误引入材料行，会渲染出该标记，供断言排除 */
const ResourceCostItemStub = defineComponent({
    props: { name: { type: String, default: "" }, value: { type: Number, default: 0 } },
    setup: props => () => h("span", { "data-resource-cost": props.name }),
})

/** SSR 渲染灾厄武器子区（默认中文，可切换语言实例） */
function renderCalamityWeapons(weapons: (LeveledWeapon | undefined | null)[], instance: I18n = i18nZh): Promise<string> {
    const app = createSSRApp(defineComponent({ render: () => h(CharCalamityWeaponShow, { weapons }) }))
    app.use(i18nextVue, { i18next: instance })
    app.component("SectionHeader", SectionHeaderStub)
    app.component("ImageFallback", ImageFallbackStub)
    app.component("ResourceCostItem", ResourceCostItemStub)
    return renderToString(app)
}

/** 按档位切分 SSR 输出：每项是一个档位（从档位标记到下一档位前）的 HTML */
function forgeLevelChunks(html: string): string[] {
    return html.split("data-calamity-forge-level").slice(1)
}

describe("U133 灾厄武器子区渲染", () => {
    it("逐档渲染 Lv / 技能名 / 描述 / 加成；同级两个效果在同一网格内真实两列", async () => {
        const html = await renderCalamityWeapons([forgeWeapon()])
        const chunks = forgeLevelChunks(html)

        expect(html).toContain("data-calamity-weapon")
        expect(html).toContain("灾厄武器")
        expect(html).toContain("测试灾厄武器")
        expect(chunks).toHaveLength(3)
        expect(chunks[0]).toContain("Lv. 0")
        expect(chunks[0]).toContain("无解·沉思")
        expect(chunks[0]).toContain("测试描述甲。")
        expect(chunks[1]).toContain("Lv. 1")
        expect(chunks[1]).toContain("测试描述乙。")
        expect(chunks[1]).toContain("技能威力")
        expect(chunks[1]).toContain(formatProp("技能威力", 0.45))

        // 两列布局断言渲染结构：Lv.2 的同一 grid 容器内并排两张技能卡
        expect(chunks[2]).toContain("Lv. 2")
        expect(chunks[2]).toContain("grid-cols-1 gap-2 sm:grid-cols-2")
        expect(chunks[2].match(/data-calamity-skill/g)).toHaveLength(2)
        expect(chunks[2]).toContain("血染·触发")
        expect(chunks[2]).toContain("织羽·精炼")
        expect(chunks[2]).toContain(formatProp("触发概率", 1.8))
        expect(chunks[2]).toContain(formatProp("造成技能伤害", 0.45))
        expect(chunks[0].match(/data-calamity-skill/g)).toHaveLength(1)
    })

    it("描述走 gt：含 . 与 : 的原文仍命中译文", async () => {
        const html = await renderCalamityWeapons([forgeWeapon()])

        expect(html).toContain(GT_TEXT)
        expect(html).not.toContain(`>${GT_SOURCE}<`)
    })

    it("技能 icon：非空输出 webp mask，空 icon 不渲染图标", async () => {
        const html = await renderCalamityWeapons([forgeWeapon()])

        expect(html).toContain("/imgs/webp/T_Skill_Test.webp")
        // 三个档位共 4 个技能，仅「血染·触发」带 icon
        expect(html.match(/url\(\/imgs\/webp\//g)).toHaveLength(1)
    })

    it("不渲染一级 / 二级解锁材料，也不产生任何 ResourceCostItem", async () => {
        const html = await renderCalamityWeapons([forgeWeapon()])

        for (const material of ["测试材料·甲", "测试材料·乙", "二级材料·丙"]) {
            expect(html).not.toContain(material)
        }
        expect(html).not.toContain("data-resource-cost")
        expect(html).not.toContain("解锁")
        expect(html).not.toContain("weapon-detail")
    })

    it("组件源码不含材料渲染路径（ResourceCostItem / 解锁）", () => {
        const source = readFileSync(new URL("../../components/CharCalamityWeaponShow.vue", import.meta.url), "utf8")

        expect(source).not.toContain("ResourceCostItem")
        expect(source).not.toContain("解锁")
    })

    it("熔炉档位缺失 / 空技能数组仍渲染档位标题，不产生技能卡", async () => {
        const html = await renderCalamityWeapons([emptySkillWeapon()])
        const chunks = forgeLevelChunks(html)

        expect(chunks).toHaveLength(2)
        expect(chunks[0]).toContain("Lv. 0")
        expect(chunks[1]).toContain("Lv. 1")
        expect(html.match(/data-calamity-skill/g)).toBeNull()
        expect(html).not.toContain("sm:grid-cols-2")
    })

    it("非灾厄武器（无熔炉）整段不渲染", async () => {
        const html = await renderCalamityWeapons([normalWeapon])

        expect(html).not.toContain("data-calamity-weapon")
        expect(html).not.toContain("灾厄武器")
        expect(html).not.toContain("Lv.")
    })

    it("无武器 / 空武器整段不渲染", async () => {
        for (const weapons of [[], [undefined], [null], [LeveledWeapon.emptyWeapon]]) {
            const html = await renderCalamityWeapons(weapons)

            expect(html).not.toContain("data-calamity-weapon")
            expect(html).not.toContain("灾厄武器")
        }
    })

    it("近战 / 远程同装一把灾厄武器时只展示一次", async () => {
        const weapon = forgeWeapon()
        const html = await renderCalamityWeapons([weapon, weapon])

        expect(html.match(/data-calamity-forge-level/g)).toHaveLength(3)
        expect(html.match(/data-calamity-weapon/g)).toHaveLength(1)
    })

    it("近战与远程各装不同灾厄武器时两把都渲染", async () => {
        const melee = forgeWeapon({ id: 9005, 名称: "近战灾厄", 类型: ["近战", "长柄"] })
        const ranged = forgeWeapon({ id: 9006, 名称: "远程灾厄", 类型: ["远程", "弓"], 伤害类型: "贯穿" })
        const html = await renderCalamityWeapons([melee, ranged])

        expect(html).toContain("近战灾厄")
        expect(html).toContain("远程灾厄")
        expect(html.match(/data-calamity-weapon/g)).toHaveLength(1)
        expect(html.match(/data-calamity-forge-level/g)).toHaveLength(6)
    })

    it("真实武器数据：熔炉档数与数据表一致", async () => {
        const data = weaponData.find(item => item.熔炉 && item.熔炉.length > 0)
        expect(data).toBeTruthy()
        const html = await renderCalamityWeapons([new LeveledWeapon(data as Weapon)])

        expect(html).toContain("data-calamity-weapon")
        expect(html.match(/data-calamity-forge-level/g)).toHaveLength((data as Weapon).熔炉!.length)
    })
})

describe("U133 子区标题键锁定 char-build.calamity_weapon", () => {
    it("en 渲染输出单数 Calamity Weapon，而非 database.forge 的复数 Calamity Weapons", async () => {
        const html = await renderCalamityWeapons([forgeWeapon()], i18nEn)

        expect(html).toContain("Calamity Weapon")
        expect(html).not.toContain("Calamity Weapons")
    })

    it("六语言均存在且为官方译名", () => {
        const expected: Record<(typeof LOCALES)[number], string> = {
            "zh-CN": "灾厄武器",
            "zh-TW": "災厄武器",
            en: "Calamity Weapon",
            ja: "災厄武器",
            ko: "재앙 무기",
            fr: "Arme de calamité",
        }
        for (const locale of LOCALES) {
            const bundle = loadBundle(locale)
            const value = (bundle["char-build"] as Record<string, unknown> | undefined)?.calamity_weapon

            expect(value, `${locale} 缺少 char-build.calamity_weapon`).toBe(expected[locale])
        }
    })
})

describe("U133 CharBuildView 接线", () => {
    const view = readFileSync(new URL("../../views/CharBuildView.vue", import.meta.url), "utf8")

    it("数据源只取近战 / 远程武器", () => {
        expect(view).toContain(
            "const calamityWeaponCandidates = computed(() => [charBuild.value.meleeWeapon, charBuild.value.rangedWeapon])"
        )
    })

    it("挂载在 CharSkillShow 之后", () => {
        const mountAt = view.indexOf('<CharCalamityWeaponShow :weapons="calamityWeaponCandidates" />')
        const skillAt = view.indexOf("<CharSkillShow")

        expect(mountAt).toBeGreaterThan(-1)
        expect(skillAt).toBeGreaterThan(-1)
        expect(mountAt).toBeGreaterThan(skillAt)
    })
})
