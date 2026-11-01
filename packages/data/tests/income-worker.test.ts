import { beforeAll, describe, expect, it, vi } from "vitest"

/** 收益请求里传给 wasm 的条目形状（只断言与映射相关的字段） */
interface WasmIncomeCall {
    items: {
        key: string
        kind: string
        owner?: string
        id?: number
        level?: number
        name?: string
        coverage?: number
        charId?: number
        settings?: unknown
    }[]
}

const state = vi.hoisted(() => ({ calls: [] as WasmIncomeCall[] }))

// wasm 不可用时的用例在别处覆盖；这里只验证 worker 把候选项翻译成哪类 wasm 条目
vi.mock("../CalcWasm", () => ({
    runWasmIncome: vi.fn(async (input: WasmIncomeCall) => {
        state.calls.push(input)
        return {
            value: {
                base: 100,
                values: Object.fromEntries(input.items.map(item => [item.key, 0.5])),
            },
            elapsedMs: 1,
        }
    }),
    runWasmEvaluate: vi.fn(),
    runWasmPanels: vi.fn(),
    runWasmAutobuild: vi.fn(),
    takeWasmSessionSetupMs: () => undefined,
}))

import { createCharBuildFromSettings } from "../CharBuildHelper"
import { createBuildFromSnapshot, createWorkerSnapshot } from "../CharBuildSnapshot"
import { modEffectMap } from "../d"
import { buffData } from "../index"
import { liseFireBuildCharId, liseFireBuildSettings } from "./fixtures/liseFireBuild"

const selfStub = {
    postMessage: vi.fn(),
    onmessage: undefined as ((event: { data: unknown }) => void) | undefined,
}

beforeAll(async () => {
    ;(globalThis as { self?: unknown }).self = selfStub
    await import("../Calc.worker")
})

/**
 * 发一次收益请求并等 worker 回传结果。
 * @param buffs 候选 BUFF 条目
 * @returns worker 回传的结果消息
 */
async function requestIncome(buffs: unknown[]) {
    selfStub.postMessage.mockClear()
    state.calls.length = 0
    const build = createCharBuildFromSettings(liseFireBuildCharId, liseFireBuildSettings)
    selfStub.onmessage?.({
        data: {
            id: 7,
            kind: "income",
            charId: liseFireBuildCharId,
            settings: liseFireBuildSettings,
            build: createWorkerSnapshot(build),
            buffs,
        },
    })
    await vi.waitFor(() => expect(selfStub.postMessage).toHaveBeenCalled())
    return selfStub.postMessage.mock.calls[0][0] as { incomes: Record<string, number>; engine: string }
}

/**
 * 发一次目标值请求并等 worker 回传结果。
 * @param builds 目标值条目
 * @returns worker 回传的结果消息
 */
async function requestTargetValues(builds: unknown[]) {
    selfStub.postMessage.mockClear()
    state.calls.length = 0
    selfStub.onmessage?.({ data: { id: 8, kind: "targetValues", builds } })
    await vi.waitFor(() => expect(selfStub.postMessage).toHaveBeenCalled())
    return selfStub.postMessage.mock.calls[0][0] as { values: Record<string, number>; engine: string }
}

describe("Calc.worker 收益请求", () => {
    it("特效 BUFF 按特效等级求收益（移除置 0），不落入按名 buff_remove", async () => {
        const effect = modEffectMap.get(51942)
        expect(effect).toBeDefined()
        const response = await requestIncome([
            { key: "minus", data: effect, level: 10, minus: true, pid: 51942, pt: "Mod" },
            { key: "add", data: effect, level: 10, minus: false, pid: 51942, pt: "Mod" },
        ])
        expect(response.engine).toBe("wasm")
        expect(response.incomes).toEqual({ minus: 0.5, add: 0.5 })
        expect(state.calls[0].items).toEqual([
            { key: "minus", kind: "effect_set", owner: "Mod", id: 51942, level: 0 },
            { key: "add", kind: "effect_set", owner: "Mod", id: 51942, level: 10 },
        ])
    })

    it("普通 BUFF 仍按追加 / 真实移除求收益", async () => {
        const buff = buffData[0]
        await requestIncome([
            { key: "rm", data: buff, level: 1, minus: true },
            { key: "add", data: buff, level: 1, minus: false, coverage: 0.5 },
        ])
        expect(state.calls[0].items).toEqual([
            { key: "rm", kind: "buff_remove", name: buff.名称 },
            { key: "add", kind: "buff_add", name: buff.名称, level: 1, coverage: 0.5 },
        ])
    })
})

describe("Calc.worker 目标值请求", () => {
    const snapshot = () => createWorkerSnapshot(createCharBuildFromSettings(liseFireBuildCharId, liseFireBuildSettings))

    it("条目只带构筑快照时仍走 wasm（用快照里的原始配置）", async () => {
        const response = await requestTargetValues([{ key: "b1", build: snapshot() }])
        expect(response.engine).toBe("wasm")
        expect(response.values).toEqual({ b1: 0.5 })
        expect(state.calls[0].items).toEqual([{ key: "b1", kind: "target", charId: liseFireBuildCharId, settings: expect.any(Object) }])
    })

    it("快照缺少原始配置时回退 TS 快照口径", async () => {
        const build = snapshot()
        delete build.settings
        const response = await requestTargetValues([{ key: "b1", build }])
        expect(response.engine).toBe("ts")
        expect(state.calls).toHaveLength(0)
        expect(response.values.b1).toBeCloseTo(createBuildFromSnapshot(build).calculate(), 6)
    })
})
