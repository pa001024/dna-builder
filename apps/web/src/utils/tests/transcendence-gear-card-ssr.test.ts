import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { createInstance, type i18n as I18n } from "i18next"
import i18nextVue from "i18next-vue"
import { beforeAll, describe, expect, it } from "vitest"
import { createSSRApp, defineComponent, h } from "vue"
import { renderToString } from "vue/server-renderer"
import TranscendGearItemCard from "@/components/transcend-build/TranscendGearItemCard.vue"
import TranscendGearSquareCard from "@/components/transcend-build/TranscendGearSquareCard.vue"
import { type TranscendGearAffixRoll, type TranscendGearCraftState, type TranscendGearItemConfig, uniqueEquips } from "@/data"

/**
 * U106：卡片数值行 SSR。`T/A/+F` 缩写只用于方形卡（槽位卡 / 方形卡，见渲染测试），
 * 详情卡保持原文字格式；内部预览（装备改造 / 精锻弹窗）与悬浮预览都用
 * `TranscendGearItemCard bare preview`，输出应一致（无 CopyID / 专属键值行 / 档位）。
 */

const translation = JSON.parse(
    readFileSync(fileURLToPath(new URL("../../../public/i18n/zh-CN/translation.json", import.meta.url)), "utf8")
) as Record<string, unknown>

let i18n: I18n
beforeAll(async () => {
    i18n = createInstance()
    await i18n.init({ lng: "zh-CN", fallbackLng: false, resources: { "zh-CN": { translation } } })
})

/** 随机词条 roll（与编辑器同口径） */
function roll(affixId: number): TranscendGearAffixRoll {
    return { affixId, rollLevel: 50, masterworkLevel: 0, ancient: false, finalMasterwork: false, source: "random" }
}

/** 满级 craft 状态 */
const CRAFT: TranscendGearCraftState = { masterworkLevel: 10, temperingCount: 0, enchantCount: 0 }

/** T50 A5 +10F 的物品；patch 用于去掉强度 / 精锻 */
function gearItem(patch: Partial<TranscendGearItemConfig> = {}): TranscendGearItemConfig {
    return {
        kind: "normal",
        slotType: 3,
        rarityId: 5,
        equipBaseScore: 50,
        affixes: [roll(1001), roll(1002), roll(1003), roll(1004), roll(1038)],
        craft: { ...CRAFT },
        ...patch,
    }
}

/** 暗金物品：验证 CopyID 在预览中的抑制 / showCopyId 例外 */
function uniqueItem(): TranscendGearItemConfig {
    const equip = uniqueEquips[0]

    return { kind: "unique", slotType: equip.slot, uniqueId: equip.id, uniqueAffix: roll(equip.affixId), affixes: [] }
}

/** 全局组件桩：测试环境无 unplugin-vue-components 自动注册 */
const CopyIDStub = defineComponent({
    props: { id: { type: [Number, String], default: 0 }, compact: Boolean },
    setup: props => () => h("span", { "data-copy-id": String(props.id) }),
})
const ImageFallbackStub = defineComponent({
    props: { src: { type: String, default: "" }, alt: { type: String, default: "" } },
    setup: props => () => (props.src ? h("img", { src: props.src, alt: props.alt }) : null),
})
const IconStub = defineComponent({ setup: () => () => h("span") })
/** 只渲染触发区（卡片本体），丢弃 tooltip 内容 */
const FullTooltipStub = defineComponent({
    props: { side: String, disabled: Boolean },
    setup:
        (_props, { slots }) =>
        () =>
            slots.default?.(),
})

/** 应用通用桩 */
function createApp(render: () => ReturnType<typeof h>) {
    const app = createSSRApp(defineComponent({ render }))
    app.use(i18nextVue, { i18next: i18n })
    app.component("CopyID", CopyIDStub)
    app.component("ImageFallback", ImageFallbackStub)
    app.component("Icon", IconStub)
    app.component("FullTooltip", FullTooltipStub)

    return app
}

/** 渲染详情卡（与两处预览 aside / 悬浮预览完全相同的 props） */
async function renderItemCard(target: TranscendGearItemConfig, showCopyId = false, preview = true): Promise<string> {
    const app = createApp(() => h(TranscendGearItemCard, { item: target, slotId: 2, bare: true, preview, showCopyId }))

    return renderToString(app)
}

