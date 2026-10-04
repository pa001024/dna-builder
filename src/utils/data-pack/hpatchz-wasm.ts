// hpatchz-wasm：浏览器内应用 HDiffPatch 差分，无需 JS↔Tauri IPC 搬运字节。
//
// 加载由 Rust cdylib 编译的 wasm32 模块（crates/hpatchz-wasm），
// 通过 WebAssembly.instantiate 实例化后，把 old/diff 字节拷入线性内存，
// 调用 apply 得到新文件字节。模块自带内存，不导入任何 JS 函数。

interface HpatchzWasmExports extends WebAssembly.Exports {
    memory: WebAssembly.Memory
    hpatchz_alloc(length: number): number
    hpatchz_dealloc(pointer: number, length: number): void
    hpatchz_new_size_c(pointer: number, length: number): bigint
    hpatchz_apply(oldPtr: number, oldLen: number, diffPtr: number, diffLen: number, outPtr: number, outLen: number): number
}

/**
 * 差分应用结果。
 */
export type HdiffApplyResult = { ok: true; bytes: Uint8Array } | { ok: false; code: number }

let wasmPromise: Promise<HpatchzWasmExports | undefined> | undefined

/**
 * 构造 wasm 模块的 URL。浏览器环境用相对路径；测试环境通过全局注入显式指定。
 * @returns wasm URL，无法确定时返回 null
 */
function resolveWasmUrl(): string | null {
    if (typeof globalThis.location !== "undefined") {
        return new URL("/wasm/hpatchz_wasm.wasm", globalThis.location.origin).toString()
    }
    const explicit = (globalThis as Record<string, unknown>).__HPATCHZ_WASM_URL__ as string | undefined
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
        const reader = (globalThis as Record<string, unknown>).__HPATCHZ_WASM_READER__ as
            | ((url: string) => Promise<ArrayBuffer | null>)
            | undefined
        return reader ? await reader(wasmUrl) : null
    }
    try {
        const response = await fetch(wasmUrl)
        if (!response.ok) return null
        return await response.arrayBuffer()
    } catch (error) {
        console.warn("hpatchz wasm 拉取失败", error)
        return null
    }
}

/**
 * 从 URL 实例化 wasm 模块（不做缓存）。
 * @param wasmUrl 模块地址
 * @returns wasm 导出对象，加载失败时返回 undefined。
 */
async function loadHpatchzWasmAt(wasmUrl: string): Promise<HpatchzWasmExports | undefined> {
    if (typeof WebAssembly === "undefined") return undefined
    const bytes = await fetchWasmBytes(wasmUrl)
    if (!bytes) return undefined
    try {
        const result = await WebAssembly.instantiate(bytes, {})
        return result.instance.exports as HpatchzWasmExports
    } catch (error) {
        console.warn("hpatchz wasm 实例化失败", error)
        return undefined
    }
}

/**
 * 异步加载 hpatchz wasm 模块；未构建 wasm 或无法确定地址时返回 undefined。
 * @param wasmUrl 显式覆盖模块地址（测试用）；显式提供时不走缓存。
 * @returns wasm 导出对象，加载失败时返回 undefined。
 */
async function loadHpatchzWasm(wasmUrl?: string): Promise<HpatchzWasmExports | undefined> {
    if (wasmUrl) {
        return loadHpatchzWasmAt(wasmUrl)
    }
    if (wasmPromise) return wasmPromise

    const resolvedUrl = resolveWasmUrl()
    if (!resolvedUrl) {
        wasmPromise = Promise.resolve(undefined)
        return wasmPromise
    }
    wasmPromise = loadHpatchzWasmAt(resolvedUrl)
    return wasmPromise
}

/**
 * 重置已缓存的 wasm 模块实例（测试用）。
 */
export function resetHpatchzWasmForTest(): void {
    wasmPromise = undefined
}

/**
 * 判断 hpatchz wasm 模块是否可用。
 * @returns 是否可用
 */
export async function isHpatchzWasmAvailable(): Promise<boolean> {
    return Boolean(await loadHpatchzWasm())
}

/**
 * 应用 HDiffPatch 差分，返回新文件字节。
 * @param oldBytes 旧文件字节（数据包当前版本）
 * @param diffBytes 差分文件字节（.hdiff）
 * @param wasmUrl 显式覆盖模块地址（测试用）
 * @returns 应用结果；差分含压缩段或应用失败时返回 { ok: false, code }。
 */
export async function applyHdiff(oldBytes: Uint8Array, diffBytes: Uint8Array, wasmUrl?: string): Promise<HdiffApplyResult> {
    const exports = await loadHpatchzWasm(wasmUrl)
    if (!exports) {
        return { ok: false, code: -100 }
    }

    const memory = exports.memory
    let heap = new Uint8Array(memory.buffer)

    const diffPtr = exports.hpatchz_alloc(diffBytes.length)
    heap = new Uint8Array(memory.buffer)
    heap.set(diffBytes, diffPtr)

    const newSize = Number(exports.hpatchz_new_size_c(diffPtr, diffBytes.length))
    if (newSize === 0 || newSize > 0x7fffffff) {
        exports.hpatchz_dealloc(diffPtr, diffBytes.length)
        return { ok: false, code: 0 }
    }

    const oldPtr = exports.hpatchz_alloc(oldBytes.length)
    heap = new Uint8Array(memory.buffer)
    heap.set(oldBytes, oldPtr)
    const outPtr = exports.hpatchz_alloc(newSize)

    const result = exports.hpatchz_apply(oldPtr, oldBytes.length, diffPtr, diffBytes.length, outPtr, newSize)

    let outBytes: Uint8Array | undefined
    if (result === 1) {
        heap = new Uint8Array(memory.buffer)
        outBytes = heap.slice(outPtr, outPtr + newSize)
    }

    exports.hpatchz_dealloc(diffPtr, diffBytes.length)
    exports.hpatchz_dealloc(oldPtr, oldBytes.length)
    exports.hpatchz_dealloc(outPtr, newSize)

    if (result !== 1 || !outBytes) {
        return { ok: false, code: result }
    }
    return { ok: true, bytes: outBytes }
}
