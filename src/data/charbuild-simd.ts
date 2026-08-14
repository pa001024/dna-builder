/** CharBuild SIMD Wasm 导出接口。 */
interface CharBuildSimdWasmExports extends WebAssembly.Exports {
    memory: WebAssembly.Memory
    charbuild_alloc(length: number): number
    charbuild_dealloc(pointer: number, length: number): void
    charbuild_sum_f64(input: number, output: number, sourceCount: number, attributeCount: number): void
}

interface CharBuildSimdBuffers {
    inputPtr: number
    inputCapacity: number
    outputPtr: number
    outputCapacity: number
}

let wasmPromise: Promise<CharBuildSimdWasmExports | undefined> | undefined
let wasmExports: CharBuildSimdWasmExports | undefined
let buffers: CharBuildSimdBuffers | undefined

/**
 * 获取 SIMD Wasm 文件地址。
 * @returns 浏览器可加载的 URL；非浏览器测试环境未注入地址时返回 null。
 */
function resolveWasmUrl(): string | null {
    if (typeof globalThis.location !== "undefined") {
        return new URL("/wasm/charbuild_simd_wasm.wasm", globalThis.location.origin).toString()
    }
    return ((globalThis as Record<string, unknown>).__CHARBUILD_SIMD_WASM_URL__ as string | undefined) ?? null
}

/**
 * 读取 Wasm 二进制；Node 测试通过全局读取器支持 file URL。
 * @param wasmUrl Wasm 文件地址
 * @returns 模块二进制，读取失败时返回 null。
 */
async function fetchWasmBytes(wasmUrl: string): Promise<ArrayBuffer | null> {
    if (wasmUrl.startsWith("file://")) {
        const reader = (globalThis as Record<string, unknown>).__CHARBUILD_SIMD_WASM_READER__ as
            | ((url: string) => Promise<ArrayBuffer | null>)
            | undefined
        return reader ? await reader(wasmUrl) : null
    }
    try {
        const response = await fetch(wasmUrl)
        return response.ok ? await response.arrayBuffer() : null
    } catch {
        return null
    }
}

/**
 * 加载一次 SIMD Wasm 模块；浏览器不支持 SIMD 时保留 JavaScript 回退路径。
 * @param wasmUrl 可选的显式模块地址，供测试和基准使用
 * @returns 已加载的导出对象，不可用时返回 undefined。
 */
export async function initializeCharBuildSimd(wasmUrl?: string): Promise<CharBuildSimdWasmExports | undefined> {
    if (wasmUrl) {
        const bytes = await fetchWasmBytes(wasmUrl)
        if (!bytes || typeof WebAssembly === "undefined") return undefined
        try {
            wasmExports = (await WebAssembly.instantiate(bytes, {})).instance.exports as CharBuildSimdWasmExports
            return wasmExports
        } catch {
            return undefined
        }
    }
    if (wasmPromise) return wasmPromise

    wasmPromise = (async () => {
        const resolvedUrl = resolveWasmUrl()
        if (!resolvedUrl || typeof WebAssembly === "undefined") return undefined
        const bytes = await fetchWasmBytes(resolvedUrl)
        if (!bytes) return undefined
        try {
            wasmExports = (await WebAssembly.instantiate(bytes, {})).instance.exports as CharBuildSimdWasmExports
            return wasmExports
        } catch {
            return undefined
        }
    })()
    return wasmPromise
}

/**
 * 确保复用的 Wasm 线性内存缓冲能够容纳本次矩阵输入和列结果。
 * @param inputLength 输入 f64 数量
 * @param outputLength 输出 f64 数量
 * @returns 当前可用的缓冲；Wasm 不可用或分配失败时返回 undefined。
 */
function ensureBuffers(inputLength: number, outputLength: number): CharBuildSimdBuffers | undefined {
    if (!wasmExports) return undefined
    const inputBytes = inputLength * Float64Array.BYTES_PER_ELEMENT
    const outputBytes = outputLength * Float64Array.BYTES_PER_ELEMENT
    if (!buffers || buffers.inputCapacity < inputBytes || buffers.outputCapacity < outputBytes) {
        if (buffers) {
            wasmExports.charbuild_dealloc(buffers.inputPtr, buffers.inputCapacity)
            wasmExports.charbuild_dealloc(buffers.outputPtr, buffers.outputCapacity)
        }
        const inputPtr = wasmExports.charbuild_alloc(inputBytes)
        const outputPtr = wasmExports.charbuild_alloc(outputBytes)
        if (!inputPtr || !outputPtr) return undefined
        buffers = { inputPtr, inputCapacity: inputBytes, outputPtr, outputCapacity: outputBytes }
    }
    return buffers
}

/**
 * 用 Wasm SIMD 对按行存储的属性贡献矩阵执行列求和。
 * @param contributions 连续的“来源 x 属性”双精度矩阵
 * @param sourceCount 贡献来源数量
 * @param attributeCount 每个来源的属性数量
 * @returns 汇总后的属性向量；Wasm 尚未就绪时返回 undefined。
 */
export function sumCharBuildBonusContributions(
    contributions: Float64Array,
    sourceCount: number,
    attributeCount: number
): Float64Array | undefined {
    if (!wasmExports || contributions.length !== sourceCount * attributeCount) return undefined
    const currentBuffers = ensureBuffers(contributions.length, attributeCount)
    if (!currentBuffers || !wasmExports) return undefined

    new Float64Array(wasmExports.memory.buffer, currentBuffers.inputPtr, contributions.length).set(contributions)
    wasmExports.charbuild_sum_f64(currentBuffers.inputPtr, currentBuffers.outputPtr, sourceCount, attributeCount)
    return new Float64Array(wasmExports.memory.buffer, currentBuffers.outputPtr, attributeCount).slice()
}

/** 重置测试或基准中的 Wasm 状态。 */
export function resetCharBuildSimdForTest(): void {
    wasmPromise = undefined
    wasmExports = undefined
    buffers = undefined
}

// 浏览器启动后异步预热，不阻塞现有同步计算接口。
void initializeCharBuildSimd()
