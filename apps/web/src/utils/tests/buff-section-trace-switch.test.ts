import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { createInstance, type i18n as I18n } from "i18next"
import i18nextVue from "i18next-vue"
import { beforeAll, describe, expect, it, vi } from "vitest"
import { type Component, createSSRApp, defineComponent, h } from "vue"
import { renderToString } from "vue/server-renderer"
import BuffSectionBody, { type BuffSectionSettings, type TraceCardView } from "@/components/BuffSectionBody.vue"
import { LeveledBuff } from "@/data"

/**
 * U138：溯源开关改用项目标准 daisyUI toggle（`input[type=checkbox].toggle`），
 * 保留 `data-trace-switch` 锚点与整行点击；行不再是 `role="switch"`，避免嵌套交互语义。
 * 仓库无 @vue/test-utils / DOM 环境（.vue 在测试里按 SSR 编译，只能渲染不能挂载点击）：
 * SSR 断言实际渲染出的 markup，事件语义以源码锚点 + 绑定数量断言覆盖。
 */

vi.mock("@/components/TeamEditor.vue", () => ({ __esModule: true, default: { name: "TeamEditorStub", render: () => null } }))
vi.mock("@/components/PetEditor.vue", () => ({ __esModule: true, default: { name: "PetEditorStub", render: () => null } }))
vi.mock("@/components/TraitEditer.vue", () => ({ __esModule: true, default: { name: "TraitEditerStub", render: () => null } }))
vi.mock("@/components/BuffEditer.vue", () => ({ __esModule: true, default: { name: "BuffEditerStub", render: () => null } }))
vi.mock("@/components/CustomBuffEditor.vue", () => ({ __esModule: true, default: { name: "CustomBuffEditorStub", render: () => null } }))

const translation = JSON.parse(
    readFileSync(fileURLToPath(new URL("../../../public/i18n/zh-CN/translation.json", import.meta.url)), "utf8")
) as Record<string, unknown>

let i18n: I18n
beforeAll(async () => {
    i18n = createInstance()
    await i18n.init({ lng: "zh-CN", fallbackLng: false, resources: { "zh-CN": { translation } } })
})

/** 自动导入组件在测试环境不会注册，按 SSR 测试同一先例做全局桩 */
const ShowPropsStub = defineComponent({
    props: { side: String, props: Object, attr: Object, title: String },
    setup:
        (_props, { slots }) =>
        () =>
            h("div", { "data-show-props": "" }, slots.default?.()),
})
const ImageFallbackStub = defineComponent({
    props: { src: { type: String, default: "" }, alt: { type: String, default: "" } },
    setup: () => () => h("span", { "data-image-fallback": "" }),
})
const IconStub = defineComponent({ setup: () => () => h("span") })
const NumberInputStub = defineComponent({
    props: { modelValue: Number, min: Number, max: Number },
    emits: ["update:modelValue"],
    setup: () => () => h("span", { "data-number-input": "" }),
})
const CoverageDialogStub = defineComponent({
    props: { coverage: Number, title: String, hint: String },
    emits: ["updateCoverage"],
    setup: () => () => h("span", { "data-coverage-dialog": "" }),
})

/** SSR 渲染时的全局桩（自动导入组件在测试环境不会注册，同 transcendence-gear-card-ssr 先例） */
function registerStubs(app: { component: (name: string, component: Component) => unknown }): void {
    app.component("ShowProps", ShowPropsStub)
    app.component("ImageFallback", ImageFallbackStub)
    app.component("Icon", IconStub)
    app.component("NumberInput", NumberInputStub)
    app.component("CoverageDialog", CoverageDialogStub)
}

const SETTINGS: BuffSectionSettings = {
    team1: "-",
    team1Weapon: "-",
    team1Build: "",
    team1BuildVariant: "",
    team2: "-",
    team2Weapon: "-",
    team2Build: "",
    team2BuildVariant: "",
    petId: 0,
    petLevel: 1,
    petCoverage: 1,
    petAutoCoverage: true,
    traits: [],
    customBuff: [],
}

/** 单张溯源卡（main 03，可按需改状态 / 等级） */
function traceCard(patch: Partial<TraceCardView> = {}): TraceCardView {
    return {
        side: "main",
        root: 3,
        active: true,
        charId: 1001,
        charName: "测试角色",
        charIcon: "",
        titleKey: "char-build.root_3",
        description: "测试描述",
        buff: new LeveledBuff({ 名称: "测试溯源", attr: { 攻击: 1 } }, 1),
        income: 0,
        mx: 1,
        level: 1,
        hasAttrs: false,
        coverage: 1,
        ...patch,
    }
}

/** 组件必需 props */
function sectionProps(cards: TraceCardView[]) {
    return {
        charSettings: SETTINGS,
        team1Options: {},
        team2Options: {},
        weaponOptions: {},
        buffOptions: [],
        selectedBuffs: [],
        traceCards: cards,
        petCd: 0,
        petCdReduce: 0,
        petLevel: 1,
        petLevelBonus: 0,
    }
}

/** SSR 渲染 BUFF 区 */
async function renderSection(cards: TraceCardView[]): Promise<string> {
    const app = createSSRApp(defineComponent({ render: () => h(BuffSectionBody as Component, sectionProps(cards)) }))
    app.use(i18nextVue, { i18next: i18n })
    registerStubs(app)
    return renderToString(app)
}

