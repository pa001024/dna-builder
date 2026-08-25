import { resolve } from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
    test: {
        setupFiles: [resolve(__dirname, "src/test/vitest-setup.ts")],
        // 只运行项目自身的测试（src 与 tools）；node_modules、server、externals、e2e 等自动排除
        include: ["src/**/*.test.ts"],
    },
    resolve: {
        alias: {
            "@": resolve(__dirname, "src"),
            "dna-api": resolve(__dirname, "externals/dna-api/src/index.ts"),
            "node:async_hooks": resolve(__dirname, "src/polyfills/async_hooks.ts"),
            async_hooks: resolve(__dirname, "src/polyfills/async_hooks.ts"),
        },
    },
})
