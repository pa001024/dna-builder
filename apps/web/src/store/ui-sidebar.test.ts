import { createPinia, setActivePinia } from "pinia"
import { afterEach, describe, expect, it, vi } from "vitest"
import { nextTick } from "vue"
import { type MoreItem, mergeSidebarCatalog, resolveSidebarEntries, type SidebarEntryLike } from "@/utils/entry-util"

const BASE_TABS: SidebarEntryLike[] = [
    { name: "home", path: "/", icon: "ri:bookmark-line" },
    { name: "char-build", path: "/char", icon: "ri:hammer-line" },
    { name: "map-local", path: "/map-tool", icon: "ri:map-2-line" },
    { name: "more", path: "/more", icon: "ri:more-line" },
]

const MORE_ITEMS: MoreItem[] = [
    { name: "map-tool", path: "/map-tool", icon: "ri:map-2-line" },
    { name: "timeline", path: "/timeline", icon: "ri:timeline-view" },
    { name: "guides", path: "/guides", icon: "ri:book-line", show: false },
]

describe("侧边栏布局解析", () => {
    it("同路径基础优先：map-local 压住 map-tool，图标不错位", () => {
        const entries = resolveSidebarEntries(["/", "/map-tool", "/more"], BASE_TABS, MORE_ITEMS)
        expect(entries.map(entry => entry.path)).toEqual(["/", "/map-tool", "/more"])
        expect(entries[1].name).toBe("map-local")
        expect(entries[1].icon).toBe("ri:map-2-line")
    })

    it("锁定项缺失自动补回：主页补首位、More 补末位", () => {
        const entries = resolveSidebarEntries(["/char"], BASE_TABS, MORE_ITEMS)
        expect(entries.map(entry => entry.path)).toEqual(["/", "/char", "/more"])
    })

    it("未知路径直接丢弃，不污染布局", () => {
        const entries = resolveSidebarEntries(["/", "/no-such-route", "/more"], BASE_TABS, MORE_ITEMS)
        expect(entries.map(entry => entry.path)).toEqual(["/", "/more"])
    })

    it("全目录合并去重，基础在前、More 追加", () => {
        const catalog = mergeSidebarCatalog(BASE_TABS, MORE_ITEMS)
        expect(catalog.map(entry => entry.path)).toEqual(["/", "/char", "/map-tool", "/more", "/timeline", "/guides"])
    })
})

describe("侧边栏布局持久化", () => {
    const LAYOUT_KEY = "setting_sidebar_layout_v1"

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    // localStorage 桩的后端：node_modules 外部化后不受 resetModules 影响，
    // store 模块只动态导入一次，靠替换后端 Map 来隔离用例、模拟刷新。
    const holder: { map: Map<string, string> } = { map: new Map() }
    let uiModule: typeof import("./ui") | null = null

    function stubBrowserOnce() {
        const localStorage = {
            getItem: (key: string) => holder.map.get(key) ?? null,
            setItem: (key: string, value: string) => {
                holder.map.set(key, value)
            },
            removeItem: (key: string) => {
                holder.map.delete(key)
            },
        }
        // useStorage 在模块加载时锁定 window，必须先 stub 再动态导入 store；
        // Storage 也要给个桩，否则 storage instanceof Storage 直接抛 ReferenceError；
        // document 缺了会导致 isClient 为假，持久化整体短路为普通 ref（写盘静默丢失）。
        const documentStub = { createElement: () => ({}) }
        vi.stubGlobal("Storage", class {})
        vi.stubGlobal("document", documentStub)
        vi.stubGlobal("window", {
            document: documentStub,
            localStorage,
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => true,
        })
        vi.stubGlobal("localStorage", localStorage)
    }

    async function openStore(prefill?: Record<string, string>) {
        holder.map = new Map(Object.entries(prefill ?? {}))
        stubBrowserOnce()
        if (!uiModule) {
            uiModule = await import("./ui")
        }
        // 全新 pinia 实例即全新 store：state 重跑、落盘重读，等价刷新页面
        setActivePinia(createPinia())
        return uiModule.useUIStore()
    }

    it("自定义后落盘为合法 JSON 数组，刷新重读布局与图标保持一致", async () => {
        const ui = await openStore()
        ui.addSidebarPath("/timeline")
        ui.moveSidebarPath("/timeline", -1)
        await nextTick()

        const raw = holder.map.get(LAYOUT_KEY) ?? ""
        expect(raw.length).toBeGreaterThan(0)
        // 回归：null 默认曾被推导为 any 序列化器，数组被 String() 压成逗号串
        expect(() => JSON.parse(raw)).not.toThrow()
        const expected = ["/", "/game-launcher", "/char", "/map-tool", "/db", "/chat", "/timeline", "/dna", "/more"]
        expect(JSON.parse(raw)).toEqual(expected)

        // 模拟刷新：全新 pinia 实例重读同一份落盘（后端 Map 不动）
        setActivePinia(createPinia())
        const ui2 = (uiModule as typeof import("./ui")).useUIStore()
        expect(Array.isArray(ui2.sidebarLayout)).toBe(true)
        expect(ui2.sidebarLayoutPaths).toEqual(expected)
    })

    it("未改动时不写盘：默认布局只放内存", async () => {
        const ui = await openStore()
        expect(ui.isSidebarLayoutCustomized).toBe(false)
        await nextTick()
        expect(holder.map.has(LAYOUT_KEY)).toBe(false)
    })

    it("重置后回到默认布局且不再视为已定制", async () => {
        const ui = await openStore()
        ui.addSidebarPath("/timeline")
        expect(ui.isSidebarLayoutCustomized).toBe(true)
        ui.resetSidebarLayout()
        expect(ui.isSidebarLayoutCustomized).toBe(false)
        expect(ui.sidebarLayoutPaths).toEqual(["/", "/game-launcher", "/char", "/map-tool", "/db", "/chat", "/dna", "/more"])
        await nextTick()
    })

    it("历史坏盘数据解析失败时回默认布局，不崩散", async () => {
        const ui = await openStore({ [LAYOUT_KEY]: "/,/game-launcher,/char,/timeline,/more" })
        expect(ui.sidebarLayoutPaths).toEqual(["/", "/game-launcher", "/char", "/map-tool", "/db", "/chat", "/dna", "/more"])
    })
})
