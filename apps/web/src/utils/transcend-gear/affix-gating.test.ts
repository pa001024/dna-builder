import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { createInstance, type i18n as I18n } from "i18next"
import i18nextVue from "i18next-vue"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { createSSRApp, defineComponent, h } from "vue"
import { renderToString } from "vue/server-renderer"
import TranscendGearAffixRow from "@/components/transcend-build/TranscendGearAffixRow.vue"
import TranscendGearCreate from "@/components/transcend-build/TranscendGearCreate.vue"
import TranscendGearItemCard from "@/components/transcend-build/TranscendGearItemCard.vue"
import TranscendGearSection from "@/components/transcend-build/TranscendGearSection.vue"
import {
    createDefaultTranscendBuildSettings,
    TRANSCEND_UNIQUE_RARITY_ID,
    type TranscendBuildSettings,
    type TranscendGearAffixRoll,
    type TranscendGearItemConfig,
    uniqueEquips,
} from "@/data"
import { type GearAffixLine, getItemAffixLines } from "./display"
import { isAffixAllowedForChar } from "./generation"

/** Section 运行时透传采集：槽位卡被替换为 stub，记录每个槽位收到的 charId */
const { slotCardProps } = vi.hoisted(() => ({ slotCardProps: [] as { slotId: number; charId: number }[] }))

vi.mock("@/components/transcend-build/TranscendGearSlot.vue", async () => {
    const { h: stubH } = await import("vue")

    return {
        default: {
            props: { slot: { type: Object, required: true }, charId: { type: Number, default: 0 } },
            setup(props: { slot: { slotId: number }; charId: number }) {
                slotCardProps.push({ slotId: props.slot.slotId, charId: props.charId })
                return () => stubH("div", { "data-stub-gear-slot": props.slot.slotId, "data-stub-char-id": props.charId })
            },
        },
    }
})
vi.mock("@/components/transcend-build/TranscendGearPicker.vue", () => ({ default: { setup: () => () => null } }))
vi.mock("@/components/transcend-build/TranscendGearCraftDialog.vue", () => ({ default: { setup: () => () => null } }))
vi.mock("@/components/transcend-build/TranscendGearInventoryDialog.vue", () => ({ default: { setup: () => () => null } }))
vi.mock("@/components/transcend-build/TranscendGearCraftPanel.vue", () => ({ default: { setup: () => () => null } }))
vi.mock("@/store/ui", () => ({ useUIStore: () => ({ showSuccessMessage: () => {}, showErrorMessage: () => {} }) }))
vi.mock("@/utils/transcend-gear/stock", async () => {
    const { ref: stubRef } = await import("vue")

    return {
        transcendGearStock: {
            rows: stubRef([]),
            usingMemory: stubRef(false),
            init: async () => {},
            owns: () => false,
            ownedCount: () => 0,
        },
    }
})

/**
 * U134：词条适用角色（`charIds`）与构筑位角色不匹配时整行划线。
 * 收益候选已由 U130 门控（不产出候选），本测试只断言展示层与宿主透传。
 */

const translation = JSON.parse(
    readFileSync(fileURLToPath(new URL("../../../public/i18n/zh-CN/translation.json", import.meta.url)), "utf8")
) as Record<string, unknown>

let i18n: I18n
beforeAll(async () => {
    i18n = createInstance()
    await i18n.init({ lng: "zh-CN", fallbackLng: false, resources: { "zh-CN": { translation } } })
    // Section 防抖用 window.setTimeout（node SSR 无 window）：只提供最小桩，不实际调度
    vi.stubGlobal("window", {
        setTimeout: () => 0,
        clearTimeout: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        document: { addEventListener: () => {}, hidden: false },
    })
})

afterAll(() => {
    vi.unstubAllGlobals()
})

const CopyIDStub = defineComponent({
    props: { id: { type: [Number, String], default: 0 }, compact: Boolean },
    setup: props => () => h("span", { "data-copy-id": String(props.id) }),
})
const ImageFallbackStub = defineComponent({
    props: { src: { type: String, default: "" }, alt: { type: String, default: "" } },
    setup: props => () => (props.src ? h("img", { src: props.src, alt: props.alt }) : null),
})
const IconStub = defineComponent({ setup: () => () => h("span") })
const ScrollAreaStub = defineComponent({
    setup:
        (_props, { slots }) =>
        () =>
            h("div", slots.default?.()),
})
const SearchSelectStub = defineComponent({ setup: () => () => null })

