import { afterEach, describe, expect, it } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { apiPlugin } from "../api"
import { packageDiffMaxSize } from "./package-diff"

const temporaryDirs: string[] = []

/**
 * 创建隔离的差分服务缓存目录。
 * @returns 缓存目录路径。
 */
async function createCacheDir() {
    const cacheDir = await mkdtemp(join(tmpdir(), "package-diff-test-"))
    temporaryDirs.push(cacheDir)
    return cacheDir
}

/**
 * 创建官方源 ZIP 请求的测试 fetch。
 * @param packages 文件名到内容的映射。
 * @returns 测试用 fetch 实现。
 */
function createOfficialFetch(packages: Record<string, string | object>) {
    return async (input: string | URL | Request, _init?: RequestInit) => {
        const packageName = decodeURIComponent(new URL(input.toString()).pathname.split("/").at(-1) || "")
        const content = packages[packageName]
        return content === undefined
            ? new Response(null, { status: 404 })
            : new Response(typeof content === "string" ? content : JSON.stringify(content))
    }
}

afterEach(async () => {
    await Promise.all(temporaryDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

describe("ZIP 差分下载 API", () => {
    it("从官方数据包版本列表解析最新 ZIP", async () => {
        const cacheDir = await createCacheDir()
        const app = apiPlugin({
            cacheDir,
            dataPackageBaseUrl: "https://official.example.com/data-pack/",
            dataVersionsUrl: "https://official.example.com/data-pack/versions.json",
            fetch: createOfficialFetch({
                "versions.json": [{ packageFile: "v1.2.zip" }],
                "v1.1.zip": "old",
                "v1.2.zip": "new",
            }),
            createDiff: async (_oldFile, _newFile, patchFile) => writeFile(patchFile, "patch"),
        })

        const response = await app.handle(new Request("http://localhost/api/download/diff/v1.1.zip"))

        expect(response.status).toBe(200)
        expect(response.headers.get("X-Target-Package")).toBe("v1.2.zip")
    })

    it("从官方更新清单解析最新 MSI", async () => {
        const cacheDir = await createCacheDir()
        const app = apiPlugin({
            cacheDir,
            updateManifestUrl: "https://official.example.com/latest.json",
            updatePackageBaseUrl: "https://official.example.com/releases/",
            fetch: createOfficialFetch({
                "latest.json": { platforms: { "windows-x86_64-msi": { url: "https://official.example.com/releases/v1.2.msi" } } },
                "v1.1.msi": "old",
                "v1.2.msi": "new",
            }),
            createDiff: async (_oldFile, _newFile, patchFile) => writeFile(patchFile, "patch"),
        })

        const response = await app.handle(new Request("http://localhost/api/download/diff/v1.1.msi"))

        expect(response.status).toBe(200)
        expect(response.headers.get("X-Target-Package")).toBe("v1.2.msi")
    })

    it("返回不超过 2 MB 的缓存差分", async () => {
        const cacheDir = await createCacheDir()
        const app = apiPlugin({
            cacheDir,
            officialPackageBaseUrl: "https://official.example.com/packages/",
            latestPackageUrl: "https://official.example.com/packages/v1.2.zip",
            fetch: createOfficialFetch({ "v1.1.zip": "old", "v1.2.zip": "new" }),
            createDiff: async (_oldFile, _newFile, patchFile) => writeFile(patchFile, "patch"),
        })

        const response = await app.handle(new Request("http://localhost/api/download/diff/v1.1.zip"))

        expect(response.status).toBe(200)
        expect(response.headers.get("X-Download-Mode")).toBe("patch")
        expect(response.headers.get("X-Target-Package")).toBe("v1.2.zip")
        expect(response.headers.get("X-Target-SHA256")).toHaveLength(64)
        expect(response.headers.get("Content-Disposition")).toContain("v1.1-v1.2.hdiff")
        expect(await response.text()).toBe("patch")
    })

    it("差分超过 2 MB 时回退到官方完整包", async () => {
        const cacheDir = await createCacheDir()
        const app = apiPlugin({
            cacheDir,
            officialPackageBaseUrl: "https://official.example.com/packages/",
            latestPackageUrl: "https://official.example.com/packages/v1.2.zip",
            fetch: createOfficialFetch({ "v1.1.zip": "old", "v1.2.zip": "new" }),
            createDiff: async (_oldFile, _newFile, patchFile) => writeFile(patchFile, Buffer.alloc(packageDiffMaxSize + 1)),
        })

        const response = await app.handle(new Request("http://localhost/api/download/diff/v1.1.zip", { redirect: "manual" }))

        expect(response.status).toBe(302)
        expect(response.headers.get("X-Download-Mode")).toBe("full")
        expect(response.headers.get("Location")).toBe("https://official.example.com/packages/v1.2.zip")
    })

    it("拒绝路径穿越与非 ZIP 包名", async () => {
        const cacheDir = await createCacheDir()
        const app = apiPlugin({
            cacheDir,
            officialPackageBaseUrl: "https://official.example.com/packages/",
            latestPackageUrl: "https://official.example.com/packages/v1.2.zip",
            fetch: createOfficialFetch({}),
        })

        const response = await app.handle(new Request("http://localhost/api/download/diff/..%2Fsecret.txt"))

        expect(response.status).toBe(400)
        expect((await response.json()).error).toBe("包名必须是 ZIP 或 MSI 文件名")
    })

    it("接受含空格的官方 MSI 包名", async () => {
        const cacheDir = await createCacheDir()
        const app = apiPlugin({
            cacheDir,
            updateManifestUrl: "https://official.example.com/latest.json",
            updatePackageBaseUrl: "https://official.example.com/releases/",
            fetch: createOfficialFetch({
                "latest.json": {
                    platforms: { "windows-x86_64-msi": { url: "https://official.example.com/releases/DNA Builder_1.1.3_x64_zh-CN.msi" } },
                },
                "DNA Builder_1.1.2_x64_zh-CN.msi": "old",
                "DNA Builder_1.1.3_x64_zh-CN.msi": "new",
            }),
            createDiff: async (_oldFile, _newFile, patchFile) => writeFile(patchFile, "patch"),
        })

        const response = await app.handle(
            new Request("http://localhost/api/download/diff/DNA%20Builder_1.1.2_x64_zh-CN.msi", { redirect: "manual" })
        )

        expect(response.status).toBe(200)
        expect(response.headers.get("X-Download-Mode")).toBe("patch")
        expect(response.headers.get("X-Target-Package")).toBe("DNA Builder_1.1.3_x64_zh-CN.msi")
        expect(await response.text()).toBe("patch")
    })

    it("复用已缓存的差分结果", async () => {
        const cacheDir = await createCacheDir()
        let createCount = 0
        const app = apiPlugin({
            cacheDir,
            officialPackageBaseUrl: "https://official.example.com/packages/",
            latestPackageUrl: "https://official.example.com/packages/v1.2.zip",
            fetch: createOfficialFetch({ "v1.1.zip": "old", "v1.2.zip": "new" }),
            createDiff: async (_oldFile, _newFile, patchFile) => {
                createCount += 1
                await writeFile(patchFile, "patch")
            },
        })

        await app.handle(new Request("http://localhost/api/download/diff/v1.1.zip"))
        await app.handle(new Request("http://localhost/api/download/diff/v1.1.zip"))

        expect(createCount).toBe(1)
        expect(await readFile(join(cacheDir, "features", "v1.1.zip.json"), "utf8")).toContain("sha256")
    })
})
