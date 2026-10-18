import { resolve } from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
    test: {
        // tools 的单测由仓库根负责；Web 应用与数据包的测试各自由其 vitest.config.ts 负责
        include: ["tools/**/*.test.ts"],
    },
    resolve: {
        alias: [
            { find: "@/data", replacement: resolve(__dirname, "packages/data") },
            { find: "dna-builder-data", replacement: resolve(__dirname, "packages/data") },
            { find: "@", replacement: resolve(__dirname, "apps/web/src") },
        ],
    },
})
