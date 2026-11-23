import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"
import { createCharBuildFromSettings } from "../CharBuildHelper"
import { type CharSettings, createDefaultCharSettings, normalizeCharSettings } from "../charSettings"
import { charMap } from "../d"
import { buildWasmTranscendPayload, withWasmTranscendPayload } from "../transcend-wasm"
import type { TranscendGearAffixRoll, TranscendGearItemConfig } from "../transcendGear"

/**
 * wasm 产物过期校验：读取仓库内 `apps/web/public/wasm/dob_calc_core.wasm`，
 * 跑 U126b 三键来源（装备 / 溯源 / 自定义 BUFF）并把 targetValue / 三键面板与 TS 对比。
 * 旧装配语义的产物会忽略三键 BUFF → 等级不重建 → 数值与 TS 不符，测试即失败。
 */

const WASM_URL = new URL("../../../apps/web/public/wasm/dob_calc_core.wasm", import.meta.url)
const MODULES_URL = new URL("../../../crates/dob-calc-core/tests/fixtures/modules.json", import.meta.url)

/** U126b 引入、随载荷解析进入产物的标记字符串（旧产物缺失）。 */
const U126B_MARKER = "旧载荷技能等级加成"

/** wasm 导出（与 `tools/smoke-dob-calc-core.ts` 同口径）。 */
interface WasmExports {
    memory: WebAssembly.Memory
    dobcc_alloc(size: number): number
    dobcc_dealloc(ptr: number, size: number): void
    dobcc_open_session(ptr: number, len: number): bigint | number
    dobcc_evaluate(session: bigint | number, reqPtr: number, reqLen: number, outLenPtr: number): number
    dobcc_close_session(session: bigint | number): void
}

interface Envelope {
    ok: boolean
    error?: string
    result?: {
        targetValue?: number
        attributes?: Record<string, number>
        error?: string | null
    }
}

/**
 * 在真实 wasm 上批量求值请求。
 * @param requests 求值请求（`{charId, settings}`）
 * @returns 每次求值的响应信封
 */
async function evaluateWithWasm(requests: readonly { charId: number; settings: CharSettings }[]): Promise<Envelope[]> {
    const { instance } = await WebAssembly.instantiate(await readFile(WASM_URL), {})
    const wasm = instance.exports as unknown as WasmExports
    const encoder = new TextEncoder()
    const decoder = new TextDecoder()
    const copyIn = (bytes: Uint8Array) => {
        const ptr = wasm.dobcc_alloc(bytes.length)
        new Uint8Array(wasm.memory.buffer).set(bytes, ptr)
        return ptr
    }
    const modulesBytes = await readFile(MODULES_URL)
    const modulesPtr = copyIn(modulesBytes)
    const session = wasm.dobcc_open_session(modulesPtr, modulesBytes.length)
    wasm.dobcc_dealloc(modulesPtr, modulesBytes.length)
    expect(session).toBeTruthy()
    try {
        return requests.map(request => {
            const bytes = encoder.encode(JSON.stringify(request))
            const reqPtr = copyIn(bytes)
            const lenPtr = wasm.dobcc_alloc(8)
            new Uint8Array(wasm.memory.buffer).fill(0, lenPtr, lenPtr + 8)
            const outPtr = wasm.dobcc_evaluate(session, reqPtr, bytes.length, lenPtr)
            const outLen = new DataView(wasm.memory.buffer).getUint32(lenPtr, true)
            const outBytes = new Uint8Array(wasm.memory.buffer).slice(outPtr, outPtr + outLen)
            wasm.dobcc_dealloc(reqPtr, bytes.length)
            wasm.dobcc_dealloc(lenPtr, 8)
            if (outPtr) wasm.dobcc_dealloc(outPtr, outLen)
            return JSON.parse(decoder.decode(outBytes)) as Envelope
        })
    } finally {
        wasm.dobcc_close_session(session)
    }
}

/** 角色技能名（数据表 `Skill.名称` 为可选字段） */
function skillName(charId: number, index: number): string {
    const name = charMap.get(charId)?.技能?.[index]?.名称
    if (!name) throw new Error(`角色 ${charId} 缺少第 ${index} 个技能`)
    return name
}

