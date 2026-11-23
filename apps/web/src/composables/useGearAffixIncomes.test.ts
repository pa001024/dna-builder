import { afterEach, describe, expect, it, vi } from "vitest"
import { effectScope, nextTick, ref } from "vue"
import type { TranscendGearGroup, TranscendGearItemConfig } from "@/data"
import type { CharBuildWorkerSnapshot } from "@/data/CharBuildSnapshot"
import { getAffixIncomeKey } from "@/utils/transcend-gear/income"
import { useGearAffixIncomes } from "./useGearAffixIncomes"

/**
 * U120 / §141：预览卡逐词条收益的取数编排——按住 Shift 才请求、松开清空显示、
 * 同一上下文 + 物品跨实例复用缓存，无上下文不请求。
 */

const KEY = getAffixIncomeKey(0, 1001)

const item: TranscendGearItemConfig = {
    kind: "normal",
    slotType: 1,
    equipBaseScore: 50,
    affixes: [{ affixId: 1001, rollLevel: 50, masterworkLevel: 0, ancient: false, finalMasterwork: false }],
}

/** 收益请求桩：基准固定 100，按 key 回传差分 */
class StubWorker {
    static posts = 0
    static deltas: Record<string, number> = {}
    onmessage: ((event: MessageEvent) => void) | null = null
    onerror: (() => void) | null = null
    postMessage(request: { id: number; candidates: { key: string }[] }) {
        StubWorker.posts += 1
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

function installRuntimeStubs() {
    vi.stubGlobal("Worker", StubWorker)
    vi.stubGlobal("window", { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout })
}

/** 取数上下文：gear 为空组，基准槽位由预览物品回填 */
function sourceOf(key: string, charId?: number) {
    const gear: TranscendGearGroup = []
    return {
        key,
        side: "main" as const,
        gear,
        gainContext: { key, buildSnapshot: () => ({}) as CharBuildWorkerSnapshot },
        charId,
    }
}

describe("useGearAffixIncomes", () => {
    afterEach(() => {
        vi.unstubAllGlobals()
        StubWorker.deltas = {}
        StubWorker.posts = 0
    })

    it("未启用（未按住 Shift / 无上下文）不请求、不显示", async () => {
        installRuntimeStubs()
        const enabled = ref(false)
        const scope = effectScope()
        const incomes = scope.run(() =>
            useGearAffixIncomes({
                source: () => sourceOf("ctx-disabled"),
                item: () => item,
                slotId: () => 1,
                enabled: () => enabled.value,
            })
        )!

        await nextTick()
        expect(incomes.value).toEqual({})
        expect(StubWorker.posts).toBe(0)
        scope.stop()
    })

    it("按住后取值，松开清空显示；再次按住命中缓存不重复请求", async () => {
        installRuntimeStubs()
        StubWorker.deltas = { [KEY]: -10 }
        const enabled = ref(false)
        const scope = effectScope()
        const incomes = scope.run(() =>
            useGearAffixIncomes({
                source: () => sourceOf("ctx-toggle"),
                item: () => item,
                slotId: () => 1,
                enabled: () => enabled.value,
            })
        )!

        enabled.value = true
        await vi.waitFor(() => expect(incomes.value[KEY]).toBeCloseTo(10 / 90, 10))
        expect(StubWorker.posts).toBe(1)

        enabled.value = false
        await nextTick()
        expect(incomes.value).toEqual({})

        enabled.value = true
        await vi.waitFor(() => expect(incomes.value[KEY]).toBeCloseTo(10 / 90, 10))
        expect(StubWorker.posts).toBe(1)
        scope.stop()
    })

    it("同一上下文 + 物品的另一个实例直接读缓存；换物品才重新请求", async () => {
        installRuntimeStubs()
        StubWorker.deltas = { [KEY]: -10 }
        const firstScope = effectScope()
        const first = firstScope.run(() =>
            useGearAffixIncomes({
                source: () => sourceOf("ctx-shared"),
                item: () => item,
                slotId: () => 1,
                enabled: () => true,
            })
        )!
        await vi.waitFor(() => expect(first.value[KEY]).toBeCloseTo(10 / 90, 10))
        expect(StubWorker.posts).toBe(1)

        const secondScope = effectScope()
        const second = secondScope.run(() =>
            useGearAffixIncomes({
                source: () => sourceOf("ctx-shared"),
                item: () => item,
                slotId: () => 1,
                enabled: () => true,
            })
        )!
        await vi.waitFor(() => expect(second.value[KEY]).toBeCloseTo(10 / 90, 10))
        expect(StubWorker.posts).toBe(1)

        const changed = { ...item, equipBaseScore: 49 }
        const thirdScope = effectScope()
        thirdScope.run(() =>
            useGearAffixIncomes({
                source: () => sourceOf("ctx-shared"),
                item: () => changed,
                slotId: () => 1,
                enabled: () => true,
            })
        )!
        await vi.waitFor(() => expect(StubWorker.posts).toBe(2))
        firstScope.stop()
        secondScope.stop()
        thirdScope.stop()
    })

    it("请求失败不显示也不缓存；下次按住重试", async () => {
        installRuntimeStubs()
        StubWorker.deltas = { [KEY]: -10 }
        let fail = true
        const buildSnapshot = vi.fn(() => (fail ? null : ({} as CharBuildWorkerSnapshot)))
        const enabled = ref(false)
        const scope = effectScope()
        const incomes = scope.run(() =>
            useGearAffixIncomes({
                source: () => ({
                    key: "ctx-retry",
                    side: "main" as const,
                    gear: [] as TranscendGearGroup,
                    gainContext: { key: "ctx-retry", buildSnapshot },
                }),
                item: () => item,
                slotId: () => 1,
                enabled: () => enabled.value,
            })
        )!

        enabled.value = true
        await vi.waitFor(() => expect(buildSnapshot).toHaveBeenCalled())
        expect(incomes.value).toEqual({})
        expect(StubWorker.posts).toBe(0)

        enabled.value = false
        await nextTick()
        fail = false
        enabled.value = true
        await vi.waitFor(() => expect(incomes.value[KEY]).toBeCloseTo(10 / 90, 10))
        expect(StubWorker.posts).toBe(1)
        scope.stop()
    })

    it("回退 owner 侧（无启用侧）时不显示收益；空表可复用，再次按住不重复请求", async () => {
        installRuntimeStubs()
        StubWorker.deltas = { [KEY]: -10 }
        const enabled = ref(true)
        const scope = effectScope()
        const incomes = scope.run(() =>
            useGearAffixIncomes({
                source: () => ({
                    key: "ctx-owner",
                    side: "main" as const,
                    gear: [] as TranscendGearGroup,
                    gainContext: {
                        key: "ctx-owner",
                        buildSnapshot: () => ({}) as CharBuildWorkerSnapshot,
                        buildTeamSnapshots: () => ({ sides: [{ side: "main", build: {} as CharBuildWorkerSnapshot }], target: "owner" }),
                    },
                }),
                item: () => item,
                slotId: () => 1,
                enabled: () => enabled.value,
            })
        )!
        await vi.waitFor(() => expect(StubWorker.posts).toBe(1))
        await nextTick()
        expect(incomes.value).toEqual({})

        enabled.value = false
        await nextTick()
        enabled.value = true
        await nextTick()
        expect(incomes.value).toEqual({})
        expect(StubWorker.posts).toBe(1)
        scope.stop()
    })

    it("上下文键变化（启用位翻转）重新取数", async () => {
        installRuntimeStubs()
        StubWorker.deltas = { [KEY]: -10 }
        const contextKey = ref("ctx-enable-on")
        const scope = effectScope()
        scope.run(() =>
            useGearAffixIncomes({
                source: () => {
                    const source = sourceOf(contextKey.value)
                    return { ...source, gainContext: { ...source.gainContext, key: contextKey.value } }
                },
                item: () => item,
                slotId: () => 1,
                enabled: () => true,
            })
        )!
        await vi.waitFor(() => expect(StubWorker.posts).toBe(1))

        contextKey.value = "ctx-enable-off"
        await vi.waitFor(() => expect(StubWorker.posts).toBe(2))
        scope.stop()
    })

    it("切换 owner side 重新取数（side 参与缓存键）", async () => {
        installRuntimeStubs()
        StubWorker.deltas = { [KEY]: -10 }
        const side = ref<"main" | "assist1">("main")
        const scope = effectScope()
        scope.run(() =>
            useGearAffixIncomes({
                source: () => ({ ...sourceOf("ctx-side"), side: side.value }),
                item: () => item,
                slotId: () => 1,
                enabled: () => true,
            })
        )!
        await vi.waitFor(() => expect(StubWorker.posts).toBe(1))

        side.value = "assist1"
        await vi.waitFor(() => expect(StubWorker.posts).toBe(2))
        scope.stop()
    })

    it("source.charId 变化使缓存键失效（换角色重新取数，门控候选不被复用）", async () => {
        installRuntimeStubs()
        StubWorker.deltas = { [KEY]: -10 }
        const firstScope = effectScope()
        firstScope.run(() =>
            useGearAffixIncomes({
                source: () => sourceOf("ctx-char", 1801),
                item: () => item,
                slotId: () => 1,
                enabled: () => true,
            })
        )!
        await vi.waitFor(() => expect(StubWorker.posts).toBe(1))

        const secondScope = effectScope()
        secondScope.run(() =>
            useGearAffixIncomes({
                source: () => sourceOf("ctx-char", 1102),
                item: () => item,
                slotId: () => 1,
                enabled: () => true,
            })
        )!
        await vi.waitFor(() => expect(StubWorker.posts).toBe(2))
        firstScope.stop()
        secondScope.stop()
    })
})
