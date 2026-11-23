import { beforeEach, describe, expect, it, mock } from "bun:test"

/** 记录被 mock 的对象存储调用。 */
const state = {
    puts: [] as { key: string; data: Uint8Array; contentType?: string }[],
    deletes: [] as string[],
}

mock.module("./object-storage", () => ({
    putObject: async (key: string, data: Uint8Array, contentType?: string) => {
        state.puts.push({ key, data, contentType })
    },
    deleteObject: async (key: string) => {
        state.deletes.push(key)
        return undefined
    },
    getPublicObjectUrl: (key: string) => `https://cdn.test.invalid/${key}`,
}))

const { BUG_ASSET_PRIVATE_PREFIX, BUG_ASSET_PUBLIC_PREFIX, deleteBugAssets, getBugAssetUrl, isSafeBugAssetKey, uploadBugAsset } =
    await import("./bug-asset-storage")

/** 一小段占位字节（内容不重要，存储层不做解码）。 */
const BYTES = new Uint8Array([1, 2, 3])

beforeEach(() => {
    state.puts = []
    state.deletes = []
})

describe("isSafeBugAssetKey", () => {
    it("接受服务端生成口径的 key", () => {
        expect(isSafeBugAssetKey(`${BUG_ASSET_PRIVATE_PREFIX}abc123.png`)).toBe(true)
        expect(isSafeBugAssetKey(`${BUG_ASSET_PUBLIC_PREFIX}abc-123456.webp`)).toBe(true)
    })

    it("拒绝路径穿越、绝对路径与非法字符", () => {
        expect(isSafeBugAssetKey("../secrets/a.png")).toBe(false)
        expect(isSafeBugAssetKey("bug-assets/private/../../a.png")).toBe(false)
        expect(isSafeBugAssetKey(`/${BUG_ASSET_PRIVATE_PREFIX}a.png`)).toBe(false)
        expect(isSafeBugAssetKey("bug-assets/private/ABC.png")).toBe(false)
        expect(isSafeBugAssetKey("bug-assets/private/a b.png")).toBe(false)
        expect(isSafeBugAssetKey("bug-assets/private/a_b.png")).toBe(false)
    })
})

describe("uploadBugAsset", () => {
    it("私有图写入 private 前缀且不返回公开地址", async () => {
        const result = await uploadBugAsset(BYTES, "image/png", false)

        expect(result.objectKey.startsWith(BUG_ASSET_PRIVATE_PREFIX)).toBe(true)
        expect(result.objectKey.endsWith(".png")).toBe(true)
        expect(result.publicUrl).toBeUndefined()
        expect(state.puts).toHaveLength(1)
        expect(state.puts[0]).toMatchObject({ key: result.objectKey, contentType: "image/png" })
    })

    it("公开派生图写入 public 前缀并返回 CDN 地址", async () => {
        const result = await uploadBugAsset(BYTES, "image/webp", true)

        expect(result.objectKey.startsWith(BUG_ASSET_PUBLIC_PREFIX)).toBe(true)
        expect(result.objectKey.endsWith(".webp")).toBe(true)
        expect(result.publicUrl).toBe(`https://cdn.test.invalid/${result.objectKey}`)
    })

    it("文件名由服务端生成且互不相同", async () => {
        const first = await uploadBugAsset(BYTES, "image/jpeg", false)
        const second = await uploadBugAsset(BYTES, "image/jpeg", false)

        expect(first.objectKey.endsWith(".jpg")).toBe(true)
        expect(first.objectKey).not.toBe(second.objectKey)
    })

    it("空内容与不受支持的 MIME 抛错", async () => {
        await expect(uploadBugAsset(new Uint8Array(), "image/png", false)).rejects.toThrow("为空")
        await expect(uploadBugAsset(BYTES, "image/svg+xml", false)).rejects.toThrow("不支持")
    })
})

describe("deleteBugAssets", () => {
    it("只删除 bug-assets 下的安全 key", async () => {
        await deleteBugAssets([
            `${BUG_ASSET_PRIVATE_PREFIX}a.png`,
            `${BUG_ASSET_PUBLIC_PREFIX}b.webp`,
            "../outside.png",
            "/abs/path.png",
            "mods/hash/c.zip",
        ])

        expect(state.deletes).toEqual([`${BUG_ASSET_PRIVATE_PREFIX}a.png`, `${BUG_ASSET_PUBLIC_PREFIX}b.webp`])
    })
})

describe("getBugAssetUrl", () => {
    it("公开前缀返回 CDN 地址", () => {
        expect(getBugAssetUrl(`${BUG_ASSET_PUBLIC_PREFIX}a.webp`)).toBe(`https://cdn.test.invalid/${BUG_ASSET_PUBLIC_PREFIX}a.webp`)
    })

    it("私有前缀与非法 key 返回 null", () => {
        expect(getBugAssetUrl(`${BUG_ASSET_PRIVATE_PREFIX}a.png`)).toBeNull()
        expect(getBugAssetUrl("bug-assets/private/../a.png")).toBeNull()
        expect(getBugAssetUrl("mods/hash/a.png")).toBeNull()
    })
})
