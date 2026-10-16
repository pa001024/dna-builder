import { describe, expect, it } from "vitest"
import {
    filterDataOnlySeeds,
    filterDiagnosticsByRoots,
    isVirtualOnlyDiagnostic,
    parseTscRsOutput,
    planMinimalFiles,
    prepareTscRsConfig,
} from "./incremental-lint.js"

describe("parseTscRsOutput", () => {
    it("解析带位置的 error 并附上缩进 elaboration 行", () => {
        const output = [
            "src/a.ts(1,2): error TS2322: Type 'number' is not assignable to type 'string'.",
            "src/b.vue(11,10): error TS2322: Type 'number' is not assignable to type 'string'.",
            "  This location is in virtual code produced by the content mapper 'x' and has no corresponding location.",
            "src/c.ts(3,4): warning TS9999: something.",
        ].join("\n")
        const diagnostics = parseTscRsOutput(output)
        expect(diagnostics).toHaveLength(3)
        expect(diagnostics[0]).toMatchObject({ file: "src/a.ts", isError: true })
        expect(diagnostics[0]?.lines).toHaveLength(1)
        expect(diagnostics[1]?.file).toBe("src/b.vue")
        expect(diagnostics[1]?.lines).toHaveLength(2)
        expect(diagnostics[2]).toMatchObject({ file: "src/c.ts", isError: false })
    })

    it("无文件前缀的 error 记为全局诊断", () => {
        const diagnostics = parseTscRsOutput("error TS5102: Option 'baseUrl' has been removed.\n")
        expect(diagnostics).toHaveLength(1)
        expect(diagnostics[0]).toMatchObject({ file: null, isError: true })
    })

    it("空输出返回空数组", () => {
        expect(parseTscRsOutput("")).toEqual([])
        expect(parseTscRsOutput("\n")).toEqual([])
    })
})

describe("filterDiagnosticsByRoots", () => {
    const diagnostics = parseTscRsOutput(
        [
            "src/changed.vue(1,1): error TS2322: bad.",
            "src/upstream.ts(2,3): error TS2339: stale.",
            "error TS5102: Option 'baseUrl' has been removed.",
        ].join("\n")
    )

    it("null 表示全量展示", () => {
        expect(filterDiagnosticsByRoots(diagnostics, null)).toHaveLength(3)
    })

    it("只展示根集合与全局诊断", () => {
        const shown = filterDiagnosticsByRoots(diagnostics, ["src/changed.vue"])
        expect(shown.map(d => d.file)).toEqual(["src/changed.vue", null])
    })

    it("根集合为空时只剩全局诊断", () => {
        const shown = filterDiagnosticsByRoots(diagnostics, [])
        expect(shown.map(d => d.file)).toEqual([null])
    })
})

describe("prepareTscRsConfig", () => {
    it("剥离 TS7 移除项、挂载 mapper、相对路径转绝对", () => {
        const tmp = prepareTscRsConfig({
            compilerOptions: {
                baseUrl: ".",
                esModuleInterop: false,
                strict: true,
                paths: { "@/*": ["./src/*"], lodash: ["lodash"] },
            },
            include: ["src/**/*.ts"],
            exclude: ["src/data/d/*.data.ts"],
        })
        const options = tmp.compilerOptions as Record<string, unknown>
        expect(options.baseUrl).toBeUndefined()
        expect(options.esModuleInterop).toBeUndefined()
        expect(options.strict).toBe(true)
        expect(tmp.contentMappers).toEqual([
            { package: "tsc-rs-vue-mapper", extensions: [".vue"] },
            { package: "tsc-rs-data-mapper", extensions: [".data.ts"] },
        ])
        const include = tmp.include as string[]
        expect(include[0]?.endsWith("/src/**/*.ts")).toBe(true)
        expect(include[0]?.startsWith("src")).toBe(false)
        const paths = options.paths as Record<string, string[]>
        expect(paths["@/*"]?.[0]?.endsWith("/src/*")).toBe(true)
        expect(paths.lodash?.[0]?.endsWith("/lodash")).toBe(true)
    })

    it("绝对路径保持不动", () => {
        const tmp = prepareTscRsConfig({ include: ["/abs/**/*.ts", "E:/x/*.vue"] })
        expect(tmp.include).toEqual(["/abs/**/*.ts", "E:/x/*.vue"])
    })
})

