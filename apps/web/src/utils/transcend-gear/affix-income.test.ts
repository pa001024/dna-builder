import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { createInstance } from "i18next"
import i18nextVue from "i18next-vue"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { createSSRApp, defineComponent, h } from "vue"
import { renderToString } from "vue/server-renderer"
import TranscendGearAffixRow from "@/components/transcend-build/TranscendGearAffixRow.vue"
import {
    affixes,
    type CharSettings,
    charMap,
    createDefaultCharSettings,
    flattenEquippedGear,
    getTranscendSlotType,
    normalizeCharSettings,
    resolveGearEffects,
    SKILL_LEVEL_ATTR_KEYS,
    serializeCharSettingsForShare,
    type TranscendGearAffixRoll,
    type TranscendGearItemConfig,
    UNIQUE_AFFIX_MAP,
    uniqueEquips,
} from "@/data"
import type { CharBuildWorkerSnapshot } from "@/data/CharBuildSnapshot"
import { type GearAffixLine, getItemAffixLines, getUniqueAffixDetailRows } from "./display"
import { createTranscendGainContext } from "./gain-context"
import {
    createAffixIncomeCandidates,
    getAffixIncomeKey,
    getAffixLineIncomeKey,
    getUniqueAffixIncomeKey,
    getUniqueAffixMountedAttrKeys,
    pickUniqueComponentIncomes,
    requestAffixIncomes,
    withGearItem,
    withoutUniqueAffix,
} from "./income"
import type { GearIncomeRequest } from "./income.worker"
import { calculateSnapshotDamage, calculateTeamSnapshotDamage } from "./income-core"

/**
 * U120 / §141：Shift 详情态下普通词条的单独收益。
 * 基准 = 预览物品（全部词条），候选 = 去掉该条后的同一物品；收益 = (全量 - 去掉) / 去掉。
 */

function roll(affixId: number, patch: Partial<TranscendGearAffixRoll> = {}): TranscendGearAffixRoll {
    return { affixId, rollLevel: 50, masterworkLevel: 0, ancient: false, finalMasterwork: false, ...patch }
}

const item: TranscendGearItemConfig = {
    kind: "normal",
    slotType: 1,
    equipBaseScore: 50,
    affixes: [roll(1001, { source: "base" }), roll(1002, { source: "random" }), roll(1003, { source: "random" })],
}

describe("createAffixIncomeCandidates：逐条移除普通词条", () => {
    it("候选 key 与词条行 affixIndex 对齐，逐个只移除该下标", () => {
        const candidates = createAffixIncomeCandidates(item)

        expect(candidates.map(candidate => candidate.key)).toEqual([
            getAffixIncomeKey(0, 1001),
            getAffixIncomeKey(1, 1002),
            getAffixIncomeKey(2, 1003),
        ])
        expect(candidates.map(candidate => candidate.item.affixes.map(entry => entry.affixId))).toEqual([
            [1002, 1003],
            [1001, 1003],
            [1001, 1002],
        ])
        // 其余字段原样保留、入参不被修改
        expect(candidates[0].item).toMatchObject({ kind: "normal", slotType: 1, equipBaseScore: 50 })
        expect(candidates[0].item).not.toBe(item)
        expect(item.affixes.map(entry => entry.affixId)).toEqual([1001, 1002, 1003])
    })

    it("词条行（getItemAffixLines）的非专属行都能在候选中找到同 key", () => {
        const keys = new Set(createAffixIncomeCandidates(item).map(candidate => candidate.key))
        const rows = getItemAffixLines(item, 1).filter(line => line.affixIndex !== undefined && line.affixIndex >= 0)

        expect(rows).toHaveLength(3)
        for (const row of rows) expect(keys.has(getAffixIncomeKey(row.affixIndex!, row.roll.affixId))).toBe(true)
    })

    it("专属词条（uniqueAffix）产出整体 + 组件候选；数组内同 id 的脏数据不产出普通候选", () => {
        const uniqueItem: TranscendGearItemConfig = {
            kind: "unique",
            slotType: 3,
            affixes: [roll(1001), roll(2001)],
            uniqueAffix: roll(2001, { source: "unique" }),
        }
        const candidates = createAffixIncomeCandidates(uniqueItem)

        // 唯一装引用的 Plan 4 词条：整体候选 + 建模组件候选（2001 有 1 条建模值）
        expect(candidates.map(candidate => candidate.key)).toEqual([
            getAffixIncomeKey(0, 1001),
            getUniqueAffixIncomeKey(2001),
            `unique-component:2001:modeled:0:下落独立增伤`,
        ])
        const overall = candidates.find(candidate => candidate.key === getUniqueAffixIncomeKey(2001))!
        expect(overall.item.uniqueAffix).toBeUndefined()
        expect(overall.item.affixes.map(entry => entry.affixId)).toEqual([1001])
        expect(overall.suppress).toBeUndefined()
        const component = candidates.find(candidate => candidate.key.startsWith("unique-component:"))!
        // 组件候选不改物品，抑制只随请求生效
        expect(component.item).toBe(uniqueItem)
        expect(component.suppress).toEqual({ affixId: 2001, attrs: ["下落独立增伤"] })
    })
})

