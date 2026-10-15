import { describe, expect, it } from "bun:test"
import { createHash } from "node:crypto"
import { isQuarkConfigured, QuarkClient, readQuarkConfig, resolveDirFid, signQuarkRequest } from "./quark"

/** 构造 JSON 包络响应的最小 mock fetch。 */
function mockFetch(
    routes: Array<{ match: (url: string, init: any) => boolean; json: unknown; headers?: Record<string, string>; status?: number }>
) {
    return (async (url: string, init: any) => {
        const route = routes.find(entry => entry.match(String(url), init))
        if (!route) {
            throw new Error(`未 mock 的请求：${url}`)
        }
        return {
            ok: (route.status ?? 200) >= 200 && (route.status ?? 200) < 300,
            status: route.status ?? 200,
            headers: new Headers(route.headers ?? {}),
            json: async () => route.json,
        }
    }) as unknown as typeof fetch
}

describe("signQuarkRequest", () => {
    it("签名算法与文档一致：SHA256_hex(METHOD&PATH&TM&SIGN_KEY)", () => {
        const expected = createHash("sha256")
            .update("POST&/open/v1/file/upload_pre&1700000000000&cf134812e2de4032bd1cb7c3727e84b3")
            .digest("hex")
        expect(signQuarkRequest("POST", "/open/v1/file/upload_pre", "1700000000000", "cf134812e2de4032bd1cb7c3727e84b3")).toBe(expected)
        expect(expected).toMatch(/^[0-9a-f]{64}$/)
    })

    it("时间戳变化时签名变化", () => {
        const key = "cf134812e2de4032bd1cb7c3727e84b3"
        expect(signQuarkRequest("POST", "/open/v1/file/upload_pre", "1", key)).not.toBe(
            signQuarkRequest("POST", "/open/v1/file/upload_pre", "2", key)
        )
    })
})

describe("readQuarkConfig / isQuarkConfigured", () => {
    it("access_token 为空时视为未配置", () => {
        expect(isQuarkConfigured({} as NodeJS.ProcessEnv)).toBe(false)
        expect(isQuarkConfigured({ QUARK_ACCESS_TOKEN: "token" } as NodeJS.ProcessEnv)).toBe(true)
    })

    it("client 与签名密钥有 wild 默认值", () => {
        const config = readQuarkConfig({} as NodeJS.ProcessEnv)
        expect(config.clientId).toBe("third_party_agent")
        expect(config.signKey).toBe("cf134812e2de4032bd1cb7c3727e84b3")
        expect(config.deviceId).toBe("wild_claw")
    })
})

describe("QuarkClient.request", () => {
    it("成功包络直接返回 data", async () => {
        const fetchFn = mockFetch([
            {
                match: url => url.includes("/open/v1/user/info"),
                json: { status: 0, errno: 0, error_info: "", data: { user_id: "u1", nickname: "nick" } },
            },
        ])
        const client = new QuarkClient(
            { clientId: "c", signKey: "k", deviceId: "d", deviceName: "n", accessToken: "t", refreshToken: "" },
            fetchFn
        )
        await expect(client.getUserInfo()).resolves.toEqual({ user_id: "u1", nickname: "nick" })
    })

    it("token 失效时刷新一次后重试", async () => {
        let rotateCalled = 0
        const fetchFn = mockFetch([
            {
                match: url => url.includes("/access_token/rotate"),
                json: {
                    status: 0,
                    errno: 0,
                    error_info: "",
                    data: { access_token: "new-token", refresh_token: "new-refresh", device_id: "d" },
                },
            },
            {
                match: url => url.includes("/open/v1/user/info"),
                json: { status: 0, errno: 0, error_info: "", data: { user_id: "u1", nickname: "nick" } },
            },
        ])
        const countingFetch = (async (url: string, init: any) => {
            if (String(url).includes("/access_token/rotate")) {
                rotateCalled++
            }
            if (String(url).includes("/open/v1/user/info") && rotateCalled === 0) {
                return {
                    ok: true,
                    status: 200,
                    headers: new Headers(),
                    json: async () => ({ status: 11001, errno: 11001, error_info: "Access Token无效" }),
                }
            }
            return fetchFn(url, init)
        }) as unknown as typeof fetch
        const client = new QuarkClient(
            { clientId: "c", signKey: "k", deviceId: "d", deviceName: "n", accessToken: "old", refreshToken: "r" },
            countingFetch
        )
        await expect(client.getUserInfo()).resolves.toEqual({ user_id: "u1", nickname: "nick" })
        expect(rotateCalled).toBe(1)
    })

    it("业务失败时抛错并携带 errno", async () => {
        const fetchFn = mockFetch([
            {
                match: () => true,
                json: { status: 1, errno: 32003, error_info: "网盘空间已满" },
            },
        ])
        const client = new QuarkClient(
            { clientId: "c", signKey: "k", deviceId: "d", deviceName: "n", accessToken: "t", refreshToken: "" },
            fetchFn
        )
        await expect(client.getUserInfo()).rejects.toThrow("32003")
    })
})