describe("filterDataOnlySeeds", () => {
    const changes = {
        added: [],
        modified: ["src/a.ts", "src/data/d/quest.data.ts", "src/data/d/shop.data.ts", "src/data/d/broken.data.ts"],
        deleted: [],
    }

    it("null 计划时原样返回", () => {
        expect(filterDataOnlySeeds(changes, null)).toBe(changes)
    })

    it("纯值变的数据文件被剔除，类型变动与失败的保留", () => {
        const plan = {
            manifest: {},
            served: new Set<string>(),
            decls: {},
            typeChanged: new Set(["src/data/d/shop.data.ts"]),
            genFailed: new Set(["src/data/d/broken.data.ts"]),
            internalErrors: [],
        }
        const filtered = filterDataOnlySeeds(changes, plan)
        expect(filtered.modified).toEqual(["src/a.ts", "src/data/d/shop.data.ts", "src/data/d/broken.data.ts"])
    })
})

describe("planMinimalFiles", () => {
    const graph = {
        "src/data/d/a.data.ts": { imports: ["src/types.ts"], ambient: false, ambientHash: "" },
        "src/types.ts": { imports: [], ambient: false, ambientHash: "" },
        "src/vite-env.d.ts": { imports: [], ambient: true, ambientHash: "h" },
        "src/components.d.ts": { imports: [], ambient: true, ambientHash: "h" },
        "src/views/V.vue": { imports: [], ambient: false, ambientHash: "" },
    }
    const ambientDts = ["src/vite-env.d.ts", "src/components.d.ts"]

    it("空变更返回 null", () => {
        expect(planMinimalFiles([], graph, ambientDts)).toBeNull()
    })

    it("纯值变数据文件返回改动 + 环境声明（components.d.ts 除外）", () => {
        const files = planMinimalFiles([{ rel: "src/data/d/a.data.ts", text: "export const x = 1" }], graph, ambientDts)
        expect(files?.[0]).toBe("src/data/d/a.data.ts")
        expect(files).toContain("src/vite-env.d.ts")
        expect(files).not.toContain("src/components.d.ts")
    })

    it("window 引用退回 null", () => {
        const files = planMinimalFiles([{ rel: "src/data/d/a.data.ts", text: "export const x = window.y" }], graph, ambientDts)
        expect(files).toBeNull()
    })

    it("闭包含 .vue 退回 null", () => {
        const graphWithVue = {
            ...graph,
            "src/data/d/a.data.ts": { imports: ["src/views/V.vue"], ambient: false, ambientHash: "" },
        }
        const files = planMinimalFiles([{ rel: "src/data/d/a.data.ts", text: "export const x = 1" }], graphWithVue, ambientDts)
        expect(files).toBeNull()
    })
})

describe("isVirtualOnlyDiagnostic", () => {
    it("识别无原文位置注记的合成区诊断", () => {
        const diagnostics = parseTscRsOutput(
            [
                "src/a.vue(2385,62): error TS2551: Property 'value' does not exist.",
                "  This location is in virtual code produced by the content mapper 'x' and has no corresponding location in the original file.",
                "src/b.vue(6,7): error TS2322: Type 'number' is not assignable to type 'string'.",
            ].join("\n")
        )
        expect(diagnostics).toHaveLength(2)
        expect(isVirtualOnlyDiagnostic(diagnostics[0]!)).toBe(true)
        expect(isVirtualOnlyDiagnostic(diagnostics[1]!)).toBe(false)
    })
})
