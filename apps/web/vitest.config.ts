import { resolve } from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
    test: {
        setupFiles: [resolve(__dirname, "src/test/vitest-setup.ts")],
        // 只运行 Web 应用自身的测试；tools 的测试由仓库根 vitest.config.ts 负责，
        // node_modules、apps/server、packages、e2e 等自动排除
        include: ["src/**/*.test.ts"],
    },
    resolve: {
        alias: [
            // 数据包（packages/data）源码直引：必须排在 "@" 之前，按顺序取首个命中的前缀
            { find: "@/data", replacement: resolve(__dirname, "../../packages/data") },
            { find: "@", replacement: resolve(__dirname, "src") },
            { find: "dna-api", replacement: resolve(__dirname, "../../packages/dna-api/src/index.ts") },
            { find: "node:async_hooks", replacement: resolve(__dirname, "src/polyfills/async_hooks.ts") },
            { find: "async_hooks", replacement: resolve(__dirname, "src/polyfills/async_hooks.ts") },
        ],
    },
})