describe("createAffixIncomeCandidates：专属整体候选与组件抑制（U130）", () => {
    it("技能等级专属（180101）：整体候选 + 技能等级组件，抑制为词条级", () => {
        const equip = uniqueEquips.find(entry => entry.affixId === 180101)!
        const uniqueItem: TranscendGearItemConfig = {
            kind: "unique",
            slotType: equip.slot,
            affixes: [],
            uniqueAffix: roll(180101, { source: "unique", rollLevel: 1 }),
        }
        const candidates = createAffixIncomeCandidates(uniqueItem)

        expect(candidates.map(candidate => candidate.key)).toEqual([
            getUniqueAffixIncomeKey(180101),
            "unique-component:180101:skill:Skill1",
        ])
        expect(candidates[1].suppress).toEqual({ affixId: 180101, skillLevel: true })
    })

    it("角色门控不匹配：整体与组件候选都不产出（界面无收益可显示）；无角色上下文不判定", () => {
        const equip = uniqueEquips.find(entry => entry.affixId === 180101)!
        const uniqueItem: TranscendGearItemConfig = {
            kind: "unique",
            slotType: equip.slot,
            affixes: [],
            uniqueAffix: roll(180101, { source: "unique", rollLevel: 1 }),
        }

        expect(createAffixIncomeCandidates(uniqueItem, { charId: 1102 })).toEqual([])
        expect(createAffixIncomeCandidates(uniqueItem, { charId: 0 }).map(candidate => candidate.key)).toContain(
            getUniqueAffixIncomeKey(180101)
        )
        expect(createAffixIncomeCandidates(uniqueItem).map(candidate => candidate.key)).toContain(getUniqueAffixIncomeKey(180101))
    })

    it("纯机制 / 数据属性专属不产出组件候选（无法隔离，不拿整体收益替代）", () => {
        const mechanism = uniqueEquips.find(entry => entry.affixId === 2003)!
        const mechanismItem: TranscendGearItemConfig = {
            kind: "unique",
            slotType: mechanism.slot,
            affixes: [],
            uniqueAffix: roll(2003, { source: "unique", rollLevel: 1 }),
        }
        expect(createAffixIncomeCandidates(mechanismItem).map(candidate => candidate.key)).toEqual([getUniqueAffixIncomeKey(2003)])
    })

    it("建模明细行 key 与 getUniqueAffixDetailRows 对齐（同来源、同顺序）", () => {
        const equip = uniqueEquips.find(entry => entry.affixId === 2008)!
        const uniqueItem: TranscendGearItemConfig = {
            kind: "unique",
            slotType: equip.slot,
            affixes: [],
            uniqueAffix: roll(2008, { source: "unique", rollLevel: 1 }),
        }
        const componentKeys = createAffixIncomeCandidates(uniqueItem)
            .map(candidate => candidate.key)
            .filter(key => key.startsWith("unique-component:2008:"))
            .map(key => key.slice("unique-component:2008:".length))
        const rowKeys = getUniqueAffixDetailRows(
            affixes.find(affix => affix.id === 2008)!,
            roll(2008, { source: "unique", rollLevel: 1 }),
            1,
            key => key,
            text => text
        ).map(row => row.key)

        expect(componentKeys).toEqual(rowKeys)
    })
})

describe("withoutUniqueAffix：去掉专属词条（数组内同 id 一并移除）", () => {
    it("清空 uniqueAffix，并移除数组内同 id 脏数据 + craft 下标重映射", () => {
        const dirty: TranscendGearItemConfig = {
            kind: "unique",
            slotType: 3,
            affixes: [roll(1001), roll(2001), roll(1002)],
            uniqueAffix: roll(2001, { source: "unique" }),
            craft: { masterworkLevel: 10, temperingCount: 0, enchantCount: 0, finalMasterworkAffixIndex: 2 },
        }
        const next = withoutUniqueAffix(dirty, 2001)

        expect(next.uniqueAffix).toBeUndefined()
        expect(next.affixes.map(entry => entry.affixId)).toEqual([1001, 1002])
        expect(next.craft?.finalMasterworkAffixIndex).toBe(1)
        // 入参不被修改
        expect(dirty.uniqueAffix?.affixId).toBe(2001)
        expect(dirty.affixes).toHaveLength(3)
    })
})

