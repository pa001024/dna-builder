import { chmod, rm } from "node:fs/promises"
import { build } from "esbuild"

/**
 * 构建 MCP stdio 服务入口，并生成可执行的单文件产物。
 * @returns {Promise<void>}
 * @throws 当构建失败时抛出异常
 */
async function buildMcp() {
    await rm("./dist/mcp/index.js.map", { force: true })

    await build({
        entryPoints: ["./mcp/index.ts"],
        outfile: "./dist/mcp/index.js",
        bundle: true,
        format: "esm",
        platform: "node",
        target: "node18",
        banner: {
            js: "#!/usr/bin/env node",
        },
        logLevel: "info",
    })

    await chmod("./dist/mcp/index.js", 0o755)
}

await buildMcp()
