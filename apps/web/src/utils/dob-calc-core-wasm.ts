// dob-calc-core-wasm：浏览器内运行 CharBuild 计算（Rust 端口编译的 wasm32 模块）。
//
// 加载 crates/dob-calc-core 编译的 cdylib，通过 WebAssembly.instantiate 实例化后，
// 把模块 JSON / 求值请求 JSON 拷入线性内存，调用 open_session → evaluate → close_session。
// 模块自带内存，不导入任何 JS 函数。evaluate 恒返回合法 JSON 信封。

interface DobccWasmExports extends WebAssembly.Exports {
    memory: WebAssembly.Memory
    dobcc_alloc(size: number): number
    dobcc_dealloc(pointer: number, size: number): void
    dobcc_open_session(tablesPtr: number, tablesLen: number): bigint
    dobcc_evaluate(session: bigint, reqPtr: number, reqLen: number, outLenPtr: number): number
    dobcc_close_session(session: bigint): void
    dobcc_calc_open(session: bigint): bigint
    dobcc_calc_evaluate(calc: bigint, reqPtr: number, reqLen: number, outLenPtr: number): number
    dobcc_calc_close(calc: bigint): void
    dobcc_autobuild(session: bigint, reqPtr: number, reqLen: number, outLenPtr: number): number
}

/**
 * 求值结果信封。
 */
export type DobccEvaluateResult = { ok: true; result: unknown } | { ok: false; error: string }

let wasmPromise: Promise<DobccWasmExports | undefined> | undefined

/**
 * 构造 wasm 模块的 URL。浏览器环境用相对路径；测试环境通过全局注入显式指定。
 * @returns wasm URL，无法确定时返回 null
 */
function resolveWasmUrl(): string | null {
    if (typeof globalThis.location !== "undefined") {
        return new URL("/wasm/dob_calc_core.wasm", globalThis.location.origin).toString()
    }
    const explicit = (globalThis as Record<string, unknown>).__DOBCC_WASM_URL__ as string | undefined
    return explicit ?? null
}

/**
 * 从 URL 拉取 wasm 字节。浏览器走 fetch；Node 测试环境 fetch 不支持 file://，
 * 因此 URL 为 file:// 时用全局注入的读取器（由测试注册）。
 * @param wasmUrl 模块地址
 * @returns wasm 字节，加载失败时返回 null
 */
async function fetchWasmBytes(wasmUrl: string): Promise<ArrayBuffer | null> {
    if (wasmUrl.startsWith("file://")) {
        const reader = (globalThis as Record<string, unknown>).__DOBCC_WASM_READER__ as
            | ((url: string) => Promise<ArrayBuffer | null>)
            | undefined
        return reader ? await reader(wasmUrl) : null
    }
    try {
        const response = await fetch(wasmUrl)
        if (!response.ok) return null
        return await response.arrayBuffer()
    } catch (error) {
        console.warn("dob-calc-core wasm 拉取失败", error)
        return null
    }
}

/**
 * 从 URL 实例化 wasm 模块（不做缓存）。
 * @param wasmUrl 模块地址
 * @returns wasm 导出对象，加载失败时返回 undefined。
 */
async function loadDobccWasmAt(wasmUrl: string): Promise<DobccWasmExports | undefined> {
    if (typeof WebAssembly === "undefined") return undefined
    const bytes = await fetchWasmBytes(wasmUrl)
    if (!bytes) return undefined
    try {
        const result = await WebAssembly.instantiate(bytes, {})
        return result.instance.exports as DobccWasmExports
    } catch (error) {
        console.warn("dob-calc-core wasm 实例化失败", error)
        return undefined
    }
}

/**
 * 异步加载 dob-calc-core wasm 模块；未构建 wasm 或无法确定地址时返回 undefined。
 * @param wasmUrl 显式覆盖模块地址（测试用）；显式提供时不走缓存。
 * @returns wasm 导出对象，加载失败时返回 undefined。
 */
async function loadDobccWasm(wasmUrl?: string): Promise<DobccWasmExports | undefined> {
    if (wasmUrl) {
        return loadDobccWasmAt(wasmUrl)
    }
    if (wasmPromise) return wasmPromise

    const resolvedUrl = resolveWasmUrl()
    if (!resolvedUrl) {
        wasmPromise = Promise.resolve(undefined)
        return wasmPromise
    }
    wasmPromise = loadDobccWasmAt(resolvedUrl)
    return wasmPromise
}

/**
 * 重置已缓存的 wasm 模块实例（测试用）。
 */
export function resetDobccWasmForTest(): void {
    wasmPromise = undefined
}

/**
 * 判断 dob-calc-core wasm 模块是否可用。
 * @returns 是否可用
 */
export async function isDobccWasmAvailable(): Promise<boolean> {
    return Boolean(await loadDobccWasm())
}

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

/**
 * 把字节拷入 wasm 线性内存（alloc→set），返回指针；调用方负责 dealloc。
 */
function copyIntoWasm(exports: DobccWasmExports, bytes: Uint8Array): number {
    let heap = new Uint8Array(exports.memory.buffer)
    const ptr = exports.dobcc_alloc(bytes.length)
    heap = new Uint8Array(exports.memory.buffer)
    heap.set(bytes, ptr)
    return ptr
}

/**
 * 从 wasm 线性内存切片读出字节并 dealloc。
 */