describe("createAffixIncomeCandidates：craft 下标同步重映射（U120-fix P1）", () => {
    /** 3 词条、最终精锻目标 index=1 */
    const crafted: TranscendGearItemConfig = {
        kind: "normal",
        slotType: 1,
        equipBaseScore: 50,
        affixes: [roll(1001), roll(1002), roll(1003)],
        craft: { masterworkLevel: 10, temperingCount: 0, enchantCount: 0, finalMasterworkAffixIndex: 1 },
    }

    /** 扁平化候选后最终精锻命中的词条 id（`flattenEquippedGear` 按 craft 下标判定） */
    function finalAffixIds(target: TranscendGearItemConfig): number[] {
        return flattenEquippedGear([{ slotId: 1, item: target }])
            .entries.filter(entry => entry.finalMasterwork)
            .map(entry => entry.affixId)
    }

    it("去掉最终精锻目标之前的词条：目标下标前移，效果仍落在原目标词条上", () => {
        const [removedFirst] = createAffixIncomeCandidates(crafted)

        expect(removedFirst.item.craft?.finalMasterworkAffixIndex).toBe(0)
        expect(finalAffixIds(removedFirst.item)).toEqual([1002])
    })

    it("去掉最终精锻目标本身：目标清除，不迁移到其它词条", () => {
        const removedTarget = createAffixIncomeCandidates(crafted)[1]

        expect(removedTarget.item.craft?.finalMasterworkAffixIndex).toBeUndefined()
        expect(finalAffixIds(removedTarget.item)).toEqual([])
    })

    it("去掉最终精锻目标之后的词条：目标下标不变", () => {
        const removedLast = createAffixIncomeCandidates(crafted)[2]

        expect(removedLast.item.craft?.finalMasterworkAffixIndex).toBe(1)
        expect(finalAffixIds(removedLast.item)).toEqual([1002])
    })

    it("淬炼 / 附魔 / 附魔快照同口径：目标被删则清除并清零次数，其后下标前移", () => {
        const allCrafted: TranscendGearItemConfig = {
            kind: "normal",
            slotType: 1,
            affixes: [roll(1001), roll(1002), roll(1003)],
            craft: {
                masterworkLevel: 10,
                temperingAffixIndex: 2,
                temperingCount: 3,
                enchantAffixIndex: 1,
                enchantCount: 2,
                enchantSnapshot: { affixIndex: 2, roll: roll(9999) },
            },
        }
        const candidates = createAffixIncomeCandidates(allCrafted)

        expect(candidates[0].item.craft).toMatchObject({ temperingAffixIndex: 1, temperingCount: 3, enchantAffixIndex: 0, enchantCount: 2 })
        expect(candidates[0].item.craft?.enchantSnapshot?.affixIndex).toBe(1)

        expect(candidates[1].item.craft).toMatchObject({ temperingAffixIndex: 1, temperingCount: 3, enchantCount: 0 })
        expect(candidates[1].item.craft?.enchantAffixIndex).toBeUndefined()
        expect(candidates[1].item.craft?.enchantSnapshot).toBeUndefined()

        expect(candidates[2].item.craft).toMatchObject({ enchantAffixIndex: 1, enchantCount: 2, temperingCount: 0 })
        expect(candidates[2].item.craft?.temperingAffixIndex).toBeUndefined()
        expect(candidates[2].item.craft?.enchantSnapshot).toBeUndefined()
    })
})

describe("resolveGearEffects：收益快照专用 suppress（U130，不写物品 / 设置）", () => {
    /** 专属词条 → 主控装备位（槽型匹配） */
    function entryOf(affixId: number): { slotId: number; entries: ReturnType<typeof flattenEquippedGear>["entries"] } {
        const equip = uniqueEquips.find(item => item.affixId === affixId)!
        const slotId = [1, 2, 3, 4, 5, 6, 7, 8].find(id => getTranscendSlotType(id) === equip.slot)!
        const item: TranscendGearItemConfig = {
            kind: "unique",
            slotType: equip.slot,
            affixes: [],
            uniqueAffix: roll(affixId, { source: "unique", rollLevel: 1 }),
        }
        return { slotId, entries: flattenEquippedGear([{ slotId, item }]).entries }
    }

    it("技能等级组件：抑制后三键属性与合成 BUFF 消失，手写被动仍计入", () => {
        const { entries } = entryOf(180101)
        const plain = resolveGearEffects(entries, "main", { charId: 1801 })
        const suppressed = resolveGearEffects(entries, "main", { charId: 1801, suppress: { affixId: 180101, skillLevel: true } })

        expect(plain.attrs[SKILL_LEVEL_ATTR_KEYS[0]]).toBe(10)
        expect(plain.buffs.some(sourced => sourced.key.endsWith(":skill"))).toBe(true)
        expect(plain.buffs.some(sourced => sourced.buff.名称 === "升华·午后独立")).toBe(true)

        expect(suppressed.attrs[SKILL_LEVEL_ATTR_KEYS[0]]).toBeUndefined()
        expect(suppressed.buffs.some(sourced => sourced.key.endsWith(":skill"))).toBe(false)
        expect(suppressed.buffs.some(sourced => sourced.buff.名称 === "升华·午后独立")).toBe(true)
    })

    it("建模属性组件：只去掉命中的属性键；BUFF 属性全被抑制时不再挂载", () => {
        const { entries } = entryOf(2008)
        const plain = resolveGearEffects(entries, "main")
        const suppressed = resolveGearEffects(entries, "main", { suppress: { affixId: 2008, attrs: ["火属性弱点"] } })

        expect(plain.buffs).toHaveLength(1)
        expect(plain.buffs[0].buff.attr).toEqual({ 火属性弱点: 0.54 })
        expect(suppressed.buffs).toEqual([])
    })

    it("suppress 只作用于命中的词条 id：换 id 的抑制不影响本次解析", () => {
        const { entries } = entryOf(2008)
        const other = resolveGearEffects(entries, "main", { suppress: { affixId: 2001, attrs: ["火属性弱点"] } })

        expect(other.buffs).toHaveLength(1)
        expect(other.buffs[0].buff.attr).toEqual({ 火属性弱点: 0.54 })
    })
})

