import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { createInstance, type i18n as I18n } from "i18next"
import i18nextVue from "i18next-vue"
import { beforeAll, describe, expect, it } from "vitest"
import { type Component, createSSRApp, defineComponent, h } from "vue"
import { createMemoryHistory, createRouter } from "vue-router"
import { renderToString } from "vue/server-renderer"
import DBTranscendenceGearAffixView from "@/views/DBTranscendenceGearAffixView.vue"
import DBTranscendenceGearInlayView from "@/views/DBTranscendenceGearInlayView.vue"
import DBTranscendenceGearUniqueView from "@/views/DBTranscendenceGearUniqueView.vue"

/**
 * U139：三个列表视图的「推算值 / 精确数值」徽章旁直接展示「属性名（含 scope） + 数值」，
 * 列表行由 VirtualList 渲染，测试用桩件展开全部条目后断言实际挂载结果与源码接线。
 * Inlay 当前数据无建模分支例句（5 个建模镶嵌词条均带 addAttrs），该视图只锁定 hint 走数据属性分支。
 */

const translation = JSON.parse(
    readFileSync(fileURLToPath(new URL("../../../public/i18n/zh-CN/translation.json", import.meta.url)), "utf8")
) as Record<string, unknown>

let i18n: I18n
beforeAll(async () => {
    i18n = createInstance()
    await i18n.init({ lng: "zh-CN", fallbackLng: false, resources: { "zh-CN": { translation } } })
})

/** 展开全部条目的虚拟列表桩：验证行内容，不模拟滚动窗口 */
const VirtualListStub = defineComponent({
    props: {
        items: { type: Array, default: () => [] },
        itemHeight: { type: Number, default: 0 },
        itemKey: { type: Function, default: undefined },
        activeIndex: { default: null },
    },
    setup: (props, { slots }) => () =>
        h(
            "div",
            { "data-virtual-list": "" },
            (props.items as unknown[]).map((item, index) => slots.default?.({ item, index, animate: false, rowHeight: props.itemHeight }))
        ),
})

/** 主从布局桩：同时渲染 master / detail */
const SplitViewStub = defineComponent({
    props: { desktopRatio: { type: Number, default: 0 }, detailOpen: Boolean },
    setup: (_props, { slots }) => () => h("div", [slots.master?.() ?? null, slots.detail?.() ?? null]),
})

/** 只渲染默认插槽的容器桩 */
const ScrollAreaStub = defineComponent({ setup: (_props, { slots }) => () => h("div", slots.default?.()) })
const SRouterLinkStub = defineComponent({
    props: { to: { default: undefined }, stop: Boolean },
    setup: (_props, { slots }) => () => h("div", { "data-stub": "SRouterLink" }, slots.default?.()),
})

/** 无内容桩（搜索框 / 筛选器 / 详情面板等与提示行无关的组件） */
function noopHost(name: string) {
    return defineComponent({ name, setup: () => () => null })
}

/** 渲染单个列表视图（路由 + i18n + 全局组件桩） */
async function renderView(component: Component): Promise<string> {
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [{ path: "/", component: defineComponent({ render: () => null }) }],
    })
    await router.push("/")
    await router.isReady()

    const app = createSSRApp(defineComponent({ render: () => h(component) }))
    app.use(router)
    app.use(i18nextVue, { i18next: i18n })
    app.component("VirtualList", VirtualListStub)
    app.component("SplitView", SplitViewStub)
    app.component("ScrollArea", ScrollAreaStub)
    app.component("SRouterLink", SRouterLinkStub)
    app.component("ImageFallback", noopHost("ImageFallback"))
    app.component("CopyID", noopHost("CopyID"))
    app.component("DbSearchBox", noopHost("DbSearchBox"))
    app.component("FilterSelect", noopHost("FilterSelect"))
    app.component("ResourceCostItem", noopHost("ResourceCostItem"))
    app.component("DBTranscendenceGearDetailItem", noopHost("DBTranscendenceGearDetailItem"))

    return renderToString(app)
}

/** 取包含目标文本的列表卡片（article）HTML 片段 */
function cardOf(html: string, needle: string): string {
    const card = html
        .split("<article")
        .slice(1)
        .find(fragment => fragment.includes(needle))

    expect(card, `未找到包含「${needle}」的列表卡片`).toBeDefined()

    return card!
}