function createApp(render: () => ReturnType<typeof h>) {
    const app = createSSRApp(defineComponent({ render }))
    app.use(i18nextVue, { i18next: i18n })
    app.component("CopyID", CopyIDStub)
    app.component("ImageFallback", ImageFallbackStub)
    app.component("Icon", IconStub)
    app.component("ScrollArea", ScrollAreaStub)
    app.component("SearchSelect", SearchSelectStub)
    app.component("TranscendGearSlotIcon", IconStub)

    return app
}

function roll(affixId: number, patch: Partial<TranscendGearAffixRoll> = {}): TranscendGearAffixRoll {
    return { affixId, rollLevel: 50, masterworkLevel: 0, ancient: false, finalMasterwork: false, source: "random", ...patch }
}

/** 菲娜专属（`charIds: [1801]`）所属暗金装备位 */
const CHAR_AFFIX_ID = 180101
const CHAR_AFFIX_CHAR_ID = 1801
const OTHER_CHAR_ID = 1502

function uniqueItem(affixId = CHAR_AFFIX_ID): TranscendGearItemConfig {
    const equip = uniqueEquips.find(entry => entry.affixId === affixId)!

    return {
        kind: "unique",
        slotType: equip.slot,
        rarityId: TRANSCEND_UNIQUE_RARITY_ID,
        equipBaseScore: 50,
        uniqueId: equip.id,
        uniqueAffix: roll(affixId, { source: "unique", rollLevel: 1 }),
        affixes: [],
    }
}

function uniqueLine(): GearAffixLine {
    return getItemAffixLines(uniqueItem(), 2)[0]
}

function normalLine(): GearAffixLine {
    return getItemAffixLines({ kind: "normal", slotType: 1, affixes: [roll(1001)] }, 1)[0]
}

async function renderRow(line: GearAffixLine, extra: { charId?: number; income?: number | null } = {}): Promise<string> {
    const app = createApp(() => h(TranscendGearAffixRow, { line, slotId: 2, showUniqueDetails: true, ...extra }))

    return renderToString(app)
}

async function renderItemCard(target: TranscendGearItemConfig, charId: number): Promise<string> {
    const app = createApp(() => h(TranscendGearItemCard, { item: target, slotId: 2, charId, bare: true, preview: true }))

    return renderToString(app)
}

/** 三组构筑位各自不同角色：main / assist1 / assist2 */
function settingsForSides(): TranscendBuildSettings {
    const settings = createDefaultTranscendBuildSettings(1101)
    settings.assist1.charId = 1502
    settings.assist2.charId = 3102

    return settings
}

/** 渲染装备区（槽位卡 stub 记录各槽收到的 charId） */
async function renderSection(settings: TranscendBuildSettings): Promise<string> {
    slotCardProps.length = 0
    const app = createApp(() => h(TranscendGearSection, { settings }))

    return renderToString(app)
}

/** 渲染新建 / 编辑组件（库存编辑路径：charId 过滤候选，gatingCharId 只影响展示） */
async function renderCreate(props: Record<string, unknown>): Promise<string> {
    const equip = uniqueEquips.find(entry => entry.affixId === CHAR_AFFIX_ID)!
    const app = createApp(() => h(TranscendGearCreate, { slotType: equip.slot, slotId: 2, mode: "edit", initial: uniqueItem(), ...props }))

    return renderToString(app)
}

describe("isAffixAllowedForChar：门控口径", () => {
    it("charIds 命中放行；不命中拒绝；无 charIds / 无角色上下文放行", () => {
        const affix = uniqueLine().affix!

        expect(isAffixAllowedForChar(affix, CHAR_AFFIX_CHAR_ID)).toBe(true)
        expect(isAffixAllowedForChar(affix, OTHER_CHAR_ID)).toBe(false)
        expect(isAffixAllowedForChar(affix, 0)).toBe(true)
        expect(isAffixAllowedForChar({ ...affix, charIds: undefined }, OTHER_CHAR_ID)).toBe(true)
        expect(isAffixAllowedForChar({ ...affix, charIds: [] }, OTHER_CHAR_ID)).toBe(true)
    })
})

