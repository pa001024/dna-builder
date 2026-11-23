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
import { type CharSettings, createDefaultCharSettings, normalizeCharSettings } from "../charSettings"
import { charMap, modEffectMap } from "../d"
import { buffData } from "../index"
import { FEINA_PASSIVE_TEAM_BUFF } from "../traceEffects"
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

const FEINA_ID = 1801
const SUYI_ID = charMap.get("苏乙")!.id

/** 菲娜主控配置：可指定计算技能与手动 BUFF */
function feinaSettings(patch: Partial<CharSettings> = {}): CharSettings {
    const char = charMap.get(FEINA_ID)!
    return normalizeCharSettings({
        ...createDefaultCharSettings(),
        meleeWeapon: 10206,
        rangedWeapon: 20102,
        auraMod: 0,
        baseName: char.技能[0].名称,
        ...patch,
    })
}

/** 苏乙主控配置：计算技能 = 逐日（E），可指定关闭根源 */
function suyiSettings(patch: Partial<CharSettings> = {}): CharSettings {
    return normalizeCharSettings({
        ...createDefaultCharSettings(),
        meleeWeapon: 10206,
        rangedWeapon: 20102,
        auraMod: 0,
        baseName: "逐日",
        ...patch,
    })
}

/**
 * 发一次溯源收益请求并等 worker 回传结果。
 * @param settings 主控配置
 * @param items 根源卡片条目
 * @param charId 主控角色 id（缺省菲娜）
 * @returns worker 回传的结果消息
 */
async function requestTraceIncome(settings: CharSettings, items: unknown[], charId = FEINA_ID) {
    selfStub.postMessage.mockClear()
    state.calls.length = 0
    selfStub.onmessage?.({
        data: { id: 9, kind: "traceIncome", charId, settings, items },
    })
    await vi.waitFor(() => expect(selfStub.postMessage).toHaveBeenCalled())
    return selfStub.postMessage.mock.calls[0][0] as { incomes: Record<string, number>; engine: string; failed?: string[] }
}

/**
 * 发送原始溯源收益载荷（绕过类型校验，验证错误路径）。
 * @param payload 请求体
 * @returns worker 回传的结果消息
 */
async function sendRawTraceIncome(payload: Record<string, unknown>) {
    selfStub.postMessage.mockClear()
    state.calls.length = 0
    selfStub.onmessage?.({ data: { id: 10, kind: "traceIncome", ...payload } })
    await vi.waitFor(() => expect(selfStub.postMessage).toHaveBeenCalled())
    return selfStub.postMessage.mock.calls[0][0] as {
        incomes?: Record<string, number>
        error?: string
        engine?: string
        failed?: string[]
    }
}

