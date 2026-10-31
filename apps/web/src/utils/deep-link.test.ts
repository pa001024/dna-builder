import { describe, expect, it, vi } from "vitest"
import { createMemoryHistory, createRouter, type Router } from "vue-router"
import { routes } from "@/router"
import { buildDeepLink, deepLinkFor, deepLinkPathFor, dyePlanDeepLink, graphDeepLink, openDeepLink } from "@/utils/deep-link"

/** 深链解析目标必须落在路由表里：用同一张路由表建 memory history 实例校验。 */
const router = createRouter({ history: createMemoryHistory(), routes: [...routes] })

describe("深链解析", () => {
    it("构筑链接映射到构筑中转路径", () => {
        expect(deepLinkPathFor("dobapp://open-build/abc123")).toBe("/build/abc123")
        expect(buildDeepLink("abc123")).toBe("dobapp://open-build/abc123")
    })

    it("节点图链接映射到节点图中转路径", () => {
        expect(deepLinkPathFor("dobapp://open-graph/abc123")).toBe("/graph/abc123")
        expect(deepLinkPathFor("dobapp://open-graph?id=abc123")).toBe("/graph/abc123")
        expect(deepLinkPathFor("dobapp://open-graph")).toBeNull()
        expect(graphDeepLink("abc123")).toBe("dobapp://open-graph/abc123")
    })

    it("节点图链接解析结果能落进路由表（中转页）", () => {
        const path = deepLinkPathFor("dobapp://open-graph/abc123")!
        const resolved = router.resolve(path)
        expect(resolved.matched.length).not.toBe(0)
        expect(resolved.name).toBe("graph-detail")
        expect(resolved.params.id).toBe("abc123")
    })

    it("染色链接：带 id 落方案详情，裸链接落画廊", () => {
        expect(deepLinkPathFor("dobapp://open-dye/abc123")).toBe("/skin-colorize/abc123")
        expect(deepLinkPathFor("dobapp://open-dye")).toBe("/skin-colorize")
        expect(deepLinkPathFor("dobapp://open-dye?id=abc123")).toBe("/skin-colorize/abc123")
        expect(deepLinkPathFor("dobapp://open-build")).toBeNull()
        expect(dyePlanDeepLink("abc123")).toBe("dobapp://open-dye/abc123")
        expect(dyePlanDeepLink()).toBe("dobapp://open-dye")
    })

    it("染色链接解析结果能落进路由表（画廊与详情）", () => {
        expect(router.resolve(deepLinkPathFor("dobapp://open-dye")!).name).toBe("skin-colorize")
        const detail = router.resolve(deepLinkPathFor("dobapp://open-dye/abc123")!)
        expect(detail.name).toBe("skin-colorize-share")
        expect(detail.params.planId).toBe("abc123")
        // 新建路由不受详情路由的变量段截走（字面段精确匹配优先）
        expect(router.resolve("/skin-colorize/new").name).toBe("skin-colorize-create")
    })

    it("协议名与 host 大小写不敏感", () => {
        expect(deepLinkPathFor("DOBAPP://Open-Build/abc123")).toBe("/build/abc123")
    })

    it("id 允许写成查询参数", () => {
        expect(deepLinkPathFor("dobapp://open-build?id=abc123")).toBe("/build/abc123")
    })

    it("首尾多余斜杠不影响解析", () => {
        expect(deepLinkPathFor("dobapp://open-build/abc123/")).toBe("/build/abc123")
        expect(deepLinkPathFor("dobapp://open-build//abc123")).toBe("/build/abc123")
        expect(deepLinkPathFor("  dobapp://open-build/abc123  ")).toBe("/build/abc123")
    })

    it("id 里的保留字符重新编码成单段", () => {
        // 网页若把 id 编码过（%2F），解码后仍是一个路径段，不能变成两段
        expect(deepLinkPathFor("dobapp://open-build/a%2Fb")).toBe("/build/a%2Fb")
        expect(deepLinkPathFor("dobapp://open-build/%E4%B8%AD%E6%96%87")).toBe("/build/%E4%B8%AD%E6%96%87")
    })

    it("非深链、host 未注册、id 缺失一律忽略", () => {
        const ignored = [
            "",
            "abc123",
            "build/abc123",
            "https://dna-builder.cn/build/abc123",
            "dobapp://open-mod/11001", // 清单里没放行这个 host
            "dobapp://open-build",
            "dobapp://open-build/",
            "dobapp://open-build?id=",
            "dobapp:open-build/abc123", // 没有 authority，host 为空
        ]
        for (const url of ignored) {
            expect(deepLinkPathFor(url), `不该解析出路径：${url}`).toBeNull()
        }
    })

    it("解析结果能落进路由表", () => {
        const path = deepLinkPathFor("dobapp://open-build/abc123")!
        const resolved = router.resolve(path)
        expect(resolved.matched.length).not.toBe(0)
        expect(resolved.name).toBe("build-detail")
        expect(resolved.params.id).toBe("abc123")
    })

    it("拼出来的深链能解析回原路径", () => {
        expect(deepLinkPathFor(buildDeepLink("abc123"))).toBe("/build/abc123")
        expect(deepLinkPathFor(dyePlanDeepLink("abc123"))).toBe("/skin-colorize/abc123")
        expect(deepLinkPathFor(dyePlanDeepLink())).toBe("/skin-colorize")
        expect(deepLinkPathFor(graphDeepLink("abc123"))).toBe("/graph/abc123")
    })

    it("deepLinkFor 按类型分发：缺 id 的构筑/节点图返回 null，染色回落画廊", () => {
        expect(deepLinkFor("build", "abc123")).toBe("dobapp://open-build/abc123")
        expect(deepLinkFor("graph", "abc123")).toBe("dobapp://open-graph/abc123")
        expect(deepLinkFor("dye", "abc123")).toBe("dobapp://open-dye/abc123")
        expect(deepLinkFor("dye")).toBe("dobapp://open-dye")
        expect(deepLinkFor("dye", "")).toBe("dobapp://open-dye")
        expect(deepLinkFor("build", "")).toBeNull()
        expect(deepLinkFor("build")).toBeNull()
        expect(deepLinkFor("graph", null)).toBeNull()
        expect(deepLinkFor("mod", "11001")).toBeNull()
        expect(deepLinkFor(undefined, "abc123")).toBeNull()
    })

    it("deepLinkFor 兼容路由 params 形态（数组取首个、数字转字符串）", () => {
        expect(deepLinkFor("build", ["abc123"])).toBe("dobapp://open-build/abc123")
        expect(deepLinkFor("build", 123)).toBe("dobapp://open-build/123")
        expect(deepLinkFor("graph", "  abc123  ")).toBe("dobapp://open-graph/abc123")
    })
})

describe("深链打开", () => {
    it("未知深链不跳转", () => {
        expect(openDeepLink(router, "dobapp://open-mod/11001")).toBe(false)
        expect(openDeepLink(router, null)).toBe(false)
    })

    it("可识别的深链调用跳转", () => {
        // 真 router 的 push 会触发 .vue 懒加载（单测环境没有 vue 插件），这里只验逻辑
        const push = vi.fn().mockResolvedValue(undefined)
        const fake = { resolve: () => ({ matched: [{}] }), push } as unknown as Router
        expect(openDeepLink(fake, "dobapp://open-build/abc123")).toBe(true)
        expect(push).toHaveBeenCalledWith("/build/abc123")
    })
})
