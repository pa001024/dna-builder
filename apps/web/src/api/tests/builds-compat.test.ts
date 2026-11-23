import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ query: vi.fn() }))

vi.mock("../client", () => ({ gqClient: { query: mocks.query } }))

import { fetchBuildsWithCount, resetBuildTypeSupport, supportsBuildTypeFilter } from "../builds-compat"

type QueryResult = { data?: unknown; error?: unknown }

/** 让下一次 gqClient.query 返回指定结果 */
function respond(result: QueryResult) {
    mocks.query.mockReturnValueOnce({ toPromise: async () => result })
}

/**
 * 读取第 n 次请求的 GraphQL 文档文本。
 * @param index 调用序号
 * @returns 文档原文
 */
function docBody(index: number): string {
    const document = mocks.query.mock.calls[index][0] as { loc?: { source: { body: string } } }
    return document.loc?.source.body ?? ""
}

beforeEach(() => {
    mocks.query.mockReset()
    resetBuildTypeSupport()
})

describe("builds-compat 新查询", () => {
    it("默认携带 buildType 与 info，返回列表与总数", async () => {
        respond({ data: { builds: [{ id: "b1" }], buildsCount: 1 } })

        const result = await fetchBuildsWithCount({ charId: 1, buildType: "transcend" })

        expect(result.builds.map(build => build.id)).toEqual(["b1"])
        expect(result.buildsCount).toBe(1)
        expect(supportsBuildTypeFilter()).toBe(true)
        expect(docBody(0)).toContain("info {")
        expect(mocks.query.mock.calls[0][1]).toMatchObject({ charId: 1, buildType: "transcend" })
    })
})

describe("builds-compat 旧服务端回退", () => {
    it.each([
        ['Unknown type "BuildType".'],
        ['Unknown argument "buildType" on field "Query.builds".'],
        ['Cannot query field "info" on type "Build".'],
    ])("schema 错误「%s」触发一次旧查询回退", async message => {
        respond({ error: new Error(message) })
        respond({ data: { builds: [], buildsCount: 0 } })

        const result = await fetchBuildsWithCount({ charId: 1, buildType: "normal" })

        expect(result).toEqual({ builds: [], buildsCount: 0 })
        expect(supportsBuildTypeFilter()).toBe(false)
        expect(mocks.query).toHaveBeenCalledTimes(2)
        expect(docBody(0)).toContain("info {")
        expect(docBody(1)).not.toContain("info {")
        expect(docBody(1)).not.toContain("buildType")
        expect(mocks.query.mock.calls[1][1]).not.toHaveProperty("buildType")
    })

    it("降级后后续调用直接走旧查询，不再尝试新文档", async () => {
        respond({ error: new Error('Unknown type "BuildType".') })
        respond({ data: { builds: [], buildsCount: 0 } })
        await fetchBuildsWithCount({ charId: 1 })

        respond({ data: { builds: [{ id: "legacy" }], buildsCount: 3 } })
        const result = await fetchBuildsWithCount({ charId: 1, buildType: "transcend" })

        expect(result.buildsCount).toBe(3)
        expect(mocks.query).toHaveBeenCalledTimes(3)
        expect(docBody(2)).not.toContain("info {")
        expect(mocks.query.mock.calls[2][1]).not.toHaveProperty("buildType")
    })

    it("非 schema 错误正常抛出，不降级", async () => {
        respond({ error: new Error("Network request failed") })

        await expect(fetchBuildsWithCount({ charId: 1 })).rejects.toThrow("Network request failed")

        expect(supportsBuildTypeFilter()).toBe(true)
        expect(mocks.query).toHaveBeenCalledTimes(1)
    })

    it("无数据的结果按错误处理", async () => {
        respond({ data: null })

        await expect(fetchBuildsWithCount({ charId: 1 })).rejects.toThrow("构筑列表查询无数据")
    })
})