/** 渲染方形卡（选择器上下文，底部信息条可见） */
async function renderSquareCard(target: TranscendGearItemConfig): Promise<string> {
    const app = createApp(() => h(TranscendGearSquareCard, { item: target, slotId: 2, context: "picker", income: 0.123 }))

    return renderToString(app)
}

describe("U106 方形卡数值行：T / A / +F", () => {
    it("T50 A5 +10F 全部渲染，F 为黄色", async () => {
        const html = await renderSquareCard(gearItem())

        expect(html).toMatch(/data-gear-strength[^>]*>\s*T50\s*</)
        expect(html).toMatch(/data-gear-affixes[^>]*>\s*A5\s*</)
        expect(html).toMatch(/class="shrink-0 text-warning"[^>]*data-gear-masterwork[^>]*>\s*\+10F\s*</)
    })

    it("缺强度：不渲染 T token，A / F 不受影响", async () => {
        const html = await renderSquareCard(gearItem({ equipBaseScore: undefined }))

        expect(html).not.toContain("data-gear-strength")
        expect(html).not.toContain("T50")
        expect(html).toMatch(/data-gear-affixes[^>]*>\s*A5\s*</)
        expect(html).toContain("data-gear-masterwork")
    })

    it("缺精锻：不渲染 +F token，T / A 不受影响", async () => {
        const html = await renderSquareCard(gearItem({ craft: { ...CRAFT, masterworkLevel: 0 } }))

        expect(html).not.toContain("data-gear-masterwork")
        expect(html).not.toContain("+10F")
        expect(html).toMatch(/data-gear-strength[^>]*>\s*T50\s*</)
        expect(html).toMatch(/data-gear-affixes[^>]*>\s*A5\s*</)
    })
})

describe("U106 详情卡：保持原文字格式（缩写不适用）", () => {
    it("头部仍为「强度 50」「精锻 10级」，不出现 T/A/F token", async () => {
        const html = await renderItemCard(gearItem())

        expect(html).toMatch(/data-gear-strength[^>]*>\s*50\s*</)
        expect(html).toContain("精锻 10级")
        expect(html).not.toContain("T50")
        expect(html).not.toContain("A5<")
        expect(html).not.toContain("+10F")
    })

    it("预览抑制 CopyID / 专属键值行 / 档位；showCopyId 例外保留（库存悬浮预览语义）", async () => {
        const hidden = await renderItemCard(uniqueItem())
        const shown = await renderItemCard(uniqueItem(), true)

        expect(hidden).not.toContain("data-copy-id")
        expect(shown).toContain("data-copy-id")
        expect(hidden).not.toContain("档位")
        expect(hidden).not.toContain("data-affix-detail-row")
        expect(hidden).toContain("data-gear-title")
        expect(hidden).toContain("data-affix-line")
    })

    it("内部预览与悬浮预览同 item 同 props：输出逐字节一致", async () => {
        const first = await renderItemCard(gearItem())
        const second = await renderItemCard(gearItem())

        expect(first).toBe(second)
    })
})

describe("U120-fix：预览卡底部 Shift 提示行", () => {
    it("预览卡底部渲染 data-gear-shift-hint 与文案（zh-CN）", async () => {
        const html = await renderItemCard(gearItem())

        expect(html).toContain("data-gear-shift-hint")
        expect(html).toContain("按住Shift键查看详情")
    })

    it("ItemCard 源码引用 gear_shift_hint，且提示行只在预览模式渲染", () => {
        const source = readFileSync(
            fileURLToPath(new URL("../../components/transcend-build/TranscendGearItemCard.vue", import.meta.url)),
            "utf8"
        )

        expect(source).toContain('$t("transcend-build.gear_shift_hint")')
        expect(source).toMatch(/v-if="preview"[^>]*data-gear-shift-hint/)
    })

    it("非预览卡不渲染提示行", async () => {
        const html = await renderItemCard(gearItem(), false, false)

        expect(html).not.toContain("data-gear-shift-hint")
        expect(html).not.toContain("按住Shift键查看详情")
    })
})
