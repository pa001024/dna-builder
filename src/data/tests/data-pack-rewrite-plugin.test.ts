import path from "node:path"
import { describe, expect, it } from "vitest"
import { rewriteDataPackModule } from "../data-pack-rewrite-plugin"

describe("dataPackRewritePlugin", () => {
    it("生成等待模块随机读取完成的壳模块", () => {
        const sourcePath = path.resolve("src/data/d/char.data.ts")

        const rewritten = rewriteDataPackModule(sourcePath)

        expect(rewritten).toContain('await syncDataPackModuleBindings("char.data")')
        expect(rewritten).not.toContain("const t: Char[]")
    })
})
