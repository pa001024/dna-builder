import { defineConfig } from "vitest/config"

export default defineConfig({
    test: {
        // 排除单个文件
        exclude: ["server/**/*.ts", "externals/**/*.ts", "tests/e2e/**", "**/node_modules/**"],
    },
})
