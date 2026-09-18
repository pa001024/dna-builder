import { describe, expect, it } from "vitest"

/**
 * vue-router 的 `createWebHistory()` 在模块加载时就会触碰 `window` / `location`，
 * 而测试默认跑在 node 环境（项目没有装 jsdom）。这里补上最小可用的浏览器全局，
 * 让真实的 `@/router` 能被导入——本用例正是要验证「markdown 与 router 的相互引用不会出问题」，
 * 所以不能用 mock 绕开路由模块。
 */
function installMinimalBrowserGlobals() {
    const scope = globalThis as Record<string, unknown>

    if (!scope.window) {
        scope.window = scope
    }
    // window 指向 globalThis，所以事件相关方法要挂在 globalThis 上
    if (typeof scope.addEventListener !== "function") {
        scope.addEventListener = () => {}
        scope.removeEventListener = () => {}
        scope.dispatchEvent = () => true
    }
    if (!scope.location) {
        scope.location = {
            protocol: "http:",
            host: "localhost",
            pathname: "/",
            search: "",
            hash: "",
            href: "http://localhost/",
        }
    }
    if (!scope.history) {
        scope.history = { state: {}, replaceState: () => {}, pushState: () => {}, go: () => {} }
    }
    if (!scope.navigator) {
        scope.navigator = { userAgent: "vitest" }
    }

    // katex 在模块初始化时会探测 DOM，需要 createElement / head / body 等最小实现
    if (!scope.document) {
        const createElement = () => {
            const el: Record<string, unknown> = {
                style: {},
                dataset: {},
                classList: { add: () => {}, remove: () => {} },
                setAttribute: () => {},
                getAttribute: () => null,
                appendChild: () => el,
                removeChild: () => el,
                addEventListener: () => {},
                removeEventListener: () => {},
                children: [],
                childNodes: [],
            }
            return el
        }

        scope.document = {
            querySelector: () => null,
            querySelectorAll: () => [],
            createElement,
            createTextNode: () => ({}),
            addEventListener: () => {},
            removeEventListener: () => {},
            head: { appendChild: () => {} },
            body: { appendChild: () => {} },
            documentElement: { style: {} },
        }
    }

    if (!scope.HTMLElement) {
        scope.HTMLElement = class {}
    }
}

installMinimalBrowserGlobals()

const { isHashRouterMode, renderMarkdown } = await import("@/utils/markdown")

describe("renderMarkdown 站内链接", () => {
    it("应把站内路径渲染成可点击链接", () => {
        const html = renderMarkdown("详见 [魔灵地图](/db/map-local)")

        expect(html).toContain('href="/db/map-local"')
        expect(html).toContain("魔灵地图")
        // 链接文本不应带 # 前缀
        expect(html).not.toContain(">#/db/map-local<")
    })

    it("应给站内链接打上 data-site-link 标记", () => {
        const html = renderMarkdown("[角色](/db/char)")
        expect(html).toContain('data-site-link="1"')
    })

    it("markdown 自身链接语法的站内路径也应被识别", () => {
        const html = renderMarkdown("[地图](/db/map)")
        expect(html).toContain('href="/db/map"')
        expect(html).toContain('data-site-link="1"')
    })

    it("外链不应被打上站内标记", () => {
        const html = renderMarkdown("[外站](https://example.com/page)")
        expect(html).toContain('href="https://example.com/page"')
        expect(html).not.toContain('data-site-link="1"')
    })

    it("在测试环境（非 hash 模式）站内链接不应被补上 #", () => {
        // 测试环境没有 Tauri，路由是 history 模式
        expect(isHashRouterMode()).toBe(false)
        const html = renderMarkdown("[地图](/db/map-local)")
        expect(html).toContain('href="/db/map-local"')
        expect(html).not.toContain('href="#/db/map-local"')
    })

    it("空文本应返回空串", () => {
        expect(renderMarkdown("")).toBe("")
    })

    it("普通 markdown 仍应正常渲染", () => {
        const html = renderMarkdown("## 标题\n\n**加粗**")
        expect(html).toContain("<h2>")
        expect(html).toContain("<strong>")
    })
})
