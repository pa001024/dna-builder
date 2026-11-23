import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { createInstance, type i18n as I18n } from "i18next"
import i18nextVue from "i18next-vue"
import { beforeAll, describe, expect, it } from "vitest"
import { createSSRApp, defineComponent, h } from "vue"
import { renderToString } from "vue/server-renderer"
import TranscendAffixEntry from "@/components/transcend-build/TranscendAffixEntry.vue"
import { affixes, type TranscendGearEntry } from "@/data"
import { getAffixNote } from "@/utils/transcendence-gear"

/** 读取组件源码：无 @vue/test-utils 环境下的渲染契约锚点 */
function componentSource(relativePath: string): string {
    return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8")
}

const translation = JSON.parse(
    readFileSync(fileURLToPath(new URL("../../../public/i18n/zh-CN/translation.json", import.meta.url)), "utf8")
) as Record<string, unknown>

let i18n: I18n
beforeAll(async () => {
    i18n = createInstance()
    await i18n.init({ lng: "zh-CN", fallbackLng: false, resources: { "zh-CN": { translation } } })
})

/** 只读构筑词条项；note 展示与养成控件无关 */
function entryOf(affixId: number): TranscendGearEntry {
    return { slotId: 1, affixId, rollLevel: 1, masterworkLevel: 0, ancient: false, finalMasterwork: false }
}

/** SSR 渲染词条卡（真实绑定位置，而非仅模板源码锚点） */
async function renderEntry(affixId: number): Promise<string> {
    const affix = affixes.find(item => item.id === affixId)!
    const app = createSSRApp(defineComponent({ render: () => h(TranscendAffixEntry, { affix, entry: entryOf(affixId), readonly: true }) }))
    app.use(i18nextVue, { i18next: i18n })

    return renderToString(app)
}

describe("getAffixNote 只读建模说明", () => {
    it("有 note 的词条返回说明文本（150401 / 2014）", () => {
        expect(getAffixNote(150401)).toContain("未建模")
        expect(getAffixNote(2014)).toContain("偏高")
    })

    it("无 note 的词条返回空串（101 / 已登记但无 note 的 2004 / 未登记 id）", () => {
        expect(getAffixNote(101)).toBe("")
        expect(getAffixNote(2004)).toBe("")
        expect(getAffixNote(999999)).toBe("")
    })
})

describe("note 渲染契约：有 note 才显示，只读不参与计算", () => {
    const targets = [
        ["DBTranscendenceGearDetailItem.vue", "../../components/DBTranscendenceGearDetailItem.vue"],
        ["TranscendAffixEntry.vue", "../../components/transcend-build/TranscendAffixEntry.vue"],
    ] as const

    for (const [name, path] of targets) {
        it(`${name}：v-if 绑定 noteText、排除行样式、无编辑控件`, () => {
            const source = componentSource(path)

            expect(source).toContain("getAffixNote")
            expect(source).toContain('v-if="noteText"')
            expect(source).toContain("data-affix-note")

            const start = source.indexOf("data-affix-note")
            const open = source.lastIndexOf("<p", start)
            const block = source.slice(open, source.indexOf("</p>", start) + 4)
            expect(block).toContain("border-base-content/20")
            expect(block).toContain("text-base-content/55")
            expect(block).not.toContain("<input")
            expect(block).not.toContain("<button")
            expect(block).not.toContain("@click")
        })
    }
})

describe("词条卡 SSR：note 绑定到实际渲染结果", () => {
    it("有 note（150401）输出说明块与说明文本", async () => {
        const html = await renderEntry(150401)

        expect(html).toContain("data-affix-note")
        expect(html).toContain("未建模")
    })

    it("无 note（2004）不输出说明块", async () => {
        const html = await renderEntry(2004)

        expect(getAffixNote(2004)).toBe("")
        expect(html).not.toContain("data-affix-note")
    })
})
