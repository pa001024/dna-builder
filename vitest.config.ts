import { resolve } from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
    test: {
        setupFiles: [resolve(__dirname, "src/test/vitest-setup.ts")],
        // 排除单个文件
        exclude: ["server/**/*.ts", "externals/**/*.ts", "tests/e2e/**", "**/node_modules/**"],
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