describe("QuarkClient 目录与分享接口", () => {
    function vaultClient(fetchFn: typeof fetch): QuarkClient {
        return new QuarkClient({ clientId: "c", signKey: "k", deviceId: "d", deviceName: "n", accessToken: "t", refreshToken: "" }, fetchFn)
    }

    it("createDir 返回目录 fid", async () => {
        const fetchFn = mockFetch([
            {
                match: url => url.includes("/open/v1/dir"),
                json: { status: 0, errno: 0, error_info: "", data: { fid: "dir-1", full_path: "夸克网盘/dna-builder" } },
            },
        ])
        await expect(vaultClient(fetchFn).createDir("dna-builder")).resolves.toEqual({
            fid: "dir-1",
            full_path: "夸克网盘/dna-builder",
        })
    })

    it("getShareDetail 返回分享文件列表", async () => {
        const fetchFn = mockFetch([
            {
                match: url => url.includes("/open/v1/share/detail"),
                json: {
                    status: 0,
                    errno: 0,
                    error_info: "",
                    data: {
                        token_info: { title: "t", stoken: "s" },
                        list: [{ fid: "f1", filename: "a.zip", size: 10, file_type: 1, share_fid_token: "tok" }],
                    },
                },
            },
        ])
        const detail = await vaultClient(fetchFn).getShareDetail("abc123")
        expect(detail.list).toHaveLength(1)
        expect(detail.list[0].filename).toBe("a.zip")
    })

    it("getFileInfo 走 GET 并透传 fid 查询参数", async () => {
        const seen: string[] = []
        const fetchFn = (async (url: string) => {
            seen.push(String(url))
            return {
                ok: true,
                status: 200,
                headers: new Headers(),
                json: async () => ({
                    status: 0,
                    errno: 0,
                    error_info: "",
                    data: { fid: "f1", filename: "a.zip", full_path: "/a.zip", pdir_fid: "0" },
                }),
            }
        }) as unknown as typeof fetch
        await vaultClient(fetchFn).getFileInfo("f1")
        expect(seen[0]).toContain("fid=f1")
        expect(seen[0]).toContain("fetch_full_path=1")
    })
})

describe("QuarkClient 移动与任务接口", () => {
    it("moveFiles 透传参数并返回终态", async () => {
        let seenBody = ""
        const fetchFn = (async (_url: string, init: any) => {
            seenBody = String(init.body)
            return {
                ok: true,
                status: 200,
                headers: new Headers(),
                json: async () => ({ status: 0, errno: 0, error_info: "", data: { finish: 1, task_id: "t1" } }),
            }
        }) as unknown as typeof fetch
        const client = new QuarkClient(
            { clientId: "c", signKey: "k", deviceId: "d", deviceName: "n", accessToken: "t", refreshToken: "" },
            fetchFn
        )
        await expect(client.moveFiles(["f1", "f2"], "dir-9")).resolves.toEqual({ finish: 1, task_id: "t1" })
        expect(JSON.parse(seenBody)).toEqual({ fid_list: ["f1", "f2"], to_pdir_fid: "dir-9", action_type: 1 })
        await expect(client.moveFilesAndWait(["f1"], "dir-9")).resolves.toBeUndefined()
    })

    it("moveFilesAndWait 在异步完成前轮询", async () => {
        let queries = 0
        const fetchFn = mockFetch([
            {
                match: url => url.includes("/open/v1/file/move"),
                json: { status: 0, errno: 0, error_info: "", data: { finish: 0, task_id: "t2" } },
            },
            {
                match: url => url.includes("/open/v1/task/query"),
                json: { status: 0, errno: 0, error_info: "", data: { status: 2 } },
            },
        ])
        const countingFetch = (async (url: string, init: any) => {
            if (String(url).includes("/open/v1/task/query")) queries++
            return fetchFn(url, init)
        }) as unknown as typeof fetch
        const client = new QuarkClient(
            { clientId: "c", signKey: "k", deviceId: "d", deviceName: "n", accessToken: "t", refreshToken: "" },
            countingFetch
        )
        await client.moveFilesAndWait(["f1"], "dir-9")
        expect(queries).toBeGreaterThanOrEqual(1)
    })

    it("resolveDirFid：空回根、fid 直用、路径建目录", async () => {
        const neverCalled = (() => {
            throw new Error("不应调用客户端")
        }) as unknown as QuarkClient
        await expect(resolveDirFid(neverCalled, "")).resolves.toBe("0")
        await expect(resolveDirFid(neverCalled, "23833d7b215c492ab1091964d031100c")).resolves.toBe("23833d7b215c492ab1091964d031100c")
        const fakeClient = {
            createDir: async () => ({ fid: "dir-7", full_path: "x" }),
        } as unknown as QuarkClient
        await expect(resolveDirFid(fakeClient, "Duet Night Abyss Builder")).resolves.toBe("dir-7")
    })
})

