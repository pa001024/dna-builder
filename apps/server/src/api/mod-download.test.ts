import { describe, expect, it, mock } from "bun:test"
import jwt from "jsonwebtoken"
import { machineIdSync } from "node-machine-id"
import * as realSchema from "../db/schema"

/**
 * MOD 下载接口的重定向行为测试。
 * 下载不再由服务端中转字节，而是 302 到 OSS/CDN 直链，因此这里断言：
 * 鉴权与计数照旧，响应体为空，且 Location 指向 CDN 上的哈希文件。
 */

/** 测试用 CDN 域名；需在导入 mod-storage 之前写入环境变量（该模块在加载时读取 env）。 */
const TEST_CDN = "https://cdn.test.invalid"

/** 版本压缩包在 OSS 上的 key（服务端以内容哈希命名）。 */
const FILE_KEY = "mods/hash/abc123.zip"

/** 当前测试用例使用的假数据，由 mock 的 db 读取。 */
const state = {
    /** 当前 MOD 行。 */
    mod: { id: "mod-1", userId: "user-1", status: "approved" } as Record<string, unknown> | null,
    /** 当前版本行。 */
    version: { id: "version-1", modId: "mod-1", fileKey: FILE_KEY, fileName: "demo.zip" } as Record<string, unknown> | null,
    /** 下载计数更新次数（断言下载会累加计数）。 */
    downloadBumps: 0,
}

/** 提供 modApiPlugin 所需的 db 接口（只用到查询单行与更新计数）。 */
const fakeDb = {
    query: {
        gameMods: { findFirst: async () => state.mod },
        gameModVersions: { findFirst: async () => state.version },
    },
    update: () => ({
        set: () => ({
            where: async () => {
                state.downloadBumps += 1
            },
        }),
    }),
}

mock.module("../db", () => ({ db: fakeDb, schema: realSchema }))

process.env.CDN_URL = TEST_CDN
const { modApiPlugin } = await import("./mod")

/** 测试用 API 实例。 */
const app = modApiPlugin()

/**
 * @description 生成一个与 verifyModToken 同一密钥（机器指纹）的登录令牌。
 * @param id 用户 id。
 * @param roles 用户角色。
 * @returns JWT 字符串。
 */
function createToken(id: string, roles: string[] = []) {
    return jwt.sign({ id, name: "tester", roles }, machineIdSync())
}

/**
 * @description 发送下载请求。
 * @param path 请求路径（以 / 开头，不含 /api/mods 前缀）。
 * @param token 登录令牌，缺省表示未登录。
 * @returns HTTP 响应。
 */
function requestDownload(path: string, token?: string) {
    return app.handle(
        new Request(`http://localhost/api/mods${path}`, {
            headers: token ? { token } : {},
        })
    )
}

describe("MOD 下载重定向", () => {
    it("最新版下载应 302 到 CDN 直链，且响应体为空（不再中转字节）", async () => {
        state.mod = { id: "mod-1", userId: "user-1", status: "approved" }
        state.version = { id: "version-1", modId: "mod-1", fileKey: FILE_KEY, fileName: "demo.zip" }
        state.downloadBumps = 0

        const res = await requestDownload("/mod-1/download", createToken("user-1"))

        expect(res.status).toBe(302)
        expect(res.headers.get("location")).toBe(`${TEST_CDN}/${FILE_KEY}`)
        expect(res.headers.get("cache-control")).toBe("no-store")
        expect((await res.arrayBuffer()).byteLength).toBe(0)
        // 版本与发布各累加一次下载计数
        expect(state.downloadBumps).toBe(2)
    })

    it("指定版本下载应 302 到 CDN 直链", async () => {
        state.mod = { id: "mod-1", userId: "user-1", status: "approved" }
        state.version = { id: "version-1", modId: "mod-1", fileKey: FILE_KEY, fileName: "demo.zip" }

        const res = await requestDownload("/mod-1/versions/version-1/download", createToken("user-1"))

        expect(res.status).toBe(302)
        expect(res.headers.get("location")).toBe(`${TEST_CDN}/${FILE_KEY}`)
    })

    it("未登录时仍拒绝下载", async () => {
        state.mod = { id: "mod-1", userId: "user-1", status: "approved" }
        state.version = { id: "version-1", modId: "mod-1", fileKey: FILE_KEY, fileName: "demo.zip" }

        const res = await requestDownload("/mod-1/download")

        expect(res.status).toBe(401)
        expect(res.headers.get("location")).toBeNull()
    })

    it("他人未审核通过的 MOD 不允许下载", async () => {
        state.mod = { id: "mod-1", userId: "user-1", status: "pending" }
        state.version = { id: "version-1", modId: "mod-1", fileKey: FILE_KEY, fileName: "demo.zip" }

        const res = await requestDownload("/mod-1/download", createToken("user-2"))

        expect(res.status).toBe(403)
        expect(res.headers.get("location")).toBeNull()
    })

    it("版本缺少文件记录时返回 404", async () => {
        state.mod = { id: "mod-1", userId: "user-1", status: "approved" }
        state.version = null

        const res = await requestDownload("/mod-1/download", createToken("user-1"))

        expect(res.status).toBe(404)
        expect(res.headers.get("location")).toBeNull()
    })
})