/** 收益请求桩：默认基准固定 100，按 key 回传配置的差分；`real` 模式用主线程同一套 TS 管线真实求值 */
class StubWorker {
    static deltas: Record<string, number> = {}
    /** 真实模式：对传入快照调用 `calculateSnapshotDamage`（生产链路端到端用例） */
    static real = false
    onmessage: ((event: MessageEvent) => void) | null = null
    onerror: (() => void) | null = null
    postMessage(request: GearIncomeRequest) {
        if (StubWorker.real) {
            queueMicrotask(() => {
                const base = calculateTeamSnapshotDamage(request.baseline.map(entry => entry.build))
                const incomes: Record<string, number> = {}
                const failures: { key: string; error: string }[] = []
                for (const candidate of request.candidates) {
                    const next = calculateTeamSnapshotDamage(candidate.builds.map(entry => entry.build))
                    if (next.damage === undefined || base.damage === undefined) {
                        failures.push({ key: candidate.key, error: next.error ?? base.error ?? "build-unavailable" })
                        continue
                    }
                    incomes[candidate.key] = next.damage - base.damage
                }
                this.onmessage?.({ data: { id: request.id, baseline: base.damage, incomes, failures } } as unknown as MessageEvent)
            })
            return
        }
        queueMicrotask(() => {
            this.onmessage?.({
                data: {
                    id: request.id,
                    baseline: 100,
                    incomes: Object.fromEntries(
                        request.candidates.map(candidate => [candidate.key, StubWorker.deltas[candidate.key] ?? 0])
                    ),
                    failures: [],
                },
            } as unknown as MessageEvent)
        })
    }
    terminate() {}
}

/** 仅替换收益请求依赖的浏览器全局（node 测试环境没有 Worker / window） */
function installRuntimeStubs() {
    vi.stubGlobal("Worker", StubWorker)
    vi.stubGlobal("window", { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout })
}

