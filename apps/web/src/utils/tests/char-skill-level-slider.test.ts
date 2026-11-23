import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { createInstance, type i18n as I18n } from "i18next"
import i18nextVue from "i18next-vue"
import { beforeAll, describe, expect, it } from "vitest"
import { createSSRApp, defineComponent, h } from "vue"
import { renderToString } from "vue/server-renderer"
import CharSkillShow from "@/components/CharSkillShow.vue"
import type { LeveledChar } from "@/data"
import { CHAR_SKILL_LEVEL_MAX, CHAR_SKILL_LEVEL_MIN } from "@/data/charSettings"
import { LeveledSkill } from "@/data/leveled/LeveledSkill"
import { clampCharSkillLevelView, SKILL_LEVEL_UI_MAX } from "@/utils/skill-level-ui"

/** 读取组件源码（相对本测试文件） */
function componentSource(relative: string): string {
    return readFileSync(new URL(relative, import.meta.url), "utf8")
}

/** 取源码中首个 CharSkillShow 宿主标签（属性级断言，容忍换行与属性顺序） */
function charSkillShowTag(source: string): string {
    return source.match(/<CharSkillShow[^>]*\/>/)?.[0] ?? ""
}

const translation = JSON.parse(
    readFileSync(fileURLToPath(new URL("../../../public/i18n/zh-CN/translation.json", import.meta.url)), "utf8")
) as Record<string, unknown>

let i18n: I18n
beforeAll(async () => {
    i18n = createInstance()
    await i18n.init({ lng: "zh-CN", fallbackLng: false, resources: { "zh-CN": { translation } } })
})

/** 最小技能数据：只需驱动滑杆与技能标题 */
const skill = new LeveledSkill({
    id: 1,
    名称: "E技能",
    类型: "伤害",
    描述: "测试技能",
    子技能: [],
} as unknown as ConstructorParameters<typeof LeveledSkill>[0])

const fakeChar = { 技能: [skill] } as unknown as LeveledChar

const SectionHeaderStub = defineComponent({
    props: { noAnimate: Boolean, compact: Boolean, kicker: String, title: String },
    setup:
        (props, { slots }) =>
        () =>
            h("section", [props.title ?? "", slots.trailing?.()]),
})
/** 暴露预览所用技能等级，验证标签与预览同口径 */
const SkillFieldsStub = defineComponent({
    props: { skill: { type: Object, default: null } },
    setup: props => () => h("span", { "data-skill-level": String((props.skill as LeveledSkill | null)?.等级 ?? "") }),
})
const NoopStub = defineComponent({ setup: () => () => null })

/** SSR 渲染 CharSkillShow（全局组件由测试桩替代） */
function renderSkillShow(options: { modelValue?: number; max?: number } = {}): Promise<string> {
    const props = { char: fakeChar, ...options }
    const app = createSSRApp(defineComponent({ render: () => h(CharSkillShow, props) }))
    app.use(i18nextVue, { i18next: i18n })
    app.component("SectionHeader", SectionHeaderStub)
    app.component("SkillFields", SkillFieldsStub)
    app.component("SkillCreatureCards", NoopStub)
    app.component("Icon", NoopStub)
    return renderToString(app)
}

