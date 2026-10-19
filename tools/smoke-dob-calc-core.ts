// dob-calc-core 一键 smoke：真实 wasm 上跑 ≥1 夹具端到端并比对 targetValue。
//
// 用法：
//   bun tools/smoke-dob-calc-core.ts <modules.json> <request.json> [expectedTargetValue]
//
// <modules.json>：模块 JSON（7 记录模块 + petTraits，见 ModulesJson）。
// <request.json>：求值请求 JSON（{charId, settings, seed?, timeline?}）。
// [expectedTargetValue]：可选，期望 targetValue；给出则按 §6.3 容差比对，不给只打印。
// wasm 路径：`$DOBCC_WASM` 或默认 `apps/web/public/wasm/dob_calc_core.wasm`。

import { statSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("..", import.meta.url))
const wasmPath = process.env.DOBCC_WASM ?? resolve(root, "apps/web/public/wasm/dob_calc_core.wasm")

const [modulesPath, requestPath, expectedRaw] = process.argv.slice(2)
if (!modulesPath || !requestPath) {
    console.error("用法：bun tools/smoke-dob-calc-core.ts <modules.json> <request.json> [expectedTargetValue]")
    process.exit(2)
}

const wasmBytes = await readFile(wasmPath)
const { instance } = await WebAssembly.instantiate(wasmBytes, {})
const wasm = instance.exports as {
    memory: WebAssembly.Memory
    dobcc_alloc(size: number): number
    dobcc_dealloc(ptr: number, size: number): void
    dobcc_open_session(ptr: number, len: number): bigint | number
    dobcc_evaluate(session: bigint | number, reqPtr: number, reqLen: number, outLenPtr: number): number
    dobcc_close_session(session: bigint | number): void
}

const decoder = new TextDecoder()

function copyIn(bytes: Uint8Array): number {
    const ptr = wasm.dobcc_alloc(bytes.length)
    new Uint8Array(wasm.memory.buffer).set(bytes, ptr)
    return ptr
}

const modulesJson = await readFile(resolve(modulesPath))
const modulesPtr = copyIn(modulesJson)
const session = wasm.dobcc_open_session(modulesPtr, modulesJson.length)
wasm.dobcc_dealloc(modulesPtr, modulesJson.length)
if (!session) {
    console.error("open_session 失败（返回 0）")
    process.exit(1)
}

const requestJson = await readFile(resolve(requestPath))
const reqBytes = new TextEncoder().encode(requestJson.toString())
const reqPtr = copyIn(reqBytes)
const lenPtr = wasm.dobcc_alloc(8)
new Uint8Array(wasm.memory.buffer).fill(0, lenPtr, lenPtr + 8)
const outPtr = wasm.dobcc_evaluate(session, reqPtr, reqBytes.length, lenPtr)
const outLen = new DataView(wasm.memory.buffer).getUint32(lenPtr, true)
const outBytes = new Uint8Array(wasm.memory.buffer).slice(outPtr, outPtr + outLen)
wasm.dobcc_dealloc(reqPtr, reqBytes.length)
wasm.dobcc_dealloc(lenPtr, 8)
if (outPtr) wasm.dobcc_dealloc(outPtr, outLen)
wasm.dobcc_close_session(session)

const envelope = JSON.parse(decoder.decode(outBytes)) as { ok: boolean; result?: { targetValue?: number }; error?: string }
console.log(JSON.stringify(envelope).slice(0, 400))

if (!envelope.ok) {
    console.error(`smoke 失败：${envelope.error}`)
    process.exit(1)
}

if (expectedRaw !== undefined) {
    const expected = Number(expectedRaw)
    const actual = (envelope.result?.targetValue ?? NaN) as number
    const tolerance = Math.abs(expected) < 1e-9 ? 1e-9 : Math.max(Math.abs(expected) * 1e-6, 1e-9)
    if (!(Math.abs(actual - expected) <= tolerance)) {
        console.error(`smoke 失败：targetValue ${actual} 与期望 ${expected} 差值超容差 ${tolerance}`)
        process.exit(1)
    }
}

let sizeText = ""
try {
    const bytes = statSync(wasmPath).size
    sizeText = ` wasm ${(bytes / 1024).toFixed(1)} KiB`
} catch {
    /* 体积行可选 */
}
console.log(`smoke 通过${sizeText}`)