describe("Calc.worker 溯源收益请求", () => {
    it("3、5 根源的技能等级增量计入收益（基础 10 级非零）；激活卡与关闭卡均为正", async () => {
        // 计算技能 = E：3 根源 E+2 直接影响伤害
        const eSettings = feinaSettings({ traceOffRoots: [] })
        const response = await requestTraceIncome(eSettings, [
            { key: "main:3", side: "main", root: 3, active: true },
            { key: "main:4", side: "main", root: 4, active: true },
        ])
        expect(response.engine).toBe("ts")
        // 基础 10 级：3 根源 E+2 还有向上空间，关闭它的收益为正（与 BUFF 移除收益同向）
        expect(response.incomes["main:3"]).toBeGreaterThan(1e-6)
        expect(response.incomes["main:4"]).toBeGreaterThan(1e-6)

        // 关闭状态的 3 根源卡：打开它应产生真实收益（与上面的损失同量级）
        const offResponse = await requestTraceIncome(feinaSettings({ traceOffRoots: [3] }), [
            { key: "main:3", side: "main", root: 3, active: false },
        ])
        expect(offResponse.incomes["main:3"]).toBeGreaterThan(1e-6)

        // 计算技能 = Q：5 根源 Q+2 联动 Q 数组，关闭它同样非零
        const qSettings = feinaSettings({
            baseName: charMap.get(FEINA_ID)!.技能[1].名称,
            buffs: [["菲娜Q", 10]],
            traceOffRoots: [],
        })
        const qResponse = await requestTraceIncome(qSettings, [{ key: "main:5", side: "main", root: 5, active: true }])
        expect(qResponse.incomes["main:5"]).toBeGreaterThan(1e-6)
    })

    it("苏乙 3 根源（原文解析 E+2 / P+1）：逐日目标函数下收益非零；关闭该根源后为 0、重新打开为正", async () => {
        const response = await requestTraceIncome(
            suyiSettings({ traceOffRoots: [] }),
            [{ key: "main:3", side: "main", root: 3, active: true }],
            SUYI_ID
        )
        expect(response.engine).toBe("ts")
        expect(response.incomes["main:3"]).toBeGreaterThan(1e-6)

        // 已关闭的根源再请求「激活卡」：状态未变化，收益为 0（§136：0 不显示）
        const closed = await requestTraceIncome(
            suyiSettings({ traceOffRoots: [3] }),
            [{ key: "main:3", side: "main", root: 3, active: true }],
            SUYI_ID
        )
        expect(closed.incomes["main:3"]).toBe(0)

        const opening = await requestTraceIncome(
            suyiSettings({ traceOffRoots: [3] }),
            [{ key: "main:3", side: "main", root: 3, active: false }],
            SUYI_ID
        )
        expect(opening.incomes["main:3"]).toBeGreaterThan(1e-6)

        // 被动口径：3 根源的 P+1 同样产生非零收益
        const passive = await requestTraceIncome(
            suyiSettings({ baseName: "蓄势待发", traceOffRoots: [] }),
            [{ key: "main:3", side: "main", root: 3, active: true }],
            SUYI_ID
        )
        expect(passive.incomes["main:3"]).toBeGreaterThan(1e-6)
    })

    it("同一根源的层数 / 覆盖率计入收益（U115）：level 3 > level 1 > 0，覆盖率 0.5 介于两者之间", async () => {
        const berenika = charMap.get("贝蕾妮卡")!
        const make = (traceStacks: [number, number, number?][]) =>
            normalizeCharSettings({
                ...createDefaultCharSettings(),
                meleeWeapon: 10206,
                rangedWeapon: 20102,
                auraMod: 0,
                baseName: berenika.技能[1].名称,
                traceOffRoots: [],
                targetFunction: "技能效益*伤害",
                traceStacks,
            })
        const items = [{ key: "main:1", side: "main", root: 1, active: true }]
        const full = await requestTraceIncome(make([[1, 3]]), items, berenika.id)
        const low = await requestTraceIncome(make([[1, 1]]), items, berenika.id)
        const half = await requestTraceIncome(make([[1, 3, 0.5]]), items, berenika.id)
        expect(full.incomes["main:1"]).toBeGreaterThan(1e-6)
        expect(low.incomes["main:1"]).toBeGreaterThan(1e-6)
        expect(half.incomes["main:1"]).toBeGreaterThan(1e-6)
        expect(full.incomes["main:1"]).toBeGreaterThan(low.incomes["main:1"])
        expect(half.incomes["main:1"]).toBeLessThan(full.incomes["main:1"])
    })

    it("2 根源规则计入收益（U116）：持有 菲娜被动(团队) 时关闭收益更高，未持有只剩 4 溯源层数差", async () => {
        const withTeam = feinaSettings({ buffs: [[FEINA_PASSIVE_TEAM_BUFF, 1]], traceOffRoots: [] })
        const held = await requestTraceIncome(withTeam, [{ key: "main:2", side: "main", root: 2, active: true }])
        expect(held.engine).toBe("ts")
        expect(held.incomes["main:2"]).toBeGreaterThan(1e-6)

        // 关闭状态打开它同样有收益（0.30 → 0.45）
        const off = feinaSettings({ buffs: [[FEINA_PASSIVE_TEAM_BUFF, 1]], traceOffRoots: [2] })
        const opening = await requestTraceIncome(off, [{ key: "main:2", side: "main", root: 2, active: false }])
        expect(opening.incomes["main:2"]).toBeGreaterThan(1e-6)

        // 未持有目标 BUFF：规则不生效，只剩 4 溯源随层数 45→30 的差
        const withoutTeam = feinaSettings({ traceOffRoots: [] })
        const bare = await requestTraceIncome(withoutTeam, [{ key: "main:2", side: "main", root: 2, active: true }])
        expect(bare.incomes["main:2"]).toBeGreaterThan(0)
        expect(held.incomes["main:2"]).toBeGreaterThan(bare.incomes["main:2"])
    })

    it("单条失败隔离：坏配置只影响自身（记 0 + failed），未配置的协战侧记 0 且不影响主控条目", async () => {
        // BigInt 无法 JSON 序列化：基线不需要克隆仍能构建，逐项克隆会抛错
        const poisoned = { ...feinaSettings({ traceOffRoots: [] }), poison: 1n } as unknown as CharSettings
        const bad = await requestTraceIncome(poisoned, [{ key: "bad", side: "main", root: 3, active: true }])
        expect(bad.incomes.bad).toBe(0)
        expect(bad.failed).toEqual(["bad"])

        // 未配置的协战侧：该条记 0，主控条目照常计算
        const settings = feinaSettings({ traceOffRoots: [] })
        const mixed = await requestTraceIncome(settings, [
            { key: "assist", side: "assist1", root: 1, active: true },
            { key: "main", side: "main", root: 3, active: true },
        ])
        expect(mixed.incomes.assist).toBe(0)
        expect(mixed.incomes.main).toBeGreaterThan(1e-6)
        expect(mixed.failed).toBeUndefined()
    })

    it("基数为 0 时所有条目记 0；settings / charId 缺失整体报错", async () => {
        const zero = feinaSettings({ traceOffRoots: [], targetFunction: "0" })
        const zeroResponse = await requestTraceIncome(zero, [{ key: "main:3", side: "main", root: 3, active: true }])
        expect(zeroResponse.incomes["main:3"]).toBe(0)

        const missingSettings = await sendRawTraceIncome({ charId: FEINA_ID, items: [] })
        expect(missingSettings.error).toContain("溯源收益缺少")
        const missingChar = await sendRawTraceIncome({ settings: feinaSettings(), items: [] })
        expect(missingChar.error).toContain("溯源收益缺少")
    })
})

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
