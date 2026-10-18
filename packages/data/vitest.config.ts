import { resolve } from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
    test: {
        include: ["**/*.test.ts"],
        exclude: ["node_modules/**"],
        coverage: {
            provider: "v8",
            reporter: ["text", "json", "html"],
            reportsDirectory: "./coverage",
            include: ["**/*.ts"],
            exclude: ["**/*.test.ts", "**/*.spec.ts", "**/tests/**", "**/node_modules/**", "**/dist/**", "**/coverage/**"],
            thresholds: {
                lines: 80,
                functions: 80,
                branches: 70,
                statements: 80,
            },
        },
    },
    resolve: {
        // @/data 指向本包源码；部分测试引用 Web 应用的工具模块（@/utils/*），
        // 必须排在通用 @ 之前，与仓库根 lint 驱动的口径一致
        alias: [
            { find: "@/data", replacement: resolve(__dirname, ".") },
            { find: "@", replacement: resolve(__dirname, "../../apps/web/src") },
        ],
    },
})