describe("QuarkClient 删除接口", () => {
    function deleteClient(fetchFn: typeof fetch): QuarkClient {
        return new QuarkClient({ clientId: "c", signKey: "k", deviceId: "d", deviceName: "n", accessToken: "t", refreshToken: "" }, fetchFn)
    }

    it("deleteFiles 透传 fid_list", async () => {
        let seenBody = ""
        const fetchFn = (async (_url: string, init: any) => {
            seenBody = String(init.body)
            return {
                ok: true,
                status: 200,
                headers: new Headers(),
                json: async () => ({ status: 0, errno: 0, error_info: "", data: { finish: 1, task_id: "t1" } }),
            }
        }) as unknown as typeof fetch
        await expect(deleteClient(fetchFn).deleteFiles(["f-old"])).resolves.toEqual({ finish: 1, task_id: "t1" })
        expect(JSON.parse(seenBody)).toEqual({ fid_list: ["f-old"] })
        await expect(deleteClient(fetchFn).deleteFilesAndWait(["f-old"])).resolves.toBeUndefined()
    })

    it("deleteFilesAndWait 在异步完成前轮询", async () => {
        let queries = 0
        const fetchFn = mockFetch([
            {
                match: url => url.includes("/open/v1/file/delete"),
                json: { status: 0, errno: 0, error_info: "", data: { finish: 0, task_id: "t2" } },
            },
            {
                match: url => url.includes("/open/v1/task/query"),
                json: { status: 0, errno: 0, error_info: "", data: { status: 2 } },
            },
        ])
        const countingFetch = (async (url: string, init: any) => {
            if (String(url).includes("/open/v1/task/query")) queries++
            return fetchFn(url, init)
        }) as unknown as typeof fetch
        await deleteClient(countingFetch).deleteFilesAndWait(["f-old"])
        expect(queries).toBeGreaterThanOrEqual(1)
    })
})