/** 取 SSR 输出中以 data-trace-switch 标记的 input 标签 */
function switchTag(html: string): string {
    const match = html.match(/<input[^>]*data-trace-switch[^>]*>/)
    expect(match, "缺少 data-trace-switch input").not.toBeNull()
    return match![0]
}

/** 取 SSR 输出中的行标签 */
function rowTag(html: string): string {
    const match = html.match(/<li[^>]*data-trace-row[^>]*>/)
    expect(match, "缺少 data-trace-row 行").not.toBeNull()
    return match![0]
}

describe("U138 SSR：标准 toggle markup", () => {
    it("开关为 input.toggle.toggle-xs.toggle-primary，保留 data-trace-switch / aria-label", async () => {
        const html = await renderSection([traceCard()])
        const tag = switchTag(html)

        expect(tag).toContain('type="checkbox"')
        expect(tag).toContain('class="toggle toggle-xs toggle-primary shrink-0"')
        expect(tag).toContain('aria-label="第三根源"')
        expect(tag).toContain("checked")
    })

    it("未激活卡片不勾选，行降透明度；行不再声明 switch 语义", async () => {
        const html = await renderSection([traceCard({ active: false })])
        const tag = switchTag(html)
        const row = rowTag(html)

        expect(tag).not.toContain("checked")
        expect(tag).toContain('aria-label="第三根源"')
        expect(row).toContain("opacity-45")
        expect(row).not.toContain('role="switch"')
        expect(row).not.toContain("aria-checked")
        expect(row).not.toContain("tabindex")
    })

    it("不再渲染自绘轨道 / 圆点（无嵌套 span 轨道）", async () => {
        const html = await renderSection([traceCard()])

        expect(html).not.toContain("left-3.5")
        expect(html).not.toContain("relative inline-flex h-4 w-7")
        expect(html).not.toMatch(/data-trace-switch[^>]*>\s*<span/)
    })
})

describe("U138 事件计数：行 / 开关各触发一次（源码锚点）", () => {
    const source = readFileSync(fileURLToPath(new URL("../../components/BuffSectionBody.vue", import.meta.url)), "utf8")
    const template = source.slice(source.indexOf("<template>"))
    // 以 data-trace-row 定位（不能用 data-trace-card：会被 data-trace-cards 前缀误命中）
    const rowAnchor = template.indexOf("data-trace-row")
    const rowMarkup = template.slice(template.lastIndexOf("<li", rowAnchor), template.indexOf("</li>", rowAnchor))

    /** 取包含锚点的开标签原文（自锚点向前回溯到 `<`） */
    function openingTag(markup: string, anchor: string): string {
        const anchorIndex = markup.indexOf(anchor)
        expect(anchorIndex, `缺少锚点 ${anchor}`).toBeGreaterThan(-1)
        return markup.slice(markup.lastIndexOf("<", anchorIndex), markup.indexOf(">", anchorIndex) + 1)
    }

    /** 开标签上的事件绑定：事件名（含修饰符）→ 表达式（无表达式为 null） */
    function bindings(tag: string): Map<string, string | null> {
        const result = new Map<string, string | null>()
        for (const match of tag.matchAll(/@([\w.-]+)(?:="([^"]*)")?/g)) result.set(match[1], match[2] ?? null)
        return result
    }

    it("整个模板只有两处 toggleTrace emit：行点击 + 开关 change", () => {
        expect(template.match(/emit\('toggleTrace'/g)).toHaveLength(2)
    })

    it("行只绑定一个 click（emit 一次），无键盘自定义 handler", () => {
        const bindingsOfRow = bindings(openingTag(rowMarkup, "data-trace-card"))

        expect([...bindingsOfRow.keys()]).toEqual(["click"])
        expect(bindingsOfRow.get("click")).toBe("emit('toggleTrace', card.side, card.root)")
        expect(openingTag(rowMarkup, "data-trace-card")).not.toContain("@keydown")
    })

    it("开关 click 只阻止冒泡、不 emit；change 恰好 emit 一次（无双触发）", () => {
        const bindingsOfInput = bindings(openingTag(rowMarkup, "data-trace-switch"))

        expect([...bindingsOfInput.keys()]).toEqual(["click.stop", "change"])
        expect(bindingsOfInput.get("click.stop")).toBeNull()
        expect(bindingsOfInput.get("change")).toBe("emit('toggleTrace', card.side, card.root)")
    })

    it("开关为 checkbox 且无自定义键盘处理：Space 走原生激活，只触发一次 change", () => {
        const tag = openingTag(rowMarkup, "data-trace-switch")

        expect(tag).toContain('type="checkbox"')
        expect(tag).not.toContain("@keydown")
        expect(tag).not.toContain("@keyup")
    })

    it("等级 / 覆盖率控件仍以 .stop 隔离，不冒泡触发行切换", () => {
        const level = openingTag(rowMarkup, "<NumberInput")
        expect(bindings(level).get("click.stop")).toBeNull()
        expect(bindings(level).has("keydown.stop")).toBe(true)
        expect(rowMarkup).toContain('<span v-if="card.active && card.hasAttrs" class="contents" @keydown.stop>')
    })
})
