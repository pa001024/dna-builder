import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { createInstance, type i18n as I18n } from "i18next"
import i18nextVue from "i18next-vue"
import { beforeAll, describe, expect, it } from "vitest"
import { createSSRApp, defineComponent, h } from "vue"
import { renderToString } from "vue/server-renderer"
import TranscendGearCreate from "@/components/transcend-build/TranscendGearCreate.vue"
import { type GearOcrLine, parseGearOcrLines } from "./ocr-import"

/**
 * U131：OCR 识别顺序直达做装表单预览。识别行序（防御 / 火属性增伤 / 昂扬 / 技能威力）
 * 在 `item.affixes`、编辑器词条行与右侧预览卡中保持一致，不得按 affixId 重排。
 */

const translation = JSON.parse(
    readFileSync(fileURLToPath(new URL("../../../public/i18n/zh-CN/translation.json", import.meta.url)), "utf8")
) as Record<string, unknown>

let i18n: I18n
beforeAll(async () => {
    i18n = createInstance()
    await i18n.init({ lng: "zh-CN", fallbackLng: false, resources: { "zh-CN": { translation } } })
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

/** 用户截图顺序的 OCR 卡（防御为槽 1 基础词条） */
const CARD_TEXT = ["海蚀头盔", "强度 50", "升华装备·头盔", "防御 +262%", "火属性增伤 +14%", "昂扬 +53.5%", "技能威力 +76.5%"]
const makeCard = (texts: readonly string[]): GearOcrLine[] =>
    texts.map((text, index) => ({ text, x: 24, y: 40 + index * 36, width: Math.max(80, text.length * 16), height: 24 }))

/** 按渲染顺序取 data-random-affix-id */
function randomAffixOrder(html: string): number[] {
    return [...html.matchAll(/data-random-affix-id="(\d+)"/g)].map(match => Number(match[1]))
}

/** 右侧预览卡内词条标题顺序（data-affix-title 按渲染顺序） */
function previewTitleOrder(html: string): string[] {
    const preview = html.slice(html.indexOf("data-create-preview"))
    return [...preview.matchAll(/data-affix-title="([^"]*)"/g)].map(match => match[1])
}

describe("U131 OCR 识别顺序直达预览", () => {
    it("编辑器词条行与预览卡均按识别行序输出，不按 affixId 排序", async () => {
        const result = parseGearOcrLines(makeCard(CARD_TEXT))
        expect(result.item).not.toBeNull()
        expect(result.item?.affixes.map(roll => roll.affixId)).toEqual([102, 1033, 1017, 1013])

        const app = createApp(() => h(TranscendGearCreate, { slotType: result.item!.slotType, mode: "create", initial: result.item }))
        const html = await renderToString(app)

        expect(randomAffixOrder(html)).toEqual([1033, 1017, 1013])
        expect(previewTitleOrder(html)).toEqual(["防御", "火属性伤害提升", "昂扬", "技能威力"])
    })
})
