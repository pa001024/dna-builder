import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { createInstance, type i18n as I18n } from "i18next"
import i18nextVue from "i18next-vue"
import { beforeAll, describe, expect, it, vi } from "vitest"
import { createSSRApp, defineComponent, h } from "vue"
import { renderToString } from "vue/server-renderer"
import TranscendGearCreate from "@/components/transcend-build/TranscendGearCreate.vue"
import type { TranscendGearItemConfig } from "@/data"
import { getBaseNameById, getBaseNameOptions } from "./catalog"

/**
 * U141：基底卡片副标题按「本卡基底」独立计算，不得串台成当前选中项的预览名；
 * 底部「名称预览」仍跟随选中项。顺带锁住六语言 `gear_subject` 文案。
 */

vi.mock("@/components/transcend-build/TranscendGearCraftPanel.vue", () => ({ default: { setup: () => () => null } }))

const zhCnTranslation = JSON.parse(
    readFileSync(fileURLToPath(new URL("../../../public/i18n/zh-CN/translation.json", import.meta.url)), "utf8")
) as Record<string, unknown>

let i18n: I18n
beforeAll(async () => {
    i18n = createInstance()
    await i18n.init({ lng: "zh-CN", fallbackLng: false, resources: { "zh-CN": { translation: zhCnTranslation } } })
})

const ScrollAreaStub = defineComponent({
    setup:
        (_props, { slots }) =>
        () =>
            slots.default?.(),
})
const SlotStub = defineComponent({
    setup:
        (_props, { slots }) =>
        () =>
            slots.default?.(),
})
const PropsStub = defineComponent({ props: { modelValue: { type: [Number, String], default: 0 } }, setup: () => () => h("span") })
const ImageFallbackStub = defineComponent({
    props: { src: { type: String, default: "" }, alt: { type: String, default: "" } },
    setup: props => () => (props.src ? h("img", { src: props.src, alt: props.alt }) : null),
})
const IconStub = defineComponent({ setup: () => () => h("span") })
const CopyIDStub = defineComponent({
    props: { id: { type: [Number, String], default: 0 }, compact: Boolean },
    setup: () => () => h("span"),
})
const FullTooltipStub = defineComponent({
    props: { side: String, disabled: Boolean },
    setup:
        (_props, { slots }) =>
        () =>
            slots.default?.(),
})

/** 测试环境无 unplugin-vue-components 自动注册：给渲染树里用到的全局组件打桩 */
function createApp(render: () => ReturnType<typeof h>) {
    const app = createSSRApp(defineComponent({ render }))
    app.use(i18nextVue, { i18next: i18n })
    app.component("ScrollArea", ScrollAreaStub)
    app.component("SearchSelect", PropsStub)
    app.component("ImageFallback", ImageFallbackStub)
    app.component("Icon", IconStub)
    app.component("CopyID", CopyIDStub)
    app.component("FullTooltip", FullTooltipStub)
    app.component("TranscendGearSlotIcon", IconStub)
    app.component("TranscendGearSocketEditor", SlotStub)
    app.component("TranscendGearMark", IconStub)
    app.component("TranscendCraftCost", IconStub)
    app.component("AffixTextSegment", SlotStub)

    return app
}

/** 槽型 1（头盔）：三件基底共用前缀「强力」，只能靠基底名区分 */
const SLOT_TYPE = 1

function normalItem(iconId: number): TranscendGearItemConfig {
    return { kind: "normal", slotType: SLOT_TYPE, rarityId: 1, equipBaseScore: 50, iconId, affixes: [] }
}

/** 渲染做装表单；传 `iconId` 走编辑初值以指定选中基底，否则新建模式取首个基底 */
async function renderCreate(iconId?: number): Promise<string> {
    const props = iconId
        ? { slotType: SLOT_TYPE, mode: "edit" as const, initial: normalItem(iconId) }
        : { slotType: SLOT_TYPE, mode: "create" as const }
    const app = createApp(() => h(TranscendGearCreate, props))

    return renderToString(app)
}