describe("TranscendGearAffixRow：角色门控整行划线（SSR）", () => {
    it("角色不匹配：输出 data-affix-gated 与 line-through", async () => {
        const html = await renderRow(uniqueLine(), { charId: OTHER_CHAR_ID })

        expect(html).toContain('data-affix-gated="true"')
        expect(html).toContain("line-through")
    })

    it("角色命中 / 传 0 / 未传：不门控（无 data-affix-gated 与 line-through）", async () => {
        for (const html of [
            await renderRow(uniqueLine(), { charId: CHAR_AFFIX_CHAR_ID }),
            await renderRow(uniqueLine(), { charId: 0 }),
            await renderRow(uniqueLine()),
        ]) {
            expect(html).not.toContain("data-affix-gated")
            expect(html).not.toContain("line-through")
        }
    })

    it("普通行（无 charIds）：任意角色都不划线", async () => {
        const html = await renderRow(normalLine(), { charId: OTHER_CHAR_ID })

        expect(html).not.toContain("data-affix-gated")
        expect(html).not.toContain("line-through")
    })

    it("普通行 mock charIds：不匹配角色同样整行划线，带 income 时收益一并划线", async () => {
        const base = normalLine()
        const line: GearAffixLine = { ...base, affix: { ...base.affix!, charIds: [1102] } }
        const plain = await renderRow(line, { charId: OTHER_CHAR_ID })
        const withIncome = await renderRow(line, { charId: OTHER_CHAR_ID, income: 0.123 })

        expect(plain).toContain('data-affix-gated="true"')
        expect(plain).toContain("line-through")
        expect(withIncome).toContain('data-affix-gated="true"')
        expect(withIncome).toContain("data-affix-income")
        expect(withIncome).toContain("+12.3%")
    })

    it("未知词条（无 affix 数据）不划线，尽管角色不匹配", async () => {
        const line = getItemAffixLines({ kind: "normal", slotType: 1, affixes: [roll(999999)] }, 1)[0]
        const html = await renderRow(line, { charId: OTHER_CHAR_ID })

        expect(line.affix).toBeUndefined()
        expect(html).not.toContain("data-affix-gated")
        expect(html).not.toContain("line-through")
    })

    it("门控只加视觉类：不改布局、不禁用控件（无 pointer-events-none / disabled / inert）", async () => {
        const html = await renderRow(uniqueLine(), { charId: OTHER_CHAR_ID })
        const start = html.indexOf("<div")
        const rootTag = html.slice(start, html.indexOf(">", start) + 1)

        expect(rootTag).toContain("grid grid-cols-1 items-start")
        expect(rootTag).not.toContain("pointer-events-none")
        expect(rootTag).not.toContain("disabled")
        expect(rootTag).not.toContain("inert")
        const row = readFileSync(
            fileURLToPath(new URL("../../components/transcend-build/TranscendGearAffixRow.vue", import.meta.url)),
            "utf8"
        )
        expect(row).toContain("<CopyID")
        expect(row).not.toContain("pointer-events-none")
    })

    it("门控专属行整行覆盖：标题 / 档位 / 整体收益 / 专属明细行同时在划线根节点内", async () => {
        const html = await renderRow(uniqueLine(), { charId: OTHER_CHAR_ID, income: 0.5 })
        const start = html.indexOf("<div")
        const rootTag = html.slice(start, html.indexOf(">", start) + 1)

        expect(rootTag).toContain("line-through")
        expect(rootTag).toContain('data-affix-gated="true"')
        expect(html).toContain("data-affix-title")
        expect(html).toContain("data-affix-detail-row")
        expect(html).toContain("data-affix-income")
        expect(html).toContain("+50.0%")
    })
})