describe("requestAffixIncomes：去掉一条的收益差分", () => {
    afterEach(() => {
        vi.unstubAllGlobals()
        StubWorker.deltas = {}
    })

    it("去掉一条后伤害下降 → 该条收益为正；基准组已包含预览物品", async () => {
        installRuntimeStubs()
        StubWorker.deltas = { [getAffixIncomeKey(0, 1001)]: -10, [getAffixIncomeKey(1, 1002)]: -5 }
        const buildSnapshot = vi.fn((_side: string, _gear?: unknown, _options?: unknown) => ({}) as CharBuildWorkerSnapshot)
        const candidates = createAffixIncomeCandidates(item)
        const baselineGear = withGearItem([], 1, item)

        const result = await requestAffixIncomes({
            side: "main",
            baselineGear,
            slotId: 1,
            candidates,
            gainContext: { key: "ctx", buildSnapshot },
        })

        expect(result.failures).toEqual([])
        expect(result.incomes[getAffixIncomeKey(0, 1001)]).toBeCloseTo(10 / 90, 10)
        expect(result.incomes[getAffixIncomeKey(1, 1002)]).toBeCloseTo(5 / 95, 10)
        expect(result.incomes[getAffixIncomeKey(2, 1003)]).toBe(0)
        expect(buildSnapshot).toHaveBeenNthCalledWith(1, "main", baselineGear)
        const candidateGear = buildSnapshot.mock.calls[1][1] as { slotId: number; item?: TranscendGearItemConfig }[]
        expect(candidateGear.find(entry => entry.slotId === 1)?.item).toBe(candidates[0].item)
        // 普通候选不带抑制选项
        expect(buildSnapshot.mock.calls[1][2]).toBeUndefined()
    })

    it("组件候选：suppress 作为收益专用选项传给快照工厂，物品本身保持原样", async () => {
        installRuntimeStubs()
        const buildSnapshot = vi.fn((_side: string, _gear?: unknown, _options?: unknown) => ({}) as CharBuildWorkerSnapshot)
        const candidate = {
            key: "unique-component:2001:modeled:0:下落独立增伤",
            item,
            suppress: { affixId: 2001, attrs: ["下落独立增伤"] },
        }

        const result = await requestAffixIncomes({
            side: "main",
            baselineGear: withGearItem([], 1, item),
            slotId: 1,
            candidates: [candidate],
            gainContext: { key: "ctx", buildSnapshot },
        })

        expect(result.incomes[candidate.key]).toBe(0)
        // U137-fix：suppress 自动收敛到 owner 侧 + 当前装备位
        expect(buildSnapshot.mock.calls[1][2]).toEqual({
            suppress: { affixId: 2001, attrs: ["下落独立增伤"], ownerSide: "main", slotId: 1 },
        })
        expect(candidate.item).toBe(item)
    })

    it("候选快照失败：该条收益为 null 并返回失败项（界面不显示，不当 0%）", async () => {
        installRuntimeStubs()
        let calls = 0
        const buildSnapshot = vi.fn(() => (calls++ === 0 ? ({} as CharBuildWorkerSnapshot) : null))

        const result = await requestAffixIncomes({
            side: "main",
            baselineGear: withGearItem([], 1, item),
            slotId: 1,
            candidates: createAffixIncomeCandidates(item).slice(0, 1),
            gainContext: { key: "ctx", buildSnapshot },
        })

        expect(result.incomes[getAffixIncomeKey(0, 1001)]).toBeNull()
        expect(result.failures).toEqual([{ key: getAffixIncomeKey(0, 1001), error: "build-unavailable" }])
    })

    it("基准快照失败时明确 reject，不静默返回 0", async () => {
        await expect(
            requestAffixIncomes({
                side: "main",
                baselineGear: withGearItem([], 1, item),
                slotId: 1,
                candidates: createAffixIncomeCandidates(item),
                gainContext: { key: "ctx", buildSnapshot: () => null },
            })
        ).rejects.toThrow("build-unavailable")
    })
})

