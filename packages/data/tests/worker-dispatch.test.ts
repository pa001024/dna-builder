import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

/** 四个 wasm 入口的 mock：worker 的引擎分派与错误上报全部在这里观测 */
const wasm = vi.hoisted(() => ({
    evaluate: vi.fn(),
    panels: vi.fn(),
    autobuild: vi.fn(),
    income: vi.fn(),
}))

vi.mock("../CalcWasm", async importOriginal => {
    const actual = await importOriginal<typeof import("../CalcWasm")>()
    return {
        ...actual,
        runWasmEvaluate: wasm.evaluate,
        runWasmPanels: wasm.panels,
        runWasmAutobuild: wasm.autobuild,
        runWasmIncome: wasm.income,
        takeWasmSessionSetupMs: () => undefined,
    }
})

import { WasmUnavailableError } from "../CalcWasm"
import { createCharBuildFromSettings } from "../CharBuildHelper"
import { createWorkerSnapshot } from "../CharBuildSnapshot"
import { createDefaultCharSettings, normalizeCharSettings } from "../charSettings"
import { charMap } from "../d"

const MAIN_CHAR = "黎瑟"
const ASSIST_CHAR = "菲娜"
const MAIN_ID = charMap.get(MAIN_CHAR)!.id
const ASSIST_ID = charMap.get(ASSIST_CHAR)!.id

/**
 * 读取角色技能名（数据表的 `Skill.名称` 为可选字段）。
 * @param charId 角色 id
 * @param index 技能索引
 * @returns 技能名称
 */
function charSkillName(charId: number, index = 0) {
    const name = charMap.get(charId)?.技能?.[index]?.名称
    if (!name) throw new Error(`角色 ${charId} 缺少第 ${index} 个技能`)
    return name
}

/**
 * 构造一份带 1 号协战（菲娜）的主控配置：目标函数引用协战技能字段，
 * 覆盖「表达式内容不参与引擎选择」的关键场景。
 * @param targetFunction 主控目标函数
 * @returns 已归一化的配置
 */
function createTeamSettings(targetFunction = "") {
    const settings = createDefaultCharSettings()
    settings.baseName = charSkillName(MAIN_ID, 1)
    settings.charSkillLevel = [10, 10, 10]
    settings.meleeWeapon = 10302
    settings.rangedWeapon = 20601
    settings.targetFunction = targetFunction
    settings.team1 = ASSIST_ID
    settings.team1Weapon = 20601
    settings.assist1 = {
        ...settings.assist1,
        charLevel: 80,
        charSkillLevel: [10, 10, 10],
        baseName: charSkillName(ASSIST_ID, 1),
        enabled: true,
    }
    return normalizeCharSettings(settings)
}

/** 启用升华（主控天赋「攻击」）的配置 */
function createTranscendSettings(targetFunction = "攻击") {
    const settings = createTeamSettings(targetFunction)
    settings.transcend = { ...settings.transcend, enabled: true, talentLevels: [[100001, 1]] }
    return settings
}

const selfStub = {
    postMessage: vi.fn(),
    onmessage: undefined as ((event: { data: unknown }) => void) | undefined,
}

beforeAll(async () => {
    ;(globalThis as { self?: unknown }).self = selfStub
    await import("../Calc.worker")
})

beforeEach(() => {
    wasm.evaluate.mockReset().mockResolvedValue({
        value: {
            attributes: {},
            weapon: null,
            panels: {},
            targetValue: 2,
            damage: null,
            targetFunction: "1+1",
            error: null,
        },
        elapsedMs: 1,
    })
    wasm.panels.mockReset().mockResolvedValue({ value: { panels: { char: { 攻击: 1 } } }, elapsedMs: 1 })
    wasm.autobuild.mockReset().mockImplementation(async (input: { settings: unknown }) => ({
        value: { settings: input.settings, log: [], iters: 0 },
        elapsedMs: 1,
    }))
    wasm.income.mockReset().mockImplementation(async (input: { items: { key: string }[] }) => ({
        value: { base: 100, values: Object.fromEntries(input.items.map(item => [item.key, 1])) },
        elapsedMs: 1,
    }))
})

