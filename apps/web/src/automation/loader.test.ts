import { zipSync } from "fflate"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { listActions, unregisterAction } from "./bus"
import {
    __resetPluginsForTests,
    availablePlugins,
    ensurePluginsLoaded,
    installedPlugins,
    installPlugin,
    pluginAccounts,
    pluginSettings,
    pluginTitles,
    refreshAvailable,
    uninstallPlugin,
} from "./loader"

function sha256Hex(data: Uint8Array): Promise<string> {
    return crypto.subtle
        .digest("SHA-256", data as BufferSource)
        .then(digest => [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join(""))
}

function bundleJs(actionId: string): string {
    return [
        "const def = {",
        `  id: ${JSON.stringify(actionId)},`,
        '  title: "演示",',
        "  fields: [],",
        "  execute: async () => ({ ok: true }),",
        "};",
        "const account = { status: async () => true };",
        "module.exports.__dob_plugin = { def, account };",
        "",
    ].join("\n")
}

async function zipOf(id: string, code: string): Promise<Uint8Array> {
    return zipSync({ [`${id}.js`]: new TextEncoder().encode(code), "plugin.json": new TextEncoder().encode("{}") })
}

function stubFetch(index: unknown[], zips: Record<string, Uint8Array>): void {
    vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
            const text = String(url)
            if (text.endsWith("plugins.json")) {
                return new Response(JSON.stringify(index), { status: 200 })
            }
            const file = text.split("/").at(-1) ?? ""
            const id = Object.keys(zips).find(key => `${key}-1.0.0.zip` === file || key === file.replace(/\.zip$/, ""))
            const bytes = id ? zips[id] : undefined
            if (!bytes) return new Response("not found", { status: 404 })
            return new Response(bytes as unknown as BodyInit, { status: 200 })
        })
    )
}

const ENTRY = {
    id: "demo",
    version: "1.0.0",
    kind: "action",
    title: "演示",
    hasSettings: false,
    file: "demo-1.0.0.zip",
    size: 10,
    sha256: "",
}

beforeEach(() => {
    __resetPluginsForTests()
    vi.unstubAllGlobals()
})

afterEach(() => {
    vi.unstubAllGlobals()
})

describe("loader 安装链路", () => {
    it("refreshAvailable 只读索引不下载包体", async () => {
        stubFetch([{ ...ENTRY }], {})
        const list = await refreshAvailable()
        expect(list.map(item => item.id)).toEqual(["demo"])
        expect(availablePlugins.map(item => item.id)).toEqual(["demo"])
        expect(pluginTitles.demo).toBe("演示")
        expect(listActions().some(def => def.id === "demo.ping")).toBe(false)
    })

    it("install → 注册 + 落盘；uninstall → 注销", async () => {
        const code = bundleJs("demo.ping")
        const bytes = await zipOf("demo", code)
        const sha256 = await sha256Hex(bytes)
        stubFetch([{ ...ENTRY, sha256, size: bytes.length }], { demo: bytes })
        await refreshAvailable()

        const installed = await installPlugin("demo")
        expect(installed.version).toBe("1.0.0")
        expect(listActions().some(def => def.id === "demo.ping")).toBe(true)
        expect(installedPlugins.demo?.version).toBe("1.0.0")
        expect(pluginAccounts.demo).toBeDefined()

        uninstallPlugin("demo")
        expect(listActions().some(def => def.id === "demo.ping")).toBe(false)
        expect(installedPlugins.demo).toBeUndefined()
    })

    it("sha 不符拒绝安装", async () => {
        const code = bundleJs("demo.ping")
        const bytes = await zipOf("demo", code)
        stubFetch([{ ...ENTRY, sha256: "0".repeat(64), size: bytes.length }], { demo: bytes })
        await refreshAvailable()
        await expect(installPlugin("demo")).rejects.toThrow(/校验失败/)
        expect(listActions().some(def => def.id === "demo.ping")).toBe(false)
    })

    it("ensurePluginsLoaded 只从本地恢复不联网", async () => {
        const code = bundleJs("demo.ping")
        const bytes = await zipOf("demo", code)
        const sha256 = await sha256Hex(bytes)
        stubFetch([{ ...ENTRY, sha256, size: bytes.length }], { demo: bytes })
        await refreshAvailable()
        await installPlugin("demo")
        expect(listActions().some(def => def.id === "demo.ping")).toBe(true)

        // 模拟重启：清掉运行时注册但保留持久化
        unregisterAction("demo.ping")
        for (const key of Object.keys(pluginSettings)) delete pluginSettings[key]
        for (const key of Object.keys(pluginAccounts)) delete pluginAccounts[key]
        for (const key of Object.keys(installedPlugins)) delete installedPlugins[key]
        for (const key of Object.keys(pluginTitles)) delete pluginTitles[key]

        vi.unstubAllGlobals()
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => {
                throw new Error("must not fetch")
            })
        )
        await ensurePluginsLoaded()
        expect(listActions().some(def => def.id === "demo.ping")).toBe(true)
    })
})
