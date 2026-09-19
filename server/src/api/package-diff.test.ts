import { afterEach, describe, expect, it } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { apiPlugin } from "../api"
import { packageDiffMaxSize, whenPackageDiffIdle } from "./package-diff"

const temporaryDirs: string[] = []

const PACKAGE_BASE_URL = "https://official.example.com/data-pack/"
const DIFF_BASE_URL = `${PACKAGE_BASE_URL}diff/`

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
 * @param gate 可选闸门，用于把后台任务的网络访问卡住以验证前台不会等待。
 * @returns 测试用 fetch 实现。
 */
function createOfficialFetch(packages: Record<string, string | object>, gate?: Promise<void>) {
    return async (input: string | URL | Request, _init?: RequestInit) => {
        if (gate) await gate
        const packageName = decodeURIComponent(new URL(input.toString()).pathname.split("/").at(-1) || "")
        const content = packages[packageName]
        return content === undefined
            ? new Response(null, { status: 404 })
            : new Response(typeof content === "string" ? content : JSON.stringify(content))
    }
}

/**
 * @description 构造一次差分下载请求。
 * @returns 请求对象。
 */
function diffRequest() {
    return new Request("http://localhost/api/download/diff", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ old: "v1.1.zip", new: "v1.2.zip" }),
        redirect: "manual",
    })
}