interface WorkerResult {
    engine?: "ts" | "wasm"
    wasmError?: string
    error?: string
    evaluation?: { targetValue: number; engine: "ts" | "wasm" }
    panels?: Record<string, Record<string, number>>
    values?: Record<string, number>
    incomes?: Record<string, number>
    newBuild?: unknown
    log?: string
}

/**
 * 发一条 worker 请求并等回传结果。
 * @param data 请求体
 * @returns worker 回传的结果消息
 */
async function sendRequest(data: unknown): Promise<WorkerResult> {
    selfStub.postMessage.mockClear()
    selfStub.onmessage?.({ data })
    const isResult = (call: unknown[]) => (call[0] as { type?: string }).type === "result"
    await vi.waitFor(() => expect(selfStub.postMessage.mock.calls.some(isResult)).toBe(true))
    return selfStub.postMessage.mock.calls.find(isResult)![0] as WorkerResult
}

/** 构造自动配装请求（空候选；TS 路径也能快速返回） */
function createAutobuildRequest(settings: ReturnType<typeof createTeamSettings>, id = 1) {
    return {
        id,
        kind: "autobuild",
        charId: MAIN_ID,
        settings,
        build: createWorkerSnapshot(createCharBuildFromSettings(MAIN_ID, settings)),
        includeTypes: [] as [],
        preserveTypes: [] as [],
        fixedMelee: false,
        fixedRanged: false,
        modOptions: [],
        meleeOptions: [],
        rangedOptions: [],
        enableLog: false,
    }
}

describe("引擎选择只看数据与环境（表达式内容不参与）", () => {
    it("evaluate：协战技能字段表达式 → wasm", async () => {
        const settings = createTeamSettings("下午茶开始了::追加伤害倍率")
        const response = await sendRequest({ id: 1, kind: "evaluate", charId: MAIN_ID, settings })
        expect(wasm.evaluate).toHaveBeenCalledTimes(1)
        expect(response.engine).toBe("wasm")
        expect(response.wasmError).toBeUndefined()
        expect(response.evaluation?.engine).toBe("wasm")
        expect(response.evaluation?.targetValue).toBe(2)
    })

    it("panels：协战技能字段表达式 → wasm", async () => {
        const response = await sendRequest({
            id: 2,
            kind: "panels",
            charId: MAIN_ID,
            settings: createTeamSettings("下午茶开始了::追加伤害倍率"),
            panels: ["char"],
        })
        expect(wasm.panels).toHaveBeenCalledTimes(1)
        expect(response.engine).toBe("wasm")
        expect(response.wasmError).toBeUndefined()
    })

    it("autobuild / income / targetValues：团队构筑一律走 wasm", async () => {
        const settings = createTeamSettings("下午茶开始了::追加伤害倍率")
        const autobuild = await sendRequest(createAutobuildRequest(settings, 3))
        expect(wasm.autobuild).toHaveBeenCalledTimes(1)
        expect(autobuild.engine).toBe("wasm")

        const build = createWorkerSnapshot(createCharBuildFromSettings(MAIN_ID, settings))
        const income = await sendRequest({ id: 4, kind: "income", charId: MAIN_ID, settings, build, buffs: [] })
        expect(wasm.income).toHaveBeenCalledTimes(1)
        expect(income.engine).toBe("wasm")

        const targetValues = await sendRequest({ id: 5, kind: "targetValues", builds: [{ key: "b1", build }] })
        expect(wasm.income).toHaveBeenCalledTimes(2)
        expect(targetValues.engine).toBe("wasm")
        expect(targetValues.values?.b1).toBe(1)
    })

    it("autobuild 缺 charId / settings → TS，wasm 零调用", async () => {
        const settings = createTeamSettings("1+1")
        const request = createAutobuildRequest(settings, 6)
        const response = await sendRequest({ ...request, charId: undefined, settings: undefined })
        expect(wasm.autobuild).not.toHaveBeenCalled()
        expect(response.engine).toBe("ts")
    })

    it("income 缺 settings（快照也没有）→ TS，wasm 零调用", async () => {
        const settings = createTeamSettings("1+1")
        const build = createWorkerSnapshot(createCharBuildFromSettings(MAIN_ID, settings))
        const response = await sendRequest({
            id: 7,
            kind: "income",
            build: { ...build, settings: undefined },
            buffs: [],
        })
        expect(wasm.income).not.toHaveBeenCalled()
        expect(response.engine).toBe("ts")
    })

    it("targetValues 条目缺 build.settings → TS", async () => {
        const settings = createTeamSettings("1+1")
        const build = createWorkerSnapshot(createCharBuildFromSettings(MAIN_ID, settings))
        const response = await sendRequest({
            id: 8,
            kind: "targetValues",
            builds: [{ key: "no-settings", build: { ...build, settings: undefined } }],
        })
        expect(wasm.income).not.toHaveBeenCalled()
        expect(response.engine).toBe("ts")
        expect(response.values?.["no-settings"]).toBeGreaterThan(0)
    })
})

