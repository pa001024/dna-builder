import { defineConfig } from "vitest/config"

export default defineConfig({
    test: {
        // 排除单个文件
        exclude: ["server/**/*.test.ts", "**/node_modules/**"],
    },
})
