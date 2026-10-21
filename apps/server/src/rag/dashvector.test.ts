/**
 * DashVector 客户端的契约测试（fetch 全 stub，不连真实远端）。
 *
 * 覆盖：写入走 upsert 端点（新 id 插入 / 已存在 id 覆盖都不报错）、
 * 真正的按条失败仍然抛出、删除容忍「键不存在」。
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { type DashVectorConfig, deleteDocuments, insertDocuments } from "./dashvector"

/** 测试用远端配置（不产生外网调用，fetch 按 URL 应答） */
const CONFIG: DashVectorConfig = {
    endpoint: "dv.example.test",
    apiKey: "sk-dv",
    collection: "dbagent",
}

/** 原始 fetch：用例结束后还原 */
const originalFetch = globalThis.fetch

/** 收到的写入请求路径 */
let writtenPaths: string[] = []

beforeEach(() => {
    writtenPaths = []
})

afterEach(() => {
    globalThis.fetch = originalFetch
})

/**
 * 按场景 stub 远端：upsert 对新 id 报 insert、对已有 id 报 update（code 都是 0）；
 * 维度不符的文档按条报 -2019。
 */
function stubRemote(existingIds: ReadonlySet<string>, badIds: ReadonlySet<string> = new Set()): void {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)

        if (url.includes("dv.example.test") && url.endsWith("/docs/upsert")) {
            writtenPaths.push(url)
            const body = JSON.parse(`${init?.body ?? "{}"}`) as { docs?: Array<{ id?: string }> }
            const output = (body.docs ?? []).map(doc => {
                const id = doc?.id ?? ""

                if (badIds.has(id)) {
                    return { doc_op: "upsert", id, code: -2019, message: "Mismatched Dimension" }
                }

                return { doc_op: existingIds.has(id) ? "update" : "insert", id, code: 0, message: "" }
            })

            return new Response(JSON.stringify({ code: 0, message: "Success", output }), { status: 200 })
        }

        if (url.includes("dv.example.test") && url.endsWith("/docs") && (init?.method ?? "GET") === "DELETE") {
            const body = JSON.parse(`${init?.body ?? "{}"}`) as { ids?: string[] }
            const output = (body.ids ?? []).map(id =>
                existingIds.has(id)
                    ? { doc_op: "delete", id, code: 0, message: "" }
                    : { doc_op: "delete", id, code: -2024, message: "Key Not Exist" }
            )

            return new Response(JSON.stringify({ code: 0, message: "Success", output }), { status: 200 })
        }

        throw new Error(`测试不应请求 ${url}`)
    }) as typeof fetch
}

/** 造一份文档（向量 4 维，与 build.test.ts 的桩维度一致） */
function makeDoc(anchor: string): { anchor: string; vector: number[]; fields: Record<string, string> } {
    return { anchor, vector: [1, 0, 0, 0], fields: { anchor, lang: "zh", kind: "story", hash: "h", fingerprint: "f" } }
}

describe("insertDocuments", () => {
    test("走 /docs/upsert：新 id 插入、已存在 id 覆盖都不报错", async () => {
        stubRemote(new Set(["story.1.2.d3"]))

        const written = await insertDocuments(CONFIG, [makeDoc("story:1:2:d3"), makeDoc("story:9:9:d9")])

        expect(written).toBe(2)
        expect(writtenPaths.length).toBeGreaterThan(0)
        expect(writtenPaths.every(path => path.endsWith("/docs/upsert"))).toBe(true)
    })

    test("按条失败（如维度不符）仍然抛出", async () => {
        stubRemote(new Set(), new Set(["story.1.2.d3"]))

        await expect(insertDocuments(CONFIG, [makeDoc("story:1:2:d3")])).rejects.toThrow("Mismatched Dimension")
    })
})

describe("deleteDocuments", () => {
    test("不存在的键（-2024）不算错误，其它错误码抛出", async () => {
        stubRemote(new Set(["story.1.2.d3"]))

        // 已存在 + 不存在混删：只计实际删除的 1 条，不抛错
        await expect(deleteDocuments(CONFIG, ["story:1:2:d3", "story:9:9:d9"])).resolves.toBe(1)
    })
})