describe("wasm 执行错误：上报 wasmError，不得用 TS 结果顶替", () => {
    it("evaluate：无 evaluation、engine 留空", async () => {
        wasm.evaluate.mockRejectedValue(new Error("构筑求值失败"))
        const response = await sendRequest({
            id: 11,
            kind: "evaluate",
            charId: MAIN_ID,
            settings: createTeamSettings("1+1"),
        })
        expect(wasm.evaluate).toHaveBeenCalledTimes(1)
        expect(response.error).toBe("构筑求值失败")
        expect(response.wasmError).toBe("构筑求值失败")
        expect(response.evaluation).toBeUndefined()
        expect(response.engine).toBeUndefined()
    })

    it("panels：无 panels、engine 留空", async () => {
        wasm.panels.mockRejectedValue(new Error("面板求值失败"))
        const response = await sendRequest({
            id: 12,
            kind: "panels",
            charId: MAIN_ID,
            settings: createTeamSettings("1+1"),
            panels: ["char"],
        })
        expect(wasm.panels).toHaveBeenCalledTimes(1)
        expect(response.error).toBe("面板求值失败")
        expect(response.wasmError).toBe("面板求值失败")
        expect(response.panels).toBeUndefined()
        expect(response.engine).toBeUndefined()
    })

    it("autobuild：无 newBuild，engine 标记 wasm", async () => {
        wasm.autobuild.mockRejectedValue(new Error("自动配装失败"))
        const response = await sendRequest(createAutobuildRequest(createTeamSettings("1+1"), 13))
        expect(wasm.autobuild).toHaveBeenCalledTimes(1)
        expect(response.error).toBe("自动配装失败")
        expect(response.wasmError).toBe("自动配装失败")
        expect(response.newBuild).toBeUndefined()
        expect(response.engine).toBe("wasm")
    })

    it("income：无 incomes，engine 标记 wasm", async () => {
        wasm.income.mockRejectedValue(new Error("收益计算失败"))
        const settings = createTeamSettings("1+1")
        const response = await sendRequest({
            id: 14,
            kind: "income",
            charId: MAIN_ID,
            settings,
            build: createWorkerSnapshot(createCharBuildFromSettings(MAIN_ID, settings)),
            buffs: [],
        })
        expect(wasm.income).toHaveBeenCalledTimes(1)
        expect(response.error).toBe("收益计算失败")
        expect(response.wasmError).toBe("收益计算失败")
        expect(response.incomes).toBeUndefined()
        expect(response.engine).toBe("wasm")
    })

    it("targetValues：无 values，engine 标记 wasm", async () => {
        wasm.income.mockRejectedValue(new Error("目标值失败"))
        const settings = createTeamSettings("1+1")
        const build = createWorkerSnapshot(createCharBuildFromSettings(MAIN_ID, settings))
        const response = await sendRequest({ id: 15, kind: "targetValues", builds: [{ key: "t", build }] })
        expect(wasm.income).toHaveBeenCalledTimes(1)
        expect(response.error).toBe("目标值失败")
        expect(response.wasmError).toBe("目标值失败")
        expect(response.values).toBeUndefined()
        expect(response.engine).toBe("wasm")
    })
})