describe("TranscendGearAffixRow：普通词条单条收益渲染（SSR）", () => {
    let i18n: ReturnType<typeof createInstance>

    beforeAll(async () => {
        i18n = createInstance()
        await i18n.init({
            lng: "zh-CN",
            fallbackLng: false,
            resources: {
                "zh-CN": {
                    translation: {
                        common: { effect_label: "效果:" },
                        "transcend-build": {
                            gear_unknown: "未知词条",
                            gear_roll_short: "档位",
                            gear_ancient: "太古",
                            gear_mark_unique: "专属",
                            gear_mark_final_masterwork: "最终精锻",
                            gear_source_random: "随机",
                            gear_source_tempering: "淬炼",
                            gear_source_enchant: "附魔",
                            gear_source_unknown: "来源未知",
                        },
                    },
                },
            },
        })
    })

    async function renderRow(
        line: GearAffixLine,
        income?: number | null,
        extra: { incomeKey?: string; detailIncomes?: Record<string, number | null> } = {}
    ): Promise<string> {
        const app = createSSRApp(
            defineComponent({
                render: () =>
                    h(TranscendGearAffixRow, {
                        line,
                        preview: true,
                        showUniqueDetails: true,
                        slotId: 2,
                        income,
                        incomeKey: extra.incomeKey,
                        detailIncomes: extra.detailIncomes,
                    }),
            })
        )
        app.use(i18nextVue, { i18next: i18n })

        return renderToString(app)
    }

    function normalLine(): GearAffixLine {
        return getItemAffixLines({ kind: "normal", slotType: 1, equipBaseScore: 50, affixes: [roll(1001, { source: "random" })] }, 2)[0]
    }

    function uniqueLine(): GearAffixLine {
        const equip = uniqueEquips.find(entry => entry.affixId === 180101)!
        return getItemAffixLines(
            { kind: "unique", slotType: equip.slot, affixes: [], uniqueAffix: roll(180101, { source: "unique", rollLevel: 1 }) },
            2
        )[0]
    }

    it("普通词条有收益：行尾输出带符号百分比 + data-affix-income", async () => {
        const html = await renderRow(normalLine(), 0.123)

        expect(html).toContain("data-affix-income")
        expect(html).toContain("+12.3%")
    })

    it("负收益按 formatRelativeGain 同格式；四舍五入为 0.0% 的收益隐藏（U120-fix）", async () => {
        expect(await renderRow(normalLine(), -0.015)).toContain("-1.5%")
        expect(await renderRow(normalLine(), 0)).not.toContain("data-affix-income")
        expect(await renderRow(normalLine(), 0.0004)).not.toContain("data-affix-income")
        expect(await renderRow(normalLine(), -0.0004)).not.toContain("data-affix-income")
    })

    it("未提供收益 / null：不渲染收益", async () => {
        expect(await renderRow(normalLine())).not.toContain("data-affix-income")
        expect(await renderRow(normalLine(), null)).not.toContain("data-affix-income")
    })

    it("专属行显示整体收益（U130）：与普通行同格式，0.0% 隐藏", async () => {
        const html = await renderRow(uniqueLine(), 0.5)

        expect(html).toContain("data-affix-income")
        expect(html).toContain("+50.0%")
        expect(await renderRow(uniqueLine(), 0)).not.toContain("data-affix-income")
        expect(await renderRow(uniqueLine())).not.toContain("data-affix-income")
    })

    it("Shift 详情态仍保留专属行生效字段（整体收益与明细并存）", async () => {
        const html = await renderRow(uniqueLine(), null)

        expect(html).toContain("data-affix-detail-row")
        expect(html).not.toContain("data-affix-income")
    })

    it("专属展开明细行一行一个，并按行 key 显示可隔离组件的收益（U130）", async () => {
        const line = uniqueLine()
        const rowKeys = getUniqueAffixDetailRows(
            affixes.find(affix => affix.id === 180101)!,
            roll(180101, { source: "unique", rollLevel: 1 }),
            2,
            key => key,
            text => text
        ).map(row => row.key)
        const html = await renderRow(line, 0.123, {
            incomeKey: getUniqueAffixIncomeKey(180101),
            detailIncomes: { [rowKeys[0]]: 0.045, "skill:unresolved": 0.02 },
        })

        // 一行一个：明细容器纵向排列，每行带行 key
        expect(html).toContain("flex flex-col")
        for (const key of rowKeys) expect(html).toContain(`data-affix-detail-key="${key}"`)
        expect(html).toContain("data-affix-detail-income")
        expect(html).toContain("+4.5%")
        // 没有对应候选 key 的组件不显示收益（不拿整体收益替代）
        expect(html).not.toContain("+2.0%")
        // 行 key 对齐：data-affix-uid 与整体收益 key 一致
        expect(html).toContain(`data-affix-uid="${getUniqueAffixIncomeKey(180101)}"`)
    })

    it("明细行收益同样按 0.0% 阈值隐藏", async () => {
        const line = uniqueLine()
        const rowKey = "skill:Skill1"
        const html = await renderRow(line, undefined, { detailIncomes: { [rowKey]: 0.0004 } })

        expect(html).toContain(`data-affix-detail-key="${rowKey}"`)
        expect(html).not.toContain("data-affix-detail-income")
    })

    it("普通行 data-affix-uid 与词条收益 key 对齐", async () => {
        const html = await renderRow(normalLine(), 0.123, { incomeKey: getAffixIncomeKey(0, 1001) })

        expect(html).toContain(`data-affix-uid="${getAffixIncomeKey(0, 1001)}"`)
    })

    it("组件源码：收益对普通 / 专属行统一，明细行按行 key 取收益", () => {
        const source = readFileSync(
            fileURLToPath(new URL("../../components/transcend-build/TranscendGearAffixRow.vue", import.meta.url)),
            "utf8"
        )
        expect(source).toContain('if (typeof income !== "number" || !Number.isFinite(income)) return ""')
        expect(source).toContain('if (Math.abs(income * 100) < 0.05) return ""')
        expect(source).toContain("data-affix-income")
        expect(source).toContain("data-affix-detail-income")
        expect(source).toContain("props.detailIncomes?.[row.key]")
        expect(source).toContain('data-affix-uid="incomeKey"')
    })
})

describe("预览宿主接线", () => {
    const componentSource = (name: string) =>
        readFileSync(fileURLToPath(new URL(`../../components/transcend-build/${name}`, import.meta.url)), "utf8")

    it("ItemCard 计算逐条收益并透传到词条行（含专属整体与明细行 key）", () => {
        const card = componentSource("TranscendGearItemCard.vue")
        expect(card).toContain("useGearAffixIncomes")
        expect(card).toContain("affixIncomeSource?: GearAffixIncomeSource | null")
        expect(card).toContain("getAffixLineIncomeKey")
        expect(card).toContain("pickUniqueComponentIncomes")
        expect(card).toContain(':income-key="getAffixLineIncomeKey(line)"')
        expect(card).toContain(':income="lineIncome(line)"')
        expect(card).toContain(':detail-incomes="lineDetailIncomes(line)"')
    })

    it("收益上下文携带构筑位角色 id（角色门控取数同口径）", () => {
        for (const name of ["TranscendGearSection.vue", "TranscendGearPicker.vue"]) {
            expect(componentSource(name), name).toContain("charId:")
        }
    })

    it("取数把构筑位角色 id 传给候选构建（专属门控）", () => {
        const source = readFileSync(fileURLToPath(new URL("../../composables/useGearAffixIncomes.ts", import.meta.url)), "utf8")
        expect(source).toContain("createAffixIncomeCandidates(item, { charId: source.charId })")
    })

    it("四个预览宿主都透传上下文（库存 / DB 无上下文时不传、不显示）", () => {
        for (const name of [
            "TranscendGearSlot.vue",
            "TranscendGearSquareCard.vue",
            "TranscendGearCraftDialog.vue",
            "TranscendGearCreate.vue",
        ]) {
            expect(componentSource(name), name).toContain(':affix-income-source="affixIncomeSource"')
        }
    })
})