function takeFromWasm(exports: DobccWasmExports, ptr: number, len: number): Uint8Array {
    const heap = new Uint8Array(exports.memory.buffer)
    const out = heap.slice(ptr, ptr + len)
    exports.dobcc_dealloc(ptr, len)
    return out
}

/**
 * 建表会话：在 wasm 侧建好索引，返回会话句柄；失败返回 0。
 * @param modulesJson 模块 JSON（7 记录模块 + petTraits，见 Rust ModulesJson）
 * @param wasmUrl 显式覆盖模块地址（测试用）
 */
export async function openDobccSession(modulesJson: string, wasmUrl?: string): Promise<{ exports?: DobccWasmExports; session: bigint }> {
    const exports = await loadDobccWasm(wasmUrl)
    if (!exports) return { session: 0n }
    const bytes = textEncoder.encode(modulesJson)
    const ptr = copyIntoWasm(exports, bytes)
    const session = exports.dobcc_open_session(ptr, bytes.length)
    exports.dobcc_dealloc(ptr, bytes.length)
    return { exports, session }
}

/**
 * 在会话里求值一份构筑请求，返回结果信封。
 * @param session openDobccSession 返回的句柄
 * @param request 求值请求 JSON（{charId, settings, seed?, timeline?}）
 * @param wasmUrl 显式覆盖模块地址（测试用，未传 exports 时用）
 * @param exports 已加载的导出对象（复用会话的实例，避免重复实例化）
 */
export async function evaluateDobcc(
    session: bigint,
    request: string,
    wasmUrl?: string,
    exports?: DobccWasmExports
): Promise<DobccEvaluateResult> {
    const wasm = exports ?? (await loadDobccWasm(wasmUrl))
    if (!wasm) return { ok: false, error: "dob-calc-core wasm 不可用" }
    const reqBytes = textEncoder.encode(request)
    const reqPtr = copyIntoWasm(wasm, reqBytes)
    // out_len 走 wasm 内存传回：分配 8 字节（u64），小端读 i32 两字中的低字即可（长度 < 2^32）。
    let heap = new Uint8Array(wasm.memory.buffer)
    const lenPtr = wasm.dobcc_alloc(8)
    heap = new Uint8Array(wasm.memory.buffer)
    heap.fill(0, lenPtr, lenPtr + 8)
    const outPtr = wasm.dobcc_evaluate(session, reqPtr, reqBytes.length, lenPtr)
    heap = new Uint8Array(wasm.memory.buffer)
    const view = new DataView(wasm.memory.buffer)
    const outLen = view.getUint32(lenPtr, true)
    const outBytes = outPtr ? takeFromWasm(wasm, outPtr, outLen) : new Uint8Array()
    wasm.dobcc_dealloc(reqPtr, reqBytes.length)
    wasm.dobcc_dealloc(lenPtr, 8)
    try {
        const envelope = JSON.parse(textDecoder.decode(outBytes)) as DobccEvaluateResult
        return envelope
    } catch (error) {
        console.warn("dob-calc-core 结果解析失败", error)
        return { ok: false, error: "结果解析失败" }
    }
}

/**
 * 关闭会话并释放其表；重复关闭安全。
 */
export async function closeDobccSession(session: bigint, wasmUrl?: string, exports?: DobccWasmExports): Promise<void> {
    const wasm = exports ?? (await loadDobccWasm(wasmUrl))
    if (!wasm || !session) return
    wasm.dobcc_close_session(session)
}
/**
 * 在计算会话里求值（同构筑复用装配，只差目标函数时约十微秒级）。
 * 会话句柄由 `exports.dobcc_calc_open(session)` 获取、`exports.dobcc_calc_close(calc)` 释放。
 * @param calc 计算句柄
 * @param request 求值请求 JSON
 * @param exports 已加载的导出对象
 */
export function evaluateDobccCalc(calc: bigint, request: string, exports: DobccWasmExports): DobccEvaluateResult {
    return callDobcc(exports, exports.dobcc_calc_evaluate.bind(exports, calc), request)
}

export function runDobccAutobuild(session: bigint, request: string, exports: DobccWasmExports): DobccEvaluateResult {
    return callDobcc(exports, exports.dobcc_autobuild.bind(exports, session), request)
}

function callDobcc(
    exports: DobccWasmExports,
    invoke: (reqPtr: number, reqLen: number, lenPtr: number) => number,
    request: string
): DobccEvaluateResult {
    const reqBytes = textEncoder.encode(request)
    const reqPtr = copyIntoWasm(exports, reqBytes)
    const lenPtr = exports.dobcc_alloc(8)
    new Uint8Array(exports.memory.buffer).fill(0, lenPtr, lenPtr + 8)
    const outPtr = invoke(reqPtr, reqBytes.length, lenPtr)
    const view = new DataView(exports.memory.buffer)
    const outLen = view.getUint32(lenPtr, true)
    const outBytes = outPtr ? takeFromWasm(exports, outPtr, outLen) : new Uint8Array()
    exports.dobcc_dealloc(reqPtr, reqBytes.length)
    exports.dobcc_dealloc(lenPtr, 8)
    try {
        return JSON.parse(textDecoder.decode(outBytes)) as DobccEvaluateResult
    } catch (error) {
        console.warn("dob-calc-core 结果解析失败", error)
        return { ok: false, error: "结果解析失败" }
    }
}
