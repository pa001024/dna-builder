import type { ModTypeKey } from "./CharBuild"
import type { CharSettings } from "./charSettings"
import { modEffectMap, petMap, weaponEffectMap } from "./d"
import { petEntrys } from "./d/pet.data"
import type { Mod, Weapon } from "./data-types"
import { buffData, charData, modData, monsterData, weaponData } from "./index"
import { withWasmTranscendPayload } from "./transcend-wasm"

export interface WasmModOption {
    data: Mod
    level: number
    buffLv?: number
    count: number
}

export interface WasmWeaponOption {
    data: Weapon
    refine: number
    level: number
    effectLv?: number
}

type DobccExports = WebAssembly.Exports & {
    memory: WebAssembly.Memory
    dobcc_alloc(size: number): number
    dobcc_dealloc(pointer: number, size: number): void
    dobcc_open_session(tablesPtr: number, tablesLen: number): bigint
    dobcc_evaluate(session: bigint, reqPtr: number, reqLen: number, outLenPtr: number): number
    dobcc_panels(session: bigint, reqPtr: number, reqLen: number, outLenPtr: number): number
    dobcc_autobuild(session: bigint, reqPtr: number, reqLen: number, outLenPtr: number): number
    dobcc_income(session: bigint, reqPtr: number, reqLen: number, outLenPtr: number): number
    dobcc_close_session(session: bigint): void
}

export interface WasmAutobuildInput {
    charId: number
    settings: CharSettings
    includeTypes: ModTypeKey[]
    preserveTypes: ModTypeKey[]
    fixedMelee: boolean
    fixedRanged: boolean
    modOptions: WasmModOption[]
    meleeOptions: WasmWeaponOption[]
    rangedOptions: WasmWeaponOption[]
}

export interface WasmAutobuildResult {
    settings: CharSettings
    log: string[]
    iters: number
}

/** 构筑求值结果（对应 Rust `BuildResult` 的 JSON 口径）。 */
export interface WasmEvaluateResult {
    attributes: Record<string, number>
    weapon: Record<string, number> | null
    /** 请求附带的面板；未请求时为空对象 */
    panels: Partial<Record<PanelKind, Record<string, number>>>
    targetValue: number
    damage: {
        expectedDamage: number
        noHpDamage: number
        physicalDamage: number
        elementDamage: number
        higherCritExpectedTrigger: number
        lowerCritExpectedTrigger: number
    } | null
    targetFunction: string
    buffs: { name: string; applicableSkill: string | null; tags: string[] }[]
    error: string | null
}

export interface WasmEvaluateInput {
    charId: number
    settings: CharSettings
    /** 覆盖 settings.targetFunction 的目标函数（节点编辑器按节点指定表达式时使用） */
    targetFunction?: string
    /** 覆盖 settings.baseName 的技能基名（武器伤害节点切到武器技能口径） */
    baseName?: string
    /** 附带面板数组：与目标值同一次装配计算，复用请求 */
    panels?: PanelKind[]
}

/** 可批量请求的面板类型：角色属性面板 + 武器槽面板 */
export type PanelKind = "char" | "melee" | "ranged" | "skill"

export interface WasmPanelsInput {
    charId: number
    settings: CharSettings
    /** 需要的面板类型：同一构筑一次装配批量计算 */
    panels: PanelKind[]
}

export interface WasmPanelsResult {
    /** 面板键 → 属性表；`char` 为角色面板，构筑没有对应武器（如无同律武器）时该槽缺席 */
    panels: Partial<Record<PanelKind, Record<string, number>>>
}

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

let sessionPromise: Promise<{ exports: DobccExports; session: bigint } | undefined> | undefined
let sessionDataKey = ""

/**
 * 数据包水合会整体替换静态数据；用长度与首尾 id 做低成本指纹，变化时重建 wasm 会话。
 * @returns 当前数据指纹
 */
function currentDataKey(): string {
    const sample = (list: readonly { id?: number }[]) => `${list.length}:${list[0]?.id ?? ""}:${list[list.length - 1]?.id ?? ""}`
    return [
        sample(charData),
        sample(modData),
        sample(weaponData),
        sample(buffData),
        sample(monsterData),
        modEffectMap.size,
        weaponEffectMap.size,
        petMap.size,
        petEntrys.length,
    ].join("|")
}

function buildModulesJson(): string {
    return JSON.stringify({
        "char.data": charData,
        "mod.data": modData,
        "weapon.data": weaponData,
        "buff.data": buffData,
        "effect.data": [...modEffectMap.values(), ...weaponEffectMap.values()],
        "monster.data": monsterData,
        "pet.data": [...petMap.values()],
        petTraits: petEntrys,
    })
}

/** 最近一次建表（数据填充 + open_session）耗时；由结果消息取走，只上报一次 */
let sessionSetupMs: number | undefined

/** wasm 同步调用结果：附带本次调用耗时 */
export interface WasmCallResult<T> {
    value: T
    /** 会话就绪后的同步调用耗时：含请求序列化与结果解析，不含建表与排队 */
    elapsedMs: number
}

