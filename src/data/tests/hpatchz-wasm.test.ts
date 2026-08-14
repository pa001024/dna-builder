import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { beforeAll, describe, expect, it } from "vitest"
import { applyHdiff } from "../hpatchz-wasm"

const fixturesDir = resolve(fileURLToPath(import.meta.url), "../fixtures")

// 测试环境不是浏览器，Node 的 fetch 不支持 file://。注册一个读取器让加载器读取
// 仓库内的 wasm 构建产物，再通过显式 wasmUrl 指向它。
const wasmUrl = new URL("../../../public/wasm/hpatchz_wasm.wasm", import.meta.url).toString()
const g = globalThis as Record<string, unknown>
g.__HPATCHZ_WASM_READER__ = async (url: string) => {
    try {
        const bytes = await readFile(fileURLToPath(url))
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    } catch {
        return null
    }
}

describe("hpatchz wasm 差分应用", () => {
    beforeAll(async () => {
        // 显式 URL 探测模块可用性（默认路径在 Node 下无法解析）。
        const probe = await applyHdiff(new Uint8Array(0), new Uint8Array([1]), wasmUrl)
        if (probe.ok === false && probe.code === -100) {
            console.warn("hpatchz wasm 未构建，跳过差分应用测试")
        }
    })

    it("应该逐字节还原 hdiff 目标文件", async () => {
        const [oldBytes, diffBytes, expected] = await Promise.all([
            readFile(resolve(fixturesDir, "hdiff-old.bin")),
            readFile(resolve(fixturesDir, "hdiff-patch.hdiff")),
            readFile(resolve(fixturesDir, "hdiff-new.bin")),
        ])
        const applied = await applyHdiff(new Uint8Array(oldBytes), new Uint8Array(diffBytes), wasmUrl)
        expect(applied.ok).toBe(true)
        if (applied.ok) {
            expect(new Uint8Array(applied.bytes)).toEqual(new Uint8Array(expected))
        }
    })

    it("差分含压缩段或应用失败时返回 ok=false", async () => {
        const [oldBytes] = await Promise.all([readFile(resolve(fixturesDir, "hdiff-old.bin"))])
        // 构造无意义的差分字节，应用应失败而非崩溃。
        const bogus = new Uint8Array([1, 2, 3, 4, 5])
        const applied = await applyHdiff(new Uint8Array(oldBytes), bogus, wasmUrl)
        expect(applied.ok).toBe(false)
    })
})
