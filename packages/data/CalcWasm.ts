import type { ModTypeKey } from "./CharBuild"
import type { CharSettings } from "./charSettings"
import { modEffectMap, petMap, weaponEffectMap } from "./d"
import { petEntrys } from "./d/pet.data"
import type { Mod, Weapon } from "./data-types"
import { buffData, charData, modData, monsterData, weaponData } from "./index"

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

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

let sessionPromise: Promise<{ exports: DobccExports; session: bigint } | undefined> | undefined

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

async function getSession(): Promise<{ exports: DobccExports; session: bigint } | undefined> {
    if (!sessionPromise) {
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
                if (typeof wasm.dobcc_autobuild !== "function" || typeof wasm.dobcc_income !== "function") return undefined
                const bytes = textEncoder.encode(buildModulesJson())
                const ptr = wasm.dobcc_alloc(bytes.length)
                new Uint8Array(wasm.memory.buffer).set(bytes, ptr)
                const session = wasm.dobcc_open_session(ptr, bytes.length)
                wasm.dobcc_dealloc(ptr, bytes.length)
                if (!session) return undefined
                return { exports: wasm, session }
            } catch (error) {
                console.warn("dob-calc-core wasm 会话建立失败", error)
                return undefined
            }
        })()
    }
    return sessionPromise
}

export function buildWasmAutobuildRequest(input: WasmAutobuildInput): string {
    return JSON.stringify({
        base: { charId: input.charId, settings: input.settings },
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

export async function runWasmAutobuild(input: WasmAutobuildInput): Promise<WasmAutobuildResult> {
    const ready = await getSession()
    if (!ready) throw new Error("wasm 不可用")
    return callDobcc<WasmAutobuildResult>(
        ready.exports,
        (reqPtr, reqLen, lenPtr) => ready.exports.dobcc_autobuild(ready.session, reqPtr, reqLen, lenPtr),
        buildWasmAutobuildRequest(input)
    )
}

export type WasmIncomeItem =
    | { key: string; kind: "buff_add"; name: string; level: number; coverage?: number }
    | { key: string; kind: "buff_remove"; name: string }
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

export async function runWasmIncome(input: WasmIncomeInput): Promise<WasmIncomeResult> {
    const ready = await getSession()
    if (!ready) throw new Error("wasm 不可用")
    return callDobcc<WasmIncomeResult>(
        ready.exports,
        (reqPtr, reqLen, lenPtr) => ready.exports.dobcc_income(ready.session, reqPtr, reqLen, lenPtr),
        JSON.stringify({
            base: { charId: input.charId, settings: input.settings },
            skillInherit: input.skillInherit,
            items: input.items,
        })
    )
}