describe("预览宿主透传：ItemCard / Slot / Picker", () => {
    it("ItemCard：charId 透传后，不匹配角色整行划线", async () => {
        const gated = await renderItemCard(uniqueItem(), OTHER_CHAR_ID)
        const allowed = await renderItemCard(uniqueItem(), CHAR_AFFIX_CHAR_ID)

        expect(gated).toContain('data-affix-gated="true"')
        expect(gated).toContain("line-through")
        expect(allowed).not.toContain("data-affix-gated")
        expect(allowed).not.toContain("line-through")
    })

    it("宿主源码：charId 从构筑位设置透传到所有词条行宿主", () => {
        const source = (name: string) =>
            readFileSync(fileURLToPath(new URL(`../../components/transcend-build/${name}`, import.meta.url)), "utf8")

        const itemCard = source("TranscendGearItemCard.vue")
        expect(itemCard).toContain("charId?: number")
        expect(itemCard).toContain(':char-id="charId"')

        const slot = source("TranscendGearSlot.vue")
        expect(slot).toContain("charId?: number")
        expect(slot).toContain(':char-id="charId ?? 0"')

        const square = source("TranscendGearSquareCard.vue")
        expect(square).toContain("charId?: number")
        expect(square).toContain(':char-id="charId"')

        const picker = source("TranscendGearPicker.vue")
        expect(picker).toContain("props.settings[props.side]?.charId ?? 0")
        expect(picker.match(/:char-id="charId"/g)).toHaveLength(3)

        const section = source("TranscendGearSection.vue")
        expect(section).toContain(':char-id="settings[mainGroup.side].charId"')
        expect(section).toContain(':char-id="settings[group.side].charId"')

        const create = source("TranscendGearCreate.vue")
        // 词条行 / 预览卡走门控角色（缺省 = charId），CraftPanel 的候选过滤仍用 charId
        expect(create).toContain("const rowCharId = computed(() => props.gatingCharId ?? props.charId)")
        expect(create.match(/:char-id="rowCharId"/g)).toHaveLength(4)
        expect(create.match(/:char-id="charId"/g)).toHaveLength(1)

        expect(source("TranscendGearCraftDialog.vue")).toContain(':char-id="props.charId"')
        expect(source("craft/TranscendCraftForgeTab.vue")).toContain(':char-id="charId"')
        expect(source("craft/TranscendCraftEnchantTab.vue").match(/:char-id="charId"/g)).toHaveLength(2)
        expect(source("craft/TranscendCraftTemperTab.vue")).toContain(':char-id="charId"')

        const row = source("TranscendGearAffixRow.vue")
        expect(row).toContain("isAffixAllowedForChar")
        expect(row).toContain("data-affix-gated")
        expect(row).toContain("line-through")
    })
})

describe("Section：三组构筑位各自透传自己的 charId（运行时）", () => {
    it("main / assist1 / assist2 共 16 个槽位卡分别收到本组 charId", async () => {
        const html = await renderSection(settingsForSides())

        expect(slotCardProps).toHaveLength(16)
        expect(slotCardProps.filter(entry => entry.charId === 1101)).toHaveLength(8)
        expect(slotCardProps.filter(entry => entry.charId === 1502)).toHaveLength(4)
        expect(slotCardProps.filter(entry => entry.charId === 3102)).toHaveLength(4)
        expect(html.match(/data-stub-char-id="1101"/g)).toHaveLength(8)
        expect(html.match(/data-stub-char-id="1502"/g)).toHaveLength(4)
        expect(html.match(/data-stub-char-id="3102"/g)).toHaveLength(4)
    })
})

describe("库存编辑路径：候选过滤用 charId，展示门控用 gatingCharId", () => {
    it("缺省 gatingCharId：与 charId 同口径（不匹配角色划线）", async () => {
        const html = await renderCreate({ charId: OTHER_CHAR_ID })

        expect(html).toContain('data-affix-gated="true"')
        expect(html).toContain("line-through")
    })

    it("gatingCharId=0（库存编辑）：展示不划线，与库存列表一致", async () => {
        const html = await renderCreate({ charId: OTHER_CHAR_ID, gatingCharId: 0 })

        expect(html).not.toContain("data-affix-gated")
        expect(html).not.toContain("line-through")
    })

    it("角色命中：不划线", async () => {
        const html = await renderCreate({ charId: CHAR_AFFIX_CHAR_ID })

        expect(html).not.toContain("data-affix-gated")
    })

    it("editCharId 保留给候选过滤：charId 过滤随机词缀 / 校验，库存弹窗接线 gatingCharId=0", () => {
        const componentSource = (name: string) =>
            readFileSync(fileURLToPath(new URL(`../../components/transcend-build/${name}`, import.meta.url)), "utf8")

        const create = componentSource("TranscendGearCreate.vue")
        expect(create).toContain("props.charId <= 0 || !affix.charIds?.length || affix.charIds.includes(props.charId)")
        expect(create).toContain("isGearDraftValid(props.slotType, draft.value, props.charId")

        const inventory = componentSource("TranscendGearInventoryDialog.vue")
        expect(inventory).toContain('item.slotType >= 8 ? "assist1" : "main"')
        expect(inventory).toContain(':char-id="editCharId"')
        expect(inventory).toContain(':gating-char-id="0"')
    })
})