describe("U132 角色详情技能等级滑杆恢复 1–30", () => {
    it("数据层上限 30；构筑页界面上限仍为 10", () => {
        expect(CHAR_SKILL_LEVEL_MIN).toBe(1)
        expect(CHAR_SKILL_LEVEL_MAX).toBe(30)
        expect(SKILL_LEVEL_UI_MAX).toBe(10)
    })

    it("详情页默认满级 30：滑杆 max=30 / min=1，标签与预览一致", async () => {
        const html = await renderSkillShow()
        expect(html).toContain('type="range"')
        expect(html).toContain(`min="${CHAR_SKILL_LEVEL_MIN}"`)
        expect(html).toContain(`max="${CHAR_SKILL_LEVEL_MAX}"`)
        expect(html).toContain(`value="${CHAR_SKILL_LEVEL_MAX}"`)
        expect(html).toContain("Lv.30")
        expect(html).toContain('data-skill-level="30"')
    })

    it("DB 宿主传 17 级不被打回 10，标签与预览同为 17", async () => {
        const html = await renderSkillShow({ modelValue: 17 })
        expect(html).toContain('value="17"')
        expect(html).toContain("Lv.17")
        expect(html).toContain('data-skill-level="17"')
    })

    it("构筑页 PROFILE 宿主等价入参（10 / max=10）：可交互但上限 10", async () => {
        const html = await renderSkillShow({ modelValue: SKILL_LEVEL_UI_MAX, max: SKILL_LEVEL_UI_MAX })
        expect(html).toContain('min="1"')
        expect(html).toContain(`max="${SKILL_LEVEL_UI_MAX}"`)
        expect(html).toContain(`value="${SKILL_LEVEL_UI_MAX}"`)
        expect(html).toContain("Lv.10")
    })

    it("越界 / NaN 入参按上限读钳制：标签、滑杆与预览同口径", async () => {
        const over = await renderSkillShow({ modelValue: 100 })
        expect(over).toContain('max="30"')
        expect(over).toContain('value="30"')
        expect(over).toContain("Lv.30")
        expect(over).toContain('data-skill-level="30"')

        const nan = await renderSkillShow({ modelValue: Number.NaN })
        expect(nan).toContain('value="30"')
        expect(nan).toContain("Lv.30")
        expect(nan).toContain('data-skill-level="30"')

        // 构筑页宿主 max=10 时，越界入参同样按 10 读钳制
        const buildOver = await renderSkillShow({ modelValue: 17, max: SKILL_LEVEL_UI_MAX })
        expect(buildOver).toContain('max="10"')
        expect(buildOver).toContain('value="10"')
        expect(buildOver).toContain("Lv.10")
        expect(buildOver).toContain('data-skill-level="10"')
    })

    it("钳制函数：写入按 [1, max] 取整，NaN 回落上限", () => {
        expect(clampCharSkillLevelView(0)).toBe(CHAR_SKILL_LEVEL_MIN)
        expect(clampCharSkillLevelView(1)).toBe(1)
        expect(clampCharSkillLevelView(17.4)).toBe(17)
        expect(clampCharSkillLevelView(30)).toBe(30)
        expect(clampCharSkillLevelView(31)).toBe(CHAR_SKILL_LEVEL_MAX)
        expect(clampCharSkillLevelView(Number.NaN)).toBe(CHAR_SKILL_LEVEL_MAX)
        expect(clampCharSkillLevelView(17, SKILL_LEVEL_UI_MAX)).toBe(SKILL_LEVEL_UI_MAX)
        expect(clampCharSkillLevelView(Number.NaN, SKILL_LEVEL_UI_MAX)).toBe(SKILL_LEVEL_UI_MAX)
        expect(clampCharSkillLevelView(5, 0)).toBe(CHAR_SKILL_LEVEL_MIN)
        expect(clampCharSkillLevelView(50, 99)).toBe(CHAR_SKILL_LEVEL_MAX)
    })

    it("DB 宿主回归：默认值取数据层上限并保持 v-model 绑定", () => {
        const source = componentSource("../../components/DBCharDetailItem.vue")
        expect(source).toMatch(/const currentSkillLevel = ref\(CHAR_SKILL_LEVEL_MAX\)/)
        const tag = charSkillShowTag(source)
        expect(tag).toContain('v-model="currentSkillLevel"')
    })

    it("构筑页 PROFILE 宿主属性级锁定 10（max 与初始值），编辑器滑杆仍为 10", () => {
        const build = componentSource("../../views/CharBuildView.vue")
        const tag = charSkillShowTag(build)
        expect(tag, "未找到 CharSkillShow 宿主标签").not.toBe("")
        expect(tag).toContain(':model-value="SKILL_LEVEL_UI_MAX"')
        expect(tag).toContain(':max="SKILL_LEVEL_UI_MAX"')
        expect(build).toContain(':max="SKILL_LEVEL_UI_MAX"')
        expect(build).toContain("Math.min(SKILL_LEVEL_UI_MAX, Math.round(value))")

        const transcend = componentSource("../../components/transcend-build/TranscendSkillPanel.vue")
        expect(transcend).toContain(':max="SKILL_LEVEL_UI_MAX"')
        expect(transcend).toContain("Math.min(SKILL_LEVEL_UI_MAX, Math.round(value))")

        const node = componentSource("../../components/nodeEditor/nodes/CharInputNode.vue")
        expect(node.match(/:max="SKILL_LEVEL_UI_MAX"/g)).toHaveLength(3)
    })
})