describe("wasm 模块不可用（环境）：走 TS 且不写 wasmError", () => {
    it("evaluate / panels → TS 结果", async () => {
        wasm.evaluate.mockRejectedValue(new WasmUnavailableError())
        wasm.panels.mockRejectedValue(new WasmUnavailableError())
        const settings = createTeamSettings("1+1")
        const evaluate = await sendRequest({ id: 21, kind: "evaluate", charId: MAIN_ID, settings })
        expect(evaluate.engine).toBe("ts")
        expect(evaluate.wasmError).toBeUndefined()
        expect(evaluate.evaluation?.engine).toBe("ts")

        const panels = await sendRequest({ id: 22, kind: "panels", charId: MAIN_ID, settings, panels: ["char"] })
        expect(panels.engine).toBe("ts")
        expect(panels.wasmError).toBeUndefined()
        expect(panels.panels?.char).toBeDefined()
    })

    it("autobuild / income / targetValues → TS 结果", async () => {
        wasm.autobuild.mockRejectedValue(new WasmUnavailableError())
        wasm.income.mockRejectedValue(new WasmUnavailableError())
        const settings = createTeamSettings("1+1")
        const autobuild = await sendRequest(createAutobuildRequest(settings, 23))
        expect(autobuild.engine).toBe("ts")
        expect(autobuild.wasmError).toBeUndefined()
        expect(autobuild.newBuild).toBeDefined()

        const build = createWorkerSnapshot(createCharBuildFromSettings(MAIN_ID, settings))
        const income = await sendRequest({ id: 24, kind: "income", charId: MAIN_ID, settings, build, buffs: [] })
        expect(income.engine).toBe("ts")
        expect(income.wasmError).toBeUndefined()

        const targetValues = await sendRequest({ id: 25, kind: "targetValues", builds: [{ key: "t", build }] })
        expect(targetValues.engine).toBe("ts")
        expect(targetValues.wasmError).toBeUndefined()
        expect(targetValues.values?.t).toBeGreaterThan(0)
    })
})

describe("升华启用：五条路径照常走 wasm", () => {
    it("evaluate / panels / autobuild / income / targetValues", async () => {
        const settings = createTranscendSettings("攻击")
        const evaluate = await sendRequest({ id: 31, kind: "evaluate", charId: MAIN_ID, settings })
        expect(evaluate.engine).toBe("wasm")
        expect(wasm.evaluate).toHaveBeenCalledTimes(1)

        const panels = await sendRequest({
            id: 32,
            kind: "panels",
            charId: MAIN_ID,
            settings: createTranscendSettings("1+1"),
            panels: ["char"],
        })
        expect(panels.engine).toBe("wasm")
        expect(wasm.panels).toHaveBeenCalledTimes(1)

        const autobuild = await sendRequest(createAutobuildRequest(createTranscendSettings("1+1"), 33))
        expect(autobuild.engine).toBe("wasm")
        expect(wasm.autobuild).toHaveBeenCalledTimes(1)

        const build = createWorkerSnapshot(createCharBuildFromSettings(MAIN_ID, settings))
        const income = await sendRequest({ id: 34, kind: "income", charId: MAIN_ID, settings, build, buffs: [] })
        expect(income.engine).toBe("wasm")

        const targetValues = await sendRequest({ id: 35, kind: "targetValues", builds: [{ key: "t", build }] })
        expect(targetValues.engine).toBe("wasm")
        expect(targetValues.values?.t).toBe(1)
    })
})
