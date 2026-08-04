import { afterEach, describe, expect, it, vi } from "vitest"
import { hashImgsManifest, mountImgsToVirtualPath } from "../imgs-runtime"

afterEach(() => {
    vi.unstubAllGlobals()
})

describe("hashImgsManifest", () => {
    it("相同清单生成稳定哈希", () => {
        const manifest = [{ path: "char/a.webp" }, { path: "weapon/b.webp", url: "https://example.com/b.webp" }]

        expect(hashImgsManifest(manifest)).toBe(hashImgsManifest(manifest.map(entry => ({ ...entry }))))
    })

    it("清单内容变化时哈希变化", () => {
        expect(hashImgsManifest([{ path: "a.webp" }])).not.toBe(hashImgsManifest([{ path: "b.webp" }]))
    })
})

describe("mountImgsToVirtualPath", () => {
    it("Web 端即使支持 OPFS 也不应下载图片包", async () => {
        const fetchMock = vi.fn()
        vi.stubGlobal("fetch", fetchMock)
        vi.stubGlobal("navigator", { storage: { getDirectory: vi.fn() } })

        await mountImgsToVirtualPath({ manifest: [{ path: "char/a.webp" }] })

        expect(fetchMock).not.toHaveBeenCalled()
    })
})