/** 一条升华装备词条（默认最低档位） */
function gear(slotId: number, affixId: number) {
    return { slotId, affixId, rollLevel: 1, masterworkLevel: 0, ancient: false, finalMasterwork: false }
}

/** 基础配置：关闭溯源，隔离三键来源 */
function baseSettings(charId: number, target: string): CharSettings {
    const settings = createDefaultCharSettings()
    settings.baseName = skillName(charId, 1)
    settings.charSkillLevel = [10, 10, 10]
    settings.traceLevel = 0
    settings.meleeWeapon = 10302
    settings.rangedWeapon = 20601
    settings.auraMod = 0
    settings.targetFunction = target
    return normalizeCharSettings(settings)
}

describe("wasm 产物（U126b 三键技能等级）", () => {
    it("产物包含 U126b 装配标记（旧产物 / 未重建会被抓到）", async () => {
        const bytes = await readFile(WASM_URL)
        expect(bytes.includes(Buffer.from(U126B_MARKER, "utf8"))).toBe(true)
    })

    it("装备 / 溯源 / 自定义 BUFF 三键来源与 TS 同值", async () => {
        const xierda = charMap.get("希尔妲")!.id
        const feina = charMap.get("菲娜")!.id
        const cases: {
            label: string
            charId: number
            settings: CharSettings
            /** 期望的三键面板（E/Q/P） */
            skillAttrs: [number, number, number]
        }[] = [
            {
                label: "装备技能等级 1038 E+1",
                charId: xierda,
                settings: normalizeCharSettings({
                    ...baseSettings(xierda, "E::伤害"),
                    transcend: {
                        ...createDefaultCharSettings().transcend,
                        enabled: true,
                        mainGear: [gear(3, 101), gear(3, 1038)],
                    },
                }),
                skillAttrs: [1, 0, 0],
            },
            {
                label: "溯源技能等级（菲娜满溯）",
                charId: feina,
                settings: normalizeCharSettings({
                    ...createDefaultCharSettings(),
                    baseName: skillName(feina, 1),
                    meleeWeapon: 10206,
                    rangedWeapon: 20102,
                    auraMod: 0,
                    targetFunction: "Q::伤害",
                }),
                skillAttrs: [2, 2, 2],
            },
            {
                label: "自定义 BUFF Q+5",
                charId: xierda,
                settings: normalizeCharSettings({
                    ...baseSettings(xierda, "Q::伤害"),
                    buffs: [["自定义BUFF", 1]],
                    customBuff: [["Q技能等级", 5]],
                }),
                skillAttrs: [0, 5, 0],
            },
        ]
        const requests = cases.map(item => ({ charId: item.charId, settings: withWasmTranscendPayload(item.charId, item.settings) }))
        const envelopes = await evaluateWithWasm(requests)
        for (let index = 0; index < cases.length; index++) {
            const item = cases[index]
            const envelope = envelopes[index]
            expect(envelope.ok, `${item.label}: ${envelope.error}`).toBe(true)
            expect(envelope.result?.error ?? "", `${item.label} 求值错误`).toBe("")
            const tsValue = createCharBuildFromSettings(item.charId, item.settings)!.calculate()
            const wasmValue = envelope.result?.targetValue ?? Number.NaN
            const tolerance = Math.max(Math.abs(tsValue) * 1e-9, 1e-9)
            expect(Math.abs(wasmValue - tsValue), `${item.label}: wasm ${wasmValue} vs TS ${tsValue}`).toBeLessThanOrEqual(tolerance)
            const keys = ["E技能等级", "Q技能等级", "P技能等级"] as const
            for (let slot = 0; slot < keys.length; slot++) {
                expect(envelope.result?.attributes?.[keys[slot]] ?? 0, `${item.label} ${keys[slot]}`).toBe(item.skillAttrs[slot])
            }
        }
    }, 120_000)
})