/**
 * 执行一次同步 wasm 调用并计时：从请求序列化开始算起，避免把会话等待摊入请求耗时。
 * @param action 同步调用
 * @returns 调用结果与耗时
 */
/**
 * wasm 模块在当前环境不可用（文件缺失 / 导出缺失 / 会话建立失败）。
 *
 * 这是唯一允许切换到 TS 引擎的原因（环境选择）；wasm 执行错误必须原样上报，
 * 不得用 TS 结果顶替——Rust 与 TS 的逐值等价由 parity 测试保证。
 */
export class WasmUnavailableError extends Error {
    constructor(message = "wasm 不可用") {
        super(message)
        this.name = "WasmUnavailableError"
    }
}

function callTimed<T>(action: () => T): WasmCallResult<T> {
    const startedAt = performance.now()
    const value = action()
    return { value, elapsedMs: performance.now() - startedAt }
}

async function getSession(): Promise<{ exports: DobccExports; session: bigint } | undefined> {
    const dataKey = currentDataKey()
    // 数据包换入后旧会话的静态表已过期；不主动关闭，避免与在途求值竞争
    if (sessionPromise && sessionDataKey !== dataKey) sessionPromise = undefined
    if (!sessionPromise) {
        sessionDataKey = dataKey
        sessionPromise = (async () => {
            try {
                const base =
                    typeof self !== "undefined" && self.location?.origin
                        ? self.location.origin
                        : typeof location !== "undefined"
                          ? location.origin
                          : ""
                const response = await fetch(`${base}/wasm/dob_calc_core.wasm`)
                if (!response.ok) return undefined
                const { instance } = await WebAssembly.instantiate(await response.arrayBuffer(), {})
                const wasm = instance.exports as DobccExports
                if (
                    typeof wasm.dobcc_evaluate !== "function" ||
                    typeof wasm.dobcc_autobuild !== "function" ||
                    typeof wasm.dobcc_income !== "function"
                ) {
                    return undefined
                }
                // 建表（序列化数据表 + open_session）单独计时：耗时远大于单次求值，不能混进首个请求
                const fillStartedAt = performance.now()
                const bytes = textEncoder.encode(buildModulesJson())
                const ptr = wasm.dobcc_alloc(bytes.length)
                new Uint8Array(wasm.memory.buffer).set(bytes, ptr)
                const session = wasm.dobcc_open_session(ptr, bytes.length)
                wasm.dobcc_dealloc(ptr, bytes.length)
                if (!session) return undefined
                sessionSetupMs = performance.now() - fillStartedAt
                return { exports: wasm, session }
            } catch (error) {
                console.warn("dob-calc-core wasm 会话建立失败", error)
                return undefined
            }
        })()
    }
    return sessionPromise
}

/**
 * 取走最近一次 wasm 建表耗时（只上报一次，避免重复计入性能统计）。
 * @returns 建表耗时（毫秒）；尚未建表或已被取走时为 undefined
 */
export function takeWasmSessionSetupMs(): number | undefined {
    const value = sessionSetupMs
    sessionSetupMs = undefined
    return value
}

export function buildWasmAutobuildRequest(input: WasmAutobuildInput): string {
    return JSON.stringify({
        // 升华效果随 settings 走：Rust 按 `transcendSide` 选三侧载荷装配
        base: { charId: input.charId, settings: withWasmTranscendPayload(input.charId, input.settings) },
        modCandidates: input.modOptions.map(mod => ({
            id: mod.data.id,
            level: mod.level,
            buffLevel: mod.buffLv,
            count: mod.count,
        })),
        meleeCandidates: input.meleeOptions.map(weapon => ({
            id: weapon.data.id,
            level: weapon.level,
            refine: weapon.refine,
            effectLevel: weapon.effectLv,
        })),
        rangedCandidates: input.rangedOptions.map(weapon => ({
            id: weapon.data.id,
            level: weapon.level,
            refine: weapon.refine,
            effectLevel: weapon.effectLv,
        })),
        options: {
            includeTypes: input.includeTypes,
            preserveTypes: input.preserveTypes,
            fixedMelee: input.fixedMelee,
            fixedRanged: input.fixedRanged,
        },
    })
}

function callDobcc<T>(wasm: DobccExports, invoke: (reqPtr: number, reqLen: number, lenPtr: number) => number, requestJson: string): T {
    const reqBytes = textEncoder.encode(requestJson)
    const reqPtr = wasm.dobcc_alloc(reqBytes.length)
    new Uint8Array(wasm.memory.buffer).set(reqBytes, reqPtr)
    const lenPtr = wasm.dobcc_alloc(8)
    new Uint8Array(wasm.memory.buffer).fill(0, lenPtr, lenPtr + 8)
    const outPtr = invoke(reqPtr, reqBytes.length, lenPtr)
    const outLen = new DataView(wasm.memory.buffer).getUint32(lenPtr, true)
    const outBytes = outPtr ? new Uint8Array(wasm.memory.buffer).slice(outPtr, outPtr + outLen) : new Uint8Array()
    wasm.dobcc_dealloc(reqPtr, reqBytes.length)
    wasm.dobcc_dealloc(lenPtr, 8)
    if (outPtr) wasm.dobcc_dealloc(outPtr, outLen)
    const envelope = JSON.parse(textDecoder.decode(outBytes)) as { ok: true; result: T } | { ok: false; error: string }
    if (!envelope.ok) throw new Error(envelope.error)
    return envelope.result
}