/**
 * U130-fix：真实 `createTranscendGainContext` → buildSnapshot → requestAffixIncomes 端到端。
 * 旧用例全部是桩上下文（测试内本地转发 options），无法发现生产闭包吞掉 `{ suppress }` 的 P0。
 */

/** 专属词条所在的唯一装物品（`uniqueId` 必填，归一化才不会降级为普通装备） */
function uniqueItemOf(affixId: number): TranscendGearItemConfig {
    const equip = uniqueEquips.find(entry => entry.affixId === affixId)!
    return {
        kind: "unique",
        slotType: equip.slot,
        uniqueId: equip.id,
        affixes: [],
        uniqueAffix: roll(affixId, { source: "unique", rollLevel: 1 }),
    }
}

/** 主控装备位（槽型匹配 1-8） */
function mainSlotOf(slotType: number): number {
    return [1, 2, 3, 4, 5, 6, 7, 8].find(id => getTranscendSlotType(id) === slotType)!
}

/**
 * 菲娜（1801）测试构筑：主控战技、技能 10·10·10、近战 10302、关溯。
 * @param item 主控装备
 * @param slotId 装备位
 * @returns 归一化后的完整角色配置
 */
function feinaSettings(item: TranscendGearItemConfig, slotId: number): CharSettings {
    const settings = createDefaultCharSettings()
    settings.baseName = charMap.get(1801)?.技能?.[0]?.名称 ?? ""
    settings.charSkillLevel = [10, 10, 10]
    settings.meleeWeapon = 10302
    settings.targetFunction = "伤害"
    settings.traceLevel = 0
    settings.transcend = { ...settings.transcend, enabled: true, mainGear: [{ slotId, item }] }
    return normalizeCharSettings(settings)
}

/** 快照里是否存在技能等级三键之一（抑制生效的判定） */
function hasSkillLevelAttr(snapshot: CharBuildWorkerSnapshot): boolean {
    return snapshot.buffs.some(buff => Boolean(buff.data.attr) && SKILL_LEVEL_ATTR_KEYS[0] in buff.data.attr!)
}

describe("U130-fix：真实 gain-context 转发 { suppress }（P0 回归）", () => {
    afterEach(() => {
        vi.unstubAllGlobals()
        StubWorker.real = false
    })

    it("buildSnapshot 原样转发 options：抑制快照的 buffs / 伤害与不传时不同", () => {
        const item = uniqueItemOf(180101)
        const slotId = mainSlotOf(item.slotType)
        const context = createTranscendGainContext({ settings: feinaSettings(item, slotId), charId: 1801 })
        const gear = [{ slotId, item }]

        const plain = context.buildSnapshot("main", gear)!
        const suppressed = context.buildSnapshot("main", gear, { suppress: { affixId: 180101, skillLevel: true } })!

        expect(hasSkillLevelAttr(plain)).toBe(true)
        expect(hasSkillLevelAttr(suppressed)).toBe(false)
        const plainDamage = calculateSnapshotDamage(plain).damage!
        const suppressedDamage = calculateSnapshotDamage(suppressed).damage!
        expect(plainDamage).toBeGreaterThan(suppressedDamage)
    })

    it("抑制不落快照 settings / 分享序列化，请求前后物品深比较不变", async () => {
        installRuntimeStubs()
        StubWorker.real = true
        const item = uniqueItemOf(180101)
        const slotId = mainSlotOf(item.slotType)
        const settings = feinaSettings(item, slotId)
        const context = createTranscendGainContext({ settings, charId: 1801 })
        const gear = [{ slotId, item }]

        const suppressed = context.buildSnapshot("main", gear, { suppress: { affixId: 180101, skillLevel: true } })!
        expect(JSON.stringify(suppressed)).not.toContain("suppress")
        expect(serializeCharSettingsForShare(settings)).not.toContain("suppress")

        const before = JSON.parse(JSON.stringify(item))
        const result = await requestAffixIncomes({
            side: "main",
            baselineGear: withGearItem([], slotId, item),
            slotId,
            candidates: createAffixIncomeCandidates(item, { charId: 1801 }),
            gainContext: context,
        })

        expect(result.failures).toEqual([])
        expect(item).toEqual(before)
    })

    it("requestAffixIncomes 走生产上下文：专属整体与技能等级组件都非 0", async () => {
        installRuntimeStubs()
        StubWorker.real = true
        const item = uniqueItemOf(180101)
        const slotId = mainSlotOf(item.slotType)
        const context = createTranscendGainContext({ settings: feinaSettings(item, slotId), charId: 1801 })

        const result = await requestAffixIncomes({
            side: "main",
            baselineGear: withGearItem([], slotId, item),
            slotId,
            candidates: createAffixIncomeCandidates(item, { charId: 1801 }),
            gainContext: context,
        })

        const overall = result.incomes[getUniqueAffixIncomeKey(180101)]
        const component = result.incomes["unique-component:180101:skill:Skill1"]
        expect(overall).toBeGreaterThan(0)
        expect(component).toBeGreaterThan(0)
        expect(component!).toBeLessThan(overall!)
    })

    it("门控不匹配：专属整体 / 明细候选都不产出（收益表无 key，界面不显示）", async () => {
        installRuntimeStubs()
        StubWorker.real = true
        const item = uniqueItemOf(180101)
        const slotId = mainSlotOf(item.slotType)
        const context = createTranscendGainContext({ settings: feinaSettings(item, slotId), charId: 1102 })
        const candidates = createAffixIncomeCandidates(item, { charId: 1102 })

        expect(candidates.some(candidate => candidate.key.startsWith("unique:"))).toBe(false)
        expect(candidates.some(candidate => candidate.key.startsWith("unique-component:"))).toBe(false)
        const result = await requestAffixIncomes({
            side: "main",
            baselineGear: withGearItem([], slotId, item),
            slotId,
            candidates,
            gainContext: context,
        })
        expect(result.incomes[getUniqueAffixIncomeKey(180101)]).toBeUndefined()
        expect(pickUniqueComponentIncomes(result.incomes, 180101)).toEqual({})
    })
})