afterEach(async () => {
    await whenPackageDiffIdle()
    await Promise.all(temporaryDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

describe("ZIP 差分下载 API", () => {
    it("从未生成过差分时立即回退完整包，不等待生成", async () => {
        const cacheDir = await createCacheDir()
        let createCount = 0
        let releaseGate: () => void = () => {}
        const gate = new Promise<void>(resolve => {
            releaseGate = resolve
        })
        const app = apiPlugin({
            cacheDir,
            dataPackageBaseUrl: PACKAGE_BASE_URL,
            fetch: createOfficialFetch({ "v1.1.zip": "old", "v1.2.zip": "new" }, gate),
            createDiff: async (_oldFile, _newFile, patchFile) => {
                createCount += 1
                await writeFile(patchFile, "patch")
            },
            uploadDiff: async (_patchFile, patchName) => `${DIFF_BASE_URL}${patchName}`,
        })

        const response = await app.handle(diffRequest())

        // 闸门未放开（官方包下载被卡住）也能拿到响应，说明前台确实没有等待网络，也没有等待 hdiffz。
        expect(response.status).toBe(302)
        expect(response.headers.get("X-Download-Mode")).toBe("full")
        expect(response.headers.get("Location")).toBe(`${PACKAGE_BASE_URL}v1.2.zip`)
        expect(response.headers.get("X-Target-Package")).toBe("v1.2.zip")
        expect(createCount).toBe(0)

        // 放开闸门后后台补齐并镜像差分，后续同参数请求即可拿到对象存储直链。
        releaseGate()
        await whenPackageDiffIdle()
        expect(createCount).toBe(1)
    })

    it("差分镜像到 OSS 后 302 到 data-pack/diff/ 下的直链", async () => {
        const cacheDir = await createCacheDir()
        const app = apiPlugin({
            cacheDir,
            dataPackageBaseUrl: PACKAGE_BASE_URL,
            fetch: createOfficialFetch({ "v1.1.zip": "old", "v1.2.zip": "new" }),
            createDiff: async (_oldFile, _newFile, patchFile) => writeFile(patchFile, "patch"),
            uploadDiff: async (_patchFile, patchName) => `${DIFF_BASE_URL}${patchName}`,
        })

        await app.handle(diffRequest())
        await whenPackageDiffIdle()

        const response = await app.handle(diffRequest())

        expect(response.status).toBe(302)
        expect(response.headers.get("X-Download-Mode")).toBe("patch")
        expect(response.headers.get("Location")).toBe(`${DIFF_BASE_URL}v1.1-v1.2.hdiff`)
        expect(response.headers.get("X-Target-Package")).toBe("v1.2.zip")
        expect(response.headers.get("X-Target-SHA256")).toHaveLength(64)
        // 302 语义下不应再回传补丁字节，带宽完全由 CDN 承担。
        expect(await response.text()).toBe("")
    })

    it("镜像失败时回退为服务器本地下发，并在下次请求重试镜像", async () => {
        const cacheDir = await createCacheDir()
        let uploadCount = 0
        const app = apiPlugin({
            cacheDir,
            dataPackageBaseUrl: PACKAGE_BASE_URL,
            fetch: createOfficialFetch({ "v1.1.zip": "old", "v1.2.zip": "new" }),
            createDiff: async (_oldFile, _newFile, patchFile) => writeFile(patchFile, "patch"),
            uploadDiff: async () => {
                uploadCount += 1
                throw new Error("OSS 挂了")
            },
        })

        await app.handle(diffRequest())
        await whenPackageDiffIdle()
        expect(uploadCount).toBe(1)

        const fallback = await app.handle(diffRequest())
        await whenPackageDiffIdle()

        expect(fallback.status).toBe(200)
        expect(fallback.headers.get("X-Download-Mode")).toBe("patch")
        expect(fallback.headers.get("Content-Disposition")).toContain("v1.1-v1.2.hdiff")
        expect(await fallback.text()).toBe("patch")
        // 镜像记录未写入，后续请求会再次尝试镜像。
        expect(uploadCount).toBe(2)
        await expect(stat(join(cacheDir, "patches", "v1.1-v1.2.hdiff.upload.json"))).rejects.toThrow()
    })

    it("历史遗留的本地差分会被补做镜像，之后改走 302", async () => {
        const cacheDir = await createCacheDir()
        const app = apiPlugin({
            cacheDir,
            dataPackageBaseUrl: PACKAGE_BASE_URL,
            fetch: createOfficialFetch({ "v1.1.zip": "old", "v1.2.zip": "new" }),
            createDiff: async (_oldFile, _newFile, patchFile) => writeFile(patchFile, "patch"),
            uploadDiff: async (_patchFile, patchName) => `${DIFF_BASE_URL}${patchName}`,
        })
        const patchDir = join(cacheDir, "patches")
        await mkdir(patchDir, { recursive: true })
        await writeFile(join(patchDir, "v1.1-v1.2.hdiff"), "patch")

        const first = await app.handle(diffRequest())
        expect(first.status).toBe(200)
        expect(await first.text()).toBe("patch")

        await whenPackageDiffIdle()
        const second = await app.handle(diffRequest())

        expect(second.status).toBe(302)
        expect(second.headers.get("Location")).toBe(`${DIFF_BASE_URL}v1.1-v1.2.hdiff`)
    })

    it("差分超过 2 MB 时回退到官方完整包，且不镜像 0 字节占位", async () => {
        const cacheDir = await createCacheDir()
        let createCount = 0
        let uploadCount = 0
        const app = apiPlugin({
            cacheDir,
            dataPackageBaseUrl: PACKAGE_BASE_URL,
            fetch: createOfficialFetch({ "v1.1.zip": "old", "v1.2.zip": "new" }),
            createDiff: async (_oldFile, _newFile, patchFile) => {
                createCount += 1
                await writeFile(patchFile, Buffer.alloc(packageDiffMaxSize + 1))
            },
            uploadDiff: async (_patchFile, patchName) => {
                uploadCount += 1
                return `${DIFF_BASE_URL}${patchName}`
            },
        })

        const response = await app.handle(diffRequest())
        expect(response.status).toBe(302)
        await whenPackageDiffIdle()

        const patchFile = join(cacheDir, "patches", "v1.1-v1.2.hdiff")
        // 过大的差分不再留在磁盘上，只保留 0 字节占位；也不该被镜像到对象存储。
        expect((await stat(patchFile)).size).toBe(0)
        expect(uploadCount).toBe(0)

        // 占位已记录「不可用」结论，再次请求直接回退且不重新生成。
        const repeated = await app.handle(diffRequest())
        expect(repeated.status).toBe(302)
        expect(repeated.headers.get("X-Download-Mode")).toBe("full")
        expect(repeated.headers.get("Location")).toBe(`${PACKAGE_BASE_URL}v1.2.zip`)
        expect(createCount).toBe(1)
    })

    it("同一对新旧包并发请求只生成一次差分", async () => {
        const cacheDir = await createCacheDir()
        let createCount = 0
        let releaseGate: () => void = () => {}
        const gate = new Promise<void>(resolve => {
            releaseGate = resolve
        })
        const app = apiPlugin({
            cacheDir,
            dataPackageBaseUrl: PACKAGE_BASE_URL,
            fetch: createOfficialFetch({ "v1.1.zip": "old", "v1.2.zip": "new" }, gate),
            createDiff: async (_oldFile, _newFile, patchFile) => {
                createCount += 1
                await writeFile(patchFile, "patch")
            },
            uploadDiff: async (_patchFile, patchName) => `${DIFF_BASE_URL}${patchName}`,
        })

        const first = await app.handle(diffRequest())
        const second = await app.handle(diffRequest())
        expect(first.headers.get("X-Download-Mode")).toBe("full")
        expect(second.headers.get("X-Download-Mode")).toBe("full")

        releaseGate()
        await whenPackageDiffIdle()
        expect(createCount).toBe(1)
    })

    it("命中 0 字节占位差分时直接回退完整包且不重新生成", async () => {
        const cacheDir = await createCacheDir()
        let createCount = 0
        const app = apiPlugin({
            cacheDir,
            dataPackageBaseUrl: PACKAGE_BASE_URL,
            fetch: createOfficialFetch({ "v1.1.zip": "old", "v1.2.zip": "new" }),
            createDiff: async (_oldFile, _newFile, patchFile) => {
                createCount += 1
                await writeFile(patchFile, "patch")
            },
            uploadDiff: async (_patchFile, patchName) => `${DIFF_BASE_URL}${patchName}`,
        })
        const placeholderDir = join(cacheDir, "patches")
        await mkdir(placeholderDir, { recursive: true })
        await writeFile(join(placeholderDir, "v1.1-v1.2.hdiff"), "")

        const response = await app.handle(diffRequest())

        expect(response.status).toBe(302)
        expect(response.headers.get("X-Download-Mode")).toBe("full")
        expect(createCount).toBe(0)
        expect((await stat(join(placeholderDir, "v1.1-v1.2.hdiff"))).size).toBe(0)
    })

    it("回收历史遗留的超大差分缓存", async () => {
        const cacheDir = await createCacheDir()
        const app = apiPlugin({
            cacheDir,
            dataPackageBaseUrl: PACKAGE_BASE_URL,
            fetch: createOfficialFetch({ "v1.1.zip": "old", "v1.2.zip": "new" }),
            createDiff: async (_oldFile, _newFile, patchFile) => writeFile(patchFile, "patch"),
        })
        const patchFile = join(cacheDir, "patches", "v1.1-v1.2.hdiff")
        await Bun.write(patchFile, Buffer.alloc(packageDiffMaxSize + 1))

        const response = await app.handle(diffRequest())

        expect(response.status).toBe(302)
        expect(response.headers.get("X-Download-Mode")).toBe("full")
        expect((await stat(patchFile)).size).toBe(0)
    })

    it("拒绝路径穿越与非 ZIP 包名", async () => {
        const cacheDir = await createCacheDir()
        const app = apiPlugin({
            cacheDir,
            dataPackageBaseUrl: PACKAGE_BASE_URL,
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

    it("复用已缓存的差分结果，且只镜像一次", async () => {
        const cacheDir = await createCacheDir()
        let createCount = 0
        let uploadCount = 0
        const app = apiPlugin({
            cacheDir,
            dataPackageBaseUrl: PACKAGE_BASE_URL,
            fetch: createOfficialFetch({ "v1.1.zip": "old", "v1.2.zip": "new" }),
            createDiff: async (_oldFile, _newFile, patchFile) => {
                createCount += 1
                await writeFile(patchFile, "patch")
            },
            uploadDiff: async (_patchFile, patchName) => {
                uploadCount += 1
                return `${DIFF_BASE_URL}${patchName}`
            },
        })

        await app.handle(diffRequest())
        await whenPackageDiffIdle()
        await app.handle(diffRequest())
        await app.handle(diffRequest())

        expect(createCount).toBe(1)
        expect(uploadCount).toBe(1)
        expect(await readFile(join(cacheDir, "features", "v1.1.zip.json"), "utf8")).toContain("sha256")
    })
})