describe("wasm 产物（U128 防御乘区条件属性）", () => {
    /** 2007 / 420101 三组探针：真实 settings 下 TS 与 wasm 的 targetValue 逐条一致 */
    const cases = [
        {
            label: "2007 召唤破防",
            charName: "伊薇",
            baseName: "乐园构想",
            slotId: 7,
            affixId: 2007,
            exprs: ["E::[召唤物·战车]技能伤害", "普通攻击::一段伤害"],
        },
        {
            label: "420101 星河破防",
            charName: "煜明",
            baseName: "玉山崩",
            slotId: 2,
            affixId: 420101,
            exprs: ["E::[星河寥落]伤害", "E::[疑星落]伤害", "E::[奔雷]伤害"],
        },
    ]

    it("2007 / 420101 真实 settings 的 TS/wasm 同值", async () => {
        const requests: { charId: number; settings: CharSettings; expr: string }[] = []
        for (const item of cases) {
            const charId = charMap.get(item.charName)!.id
            const settings = normalizeCharSettings({
                ...createDefaultCharSettings(),
                baseName: item.baseName,
                traceLevel: 0,
                transcend: {
                    ...createDefaultCharSettings().transcend,
                    enabled: true,
                    mainGear: [gear(item.slotId, item.affixId)],
                },
            })
            for (const expr of item.exprs) requests.push({ charId, settings, expr })
        }
        const envelopes = await evaluateWithWasm(
            requests.map(item => ({
                charId: item.charId,
                settings: withWasmTranscendPayload(item.charId, { ...item.settings, targetFunction: item.expr }),
            }))
        )
        for (let index = 0; index < requests.length; index++) {
            const item = requests[index]
            const envelope = envelopes[index]
            expect(envelope.ok, `${item.expr}: ${envelope.error}`).toBe(true)
            expect(envelope.result?.error ?? "", `${item.expr} 求值错误`).toBe("")
            const tsValue = createCharBuildFromSettings(item.charId, item.settings)!.calculateTargetFunction(undefined, item.expr)
            const wasmValue = envelope.result?.targetValue ?? Number.NaN
            const tolerance = Math.max(Math.abs(tsValue) * 1e-9, 1e-9)
            expect(Math.abs(wasmValue - tsValue), `${item.expr}: wasm ${wasmValue} vs TS ${tsValue}`).toBeLessThanOrEqual(tolerance)
        }
    }, 120_000)
})

describe("wasm 产物（U136 同 id 随机 + 淬炼双行）", () => {
    it("双行载荷含两条同 id 词条，wasm 与 TS 同值", async () => {
        const charId = charMap.get("希尔妲")!.id
        const affixRoll = (affixId: number): TranscendGearAffixRoll => ({
            affixId,
            rollLevel: 1,
            masterworkLevel: 0,
            ancient: false,
            finalMasterwork: false,
        })
        const twinItem: TranscendGearItemConfig = {
            kind: "normal",
            slotType: 3,
            rarityId: 5,
            equipBaseScore: 50,
            affixes: [affixRoll(101), affixRoll(1001), affixRoll(1001)],
            craft: { masterworkLevel: 0, temperingAffixIndex: 2, temperingCount: 1, enchantCount: 0 },
        }
        const settings = normalizeCharSettings({
            ...baseSettings(charId, "伤害"),
            transcend: {
                ...createDefaultCharSettings().transcend,
                enabled: true,
                mainGear: [{ slotId: 3, item: twinItem }],
            },
        })
        // 基础 101 + 随机 1001 + 淬炼 1001：载荷必须带三条（同 id 的两行不被吞并）
        const payload = buildWasmTranscendPayload(charId, settings)!
        expect(payload.main.buffs.filter(buff => buff.data.名称 === "升华装备·手套·攻击")).toHaveLength(3)

        const [envelope] = await evaluateWithWasm([{ charId, settings: withWasmTranscendPayload(charId, settings) }])
        expect(envelope.ok, envelope.error).toBe(true)
        expect(envelope.result?.error ?? "", "求值错误").toBe("")
        const tsValue = createCharBuildFromSettings(charId, settings)!.calculate()
        const wasmValue = envelope.result?.targetValue ?? Number.NaN
        expect(Math.abs(wasmValue - tsValue), `wasm ${wasmValue} vs TS ${tsValue}`).toBeLessThanOrEqual(
            Math.max(Math.abs(tsValue) * 1e-9, 1e-9)
        )
    }, 120_000)
})
