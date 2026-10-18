import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { rewriteDataPackModule } from "../data-pack/data-pack-rewrite-plugin"

describe("dataPackRewritePlugin", () => {
    it("生成等待模块随机读取完成的壳模块", () => {
        const here = path.dirname(fileURLToPath(import.meta.url))
        const sourcePath = path.resolve(here, "..", "..", "..", "..", "..", "packages", "data", "d", "char.data.ts")

        const rewritten = rewriteDataPackModule(sourcePath)

        expect(rewritten).toContain('await syncDataPackModuleBindings("char.data")')
        expect(rewritten).not.toContain("const t: Char[]")
    })
})