/** 取指定 class 的 span 全文：用全等比较，避免子串断言放过值后重复 scope */
function spanTexts(html: string, className: string): string[] {
    return [...html.matchAll(/<span class="([^"]*)"[^>]*>([^<]*)<\/span>/g)]
        .filter(match => match[1] === className)
        .map(match => match[2])
}

/** 取镶嵌卡片内的词条组（组容器按摘要定位） */
function inlayGroupOf(html: string, summary: string): string {
    const group = html
        .split('class="flex flex-wrap items-center gap-x-2 gap-y-1')
        .slice(1)
        .find(fragment => fragment.includes(`>${summary}</span>`))

    expect(group, `未找到包含「${summary}」的镶嵌词条组`).toBeDefined()

    return group!
}

describe("U139 列表数值提示：属性名（含 scope） + 数值", () => {
    const cases = [
        { id: "2002", hint: "近战普攻独立增伤 +32%" },
        { id: "180101", hint: "技能独立增伤（字段标签限定：战技） +30%" },
        { id: "420101", hint: "无视防御（字段名限定：星河寥落 + 字段标签限定：下落攻击） +100%" },
    ] as const

    it("暗金装备列表：提示元素全文为「属性名（含 scope） + 数值」，且与建模徽章同卡", async () => {
        const html = await renderView(DBTranscendenceGearUniqueView)

        for (const item of cases) {
            const card = cardOf(html, item.hint)

            // 全文全等：值后重复追加 scope 会让该断言失败
            expect(spanTexts(card, "font-orbitron text-primary/70")).toEqual([item.hint])
            expect(card).toContain("data-modeled-hint")
            expect(card).toMatch(/推算值|精确数值/)
        }
    })

    it("词缀列表：提示元素全文同样为「属性名（含 scope） + 数值」", async () => {
        const html = await renderView(DBTranscendenceGearAffixView)

        for (const item of cases) {
            const card = cardOf(html, item.hint)

            expect(spanTexts(card, "truncate")).toEqual([item.hint])
            expect(card).toMatch(/推算值|精确数值/)
        }
    })

    it("镶嵌列表：hint 走数据属性分支（3202 → +12），summary 单独为「生命回复」", async () => {
        const html = await renderView(DBTranscendenceGearInlayView)
        const group = inlayGroupOf(html, "生命回复")

        expect(spanTexts(group, "min-w-0 truncate text-[11px] text-base-content/70")).toEqual(["生命回复"])
        expect(spanTexts(group, "font-orbitron text-[10px] text-primary/70")).toEqual(["+12"])
    })
})

describe("U139 三列表视图接线（源码断言）", () => {
    const views = [
        ["DBTranscendenceGearAffixView.vue", "../../views/DBTranscendenceGearAffixView.vue", /\{\{\s*valueHintOf\(affix\)\s*\}\}/],
        ["DBTranscendenceGearUniqueView.vue", "../../views/DBTranscendenceGearUniqueView.vue", /\{\{\s*row\.valueHint\s*\}\}/],
        ["DBTranscendenceGearInlayView.vue", "../../views/DBTranscendenceGearInlayView.vue", /\{\{\s*group\.valueHint\s*\}\}/],
    ] as const

    for (const [name, path, templatePattern] of views) {
        it(`${name}：调用 getAffixValueHint(affix, t, gt) 且模板插值渲染 hint`, () => {
            const source = readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8")

            expect(source).toMatch(/\bgetAffixValueHint\(\s*affix\s*,\s*t\s*,\s*gt\s*\)/)
            expect(source).toMatch(templatePattern)
        })
    }
})

describe("U139 scope 文案键在全部语言包中存在", () => {
    const locales = ["zh-CN", "zh-TW", "en", "ja", "ko", "fr"] as const

    for (const locale of locales) {
        it(`${locale}：字段名 / 字段标签限定键均带 {{value}} 占位`, () => {
            const pack = JSON.parse(
                readFileSync(fileURLToPath(new URL(`../../../public/i18n/${locale}/translation.json`, import.meta.url)), "utf8")
            ) as { "db-transcendence"?: { gear?: Record<string, unknown> } }
            const gear = pack["db-transcendence"]?.gear ?? {}

            for (const key of ["modeled_scope_field", "modeled_scope_tag"]) {
                expect(typeof gear[key], `${locale} ${key}`).toBe("string")
                expect(gear[key], `${locale} ${key}`).toContain("{{value}}")
            }
        })
    }
})