/** 按渲染顺序取基底卡片的 id 与副标题预览名（整标签匹配，不依赖属性顺序 / 该属性位于末位） */
function baseCards(html: string): { id: number; previewId: number; preview: string }[] {
    return html
        .split('data-base-name-id="')
        .slice(1)
        .map(chunk => {
            const id = Number(chunk.slice(0, chunk.indexOf('"')))
            const match = chunk.match(/<span[^>]*data-base-preview-id="(\d+)"[^>]*>([^<]*)<\/span>/)

            return { id, previewId: Number(match?.[1] ?? -1), preview: match?.[2] ?? "" }
        })
}

/** 截取某个 data-create-section 区块的 HTML（到下一个区块开始为止） */
function sectionHtml(html: string, section: string): string {
    const start = html.indexOf(`data-create-section="${section}"`)
    if (start < 0) return ""
    const rest = html.slice(start)
    const end = rest.indexOf("data-create-section=", 1)

    return end < 0 ? rest : rest.slice(0, end)
}

/** 底部「名称预览」当前值 */
function bottomNamePreview(html: string): string {
    return html.match(/data-name-preview="true">([^<]*)</)?.[1] ?? ""
}

describe("U141 基底卡片名称预览按本卡独立计算", () => {
    it("每张卡片副标题=该基底自己的预览名（同前缀下仍互不相同）", async () => {
        const html = await renderCreate()
        const cards = baseCards(html)
        const options = getBaseNameOptions(SLOT_TYPE)

        expect(cards.map(card => card.id)).toEqual(options.map(base => base.id))
        for (const card of cards) {
            const baseName = getBaseNameById(card.id)?.name ?? ""
            expect(card.previewId).toBe(card.id)
            expect(card.preview).toContain(baseName)
            expect(card.preview).toBe(`强力${baseName}`)
        }
        expect(new Set(cards.map(card => card.preview)).size).toBe(cards.length)
        // create 模式（无 initial）底部预览默认取首个基底
        expect(bottomNamePreview(html)).toBe(cards[0].preview)
    })

    it("切换选中基底：其它卡片副标题不变，底部名称预览跟随选中项", async () => {
        const before = await renderCreate(1001)
        const after = await renderCreate(1003)
        const beforeCards = baseCards(before)
        const afterCards = baseCards(after)

        expect(beforeCards.map(card => card.preview)).toEqual(["强力海蚀头盔", "强力海雾头盔", "强力海妖头盔"])
        expect(afterCards.map(card => card.preview)).toEqual(beforeCards.map(card => card.preview))
        expect(bottomNamePreview(before)).toBe("强力海蚀头盔")
        expect(bottomNamePreview(after)).toBe("强力海妖头盔")
    })

    it("区块标题使用 gear_subject（zh-CN「基底」）", async () => {
        const html = await renderCreate()
        const subject = sectionHtml(html, "subject")

        expect(subject).not.toBe("")
        expect(subject).toMatch(/<span[^>]*>基底<\/span>/)
        expect(subject).not.toContain("主体")
    })
})

describe("U141 六语言 gear_subject", () => {
    const EXPECTED: Record<string, string> = {
        "zh-CN": "基底",
        "zh-TW": "基底",
        en: "Base",
        ja: "ベース",
        ko: "기본",
        fr: "Base",
    }

    /** 读取某语言 translation.json 里的 transcend-build.gear_subject */
    function gearSubject(locale: string): unknown {
        const file = new URL(`../../../public/i18n/${locale}/translation.json`, import.meta.url)
        const json = JSON.parse(readFileSync(fileURLToPath(file), "utf8")) as Record<string, unknown>

        return (json["transcend-build"] as Record<string, unknown> | undefined)?.gear_subject
    }

    it("六个 locale 的键都存在且值符合预期", () => {
        for (const [locale, expected] of Object.entries(EXPECTED)) {
            expect(`${locale}=${String(gearSubject(locale))}`).toBe(`${locale}=${expected}`)
        }
    })
})
