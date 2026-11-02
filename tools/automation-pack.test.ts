import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"
import {
    collectPlugins,
    findUnresolvedComponents,
    rewriteLocalImports,
    runPack,
    validateEntrySource,
    validateImports,
    validateManifest,
} from "./automation-pack"

const suiteTmp = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".tmp", "automation-pack-test")

afterEach(() => {
    fs.rmSync(suiteTmp, { recursive: true, force: true })
})

function makeRoot(name: string): string {
    const root = path.join(suiteTmp, name)
    fs.rmSync(root, { recursive: true, force: true })
    fs.mkdirSync(path.join(root, "plugins"), { recursive: true })
    return root
}

function writePlugin(root: string, dir: string, manifest: unknown, entryText?: string, entryName = "index.ts"): void {
    const dirPath = path.join(root, "plugins", dir)
    fs.mkdirSync(dirPath, { recursive: true })
    fs.writeFileSync(path.join(dirPath, "plugin.json"), JSON.stringify(manifest))
    if (entryText !== undefined) fs.writeFileSync(path.join(dirPath, entryName), entryText)
}

function goodEntry(id: string): string {
    return `const def = { id: "${id}" };\nexport default def;\n`
}

/** 构建用例依赖 Bun.build/Transpiler：vitest（node）下跳过，bun test 下全跑。 */
const describeBuild = typeof Bun === "undefined" ? describe.skip : describe

describe("validateManifest", () => {
    it("接受合法 manifest", () => {
        const check = validateManifest("notify", { id: "notify", version: "1.0.0", kind: "action", entry: "index.ts", title: "通知" })
        expect(check.errors).toEqual([])
        expect(check.manifest?.id).toBe("notify")
    })

    it("拒绝非法 version", () => {
        const check = validateManifest("notify", { id: "notify", version: "1.0", kind: "action", entry: "index.ts" })
        expect(check.manifest).toBeNull()
        expect(check.errors.length).toBeGreaterThan(0)
    })

    it("拒绝 id 与目录名不一致", () => {
        const check = validateManifest("notify", { id: "other", version: "1.0.0", kind: "action", entry: "index.ts" })
        expect(check.manifest).toBeNull()
        expect(check.errors.some(message => message.includes("目录名"))).toBe(true)
    })

    it("拒绝非 kebab-case id", () => {
        const check = validateManifest("notify", { id: "notify.system", version: "1.0.0", kind: "action", entry: "index.ts" })
        expect(check.manifest).toBeNull()
    })

    it("拒绝非法 kind", () => {
        const check = validateManifest("notify", { id: "notify", version: "1.0.0", kind: "widget", entry: "index.ts" })
        expect(check.manifest).toBeNull()
    })

    it("未知字段只告警", () => {
        const check = validateManifest("notify", {
            id: "notify",
            version: "1.0.0",
            kind: "action",
            entry: "index.ts",
            title: "通知",
            extra: 1,
        })
        expect(check.errors).toEqual([])
        expect(check.manifest).not.toBeNull()
        expect(check.warnings.length).toBe(1)
    })
})

describe("validateEntrySource", () => {
    it("拒绝缺少 export default 的入口", () => {
        expect(validateEntrySource("notify", "notify", "action", `const def = { id: "notify" };\n`).length).toBeGreaterThan(0)
    })

    it("拒绝缺 id 字面量的入口", () => {
        expect(validateEntrySource("notify", "notify", "action", `const def = {};\nexport default def;\n`).length).toBeGreaterThan(0)
    })
})

describe("validateImports", () => {
    it("放行插件内相对引用与宿主模块", () => {
        const root = makeRoot("imports-ok")
        writePlugin(
            root,
            "notify",
            { id: "notify", version: "1.0.0", kind: "action", entry: "index.ts" },
            `import type { ActionDef } from "@dob/host";\nimport { helper } from "./util";\nimport { ref } from "vue";\nexport default {};\n`
        )
        fs.writeFileSync(path.join(root, "plugins", "notify", "util.ts"), "export const helper = 1;\n")
        const errors = validateImports("notify", path.join(root, "plugins", "notify"), ["index.ts", "util.ts", "plugin.json"])
        expect(errors).toEqual([])
    })

    it("拒绝第三方裸导入与越界相对路径", () => {
        const root = makeRoot("imports-bad")
        writePlugin(
            root,
            "notify",
            { id: "notify", version: "1.0.0", kind: "action", entry: "index.ts" },
            `import "lodash-es";\nimport x from "../../apps/web/src/store/ui";\nexport default {};\n`
        )
        const errors = validateImports("notify", path.join(root, "plugins", "notify"), ["index.ts"])
        expect(errors.length).toBe(2)
    })

    it("跳过测试文件", () => {
        const root = makeRoot("imports-test")
        writePlugin(
            root,
            "notify",
            { id: "notify", version: "1.0.0", kind: "action", entry: "index.ts", title: "通知" },
            goodEntry("notify")
        )
        fs.writeFileSync(path.join(root, "plugins", "notify", "index.test.ts"), `import "bun:test";\n`)
        const errors = validateImports("notify", path.join(root, "plugins", "notify"), ["index.ts", "index.test.ts"])
        expect(errors).toEqual([])
    })
})