describe("U130-fix：建模组件与脏数据 key 对齐", () => {
    afterEach(() => {
        vi.unstubAllGlobals()
        StubWorker.real = false
    })

    it("建模候选只按实际挂载的 BUFF attr 键产出：名称不对齐的展示行不产出候选", () => {
        const mapping = UNIQUE_AFFIX_MAP[2008]
        const values = mapping.values ?? []
        mapping.values = [...values, { name: "未挂载展示行", value: 1 }]
        try {
            const item = uniqueItemOf(2008)
            const keys = createAffixIncomeCandidates(item).map(candidate => candidate.key)

            expect(getUniqueAffixMountedAttrKeys(2008).has("火属性弱点")).toBe(true)
            expect(getUniqueAffixMountedAttrKeys(2008).has("未挂载展示行")).toBe(false)
            expect(keys).toContain("unique-component:2008:modeled:0:火属性弱点")
            expect(keys.some(key => key.includes("未挂载展示行"))).toBe(false)
        } finally {
            mapping.values = values
        }
    })

    it("建模组件端到端：2008 火属性弱点经真实上下文抑制后候选收益非 0", async () => {
        installRuntimeStubs()
        StubWorker.real = true
        const item = uniqueItemOf(2008)
        const slotId = mainSlotOf(item.slotType)
        const settings = createDefaultCharSettings()
        settings.baseName = charMap.get(3101)?.技能?.[0]?.名称 ?? ""
        settings.charSkillLevel = [10, 10, 10]
        settings.meleeWeapon = 10303
        settings.targetFunction = "伤害"
        settings.traceLevel = 0
        settings.transcend = { ...settings.transcend, enabled: true, mainGear: [{ slotId, item }] }
        const context = createTranscendGainContext({ settings: normalizeCharSettings(settings), charId: 3101 })
        const componentKey = "unique-component:2008:modeled:0:火属性弱点"
        const candidates = createAffixIncomeCandidates(item, { charId: 3101 })

        expect(candidates.map(candidate => candidate.key)).toContain(componentKey)
        const result = await requestAffixIncomes({
            side: "main",
            baselineGear: withGearItem([], slotId, item),
            slotId,
            candidates,
            gainContext: context,
        })

        expect(result.failures).toEqual([])
        expect(result.incomes[componentKey]).toBeGreaterThan(0)
    })

    it("数组内同 id 脏数据：渲染行 key 与收益表 key 一致（unique:<affixId>）", () => {
        const item = uniqueItemOf(180101)
        const slotId = mainSlotOf(item.slotType)
        const dirty: TranscendGearItemConfig = {
            ...item,
            affixes: [roll(1001), roll(180101, { source: "random", rollLevel: 1 })],
        }
        const dirtyLine = getItemAffixLines(dirty, slotId).find(line => line.affixIndex === 1)!

        expect(dirtyLine.unique).toBe(true)
        expect(getAffixLineIncomeKey(dirtyLine)).toBe(getUniqueAffixIncomeKey(180101))

        const keys = createAffixIncomeCandidates(dirty).map(candidate => candidate.key)
        expect(keys).toContain(getUniqueAffixIncomeKey(180101))
        expect(keys).not.toContain(getAffixIncomeKey(1, 180101))
    })
})