describe("QuarkClient.uploadBuffer", () => {
    it("单分片小文件走完预上传→直传→完成确认", async () => {
        const seen: Array<{ url: string; init: any }> = []
        const fetchFn = (async (url: string, init: any) => {
            seen.push({ url: String(url), init })
            if (String(url).includes("/upload_pre")) {
                return {
                    ok: true,
                    status: 200,
                    headers: new Headers(),
                    json: async () => ({
                        status: 0,
                        errno: 0,
                        error_info: "",
                        data: { task_id: "task-1", part_size: 16777216, finish: 0 },
                    }),
                }
            }
            if (String(url).includes("/get_upload_urls")) {
                return {
                    ok: true,
                    status: 200,
                    headers: new Headers(),
                    json: async () => ({
                        status: 0,
                        errno: 0,
                        error_info: "",
                        data: {
                            common_headers: {
                                "X-Oss-Content-Sha256": "UNSIGNED-PAYLOAD",
                                "X-Oss-Date": "20240101T000000Z",
                            },
                            upload_urls: [
                                {
                                    part_number: 1,
                                    upload_url: "https://oss.example/part1",
                                    signature_info: { signature: "sig-1" },
                                },
                            ],
                        },
                    }),
                }
            }
            if (String(url).includes("/upload_finish")) {
                const body = JSON.parse(String(init.body))
                // ETag 必须带引号原样回传
                if (body.part_info_list[0].etag !== '"etag-1"') {
                    throw new Error(`finish 的 etag 不对：${body.part_info_list[0].etag}`)
                }
                return {
                    ok: true,
                    status: 200,
                    headers: new Headers(),
                    json: async () => ({ status: 0, errno: 0, error_info: "", data: { finish: 1, fid: "fid-123" } }),
                }
            }
            if (String(url).startsWith("https://oss.example/")) {
                return { ok: true, status: 200, headers: new Headers({ ETag: '"etag-1"' }), json: async () => ({}) }
            }
            throw new Error(`未 mock 的请求：${url}`)
        }) as unknown as typeof fetch
        const client = new QuarkClient(
            { clientId: "c", signKey: "k", deviceId: "d", deviceName: "n", accessToken: "t", refreshToken: "" },
            fetchFn
        )
        const result = await client.uploadBuffer("demo.zip", new Uint8Array([1, 2, 3]))
        expect(result.fid).toBe("fid-123")

        const put = seen.find(entry => entry.url.startsWith("https://oss.example/"))
        expect(put?.init.headers.Authorization).toBe("sig-1")
        expect(put?.init.headers["X-Oss-Content-Sha256"]).toBe("UNSIGNED-PAYLOAD")
        expect(put?.init.headers["X-Oss-Date"]).toBe("20240101T000000Z")
        expect(put?.init.headers).not.toHaveProperty("x-pan-token")
    })

    it("秒传命中时直接返回 fid，不再请求分片地址", async () => {
        let touchedUrls = false
        const fetchFn = mockFetch([
            {
                match: url => url.includes("/upload_pre"),
                json: { status: 0, errno: 0, error_info: "", data: { task_id: "task-9", finish: 1, fid: "fid-hit" } },
            },
            {
                match: () => {
                    touchedUrls = true
                    return true
                },
                json: { status: 0, errno: 0, error_info: "", data: {} },
            },
        ])
        const client = new QuarkClient(
            { clientId: "c", signKey: "k", deviceId: "d", deviceName: "n", accessToken: "t", refreshToken: "" },
            fetchFn
        )
        const result = await client.uploadBuffer("demo.zip", new Uint8Array([9]))
        expect(result.fid).toBe("fid-hit")
        expect(touchedUrls).toBe(false)
    })

    it("多分片走标准链路：hash_update 预上传→补哈希→取地址带分片校验→直传→完成确认", async () => {
        const { createHash } = await import("node:crypto")
        const calls: Array<{ url: string; body: any }> = []
        const payload = Uint8Array.from({ length: 200 }, (_, i) => i % 256)
        const fetchFn = (async (url: string, init: any) => {
            const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined
            calls.push({ url: String(url), body })
            if (String(url).includes("/upload_pre")) {
                // 探针（带全量哈希）回 part_size=4；多分片预上传（空哈希 + hash_update）回新 task
                if (body.hash_update) {
                    return {
                        ok: true,
                        status: 200,
                        headers: new Headers(),
                        json: async () => ({
                            status: 0,
                            errno: 0,
                            error_info: "",
                            data: { task_id: "task-multi", part_size: 64, finish: 0 },
                        }),
                    }
                }
                return {
                    ok: true,
                    status: 200,
                    headers: new Headers(),
                    json: async () => ({ status: 0, errno: 0, error_info: "", data: { task_id: "task-probe", part_size: 64, finish: 0 } }),
                }
            }
            if (String(url).includes("/update/hash")) {
                return {
                    ok: true,
                    status: 200,
                    headers: new Headers(),
                    json: async () => ({ status: 0, errno: 0, error_info: "", data: { task_id: "task-multi", finish: 0 } }),
                }
            }
            if (String(url).includes("/get_upload_urls")) {
                return {
                    ok: true,
                    status: 200,
                    headers: new Headers(),
                    json: async () => ({
                        status: 0,
                        errno: 0,
                        error_info: "",
                        data: {
                            upload_urls: [1, 2, 3, 4].map(n => ({
                                part_number: n,
                                upload_url: `https://oss.example/p${n}`,
                                signature_info: { signature: `sig-${n}` },
                            })),
                        },
                    }),
                }
            }
            if (String(url).includes("/upload_finish")) {
                return {
                    ok: true,
                    status: 200,
                    headers: new Headers(),
                    json: async () => ({ status: 0, errno: 0, error_info: "", data: { finish: 1, fid: "fid-multi" } }),
                }
            }
            if (String(url).startsWith("https://oss.example/")) {
                return { ok: true, status: 200, headers: new Headers({ ETag: '"etag-x"' }), json: async () => ({}) }
            }
            throw new Error(`未 mock 的请求：${url}`)
        }) as unknown as typeof fetch
        const client = new QuarkClient(
            { clientId: "c", signKey: "k", deviceId: "d", deviceName: "n", accessToken: "t", refreshToken: "" },
            fetchFn
        )
        const result = await client.uploadBuffer("big.msi", payload)
        expect(result.fid).toBe("fid-multi")

        const pres = calls.filter(entry => entry.url.includes("/upload_pre"))
        expect(pres).toHaveLength(2)
        expect(pres[1].body.hash_update).toBe(true)
        expect(pres[1].body.sha1).toBe("")
        expect(pres[1].body).not.toHaveProperty("part_info_list")

        const updateHash = calls.find(entry => entry.url.includes("/update/hash"))
        expect(updateHash?.body.task_id).toBe("task-multi")
        // 自研 SHA1 与 md5 须与 node:crypto 一致
        expect(updateHash?.body.sha1).toBe(createHash("sha1").update(payload).digest("hex"))
        expect(updateHash?.body.md5).toBe(createHash("md5").update(payload).digest("hex"))

        const getUrls = calls.find(entry => entry.url.includes("/get_upload_urls"))
        expect(getUrls?.body.task_id).toBe("task-multi")
        const parts = getUrls?.body.part_info_list
        expect(parts).toHaveLength(4)
        expect(parts[0]).toEqual({ part_number: 1, part_size: 64 })
        expect(parts[3].part_size).toBe(8)
        for (const part of parts.slice(1)) {
            expect(part.parallel_sha1_ctx.part_offset).toBe((part.part_number - 1) * 64)
            expect(part.parallel_sha1_ctx.h).toHaveLength(5)
        }
        const finish = calls.find(entry => entry.url.includes("/upload_finish"))
        expect(finish?.body.task_id).toBe("task-multi")
        expect(finish?.body.part_info_list).toHaveLength(4)
    })

    it("多分片补哈希命中秒传时直接返回 fid，不再直传", async () => {
        const fetchFn = (async (url: string, init: any) => {
            if (String(url).includes("/upload_pre")) {
                const body = JSON.parse(String(init.body))
                const data = body.hash_update
                    ? { task_id: "task-multi", part_size: 64, finish: 0 }
                    : { task_id: "task-probe", part_size: 64, finish: 0 }
                return {
                    ok: true,
                    status: 200,
                    headers: new Headers(),
                    json: async () => ({ status: 0, errno: 0, error_info: "", data }),
                }
            }
            if (String(url).includes("/update/hash")) {
                return {
                    ok: true,
                    status: 200,
                    headers: new Headers(),
                    json: async () => ({ status: 0, errno: 0, error_info: "", data: { finish: 1, fid: "fid-instant" } }),
                }
            }
            throw new Error(`不应再有请求：${url}`)
        }) as unknown as typeof fetch
        const client = new QuarkClient(
            { clientId: "c", signKey: "k", deviceId: "d", deviceName: "n", accessToken: "t", refreshToken: "" },
            fetchFn
        )
        const result = await client.uploadBuffer("big.msi", new Uint8Array(200))
        expect(result.fid).toBe("fid-instant")
    })

    it("预上传直接返回全量地址时不再调 get_upload_urls", async () => {
        const calls: string[] = []
        const fetchFn = (async (url: string) => {
            calls.push(String(url))
            if (String(url).includes("/upload_pre")) {
                return {
                    ok: true,
                    status: 200,
                    headers: new Headers(),
                    json: async () => ({
                        status: 0,
                        errno: 0,
                        error_info: "",
                        data: {
                            task_id: "task-pre-urls",
                            part_size: 4,
                            finish: 0,
                            upload_urls: [1, 2, 3].map(n => ({
                                part_number: n,
                                upload_url: `https://oss.example/q${n}`,
                                signature_info: { signature: `sig-${n}` },
                            })),
                        },
                    }),
                }
            }
            if (String(url).includes("/upload_finish")) {
                return {
                    ok: true,
                    status: 200,
                    headers: new Headers(),
                    json: async () => ({ status: 0, errno: 0, error_info: "", data: { finish: 1, fid: "fid-direct" } }),
                }
            }
            if (String(url).startsWith("https://oss.example/")) {
                return { ok: true, status: 200, headers: new Headers({ ETag: '"etag-x"' }), json: async () => ({}) }
            }
            throw new Error(`未 mock 的请求：${url}`)
        }) as unknown as typeof fetch
        const client = new QuarkClient(
            { clientId: "c", signKey: "k", deviceId: "d", deviceName: "n", accessToken: "t", refreshToken: "" },
            fetchFn
        )
        // 10 字节按 part_size=4 本应 3 片，但探针声明单片：单分片无需重做预上传，直接用预上传的地址
        const result = await client.uploadBuffer("small.bin", new Uint8Array(3))
        expect(result.fid).toBe("fid-direct")
        expect(calls.filter(url => url.includes("/upload_pre"))).toHaveLength(1)
        expect(calls.some(url => url.includes("/get_upload_urls"))).toBe(false)
    })
})