describe("rewriteLocalImports", () => {
    it("插件内相对引用改绝对路径，宿主路径不动", () => {
        const out = rewriteLocalImports(
            "/repo/plugins/notify",
            `import { account } from "./index";\nimport { getRuntime } from "@dob/host";\nimport { ref } from "vue";\n`
        )
        expect(out).toContain("plugins/notify/index")
        expect(out).toContain('"@dob/host"')
        expect(out).toContain('"vue"')
    })
})

describe("collectPlugins", () => {
    it("拒绝缺失入口文件", () => {
        const root = makeRoot("missing-entry")
        writePlugin(root, "notify", { id: "notify", version: "1.0.0", kind: "action", entry: "index.ts", title: "通知" })
        const result = collectPlugins(path.join(root, "plugins"))
        expect(result.plugins).toEqual([])
        expect(result.errors.some(message => message.includes("入口文件"))).toBe(true)
    })

    it("跳过缺少 plugin.json 的目录", () => {
        const root = makeRoot("no-manifest")
        fs.mkdirSync(path.join(root, "plugins", "stray"), { recursive: true })
        const result = collectPlugins(path.join(root, "plugins"))
        expect(result.plugins).toEqual([])
        expect(result.errors.length).toBe(1)
    })

    it("settings 缺文件时跳过插件", () => {
        const root = makeRoot("missing-settings")
        writePlugin(
            root,
            "mihome",
            { id: "mihome", version: "1.0.0", kind: "action", entry: "index.ts", title: "米家", settings: "settings.vue" },
            goodEntry("mihome.run-scene")
        )
        const result = collectPlugins(path.join(root, "plugins"))
        expect(result.plugins).toEqual([])
        expect(result.errors.some(message => message.includes("设置界面"))).toBe(true)
    })
})

describeBuild("build", () => {
    it("产出 zip + mock 镜像 + 清单（含哈希）", async () => {
        const root = makeRoot("build")
        writePlugin(
            root,
            "notify",
            { id: "notify", version: "1.0.0", kind: "action", entry: "index.ts", title: "通知", desc: "发送系统通知" },
            `import type { ActionDef } from "@dob/host";\nconst def: ActionDef = { id: "notify.system", title: "通知", fields: [], execute: async () => ({ ok: true }) };\nexport default def;\n`
        )
        const result = await runPack({ rootDir: root })
        expect(result.errors).toEqual([])
        const zipPath = path.join(root, ".tmp", "automation-pack", "out", "notify-1.0.0.zip")
        expect(fs.existsSync(zipPath)).toBe(true)
        const mockIndex = JSON.parse(fs.readFileSync(path.join(root, "apps", "web", "mock", "plugins", "plugins.json"), "utf8"))
        expect(mockIndex).toHaveLength(1)
        expect(mockIndex[0]).toMatchObject({ id: "notify", file: "notify-1.0.0.zip", hasSettings: false })
        expect(mockIndex[0].sha256).toMatch(/^[0-9a-f]{64}$/)
        expect(mockIndex[0].size).toBeGreaterThan(0)
        expect(fs.existsSync(path.join(root, "apps", "web", "mock", "plugins", "notify-1.0.0.zip"))).toBe(true)
    }, 60000)

    it("findUnresolvedComponents 揪出未导入的模板组件", () => {
        expect(
            findUnresolvedComponents(`const { resolveComponent: _resolveComponent } = require("vue");
const v = _resolveComponent("Select");`)
        ).toEqual(["Select"])
        expect(findUnresolvedComponents(`const v = _createElementVNode("div");`)).toEqual([])
    })

    it("--check 不写文件", async () => {
        const root = makeRoot("check")
        writePlugin(
            root,
            "notify",
            { id: "notify", version: "1.0.0", kind: "action", entry: "index.ts", title: "通知" },
            goodEntry("notify")
        )
        const result = await runPack({ rootDir: root, check: true })
        expect(result.errors).toEqual([])
        expect(result.plugins.length).toBe(1)
        expect(fs.existsSync(path.join(root, "dist", "plugins"))).toBe(false)
        expect(fs.existsSync(path.join(root, "apps", "web", "mock", "plugins"))).toBe(false)
    })
})