export async function runWasmAutobuild(input: WasmAutobuildInput): Promise<WasmCallResult<WasmAutobuildResult>> {
    const ready = await getSession()
    if (!ready) throw new WasmUnavailableError()
    return callTimed(() =>
        callDobcc<WasmAutobuildResult>(
            ready.exports,
            (reqPtr, reqLen, lenPtr) => ready.exports.dobcc_autobuild(ready.session, reqPtr, reqLen, lenPtr),
            buildWasmAutobuildRequest(input)
        )
    )
}

/**
 * 在 wasm 侧求值一份构筑（属性 / 当前武器面板 / 目标函数 / 伤害明细，可附带面板数组）。
 * @param input 角色 id、构筑配置、可选的目标函数覆盖与附带面板
 * @returns wasm 求值结果与本次调用耗时
 */
export async function runWasmEvaluate(input: WasmEvaluateInput): Promise<WasmCallResult<WasmEvaluateResult>> {
    const ready = await getSession()
    if (!ready) throw new WasmUnavailableError()
    const payloadSettings = withWasmTranscendPayload(input.charId, input.settings)
    const settings =
        input.targetFunction === undefined && input.baseName === undefined
            ? payloadSettings
            : {
                  ...payloadSettings,
                  targetFunction: input.targetFunction ?? input.settings.targetFunction,
                  baseName: input.baseName ?? input.settings.baseName,
              }
    return callTimed(() =>
        callDobcc<WasmEvaluateResult>(
            ready.exports,
            (reqPtr, reqLen, lenPtr) => ready.exports.dobcc_evaluate(ready.session, reqPtr, reqLen, lenPtr),
            JSON.stringify({ charId: input.charId, settings, panels: input.panels })
        )
    )
}

/**
 * 在 wasm 侧批量计算武器面板：只装配构筑与面板，不跑目标函数 / 伤害明细。
 * @param input 角色 id、构筑配置与需要面板的武器槽
 * @returns 各槽位武器面板与本次调用耗时
 */
export async function runWasmPanels(input: WasmPanelsInput): Promise<WasmCallResult<WasmPanelsResult>> {
    const ready = await getSession()
    if (!ready) throw new WasmUnavailableError()
    return callTimed(() =>
        callDobcc<WasmPanelsResult>(
            ready.exports,
            (reqPtr, reqLen, lenPtr) => ready.exports.dobcc_panels(ready.session, reqPtr, reqLen, lenPtr),
            JSON.stringify({ charId: input.charId, settings: withWasmTranscendPayload(input.charId, input.settings), panels: input.panels })
        )
    )
}

export type WasmIncomeItem =
    | { key: string; kind: "buff_add"; name: string; level: number; coverage?: number }
    | { key: string; kind: "buff_remove"; name: string }
    | { key: string; kind: "effect_set"; owner: string; id: number; level: number }
    | { key: string; kind: "mod_add"; id: number; level: number; buffLevel?: number }
    | { key: string; kind: "mod_replace"; slot: string; index: number; id: number; level: number; buffLevel?: number }
    | { key: string; kind: "mod_remove"; slot: string; index: number }
    | { key: string; kind: "target"; charId: number; settings: CharSettings }

export interface WasmIncomeInput {
    charId: number
    settings: CharSettings
    skillInherit?: string
    items: WasmIncomeItem[]
}

export interface WasmIncomeResult {
    base: number
    values: Record<string, number>
}

/**
 * 收益请求 JSON：base 与每条 `target` 条目都按自身 settings / charId 携带升华载荷。
 * @param input 收益请求
 * @returns 请求 JSON
 */
export function buildWasmIncomeRequest(input: WasmIncomeInput): string {
    // target 条目可能来自不同构筑（targetValues 批量），载荷必须逐条生成
    const items = input.items.map(item =>
        item.kind === "target" ? { ...item, settings: withWasmTranscendPayload(item.charId, item.settings) } : item
    )
    return JSON.stringify({
        base: { charId: input.charId, settings: withWasmTranscendPayload(input.charId, input.settings) },
        skillInherit: input.skillInherit,
        items,
    })
}

export async function runWasmIncome(input: WasmIncomeInput): Promise<WasmCallResult<WasmIncomeResult>> {
    const ready = await getSession()
    if (!ready) throw new WasmUnavailableError()
    return callTimed(() =>
        callDobcc<WasmIncomeResult>(
            ready.exports,
            (reqPtr, reqLen, lenPtr) => ready.exports.dobcc_income(ready.session, reqPtr, reqLen, lenPtr),
            buildWasmIncomeRequest(input)
        )
    )
}
