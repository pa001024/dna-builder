import { afterEach, describe, expect, it } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
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
    it("按指定 old/new 生成 ZIP 差分", async () => {
        const cacheDir = await createCacheDir()
        const app = apiPlugin({
            cacheDir,
            dataPackageBaseUrl: "https://official.example.com/data-pack/",
            fetch: createOfficialFetch({
                "v1.1.zip": "old",
                "v1.2.zip": "new",
            }),
            createDiff: async (_oldFile, _newFile, patchFile) => writeFile(patchFile, "patch"),
        })

        const response = await app.handle(
            new Request("http://localhost/api/download/diff", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ old: "v1.1.zip", new: "v1.2.zip" }),
            })
        )

        expect(response.status).toBe(200)
        expect(response.headers.get("X-Target-Package")).toBe("v1.2.zip")
    })

    it("返回不超过 2 MB 的缓存差分", async () => {
        const cacheDir = await createCacheDir()
        const app = apiPlugin({
            cacheDir,
            dataPackageBaseUrl: "https://official.example.com/packages/",
            fetch: createOfficialFetch({
                "v1.1.zip": "old",
                "v1.2.zip": "new",
            }),
            createDiff: async (_oldFile, _newFile, patchFile) => writeFile(patchFile, "patch"),
        })

        const response = await app.handle(
            new Request("http://localhost/api/download/diff", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ old: "v1.1.zip", new: "v1.2.zip" }),
            })
        )

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
            dataPackageBaseUrl: "https://official.example.com/packages/",
            fetch: createOfficialFetch({
                "v1.1.zip": "old",
                "v1.2.zip": "new",
            }),
            createDiff: async (_oldFile, _newFile, patchFile) => writeFile(patchFile, Buffer.alloc(packageDiffMaxSize + 1)),
        })

        const response = await app.handle(
            new Request("http://localhost/api/download/diff", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ old: "v1.1.zip", new: "v1.2.zip" }),
                redirect: "manual",
            })
        )

        expect(response.status).toBe(302)
        expect(response.headers.get("X-Download-Mode")).toBe("full")
        expect(response.headers.get("Location")).toBe("https://official.example.com/packages/v1.2.zip")
        // 过大的差分不再留在磁盘上，只保留 0 字节占位。
        expect((await stat(join(cacheDir, "patches", "v1.1-v1.2.hdiff"))).size).toBe(0)
    })

    it("命中 0 字节占位差分时直接回退完整包且不重新生成", async () => {
        const cacheDir = await createCacheDir()
        let createCount = 0
        const app = apiPlugin({
            cacheDir,
            dataPackageBaseUrl: "https://official.example.com/packages/",
            fetch: createOfficialFetch({
                "v1.1.zip": "old",
                "v1.2.zip": "new",
            }),
            createDiff: async (_oldFile, _newFile, patchFile) => {
                createCount += 1
                await writeFile(patchFile, "patch")
            },
        })
        const placeholderDir = join(cacheDir, "patches")
        await mkdir(placeholderDir, { recursive: true })
        await writeFile(join(placeholderDir, "v1.1-v1.2.hdiff"), "")

        const response = await app.handle(
            new Request("http://localhost/api/download/diff", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ old: "v1.1.zip", new: "v1.2.zip" }),
                redirect: "manual",
            })
        )

        expect(response.status).toBe(302)
        expect(response.headers.get("X-Download-Mode")).toBe("full")
        expect(createCount).toBe(0)
        expect((await stat(join(placeholderDir, "v1.1-v1.2.hdiff"))).size).toBe(0)
    })

    it("回收历史遗留的超大差分缓存", async () => {
        const cacheDir = await createCacheDir()
        const app = apiPlugin({
            cacheDir,
            dataPackageBaseUrl: "https://official.example.com/packages/",
            fetch: createOfficialFetch({
                "v1.1.zip": "old",
                "v1.2.zip": "new",
            }),
            createDiff: async (_oldFile, _newFile, patchFile) => writeFile(patchFile, "patch"),
        })
        const patchFile = join(cacheDir, "patches", "v1.1-v1.2.hdiff")
        await Bun.write(patchFile, Buffer.alloc(packageDiffMaxSize + 1))

        const response = await app.handle(
            new Request("http://localhost/api/download/diff", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ old: "v1.1.zip", new: "v1.2.zip" }),
                redirect: "manual",
            })
        )

        expect(response.status).toBe(302)
        expect(response.headers.get("X-Download-Mode")).toBe("full")
        expect((await stat(patchFile)).size).toBe(0)
    })

    it("拒绝路径穿越与非 ZIP 包名", async () => {
        const cacheDir = await createCacheDir()
        const app = apiPlugin({
            cacheDir,
            dataPackageBaseUrl: "https://official.example.com/packages/",
            fetch: createOfficialFetch({}),
        })

        const response = await app.handle(
            new Request("http://localhost/api/download/diff", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ old: "..%2Fsecret.txt", new: "v1.2.zip" }),
            })
        )

        expect(response.status).toBe(400)
        expect((await response.json()).error).toBe("包名必须是 ZIP 文件名")
    })

    it("复用已缓存的差分结果", async () => {
        const cacheDir = await createCacheDir()
        let createCount = 0
        const app = apiPlugin({
            cacheDir,
            dataPackageBaseUrl: "https://official.example.com/packages/",
            fetch: createOfficialFetch({
                "v1.1.zip": "old",
                "v1.2.zip": "new",
            }),
            createDiff: async (_oldFile, _newFile, patchFile) => {
                createCount += 1
                await writeFile(patchFile, "patch")
            },
        })

        const diffRequest = () =>
            new Request("http://localhost/api/download/diff", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ old: "v1.1.zip", new: "v1.2.zip" }),
            })
        await app.handle(diffRequest())
        await app.handle(diffRequest())

        expect(createCount).toBe(1)
        expect(await readFile(join(cacheDir, "features", "v1.1.zip.json"), "utf8")).toContain("sha256")
    })
})
