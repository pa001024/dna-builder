import { describe, expect, it } from "vitest"
import { hashImgsManifest } from "../imgs-runtime"

describe("hashImgsManifest", () => {
    it("相同清单生成稳定哈希", () => {
        const manifest = [{ path: "char/a.webp" }, { path: "weapon/b.webp", url: "https://example.com/b.webp" }]

        expect(hashImgsManifest(manifest)).toBe(hashImgsManifest(manifest.map(entry => ({ ...entry }))))
    })

    it("清单内容变化时哈希变化", () => {
        expect(hashImgsManifest([{ path: "a.webp" }])).not.toBe(hashImgsManifest([{ path: "b.webp" }]))
    })
})
