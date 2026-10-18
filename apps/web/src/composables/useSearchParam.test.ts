import { beforeEach, describe, expect, it, vi } from "vitest"
import { useSearchParam } from "./useSearchParam"

const { mockRoute, mockRouter, replaceMock } = vi.hoisted(() => {
    return {
        mockRoute: { path: "/db/char", query: {} as Record<string, unknown> },
        mockRouter: {} as { currentRoute: { value: unknown }; replace: (...args: unknown[]) => unknown },
        replaceMock: vi.fn(),
    }
})

vi.mock("vue-router", async () => {
    const vue = await vi.importActual<typeof import("vue")>("vue")
    mockRouter.currentRoute = vue.ref(mockRoute)
    mockRouter.replace = replaceMock
    return {
        useRoute: () => mockRoute,
        useRouter: () => mockRouter,
    }
})

/** 等待 queueMicrotask 调度的写回提交执行完毕。 */
async function flushPendingReplace() {
    await new Promise<void>(resolve => setTimeout(resolve, 0))
}

beforeEach(() => {
    replaceMock.mockClear()
    mockRoute.path = "/db/char"
    mockRoute.query = {}
})

describe("useSearchParam", () => {
    it("同页面写入应通过 replace 写回 query", async () => {
        const keyword = useSearchParam<string>("kw", "")
        expect(keyword.value).toBe("")

        keyword.value = "辉珀"
        await flushPendingReplace()

        expect(replaceMock).toHaveBeenCalledTimes(1)
        expect(replaceMock).toHaveBeenCalledWith({ query: { kw: "辉珀" } })
    })

    it("同一 tick 内的多次写入应合并为一次提交", async () => {
        const keyword = useSearchParam<string>("kw", "")
        const elem = useSearchParam<string>("el", "")

        keyword.value = "辉珀"
        elem.value = "火"
        await flushPendingReplace()

        expect(replaceMock).toHaveBeenCalledTimes(1)
        expect(replaceMock).toHaveBeenCalledWith({ query: { kw: "辉珀", el: "火" } })
    })

    it("写回默认值时应从 query 中移除该键", async () => {
        mockRoute.query = { kw: "辉珀" }
        const keyword = useSearchParam<string>("kw", "")

        keyword.value = ""
        await flushPendingReplace()

        expect(replaceMock).toHaveBeenCalledTimes(1)
        expect(replaceMock).toHaveBeenCalledWith({ query: {} })
    })

    it("提交前已跳转到新页面时应丢弃旧批次，避免旧搜索词泄露到新页面", async () => {
        const keyword = useSearchParam<string>("kw", "")

        keyword.value = "辉珀"
        // 模拟提交前的微任务窗口内完成了跨页面跳转
        mockRoute.path = "/db/weapon"
        mockRoute.query = {}
        await flushPendingReplace()

        expect(replaceMock).not.toHaveBeenCalled()
    })

    it("提交时应以当前 query 为基底合并，不覆盖并发的其他键变更", async () => {
        const keyword = useSearchParam<string>("kw", "")

        keyword.value = "辉珀"
        // 模拟同一 tick 内其他来源写入了另一个键
        mockRoute.query = { el: "火" }
        await flushPendingReplace()

        expect(replaceMock).toHaveBeenCalledTimes(1)
        expect(replaceMock).toHaveBeenCalledWith({ query: { el: "火", kw: "辉珀" } })
    })

    it("写入与当前值一致时不应触发 replace", async () => {
        mockRoute.query = { kw: "辉珀" }
        const keyword = useSearchParam<string>("kw", "")

        keyword.value = "辉珀"
        await flushPendingReplace()

        expect(replaceMock).not.toHaveBeenCalled()
    })
})
